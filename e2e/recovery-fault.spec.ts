import { expect, test } from "@playwright/test";

/** Test fault paths using the actual browser IDB API, not mocked localStorage. */
test("an aborted recovery read reports a precise error instead of hanging", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const original = IDBDatabase.prototype.transaction;
    let injected = false;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      const tx = original.apply(this, args);
      if (!injected && this.name === "3dmc-recovery-v1" &&
          args[0] === "checkpoints" && args[1] === "readonly") {
        injected = true;
        queueMicrotask(() => {
          try { tx.abort(); } catch { /* already completed */ }
        });
      }
      return tx;
    };
    try {
      const result = await Promise.race([
        recovery.readRecovery().then(() => "resolved", (e: unknown) =>
          e instanceof Error ? e.message : "rejected"),
        new Promise<string>(resolve => setTimeout(() => resolve("hung"), 2500))
      ]);
      return { injected, result };
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });
  expect(result.injected).toBe(true);
  expect(result.result).toMatch(/abort/i);
  expect(result.result).not.toBe("hung");
});

test("an aborted checkpoint write preserves the last acknowledged document", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const { createSampleDocument } = await import("/src/editor/domain.ts");
    const claim = await recovery.claimRecoveryWriter("abort-fault-injection", true);
    if (!claim.granted) throw new Error("Writer could not be claimed for fault injection.");
    const sample = createSampleDocument();
    await recovery.saveRecovery({ ...sample, name: "Last good checkpoint" }, 61, claim.lease);
    const originalPut = IDBObjectStore.prototype.put;
    let injected = false;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof originalPut>) {
      const request = originalPut.apply(this, args);
      const value = args[0] as {key?: string} | null;
      if (!injected && this.name === "checkpoints" && value?.key === "latest") {
        injected = true;
        // The transaction has staged the previous checkpoint, but abort must
        // roll back BOTH writes. This is a real IndexedDB transaction abort.
        this.transaction.abort();
      }
      return request;
    };
    let rejected = false;
    try {
      await recovery.saveRecovery({ ...sample, name: "Should not publish" }, 62, claim.lease);
    } catch (error) {
      rejected = error instanceof Error;
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
    const recovered = await recovery.readRecovery();
    return { injected, rejected, revision: recovered?.revision,
      name: recovered?.document.name, fallback: recovered?.fallback };
  });
  expect(result).toEqual({
    injected: true, rejected: true, revision: 61,
    name: "Last good checkpoint", fallback: false
  });
});

test("losing pointer capture cancels a pending pencil gesture without a history entry",
  async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Paint" }).click();
    const canvas = page.locator(".texture-pixel-wrap canvas");
    const pixels = () => canvas.evaluate((node) => {
      const sheet = node as HTMLCanvasElement;
      return Array.from(sheet.getContext("2d")!.getImageData(0, 0,
        sheet.width, sheet.height).data);
    });
    const initial = await pixels();
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error("Texture canvas was not available");
    await page.mouse.move(bounds.x + 12, bounds.y + 12);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 120, bounds.y + 64, { steps: 6 });
    await expect.poll(pixels).not.toEqual(initial);
    // Emulate the browser revoking capture after a pointer leaves the editing
    // surface. The app's lost-capture handler must cancel, never commit.
    await canvas.dispatchEvent("lostpointercapture", { bubbles: true, pointerId: 1 });
    await expect.poll(pixels).toEqual(initial);
    await page.mouse.up();
    await expect(pixels()).toEqual(initial);
    await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
  });

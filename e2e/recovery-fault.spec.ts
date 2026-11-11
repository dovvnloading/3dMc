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
    expect(await pixels()).toEqual(initial);
    await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
  });

test("oversized snapshots reject as a promise, retain the last valid save and remain portable", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const { createSampleDocument } = await import("/src/editor/domain.ts");
    const { encodeProject, MAX_PROJECT_BYTES } = await import("/src/editor/project.ts");
    const { encodeNativeProject, decodeNativeProject } = await import("/src/editor/nativeArchive.ts");
    const claim = await recovery.claimRecoveryWriter("oversized-snapshot-test", true);
    if (!claim.granted) throw new Error("Could not claim recovery writer.");
    const source = createSampleDocument();
    await recovery.saveRecovery({ ...source, name: "Last acknowledged project" }, 71, claim.lease);

    // This is valid under the bounded part/sheet native schema but exceeds
    // the smaller JSON checkpoint budget. The portable ZIP must still work.
    const large = {
      ...source,
      name: "Large valid source",
      cuboids: Array.from({ length: 1300 }, (_, index) => ({
        ...source.cuboids[0]!, id: "node-" + index, name: "Part " + index
      })),
      textures: Array.from({ length: 16 }, (_, index) => ({
        id: index === 0 ? "main" : "sheet-" + index,
        name: "Sheet " + index, width: 64, height: 64,
        pixels: new Array<number>(64 * 64 * 4).fill(255)
      }))
    };
    const bytes = new TextEncoder().encode(encodeProject(large)).byteLength;
    const native = await encodeNativeProject(large);
    const reopened = await decodeNativeProject(native);

    let synchronousThrow = false;
    let pending: Promise<void> | null = null;
    try { pending = recovery.saveRecovery(large, 72, claim.lease); }
    catch { synchronousThrow = true; }
    let failure: unknown = null;
    if (pending) try { await pending; } catch (error) { failure = error; }
    const recovered = await recovery.readRecovery();
    return {
      bytes, limit: MAX_PROJECT_BYTES, synchronousThrow,
      rejectedWithSize: failure instanceof recovery.RecoverySnapshotTooLarge,
      helpfulMessage: failure instanceof Error && /download a .3dmc source backup/i.test(failure.message),
      recoveredName: recovered?.document.name, revision: recovered?.revision,
      fallback: recovered?.fallback, nativeBytes: native.byteLength,
      portableName: reopened.name, portableParts: reopened.cuboids.length
    };
  });
  expect(result.bytes).toBeGreaterThan(result.limit);
  expect(result.synchronousThrow).toBe(false);
  expect(result.rejectedWithSize).toBe(true);
  expect(result.helpfulMessage).toBe(true);
  expect(result).toMatchObject({
    recoveredName: "Last acknowledged project", revision: 71, fallback: false,
    portableName: "Large valid source", portableParts: 1300
  });
  expect(result.nativeBytes).toBeLessThanOrEqual(3_000_000);
});

test("invalid newest checkpoint metadata falls back to the previous verified revision", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const { createSampleDocument } = await import("/src/editor/domain.ts");
    const claim = await recovery.claimRecoveryWriter("corrupt-metadata-test", true);
    if (!claim.granted) throw new Error("Could not claim recovery writer.");
    const source = createSampleDocument();
    await recovery.saveRecovery({ ...source, name: "Previous verified source" }, 81, claim.lease);
    await recovery.saveRecovery({ ...source, name: "Newest source" }, 82, claim.lease);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("3dmc-recovery-v1", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("checkpoints", "readwrite");
        const store = tx.objectStore("checkpoints");
        const request = store.get("latest");
        request.onsuccess = () => store.put({
          ...request.result as object, revision: -1, savedAt: "invalid-date"
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const recovered = await recovery.readRecovery();
    return { name: recovered?.document.name, revision: recovered?.revision,
      fallback: recovered?.fallback };
  });
  expect(result).toEqual({
    name: "Previous verified source", revision: 81, fallback: true
  });
});

test("pack-wide recovery preserves every editable model and fences displaced writers", async ({ page }) => {
  await page.goto("/");
  const report = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const { createSampleDocument } = await import("/src/editor/domain.ts");
    const { indexLegacyProject } = await import("/src/pack/packDocument.ts");
    const source = createSampleDocument();
    const second = { ...createSampleDocument(), id: "recovery-model-2", name: "Recovered second" };
    second.textures[0]!.pixels[3] = 57;
    const pack = indexLegacyProject(source);
    pack.models.push({ id: "model-2", sourceDocumentId: second.id,
      resource: { namespace: "3dmc", path: "block/model_2" },
      replaces: { namespace: "minecraft", path: "iron_block" },
      provenance: "editor", textures: [{ sourceTextureId: "main", textureAssetId: "tex-2" }] });
    pack.textures.push({ id: "tex-2", sourceDocumentId: second.id, sourceTextureId: "main",
      resource: { namespace: "3dmc", path: "block/tex_2" } });
    pack.activeModelId = "model-2";
    const old = await recovery.claimRecoveryWriter("pack-writer-1", true);
    if (!old.granted) throw new Error("No recovery writer available");
    await recovery.savePackRecovery(pack, [source, second], 41, old.lease);
    const restored = await recovery.readAnyRecovery();
    const displaced = await recovery.claimRecoveryWriter("pack-writer-2", true);
    if (!displaced.granted) throw new Error("Could not rotate recovery ownership");
    let staleRejected = false;
    try { await recovery.savePackRecovery(pack, [source, second], 42, old.lease); }
    catch (error) { staleRejected = error instanceof recovery.RecoveryOwnershipLost; }
    const after = await recovery.readAnyRecovery();
    return { restored: restored?.kind, fallback: restored?.fallback,
      modelCount: restored?.kind === "pack" ? restored.sources.length : -1,
      modelName: restored?.kind === "pack" ? restored.sources[1]?.name : "",
      pixel: restored?.kind === "pack" ? restored.sources[1]?.textures[0]?.pixels[3] : null,
      active: restored?.kind === "pack" ? restored.pack.activeModelId : "",
      staleRejected, revision: after?.revision };
  });
  expect(report).toEqual({ restored: "pack", fallback: false, modelCount: 2,
    modelName: "Recovered second", pixel: 57, active: "model-2", staleRejected: true, revision: 41 });
});

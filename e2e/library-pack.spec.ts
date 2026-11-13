import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

test("a verified library snapshot preserves and reopens both models in a pack", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await studio.getByRole("button", { name: "Close", exact: true }).click();

  const selector = page.getByRole("combobox", { name: "Active pack model" });
  const second = await selector.inputValue();
  await selector.selectOption("model-0");
  const position = page.getByRole("textbox", { name: "X position", exact: true });
  await position.fill("5"); await position.press("Enter");
  await selector.selectOption(second);
  await position.fill("7"); await position.press("Enter");

  await page.getByRole("button", { name: "Library" }).click();
  let dialog = page.getByRole("dialog", { name: "Local project library" });
  await expect(dialog.getByText(/Pack mode: a snapshot includes all 2 editable models/)).toBeVisible();
  await dialog.getByRole("textbox", { name: "New snapshot label" }).fill("Two-model backup");
  await dialog.getByRole("button", { name: "Save new local snapshot" }).click();
  await expect(dialog.getByText(/Snapshot saved on this device/)).toBeVisible();
  await expect(dialog.getByText(/Complete pack · 2 editable models/)).toBeVisible();

  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download", exact: true }).click();
  const artifact = await pending;
  expect(artifact.suggestedFilename()).toBe("Two-model-backup.3dmc");
  const filename = await artifact.path();
  if (!filename) throw new Error("Pack library download was missing");
  const files = unzipSync(new Uint8Array(await readFile(filename)));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as { containerVersion: number; sources: unknown[] };
  expect(manifest.containerVersion).toBe(3);
  expect(manifest.sources).toHaveLength(2);

  await dialog.getByRole("button", { name: "Close library" }).click();
  await selector.selectOption("model-0");
  await position.fill("12"); await position.press("Enter");
  await selector.selectOption(second);
  await position.fill("13"); await position.press("Enter");

  await page.getByRole("button", { name: "Library" }).click();
  dialog = page.getByRole("dialog", { name: "Local project library" });
  await dialog.getByRole("button", { name: "Open copy" }).click();
  const confirmation = dialog.getByLabel("Confirm backup action");
  await expect(confirmation).toContainText("Replace the workspace with a verified copy");
  await confirmation.getByRole("button", { name: "Open verified copy" }).click();
  await expect(dialog).toHaveCount(0);
  await selector.selectOption("model-0");
  await expect(position).toHaveValue("5");
  await selector.selectOption(second);
  await expect(position).toHaveValue("7");
  expect(errors).toEqual([]);
});

test("old standalone snapshot metadata remains readable and reopenable", async ({ page }) => {
  await page.goto("/");
  const project = page.getByRole("textbox", { name: "Project name" });
  await project.fill("Legacy library copy"); await project.press("Enter");
  await page.getByRole("button", { name: "Library" }).click();
  let dialog = page.getByRole("dialog", { name: "Local project library" });
  await dialog.getByRole("button", { name: "Save new local snapshot" }).click();
  await expect(dialog.getByText(/Snapshot saved on this device/)).toBeVisible();
  await dialog.getByRole("button", { name: "Close library" }).click();

  // Simulate a snapshot saved before the optional kind metadata existed.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("3dmc-project-library-v1", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("snapshots", "readwrite");
      const store = tx.objectStore("snapshots");
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        if (!cursor.result) return;
        const record = { ...cursor.result.value } as Record<string, unknown>;
        delete record.kind;
        cursor.result.update(record);
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));

  await project.fill("Later edits"); await project.press("Enter");
  await page.getByRole("button", { name: "Library" }).click();
  dialog = page.getByRole("dialog", { name: "Local project library" });
  await expect(dialog.getByText(/Standalone project/)).toBeVisible();
  await dialog.getByRole("button", { name: "Open copy" }).click();
  await dialog.getByRole("button", { name: "Open verified copy" }).click();
  await expect(project).toHaveValue("Legacy library copy");
});

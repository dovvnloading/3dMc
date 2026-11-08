import { expect, test } from "@playwright/test";

test("model dimensions, undo/redo, paint, and portable project reopening", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
  await expect(page.locator(".viewport-canvas canvas")).toBeVisible();

  const width = page.getByRole("textbox", { name: "X size" });
  await expect(width).toHaveValue("10");
  await width.fill("12");
  await width.press("Enter");
  await expect(width).toHaveValue("12");

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(width).toHaveValue("10");
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect(width).toHaveValue("12");

  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  const texel = () => canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("2d");
    if (!context) throw new Error("No texture canvas context");
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  const before = await texel();
  await canvas.click({ position: { x: 4, y: 4 } });
  await expect.poll(texel).not.toEqual(before);

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect.poll(texel).toEqual(before);

  await page.getByRole("tab", { name: "Model" }).click();
  await page.screenshot({ path: "test-results/editor-workspace.png" });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.3dmc$/);
  const path = await download.path();
  if (!path) throw new Error("Download was not saved in the browser test");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await expect(page.getByRole("dialog", { name: "Open this project?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");

  expect(errors).toEqual([]);
});

test("invalid numeric input does not corrupt the document", async ({ page }) => {
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("-99");
  await width.press("Enter");
  await expect(width).toHaveValue("10");
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
});

test("opening a project commits a fresh local checkpoint before the next reload", async ({ page }) => {
  await page.goto("/");
  const projectName = page.getByRole("textbox", { name: "Project name" });
  await projectName.fill("Recovery import proof");
  await projectName.press("Enter");
  await expect(projectName).toHaveValue("Recovery import proof");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Project download missing");

  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await page.getByRole("dialog").getByRole("button", { name: "Open project" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  // A reload creates a new runtime identity, so the previous lease cannot
  // silently be reused. Recover only after an explicit takeover.
  await expect(page.getByRole("dialog", { name: "Another tab controls local recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Take over editing" }).click();
  await expect(page.getByText("Continue a local session?")).toBeVisible();
  await expect(page.getByText(/Recovery import proof/).first()).toBeVisible();
});

test("experimental Java pack download and actionable geometry blockers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const modal = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/0 blockers/)).toBeVisible();
  await expect(modal.getByText(/not been checked in Minecraft/)).toBeVisible();
  await page.screenshot({ path: "test-results/java-export-preflight.png" });
  const downloaded = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Download experimental ZIP" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("3dmc-diamond-block-java-1.21.4-experimental.zip");
  await modal.getByRole("button", { name: "Close" }).click();

  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("30");
  await x.press("Enter");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  await expect(modal.getByText(/outside Java model element bounds/)).toBeVisible();
  await expect(modal.getByRole("button", { name: "Download experimental ZIP" })).toBeDisabled();
  await modal.getByRole("button", { name: "Locate" }).click();
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("round-trips an experimental pack through import, edit and export", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click();
  const exported = await download;
  const path = await exported.path();
  if (!path) throw new Error("Browser did not retain the experimental pack.");
  await exportDialog.getByRole("button", { name: "Close" }).click();

  await page.locator('input[accept=".zip,application/zip"]').setInputFiles(path);
  const importDialog = page.getByRole("dialog", { name: "Import editable block pack?" });
  await expect(importDialog).toBeVisible();
  await expect(importDialog.locator(".import-notices").getByText(/geometry and opaque texture pixels/)).toBeVisible();
  await expect(importDialog.getByText(/do not retain native part names/)).toBeVisible();
  await page.screenshot({ path: "test-results/java-pack-import.png" });
  await importDialog.getByRole("button", { name: "Import as editable project" }).click();
  await expect(page.getByRole("textbox", { name: "Project name" }))
    .toHaveValue("Imported diamond block");
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");
  await expect(page.getByRole("heading", { name: "Imported cuboid 01" })).toBeVisible();

  // An imported pack remains truly editable and can be re-exported.
  const importedWidth = page.getByRole("textbox", { name: "X size" });
  await importedWidth.fill("13");
  await importedWidth.press("Enter");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const secondDownload = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click();
  expect((await secondDownload).suggestedFilename()).toContain("experimental");
  expect(errors).toEqual([]);
});

test("unsupported or damaged ZIP never replaces the active project", async ({ page }) => {
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");
  await page.locator('input[accept=".zip,application/zip"]').setInputFiles({
    name: "foreign-pack.zip", mimeType: "application/zip",
    buffer: Buffer.from("not a ZIP archive")
  });
  const blocked = page.getByRole("dialog", { name: "Pack cannot be safely imported" });
  await expect(blocked).toBeVisible();
  await expect(blocked.getByText(/No changes were made/)).toBeVisible();
  await blocked.getByRole("button", { name: "Keep working" }).click();
  await expect(width).toHaveValue("12");
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
});

test("per-face UV edits are reversible, visually linked, and survive native and pack round-trips", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const mapping = page.getByRole("region", { name: "Face UV mapping" });
  await expect(mapping).toBeVisible();
  await mapping.getByRole("button", { name: "North" }).click();

  const u1 = mapping.getByRole("textbox", { name: "Face UV U1" });
  await expect(u1).toHaveValue("0");
  await u1.fill("2");
  await u1.press("Enter");
  await expect(u1).toHaveValue("2");
  const v1 = mapping.getByRole("textbox", { name: "Face UV V1" });
  await v1.fill("4");
  await v1.press("Enter");
  await mapping.getByRole("combobox", { name: "Face texture rotation" }).selectOption("90");
  await expect(mapping.getByRole("combobox", { name: "Face texture rotation" })).toHaveValue("90");
  await expect(page.locator(".uv-selection-rect")).toHaveCount(1);
  await page.screenshot({ path: "test-results/face-uv-editor.png" });
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(mapping.getByRole("combobox", { name: "Face texture rotation" })).toHaveValue("0");
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect(mapping.getByRole("combobox", { name: "Face texture rotation" })).toHaveValue("90");

  // The serialized native source must retain the exact face mapping.
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const projectFile = await saved;
  const projectPath = await projectFile.path();
  if (!projectPath) throw new Error("Browser did not save native test project.");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(projectPath);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  const mappingAfter = page.getByRole("region", { name: "Face UV mapping" });
  await expect(mappingAfter.getByRole("textbox", { name: "Face UV U1" })).toHaveValue("2");
  await expect(mappingAfter.getByRole("textbox", { name: "Face UV V1" })).toHaveValue("4");
  await expect(mappingAfter.getByRole("combobox", { name: "Face texture rotation" })).toHaveValue("90");

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(exportDialog.getByText(/0 blockers/)).toBeVisible();
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click();
  const packFile = await download;
  const packPath = await packFile.path();
  if (!packPath) throw new Error("Pack download missing.");
  await exportDialog.getByRole("button", { name: "Close" }).click();
  await page.locator('input[accept=".zip,application/zip"]').setInputFiles(packPath);
  const importDialog = page.getByRole("dialog", { name: "Import editable block pack?" });
  await expect(importDialog).toBeVisible();
  await importDialog.getByRole("button", { name: "Import as editable project" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  const importedUV = page.getByRole("region", { name: "Face UV mapping" });
  await expect(importedUV.getByRole("textbox", { name: "Face UV U1" })).toHaveValue("2");
  await expect(importedUV.getByRole("textbox", { name: "Face UV V1" })).toHaveValue("4");
  await expect(importedUV.getByRole("combobox", { name: "Face texture rotation" })).toHaveValue("90");
  expect(errors).toEqual([]);
});

test("invalid face UV edits do not create corrupted documents", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const mapping = page.getByRole("region", { name: "Face UV mapping" });
  const u1 = mapping.getByRole("textbox", { name: "Face UV U1" });
  await u1.fill("16");
  await u1.press("Enter");
  await expect(u1).toHaveValue("0");
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
  await mapping.getByRole("button", { name: "South" }).click();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
  await mapping.getByRole("button", { name: "North" }).click();
  await expect(u1).toHaveValue("0");
});


test("canceling a drag restores every texture byte without adding history", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const sample = () => canvas.evaluate((node) => {
    const element = node as HTMLCanvasElement;
    const ctx = element.getContext("2d");
    if (!ctx) throw new Error("Missing pixel canvas");
    return Array.from(ctx.getImageData(0, 0, element.width, element.height).data);
  });
  const original = await sample();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Texture canvas not visible");
  await page.mouse.move(rect.x + 6, rect.y + 6);
  await page.mouse.down();
  await page.mouse.move(rect.x + 130, rect.y + 90, { steps: 8 });
  await expect.poll(sample).not.toEqual(original);
  await page.keyboard.press("Escape");
  await expect.poll(sample).toEqual(original);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();

  await page.mouse.move(rect.x + 12, rect.y + 12);
  await page.mouse.down();
  await page.mouse.move(rect.x + 40, rect.y + 55, { steps: 4 });
  await canvas.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1 });
  await expect.poll(sample).toEqual(original);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
});

test("two browser tabs cannot silently overwrite one another's recovery", async ({ page, context }) => {
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");
  await expect(page.getByText("Saved on this device")).toBeVisible();

  const second = await context.newPage();
  await second.goto("/");
  const blocked = second.getByRole("dialog", { name: "Another tab controls local recovery" });
  await expect(blocked).toBeVisible();
  await blocked.getByRole("button", { name: "Take over editing" }).click();
  await expect(second.getByText("Continue a local session?")).toBeVisible();
  await second.getByRole("button", { name: "Recover project" }).click();
  const secondWidth = second.getByRole("textbox", { name: "X size" });
  await expect(secondWidth).toHaveValue("12");
  await secondWidth.fill("13");
  await secondWidth.press("Enter");
  await expect(second.getByText("Saved on this device")).toBeVisible();

  // The earlier tab's old writer generation is now rejected, including if it
  // resumes after suspension and tries to commit a delayed checkpoint.
  await page.bringToFront();
  await expect(page.getByRole("dialog", { name: "Another tab controls local recovery" })).toBeVisible();

  const third = await context.newPage();
  await third.goto("/");
  await third.getByRole("dialog", { name: "Another tab controls local recovery" })
    .getByRole("button", { name: "Take over editing" }).click();
  await expect(third.getByText("Continue a local session?")).toBeVisible();
  await third.getByRole("button", { name: "Recover project" }).click();
  await expect(third.getByRole("textbox", { name: "X size" })).toHaveValue("13");
});

test("stale checkpoint generations fail atomically and the last good backup survives corruption", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const recovery = await import("/src/editor/recovery.ts");
    const { createSampleDocument } = await import("/src/editor/domain.ts");
    const old = await recovery.claimRecoveryWriter("stale-ci-owner", true);
    const newest = await recovery.claimRecoveryWriter("fresh-ci-owner", true);
    if (!old.granted || !newest.granted) throw new Error("Could not establish test writer generations");
    const source = createSampleDocument();
    let staleRejected = false;
    try {
      await recovery.saveRecovery({ ...source, name: "Must not publish" }, 99, old.lease);
    } catch (error) { staleRejected = error instanceof recovery.RecoveryOwnershipLost; }
    await recovery.saveRecovery({ ...source, name: "Previous checkpoint" }, 1, newest.lease);
    await recovery.saveRecovery({ ...source, name: "Latest checkpoint" }, 2, newest.lease);

    // Damage the newest checkpoint but leave its previous independently hashed.
    await new Promise<void>((resolve, reject) => {
      const dbRequest = indexedDB.open("3dmc-recovery-v1", 2);
      dbRequest.onerror = () => reject(dbRequest.error);
      dbRequest.onsuccess = () => {
        const db = dbRequest.result;
        const tx = db.transaction("checkpoints", "readwrite");
        const query = tx.objectStore("checkpoints").get("latest");
        query.onsuccess = () => {
          const value = query.result as { contents: string; digest: string };
          tx.objectStore("checkpoints").put({ ...value, contents: "{broken" });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
    const fallback = await recovery.readRecovery();
    return { staleRejected, name: fallback?.document.name, fallback: fallback?.fallback };
  });
  expect(result).toEqual({
    staleRejected: true,
    name: "Previous checkpoint",
    fallback: true
  });
});


test("a storage write failure is reported and native backup download stays available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "X size" })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args: Parameters<typeof original>) {
      if (this.name === "checkpoints") {
        throw new DOMException("Simulated quota exhausted", "QuotaExceededError");
      }
      return original.apply(this, args);
    };
  });
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");
  await expect(page.getByText("Local save unavailable")).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/\.3dmc$/);
  expect(await file.path()).toBeTruthy();
  await expect(width).toHaveValue("12");
});


test("six-face diagnostic ZIP opens as a one-cuboid 64×64 editable fixture", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const modal = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(modal.getByRole("region", { name: "Six-face compatibility fixture" })).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Download six-face diagnostic ZIP" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("3dmc-java-1.21.4-six-face-orientation-test.zip");
  const saved = await file.path();
  if (!saved) throw new Error("Fixture download was not saved.");
  await file.saveAs("test-results/six-face-orientation-test.zip");
  await modal.getByRole("button", { name: "Close" }).click();

  await page.locator('input[accept=".zip,application/zip"]').setInputFiles(saved);
  const imported = page.getByRole("dialog", { name: "Import editable block pack?" });
  await expect(imported).toBeVisible();
  await expect(imported.locator(".import-summary").getByText("64 × 64")).toBeVisible();
  await expect(imported.locator(".import-summary").getByText("1", { exact: true })).toBeVisible();
  await imported.getByRole("button", { name: "Import as editable project" }).click();
  await expect(page.getByRole("heading", { name: "Imported cuboid 01" })).toBeVisible();
  await expect(page.getByText("Cuboid · Textured surface")).toBeVisible();

  await page.getByRole("tab", { name: "Paint" }).click();
  const mapping = page.getByRole("region", { name: "Face UV mapping" });
  await mapping.getByRole("button", { name: "North" }).click();
  await expect(mapping.getByRole("textbox", { name: "Face UV U1" })).toHaveValue("0");
  await expect(mapping.getByRole("textbox", { name: "Face UV U2" })).toHaveValue("4");
  await mapping.getByRole("button", { name: "East" }).click();
  await expect(mapping.getByRole("textbox", { name: "Face UV U1" })).toHaveValue("4");
  await expect(mapping.getByRole("textbox", { name: "Face UV U2" })).toHaveValue("8");
  await mapping.getByRole("button", { name: "Down" }).click();
  await expect(mapping.getByRole("textbox", { name: "Face UV V1" })).toHaveValue("4");
  await expect(mapping.getByRole("textbox", { name: "Face UV V2" })).toHaveValue("8");
  await page.screenshot({ path: "test-results/six-face-editor-preview.png" });
});


test("new project gallery creates an empty scene, then a textured block with a custom resolution", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: "test-results/new-project-gallery.png" });
  await dialog.getByRole("button", { name: /Empty canvas/ }).click();
  await dialog.getByRole("textbox", { name: "New project name" }).fill("A clean slate");
  await dialog.getByRole("button", { name: "16 pixel texture" }).click();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("A clean slate");
  await expect(page.getByText("Your canvas is ready")).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();

  await page.getByRole("button", { name: "Add first cuboid" }).click();
  await expect(page.getByRole("heading", { name: "New element" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeEnabled();
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(page.getByText("Your canvas is ready")).toBeVisible();

  await page.getByRole("button", { name: "New project" }).click();
  await dialog.getByRole("button", { name: /Textured block/ }).click();
  await dialog.getByRole("textbox", { name: "New project name" }).fill("Studio Block");
  await dialog.getByRole("button", { name: "64 pixel texture" }).click();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Main block" })).toBeVisible();
  await page.getByRole("tab", { name: "Paint" }).click();
  const texture = page.locator(".texture-pixel-wrap canvas");
  await expect(texture).toHaveAttribute("width", "64");
  await expect(texture).toHaveAttribute("height", "64");
  expect(errors).toEqual([]);
});

test("native project archive preserves editable geometry and exact pixels after reopen", async ({ page }) => {
  await page.goto("/");
  const xSize = page.getByRole("textbox", { name: "X size" });
  await xSize.fill("12");
  await xSize.press("Enter");
  await expect(xSize).toHaveValue("12");
  await page.getByRole("tab", { name: "Paint" }).click();
  const mapping = page.getByRole("region", { name: "Face UV mapping" });
  await mapping.getByRole("textbox", { name: "Face UV U1" }).fill("4");
  await mapping.getByRole("textbox", { name: "Face UV U1" }).press("Enter");
  await page.getByRole("tab", { name: "Model" }).click();

  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const archive = await saved;
  expect(archive.suggestedFilename()).toBe("copper-lantern.3dmc");
  const path = await archive.path();
  if (!path) throw new Error("Native project archive not available.");

  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await dialog.getByRole("button", { name: /Empty canvas/ }).click();
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Your canvas is ready")).toBeVisible();

  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.getByRole("region", { name: "Face UV mapping" })
    .getByRole("textbox", { name: "Face UV U1" })).toHaveValue("4");
});

test("legacy JSON backups remain importable beside native .3dmc source archives", async ({ page }) => {
  await page.goto("/");
  const legacy = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download legacy JSON backup" }).click();
  const file = await legacy;
  expect(file.suggestedFilename()).toBe("copper-lantern.3dmc.json");
  const path = await file.path();
  if (!path) throw new Error("Legacy JSON download missing.");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" }).getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();

  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles({
    name: "not-a-project.3dmc", mimeType: "application/zip",
    buffer: Buffer.from("invalid native ZIP")
  });
  await expect(page.getByRole("dialog", { name: "Open this project?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
});


test("primitive library and material editor create a paintable Java block component", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Add primitive" }).click();
  const menu = page.getByRole("menu", { name: "Choose a primitive" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /Half slab/ }).click();

  await expect(page.getByRole("heading", { name: "Half slab" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("16");
  await expect(page.getByRole("textbox", { name: "Y size" })).toHaveValue("8");
  await expect(page.getByRole("textbox", { name: "Z size" })).toHaveValue("16");

  const material = page.getByRole("group", { name: "Element material" });
  await material.getByRole("button", { name: "Painted" }).click();
  await expect(material.getByRole("button", { name: "Painted" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportModal = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(exportModal.getByText(/0 blockers/)).toBeVisible();
  await exportModal.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Move selected element up" }).click();
  const sceneRows = page.locator(".scene-row-name");
  await expect(sceneRows.nth(6)).toHaveText("Half slab");
  await expect(sceneRows.nth(7)).toHaveText("Handle · right");

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(sceneRows.nth(7)).toHaveText("Half slab");
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect(sceneRows.nth(6)).toHaveText("Half slab");
  await page.screenshot({ path: "test-results/primitive-and-material-editor.png" });
  expect(errors).toEqual([]);
});

test("desktop shortcuts create a new project, duplicate elements and download native source", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "View iso" }).focus();
  await page.keyboard.press("Control+d");
  await expect(page.getByRole("heading", { name: "Lantern body copy" })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  expect((await download).suggestedFilename()).toBe("copper-lantern.3dmc");

  await page.keyboard.press("Control+n");
  await expect(page.getByRole("dialog", { name: "Create a new project" })).toBeVisible();
  await page.getByRole("dialog", { name: "Create a new project" })
    .getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create a new project" })).toHaveCount(0);
});


test("imports an RGBA PNG with explicit dimensions, undo, and native source persistence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const pixels = await page.evaluate(async () => {
    const { encodeRgbaPng } = await import("/src/export/png.ts");
    const rgba = new Array(16 * 16 * 4).fill(0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      rgba[i] = 255; rgba[i + 1] = x * 12; rgba[i + 2] = y * 12;
      rgba[i + 3] = x === 0 ? 100 : 255;
    }
    return Array.from(encodeRgbaPng(16, 16, rgba));
  });
  await page.locator('input[accept=".png,image/png"]').setInputFiles({
    name: "Imported Accent.png", mimeType: "image/png", buffer: Buffer.from(pixels)
  });
  const dialog = page.getByRole("dialog", { name: "Replace the shared texture?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("16 × 16 pixels")).toBeVisible();
  await expect(dialog.getByText(/transparent or translucent pixels/)).toBeVisible();
  await expect(dialog.getByText(/experimental Java 1.21.4 exporter/)).toBeVisible();
  await dialog.getByRole("radio", { name: /Use the PNG dimensions/ }).check();
  await expect(dialog.getByText("RESULTING CANVAS").locator("..")).toContainText("16 × 16");
  await page.screenshot({ path: "test-results/png-import-preflight.png" });
  await dialog.getByRole("button", { name: "Replace shared texture" }).click();

  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toHaveAttribute("width", "16");
  await expect(canvas).toHaveAttribute("height", "16");
  const alpha = await canvas.evaluate((node) => {
    const context = (node as HTMLCanvasElement).getContext("2d")!;
    return context.getImageData(0, 0, 1, 1).data[3];
  });
  expect(alpha).toBe(100);
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(canvas).toHaveAttribute("width", "32");
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect(canvas).toHaveAttribute("width", "16");

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportModal = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(exportModal.getByText(/1 blockers?/)).toBeVisible();
  await exportModal.getByRole("button", { name: "Close" }).click();

  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const nativeFile = await exported;
  const path = await nativeFile.path();
  if (!path) throw new Error("Missing downloaded native source.");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  const opening = page.getByRole("dialog", { name: "Open this project?" });
  await expect(opening).toBeVisible();
  await opening.getByRole("button", { name: "Open project" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.locator(".texture-pixel-wrap canvas")).toHaveAttribute("width", "16");
  expect(errors).toEqual([]);
});

test("non-square PNG scales by nearest neighbor and unsupported image bytes never replace the sheet", async ({ page }) => {
  await page.goto("/");
  const rgba = [
    255, 0, 0, 255, 0, 255, 0, 255,
    0, 0, 255, 255, 255, 255, 0, 255
  ];
  const png = await page.evaluate(async (pixels) => {
    const { encodeRgbaPng } = await import("/src/export/png.ts");
    return Array.from(encodeRgbaPng(2, 2, pixels));
  }, rgba);
  await page.locator('input[accept=".png,image/png"]').setInputFiles({
    name: "tiny.png", mimeType: "image/png", buffer: Buffer.from(png)
  });
  const dialog = page.getByRole("dialog", { name: "Replace the shared texture?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Use the PNG dimensions/ })).toBeDisabled();
  await dialog.getByRole("button", { name: "Replace shared texture" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const corners = await canvas.evaluate((node) => {
    const context = (node as HTMLCanvasElement).getContext("2d")!;
    return [[0, 0], [31, 0], [0, 31], [31, 31]].map(([x, y]) =>
      Array.from(context.getImageData(x!, y!, 1, 1).data)
    );
  });
  expect(corners).toEqual([[255, 0, 0, 255], [0, 255, 0, 255],
    [0, 0, 255, 255], [255, 255, 0, 255]]);

  await page.locator('input[accept=".png,image/png"]').setInputFiles({
    name: "not-png.png", mimeType: "image/png", buffer: Buffer.from("not a valid PNG")
  });
  await expect(page.getByRole("dialog", { name: "Replace the shared texture?" })).toHaveCount(0);
  await expect(page.getByText(/Choose a valid PNG file/)).toBeVisible();
  await expect(canvas).toHaveAttribute("width", "32");
});

test("PNG texture export downloads a separate editable image without changing the model", async ({ page }) => {
  await page.goto("/");
  const data = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download texture PNG" }).click();
  const downloaded = await data;
  expect(downloaded.suggestedFilename()).toBe("lantern.png");
  const file = await downloaded.path();
  if (!file) throw new Error("Missing exported PNG.");
  await page.locator('input[accept=".png,image/png"]').setInputFiles(file);
  const dialog = page.getByRole("dialog", { name: "Replace the shared texture?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("32 × 32 pixels")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
});


test("eraser changes alpha, makes one undo entry and cancels a dragged erase with Escape", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Pixel eraser (E)" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const rgba = () => canvas.evaluate((node) => {
    const target = node as HTMLCanvasElement;
    return Array.from(target.getContext("2d")!.getImageData(0, 0, target.width, target.height).data);
  });
  const original = await rgba();
  await canvas.click({ position: { x: 9, y: 9 } });
  const clickedAlpha = async () => (await rgba())[(1 * 32 + 1) * 4 + 3];
  await expect.poll(clickedAlpha).toBe(0);
  await page.screenshot({ path: "test-results/eraser-undo.png" });

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect.poll(rgba).toEqual(original);
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  const erased = await rgba();
  expect(erased[(1 * 32 + 1) * 4 + 3]).toBe(0);
  expect(erased[3]).toBe(255); // Neighboring texel wasn't touched.

  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Paint canvas not visible.");
  await page.mouse.move(rect.x + 50, rect.y + 50);
  await page.mouse.down();
  await page.mouse.move(rect.x + 125, rect.y + 125, { steps: 6 });
  await page.keyboard.press("Escape");
  await expect.poll(rgba).toEqual(erased);
  await page.mouse.up();
  await expect.poll(rgba).toEqual(erased);
});

test("bucket fill respects contiguous RGBA boundaries, leaves one history entry, and supports 2D keyboard focus", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Fill connected area (G)" }).click();
  await page.getByRole("button", { name: "Choose color #f5d184" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const sample = (x: number, y: number) => canvas.evaluate((node, coordinates) => {
    const target = node as HTMLCanvasElement;
    return Array.from(target.getContext("2d")!
      .getImageData(coordinates.x, coordinates.y, 1, 1).data);
  }, { x, y });
  const rimBefore = await sample(0, 0);
  const centerBefore = await sample(8, 8);
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect.poll(() => sample(0, 0)).toEqual([245, 209, 132, 255]);
  expect(await sample(1, 1)).toEqual([245, 209, 132, 255]);
  expect(await sample(8, 8)).toEqual(centerBefore);
  await page.screenshot({ path: "test-results/contiguous-fill.png" });
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect.poll(() => sample(0, 0)).toEqual(rimBefore);
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect.poll(() => sample(0, 0)).toEqual([245, 209, 132, 255]);
});

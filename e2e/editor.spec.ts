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
  expect(download.suggestedFilename()).toMatch(/\.3dmc\.json$/);
  const path = await download.path();
  if (!path) throw new Error("Download was not saved in the browser test");
  await page.locator('input[accept=".json,application/json"]').setInputFiles(path);
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

  await page.locator('input[accept=".json,application/json"]').setInputFiles(path);
  await page.getByRole("dialog").getByRole("button", { name: "Open project" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
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

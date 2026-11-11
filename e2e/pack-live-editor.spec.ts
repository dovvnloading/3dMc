import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";

async function twoModels(page: Page) {
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await studio.getByRole("button", { name: "Close" }).click();
  return page.getByRole("combobox", { name: "Active pack model" });
}

test("edits either live model, undoes changes and reopens a complete pack", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  const second = await selector.inputValue();
  await selector.selectOption("model-0");
  const field = page.getByRole("textbox", { name: "X position" });
  await field.fill("5"); await field.press("Enter");
  await selector.selectOption(second);
  await expect(field).toHaveValue("3");
  await field.fill("7"); await field.press("Enter");
  const undoButton = page.getByRole("button", { name: /Undo \(Ctrl/ });
  // A disabled version selector previously overlapped the Undo hit target
  // in pack mode at the standard 1440px desktop viewport.
  await expect(undoButton).toBeEnabled();
  expect(await undoButton.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await undoButton.click();
  await expect(field).toHaveValue("3");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("5");
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project" }).click()
  ]);
  const path = await download.path(); if (!path) throw new Error("Pack backup missing");
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]!));
  expect(manifest.containerVersion).toBe(3);
  expect(manifest.sources).toHaveLength(2);
  expect(JSON.parse(strFromU8(archive[manifest.sources[0].document]!)).cuboids[0].from[0]).toBe(5);
  expect(JSON.parse(strFromU8(archive[manifest.sources[1].document]!)).cuboids[0].from[0]).toBe(3);
  await page.locator('input[type="file"][accept*=".3dmc"]').first().setInputFiles(path);
  await page.getByRole("dialog", { name: "Open source pack?" })
    .getByRole("button", { name: "Open source pack" }).click();
  await selector.selectOption(second);
  await expect(field).toHaveValue("3");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("5");
});

test("pack-wide local recovery restores both models and selected source after reload", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  const second = await selector.inputValue();
  const field = page.getByRole("textbox", { name: "X position" });
  await field.fill("6"); await field.press("Enter");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Another tab controls local recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Take over editing" }).click();
  await expect(page.getByRole("dialog", { name: "Continue a local session?" })).toContainText("2 models");
  await page.getByRole("button", { name: "Recover project" }).click();
  await expect(selector).toHaveValue(second);
  await expect(field).toHaveValue("6");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("3");
});

test("imported texture remains bound in both the native pack and the multi-model ZIP", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  await selector.selectOption("model-0");
  const pixelBytes = await page.evaluate(async () => {
    const { encodeRgbaPng } = await import("/src/export/png.ts");
    return Array.from(encodeRgbaPng(16, 16, new Array(16 * 16 * 4).fill(255)));
  });
  await page.getByRole("button", { name: /Add texture from PNG/ }).click();
  await page.locator('input[accept=".png,image/png"]').setInputFiles({
    name: "extra-sheet.png", mimeType: "image/png", buffer: Buffer.from(pixelBytes)
  });
  await page.getByRole("dialog", { name: "Add a texture asset?" })
    .getByRole("button", { name: "Add texture asset" }).click();
  const [source] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project" }).click()
  ]);
  const sourcePath = await source.path(); if (!sourcePath) throw new Error("Source pack download missing");
  const sourceFiles = unzipSync(new Uint8Array(await readFile(sourcePath)));
  const pack = JSON.parse(strFromU8(sourceFiles["pack.json"]!));
  expect(pack.textures).toHaveLength(3);
  expect(pack.models[0].textures).toHaveLength(2);
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("dialog", { name: "Experimental resource pack" })
      .getByRole("button", { name: "Download experimental ZIP" }).click()
  ]);
  const path = await download.path(); if (!path) throw new Error("Pack ZIP download missing");
  const files = unzipSync(new Uint8Array(await readFile(path)));
  expect(files["assets/minecraft/blockstates/diamond_block.json"]).toBeDefined();
  expect(files["assets/minecraft/blockstates/iron_block.json"]).toBeDefined();
});

test("pack export preflight Locates geometry errors in another source model", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  const second = await selector.inputValue();
  const x = page.getByRole("textbox", { name: "X position" });
  await x.fill("30");
  await x.press("Enter");
  await expect(x).toHaveValue("30");
  await selector.selectOption("model-0");
  await expect(x).toHaveValue("3");

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const dialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  const blocker = dialog.locator(".export-issue.issue-error")
    .filter({ hasText: "outside Java model element bounds" });
  await expect(blocker).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Download experimental ZIP" })).toBeDisabled();
  await blocker.getByRole("button", { name: "Locate" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(selector).toHaveValue(second);
  await expect(x).toHaveValue("30");
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
});


test("indexed export preflight blocks generated texture collisions before download", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();

  const modelPath = await studio.getByRole("textbox", { name: "Model resource path" }).inputValue();
  const texturePath = studio.getByRole("textbox", { name: "Texture path lantern.png" });
  await texturePath.fill(modelPath + "/solid_1");
  await texturePath.press("Enter");
  await studio.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  const collision = exportDialog.locator(".export-issue.issue-error")
    .filter({ hasText: "Generated file path collision" });
  await expect(collision).toBeVisible();
  await expect(collision).toContainText("Model: Copper Lantern copy");
  await expect(collision).toContainText(modelPath + "/solid_1.png");
  await expect(exportDialog.getByRole("button", { name: "Download experimental ZIP" })).toBeDisabled();
  await expect(exportDialog.getByText(/minecraft:diamond_block, minecraft:iron_block/)).toBeVisible();
  await exportDialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Pack Studio" }).click();
  const details = page.getByRole("dialog", { name: "Pack Studio" });
  const pathField = details.getByRole("textbox", { name: "Texture path lantern.png" });
  await pathField.fill("block/safe_second_texture");
  await pathField.press("Enter");
  await details.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const finalExport = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(finalExport.locator(".export-issue.issue-error")).toHaveCount(0);
  await expect(finalExport.getByRole("button", { name: "Download experimental ZIP" })).toBeEnabled();
});

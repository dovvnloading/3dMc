import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import type { EditorDocument } from "../src/editor/domain";

async function startAetherheart(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  const featured = dialog.getByRole("button", { name: /The Aetherheart/ });
  await featured.click();
  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("region", { name: "Showcase contents" })).toContainText("236");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(236);
  const dismiss = page.getByRole("button", { name: "Dismiss notice" });
  if (await dismiss.count()) await dismiss.click();
}

test("showcase has a larger stage, fitted cameras, guided exploration and editable star chart", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await startAetherheart(page);

  const guide = page.getByRole("region", { name: "Aetherheart showcase guide" });
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("236");
  await expect(guide).toContainText("10");
  await expect(page.getByLabel("The Aetherheart artwork")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");

  const fallback = page.getByRole("status", { name: "3D preview unavailable" });
  if (await fallback.count()) await expect(fallback).toBeVisible();
  else await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/aetherheart-" + browserName + ".png" });

  for (const kind of ["front", "right", "top", "iso"]) {
    const button = page.getByRole("button", { name: "View " + kind });
    await button.click();
    await expect(button).toHaveClass(/current/);
  }
  await page.screenshot({ path: "test-results/aetherheart-" + browserName + "-iso-reset.png" });

  await guide.getByRole("button", { name: /Inspect the crystal/ }).click();
  await expect(page.getByRole("tab", { name: "Model" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Crystal facet · ascending tier 4" })).toBeVisible();

  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: /Explore the gyroscopes/ }).click();
  await expect(page.getByRole("heading", { name: "Meridian I · segment 01" })).toBeVisible();

  await page.getByRole("tab", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await guide.getByRole("button", { name: /Paint the star chart/ }).click();
  await expect(page.getByRole("tab", { name: "Paint" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Celestial inlay · full star map" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Texture name" })).toHaveValue("07 · Celestial chart.png");
  await expect(page.locator(".texture-pixel-wrap canvas")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Showcase source download missing");
  const source = JSON.parse(await readFile(path, "utf8")) as EditorDocument;
  expect(source.cuboids).toHaveLength(236);
  expect(source.groups).toHaveLength(9);
  expect(source.textures).toHaveLength(10);
  expect(source.activeTextureId).toBe("stars");
  expect(source.textures.some(texture => texture.layers?.length === 2)).toBe(true);
  expect(errors).toEqual([]);
});

test("showcase preserves the complete scene through native save/reopen and Java ZIP export", async ({ page }) => {
  test.setTimeout(120_000);
  await startAetherheart(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.3dmc$/);
  const archivePath = await download.path();
  if (!archivePath) throw new Error("Native showcase archive missing");
  expect((await stat(archivePath)).size).toBeGreaterThan(10_000);

  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]')
    .setInputFiles(archivePath);
  const dialog = page.getByRole("dialog", { name: "Open this project?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(236);

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(exportDialog).toContainText("minecraft:diamond_block");
  await expect(exportDialog.getByRole("button", { name: "Download experimental ZIP" })).toBeEnabled();
  const [zipDownload] = await Promise.all([
    page.waitForEvent("download"),
    exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click()
  ]);
  expect(zipDownload.suggestedFilename()).toMatch(/\.zip$/);
  const zipPath = await zipDownload.path();
  if (!zipPath) throw new Error("Java resource pack download missing");
  expect((await stat(zipPath)).size).toBeGreaterThan(2_000);
});

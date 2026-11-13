import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile, stat } from "node:fs/promises";
import type { EditorDocument } from "../src/editor/domain";

async function openPrefab(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await dialog.getByRole("button", { name: /The Aetherheart/ }).click();
  await expect(dialog.getByRole("textbox", { name: "New project name" }))
    .toHaveValue("The Aetherheart · Celestial Relay");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option")).toHaveCount(236);

  // A prefab belongs in the EXISTING editor, not a one-off exhibit UI.
  await expect(page.getByRole("tab", { name: "Model" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Floating basalt footing" }))
    .toBeVisible();
  await expect(page.locator(".showcase-stage-signature")).toHaveCount(0);
  await expect(page.locator(".showcase-guide")).toHaveCount(0);

  const dismiss = page.getByRole("button", { name: "Dismiss notice" });
  if (await dismiss.count()) await dismiss.click();
}

test("the Aetherheart is a real editable prefab in the unchanged workspace", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openPrefab(page);

  // The prefab can be shaped through the ordinary numeric inspector and undone.
  const width = page.getByRole("textbox", { name: "X size" });
  await expect(width).toHaveValue("14");
  await width.fill("13");
  await width.press("Enter");
  await expect(width).toHaveValue("13");
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(width).toHaveValue("14");

  await page.getByRole("tab", { name: "Preview" }).click();
  const fallback = page.getByRole("status", { name: "3D preview unavailable" });
  if (await fallback.count()) await expect(fallback).toBeVisible();
  else await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
  for (const kind of ["front", "right", "top", "iso"]) {
    const button = page.getByRole("button", { name: "View " + kind });
    await button.click();
    await expect(button).toHaveClass(/current/);
  }
  await page.screenshot({ path: "test-results/aetherheart-prefab-" + browserName + ".png" });

  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.locator(".texture-pixel-wrap canvas")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Aetherheart source download missing");
  const source = JSON.parse(await readFile(path, "utf8")) as EditorDocument;
  expect(source.cuboids).toHaveLength(236);
  expect(source.groups).toHaveLength(9);
  expect(source.textures).toHaveLength(10);
  expect(source.cuboids[0]!.to).toEqual([15, 1.15, 15]);
  expect(source.textures.filter(texture => texture.layers?.length === 2)).toHaveLength(3);
  expect(errors).toEqual([]);
});

test("the prefab survives native save/reopen and exports a Java ZIP", async ({ page }) => {
  test.setTimeout(120_000);
  await openPrefab(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.3dmc$/);
  const archivePath = await download.path();
  if (!archivePath) throw new Error("Aetherheart native archive missing");
  expect((await stat(archivePath)).size).toBeGreaterThan(10_000);

  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]')
    .setInputFiles(archivePath);
  const confirmation = page.getByRole("dialog", { name: "Open this project?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option")).toHaveCount(236);

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(exportDialog).toContainText("minecraft:diamond_block");
  const exportButton = exportDialog.getByRole("button", { name: "Download experimental ZIP" });
  await expect(exportButton).toBeEnabled();
  const [pack] = await Promise.all([
    page.waitForEvent("download"), exportButton.click()
  ]);
  expect(pack.suggestedFilename()).toMatch(/\.zip$/);
  const zipPath = await pack.path();
  if (!zipPath) throw new Error("Aetherheart Java ZIP missing");
  expect((await stat(zipPath)).size).toBeGreaterThan(2_000);
});

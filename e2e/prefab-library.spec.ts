import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import type { EditorDocument } from "../src/editor/domain";

const item = "Apothecary Cabinet";

async function selectPrefab(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Add primitive" }).click();
  const menu = page.getByRole("menu", { name: "Choose a primitive" });
  await expect(menu.getByText("PREFAB LIBRARY · FURNITURE")).toBeVisible();
  await menu.getByRole("menuitem", { name: /Apothecary Cabinet/ }).click();
  await expect(menu).toHaveCount(0);
}
async function sourceJson(page: import("@playwright/test").Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Expected a readable prefab source download.");
  return JSON.parse(await readFile(path, "utf8")) as EditorDocument;
}

test("furniture prefab is a real library item, grouped, textured, undoable and insertable twice", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  const before = await sourceJson(page);
  expect(before.cuboids).toHaveLength(7);

  await selectPrefab(page);
  const first = await sourceJson(page);
  const added = first.cuboids.length - before.cuboids.length;
  expect(added).toBeGreaterThan(80);
  expect(added).toBeLessThan(150);
  expect(first.textures).toHaveLength(12);
  expect(first.groups).toHaveLength(1);
  expect(first.groups![0]!.memberIds).toHaveLength(added);
  expect(first.groups![0]!.name).toBe("Apothecary Cabinet · 01");
  expect(first.cuboids.slice(0, 7)).toEqual(before.cuboids);
  await expect(page.getByRole("button", { name: "Select group Apothecary Cabinet · 01" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Carcass \/ left back turned foot/ })).toBeVisible();
  const graphicsFallback = page.getByRole("status", { name: "3D preview unavailable" });
  if (await graphicsFallback.count()) await expect(graphicsFallback).toBeVisible();
  else await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/prefab-library-" + browserName + ".png" });

  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  expect(await sourceJson(page)).toEqual(before);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)", exact: true }).click();
  expect(await sourceJson(page)).toEqual(first);

  await selectPrefab(page);
  const second = await sourceJson(page);
  expect(second.cuboids).toHaveLength(before.cuboids.length + 2 * added);
  expect(second.textures).toHaveLength(12);
  expect(second.groups).toHaveLength(2);
  expect(second.groups![1]!.name).toBe("Apothecary Cabinet · 02");
  const bounds = second.groups!.map(group => second.cuboids.filter(node =>
    group.memberIds.includes(node.id)));
  expect(Math.max(...bounds[0]!.map(n => n.to[0]))).toBeLessThanOrEqual(
    Math.min(...bounds[1]!.map(n => n.from[0])) + 32);
  expect(errors).toEqual([]);
});

test("cabinet prefab survives native archive save/reopen and exports actual Java model/PNG files", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await dialog.getByRole("button", { name: /Empty canvas/ }).click();
  await dialog.getByRole("textbox", { name: "New project name" }).fill("Apothecary furniture project");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await selectPrefab(page);

  const original = await sourceJson(page);
  expect(original.groups).toHaveLength(1);
  expect(original.textures).toHaveLength(12);
  expect(original.cuboids[0]!.name).toContain("Carcass");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/\.3dmc$/);
  const nativePath = await download.path();
  if (!nativePath) throw new Error("Native cabinet archive missing.");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]')
    .setInputFiles(nativePath);
  const confirmation = page.getByRole("dialog", { name: "Open this project?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Open project" }).click();
  expect(await sourceJson(page)).toEqual(original);

  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  const exportButton = exportDialog.getByRole("button", { name: "Download experimental ZIP" });
  await expect(exportButton).toBeEnabled();
  const [zipDownload] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  const zipPath = await zipDownload.path();
  if (!zipPath) throw new Error("Minecraft furniture export missing.");
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  const modelPath = "assets/3dmc/models/block/lantern.json";
  expect(files[modelPath]).toBeDefined(); // Current legacy Java exporter path
  const model = JSON.parse(strFromU8(files[modelPath]!));
  expect(model.elements).toHaveLength(original.cuboids.length);
  expect(model.textures).toBeDefined();
  expect(Object.keys(files).filter(path => path.endsWith(".png")).length).toBeGreaterThan(10);
  expect(files["pack.mcmeta"]).toBeDefined();
});

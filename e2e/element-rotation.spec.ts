import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PerspectiveCamera, Vector3 } from "three";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";
import type { EditorDocument } from "../src/editor/domain";

async function source(page: Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Source download is missing");
  return JSON.parse(await readFile(path, "utf8")) as EditorDocument;
}
const angle = (page: Page) => page.getByRole("combobox", { name: "Element rotation angle" });
const axis = (page: Page) => page.getByRole("combobox", { name: "Element rotation axis" });
const canvas = (page: Page) => page.locator(".viewport-canvas canvas");

async function project(page: Page, point: Vector3): Promise<{ x: number; y: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("Canvas has no bounding box");
  const view = new PerspectiveCamera(40, box.width / box.height, 0.01, 100);
  const top = await page.getByRole("button", { name: "View top" }).getAttribute("class");
  if (top?.includes("current")) view.position.set(0, 4, 0.001);
  else {
    const front = await page.getByRole("button", { name: "View front" }).getAttribute("class");
    if (front?.includes("current")) view.position.set(0, 0.65, 4);
    else view.position.set(2.9, 2.35, 3.2);
  }
  view.lookAt(0, 0.58, 0);
  view.updateMatrixWorld(true);
  const projected = point.clone().project(view);
  return { x: box.x + (projected.x + 1) * box.width / 2,
    y: box.y + (1 - projected.y) * box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await expect(angle(page)).toBeVisible();
});

test("inspector rotation, mixed selection and history preserve exact source data", async ({ page }) => {
  const before = await source(page);
  expect(before.cuboids[0]?.rotation).toBeUndefined();
  await axis(page).selectOption("z");
  await angle(page).selectOption("-22.5");
  await page.getByRole("textbox", { name: "Pivot Y" }).fill("-3.125");
  await page.getByRole("textbox", { name: "Pivot Y" }).press("Enter");
  await page.getByRole("checkbox", { name: "Rescale rotated element" }).check();
  const rotated = await source(page);
  expect(rotated.cuboids[0]?.rotation).toEqual({
    axis: "z", angle: -22.5, origin: [8, -3.125, 8], rescale: true
  });
  const undo = page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" });
  await undo.click();
  expect((await source(page)).cuboids[0]?.rotation?.rescale).toBe(false);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  expect(await source(page)).toEqual(rotated);
  await page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option").filter({ hasText: "Foundation" }).click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
  await expect(angle(page).locator('option[value="mixed"]')).toHaveCount(1);
  await angle(page).selectOption("45");
  const both = await source(page);
  expect(both.cuboids.slice(0, 2).map(node => node.rotation?.angle)).toEqual([45, 45]);
  await undo.click();
  expect(await source(page)).toEqual(rotated);
  await page.getByRole("button", { name: "Reset rotation" }).click();
  const afterReset = await source(page);
  expect(afterReset.cuboids.slice(0, 2).every(node => node.rotation === undefined)).toBe(true);
  await undo.click();
  expect(await source(page)).toEqual(rotated);
});

test("on-canvas ring snaps, Escape cancels, and save/reopen/export preserve rotation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "View top" }).click();
  await page.getByRole("button", { name: /Rotate \(E\)/ }).click();
  await page.screenshot({ path: "test-results/evidence/element-rotation-before.png", fullPage: true });
  await expect(page.locator(".rotation-handle-label")).toContainText("Y · 0°");
  // The real ring is a Y-axis torus centered on the body pivot at (0,0.46875,0).
  const radius = 0.3925;
  const start = await project(page, new Vector3(radius, 7.5 / 16, 0));
  const delta = 22.5 * Math.PI / 180;
  const end = await project(page, new Vector3(radius * Math.cos(delta), 7.5 / 16, -radius * Math.sin(delta)));
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await source(page)).cuboids[0]?.rotation).toBeUndefined();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
  await expect(angle(page)).toHaveValue("22.5");
  const edited = await source(page);
  expect(edited.cuboids[0]?.rotation?.angle).toBe(22.5);
  await page.screenshot({ path: "test-results/evidence/element-rotation-handle-inspector.png", fullPage: true });
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect((await source(page)).cuboids[0]?.rotation).toBeUndefined();
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  expect(await source(page)).toEqual(edited);

  const [saved] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  const file = await saved.path(); if (!file) throw new Error("Missing .3dmc download");
  await angle(page).selectOption("-45");
  await page.locator('input[type="file"][accept*=".3dmc"]').setInputFiles(file);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project", exact: true }).click();
  await expect(angle(page)).toHaveValue("22.5");
  expect(await source(page)).toEqual(edited);
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const modal = page.getByRole("dialog", { name: "Experimental resource pack" });
  await expect(modal.getByText(/0 blockers/)).toBeVisible();
  const [packed] = await Promise.all([
    page.waitForEvent("download"), modal.getByRole("button", { name: "Download experimental ZIP" }).click()
  ]);
  const path = await packed.path(); if (!path) throw new Error("Missing generated pack");
  const json = JSON.parse(strFromU8(unzipSync(new Uint8Array(await readFile(path)))["assets/3dmc/models/block/lantern.json"]!));
  expect(json.elements[0].rotation).toEqual({ origin: [8, 7.5, 8], axis: "y", angle: 22.5, rescale: false });
  expect(errors).toEqual([]);
});

test("paint on a rotated south face updates its intended UV texels", async ({ page }) => {
  const before = await source(page);
  await angle(page).selectOption("22.5");
  await page.getByRole("button", { name: "View front" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Pixel pencil (B)" }).click();
  const a = 22.5 * Math.PI / 180;
  const p = await project(page, new Vector3(5 / 16 * Math.sin(a), 7.5 / 16, 5 / 16 * Math.cos(a)));
  await page.mouse.click(p.x, p.y);
  const after = await source(page);
  expect(after.cuboids[0]?.rotation?.angle).toBe(22.5);
  const edited = after.textures[0]!.pixels;
  const old = before.textures[0]!.pixels;
  const changes = edited.flatMap((value, i) => value !== old[i] ? [i] : []);
  expect(changes.length).toBeGreaterThan(0);
  // A single 1px pencil gesture must not smear across unrelated faces or UV seams.
  expect(new Set(changes.map(index => Math.floor(index / 4))).size).toBe(1);
  const texel = Math.floor(changes[0]! / 4);
  expect([Math.floor(texel % 32), Math.floor(texel / 32)]).toEqual([16, 16]);
});

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { encodeRgbaPng } from "../src/export/png";
import type { EditorDocument } from "../src/editor/domain";

async function nativeSource(page: Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Expected a readable source archive in the browser test.");
  return JSON.parse(await readFile(path, "utf8"));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
});

test("pixel-region preview cancels exactly and applying one region creates one undo entry", async ({ page }) => {
  const original = await nativeSource(page);
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Pixel region" }).click();
  let dialog = page.getByRole("dialog", { name: "Edit pixel region" });
  await dialog.getByRole("button", { name: "Clear region" }).click();
  await dialog.getByRole("button", { name: "Cancel preview" }).click();
  expect(await nativeSource(page)).toEqual(original);
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Pixel region" }).click();
  dialog = page.getByRole("dialog", { name: "Edit pixel region" });
  await dialog.getByRole("button", { name: "Clear region" }).click();
  await dialog.getByRole("button", { name: "Apply pixel edits" }).click();
  const changed = await nativeSource(page);
  const before = original.textures[0]!, after = changed.textures[0]!;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const offset = (y * before.width + x) * 4;
    expect(after.pixels.slice(offset, offset + 4)).toEqual([0, 0, 0, 0]);
  }
  expect(after.pixels).not.toEqual(before.pixels);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  expect(await nativeSource(page)).toEqual(original);
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
});

test("making one face texture unique preserves other bindings and undoes atomically", async ({ page }) => {
  const original = await nativeSource(page);
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Face tools" }).click();
  const dialog = page.getByRole("dialog", { name: "Face texture tools" });
  await expect(dialog.getByText(/other face bindings overlap/)).toBeVisible();
  await dialog.getByRole("button", { name: "Copy sheet and rebind this face" }).click();
  const changed = await nativeSource(page);
  expect(changed.textures).toHaveLength(original.textures.length + 1);
  expect(changed.cuboids[0]!.faces.north.textureId).not.toBe(original.cuboids[0]!.faces.north.textureId);
  expect(changed.cuboids[0]!.faces.east.textureId).toBe(original.cuboids[0]!.faces.east.textureId);
  expect(changed.textures.at(-1)!.pixels).toEqual(original.textures[0]!.pixels);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  expect(await nativeSource(page)).toEqual(original);
});

test("external model import preflights unsupported fields and accepts an explicitly resolved local PNG", async ({ page }) => {
  const original = await nativeSource(page);
  await page.getByRole("button", { name: "Import model" }).click();
  const dialog = page.getByRole("dialog", { name: "Import external block model" });
  const upload = dialog.getByRole("button", { name: "Import resolved copy" });
  const faces = Object.fromEntries(["north", "east", "south", "west", "up", "down"]
    .map(face => [face, { uv: [0, 0, 16, 16], texture: "#base", rotation: 0 }]));
  const valid = { textures: { base: "demo:block/paint" }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }] };
  const json = dialog.getByRole("button", { name: "Choose model JSON files" });
  // Input has a native file button in some browsers; target the labeled input itself.
  const fileInput = dialog.getByLabel("External model JSON files");
  await fileInput.setInputFiles({ name: "safe.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...valid, unsupported: "would be lost" })) });
  await expect(dialog.getByRole("alert")).toContainText("Unsupported field");
  await expect(upload).toBeDisabled();
  await fileInput.setInputFiles({ name: "safe.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(valid)) });
  await expect(dialog.getByText(/Missing PNG binding/)).toBeVisible();
  const rgba = new Array<number>(16 * 16 * 4);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 31; rgba[i + 1] = 94; rgba[i + 2] = 177; rgba[i + 3] = 255; }
  await dialog.getByLabel("PNG for demo:block/paint").setInputFiles({
    name: "paint.png", mimeType: "image/png", buffer: Buffer.from(encodeRgbaPng(16, 16, rgba))
  });
  await expect(upload).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /I understand this creates a resolved editable copy/ }).check();
  await expect(upload).toBeEnabled();
  await upload.click();
  await expect(dialog).toHaveCount(0);
  const imported = await nativeSource(page);
  expect(imported.cuboids).toHaveLength(1);
  expect(imported.cuboids[0]!.from).toEqual([0, 0, 0]);
  expect(imported.cuboids[0]!.to).toEqual([16, 16, 16]);
  expect(imported.textures).toHaveLength(1);
  expect(imported.textures[0]!.pixels.slice(0, 4)).toEqual([31, 94, 177, 255]);
  expect(original.cuboids).toHaveLength(7);
  await expect(page.getByText("Java pack experiment", { exact: true })).toBeVisible();
});

test("explicit local backup remains immutable across later project edits and restores verified source", async ({ page }) => {
  const original = await nativeSource(page);
  await page.getByRole("button", { name: "Library" }).click();
  let dialog = page.getByRole("dialog", { name: "Local project library" });
  await dialog.getByRole("button", { name: "Save new local snapshot" }).click();
  await expect(dialog.getByRole("status")).toContainText("Snapshot saved on this device");
  await dialog.getByRole("button", { name: "Close library" }).click();

  const x = page.getByRole("textbox", { name: "X position", exact: true });
  await x.fill("5"); await x.press("Enter");
  expect(await nativeSource(page)).not.toEqual(original);
  await page.getByRole("button", { name: "Library" }).click();
  dialog = page.getByRole("dialog", { name: "Local project library" });
  await expect(dialog.getByText("1/12 snapshots")).toBeVisible();
  await dialog.getByRole("button", { name: "Open copy" }).click();
  await dialog.getByRole("button", { name: "Open verified copy" }).click();
  await expect(dialog).toHaveCount(0);
  expect(await nativeSource(page)).toEqual(original);
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
});

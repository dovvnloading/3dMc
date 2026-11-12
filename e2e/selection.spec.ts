import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { readFile } from "node:fs/promises";
import type { EditorDocument } from "../src/editor/domain";

const rows = (page: Page) => page.getByRole("listbox", { name: "Scene elements" }).getByRole("option");
const row = (page: Page, name: string) => rows(page).filter({ has: page.getByText(name, { exact: true }) });
async function source(page: Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path(); if (!path) throw new Error("Source download did not produce a file");
  return JSON.parse(await readFile(path, "utf8"));
}
async function selectPair(page: Page) {
  await row(page, "Lantern body").click();
  await row(page, "Foundation").click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
}
async function grabSelectionGizmo(page: Page, tool: "move" | "resize" = "move") {
  const canvas = page.locator(".viewport-canvas canvas");
  for (const distance of [0.45, 0.55, 0.35, 0.65, 0.25, 0.75, 0.15]) {
    await selectPair(page);
    await page.getByRole("button", { name: tool === "move" ? "Move (W)" : "Resize (R)", exact: true }).click();
    await expect(canvas).toHaveAttribute("data-selection-transform-ready", tool);
    const box = await canvas.boundingBox(); if (!box) throw new Error("Canvas has no bounds");
    const camera = new PerspectiveCamera(40, box.width / box.height, 0.01, 100);
    camera.position.set(2.9, 2.35, 3.2); camera.lookAt(0, 0.58, 0); camera.updateMatrixWorld(true);
    const projected = new Vector3(distance, 6.5 / 16, 0).project(camera);
    const x = box.x + (projected.x + 1) * box.width / 2;
    const y = box.y + (1 - projected.y) * box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    if (await canvas.getAttribute("data-selection-transform") === "active") return { canvas, x, y };
    await page.mouse.up();
  }
  throw new Error("Could not acquire the real rendered selection gizmo; cancellation must not pass without an active drag");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(7);
});

test("multi-select, exact batch move, undo/redo, rejected edit and native reopen", async ({ page }) => {
  const original = await source(page);
  await selectPair(page);
  const undo = page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true });
  await expect(undo).toBeDisabled();
  const position = page.getByRole("textbox", { name: "Selection X position", exact: true });
  await expect(position).toHaveValue("2");
  await position.fill("5"); await position.press("Enter");
  const edited = await source(page);
  expect(edited.cuboids[0]!.from).toEqual([6, 3, 3]);
  expect(edited.cuboids[1]!.from).toEqual([5, 1, 2]);
  expect(edited.textures).toEqual(original.textures);
  await undo.click(); await expect(position).toHaveValue("2");
  await expect(undo).toBeDisabled(); expect(await source(page)).toEqual(original);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)", exact: true }).click();
  await expect(position).toHaveValue("5");
  const size = page.getByRole("textbox", { name: "Selection X size", exact: true });
  await size.fill("1000"); await size.press("Enter");
  await expect(size).toHaveAttribute("aria-invalid", "true");
  expect(await source(page)).toEqual(edited);
  const [archive] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  expect(archive.suggestedFilename()).toMatch(/\.3dmc$/);
  const archivePath = await archive.path(); if (!archivePath) throw new Error("Native archive missing");
  await position.fill("7"); await position.press("Enter");
  await page.locator('input[type="file"][accept*=".3dmc"]').setInputFiles(archivePath);
  await page.getByRole("dialog", { name: "Open this project?" }).getByRole("button", { name: "Open project", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "X position", exact: true })).toHaveValue("6");
  await expect(undo).toBeDisabled(); expect(await source(page)).toEqual(edited);
  await page.screenshot({ path: "test-results/selection-native-reopen.png", fullPage: true });
});


test("align and distribute selected cuboids are undoable and preserve native source", async ({ page }) => {
  const original = await source(page);
  await selectPair(page);
  await page.getByRole("button", { name: "Align Y maximum" }).click();
  const aligned = await source(page);
  expect(aligned.cuboids[0]!.from).toEqual([3, 3, 3]);
  expect(aligned.cuboids[1]!.from).toEqual([2, 10, 2]);
  expect(aligned.cuboids[1]!.to).toEqual([14, 12, 14]);
  expect(aligned.textures).toEqual(original.textures);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(original);

  await row(page, "Foundation").click();
  await row(page, "Canopy").click({ modifiers: ["Control"] });
  await row(page, "Top plate").click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "3 parts selected" })).toBeVisible();
  await page.getByRole("button", { name: "Distribute Y centers" }).click();
  const spread = await source(page);
  expect(spread.cuboids[2]!.from[1]).toBe(7.25);
  expect(spread.cuboids[2]!.to[1]).toBe(9.25);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(original);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  expect(await source(page)).toEqual(spread);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Native pack save missing");
  await page.locator('input[type="file"][accept*=".3dmc"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project", exact: true }).click();
  expect(await source(page)).toEqual(spread);
});

test("mixed per-part dimensions, duplicate and delete are single reversible commands", async ({ page }) => {
  await selectPair(page);
  const size = page.getByRole("textbox", { name: "Each part X size", exact: true });
  await expect(size).toHaveAttribute("placeholder", "Mixed");
  await size.fill("4"); await size.press("Enter");
  const resized = await source(page);
  expect(resized.cuboids.slice(0, 2).map(node => node.to[0] - node.from[0])).toEqual([4, 4]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(size).toHaveValue("");
  await page.getByRole("button", { name: "Duplicate selection", exact: true }).click();
  await expect(rows(page)).toHaveCount(9);
  await expect(page.locator('.scene-row[aria-selected="true"]')).toHaveCount(2);
  const duplicated = await source(page);
  expect(new Set(duplicated.cuboids.map(node => node.id)).size).toBe(9);
  expect(duplicated.cuboids.slice(-2).map(node => node.name)).toEqual(["Lantern body copy", "Foundation copy"]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(rows(page)).toHaveCount(7);
  await selectPair(page);
  await page.getByRole("button", { name: "Delete selection", exact: true }).click();
  await expect(rows(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(rows(page)).toHaveCount(7);
});

test("locked selections reject the whole command and editable selection respects filtering", async ({ page }) => {
  await page.getByRole("button", { name: "Lock Lantern body", exact: true }).click();
  await selectPair(page);
  await expect(page.getByRole("button", { name: "Duplicate selection", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Selection X position", exact: true })).toBeDisabled();
  const before = await source(page);
  await page.keyboard.press("Control+d");
  await expect(page.locator(".notice-toast")).toContainText("locked");
  expect(await source(page)).toEqual(before);
  await page.getByRole("button", { name: "Select editable", exact: true }).click();
  await expect(page.getByRole("heading", { name: "6 parts selected" })).toBeVisible();
  const filter = page.getByRole("textbox", { name: "Filter scene elements" });
  await filter.fill("Handle"); await filter.press("Control+a");
  await expect(page.getByRole("heading", { name: "6 parts selected" })).toBeVisible();
  await page.getByRole("button", { name: "Select editable", exact: true }).click();
  await expect(page.getByRole("heading", { name: "3 parts selected" })).toBeVisible();
});

test("keyboard range selection and numeric Escape do not add content history", async ({ page }) => {
  await row(page, "Lantern body").focus(); await page.keyboard.press("Shift+ArrowDown");
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
  await expect(row(page, "Foundation")).toBeFocused();
  const position = page.getByRole("textbox", { name: "Selection Y position", exact: true });
  await position.fill("30"); await position.press("Escape");
  await expect(position).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
  await row(page, "Foundation").click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "Lantern body", exact: true })).toBeVisible();
});

for (const cancellation of ["Escape", "blur", "lost capture"] as const) {
  test(`real batch move preview cancels with ${cancellation} and preserves every source byte`, async ({ page }) => {
    const original = await source(page);
    const { canvas, x, y } = await grabSelectionGizmo(page);
    const before = await canvas.getAttribute("data-selection-preview"); expect(before).not.toBeNull();
    await page.mouse.move(x + 90, y + 25, { steps: 6 });
    await expect.poll(() => canvas.getAttribute("data-selection-preview")).not.toBe(before);
    if (cancellation === "Escape") await page.keyboard.press("Escape");
    else if (cancellation === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await canvas.dispatchEvent("lostpointercapture", { pointerId: 1, bubbles: true });
    await expect(canvas).not.toHaveAttribute("data-selection-transform", "active");
    await page.mouse.up();
    expect(await source(page)).toEqual(original);
    await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
  });
}

test("real shared move gizmo commits all members as exactly one undo step", async ({ page }) => {
  const original = await source(page);
  const { canvas, x, y } = await grabSelectionGizmo(page);
  const before = await canvas.getAttribute("data-selection-preview");
  await page.mouse.move(x + 90, y + 25, { steps: 6 });
  await expect.poll(() => canvas.getAttribute("data-selection-preview")).not.toBe(before);
  await page.mouse.up();
  const undo = page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true });
  await expect(undo).toBeEnabled();
  const edited = await source(page);
  expect(edited.cuboids[0]!.from).not.toEqual(original.cuboids[0]!.from);
  for (const axis of [0, 1, 2] as const) {
    const delta = edited.cuboids[0]!.from[axis] - original.cuboids[0]!.from[axis];
    expect(edited.cuboids[1]!.from[axis] - original.cuboids[1]!.from[axis]).toBeCloseTo(delta, 4);
  }
  expect(edited.cuboids.slice(2)).toEqual(original.cuboids.slice(2));
  expect(edited.textures).toEqual(original.textures);
  await undo.click(); await expect(undo).toBeDisabled(); expect(await source(page)).toEqual(original);
});

test("real shared resize preview cancels without a history entry", async ({ page }) => {
  const original = await source(page);
  const { canvas, x, y } = await grabSelectionGizmo(page, "resize");
  const before = await canvas.getAttribute("data-selection-preview");
  await page.mouse.move(x + 60, y + 15, { steps: 6 });
  await expect.poll(() => canvas.getAttribute("data-selection-preview")).not.toBe(before);
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await source(page)).toEqual(original);
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
});

test("two duplicate commands in one browser turn both commit without losing the second edit", async ({ page }) => {
  const initial = await source(page);
  await row(page, "Lantern body").click();
  await page.evaluate(() => {
    const duplicate = () => new KeyboardEvent("keydown", { key: "d", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(duplicate());
    window.dispatchEvent(duplicate());
  });
  await expect(rows(page)).toHaveCount(initial.cuboids.length + 2);
  const after = await source(page);
  expect(after.cuboids.filter(node => node.name === "Lantern body copy")).toHaveLength(2);
  expect(new Set(after.cuboids.map(node => node.id)).size).toBe(after.cuboids.length);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(rows(page)).toHaveCount(initial.cuboids.length + 1);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  expect(await source(page)).toEqual(initial);
});

test("array duplicates a multi-selection with exact offsets and one undoable source change", async ({ page }) => {
  const original = await source(page);
  await selectPair(page);
  await page.getByRole("spinbutton", { name: "Array copies" }).fill("3");
  await page.getByRole("spinbutton", { name: "Array step X" }).fill("0");
  await page.getByRole("spinbutton", { name: "Array step Y" }).fill("4");
  await page.getByRole("spinbutton", { name: "Array step Z" }).fill("-2");
  await page.getByRole("button", { name: "Create array copies" }).click();

  await expect(rows(page)).toHaveCount(13);
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
  const array = await source(page);
  expect(array.cuboids[7]!.from).toEqual([3, 7, 1]);
  expect(array.cuboids[9]!.from).toEqual([3, 11, -1]);
  expect(array.cuboids[11]!.from).toEqual([3, 15, -3]);
  expect(array.cuboids[7]!.faces).toEqual(original.cuboids[0]!.faces);
  expect(array.textures).toEqual(original.textures);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(original);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  expect(await source(page)).toEqual(array);

  const [archive] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  const path = await archive.path();
  if (!path) throw new Error("Native project archive missing");
  await page.locator('input[type="file"][accept*=".3dmc"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project", exact: true }).click();
  expect(await source(page)).toEqual(array);
});

test("single-element array rejects empty spacing before creating copies", async ({ page }) => {
  await row(page, "Lantern body").click();
  const original = await source(page);
  const action = page.getByRole("button", { name: "Create array copies" });
  await expect(action).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Array step X" }).fill("0");
  await expect(action).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Array step X" }).fill("1");
  await action.click();
  await expect(rows(page)).toHaveCount(9);
  const result = await source(page);
  expect(result.cuboids[7]!.from).toEqual([4, 3, 3]);
  expect(result.cuboids[8]!.from).toEqual([5, 3, 3]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(original);
});

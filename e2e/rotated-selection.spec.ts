import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { EditorDocument, Cuboid } from "../src/editor/domain";
import { transformedBounds, transformedCorners } from "../src/editor/elementRotation";

const row = (page: Page, name: string) => page.getByRole("listbox", { name: "Scene elements" })
  .getByRole("option").filter({ hasText: name });
const selected = ["body", "base", "roof"];
const byId = (doc: EditorDocument, id: string): Cuboid => doc.cuboids.find(node => node.id === id)!;
const visibleCenter = (node: Cuboid, axis: 0 | 1 | 2) => {
  const bounds = transformedBounds(node);
  return (bounds.from[axis] + bounds.to[axis]) / 2;
};

async function source(page: Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Source download is missing");
  return JSON.parse(await readFile(path, "utf8")) as EditorDocument;
}

test("rotated and unrotated parts align, distribute and mirror in the real UI", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option")).toHaveCount(7);

  // Change an actual selected part, including its off-center pivot and rescale.
  await page.getByRole("combobox", { name: "Element rotation axis" }).selectOption("z");
  await page.getByRole("combobox", { name: "Element rotation angle" }).selectOption("-22.5");
  await page.getByRole("textbox", { name: "Pivot X" }).fill("5.25");
  await page.getByRole("textbox", { name: "Pivot X" }).press("Enter");
  await page.getByRole("checkbox", { name: "Rescale rotated element" }).check();

  await row(page, "Foundation").click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
  const align = page.getByRole("button", { name: "Align X minimum" });
  await expect(align).toBeEnabled();
  const beforeAlign = await source(page);
  await align.click();
  const aligned = await source(page);
  const minX = selected.slice(0, 2).map(id => transformedBounds(byId(aligned, id)).from[0]);
  expect(minX[0]).toBeCloseTo(minX[1]!, 3);
  expect(byId(aligned, "body").rotation?.angle).toBe(-22.5);
  expect(byId(aligned, "body").rotation?.rescale).toBe(true);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(beforeAlign);

  await row(page, "Canopy").click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "3 parts selected" })).toBeVisible();
  const before = await source(page);
  const spread = page.getByRole("button", { name: "Distribute Y centers" });
  await expect(spread).toBeEnabled();
  await spread.click();
  const distributed = await source(page);
  const order = [...selected].sort((a, b) => visibleCenter(byId(before, a), 1) -
    visibleCenter(byId(before, b), 1));
  const first = visibleCenter(byId(before, order[0]!), 1);
  const last = visibleCenter(byId(before, order[2]!), 1);
  order.forEach((id, i) => {
    expect(visibleCenter(byId(distributed, id), 1)).toBeCloseTo(first + (last - first) * i / 2, 3);
  });
  expect(byId(distributed, "body").rotation?.rescale).toBe(true);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await source(page)).toEqual(before);

  const mirror = page.getByRole("button", { name: "Mirror selected parts on X" });
  await expect(mirror).toBeEnabled();
  const sum = Math.min(...selected.map(id => transformedBounds(byId(before, id)).from[0])) +
    Math.max(...selected.map(id => transformedBounds(byId(before, id)).to[0]));
  await mirror.click();
  const mirrored = await source(page);
  for (const id of selected) {
    const afterCorners = transformedCorners(byId(mirrored, id));
    for (const corner of transformedCorners(byId(before, id))) {
      const target = [sum - corner[0], corner[1], corner[2]];
      const distance = Math.min(...afterCorners.map(c =>
        Math.hypot(...c.map((value, axis) => value - target[axis]!))));
      expect(distance).toBeLessThan(0.0005);
    }
  }
  expect(byId(mirrored, "body").rotation?.angle).toBe(22.5);
  expect(byId(mirrored, "body").rotation?.rescale).toBe(true);
  await mirror.click();
  expect(await source(page)).toEqual(before);
  expect(errors).toEqual([]);
});

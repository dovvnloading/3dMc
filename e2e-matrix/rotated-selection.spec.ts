import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import type { EditorDocument } from "../src/editor/domain";
import { transformedBounds, transformedCorners } from "../src/editor/elementRotation";

// Match the non-headless WebGL/Xvfb setup used by the existing matrix.
test.use(process.env.CI ? { headless: false } : {});

const row = (page: Page, name: string) => page.getByRole("listbox", { name: "Scene elements" })
  .getByRole("option").filter({ hasText: name });
async function source(page: Page): Promise<EditorDocument> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Source download is missing");
  return JSON.parse(await readFile(path, "utf8")) as EditorDocument;
}

test("Firefox/WebKit rotated selection geometry remains editable and mirror is reversible", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await page.getByRole("combobox", { name: "Element rotation axis" }).selectOption("z");
  await page.getByRole("combobox", { name: "Element rotation angle" }).selectOption("-22.5");
  await page.getByRole("textbox", { name: "Pivot X" }).fill("5.25");
  await page.getByRole("textbox", { name: "Pivot X" }).press("Enter");
  await page.getByRole("checkbox", { name: "Rescale rotated element" }).check();
  await row(page, "Foundation").click({ modifiers: ["Control"] });
  await expect(page.getByRole("button", { name: "Align X minimum" })).toBeEnabled();
  await page.getByRole("button", { name: "Align X minimum" }).click();
  await row(page, "Canopy").click({ modifiers: ["Control"] });
  await expect(page.getByRole("button", { name: "Distribute Y centers" })).toBeEnabled();
  await page.getByRole("button", { name: "Distribute Y centers" }).click();
  const before = await source(page);
  const ids = ["body", "base", "roof"];
  const part = (document: EditorDocument, id: string) => document.cuboids.find(node => node.id === id)!;
  const sum = Math.min(...ids.map(id => transformedBounds(part(before, id)).from[0])) +
    Math.max(...ids.map(id => transformedBounds(part(before, id)).to[0]));
  const mirror = page.getByRole("button", { name: "Mirror selected parts on X" });
  await expect(mirror).toBeEnabled();
  await mirror.click();
  const mirrored = await source(page);
  expect(part(mirrored, "body").rotation?.angle).toBe(22.5);
  expect(part(mirrored, "body").rotation?.rescale).toBe(true);
  for (const id of ids) {
    const mirroredCorners = transformedCorners(part(mirrored, id));
    for (const original of transformedCorners(part(before, id))) {
      const expected = [sum - original[0], original[1], original[2]];
      expect(Math.min(...mirroredCorners.map(corner =>
        Math.hypot(...corner.map((value, axis) => value - expected[axis]!))))).toBeLessThan(0.0005);
    }
  }
  await mirror.click();
  expect(await source(page)).toEqual(before);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/evidence/rotated-selection-${browserName}.png`, fullPage: true });
});

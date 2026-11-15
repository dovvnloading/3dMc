import { expect, test } from "@playwright/test";

test("Firefox/WebKit symmetry and filled ellipse survive history and expose guides", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Mirror X symmetry" }).click();
  await expect(page.locator(".sheet-symmetry-guides line")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Fill rectangle and ellipse" }).check();
  await page.getByRole("button", { name: "Ellipse filled (O)" }).click();
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  const pixel = (x: number, y: number) => canvas.evaluate((node, p) =>
    Array.from((node as HTMLCanvasElement).getContext("2d")!.getImageData(p.x, p.y, 1, 1).data),
  { x, y });
  const coord = async (x: number, y: number) => {
    const b = await canvas.boundingBox();
    if (!b) throw new Error("Texture sheet unavailable");
    return { x: b.x + (x + .5) * b.width / 32, y: b.y + (y + .5) * b.height / 32 };
  };
  const before = await pixel(26, 11);
  const a = await coord(4, 10), b = await coord(7, 13);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.mouse.up();
  await expect.poll(() => pixel(26, 11)).toEqual([199, 109, 104, 255]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  await expect.poll(() => pixel(26, 11)).toEqual(before);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  await expect.poll(() => pixel(26, 11)).toEqual([199, 109, 104, 255]);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const archive = await downloaded;
  const path = await archive.path();
  if (!path) throw new Error("Missing native .3dmc archive");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect.poll(() => pixel(26, 11)).toEqual([199, 109, 104, 255]);
  await page.screenshot({ path: `test-results/matrix-${browserName}-symmetry-ellipse.png` });
  expect(errors).toEqual([]);
});

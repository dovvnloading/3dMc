import { expect, test } from "@playwright/test";

test("texture zoom remains cursor-anchored; pan never paints; fit/reset and grid stay precise", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  const zoom = page.getByRole("status", { name: "Texture zoom level" });
  await expect(zoom).toHaveText("8×");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Texture bitmap is missing");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  const previousTexel = await page.locator(".texture-footer").innerText();
  await page.mouse.wheel(0, -240);
  await expect(zoom).not.toHaveText("8×");
  await page.mouse.move(x + 0.1, y);
  expect((await page.locator(".texture-footer").innerText()).split("Alpha")[0])
    .toBe(previousTexel.split("Alpha")[0]);

  const beforePan = await canvas.boundingBox();
  await page.keyboard.down("Space");
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 22, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const afterPan = await canvas.boundingBox();
  if (!beforePan || !afterPan) throw new Error("Sheet lost during pan");
  expect(afterPan.x - beforePan.x).toBeGreaterThan(1);
  await page.getByRole("checkbox", { name: "Show pixel grid" }).check();
  await expect(page.locator(".sheet-pixel-grid")).toBeVisible();
  await page.getByRole("button", { name: "Fit texture sheet" }).click();
  await expect(canvas).toBeInViewport();
  await page.getByRole("button", { name: "Reset texture view" }).click();
  await expect(zoom).toHaveText("8×");
  const refreshed = await canvas.boundingBox();
  if (!refreshed) throw new Error("Sheet missing after view reset");
  await page.mouse.move(refreshed.x + 40, refreshed.y + 40);
  await expect(page.locator(".sheet-brush-outline")).toBeVisible();
  await page.screenshot({ path: "test-results/paint-sheet-zoom-grid-footprint.png" });
  expect(errors).toEqual([]);
});

test("brush size and round footprint paint once with exact undo and no ghost stamps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const slider = page.getByRole("slider", { name: "Brush size" });
  await canvas.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("]");
  await expect(slider).toHaveValue("5");
  await page.getByRole("button", { name: "Round", exact: true }).click();
  await expect(page.getByRole("button", { name: "Round", exact: true })).toHaveAttribute("aria-pressed", "true");
  const before = await canvas.evaluate(node => {
    const bitmap = node as HTMLCanvasElement;
    return Array.from(bitmap.getContext("2d")!.getImageData(0, 0, bitmap.width, bitmap.height).data);
  });
  await canvas.click({ position: { x: 8 * 10.5, y: 8 * 10.5 } });
  const after = await canvas.evaluate(node => {
    const bitmap = node as HTMLCanvasElement;
    return Array.from(bitmap.getContext("2d")!.getImageData(0, 0, bitmap.width, bitmap.height).data);
  });
  const changed: string[] = [];
  for (let i = 0; i < before.length; i += 4)
    if (before.slice(i, i + 4).some((value, channel) => value !== after[i + channel]))
      changed.push(`${(i / 4) % 32},${Math.floor(i / 4 / 32)}`);
  expect(changed.length).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  const restored = await canvas.evaluate(node => {
    const bitmap = node as HTMLCanvasElement;
    return Array.from(bitmap.getContext("2d")!.getImageData(0, 0, bitmap.width, bitmap.height).data);
  });
  expect(restored).toEqual(before);
});

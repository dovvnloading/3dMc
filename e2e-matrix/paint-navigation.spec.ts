import { expect, test } from "@playwright/test";

test("paint sheet navigation and brush controls work in non-Chromium engines", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("checkbox", { name: "Show pixel grid" }).check();
  const zoom = page.getByRole("status", { name: "Texture zoom level" });
  const original = await zoom.innerText();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Sheet is not visible");
  await page.mouse.move(rect.x + 70, rect.y + 70);
  await page.mouse.wheel(0, -270);
  await expect(zoom).not.toHaveText(original);
  await page.getByRole("button", { name: "Reset texture view" }).click();
  await canvas.focus();
  await page.keyboard.press("]");
  await expect(page.getByRole("slider", { name: "Brush size" })).toHaveValue("2");
  await page.getByRole("button", { name: "Round" }).click();
  await expect(page.locator(".sheet-pixel-grid")).toBeVisible();
  await page.mouse.move(rect.x + 70, rect.y + 70);
  await expect(page.locator(".sheet-brush-outline")).toBeVisible();
  await page.screenshot({ path: `test-results/matrix-${browserName}-paint-navigation.png`, fullPage: true });
  expect(errors).toEqual([]);
});

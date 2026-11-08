import { expect, test } from "@playwright/test";

test("compiled GitHub Pages subpath loads real editor JS, CSS and favicon", async ({ page, request }) => {
  const errors: string[] = [];
  const missing: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("127.0.0.1:4174"))
      missing.push(response.status() + " " + response.url());
  });

  await page.goto("/3dMc/");
  await expect(page.locator("#root .app-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
  await expect(page.locator("#boot-fallback")).toHaveCount(0);

  const moduleScript = page.locator('script[type="module"][src^="/3dMc/assets/"]');
  await expect(moduleScript).toHaveCount(1);
  const scriptSrc = await moduleScript.getAttribute("src");
  expect(scriptSrc).toMatch(/^\/3dMc\/assets\/.*\.js$/);
  const asset = await request.get(scriptSrc!);
  expect(asset.status()).toBe(200);

  const stylesheet = page.locator('link[rel="stylesheet"][href^="/3dMc/assets/"]');
  await expect(stylesheet).toHaveCount(1);
  const href = await stylesheet.getAttribute("href");
  expect((await request.get(href!)).status()).toBe(200);
  expect((await request.get("/3dMc/favicon.svg")).status()).toBe(200);

  await page.screenshot({ path: "test-results/pages/editor-production.png" });
  expect(missing).toEqual([]);
  expect(errors).toEqual([]);
});

test("compiled site remains interactive and downloads native source", async ({ page }) => {
  await page.goto("/3dMc/");
  const xSize = page.getByRole("textbox", { name: "X size" });
  await expect(xSize).toHaveValue("10");
  await xSize.fill("12");
  await xSize.press("Enter");
  await expect(xSize).toHaveValue("12");
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(xSize).toHaveValue("10");

  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.locator(".texture-pixel-wrap canvas")).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.locator(".viewport-canvas canvas")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.3dmc$/);
});

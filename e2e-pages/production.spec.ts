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


test("published creator flow can make a block, add a part and switch its painted surface", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/3dMc/");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await dialog.getByRole("button", { name: /Textured block/ }).click();
  await dialog.getByRole("textbox", { name: "New project name" }).fill("Published creator smoke");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name: "Main block" })).toBeVisible();

  await page.getByRole("button", { name: "Add primitive" }).click();
  await page.getByRole("menu", { name: "Choose a primitive" })
    .getByRole("menuitem", { name: /Narrow column/ }).click();
  await expect(page.getByRole("heading", { name: "Narrow column" })).toBeVisible();
  const material = page.getByRole("group", { name: "Element material" });
  await material.getByRole("button", { name: "Painted" }).click();
  await expect(material.getByRole("button", { name: "Painted" }))
    .toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: "test-results/pages/creator-workspace.png" });

  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  expect((await saved).suggestedFilename()).toBe("published-creator-smoke.3dmc");
  expect(errors).toEqual([]);
});


test("compiled site can preflight a user PNG and keep the current workspace on cancel", async ({ page }) => {
  await page.goto("/3dMc/");
  const input = page.locator('input[accept=".png,image/png"]');
  await expect(input).toBeAttached();
  // A PNG exported by the production app must be accepted by its import path.
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download texture PNG" }).click();
  const png = await downloaded;
  const path = await png.path();
  if (!path) throw new Error("PNG download is unavailable.");
  await input.setInputFiles(path);
  const dialog = page.getByRole("dialog", { name: "Replace the shared texture?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("32 × 32 pixels")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".asset-entry")).toContainText("lantern.png");
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
});


test("published paint tools erase and fill source RGBA pixels", async ({ page }) => {
  await page.goto("/3dMc/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const alpha = () => canvas.evaluate((node) =>
    (node as HTMLCanvasElement).getContext("2d")!.getImageData(1, 1, 1, 1).data[3]);
  await page.getByRole("button", { name: "Pixel eraser (E)" }).click();
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect.poll(alpha).toBe(0);
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect.poll(alpha).toBe(255);
  await page.getByRole("button", { name: "Fill connected area (G)" }).click();
  await page.getByRole("button", { name: "Choose color #f5d184" }).click();
  await canvas.click({ position: { x: 8, y: 8 } });
  const red = () => canvas.evaluate((node) =>
    (node as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[0]);
  await expect.poll(red).toBe(245);
});

import { expect, test } from "@playwright/test";

test("model dimensions, undo/redo, paint, and portable project reopening", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Lantern body" })).toBeVisible();
  await expect(page.locator(".viewport-canvas canvas")).toBeVisible();

  const width = page.getByRole("textbox", { name: "X size" });
  await expect(width).toHaveValue("10");
  await width.fill("12");
  await width.press("Enter");
  await expect(width).toHaveValue("12");

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(width).toHaveValue("10");
  await page.getByRole("button", { name: /Redo \(Ctrl/ }).click();
  await expect(width).toHaveValue("12");

  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  const texel = () => canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("2d");
    if (!context) throw new Error("No texture canvas context");
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  const before = await texel();
  await canvas.click({ position: { x: 4, y: 4 } });
  await expect.poll(texel).not.toEqual(before);

  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect.poll(texel).toEqual(before);

  await page.getByRole("tab", { name: "Model" }).click();
  await page.screenshot({ path: "test-results/editor-workspace.png" });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.3dmc\.json$/);
  const path = await download.path();
  if (!path) throw new Error("Download was not saved in the browser test");
  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(page.getByRole("dialog", { name: "Open this project?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");

  expect(errors).toEqual([]);
});

test("invalid numeric input does not corrupt the document", async ({ page }) => {
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("-99");
  await width.press("Enter");
  await expect(width).toHaveValue("10");
  await expect(page.getByRole("button", { name: /Undo \(Ctrl/ })).toBeDisabled();
});

test("opening a project commits a fresh local checkpoint before the next reload", async ({ page }) => {
  await page.goto("/");
  const projectName = page.getByRole("textbox", { name: "Project name" });
  await projectName.fill("Recovery import proof");
  await projectName.press("Enter");
  await expect(projectName).toHaveValue("Recovery import proof");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Project download missing");

  await page.locator('input[type="file"]').setInputFiles(path);
  await page.getByRole("dialog").getByRole("button", { name: "Open project" }).click();
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Continue a local session?")).toBeVisible();
  await expect(page.getByText(/Recovery import proof/).first()).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("symmetry controls, pencil mirrors, undo/redo and native save/reopen work in Paint", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  const pixels = () => canvas.evaluate(node =>
    Array.from((node as HTMLCanvasElement).getContext("2d")!
      .getImageData(0, 0, 32, 32).data));
  const at = (data: number[], x: number, y: number) => data.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
  const position = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Texture sheet missing");
    return { x: box.x + (x + .5) * box.width / 32, y: box.y + (y + .5) * box.height / 32 };
  };

  await expect(page.locator(".paint-symmetry-heading .symmetry-off")).toHaveText("OFF");
  await canvas.focus();
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Mirror X symmetry" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sheet-symmetry-guides line")).toHaveCount(1);
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Mirror Y symmetry" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("m");
  await expect(page.getByRole("button", { name: "Both axes symmetry" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sheet-symmetry-guides line")).toHaveCount(2);
  await page.getByRole("button", { name: "Mirror X symmetry" }).click();
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  const before = await pixels();
  const p = await position(3, 4);
  await page.mouse.click(p.x, p.y);
  await expect.poll(async () => at(await pixels(), 28, 4)).toEqual([199, 109, 104, 255]);
  expect(at(await pixels(), 3, 4)).toEqual([199, 109, 104, 255]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  expect(await pixels()).toEqual(before);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  await expect.poll(async () => at(await pixels(), 28, 4)).toEqual([199, 109, 104, 255]);

  const downloadStarted = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project" }).click();
  const download = await downloadStarted;
  const path = await download.path();
  if (!path) throw new Error("No portable native backup");
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]').setInputFiles(path);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect.poll(async () => at(await pixels(), 28, 4)).toEqual([199, 109, 104, 255]);
  expect(errors).toEqual([]);
});

test("live filled rectangle and ellipse previews honor modifiers and Escape", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  const canvas = page.locator(".texture-pixel-wrap canvas");
  const pix = async (x: number, y: number) => canvas.evaluate((node, point) => {
    const bitmap = node as HTMLCanvasElement;
    return Array.from(bitmap.getContext("2d")!.getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
  const position = async (x: number, y: number) => {
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Texture sheet missing");
    return { x: box.x + (x + .5) * box.width / 32, y: box.y + (y + .5) * box.height / 32 };
  };
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  await page.getByRole("checkbox", { name: "Fill rectangle and ellipse" }).check();
  await canvas.focus();
  await page.keyboard.press("u");
  await expect(page.getByRole("button", { name: "Rectangle filled (U)" })).toHaveAttribute("aria-pressed", "true");
  const from = await position(6, 6), to = await position(10, 9);
  const previous = await pix(8, 8);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await expect.poll(() => pix(8, 8)).toEqual([199, 109, 104, 255]);
  await page.keyboard.press("Escape");
  await expect.poll(() => pix(8, 8)).toEqual(previous);
  await page.mouse.up();
  await expect.poll(() => pix(8, 8)).toEqual(previous);

  await page.keyboard.press("o");
  await expect(page.getByRole("button", { name: "Ellipse filled (O)" })).toHaveAttribute("aria-pressed", "true");
  const center = await position(16, 15), edge = await position(19, 17);
  const untouched = await pix(14, 13);
  await page.mouse.move(center.x, center.y);
  await page.keyboard.down("Shift");
  await page.keyboard.down("Alt");
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 5 });
  await expect.poll(() => pix(16, 15)).toEqual([199, 109, 104, 255]);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await page.keyboard.up("Shift");
  await expect.poll(() => pix(14, 13)).toEqual([199, 109, 104, 255]);
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" }).click();
  await expect.poll(() => pix(14, 13)).toEqual(untouched);
  await page.getByRole("button", { name: "Redo (Ctrl/Cmd+Shift+Z)" }).click();
  await expect.poll(() => pix(14, 13)).toEqual([199, 109, 104, 255]);

  await page.getByRole("button", { name: "Workspace guide and layouts" }).click();
  await expect(page.getByText("L / U / O")).toBeVisible();
  await expect(page.getByText("M", { exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
});

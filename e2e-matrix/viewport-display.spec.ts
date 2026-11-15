import { expect, test } from "@playwright/test";
import { OrthographicCamera, Vector3 } from "three";
import type { Page } from "@playwright/test";

test.use(process.env.CI ? { headless: false } : {});

type CameraSnapshot = {
  projection: string;
  direction: number[];
  target: number[];
  halfHeight: number;
};
const canvasOf = (page: Page) => page.locator(".viewport-canvas canvas").first();

async function cameraSnapshot(page: Page): Promise<CameraSnapshot> {
  return canvasOf(page).evaluate(node => {
    const data = (node as HTMLCanvasElement).dataset;
    return {
      projection: data.cameraProjection ?? "",
      direction: JSON.parse(data.cameraDirection ?? "[]") as number[],
      target: JSON.parse(data.cameraTarget ?? "[]") as number[],
      halfHeight: Number(data.cameraHalfHeight)
    };
  });
}

test("projection can switch via button, keypad and palette without changing the orbit or apparent size", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const canvas = canvasOf(page);
  await expect(canvas).toHaveAttribute("data-camera-projection", "perspective");
  const button = page.getByRole("button", { name: "Toggle orthographic projection (Numpad 5)" });
  const box = await canvas.boundingBox(); if (!box) throw new Error("Missing viewport canvas");
  // Orbit in empty space first. The toggle must preserve a user-created direction.
  await page.mouse.move(box.x + box.width * .79, box.y + box.height * .48);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .79 + 85, box.y + box.height * .48 + 33, { steps: 5 });
  await page.mouse.up();
  // Damping progresses per rendered frame, not wall time. On software WebGL
  // browsers a fixed sleep can capture a moving camera and give false failures.
  let previous = await cameraSnapshot(page);
  await expect.poll(async () => {
    await page.waitForTimeout(90);
    const current = await cameraSnapshot(page);
    const movement = Math.hypot(...current.direction.map((value, index) =>
      value - previous.direction[index]!));
    previous = current;
    return movement;
  }, { timeout: 10000 }).toBeLessThan(0.00005);
  const before = await cameraSnapshot(page);
  await button.click();
  await expect(canvas).toHaveAttribute("data-camera-projection", "orthographic");
  const ortho = await cameraSnapshot(page);
  for (let index = 0; index < 3; index++) {
    expect(ortho.direction[index]).toBeCloseTo(before.direction[index]!, 3);
    expect(ortho.target[index]).toBeCloseTo(before.target[index]!, 3);
  }
  expect(ortho.halfHeight / before.halfHeight).toBeCloseTo(1, 3);
  await page.keyboard.press("Numpad5");
  await expect(canvas).toHaveAttribute("data-camera-projection", "perspective");
  const roundtrip = await cameraSnapshot(page);
  expect(roundtrip.halfHeight / before.halfHeight).toBeCloseTo(1, 3);
  await page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search commands" }).fill("projection");
  const command = palette.getByRole("option", { name: /View: Orthographic projection/ });
  await expect(command).toContainText("Numpad5");
  await command.click();
  await expect(canvas).toHaveAttribute("data-camera-projection", "orthographic");

  await page.getByRole("button", { name: "Keyboard shortcuts (?)" }).click();
  const reference = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  for (const shortcut of ["Numpad5", "Shift+1", "Shift+2", "Shift+3"])
    await expect(reference).toContainText(shortcut);
  await page.keyboard.press("Escape");

  // Exercise orthographic zoom, orbit and pan on the real rendered canvas.
  const beforeZoom = await cameraSnapshot(page);
  const center = { x: box.x + box.width * .7, y: box.y + box.height * .5 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, -220);
  await expect.poll(async () => (await cameraSnapshot(page)).halfHeight)
    .toBeLessThan(beforeZoom.halfHeight);
  const beforeOrbit = await cameraSnapshot(page);
  await page.mouse.down();
  await page.mouse.move(center.x + 75, center.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => {
    const next = await cameraSnapshot(page);
    return Math.hypot(...next.direction.map((value, axis) =>
      value - beforeOrbit.direction[axis]!));
  }).toBeGreaterThan(0.01);
  const beforePan = await cameraSnapshot(page);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(center.x + 130, center.y + 70, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect.poll(async () => {
    const next = await cameraSnapshot(page);
    return Math.hypot(...next.target.map((value, axis) =>
      value - beforePan.target[axis]!));
  }).toBeGreaterThan(0.005);
  expect(errors).toEqual([]);
});

test("display settings persist across modes; frames, picks, gizmos and model painting remain available", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const canvas = canvasOf(page);
  await page.getByRole("button", { name: "Toggle orthographic projection (Numpad 5)" }).click();
  await expect(canvas).toHaveAttribute("data-camera-projection", "orthographic");
  await page.getByRole("button", { name: "Toggle grid (Shift+1)" }).click();
  await page.keyboard.press("Shift+2");
  await page.getByRole("button", { name: "Toggle selection outlines (Shift+3)" }).click();
  for (const axis of ["X", "Y", "Z"])
    await expect(page.getByLabel(axis + " axis")).toBeVisible();
  const grid = page.getByRole("button", { name: "Toggle grid (Shift+1)" });
  const axes = page.getByRole("button", { name: "Toggle axes (Shift+2)" });
  const outline = page.getByRole("button", { name: "Toggle selection outlines (Shift+3)" });
  const verify = async () => {
    await expect(grid).toHaveAttribute("aria-pressed", "false");
    await expect(axes).toHaveAttribute("aria-pressed", "true");
    await expect(outline).toHaveAttribute("aria-pressed", "false");
    await expect(canvas).toHaveAttribute("data-camera-projection", "orthographic");
  };
  await verify();
  await page.getByRole("tab", { name: "Paint" }).click();
  await verify();
  await page.getByRole("tab", { name: "Preview" }).click();
  await verify();
  await page.getByRole("tab", { name: "Model" }).click();
  await verify();

  await page.getByRole("button", { name: "View front" }).click();
  await expect(canvas).toHaveAttribute("data-camera-projection", "orthographic");
  await page.getByRole("button", { name: "View iso" }).click();
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "View iso" })).not.toHaveClass(/current/);
  await page.waitForTimeout(550);
  const framed = await cameraSnapshot(page);
  expect(framed.halfHeight).toBeGreaterThan(0);

  // A real right-click on the rendered geometry must still hit an element.
  await page.getByRole("button", { name: "View iso" }).click();
  const box = await canvas.boundingBox(); if (!box) throw new Error("Missing viewport bounds");
  await canvas.click({ button: "right", position: { x: box.width / 2, y: box.height / 2 } });
  const menu = page.getByRole("menu", { name: "Element context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Frame selection" })).toBeEnabled();
  await menu.press("Escape");

  // Multi-part gizmo belongs to the active R3F camera after the swap.
  const foundation = page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option").filter({ hasText: "Foundation" });
  const body = page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option").filter({ hasText: "Lantern body" });
  await body.click();
  await foundation.click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "Move (W)" }).click();
  await expect(canvas).toHaveAttribute("data-selection-transform-ready", "move");
  // Project an axis handle from the camera that is *actually* rendering.
  const info = await cameraSnapshot(page);
  const half = info.halfHeight;
  const camera = new OrthographicCamera(-half * box.width / box.height,
    half * box.width / box.height, half, -half, 0.00001, 100);
  camera.position.copy(new Vector3(...info.target)).addScaledVector(new Vector3(...info.direction), half * 6);
  camera.lookAt(new Vector3(...info.target));
  camera.updateMatrixWorld(true);
  let acquired = false;
  for (const distance of [0.45, 0.55, 0.35, 0.65, 0.25, 0.75]) {
    const projected = new Vector3(distance, 6.5 / 16, 0).project(camera);
    const x = box.x + (projected.x + 1) * box.width / 2;
    const y = box.y + (1 - projected.y) * box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    if (await canvas.getAttribute("data-selection-transform") === "active") {
      acquired = true;
      await page.mouse.move(x + 45, y + 15, { steps: 5 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      break;
    }
    await page.mouse.up();
  }
  expect(acquired).toBe(true);
  // Front view's central ray lands on the textured body, not the solid canopy.
  await page.getByRole("button", { name: "View front" }).click();
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Pixel pencil (B)" }).click();
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)" })).toBeEnabled();
  expect(errors).toEqual([]);
});

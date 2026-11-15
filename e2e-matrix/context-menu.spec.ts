import { expect, test } from "@playwright/test";

test.use(process.env.CI ? { headless: false } : {});

test("outliner context menu supports keyboard navigation, focus restoration and registry actions", async ({ page }) => {
  await page.goto("/");
  const scene = page.getByRole("listbox", { name: "Scene elements" });
  await expect(scene.getByRole("option")).toHaveCount(7);
  const row = scene.getByRole("option").filter({ hasText: "Foundation" });
  await row.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Element context menu" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Group" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await menu.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
  await menu.press("Home");
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await menu.press("End");
  await expect(menu.getByRole("menuitem", { name: "Frame selection" })).toBeFocused();
  await menu.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(row).toBeFocused();

  await row.press("Shift+F10");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Hide" }).click();
  await expect(row).toHaveClass(/hidden-row/);
  await row.press("Shift+F10");
  await menu.getByRole("menuitem", { name: "Show" }).click();
  await expect(row).not.toHaveClass(/hidden-row/);
  await row.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(scene.getByRole("option")).toHaveCount(8);
});

test("viewport opens empty-space view presets, ignores right drags, and targets the hit element", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const canvas = page.locator(".viewport-canvas canvas").first();
  await expect(canvas).toBeVisible();
  await canvas.click({ button: "right", position: { x: 10, y: 10 } });
  const empty = page.getByRole("menu", { name: "Viewport context menu" });
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("menuitem", { name: "Frame all" })).toBeEnabled();
  await expect(empty.getByRole("menuitem", { name: "Top" })).toBeEnabled();
  await empty.press("Escape");
  await expect(canvas).toBeFocused();

  const box = await canvas.boundingBox();
  if (!box) throw new Error("Missing canvas bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 20, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset camera" }).click();
  await page.getByRole("listbox", { name: "Scene elements" })
    .getByRole("option").filter({ hasText: "Foundation" }).click();
  await canvas.click({ button: "right", position: { x: box.width / 2, y: box.height / 2 } });
  const element = page.getByRole("menu", { name: "Element context menu" });
  await expect(element).toBeVisible();
  await expect(element.getByRole("menuitem", { name: "Rename" })).toBeEnabled();
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")
    .filter({ hasText: "Lantern body" })).toHaveAttribute("aria-selected", "true");
  await element.getByRole("menuitem", { name: "Frame selection" }).click();
  await expect(element).toHaveCount(0);
});

test("multi-selection context actions apply atomically and group rows can ungroup", async ({ page }) => {
  await page.goto("/");
  const scene = page.getByRole("listbox", { name: "Scene elements" });
  await expect(scene.getByRole("option")).toHaveCount(7);
  const body = scene.getByRole("option").filter({ hasText: "Lantern body" });
  const base = scene.getByRole("option").filter({ hasText: "Foundation" });
  await base.click({ modifiers: ["Control"] });
  await expect(body).toHaveAttribute("aria-selected", "true");
  await expect(base).toHaveAttribute("aria-selected", "true");

  await base.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Element context menu" });
  await expect(menu.getByRole("menuitem", { name: "Group" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Hide" }).click();
  await expect(body).toHaveClass(/hidden-row/);
  await expect(base).toHaveClass(/hidden-row/);
  await base.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Show" }).click();
  await expect(body).not.toHaveClass(/hidden-row/);
  await expect(base).not.toHaveClass(/hidden-row/);

  await base.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Group" }).click();
  const group = scene.getByRole("group", { name: /Group Group 1/ });
  await expect(group).toBeVisible();
  await group.click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Ungroup" })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Ungroup" }).click();
  await expect(group).toHaveCount(0);
});

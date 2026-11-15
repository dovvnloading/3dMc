import { expect, test } from "@playwright/test";

test("shortcut reference opens by ?, toolbar and palette, traps focus and restores the opener", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const help = page.getByRole("button", { name: "Keyboard shortcuts (?)" });
  await help.focus();
  await page.keyboard.press("Shift+/");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  const close = dialog.getByRole("button", { name: "Close keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  for (const heading of ["Project", "Edit", "Model tools", "Paint tools", "View"]) {
    await expect(dialog.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(dialog).toContainText("Frame selection");
  await expect(dialog).toContainText("Ctrl/Cmd+Y");
  await expect(dialog).toContainText("Decrease brush size");
  await close.press("Tab");
  const region = dialog.getByRole("region", { name: "Shortcuts by area" });
  await expect(region).toBeFocused();
  await region.press("Tab");
  await expect(close).toBeFocused(); // Focus wraps from the last tabbable element.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(help).toBeFocused();

  await help.click();
  await expect(dialog).toBeVisible();
  await close.click();
  await expect(help).toBeFocused();

  const opener = page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" });
  await opener.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const search = palette.getByRole("combobox", { name: "Search commands" });
  await search.fill("Keyboard shortcuts");
  await search.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("typing in fields does not invoke tools, palette, help or frame; F frames rather than setting iso", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const sceneSearch = page.getByRole("textbox", { name: "Filter scene elements" });
  await sceneSearch.focus();
  await sceneSearch.press("w");
  await sceneSearch.press("f");
  await sceneSearch.press("Shift+/");
  await sceneSearch.press("Control+k");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select (V)" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "View iso" })).toHaveClass(/current/);
  await sceneSearch.fill("");

  const top = page.getByRole("button", { name: "View top" });
  await top.click();
  await expect(top).toHaveClass(/current/);
  await top.blur();
  await page.keyboard.press("f");
  await expect(top).not.toHaveClass(/current/); // frame is not a view preset
  await page.getByRole("button", { name: "View iso" }).click();
  await expect(page.getByRole("button", { name: "View iso" })).toHaveClass(/current/);

  const opener = page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" });
  await opener.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const search = palette.getByRole("combobox", { name: "Search commands" });
  await search.fill("Frame selection");
  await search.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View iso" })).not.toHaveClass(/current/);
});

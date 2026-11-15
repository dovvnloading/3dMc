import { expect, test } from "@playwright/test";

test("command palette opens from keyboard and toolbar, runs ranked commands and restores focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const opener = page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" });
  await opener.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  const search = dialog.getByRole("combobox", { name: "Search commands" });
  await expect(dialog).toBeVisible();
  await expect(search).toBeFocused();
  await search.fill("tool pencil");
  const pencil = dialog.getByRole("option", { name: /Tool: Pencil/ });
  await expect(pencil).toBeDisabled();
  await expect(pencil).toContainText("Switch to Paint mode");
  await search.press("Enter");
  await expect(dialog).toBeVisible(); // Disabled commands never execute or dismiss.
  await search.fill("switch to");
  const first = await search.getAttribute("aria-activedescendant");
  await search.press("ArrowDown");
  expect(await search.getAttribute("aria-activedescendant")).not.toBe(first);
  await search.press("ArrowUp");
  expect(await search.getAttribute("aria-activedescendant")).toBe(first);
  await search.fill("Switch to Paint mode");
  await search.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Paint" })).toHaveAttribute("aria-selected", "true");
  await expect(opener).toBeFocused();

  await opener.click();
  await expect(search).toBeFocused();
  await search.fill("Tool: Eraser");
  await search.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pixel eraser (E)" })).toHaveClass(/active/);
});

test("palette traps focus, scopes edit shortcuts and restores the toolbar opener", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  const sceneSearch = page.getByRole("textbox", { name: "Filter scene elements" });
  const opener = page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" });
  await sceneSearch.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
  await opener.focus();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  const input = dialog.getByRole("combobox", { name: "Search commands" });
  const close = dialog.getByRole("button", { name: "Close command palette" });
  await expect(input).toBeFocused();
  await input.press("Shift+Tab");
  await expect(close).toBeFocused();
  await close.press("Tab");
  await expect(input).toBeFocused();
  await input.fill("");
  await page.keyboard.press("w");
  await expect(page.getByRole("button", { name: "Select (V)" })).toHaveClass(/active/);
  await page.keyboard.press("Control+d");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await input.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "New project" }).click();
  const newDialog = page.getByRole("dialog", { name: "Create a new project" });
  await expect(newDialog).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(newDialog).toHaveCount(0);
});

test("palette invokes real shape and creator-dialog handlers", async ({ page }) => {
  await page.goto("/");
  const paletteButton = page.getByRole("button", { name: "Command palette (Ctrl/Cmd+K)" });
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await paletteButton.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const search = palette.getByRole("combobox", { name: "Search commands" });
  await search.fill("Add shape: Half slab");
  await search.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(8);

  await paletteButton.click();
  await search.fill("Open project library");
  await search.press("Enter");
  await expect(palette).toHaveCount(0);
  const library = page.getByRole("dialog", { name: "Local project library" });
  await expect(library).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(library).toHaveCount(0);

  await paletteButton.click();
  await search.fill("Undo");
  await expect(palette.getByRole("option", { name: /^Undo/ })).toBeEnabled();
  await search.press("Enter");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
});

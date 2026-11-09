import { expect, test } from "@playwright/test";

test("compiled Pages editor preserves atomic multi-selection editing", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/3dMc/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  const rows = page.getByRole("listbox", { name: "Scene elements" }).getByRole("option");
  await rows.filter({ has: page.getByText("Lantern body", { exact: true }) }).click();
  await rows.filter({ has: page.getByText("Foundation", { exact: true }) }).click({ modifiers: ["Control"] });
  await expect(page.getByRole("heading", { name: "2 parts selected" })).toBeVisible();
  const position = page.getByRole("textbox", { name: "Selection X position", exact: true });
  await position.fill("4"); await position.press("Enter");
  await expect(position).toHaveValue("4");
  await page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true }).click();
  await expect(position).toHaveValue("2");
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Duplicate selection", exact: true }).click();
  await expect(rows).toHaveCount(9);
  await page.getByRole("button", { name: "Delete selection", exact: true }).click();
  await expect(rows).toHaveCount(7);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/pages/selection-workflow.png", fullPage: true });
});

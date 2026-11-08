import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("core workspace and staged pixel work remain operable outside Chromium", async ({ page, browserName }) => {
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Paint" }).click();
  await page.getByRole("button", { name: "Pixel region" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit pixel region" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Clear region" }).click();
  await dialog.getByRole("button", { name: "Cancel preview" }).click();
  await expect(page.getByRole("button", { name: "Undo (Ctrl/Cmd+Z)", exact: true })).toBeDisabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("The browser did not provide a readable source download.");
  const source = JSON.parse(await readFile(path, "utf8"));
  expect(source.cuboids).toHaveLength(7);
  expect(source.textures[0].pixels).toHaveLength(source.textures[0].width * source.textures[0].height * 4);
  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("dialog", { name: "Local project library" })).toBeVisible();
  await page.screenshot({ path: `test-results/matrix-${browserName}-editor.png`, fullPage: true });
});

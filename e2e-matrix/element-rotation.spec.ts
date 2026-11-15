import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Real WebGL and a non-headless Xvfb context match the existing matrix visual QA.
test.use(process.env.CI ? { headless: false } : {});

test("Firefox/WebKit inspector rotation, canvas handle and source reopen stay editable", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("listbox", { name: "Scene elements" }).getByRole("option")).toHaveCount(7);
  await page.screenshot({ path: `test-results/evidence/element-rotation-${browserName}-before.png`, fullPage: true });
  const angle = page.getByRole("combobox", { name: "Element rotation angle" });
  const pivot = page.getByRole("textbox", { name: "Pivot X" });
  await angle.selectOption("-45");
  await pivot.fill("-3.5"); await pivot.press("Enter");
  await expect(angle).toHaveValue("-45");
  await expect(pivot).toHaveValue("-3.5");
  await page.getByRole("button", { name: /Rotate \(E\)/ }).click();
  await expect(page.locator(".rotation-handle-label")).toContainText("Y · -45°");
  await page.screenshot({ path: `test-results/evidence/element-rotation-${browserName}-handle-inspector.png`, fullPage: true });
  const [saved] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project", exact: true }).click()
  ]);
  const file = await saved.path(); if (!file) throw new Error("Missing .3dmc download");
  await angle.selectOption("22.5");
  await page.locator('input[type="file"][accept*=".3dmc"]').setInputFiles(file);
  await page.getByRole("dialog", { name: "Open this project?" })
    .getByRole("button", { name: "Open project", exact: true }).click();
  await expect(angle).toHaveValue("-45");
  await expect(pivot).toHaveValue("-3.5");
  const [backup] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const path = await backup.path(); if (!path) throw new Error("Missing JSON backup");
  const doc = JSON.parse(await readFile(path, "utf8"));
  expect(doc.cuboids[0].rotation).toEqual({ axis: "y", angle: -45, origin: [-3.5, 7.5, 8], rescale: false });
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/evidence/element-rotation-${browserName}-inspector.png`, fullPage: true });
});

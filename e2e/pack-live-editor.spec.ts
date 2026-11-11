import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import type { Page } from "@playwright/test";

async function twoModels(page: Page) {
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await studio.getByRole("button", { name: "Close" }).click();
  return page.getByRole("combobox", { name: "Active pack model" });
}

test("edits either live model, undoes changes and reopens a complete pack", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  const second = await selector.inputValue();
  await selector.selectOption("model-0");
  const field = page.getByRole("textbox", { name: "X position" });
  await field.fill("5"); await field.press("Enter");
  await selector.selectOption(second);
  await expect(field).toHaveValue("3");
  await field.fill("7"); await field.press("Enter");
  await page.getByRole("button", { name: /Undo \(Ctrl/ }).click();
  await expect(field).toHaveValue("3");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("5");
  const [download] = await Promise.all([
    page.waitForEvent("download"), page.getByRole("button", { name: "Save project" }).click()
  ]);
  const path = await download.path(); if (!path) throw new Error("Pack backup missing");
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const manifest = JSON.parse(strFromU8(archive["manifest.json"]!));
  expect(manifest.containerVersion).toBe(3);
  expect(manifest.sources).toHaveLength(2);
  expect(JSON.parse(strFromU8(archive[manifest.sources[0].document]!)).cuboids[0].from[0]).toBe(5);
  expect(JSON.parse(strFromU8(archive[manifest.sources[1].document]!)).cuboids[0].from[0]).toBe(3);
  await page.locator('input[type="file"][accept*=".3dmc"]').first().setInputFiles(path);
  await page.getByRole("dialog", { name: "Open source pack?" })
    .getByRole("button", { name: "Open source pack" }).click();
  await selector.selectOption(second);
  await expect(field).toHaveValue("3");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("5");
});

test("pack-wide local recovery restores both models and selected source after reload", async ({ page }) => {
  await page.goto("/");
  const selector = await twoModels(page);
  const second = await selector.inputValue();
  const field = page.getByRole("textbox", { name: "X position" });
  await field.fill("6"); await field.press("Enter");
  await expect(page.getByText("Saved on this device")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Another tab controls local recovery" })).toBeVisible();
  await page.getByRole("button", { name: "Take over editing" }).click();
  await expect(page.getByRole("dialog", { name: "Continue a local session?" })).toContainText("2 models");
  await page.getByRole("button", { name: "Recover project" }).click();
  await expect(selector).toHaveValue(second);
  await expect(field).toHaveValue("6");
  await selector.selectOption("model-0");
  await expect(field).toHaveValue("3");
});

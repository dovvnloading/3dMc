import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { EditorDocument } from "../src/editor/domain";

test("The Aetherheart opens as a complete, editable showcase and exports portable source", async ({ page, browserName }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".boot-loader")).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();

  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  const featured = dialog.getByRole("button", { name: /The Aetherheart/ });
  await expect(featured).toBeVisible();
  await featured.click();
  await expect(featured).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("region", { name: "Showcase contents" })).toContainText("236");
  await expect(dialog.getByRole("textbox", { name: "New project name" }))
    .toHaveValue("The Aetherheart · Celestial Relay");
  await dialog.getByRole("button", { name: "Create project" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
  const graphicsFallback = page.getByRole("status", { name: "3D preview unavailable" });
  if (await graphicsFallback.count()) await expect(graphicsFallback).toBeVisible();
  else await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/aetherheart-" + browserName + ".png" });
  const scene = page.getByRole("listbox", { name: "Scene elements" });
  await expect(scene.getByRole("option")).toHaveCount(236);

  await page.getByRole("tab", { name: "Model" }).click();
  await scene.getByRole("option").first().click();
  await expect(page.getByRole("heading", { name: "Floating basalt footing" })).toBeVisible();
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.locator(".texture-pixel-wrap canvas")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download legacy JSON backup" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Aetherheart source download missing");
  const source = JSON.parse(await readFile(path, "utf8")) as EditorDocument;
  expect(source.cuboids).toHaveLength(236);
  expect(source.groups).toHaveLength(9);
  expect(source.textures).toHaveLength(10);
  expect(source.textures.some(texture => texture.layers?.length === 2)).toBe(true);
  expect(errors).toEqual([]);
});

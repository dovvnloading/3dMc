import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

test("Pack Studio builds, saves, reopens and exports a two-model source pack without changing the editor", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const original = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const originalPath = await original[0].path();
  if (!originalPath) throw new Error("Could not download source project.");
  const sourceBytes = await readFile(originalPath, "utf8");

  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await expect(studio).toBeVisible();
  await expect(studio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option"))
    .toHaveCount(1);
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  const models = studio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option");
  await expect(models).toHaveCount(2);
  await expect(models.last()).toHaveAttribute("aria-selected", "true");
  await expect(studio.getByText("minecraft:iron_block", { exact: false }).first()).toBeVisible();

  const [archive] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Save pack .3dmc" }).click()
  ]);
  expect(archive.suggestedFilename()).toBe("copper-lantern.3dmc");
  const archivePath = await archive.path();
  if (!archivePath) throw new Error("Pack source download missing.");
  const contents = unzipSync(new Uint8Array(await readFile(archivePath)));
  expect(Object.keys(contents).filter(path => path.endsWith("/document.json"))).toHaveLength(2);
  const manifest = JSON.parse(strFromU8(contents["manifest.json"]!));
  expect(manifest.containerVersion).toBe(3);
  expect(manifest.sources).toHaveLength(2);

  const [gameZip] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  expect(gameZip.suggestedFilename()).toBe("copper-lantern-java-1.21.4-experimental.zip");
  const gamePath = await gameZip.path();
  if (!gamePath) throw new Error("Minecraft ZIP download missing.");
  const packFiles = unzipSync(new Uint8Array(await readFile(gamePath)));
  expect(packFiles["assets/minecraft/blockstates/diamond_block.json"]).toBeDefined();
  expect(packFiles["assets/minecraft/blockstates/iron_block.json"]).toBeDefined();

  await studio.getByRole("button", { name: "Close" }).click();
  await expect(studio).toHaveCount(0);
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const reopenedStudio = page.getByRole("dialog", { name: "Pack Studio" });
  await expect(reopenedStudio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option"))
    .toHaveCount(2); // The pack session remains active after closing the manager.
  await reopenedStudio.locator('input[type="file"][accept*=".3dmc"]').first().setInputFiles(archivePath);
  await expect(reopenedStudio.getByRole("group", { name: "Confirm source pack replacement" })).toBeVisible();
  await reopenedStudio.getByRole("button", { name: "Load selected pack" }).click();
  await expect(reopenedStudio).toHaveCount(0);
  await page.getByRole("combobox", { name: "Active pack model" }).selectOption("model-0");

  const [after] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download legacy JSON backup" }).click()
  ]);
  const afterPath = await after.path();
  if (!afterPath) throw new Error("Editor backup missing.");
  expect(await readFile(afterPath, "utf8")).toBe(sourceBytes);
  expect(errors).toEqual([]);
});

test("Pack Studio reports replacement conflicts and guards unsaved pack work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  const models = studio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option");
  await expect(models).toHaveCount(2);
  await studio.getByRole("combobox", { name: "Pack replacement target" }).selectOption("diamond_block");
  await expect(studio.getByText(/Duplicate blockstate replacements/)).toBeVisible();
  await expect(studio.getByRole("combobox", { name: "Pack replacement target" })).toHaveValue("iron_block");
  await studio.getByRole("button", { name: "Remove selected model" }).click();
  await expect(models).toHaveCount(1);
  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(models).toHaveCount(2);
  await studio.getByRole("button", { name: "Close" }).click();
  await expect(studio).toHaveCount(0);
  await page.getByRole("button", { name: "Pack Studio" }).click();
  await expect(page.getByRole("dialog", { name: "Pack Studio" })
    .getByRole("listbox", { name: "Pack model assets" }).getByRole("option")).toHaveCount(2);
});

test("Pack Studio is not offered for the unsupported Java 26.3 target", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Minecraft target version" }).selectOption("26.3");
  await expect(page.getByRole("button", { name: "Pack Studio" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Minecraft target version" }).selectOption("1.21.4");
  await expect(page.getByRole("button", { name: "Pack Studio" })).toBeEnabled();
});

test("pack and model resource names are editable, validated and retained through export", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });

  const packName = studio.getByRole("textbox", { name: "Pack name" });
  await packName.fill("Copper Creator Kit");
  await packName.press("Enter");
  await expect(packName).toHaveValue("Copper Creator Kit");

  const modelName = studio.getByRole("textbox", { name: "Model name" });
  await modelName.fill("Custom Lantern");
  await modelName.press("Enter");
  await expect(studio.getByRole("heading", { name: "Custom Lantern" })).toBeVisible();

  const namespace = studio.getByRole("textbox", { name: "Model resource namespace" });
  await namespace.fill("my_assets");
  await namespace.press("Enter");
  await expect(namespace).toHaveValue("my_assets");

  const modelPath = studio.getByRole("textbox", { name: "Model resource path" });
  await modelPath.fill("block/custom_lantern");
  await modelPath.press("Enter");
  await expect(modelPath).toHaveValue("block/custom_lantern");
  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(modelPath).toHaveValue("block/lantern");
  await studio.getByRole("button", { name: "Redo pack operation" }).click();
  await expect(modelPath).toHaveValue("block/custom_lantern");

  const texNamespace = studio.getByRole("textbox", { name: "Texture namespace lantern.png" });
  await texNamespace.fill("my_assets");
  await texNamespace.press("Enter");
  const texPath = studio.getByRole("textbox", { name: "Texture path lantern.png" });
  await texPath.fill("block/painted_lantern");
  await texPath.press("Enter");
  await expect(texPath).toHaveValue("block/painted_lantern");

  await namespace.fill("UpperCase");
  await namespace.press("Enter");
  await expect(studio.getByText(/invalid resource namespace/i)).toBeVisible();
  await expect(namespace).toHaveValue("my_assets");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Save pack .3dmc" }).click()
  ]);
  expect(download.suggestedFilename()).toBe("copper-creator-kit.3dmc");
  const path = await download.path();
  if (!path) throw new Error("Source pack download missing.");
  const files = unzipSync(new Uint8Array(await readFile(path)));
  const pack = JSON.parse(strFromU8(files["pack.json"]!));
  expect(pack.name).toBe("Copper Creator Kit");
  expect(pack.models[0].resource).toEqual({ namespace: "my_assets", path: "block/custom_lantern" });
  expect(pack.textures[0].resource).toEqual({ namespace: "my_assets", path: "block/painted_lantern" });

  const [exported] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  const output = await exported.path();
  if (!output) throw new Error("Java ZIP download missing.");
  const game = unzipSync(new Uint8Array(await readFile(output)));
  expect(game["assets/my_assets/models/block/custom_lantern.json"]).toBeDefined();
  expect(game["assets/my_assets/textures/block/painted_lantern.png"]).toBeDefined();
  expect(game["assets/minecraft/blockstates/diamond_block.json"]).toBeDefined();
});


test("asset search filters by model, replacement, and texture path without changing the pack", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  const items = studio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option");
  const search = studio.getByRole("searchbox", { name: "Search pack models" });

  await expect(studio.getByLabel("Texture dependencies lantern.png"))
    .toContainText("6 painted faces across 1 element");
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await expect(items).toHaveCount(2);

  const name = studio.getByRole("textbox", { name: "Model name" });
  await name.fill("Frost Window");
  await name.press("Enter");
  await search.fill("frost");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Frost Window");
  await expect(studio.getByRole("status")).toContainText("1 of 2 models match");

  await search.fill("minecraft:diamond_block");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Copper Lantern");
  await search.fill("IRON_BLOCK frost");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Frost Window");

  await search.fill("no-such-model");
  await expect(items).toHaveCount(0);
  await expect(studio.getByText(/No models match your search/)).toBeVisible();
  await expect(name).toHaveValue("Frost Window"); // Filtering never changes the active source.
  await studio.getByRole("button", { name: "Clear pack search" }).click();
  await expect(items).toHaveCount(2);

  await studio.getByRole("textbox", { name: "Texture path lantern.png" }).fill("block/frost_paint");
  await studio.getByRole("textbox", { name: "Texture path lantern.png" }).press("Enter");
  await search.fill("frost_paint");
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("Frost Window");
  await studio.getByRole("button", { name: "Edit selected model in 3D" }).click();
  await expect(studio).toHaveCount(0);
  const modelSelector = page.getByRole("combobox", { name: "Active pack model" });
  await expect(modelSelector).toContainText("Frost Window");
});

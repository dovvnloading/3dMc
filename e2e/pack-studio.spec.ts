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


test("Java item authoring exports a 1.21.4 item definition and persists display edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Add Java item" }).click();

  const target = studio.getByRole("combobox", { name: "Item replacement target" });
  await expect(target).toHaveValue("stick");
  await expect(studio.getByRole("group", { name: "Item display preview" })).toBeVisible();
  const modelPath = studio.getByRole("textbox", { name: "Item model path" });
  await modelPath.fill("item/custom_lantern");
  await modelPath.press("Enter");
  await expect(modelPath).toHaveValue("item/custom_lantern");

  const context = studio.getByRole("combobox", { name: "Item display context" });
  await expect(context).toHaveValue("gui");
  const guiAngle = studio.getByRole("spinbutton", { name: "Inventory / GUI rotation X" });
  await guiAngle.fill("60");
  await guiAngle.press("Enter");
  await expect(guiAngle).toHaveValue("60");
  await context.selectOption("firstperson_righthand");
  const handScale = studio.getByRole("spinbutton", { name: "First-person hand scale X" });
  await handScale.fill("0.85");
  await handScale.press("Enter");
  await expect(handScale).toHaveValue("0.85");
  await studio.getByRole("checkbox", { name: "Animate hand on item swap" }).uncheck();

  const [javaZip] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  const javaPath = await javaZip.path();
  if (!javaPath) throw new Error("Java item ZIP was not downloaded");
  const javaFiles = unzipSync(new Uint8Array(await readFile(javaPath)));
  const definition = JSON.parse(strFromU8(javaFiles["assets/minecraft/items/stick.json"]!));
  expect(definition).toEqual({
    model: { type: "minecraft:model", model: "3dmc:item/custom_lantern" },
    hand_animation_on_swap: false
  });
  const model = JSON.parse(strFromU8(javaFiles["assets/3dmc/models/item/custom_lantern.json"]!));
  expect(model.display.gui.rotation[0]).toBe(60);
  expect(model.display.firstperson_righthand.scale[0]).toBe(0.85);
  expect(model.textures.painted).toBe("3dmc:block/main");
  expect(javaFiles["assets/minecraft/blockstates/diamond_block.json"]).toBeDefined();
  expect(javaFiles["assets/3dmc/textures/block/main.png"]).toBeDefined();

  const [native] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Save pack .3dmc" }).click()
  ]);
  const nativePath = await native.path();
  if (!nativePath) throw new Error("Portable item source was not downloaded");
  const nativeFiles = unzipSync(new Uint8Array(await readFile(nativePath)));
  const sourcePack = JSON.parse(strFromU8(nativeFiles["pack.json"]!));
  expect(sourcePack.items).toHaveLength(1);
  expect(sourcePack.items[0].display.gui.rotation[0]).toBe(60);
  expect(sourcePack.items[0].handAnimationOnSwap).toBe(false);

  await studio.locator('input[type="file"][accept*=".3dmc"]').first().setInputFiles(nativePath);
  await expect(studio.getByRole("group", { name: "Confirm source pack replacement" })).toBeVisible();
  await studio.getByRole("button", { name: "Load selected pack" }).click();
  await expect(studio).toHaveCount(0);
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const reopened = page.getByRole("dialog", { name: "Pack Studio" });
  await expect(reopened.getByRole("combobox", { name: "Item replacement target" })).toHaveValue("stick");
  await expect(reopened.getByRole("textbox", { name: "Item model path" }))
    .toHaveValue("item/custom_lantern");
  await expect(reopened.getByRole("checkbox", { name: "Animate hand on item swap" })).not.toBeChecked();
  await expect(reopened.getByRole("spinbutton", { name: "Inventory / GUI rotation X" })).toHaveValue("60");
});

test("item targets and display settings are undoable without mutating source cuboids", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Add Java item" }).click();
  const path = studio.getByRole("combobox", { name: "Item replacement target" });
  await path.selectOption("paper");
  await expect(path).toHaveValue("paper");
  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(path).toHaveValue("stick");
  await studio.getByRole("button", { name: "Redo pack operation" }).click();
  await expect(path).toHaveValue("paper");
  await studio.getByRole("button", { name: "Add Java item" }).click();
  await expect(studio.getByRole("group", { name: "Item assets for selected model" })
    .getByRole("button")).toHaveCount(2);

  // Generated item raw models may not overwrite an existing block model.
  const itemModelPath = studio.getByRole("textbox", { name: "Item model path" });
  await itemModelPath.fill("block/lantern");
  await itemModelPath.press("Enter");
  await expect(studio.getByText(/Duplicate model paths/)).toBeVisible();
  await expect(itemModelPath).not.toHaveValue("block/lantern");

  await studio.getByRole("button", { name: "Remove Java item" }).click();
  await expect(studio.getByRole("group", { name: "Item assets for selected model" })
    .getByRole("button")).toHaveCount(1);
  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(studio.getByRole("group", { name: "Item assets for selected model" })
    .getByRole("button")).toHaveCount(2);
});


test("Java item settings import restores authored display values without replacing source geometry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Add Java item" }).click();

  const guiAngle = studio.getByRole("spinbutton", { name: "Inventory / GUI rotation X" });
  await guiAngle.fill("67");
  await guiAngle.press("Enter");
  const [firstDownload] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  const exported = await firstDownload.path();
  if (!exported) throw new Error("Item resource pack missing.");

  await guiAngle.fill("22");
  await guiAngle.press("Enter");
  await expect(guiAngle).toHaveValue("22");
  const [sourceBefore] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Save pack .3dmc" }).click()
  ]);
  const beforePath = await sourceBefore.path();
  if (!beforePath) throw new Error("Editable pack source backup missing.");
  const beforeFiles = unzipSync(new Uint8Array(await readFile(beforePath)));
  const sourceBytes = beforeFiles["models/0/document.json"]!;
  const textureBytes = beforeFiles["models/0/textures/main.png"]!;

  await studio.locator('input[type="file"][accept=".zip,application/zip"]')
    .setInputFiles(exported);
  await expect(studio.getByRole("group", { name: "Review imported item settings" })).toBeVisible();
  await expect(guiAngle).toHaveValue("22");
  await studio.getByRole("button", { name: "Apply imported item settings" }).click();
  await expect(guiAngle).toHaveValue("67");
  const [sourceAfter] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Save pack .3dmc" }).click()
  ]);
  const afterPath = await sourceAfter.path();
  if (!afterPath) throw new Error("Editable pack source backup missing after import.");
  const afterFiles = unzipSync(new Uint8Array(await readFile(afterPath)));
  expect(afterFiles["models/0/document.json"]).toEqual(sourceBytes);
  expect(afterFiles["models/0/textures/main.png"]).toEqual(textureBytes);

  const [recreated] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  const recreatedPath = await recreated.path();
  if (!recreatedPath) throw new Error("Re-export after item import failed.");
  expect(await readFile(recreatedPath)).toEqual(await readFile(exported));

  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(guiAngle).toHaveValue("22");
  await studio.getByRole("button", { name: "Redo pack operation" }).click();
  await expect(guiAngle).toHaveValue("67");

  await studio.locator('input[type="file"][accept=".zip,application/zip"]')
    .setInputFiles({ name: "unsupported.zip", mimeType: "application/zip",
      buffer: Buffer.from("not a zip") });
  await expect(studio.getByRole("group", { name: "Review imported item settings" }))
    .toHaveCount(0);
  await expect(guiAngle).toHaveValue("67");
});


test("Pack Studio can expand beyond two models with distinct property-free blocks", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  const models = studio.getByRole("listbox", { name: "Pack model assets" }).getByRole("option");
  const replacement = studio.getByRole("combobox", { name: "Pack replacement target" });
  await expect(models).toHaveCount(1);
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await expect(replacement).toHaveValue("iron_block");
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await expect(replacement).toHaveValue("gold_block");
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await expect(replacement).toHaveValue("emerald_block");
  await expect(models).toHaveCount(4);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    studio.getByRole("button", { name: "Export Java ZIP" }).click()
  ]);
  const path = await download.path();
  if (!path) throw new Error("Expanded resource pack missing");
  const files = unzipSync(new Uint8Array(await readFile(path)));
  for (const name of ["diamond_block", "iron_block", "gold_block", "emerald_block"])
    expect(files["assets/minecraft/blockstates/" + name + ".json"]).toBeDefined();
  expect(Object.keys(files).filter(name => name.includes("/blockstates/"))).toHaveLength(4);

  await studio.getByRole("button", { name: "Undo pack operation" }).click();
  await expect(models).toHaveCount(3);
  await studio.getByRole("button", { name: "Redo pack operation" }).click();
  await expect(models).toHaveCount(4);
});

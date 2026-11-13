import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const javaInput = 'header input[accept=".zip,application/zip"]';

test("two-model Java ZIP imports as an editable pack and survives a second export", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Duplicate model" }).click();
  await studio.getByRole("button", { name: "Add Java item" }).click();
  const gui = studio.getByRole("spinbutton", { name: "Inventory / GUI translation X" });
  await gui.fill("2.5"); await gui.press("Enter");
  await expect(gui).toHaveValue("2.5");

  const originalDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Export Java ZIP" }).click();
  const javaZip = await originalDownload;
  const sourcePath = await javaZip.path();
  if (!sourcePath) throw new Error("Java ZIP file was not saved.");
  const original = unzipSync(new Uint8Array(await readFile(sourcePath)));
  expect(Object.keys(original).filter(path => path.includes("/blockstates/"))).toHaveLength(2);
  expect(original["assets/minecraft/items/stick.json"]).toBeDefined();

  await studio.getByRole("button", { name: "Close", exact: true }).click();
  const selector = page.getByRole("combobox", { name: "Active pack model" });
  await expect(selector.locator("option")).toHaveCount(2);
  await page.locator(javaInput).setInputFiles(sourcePath);
  let preflight = page.getByRole("dialog", { name: "Import editable Java pack?" });
  await expect(preflight).toBeVisible();
  await expect(preflight).toContainText("2");
  await expect(preflight).toContainText("minecraft:iron_block");
  await expect(preflight).toContainText("minecraft:stick");
  await preflight.getByText(/Inspect ZIP resource files/).click();
  await expect(preflight.getByText("assets/minecraft/items/stick.json")).toBeVisible();

  // Preflight never replaced the current source, and cancelling cannot do so.
  await preflight.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(selector.locator("option")).toHaveCount(2);
  await page.locator(javaInput).setInputFiles(sourcePath);
  preflight = page.getByRole("dialog", { name: "Import editable Java pack?" });
  await preflight.getByRole("button", { name: "Import complete pack" }).click();
  await expect(preflight).toHaveCount(0);
  await expect(selector.locator("option")).toHaveCount(2);

  const secondModel = await selector.locator("option").last().getAttribute("value");
  if (!secondModel) throw new Error("Imported model selection was empty.");
  await selector.selectOption(secondModel);
  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "Pack Studio" });
  await expect(reopened.getByRole("combobox", { name: "Item replacement target" })).toHaveValue("stick");
  await expect(reopened.getByRole("spinbutton", { name: "Inventory / GUI translation X" })).toHaveValue("2.5");
  await reopened.getByRole("button", { name: "Close", exact: true }).click();

  const x = page.getByRole("textbox", { name: "X position", exact: true });
  await x.fill("6"); await x.press("Enter");
  const newDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  await exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click();
  const changedPath = await (await newDownload).path();
  if (!changedPath) throw new Error("Re-exported Java ZIP was not saved.");
  const changed = unzipSync(new Uint8Array(await readFile(changedPath)));
  expect(Object.keys(changed).sort()).toEqual(Object.keys(original).sort());
  const itemPath = "assets/minecraft/items/stick.json";
  expect(changed[itemPath]).toEqual(original[itemPath]);
  expect(strFromU8(changed["assets/minecraft/blockstates/iron_block.json"]!))
    .toBe(strFromU8(original["assets/minecraft/blockstates/iron_block.json"]!));
  expect(changed["assets/3dmc/models/block/lantern.json"]).toEqual(
    original["assets/3dmc/models/block/lantern.json"]);
  expect(errors).toEqual([]);
});

test("Pack Studio imports an item-only Java ZIP after explicit resource review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  let studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.getByRole("button", { name: "Add Java item" }).click();
  await studio.getByRole("checkbox", { name: "Also replace vanilla block visuals" }).uncheck();
  await studio.getByRole("checkbox", { name: "Animate hand on item swap" }).uncheck();
  const zipDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Export Java ZIP" }).click();
  const path = await (await zipDownload).path();
  if (!path) throw new Error("Item-only ZIP missing.");
  const original = unzipSync(new Uint8Array(await readFile(path)));
  expect(Object.keys(original).filter(name => name.includes("/blockstates/"))).toHaveLength(0);
  await studio.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.locator('input[aria-label="Java pack ZIP file"]').setInputFiles(path);
  let confirm = studio.getByRole("group", { name: "Confirm source pack replacement" });
  await expect(confirm).toContainText("1 item(s)");
  await expect(confirm).toContainText("item-only");
  await expect(confirm).toContainText("minecraft:stick");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);

  await studio.locator('input[aria-label="Java pack ZIP file"]').setInputFiles(path);
  confirm = studio.getByRole("group", { name: "Confirm source pack replacement" });
  await confirm.getByRole("button", { name: "Import verified Java pack" }).click();
  await expect(studio).toHaveCount(0);
  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  studio = page.getByRole("dialog", { name: "Pack Studio" });
  await expect(studio.getByRole("combobox", { name: "Item replacement target" })).toHaveValue("stick");
  await expect(studio.getByRole("checkbox", { name: "Also replace vanilla block visuals" })).not.toBeChecked();
  await expect(studio.getByRole("checkbox", { name: "Animate hand on item swap" })).not.toBeChecked();

  const repeatDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Export Java ZIP" }).click();
  const repeatPath = await (await repeatDownload).path();
  if (!repeatPath) throw new Error("Item-only re-export missing.");
  const repeated = unzipSync(new Uint8Array(await readFile(repeatPath)));
  expect(Object.keys(repeated).sort()).toEqual(Object.keys(original).sort());
  for (const name of Object.keys(original)) expect(repeated[name]).toEqual(original[name]);
});

test("malformed extra resources block the import without changing the active pack", async ({ page }) => {
  await page.goto("/");
  const originalName = await page.getByRole("textbox", { name: "Project name" }).inputValue();
  await page.getByRole("button", { name: "Pack Studio", exact: true }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  const download = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Export Java ZIP" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Original ZIP missing");
  await studio.getByRole("button", { name: "Close", exact: true }).click();
  const files = unzipSync(new Uint8Array(await readFile(path)));
  files["assets/3dmc/models/block/unrelated.json"] = strToU8("{}");
  const altered = zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
  await page.locator(javaInput).setInputFiles({
    name: "unsafe-pack.zip", mimeType: "application/zip", buffer: Buffer.from(altered)
  });
  const blocked = page.getByRole("dialog", { name: "Pack cannot be safely imported" });
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText(/unreferenced|unsupported|preserved|byte-identical/i);
  await blocked.getByRole("button", { name: "Keep working" }).click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue(originalName);
});

test("Cancel import terminates a stalled Java pack worker before any confirmation", async ({ page }) => {
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message: unknown, transfer?: Transferable[]): void {
        if (typeof message === "object" && message !== null &&
            "kind" in message && (message as { kind: string }).kind === "java") return;
        super.postMessage(message, transfer ?? []);
      }
    };
  });
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Project name" });
  const original = await name.inputValue();
  await page.locator(javaInput).setInputFiles({
    name: "stalled.zip", mimeType: "application/zip", buffer: Buffer.from("Fake ZIP contents")
  });
  const activity = page.locator(".import-progress");
  await expect(activity).toContainText("Validating stalled.zip");
  await activity.getByRole("button", { name: "Cancel import" }).click();
  await expect(activity).toHaveCount(0);
  await expect(name).toHaveValue(original);
  await expect(page.getByRole("dialog", { name: /Import editable|Pack cannot/ })).toHaveCount(0);
});

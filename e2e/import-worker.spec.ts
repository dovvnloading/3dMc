import { expect, test } from "@playwright/test";

const sourceInput = 'input[accept=".3dmc,.json,application/json,application/zip"]';
const javaInput = 'input[accept=".zip,application/zip"]';

test("worker-backed native Open validates before replacement and preserves saved edits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Native project download missing");

  await width.fill("13");
  await width.press("Enter");
  await page.locator(sourceInput).setInputFiles(path);
  const confirmation = page.getByRole("dialog", { name: "Open this project?" });
  await expect(confirmation).toBeVisible();
  // Parsing/preflight must not change the active workspace.
  await expect(width).toHaveValue("13");
  await confirmation.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");
  expect(errors).toEqual([]);
});

test("worker-backed Java ZIP preflight remains explicit and editable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const width = page.getByRole("textbox", { name: "X size" });
  await width.fill("12");
  await width.press("Enter");
  await page.getByRole("button", { name: "Minecraft export" }).click();
  const exportDialog = page.getByRole("dialog", { name: "Experimental resource pack" });
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download experimental ZIP" }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Experimental Java ZIP download missing");
  await exportDialog.getByRole("button", { name: "Close" }).click();

  await width.fill("13");
  await width.press("Enter");
  await page.locator(javaInput).setInputFiles(path);
  const preflight = page.getByRole("dialog", { name: "Import editable block pack?" });
  await expect(preflight).toBeVisible();
  await expect(width).toHaveValue("13");
  await preflight.getByRole("button", { name: "Import as editable project" }).click();
  await expect(page.getByRole("textbox", { name: "X size" })).toHaveValue("12");
  expect(errors).toEqual([]);
});

test("Pack Studio worker can add a standalone source and open a saved v3 pack", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const native = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const nativePath = await (await native).path();
  if (!nativePath) throw new Error("Standalone source missing");

  await page.getByRole("button", { name: "Pack Studio" }).click();
  const studio = page.getByRole("dialog", { name: "Pack Studio" });
  await studio.locator(".pack-studio-models input[type=file]").setInputFiles(nativePath);
  await expect(studio.getByRole("listbox", { name: "Pack model assets" })
    .getByRole("option")).toHaveCount(2);

  const packDownload = page.waitForEvent("download");
  await studio.getByRole("button", { name: "Save pack .3dmc" }).click();
  const packPath = await (await packDownload).path();
  if (!packPath) throw new Error("Pack source missing");
  await studio.getByRole("button", { name: "Close", exact: true }).click();

  await page.locator(sourceInput).setInputFiles(packPath);
  const confirmation = page.getByRole("dialog", { name: "Open source pack?" });
  await expect(confirmation).toContainText("2 complete editable model");
  await confirmation.getByRole("button", { name: "Open source pack" }).click();
  await expect(page.getByRole("group", { name: "Pack asset browser" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Cancel import stops a stalled worker without changing the workspace", async ({ page }) => {
  // Simulate a slow validation worker deterministically; never rely on timing.
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker {
      postMessage(message: unknown, transfer?: Transferable[]): void {
        if (typeof message === "object" && message !== null &&
            "kind" in message && (message as { kind: string }).kind === "source") return;
        super.postMessage(message, transfer ?? []);
      }
    };
  });
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Project name" });
  const original = await name.inputValue();
  await page.locator(sourceInput).setInputFiles({
    name: "cancelled.3dmc", mimeType: "application/zip",
    buffer: Buffer.from("This worker never processes these bytes")
  });
  const activity = page.locator(".import-progress");
  await expect(activity).toContainText("Validating cancelled.3dmc");
  await activity.getByRole("button", { name: "Cancel import" }).click();
  await expect(activity).toHaveCount(0);
  await expect(name).toHaveValue(original);
  await expect(page.getByRole("dialog", { name: /Open.*project|Open source pack/ })).toHaveCount(0);
  await expect(page.getByText("Import canceled. Your current project was not changed.")).toBeVisible();
});

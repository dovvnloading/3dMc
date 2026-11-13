import { expect, test } from "@playwright/test";

test("recovery details only acknowledge a committed revision and offer independent backup paths", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const field = page.getByRole("textbox", { name: "X position", exact: true });
  await field.fill("5"); await field.press("Enter");
  await expect(page.getByText("Saved on this device")).toBeVisible();

  await page.getByRole("button", { name: "Recovery details" }).click();
  const details = page.getByRole("dialog", { name: "Backup and recovery status" });
  await expect(details).toContainText("Current revision 1 acknowledged");
  await expect(details).toContainText("Last acknowledged checkpoint: revision 1");
  await expect(details).toContainText("Library snapshots");
  await expect(details).toContainText("Portable .3dmc source");
  await expect(details).toContainText("not that the file was durably stored");

  const pending = page.waitForEvent("download");
  await details.getByRole("button", { name: "Download source backup" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(/\.3dmc$/);

  await details.getByRole("button", { name: "Open library" }).click();
  await expect(details).toHaveCount(0);
  const library = page.getByRole("dialog", { name: "Local project library" });
  await expect(library).toBeVisible();
  await library.getByRole("button", { name: "Save new local snapshot" }).click();
  await expect(library.getByText(/Snapshot saved on this device/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("first-session guide launches real editor workflows without claiming false progress", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const name = page.getByRole("textbox", { name: "Project name" });
  const original = await name.inputValue();

  await page.getByRole("button", { name: "Workspace guide and layouts" }).click();
  let guide = page.getByRole("dialog", { name: "Workspace guide and layouts" });
  await expect(guide.getByRole("listitem")).toHaveCount(5);
  await guide.getByRole("button", { name: "Choose a template" }).click();
  await expect(guide).toHaveCount(0);
  const newProject = page.getByRole("dialog", { name: "Create a new project" });
  await expect(newProject).toBeVisible();
  await newProject.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue(original);

  await page.getByRole("button", { name: "Workspace guide and layouts" }).click();
  guide = page.getByRole("dialog", { name: "Workspace guide and layouts" });
  await guide.getByRole("button", { name: "Paint mode" }).click();
  await expect(page.getByRole("tab", { name: "Paint" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Workspace guide and layouts" }).click();
  guide = page.getByRole("dialog", { name: "Workspace guide and layouts" });
  await guide.getByRole("button", { name: "Review export" }).click();
  await expect(page.getByRole("dialog", { name: "Experimental resource pack" })).toBeVisible();
  expect(errors).toEqual([]);
});

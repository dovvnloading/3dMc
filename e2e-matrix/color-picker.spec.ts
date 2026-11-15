import { expect, test } from "@playwright/test";

test("picker, palette, recent paint and eyedropper work in Firefox/WebKit", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("tab", { name: "Paint" }).click();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);

  const trigger = page.getByRole("button", { name: "Custom paint color" });
  const recent = page.getByRole("group", { name: "Recent painted colors" });
  await expect(recent.getByRole("button")).toHaveCount(0);

  // Selecting colours, including from the project palette, must not count as painting.
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  await expect(trigger).toContainText("#C76D68");
  await expect(recent.getByRole("button")).toHaveCount(0);
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Custom paint color picker" });
  await expect(picker).toBeVisible();
  const square = picker.getByRole("slider", { name: "Saturation and brightness" });
  await expect(square).toBeFocused();
  const hex = picker.getByRole("textbox", { name: "Hex color" });
  const red = picker.getByRole("textbox", { name: "R channel" });
  const green = picker.getByRole("textbox", { name: "G channel" });
  const blue = picker.getByRole("textbox", { name: "B channel" });
  await hex.fill("#123456");
  await expect(trigger).toContainText("#123456");
  await expect(red).toHaveValue("18");
  await expect(green).toHaveValue("52");
  await expect(blue).toHaveValue("86");
  const hue = picker.getByRole("slider", { name: "Hue" });
  await expect(hue).toHaveValue("210");
  await expect(square).toHaveAttribute("aria-valuetext", "Saturation 79%, brightness 34%");
  await red.fill("34");
  await expect(hex).toHaveValue("#223456");
  await expect(trigger).toContainText("#223456");
  await expect(square).toHaveAttribute("aria-valuetext", "Saturation 60%, brightness 34%");
  await red.fill("18");
  await expect(hex).toHaveValue("#123456");

  await hex.fill("invalid");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  await expect(trigger).toContainText("#123456");
  await red.fill("256");
  await expect(red).toHaveAttribute("aria-invalid", "true");
  await expect(trigger).toContainText("#123456");
  await red.fill("18");
  await hex.focus();
  await expect(hex).toHaveValue("#123456");
  await square.focus();
  const before = await square.getAttribute("aria-valuenow");
  await square.press("ArrowLeft");
  expect(await square.getAttribute("aria-valuenow")).not.toBe(before);
  await expect(square).toHaveCSS("outline-style", "solid");
  await hue.focus();
  const hueBefore = await hue.inputValue();
  await hue.press("ArrowRight");
  expect(await hue.inputValue()).not.toBe(hueBefore);

  // Set an exact paint colour again, then close with Escape.
  await hex.fill("#123456");
  await hex.press("Escape");
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();

  const canvas = page.locator(".texture-pixel-wrap canvas");
  await expect(canvas).toBeVisible();
  const rect = await canvas.boundingBox();
  if (!rect) throw new Error("Missing texture sheet");
  const point = { x: rect.x + rect.width * (4.5 / 32), y: rect.y + rect.height * (5.5 / 32) };
  await page.mouse.click(point.x, point.y);
  await expect(recent.getByRole("button", { name: "Choose recent color #123456" })).toBeVisible();
  await expect(recent.getByRole("button")).toHaveCount(1);

  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  await page.getByRole("button", { name: "Eyedropper (I)" }).click();
  await page.mouse.click(point.x, point.y);
  await expect(trigger).toContainText("#123456");
  await expect(recent.getByRole("button")).toHaveCount(1);
  await page.getByRole("button", { name: "Choose color #c76d68" }).click();
  await recent.getByRole("button", { name: "Choose recent color #123456" }).click();
  await expect(trigger).toContainText("#123456");

  await trigger.click();
  await expect(hex).toHaveValue("#123456");
  await page.getByRole("button", { name: "Pixel pencil (B)" }).click();
  await expect(picker).toBeHidden();
  expect(errors).toEqual([]);
});

test("element inspector reuses the same keyboard picker", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Solid color" }).click();
  const trigger = page.getByRole("button", { name: "Element color" });
  await expect(trigger).toBeVisible();
  await expect(page.locator('input[type="color"]')).toHaveCount(0);
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Element color picker" });
  await picker.getByRole("textbox", { name: "Hex color" }).fill("#0a1b2c");
  await expect(trigger).toContainText("#0A1B2C");
  await expect(picker.getByRole("textbox", { name: "R channel" })).toHaveValue("10");
  await expect(picker.getByRole("textbox", { name: "G channel" })).toHaveValue("27");
  await expect(picker.getByRole("textbox", { name: "B channel" })).toHaveValue("44");
  await picker.getByRole("textbox", { name: "Hex color" }).press("Escape");
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
});

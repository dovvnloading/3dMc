import { expect, test } from "@playwright/test";

// A display-backed Firefox can use Mesa on the Linux CI runner. These cases
// require real WebGL pixels, even when document-only workflows allow fallback.
test.use(process.env.CI ? { headless: false } : {});

test("cabinet renders from four camera presets with visible potion colors", async ({ page, browserName }) => {
  test.setTimeout(120_000);
  await page.goto("/?benchmark");
  await page.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new project" });
  await dialog.getByRole("button", { name: /Empty canvas/ }).click();
  await dialog.getByRole("textbox", { name: "New project name" }).fill("Cabinet visual QA");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Add primitive" }).click();
  await page.getByRole("menuitem", { name: /Apothecary Cabinet/ }).click();
  await page.getByRole("tab", { name: "Preview" }).click();
  const dismiss = page.getByRole("button", { name: "Dismiss notice" });
  if (await dismiss.isVisible()) await dismiss.click();

  const canvas = page.locator(".viewport-canvas canvas");
  await expect(canvas).toBeVisible();
  await page.waitForFunction(() => {
    const diagnostics = (window as Window & {
      __3dmcDiagnostics?: { snapshot(): { triangles: number } };
    }).__3dmcDiagnostics;
    return (diagnostics?.snapshot().triangles ?? 0) >= 1000;
  });
  for (const view of ["iso", "front", "right", "top"]) {
    await page.getByRole("button", { name: "View " + view, exact: true }).click();
    // Each notch moves OrbitControls by 5%. Use the same magnification for
    // every capture so native device pixel ratio is the only scale difference.
    await canvas.evaluate(element => {
      for (let notch = 0; notch < 10; notch++) {
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
      }
    });
    await page.evaluate(() => new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const shot = await canvas.screenshot({ path: "test-results/cabinet-" + browserName + "-" + view + ".png" });
    // Read the actual screenshot, excluding the editor chrome at the edges.
    // CSS text, a blank canvas or the graphics fallback cannot satisfy this.
    const counts = await page.evaluate(async encoded => {
      const image = new Image();
      image.src = "data:image/png;base64," + encoded;
      await image.decode();
      const sample = document.createElement("canvas");
      sample.width = 360;
      sample.height = Math.round(image.height * sample.width / image.width);
      const ctx = sample.getContext("2d")!;
      ctx.drawImage(image, 0, 0, sample.width, sample.height);
      const pixels = ctx.getImageData(24, 30, sample.width - 48, sample.height - 65).data;
      const counts = { wood: 0, green: 0, blue: 0, red: 0 };
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!;
        if (r > g * 1.18 && g > b * 1.15 && r > 64) counts.wood++;
        if (g > r * 1.3 && g > b * 0.91 && b > r * 1.12 && g > 85) counts.green++;
        if (b > r * 1.25 && b > g * 1.12 && b > 95) counts.blue++;
        if (r > g * 1.45 && r > b * 1.3 && b >= g * 0.91 && r > 100) counts.red++;
      }
      return counts;
    }, shot.toString("base64"));
    expect(counts.wood, view + " woodwork").toBeGreaterThan(300);
    if (view === "front" || view === "iso") {
      for (const color of ["green", "blue", "red"] as const) {
        expect(counts[color], view + " " + color + " potion").toBeGreaterThan(5);
      }
    }
  }
});

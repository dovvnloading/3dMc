import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

interface Snapshot {
  gpuTextures: number;
  gpuGeometries: number;
  drawCalls: number;
  triangles: number;
  renderedFrames: number;
  frameIntervalP50Ms: number | null;
  frameIntervalP95Ms: number | null;
  pixelRatio: number;
}

async function snapshot(page: import("@playwright/test").Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const accessor = (window as Window & {
      __3dmcDiagnostics?: { snapshot: () => Snapshot }
    }).__3dmcDiagnostics;
    if (!accessor) throw new Error("Dev WebGL performance diagnostics unavailable.");
    return accessor.snapshot();
  });
}

async function createFixture(page: import("@playwright/test").Page, count: number): Promise<number[]> {
  return page.evaluate(async (size) => {
    const domain = await import("/src/editor/domain.ts");
    const { makeNewProject } = await import("/src/editor/templates.ts");
    const { encodeNativeProject } = await import("/src/editor/nativeArchive.ts");
    let doc = makeNewProject({
      id: "perf-" + size, template: "blank",
      resolution: 64, name: "Texture lifecycle " + size
    });
    for (let i = 0; i < size; i++) {
      if (i) {
        // Opaque but deliberately distinct sheets, not references to a single
        // shared JS pixel array. Every texture is assigned to visible geometry.
        const pixels: number[] = [];
        for (let texel = 0; texel < 64 * 64; texel++) {
          pixels.push((texel + i * 23) & 255, (i * 17) & 255, 180, 255);
        }
        doc = domain.addTexture(doc, {
          id: "sheet_" + i, name: "sheet_" + i + ".png",
          width: 64, height: 64, pixels
        });
      }
      const id = "component_" + i;
      const textureId = i === 0 ? "main" : "sheet_" + i;
      doc = domain.addCuboid(doc, id);
      doc = domain.updateCuboid(doc, id, (item) => ({
        ...item, name: "Component " + (i + 1),
        from: [(i % 4) * 4, Math.floor(i / 4) * 4, 0],
        to: [(i % 4) * 4 + 4, Math.floor(i / 4) * 4 + 4, 4],
        color: "#ffffff", material: "texture",
        faces: domain.createDefaultFaces(textureId)
      }));
    }
    return Array.from(await encodeNativeProject(doc));
  }, count);
}

async function openFixture(
  page: import("@playwright/test").Page, bytes: number[], size: number
): Promise<void> {
  await page.locator('input[accept=".3dmc,.json,application/json,application/zip"]')
    .setInputFiles({
      name: "texture-lifecycle-" + size + ".3dmc",
      mimeType: "application/zip",
      buffer: Buffer.from(bytes)
    });
  const dialog = page.getByRole("dialog", { name: "Open this project?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Open project" }).click();
  await expect(page.getByRole("group", { name: "Texture assets" })
    .locator(".texture-slot")).toHaveCount(size);
  await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
}

/**
 * One reproducible Chromium/SwiftShader reference machine—not a customer
 * hardware SLA. Measures actual Three/WebGL GPU resource accounting and
 * Chromium's JS heap; writes artifacts for trend and regression review.
 */
test("1, 4, 16 RGBA64 sheets render, release resources and survive repeated project changes",
  async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?benchmark=1");
    await expect(page.locator(".viewport-canvas canvas")).toBeVisible();
    await expect.poll(() => snapshot(page).then(m => m.gpuGeometries)).toBeGreaterThan(0);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const measurements: Array<{
      sheetCount: number; importAndReadyMs: number; jsHeapUsedBytes: number | null;
      webgl: Snapshot;
    }> = [];

    for (const count of [1, 4, 16, 1]) {
      const fixture = await createFixture(page, count);
      const started = Date.now();
      await openFixture(page, fixture, count);
      // Trigger demand-driven WebGL renders after source replacement.
      await page.keyboard.press("f");
      await page.waitForTimeout(150);
      const webgl = await snapshot(page);
      const metrics = await cdp.send("Performance.getMetrics");
      const heap = metrics.metrics.find(metric => metric.name === "JSHeapUsedSize")?.value ?? null;
      measurements.push({
        sheetCount: count, importAndReadyMs: Date.now() - started,
        jsHeapUsedBytes: heap, webgl
      });
      expect(webgl.gpuTextures).toBeGreaterThanOrEqual(1);
      expect(webgl.gpuTextures).toBeLessThan(64);
      expect(webgl.gpuGeometries).toBeLessThan(150);
    }

    const initial = measurements[0]!.webgl;
    const afterCycle = measurements[3]!.webgl;
    // Returning to the one-sheet project must release maps from the 16-sheet
    // scene. Allow a few lazy WebGL caches; reject unbounded retained maps.
    await expect.poll(async () => (await snapshot(page)).gpuTextures, {
      timeout: 8_000
    }).toBeLessThanOrEqual(initial.gpuTextures + 3);
    expect(afterCycle.gpuTextures).toBeLessThanOrEqual(initial.gpuTextures + 3);
    expect(errors).toEqual([]);

    const output = path.join("test-results", "performance", "texture-lifecycle.json");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({
      engine: "Chromium (Playwright)",
      environment: "GitHub Actions reference runner using SwiftShader (not a real-device GPU SLA)",
      model: "16 independently referenced 64x64 RGBA sheets, cuboid per sheet",
      recordedAt: new Date().toISOString(),
      measurements
    }, null, 2) + "\n");
    await page.screenshot({ path: "test-results/performance/one-sheet-after-recovery.png" });
    await cdp.detach();
  });

import { describe, expect, it } from "vitest";
import { createSampleDocument, setTexturePixels } from "./domain";
import { commit, createHistory, redo, undo } from "./history";
import { encodeRgbaPng } from "../export/png";
import { inspectPngHeader, importTextureIntoDocument, resampleNearest,
  canAdoptPngDimensions, TextureImportError } from "./textureImport";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { inspectJava1214 } from "../export/javaBlock";

const pngFixture = (width: number, height: number, alpha = 255) => {
  const pixels = new Array<number>(width * height * 4).fill(0);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = x * 10; pixels[i + 1] = y * 11;
      pixels[i + 2] = 180; pixels[i + 3] = alpha;
    }
  return pixels;
};

describe("PNG input boundary", () => {
  it("parses an actual PNG header with checked IHDR CRC and safe dimensions", () => {
    const png = encodeRgbaPng(16, 16, pngFixture(16, 16));
    expect(inspectPngHeader(png)).toEqual({
      width: 16, height: 16, bitDepth: 8, colorType: 6
    });
    expect(() => inspectPngHeader(png.slice(0, 10))).toThrow(/valid PNG/);
    const altered = png.slice();
    altered[20] = 99; // change IHDR width without repairing CRC
    expect(() => inspectPngHeader(altered)).toThrow(/checksum/);
    expect(() => inspectPngHeader(new Uint8Array(1_500_001))).toThrow(/1.5 MB/);
    const invalid = png.slice();
    invalid[0] = 0;
    expect(() => inspectPngHeader(invalid)).toThrow(/valid PNG/);
  });

  it("resamples exactly with nearest-neighbor, including all four RGBA channels", () => {
    const src = [
      255, 0, 0, 255,  0, 255, 0, 255,
      0, 0, 255, 255,  127, 30, 255, 0
    ];
    const enlarged = resampleNearest(src, 2, 2, 4, 4);
    const at = (x: number, y: number) => enlarged.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4);
    expect(at(0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(1, 1)).toEqual([255, 0, 0, 255]);
    expect(at(3, 0)).toEqual([0, 255, 0, 255]);
    expect(at(0, 3)).toEqual([0, 0, 255, 255]);
    expect(at(3, 3)).toEqual([127, 30, 255, 0]);
    expect(resampleNearest(src, 2, 2, 2, 2)).toEqual(src);
    expect(() => resampleNearest([0], 2, 2, 4, 4)).toThrow(/invalid/);
  });

  it("offers source dimensions only for allowed square textures", () => {
    expect(canAdoptPngDimensions({ width: 16, height: 16 })).toBe(true);
    expect(canAdoptPngDimensions({ width: 32, height: 32 })).toBe(true);
    expect(canAdoptPngDimensions({ width: 64, height: 64 })).toBe(true);
    expect(canAdoptPngDimensions({ width: 16, height: 32 })).toBe(false);
    expect(canAdoptPngDimensions({ width: 8, height: 8 })).toBe(false);
    expect(canAdoptPngDimensions({ width: 256, height: 256 })).toBe(false);
  });

  it("changes texture resolution and shared pixels as one reversible source edit", () => {
    const source = createSampleDocument();
    const image = {
      name: "custom.png", width: 16, height: 16,
      pixels: pngFixture(16, 16),
      hasAlpha: false, translucentPixels: 0, opaquePixels: 256
    };
    const changed = importTextureIntoDocument(source, image, "use-png-size");
    expect(changed.texture.width).toBe(16);
    expect(changed.texture.height).toBe(16);
    expect(changed.texture.name).toBe("custom.png");
    expect(changed.texture.pixels).toEqual(image.pixels);
    expect(changed.cuboids).toEqual(source.cuboids);
    let history = commit(createHistory(source), changed);
    expect(history.past).toHaveLength(1);
    history = undo(history);
    expect(history.present).toBe(source);
    history = redo(history);
    expect(history.present).toEqual(changed);
  });

  it("retains alpha in the native archive but blocks experimental Java export", async () => {
    const source = createSampleDocument();
    const image = {
      name: "translucent.png", width: 16, height: 16,
      pixels: pngFixture(16, 16, 120),
      hasAlpha: true, translucentPixels: 256, opaquePixels: 0
    };
    const changed = importTextureIntoDocument(source, image, "keep-size");
    expect(changed.texture.width).toBe(32);
    expect(changed.texture.pixels[3]).toBe(120);
    const restored = await decodeNativeProject(await encodeNativeProject(changed));
    expect(restored).toEqual(changed);
    expect(inspectJava1214(changed).some(i =>
      i.severity === "error" && /alpha|opaque|transparen/i.test(i.message)
    )).toBe(true);
    expect(setTexturePixels(changed, source.texture.pixels).texture.width).toBe(32);
  });

  it("blocks unsupported policy and non-square source-size changes without mutation", () => {
    const source = createSampleDocument();
    const image = {
      name: "non-square.png", width: 2, height: 3,
      pixels: pngFixture(2, 3), hasAlpha: false, translucentPixels: 0, opaquePixels: 6
    };
    expect(() => importTextureIntoDocument(source, image, "use-png-size"))
      .toThrow(TextureImportError);
    expect(() => importTextureIntoDocument(source, image, "bad" as "keep-size"))
      .toThrow(/policy/);
    expect(source.texture.width).toBe(32);
    expect(importTextureIntoDocument(source, image, "keep-size").texture.pixels)
      .toHaveLength(32 * 32 * 4);
  });
});

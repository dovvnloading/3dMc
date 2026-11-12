import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { facePaintMask } from "./paintMask";
import { drawRectangle, drawStroke, floodFill } from "./pixels";
import { beginPaintGesture, commitPaintGesture, continuePaintGesture } from "./gestures";

const alphaAt = (pixels: number[], width: number, x: number, y: number) =>
  pixels[(y * width + x) * 4 + 3];

describe("face UV paint clipping", () => {
  it("resolves reversed, rotated and non-square authored face regions", () => {
    const document = createSampleDocument();
    document.textures[0]!.width = 16;
    document.textures[0]!.height = 32;
    document.textures[0]!.pixels = new Array(16 * 32 * 4).fill(255);
    document.cuboids[0]!.faces.north = {
      ...document.cuboids[0]!.faces.north,
      uv: [12, 10, 4, 2], rotation: 90
    };
    expect(facePaintMask(document, "body", "north", "main"))
      .toEqual({ left: 4, top: 4, right: 12, bottom: 20 });
    expect(facePaintMask(document, "body", "north", "missing")).toBeNull();
    const locked = { ...document, cuboids: document.cuboids.map(node => node.id === "body" ?
      { ...node, locked: true } : node) };
    expect(facePaintMask(locked, "body", "north", "main")).toBeNull();
  });
  it("clips line, rectangle and wide eraser footprints to the selected UV region", () => {
    const pixels = new Array<number>(8 * 8 * 4).fill(0);
    const mask = { left: 2, top: 2, right: 6, bottom: 6 };
    const line = drawStroke(pixels, 8, 8, [0, 3], [7, 3], "#d010aa", 2, 255, mask);
    expect(alphaAt(line, 8, 1, 3)).toBe(0);
    expect(alphaAt(line, 8, 2, 3)).toBe(255);
    expect(alphaAt(line, 8, 5, 3)).toBe(255);
    expect(alphaAt(line, 8, 6, 3)).toBe(0);
    const rectangle = drawRectangle(pixels, 8, 8, [1, 1], [5, 5], "#aa55bb", 1, 255, mask);
    expect(alphaAt(rectangle, 8, 5, 3)).toBe(255);
    expect(alphaAt(rectangle, 8, 1, 1)).toBe(0);
    expect(alphaAt(rectangle, 8, 3, 3)).toBe(0);
    const opaque = new Array<number>(8 * 8 * 4).fill(255);
    const erased = drawStroke(opaque, 8, 8, [0, 3], [7, 3], "#ffffff", 4, 0, mask);
    expect(alphaAt(erased, 8, 1, 3)).toBe(255);
    expect(alphaAt(erased, 8, 2, 3)).toBe(0);
    expect(alphaAt(erased, 8, 6, 3)).toBe(255);
  });
  it("stops fill traversal at the mask boundary even on the same RGBA color", () => {
    const image = Array.from({ length: 8 * 8 }, () => [10, 20, 30, 255]).flat();
    const mask = { left: 2, top: 2, right: 6, bottom: 6 };
    const result = floodFill(image, 8, 8, [3, 3], "#00ff00", mask);
    const at = (pixels: number[], x: number, y: number) =>
      pixels.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4);
    expect(at(result, 3, 3)).toEqual([0, 255, 0, 255]);
    expect(at(result, 5, 5)).toEqual([0, 255, 0, 255]);
    expect(at(result, 1, 3)).toEqual([10, 20, 30, 255]);
    expect(at(result, 6, 3)).toEqual([10, 20, 30, 255]);
    expect(floodFill(image, 8, 8, [0, 0], "#00ff00", mask)).toBe(image);
    expect(image[0]).toBe(10);
  });
  it("retains the same mask through a preview and one canonical commit", () => {
    const source = createSampleDocument();
    const mask = { left: 4, top: 4, right: 10, bottom: 10 };
    let gesture = beginPaintGesture(source, [1, 6], "body:north",
      "#ff00cc", 1, "line", "main", mask);
    gesture = continuePaintGesture(gesture, [15, 6], "body:north");
    const updated = commitPaintGesture(source, gesture);
    const at = (x: number, y: number) =>
      updated.textures[0]!.pixels.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4);
    expect(at(6, 6)).toEqual([255, 0, 204, 255]);
    expect(at(1, 6)).toEqual(source.textures[0]!.pixels.slice((6 * 32 + 1) * 4, (6 * 32 + 1) * 4 + 4));
    expect(at(12, 6)).toEqual(source.textures[0]!.pixels.slice((6 * 32 + 12) * 4, (6 * 32 + 12) * 4 + 4));
    expect(source.textures[0]!.pixels).not.toEqual(updated.textures[0]!.pixels);
  });
});

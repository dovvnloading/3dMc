import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { addRasterLayer } from "./layers";
import { commit, createHistory, redo, undo } from "./history";
import { beginPaintGesture, cancelPaintGesture, commitPaintGesture, continuePaintGesture } from "./gestures";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { mirroredTexels, nextSymmetry, paintStencil, shapeBounds, shapeStencil, strokeStencil } from "./paintGeometry";

const blank = (w: number, h: number) => new Array<number>(w * h * 4).fill(0);
const rgba = (pixels: readonly number[], w: number, x: number, y: number) =>
  pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 4);
const painted = (pixels: readonly number[], w: number, h: number) => {
  const result: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (pixels[(y * w + x) * 4 + 3]) result.push(x + "," + y);
  return result;
};
const stencilPixels = (w: number, h: number, stencil: Uint8Array) =>
  paintStencil(blank(w, h), w, h, stencil, "#e20c65", 255, "off");

describe("per-sheet symmetry coordinates", () => {
  it("cycles through four unambiguous modes", () => {
    let next = nextSymmetry("off");
    expect(next).toBe("x");
    next = nextSymmetry(next);
    expect(next).toBe("y");
    next = nextSymmetry(next);
    expect(next).toBe("both");
    expect(nextSymmetry(next)).toBe("off");
  });
  it("mirrors odd and even axes with exact texel centers", () => {
    expect(mirroredTexels([1, 0], 5, 3, "both"))
      .toEqual([[1, 0], [3, 0], [1, 2], [3, 2]]);
    expect(mirroredTexels([2, 1], 5, 3, "both")).toEqual([[2, 1]]);
    expect(mirroredTexels([1, 0], 6, 4, "both"))
      .toEqual([[1, 0], [4, 0], [1, 3], [4, 3]]);
    expect(mirroredTexels([0, 0], 1, 1, "both")).toEqual([[0, 0]]);
    expect(mirroredTexels([3, 1], 7, 3, "x")).toEqual([[3, 1]]);
    expect(mirroredTexels([4, 1], 7, 3, "off")).toEqual([[4, 1]]);
  });
  it("mirrors even brush pixel footprints rather than moving their anchor", () => {
    const w = 8, h = 4;
    const src = strokeStencil(w, h, [1, 1], [1, 1], 2, "square");
    const result = paintStencil(blank(w, h), w, h, src, "#e20c65", 255, "both");
    expect(painted(result, w, h)).toEqual([
      "1,1", "2,1", "5,1", "6,1", "1,2", "2,2", "5,2", "6,2"
    ]);
  });
  it("clips each mirrored destination to sheet edges and selected-face UV mask", () => {
    const w = 7, h = 3, mask = { left: 4, top: 0, right: 7, bottom: 3 };
    const src = strokeStencil(w, h, [1, 1], [1, 1], 3, "square");
    const result = paintStencil(blank(w, h), w, h, src, "#e20c65", 255, "both", mask);
    expect(painted(result, w, h)).toEqual([
      "4,0", "5,0", "6,0", "4,1", "5,1", "6,1", "4,2", "5,2", "6,2"
    ]);
    expect(paintStencil(blank(1, 1), 1, 1,
      strokeStencil(1, 1, [0, 0], [0, 0], 16, "round"),
      "#e20c65", 255, "both")).toHaveLength(4);
  });
  it("paints mirrored texels even when the original already matches, and erases all four channels", () => {
    const a = blank(4, 1);
    a.splice(4, 4, 226, 12, 101, 255);
    const stamp = strokeStencil(4, 1, [1, 0], [1, 0], 1, "square");
    const next = paintStencil(a, 4, 1, stamp, "#e20c65", 255, "x");
    expect(rgba(next, 4, 2, 0)).toEqual([226, 12, 101, 255]);
    const erased = paintStencil(next, 4, 1, stamp, "#ffffff", 0, "x");
    expect(rgba(erased, 4, 1, 0)).toEqual([0, 0, 0, 0]);
    expect(rgba(erased, 4, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(a).not.toEqual(erased);
  });
});

describe("pixel shape geometry", () => {
  it("constrains squares/circles and centers with Shift and Alt in all drag directions", () => {
    expect(shapeBounds([4, 4], [7, 6])).toEqual({ left: 4, right: 7, top: 4, bottom: 6 });
    expect(shapeBounds([4, 4], [7, 6], { shiftKey: true }))
      .toEqual({ left: 4, right: 7, top: 4, bottom: 7 });
    expect(shapeBounds([4, 4], [1, 6], { shiftKey: true }))
      .toEqual({ left: 1, right: 4, top: 4, bottom: 7 });
    expect(shapeBounds([4, 4], [5, 6], { altKey: true }))
      .toEqual({ left: 3, right: 5, top: 2, bottom: 6 });
    expect(shapeBounds([4, 4], [6, 5], { altKey: true, shiftKey: true }))
      .toEqual({ left: 2, right: 6, top: 2, bottom: 6 });
    expect(shapeBounds([0, 0], [0, 0], { altKey: true, shiftKey: true }))
      .toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });
  it("fills rectangles without brush inflation and outlines without interior", () => {
    const bounds = shapeBounds([1, 1], [5, 4]);
    const outline = stencilPixels(8, 8, shapeStencil(8, 8, "rectangle", bounds, false, 1, "square"));
    const solid = stencilPixels(8, 8, shapeStencil(8, 8, "rectangle", bounds, true, 16, "round"));
    expect(rgba(outline, 8, 3, 3)[3]).toBe(0);
    expect(rgba(solid, 8, 3, 3)[3]).toBe(255);
    expect(rgba(solid, 8, 0, 1)[3]).toBe(0);
    expect(rgba(outline, 8, 1, 1)[3]).toBe(255);
    expect(rgba(outline, 8, 5, 4)[3]).toBe(255);
  });
  it("draws outline and filled circles, clips ellipses on non-square sheets", () => {
    const circle = shapeBounds([2, 2], [6, 6], { shiftKey: true });
    const inner = stencilPixels(9, 9, shapeStencil(9, 9, "ellipse", circle, true, 1, "square"));
    const outline = stencilPixels(9, 9, shapeStencil(9, 9, "ellipse", circle, false, 1, "square"));
    expect(rgba(inner, 9, 4, 4)[3]).toBe(255);
    expect(rgba(inner, 9, 2, 2)[3]).toBe(0);
    expect(rgba(outline, 9, 4, 4)[3]).toBe(0);
    expect(rgba(outline, 9, 4, 2)[3]).toBe(255);
    const ellipse = stencilPixels(7, 3, shapeStencil(7, 3, "ellipse",
      shapeBounds([-2, 0], [6, 2]), true, 1, "square"));
    expect(ellipse).toHaveLength(7 * 3 * 4);
    expect(rgba(ellipse, 7, 5, 1)[3]).toBe(255);
    expect(rgba(ellipse, 7, 6, 2)[3]).toBe(0);
  });
  it("clips a thick shape that extends beyond the sheet without losing visible outline edges", () => {
    const large = { left: -1, top: 0, right: 4, bottom: 4 };
    const thin = shapeStencil(4, 4, "rectangle", large, false, 1, "square");
    const thick = shapeStencil(4, 4, "rectangle", large, false, 3, "square");
    expect(thin[2 * 4]).toBe(0); // The outline itself is outside the sheet.
    expect(thick[2 * 4]).toBe(1); // Its 3px brush still reaches x=0.
    expect(thick).toHaveLength(16);
  });
  it("does not break on 1×1, 1×N, N×1 or small even ellipses", () => {
    for (const [w, h] of [[1, 1], [1, 7], [7, 1], [2, 2], [2, 4], [4, 2]]) {
      const stencil = shapeStencil(w, h, "ellipse",
        { left: 0, top: 0, right: w - 1, bottom: h - 1 }, true, 1, "square");
      expect(stencil.length).toBe(w * h);
      expect(stencil.some(Boolean)).toBe(true);
      expect(stencilPixels(w, h, stencil).length).toBe(w * h * 4);
    }
  });
});

describe("mirrored shapes, active layers and native save/reopen", () => {
  it("makes one immutable undo/redo step and round-trips the painted result", async () => {
    const initial = createSampleDocument();
    const source = addRasterLayer({ ...initial,
      textures: initial.textures.map(t => ({ ...t, width: 7, height: 5, pixels: blank(7, 5) }))
    }, "main", "ink", "background");
    let gesture = beginPaintGesture(source, [1, 1], "body:north", "#e20c65", 1,
      "ellipse", "main", undefined, "square", "both", true);
    gesture = continuePaintGesture(gesture, [2, 2], "body:north");
    expect(source.textures[0]!.layers![1]!.pixels).toEqual(blank(7, 5));
    const next = commitPaintGesture(source, gesture);
    expect(next.textures[0]!.layers![0]!.pixels).toEqual(source.textures[0]!.layers![0]!.pixels);
    expect(painted(next.textures[0]!.layers![1]!.pixels, 7, 5)).toContain("5,3");
    const history = commit(createHistory(source), next);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(next);
    expect(cancelPaintGesture(gesture)).toBe(source);
    expect(await decodeNativeProject(await encodeNativeProject(next))).toEqual(next);
  });
  it("rebuilds a modified shape preview, clips BOTH reflections and cancels without committing", () => {
    const initial = createSampleDocument();
    const source = { ...initial,
      textures: initial.textures.map(t => ({ ...t, width: 8, height: 6, pixels: blank(8, 6) }))
    };
    const mask = { left: 4, top: 0, right: 8, bottom: 6 };
    let gesture = beginPaintGesture(source, [1, 2], "body:north", "#e20c65", 1,
      "rectangle", "main", mask, "square", "both", true);
    gesture = continuePaintGesture(gesture, [3, 4], "body:north");
    gesture = continuePaintGesture(gesture, [1, 2], "body:north");
    const next = commitPaintGesture(source, gesture);
    expect(painted(next.textures[0]!.pixels, 8, 6)).toEqual(["6,2", "6,3"]);
    expect(cancelPaintGesture(gesture)).toBe(source);
  });
});

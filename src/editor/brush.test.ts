import { describe, expect, it } from "vitest";
import { brushOffsets, brushTexels, footprintOutline } from "./brush";
import { drawStroke } from "./pixels";

const changed = (rgba: number[], w: number) => {
  const cells: string[] = [];
  for (let i = 0; i < rgba.length; i += 4)
    if (rgba[i + 3] === 255) cells.push(`${(i / 4) % w},${Math.floor(i / 4 / w)}`);
  return cells;
};
const blank = (w: number, h: number) => new Array<number>(w * h * 4).fill(0);

describe("exact square and round footprints", () => {
  it("defines odd/even centering independently of zoom or brush direction", () => {
    expect(brushOffsets(1, "square")).toEqual([[0, 0]]);
    expect(brushOffsets(2, "square")).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
    expect(brushOffsets(3, "square")).toContainEqual([-1, -1]);
    expect(brushOffsets(3, "square")).toContainEqual([1, 1]);
    expect(brushOffsets(4, "square")).toContainEqual([-1, -1]);
    expect(brushOffsets(4, "square")).toContainEqual([2, 2]);
    expect(brushOffsets(3, "round")).toEqual([[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1]]);
    expect(brushOffsets(4, "round")).toHaveLength(12);
    expect(brushOffsets(2, "round")).toHaveLength(4);
    expect(() => brushOffsets(0, "square")).toThrow(RangeError);
    expect(() => brushOffsets(17, "round")).toThrow(RangeError);
    expect(() => brushOffsets(1.5, "square")).toThrow(RangeError);
  });
  it("clips precisely at each edge and the selected face's fractional UV mask", () => {
    expect(brushTexels([0, 0], 4, "square", 1, 1)).toEqual([[0, 0]]);
    expect(brushTexels([0, 0], 3, "square", 5, 3)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
    expect(brushTexels([4, 2], 3, "square", 5, 3)).toEqual([[3, 1], [4, 1], [3, 2], [4, 2]]);
    expect(brushTexels([2, 1], 5, "round", 5, 3, {
      left: 1.5, top: 0, right: 3.5, bottom: 2
    }).every(([x, y]) => x >= 1 && x <= 2 && y < 2)).toBe(true);
  });
  it("uses exactly the same footprint in rendering and hover outlines", () => {
    for (const size of [1, 2, 3, 4, 16] as const) for (const shape of ["square", "round"] as const) {
      const points = brushTexels([0, 1], size, shape, 7, 3);
      const rgba = drawStroke(blank(7, 3), 7, 3, [0, 1], [0, 1], "#123456", size, 255, undefined, shape);
      expect(changed(rgba, 7)).toEqual(points.map(([x, y]) => x + "," + y));
      expect(footprintOutline(points)).not.toBe("");
    }
  });
  it("interpolates long diagonal movements without gaps or source mutation", () => {
    const source = blank(64, 32);
    for (const shape of ["square", "round"] as const) {
      const result = drawStroke(source, 64, 32, [1, 0], [63, 31], "#ffffff", 5, 255, undefined, shape);
      expect(changed(result, 64).length).toBeGreaterThan(64);
      for (let i = 0; i <= 31; i++) {
        const x = Math.round(1 + i * 62 / 31);
        expect(result[(i * 64 + x) * 4 + 3]).toBe(255);
      }
      expect(source.every(channel => channel === 0)).toBe(true);
    }
  });
  it("round even stamps paint one contiguous disk and never leak outside a 1x1 sheet", () => {
    const rgba = drawStroke(blank(1, 1), 1, 1, [0, 0], [0, 0], "#ff00bb", 16, 255, undefined, "round");
    expect(rgba).toEqual([255, 0, 187, 255]);
  });
});

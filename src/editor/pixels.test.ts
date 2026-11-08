import { describe, expect, it } from "vitest";
import { drawStroke, floodFill } from "./pixels";

describe("opaque pixel brush and transparent eraser", () => {
  it("draws opaque pixels, then erases all RGBA channels without touching its source", () => {
    const image = new Array<number>(4 * 4 * 4).fill(255);
    const old = [...image];
    const painted = drawStroke(image, 4, 4, [1, 1], [2, 1], "#123456", 1);
    const first = (1 * 4 + 1) * 4;
    expect(painted.slice(first, first + 4)).toEqual([18, 52, 86, 255]);
    const erased = drawStroke(painted, 4, 4, [1, 1], [1, 1], "#abcdef", 1, 0);
    expect(erased.slice(first, first + 4)).toEqual([0, 0, 0, 0]);
    expect(image).toEqual(old);
  });
});

describe("four-connected bucket fill", () => {
  const sample = () => {
    const pixels = new Array<number>(5 * 5 * 4).fill(0);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const i = (y * 5 + x) * 4;
      const stripe = x === 2;
      pixels[i] = stripe ? 0 : 30;
      pixels[i + 1] = stripe ? 0 : 60;
      pixels[i + 2] = stripe ? 0 : 90;
      pixels[i + 3] = 255;
    }
    return pixels;
  };

  it("fills exactly one connected side without crossing a different-color stripe", () => {
    const input = sample();
    const output = floodFill(input, 5, 5, [0, 2], "#aa0022");
    const at = (x: number, y: number) => output.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4);
    expect(at(0, 0)).toEqual([170, 0, 34, 255]);
    expect(at(1, 4)).toEqual([170, 0, 34, 255]);
    expect(at(2, 2)).toEqual([0, 0, 0, 255]);
    expect(at(3, 2)).toEqual([30, 60, 90, 255]);
    expect(input).toEqual(sample());
  });

  it("does not merge identical RGB neighbors with different alpha", () => {
    const input = sample();
    const at = (x: number, y: number) => (y * 5 + x) * 4;
    input[at(1, 0) + 3] = 100;
    const out = floodFill(input, 5, 5, [0, 0], "#00ff00");
    expect(out.slice(at(1, 0), at(1, 0) + 4)).toEqual([30, 60, 90, 100]);
    expect(out.slice(at(0, 0), at(0, 0) + 4)).toEqual([0, 255, 0, 255]);
  });

  it("is a no-op when the chosen fill matches the region", () => {
    const input = sample();
    expect(floodFill(input, 5, 5, [0, 0], "#1e3c5a")).toBe(input);
  });

  it("rejects invalid coordinates and invalid image dimensions without mutation", () => {
    const input = sample();
    expect(floodFill(input, 5, 5, [-1, 3], "#010203")).toBe(input);
    expect(floodFill(input, 5, 5, [5, 0], "#010203")).toBe(input);
    expect(floodFill(input, 5, 6, [0, 0], "#010203")).toBe(input);
  });
});


describe("bounded and diagonal-safe fill", () => {
  it("does not cross a diagonal-only connection between equal RGBA pixels", () => {
    const image: number[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      const marked = x === y;
      image.push(marked ? 50 : 0, marked ? 60 : 0, marked ? 70 : 0, 255);
    }
    const changed = floodFill(image, 3, 3, [0, 0], "#c804e6");
    const at = (x: number, y: number) =>
      changed.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4);
    expect(at(0, 0)).toEqual([200, 4, 230, 255]);
    expect(at(1, 1)).toEqual([50, 60, 70, 255]);
    expect(at(2, 2)).toEqual([50, 60, 70, 255]);
  });

  it("fills the maximum 64×64 editable sheet without recursion or partial output", () => {
    const pixels: number[] = [];
    for (let i = 0; i < 64 * 64; i++) pixels.push(1, 2, 3, 128);
    const result = floodFill(pixels, 64, 64, [31, 31], "#abcdef");
    expect(result).toHaveLength(pixels.length);
    expect(result.slice(0, 4)).toEqual([171, 205, 239, 255]);
    expect(result.slice(-4)).toEqual([171, 205, 239, 255]);
    expect(pixels.slice(0, 4)).toEqual([1, 2, 3, 128]);
  });
});

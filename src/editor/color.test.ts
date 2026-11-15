import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, hsvToRgb, normalizeHex, parseFullHex, parseHex, parseRgbChannel, rgbToHex, rgbToHsv } from "./color";

describe("colour conversion", () => {
  it("parses/canonicalizes long and short hex at channel edges", () => {
    expect(normalizeHex(" #AbC ")).toBe("#aabbcc");
    expect(normalizeHex("FFFFFF")).toBe("#ffffff");
    expect(parseFullHex("#abc")).toBeNull();
    expect(parseFullHex("#abcdef")).toBe("#abcdef");
    expect(parseFullHex("ABCDEF")).toBe("#abcdef");
    expect(parseHex("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHex("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex({ r: 255, g: 0, b: 16 })).toBe("#ff0010");
  });

  it("round-trips every sampled RGB value to hex through HSV (within rounding)", () => {
    for (const r of [0, 1, 16, 127, 128, 254, 255])
      for (const g of [0, 1, 64, 128, 255])
        for (const b of [0, 8, 127, 200, 255]) {
          const original = { r, g, b };
          const result = hsvToRgb(rgbToHsv(original));
          expect(result).toEqual(original);
          const hex = rgbToHex(original)!;
          expect(hsvToHex(hexToHsv(hex)!)).toBe(hex);
        }
  });

  it("handles hue wrap, gray, black and saturated primaries", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: -120, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 52, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvToHex({ h: 52, s: 1, v: 0 })).toBe("#000000");
    expect(hexToHsv("#808080")).toEqual({ h: 0, s: 0, v: 128 / 255 });
  });

  it("rejects invalid user input without inventing a colour", () => {
    for (const input of ["", "#", "#12", "#12345", "#1234567", "#fffffg", "rgb(1,2,3)", " #12 3456"])
      expect(normalizeHex(input)).toBeNull();
    for (const input of ["", "-", "1.1", "-1", "256", "1e2", "NaN", "999", "1 2"])
      expect(parseRgbChannel(input)).toBeNull();
    expect(parseRgbChannel(" 255 ")).toBe(255);
    expect(parseRgbChannel("000")).toBe(0);
    expect(rgbToHex({ r: 256, g: 0, b: 0 })).toBeNull();
    expect(rgbToHex({ r: 0, g: -1, b: 0 })).toBeNull();
    expect(rgbToHex({ r: Number.NaN, g: 0, b: 0 })).toBeNull();
    expect(rgbToHex({ r: 0.2, g: 0, b: 0 })).toBeNull();
  });
});

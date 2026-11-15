import { describe, expect, it } from "vitest";
import { nextMenuIndex } from "./contextMenuKeyboard";
import { isRightClickDrag } from "../components/ViewportContextTarget";

const entries = [true, false, true, false, true].map(enabled => ({ enabled }));

describe("context menu keyboard navigation", () => {
  it("starts on the first available item and skips disabled entries", () => {
    expect(nextMenuIndex(entries, -1, "Home")).toBe(0);
    expect(nextMenuIndex(entries, 0, "ArrowDown")).toBe(2);
    expect(nextMenuIndex(entries, 2, "ArrowDown")).toBe(4);
    expect(nextMenuIndex(entries, 4, "ArrowDown")).toBe(0);
  });

  it("wraps backwards and supports Home and End from any index", () => {
    expect(nextMenuIndex(entries, 0, "ArrowUp")).toBe(4);
    expect(nextMenuIndex(entries, 4, "ArrowUp")).toBe(2);
    expect(nextMenuIndex(entries, -1, "ArrowUp")).toBe(4);
    expect(nextMenuIndex(entries, 1, "ArrowDown")).toBe(0);
    expect(nextMenuIndex(entries, 2, "Home")).toBe(0);
    expect(nextMenuIndex(entries, 0, "End")).toBe(4);
  });

  it("handles all-disabled and empty menus without focusing arbitrary items", () => {
    expect(nextMenuIndex([], 0, "Home")).toBe(-1);
    expect(nextMenuIndex([{ enabled: false }], 0, "ArrowDown")).toBe(-1);
    expect(nextMenuIndex([{ enabled: false }], 0, "End")).toBe(-1);
  });

  it("distinguishes right-button clicks from drags at the four-pixel threshold", () => {
    const start = { x: 50, y: 100 };
    expect(isRightClickDrag(start, { x: 54, y: 100 })).toBe(false);
    expect(isRightClickDrag(start, { x: 53, y: 104 })).toBe(true);
    expect(isRightClickDrag(start, { x: 50, y: 170 })).toBe(true);
  });
});

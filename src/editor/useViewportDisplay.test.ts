import { describe, expect, it } from "vitest";
import { DEFAULT_VIEWPORT_DISPLAY } from "./viewportProjection";
import { parseViewportDisplay } from "./useViewportDisplay";

describe("session viewport settings", () => {
  it("defaults safely when stored state is absent or malformed", () => {
    for (const value of [null, undefined, 2, "orthographic", [], true]) {
      expect(parseViewportDisplay(value)).toEqual(DEFAULT_VIEWPORT_DISPLAY);
    }
    expect(parseViewportDisplay({ projection: "invalid", grid: 1, axes: "yes", outline: null }))
      .toEqual(DEFAULT_VIEWPORT_DISPLAY);
  });
  it("retains supported projection and independent display preferences", () => {
    expect(parseViewportDisplay({
      projection: "orthographic", grid: false, axes: true, outline: false,
      unknownOldProperty: "ignored"
    })).toEqual({ projection: "orthographic", grid: false, axes: true, outline: false });
    expect(parseViewportDisplay({ projection: "orthographic", grid: false }))
      .toEqual({ projection: "orthographic", grid: false, axes: false, outline: true });
  });
});

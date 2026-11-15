import { describe, expect, it } from "vitest";
import { sheetContainsPoint, sheetFitView, sheetPan, sheetPointToTexel,
  sheetResetView, sheetZoomAt } from "./sheetView";

const frame = { left: 30, top: 50, width: 280, height: 240 };
const hit = (x: number, y: number, view: ReturnType<typeof sheetFitView>, w: number, h: number) =>
  sheetPointToTexel(frame.left + view.x + x * view.zoom,
    frame.top + view.y + y * view.zoom, frame, view, w, h);

describe("texture sheet coordinate transform", () => {
  it("maps every texel center precisely after arbitrary anchored zoom and pan", () => {
    for (const [width, height] of [[1, 1], [16, 16], [64, 64], [13, 31], [64, 1]] as const) {
      let view = sheetResetView(width, height, frame.width, frame.height);
      for (const [x, y, zoom] of [[56, 75, 2.5], [160, 110, 11.75], [220, 180, 48.5]] as const) {
        view = sheetZoomAt(view, zoom, x, y, width, height, frame.width, frame.height);
        view = sheetPan(view, 17, -21, width, height, frame.width, frame.height);
        for (const px of [0, Math.floor(width / 2), width - 1])
          for (const py of [0, Math.floor(height / 2), height - 1])
            expect(hit(px + .5, py + .5, view, width, height)).toEqual([px, py]);
      }
    }
  });
  it("keeps the texel under the mouse anchored when neither edge needs clamping", () => {
    const v = sheetResetView(64, 64, 280, 240);
    const at = { x: 120, y: 130 };
    const originalX = (at.x - v.x) / v.zoom;
    const originalY = (at.y - v.y) / v.zoom;
    const next = sheetZoomAt(v, 10.5, at.x, at.y, 64, 64, 280, 240);
    expect((at.x - next.x) / next.zoom).toBeCloseTo(originalX, 10);
    expect((at.y - next.y) / next.zoom).toBeCloseTo(originalY, 10);
  });
  it("clamps zoom without losing the image and fits rectangular sizes", () => {
    for (const [w, h] of [[1, 1], [64, 64], [64, 16], [9, 31]] as const) {
      const fit = sheetFitView(w, h, 260, 180);
      expect(fit.zoom).toBeGreaterThanOrEqual(1);
      expect(fit.zoom).toBeLessThanOrEqual(64);
      expect(fit.zoom * w).toBeLessThanOrEqual(260);
      expect(fit.zoom * h).toBeLessThanOrEqual(180);
      const distant = sheetPan(fit, 1e5, -1e5, w, h, 260, 180);
      expect(sheetContainsPoint(10 + distant.x, 10 + distant.y,
        { left: 0, top: 0, width: 260, height: 180 }, distant, w, h)).toBe(true);
      const one = sheetZoomAt(fit, -2, 25, 25, w, h, 260, 180);
      expect(one.zoom).toBe(1);
      expect(sheetZoomAt(fit, 999, 25, 25, w, h, 260, 180).zoom).toBe(64);
    }
  });
  it("uses floor at boundaries and clamps pointer drags outside the sheet", () => {
    const view = sheetResetView(16, 8, 280, 240);
    expect(hit(0, 0, view, 16, 8)).toEqual([0, 0]);
    expect(hit(.999999, .999999, view, 16, 8)).toEqual([0, 0]);
    expect(hit(1, 1, view, 16, 8)).toEqual([1, 1]);
    expect(hit(16, 8, view, 16, 8)).toEqual([15, 7]);
    expect(hit(-200, 999, view, 16, 8)).toEqual([0, 7]);
  });
});

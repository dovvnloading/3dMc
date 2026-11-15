import type { Texel } from "./pixels";

export interface SheetView {
  /** CSS pixels per texel; canvas filtering remains nearest-neighbor. */
  readonly zoom: number;
  /** Top-left sheet origin relative to the unscrolled sheet viewport. */
  readonly x: number;
  readonly y: number;
}
export interface SheetBounds {
  readonly left: number; readonly top: number;
  readonly width: number; readonly height: number;
}
export const MIN_SHEET_ZOOM = 1;
export const MAX_SHEET_ZOOM = 64;
export const sheetZoom = (zoom: number): number =>
  Math.max(MIN_SHEET_ZOOM, Math.min(MAX_SHEET_ZOOM, zoom));

const limitAxis = (offset: number, sheetSize: number, viewportSize: number): number => {
  const pad = Math.min(20, viewportSize / 4);
  const spare = viewportSize - sheetSize - pad * 2;
  const low = spare >= 0 ? pad : viewportSize - sheetSize - pad;
  const high = spare >= 0 ? viewportSize - sheetSize - pad : pad;
  return Math.min(high, Math.max(low, offset));
};
/** Keep a sliver of every sheet reachable; do not let pan permanently lose it. */
export function clampSheetView(view: SheetView, width: number, height: number,
  viewportWidth: number, viewportHeight: number): SheetView {
  const zoom = sheetZoom(view.zoom);
  return {
    zoom,
    x: limitAxis(view.x, width * zoom, viewportWidth),
    y: limitAxis(view.y, height * zoom, viewportHeight)
  };
}
export function sheetViewCentered(zoom: number, width: number, height: number,
  viewportWidth: number, viewportHeight: number): SheetView {
  const scale = sheetZoom(zoom);
  return clampSheetView({ zoom: scale,
    x: (viewportWidth - width * scale) / 2,
    y: (viewportHeight - height * scale) / 2 },
  width, height, viewportWidth, viewportHeight);
}
export function sheetFitView(width: number, height: number,
  viewportWidth: number, viewportHeight: number): SheetView {
  const scale = Math.min((viewportWidth - 32) / width, (viewportHeight - 32) / height);
  return sheetViewCentered(scale, width, height, viewportWidth, viewportHeight);
}
export function sheetResetView(width: number, height: number,
  viewportWidth: number, viewportHeight: number): SheetView {
  return sheetViewCentered(Math.max(width, height) >= 64 ? 4 : 8,
    width, height, viewportWidth, viewportHeight);
}

/** Preserve a continuous texture coordinate under the pointer when zooming. */
export function sheetZoomAt(view: SheetView, nextZoom: number, x: number, y: number,
  width: number, height: number, viewportWidth: number, viewportHeight: number): SheetView {
  const zoom = sheetZoom(nextZoom);
  return clampSheetView({
    zoom, x: x - (x - view.x) * zoom / view.zoom,
    y: y - (y - view.y) * zoom / view.zoom
  }, width, height, viewportWidth, viewportHeight);
}
export function sheetPan(view: SheetView, dx: number, dy: number,
  width: number, height: number, viewportWidth: number, viewportHeight: number): SheetView {
  return clampSheetView({ ...view, x: view.x + dx, y: view.y + dy },
    width, height, viewportWidth, viewportHeight);
}

/** Hit-testing uses the same CSS transform as drawing, not a canvas bitmap rect. */
export function sheetPointToTexel(clientX: number, clientY: number, rect: SheetBounds,
  view: SheetView, width: number, height: number): Texel {
  return [
    Math.min(width - 1, Math.max(0, Math.floor((clientX - rect.left - view.x) / view.zoom))),
    Math.min(height - 1, Math.max(0, Math.floor((clientY - rect.top - view.y) / view.zoom)))
  ];
}
export function sheetContainsPoint(clientX: number, clientY: number, rect: SheetBounds,
  view: SheetView, width: number, height: number): boolean {
  const x = clientX - rect.left - view.x, y = clientY - rect.top - view.y;
  return x >= 0 && y >= 0 && x < width * view.zoom && y < height * view.zoom;
}

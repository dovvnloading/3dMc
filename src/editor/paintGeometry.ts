import { brushOffsets } from "./brush";
import type { BrushShape } from "./brush";
import { drawStroke, hexToRGB, insideMask } from "./pixels";
import type { PixelMask, Texel } from "./pixels";

export type SymmetryMode = "off" | "x" | "y" | "both";
export interface PaintModifiers { shiftKey?: boolean; altKey?: boolean }
export type GeometricTool = "rectangle" | "ellipse";

export const nextSymmetry = (mode: SymmetryMode): SymmetryMode =>
  ({ off: "x", x: "y", y: "both", both: "off" })[mode] as SymmetryMode;

/** X mirrors across the vertical sheet axis, Y across the horizontal axis. */
export function mirroredTexels([x, y]: Texel, width: number, height: number,
  mode: SymmetryMode): Texel[] {
  const points: Texel[] = [[x, y]];
  if (mode === "x" || mode === "both") points.push([width - 1 - x, y]);
  if (mode === "y" || mode === "both") points.push([x, height - 1 - y]);
  if (mode === "both") points.push([width - 1 - x, height - 1 - y]);
  const seen = new Set<string>();
  return points.filter(([px, py]) => {
    if (px < 0 || py < 0 || px >= width || py >= height) return false;
    const key = px + "," + py;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export interface ShapeBounds {
  left: number; top: number; right: number; bottom: number;
}

/** Inclusive pixel bounds. Alt uses the start texel as centre; Shift makes equal radii. */
export function shapeBounds(start: Texel, end: Texel,
  modifiers: PaintModifiers = {}): ShapeBounds {
  let dx = end[0] - start[0], dy = end[1] - start[1];
  if (modifiers.shiftKey) {
    const extent = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (Math.sign(dx) || 1) * extent;
    dy = (Math.sign(dy) || 1) * extent;
  }
  if (modifiers.altKey) return {
    left: start[0] - Math.abs(dx), right: start[0] + Math.abs(dx),
    top: start[1] - Math.abs(dy), bottom: start[1] + Math.abs(dy)
  };
  const x = start[0] + dx, y = start[1] + dy;
  return { left: Math.min(start[0], x), right: Math.max(start[0], x),
    top: Math.min(start[1], y), bottom: Math.max(start[1], y) };
}

/** Coverage is independent of destination RGB and alpha (including erasing).
 * Painting deltas cannot be mirrored: a source texel may already have the
 * selected color while its mirror does not. */
export function strokeStencil(width: number, height: number, start: Texel,
  end: Texel, size: number, brush: BrushShape): Uint8Array {
  const painted = drawStroke(new Array<number>(width * height * 4).fill(0),
    width, height, start, end, "#ffffff", size, 255, undefined, brush);
  const result = new Uint8Array(width * height);
  for (let i = 0; i < result.length; i++) result[i] = painted[i * 4 + 3] ? 1 : 0;
  return result;
}

const withinEllipse = (x: number, y: number, b: ShapeBounds): boolean => {
  if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
  // With a two-texel side, sample each texel as an area rather than
  // dropping whole end rows/columns of tiny ellipses.
  const thin = b.right - b.left === 1 || b.bottom - b.top === 1;
  const rx = thin ? (b.right - b.left + 1) / 2 : Math.max(0.5, (b.right - b.left) / 2);
  const ry = thin ? (b.bottom - b.top + 1) / 2 : Math.max(0.5, (b.bottom - b.top) / 2);
  const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 + 1e-10;
};

/** Clipped, brush-aware outline or brush-independent solid interior. */
export function shapeStencil(width: number, height: number, kind: GeometricTool,
  bounds: ShapeBounds, filled: boolean, size: number,
  brush: BrushShape): Uint8Array {
  const result = new Uint8Array(width * height);
  const inside = kind === "rectangle"
    ? (x: number, y: number) => x >= bounds.left && x <= bounds.right &&
      y >= bounds.top && y <= bounds.bottom
    : (x: number, y: number) => withinEllipse(x, y, bounds);
  const offsets = filled ? ([[0, 0]] as Texel[]) : brushOffsets(size, brush);
  // Only inspect in-sheet source texels; mirrored copies are clipped separately.
  for (let y = Math.max(0, bounds.top); y <= Math.min(height - 1, bounds.bottom); y++) {
    for (let x = Math.max(0, bounds.left); x <= Math.min(width - 1, bounds.right); x++) {
      if (!inside(x, y)) continue;
      if (!filled && inside(x - 1, y) && inside(x + 1, y) &&
          inside(x, y - 1) && inside(x, y + 1)) continue;
      for (const [ox, oy] of offsets) {
        const px = x + ox, py = y + oy;
        if (px >= 0 && py >= 0 && px < width && py < height) result[py * width + px] = 1;
      }
    }
  }
  return result;
}

/** A single operation stamps the source AND every mirrored copy, then clips
 * every destination to the selected face's UV mask, never to the source mask.
 * Even-width brush footprints are mirrored at the pixel level, not re-anchored. */
export function paintStencil(base: number[], width: number, height: number,
  stencil: Uint8Array, color: string, alpha: 0 | 255,
  symmetry: SymmetryMode, mask?: PixelMask): number[] {
  const result = [...base];
  const rgb = alpha ? hexToRGB(color) : [0, 0, 0];
  let changed = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!stencil[y * width + x]) continue;
    for (const [px, py] of mirroredTexels([x, y], width, height, symmetry)) {
      if (!insideMask(mask, px, py)) continue;
      const i = (py * width + px) * 4;
      if (result[i] !== rgb[0] || result[i + 1] !== rgb[1] ||
          result[i + 2] !== rgb[2] || result[i + 3] !== alpha) changed = true;
      result[i] = rgb[0]!; result[i + 1] = rgb[1]!;
      result[i + 2] = rgb[2]!; result[i + 3] = alpha;
    }
  }
  return changed ? result : base;
}

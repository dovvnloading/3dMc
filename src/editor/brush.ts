import type { PixelMask, Texel } from "./pixels";
import { insideMask } from "./pixels";

export type BrushShape = "square" | "round";
export const MIN_BRUSH_SIZE = 1;
export const MAX_BRUSH_SIZE = 16;

/**
 * The anchor is the central texel for odd footprints. Even footprints place
 * their extra row/column to the right and bottom of the anchor (size 2 => [0,1]).
 * A round footprint includes texels whose centers fall in the disk of radius
 * size/2 around the center of the size-by-size bounding square.
 */
export function brushOffsets(size: number, shape: BrushShape): Texel[] {
  if (!Number.isSafeInteger(size) || size < MIN_BRUSH_SIZE || size > MAX_BRUSH_SIZE)
    throw new RangeError("Brush size must be an integer between 1 and 16.");
  const before = Math.floor((size - 1) / 2);
  const center = (size - 1) / 2;
  const radiusSquared = size * size / 4;
  const offsets: Texel[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (shape === "round" &&
        (x - center) ** 2 + (y - center) ** 2 > radiusSquared) continue;
    offsets.push([x - before, y - before]);
  }
  return offsets;
}

/** Exact clipped footprint, shared by the pixel engine and cursor outline. */
export function brushTexels(anchor: Texel, size: number, shape: BrushShape,
  width: number, height: number, mask?: PixelMask): Texel[] {
  return brushOffsets(size, shape).flatMap(([dx, dy]) => {
    const x = anchor[0] + dx, y = anchor[1] + dy;
    return x >= 0 && y >= 0 && x < width && y < height && insideMask(mask, x, y)
      ? [[x, y] as Texel] : [];
  });
}

/** Boundary of a collection of texels, as an SVG path in texture coordinates. */
export function footprintOutline(texels: readonly Texel[]): string {
  const occupied = new Set(texels.map(([x, y]) => x + "," + y));
  const lines: string[] = [];
  for (const [x, y] of texels) {
    if (!occupied.has(x + "," + (y - 1))) lines.push(`M${x} ${y}h1`);
    if (!occupied.has((x + 1) + "," + y)) lines.push(`M${x + 1} ${y}v1`);
    if (!occupied.has(x + "," + (y + 1))) lines.push(`M${x + 1} ${y + 1}h-1`);
    if (!occupied.has((x - 1) + "," + y)) lines.push(`M${x} ${y + 1}v-1`);
  }
  return lines.join(" ");
}

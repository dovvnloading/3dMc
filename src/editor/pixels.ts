/** Source pixels use a top-left origin; WebGL UVs have a bottom-left origin. */
export type Texel = readonly [number, number];

export function uvToTexel(u: number, v: number, width: number, height: number): Texel {
  return [
    Math.min(width - 1, Math.max(0, Math.floor(u * width))),
    Math.min(height - 1, Math.max(0, Math.floor((1 - v) * height)))
  ];
}

export function hexToRGB(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Deterministic nearest-texel brush; caller owns gesture history. */
export function drawStroke(
  pixels: number[], width: number, height: number,
  start: Texel, end: Texel, color: string, size: 1 | 2 | 4,
  alpha: 0 | 255 = 255
): number[] {
  const result = [...pixels];
  const [r, g, b] = alpha === 0 ? [0, 0, 0] : hexToRGB(color);
  let x = start[0], y = start[1];
  const dx = Math.abs(end[0] - start[0]), dy = Math.abs(end[1] - start[1]);
  const sx = start[0] < end[0] ? 1 : -1;
  const sy = start[1] < end[1] ? 1 : -1;
  let error = dx - dy;
  for (;;) {
    for (let oy = 0; oy < size; oy++) {
      for (let ox = 0; ox < size; ox++) {
        const px = x + ox - Math.floor((size - 1) / 2);
        const py = y + oy - Math.floor((size - 1) / 2);
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const i = (py * width + px) * 4;
        result[i] = r; result[i + 1] = g; result[i + 2] = b; result[i + 3] = alpha;
      }
    }
    if (x === end[0] && y === end[1]) break;
    const doubled = error * 2;
    if (doubled > -dy) { error -= dy; x += sx; }
    if (doubled < dx) { error += dx; y += sy; }
  }
  return result;
}

/** Outline an inclusive texel rectangle using the same brush and RGBA rules. */
export function drawRectangle(
  pixels: number[], width: number, height: number,
  start: Texel, end: Texel, color: string, size: 1 | 2 | 4,
  alpha: 0 | 255 = 255
): number[] {
  const left = Math.min(start[0], end[0]), right = Math.max(start[0], end[0]);
  const top = Math.min(start[1], end[1]), bottom = Math.max(start[1], end[1]);
  let result = drawStroke(pixels, width, height, [left, top], [right, top], color, size, alpha);
  result = drawStroke(result, width, height, [right, top], [right, bottom], color, size, alpha);
  result = drawStroke(result, width, height, [right, bottom], [left, bottom], color, size, alpha);
  return drawStroke(result, width, height, [left, bottom], [left, top], color, size, alpha);
}

export function readHex(pixels: number[], width: number, [x, y]: Texel): string {
  const i = (y * width + x) * 4;
  return "#" + [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}


/**
 * Exact RGBA four-connected bucket fill. A region is bounded by all four
 * channels, so partially transparent neighbors cannot silently merge.
 * Maximum editable image is 64×64; no recursive call-stack growth.
 */
export function floodFill(
  pixels: number[], width: number, height: number,
  [x, y]: Texel, color: string
): number[] {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 64 || height > 64 ||
      pixels.length !== width * height * 4 ||
      !Number.isSafeInteger(x) || !Number.isSafeInteger(y) ||
      x < 0 || y < 0 || x >= width || y >= height) return pixels;
  const origin = (y * width + x) * 4;
  const previous = pixels.slice(origin, origin + 4);
  const next = [...hexToRGB(color), 255];
  if (previous.every((n, i) => n === next[i])) return pixels;
  const output = [...pixels];
  const queued = new Uint8Array(width * height);
  const frontier = [y * width + x];
  queued[y * width + x] = 1;
  for (let i = 0; i < frontier.length; i++) {
    const cell = frontier[i]!;
    const at = cell * 4;
    if (!previous.every((n, channel) => output[at + channel] === n)) continue;
    output[at] = next[0]!;
    output[at + 1] = next[1]!;
    output[at + 2] = next[2]!;
    output[at + 3] = next[3]!;
    const cx = cell % width;
    const cy = Math.floor(cell / width);
    const neighbors = [
      cx > 0 ? cell - 1 : -1,
      cx + 1 < width ? cell + 1 : -1,
      cy > 0 ? cell - width : -1,
      cy + 1 < height ? cell + width : -1
    ];
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && !queued[neighbor]) {
        queued[neighbor] = 1;
        // Do not enqueue through a different RGBA region.
        if (previous.every((n, channel) => output[neighbor * 4 + channel] === n))
          frontier.push(neighbor);
      }
    }
  }
  return output;
}

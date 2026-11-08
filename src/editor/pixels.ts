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
  start: Texel, end: Texel, color: string, size: 1 | 2 | 4
): number[] {
  const result = [...pixels];
  const [r, g, b] = hexToRGB(color);
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
        result[i] = r; result[i + 1] = g; result[i + 2] = b; result[i + 3] = 255;
      }
    }
    if (x === end[0] && y === end[1]) break;
    const doubled = error * 2;
    if (doubled > -dy) { error -= dy; x += sx; }
    if (doubled < dx) { error += dx; y += sy; }
  }
  return result;
}

export function readHex(pixels: number[], width: number, [x, y]: Texel): string {
  const i = (y * width + x) * 4;
  return "#" + [pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0]
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

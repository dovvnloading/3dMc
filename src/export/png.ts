import { zlibSync } from "fflate";

/**
 * Deterministic non-interlaced PNG encoder: straight 8-bit RGBA, top-left origin,
 * filter method 0. This code owns source pixels, not GPU texture data.
 */
const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function setU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 255;
  out[offset + 1] = (value >>> 16) & 255;
  out[offset + 2] = (value >>> 8) & 255;
  out[offset + 3] = value & 255;
}

export function crc32(data: Uint8Array): number {
  let result = 0xffffffff;
  for (const value of data) {
    result ^= value;
    for (let bit = 0; bit < 8; bit++) {
      result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);
    }
  }
  return (result ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length + 12);
  const tag = new TextEncoder().encode(type);
  if (tag.length !== 4) throw new Error("PNG chunks require four ASCII characters.");
  setU32(result, 0, data.length);
  result.set(tag, 4);
  result.set(data, 8);
  setU32(result, data.length + 8, crc32(result.subarray(4, data.length + 8)));
  return result;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export function encodeRgbaPng(width: number, height: number, pixels: readonly number[]): Uint8Array {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || width > 64 || height < 1 || height > 64 ||
      pixels.length !== width * height * 4 ||
      !pixels.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 255)) {
    throw new Error("PNG input must be a valid RGBA image no larger than 64×64.");
  }

  const rowSize = width * 4;
  const filtered = new Uint8Array(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    const sourceOffset = y * rowSize;
    const destOffset = y * (rowSize + 1);
    filtered[destOffset] = 0; // None filter
    filtered.set(pixels.slice(sourceOffset, sourceOffset + rowSize), destOffset + 1);
  }
  const header = new Uint8Array(13);
  setU32(header, 0, width);
  setU32(header, 4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA color
  header[10] = 0; // deflate compression
  header[11] = 0; // adaptive PNG filtering
  header[12] = 0; // no interlace

  return concatenate([
    SIGNATURE, chunk("IHDR", header),
    chunk("IDAT", zlibSync(filtered, { level: 6 })),
    chunk("IEND", new Uint8Array(0))
  ]);
}

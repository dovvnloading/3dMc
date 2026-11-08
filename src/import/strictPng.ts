
import { unzlibSync } from "fflate";
import { crc32 } from "../export/png";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const DEFLATE_LIMIT = 70_000;

export interface ImportedRgba {
  width: number;
  height: number;
  pixels: number[];
}

export class UnsupportedPackPng extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedPackPng";
  }
}

function reject(message: string): never { throw new UnsupportedPackPng(message); }

function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (const value of bytes) {
    a = (a + value) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Decodes only the lossless, non-interlaced RGBA8 filter-0 PNGs this app exports. */
export function read3dMcRgbaPng(bytes: Uint8Array): ImportedRgba {
  if (bytes.length < 57 || bytes.length > DEFLATE_LIMIT ||
      !SIGNATURE.every((value, i) => bytes[i] === value))
    reject("Not a supported PNG. Import requires 3dMc's RGBA8 texture output.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  let width = 0, height = 0;
  const chunks: Uint8Array[] = [];
  let phase: "start" | "image" | "data" | "end" = "start";
  while (pos < bytes.length) {
    if (pos + 12 > bytes.length) reject("PNG chunk is truncated.");
    const length = view.getUint32(pos, false);
    if (length > DEFLATE_LIMIT || pos + 12 + length > bytes.length)
      reject("PNG chunk exceeds the supported limit.");
    const name = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const content = bytes.subarray(pos + 8, pos + 8 + length);
    const expectedCrc = view.getUint32(pos + 8 + length, false);
    if (crc32(bytes.subarray(pos + 4, pos + 8 + length)) !== expectedCrc)
      reject("PNG checksum failed (" + name + ").");
    if (name === "IHDR" && phase === "start" && length === 13) {
      width = view.getUint32(pos + 8, false);
      height = view.getUint32(pos + 12, false);
      if (width < 1 || height < 1 || width > 64 || height > 64 ||
          content[8] !== 8 || content[9] !== 6 || content[10] !== 0 ||
          content[11] !== 0 || content[12] !== 0) {
        reject("PNG must be non-interlaced 8-bit RGBA with dimensions up to 64×64.");
      }
      phase = "image";
    } else if (name === "IDAT" && (phase === "image" || phase === "data")) {
      chunks.push(content);
      phase = "data";
    } else if (name === "IEND" && phase === "data" && length === 0) {
      phase = "end";
      pos += 12;
      break;
    } else {
      reject("Unsupported PNG chunk or chunk order: " + name);
    }
    pos += 12 + length;
  }
  if (phase !== "end" || pos !== bytes.length)
    reject("PNG is missing its final chunk or has trailing content.");

  const compressedLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (!compressedLength || compressedLength > DEFLATE_LIMIT)
    reject("PNG compressed data exceeds the supported limit.");
  const zlib = new Uint8Array(compressedLength);
  let offset = 0;
  for (const part of chunks) { zlib.set(part, offset); offset += part.length; }
  if (zlib.length < 6) reject("PNG zlib stream is incomplete.");
  const expectedBytes = height * (1 + width * 4);
  // Bounded output prevents an import from allocating a decompression bomb.
  // Compare zlib's Adler-32 against the exact expected output: a longer stream
  // truncated to the buffer cannot be mistaken for a valid image.
  const output = new Uint8Array(expectedBytes);
  try {
    unzlibSync(zlib, { out: output });
  } catch {
    reject("PNG pixel data could not be decoded.");
  }
  if (adler32(output) !== new DataView(zlib.buffer, zlib.byteOffset, zlib.byteLength)
      .getUint32(zlib.length - 4, false)) reject("PNG decompressed length or checksum is invalid.");

  const pixels = new Array<number>(width * height * 4);
  let dst = 0;
  for (let y = 0; y < height; y++) {
    const start = y * (1 + width * 4);
    if (output[start] !== 0) reject("This importer supports only PNG filter 0.");
    for (let i = 0; i < width * 4; i++) pixels[dst++] = output[start + 1 + i]!;
  }
  return { width, height, pixels };
}

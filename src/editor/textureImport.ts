import type { EditorDocument } from "./domain";
import { activeTexture, parseDocument } from "./domain";
import { crc32 } from "../export/png";

export const MAX_INPUT_PNG_BYTES = 1_500_000;
export const MAX_INPUT_PNG_SIDE = 256;
export const EDITABLE_TEXTURE_SIZES = [16, 32, 64] as const;
export type EditableTextureSize = typeof EDITABLE_TEXTURE_SIZES[number];
export type TextureImportPolicy = "keep-size" | "use-png-size";

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

export interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
}
export interface DecodedTexture {
  name: string;
  width: number;
  height: number;
  pixels: number[];
  hasAlpha: boolean;
  translucentPixels: number;
  opaquePixels: number;
}

export class TextureImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TextureImportError";
  }
}

function reject(message: string): never { throw new TextureImportError(message); }

export function inspectPngHeader(bytes: Uint8Array): PngHeader {
  if (bytes.length > MAX_INPUT_PNG_BYTES)
    reject("The PNG exceeds the 1.5 MB texture import limit.");
  if (bytes.length < 33 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b))
    reject("Choose a valid PNG file. Other image formats are not imported.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8, false) !== 13 ||
      String.fromCharCode(...bytes.slice(12, 16)) !== "IHDR")
    reject("The PNG does not start with a valid image header.");
  if (crc32(bytes.subarray(12, 29)) !== view.getUint32(29, false))
    reject("The PNG header checksum is invalid.");
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height || width > MAX_INPUT_PNG_SIDE || height > MAX_INPUT_PNG_SIDE)
    reject("Choose a PNG no larger than 256 × 256 pixels.");
  const bitDepth = bytes[24]!;
  const colorType = bytes[25]!;
  const supportedDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8],
    4: [8, 16], 6: [8, 16]
  };
  if (!supportedDepths[colorType]?.includes(bitDepth) ||
      bytes[26] !== 0 || bytes[27] !== 0 || (bytes[28] !== 0 && bytes[28] !== 1))
    reject("This PNG uses an unsupported color format or compression profile.");
  return { width, height, bitDepth, colorType };
}

/** Resampling uses integer nearest-neighbor coordinates; no interpolated colors. */
export function resampleNearest(
  rgba: readonly number[], sourceWidth: number, sourceHeight: number,
  width: number, height: number
): number[] {
  if (![sourceWidth, sourceHeight, width, height].every(n =>
    Number.isSafeInteger(n) && n > 0 && n <= MAX_INPUT_PNG_SIDE) ||
    rgba.length !== sourceWidth * sourceHeight * 4)
    reject("The source texture has invalid dimensions or pixel data.");

  if (width === sourceWidth && height === sourceHeight) return [...rgba];
  const output = new Array<number>(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
      const source = (sy * sourceWidth + sx) * 4;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel++)
        output[target + channel] = rgba[source + channel]!;
    }
  }
  return output;
}

export function canAdoptPngDimensions(image: Pick<DecodedTexture, "width" | "height">): boolean {
  return image.width === image.height &&
    EDITABLE_TEXTURE_SIZES.some(n => n === image.width);
}

export function importTextureIntoDocument(
  document: EditorDocument, image: DecodedTexture, policy: TextureImportPolicy
): EditorDocument {
  if (policy !== "keep-size" && policy !== "use-png-size")
    reject("Choose a supported texture replacement policy.");
  if (!image.name.trim() || image.name.length > 100 ||
      image.pixels.length !== image.width * image.height * 4 ||
      image.pixels.some(n => !Number.isSafeInteger(n) || n < 0 || n > 255))
    reject("The selected PNG contains invalid RGBA data.");
  if (policy === "use-png-size" && !canAdoptPngDimensions(image))
    reject("Adopting image size requires a square 16, 32 or 64-pixel PNG.");

  const current = activeTexture(document);
  const width = policy === "use-png-size" ? image.width : current.width;
  const height = policy === "use-png-size" ? image.height : current.height;
  const pixels = resampleNearest(image.pixels, image.width, image.height, width, height);
  return parseDocument({
    ...document,
    textures: document.textures.map(t => t.id === current.id
      ? { ...t, name: image.name, width, height, pixels } : t)
  });
}

/**
 * Browser-native PNG decoding accepts common palette, grayscale and RGBA PNGs.
 * The IHDR budget is checked before the browser decoder receives untrusted
 * bytes. PNG content is converted into the editor's authoritative RGBA sheet.
 * Transparent RGB may be normalized by the browser canvas; this is disclosed
 * in the preflight rather than claiming exact source-file preservation.
 */
export async function decodeBrowserPng(file: File): Promise<DecodedTexture> {
  if (file.size > MAX_INPUT_PNG_BYTES)
    reject("The PNG exceeds the 1.5 MB texture import limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = inspectPngHeader(bytes);
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none"
    });
    if (bitmap.width !== header.width || bitmap.height !== header.height)
      reject("The decoded PNG dimensions do not match its image header.");
    const canvas = document.createElement("canvas");
    canvas.width = header.width;
    canvas.height = header.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) reject("The browser could not decode PNG pixels.");
    context.drawImage(bitmap, 0, 0);
    const pixels = Array.from(context.getImageData(0, 0, header.width, header.height).data);
    let translucentPixels = 0;
    let opaquePixels = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) translucentPixels++;
      else opaquePixels++;
    }
    const name = file.name.slice(0, 100) || "imported.png";
    return {
      name, width: header.width, height: header.height, pixels,
      translucentPixels, opaquePixels, hasAlpha: translucentPixels > 0
    };
  } catch (error) {
    if (error instanceof TextureImportError) throw error;
    return reject("The browser couldn't decode this PNG. Check that the file isn't damaged.");
  } finally {
    bitmap?.close();
  }
}

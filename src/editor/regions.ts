import type { EditorDocument, FaceDirection, FaceUVRect, PixelTexture } from "./domain";
import { copyFaces, FACE_DIRECTIONS, MAX_TEXTURE_SLOTS, setTexturePixels, textureById } from "./domain";

export interface PixelRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface PixelClipboard { readonly width: number; readonly height: number; readonly pixels: readonly number[]; }
export class TextureEditError extends Error {
  constructor(message: string) { super(message); this.name = "TextureEditError"; }
}
const integer = (n: number) => Number.isSafeInteger(n);
function assertImage(image: PixelClipboard): void {
  if (!integer(image.width) || !integer(image.height) || image.width < 1 || image.height < 1 ||
      image.width > 64 || image.height > 64 || image.pixels.length !== image.width * image.height * 4 ||
      image.pixels.some(n => !integer(n) || n < 0 || n > 255))
    throw new TextureEditError("Invalid bounded RGBA image. No pixels were changed.");
}
export function assertPixelRect(image: Pick<PixelClipboard, "width" | "height">, rect: PixelRect): void {
  if (![rect.x, rect.y, rect.width, rect.height].every(integer) || rect.x < 0 || rect.y < 0 ||
      rect.width < 1 || rect.height < 1 || rect.x + rect.width > image.width || rect.y + rect.height > image.height)
    throw new TextureEditError("The complete region must fit inside the texture. Nothing is cropped or resized.");
}
export function copyPixelRegion(image: PixelClipboard, rect: PixelRect): PixelClipboard {
  assertImage(image); assertPixelRect(image, rect);
  const pixels: number[] = [];
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * image.width + rect.x) * 4;
    pixels.push(...image.pixels.slice(start, start + rect.width * 4));
  }
  return { width: rect.width, height: rect.height, pixels };
}
export function pastePixelRegion(image: PixelClipboard, clipboard: PixelClipboard, x: number, y: number): number[] {
  assertImage(image); assertImage(clipboard);
  assertPixelRect(image, { x, y, width: clipboard.width, height: clipboard.height });
  const result = [...image.pixels];
  for (let row = 0; row < clipboard.height; row++) for (let column = 0; column < clipboard.width; column++) {
    const source = (row * clipboard.width + column) * 4;
    const target = ((row + y) * image.width + column + x) * 4;
    for (let channel = 0; channel < 4; channel++) result[target + channel] = clipboard.pixels[source + channel]!;
  }
  return result;
}
export function mirrorPixelRegion(image: PixelClipboard, rect: PixelRect, axis: "horizontal" | "vertical"): number[] {
  const copied = copyPixelRegion(image, rect), pixels: number[] = [];
  for (let y = 0; y < copied.height; y++) for (let x = 0; x < copied.width; x++) {
    const sourceX = axis === "horizontal" ? copied.width - x - 1 : x;
    const sourceY = axis === "vertical" ? copied.height - y - 1 : y;
    const start = (sourceY * copied.width + sourceX) * 4;
    pixels.push(...copied.pixels.slice(start, start + 4));
  }
  return pastePixelRegion(image, { ...copied, pixels }, rect.x, rect.y);
}
export function clearPixelRegion(image: PixelClipboard, rect: PixelRect): number[] {
  assertImage(image); assertPixelRect(image, rect);
  return pastePixelRegion(image, { width: rect.width, height: rect.height,
    pixels: new Array<number>(rect.width * rect.height * 4).fill(0) }, rect.x, rect.y);
}

/** A modal stages arbitrary region operations; Apply publishes exactly one revision. */
export function commitTextureDraft(current: EditorDocument, source: EditorDocument,
  textureId: string, pixels: number[]): EditorDocument {
  if (current !== source) throw new TextureEditError("The project changed while this preview was open. Cancel and reopen it; your newer work was not changed.");
  const texture = textureById(source, textureId);
  if (!texture) throw new TextureEditError("The texture no longer exists. No pixels were changed.");
  assertImage({ width: texture.width, height: texture.height, pixels });
  if (texture.layers)
    throw new TextureEditError(
      "This sheet has editable layers. Flatten it in Paint mode before using whole-sheet region operations."
    );
  return setTexturePixels(current, pixels, textureId);
}

export interface FaceReference { readonly nodeId: string; readonly name: string; readonly face: FaceDirection; }
function normalized(rect: FaceUVRect) {
  return [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])] as const;
}
/** Positive-area intersection; shared edges are not reported as overlapping regions. */
export function overlappingFaces(document: EditorDocument, nodeId: string, direction: FaceDirection): FaceReference[] {
  const node = document.cuboids.find(n => n.id === nodeId);
  if (!node || node.material !== "texture") return [];
  const selected = node.faces[direction], [left, top, right, bottom] = normalized(selected.uv);
  const matches: FaceReference[] = [];
  for (const other of document.cuboids) {
    if (other.material !== "texture") continue;
    for (const face of FACE_DIRECTIONS) {
      if (other.id === nodeId && face === direction) continue;
      const binding = other.faces[face]; if (binding.textureId !== selected.textureId) continue;
      const [x1, y1, x2, y2] = normalized(binding.uv);
      if (Math.min(right, x2) > Math.max(left, x1) && Math.min(bottom, y2) > Math.max(top, y1))
        matches.push({ nodeId: other.id, name: other.name, face });
    }
  }
  return matches;
}
function editableFace(document: EditorDocument, nodeId: string, direction: FaceDirection) {
  const node = document.cuboids.find(n => n.id === nodeId);
  if (!node || node.material !== "texture" || node.locked || !node.visible)
    throw new TextureEditError("Select a visible, unlocked painted part before changing its face binding.");
  const texture = textureById(document, node.faces[direction].textureId);
  if (!texture) throw new TextureEditError("The face texture is missing.");
  return { node, texture };
}
export function reverseFaceUV(document: EditorDocument, nodeId: string, direction: FaceDirection, axis: "u" | "v"): EditorDocument {
  const { node } = editableFace(document, nodeId, direction);
  const faces = copyFaces(node.faces), [u1, v1, u2, v2] = faces[direction].uv;
  faces[direction].uv = axis === "u" ? [u2, v1, u1, v2] : [u1, v2, u2, v1];
  return { ...document, cuboids: document.cuboids.map(item => item.id === nodeId ? { ...node, faces } : item) };
}
/** Copy the whole sheet, not a repacked crop: UVs/rotations remain byte-for-byte intact. */
export function makeFaceTextureUnique(document: EditorDocument, nodeId: string, direction: FaceDirection, newId: string): EditorDocument {
  const { node, texture } = editableFace(document, nodeId, direction);
  if (document.textures.length >= MAX_TEXTURE_SLOTS)
    throw new TextureEditError("All 16 texture slots are in use. Remove/remap a texture before making this face unique.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(newId) || textureById(document, newId))
    throw new TextureEditError("The new texture identifier is invalid or already exists.");
  const copied: PixelTexture = { ...texture, id: newId, name: (node.name + " · " + direction).slice(0, 100),
    pixels: [...texture.pixels],
    ...(texture.layers ? { layers: texture.layers.map(layer => ({ ...layer, pixels: [...layer.pixels] })) } : {})
  };
  const faces = copyFaces(node.faces); faces[direction].textureId = newId;
  return { ...document, activeTextureId: newId, textures: [...document.textures, copied],
    cuboids: document.cuboids.map(item => item.id === nodeId ? { ...node, faces } : item) };
}

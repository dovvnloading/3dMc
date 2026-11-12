import type { EditorDocument, Vec3 } from "./domain";
import { activeTexture, setTexturePixels, textureById, updateCuboid } from "./domain";
import type { Texel, PixelMask } from "./pixels";
import { drawRectangle, drawStroke } from "./pixels";

export type BrushSize = 1 | 2 | 4;
export type BrushMode = "pencil" | "eraser" | "line" | "rectangle";
export interface PaintGesture {
  /** One immutable source document, captured before any preview pixels. */
  readonly source: EditorDocument;
  readonly textureId: string;
  readonly pixels: number[];
  readonly face: string;
  readonly previous: Texel;
  /** Shapes always rebuild the preview from this immutable start point. */
  readonly start: Texel;
  readonly brush: BrushMode;
  readonly mask?: PixelMask;
  readonly color: string;
  readonly size: BrushSize;
  readonly alpha: 0 | 255;
}

/** Pure preview state: starting a gesture does not mutate the document. */
export function beginPaintGesture(
  source: EditorDocument, texel: Texel, face: string,
  color: string, size: BrushSize, brush: BrushMode = "pencil",
  textureId = source.activeTextureId, mask?: PixelMask
): PaintGesture {
  const texture = textureById(source, textureId) ?? activeTexture(source);
  const alpha: 0 | 255 = brush === "eraser" ? 0 : 255;
  return {
    source, textureId: texture.id,
    pixels: drawStroke(texture.pixels, texture.width,
      texture.height, texel, texel, color, size, alpha, mask),
    previous: texel, start: texel, brush, mask, face, color, size, alpha
  };
}

export function continuePaintGesture(
  gesture: PaintGesture, texel: Texel, face: string
): PaintGesture {
  const source = textureById(gesture.source, gesture.textureId)!;
  if (gesture.brush === "line" || gesture.brush === "rectangle") {
    // A geometric shape is one face-local operation. Do not connect sampled
    // coordinates across other 3D faces or UV seams.
    if (face !== gesture.face) return gesture;
    const shape = gesture.brush === "line" ? drawStroke : drawRectangle;
    return { ...gesture,
      pixels: shape(source.pixels, source.width, source.height,
        gesture.start, texel, gesture.color, gesture.size, gesture.alpha, gesture.mask),
      previous: texel
    };
  }
  // The freehand brush never connects through a UV atlas seam or cuboid.
  const from = face === gesture.face ? gesture.previous : texel;
  return { ...gesture,
    pixels: drawStroke(gesture.pixels, source.width, source.height,
      from, texel, gesture.color, gesture.size, gesture.alpha, gesture.mask),
    previous: texel, face
  };
}

/** Apply at most one history entry after the caller verifies the source session. */
export function commitPaintGesture(
  document: EditorDocument, gesture: PaintGesture
): EditorDocument {
  if (document !== gesture.source) return document;
  return setTexturePixels(document, gesture.pixels, gesture.textureId);
}

/** Cancel returns the identical original reference and creates no history. */
export function cancelPaintGesture(gesture: PaintGesture): EditorDocument {
  return gesture.source;
}

/**
 * Three.js manipulates temporary group transforms. A committed pointer-up
 * converts one final transform to model units; cancel never calls this function.
 */
export function commitGizmoTransform(
  document: EditorDocument, id: string, position: Vec3, scale: Vec3
): EditorDocument {
  return updateCuboid(document, id, (node) => {
    const center = [
      (node.from[0] + node.to[0] - 16) / 32,
      (node.from[1] + node.to[1]) / 32,
      (node.from[2] + node.to[2] - 16) / 32
    ];
    const delta = position.map((n, i) => (n - center[i]!) * 16);
    const middle = node.from.map((n, i) => (n + node.to[i]!) / 2);
    const from = node.from.map((n, i) => {
      const factor = scale[i]!;
      return Math.abs(factor - 1) < .00001 ? n + delta[i]! :
        middle[i]! + delta[i]! - (node.to[i]! - n) * factor / 2;
    }) as [number, number, number];
    const to = node.to.map((n, i) => {
      const factor = scale[i]!;
      return Math.abs(factor - 1) < .00001 ? n + delta[i]! :
        middle[i]! + delta[i]! + (n - node.from[i]!) * factor / 2;
    }) as [number, number, number];
    const round = (n: number) => Math.round(n * 10000) / 10000;
    if (node.from.every((n, i) => Math.abs(n - from[i]!) < .00001) &&
        node.to.every((n, i) => Math.abs(n - to[i]!) < .00001)) return node;
    return { ...node, from: from.map(round) as [number, number, number],
      to: to.map(round) as [number, number, number] };
  });
}

import type { EditorDocument, Vec3 } from "./domain";
import { setTexturePixels, updateCuboid } from "./domain";
import type { Texel } from "./pixels";
import { drawStroke } from "./pixels";

export type BrushSize = 1 | 2 | 4;
export type BrushMode = "pencil" | "eraser";
export interface PaintGesture {
  /** One immutable source document, captured before any preview pixels. */
  readonly source: EditorDocument;
  readonly pixels: number[];
  readonly face: string;
  readonly previous: Texel;
  readonly color: string;
  readonly size: BrushSize;
  readonly alpha: 0 | 255;
}

/** Pure preview state: starting a gesture does not mutate the document. */
export function beginPaintGesture(
  source: EditorDocument, texel: Texel, face: string,
  color: string, size: BrushSize, brush: BrushMode = "pencil"
): PaintGesture {
  const alpha: 0 | 255 = brush === "eraser" ? 0 : 255;
  return {
    source, pixels: drawStroke(source.texture.pixels, source.texture.width,
      source.texture.height, texel, texel, color, size, alpha),
    previous: texel, face, color, size, alpha
  };
}

export function continuePaintGesture(
  gesture: PaintGesture, texel: Texel, face: string
): PaintGesture {
  const source = gesture.source.texture;
  // Never draw a connecting line through a UV atlas seam or across cuboids.
  const from = face === gesture.face ? gesture.previous : texel;
  return { ...gesture,
    pixels: drawStroke(gesture.pixels, source.width, source.height,
      from, texel, gesture.color, gesture.size, gesture.alpha),
    previous: texel, face
  };
}

/** Apply at most one history entry after the caller verifies the source session. */
export function commitPaintGesture(
  document: EditorDocument, gesture: PaintGesture
): EditorDocument {
  if (document !== gesture.source) return document;
  return setTexturePixels(document, gesture.pixels);
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

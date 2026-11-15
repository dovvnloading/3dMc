import type { EditorDocument, Vec3 } from "./domain";
import { activeTexture, setTexturePixels, textureById, updateCuboid } from "./domain";
import { mapRotationToBounds } from "./elementRotation";
import type { Texel, PixelMask } from "./pixels";
import { paintStencil, shapeBounds, shapeStencil, strokeStencil } from "./paintGeometry";
import type { PaintModifiers, SymmetryMode } from "./paintGeometry";
import type { BrushShape } from "./brush";
import { activeRasterLayer, previewRasterLayer, setRasterLayerPixels } from "./layers";

export type BrushSize = number;
export type BrushMode = "pencil" | "eraser" | "line" | "rectangle" | "ellipse";
export interface PaintGesture {
  /** One immutable source document, captured before any preview pixels. */
  readonly source: EditorDocument;
  readonly textureId: string;
  /** Render-ready flattened composite, never persisted before pointer-up. */
  readonly pixels: number[];
  readonly layerId?: string;
  readonly layerPixels?: number[];
  readonly face: string;
  readonly previous: Texel;
  /** Shapes always rebuild the preview from this immutable start point. */
  readonly start: Texel;
  readonly brush: BrushMode;
  readonly mask?: PixelMask;
  readonly color: string;
  readonly size: BrushSize;
  readonly shape: BrushShape;
  readonly alpha: 0 | 255;
  readonly symmetry: SymmetryMode;
  readonly filled: boolean;
}

/** Pure preview state: starting a gesture does not mutate the document. */
export function beginPaintGesture(
  source: EditorDocument, texel: Texel, face: string,
  color: string, size: BrushSize, brush: BrushMode = "pencil",
  textureId = source.activeTextureId, mask?: PixelMask, shape: BrushShape = "square",
  symmetry: SymmetryMode = "off", filled = false, modifiers: PaintModifiers = {}
): PaintGesture {
  const texture = textureById(source, textureId) ?? activeTexture(source);
  const alpha: 0 | 255 = brush === "eraser" ? 0 : 255;
  const layer = activeRasterLayer(texture);
  if (texture.layers && !layer)
    throw new Error("Select a texture layer before painting.");
  if (layer && (!layer.visible || layer.opacity === 0))
    throw new Error("Show the active layer and increase its opacity before painting.");
  const raw = layer?.pixels ?? texture.pixels;
  const stencil = brush === "rectangle" || brush === "ellipse"
    ? shapeStencil(texture.width, texture.height, brush,
      shapeBounds(texel, texel, modifiers), filled, size, shape)
    : strokeStencil(texture.width, texture.height, texel, texel, size, shape);
  const pixels = paintStencil(raw, texture.width, texture.height,
    stencil, color, alpha, symmetry, mask);
  return {
    source, textureId: texture.id,
    pixels: layer ? previewRasterLayer(texture, layer.id, pixels) : pixels,
    ...(layer ? { layerId: layer.id, layerPixels: pixels } : {}),
    previous: texel, start: texel, brush, mask, face, color, size, alpha, shape,
    symmetry, filled
  };
}

export function continuePaintGesture(
  gesture: PaintGesture, texel: Texel, face: string, modifiers: PaintModifiers = {}
): PaintGesture {
  const source = textureById(gesture.source, gesture.textureId)!;
  const layer = gesture.layerId
    ? source.layers?.find(entry => entry.id === gesture.layerId) : null;
  const original = layer?.pixels ?? source.pixels;
  const compose = (pixels: number[]) => gesture.layerId
    ? { layerPixels: pixels, pixels: previewRasterLayer(source, gesture.layerId, pixels) }
    : { pixels };
  if (gesture.brush === "line" || gesture.brush === "rectangle" || gesture.brush === "ellipse") {
    // Shapes are face-local and rebuilt from the immutable source, never
    // accumulated from prior previews or connected across UV seams.
    if (face !== gesture.face) return gesture;
    const stencil = gesture.brush === "line"
      ? strokeStencil(source.width, source.height, gesture.start, texel,
        gesture.size, gesture.shape)
      : shapeStencil(source.width, source.height, gesture.brush,
        shapeBounds(gesture.start, texel, modifiers), gesture.filled,
        gesture.size, gesture.shape);
    return { ...gesture, ...compose(paintStencil(original, source.width, source.height,
      stencil, gesture.color, gesture.alpha, gesture.symmetry, gesture.mask)),
      previous: texel
    };
  }
  // A freehand stroke connects only within its current face.
  const from = face === gesture.face ? gesture.previous : texel;
  const stencil = strokeStencil(source.width, source.height, from, texel,
    gesture.size, gesture.shape);
  return { ...gesture,
    ...compose(paintStencil(gesture.layerPixels ?? gesture.pixels,
      source.width, source.height, stencil, gesture.color, gesture.alpha,
      gesture.symmetry, gesture.mask)),
    previous: texel, face
  };
}

/** Apply at most one history entry after the caller verifies the source session. */
export function commitPaintGesture(
  document: EditorDocument, gesture: PaintGesture
): EditorDocument {
  if (document !== gesture.source) return document;
  return gesture.layerId && gesture.layerPixels
    ? setRasterLayerPixels(document, gesture.textureId, gesture.layerId, gesture.layerPixels)
    : setTexturePixels(document, gesture.pixels, gesture.textureId);
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
    const nextFrom = from.map(round) as [number, number, number];
    const nextTo = to.map(round) as [number, number, number];
    return { ...node, from: nextFrom, to: nextTo,
      ...(node.rotation ? { rotation: mapRotationToBounds(node, nextFrom, nextTo) } : {}) };
  });
}

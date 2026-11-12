import type { EditorDocument, FaceDirection, FaceRotation, FaceUV, FaceUVRect } from "./domain";
import { updateCuboid } from "./domain";

/** Dragging updates only editor UV coordinates, never texture pixels or geometry. */
export type UVDragHandle = "move" | "nw" | "ne" | "sw" | "se";
export type FaceUVClipboard = Pick<FaceUV, "uv" | "rotation">;

const bound = (value: number, lower: number, upper: number) =>
  Math.max(lower, Math.min(value, upper));
const round = (value: number) => Math.round(value * 10000) / 10000;

function validRect(rect: FaceUVRect): boolean {
  return rect.length === 4 && rect.every(value =>
    Number.isFinite(value) && value >= 0 && value <= 16) &&
    rect[0] !== rect[2] && rect[1] !== rect[3];
}

/**
 * Work in image-pixel coordinates so a 16px and a 64px sheet snap to their
 * actual texels. UV edges may be reversed; dragging cannot accidentally flip
 * their direction or zero their area. "move" preserves the exact UV span.
 */
export function dragFaceUV(rect: FaceUVRect, handle: UVDragHandle,
                           deltaPixels: readonly [number, number],
                           width: number, height: number, pixelSnap = true): FaceUVRect {
  if (!validRect(rect) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 64 || height > 64 ||
      deltaPixels.length !== 2 || !deltaPixels.every(Number.isFinite) ||
      !["move", "nw", "ne", "sw", "se"].includes(handle))
    throw new Error("Invalid UV drag coordinates. The mapping was not changed.");
  if (deltaPixels[0] === 0 && deltaPixels[1] === 0) return rect;
  const delta = (pixels: number, dimension: number) =>
    (pixelSnap ? Math.round(pixels) : pixels) * 16 / dimension;
  const dx = delta(deltaPixels[0], width), dy = delta(deltaPixels[1], height);
  if (handle === "move") {
    const shiftX = bound(dx, -Math.min(rect[0], rect[2]), 16 - Math.max(rect[0], rect[2]));
    const shiftY = bound(dy, -Math.min(rect[1], rect[3]), 16 - Math.max(rect[1], rect[3]));
    return [
      round(rect[0] + shiftX), round(rect[1] + shiftY),
      round(rect[2] + shiftX), round(rect[3] + shiftY)
    ];
  }
  const uField = handle === "nw" || handle === "sw" ? 0 : 2;
  const vField = handle === "nw" || handle === "ne" ? 1 : 3;
  const result = [...rect] as [number, number, number, number];
  const editEdge = (field: 0 | 1 | 2 | 3, dimension: number, distance: number) => {
    const other = rect[field === 0 ? 2 : field === 2 ? 0 : field === 1 ? 3 : 1];
    const step = pixelSnap ? 16 / dimension : 0.0001;
    const minimum = Math.min(step, Math.abs(rect[field] - other));
    const original = rect[field];
    const raw = original + distance;
    const candidate = pixelSnap ? Math.round(raw * dimension / 16) * 16 / dimension : raw;
    return round(original < other ?
      bound(candidate, 0, other - minimum) :
      bound(candidate, other + minimum, 16));
  };
  result[uField] = editEdge(uField, width, dx);
  result[vField] = editEdge(vField, height, dy);
  return result;
}

/** Copy only UV bounds and rotation; pasting cannot change the texture asset. */
export function copyFaceUV(face: FaceUV): FaceUVClipboard {
  return { uv: [...face.uv] as unknown as FaceUVRect, rotation: face.rotation };
}

/** One validated document edit for interactive dragging or UV copy/paste. */
export function applyFaceUV(document: EditorDocument, nodeId: string, face: FaceDirection,
                            mapping: FaceUVClipboard, expected?: FaceUV): EditorDocument {
  if (!validRect(mapping.uv) || !([0, 90, 180, 270] as FaceRotation[]).includes(mapping.rotation))
    throw new Error("Invalid face UV mapping. No source was changed.");
  return updateCuboid(document, nodeId, node => {
    const before = node.faces[face];
    if (expected && before !== expected) return node;
    if (before.rotation === mapping.rotation &&
        before.uv.every((value, index) => value === mapping.uv[index])) return node;
    return { ...node, faces: { ...node.faces, [face]: {
      ...before, uv: [...mapping.uv] as unknown as FaceUVRect, rotation: mapping.rotation
    } } };
  });
}

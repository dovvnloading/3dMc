import type { Cuboid, CuboidFaces, EditorDocument, FaceDirection, FaceUVRect } from "./domain";
import { FACE_DIRECTIONS, isValidCuboid, updateCuboid } from "./domain";

/**
 * Build a compact nonoverlapping six-face cross layout inside the logical
 * 0–16 UV atlas. Face dimensions match model X/Y/Z proportions; no PNG
 * pixels, face texture bindings, or model geometry are changed.
 */
export function boxUVLayout(node: Cuboid): Record<FaceDirection, FaceUVRect> {
  if (!isValidCuboid(node)) throw new Error("Cannot unwrap invalid cuboid geometry.");
  const w = node.to[0] - node.from[0];
  const h = node.to[1] - node.from[1];
  const d = node.to[2] - node.from[2];
  const sheetWidth = 2 * (w + d);
  const sheetHeight = h + 2 * d;
  const scale = Math.min(16 / sheetWidth, 16 / sheetHeight);
  const ox = (16 - sheetWidth * scale) / 2;
  const oy = (16 - sheetHeight * scale) / 2;
  const rect = (x1: number, y1: number, x2: number, y2: number): FaceUVRect => {
    const exact: FaceUVRect = [ox + x1 * scale, oy + y1 * scale,
      ox + x2 * scale, oy + y2 * scale];
    const rounded = exact.map(value => Math.round(value * 1_000_000) / 1_000_000) as unknown as FaceUVRect;
    // Very thin but valid parts should not become zero-area UV faces after rounding.
    return rounded[0] < rounded[2] && rounded[1] < rounded[3] ? rounded : exact;
  };
  const result: Record<FaceDirection, FaceUVRect> = {
    up: rect(d, 0, d + w, d),
    down: rect(d, d + h, d + w, 2 * d + h),
    west: rect(0, d, d, d + h),
    north: rect(d, d, d + w, d + h),
    east: rect(d + w, d, d + w + d, d + h),
    south: rect(d + w + d, d, 2 * (d + w), d + h)
  };
  if (Object.values(result).some(uv =>
    uv[0] >= uv[2] || uv[1] >= uv[3] ||
    uv.some(value => value < 0 || value > 16)))
    throw new Error("Box UV layout cannot fit in the 0–16 texture region.");
  return result;
}

/** Apply all six rectangles as one command while retaining per-face textures. */
export function generateBoxUV(document: EditorDocument, nodeId: string): EditorDocument {
  const node = document.cuboids.find(part => part.id === nodeId);
  if (!node) throw new Error("Choose a cuboid before generating a box UV layout.");
  if (node.locked || !node.visible)
    throw new Error("Unlock and show the cuboid before generating its UV layout.");
  const layout = boxUVLayout(node);
  const faces = Object.fromEntries(FACE_DIRECTIONS.map(direction => [
    direction, { ...node.faces[direction], uv: layout[direction], rotation: 0 }
  ])) as unknown as CuboidFaces;
  return updateCuboid(document, nodeId, current => ({ ...current, faces }));
}

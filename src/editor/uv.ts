import type { CuboidFaces, FaceDirection, FaceRotation, FaceUV, FaceUVRect } from "./domain";
import { FACE_DIRECTIONS } from "./domain";
import type { BoxGeometry } from "three";

/** Three.js BoxGeometry's buildPlane order, two triangles per side. */
export const BOX_FACE_ORDER = [
  "east", "west", "up", "down", "south", "north"
] as const satisfies readonly FaceDirection[];

export function faceFromTriangle(index: number): FaceDirection | null {
  return Number.isSafeInteger(index) && index >= 0 && index < 12
    ? BOX_FACE_ORDER[Math.floor(index / 2)]!
    : null;
}

export type UVPoint = readonly [number, number];

/**
 * Input local surface coordinates have origin top-left. The Minecraft logical
 * UV region can be reversed, so mirrored mappings remain explicit. A 90 degree
 * clockwise face rotation samples from the image's bottom-left corner at the
 * face's top-left; the down face is intentionally reversed per format notes.
 */
export function localToLogicalUV(
  face: FaceDirection, binding: FaceUV, s: number, t: number
): UVPoint {
  const rotation = face === "down"
    ? ((360 - binding.rotation) % 360) as FaceRotation
    : binding.rotation;
  let u = s, v = t;
  if (rotation === 90) { u = t; v = 1 - s; }
  else if (rotation === 180) { u = 1 - s; v = 1 - t; }
  else if (rotation === 270) { u = 1 - t; v = s; }
  const [u1, v1, u2, v2] = binding.uv;
  return [u1 + (u2 - u1) * u, v1 + (v2 - v1) * v];
}

/** The normalized Three.js UV convention has V=0 at image bottom. */
export function localToThreeUV(face: FaceDirection, binding: FaceUV, s: number, t: number): UVPoint {
  const [u, v] = localToLogicalUV(face, binding, s, t);
  return [u / 16, 1 - v / 16];
}

export function logicalUVToPixelRect(
  rect: FaceUVRect, width: number, height: number
): [number, number, number, number] {
  return [
    rect[0] * width / 16, rect[1] * height / 16,
    rect[2] * width / 16, rect[3] * height / 16
  ];
}

/**
 * Updates an ordinary BoxGeometry's 24 face vertices from canonical face
 * metadata. The baked UV is also returned by raycaster intersections, so
 * 3D painting consumes the exact same texture pixels as the preview.
 */
export function applyFaceUvs(geometry: BoxGeometry, faces: CuboidFaces): void {
  const uv = geometry.getAttribute("uv");
  if (!uv || uv.count !== 24) throw new Error("Expected a six-plane BoxGeometry with 24 UV vertices.");
  for (let faceIndex = 0; faceIndex < BOX_FACE_ORDER.length; faceIndex++) {
    const name = BOX_FACE_ORDER[faceIndex]!;
    const binding = faces[name];
    for (let vertex = 0; vertex < 4; vertex++) {
      const index = faceIndex * 4 + vertex;
      const originalS = uv.getX(index);
      const originalT = 1 - uv.getY(index);
      const [mappedU, mappedV] = localToThreeUV(name, binding, originalS, originalT);
      uv.setXY(index, mappedU, mappedV);
    }
  }
  uv.needsUpdate = true;
}

export function faceLabel(face: FaceDirection): string {
  return face.charAt(0).toUpperCase() + face.slice(1);
}

export function faceOptions(): FaceDirection[] {
  return [...FACE_DIRECTIONS];
}

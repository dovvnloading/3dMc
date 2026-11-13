import type { EditorDocument, Vec3 } from "./domain";

/**
 * Camera framing independent of the renderer. Uses the actual bounds of
 * visible cuboids rather than a fixed distance that makes complex models tiny.
 * It considers the near corners of a perspective view, not only a sphere,
 * and fits both wide and narrow workspaces without clipping.
 */
export type CameraView = "iso" | "front" | "right" | "top";
export interface CameraFrame {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly distance: number;
}
const FOV_RADIANS = 40 * Math.PI / 180;
const FOV_TAN = Math.tan(FOV_RADIANS / 2);
const directions: Record<CameraView, Vec3> = {
  iso: [2.9, 1.77, 3.2], front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0.0001]
};
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]];
}
function unit(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function isAetherheartShowcase(doc: EditorDocument): boolean {
  // Recognize renamed/saved copies while avoiding a misleading showcase card
  // for unrelated documents merely named "The Aetherheart".
  return doc.groups?.some(g => g.id === "heart") === true &&
    doc.groups.some(g => g.id === "gimbals") &&
    doc.textures.some(texture => texture.id === "aether");
}

/**
 * 0.78 fill makes the authored showcase the hero; retain the old generous
 * editing margin for ordinary 3dMc projects. Changing a view or opening a
 * document recalculates the frame; modeling a cuboid does not steal the orbit.
 */
export function frameDocumentCamera(
  doc: EditorDocument, kind: CameraView, aspect: number
): CameraFrame {
  const visible = doc.cuboids.filter(node => node.visible);
  if (visible.length === 0) return {
    target: [0, 0.58, 0], position: directions[kind] as Vec3,
    distance: Math.hypot(...directions[kind])
  };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  visible.forEach(node => {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, node.from[axis]);
      max[axis] = Math.max(max[axis]!, node.to[axis]);
    }
  });
  const target: Vec3 = [
    (min[0]! + max[0]! - 16) / 32,
    (min[1]! + max[1]!) / 32,
    (min[2]! + max[2]! - 16) / 32
  ];
  const direction = unit(directions[kind]);
  const right = unit(cross([0, 1, 0], direction));
  const up = cross(direction, right);
  // Use a smaller margin on the designed showcase, not on ordinary assets.
  const coverage = isAetherheartShowcase(doc) ? 0.78 : 0.45;
  const horizontalFov = FOV_TAN * Math.max(0.1, Math.min(10, aspect)) * coverage;
  const verticalFov = FOV_TAN * coverage;
  let distance = 0;
  for (const x of [min[0]!, max[0]!])
    for (const y of [min[1]!, max[1]!])
      for (const z of [min[2]!, max[2]!]) {
        const offset: Vec3 = [(x - 8) / 16 - target[0],
          y / 16 - target[1], (z - 8) / 16 - target[2]];
        const depth = dot(offset, direction);
        const fit = Math.max(Math.abs(dot(offset, right)) / horizontalFov,
          Math.abs(dot(offset, up)) / verticalFov);
        distance = Math.max(distance, depth + fit);
      }
  distance = Math.max(1.3, distance);
  return {
    target, distance,
    position: [target[0] + direction[0] * distance,
      target[1] + direction[1] * distance, target[2] + direction[2] * distance]
  };
}

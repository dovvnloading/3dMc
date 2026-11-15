import type { EditorDocument, Vec3 } from "./domain";
import { transformedCorners } from "./elementRotation";

/** Bounds in the same 1/16-scale world coordinates used by EditorViewport. */
export interface FrameBounds {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  radius: number;
  usedSelection: boolean;
}

export function calculateFrameBounds(document: EditorDocument, selectedIds: readonly string[]): FrameBounds {
  const visible = document.cuboids.filter(node => node.visible);
  const selection = new Set(selectedIds);
  const selected = visible.filter(node => selection.has(node.id));
  const nodes = selected.length ? selected : visible;
  // An empty model still has a sensible home target and finite camera distance.
  if (!nodes.length) return {
    min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5],
    center: [0, 0.5, 0], radius: Math.sqrt(3) / 2, usedSelection: false
  };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) {
    // Rotation can move corners outside unrotated from/to, including rescale.
    for (const point of transformedCorners(node)) {
      const world = [(point[0] - 8) / 16, point[1] / 16, (point[2] - 8) / 16];
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis]!, world[axis]!);
        max[axis] = Math.max(max[axis]!, world[axis]!);
      }
    }
  }
  const center = min.map((value, axis) => (value + max[axis]!) / 2) as [number, number, number];
  const radius = Math.hypot(...min.map((value, axis) => (max[axis]! - value) / 2));
  return { min: min as [number, number, number], max: max as [number, number, number],
    center, radius, usedSelection: selected.length > 0 };
}

/**
 * Fit the enclosing sphere against the tighter of the vertical and horizontal
 * perspective frusta. The 30% margin keeps corners away from the viewport edge
 * regardless of the current orbit direction or canvas aspect ratio.
 */
export function frameCameraDistance(radius: number, fovDegrees: number, aspect: number): number {
  const vertical = Math.max(1, Math.min(179, fovDegrees)) * Math.PI / 180 / 2;
  const horizontal = Math.atan(Math.tan(vertical) *
    (Number.isFinite(aspect) && aspect > 0 ? aspect : 1));
  return Math.max(0.002, radius * 1.3 / Math.sin(Math.min(vertical, horizontal)));
}

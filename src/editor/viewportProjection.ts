/**
 * Camera math stays independent of React/Three so very small and very large
 * geometry can be framed and projection changes can be tested exactly.
 * Distances and half-heights are in EditorViewport's 1/16 world units.
 */
export type ViewportProjection = "perspective" | "orthographic";
export type ViewportDisplayKey = "grid" | "axes" | "outline";
export interface ViewportDisplay {
  projection: ViewportProjection;
  grid: boolean;
  axes: boolean;
  outline: boolean;
}
export const DEFAULT_VIEWPORT_DISPLAY: ViewportDisplay = {
  projection: "perspective", grid: true, axes: false, outline: true
};
export const VIEWPORT_FOV = 40;
export const MIN_CAMERA_SCALE = 1e-12;

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function halfFov(fov: number): number {
  return Math.max(1, Math.min(179, positive(fov, VIEWPORT_FOV))) * Math.PI / 360;
}

/** The world-space half-height covered at the orbit target (not the near plane). */
export function perspectiveHalfHeight(distance: number, fov = VIEWPORT_FOV, zoom = 1): number {
  return Math.max(MIN_CAMERA_SCALE,
    positive(distance, MIN_CAMERA_SCALE) * Math.tan(halfFov(fov)) / positive(zoom, 1));
}

/** Inverse of perspectiveHalfHeight; swapping back preserves apparent size. */
export function perspectiveDistanceForHalfHeight(height: number, fov = VIEWPORT_FOV, zoom = 1): number {
  return Math.max(MIN_CAMERA_SCALE,
    positive(height, MIN_CAMERA_SCALE) * positive(zoom, 1) / Math.tan(halfFov(fov)));
}

/** Sphere-based orthographic fit, including the tighter horizontal viewport. */
export function orthographicFrameHalfHeight(radius: number, aspect: number): number {
  return Math.max(MIN_CAMERA_SCALE,
    positive(radius, MIN_CAMERA_SCALE) * 1.3 /
      Math.min(1, positive(aspect, 1)));
}

export function orthographicVisibleHalfHeight(top: number, bottom: number, zoom: number): number {
  return Math.max(MIN_CAMERA_SCALE,
    Math.abs(top - bottom) / 2 / positive(zoom, 1));
}

/**
 * The near/far planes scale with the framed subject, not hard-coded 0.01/100
 * coordinates. The camera must be outside the subject for a complete fit.
 */
export function projectionClipping(distance: number, depthRadius: number): { near: number; far: number } {
  const d = positive(distance, MIN_CAMERA_SCALE), radius = positive(depthRadius, MIN_CAMERA_SCALE);
  const near = Math.max(MIN_CAMERA_SCALE, Math.min(d / 1000,
    Math.max(d - radius * 1.5, MIN_CAMERA_SCALE) / 2));
  const far = Math.max(near * 2, d + radius * 2.5);
  return { near, far };
}

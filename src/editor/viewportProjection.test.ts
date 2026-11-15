import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { createSampleDocument } from "./domain";
import type { Cuboid, Vec3 } from "./domain";
import { transformedCorners } from "./elementRotation";
import { calculateFrameBounds, frameCameraDistance } from "./frameSelection";
import { MIN_CAMERA_SCALE, orthographicFrameHalfHeight, orthographicVisibleHalfHeight,
  perspectiveDistanceForHalfHeight, perspectiveHalfHeight, projectionClipping } from "./viewportProjection";

const base = createSampleDocument();
const cuboid = (id: string, from: Vec3, to: Vec3, rotation?: Cuboid["rotation"]): Cuboid =>
  { return { ...base.cuboids[0]!, id, from, to, rotation, visible: true }; };

function assertCornersFit(node: Cuboid, projection: "perspective" | "orthographic", aspect: number) {
  const bounds = calculateFrameBounds({ ...base, cuboids: [node] }, [node.id]);
  const halfHeight = orthographicFrameHalfHeight(bounds.radius, aspect);
  const perspectiveDistance = frameCameraDistance(bounds.radius, 40, aspect);
  const distance = projection === "perspective" ? perspectiveDistance :
    Math.max(halfHeight * 3, bounds.radius * 4);
  const target = new Vector3(...bounds.center);
  const direction = new Vector3(1, 0.6, 1).normalize();
  const camera = projection === "perspective" ?
    new PerspectiveCamera(40, aspect) :
    new OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.lookAt(target);
  const planes = projectionClipping(distance, bounds.radius);
  camera.near = planes.near; camera.far = planes.far;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (const corner of transformedCorners(node)) {
    const world = new Vector3((corner[0] - 8) / 16, corner[1] / 16, (corner[2] - 8) / 16);
    const projected = world.project(camera);
    expect(projected.x).toBeGreaterThan(-1);
    expect(projected.x).toBeLessThan(1);
    expect(projected.y).toBeGreaterThan(-1);
    expect(projected.y).toBeLessThan(1);
    expect(projected.z).toBeGreaterThan(-1);
    expect(projected.z).toBeLessThan(1);
  }
}

describe("projection and framing", () => {
  it("roundtrips apparent size through perspective and orthographic for any orbit direction", () => {
    for (const distance of [0.00000002, 0.02, 4.6, 5e8]) {
      const halfHeight = perspectiveHalfHeight(distance);
      expect(perspectiveDistanceForHalfHeight(halfHeight)).toBeCloseTo(distance, 8);
      expect(orthographicVisibleHalfHeight(halfHeight, -halfHeight, 1)).toBeCloseTo(halfHeight, 8);
      expect(orthographicVisibleHalfHeight(halfHeight * 4, -halfHeight * 4, 4))
        .toBeCloseTo(halfHeight, 8);
    }
  });

  it("never produces collapsed frusta or a clipped far plane for tiny or huge subjects", () => {
    expect(projectionClipping(4, 1, 50).far).toBe(50);
    expect(projectionClipping(4, 1, 1).far).toBeGreaterThan(4);
    for (const radius of [0, 1e-10, 1e-6, 1, 3e7]) {
      for (const aspect of [0.3, 1, 3.5]) {
        const half = orthographicFrameHalfHeight(radius, aspect);
        const distance = Math.max(half * 3, radius * 4);
        const planes = projectionClipping(distance, radius);
        expect(half).toBeGreaterThanOrEqual(MIN_CAMERA_SCALE);
        expect(planes.near).toBeGreaterThan(0);
        expect(planes.far).toBeGreaterThan(distance + radius);
        expect(planes.near).toBeLessThan(distance - Math.max(radius, MIN_CAMERA_SCALE));
        expect(Number.isFinite(planes.far)).toBe(true);
      }
    }
  });

  it("fits corners of tiny, huge and rotated selections in both projections and narrow/wide canvases", () => {
    const nodes = [
      cuboid("tiny", [8, 8, 8], [8.000001, 8.000001, 8.000001]),
      cuboid("huge", [-2500000, -1000000, -1900000], [2000000, 1700000, 2400000]),
      cuboid("rotated", [8, 1, 8], [13, 12, 11],
        { axis: "y", angle: 45, origin: [9, 6, 9], rescale: true })
    ];
    for (const node of nodes) for (const projection of ["perspective", "orthographic"] as const)
      for (const aspect of [0.5, 16 / 9]) assertCornersFit(node, projection, aspect);
  });
});

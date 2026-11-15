import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import type { Cuboid, Vec3 } from "./domain";
import { calculateFrameBounds, frameCameraDistance } from "./frameSelection";
import { transformedCorners } from "./elementRotation";

const source = createSampleDocument().cuboids[0]!;
function node(id: string, from: Vec3, to: Vec3): Cuboid {
  return { ...source, id, from, to, visible: true };
}
function doc(...cuboids: Cuboid[]) {
  return { ...createSampleDocument(), cuboids };
}

describe("frame selection math", () => {
  it("fits a single selected element in world coordinates", () => {
    const a = node("small", [8, 4, 8], [12, 8, 12]);
    const b = node("far", [128, 0, 128], [144, 16, 144]);
    const bounds = calculateFrameBounds(doc(a, b), ["small"]);
    expect(bounds.usedSelection).toBe(true);
    expect(bounds.min).toEqual([0, 0.25, 0]);
    expect(bounds.max).toEqual([0.25, 0.5, 0.25]);
    expect(bounds.center).toEqual([0.125, 0.375, 0.125]);
    expect(bounds.radius).toBeCloseTo(Math.sqrt(3) / 8);
  });

  it("includes all rotated, rescaled corners rather than unrotated box coordinates", () => {
    const rotated: Cuboid = {
      ...node("rotated", [8, 0, 8], [12, 4, 12]),
      rotation: { axis: "y", angle: 45, origin: [8, 0, 8], rescale: true }
    };
    const bounds = calculateFrameBounds(doc(rotated), ["rotated"]);
    const transformed = transformedCorners(rotated);
    expect(bounds.max[0]).toBeGreaterThan((rotated.to[0] - 8) / 16);
    expect(bounds.min[2]).toBeLessThan((rotated.from[2] - 8) / 16);
    for (const point of transformed) {
      const world = [(point[0] - 8) / 16, point[1] / 16, (point[2] - 8) / 16];
      world.forEach((value, axis) => {
        expect(value).toBeGreaterThanOrEqual(bounds.min[axis]! - 1e-12);
        expect(value).toBeLessThanOrEqual(bounds.max[axis]! + 1e-12);
      });
    }
  });

  it("frames the visible model when the selection is empty, stale or hidden", () => {
    const a = node("a", [0, 0, 0], [16, 16, 16]);
    const b = node("b", [16, 0, 16], [32, 16, 32]);
    const hidden = { ...node("hidden", [-256, -256, -256], [256, 256, 256]), visible: false };
    const scene = doc(a, b, hidden);
    for (const ids of [[], ["missing"], ["hidden"]]) {
      const bounds = calculateFrameBounds(scene, ids);
      expect(bounds.usedSelection).toBe(false);
      expect(bounds.min).toEqual([-0.5, 0, -0.5]);
      expect(bounds.max).toEqual([1.5, 1, 1.5]);
    }
    expect(calculateFrameBounds(scene, ["a"]).max).toEqual([0.5, 1, 0.5]);
    expect(calculateFrameBounds(doc(), []).center).toEqual([0, 0.5, 0]);
    expect(calculateFrameBounds(doc(), []).radius).toBeGreaterThan(0);
  });

  it("returns finite, clipped-safe distances for very small and very large models", () => {
    const tiny = calculateFrameBounds(doc(node("tiny", [8, 8, 8], [8.001, 8.001, 8.001])), []);
    const huge = calculateFrameBounds(doc(node("huge", [-256, -256, -256], [256, 256, 256])), []);
    const tinyDistance = frameCameraDistance(tiny.radius, 40, 16 / 9);
    const hugeDistance = frameCameraDistance(huge.radius, 40, 16 / 9);
    expect(tinyDistance).toBeGreaterThanOrEqual(0.002);
    expect(Number.isFinite(tinyDistance)).toBe(true);
    expect(hugeDistance).toBeGreaterThan(100);
    expect(Number.isFinite(hugeDistance)).toBe(true);
    expect(hugeDistance).toBeGreaterThan(huge.radius * 1.3);
    expect(frameCameraDistance(huge.radius, 40, 0.5)).toBeGreaterThan(hugeDistance);
    expect(frameCameraDistance(huge.radius, 40, 0)).toBeGreaterThan(0);
  });
});

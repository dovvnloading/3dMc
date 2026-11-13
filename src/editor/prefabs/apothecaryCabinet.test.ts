import { describe, expect, it } from "vitest";
import type { Cuboid, Vec3 } from "../domain";
import { createApothecaryCabinet } from "./apothecaryCabinet";

const { parts } = createApothecaryCabinet();
const axes = [0, 1, 2] as const;
const epsilon = 1e-6;

function part(name: string): Cuboid {
  const result = parts.find(node => node.name === name);
  if (!result) throw new Error("Missing cabinet part: " + name);
  return result;
}

function center(node: Cuboid): Vec3 {
  return [
    (node.from[0] + node.to[0]) / 2,
    (node.from[1] + node.to[1]) / 2,
    (node.from[2] + node.to[2]) / 2
  ];
}

// Clip the segment from the camera to a feature against each cuboid. A box
// behind the feature, or beyond the camera, does not obstruct the view.
function blocksSightline(box: Cuboid, eye: Vec3, feature: Vec3): boolean {
  let entry = 0, exit = 1;
  for (const axis of axes) {
    const direction = feature[axis] - eye[axis];
    if (Math.abs(direction) < epsilon) {
      if (eye[axis] < box.from[axis] || eye[axis] > box.to[axis]) return false;
    } else {
      const a = (box.from[axis] - eye[axis]) / direction;
      const b = (box.to[axis] - eye[axis]) / direction;
      entry = Math.max(entry, Math.min(a, b));
      exit = Math.min(exit, Math.max(a, b));
    }
  }
  return entry < exit && entry < 1 - epsilon;
}

describe("Apothecary Cabinet joinery and sightlines", () => {
  it("gives every component physical contact with the cabinet", () => {
    // Opposed faces must share area. Point and edge contacts do not support a part.
    const touches = (a: Cuboid, b: Cuboid) => {
      const overlaps = axes.map(axis => Math.min(a.to[axis], b.to[axis]) - Math.max(a.from[axis], b.from[axis]));
      return overlaps.every(span => span >= -epsilon) && overlaps.filter(span => span > epsilon).length >= 2;
    };
    const attached = new Set(parts.filter(node => node.from[1] === 0));
    const pending = [...attached];
    while (pending.length) {
      const current = pending.pop()!;
      for (const node of parts) {
        if (attached.has(node) || !touches(current, node)) continue;
        attached.add(node);
        pending.push(node);
      }
    }
    expect(parts.filter(node => !attached.has(node)).map(node => node.name)).toEqual([]);
  });

  it("avoids overlapping surfaces with the same outward normal", () => {
    const conflicts: string[] = [];
    for (const [i, a] of parts.entries()) {
      for (const b of parts.slice(i + 1)) {
        const overlap = axes.map(axis => Math.min(a.to[axis], b.to[axis]) - Math.max(a.from[axis], b.from[axis]));
        if (overlap.some(span => span <= epsilon)) continue;
        if (axes.some(axis => Math.abs(a.from[axis] - b.from[axis]) < epsilon ||
          Math.abs(a.to[axis] - b.to[axis]) < epsilon)) conflicts.push(a.name + " / " + b.name);
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("exposes each bottle's seal, both jars, both book pages and the pestle in the editor's Iso view", () => {
    // EditorViewport's Iso camera [2.9, 2.35, 3.2], in native model units.
    const eye: Vec3 = [54.4, 37.6, 59.2];
    const landmarks = [
      ...["Verdant tonic", "Moonwater", "Emberroot elixir"].map(name => "Bottles / " + name + " handwritten paper seal"),
      "Tools / ground sage paper identification band", "Tools / moon salt paper identification band",
      "Tools / open book left parchment", "Tools / open book right parchment", "Tools / rounded pestle grip"
    ];
    for (const name of landmarks) {
      const node = part(name);
      const feature = center(node);
      const blockers = parts.filter(other => other !== node && blocksSightline(other, eye, feature));
      expect(blockers.map(other => other.name), name).toEqual([]);
    }
  });

  it("leaves the worktop in front of the shelf and seats its loose objects on supporting surfaces", () => {
    const worktop = part("Carcass / continuous oak work surface");
    const shelf = part("Hutch / supporting display shelf");
    for (const node of parts.filter(node => node.name.endsWith("dark glass heel"))) {
      expect(node.from[1]).toBe(shelf.to[1]);
      for (const axis of [0, 2] as const) {
        expect(node.from[axis]).toBeGreaterThanOrEqual(shelf.from[axis]);
        expect(node.to[axis]).toBeLessThanOrEqual(shelf.to[axis]);
      }
    }
    for (const name of ["burgundy recipe book cover", "porcelain mortar heavy base",
      "ground sage tall ceramic jar", "moon salt tall ceramic jar"]) {
      const node = part("Tools / " + name);
      expect(node.from[1]).toBe(worktop.to[1]);
      expect(node.from[2]).toBeGreaterThan(shelf.to[2]);
      expect(node.to[2]).toBeLessThanOrEqual(worktop.to[2]);
    }
  });
});

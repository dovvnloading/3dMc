import { describe, expect, it } from "vitest";
import type { Axis, Cuboid, EditorDocument, Vec3 } from "./domain";
import { createSampleDocument, parseDocument } from "./domain";
import { transformedBounds, transformedCorners } from "./elementRotation";
import { commit, createHistory, undo } from "./history";
import { alignSelection, distributeSelection, mirrorSelection } from "./selection";

const axes = [0, 1, 2] as const;
const chosen = ["body", "base", "roof", "crown"];

function fixture(): EditorDocument {
  const source = createSampleDocument();
  return { ...source, cuboids: source.cuboids.map(node => {
    if (node.id === "body") return { ...node,
      rotation: { axis: "x" as const, angle: 45 as const,
        origin: [9.25, 4.5, 8.75] as Vec3, rescale: true } };
    if (node.id === "roof") return { ...node,
      rotation: { axis: "y" as const, angle: -22.5 as const,
        origin: [8.25, 10, 9.25] as Vec3, rescale: false } };
    if (node.id === "crown") return { ...node,
      rotation: { axis: "z" as const, angle: 22.5 as const,
        origin: [8, 12, 8] as Vec3, rescale: true } };
    return node; // A genuinely unrotated member among the rotated ones.
  }) };
}

const byId = (document: EditorDocument, id: string) =>
  document.cuboids.find(node => node.id === id)!;
const visibleEdge = (node: Cuboid, axis: Axis, edge: "minimum" | "center" | "maximum") => {
  const bounds = transformedBounds(node);
  return edge === "minimum" ? bounds.from[axis] :
    edge === "maximum" ? bounds.to[axis] : (bounds.from[axis] + bounds.to[axis]) / 2;
};

function expectRigidMove(before: Cuboid, after: Cuboid, axis: Axis) {
  for (const dimension of axes) {
    expect(after.to[dimension] - after.from[dimension])
      .toBeCloseTo(before.to[dimension] - before.from[dimension], 9);
  }
  expect(after.faces).toBe(before.faces);
  if (before.rotation) {
    expect(after.rotation?.axis).toBe(before.rotation.axis);
    expect(after.rotation?.angle).toBe(before.rotation.angle);
    expect(after.rotation?.rescale).toBe(before.rotation.rescale);
    for (const dimension of axes) {
      const delta = dimension === axis ? after.from[axis] - before.from[axis] : 0;
      expect(after.rotation!.origin[dimension] - before.rotation.origin[dimension])
        .toBeCloseTo(delta, 9);
    }
  } else expect(after.rotation).toBeUndefined();
}

describe("rotation-aware selection operations", () => {
  it("aligns minimum, center and maximum of transformed extents across all three axes", () => {
    const source = fixture();
    for (const axis of axes) for (const edge of ["minimum", "center", "maximum"] as const) {
      const ids = ["body", "base", "roof"];
      const all = ids.map(id => byId(source, id));
      const target = edge === "minimum" ? Math.min(...all.map(node => visibleEdge(node, axis, edge))) :
        edge === "maximum" ? Math.max(...all.map(node => visibleEdge(node, axis, edge))) :
          (Math.min(...all.map(node => transformedBounds(node).from[axis])) +
           Math.max(...all.map(node => transformedBounds(node).to[axis]))) / 2;
      const aligned = alignSelection(source, ids, axis, edge);
      for (const id of ids) {
        expect(visibleEdge(byId(aligned, id), axis, edge)).toBeCloseTo(target, 3);
        expectRigidMove(byId(source, id), byId(aligned, id), axis);
      }
      expect(aligned.cuboids[3]).toBe(source.cuboids[3]);
      expect(aligned.textures).toBe(source.textures);
      expect(parseDocument(aligned)).toEqual(aligned);
    }
  });

  it("spaces transformed centers, preserving outer parts and each rotation/pivot offset", () => {
    const source = fixture();
    const center = (document: EditorDocument, id: string) =>
      visibleEdge(byId(document, id), 1, "center");
    const order = [...chosen].sort((a, b) => center(source, a) - center(source, b));
    const first = center(source, order[0]!);
    const last = center(source, order.at(-1)!);
    const distributed = distributeSelection(source, chosen, 1);
    order.forEach((id, i) => {
      expect(center(distributed, id)).toBeCloseTo(first + (last - first) * i / (order.length - 1), 3);
      expectRigidMove(byId(source, id), byId(distributed, id), 1);
    });
    expect(byId(distributed, order[0]!)).toBe(byId(source, order[0]!));
    expect(byId(distributed, order.at(-1)!)).toBe(byId(source, order.at(-1)!));
    expect(distributeSelection(source, chosen.slice(0, 2), 1)).toBe(source);
    expect(undo(commit(createHistory(source), distributed)).present).toBe(source);
  });

  it("reflects all visible corners including off-center pivots and rescale; twice is identity", () => {
    const source = fixture();
    const original = JSON.stringify(source);
    for (const axis of axes) {
      const all = chosen.map(id => byId(source, id));
      const sum = Math.min(...all.map(node => transformedBounds(node).from[axis])) +
        Math.max(...all.map(node => transformedBounds(node).to[axis]));
      const mirrored = mirrorSelection(source, chosen, axis);
      expect(mirrored).not.toBe(source);
      for (const id of chosen) {
        const before = byId(source, id), after = byId(mirrored, id);
        const corners = transformedCorners(after);
        for (const corner of transformedCorners(before)) {
          const reflected = corner.map((value, i) => i === axis ? sum - value : value);
          // Small floating-point differences are allowed at the rendered corners.
          const error = Math.min(...corners.map(value =>
            Math.hypot(...value.map((part, i) => part - reflected[i]!))));
          expect(error).toBeLessThan(0.0005);
        }
        expect(after.faces).toBe(before.faces);
        if (before.rotation) {
          expect(after.rotation?.axis).toBe(before.rotation.axis);
          expect(after.rotation?.angle).toBe(
            before.rotation.axis === (["x", "y", "z"] as const)[axis]
              ? before.rotation.angle : -before.rotation.angle);
          expect(after.rotation?.rescale).toBe(before.rotation.rescale);
          expect(after.rotation!.origin[axis]).toBeCloseTo(sum - before.rotation.origin[axis], 3);
          for (const other of axes.filter(index => index !== axis)) {
            expect(after.rotation!.origin[other]).toBe(before.rotation.origin[other]);
          }
        } else expect(after.rotation).toBeUndefined();
      }
      expect(mirrored.cuboids.slice(4)).toEqual(source.cuboids.slice(4));
      expect(mirrored.textures).toBe(source.textures);
      expect(parseDocument(mirrored)).toEqual(mirrored);
      expect(mirrorSelection(mirrored, chosen, axis).cuboids).toEqual(source.cuboids);
      expect(undo(commit(createHistory(source), mirrored)).present).toBe(source);
    }
    expect(JSON.stringify(source)).toBe(original);
  });

  it("round-trips fractional source coordinates and off-center pivots without four-decimal truncation", () => {
    const source = createSampleDocument();
    source.cuboids[0] = { ...source.cuboids[0]!,
      from: [3.123456789, 3, 3], to: [13.123456789, 12, 13],
      rotation: { axis: "y", angle: 22.5, origin: [4.987654321, 7.5, 8], rescale: true } };
    for (const axis of axes) {
      const mirror = mirrorSelection(source, ["body", "base"], axis);
      expect(mirrorSelection(mirror, ["body", "base"], axis).cuboids).toEqual(source.cuboids);
    }
  });

  it("publishes mirrored rotation-only changes rather than treating symmetric bounds as a no-op", () => {
    const source = createSampleDocument();
    source.cuboids[0] = { ...source.cuboids[0]!,
      rotation: { axis: "y", angle: 22.5, origin: [8, 7.5, 8], rescale: true } };
    const mirrored = mirrorSelection(source, ["body"], 0);
    expect(mirrored).not.toBe(source);
    expect(mirrored.cuboids[0]?.from).toEqual(source.cuboids[0]?.from);
    expect(mirrored.cuboids[0]?.to).toEqual(source.cuboids[0]?.to);
    expect(mirrored.cuboids[0]?.rotation?.angle).toBe(-22.5);
    expect(mirrorSelection(mirrored, ["body"], 0).cuboids[0]).toEqual(source.cuboids[0]);
  });

  it("does not reject a valid 64-unit translation because of floating-point roundoff", () => {
    const source = createSampleDocument();
    source.cuboids[0] = { ...source.cuboids[0]!,
      from: [-37.225578, 3, 3], to: [26.774422, 12, 13],
      rotation: { axis: "z", angle: 0, origin: [-5, 7.5, 8], rescale: false } };
    source.cuboids[1] = { ...source.cuboids[1]!,
      from: [158.138888814, 1, 2], to: [170.138888814, 3, 14] };
    const aligned = alignSelection(source, ["body", "base"], 0, "maximum");
    expect(visibleEdge(aligned.cuboids[0]!, 0, "maximum"))
      .toBeCloseTo(visibleEdge(aligned.cuboids[1]!, 0, "maximum"), 9);
    expect(aligned.cuboids[0]!.to[0] - aligned.cuboids[0]!.from[0]).toBeLessThanOrEqual(64);
    expect(parseDocument(aligned)).toEqual(aligned);
  });

  it("rejects unrepresentable reflected pivots and batch translations atomically", () => {
    const source = createSampleDocument();
    source.cuboids[0] = { ...source.cuboids[0]!, from: [-220, 3, 3], to: [-210, 12, 13],
      rotation: { axis: "y", angle: 0, origin: [250, 8, 8], rescale: false } };
    source.cuboids[1] = { ...source.cuboids[1]!, from: [-230, 1, 2], to: [-218, 3, 14] };
    const snapshot = JSON.stringify(source);
    expect(() => mirrorSelection(source, ["body", "base"], 0)).toThrow(/pivots.*No parts were changed/);
    expect(JSON.stringify(source)).toBe(snapshot);

    const aligned = createSampleDocument();
    aligned.cuboids[0] = { ...aligned.cuboids[0]!,
      rotation: { axis: "z", angle: 0, origin: [250, 8, 8], rescale: false } };
    aligned.cuboids[1] = { ...aligned.cuboids[1]!, from: [200, 1, 2], to: [212, 3, 14] };
    const before = JSON.stringify(aligned);
    expect(() => alignSelection(aligned, ["body", "base"], 0, "maximum")).toThrow(/complete edit/);
    expect(JSON.stringify(aligned)).toBe(before);

    const spaced = createSampleDocument();
    spaced.cuboids[1] = { ...spaced.cuboids[1]!, from: [100, 1, 2], to: [112, 3, 14],
      rotation: { axis: "y", angle: 0, origin: [250, 2, 8], rescale: false } };
    spaced.cuboids[2] = { ...spaced.cuboids[2]!, from: [230, 12, 2], to: [242, 14, 14] };
    const previous = JSON.stringify(spaced);
    expect(() => distributeSelection(spaced, ["body", "base", "roof"], 0)).toThrow(/complete edit/);
    expect(JSON.stringify(spaced)).toBe(previous);
  });
});

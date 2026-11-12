import { describe, expect, it } from "vitest";
import { FACE_DIRECTIONS, createSampleDocument, parseDocument } from "./domain";
import { boxUVLayout, generateBoxUV } from "./boxUv";
import { createHistory, commit, undo, redo } from "./history";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { decodeNativePack, encodeNativePack } from "./nativePackArchive";
import { indexLegacyProject } from "../pack/packDocument";

describe("dimension-aware box UV layout", () => {
  it("generates six nonoverlapping face regions scaled to a full block", () => {
    const doc = createSampleDocument();
    const cube = { ...doc.cuboids[0]!, from: [0, 0, 0] as const, to: [16, 16, 16] as const };
    const layout = boxUVLayout(cube);
    expect(layout).toEqual({
      up: [4, 2, 8, 6], down: [4, 10, 8, 14],
      west: [0, 6, 4, 10], north: [4, 6, 8, 10],
      east: [8, 6, 12, 10], south: [12, 6, 16, 10]
    });
    for (const face of FACE_DIRECTIONS) {
      expect(layout[face][0]).toBeLessThan(layout[face][2]);
      expect(layout[face][1]).toBeLessThan(layout[face][3]);
      expect(layout[face].every(value => value >= 0 && value <= 16)).toBe(true);
    }
    for (let i = 0; i < FACE_DIRECTIONS.length; i++) for (let j = i + 1; j < FACE_DIRECTIONS.length; j++) {
      const a = layout[FACE_DIRECTIONS[i]!], b = layout[FACE_DIRECTIONS[j]!];
      const overlapW = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      const overlapH = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      expect(overlapW <= 0 || overlapH <= 0).toBe(true);
    }
  });

  it("preserves materials, texture IDs, geometry, source pixels and one undo entry", async () => {
    const source = createSampleDocument();
    const untouched = JSON.stringify(source);
    const generated = generateBoxUV(source, "body");
    const before = source.cuboids[0]!;
    const after = generated.cuboids[0]!;
    expect(after.from).toBe(before.from);
    expect(after.to).toBe(before.to);
    expect(after.material).toBe(before.material);
    expect(after.faces.north.uv).toEqual([4, 6.2, 8, 9.8]);
    expect(after.faces.up.uv).toEqual([4, 2.2, 8, 6.2]);
    for (const face of FACE_DIRECTIONS) {
      expect(after.faces[face].textureId).toBe(before.faces[face].textureId);
      expect(after.faces[face].rotation).toBe(0);
    }
    expect(generated.cuboids.slice(1)).toEqual(source.cuboids.slice(1));
    expect(generated.textures).toBe(source.textures);
    expect(JSON.stringify(source)).toBe(untouched);
    expect(parseDocument(generated)).toEqual(generated);
    const history = commit(createHistory(source), generated);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(generated);
    expect(await decodeNativeProject(await encodeNativeProject(generated))).toEqual(generated);
    expect((await decodeNativePack(await encodeNativePack(
      indexLegacyProject(generated), [generated]))).sources).toEqual([generated]);
  });

  it("does not modify hidden, locked or missing cuboids", () => {
    const source = createSampleDocument();
    const locked = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, locked: true } : node) };
    expect(() => generateBoxUV(locked, "body")).toThrow(/Unlock/);
    const hidden = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, visible: false } : node) };
    expect(() => generateBoxUV(hidden, "body")).toThrow(/Unlock/);
    expect(() => generateBoxUV(source, "unknown")).toThrow(/Choose a cuboid/);
  });
});

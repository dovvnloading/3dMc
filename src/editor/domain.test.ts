import { describe, expect, it } from "vitest";
import {
  addCuboid, createSampleDocument, deleteCuboid, duplicateCuboid,
  parseDocument, setAxisValue, setTexturePixels, toggleFlag,
  updateFaceUV, updateFaceRotation, FACE_DIRECTIONS
} from "./domain";
import { commit, createHistory, redo, undo } from "./history";
import { drawStroke, readHex, uvToTexel } from "./pixels";
import { decodeProject, encodeProject } from "./project";

describe("canonical document", () => {
  it("reopens a serialized sample with stable identities and texture bytes", () => {
    const sample = createSampleDocument();
    expect(decodeProject(encodeProject(sample))).toEqual(sample);
  });

  it("rejects unsupported versions, invalid geometry, and oversized pixels", () => {
    const sample = createSampleDocument();
    expect(() => parseDocument({ ...sample, schemaVersion: 4 })).toThrow(/version/i);
    expect(() => parseDocument({ ...sample, cuboids: [
      { ...sample.cuboids[0], to: [3, 12, 13] }
    ] })).toThrow(/cuboid/i);
    expect(() => parseDocument({ ...sample, textures: [{ ...sample.textures[0]!, width: 1024 }] }))
      .toThrow(/texture/i);
  });

  it("updates one dimension without shifting the other axes", () => {
    const initial = createSampleDocument();
    const edited = setAxisValue(initial, "body", "size", 0, 12);
    expect(edited.cuboids[0]?.from).toEqual([3, 3, 3]);
    expect(edited.cuboids[0]?.to).toEqual([15, 12, 13]);
    expect(initial.cuboids[0]?.to).toEqual([13, 12, 13]);
    expect(setAxisValue(initial, "body", "size", 0, -1)).toBe(initial);
  });

  it("restores a mixed geometry and texture sequence via undo and redo", () => {
    const document = createSampleDocument();
    let history = createHistory(document);
    history = commit(history, setAxisValue(history.present, "body", "position", 1, 4));
    const changedPixels = drawStroke(history.present.textures[0]!.pixels, 32, 32,
      [2, 2], [7, 4], "#ff0044", 1);
    history = commit(history, setTexturePixels(history.present, changedPixels));
    expect(history.past).toHaveLength(2);
    const painted = history.present;
    history = undo(history);
    expect(history.present.textures[0]!.pixels).toEqual(document.textures[0]!.pixels);
    history = undo(history);
    expect(history.present).toBe(document);
    history = redo(redo(history));
    expect(history.present).toEqual(painted);
    history = undo(history);
    history = commit(history, addCuboid(history.present, "new-one"));
    expect(history.future).toHaveLength(0);
  });

  it("keeps structural editing reversible and respects locking", () => {
    const sample = createSampleDocument();
    const added = addCuboid(sample, "another");
    const duplicated = duplicateCuboid(added, "body", "copy");
    expect(duplicated.cuboids).toHaveLength(sample.cuboids.length + 2);
    expect(deleteCuboid(duplicated, "copy").cuboids).toHaveLength(sample.cuboids.length + 1);
    const locked = toggleFlag(sample, "body", "locked");
    expect(deleteCuboid(locked, "body")).toBe(locked);
  });
});

describe("pixel addressing", () => {
  it("maps top-left and bottom-right UV corners within bounds", () => {
    expect(uvToTexel(0, 1, 32, 32)).toEqual([0, 0]);
    expect(uvToTexel(1, 0, 32, 32)).toEqual([31, 31]);
  });
  it("covers a dragged line with deterministic exact opaque pixels", () => {
    const base = Array(4 * 8 * 8).fill(0) as number[];
    const pixels = drawStroke(base, 8, 8, [1, 1], [5, 1], "#123abc", 1);
    for (let x = 1; x <= 5; x++) expect(readHex(pixels, 8, [x, 1])).toBe("#123abc");
    expect(base.every((value) => value === 0)).toBe(true);
  });
});

describe("face-aware native project migration", () => {
  it("migrates legacy v1 cuboids to six full-sheet UV mappings without losing pixels", () => {
    const sample = createSampleDocument();
    const legacy = {
      ...sample, schemaVersion: 1, texture: sample.textures[0]!,
      cuboids: sample.cuboids.map(({ faces: _faces, ...node }) => node)
    };
    const migrated = decodeProject(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.textures[0]!.pixels).toEqual(sample.textures[0]!.pixels);
    expect(migrated.cuboids.map((node) => node.from))
      .toEqual(sample.cuboids.map((node) => node.from));
    for (const node of migrated.cuboids) {
      expect(Object.keys(node.faces).sort()).toEqual([...FACE_DIRECTIONS].sort());
      for (const face of FACE_DIRECTIONS)
        expect(node.faces[face]).toEqual({ uv: [0, 0, 16, 16], rotation: 0, textureId: "main" });
    }
    expect(decodeProject(encodeProject(migrated))).toEqual(migrated);
  });

  it("commits a single face UV edit and rotation, with exact undo", () => {
    const sample = createSampleDocument();
    let history = createHistory(sample);
    history = commit(history, updateFaceUV(history.present, "body", "north", 0, 2));
    history = commit(history, updateFaceRotation(history.present, "body", "north", 90));
    expect(history.present.cuboids[0]?.faces.north)
      .toEqual({ uv: [2, 0, 16, 16], rotation: 90, textureId: "main" });
    history = undo(undo(history));
    expect(history.present).toEqual(sample);
    history = redo(redo(history));
    expect(decodeProject(encodeProject(history.present))).toEqual(history.present);
  });

  it("blocks invalid UV spans, out-of-bounds values, unsupported angles and locked edits", () => {
    const sample = createSampleDocument();
    expect(updateFaceUV(sample, "body", "north", 0, 16)).toBe(sample);
    expect(updateFaceUV(sample, "body", "north", 1, -2)).toBe(sample);
    expect(updateFaceRotation(sample, "body", "north", 45 as 90)).toBe(sample);
    const locked = toggleFlag(sample, "body", "locked");
    expect(updateFaceUV(locked, "body", "north", 0, 8)).toBe(locked);
    const wrong = {
      ...sample, cuboids: sample.cuboids.map((node, i) =>
        i === 0 ? { ...node, faces: { ...node.faces, north: {
          uv: [4, 2, 4, 12], rotation: 90
        } } } : node)
    };
    expect(() => parseDocument(wrong)).toThrow(/cuboids/i);
  });
});

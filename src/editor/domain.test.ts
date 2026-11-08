import { describe, expect, it } from "vitest";
import {
  addCuboid, createSampleDocument, deleteCuboid, duplicateCuboid,
  parseDocument, setAxisValue, setTexturePixels, toggleFlag
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
    expect(() => parseDocument({ ...sample, schemaVersion: 2 })).toThrow(/version/i);
    expect(() => parseDocument({ ...sample, cuboids: [
      { ...sample.cuboids[0], to: [3, 12, 13] }
    ] })).toThrow(/cuboid/i);
    expect(() => parseDocument({ ...sample, texture: { ...sample.texture, width: 1024 } }))
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
    const changedPixels = drawStroke(history.present.texture.pixels, 32, 32,
      [2, 2], [7, 4], "#ff0044", 1);
    history = commit(history, setTexturePixels(history.present, changedPixels));
    expect(history.past).toHaveLength(2);
    const painted = history.present;
    history = undo(history);
    expect(history.present.texture.pixels).toEqual(document.texture.pixels);
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

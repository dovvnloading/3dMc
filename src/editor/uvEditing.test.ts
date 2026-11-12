import { describe, expect, it } from "vitest";
import { createSampleDocument, parseDocument } from "./domain";
import { createHistory, commit, undo, redo } from "./history";
import { applyFaceUV, copyFaceUV, dragFaceUV } from "./uvEditing";

describe("interactive face UV authoring", () => {
  it("moves bounds by texture pixels without altering size or mirrored orientation", () => {
    expect(dragFaceUV([2, 4, 10, 12], "move", [2, -4], 32, 32)).toEqual([3, 2, 11, 10]);
    expect(dragFaceUV([12, 13, 4, 3], "move", [4, -2], 32, 32))
      .toEqual([14, 12, 6, 2]);
    expect(dragFaceUV([0, 0, 16, 16], "move", [3, 5], 32, 32))
      .toEqual([0, 0, 16, 16]);
    expect(dragFaceUV([12, 13, 4, 3], "move", [400, -400], 32, 32))
      .toEqual([16, 10, 8, 0]);
    expect(dragFaceUV([2, 4, 10, 12], "move", [0.5, 0], 32, 32, false))
      .toEqual([2.25, 4, 10.25, 12]);
  });
  it("resizes physical corners with pixel snapping but never flips UV direction", () => {
    expect(dragFaceUV([2, 4, 10, 12], "nw", [2, 2], 32, 32))
      .toEqual([3, 5, 10, 12]);
    expect(dragFaceUV([12, 13, 4, 3], "nw", [-2, 2], 32, 32))
      .toEqual([11, 14, 4, 3]);
    expect(dragFaceUV([2, 4, 10, 12], "se", [-100, -100], 32, 32))
      .toEqual([2, 4, 2.5, 4.5]);
    expect(dragFaceUV([12, 13, 4, 3], "nw", [-100, -100], 32, 32))
      .toEqual([4.5, 3.5, 4, 3]);
    expect(dragFaceUV([2, 4, 10, 12], "move", [0, 0], 32, 32))
      .toEqual([2, 4, 10, 12]);
    expect(() => dragFaceUV([2, 3, 2, 12], "move", [1, 1], 32, 32)).toThrow();
  });
  it("pastes copied UVs and rotation as one edit without changing destination texture", () => {
    const source = createSampleDocument();
    const first = source.cuboids[0]!;
    first.faces.north = { uv: [14, 3, 2, 11], rotation: 270, textureId: "main" };
    const copied = copyFaceUV(first.faces.north);
    const before = JSON.stringify(source);
    const modified = applyFaceUV(source, "body", "south", copied);
    expect(modified.cuboids[0]!.faces.south).toEqual({
      uv: [14, 3, 2, 11], rotation: 270, textureId: "main"
    });
    expect(modified.cuboids[0]!.faces.north).toBe(first.faces.north);
    expect(modified.textures).toBe(source.textures);
    expect(parseDocument(modified)).toEqual(modified);
    expect(JSON.stringify(source)).toBe(before);
    const history = commit(createHistory(source), modified);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(modified);
    expect(applyFaceUV(modified, "body", "south", copied)).toBe(modified);
  });
  it("rejects malformed mapping and obsolete gesture references", () => {
    const source = createSampleDocument();
    const face = source.cuboids[0]!.faces.north;
    const changed = applyFaceUV(source, "body", "north", { uv: [1, 2, 15, 14], rotation: 90 }, face);
    expect(changed).not.toBe(source);
    expect(applyFaceUV(changed, "body", "north", { uv: [2, 2, 14, 14], rotation: 0 }, face))
      .toBe(changed);
    expect(() => applyFaceUV(source, "body", "north", { uv: [4, 2, 4, 8], rotation: 0 }))
      .toThrow(/Invalid/);
    const locked = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, locked: true } : node) };
    expect(applyFaceUV(locked, "body", "north", { uv: [1, 1, 12, 12], rotation: 0 }))
      .toBe(locked);
  });
});

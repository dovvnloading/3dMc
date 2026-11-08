import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { commit, createHistory, undo } from "./history";
import { beginPaintGesture, cancelPaintGesture, commitGizmoTransform,
  commitPaintGesture, continuePaintGesture } from "./gestures";
import { readHex } from "./pixels";

const pixelsAt = (doc: ReturnType<typeof createSampleDocument>, x: number, y: number) =>
  readHex(doc.texture.pixels, doc.texture.width, [x, y]);

describe("atomic painter gesture", () => {
  it("cancels a multi-point stroke without mutating source or changing undo history", () => {
    const source = createSampleDocument();
    const h = createHistory(source);
    let gesture = beginPaintGesture(source, [5, 5], "body:north", "#ff0044", 1);
    gesture = continuePaintGesture(gesture, [18, 8], "body:north");
    expect(gesture.pixels).not.toEqual(source.texture.pixels);
    expect(cancelPaintGesture(gesture)).toBe(source);
    expect(h.present).toBe(source);
    expect(h.past).toHaveLength(0);
    expect(pixelsAt(source, 5, 5)).not.toBe("#ff0044");
  });

  it("commits the whole drag as exactly one reversible history entry", () => {
    const doc = createSampleDocument();
    let gesture = beginPaintGesture(doc, [4, 3], "body:north", "#0088ff", 1);
    gesture = continuePaintGesture(gesture, [6, 3], "body:north");
    gesture = continuePaintGesture(gesture, [7, 5], "body:north");
    const history = commit(createHistory(doc), commitPaintGesture(doc, gesture));
    expect(history.past).toHaveLength(1);
    expect(pixelsAt(history.present, 4, 3)).toBe("#0088ff");
    expect(pixelsAt(history.present, 7, 5)).toBe("#0088ff");
    expect(undo(history).present).toBe(doc);
  });

  it("never joins different UV faces with a diagonal line through the atlas", () => {
    const doc = createSampleDocument();
    let gesture = beginPaintGesture(doc, [3, 3], "body:north", "#0088ff", 1);
    gesture = continuePaintGesture(gesture, [28, 28], "body:up");
    const result = commitPaintGesture(doc, gesture);
    expect(pixelsAt(result, 3, 3)).toBe("#0088ff");
    expect(pixelsAt(result, 28, 28)).toBe("#0088ff");
    expect(pixelsAt(result, 16, 16)).not.toBe("#0088ff");
  });

  it("rejects an obsolete stroke after a project edit or switch", () => {
    const source = createSampleDocument();
    const gesture = beginPaintGesture(source, [4, 4], "body:north", "#ff00cc", 1);
    const other = { ...source, name: "Next project" };
    expect(commitPaintGesture(other, gesture)).toBe(other);
  });
});

describe("atomic gizmo transform", () => {
  it("does not change geometry until a final pointer-up transform is committed", () => {
    const doc = createSampleDocument();
    const history = createHistory(doc);
    expect(history.present.cuboids[0]?.from).toEqual([3, 3, 3]);
    const moved = commitGizmoTransform(doc, "body", [0.25, 0.46875, 0], [1, 1, 1]);
    expect(moved.cuboids[0]?.from).toEqual([7, 3, 3]);
    const h = commit(history, moved);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(doc);
  });
  it("rejects destructive or invalid scaling without altering the source", () => {
    const doc = createSampleDocument();
    expect(commitGizmoTransform(doc, "body", [0, 0.46875, 0], [0, 1, 1])).toBe(doc);
  });
});

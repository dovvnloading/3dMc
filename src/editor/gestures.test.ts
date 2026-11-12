import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { commit, createHistory, undo } from "./history";
import { beginPaintGesture, cancelPaintGesture, commitGizmoTransform,
  commitPaintGesture, continuePaintGesture } from "./gestures";
import { readHex } from "./pixels";

const pixelsAt = (doc: ReturnType<typeof createSampleDocument>, x: number, y: number) =>
  readHex(doc.textures[0]!.pixels, doc.textures[0]!.width, [x, y]);

describe("atomic painter gesture", () => {
  it("cancels a multi-point stroke without mutating source or changing undo history", () => {
    const source = createSampleDocument();
    const h = createHistory(source);
    let gesture = beginPaintGesture(source, [5, 5], "body:north", "#ff0044", 1);
    gesture = continuePaintGesture(gesture, [18, 8], "body:north");
    expect(gesture.pixels).not.toEqual(source.textures[0]!.pixels);
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

describe("straight line and outlined rectangle gestures", () => {
  it("rebuilds each preview from original pixels rather than leaving previous ghost lines", () => {
    const source = createSampleDocument();
    let line = beginPaintGesture(source, [2, 2], "body:north", "#ff00ee", 1, "line");
    line = continuePaintGesture(line, [10, 2], "body:north");
    line = continuePaintGesture(line, [10, 8], "body:north");
    const afterLine = commitPaintGesture(source, line);
    expect(pixelsAt(afterLine, 10, 8)).toBe("#ff00ee");
    expect(pixelsAt(afterLine, 6, 2)).not.toBe("#ff00ee");
    expect(cancelPaintGesture(line)).toBe(source);
    expect(commit(createHistory(source), afterLine).past).toHaveLength(1);
    expect(undo(commit(createHistory(source), afterLine)).present).toBe(source);
  });
  it("renders final rectangle corners, retains source, and refuses cross-face seams", () => {
    const source = createSampleDocument();
    let rect = beginPaintGesture(source, [4, 4], "body:north", "#ff00ee", 1, "rectangle");
    rect = continuePaintGesture(rect, [12, 10], "body:north");
    const previous = rect;
    rect = continuePaintGesture(rect, [24, 24], "body:south");
    expect(rect).toBe(previous);
    const painted = commitPaintGesture(source, rect);
    expect(pixelsAt(painted, 4, 4)).toBe("#ff00ee");
    expect(pixelsAt(painted, 8, 4)).toBe("#ff00ee");
    expect(pixelsAt(painted, 12, 8)).toBe("#ff00ee");
    expect(pixelsAt(painted, 8, 10)).toBe("#ff00ee");
    expect(pixelsAt(painted, 8, 7)).not.toBe("#ff00ee");
    expect(pixelsAt(painted, 24, 24)).not.toBe("#ff00ee");
    expect(cancelPaintGesture(rect)).toBe(source);
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


describe("transparent eraser gestures", () => {
  it("sets all four RGBA channels to zero and remains one exact undo action", () => {
    const source = createSampleDocument();
    let gesture = beginPaintGesture(source, [4, 4], "body:north", "#123456", 2, "eraser");
    gesture = continuePaintGesture(gesture, [6, 5], "body:north");
    const changed = commitPaintGesture(source, gesture);
    const index = (4 * source.textures[0]!.width + 4) * 4;
    expect(changed.textures[0]!.pixels.slice(index, index + 4)).toEqual([0, 0, 0, 0]);
    const history = commit(createHistory(source), changed);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(cancelPaintGesture(gesture)).toBe(source);
  });

  it("keeps the eraser mode while crossing UV seams without joining disconnected areas", () => {
    const source = createSampleDocument();
    let gesture = beginPaintGesture(source, [4, 4], "body:north", "#ffffff", 1, "eraser");
    gesture = continuePaintGesture(gesture, [26, 26], "body:east");
    const result = commitPaintGesture(source, gesture);
    const alpha = (x: number, y: number) => result.textures[0]!.pixels[(y * 32 + x) * 4 + 3];
    expect(alpha(4, 4)).toBe(0);
    expect(alpha(26, 26)).toBe(0);
    expect(alpha(15, 15)).toBe(255);
  });
});

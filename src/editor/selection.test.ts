import { describe, expect, it } from "vitest";
import { createSampleDocument, parseDocument } from "./domain";
import { commit, createHistory, redo, undo } from "./history";
import {
  alignSelection, distributeSelection, mirrorSelection,
  beginSelectionGesture, cancelSelectionGesture, commitSelectionGesture,
  deleteSelection, duplicateSelection, repeatSelection, emptySelection, reconcileSelection,
  selectAt, selectOnly, selectionBounds, setEachSize, setSelectionBounds, transformSelection
} from "./selection";

const selected = ["body", "base"];

describe("session selection", () => {
  const order = ["body", "base", "roof", "crown"];
  it("replaces, toggles and selects a stable filtered range", () => {
    let state = selectAt(emptySelection(), "body", order);
    state = selectAt(state, "roof", order, { toggle: true });
    expect(state.ids).toEqual(["body", "roof"]);
    state = selectAt(state, "crown", order, { range: true });
    expect(state.ids).toEqual(["roof", "crown"]);
    state = selectAt(state, "crown", order, { toggle: true });
    expect(state.primary).toBe("roof");
    expect(selectAt(state, "missing", order)).toBe(state);
  });
  it("uses visible filter order and retains an anchor while extending", () => {
    const initial = selectOnly("body");
    const ranged = selectAt(initial, "crown", ["body", "roof", "crown"], { range: true });
    expect(ranged.ids).toEqual(["body", "roof", "crown"]);
    expect(ranged.anchor).toBe("body");
    expect(selectAt(ranged, "roof", order, { range: true }).ids).toEqual(["body", "base", "roof"]);
  });
  it("reconciles deleted IDs without mutating a surviving selection", () => {
    const initial = selectAt(selectOnly("body"), "roof", order, { toggle: true });
    expect(reconcileSelection(initial, order)).toBe(initial);
    expect(reconcileSelection(initial, ["body"])).toEqual(selectOnly("body"));
    expect(reconcileSelection(initial, [])).toEqual(emptySelection());
  });
});

describe("all-or-nothing batch edits", () => {
  it("translates once, preserves offsets and texture identity, and round-trips native source", () => {
    const source = createSampleDocument();
    const next = transformSelection(source, selected, [2, 3, -1]);
    expect(next.cuboids[0]!.from).toEqual([5, 6, 2]);
    expect(next.cuboids[1]!.from).toEqual([4, 4, 1]);
    expect(next.cuboids[2]).toBe(source.cuboids[2]);
    expect(next.textures).toBe(source.textures);
    expect(source.cuboids[0]!.from).toEqual([3, 3, 3]);
    expect(parseDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
    const history = commit(createHistory(source), next);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(next);
  });
  it("scales the aggregate bounds while maintaining relative positions", () => {
    const source = createSampleDocument();
    const bounds = selectionBounds(source.cuboids.slice(0, 2))!;
    const next = setSelectionBounds(source, selected, "size", 0, bounds.size[0] * 2);
    expect(next.cuboids[0]!.from[0]).toBe(4);
    expect(next.cuboids[0]!.to[0]).toBe(24);
    expect(next.cuboids[1]!.from[0]).toBe(2);
    expect(next.cuboids[1]!.to[0]).toBe(26);
  });
  it("sets each part size without aligning their distinct corners", () => {
    const source = createSampleDocument();
    const next = setEachSize(source, selected, 1, 4);
    expect(next.cuboids.slice(0, 2).map(node => node.to[1] - node.from[1])).toEqual([4, 4]);
    expect(next.cuboids[0]!.from).toBe(source.cuboids[0]!.from);
  });
  it("rejects the entire operation when just one member exceeds bounds", () => {
    const source = createSampleDocument();
    const before = JSON.stringify(source);
    expect(() => transformSelection(source, selected, [244, 0, 0])).toThrow(/complete edit/);
    expect(JSON.stringify(source)).toBe(before);
    expect(() => setEachSize(source, selected, 0, 65)).toThrow(/64/);
    expect(() => transformSelection(source, selected, [NaN, 0, 0])).toThrow(/finite/);
    expect(() => transformSelection(source, selected, [0, 0, 0], [-1, 1, 1])).toThrow(/positive/);
  });
  it.each(["locked", "hidden", "missing"])("rejects %s members without silently editing a subset", condition => {
    const source = createSampleDocument();
    if (condition === "locked") source.cuboids[1]!.locked = true;
    if (condition === "hidden") source.cuboids[1]!.visible = false;
    const ids = condition === "missing" ? [...selected, "unknown"] : selected;
    expect(() => transformSelection(source, ids, [1, 0, 0])).toThrow();
    expect(() => deleteSelection(source, ids)).toThrow();
    expect(() => duplicateSelection(source, ids, ["one", "two"])).toThrow();
    expect(source.cuboids).toHaveLength(7);
  });
  it("does not create history for an identity transform or empty deletion", () => {
    const source = createSampleDocument();
    expect(transformSelection(source, selected, [0, 0, 0])).toBe(source);
    expect(deleteSelection(source, [])).toBe(source);
    expect(setSelectionBounds(source, selected, "position", 0, 2)).toBe(source);
  });
  it("duplicates as one transaction with copied bindings and shared source textures", () => {
    const source = createSampleDocument();
    const next = duplicateSelection(source, selected, ["copy-body", "copy-base"]);
    expect(next.cuboids).toHaveLength(9);
    expect(next.cuboids[7]!.from).toEqual([4, 3, 4]);
    expect(next.cuboids[7]!.faces).toEqual(source.cuboids[0]!.faces);
    expect(next.cuboids[7]!.faces).not.toBe(source.cuboids[0]!.faces);
    expect(next.textures).toBe(source.textures);
    expect(() => duplicateSelection(source, selected, ["body", "other"])).toThrow(/identifiers/);
    expect(() => duplicateSelection(source, selected, ["same", "same"])).toThrow(/identifiers/);
    const history = commit(createHistory(source), next);
    expect(undo(history).present).toBe(source);
  });
  it("deletes every selected part in one reversible operation", () => {
    const source = createSampleDocument();
    const next = deleteSelection(source, selected);
    expect(next.cuboids).toHaveLength(5);
    expect(next.textures).toBe(source.textures);
    expect(undo(commit(createHistory(source), next)).present).toBe(source);
  });
  it("enforces the source part limit before allocating copies", () => {
    const source = createSampleDocument();
    source.cuboids = Array.from({ length: 2000 }, (_, index) => ({ ...source.cuboids[0]!, id: `part-${index}` }));
    expect(() => duplicateSelection(source, ["part-0"], ["extra"])).toThrow(/2,000/);
  });
});


describe("multi-selection alignment and distribution", () => {
  it("aligns faces and centers without resizing, changing UVs, or touching other parts", () => {
    const source = createSampleDocument();
    const aligned = alignSelection(source, ["body", "base"], 1, "maximum");
    expect(aligned.cuboids[0]).toBe(source.cuboids[0]);
    expect(aligned.cuboids[1]!.from).toEqual([2, 10, 2]);
    expect(aligned.cuboids[1]!.to).toEqual([14, 12, 14]);
    expect(aligned.cuboids[2]).toBe(source.cuboids[2]);
    expect(aligned.textures).toBe(source.textures);
    expect(aligned.cuboids[1]!.faces).toBe(source.cuboids[1]!.faces);
    expect(parseDocument(aligned)).toEqual(aligned);
    const left = alignSelection(source, ["body", "base"], 0, "minimum");
    expect(left.cuboids[0]!.from[0]).toBe(2);
    expect(left.cuboids[0]!.to[0]).toBe(12);
    const center = alignSelection(source, ["body", "base"], 0, "center");
    expect(center).toBe(source);
    const action = commit(createHistory(source), aligned);
    expect(undo(action).present).toBe(source);
    expect(redo(undo(action)).present).toBe(aligned);
  });

  it("evenly distributes centers while preserving endpoint positions and lengths", () => {
    const source = createSampleDocument();
    const arranged = distributeSelection(source, ["base", "roof", "crown"], 1);
    const byId = (id: string) => arranged.cuboids.find(node => node.id === id)!;
    expect(byId("base")).toBe(source.cuboids[1]);
    expect(byId("crown")).toBe(source.cuboids[3]);
    expect(byId("roof").from[1]).toBe(7.25);
    expect(byId("roof").to[1]).toBe(9.25);
    expect(arranged.cuboids[0]).toBe(source.cuboids[0]);
    expect(arranged.textures).toBe(source.textures);
    expect(parseDocument(arranged)).toEqual(arranged);
    expect(undo(commit(createHistory(source), arranged)).present).toBe(source);
    expect(distributeSelection(source, ["body", "base"], 1)).toBe(source);
    expect(distributeSelection(source, ["body", "base", "roof"], 0)).toBe(source);
  });

  it("rejects hidden, locked or out-of-range geometry atomically", () => {
    const source = createSampleDocument();
    const before = JSON.stringify(source);
    const locked = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "base" ? { ...node, locked: true } : node) };
    expect(() => alignSelection(locked, ["body", "base"], 1, "maximum")).toThrow(/locked/);
    expect(() => distributeSelection(locked, ["body", "base", "roof"], 1)).toThrow(/locked/);
    const hidden = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "base" ? { ...node, visible: false } : node) };
    expect(() => alignSelection(hidden, ["body", "base"], 1, "maximum")).toThrow(/hidden/);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe("duplicate array modeling", () => {
  it("repeats two painted/solid parts with exact spacing, stable IDs and one undo step", () => {
    const source = createSampleDocument();
    const before = JSON.stringify(source);
    const ids = ["a1", "b1", "a2", "b2", "a3", "b3"];
    const result = repeatSelection(source, ["body", "base"], ids, 3, [0, 4, -2]);
    expect(result.cuboids).toHaveLength(source.cuboids.length + 6);
    expect(result.cuboids.slice(7).map(node => node.id)).toEqual(ids);
    expect(result.cuboids[7]!.from).toEqual([3, 7, 1]);
    expect(result.cuboids[8]!.from).toEqual([2, 5, 0]);
    expect(result.cuboids[9]!.from).toEqual([3, 11, -1]);
    expect(result.cuboids[11]!.from).toEqual([3, 15, -3]);
    expect(result.cuboids[7]!.faces).toEqual(source.cuboids[0]!.faces);
    expect(result.cuboids[7]!.faces).not.toBe(source.cuboids[0]!.faces);
    expect(result.cuboids[7]!.material).toBe("texture");
    expect(result.cuboids[8]!.material).toBe("solid");
    expect(result.textures).toBe(source.textures);
    expect(JSON.stringify(source)).toBe(before);
    expect(parseDocument(result)).toEqual(result);
    const action = commit(createHistory(source), result);
    expect(action.past).toHaveLength(1);
    expect(undo(action).present).toBe(source);
    expect(redo(undo(action)).present).toBe(result);
  });

  it("rejects invalid counts, IDs, offsets, excessive parts or locked selection without partial edits", () => {
    const source = createSampleDocument();
    const before = JSON.stringify(source);
    const ids = ["copy1", "copy2"];
    expect(() => repeatSelection(source, selected, ids, 0, [1, 0, 0])).toThrow(/1–64/);
    expect(() => repeatSelection(source, selected, ids, 65, [1, 0, 0])).toThrow(/1–64/);
    expect(() => repeatSelection(source, selected, ids, 1, [0, 0, 0])).toThrow(/nonzero/);
    expect(() => repeatSelection(source, selected, ids, 1, [NaN, 0, 0])).toThrow(/finite/);
    expect(() => repeatSelection(source, selected, ["body", "copy2"], 1, [1, 0, 0])).toThrow(/identifiers/);
    expect(() => repeatSelection(source, selected, ["copy1", "copy1"], 1, [1, 0, 0])).toThrow(/identifiers/);
    expect(() => repeatSelection(source, selected, ids, 2, [1, 0, 0])).toThrow(/identifiers/);
    expect(() => repeatSelection(source, selected, ids, 1, [300, 0, 0])).toThrow(/geometry bounds/);
    const locked = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, locked: true } : node) };
    expect(() => repeatSelection(locked, selected, ids, 1, [1, 0, 0])).toThrow(/locked/);
    const big = { ...source, cuboids: Array.from({ length: 1999 }, (_, i) => ({
      ...source.cuboids[0]!, id: "part-" + i
    })) };
    expect(() => repeatSelection(big, ["part-0"], ids, 2, [1, 0, 0])).toThrow(/2,000/);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe("selection geometry mirror", () => {
  it("reflects selected part positions around the shared pivot as one reversible edit", () => {
    const source = createSampleDocument();
    const mirrored = mirrorSelection(source, ["body", "base"], 1);
    expect(mirrored.cuboids[0]!.from).toEqual([3, 1, 3]);
    expect(mirrored.cuboids[0]!.to).toEqual([13, 10, 13]);
    expect(mirrored.cuboids[1]!.from).toEqual([2, 10, 2]);
    expect(mirrored.cuboids[1]!.to).toEqual([14, 12, 14]);
    expect(mirrored.cuboids[2]).toBe(source.cuboids[2]);
    expect(mirrored.cuboids[0]!.faces).toBe(source.cuboids[0]!.faces);
    expect(mirrored.cuboids[0]!.to[1] - mirrored.cuboids[0]!.from[1]).toBe(9);
    expect(mirrored.textures).toBe(source.textures);
    expect(parseDocument(mirrored)).toEqual(mirrored);
    const action = commit(createHistory(source), mirrored);
    expect(action.past).toHaveLength(1);
    expect(undo(action).present).toBe(source);
    expect(redo(undo(action)).present).toBe(mirrored);
    const restored = mirrorSelection(mirrored, ["body", "base"], 1);
    expect(restored.cuboids).toEqual(source.cuboids);
  });

  it("returns the original for an empty or symmetrical selection, and rejects locked members", () => {
    const source = createSampleDocument();
    expect(mirrorSelection(source, [], 0)).toBe(source);
    expect(mirrorSelection(source, ["body", "base"], 0)).toBe(source);
    const locked = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "base" ? { ...node, locked: true } : node) };
    expect(() => mirrorSelection(locked, ["body", "base"], 1)).toThrow(/locked/);
    const hidden = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, visible: false } : node) };
    expect(() => mirrorSelection(hidden, ["body", "base"], 1)).toThrow(/hidden/);
    expect(source.cuboids[0]!.from).toEqual([3, 3, 3]);
  });
});

describe("selection gesture lifecycle", () => {
  it("cancel returns the exact original; a completed gesture is one undo step", () => {
    const source = createSampleDocument();
    const gesture = beginSelectionGesture(source, selected);
    expect(cancelSelectionGesture(gesture)).toBe(source);
    const next = commitSelectionGesture(source, gesture, [1, 0, 0], [1, 1, 1]);
    expect(commit(createHistory(source), next).past).toHaveLength(1);
    expect(commit(createHistory(source), cancelSelectionGesture(gesture)).past).toHaveLength(0);
  });
  it("cannot commit into a changed source, switched project, or replayed revision", () => {
    const source = createSampleDocument();
    const gesture = beginSelectionGesture(source, selected);
    const changed = { ...source, name: "A newer edit" };
    expect(commitSelectionGesture(changed, gesture, [2, 0, 0], [1, 1, 1])).toBe(changed);
    expect(source.cuboids[0]!.from).toEqual([3, 3, 3]);
  });
});

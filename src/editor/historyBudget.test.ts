import { describe, expect, it } from "vitest";
import { createSampleDocument, setTexturePixels } from "./domain";
import { addRasterLayer, setRasterLayerOpacity } from "./layers";
import { commit, createHistory, trimHistorySnapshots, undo, redo } from "./history";

describe("bounded raster history without sacrificing ordinary source undo", () => {
  it("evicts the oldest pixel-heavy revisions while retaining the most recent edit", () => {
    const source = createSampleDocument();
    const docs = [source];
    for (let index = 0; index < 5; index++) {
      const previous = docs[docs.length - 1]!;
      const changed = previous.textures[0]!.pixels.slice();
      changed[0] = 50 + index;
      docs.push(setTexturePixels(previous, changed));
    }
    const retained = trimHistorySnapshots(docs.slice(0, -1), docs.at(-1)!, doc => [doc], 100_000);
    expect(retained).toHaveLength(2); // three distinct 32x32 RGBA arrays total
    expect(retained).toEqual(docs.slice(-3, -1));
    expect(trimHistorySnapshots(docs.slice(0, -1), docs.at(-1)!, doc => [doc], 1))
      .toEqual([docs.at(-2)!]); // at least one reversible snapshot
  });

  it("counts shared immutable layer arrays only once across revisions", () => {
    const initial = addRasterLayer(createSampleDocument(), "main", "paint", "base");
    const a = setRasterLayerOpacity(initial, "main", "paint", .8);
    const b = setRasterLayerOpacity(a, "main", "paint", .6);
    const c = setRasterLayerOpacity(b, "main", "paint", .4);
    expect(a.textures[0]!.layers![0]!.pixels).toBe(initial.textures[0]!.layers![0]!.pixels);
    expect(b.textures[0]!.layers![1]!.pixels).toBe(a.textures[0]!.layers![1]!.pixels);
    // 2 shared layer RGBA arrays + four flattened composites.
    const kept = trimHistorySnapshots([initial, a, b], c, doc => [doc], 220_000);
    expect(kept).toHaveLength(3);
    const tiny = trimHistorySnapshots([initial, a, b], c, doc => [doc], 110_000);
    expect(tiny.length).toBeLessThan(3);
    expect(tiny.at(-1)).toBe(b);
  });

  it("retains existing undo and redo semantics on ordinary edits", () => {
    const source = createSampleDocument();
    const edited = { ...source, name: "Renamed" };
    const history = commit(createHistory(source), edited);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(edited);
    expect(history.revision).toBe(1);
  });
});

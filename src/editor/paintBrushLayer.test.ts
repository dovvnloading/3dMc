import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { addRasterLayer, setRasterLayerVisibility } from "./layers";
import { commit, createHistory, redo, undo } from "./history";
import { beginPaintGesture, cancelPaintGesture, commitPaintGesture, continuePaintGesture } from "./gestures";

describe("large round brush with editable source layers", () => {
  const layered = () => addRasterLayer(createSampleDocument(), "main", "ink", "background");
  it("writes only to the visible active layer and clips each stamp to the face UV mask", () => {
    const source = layered();
    const mask = { left: 4, top: 3, right: 9, bottom: 8 };
    let gesture = beginPaintGesture(source, [2, 5], "body:north",
      "#c76d68", 6, "pencil", "main", mask, "round");
    gesture = continuePaintGesture(gesture, [11, 5], "body:north");
    const after = commitPaintGesture(source, gesture);
    const old = source.textures[0]!, next = after.textures[0]!;
    expect(after).not.toBe(source);
    expect(next.layers![0]!.pixels).toEqual(old.layers![0]!.pixels);
    expect(next.layers![1]!.pixels).not.toEqual(old.layers![1]!.pixels);
    for (let y = 0; y < next.height; y++) for (let x = 0; x < next.width; x++) {
      const i = (y * next.width + x) * 4;
      const painted = next.layers![1]!.pixels[i + 3] === 255;
      if (painted) expect(x >= 4 && x < 9 && y >= 3 && y < 8).toBe(true);
    }
    const history = commit(createHistory(source), after);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(after);
    expect(cancelPaintGesture(gesture)).toBe(source);
    expect(source.textures[0]!.layers![1]!.pixels.every(v => v === 0)).toBe(true);
  });
  it("rejects hidden active layers without a preview or document mutation", () => {
    const hidden = setRasterLayerVisibility(layered(), "main", "ink", false);
    expect(() => beginPaintGesture(hidden, [6, 5], "body:north",
      "#ffffff", 16, "pencil", "main", undefined, "round"))
      .toThrow(/Show the active layer/);
  });
});

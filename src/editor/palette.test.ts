import { describe, expect, it } from "vitest";
import { createSampleDocument, parseDocument } from "./domain";
import { commit, createHistory, redo, undo } from "./history";
import { addPaletteColor, DEFAULT_PALETTE, MAX_PALETTE_COLORS,
  movePaletteColor, paletteColors, removePaletteColor } from "./palette";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { decodeNativePack, encodeNativePack } from "./nativePackArchive";
import { indexLegacyProject } from "../pack/packDocument";

describe("editable source color palettes", () => {
  it("adds, reorders and removes swatches as independent undoable edits", () => {
    const source = createSampleDocument();
    expect(paletteColors(source)).toEqual(DEFAULT_PALETTE);
    expect(source.palette).toBeUndefined();
    const added = addPaletteColor(source, "#12ABCD");
    expect(added.palette).toEqual([...DEFAULT_PALETTE, "#12abcd"]);
    expect(addPaletteColor(added, "#12abcd")).toBe(added);
    expect(addPaletteColor(added, "#BAD")).toBe(added);
    const moved = movePaletteColor(added, "#12ABCD", "left");
    expect(moved.palette![moved.palette!.length - 2]).toBe("#12abcd");
    expect(moved.palette![moved.palette!.length - 1]).toBe("#222e38");
    const removed = removePaletteColor(moved, "#12abcd");
    expect(removed.palette).not.toContain("#12abcd");
    expect(removed.palette).toHaveLength(DEFAULT_PALETTE.length);
    const history = commit(createHistory(source), added);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(added);
    expect(source.palette).toBeUndefined();
  });
  it("validates saved colors and respects the 16-color source budget", () => {
    const source = createSampleDocument();
    const tooMany = Array.from({ length: MAX_PALETTE_COLORS + 1 }, (_, n) =>
      "#" + n.toString(16).padStart(6, "0"));
    expect(() => parseDocument({ ...source, palette: [] })).toThrow(/palette/);
    expect(() => parseDocument({ ...source, palette: ["#123456", "#123456"] })).toThrow(/palette/);
    expect(() => parseDocument({ ...source, palette: ["#ffffff", "#FFFFFF"] })).toThrow(/palette/);
    expect(() => parseDocument({ ...source, palette: tooMany })).toThrow(/palette/);
    expect(() => parseDocument({ ...source, palette: ["javascript:alert(1)"] })).toThrow(/palette/);
    const full = { ...source, palette: tooMany.slice(0, MAX_PALETTE_COLORS) };
    expect(addPaletteColor(full, "#ffffff")).toBe(full);
    expect(movePaletteColor(full, full.palette[0]!, "left")).toBe(full);
    expect(movePaletteColor(full, full.palette[15]!, "right")).toBe(full);
    const last = { ...source, palette: ["#123456"] };
    expect(removePaletteColor(last, "#123456")).toBe(last);
    expect(parseDocument(full).palette).toEqual(full.palette);
  });
  it("retains the palette through standalone and indexed source archives", async () => {
    const source = addPaletteColor(createSampleDocument(), "#abcdef");
    const standalone = await decodeNativeProject(await encodeNativeProject(source));
    expect(standalone).toEqual(source);
    const index = indexLegacyProject(source);
    const reopened = await decodeNativePack(await encodeNativePack(index, [source]));
    expect(reopened.sources).toEqual([source]);
    const legacy = createSampleDocument();
    expect((await decodeNativeProject(await encodeNativeProject(legacy))).palette).toBeUndefined();
  });
});

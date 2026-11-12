import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync, zipSync } from "fflate";
import { createSampleDocument, parseDocument, setTexturePixels } from "./domain";
import { createHistory, commit, undo, redo } from "./history";
import { beginPaintGesture, commitPaintGesture, continuePaintGesture, cancelPaintGesture } from "./gestures";
import { drawStroke } from "./pixels";
import { makeFaceTextureUnique } from "./regions";
import {
  MAX_RASTER_LAYERS, activeRasterLayer, addRasterLayer, flattenRasterLayers,
  flattenTextureLayers, moveRasterLayer, removeRasterLayer, renameRasterLayer,
  selectRasterLayer, setRasterLayerOpacity, setRasterLayerPixels, setRasterLayerVisibility
} from "./layers";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { decodeNativePack, encodeNativePack } from "./nativePackArchive";
import { indexLegacyProject } from "../pack/packDocument";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import { read3dMcRgbaPng } from "../import/strictPng";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const open = () => addRasterLayer(createSampleDocument(), "main", "paint", "background");

describe("source-backed raster layers and deterministic flattening", () => {
  it("begins nondestructively with original pixels and selects a transparent top layer", () => {
    const source = createSampleDocument();
    const opened = addRasterLayer(source, "main", "paint", "background");
    const t = opened.textures[0]!;
    expect(t.layers).toHaveLength(2);
    expect(t.layers!.map(l => l.name)).toEqual(["Background", "Layer 2"]);
    expect(t.activeLayerId).toBe("paint");
    expect(t.layers![0]!.pixels).toEqual(source.textures[0]!.pixels);
    expect(t.layers![1]!.pixels.every(value => value === 0)).toBe(true);
    expect(t.pixels).toEqual(source.textures[0]!.pixels);
    expect(JSON.stringify(source)).not.toContain("layers");
    expect(parseDocument(opened)).toEqual(opened);
    expect(() => addRasterLayer(opened, "main", "paint", "new-base")).toThrow(/ID/);
    expect(() => addRasterLayer(source, "main", "same", "same")).toThrow(/identifiers/);
  });

  it("uses straight alpha and opacity without changing source layer RGBA", () => {
    const base = { id: "base", name: "Base", visible: true, opacity: 1,
      pixels: [255, 0, 0, 255, 9, 8, 7, 0] };
    const top = { id: "top", name: "Top", visible: true, opacity: 1,
      pixels: [0, 0, 255, 128, 0, 0, 0, 0] };
    const result = flattenRasterLayers([base, top], 2, 1);
    expect(result.slice(0, 4)).toEqual([127, 0, 128, 255]);
    expect(result.slice(4)).toEqual([9, 8, 7, 0]); // transparent RGB survives unchanged
    expect(flattenRasterLayers([base, { ...top, opacity: .5 }], 2, 1).slice(0, 4))
      .toEqual([191, 0, 64, 255]);
    expect(flattenRasterLayers([base, { ...top, visible: false }], 2, 1))
      .toEqual(base.pixels);
    expect(flattenRasterLayers([top, base], 2, 1).slice(0, 4))
      .toEqual([255, 0, 0, 255]);
    expect(base.pixels).toEqual([255, 0, 0, 255, 9, 8, 7, 0]);
  });

  it("supports opacity, visibility, ordering, names, selection, delete and undo", () => {
    const original = open();
    const t = original.textures[0]!;
    const over = [...t.layers![1]!.pixels];
    over[0] = 0; over[1] = 255; over[2] = 0; over[3] = 255;
    const painted = setRasterLayerPixels(original, "main", "paint", over);
    expect(painted.textures[0]!.pixels.slice(0, 4)).toEqual([0, 255, 0, 255]);
    const hidden = setRasterLayerVisibility(painted, "main", "paint", false);
    expect(hidden.textures[0]!.pixels).toEqual(t.pixels);
    const shown = setRasterLayerVisibility(hidden, "main", "paint", true);
    expect(shown.textures[0]!.pixels.slice(0, 4)).toEqual([0, 255, 0, 255]);
    const half = setRasterLayerOpacity(shown, "main", "paint", .5);
    expect(half.textures[0]!.pixels[1]).toBeGreaterThan(t.pixels[1]!);
    const lowered = moveRasterLayer(half, "main", "paint", "down");
    expect(lowered.textures[0]!.pixels.slice(0, 4)).toEqual(t.pixels.slice(0, 4));
    const raised = moveRasterLayer(lowered, "main", "paint", "up");
    expect(raised.textures[0]!.pixels).toEqual(half.textures[0]!.pixels);
    const renamed = renameRasterLayer(raised, "main", "paint", "Highlights");
    expect(renamed.textures[0]!.layers![1]!.name).toBe("Highlights");
    const selected = selectRasterLayer(renamed, "main", "background");
    expect(activeRasterLayer(selected.textures[0]!)?.name).toBe("Background");
    const removed = removeRasterLayer(selected, "main", "paint");
    expect(removed.textures[0]!.layers).toHaveLength(1);
    expect(removed.textures[0]!.pixels).toEqual(t.pixels);
    expect(() => removeRasterLayer(removed, "main", "background")).toThrow(/last layer/);
    const h = commit(createHistory(original), selected);
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(original);
    expect(redo(undo(h)).present).toBe(selected);
    const flat = flattenTextureLayers(selected, "main");
    expect(flat.textures[0]!.layers).toBeUndefined();
    expect(flat.textures[0]!.pixels).toEqual(selected.textures[0]!.pixels);
    expect(undo(commit(createHistory(selected), flat)).present).toBe(selected);
    expect(parseDocument(selected)).toEqual(selected);
  });

  it("paints the active layer with one atomic preview, and refuses destructive flat writes", () => {
    const source = open(), original = source.textures[0]!.pixels.slice();
    let gesture = beginPaintGesture(source, [5, 6], "body:north", "#cc00aa", 1, "line");
    gesture = continuePaintGesture(gesture, [10, 6], "body:north");
    expect(gesture.layerId).toBe("paint");
    expect(gesture.pixels).not.toEqual(original);
    expect(gesture.layerPixels).not.toEqual(original);
    expect(source.textures[0]!.pixels).toEqual(original);
    expect(cancelPaintGesture(gesture)).toBe(source);
    const changed = commitPaintGesture(source, gesture);
    expect(changed.textures[0]!.layers![1]!.pixels).toEqual(gesture.layerPixels);
    expect(changed.textures[0]!.pixels).toEqual(gesture.pixels);
    expect(undo(commit(createHistory(source), changed)).present).toBe(source);
    const hidden = setRasterLayerVisibility(source, "main", "paint", false);
    expect(() => beginPaintGesture(hidden, [5, 5], "body:north", "#ffffff", 1))
      .toThrow(/Show the active layer/);
    expect(() => setTexturePixels(source, drawStroke(original, 32, 32,
      [2, 2], [3, 3], "#ffffff", 1))).toThrow(/Flatten them explicitly/);
    expect(parseDocument(changed)).toEqual(changed);
  });

  it("rejects invalid stack references, opacity and inconsistent flat cache", () => {
    const source = open();
    const badCache = clone(source);
    badCache.textures[0]!.pixels[0] = (badCache.textures[0]!.pixels[0]! + 1) % 256;
    expect(() => parseDocument(badCache)).toThrow(/texture pixels/);
    const badId = clone(source);
    badId.textures[0]!.activeLayerId = "ghost";
    expect(() => parseDocument(badId)).toThrow(/texture pixels/);
    const duplicate = clone(source);
    duplicate.textures[0]!.layers![1]!.id = "background";
    expect(() => parseDocument(duplicate)).toThrow(/texture pixels/);
    const unknown = clone(source) as typeof source & { textures: any[] };
    unknown.textures[0]!.layers[0]!.blendMode = "multiply";
    expect(() => parseDocument(unknown)).toThrow(/texture pixels/);
    expect(() => setRasterLayerOpacity(source, "main", "paint", -1)).toThrow(/Opacity/);
    expect(() => setRasterLayerOpacity(source, "main", "paint", NaN)).toThrow(/Opacity/);
    let many = source;
    for (let n = 0; n < MAX_RASTER_LAYERS - 2; n++)
      many = addRasterLayer(many, "main", "extra" + n, "otherbase" + n);
    expect(many.textures[0]!.layers).toHaveLength(MAX_RASTER_LAYERS);
    expect(() => addRasterLayer(many, "main", "overflow", "other"))
      .toThrow(/At most eight/);
  });

  it("persists exact source layers and flattened export in standalone and pack ZIPs", async () => {
    const source = open();
    const before = JSON.stringify(source);
    const standalone = await encodeNativeProject(source);
    const files = unzipSync(standalone);
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest.layers).toEqual([
      "textures/main/layers/background.png", "textures/main/layers/paint.png"
    ]);
    expect(files["textures/main.png"]).toBeDefined();
    expect(files["textures/main/layers/paint.png"]).toBeDefined();
    const restored = await decodeNativeProject(standalone);
    expect(restored).toEqual(source);
    expect(await encodeNativeProject(restored)).toEqual(standalone);
    const pack = indexLegacyProject(source);
    const bytes = await encodeNativePack(pack, [source]);
    const indexed = unzipSync(bytes);
    const packManifest = JSON.parse(strFromU8(indexed["manifest.json"]!));
    expect(packManifest.sources[0].layers).toHaveLength(2);
    expect(indexed["models/0/textures/main/layers/paint.png"]).toBeDefined();
    const decoded = await decodeNativePack(bytes);
    expect(decoded.sources).toEqual([source]);
    expect(await encodeNativePack(decoded.pack, decoded.sources)).toEqual(bytes);
    const exported = makeIndexedJava1214Pack(pack, [source]);
    const png = read3dMcRgbaPng(unzipSync(exported.zip)["assets/3dmc/textures/block/main.png"]!);
    expect(png.pixels).toEqual(source.textures[0]!.pixels);
    expect(JSON.stringify(source)).toBe(before);

    const corrupted = unzipSync(standalone);
    const damagedLayer = corrupted["textures/main/layers/paint.png"]!;
    damagedLayer[50] = damagedLayer[50]! ^ 1;
    const tampered = zipSync(corrupted, { level: 0, mtime: new Date(1980, 0, 1) });
    await expect(decodeNativeProject(tampered)).rejects.toThrow(/checksum|SHA-256/i);
    const corruptedPack = unzipSync(bytes);
    const damagedPackLayer = corruptedPack["models/0/textures/main/layers/paint.png"]!;
    damagedPackLayer[50] = damagedPackLayer[50]! ^ 1;
    await expect(decodeNativePack(zipSync(corruptedPack, { level: 0, mtime: new Date(1980, 0, 1) })))
      .rejects.toThrow(/checksum|SHA-256/i);
  });

  it("retains full editable layer sources when cloning a face texture asset", () => {
    const source = open();
    const copied = makeFaceTextureUnique(source, "body", "north", "unique_sheet");
    const asset = copied.textures.find(t => t.id === "unique_sheet")!;
    expect(asset.layers).toEqual(source.textures[0]!.layers);
    expect(asset.layers).not.toBe(source.textures[0]!.layers);
    expect(asset.layers![0]!.pixels).not.toBe(source.textures[0]!.layers![0]!.pixels);
    expect(parseDocument(copied)).toEqual(copied);
  });
});

import { describe, expect, it } from "vitest";
import { createSampleDocument, parseDocument } from "./domain";
import { commit, createHistory, undo } from "./history";
import { clearPixelRegion, commitTextureDraft, copyPixelRegion, makeFaceTextureUnique, mirrorPixelRegion,
  overlappingFaces, pastePixelRegion, reverseFaceUV } from "./regions";

const image = { width: 3, height: 2, pixels: [
  1,2,3,0, 4,5,6,127, 7,8,9,255,
  10,11,12,255, 13,14,15,10, 16,17,18,240
] };
describe("exact bounded pixel regions", () => {
  it("copies RGBA including hidden RGB and returns independent storage", () => {
    const copied = copyPixelRegion(image, { x: 0, y: 0, width: 2, height: 1 });
    expect(copied.pixels).toEqual([1,2,3,0,4,5,6,127]);
    expect(copied.pixels).not.toBe(image.pixels);
  });
  it("pastes every channel without compositing and never modifies the source", () => {
    const copied = copyPixelRegion(image, { x: 0, y: 0, width: 2, height: 1 });
    const next = pastePixelRegion(image, copied, 1, 1);
    expect(next.slice(16)).toEqual(copied.pixels);
    expect(next.slice(0, 16)).toEqual(image.pixels.slice(0, 16));
    expect(image.pixels.slice(16)).toEqual([13,14,15,10,16,17,18,240]);
  });
  it("rejects overflow, fractional coordinates and invalid bytes, without clipping", () => {
    const copied = copyPixelRegion(image, { x: 0, y: 0, width: 2, height: 1 });
    expect(() => pastePixelRegion(image, copied, 2, 1)).toThrow(/fit/);
    expect(() => pastePixelRegion(image, copied, .5, 0)).toThrow(/fit/);
    expect(() => copyPixelRegion(image, { x: 0, y: 0, width: 0, height: 1 })).toThrow();
    expect(() => pastePixelRegion(image, { width: 1, height: 1, pixels: [0, 1, 2, NaN] }, 0, 0)).toThrow(/RGBA/);
    expect(() => copyPixelRegion({ ...image, width: 1000 }, { x: 0, y: 0, width: 1, height: 1 })).toThrow(/bounded/);
  });
  it("mirrors only the selected region and twice restores all bytes", () => {
    const rect = { x: 1, y: 0, width: 2, height: 2 };
    for (const axis of ["horizontal", "vertical"] as const) {
      const mirrored = mirrorPixelRegion(image, rect, axis);
      expect(mirrored.slice(0, 4)).toEqual(image.pixels.slice(0, 4));
      expect(mirrorPixelRegion({ ...image, pixels: mirrored }, rect, axis)).toEqual(image.pixels);
    }
  });
  it("clears only the selected pixels to transparent black", () => {
    const next = clearPixelRegion(image, { x: 1, y: 0, width: 1, height: 2 });
    expect(next.slice(4, 8)).toEqual([0,0,0,0]); expect(next.slice(16, 20)).toEqual([0,0,0,0]);
    expect(next.slice(20)).toEqual(image.pixels.slice(20));
  });
  it("commits a staged draft once, cancels by discard and rejects stale sources", () => {
    const source = createSampleDocument(), texture = source.textures[0]!;
    const pixels = clearPixelRegion(texture, { x: 0, y: 0, width: 2, height: 2 });
    const next = commitTextureDraft(source, source, texture.id, pixels);
    const history = commit(createHistory(source), next);
    expect(history.past).toHaveLength(1); expect(undo(history).present).toBe(source);
    expect(commitTextureDraft(source, source, texture.id, texture.pixels)).toBe(source);
    expect(() => commitTextureDraft({ ...source }, source, texture.id, pixels)).toThrow(/project changed/);
  });
});
describe("UV sharing and deliberate independence", () => {
  it("detects reversed/rotated overlap but excludes merely touching edges and other sheets", () => {
    const doc = createSampleDocument(), node = doc.cuboids[0]!;
    node.faces.north.uv = [0, 0, 4, 4];
    for (const face of ["up", "down", "south", "west", "east"] as const) node.faces[face].uv = [4, 0, 8, 4];
    expect(overlappingFaces(doc, "body", "north")).toEqual([]);
    node.faces.east.uv = [3, 3, 1, 1]; node.faces.east.rotation = 90;
    expect(overlappingFaces(doc, "body", "north").map(x => x.face)).toEqual(["east"]);
  });
  it("reverses authored U/V bounds without changing rotations or other faces", () => {
    const source = createSampleDocument(); source.cuboids[0]!.faces.north.rotation = 90;
    const reversed = reverseFaceUV(source, "body", "north", "u");
    expect(reversed.cuboids[0]!.faces.north.uv).toEqual([16,0,0,16]);
    expect(reversed.cuboids[0]!.faces.north.rotation).toBe(90);
    expect(reverseFaceUV(reversed, "body", "north", "u")).toEqual(source);
    expect(reversed.textures).toBe(source.textures);
  });
  it("makes exactly one face independent with a full source copy in one history entry", () => {
    const source = createSampleDocument();
    const next = makeFaceTextureUnique(source, "body", "north", "independent");
    expect(next.textures).toHaveLength(2);
    expect(next.textures[1]!.pixels).toEqual(source.textures[0]!.pixels);
    expect(next.textures[1]!.pixels).not.toBe(source.textures[0]!.pixels);
    expect(next.cuboids[0]!.faces.north.textureId).toBe("independent");
    expect(next.cuboids[0]!.faces.east.textureId).toBe("main");
    expect(overlappingFaces(next, "body", "north")).toEqual([]);
    expect(parseDocument(next)).toEqual(next);
    expect(undo(commit(createHistory(source), next)).present).toBe(source);
  });
  it("refuses locked sources, duplicate IDs and exhausted slots atomically", () => {
    const doc = createSampleDocument();
    expect(() => makeFaceTextureUnique(doc, "body", "north", "main")).toThrow(/identifier/);
    doc.cuboids[0]!.locked = true;
    expect(() => reverseFaceUV(doc, "body", "north", "v")).toThrow(/unlocked/);
    doc.cuboids[0]!.locked = false;
    doc.textures = Array.from({ length: 16 }, (_, i) => ({ ...doc.textures[0]!, id: i ? `tex_${i}` : "main" }));
    expect(() => makeFaceTextureUnique(doc, "body", "north", "extra")).toThrow(/16/);
  });
});

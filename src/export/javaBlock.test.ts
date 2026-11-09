import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8, unzlibSync } from "fflate";
import { createSampleDocument, setAxisValue, setTexturePixels, updateFaceRotation, updateFaceUV } from "../editor/domain";
import { crc32, encodeRgbaPng } from "./png";
import { read3dMcRgbaPng } from "../import/strictPng";
import {
  buildJava1214Model, inspectJava1214, JavaExportBlocked, JAVA_PACK_PATHS,
  makeJava1214Pack, RESOURCE_PACK_FORMAT
} from "./javaBlock";

function pngPixel(png: Uint8Array): number[] {
  expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const len = view.getUint32(8, false);
  expect(len).toBe(13);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  let offset = 8;
  const idats: number[] = [];
  while (offset < png.length) {
    const size = view.getUint32(offset, false);
    const type = strFromU8(png.slice(offset + 4, offset + 8));
    const data = png.slice(offset + 8, offset + 8 + size);
    const checksum = view.getUint32(offset + 8 + size, false);
    expect(crc32(png.slice(offset + 4, offset + 8 + size))).toBe(checksum);
    if (type === "IDAT") idats.push(...data);
    offset += 12 + size;
    if (type === "IEND") break;
  }
  const unfiltered = unzlibSync(new Uint8Array(idats));
  expect(unfiltered.length).toBe(height * (1 + width * 4));
  expect(unfiltered[0]).toBe(0);
  return [...unfiltered.slice(1, 5)];
}

describe("deterministic PNG", () => {
  it("encodes correct RGBA bytes and checksums", () => {
    const png = encodeRgbaPng(1, 1, [12, 34, 56, 255]);
    expect(pngPixel(png)).toEqual([12, 34, 56, 255]);
    expect(encodeRgbaPng(1, 1, [12, 34, 56, 255])).toEqual(png);
  });
  it("rejects malformed channels and out-of-bounds images", () => {
    expect(() => encodeRgbaPng(1, 1, [1, 2, 3])).toThrow(/RGBA/);
    expect(() => encodeRgbaPng(65, 1, Array(65 * 4).fill(0))).toThrow(/64/);
  });
});

describe("Java Edition 1.21.4 experimental pack", () => {
  it("emits a reproducible resource pack with the expected blockstate and schema", () => {
    const document = createSampleDocument();
    const result = makeJava1214Pack(document);
    expect(result.packFormat).toBe(RESOURCE_PACK_FORMAT);
    expect(result.gameVerified).toBe(false);
    expect(result.replaces).toBe("minecraft:diamond_block");
    expect(makeJava1214Pack(document).zip).toEqual(result.zip);
    const files = unzipSync(result.zip);
    expect(Object.keys(files).sort()).toEqual([...result.paths].sort());
    const meta = JSON.parse(strFromU8(files[JAVA_PACK_PATHS.metadata]!));
    expect(meta.pack.pack_format).toBe(46);
    const state = JSON.parse(strFromU8(files[JAVA_PACK_PATHS.blockstate]!));
    expect(state).toEqual({ variants: { "": { model: "3dmc:block/lantern" } } });
    const model = JSON.parse(strFromU8(files[JAVA_PACK_PATHS.model]!));
    expect(model.elements.length).toBe(document.cuboids.length);
    expect(model.elements[0].from).toEqual([3, 3, 3]);
    expect(model.elements[0].to).toEqual([13, 12, 13]);
    expect(Object.keys(model.elements[0].faces).sort())
      .toEqual(["down", "east", "north", "south", "up", "west"]);
    expect(model.elements[0].faces.north).toEqual({ uv: [0, 0, 16, 16], texture: "#painted" });
    expect(model.textures.painted).toBe("3dmc:block/main");
    expect(files[JAVA_PACK_PATHS.mainTexture]).toBeDefined();
    expect(pngPixel(files[JAVA_PACK_PATHS.mainTexture]!)).toEqual(document.textures[0]!.pixels.slice(0, 4));
    expect(pngPixel(files["assets/3dmc/textures/block/solid_1.png"]!))
      .toEqual([99, 126, 112, 255]);
    const solid = read3dMcRgbaPng(files["assets/3dmc/textures/block/solid_1.png"]!);
    expect([solid.width, solid.height]).toEqual([16, 16]);
    expect(solid.pixels.every((channel, i) => channel === [99, 126, 112, 255][i % 4])).toBe(true);
  });
  it("exports hidden elements and locked elements without changing source", () => {
    const original = createSampleDocument();
    const copy = { ...original, cuboids: original.cuboids.map((node, i) =>
      i === 0 ? { ...node, visible: false, locked: true } : node) };
    const model = buildJava1214Model(copy);
    expect(model.elements.length).toBe(original.cuboids.length);
    expect(makeJava1214Pack(copy).paths).toContain(JAVA_PACK_PATHS.model);
    expect(original.cuboids[0]?.visible).toBe(true);
  });
  it("blocks unsupported targets and invalid geometry with object-level diagnostics", () => {
    const initial = createSampleDocument();
    const unsupported = { ...initial, target: { ...initial.target, candidateRelease: "26.3" as const } };
    expect(inspectJava1214(unsupported).some((i) => i.code === "TARGET_NOT_SUPPORTED")).toBe(true);
    expect(() => makeJava1214Pack(unsupported)).toThrow(JavaExportBlocked);
    const outside = setAxisValue(initial, "body", "position", 0, 30);
    expect(inspectJava1214(outside).find((i) => i.code === "ELEMENT_BOUNDS")?.nodeId).toBe("body");
    expect(() => makeJava1214Pack(outside)).toThrow(JavaExportBlocked);
  });
  it("rejects alpha, non-power-of-two, tinted textures and zero elements", () => {
    const initial = createSampleDocument();
    const pixels = [...initial.textures[0]!.pixels];
    pixels[3] = 100;
    const transparent = setTexturePixels(initial, pixels);
    expect(inspectJava1214(transparent).some((i) => i.code === "TEXTURE_ALPHA")).toBe(true);
    const empty = { ...initial, cuboids: [] };
    expect(inspectJava1214(empty).some((i) => i.code === "EMPTY_MODEL")).toBe(true);
    const tinted = { ...initial, cuboids: initial.cuboids.map((node, i) =>
      i === 0 ? { ...node, color: "#dddddd" } : node) };
    expect(inspectJava1214(tinted).some((i) => i.code === "UNSUPPORTED_TINT")).toBe(true);
  });
  it("blocks small source sheets that would lower the game's block-atlas mip level", () => {
    const initial = createSampleDocument();
    const small = { ...initial, textures: [{ ...initial.textures[0]!, width: 8, height: 8,
      pixels: Array.from({ length: 8 * 8 }, () => [12, 34, 56, 255]).flat() }] };
    expect(inspectJava1214(small).some(issue => issue.code === "TEXTURE_TOO_SMALL")).toBe(true);
    expect(() => makeJava1214Pack(small)).toThrow(JavaExportBlocked);
  });
  it("keeps project names out of exported paths", () => {
    const document = { ...createSampleDocument(), name: "../unsafe/\\path" };
    const result = makeJava1214Pack(document);
    expect(result.paths.every((path) => !path.includes("..") && !path.includes("\\"))).toBe(true);
  });
});

describe("Java 1.21.4 face UV output", () => {
  it("emits explicit authored rectangles and quarter-turns on the correct source faces", () => {
    let doc = createSampleDocument();
    doc = updateFaceUV(doc, "body", "east", 0, 4);
    doc = updateFaceUV(doc, "body", "east", 1, 2);
    doc = updateFaceRotation(doc, "body", "east", 180);
    const zip = unzipSync(makeJava1214Pack(doc).zip);
    const model = JSON.parse(strFromU8(zip[JAVA_PACK_PATHS.model]!));
    expect(model.elements[0].faces.east).toEqual({
      uv: [4, 2, 16, 16], texture: "#painted", rotation: 180
    });
    expect(model.elements[0].faces.north).toEqual({
      uv: [0, 0, 16, 16], texture: "#painted"
    });
  });
});

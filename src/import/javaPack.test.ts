
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createSampleDocument, setAxisValue, setTexturePixels, updateFaceRotation, updateFaceUV } from "../editor/domain";
import { makeJava1214Pack, JAVA_PACK_PATHS } from "../export/javaBlock";
import { drawStroke } from "../editor/pixels";
import { read3dMcStoredZip } from "./storedZip";
import { inspectJava1214Pack } from "./javaPack";
import { read3dMcRgbaPng } from "./strictPng";
import { encodeRgbaPng } from "../export/png";

const original = () => makeJava1214Pack(createSampleDocument()).zip;

function repack(
  src: Uint8Array,
  change: (files: Record<string, Uint8Array>) => void,
  level: 0 | 6 = 0
): Uint8Array {
  const files = unzipSync(src);
  change(files);
  return zipSync(files, { level, mtime: new Date(1980, 0, 1) });
}

function alterJson(src: Uint8Array, path: string, update: (value: any) => void): Uint8Array {
  return repack(src, (files) => {
    const value = JSON.parse(strFromU8(files[path]!));
    update(value);
    files[path] = strToU8(JSON.stringify(value));
  });
}

describe("Java pack importer", () => {
  it("reconstructs the generated sample with exact geometry and shared pixels", () => {
    const source = createSampleDocument();
    const packed = makeJava1214Pack(source);
    const report = inspectJava1214Pack(packed.zip);
    expect(report.status).toBe("editable");
    if (report.status !== "editable") throw new Error(report.problems.join("; "));
    expect(report.document.cuboids).toHaveLength(source.cuboids.length);
    for (let i = 0; i < source.cuboids.length; i++) {
      expect(report.document.cuboids[i]?.from).toEqual(source.cuboids[i]?.from);
      expect(report.document.cuboids[i]?.to).toEqual(source.cuboids[i]?.to);
      expect(report.document.cuboids[i]?.material).toBe(source.cuboids[i]?.material);
      expect(report.document.cuboids[i]?.color).toBe(source.cuboids[i]?.color);
    }
    expect(report.document.textures[0]!.pixels).toEqual(source.textures[0]!.pixels);
    expect(report.notices.some((message) => /names/.test(message))).toBe(true);
    expect(makeJava1214Pack(report.document).zip).toEqual(packed.zip);
  });

  it("supports a subsequent geometry and pixel edit and re-export", () => {
    const report = inspectJava1214Pack(original());
    if (report.status !== "editable") throw new Error("Could not decode reference pack.");
    const moved = setAxisValue(report.document, "pack-element-0", "position", 0, 5);
    const paint = drawStroke(moved.textures[0]!.pixels, 32, 32, [4, 5], [5, 6], "#123456", 1);
    const edited = setTexturePixels(moved, paint);
    const reopened = inspectJava1214Pack(makeJava1214Pack(edited).zip);
    expect(reopened.status).toBe("editable");
    if (reopened.status !== "editable") throw new Error("Could not reimport edited pack.");
    expect(reopened.document.cuboids[0]?.from[0]).toBe(5);
    expect(reopened.document.textures[0]!.pixels).toEqual(paint);
  });

  it("imports legacy 1×1 solid colors and regenerates them as 16×16", () => {
    const legacy = repack(original(), files => {
      files["assets/3dmc/textures/block/solid_1.png"] = encodeRgbaPng(1, 1, [99, 126, 112, 255]);
    });
    const report = inspectJava1214Pack(legacy);
    expect(report.status).toBe("editable");
    if (report.status !== "editable") throw new Error(report.problems.join("; "));
    expect(report.document.cuboids[1]?.color).toBe("#637e70");
    expect(report.notices.some(notice => notice.includes("Legacy 1×1"))).toBe(true);
    const next = read3dMcRgbaPng(unzipSync(makeJava1214Pack(report.document).zip)["assets/3dmc/textures/block/solid_1.png"]!);
    expect([next.width, next.height, ...next.pixels.slice(0, 4)]).toEqual([16, 16, 99, 126, 112, 255]);
  });

  it("rejects nonuniform or translucent generated solid images instead of discarding their pixels", () => {
    const rgba = Array.from({ length: 16 * 16 }, () => [99, 126, 112, 255]).flat();
    for (const index of [4, 7]) {
      const invalid = [...rgba];
      invalid[index] = 0;
      const pack = repack(original(), files => {
        files["assets/3dmc/textures/block/solid_1.png"] = encodeRgbaPng(16, 16, invalid);
      });
      const report = inspectJava1214Pack(pack);
      expect(report.status).toBe("blocked");
      if (report.status === "blocked") expect(report.problems.join()).toMatch(/uniform opaque/);
    }
  });

  it("preserves legacy small source images on import and blocks unsafe re-export", () => {
    const pixels = Array.from({ length: 8 * 8 }, () => [12, 34, 56, 255]).flat();
    const legacy = repack(original(), files => { files[JAVA_PACK_PATHS.mainTexture] = encodeRgbaPng(8, 8, pixels); });
    const report = inspectJava1214Pack(legacy);
    expect(report.status).toBe("editable");
    if (report.status !== "editable") throw new Error(report.problems.join("; "));
    expect([report.document.textures[0]?.width, report.document.textures[0]?.height]).toEqual([8, 8]);
    expect(report.document.textures[0]?.pixels).toEqual(pixels);
    expect(report.notices.some(notice => notice.includes("smaller than 16×16"))).toBe(true);
    expect(() => makeJava1214Pack(report.document)).toThrow();
  });

  it("rejects unsupported ZIP formats, entries, corrupt checksums and oversized archives", () => {
    const archive = original();
    expect(read3dMcStoredZip(archive).size).toBeGreaterThanOrEqual(4);
    const deflated = repack(archive, () => {}, 6);
    const compressed = inspectJava1214Pack(deflated);
    expect(compressed.status).toBe("blocked");
    if (compressed.status === "blocked") expect(compressed.problems.join()).toMatch(/uncompressed ZIP/);

    const extra = repack(archive, (files) => {
      files["assets/minecraft/models/block/unrelated.json"] = strToU8("{}");
    });
    const extraReport = inspectJava1214Pack(extra);
    expect(extraReport.status).toBe("blocked");
    if (extraReport.status === "blocked") expect(extraReport.problems.join()).toMatch(/Unsupported file/);
    const tampered = archive.slice();
    tampered[50] = tampered[50]! ^ 0x1;
    expect(inspectJava1214Pack(tampered).status).toBe("blocked");
    expect(inspectJava1214Pack(new Uint8Array(2_000_001)).status).toBe("blocked");
  });

  it("rejects a valid ZIP with missing dependencies or unsupported model semantics", () => {
    const missing = repack(original(), (files) => { delete files[JAVA_PACK_PATHS.mainTexture]; });
    expect(inspectJava1214Pack(missing).status).toBe("blocked");

    const alteredUv = alterJson(original(), JAVA_PACK_PATHS.model, (model) => {
      model.elements[0].faces.north.uv = [2, 0, 16, 16];
      model.elements[0].faces.north.rotation = 90;
    });
    const uv = inspectJava1214Pack(alteredUv);
    expect(uv.status).toBe("editable");
    if (uv.status === "editable") {
      expect(uv.document.cuboids[0]?.faces.north.uv).toEqual([2, 0, 16, 16]);
      expect(uv.document.cuboids[0]?.faces.north.rotation).toBe(90);
    }

    const invalidRotation = alterJson(original(), JAVA_PACK_PATHS.model, (model) => {
      model.elements[0].faces.north.rotation = 45;
    });
    expect(inspectJava1214Pack(invalidRotation).status).toBe("blocked");

    const parent = alterJson(original(), JAVA_PACK_PATHS.model, (model) => {
      model.parent = "minecraft:block/cube_all";
    });
    expect(inspectJava1214Pack(parent).status).toBe("blocked");

    const noncanonical = alterJson(original(), JAVA_PACK_PATHS.blockstate, (blockstate) => {
      blockstate.variants.facing = { model: "minecraft:block/diamond_block" };
    });
    expect(inspectJava1214Pack(noncanonical).status).toBe("blocked");
  });

  it("refuses modifications to descriptive metadata that it cannot preserve", () => {
    const changed = alterJson(original(), JAVA_PACK_PATHS.metadata, (metadata) => {
      metadata.pack.description += " custom notes";
    });
    expect(inspectJava1214Pack(changed).status).toBe("blocked");
  });

  it("rejects invalid resource pack format and alpha without accepting a partial import", () => {
    const wrong = alterJson(original(), JAVA_PACK_PATHS.metadata, (metadata) => {
      metadata.pack.pack_format = 97;
    });
    expect(inspectJava1214Pack(wrong).status).toBe("blocked");

    const customPng = repack(original(), (files) => {
      const bytes = files[JAVA_PACK_PATHS.mainTexture]!;
      const out = bytes.slice();
      out[40] = out[40]! ^ 0xff;
      files[JAVA_PACK_PATHS.mainTexture] = out;
    });
    expect(inspectJava1214Pack(customPng).status).toBe("blocked");
  });
});

describe("strict exported PNG decoder", () => {
  it("reads exact unlit, opaque RGBA bytes and image dimensions", () => {
    const source = createSampleDocument();
    const png = unzipSync(original())[JAVA_PACK_PATHS.mainTexture]!;
    expect(read3dMcRgbaPng(png)).toEqual({
      width: source.textures[0]!.width, height: source.textures[0]!.height,
      pixels: source.textures[0]!.pixels
    });
  });
  it("rejects invalid CRC", () => {
    const png = unzipSync(original())[JAVA_PACK_PATHS.mainTexture]!.slice();
    png[32] = png[32]! ^ 1;
    expect(() => read3dMcRgbaPng(png)).toThrow();
  });
});

describe("face UV authoring preserves export/import semantics", () => {
  it("round trips quarter-turn rotations, mirrored rectangles and shared pixel bytes", () => {
    let doc = createSampleDocument();
    doc = updateFaceUV(doc, "body", "north", 0, 12);
    doc = updateFaceUV(doc, "body", "north", 1, 3);
    doc = updateFaceUV(doc, "body", "north", 2, 2);
    doc = updateFaceUV(doc, "body", "north", 3, 13);
    doc = updateFaceRotation(doc, "body", "north", 90);
    doc = updateFaceRotation(doc, "body", "down", 270);
    const zip = makeJava1214Pack(doc).zip;
    const files = unzipSync(zip);
    const model = JSON.parse(strFromU8(files[JAVA_PACK_PATHS.model]!));
    expect(model.elements[0].faces.north).toEqual({
      texture: "#painted", uv: [12, 3, 2, 13], rotation: 90
    });
    expect(model.elements[0].faces.down.rotation).toBe(270);
    const imported = inspectJava1214Pack(zip);
    expect(imported.status).toBe("editable");
    if (imported.status !== "editable") throw new Error(imported.problems.join("; "));
    expect(imported.document.cuboids[0]?.faces.north).toEqual(doc.cuboids[0]?.faces.north);
    expect(imported.document.cuboids[0]?.faces.down).toEqual(doc.cuboids[0]?.faces.down);
    expect(imported.document.textures[0]!.pixels).toEqual(doc.textures[0]!.pixels);
    expect(makeJava1214Pack(imported.document).zip).toEqual(zip);
  });
});

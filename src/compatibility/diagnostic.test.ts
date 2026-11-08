import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { FACE_DIRECTIONS } from "../editor/domain";
import { inspectJava1214Pack } from "../import/javaPack";
import { read3dMcRgbaPng } from "../import/strictPng";
import { JAVA_PACK_PATHS, makeJava1214Pack } from "../export/javaBlock";
import { FACE_DIAGNOSTIC_LAYOUT, makeSixFaceDiagnosticDocument } from "./diagnostic";

function pixel(pixels: number[], x: number, y: number): number[] {
  const i = (y * 64 + x) * 4;
  return pixels.slice(i, i + 4);
}

describe("asymmetric six-face Minecraft 1.21.4 diagnostic", () => {
  it("builds distinct editable UV regions and asymmetric colored corner markers", () => {
    const doc = makeSixFaceDiagnosticDocument();
    expect(doc.schemaVersion).toBe(2);
    expect(doc.cuboids).toHaveLength(1);
    expect(doc.textures[0]!.width).toBe(64);
    expect(doc.textures[0]!.height).toBe(64);
    const faces = doc.cuboids[0]!.faces;
    expect([...FACE_DIAGNOSTIC_LAYOUT.map((tile) => tile.face)].sort())
      .toEqual([...FACE_DIRECTIONS].sort());
    const colors = new Set<string>();
    for (const item of FACE_DIAGNOSTIC_LAYOUT) {
      const x = item.col * 16, y = item.row * 16;
      expect(faces[item.face]).toEqual({
        uv: [item.col * 4, item.row * 4, item.col * 4 + 4, item.row * 4 + 4],
        rotation: 0, textureId: "main"
      });
      expect(pixel(doc.textures[0]!.pixels, x + 1, y + 1)).toEqual([255, 255, 255, 255]);
      expect(pixel(doc.textures[0]!.pixels, x + 13, y + 2)).toEqual([12, 17, 25, 255]);
      expect(pixel(doc.textures[0]!.pixels, x + 2, y + 13)).toEqual([255, 228, 65, 255]);
      expect(pixel(doc.textures[0]!.pixels, x + 13, y + 13)).toEqual([252, 135, 175, 255]);
      expect(pixel(doc.textures[0]!.pixels, x + 5, y + 5)).toEqual([...item.color, 255]);
      colors.add(item.color.join(","));
    }
    expect(colors.size).toBe(6);
    expect(doc.textures[0]!.pixels.filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
  });

  it("emits a deterministic ZIP which re-imports with exact face geometry and pixels", () => {
    const doc = makeSixFaceDiagnosticDocument();
    const first = makeJava1214Pack(doc);
    expect(first.zip).toEqual(makeJava1214Pack(doc).zip);
    expect(first.gameVerified).toBe(false);
    expect(first.replaces).toBe("minecraft:diamond_block");
    const content = unzipSync(first.zip);
    const model = JSON.parse(strFromU8(content[JAVA_PACK_PATHS.model]!));
    expect(model.elements).toHaveLength(1);
    for (const item of FACE_DIAGNOSTIC_LAYOUT) {
      expect(model.elements[0].faces[item.face]).toEqual({
        uv: [item.col * 4, item.row * 4, item.col * 4 + 4, item.row * 4 + 4],
        texture: "#painted"
      });
    }
    const texture = read3dMcRgbaPng(content[JAVA_PACK_PATHS.mainTexture]!);
    expect(texture.pixels).toEqual(doc.textures[0]!.pixels);
    const report = inspectJava1214Pack(first.zip);
    expect(report.status).toBe("editable");
    if (report.status !== "editable") throw new Error(report.problems.join("; "));
    expect(report.document.cuboids[0]?.faces).toEqual(doc.cuboids[0]?.faces);
    expect(report.document.textures[0]!.pixels).toEqual(doc.textures[0]!.pixels);
    expect(makeJava1214Pack(report.document).zip).toEqual(first.zip);
  });
});

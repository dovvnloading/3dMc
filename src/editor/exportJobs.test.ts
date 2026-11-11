import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { decodeProject } from "./project";
import { decodeNativeProject } from "./nativeArchive";
import { makeJava1214Pack } from "../export/javaBlock";
import { inspectJava1214Pack } from "../import/javaPack";
import { read3dMcRgbaPng } from "../import/strictPng";
import {
  prepareJavaPackDownload, prepareLegacyJsonDownload, prepareNativeProjectDownload,
  prepareSixFaceDiagnosticDownload, prepareTexturePngDownload
} from "./exportJobs";

describe("editor export job boundaries", () => {
  it("prepares a legacy JSON download without changing source data", () => {
    const source = createSampleDocument();
    const before = JSON.stringify(source);
    const download = prepareLegacyJsonDownload(source);
    expect(download.mimeType).toBe("application/json");
    expect(download.filename).toMatch(/\.3dmc\.json$/);
    expect(decodeProject(download.content as string)).toEqual(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("prepares an editable native source ZIP without modifying the project", async () => {
    const source = createSampleDocument();
    const download = await prepareNativeProjectDownload(source);
    expect(download.filename).toMatch(/\.3dmc$/);
    expect(download.mimeType).toBe("application/zip");
    expect(await decodeNativeProject(download.content as Uint8Array)).toEqual(source);
  });

  it("preserves the experimental pack's filename and exact ZIP content", () => {
    const source = createSampleDocument();
    const prepared = prepareJavaPackDownload(source);
    expect(prepared.file.filename).toBe("3dmc-diamond-block-java-1.21.4-experimental.zip");
    expect(prepared.file.mimeType).toBe("application/zip");
    expect(prepared.file.content).toEqual(makeJava1214Pack(source).zip);
    expect(prepared.bytes).toBe((prepared.file.content as Uint8Array).length);
  });

  it("makes a separate six-face compatibility fixture without using the current editor", () => {
    const prepared = prepareSixFaceDiagnosticDownload();
    expect(prepared.filename).toBe("3dmc-java-1.21.4-six-face-orientation-test.zip");
    const inspected = inspectJava1214Pack(prepared.content as Uint8Array);
    expect(inspected.status).toBe("editable");
    if (inspected.status !== "editable") throw new Error(inspected.problems.join("; "));
    expect(inspected.document.cuboids).toHaveLength(1);
    expect(inspected.document.textures[0]!.width).toBe(64);
  });

  it("preserves active RGBA pixels and existing filename sanitization", () => {
    const source = createSampleDocument();
    const input = { ...source, textures: source.textures.map((t, index) =>
      index === 0 ? { ...t, name: "Painted \\\\ detail.png" } : t) };
    const prepared = prepareTexturePngDownload(input);
    expect(prepared.filename).toBe("Painted-detail.png");
    expect(prepared.mimeType).toBe("image/png");
    const image = read3dMcRgbaPng(prepared.content as Uint8Array);
    expect(image.width).toBe(source.textures[0]!.width);
    expect(image.height).toBe(source.textures[0]!.height);
    expect(image.pixels).toEqual(source.textures[0]!.pixels);
  });
});

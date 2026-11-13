import { describe, expect, it } from "vitest";
import { createAetherheartDocument, AETHERHEART_NAME } from "./aetherheart";
import { makeNewProject } from "./templates";
import { parseDocument } from "./domain";
import { inspectJava1214, makeJava1214Pack, buildJava1214Model } from "../export/javaBlock";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";

describe("The Aetherheart showcase", () => {
  it("is a complete, deterministic and editable source document", () => {
    const source = createAetherheartDocument();
    expect(source).toEqual(createAetherheartDocument());
    expect(source.name).toBe(AETHERHEART_NAME);
    expect(source.cuboids).toHaveLength(216);
    expect(source.groups).toHaveLength(9);
    expect(source.textures).toHaveLength(10);
    expect(source.palette).toHaveLength(16);
    expect(source.cuboids.every(node =>
      node.visible && !node.locked && node.material === "texture" && node.color === "#ffffff"
    )).toBe(true);
    expect(new Set(source.cuboids.map(node => node.id)).size).toBe(216);
    expect(source.groups!.flatMap(group => group.memberIds).sort())
      .toEqual(source.cuboids.map(node => node.id).sort());
    expect(source.textures.some(texture => texture.layers?.length === 2)).toBe(true);
    expect(source.textures.every(texture => texture.pixels.every((part, index) =>
      index % 4 !== 3 || part === 255))).toBe(true);
    expect(parseDocument(source)).toEqual(source);
  });

  it("uses the normal project creation flow with an independent ID and custom name", () => {
    const document = makeNewProject({
      template: "aetherheart", name: "My star engine", resolution: 64, id: "my-custom-demo"
    });
    expect(document.id).toBe("my-custom-demo");
    expect(document.name).toBe("My star engine");
    expect(document.cuboids).toHaveLength(216);
    expect(document.activeTextureId).toBe("aether");
    expect(document.groups![0]!.name).toContain("foundation");
  });

  it("stays inside the current Java exporter limits and preserves face assignments", () => {
    const source = createAetherheartDocument();
    expect(source.cuboids.length).toBeLessThanOrEqual(256);
    expect(inspectJava1214(source).filter(issue => issue.severity === "error")).toEqual([]);
    expect(new Set(source.cuboids.flatMap(node =>
      Object.values(node.faces).map(face => face.textureId))).size).toBeGreaterThan(5);
    expect(source.cuboids.some(node => node.faces.up.rotation === 90)).toBe(true);
    const built = buildJava1214Model(source);
    expect(built.elements).toHaveLength(216);
    const pack = makeJava1214Pack(source);
    expect(pack.zip.length).toBeGreaterThan(2000);
    expect(pack.paths.some(path => path.endsWith("tex_9.png"))).toBe(true);
    expect(pack.gameVerified).toBe(false);
  });

  it("survives a portable native save/open round trip with layers and groups", async () => {
    const source = createAetherheartDocument();
    const archive = await encodeNativeProject(source);
    const decoded = await decodeNativeProject(archive);
    expect(decoded).toEqual(source);
  });
});

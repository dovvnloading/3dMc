import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createSampleDocument, setJavaCandidateRelease } from "./domain";
import type { EditorDocument } from "./domain";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { decodeNativePack, encodeNativePack, MAX_NATIVE_PACK_BYTES,
  openNativePack } from "./nativePackArchive";
import { indexLegacyProject, parsePackDocument } from "../pack/packDocument";
import type { PackDocument } from "../pack/packDocument";

function fixtures(): { pack: PackDocument; sources: EditorDocument[] } {
  const first = createSampleDocument();
  const source = createSampleDocument();
  const second: EditorDocument = {
    ...source, id: "second-editable-source", name: "Second lantern",
    cuboids: source.cuboids.map((node, i) => i === 0
      ? { ...node, name: "Saved layer", locked: true, visible: false,
        faces: { ...node.faces, north: { ...node.faces.north, rotation: 90 as const } } }
      : node),
    textures: source.textures.map(t => ({
      ...t, name: "Second image.png",
      pixels: t.pixels.map((part, i) => i === 3 ? 128 : part)
    }))
  };
  const pack = indexLegacyProject(first);
  pack.activeModelId = "model-second";
  pack.models.push({
    id: "model-second", sourceDocumentId: second.id,
    resource: { namespace: "my_studio", path: "block/second_lantern" },
    replaces: { namespace: "minecraft", path: "iron_block" },
    textures: [{ sourceTextureId: "main", textureAssetId: "texture-second" }],
    provenance: "editor"
  });
  pack.textures.push({
    id: "texture-second", sourceDocumentId: second.id,
    sourceTextureId: "main", resource: { namespace: "my_studio", path: "block/detail" }
  });
  return { pack, sources: [first, second] };
}

const repack = (zip: Uint8Array, mutate: (files: Record<string, Uint8Array>) => void): Uint8Array => {
  const files = unzipSync(zip);
  mutate(files);
  return zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
};

describe("native pack-aware .3dmc v3 archives", () => {
  it("round-trips two editable sources, complete RGBA pixels and stable pack paths", async () => {
    const { pack, sources } = fixtures();
    const original = JSON.stringify({ pack, sources });
    const bytes = await encodeNativePack(pack, sources);
    expect(bytes).toEqual(await encodeNativePack(pack, [...sources].reverse()));
    expect(JSON.stringify({ pack, sources })).toBe(original);
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual([
      "manifest.json", "pack.json",
      "models/0/document.json", "models/0/textures/main.png",
      "models/1/document.json", "models/1/textures/main.png"
    ].sort());
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!));
    expect(manifest).toMatchObject({
      format: "3dmc-native-pack", containerVersion: 3,
      packSchemaVersion: 1, pack: "pack.json"
    });
    expect(Object.keys(manifest.sha256)).toHaveLength(5);
    expect(manifest.sha256["pack.json"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(strFromU8(files["models/1/document.json"]!)).textures[0])
      .toMatchObject({ id: "main", name: "Second image.png",
        path: "models/1/textures/main.png" });
    const opened = await decodeNativePack(bytes);
    expect(opened.pack).toEqual(parsePackDocument(pack));
    expect(opened.sources).toEqual(sources);
    expect(opened.pack.activeModelId).toBe("model-second");
    expect(opened.sources[1]?.textures[0]?.pixels[3]).toBe(128);
    expect(opened.sources[1]?.cuboids[0]?.faces.north.rotation).toBe(90);
    expect(opened.sources[1]?.cuboids[0]?.locked).toBe(true);
    expect(await encodeNativePack(opened.pack, opened.sources)).toEqual(bytes);
    expect(await openNativePack(bytes)).toEqual(opened);
  });

  it("migrates existing v2 native sources in memory without altering their bytes", async () => {
    const source = createSampleDocument();
    const before = await encodeNativeProject(source);
    const result = await openNativePack(before);
    expect(result.sources).toEqual([source]);
    expect(result.pack).toEqual(indexLegacyProject(source));
    expect(await encodeNativeProject(result.sources[0]!)).toEqual(before);
    const newArchive = await encodeNativePack(result.pack, result.sources);
    expect((await decodeNativePack(newArchive)).sources).toEqual([source]);
    // The old single-project decoder must not silently flatten a pack-aware file.
    await expect(decodeNativeProject(newArchive)).rejects.toThrow();
  });

  it("rejects malformed manifests, extra files and damaged hashed content", async () => {
    const { pack, sources } = fixtures();
    const bytes = await encodeNativePack(pack, sources);
    const tampered = repack(bytes, entries => {
      const doc = JSON.parse(strFromU8(entries["models/1/document.json"]!));
      doc.name = "Tampered without rehash";
      entries["models/1/document.json"] = strToU8(JSON.stringify(doc));
    });
    await expect(decodeNativePack(tampered)).rejects.toThrow(/integrity/);
    const extra = repack(bytes, entries => {
      entries["models/1/textures/orphan.png"] = entries["models/1/textures/main.png"]!;
    });
    await expect(decodeNativePack(extra)).rejects.toThrow(/unknown|untracked|missing/);
    const badManifest = repack(bytes, entries => {
      const value = JSON.parse(strFromU8(entries["manifest.json"]!));
      value.packSchemaVersion = 200;
      entries["manifest.json"] = strToU8(JSON.stringify(value));
    });
    await expect(decodeNativePack(badManifest)).rejects.toThrow(/format|version/);
    await expect(openNativePack(new Uint8Array(MAX_NATIVE_PACK_BYTES + 1)))
      .rejects.toThrow(/import limit/);
  });

  it("rejects missing or extra source documents before writing a new pack", async () => {
    const { pack, sources } = fixtures();
    await expect(encodeNativePack(pack, [sources[0]!]))
      .rejects.toThrow(/missing/);
    const extra = { ...createSampleDocument(), id: "unreferenced-source" };
    await expect(encodeNativePack(pack, [...sources, extra]))
      .rejects.toThrow(/unreferenced/);
    const duplicate = [sources[0]!, sources[0]!, sources[1]!];
    await expect(encodeNativePack(pack, duplicate)).rejects.toThrow(/Duplicate/);
  });

  it("rejects source profile changes rather than flattening unsupported metadata", async () => {
    const source = setJavaCandidateRelease(createSampleDocument(), "26.3");
    const legacy = await encodeNativeProject(source);
    // The original single-model reader continues to support old source data.
    expect(await decodeNativeProject(legacy)).toEqual(source);
    await expect(openNativePack(legacy)).rejects.toThrow(/Only Java 1.21.4/);
  });
});

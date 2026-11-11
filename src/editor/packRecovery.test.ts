import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import { decodePackCheckpoint, encodePackCheckpoint } from "./recovery";
import { indexLegacyProject } from "../pack/packDocument";

function packFixture() {
  const original = createSampleDocument();
  const second = { ...createSampleDocument(), id: "other-source", name: "Other model" };
  const pack = indexLegacyProject(original);
  pack.models.push({
    id: "model-other", sourceDocumentId: second.id,
    resource: { namespace: "other", path: "block/other" },
    replaces: { namespace: "minecraft", path: "iron_block" },
    provenance: "editor",
    textures: [{ sourceTextureId: "main", textureAssetId: "other-tex" }]
  });
  pack.textures.push({ id: "other-tex", sourceDocumentId: second.id,
    sourceTextureId: "main", resource: { namespace: "other", path: "block/paint" } });
  pack.activeModelId = "model-other";
  return { pack, sources: [original, second] };
}

describe("pack-wide checkpoint serialization", () => {
  it("retains all source models, full RGBA pixels and active asset identity", () => {
    const { pack, sources } = packFixture();
    sources[1]!.textures[0]!.pixels[3] = 128;
    sources[1]!.cuboids[0]!.locked = true;
    const before = JSON.stringify({ pack, sources });
    const encoded = encodePackCheckpoint(pack, sources);
    expect(JSON.stringify({ pack, sources })).toBe(before);
    expect(decodePackCheckpoint(encoded)).toEqual({ pack, sources });
    expect(decodePackCheckpoint(encoded).sources[1]!.textures[0]!.pixels[3]).toBe(128);
    expect(decodePackCheckpoint(encoded).pack.activeModelId).toBe("model-other");
  });
  it("rejects unknown versions, corrupted references and extra fields without dropping data", () => {
    const { pack, sources } = packFixture();
    const encoded = encodePackCheckpoint(pack, sources);
    const change = (mutate: (record: any) => void) => {
      const parsed = JSON.parse(encoded); mutate(parsed); return JSON.stringify(parsed);
    };
    expect(() => decodePackCheckpoint(change(data => { data.version = 7; }))).toThrow(/version/);
    expect(() => decodePackCheckpoint(change(data => { data.future = "new"; }))).toThrow(/fields/);
    expect(() => decodePackCheckpoint(change(data => { data.sources.pop(); }))).toThrow(/missing/);
    expect(() => decodePackCheckpoint(change(data => { data.pack.models[1].textures[0].textureAssetId = "gone"; }))).toThrow(/unresolved/);
    expect(() => encodePackCheckpoint(pack, [sources[0]!])).toThrow(/missing/);
    expect(() => encodePackCheckpoint(pack, [...sources, { ...sources[0]!, id: "orphan" }])).toThrow(/unrelated/);
  });
});

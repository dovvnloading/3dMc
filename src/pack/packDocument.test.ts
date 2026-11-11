import { describe, expect, it } from "vitest";
import { createSampleDocument, setJavaCandidateRelease } from "../editor/domain";
import { JAVA_PACK_PATHS } from "../export/javaBlock";
import { gameFilePath, indexLegacyProject, PackIndexError, parsePackDocument,
  resourceKey, verifyPackSources } from "./packDocument";

const sample = createSampleDocument;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("versioned pack-wide index", () => {
  it("creates a legacy diamond-block plan without changing source data or resource paths", () => {
    const source = sample();
    const before = clone(source);
    const pack = indexLegacyProject(source);
    expect(source).toEqual(before);
    expect(pack.schemaVersion).toBe(1);
    expect(pack.targetProfile).toBe("java-1.21.4-static-block");
    expect(pack.activeModelId).toBe("model-0");
    expect(pack.models).toHaveLength(1);
    expect(pack.models[0]?.sourceDocumentId).toBe(source.id);
    expect(gameFilePath("blockstates", pack.models[0]!.replaces)).toBe(JAVA_PACK_PATHS.blockstate);
    expect(gameFilePath("models", pack.models[0]!.resource)).toBe(JAVA_PACK_PATHS.model);
    expect(gameFilePath("textures", pack.textures[0]!.resource)).toBe(JAVA_PACK_PATHS.mainTexture);
    expect(resourceKey(pack.models[0]!.resource)).toBe("3dmc:block/lantern");
    expect(parsePackDocument(pack)).toEqual(pack);
    expect(() => verifyPackSources(pack, [source])).not.toThrow();
  });

  it("uses stable source texture IDs rather than binding by texture name", () => {
    const source = sample();
    const accent = { ...source.textures[0]!, id: "detail", name: "Main texture" };
    const doc = { ...source, textures: [...source.textures, accent] };
    const pack = indexLegacyProject(doc);
    expect(pack.textures).toHaveLength(2);
    expect(pack.models[0]?.textures.map(binding => binding.sourceTextureId))
      .toEqual(["main", "detail"]);
    expect(pack.textures[1]?.resource).toEqual({ namespace: "3dmc", path: "block/tex_1" });
    expect(() => verifyPackSources(pack, [doc])).not.toThrow();
    expect(() => verifyPackSources(pack, [source])).toThrow(/missing or stale source texture bindings/);
  });

  it("refuses duplicate model and blockstate output paths before any game packaging", () => {
    const pack = indexLegacyProject(sample());
    const different = clone(pack.models[0]!);
    different.id = "model-2";
    different.resource = { namespace: "3dmc", path: "block/alternate" };
    const duplicateReplacement = { ...pack, models: [...pack.models, different] };
    expect(() => parsePackDocument(duplicateReplacement)).toThrow(/Duplicate blockstate replacements/);
    const duplicateModel = { ...pack, models: [...pack.models, {
      ...different, replaces: { namespace: "minecraft", path: "gold_block" },
      resource: pack.models[0]!.resource
    }] };
    expect(() => parsePackDocument(duplicateModel)).toThrow(/Duplicate model paths/);
  });

  it("does not allow dangling asset references or silently dropped unknown fields", () => {
    const pack = indexLegacyProject(sample());
    const dangling = clone(pack);
    dangling.models[0]!.textures[0]!.textureAssetId = "gone";
    expect(() => parsePackDocument(dangling)).toThrow(/unresolved or mismatched/);
    const unused = clone(pack);
    unused.textures.push({
      ...unused.textures[0]!, id: "unused",
      resource: { namespace: "3dmc", path: "block/orphan" }
    });
    expect(() => parsePackDocument(unused)).toThrow(/Unreferenced pack textures/);
    const unknown = { ...pack, futureMode: "not supported" };
    expect(() => parsePackDocument(unknown)).toThrow(/unknown or missing fields/);
    const unknownNested = clone(pack) as unknown as Record<string, unknown>;
    (unknownNested.models as Array<Record<string, unknown>>)[0]!.discarded = "unsafe";
    expect(() => parsePackDocument(unknownNested)).toThrow(/unknown or missing fields/);
    expect(() => parsePackDocument({ ...pack, schemaVersion: 99 })).toThrow(PackIndexError);
  });

  it("rejects unsafe, noncanonical and mixed-case resource paths", () => {
    const pack = indexLegacyProject(sample());
    const unsafe = ["../outside", "block/../outside", "block//x", "Block/Upper",
      "block\\windows", "/absolute", "block/.", "block/..", "block/x.json?"];
    for (const path of unsafe) {
      const changed = clone(pack);
      changed.models[0]!.resource.path = path;
      expect(() => parsePackDocument(changed), path).toThrow(PackIndexError);
    }
    const badNamespace = clone(pack);
    badNamespace.models[0]!.resource.namespace = "MyMod";
    expect(() => parsePackDocument(badNamespace)).toThrow(/namespace/);
    expect(() => gameFilePath("models", { namespace: "minecraft", path: "../evil" }))
      .toThrow(/resource path/);
  });

  it("detects missing and incompatible sources without changing them", () => {
    const source = sample();
    const pack = indexLegacyProject(source);
    expect(() => verifyPackSources(pack, [])).toThrow(/missing/);
    expect(() => verifyPackSources(pack, [source, source])).toThrow(/Duplicate source project IDs/);
    expect(() => indexLegacyProject(setJavaCandidateRelease(source, "26.3"))).toThrow(/Only Java 1.21.4/);
    expect(() => verifyPackSources(pack, [setJavaCandidateRelease(source, "26.3")]))
      .toThrow(/unsupported Minecraft profile/);
    expect(source.target.candidateRelease).toBe("1.21.4");
  });

  it("rejects a texture binding mapped to the wrong source document", () => {
    const pack = indexLegacyProject(sample());
    const changed = clone(pack);
    changed.textures[0]!.sourceDocumentId = "other-source";
    expect(() => parsePackDocument(changed)).toThrow(/unresolved or mismatched/);
  });
});

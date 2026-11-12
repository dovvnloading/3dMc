import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createSampleDocument, setTexturePixels } from "../editor/domain";
import { JAVA_PACK_PATHS, JavaExportBlocked, makeJava1214Pack } from "../export/javaBlock";
import { inspectJava1214Pack } from "../import/javaPack";
import { indexLegacyProject, PackIndexError, parsePackDocument } from "./packDocument";
import { JAVA_1214_REPLACEMENTS, makeIndexedJava1214Pack,
  MAX_INDEXED_EXPORT_MODELS } from "./javaPackBuilder";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("indexed Java 1.21.4 pack writer", () => {
  it("exports eight distinct property-free block replacements in one deterministic pack", () => {
    const first = createSampleDocument();
    const pack = clone(indexLegacyProject(first));
    const sources = [first];
    for (let index = 1; index < JAVA_1214_REPLACEMENTS.length; index++) {
      const source = { ...createSampleDocument(), id: "expansion-source-" + index,
        name: "Visual " + index };
      sources.push(source);
      pack.models.push({
        id: "model-" + index, sourceDocumentId: source.id,
        resource: { namespace: "art", path: "block/custom_" + index },
        replaces: { namespace: "minecraft", path: JAVA_1214_REPLACEMENTS[index]! },
        provenance: "editor",
        textures: [{ sourceTextureId: "main", textureAssetId: "texture-" + index }]
      });
      pack.textures.push({
        id: "texture-" + index, sourceDocumentId: source.id, sourceTextureId: "main",
        resource: { namespace: "art", path: "block/paint_" + index }
      });
    }
    const result = makeIndexedJava1214Pack(pack, sources);
    expect(result.replaces).toEqual(JAVA_1214_REPLACEMENTS.map(name => "minecraft:" + name));
    expect(result.paths.filter(path => path.startsWith("assets/minecraft/blockstates/"))).toHaveLength(8);
    expect(makeIndexedJava1214Pack(pack, [...sources].reverse()).zip).toEqual(result.zip);
    expect(result.paths).toHaveLength(new Set(result.paths).size);
    const files = unzipSync(result.zip);
    for (const target of JAVA_1214_REPLACEMENTS)
      expect(files["assets/minecraft/blockstates/" + target + ".json"]).toBeDefined();
  });

  it("reproduces the legacy diamond-block ZIP byte for byte", () => {
    const source = createSampleDocument();
    const index = indexLegacyProject(source);
    const expected = makeJava1214Pack(source);
    const result = makeIndexedJava1214Pack(index, [source]);
    expect(result.zip).toEqual(expected.zip);
    expect(result.paths).toEqual(expected.paths);
    expect(result.replaces).toEqual(["minecraft:diamond_block"]);
    expect(result.gameVerified).toBe(false);
    const imported = inspectJava1214Pack(result.zip);
    expect(imported.status).toBe("editable");
  });

  it("emits configurable namespace, texture paths and an iron block replacement", () => {
    const source = createSampleDocument();
    const index = clone(indexLegacyProject(source));
    index.models[0]!.resource = { namespace: "custom_pack", path: "block/iron_lantern" };
    index.models[0]!.replaces = { namespace: "minecraft", path: "iron_block" };
    index.textures[0]!.resource = { namespace: "custom_pack", path: "block/painted" };
    const result = makeIndexedJava1214Pack(parsePackDocument(index), [source]);
    const files = unzipSync(result.zip);
    const blockstatePath = "assets/minecraft/blockstates/iron_block.json";
    const modelPath = "assets/custom_pack/models/block/iron_lantern.json";
    const texturePath = "assets/custom_pack/textures/block/painted.png";
    expect(result.paths).toContain(blockstatePath);
    expect(result.paths).toContain(modelPath);
    expect(result.paths).toContain(texturePath);
    expect(result.paths).not.toContain(JAVA_PACK_PATHS.blockstate);
    const blockstate = JSON.parse(strFromU8(files[blockstatePath]!));
    expect(blockstate).toEqual({ variants: { "": { model: "custom_pack:block/iron_lantern" } } });
    const model = JSON.parse(strFromU8(files[modelPath]!));
    expect(model.textures.painted).toBe("custom_pack:block/painted");
    expect(model.textures.particle).toBe("custom_pack:block/painted");
    expect(model.textures.solid_1).toBe("custom_pack:block/iron_lantern/solid_1");
    expect(files["assets/custom_pack/textures/block/iron_lantern/solid_1.png"]).toBeDefined();
    expect(result.issues.some(issue => issue.code === "NEW_REPLACEMENT_UNVERIFIED")).toBe(true);
    // The current strict importer must not silently claim a custom pack is editable.
    expect(inspectJava1214Pack(result.zip).status).toBe("blocked");
  });

  it("combines distinct editable models into one deterministic conflict-free ZIP", () => {
    const source = createSampleDocument();
    const second = { ...createSampleDocument(), id: "second-source-model", name: "Second lantern" };
    const pack = clone(indexLegacyProject(source));
    pack.textures.push({
      id: "texture-second", sourceDocumentId: second.id, sourceTextureId: "main",
      resource: { namespace: "my_studio", path: "block/second_paint" }
    });
    pack.models.push({
      id: "model-second", sourceDocumentId: second.id,
      resource: { namespace: "my_studio", path: "block/second" },
      replaces: { namespace: "minecraft", path: "iron_block" },
      textures: [{ sourceTextureId: "main", textureAssetId: "texture-second" }],
      provenance: "editor"
    });
    const first = makeIndexedJava1214Pack(pack, [source, second]);
    expect(makeIndexedJava1214Pack(pack, [second, source]).zip).toEqual(first.zip);
    expect(first.replaces).toEqual(["minecraft:diamond_block", "minecraft:iron_block"]);
    expect(first.paths).toContain(JAVA_PACK_PATHS.blockstate);
    expect(first.paths).toContain("assets/minecraft/blockstates/iron_block.json");
    expect(first.paths).toContain("assets/my_studio/models/block/second.json");
    expect(first.paths).toContain("assets/my_studio/textures/block/second_paint.png");
    expect(first.paths).toContain("assets/my_studio/textures/block/second/solid_1.png");
    const files = unzipSync(first.zip);
    expect(JSON.parse(strFromU8(files["assets/minecraft/blockstates/iron_block.json"]!)))
      .toEqual({ variants: { "": { model: "my_studio:block/second" } } });
    expect(first.paths).toHaveLength(new Set(first.paths).size);
  });

  it("rejects unsafe replacement targets, generated file collisions and invalid sources", () => {
    const source = createSampleDocument();
    const invalidTarget = clone(indexLegacyProject(source));
    invalidTarget.models[0]!.replaces.path = "oak_log"; // Needs an axis state profile.
    expect(() => makeIndexedJava1214Pack(invalidTarget, [source])).toThrow(/Unsupported.*replacement/);

    const collision = clone(indexLegacyProject(source));
    collision.textures[0]!.resource.path = "block/solid_1";
    expect(() => makeIndexedJava1214Pack(collision, [source]))
      .toThrow(/Generated resource path collision/);

    const translucent = setTexturePixels(source, source.textures[0]!.pixels.map((v, i) =>
      i === 3 ? 0 : v));
    expect(() => makeIndexedJava1214Pack(indexLegacyProject(translucent), [translucent]))
      .toThrow(JavaExportBlocked);

    const tooMany = clone(indexLegacyProject(source));
    for (let i = 1; i <= MAX_INDEXED_EXPORT_MODELS; i++) {
      tooMany.models.push({
        ...clone(tooMany.models[0]!),
        id: "model-" + i,
        resource: { namespace: "my_pack", path: "block/model_" + i },
        replaces: { namespace: "minecraft", path: "iron_block" + i }
      });
    }
    // The pack index accepts up to 32 assets; this exporter has a smaller measured limit.
    expect(() => makeIndexedJava1214Pack(tooMany, [source])).toThrow(PackIndexError);
  });
});

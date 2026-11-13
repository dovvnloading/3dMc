import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { createSampleDocument } from "../editor/domain";
import type { EditorDocument } from "../editor/domain";
import { decodeNativePack, encodeNativePack } from "../editor/nativePackArchive";
import { indexLegacyProject, parsePackDocument } from "../pack/packDocument";
import type { PackDocument, PackItemAsset } from "../pack/packDocument";
import { defaultItemDisplay } from "../pack/itemProfile";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import { inspectIndexedJava1214Pack } from "./indexedJavaPack";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stamp = new Date(1980, 0, 1);

function fixture(items = false): { pack: PackDocument; sources: EditorDocument[] } {
  const first = createSampleDocument();
  const second = createSampleDocument();
  second.id = "indexed-import-second";
  second.name = "Second painted model";
  const copied = clone(second.textures[0]!);
  copied.id = "accent";
  copied.name = "Accent.png";
  copied.pixels[0] = 19;
  copied.pixels[1] = 80;
  copied.pixels[2] = 231;
  second.textures.push(copied);
  second.cuboids[0]!.faces.north = {
    ...second.cuboids[0]!.faces.north,
    uv: [14, 12, 2, 3], rotation: 90, textureId: "accent"
  };
  const pack = clone(indexLegacyProject(first));
  pack.models.push({
    id: "model-second", sourceDocumentId: second.id,
    resource: { namespace: "my_studio", path: "block/custom_lantern" },
    replaces: { namespace: "minecraft", path: "iron_block" },
    provenance: "editor",
    textures: [
      { sourceTextureId: "main", textureAssetId: "texture-second-main" },
      { sourceTextureId: "accent", textureAssetId: "texture-second-accent" }
    ]
  });
  pack.textures.push({
    id: "texture-second-main", sourceDocumentId: second.id, sourceTextureId: "main",
    resource: { namespace: "my_studio", path: "block/main_lantern" }
  }, {
    id: "texture-second-accent", sourceDocumentId: second.id, sourceTextureId: "accent",
    resource: { namespace: "my_studio", path: "block/accent_lantern" }
  });
  if (items) {
    const display = defaultItemDisplay();
    display.gui.translation = [2, -1.5, 0.25];
    pack.items = [{
      id: "item-source", sourceModelId: "model-second",
      resource: { namespace: "my_studio", path: "item/custom_handheld" },
      replaces: { namespace: "minecraft", path: "stick" },
      handAnimationOnSwap: false, display
    }];
  }
  return { pack: parsePackDocument(pack), sources: [first, second] };
}

function mutate(bytes: Uint8Array, update: (files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(bytes);
  update(files);
  return zipSync(files, { level: 0, mtime: stamp });
}

function changeJson(bytes: Uint8Array, path: string,
  update: (value: Record<string, any>) => void): Uint8Array {
  return mutate(bytes, files => {
    const value = JSON.parse(new TextDecoder().decode(files[path]!));
    update(value);
    files[path] = strToU8(JSON.stringify(value, null, 2) + "\n");
  });
}

function supported(bytes: Uint8Array) {
  const result = inspectIndexedJava1214Pack(bytes);
  if (result.status !== "editable")
    throw new Error("A generated ZIP unexpectedly failed import: " + result.problems.join(" | "));
  return result;
}

function sameResources(a: Uint8Array, b: Uint8Array) {
  const originals = unzipSync(a), recreated = unzipSync(b);
  expect(Object.keys(recreated).sort()).toEqual(Object.keys(originals).sort());
  for (const path of Object.keys(originals))
    expect(recreated[path], path).toEqual(originals[path]);
}

describe("strict indexed Java 1.21.4 pack import", () => {
  it("reopens two models, three named textures, reverse face UVs and target resource paths", async () => {
    const { pack, sources } = fixture();
    const before = JSON.stringify({ pack, sources });
    const original = makeIndexedJava1214Pack(pack, sources).zip;
    const report = supported(original);

    expect(report.project.pack.models).toHaveLength(2);
    expect(report.project.pack.textures).toHaveLength(3);
    expect(report.project.sources).toHaveLength(2);
    expect(report.project.pack.models.map(model => model.replaces.path))
      .toEqual(["diamond_block", "iron_block"]);
    expect(report.project.pack.models[1]!.resource)
      .toEqual({ namespace: "my_studio", path: "block/custom_lantern" });
    expect(report.project.sources[1]!.textures[1]!.pixels[0]).toBe(19);
    expect(report.project.sources[1]!.cuboids[0]!.faces.north)
      .toEqual(sources[1]!.cuboids[0]!.faces.north);
    expect(report.notices.join(" ")).toMatch(/names.*layers|layers.*names/i);

    sameResources(original, makeIndexedJava1214Pack(
      report.project.pack, report.project.sources).zip);
    const native = await encodeNativePack(report.project.pack, report.project.sources);
    expect(await decodeNativePack(native)).toEqual(report.project);
    expect(JSON.stringify({ pack, sources })).toBe(before);
  });

  it("preserves two model identities sharing one editable source and its texture resources", () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    pack.models.push({
      ...pack.models[0]!, id: "shared-source-second",
      resource: { namespace: "my_studio", path: "block/linked_source" },
      replaces: { namespace: "minecraft", path: "iron_block" }
    });
    const original = makeIndexedJava1214Pack(pack, [source]).zip;
    const parsed = supported(original);
    expect(parsed.project.pack.models).toHaveLength(2);
    expect(parsed.project.sources).toHaveLength(1);
    expect(parsed.project.pack.models[0]!.sourceDocumentId)
      .toBe(parsed.project.pack.models[1]!.sourceDocumentId);
    sameResources(original, makeIndexedJava1214Pack(
      parsed.project.pack, parsed.project.sources).zip);
  });

  it("round-trips a combined multi-model block and item pack with display transforms", () => {
    const { pack, sources } = fixture(true);
    const original = makeIndexedJava1214Pack(pack, sources).zip;
    const parsed = supported(original);
    const item = parsed.project.pack.items?.[0];
    expect(item?.replaces.path).toBe("stick");
    expect(item?.resource).toEqual({ namespace: "my_studio", path: "item/custom_handheld" });
    expect(item?.display.gui.translation).toEqual([2, -1.5, 0.25]);
    expect(item?.handAnimationOnSwap).toBe(false);
    expect(item?.sourceModelId).toBe(parsed.project.pack.models[1]?.id);
    sameResources(original, makeIndexedJava1214Pack(
      parsed.project.pack, parsed.project.sources).zip);
  });

  it("reconstructs a standalone item-only Java ZIP without inventing blockstate files", () => {
    const { pack, sources } = fixture(true);
    const itemOnly = parsePackDocument({ ...pack,
      exportBlockVisuals: false,
      items: [{
        ...pack.items![0]!, sourceModelId: pack.models[0]!.id,
        resource: { namespace: "custom", path: "item/source_sword" },
        replaces: { namespace: "minecraft", path: "diamond_sword" }
      } satisfies PackItemAsset, pack.items![0]!] });
    const original = makeIndexedJava1214Pack(itemOnly, sources).zip;
    const result = supported(original);
    expect(result.project.pack.exportBlockVisuals).toBe(false);
    expect(result.project.pack.items).toHaveLength(2);
    expect(result.project.sources).toHaveLength(2);
    expect(result.project.pack.models).toHaveLength(2);
    expect(result.paths.some(path => path.includes("/blockstates/"))).toBe(false);
    sameResources(original, makeIndexedJava1214Pack(
      result.project.pack, result.project.sources).zip);
  });

  it("reimports the legacy single-model Java ZIP as one editable source pack", () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    const original = makeIndexedJava1214Pack(pack, [source]).zip;
    const parsed = supported(original);
    expect(parsed.project.pack.models).toHaveLength(1);
    expect(parsed.project.sources).toHaveLength(1);
    sameResources(original, makeIndexedJava1214Pack(
      parsed.project.pack, parsed.project.sources).zip);
  });

  it("refuses extra files and unreferenced textures rather than silently dropping them", () => {
    const { pack, sources } = fixture(true);
    const original = makeIndexedJava1214Pack(pack, sources).zip;
    const extra = mutate(original, files => {
      files["assets/my_studio/models/block/extra.json"] = strToU8("{}");
    });
    const unused = mutate(original, files => {
      files["assets/my_studio/textures/block/orphan.png"] =
        files["assets/my_studio/textures/block/accent_lantern.png"]!;
    });
    expect(inspectIndexedJava1214Pack(extra)).toMatchObject({ status: "blocked" });
    expect(inspectIndexedJava1214Pack(unused)).toMatchObject({ status: "blocked" });
    expect(inspectIndexedJava1214Pack(mutate(original, files => {
      delete files["assets/my_studio/textures/block/accent_lantern.png"];
    }))).toMatchObject({ status: "blocked" });
  });

  it("rejects unknown model fields, face semantics and unsupported item graphs", () => {
    const { pack, sources } = fixture(true);
    const original = makeIndexedJava1214Pack(pack, sources).zip;
    const model = "assets/my_studio/models/block/custom_lantern.json";
    const itemDefinition = "assets/minecraft/items/stick.json";
    const extraField = changeJson(original, model, value => {
      value.parent = "minecraft:block/cube_all";
    });
    const missingFace = changeJson(original, model, value => {
      delete value.elements[0].faces.north;
    });
    const conditionalItem = changeJson(original, itemDefinition, value => {
      value.model = { type: "minecraft:condition",
        property: "minecraft:using_item", on_true: value.model, on_false: value.model };
    });
    for (const bytes of [extraField, missingFace, conditionalItem])
      expect(inspectIndexedJava1214Pack(bytes)).toMatchObject({ status: "blocked" });
  });

  it("rejects unsupported replacement targets, unsafe paths and invalid checksums", () => {
    const { pack, sources } = fixture();
    const original = makeIndexedJava1214Pack(pack, sources).zip;
    const unexpected = mutate(original, files => {
      const file = files["assets/minecraft/blockstates/iron_block.json"]!;
      delete files["assets/minecraft/blockstates/iron_block.json"];
      files["assets/minecraft/blockstates/oak_log.json"] = file;
    });
    const traversal = mutate(original, files => {
      files["assets/../models/bad.json"] = strToU8("{}");
    });
    const broken = new Uint8Array(original);
    const location = broken.indexOf(0x89);
    if (location >= 0) broken[location] = broken[location]! ^ 0x01;
    for (const bytes of [unexpected, traversal, broken])
      expect(inspectIndexedJava1214Pack(bytes)).toMatchObject({ status: "blocked" });
  });

  it("rejects oversized files without expanding them or changing editor state", () => {
    const tooLarge = new Uint8Array(12_000_001);
    expect(inspectIndexedJava1214Pack(tooLarge)).toMatchObject({
      status: "blocked", problems: [expect.stringMatching(/12 MB/)]
    });
  });
});

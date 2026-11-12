import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { createSampleDocument, renameProject } from "../editor/domain";
import type { PackItemAsset } from "./packDocument";
import { gameFilePath, indexLegacyProject, parsePackDocument, resourceKey } from "./packDocument";
import { JAVA_1214_ITEM_TARGETS, defaultItemDisplay, parseItemDisplay,
  updateItemDisplay } from "./itemProfile";
import { addPackItem, addPackModel, createPackSession, editActivePackDocument,
  removePackItem, removePackModel, setItemHandAnimation, setPackItemDisplay,
  setPackItemResource, undoPackSession } from "./packSession";
import { makeIndexedJava1214Pack } from "./javaPackBuilder";
import { inspectIndexedJava1214Pack } from "./exportPreflight";
import { decodeNativePack, encodeNativePack } from "../editor/nativePackArchive";
import { makeJava1214Pack } from "../export/javaBlock";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const fixture = (id = "item-one", replaces = "stick"): PackItemAsset => ({
  id, sourceModelId: "model-0",
  resource: { namespace: "3dmc", path: "item/" + replaces },
  replaces: { namespace: "minecraft", path: replaces },
  handAnimationOnSwap: true, display: defaultItemDisplay()
});

describe("Java 1.21.4 item authoring profile", () => {
  it("bounds and round-trips exact display contexts without shared mutable defaults", () => {
    expect(JAVA_1214_ITEM_TARGETS).toEqual(["stick", "paper", "apple", "diamond_sword"]);
    const initial = defaultItemDisplay();
    expect(parseItemDisplay(initial)).toEqual(initial);
    const changed = updateItemDisplay(initial, "gui", "rotation", 1, -95.5);
    expect(changed.gui.rotation).toEqual([30, -95.5, 0]);
    expect(changed.firstperson_righthand).toEqual(initial.firstperson_righthand);
    expect(initial.gui.rotation).toEqual([30, -135, 0]);
    expect(defaultItemDisplay().gui.rotation).not.toBe(initial.gui.rotation);
    expect(updateItemDisplay(initial, "gui", "rotation", 1, -135)).toBe(initial);
    expect(() => updateItemDisplay(initial, "gui", "translation", 0, 100)).toThrow(/between/);
    expect(() => updateItemDisplay(initial, "ground", "scale", 2, 0)).toThrow(/between/);
    expect(() => parseItemDisplay({ gui: initial.gui })).toThrow(/missing/);
    expect(() => parseItemDisplay({ ...initial, custom: initial.gui })).toThrow(/unsupported/);
    expect(() => parseItemDisplay({ ...initial, gui: {
      ...initial.gui, color: "#ff0000"
    } })).toThrow(/unsupported/);
  });

  it("stores item identities as strict optional pack index data without changing legacy archives", () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    expect(pack.items).toBeUndefined();
    const item = fixture();
    const withItem = parsePackDocument({ ...pack, items: [item] });
    expect(withItem.items).toEqual([item]);
    expect(withItem.activeModelId).toBe("model-0");
    expect(resourceKey(withItem.items![0]!.resource)).toBe("3dmc:item/stick");
    expect(gameFilePath("items", item.replaces))
      .toBe("assets/minecraft/items/stick.json");
    expect(() => parsePackDocument({ ...pack, items: [item, {
      ...item, id: "item-two", resource: { namespace: "3dmc", path: "item/paper" }
    }] })).toThrow(/Duplicate item replacements/);
    expect(() => parsePackDocument({ ...pack, items: [{
      ...item, replaces: { namespace: "minecraft", path: "compass" }
    }] })).toThrow(/Unsupported Java 1.21.4 item/);
    expect(() => parsePackDocument({ ...pack, items: [{
      ...item, sourceModelId: "missing"
    }] })).toThrow(/missing source model/);
    expect(() => parsePackDocument({ ...pack, items: [{
      ...item, future: "unknown"
    }] })).toThrow(/unknown or missing fields/);
    expect(() => parsePackDocument({ ...pack, items: [{
      ...item, resource: pack.models[0]!.resource
    }] })).toThrow(/Duplicate model paths/);
    expect(indexLegacyProject(source).items).toBeUndefined();
  });

  it("uses one pack history for creating, editing, removing and restoring item visuals", () => {
    const source = createSampleDocument();
    let session = createPackSession(indexLegacyProject(source), [source]);
    session = addPackItem(session, fixture());
    expect(session.present.pack.items).toHaveLength(1);
    expect(session.past).toHaveLength(1);
    session = setPackItemDisplay(session, "item-one", "gui", "translation", 0, 2.5);
    expect(session.present.pack.items![0]!.display.gui.translation[0]).toBe(2.5);
    const hand = setItemHandAnimation(session, "item-one", false);
    expect(hand.present.pack.items![0]!.handAnimationOnSwap).toBe(false);
    expect(undoPackSession(hand).present.pack.items![0]!.handAnimationOnSwap).toBe(true);
    expect(setPackItemResource(session, "item-one", fixture().resource,
      fixture().replaces)).toBe(session);
    session = setPackItemResource(session, "item-one",
      { namespace: "custom", path: "item/edited" },
      { namespace: "minecraft", path: "paper" });
    expect(session.present.pack.items![0]!.replaces.path).toBe("paper");
    const undone = undoPackSession(session);
    expect(undone.present.pack.items![0]!.replaces.path).toBe("stick");
    const removed = removePackItem(session, "item-one");
    expect(removed.present.pack.items).toEqual([]);
    expect(undoPackSession(removed).present.pack.items).toEqual(session.present.pack.items);
    const renamed = editActivePackDocument(session, doc => renameProject(doc, "New source name"));
    expect(renamed.present.sources[0]!.name).toBe("New source name");
    expect(renamed.present.pack.items).toEqual(session.present.pack.items);
  });

  it("removes item references with their deleted model and restores them on undo", () => {
    const first = createSampleDocument();
    const second = { ...createSampleDocument(), id: "source-iron", name: "Iron source" };
    let session = createPackSession(indexLegacyProject(first), [first]);
    session = addPackModel(session, second, {
      id: "model-iron", sourceDocumentId: second.id,
      resource: { namespace: "3dmc", path: "block/iron" },
      replaces: { namespace: "minecraft", path: "iron_block" },
      provenance: "editor",
      textures: [{ sourceTextureId: "main", textureAssetId: "texture-iron" }]
    }, [{
      id: "texture-iron", sourceDocumentId: second.id, sourceTextureId: "main",
      resource: { namespace: "3dmc", path: "block/iron_texture" }
    }]);
    session = addPackItem(session, fixture());
    const deleted = removePackModel(session, "model-0");
    expect(deleted.present.pack.items).toEqual([]);
    expect(deleted.present.sources).toHaveLength(1);
    expect(undoPackSession(deleted).present.pack.items).toEqual([fixture()]);
  });

  it("exports exact Java item definitions and model display contexts with shared pixels", async () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    const item = fixture();
    item.display.gui.rotation = [30, 45, -10];
    item.display.firstperson_righthand.scale = [0.75, 0.7, 0.65];
    const indexed = parsePackDocument({ ...pack, items: [item] });
    const snapshot = JSON.stringify({ indexed, source });
    const generated = makeIndexedJava1214Pack(indexed, [source]);
    expect(generated.gameVerified).toBe(false);
    expect(generated.itemReplacements).toEqual(["minecraft:stick"]);
    expect(generated.paths).toContain("assets/minecraft/items/stick.json");
    expect(generated.paths).toContain("assets/3dmc/models/item/stick.json");
    const files = unzipSync(generated.zip);
    const definition = JSON.parse(strFromU8(files["assets/minecraft/items/stick.json"]!));
    expect(definition).toEqual({
      model: { type: "minecraft:model", model: "3dmc:item/stick" },
      hand_animation_on_swap: true
    });
    const model = JSON.parse(strFromU8(files["assets/3dmc/models/item/stick.json"]!));
    expect(model.display.gui.rotation).toEqual([30, 45, -10]);
    expect(model.display.firstperson_righthand.scale).toEqual([0.75, 0.7, 0.65]);
    expect(model.elements).toHaveLength(source.cuboids.length);
    expect(model.textures.painted).toBe("3dmc:block/main");
    expect(model.textures.solid_1).toBe("3dmc:block/solid_1");
    expect(files["assets/3dmc/textures/block/solid_1.png"]).toBeDefined();
    expect(files["assets/3dmc/textures/item/stick.png"]).toBeUndefined();
    expect(JSON.stringify({ indexed, source })).toBe(snapshot);
    expect(makeIndexedJava1214Pack(indexed, [source]).zip).toEqual(generated.zip);
    expect(makeIndexedJava1214Pack(pack, [source]).zip).toEqual(makeJava1214Pack(source).zip);

    const issues = inspectIndexedJava1214Pack(indexed, [source]);
    expect(issues.filter(x => x.severity === "error")).toEqual([]);
    expect(issues.find(x => x.code === "PACK_VISUAL_REPLACEMENTS_ONLY")?.message)
      .toContain("minecraft:stick");
    const native = await encodeNativePack(indexed, [source]);
    const reopened = await decodeNativePack(native);
    expect(reopened.pack.items).toEqual([item]);
    expect(reopened.sources).toEqual([source]);
    expect(makeIndexedJava1214Pack(reopened.pack, reopened.sources).zip).toEqual(generated.zip);
  });


  it("exports item-only visuals without any vanilla blockstate replacement", async () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    expect(() => parsePackDocument({ ...pack, exportBlockVisuals: false }))
      .toThrow(/item-only pack needs/);
    const itemOnly = parsePackDocument({
      ...pack, items: [fixture()], exportBlockVisuals: false
    });
    const before = JSON.stringify(source);
    const out = makeIndexedJava1214Pack(itemOnly, [source]);
    expect(out.replaces).toEqual([]);
    expect(out.itemReplacements).toEqual(["minecraft:stick"]);
    const files = unzipSync(out.zip);
    expect(Object.keys(files).some(path => path.includes("/blockstates/"))).toBe(false);
    expect(files["assets/minecraft/items/stick.json"]).toBeDefined();
    expect(files["assets/3dmc/models/item/stick.json"]).toBeDefined();
    expect(JSON.parse(strFromU8(files["pack.mcmeta"]!)).pack.description)
      .toContain("item visuals");
    expect(out.issues.some(issue => issue.code === "VISUAL_REPLACEMENT_ONLY")).toBe(false);
    const problems = inspectIndexedJava1214Pack(itemOnly, [source]);
    expect(problems.filter(issue => issue.severity === "error")).toEqual([]);
    expect(problems.find(issue => issue.code === "PACK_VISUAL_REPLACEMENTS_ONLY")?.message)
      .toContain("no vanilla blocks");
    const bytes = await encodeNativePack(itemOnly, [source]);
    const restored = await decodeNativePack(bytes);
    expect(restored.pack.exportBlockVisuals).toBe(false);
    expect(makeIndexedJava1214Pack(restored.pack, restored.sources).zip).toEqual(out.zip);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("rejects item model collisions and source-format blockers before writing a ZIP", () => {
    const source = createSampleDocument();
    const pack = indexLegacyProject(source);
    const item = fixture();
    const collision = clone({ ...pack, items: [item] });
    collision.items[0]!.resource = pack.models[0]!.resource;
    expect(() => makeIndexedJava1214Pack(collision, [source]))
      .toThrow(/Duplicate model paths/);
    expect(inspectIndexedJava1214Pack(collision, [source])[0]).toMatchObject({
      severity: "error", code: "PACK_SOURCE_INVALID"
    });
    const corrupt = clone({ ...pack, items: [item] });
    corrupt.items[0]!.display.gui.scale = [-1, 1, 1];
    expect(() => makeIndexedJava1214Pack(corrupt, [source])).toThrow(/scale/);
    const unsupported = clone({ ...pack, items: [item] });
    unsupported.items[0]!.replaces.path = "trident";
    expect(() => makeIndexedJava1214Pack(unsupported, [source]))
      .toThrow(/Unsupported Java 1.21.4 item/);
  });
});

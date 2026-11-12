import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { createSampleDocument, setAxisValue } from "../editor/domain";
import { defaultItemDisplay } from "../pack/itemProfile";
import { indexLegacyProject, parsePackDocument } from "../pack/packDocument";
import type { PackItemAsset } from "../pack/packDocument";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import { inspectGeneratedItemSettings } from "./javaItemSettings";

const stamp = new Date(1980, 0, 1);
function item(id: string, target: string, model: string): PackItemAsset {
  return {
    id, sourceModelId: "model-0",
    resource: { namespace: "3dmc", path: model },
    replaces: { namespace: "minecraft", path: target },
    handAnimationOnSwap: true, display: defaultItemDisplay()
  };
}

const fixture = () => {
  const source = createSampleDocument();
  const pack = indexLegacyProject(source);
  const first = item("stick-id", "stick", "item/custom_stick");
  const second = item("paper-id", "paper", "item/custom_paper");
  first.display.gui.translation = [2, 1, -0.5];
  second.handAnimationOnSwap = false;
  const withItems = parsePackDocument({ ...pack, items: [first, second] });
  const gameZip = makeIndexedJava1214Pack(withItems, [source]).zip;
  return { source, pack, withItems, gameZip };
};
function replaceZip(zip: Uint8Array,
  change: (files: Record<string, Uint8Array>) => void): Uint8Array {
  const files = unzipSync(zip);
  change(files);
  return zipSync(files, { level: 0, mtime: stamp });
}
function changeJson(files: Record<string, Uint8Array>, path: string,
  mutate: (data: Record<string, any>) => void) {
  const parsed = JSON.parse(strFromU8(files[path]!));
  mutate(parsed);
  files[path] = strToU8(JSON.stringify(parsed, null, 2) + "\n");
}

describe("exact generated Java item settings importer", () => {
  it("restores item targets, display transforms and paths without modifying editable geometry", () => {
    const { source, pack, gameZip, withItems } = fixture();
    const untouched = JSON.stringify({ source, pack });
    const imported = inspectGeneratedItemSettings(gameZip, pack, [source]);
    if (imported.status !== "compatible")
      throw new Error(imported.problems.join("; "));
    expect(imported.items).toEqual(withItems.items);
    expect(imported.pack.items!.map(item => item.replaces.path)).toEqual(["stick", "paper"]);
    expect(imported.pack.items![0]!.display.gui.translation).toEqual([2, 1, -0.5]);
    expect(imported.pack.items![1]!.handAnimationOnSwap).toBe(false);
    expect(imported.pack.models).toEqual(pack.models);
    expect(imported.pack.textures).toEqual(pack.textures);
    expect(JSON.stringify({ source, pack })).toBe(untouched);
    expect(makeIndexedJava1214Pack(imported.pack, [source]).zip).toEqual(gameZip);
  });

  it("keeps stable item IDs when importing new display values into an existing pack", () => {
    const { source, withItems, gameZip } = fixture();
    const changed = parsePackDocument({ ...withItems, items: [
      { ...withItems.items![0]!, display: defaultItemDisplay() },
      { ...withItems.items![1]!, handAnimationOnSwap: true }
    ] });
    const restored = inspectGeneratedItemSettings(gameZip, changed, [source]);
    if (restored.status !== "compatible")
      throw new Error(restored.problems.join("; "));
    expect(restored.items.map(item => item.id)).toEqual(["stick-id", "paper-id"]);
    expect(restored.items[0]!.display.gui.translation).toEqual([2, 1, -0.5]);
  });

  it("rejects modified geometry, external files and invalid item routing atomically", () => {
    const { source, pack, gameZip } = fixture();
    const changedSource = setAxisValue(source, "body", "position", 0, 4);
    expect(inspectGeneratedItemSettings(gameZip, pack, [changedSource])).toMatchObject({
      status: "blocked"
    });

    const extra = replaceZip(gameZip, files => {
      files["assets/example/items/surprise.json"] = strToU8("{}\n");
    });
    const result = inspectGeneratedItemSettings(extra, pack, [source]);
    expect(result.status).toBe("blocked");

    const modelRef = replaceZip(gameZip, files => {
      changeJson(files, "assets/minecraft/items/stick.json", json => {
        json.model.model = "3dmc:item/does_not_exist";
      });
    });
    expect(inspectGeneratedItemSettings(modelRef, pack, [source])).toMatchObject({
      status: "blocked"
    });

    const unsupported = replaceZip(gameZip, files => {
      files["assets/minecraft/items/trident.json"] = files["assets/minecraft/items/stick.json"]!;
      delete files["assets/minecraft/items/stick.json"];
    });
    expect(inspectGeneratedItemSettings(unsupported, pack, [source])).toMatchObject({
      status: "blocked"
    });
  });

  it("refuses extra item-model semantics or modified transform schemas rather than dropping data", () => {
    const { source, pack, gameZip } = fixture();
    const altered = replaceZip(gameZip, files => {
      changeJson(files, "assets/3dmc/models/item/custom_stick.json", json => {
        json.overrides = [{ predicate: { custom_model_data: 1 }, model: "other:models/foo" }];
      });
    });
    const result = inspectGeneratedItemSettings(altered, pack, [source]);
    expect(result.status).toBe("blocked");

    const invalidDisplay = replaceZip(gameZip, files => {
      changeJson(files, "assets/3dmc/models/item/custom_stick.json", json => {
        json.display.gui.scale = [-2, 1, 1];
      });
    });
    expect(inspectGeneratedItemSettings(invalidDisplay, pack, [source])).toMatchObject({
      status: "blocked"
    });

    const inappropriate = replaceZip(gameZip, files => {
      changeJson(files, "assets/minecraft/items/stick.json", json => {
        json.model.type = "minecraft:composite";
      });
    });
    expect(inspectGeneratedItemSettings(inappropriate, pack, [source])).toMatchObject({
      status: "blocked"
    });

    const damaged = gameZip.slice();
    damaged[10] = damaged[10]! ^ 8;
    expect(inspectGeneratedItemSettings(damaged, pack, [source])).toMatchObject({
      status: "blocked"
    });
  });
});

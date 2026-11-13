import { describe, expect, it } from "vitest";
import { createSampleDocument } from "../editor/domain";
import { defaultItemDisplay } from "./itemProfile";
import { indexLegacyProject, parsePackDocument } from "./packDocument";
import { makeIndexedJava1214Pack } from "./javaPackBuilder";
import { previewIndexedJava1214Paths } from "./outputPreview";

describe("indexed pack export file preview", () => {
  it("matches the legacy single-model file set and ordering", () => {
    const doc = createSampleDocument();
    const pack = indexLegacyProject(doc);
    expect(previewIndexedJava1214Paths(pack, [doc]))
      .toEqual(makeIndexedJava1214Pack(pack, [doc]).paths);
  });

  it("matches multi-model and item-only generated file sets", () => {
    const source = createSampleDocument();
    const second = { ...createSampleDocument(), id: "preview-second" };
    const pack = indexLegacyProject(source);
    pack.models.push({
      id: "preview-second-model", sourceDocumentId: second.id,
      resource: { namespace: "my_studio", path: "block/second" },
      replaces: { namespace: "minecraft", path: "iron_block" },
      provenance: "editor",
      textures: [{ sourceTextureId: "main", textureAssetId: "second-sheet" }]
    });
    pack.textures.push({
      id: "second-sheet", sourceDocumentId: second.id, sourceTextureId: "main",
      resource: { namespace: "my_studio", path: "block/second_sheet" }
    });
    pack.items = [{
      id: "item-preview", sourceModelId: "preview-second-model",
      resource: { namespace: "my_studio", path: "item/custom" },
      replaces: { namespace: "minecraft", path: "stick" },
      handAnimationOnSwap: true, display: defaultItemDisplay()
    }];
    const sources = [source, second];
    const withItems = parsePackDocument(pack);
    expect(previewIndexedJava1214Paths(withItems, sources))
      .toEqual(makeIndexedJava1214Pack(withItems, sources).paths);
    const itemOnly = parsePackDocument({ ...withItems, exportBlockVisuals: false });
    const paths = previewIndexedJava1214Paths(itemOnly, sources);
    expect(paths.some(path => path.includes("/blockstates/"))).toBe(false);
    expect(paths).toEqual(makeIndexedJava1214Pack(itemOnly, sources).paths);
  });
});

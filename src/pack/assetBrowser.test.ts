import { describe, expect, it } from "vitest";
import { FACE_DIRECTIONS, createSampleDocument } from "../editor/domain";
import { indexLegacyProject } from "./packDocument";
import { describeTextureDependencies, searchPackModels } from "./assetBrowser";

function twoModels() {
  const first = createSampleDocument();
  const second = { ...createSampleDocument(), id: "another-source", name: "Frost Window" };
  const pack = indexLegacyProject(first);
  pack.models.push({
    id: "model-frost", sourceDocumentId: second.id,
    resource: { namespace: "custom", path: "block/frost_window" },
    replaces: { namespace: "minecraft", path: "iron_block" },
    provenance: "editor",
    textures: [{ sourceTextureId: "main", textureAssetId: "frost-texture" }]
  });
  pack.textures.push({
    id: "frost-texture", sourceDocumentId: second.id, sourceTextureId: "main",
    resource: { namespace: "custom", path: "block/frost_paint" }
  });
  return { pack, sources: [first, second] };
}

describe("pack asset discovery", () => {
  it("finds model name, resource path, replacement and texture identifiers without reordering", () => {
    const { pack, sources } = twoModels();
    const untouched = JSON.stringify({ pack, sources });
    expect(searchPackModels(pack, sources, "")).toEqual(pack.models);
    expect(searchPackModels(pack, sources, "  ")).toEqual(pack.models);
    expect(searchPackModels(pack, sources, "FROST")).toEqual([pack.models[1]]);
    expect(searchPackModels(pack, sources, "custom:frost")).toHaveLength(0);
    expect(searchPackModels(pack, sources, "custom:block/frost_window")).toEqual([pack.models[1]]);
    expect(searchPackModels(pack, sources, "iron_block Frost")).toEqual([pack.models[1]]);
    expect(searchPackModels(pack, sources, "diamond_block")).toEqual([pack.models[0]]);
    expect(searchPackModels(pack, sources, "frost_paint")).toEqual([pack.models[1]]);
    expect(searchPackModels(pack, sources, "nothing-here")).toEqual([]);
    expect(JSON.stringify({ pack, sources })).toBe(untouched);
  });

  it("counts only painted faces and includes hidden source geometry", () => {
    const doc = createSampleDocument();
    const first = doc.cuboids[0]!;
    const second = doc.cuboids[1]!;
    const source = {
      ...doc,
      cuboids: [
        { ...first, material: "texture" as const, visible: false, faces: {
          ...first.faces,
          north: { ...first.faces.north, textureId: "detail" }
        } },
        { ...second, material: "solid" as const }
      ]
    };
    const main = describeTextureDependencies(source, "main");
    expect(main.cuboidCount).toBe(1);
    expect(main.faceCount).toBe(FACE_DIRECTIONS.length - 1);
    expect(main.uses[0]?.cuboidId).toBe(first.id);
    expect(main.uses[0]?.faces).not.toContain("north");
    expect(describeTextureDependencies(source, "detail")).toEqual({
      faceCount: 1, cuboidCount: 1,
      uses: [{ cuboidId: first.id, cuboidName: first.name, faces: ["north"] }]
    });
    expect(describeTextureDependencies(source, "unused")).toEqual({
      faceCount: 0, cuboidCount: 0, uses: []
    });
  });
});

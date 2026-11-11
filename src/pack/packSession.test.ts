import { describe, expect, it } from "vitest";
import { addTexture, createSampleDocument, parseDocument, setAxisValue } from "../editor/domain";
import type { EditorDocument } from "../editor/domain";
import { indexLegacyProject, parsePackDocument } from "./packDocument";
import type { PackModelAsset, PackTextureAsset } from "./packDocument";
import {
  activePackDocument, activePackModel, addPackModel, createPackSession,
  editActivePackDocument, editPackIndex, PackSessionError, redoPackSession,
  removePackModel, selectPackModel, setModelResource, setTextureResource,
  undoPackSession
} from "./packSession";

function project() {
  const doc = createSampleDocument();
  return createPackSession(indexLegacyProject(doc), [doc]);
}

function secondModel(): { source: EditorDocument; model: PackModelAsset; textures: PackTextureAsset[] } {
  const source: EditorDocument = {
    ...createSampleDocument(),
    id: "another-model-source",
    name: "Second model"
  };
  return {
    source,
    model: {
      id: "model-second", sourceDocumentId: source.id,
      resource: { namespace: "my_pack", path: "block/second" },
      replaces: { namespace: "minecraft", path: "iron_block" },
      textures: [{ sourceTextureId: "main", textureAssetId: "second-main" }],
      provenance: "editor"
    },
    textures: [{
      id: "second-main", sourceDocumentId: source.id, sourceTextureId: "main",
      resource: { namespace: "my_pack", path: "block/second_main" }
    }]
  };
}

describe("pack session with one authoritative history", () => {
  it("initializes from one validated editor project without changing the source", () => {
    const source = createSampleDocument();
    const original = JSON.stringify(source);
    const state = createPackSession(indexLegacyProject(source), [source]);
    expect(state.revision).toBe(0);
    expect(state.past).toHaveLength(0);
    expect(activePackModel(state).id).toBe("model-0");
    expect(activePackDocument(state)).toEqual(source);
    expect(activePackDocument(state)).not.toBe(source);
    expect(JSON.stringify(source)).toBe(original);
    expect(undoPackSession(state)).toBe(state);
    expect(redoPackSession(state)).toBe(state);
  });

  it("adds, switches and edits independent models; undo and redo preserve source separation", () => {
    const original = project();
    const { source, model, textures } = secondModel();
    const added = addPackModel(original, source, model, textures);
    expect(added.present.pack.models).toHaveLength(2);
    expect(added.present.sources).toHaveLength(2);
    expect(added.present.pack.activeModelId).toBe(model.id);
    expect(activePackDocument(added).id).toBe(source.id);
    const selected = selectPackModel(added, "model-0");
    expect(selected.past).toHaveLength(1); // Switching is not an undo entry.
    expect(selectPackModel(selected, "model-0")).toBe(selected);
    const edited = editActivePackDocument(selected, doc =>
      setAxisValue(doc, "body", "position", 0, 5));
    expect(activePackDocument(edited).cuboids[0]?.from[0]).toBe(5);
    expect(edited.present.sources.find(doc => doc.id === source.id)?.cuboids[0]?.from[0]).toBe(3);
    expect(edited.present.sources[1]).toBe(selected.present.sources[1]);
    expect(parseDocument(activePackDocument(edited))).toEqual(activePackDocument(edited));
    expect(edited.past).toHaveLength(2);
    const undone = undoPackSession(edited);
    expect(activePackDocument(undone).cuboids[0]?.from[0]).toBe(3);
    expect(undone.present.pack.activeModelId).toBe("model-0");
    const redone = redoPackSession(undone);
    expect(activePackDocument(redone).cuboids[0]?.from[0]).toBe(5);
    const again = undoPackSession(undone);
    expect(again.present.pack.models).toHaveLength(1);
    expect(again.present.sources).toHaveLength(1);
    expect(again.present.pack.activeModelId).toBe("model-0");
  });

  it("removes models with their unreferenced textures, but keeps undo snapshots", () => {
    const base = project();
    const { source, model, textures } = secondModel();
    const added = addPackModel(base, source, model, textures);
    const removed = removePackModel(added, model.id);
    expect(removed.present.pack.models).toHaveLength(1);
    expect(removed.present.pack.textures).toHaveLength(1);
    expect(removed.present.sources).toHaveLength(1);
    expect(removed.present.pack.activeModelId).toBe("model-0");
    expect(() => removePackModel(removed, "model-0")).toThrow(/last editable/);
    const undone = undoPackSession(removed);
    expect(undone.present.pack.models).toHaveLength(2);
    expect(undone.present.sources[1]).toEqual(source);
    expect(redoPackSession(undone).present.pack.models).toHaveLength(1);
    expect(added.present.pack.models).toHaveLength(2);
  });

  it("edits resource locations without changing source IDs or losing references", () => {
    const base = project();
    const changed = setModelResource(base, "model-0",
      { namespace: "my_assets", path: "block/copper_lantern" },
      { namespace: "minecraft", path: "iron_block" });
    expect(changed.present.pack.models[0]?.resource.path).toBe("block/copper_lantern");
    expect(changed.present.pack.models[0]?.replaces.path).toBe("iron_block");
    expect(activePackDocument(changed)).toEqual(activePackDocument(base));
    const renamedTexture = setTextureResource(changed, "texture-0",
      { namespace: "my_assets", path: "block/painted" });
    expect(renamedTexture.present.pack.textures[0]?.resource.path).toBe("block/painted");
    expect(renamedTexture.present.pack.models[0]?.textures[0]?.textureAssetId).toBe("texture-0");
    expect(parsePackDocument(renamedTexture.present.pack)).toEqual(renamedTexture.present.pack);
    expect(setTextureResource(renamedTexture, "texture-0",
      { namespace: "my_assets", path: "block/painted" })).toBe(renamedTexture);
    expect(undoPackSession(renamedTexture).present.pack.textures[0]?.resource.path)
      .toBe("block/main");
    expect(undoPackSession(undoPackSession(renamedTexture)).present.pack.models[0]?.resource.path)
      .toBe("block/lantern");
  });

  it("rejects unsafe and stale operations atomically", () => {
    const base = project();
    const old = JSON.stringify(base);
    expect(() => selectPackModel(base, "missing")).toThrow(PackSessionError);
    expect(() => removePackModel(base, "missing")).toThrow(PackSessionError);
    const bad = secondModel();
    bad.textures[0]!.resource = { namespace: "3dmc", path: "block/main" };
    expect(() => addPackModel(base, bad.source, bad.model, bad.textures)).toThrow(/Duplicate texture paths/);
    expect(() => editActivePackDocument(base, doc => ({
      ...doc, id: "changed-source-id"
    }))).toThrow(/identity/);
    expect(() => editActivePackDocument(base, doc => addTexture(doc, {
      id: "unbound", name: "Unbound.png", width: 16, height: 16,
      pixels: new Array(16 * 16 * 4).fill(255)
    }))).toThrow(/missing or stale source texture bindings/);
    expect(() => editPackIndex(base, pack => ({
      ...pack, futureField: "unsupported"
    }))).toThrow(/unknown or missing fields/);
    expect(JSON.stringify(base)).toBe(old);
    expect(base.revision).toBe(0);
  });
});

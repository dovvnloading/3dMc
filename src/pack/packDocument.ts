import { parseDocument } from "../editor/domain";
import type { EditorDocument } from "../editor/domain";
import { JAVA_1214_ITEM_TARGETS, parseItemDisplay } from "./itemProfile";
import type { ItemDisplay } from "./itemProfile";

/**
 * Pack-wide source index, intentionally independent of the renderer and the
 * current v3 single-model editor document. No game files are written here.
 * Pack schema numbers are NOT Minecraft format or .3dmc container versions.
 */
export const PACK_INDEX_VERSION = 1 as const;
export const PACK_TARGET_PROFILE = "java-1.21.4-static-block" as const;
export const MAX_PACK_MODELS = 32 as const;
export const MAX_PACK_TEXTURES = 512 as const;
export const MAX_PACK_ITEMS = 8 as const;

export interface ResourceLocation {
  namespace: string;
  path: string;
}

export interface PackTextureAsset {
  id: string;
  sourceDocumentId: string;
  sourceTextureId: string;
  resource: ResourceLocation;
}

export interface PackTextureBinding {
  sourceTextureId: string;
  textureAssetId: string;
}

export interface PackModelAsset {
  id: string;
  sourceDocumentId: string;
  resource: ResourceLocation;
  replaces: ResourceLocation;
  textures: PackTextureBinding[];
  provenance: "editor" | "java-1214-import";
}

/**
 * Optional Java 1.21.4 item authoring. Each item reuses an editable pack
 * model's cuboids and source textures but has its own raw model and display
 * transforms. Omitting items preserves byte-identical legacy native packs.
 */
export interface PackItemAsset {
  id: string;
  sourceModelId: string;
  resource: ResourceLocation;
  replaces: ResourceLocation;
  handAnimationOnSwap: boolean;
  display: ItemDisplay;
}

export interface PackDocument {
  schemaVersion: typeof PACK_INDEX_VERSION;
  id: string;
  name: string;
  targetProfile: typeof PACK_TARGET_PROFILE;
  activeModelId: string;
  models: PackModelAsset[];
  textures: PackTextureAsset[];
  items?: PackItemAsset[];
  /** Defaults to true for historical projects. Turn off for item-only ZIPs. */
  exportBlockVisuals?: boolean;
}

export class PackIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackIndexError";
  }
}

const fail = (message: string): never => { throw new PackIndexError(message); };

function record(value: unknown, keys: readonly string[], label: string,
                optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(label + " must be an object.");
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !keys.includes(key) && !optional.includes(key)) ||
      keys.some(key => !Object.hasOwn(object, key)))
    return fail(label + " contains unknown or missing fields.");
  return object;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    return fail(label + " requires a stable 1–100 character identifier.");
  return value;
}

function sourceId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100)
    return fail(label + " requires a valid source project identifier.");
  return value;
}

function displayName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 100)
    return fail(label + " must be a nonempty name (up to 100 characters).");
  return value;
}

function resource(value: unknown, label: string): ResourceLocation {
  const object = record(value, ["namespace", "path"], label);
  const { namespace, path } = object;
  if (typeof namespace !== "string" || !/^[a-z0-9_.-]{1,64}$/.test(namespace) ||
      namespace === "." || namespace === "..")
    return fail(label + " has an invalid resource namespace.");
  if (typeof path !== "string" || path.length > 128 || path.length === 0 ||
      path.split("/").some(piece => piece === "." || piece === ".." || piece === "") ||
      !/^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/.test(path))
    return fail(label + " has an unsafe or invalid resource path.");
  return { namespace, path };
}

export function resourceKey(location: ResourceLocation): string {
  const clean = resource(location, "resource");
  return clean.namespace + ":" + clean.path;
}

export function gameFilePath(kind: "models" | "textures" | "blockstates" | "items",
                             location: ResourceLocation): string {
  const clean = resource(location, "resource");
  return "assets/" + clean.namespace + "/" + kind + "/" + clean.path +
    (kind === "textures" ? ".png" : ".json");
}

function unique(keys: readonly string[], label: string): void {
  if (new Set(keys).size !== keys.length) fail("Duplicate " + label + " in pack index.");
}

export function parsePackDocument(input: unknown): PackDocument {
  const raw = record(input, [
    "schemaVersion", "id", "name", "targetProfile", "activeModelId", "models", "textures"
  ], "pack index", ["items", "exportBlockVisuals"]);
  if (raw.schemaVersion !== PACK_INDEX_VERSION || raw.targetProfile !== PACK_TARGET_PROFILE)
    fail("Unsupported pack index version or Minecraft target profile. Source was not changed.");
  const id = sourceId(raw.id, "pack ID");
  const name = displayName(raw.name, "pack name");
  const activeModelId = identifier(raw.activeModelId, "active model ID");
  const exportBlockVisuals = raw.exportBlockVisuals;
  if (exportBlockVisuals !== undefined && typeof exportBlockVisuals !== "boolean")
    fail("Block visual export setting must be true or false.");

  if (!Array.isArray(raw.models) || raw.models.length < 1 || raw.models.length > MAX_PACK_MODELS)
    fail("Pack index requires 1–32 model assets.");
  if (!Array.isArray(raw.textures) || raw.textures.length < 1 ||
      raw.textures.length > MAX_PACK_TEXTURES)
    fail("Pack index requires 1–512 texture assets.");

  const textures: PackTextureAsset[] = (raw.textures as unknown[]).map((item, index) => {
    const t = record(item, ["id", "sourceDocumentId", "sourceTextureId", "resource"],
      "texture " + index);
    return {
      id: identifier(t.id, "texture ID"),
      sourceDocumentId: sourceId(t.sourceDocumentId, "texture source project"),
      sourceTextureId: identifier(t.sourceTextureId, "source texture ID"),
      resource: resource(t.resource, "texture resource")
    };
  });
  unique(textures.map(t => t.id), "texture IDs");
  unique(textures.map(t => gameFilePath("textures", t.resource)), "texture paths");
  const textureById = new Map(textures.map(t => [t.id, t]));

  const models: PackModelAsset[] = (raw.models as unknown[]).map((item, index) => {
    const m = record(item, [
      "id", "sourceDocumentId", "resource", "replaces", "textures", "provenance"
    ], "model " + index);
    const modelId = identifier(m.id, "model ID");
    const sourceDocumentId = sourceId(m.sourceDocumentId, "model source project");
    const modelResource = resource(m.resource, "model resource");
    const replaces = resource(m.replaces, "replacement resource");
    if (replaces.namespace !== "minecraft" || replaces.path.includes("/"))
      fail("This profile only plans one vanilla minecraft blockstate replacement per model.");
    if (!Array.isArray(m.textures) || m.textures.length < 1 || m.textures.length > 16)
      fail("Each model must bind 1–16 textures.");
    const bindings: PackTextureBinding[] = (m.textures as unknown[]).map((entry, position) => {
      const b = record(entry, ["sourceTextureId", "textureAssetId"],
        "model " + modelId + " texture binding " + position);
      const sourceTextureId = identifier(b.sourceTextureId, "source texture ID");
      const textureAssetId = identifier(b.textureAssetId, "pack texture ID");
      const texture = textureById.get(textureAssetId);
      if (!texture || texture.sourceDocumentId !== sourceDocumentId ||
          texture.sourceTextureId !== sourceTextureId)
        fail("Model " + modelId + " has an unresolved or mismatched texture reference.");
      return { sourceTextureId, textureAssetId };
    });
    unique(bindings.map(binding => binding.sourceTextureId), "source texture bindings");
    if (m.provenance !== "editor" && m.provenance !== "java-1214-import")
      fail("Unrecognized model provenance.");
    return {
      id: modelId, sourceDocumentId, resource: modelResource, replaces,
      textures: bindings, provenance: m.provenance as PackModelAsset["provenance"]
    };
  });
  unique(models.map(model => model.id), "model IDs");
  const byModel = new Set(models.map(model => model.id));
  let items: PackItemAsset[] | undefined;
  if (raw.items !== undefined) {
    if (!Array.isArray(raw.items) || raw.items.length > MAX_PACK_ITEMS)
      fail("Pack index supports at most eight Java item assets.");
    items = (raw.items as unknown[]).map((value, index) => {
      const item = record(value, [
        "id", "sourceModelId", "resource", "replaces", "handAnimationOnSwap", "display"
      ], "item " + index);
      const id = identifier(item.id, "item ID");
      const sourceModelId = identifier(item.sourceModelId, "item source model ID");
      if (!byModel.has(sourceModelId))
        fail("Item " + id + " refers to a missing source model.");
      const itemResource = resource(item.resource, "item model resource");
      const replaces = resource(item.replaces, "item replacement");
      if (replaces.namespace !== "minecraft" ||
          !JAVA_1214_ITEM_TARGETS.includes(
            replaces.path as typeof JAVA_1214_ITEM_TARGETS[number]))
        fail("Unsupported Java 1.21.4 item replacement. Choose stick, paper, apple, or diamond_sword.");
      const handAnimationOnSwap = item.handAnimationOnSwap;
      if (typeof handAnimationOnSwap !== "boolean")
        fail("Item hand animation setting must be true or false.");
      return {
        id, sourceModelId, resource: itemResource, replaces,
        handAnimationOnSwap: handAnimationOnSwap as boolean,
        display: parseItemDisplay(item.display)
      };
    });
    unique(items!.map(item => item.id), "item IDs");
    unique(items!.map(item => gameFilePath("items", item.replaces)), "item replacements");
  }
  if (exportBlockVisuals === false && !(items?.length))
    fail("An item-only pack needs at least one item asset.");
  unique([...models.map(model => gameFilePath("models", model.resource)),
    ...(items ?? []).map(item => gameFilePath("models", item.resource))], "model paths");
  unique(models.map(model => gameFilePath("blockstates", model.replaces)), "blockstate replacements");
  if (!models.some(model => model.id === activeModelId))
    fail("Active model is missing from the pack index.");
  const usedTextures = new Set(models.flatMap(model => model.textures.map(b => b.textureAssetId)));
  if (textures.some(texture => !usedTextures.has(texture.id)))
    fail("Unreferenced pack textures must be resolved before export.");

  return { schemaVersion: PACK_INDEX_VERSION, id, name,
    targetProfile: PACK_TARGET_PROFILE, activeModelId, models, textures,
    ...(items ? { items } : {}),
    ...(exportBlockVisuals !== undefined ?
      { exportBlockVisuals: exportBlockVisuals as boolean } : {}) };
}

/** Existing editable source becomes one indexed block, with original export paths. */
export function indexLegacyProject(source: EditorDocument): PackDocument {
  const doc = parseDocument(source);
  if (doc.target.candidateRelease !== "1.21.4")
    fail("Only Java 1.21.4 source projects can be indexed for this profile.");
  return parsePackDocument({
    schemaVersion: PACK_INDEX_VERSION, id: doc.id, name: doc.name,
    targetProfile: PACK_TARGET_PROFILE, activeModelId: "model-0",
    models: [{
      id: "model-0", sourceDocumentId: doc.id,
      resource: { namespace: "3dmc", path: "block/lantern" },
      replaces: { namespace: "minecraft", path: "diamond_block" },
      provenance: "editor",
      textures: doc.textures.map((sheet, index) => ({
        sourceTextureId: sheet.id, textureAssetId: "texture-" + index
      }))
    }],
    textures: doc.textures.map((sheet, index) => ({
      id: "texture-" + index, sourceDocumentId: doc.id, sourceTextureId: sheet.id,
      resource: { namespace: "3dmc",
        path: index === 0 ? "block/main" : "block/tex_" + index }
    }))
  });
}

/** Stop before export when a pack index diverges from its editable source set. */
export function verifyPackSources(pack: PackDocument, sources: readonly EditorDocument[]): void {
  const index = parsePackDocument(pack);
  const documents = sources.map(parseDocument);
  unique(documents.map(doc => doc.id), "source project IDs");
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  for (const model of index.models) {
    const doc = byId.get(model.sourceDocumentId);
    if (!doc) throw new PackIndexError("Source model " + model.sourceDocumentId + " is missing.");
    if (doc.target.edition !== "java" || doc.target.family !== "static-block" ||
        doc.target.candidateRelease !== "1.21.4")
      fail("Source model " + model.sourceDocumentId + " targets an unsupported Minecraft profile.");
    const sourceIds = new Set(doc.textures.map(texture => texture.id));
    const bindings = new Set(model.textures.map(binding => binding.sourceTextureId));
    if (bindings.size !== sourceIds.size ||
        [...sourceIds].some(id => !bindings.has(id)))
      fail("Model " + model.id + " has missing or stale source texture bindings.");
  }
  for (const texture of index.textures) {
    const doc = byId.get(texture.sourceDocumentId);
    if (!doc || !doc.textures.some(source => source.id === texture.sourceTextureId))
      fail("Pack texture " + texture.id + " points to a missing source texture.");
  }
}

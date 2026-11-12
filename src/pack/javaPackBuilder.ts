import { strToU8, zipSync } from "fflate";
import { parseDocument } from "../editor/domain";
import type { EditorDocument } from "../editor/domain";
import { hexToRGB } from "../editor/pixels";
import { buildJava1214Model, inspectJava1214, JavaExportBlocked,
  MIN_JAVA_TEXTURE_SIZE, RESOURCE_PACK_FORMAT } from "../export/javaBlock";
import type { ExportIssue } from "../export/javaBlock";
import { encodeRgbaPng } from "../export/png";
import { gameFilePath, PackIndexError, parsePackDocument, resourceKey,
  verifyPackSources } from "./packDocument";
import type { PackDocument, PackModelAsset, ResourceLocation } from "./packDocument";
import { javaItemDisplay } from "./itemProfile";

/**
 * Candidates whose vanilla Java 1.21.4 blockstates contain one empty-string
 * variant. The existing diamond-block fixture is the only in-game check here;
 * iron-block output still needs its own real-game verification.
 */
export const JAVA_1214_REPLACEMENTS = [
  "diamond_block", "iron_block", "gold_block", "emerald_block",
  "lapis_block", "redstone_block", "netherite_block", "obsidian"
] as const;
export const MAX_INDEXED_EXPORT_MODELS = 8 as const;
export const MAX_INDEXED_EXPORT_BYTES = 12_000_000 as const;

export interface IndexedJavaPackResult {
  zip: Uint8Array;
  paths: string[];
  replaces: string[];
  itemReplacements: string[];
  issues: ExportIssue[];
  gameVerified: false;
}

const jsonBytes = (value: unknown) => strToU8(JSON.stringify(value, null, 2) + "\n");

export function generatedSolidResource(pack: PackDocument, model: PackModelAsset,
                                nodeIndex: number): ResourceLocation {
  // The legacy single-block path is retained for byte-identical exports.
  const legacy = pack.models.length === 1 && model.id === "model-0" &&
    resourceKey(model.resource) === "3dmc:block/lantern" &&
    resourceKey(model.replaces) === "minecraft:diamond_block";
  return {
    namespace: model.resource.namespace,
    path: legacy ? "block/solid_" + nodeIndex :
      model.resource.path + "/solid_" + nodeIndex
  };
}

/**
 * Compile a validated pack index into a deterministic Java 1.21.4 static
 * block ZIP. Never mutates source projects or replaces editable source data.
 * Import remains restricted to the original single-diamond-block fixture.
 */
export function makeIndexedJava1214Pack(index: PackDocument,
                                        sources: readonly EditorDocument[]): IndexedJavaPackResult {
  const pack = parsePackDocument(index);
  if (pack.models.length > MAX_INDEXED_EXPORT_MODELS)
    throw new PackIndexError("The indexed exporter currently supports at most eight models.");
  verifyPackSources(pack, sources);
  const docs = new Map(sources.map(source => {
    const doc = parseDocument(source);
    return [doc.id, doc] as const;
  }));
  const textureAssets = new Map(pack.textures.map(t => [t.id, t]));
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, bytes: Uint8Array) => {
    if (Object.hasOwn(files, path))
      throw new PackIndexError("Generated resource path collision: " + path);
    files[path] = bytes;
  };

  add("pack.mcmeta", jsonBytes({
    pack: {
      pack_format: RESOURCE_PACK_FORMAT,
      description: pack.exportBlockVisuals === false ?
        "3dMc experimental item visuals - Java Edition 1.21.4" :
        pack.items?.length ?
          "3dMc experimental block and item visuals - Java Edition 1.21.4" :
          "3dMc experimental block visual - Java Edition 1.21.4"
    }
  }));

  const notices: ExportIssue[] = [];
  const writtenTextures = new Set<string>();
  const includeBlocks = pack.exportBlockVisuals !== false;
  // Reuse each source model's fully resolved texture aliases for its item
  // appearances. Do not duplicate or convert the source RGBA bytes.
  const resolvedModels = new Map<string, ReturnType<typeof buildJava1214Model>>();
  for (const asset of pack.models) {
    if (!JAVA_1214_REPLACEMENTS.includes(asset.replaces.path as typeof JAVA_1214_REPLACEMENTS[number]))
      throw new PackIndexError(
        "Unsupported Java 1.21.4 replacement " + resourceKey(asset.replaces) +
        ". Choose a property-free replacement: " + JAVA_1214_REPLACEMENTS.join(", ") +
        ". Stateful blocks need a separate profile."
      );

    // verifyPackSources already established the exact source identity and target.
    const doc = docs.get(asset.sourceDocumentId)!;
    const issues = inspectJava1214(doc);
    if (issues.some(issue => issue.severity === "error"))
      throw new JavaExportBlocked(issues);
    notices.push(...issues.filter(issue => issue.severity === "warning" &&
      (includeBlocks || issue.code !== "VISUAL_REPLACEMENT_ONLY")));

    const model = buildJava1214Model(doc);
    const bindings = new Map(asset.textures.map(binding => [
      binding.sourceTextureId, textureAssets.get(binding.textureAssetId)!
    ]));
    const resolveTexture = (sourceId: string): string => {
      const entry = bindings.get(sourceId);
      if (!entry) throw new PackIndexError("Missing texture binding " + sourceId + ".");
      return resourceKey(entry.resource);
    };
    model.textures.particle = resolveTexture(doc.textures[0]!.id);
    doc.textures.forEach((texture, index) => {
      model.textures[index === 0 ? "painted" : "painted_" + index] =
        resolveTexture(texture.id);
    });
    doc.cuboids.forEach((node, index) => {
      if (node.material === "solid")
        model.textures["solid_" + index] =
          resourceKey(generatedSolidResource(pack, asset, index));
    });
    resolvedModels.set(asset.id, model);

    if (includeBlocks) add(gameFilePath("blockstates", asset.replaces), jsonBytes({
      variants: { "": { model: resourceKey(asset.resource) } }
    }));
    if (includeBlocks)
      add(gameFilePath("models", asset.resource), jsonBytes(model));

    for (const binding of asset.textures) {
      const texture = textureAssets.get(binding.textureAssetId)!;
      if (writtenTextures.has(texture.id)) continue;
      const sourceTexture = doc.textures.find(t => t.id === binding.sourceTextureId)!;
      add(gameFilePath("textures", texture.resource),
        encodeRgbaPng(sourceTexture.width, sourceTexture.height, sourceTexture.pixels));
      writtenTextures.add(texture.id);
    }

    doc.cuboids.forEach((node, index) => {
      if (node.material !== "solid") return;
      const [r, g, b] = hexToRGB(node.color);
      const pixels = Array.from({ length: MIN_JAVA_TEXTURE_SIZE ** 2 },
        () => [r, g, b, 255]).flat();
      add(gameFilePath("textures", generatedSolidResource(pack, asset, index)),
        encodeRgbaPng(MIN_JAVA_TEXTURE_SIZE, MIN_JAVA_TEXTURE_SIZE, pixels));
    });
  }
  for (const item of pack.items ?? []) {
    const base = resolvedModels.get(item.sourceModelId);
    if (!base) throw new PackIndexError(
      "Item source model is missing: " + item.sourceModelId);
    const itemModel = { ...base, display: javaItemDisplay(item.display) };
    // Java 1.21.4 selects an items/ definition, not legacy model overrides.
    add(gameFilePath("models", item.resource), jsonBytes(itemModel));
    add(gameFilePath("items", item.replaces), jsonBytes({
      model: { type: "minecraft:model", model: resourceKey(item.resource) },
      hand_animation_on_swap: item.handAnimationOnSwap
    }));
  }
  const zip = zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
  if (zip.length > MAX_INDEXED_EXPORT_BYTES)
    throw new PackIndexError("Indexed pack exceeds the 12 MB experimental export budget.");
  const uniqueNotices = [...new Map(notices.map(note => [note.code, note])).values()];
  if (includeBlocks &&
      (pack.models.length > 1 || pack.models.some(model => model.replaces.path !== "diamond_block")))
    uniqueNotices.push({
      severity: "warning", code: "NEW_REPLACEMENT_UNVERIFIED",
      message: "Additional targets and combined packs need their own Minecraft 1.21.4 in-game checks."
    });
  if (pack.items?.length) uniqueNotices.push({
    severity: "warning", code: "ITEM_GAME_CHECK_REQUIRED",
    message: "Java 1.21.4 item definitions and display contexts are experimental. Test the exported visuals in game before claiming compatibility."
  });
  return {
    zip, paths: Object.keys(files),
    replaces: includeBlocks ? pack.models.map(asset => resourceKey(asset.replaces)) : [],
    itemReplacements: (pack.items ?? []).map(item => resourceKey(item.replaces)),
    issues: uniqueNotices, gameVerified: false
  };
}

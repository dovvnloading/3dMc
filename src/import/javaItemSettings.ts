import { unzipSync } from "fflate";
import type { EditorDocument } from "../editor/domain";
import { readExactStoredZip } from "../editor/nativeArchive";
import type { NativeZipLimits } from "../editor/nativeArchive";
import { makeIndexedJava1214Pack, MAX_INDEXED_EXPORT_BYTES } from "../pack/javaPackBuilder";
import { gameFilePath, parsePackDocument, verifyPackSources } from "../pack/packDocument";
import type { PackDocument, PackItemAsset, ResourceLocation } from "../pack/packDocument";
import { JAVA_1214_ITEM_TARGETS, parseItemDisplay } from "../pack/itemProfile";

export type ItemSettingsImport =
  | { status: "compatible"; pack: PackDocument; paths: string[]; items: PackItemAsset[] }
  | { status: "blocked"; problems: string[] };

const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_ITEM_IMPORT_FILES = 180;

const gamePath = /^assets\/([a-z0-9_.-]{1,64})\/(blockstates|models|items|textures)\/([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*)\.(json|png)$/;
const ZIP_LIMITS: NativeZipLimits = {
  maxArchiveBytes: MAX_INDEXED_EXPORT_BYTES,
  minEntries: 4, maxEntries: MAX_ITEM_IMPORT_FILES, requireManifest: false,
  isAllowedPath: path => path === "pack.mcmeta" ||
    (path.length <= 180 && gamePath.test(path) &&
      (path.includes("/textures/") ? path.endsWith(".png") : path.endsWith(".json"))),
  maxEntryBytes: path => path.endsWith(".png") ? 70_000 :
    path === "pack.mcmeta" ? 10_000 : 250_000
};

function fail(message: string): never { throw new Error(message); }

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      keys.some(key => !Object.hasOwn(value, key)))
    return fail(label + " contains missing or unsupported fields.");
  return value as Record<string, unknown>;
}

function json(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) return fail("Missing game resource " + path + ".");
  try { return JSON.parse(decoder.decode(bytes)) as unknown; }
  catch { return fail("Invalid UTF-8 JSON in " + path + "."); }
}

function resource(value: unknown): ResourceLocation {
  if (typeof value !== "string") return fail("Item model reference must be a namespaced ID.");
  const colon = value.indexOf(":");
  if (colon < 1 || value.indexOf(":", colon + 1) !== -1)
    return fail("Item model reference must be a single namespaced ID.");
  const result = { namespace: value.slice(0, colon), path: value.slice(colon + 1) };
  // Reuse the same strict path validation as the Java exporter.
  gameFilePath("models", result);
  return result;
}

const equalBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Import ONLY display transforms and known item definitions from a
 * deterministic 3dMc-generated Java 1.21.4 pack whose block geometry,
 * textures and file graph exactly match the open editable source pack.
 *
 * This deliberately does not pretend arbitrary Minecraft or modded ZIPs
 * are reversible. User source models, groups, texture pixels, and history
 * remain untouched. A complete proposal is returned before any app edit.
 */
export function inspectGeneratedItemSettings(bytes: Uint8Array, packInput: PackDocument,
  sources: readonly EditorDocument[]): ItemSettingsImport {
  try {
    const pack = parsePackDocument(packInput);
    verifyPackSources(pack, sources);
    const files = readExactStoredZip(bytes, ZIP_LIMITS);
    const includeBlocks = pack.exportBlockVisuals !== false;
    // Reconstruct a block-enabled baseline even when the current pack is
    // item-only; omit the blockstate paths when comparing its source graph.
    const baselinePack = { ...pack, items: [], exportBlockVisuals: true };
    const baseline = makeIndexedJava1214Pack(baselinePack, sources);
    const baselineFiles = unzipSync(baseline.zip);
    const omittedBlockPaths = new Set([
      ...pack.models.map(model => gameFilePath("models", model.resource)),
      ...pack.models.map(model => gameFilePath("blockstates", model.replaces))
    ]);
    for (const path of baseline.paths) {
      if (path === "pack.mcmeta" ||
          (!includeBlocks && omittedBlockPaths.has(path))) continue;
      // Pack description changes when items are present.
      const actual = files.get(path);
      if (!actual || !equalBytes(actual, baselineFiles[path]!))
        fail("The game ZIP has changed or missing block resources: " + path +
          ". Open its matching .3dmc source before importing item settings.");
    }

    const itemPaths = [...files.keys()].filter(path => path.startsWith("assets/minecraft/items/"));
    if (!itemPaths.length || itemPaths.length > JAVA_1214_ITEM_TARGETS.length)
      fail("This ZIP needs 1–" + JAVA_1214_ITEM_TARGETS.length +
        " supported item definitions from 3dMc.");

    const imported: PackItemAsset[] = [];
    for (const itemPath of itemPaths) {
      const target = itemPath.slice("assets/minecraft/items/".length).replace(/\.json$/, "");
      if (itemPath !== "assets/minecraft/items/" + target + ".json" ||
          !JAVA_1214_ITEM_TARGETS.includes(target as typeof JAVA_1214_ITEM_TARGETS[number]))
        fail("Unsupported item definition path " + itemPath + ".");
      const definition = exact(json(files.get(itemPath), itemPath),
        ["model", "hand_animation_on_swap"], itemPath);
      const definitionModel = exact(definition.model, ["type", "model"], itemPath + " model");
      if (definitionModel.type !== "minecraft:model" ||
          typeof definition.hand_animation_on_swap !== "boolean")
        fail("Only plain Java 1.21.4 minecraft:model item definitions can be imported.");

      const modelResource = resource(definitionModel.model);
      const modelPath = gameFilePath("models", modelResource);
      const raw = exact(json(files.get(modelPath), modelPath),
        ["ambientocclusion", "textures", "elements", "display"], modelPath);
      const display = parseItemDisplay(raw.display);
      const { display: _ignored, ...plain } = raw;
      const possibleOwners = pack.models.filter(model => {
        const ownerPath = gameFilePath("models", model.resource);
        const ownerModel = JSON.parse(decoder.decode(baselineFiles[ownerPath]!));
        return JSON.stringify(plain) === JSON.stringify(ownerModel);
      });
      if (possibleOwners.length !== 1)
        fail("Item " + target + " must match exactly one currently editable source model.");
      const previous = pack.items?.find(item => item.replaces.path === target);
      imported.push({
        id: previous?.id ?? "import_item_" + target,
        sourceModelId: possibleOwners[0]!.id,
        resource: modelResource,
        replaces: { namespace: "minecraft", path: target },
        handAnimationOnSwap: definition.hand_animation_on_swap as boolean,
        display
      });
    }

    const candidate = parsePackDocument({ ...pack, items: imported });
    // A rebuild must be byte-identical in EVERY file, including the item
    // definition, its display model and pack.mcmeta. Extra files are refused.
    const rebuilt = makeIndexedJava1214Pack(candidate, sources);
    const reconstructed = unzipSync(rebuilt.zip);
    if (rebuilt.paths.length !== files.size ||
        rebuilt.paths.some(path => !files.has(path) ||
          !equalBytes(files.get(path)!, reconstructed[path]!)))
      fail("The Java ZIP contains unsupported or modified files outside this exact import subset.");
    return { status: "compatible", pack: candidate, items: imported,
      paths: [...files.keys()] };
  } catch (error) {
    return { status: "blocked", problems: [
      error instanceof Error ? error.message : "Java item settings import failed."
    ] };
  }
}

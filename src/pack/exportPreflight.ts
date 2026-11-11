import type { EditorDocument } from "../editor/domain";
import { inspectJava1214 } from "../export/javaBlock";
import type { ExportIssue } from "../export/javaBlock";
import { gameFilePath, parsePackDocument, resourceKey, verifyPackSources } from "./packDocument";
import type { PackDocument, PackModelAsset } from "./packDocument";
import {
  generatedSolidResource, JAVA_1214_REPLACEMENTS, MAX_INDEXED_EXPORT_MODELS
} from "./javaPackBuilder";

/**
 * Non-mutating preflight for the exact file paths the indexed writer will
 * produce. Called before enabling download; the writer still revalidates.
 */
export function inspectIndexedJava1214Pack(input: PackDocument,
                                            sources: readonly EditorDocument[]): ExportIssue[] {
  let pack: PackDocument;
  try {
    pack = parsePackDocument(input);
    verifyPackSources(pack, sources);
  } catch (error) {
    return [{
      severity: "error", code: "PACK_SOURCE_INVALID",
      message: error instanceof Error ? error.message : "Invalid pack assets."
    }];
  }

  const issues: ExportIssue[] = [];
  if (pack.models.length > MAX_INDEXED_EXPORT_MODELS) {
    issues.push({
      severity: "error", code: "PACK_TOO_MANY_MODELS",
      message: "The Java 1.21.4 exporter currently supports at most eight models."
    });
  }

  const sourcesById = new Map(sources.map(source => [source.id, source]));
  const assetsById = new Map(pack.textures.map(texture => [texture.id, texture]));
  const visitedTextures = new Set<string>();
  const reservedPaths = new Map<string, { owner: string; model: PackModelAsset }>();

  const reserve = (path: string, owner: string, model: PackModelAsset, sourceName: string) => {
    const previous = reservedPaths.get(path);
    if (previous) {
      issues.push({
        severity: "error", code: "RESOURCE_PATH_COLLISION",
        message: "Generated file path collision: " + path +
          " is used by " + previous.owner + " and " + owner +
          ". Change the affected model or texture resource path in Pack Studio.",
        sourceDocumentId: model.sourceDocumentId, sourceName
      });
    } else {
      reservedPaths.set(path, { owner, model });
    }
  };

  for (const model of pack.models) {
    const source = sourcesById.get(model.sourceDocumentId)!;
    if (!JAVA_1214_REPLACEMENTS.includes(
      model.replaces.path as typeof JAVA_1214_REPLACEMENTS[number]
    )) {
      issues.push({
        severity: "error", code: "UNSUPPORTED_BLOCK_REPLACEMENT",
        message: resourceKey(model.replaces) +
          " is not an allowed Java 1.21.4 block replacement. Choose diamond_block or iron_block in Pack Studio.",
        sourceDocumentId: model.sourceDocumentId, sourceName: source.name
      });
    }

    reserve(gameFilePath("blockstates", model.replaces), "blockstate " + model.id, model, source.name);
    reserve(gameFilePath("models", model.resource), "model " + model.id, model, source.name);

    for (const binding of model.textures) {
      const texture = assetsById.get(binding.textureAssetId)!;
      if (visitedTextures.has(texture.id)) continue;
      visitedTextures.add(texture.id);
      reserve(gameFilePath("textures", texture.resource),
        "texture " + texture.id, model, source.name);
    }

    source.cuboids.forEach((cuboid, index) => {
      if (cuboid.material === "solid") {
        reserve(gameFilePath("textures", generatedSolidResource(pack, model, index)),
          "solid element " + cuboid.name, model, source.name);
      }
    });

    // Source diagnostics retain stable source/node/texture identity so Locate
    // can switch to the correct model even if two models share display names.
    issues.push(...inspectJava1214(source)
      .filter(issue => issue.severity === "error")
      .map(issue => ({
        ...issue, sourceDocumentId: model.sourceDocumentId, sourceName: source.name
      })));
  }

  const replacements = pack.models.map(model => resourceKey(model.replaces));
  issues.push({
    severity: "warning", code: "PACK_VISUAL_REPLACEMENTS_ONLY",
    message: "This pack replaces visuals for " + replacements.join(", ") +
      ", not collision, lighting, crafting, or gameplay."
  });
  issues.push({
    severity: "warning", code: "PACK_GAME_CHECK_REQUIRED",
    message: "Check this experimental pack in Minecraft Java 1.21.4. " +
      (pack.models.length > 1 || pack.models.some(model => model.replaces.path !== "diamond_block") ?
        "Combined packs and iron-block replacements still need their own in-game verification." :
        "The browser preview is only an approximation of Minecraft rendering.")
  });
  return issues;
}

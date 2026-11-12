import type { EditorDocument } from "../editor/domain";
import { inspectJava1214 } from "../export/javaBlock";
import type { ExportIssue } from "../export/javaBlock";
import { gameFilePath, parsePackDocument, resourceKey, verifyPackSources } from "./packDocument";
import type { PackDocument, PackModelAsset } from "./packDocument";
import {
  generatedSolidResource, JAVA_1214_REPLACEMENTS, MAX_INDEXED_EXPORT_MODELS
} from "./javaPackBuilder";

/** One output entry and its source owner, in the exact order of ZIP generation. */
export interface IndexedJava1214File {
  path: string;
  kind: "metadata" | "blockstate" | "model" | "texture" | "solid-texture";
  sourceDocumentId?: string;
  sourceName?: string;
}

export interface IndexedJava1214Plan {
  files: IndexedJava1214File[];
  replacements: string[];
  issues: ExportIssue[];
}

/**
 * Non-mutating plan for the exact files the indexed writer will generate.
 * Both the export gate and Pack Studio file preview use this same preflight;
 * the ZIP writer independently revalidates at execution time.
 */
export function planIndexedJava1214Pack(input: PackDocument,
                                        sources: readonly EditorDocument[]): IndexedJava1214Plan {
  let pack: PackDocument;
  try {
    pack = parsePackDocument(input);
    verifyPackSources(pack, sources);
  } catch (error) {
    return {
      files: [], replacements: [],
      issues: [{
        severity: "error", code: "PACK_SOURCE_INVALID",
        message: error instanceof Error ? error.message : "Invalid pack assets."
      }]
    };
  }

  const issues: ExportIssue[] = [];
  const files: IndexedJava1214File[] = [{ path: "pack.mcmeta", kind: "metadata" }];
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

  const reserve = (path: string, owner: string, model: PackModelAsset, sourceName: string,
                   kind: IndexedJava1214File["kind"]) => {
    files.push({ path, kind, sourceDocumentId: model.sourceDocumentId, sourceName });
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

    reserve(gameFilePath("blockstates", model.replaces), "blockstate " + model.id, model, source.name, "blockstate");
    reserve(gameFilePath("models", model.resource), "model " + model.id, model, source.name, "model");

    for (const binding of model.textures) {
      const texture = assetsById.get(binding.textureAssetId)!;
      if (visitedTextures.has(texture.id)) continue;
      visitedTextures.add(texture.id);
      reserve(gameFilePath("textures", texture.resource),
        "texture " + texture.id, model, source.name, "texture");
    }

    source.cuboids.forEach((cuboid, index) => {
      if (cuboid.material === "solid") {
        reserve(gameFilePath("textures", generatedSolidResource(pack, model, index)),
          "solid element " + cuboid.name, model, source.name, "solid-texture");
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
  return { files, replacements, issues };
}

/** Backward-compatible diagnostic API for the main editor export gate. */
export function inspectIndexedJava1214Pack(input: PackDocument,
                                            sources: readonly EditorDocument[]): ExportIssue[] {
  return planIndexedJava1214Pack(input, sources).issues;
}

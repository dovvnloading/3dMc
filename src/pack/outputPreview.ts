import type { EditorDocument } from "../editor/domain";
import { gameFilePath, parsePackDocument, verifyPackSources } from "./packDocument";
import type { PackDocument } from "./packDocument";
import { generatedSolidResource } from "./javaPackBuilder";

/** Exactly the paths that the indexed Java 1.21.4 writer emits, in writer order.
 * No PNGs or ZIP bytes are constructed just to preview export consequences. */
export function previewIndexedJava1214Paths(
  input: PackDocument, sources: readonly EditorDocument[]
): string[] {
  const pack = parsePackDocument(input);
  verifyPackSources(pack, sources);
  const documents = new Map(sources.map(source => [source.id, source]));
  const textureAssets = new Map(pack.textures.map(texture => [texture.id, texture]));
  const seen = new Set<string>();
  const result = ["pack.mcmeta"];
  const includeBlocks = pack.exportBlockVisuals !== false;

  for (const model of pack.models) {
    const source = documents.get(model.sourceDocumentId)!;
    if (includeBlocks) {
      result.push(gameFilePath("blockstates", model.replaces));
      result.push(gameFilePath("models", model.resource));
    }
    for (const binding of model.textures) {
      if (seen.has(binding.textureAssetId)) continue;
      seen.add(binding.textureAssetId);
      result.push(gameFilePath("textures", textureAssets.get(binding.textureAssetId)!.resource));
    }
    source.cuboids.forEach((node, index) => {
      if (node.material === "solid")
        result.push(gameFilePath("textures", generatedSolidResource(pack, model, index)));
    });
  }
  for (const item of pack.items ?? []) {
    result.push(gameFilePath("models", item.resource));
    result.push(gameFilePath("items", item.replaces));
  }
  return result;
}

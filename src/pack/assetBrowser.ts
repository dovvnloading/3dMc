import { FACE_DIRECTIONS } from "../editor/domain";
import type { EditorDocument, FaceDirection } from "../editor/domain";
import type { PackDocument, PackModelAsset } from "./packDocument";

/** Read-only asset search: no selection change, history entry or source mutation. */
export function searchPackModels(pack: PackDocument,
                                 sources: readonly EditorDocument[],
                                 query: string): PackModelAsset[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return pack.models;
  const byId = new Map(sources.map(source => [source.id, source]));

  return pack.models.filter(model => {
    const source = byId.get(model.sourceDocumentId);
    if (!source) return false;
    const texturePaths = pack.textures
      .filter(texture => texture.sourceDocumentId === source.id)
      .map(texture => texture.resource.namespace + ":" + texture.resource.path);
    const searchText = [
      model.id, source.name, source.id,
      model.resource.namespace + ":" + model.resource.path,
      model.replaces.namespace + ":" + model.replaces.path,
      ...source.textures.map(texture => texture.name),
      ...texturePaths
    ].join(" ").toLocaleLowerCase();
    return words.every(word => searchText.includes(word));
  });
}

export interface TextureUsage {
  cuboidId: string;
  cuboidName: string;
  faces: FaceDirection[];
}

export interface TextureDependencySummary {
  faceCount: number;
  cuboidCount: number;
  uses: TextureUsage[];
}

/**
 * Count actual painted face references, including hidden cuboids. A solid
 * cuboid's face metadata does not consume a texture in the Java export.
 */
export function describeTextureDependencies(source: EditorDocument,
                                            sourceTextureId: string): TextureDependencySummary {
  const uses = source.cuboids.flatMap(cuboid => {
    if (cuboid.material !== "texture") return [];
    const faces = FACE_DIRECTIONS.filter(face => cuboid.faces[face].textureId === sourceTextureId);
    return faces.length ? [{ cuboidId: cuboid.id, cuboidName: cuboid.name, faces }] : [];
  });
  return {
    faceCount: uses.reduce((count, item) => count + item.faces.length, 0),
    cuboidCount: uses.length,
    uses
  };
}

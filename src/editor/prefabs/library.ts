import { FACE_DIRECTIONS, copyFaces, parseDocument } from "../domain";
import type { Cuboid, EditorDocument, PixelTexture, Vec3 } from "../domain";
import { APOTHECARY_ID, createApothecaryCabinet } from "./apothecaryCabinet";

export type PrefabId = typeof APOTHECARY_ID;

/** Real source assets. The catalog is not a replacement for the project picker. */
export const PREFAB_LIBRARY: readonly {
  id: PrefabId;
  name: string;
  category: "Furniture";
  description: string;
}[] = [{
  id: APOTHECARY_ID,
  name: "Apothecary Cabinet",
  category: "Furniture",
  description: "Oak drawers, potion shelf, book, brass fittings, mortar & pestle"
}];

export class PrefabInsertError extends Error {
  constructor(message: string) { super(message); this.name = "PrefabInsertError"; }
}

function samePixels(a: PixelTexture, b: PixelTexture): boolean {
  return a.width === b.width && a.height === b.height &&
    a.pixels.length === b.pixels.length &&
    a.pixels.every((byte, i) => byte === b.pixels[i]);
}

/**
 * Find an unused 16-unit-wide bay without overlapping the existing model.
 * This keeps the first insertion centered in an empty project and lets a
 * second copy sit beside it. It never overwrites existing cuboids.
 *
 * The Java experimental exporter supports -16..32 coordinates; favor those
 * three bays first. The editor permits additional bays for native projects.
 */
function chooseOrigin(document: EditorDocument, parts: readonly Cuboid[]): Vec3 {
  const minX = Math.min(...parts.map(node => node.from[0]));
  const maxX = Math.max(...parts.map(node => node.to[0]));
  const minY = Math.min(...parts.map(node => node.from[1]));
  const maxY = Math.max(...parts.map(node => node.to[1]));
  const minZ = Math.min(...parts.map(node => node.from[2]));
  const maxZ = Math.max(...parts.map(node => node.to[2]));
  const candidates = [0, 16, -16];
  for (let step = 2; step <= 14; step++) candidates.push(step * 16, -step * 16);
  for (const x of candidates) {
    const fromX = x + minX, toX = x + maxX;
    if (fromX < -256 || toX > 256) continue;
    const overlaps = document.cuboids.some(node =>
      fromX < node.to[0] && toX > node.from[0] &&
      minY < node.to[1] && maxY > node.from[1] &&
      minZ < node.to[2] && maxZ > node.from[2]);
    if (!overlaps) return [x, 0, 0];
  }
  throw new PrefabInsertError(
    "No clear placement bay is available for the cabinet. Move existing furniture or clear part of the scene."
  );
}

/**
 * Reuse unchanged authored textures, including across repeated prefab inserts.
 * If the creator repainted a sheet, never overwrite it or inadvertently bind
 * a new instance to the edited art: allocate a separate, original copy.
 */
function materialBindings(document: EditorDocument, requested: readonly PixelTexture[]): {
  textures: PixelTexture[];
  mapping: ReadonlyMap<string, string>;
} {
  const textures = [...document.textures];
  const mapping = new Map<string, string>();
  for (const material of requested) {
    const compatible = textures.find(texture =>
      (texture.id === material.id || texture.id.startsWith(material.id + "-copy-")) &&
      samePixels(texture, material));
    if (compatible) { mapping.set(material.id, compatible.id); continue; }

    let id = material.id;
    if (textures.some(t => t.id === id)) {
      let suffix = 2;
      while (textures.some(t => t.id === material.id + "-copy-" + suffix)) suffix++;
      id = material.id + "-copy-" + suffix;
    }
    if (textures.length >= 16) throw new PrefabInsertError(
      "The prefab needs additional painted materials, but the project already uses all 16 texture slots. No parts were inserted."
    );
    textures.push({ ...material, id });
    mapping.set(material.id, id);
  }
  return { textures, mapping };
}

/**
 * Add the entire authored item as ONE history commit (caller must commit the
 * returned document once). Every cuboid and texture gets valid source data.
 * One flat scene group makes it selectable/movable as a single furniture item
 * through the existing Scene panel; each part remains independently editable.
 *
 * Instance ID is generated once, outside a React state updater, so strict
 * mode/replay does not create ghost instances or different IDs.
 */
export function insertLibraryPrefab(
  document: EditorDocument, prefabId: PrefabId, instanceId: string
): EditorDocument {
  if (!PREFAB_LIBRARY.some(entry => entry.id === prefabId))
    throw new PrefabInsertError("This prefab is not in the library.");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId))
    throw new PrefabInsertError("Invalid prefab instance identifier.");
  const groupId = "prefab-" + instanceId;
  if (document.groups?.some(group => group.id === groupId)) return document;

  const asset = createApothecaryCabinet();
  if (document.cuboids.length + asset.parts.length > 2000)
    throw new PrefabInsertError("The scene would exceed the 2,000-cuboid editor limit. Nothing was added.");
  if ((document.groups?.length ?? 0) >= 100)
    throw new PrefabInsertError("The scene already has 100 groups. Ungroup an unused collection before adding the prefab.");

  const [offsetX, offsetY, offsetZ] = chooseOrigin(document, asset.parts);
  const { textures, mapping } = materialBindings(document, asset.textures);
  const nodes: Cuboid[] = asset.parts.map(node => {
    const faces = copyFaces(node.faces);
    for (const direction of FACE_DIRECTIONS) {
      const textureId = mapping.get(faces[direction].textureId);
      if (!textureId) throw new PrefabInsertError("An authored material was lost during insertion.");
      faces[direction].textureId = textureId;
    }
    return {
      ...node,
      id: instanceId + "-" + node.id,
      from: [node.from[0] + offsetX, node.from[1] + offsetY,
        node.from[2] + offsetZ] as Vec3,
      to: [node.to[0] + offsetX, node.to[1] + offsetY,
        node.to[2] + offsetZ] as Vec3,
      faces
    };
  });
  const count = (document.groups ?? []).filter(group =>
    group.name.startsWith(asset.name + " · ")).length + 1;
  const next = {
    ...document,
    cuboids: [...document.cuboids, ...nodes],
    groups: [...(document.groups ?? []), {
      id: groupId, name: asset.name + " · " + String(count).padStart(2, "0"),
      memberIds: nodes.map(node => node.id)
    }],
    textures,
    // Never replace an existing artist-authored swatch palette.
    palette: document.palette ?? [...asset.palette],
    activeTextureId: mapping.get("apc-oak") ?? document.activeTextureId
  };
  // The strict document boundary also ensures no collision/unknown metadata
  // can enter a history checkpoint or native export.
  return parseDocument(next);
}

import { FACE_DIRECTIONS, MAX_TEXTURE_SLOTS, copyFaces, parseDocument } from "../domain";
import type { Cuboid, EditorDocument, PixelTexture, Vec3 } from "../domain";
import { selectionBounds } from "../selection";
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

function samePixels(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function matchesAuthoredSheet(existing: PixelTexture, authored: PixelTexture): boolean {
  if (existing.width !== authored.width || existing.height !== authored.height ||
      !samePixels(existing.pixels, authored.pixels)) return false;
  // A flattened sheet or hidden paint can look identical today and behave
  // differently on the next layer edit. The active layer is just a selection.
  const first = existing.layers ?? [], second = authored.layers ?? [];
  return first.length === second.length && first.every((layer, index) => {
    const other = second[index]!;
    return layer.id === other.id && layer.name === other.name &&
      layer.visible === other.visible && layer.opacity === other.opacity &&
      samePixels(layer.pixels, other.pixels);
  });
}

/**
 * Find an unused 16-unit-wide bay without overlapping the existing model.
 * This keeps the first insertion centered in an empty project and lets a
 * second copy sit beside it. It never overwrites existing cuboids.
 *
 * Nearest bays across the floor come first. The nine bays within Java's
 * -16..32 bounds are all closer than any native-only bay.
 */
function chooseOrigin(document: EditorDocument, parts: readonly Cuboid[]): Vec3 {
  const { from, to } = selectionBounds(parts)!;
  const offsets = [0];
  for (let offset = 16; offset <= 256; offset += 16) offsets.push(offset, -offset);
  const bays = offsets.flatMap(z => offsets.map(x => ({ x, z, distance: x * x + z * z })));
  // Stable sorting keeps the original right / left preference on distance ties.
  bays.sort((a, b) => a.distance - b.distance);
  for (const { x, z } of bays) {
    const fromX = x + from[0], toX = x + to[0];
    const fromZ = z + from[2], toZ = z + to[2];
    if (fromX < -256 || toX > 256 || fromZ < -256 || toZ > 256) continue;
    const overlaps = document.cuboids.some(node =>
      fromX < node.to[0] && toX > node.from[0] &&
      from[1] < node.to[1] && to[1] > node.from[1] &&
      fromZ < node.to[2] && toZ > node.from[2]);
    if (!overlaps) return [x, 0, z];
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
      matchesAuthoredSheet(texture, material));
    if (compatible) { mapping.set(material.id, compatible.id); continue; }

    let id = material.id;
    if (textures.some(t => t.id === id)) {
      let suffix = 2;
      while (textures.some(t => t.id === material.id + "-copy-" + suffix)) suffix++;
      id = material.id + "-copy-" + suffix;
    }
    if (textures.length >= MAX_TEXTURE_SLOTS) throw new PrefabInsertError(
      "The cabinet's materials would exceed the 16-texture limit. No parts were inserted."
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
  const names = new Set(document.groups?.map(group => group.name));
  let number = 1, name: string;
  do {
    name = asset.name + " · " + String(number++).padStart(2, "0");
  } while (names.has(name));
  const next = {
    ...document,
    cuboids: [...document.cuboids, ...nodes],
    groups: [...(document.groups ?? []), {
      id: groupId, name,
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

import { validRasterLayers } from "./layers";

/**
 * Canonical, renderer-independent v3 editor source document. Native .3dmc
 * archives are versioned separately, as is the pack-wide asset index.
 * This is intentionally not a complete Java or Bedrock model representation.
 */
export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;
export type MaterialKind = "solid" | "texture";
export type FaceDirection = "down" | "up" | "north" | "south" | "west" | "east";
export type FaceRotation = 0 | 90 | 180 | 270;
export type FaceUVRect = readonly [number, number, number, number];
export interface FaceUV {
  /** Minecraft logical 0–16 UV edges, with (0, 0) at texture top-left. */
  uv: FaceUVRect;
  /** Clockwise quarter turns in the model's Java face binding. */
  rotation: FaceRotation;
  textureId: string;
}
export type CuboidFaces = Record<FaceDirection, FaceUV>;

export const FACE_DIRECTIONS: readonly FaceDirection[] =
  ["down", "up", "north", "south", "west", "east"] as const;

export function createDefaultFaces(textureId = "main"): CuboidFaces {
  return Object.fromEntries(FACE_DIRECTIONS.map((face) => [
    face, { uv: [0, 0, 16, 16] as FaceUVRect, rotation: 0 as FaceRotation, textureId }
  ])) as CuboidFaces;
}

function validFaceUV(value: unknown): value is FaceUV {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const face = value as Partial<FaceUV>;
  return Array.isArray(face.uv) && face.uv.length === 4 &&
    face.uv.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 16) &&
    face.uv[0] !== face.uv[2] && face.uv[1] !== face.uv[3] &&
    (face.rotation === 0 || face.rotation === 90 ||
      face.rotation === 180 || face.rotation === 270) &&
    typeof face.textureId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(face.textureId) &&
    Object.keys(value).every((key) => key === "uv" || key === "rotation" || key === "textureId");
}

export function isValidFaces(value: unknown): value is CuboidFaces {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const faces = value as Record<string, unknown>;
  return Object.keys(faces).length === FACE_DIRECTIONS.length &&
    Object.keys(faces).every((key) => FACE_DIRECTIONS.includes(key as FaceDirection)) &&
    FACE_DIRECTIONS.every((key) => validFaceUV(faces[key]));
}

export function copyFaces(value: CuboidFaces): CuboidFaces {
  return Object.fromEntries(FACE_DIRECTIONS.map((key) => [
    key, { uv: [...value[key].uv] as [number, number, number, number], rotation: value[key].rotation, textureId: value[key].textureId }
  ])) as unknown as CuboidFaces;
}


export interface Cuboid {
  id: string;
  name: string;
  from: Vec3;
  to: Vec3;
  material: MaterialKind;
  color: string;
  faces: CuboidFaces;
  visible: boolean;
  locked: boolean;
}

export interface RasterLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  pixels: number[];
}

export interface PixelTexture {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Straight RGBA, top-left origin. Flattened cache for renderer and Java export. */
  pixels: number[];
  /** Optional editable source layers, bottom to top. */
  layers?: RasterLayer[];
  activeLayerId?: string;
}

/** Flat, editor-only organizational groups. No transforms or Minecraft export semantics. */
export interface EditorGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface EditorDocument {
  schemaVersion: 3;
  id: string;
  name: string;
  target: {
    edition: "java";
    family: "static-block";
    candidateRelease: "1.21.4" | "26.3";
    status: "unverified";
  };
  cuboids: Cuboid[];
  /** Optional for backward compatibility with existing v3 native source files. */
  groups?: EditorGroup[];
  /** Ordered creator swatches, independent of authored pixels and material colors. */
  palette?: string[];
  textures: PixelTexture[];
  activeTextureId: string;
}

export const MAX_TEXTURE_SLOTS = 16;
export function textureById(doc: EditorDocument, id: string): PixelTexture | undefined {
  return doc.textures.find(t => t.id === id);
}
export function activeTexture(doc: EditorDocument): PixelTexture {
  const texture = textureById(doc, doc.activeTextureId);
  if (!texture) throw new Error("The active source texture is missing.");
  return texture;
}


const int = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const numberInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const vec = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((part) => numberInRange(part, -256, 256));

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

export function isValidCuboid(value: unknown): value is Cuboid {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<Cuboid>;
  return typeof node.id === "string" && node.id.length > 0 && node.id.length <= 100 &&
    typeof node.name === "string" && node.name.length > 0 && node.name.length <= 100 &&
    vec(node.from) && vec(node.to) &&
    node.from.every((start, axis) => {
      const size = node.to![axis]! - start;
      return size > 0 && size <= 64;
    }) &&
    (node.material === "solid" || node.material === "texture") &&
    isHex(node.color) && isValidFaces(node.faces) &&
    typeof node.visible === "boolean" && typeof node.locked === "boolean";
}

/** Strict boundary validation: importing never trusts a TypeScript cast. */
export function parseDocument(input: unknown): EditorDocument {
  if (!input || typeof input !== "object") throw new Error("This is not a 3dMc project.");
  const value = input as Omit<Partial<EditorDocument>, "schemaVersion"> & {
    schemaVersion?: number;
  };
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)
    throw new Error("Unsupported project version. The original file was not changed.");
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 100 ||
      typeof value.name !== "string" || value.name.length < 1 || value.name.length > 100) {
    throw new Error("The project name or identifier is invalid.");
  }
  if (!value.target || value.target.edition !== "java" || value.target.family !== "static-block" ||
      !(value.target.candidateRelease === "1.21.4" || value.target.candidateRelease === "26.3") || value.target.status !== "unverified") {
    throw new Error("This project targets an unsupported prototype profile.");
  }
  const inputRecord = input as Record<string, unknown>;
  const isLegacy = value.schemaVersion !== 3;
  if (!isLegacy && Object.keys(inputRecord).some(key =>
    !["schemaVersion", "id", "name", "target", "cuboids", "groups", "palette", "textures", "activeTextureId"].includes(key)))
    throw new Error("Unsupported source document metadata cannot be silently removed.");

  if (!isLegacy) {
    if (value.target && Object.keys(value.target).some(key =>
      !["edition", "family", "candidateRelease", "status"].includes(key)))
      throw new Error("Unsupported target metadata cannot be silently removed.");
    if (Array.isArray(value.cuboids) && value.cuboids.some(node =>
      !node || typeof node !== "object" || Object.keys(node).some(key =>
        !["id", "name", "from", "to", "material", "color", "faces", "visible", "locked"].includes(key))))
      throw new Error("Unsupported cuboid metadata cannot be silently removed.");
  }
  const textures = isLegacy ? [inputRecord.texture] : inputRecord.textures;
  if (!Array.isArray(textures) || textures.length < 1 || textures.length > MAX_TEXTURE_SLOTS)
    throw new Error("A project requires 1–16 texture assets.");

  function validTexture(candidate: unknown): candidate is PixelTexture {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const t = candidate as Partial<PixelTexture>;
    return typeof t.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(t.id) &&
      typeof t.name === "string" && t.name.length > 0 && t.name.length <= 100 &&
      int(t.width) && int(t.height) &&
      t.width > 0 && t.height > 0 && t.width <= 64 && t.height <= 64 &&
      Array.isArray(t.pixels) && t.pixels.length === t.width * t.height * 4 &&
      t.pixels.every(n => int(n) && n >= 0 && n <= 255) &&
      Object.keys(candidate).every(key => [
        "id", "name", "width", "height", "pixels", "layers", "activeLayerId"
      ].includes(key)) && validRasterLayers(t as PixelTexture);
  }
  if (!textures.every(validTexture) ||
      new Set(textures.map(t => t.id)).size !== textures.length)
    throw new Error("Invalid texture pixels, IDs or duplicated texture assets.");

  const ids = new Set<string>(textures.map(t => t.id));
  const activeId = isLegacy ? "main" : inputRecord.activeTextureId;
  if (typeof activeId !== "string" || !ids.has(activeId))
    throw new Error("Active texture is missing from this project.");

  const cuboids = Array.isArray(value.cuboids) && value.cuboids.length <= 2000
    ? value.cuboids.map((node) => {
      if (!node || typeof node !== "object") return node;
      const item = node as Cuboid;
      const faces = value.schemaVersion === 1 ? createDefaultFaces("main") :
        value.schemaVersion === 2 && item.faces && typeof item.faces === "object"
          ? Object.fromEntries(FACE_DIRECTIONS.map((direction) => {
            const face = item.faces[direction];
            return [direction, { ...face, textureId: "main" }];
          })) as CuboidFaces
          : item.faces;
      return { ...item, faces };
    }) : null;
  if (!cuboids || !cuboids.every(isValidCuboid) ||
      new Set(cuboids.map(node => node.id)).size !== cuboids.length ||
      cuboids.some(node => FACE_DIRECTIONS.some(direction =>
        !ids.has(node.faces[direction].textureId))))
    throw new Error("Invalid cuboid data or dangling per-face texture references.");

  // Optional group metadata stays absent in older v3 source projects. Validate
  // all IDs and references before accepting any imported project or checkpoint.
  let groups: EditorGroup[] | undefined;
  if (inputRecord.groups !== undefined) {
    if (!Array.isArray(inputRecord.groups) || inputRecord.groups.length > 100)
      throw new Error("Source groups must be an array with at most 100 groups.");
    const usedGroupIds = new Set<string>();
    const usedMembers = new Set<string>();
    const cuboidIds = new Set(cuboids.map(node => node.id));
    groups = inputRecord.groups.map((raw: unknown) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
          Object.keys(raw).sort().join(",") !== "id,memberIds,name")
        throw new Error("Source group metadata has unknown or missing fields.");
      const item = raw as Record<string, unknown>;
      if (typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
          usedGroupIds.has(item.id))
        throw new Error("Source group IDs must be valid and unique.");
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 100)
        throw new Error("Source group names must have 1–100 characters.");
      const memberIds = item.memberIds;
      if (!Array.isArray(memberIds) || memberIds.length < 1 ||
          memberIds.some(id => typeof id !== "string" || !cuboidIds.has(id) ||
            usedMembers.has(id)) || new Set(memberIds).size !== memberIds.length)
        throw new Error("Source groups contain duplicated or missing cuboid references.");
      usedGroupIds.add(item.id);
      memberIds.forEach(id => usedMembers.add(id));
      return { id: item.id, name: item.name, memberIds: [...memberIds] };
    });
  }

  // Keep custom swatches optional for every existing v3 project. Reject
  // malformed or case-insensitively duplicated colors before replacing source.
  let palette: string[] | undefined;
  if (inputRecord.palette !== undefined) {
    if (!Array.isArray(inputRecord.palette) ||
        inputRecord.palette.length < 1 || inputRecord.palette.length > 16 ||
        inputRecord.palette.some(color => !isHex(color)) ||
        new Set(inputRecord.palette.map(color => color.toLowerCase())).size !== inputRecord.palette.length)
      throw new Error("Source palette requires 1–16 unique hex colors.");
    palette = [...inputRecord.palette];
  }

  return {
    schemaVersion: 3, id: value.id, name: value.name,
    target: { edition: "java", family: "static-block", candidateRelease: value.target.candidateRelease, status: "unverified" },
    cuboids: cuboids.map((node) => ({
      id: node.id, name: node.name,
      from: [...node.from] as [number, number, number],
      to: [...node.to] as [number, number, number],
      material: node.material, color: node.color,
      faces: copyFaces(node.faces), visible: node.visible, locked: node.locked
    })),
    textures: textures.map(t => ({
      id: t.id, name: t.name, width: t.width, height: t.height,
      pixels: [...t.pixels],
      ...(t.layers ? {
        layers: t.layers.map(layer => ({ ...layer, pixels: [...layer.pixels] })),
        activeLayerId: t.activeLayerId
      } : {})
    })),
    activeTextureId: activeId,
    ...(groups ? { groups } : {}),
    ...(palette ? { palette } : {})
  };
}

const base = (id: string, name: string, from: Vec3, to: Vec3, color: string,
  material: MaterialKind = "solid"): Cuboid =>
  ({ id, name, from, to, color, material, faces: createDefaultFaces(),
     visible: true, locked: false });

function lanternPixels(): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const rim = x < 3 || y < 3 || x >= 29 || y >= 29;
      const cross = x === 15 || x === 16 || y === 15 || y === 16;
      const glint = (x > 7 && x < 12 && y > 7 && y < 15);
      const warmth = ((x * 13 + y * 7) % 9);
      const rgb = rim ? [65, 96, 84] :
        cross ? [137, 110, 67] :
        glint ? [250, 218, 139] : [211 + warmth, 153 + warmth, 77 + warmth];
      pixels.push(rgb[0]!, rgb[1]!, rgb[2]!, 255);
    }
  }
  return pixels;
}

export function createSampleDocument(): EditorDocument {
  return {
    schemaVersion: 3,
    id: "starter-lantern",
    name: "Copper Lantern",
    target: { edition: "java", family: "static-block", candidateRelease: "1.21.4", status: "unverified" },
    cuboids: [
      base("body", "Lantern body", [3, 3, 3], [13, 12, 13], "#ffffff", "texture"),
      base("base", "Foundation", [2, 1, 2], [14, 3, 14], "#637e70"),
      base("roof", "Canopy", [2, 12, 2], [14, 14, 14], "#8ca794"),
      base("crown", "Top plate", [5, 14, 5], [11, 15, 11], "#b6c1ab"),
      base("handle-left", "Handle · left", [6, 15, 6], [7, 18, 7], "#b5c5b9"),
      base("handle-top", "Handle · bridge", [6, 17, 6], [10, 18, 7], "#b5c5b9"),
      base("handle-right", "Handle · right", [9, 15, 6], [10, 18, 7], "#b5c5b9")
    ],
    textures: [{ id: "main", name: "lantern.png", width: 32, height: 32, pixels: lanternPixels() }],
    activeTextureId: "main"
  };
}

export function updateCuboid(
  document: EditorDocument, id: string, mutate: (node: Cuboid) => Cuboid
): EditorDocument {
  const index = document.cuboids.findIndex((node) => node.id === id);
  if (index < 0) return document;
  const original = document.cuboids[index]!;
  if (original.locked) return document;
  const changed = mutate(original);
  if (changed === original || !isValidCuboid(changed)) return document;
  return { ...document, cuboids: document.cuboids.map((node, i) => i === index ? changed : node) };
}

export function setAxisValue(
  doc: EditorDocument, id: string, property: "position" | "size", axis: Axis, value: number
): EditorDocument {
  if (!Number.isFinite(value)) return doc;
  return updateCuboid(doc, id, (node) => {
    const from = [...node.from] as [number, number, number];
    const to = [...node.to] as [number, number, number];
    if (property === "size") {
      if (value <= 0 || value > 64 || value === to[axis] - from[axis]) return node;
      to[axis] = from[axis] + value;
    } else {
      const delta = value - from[axis];
      if (delta === 0) return node;
      from[axis] += delta;
      to[axis] += delta;
    }
    return { ...node, from, to };
  });
}

export function addCuboid(doc: EditorDocument, id: string): EditorDocument {
  if (doc.cuboids.some((node) => node.id === id) || doc.cuboids.length >= 2000) return doc;
  return { ...doc, cuboids: [...doc.cuboids, { ...base(id, "New element", [5, 5, 5], [11, 11, 11], "#8ca794"),
    faces: createDefaultFaces(doc.activeTextureId) }] };
}

export function duplicateCuboid(doc: EditorDocument, id: string, newId: string): EditorDocument {
  const source = doc.cuboids.find((node) => node.id === id);
  if (!source || doc.cuboids.some((node) => node.id === newId) || doc.cuboids.length >= 2000) return doc;
  return { ...doc, cuboids: [...doc.cuboids, {
    ...source, id: newId, name: source.name + " copy", locked: false,
    from: [...source.from] as [number, number, number], to: [...source.to] as [number, number, number],
    faces: copyFaces(source.faces)
  }] };
}

/** Remove deleted cuboids from every group, dropping groups that become empty. */
export function pruneGroupMembers(groups: readonly EditorGroup[] | undefined,
                                  removed: ReadonlySet<string>): EditorGroup[] | undefined {
  if (!groups) return undefined;
  return groups.map(group => ({
    ...group, memberIds: group.memberIds.filter(id => !removed.has(id))
  })).filter(group => group.memberIds.length > 0);
}

export function deleteCuboid(doc: EditorDocument, id: string): EditorDocument {
  const node = doc.cuboids.find((item) => item.id === id);
  if (!node || node.locked) return doc;
  return { ...doc, cuboids: doc.cuboids.filter((item) => item.id !== id),
    ...(doc.groups ? { groups: pruneGroupMembers(doc.groups, new Set([id])) } : {})
  };
}

export function renameCuboid(doc: EditorDocument, id: string, name: string): EditorDocument {
  const next = name.trim().slice(0, 100);
  if (!next) return doc;
  return updateCuboid(doc, id, (node) => node.name === next ? node : { ...node, name: next });
}

export function setMaterialColor(doc: EditorDocument, id: string, color: string): EditorDocument {
  if (!isHex(color)) return doc;
  return updateCuboid(doc, id, (node) => node.color === color ? node : { ...node, color });
}

export function toggleFlag(doc: EditorDocument, id: string, field: "visible" | "locked"): EditorDocument {
  if (!doc.cuboids.some((node) => node.id === id)) return doc;
  return { ...doc, cuboids: doc.cuboids.map((node) => node.id === id
    ? { ...node, [field]: !node[field] } : node) };
}

export function setTexturePixels(
  doc: EditorDocument, pixels: number[], textureId = doc.activeTextureId
): EditorDocument {
  const t = textureById(doc, textureId);
  if (!t || pixels.length !== t.pixels.length ||
      !pixels.every(n => int(n) && n >= 0 && n <= 255)) return doc;
  if (pixels.every((value, i) => value === t.pixels[i])) return doc;
  if (t.layers) throw new Error(
    "This texture has editable layers. Flatten them explicitly before replacing the entire RGBA sheet."
  );
  return { ...doc, textures: doc.textures.map(item =>
    item.id === textureId ? { ...item, pixels: [...pixels] } : item) };
}

export function renameProject(doc: EditorDocument, name: string): EditorDocument {
  const next = name.trim().slice(0, 100);
  return next && next !== doc.name ? { ...doc, name: next } : doc;
}

/** Target changes are document edits; older candidate projects still open unchanged. */
export function setJavaCandidateRelease(doc: EditorDocument, release: "1.21.4" | "26.3"): EditorDocument {
  return doc.target.candidateRelease === release ? doc :
    { ...doc, target: { ...doc.target, candidateRelease: release, status: "unverified" } };
}

/** One face property commit is one reversible document operation. */
export function updateFaceUV(
  document: EditorDocument, id: string, face: FaceDirection,
  field: 0 | 1 | 2 | 3, value: number
): EditorDocument {
  if (!Number.isFinite(value) || value < 0 || value > 16) return document;
  return updateCuboid(document, id, (node) => {
    const current = node.faces[face];
    if (current.uv[field] === value) return node;
    const uv = [...current.uv] as [number, number, number, number];
    uv[field] = value;
    const nextFace: FaceUV = { ...current, uv };
    const next = { ...node, faces: { ...node.faces, [face]: nextFace } };
    return isValidCuboid(next) ? next : node;
  });
}

export function updateFaceRotation(
  document: EditorDocument, id: string, face: FaceDirection, rotation: FaceRotation
): EditorDocument {
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return document;
  return updateCuboid(document, id, (node) => {
    const current = node.faces[face];
    return current.rotation === rotation ? node :
      { ...node, faces: { ...node.faces, [face]: { ...current, rotation } } };
  });
}


/** A clicked texture changes the paint target without changing its pixels. */
export function selectTexture(doc: EditorDocument, id: string): EditorDocument {
  return !textureById(doc, id) || doc.activeTextureId === id ? doc :
    { ...doc, activeTextureId: id };
}

export function renameTexture(doc: EditorDocument, id: string, name: string): EditorDocument {
  const label = name.trim().slice(0, 100);
  if (!label || !textureById(doc, id) || textureById(doc, id)?.name === label) return doc;
  return { ...doc, textures: doc.textures.map(t => t.id === id ? { ...t, name: label } : t) };
}

export function addTexture(doc: EditorDocument, texture: PixelTexture): EditorDocument {
  if (doc.textures.length >= MAX_TEXTURE_SLOTS ||
      doc.textures.some(t => t.id === texture.id)) return doc;
  try { return parseDocument({
    ...doc, textures: [...doc.textures, texture], activeTextureId: texture.id
  }); } catch { return doc; }
}

export function assignFaceTexture(
  doc: EditorDocument, nodeId: string, face: FaceDirection, textureId: string
): EditorDocument {
  if (!textureById(doc, textureId)) return doc;
  return updateCuboid(doc, nodeId, node => node.faces[face].textureId === textureId
    ? node : { ...node, faces: { ...node.faces,
      [face]: { ...node.faces[face], textureId } } });
}

export function affectedFaces(doc: EditorDocument, textureId: string):
  Array<{ nodeId: string; name: string; face: FaceDirection }> {
  return doc.cuboids.flatMap(node => FACE_DIRECTIONS.filter(face =>
    node.faces[face].textureId === textureId).map(face => ({
      nodeId: node.id, name: node.name, face
    })));
}

/** The caller shows impacted faces and chooses a destination before deleting. */
export function removeTexture(doc: EditorDocument, id: string, replacementId: string): EditorDocument {
  if (doc.textures.length <= 1 || id === replacementId ||
      !textureById(doc, id) || !textureById(doc, replacementId)) return doc;
  return {
    ...doc, textures: doc.textures.filter(t => t.id !== id),
    activeTextureId: doc.activeTextureId === id ? replacementId : doc.activeTextureId,
    cuboids: doc.cuboids.map(node => ({
      ...node,
      faces: Object.fromEntries(FACE_DIRECTIONS.map(face => [face,
        node.faces[face].textureId === id
          ? { ...node.faces[face], textureId: replacementId } : node.faces[face]
      ])) as CuboidFaces
    }))
  };
}

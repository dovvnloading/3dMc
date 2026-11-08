/**
 * Canonical, renderer-independent S0 document. This is a deliberately narrow
 * native schema and NOT a complete Java/Bedrock model representation.
 * Its JSON export uses .3dmc.json until the versioned ZIP codec is implemented.
 */
export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;
export type MaterialKind = "solid" | "texture";

export interface Cuboid {
  id: string;
  name: string;
  from: Vec3;
  to: Vec3;
  material: MaterialKind;
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface PixelTexture {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Straight RGBA, top-left origin. Not serialized as a GPU object. */
  pixels: number[];
}

export interface EditorDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  target: {
    edition: "java";
    family: "static-block";
    candidateRelease: "1.21.4" | "26.3";
    status: "unverified";
  };
  cuboids: Cuboid[];
  texture: PixelTexture;
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
    isHex(node.color) && typeof node.visible === "boolean" && typeof node.locked === "boolean";
}

/** Strict boundary validation: importing never trusts a TypeScript cast. */
export function parseDocument(input: unknown): EditorDocument {
  if (!input || typeof input !== "object") throw new Error("This is not a 3dMc project.");
  const value = input as Partial<EditorDocument>;
  if (value.schemaVersion !== 1) throw new Error("Unsupported project version. The original file was not changed.");
  if (typeof value.id !== "string" || value.id.length < 1 || value.id.length > 100 ||
      typeof value.name !== "string" || value.name.length < 1 || value.name.length > 100) {
    throw new Error("The project name or identifier is invalid.");
  }
  if (!value.target || value.target.edition !== "java" || value.target.family !== "static-block" ||
      !(value.target.candidateRelease === "1.21.4" || value.target.candidateRelease === "26.3") || value.target.status !== "unverified") {
    throw new Error("This project targets an unsupported prototype profile.");
  }
  if (!Array.isArray(value.cuboids) || value.cuboids.length > 2000 ||
      !value.cuboids.every(isValidCuboid) ||
      new Set(value.cuboids.map((item) => item.id)).size !== value.cuboids.length) {
    throw new Error("The project contains invalid or duplicate cuboids.");
  }
  const texture = value.texture as Partial<PixelTexture> | undefined;
  if (!texture || texture.id !== "main" || typeof texture.name !== "string" ||
      texture.name.length < 1 || texture.name.length > 100 ||
      !int(texture.width) || !int(texture.height) ||
      texture.width < 1 || texture.height < 1 ||
      texture.width > 64 || texture.height > 64 ||
      !Array.isArray(texture.pixels) ||
      texture.pixels.length !== texture.width * texture.height * 4 ||
      !texture.pixels.every((part) => int(part) && part >= 0 && part <= 255)) {
    throw new Error("The texture is invalid or exceeds the 64×64 prototype limit.");
  }
  // Reconstruct only known fields. Prototypes, unknown metadata and forged
  // rendering objects never enter the live document.
  return {
    schemaVersion: 1, id: value.id, name: value.name,
    target: { edition: "java", family: "static-block", candidateRelease: value.target.candidateRelease, status: "unverified" },
    cuboids: value.cuboids.map((node) => ({
      id: node.id, name: node.name, from: [...node.from] as [number, number, number], to: [...node.to] as [number, number, number],
      material: node.material, color: node.color, visible: node.visible, locked: node.locked
    })),
    texture: { id: "main", name: texture.name, width: texture.width,
      height: texture.height, pixels: [...texture.pixels] }
  };
}

const base = (id: string, name: string, from: Vec3, to: Vec3, color: string,
  material: MaterialKind = "solid"): Cuboid =>
  ({ id, name, from, to, color, material, visible: true, locked: false });

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
    schemaVersion: 1,
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
    texture: { id: "main", name: "lantern.png", width: 32, height: 32, pixels: lanternPixels() }
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
  return { ...doc, cuboids: [...doc.cuboids, base(id, "New element", [5, 5, 5], [11, 11, 11], "#8ca794")] };
}

export function duplicateCuboid(doc: EditorDocument, id: string, newId: string): EditorDocument {
  const source = doc.cuboids.find((node) => node.id === id);
  if (!source || doc.cuboids.some((node) => node.id === newId) || doc.cuboids.length >= 2000) return doc;
  return { ...doc, cuboids: [...doc.cuboids, {
    ...source, id: newId, name: source.name + " copy", locked: false,
    from: [...source.from] as [number, number, number], to: [...source.to] as [number, number, number]
  }] };
}

export function deleteCuboid(doc: EditorDocument, id: string): EditorDocument {
  const node = doc.cuboids.find((item) => item.id === id);
  if (!node || node.locked) return doc;
  return { ...doc, cuboids: doc.cuboids.filter((item) => item.id !== id) };
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

export function setTexturePixels(doc: EditorDocument, pixels: number[]): EditorDocument {
  if (pixels.length !== doc.texture.pixels.length ||
      !pixels.every((value) => int(value) && value >= 0 && value <= 255)) return doc;
  if (pixels.every((pixel, index) => pixel === doc.texture.pixels[index])) return doc;
  return { ...doc, texture: { ...doc.texture, pixels: [...pixels] } };
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

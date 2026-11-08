import { FACE_DIRECTIONS, parseDocument } from "../editor/domain";
import type { Cuboid, CuboidFaces, EditorDocument, FaceRotation, FaceUVRect, PixelTexture, Vec3 } from "../editor/domain";
import { parseStrictJson } from "./strictJson";

export interface LocalModelSource { readonly resource: string; readonly text: string; }
export interface LocalTextureSource { readonly resource: string; readonly image: Pick<PixelTexture, "width" | "height" | "pixels">; }
export interface ExternalModelPlan {
  readonly root: string;
  readonly chain: readonly string[];
  readonly textures: readonly string[];
  readonly elements: readonly { from: Vec3; to: Vec3; faces: Record<string, { uv: FaceUVRect; rotation: FaceRotation; resource: string }> }[];
  readonly unusedModels: readonly string[];
  readonly notices: readonly string[];
}
export interface ExternalModelImport {
  readonly document: EditorDocument;
  readonly plan: ExternalModelPlan;
  readonly unusedTextures: readonly string[];
}
const fail = (path: string, message: string): never => { throw new Error(`${path}: ${message}`); };
function object(value: unknown, path: string, permitted?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(path, "Expected an object.");
  const record = value as Record<string, unknown>;
  if (permitted) for (const key of Object.keys(record)) if (!permitted.includes(key))
    fail(path, `Unsupported field “${key}”. It would not survive editable import, so the model is blocked.`);
  return record;
}
export function resourceId(value: string): string {
  const canonical = value.includes(":") ? value : "minecraft:" + value;
  if (canonical.length > 200 || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(canonical))
    throw new Error(`Invalid local resource identifier “${value}”. Use namespace:path without an extension.`);
  const path = canonical.split(":")[1]!;
  if (path.startsWith("/") || path.endsWith("/") || path.split("/").some(segment => !segment || segment === "." || segment === "..") || /\.(json|png)$/i.test(path))
    throw new Error(`Unsafe or ambiguous local resource identifier “${value}”.`);
  return canonical;
}
function coordinates(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || value.some(n => typeof n !== "number" || !Number.isFinite(n) || n < -16 || n > 32))
    return fail(path, "Expected three finite Java coordinates within −16…32.");
  return [...value] as unknown as Vec3;
}

/** Pure preflight. No network, filesystem traversal, workspace replacement or guessed resources. */
export function inspectExternalModel(sources: readonly LocalModelSource[], root: string): ExternalModelPlan {
  if (sources.length < 1 || sources.length > 16) throw new Error("Choose 1–16 local model JSON files.");
  if (sources.reduce((sum, source) => sum + new TextEncoder().encode(source.text).length, 0) > 4_000_000)
    throw new Error("Local model sources exceed the 4 MB combined budget.");
  const models = new Map<string, Record<string, unknown>>();
  for (const source of sources) {
    const id = resourceId(source.resource);
    if (models.has(id)) fail(id, "Two files have the same resource identifier. Assign distinct identifiers.");
    models.set(id, object(parseStrictJson(source.text, id), id, ["parent", "textures", "elements", "ambientocclusion"]));
  }
  const canonicalRoot = resourceId(root), chain: string[] = [], visited = new Set<string>();
  let cursor: string | null = canonicalRoot;
  while (cursor) {
    if (visited.has(cursor)) fail(cursor, "Parent cycle detected. No model was imported.");
    if (chain.length >= 16) fail(cursor, "Parent chain exceeds 16 local models.");
    const model = models.get(cursor);
    if (!model) fail(cursor, "Missing local parent/model. Supply that JSON with its exact resource identifier; nothing is fetched from the network.");
    visited.add(cursor); chain.push(cursor);
    if (model.ambientocclusion !== undefined && model.ambientocclusion !== true)
      fail(cursor, "Only omitted or true ambientocclusion is representable by this profile.");
    if (model.parent !== undefined && typeof model.parent !== "string") fail(cursor, "parent must be a resource identifier string.");
    cursor = typeof model.parent === "string" ? resourceId(model.parent) : null;
  }
  const aliases = new Map<string, string>();
  let rawElements: unknown;
  for (const id of [...chain].reverse()) {
    const model = models.get(id)!;
    if (model.textures !== undefined) {
      const textures = object(model.textures, id + ":textures");
      if (Object.keys(textures).length > 128) fail(id, "Texture alias count exceeds 128.");
      for (const [alias, value] of Object.entries(textures)) {
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(alias) || typeof value !== "string" || value.length > 200)
          fail(id + ":textures", "Invalid texture alias or resource value.");
        aliases.set(alias, value);
      }
    }
    if (model.elements !== undefined) rawElements = model.elements;
  }
  if (!Array.isArray(rawElements) || rawElements.length < 1 || rawElements.length > 256)
    fail(canonicalRoot, "The resolved model must contain 1–256 explicit cuboid elements.");
  const resolve = (value: unknown, path: string): string => {
    if (typeof value !== "string") return fail(path, "A texture alias or resource identifier is required.");
    let current = value; const seen = new Set<string>();
    while (current.startsWith("#")) {
      const alias = current.slice(1);
      if (seen.has(alias)) return fail(path, `Texture alias cycle at #${alias}.`);
      if (seen.size >= 128) return fail(path, "Texture alias chain is too deep.");
      seen.add(alias);
      const next = aliases.get(alias);
      if (next === undefined) return fail(path, `Missing texture alias #${alias}.`);
      current = next;
    }
    return resourceId(current);
  };
  // Check all declared aliases, including unused ones, rather than hiding broken dependencies.
  for (const alias of aliases.keys()) resolve("#" + alias, canonicalRoot + ":textures");
  const used = new Set<string>();
  if (aliases.has("particle")) used.add(resolve("#particle", canonicalRoot + ":particle"));
  const elements = rawElements.map((raw, index) => {
    const path = `${canonicalRoot}:element[${index}]`;
    const element = object(raw, path, ["from", "to", "faces"]);
    const from = coordinates(element.from, path + ":from"), to = coordinates(element.to, path + ":to");
    if (from.some((value, axis) => value >= to[axis]!)) fail(path, "Every cuboid dimension must be positive.");
    const rawFaces = object(element.faces, path + ":faces", FACE_DIRECTIONS);
    const faces: Record<string, { uv: FaceUVRect; rotation: FaceRotation; resource: string }> = Object.create(null);
    for (const direction of FACE_DIRECTIONS) {
      const facePath = path + ":" + direction;
      const face = object(rawFaces[direction], facePath, ["uv", "texture", "rotation"]);
      const uv = face.uv;
      if (!Array.isArray(uv) || uv.length !== 4 || uv.some(n => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 16) || uv[0] === uv[2] || uv[1] === uv[3])
        fail(facePath, "Each of the six faces needs an explicit, nonzero UV rectangle within 0–16; implicit UVs are not guessed.");
      const rotation = face.rotation ?? 0;
      if (![0, 90, 180, 270].includes(rotation as number)) fail(facePath, "Only quarter-turn face rotations are supported.");
      const resource = resolve(face.texture, facePath); used.add(resource);
      faces[direction] = { uv: [...uv] as unknown as FaceUVRect, rotation: rotation as FaceRotation, resource };
    }
    return { from, to, faces };
  });
  if (used.size > 16) fail(canonicalRoot, "The resolved model uses more than 16 texture sheets.");
  const notices = [
    "This imports a resolved editable copy, not the original resource-pack structure. Original files are never modified.",
    "Export creates the existing experimental diamond-block replacement; source namespaces, blockstates, parent links and filenames are not an export contract.",
    "Explicit six-face UVs, supported quarter-turns, cuboid coordinates and decoded RGBA pixels are retained. Game appearance is not verified."
  ];
  if (chain.length > 1) notices.push(`The ${chain.length}-model parent chain will be resolved into standalone elements. Download the original-source bundle to retain editable parent files.`);
  if (!aliases.has("particle")) notices.push("No particle alias was supplied. The generated pack will use the first referenced texture for particles.");
  return { root: canonicalRoot, chain, textures: [...used], elements,
    unusedModels: [...models.keys()].filter(id => !visited.has(id)), notices };
}

export function materializeExternalModel(plan: ExternalModelPlan, images: readonly LocalTextureSource[],
  projectId: string, name: string): ExternalModelImport {
  if (images.length > 16) throw new Error("At most 16 local texture bindings are accepted.");
  const bound = new Map<string, LocalTextureSource>();
  for (const entry of images) {
    const id = resourceId(entry.resource);
    if (bound.has(id)) fail(id, "Duplicate texture resource binding.");
    bound.set(id, entry);
  }
  const textureIds = new Map<string, string>();
  const textures: PixelTexture[] = plan.textures.map((resource, index) => {
    const binding = bound.get(resource); if (!binding) return fail(resource, "Missing PNG binding. Choose the exact local image before importing.");
    const image = binding.image;
    if (!Number.isSafeInteger(image.width) || image.width < 1 || image.width > 64 || image.width !== image.height || (image.width & (image.width - 1)) !== 0)
      fail(resource, "This import profile requires a square power-of-two PNG no larger than 64×64. No scaling is performed.");
    const id = index === 0 ? "main" : "external_" + index; textureIds.set(resource, id);
    return { id, name: resource.slice(-100), width: image.width, height: image.height, pixels: [...image.pixels] };
  });
  const cuboids: Cuboid[] = plan.elements.map((element, index) => ({
    id: "external-part-" + index, name: "Imported part " + String(index + 1).padStart(2, "0"),
    from: element.from, to: element.to, material: "texture", color: "#ffffff", visible: true, locked: false,
    faces: Object.fromEntries(FACE_DIRECTIONS.map(direction => {
      const face = element.faces[direction]!;
      return [direction, { uv: [...face.uv], rotation: face.rotation, textureId: textureIds.get(face.resource)! }];
    })) as CuboidFaces
  }));
  const document = parseDocument({ schemaVersion: 3, id: projectId, name: name.trim().slice(0, 100) || "Imported block model",
    target: { edition: "java", family: "static-block", candidateRelease: "1.21.4", status: "unverified" },
    cuboids, textures, activeTextureId: "main" });
  return { document, plan, unusedTextures: [...bound.keys()].filter(id => !plan.textures.includes(id)) };
}

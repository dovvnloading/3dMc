
import { parseDocument } from "../editor/domain";
import { FACE_DIRECTIONS } from "../editor/domain";
import type { Cuboid, CuboidFaces, EditorDocument, FaceRotation, FaceUV, Vec3 } from "../editor/domain";
import { inspectJava1214, JAVA_PACK_PATHS, RESOURCE_PACK_FORMAT } from "../export/javaBlock";
import { read3dMcRgbaPng } from "./strictPng";
import { read3dMcStoredZip } from "./storedZip";

export type PackImportReport =
  | { status: "editable"; document: EditorDocument; paths: string[]; notices: string[] }
  | { status: "blocked"; problems: string[] };

const DECODER = new TextDecoder("utf-8", { fatal: true });
const FACES = FACE_DIRECTIONS;

function fail(path: string, message: string): never {
  throw new Error(path + ": " + message);
}

function asObject(value: unknown, path: string, permitted: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "Expected an object.");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!permitted.includes(key)) fail(path, "Unsupported field: " + key + ".");
  }
  return record;
}

function requiredKeys(value: Record<string, unknown>, path: string, keys: readonly string[]): void {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(path, "Missing required field: " + key + ".");
  }
}

function json(bytes: Uint8Array, path: string): unknown {
  try { return JSON.parse(DECODER.decode(bytes)) as unknown; }
  catch { return fail(path, "File is not valid UTF-8 JSON."); }
}

function vec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    fail(path, "Expected three finite coordinates.");
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function hexChannel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function inspectOwnExport(files: Map<string, Uint8Array>): EditorDocument {
  const get = (name: string): Uint8Array => {
    const file = files.get(name);
    if (!file) fail(name, "Required pack file is missing.");
    return file;
  };

  const meta = asObject(json(get(JAVA_PACK_PATHS.metadata), JAVA_PACK_PATHS.metadata),
    "pack.mcmeta", ["pack"]);
  requiredKeys(meta, "pack.mcmeta", ["pack"]);
  const pack = asObject(meta.pack, "pack.mcmeta:pack", ["pack_format", "description"]);
  requiredKeys(pack, "pack.mcmeta:pack", ["pack_format", "description"]);
  if (pack.pack_format !== RESOURCE_PACK_FORMAT || typeof pack.description !== "string" ||
      pack.description !== "3dMc experimental block visual - Java Edition 1.21.4") {
    fail("pack.mcmeta", "This is not a 3dMc Java 1.21.4 experimental export (format 46).");
  }

  const blockstate = asObject(json(get(JAVA_PACK_PATHS.blockstate), JAVA_PACK_PATHS.blockstate),
    "blockstates/diamond_block.json", ["variants"]);
  requiredKeys(blockstate, "blockstates", ["variants"]);
  const variants = asObject(blockstate.variants, "blockstates:variants", [""]);
  requiredKeys(variants, "blockstates:variants", [""]);
  const variant = asObject(variants[""], "blockstates:variant", ["model"]);
  if (variant.model !== "3dmc:block/lantern")
    fail("blockstates", "The diamond-block variant must reference 3dmc:block/lantern.");

  const model = asObject(json(get(JAVA_PACK_PATHS.model), JAVA_PACK_PATHS.model),
    "models/block/lantern.json", ["ambientocclusion", "textures", "elements"]);
  requiredKeys(model, "models/block/lantern.json", ["ambientocclusion", "textures", "elements"]);
  if (model.ambientocclusion !== true)
    fail("models/block/lantern.json", "Unsupported model ambient occlusion setting.");
  if (!Array.isArray(model.elements) || model.elements.length < 1 || model.elements.length > 256)
    fail("models/block/lantern.json", "Expected 1–256 cuboids.");

  const textures = asObject(model.textures, "model:textures", [
    "particle", "painted",
    ...Array.from({ length: 256 }, (_, i) => "solid_" + i)
  ]);
  if (textures.particle !== "3dmc:block/main" || textures.painted !== "3dmc:block/main")
    fail("model:textures", "Shared texture references must use 3dmc:block/main.");

  const main = read3dMcRgbaPng(get(JAVA_PACK_PATHS.mainTexture));
  const nodes: Cuboid[] = [];
  const referencedSolids = new Set<string>();

  for (let index = 0; index < model.elements.length; index++) {
    const record = asObject(model.elements[index], "element " + index, ["from", "to", "faces"]);
    requiredKeys(record, "element " + index, ["from", "to", "faces"]);
    const from = vec3(record.from, "element " + index + ":from");
    const to = vec3(record.to, "element " + index + ":to");
    const faces = asObject(record.faces, "element " + index + ":faces", FACES);
    requiredKeys(faces, "element " + index + ":faces", FACES);

    let textureKey: string | null = null;
    const faceData: Partial<CuboidFaces> = {};
    for (const face of FACES) {
      const binding = asObject(faces[face], "element " + index + ":" + face,
        ["texture", "uv", "rotation"]);
      requiredKeys(binding, "element " + index + ":" + face, ["texture", "uv"]);
      if (!Array.isArray(binding.uv) || binding.uv.length !== 4 ||
          binding.uv.some((n: unknown) => typeof n !== "number" ||
            !Number.isFinite(n) || n < 0 || n > 16) ||
          binding.uv[0] === binding.uv[2] || binding.uv[1] === binding.uv[3]) {
        fail("element " + index + ":" + face,
          "This face needs a nonzero UV rectangle within logical 0–16 coordinates.");
      }
      const rotation = binding.rotation ?? 0;
      if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
        fail("element " + index + ":" + face,
          "Supported Java face rotations are 0°, 90°, 180° and 270°.");
      if (typeof binding.texture !== "string")
        fail("element " + index + ":" + face, "Texture reference is missing.");
      if (textureKey === null) textureKey = binding.texture;
      if (binding.texture !== textureKey)
        fail("element " + index + ":" + face, "Different per-face textures are not yet editable.");
      faceData[face] = {
        uv: [...binding.uv] as [number, number, number, number],
        rotation: rotation as FaceRotation
      } satisfies FaceUV;
    }
    const painted = textureKey === "#painted";
    const expectedSolidKey = "#solid_" + index;
    if (!painted && textureKey !== expectedSolidKey)
      fail("element " + index, "Only the generated shared or per-element solid texture references are supported.");

    let color = "#ffffff";
    if (!painted) {
      const resource = "assets/3dmc/textures/block/solid_" + index + ".png";
      const alias = "solid_" + index;
      if (textures[alias] !== "3dmc:block/solid_" + index)
        fail("model:textures", "Expected a generated solid texture alias: " + alias);
      const solid = read3dMcRgbaPng(get(resource));
      if (solid.width !== 1 || solid.height !== 1 || solid.pixels[3] !== 255)
        fail(resource, "A solid-color texture must be one opaque pixel.");
      color = "#" + solid.pixels.slice(0, 3).map(hexChannel).join("");
      referencedSolids.add(resource);
    }
    nodes.push({
      id: "pack-element-" + index,
      name: "Imported cuboid " + String(index + 1).padStart(2, "0"),
      from, to, color, faces: faceData as CuboidFaces,
      material: painted ? "texture" : "solid",
      visible: true, locked: false
    });
  }

  const expectedAliases = new Set([
    "painted", "particle", ...nodes.map((node, index) =>
      node.material === "solid" ? "solid_" + index : "").filter(Boolean)
  ]);
  for (const key of Object.keys(textures)) {
    if (!expectedAliases.has(key)) fail("model:textures", "Unused texture mapping was found: " + key);
  }

  const expectedPaths = new Set<string>([
    JAVA_PACK_PATHS.metadata, JAVA_PACK_PATHS.blockstate,
    JAVA_PACK_PATHS.model, JAVA_PACK_PATHS.mainTexture,
    ...referencedSolids
  ]);
  for (const path of files.keys()) {
    if (!expectedPaths.has(path)) fail(path, "Unused resources cannot be retained safely by this editor.");
  }

  if (main.pixels.some((value, i) => i % 4 === 3 && value !== 255))
    fail(JAVA_PACK_PATHS.mainTexture, "The experimental editor only supports opaque source pixels.");

  let result: EditorDocument;
  try {
    result = parseDocument({
      schemaVersion: 2,
      id: "imported-java-1214-diamond-block",
      name: "Imported diamond block",
      target: { edition: "java", family: "static-block", candidateRelease: "1.21.4", status: "unverified" },
      cuboids: nodes,
      texture: { id: "main", name: "main.png", ...main }
    });
  } catch (error) {
    fail("models/block/lantern.json",
      error instanceof Error ? error.message : "The document cannot be edited safely.");
  }
  const blocking = inspectJava1214(result).filter((issue) => issue.severity === "error");
  if (blocking.length) fail("compatibility", blocking.map((issue) => issue.message).join(" "));
  return result;
}

/**
 * Preflight only. Never mutates the live document, and never silently flattens
 * unknown data. Current support is the precise 3dMc-authored experimental
 * model/texture resource set, not arbitrary vanilla/third-party packs.
 */
export function inspectJava1214Pack(bytes: Uint8Array): PackImportReport {
  try {
    const files = read3dMcStoredZip(bytes);
    const document = inspectOwnExport(files);
    return {
      status: "editable",
      document,
      paths: Array.from(files.keys()),
      notices: [
        "The generated geometry and opaque texture pixels are editable and re-exportable.",
        "Java resource packs do not retain native part names, visibility, locks, or undo history; these values will be newly initialized.",
        "The six explicit face UV rectangles and quarter-turn rotations can be edited and re-exported; parent models, animations, and unrelated resources remain unsupported.",
        "Rendering compatibility in Minecraft 1.21.4 has not been verified."
      ]
    };
  } catch (error) {
    return {
      status: "blocked",
      problems: [error instanceof Error ? error.message : "Pack import failed validation."]
    };
  }
}

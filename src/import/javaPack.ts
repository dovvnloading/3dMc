
import { parseDocument } from "../editor/domain";
import { FACE_DIRECTIONS } from "../editor/domain";
import type { Cuboid, CuboidFaces, EditorDocument, FaceRotation, FaceUV, Vec3 } from "../editor/domain";
import { inspectJava1214, JAVA_PACK_PATHS, MIN_JAVA_TEXTURE_SIZE, RESOURCE_PACK_FORMAT } from "../export/javaBlock";
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

function inspectOwnExport(files: Map<string, Uint8Array>): { document: EditorDocument; legacySolids: boolean } {
  const get = (path: string) => {
    const bytes = files.get(path);
    if (!bytes) fail(path, "Required resource is missing.");
    return bytes;
  };
  const meta = asObject(json(get(JAVA_PACK_PATHS.metadata), "pack.mcmeta"), "pack.mcmeta", ["pack"]);
  requiredKeys(meta, "pack.mcmeta", ["pack"]);
  const pack = asObject(meta.pack, "pack.mcmeta:pack", ["pack_format", "description"]);
  requiredKeys(pack, "pack.mcmeta:pack", ["pack_format", "description"]);
  if (pack.pack_format !== RESOURCE_PACK_FORMAT ||
      pack.description !== "3dMc experimental block visual - Java Edition 1.21.4")
    fail("pack.mcmeta", "Not a 3dMc Java 1.21.4 experimental block pack.");

  const blockstate = asObject(json(get(JAVA_PACK_PATHS.blockstate), "blockstates"), "blockstates", ["variants"]);
  const variants = asObject(blockstate.variants, "variants", [""]);
  const variant = asObject(variants[""], "variant", ["model"]);
  if (variant.model !== "3dmc:block/lantern")
    fail("blockstates", "Unsupported model reference.");

  const model = asObject(json(get(JAVA_PACK_PATHS.model), "model"), "model",
    ["ambientocclusion","textures","elements"]);
  requiredKeys(model, "model", ["ambientocclusion","textures","elements"]);
  if (model.ambientocclusion !== true ||
      !Array.isArray(model.elements) || model.elements.length < 1 ||
      model.elements.length > 256)
    fail("model", "Expected 1–256 cuboids with ambient occlusion.");

  // Packed PNGs are enumerated explicitly. The supported aliases and paths
  // must be dense and deterministic, so a misspelled or orphaned image blocks.
  const extra = [...files.keys()].filter(p =>
    /^assets\/3dmc\/textures\/block\/tex_[1-9][0-9]*\.png$/.test(p));
  if (extra.length > 15) fail("textures", "At most 16 source textures are supported.");
  const sourceTextures: Array<{id:string;name:string;width:number;height:number;pixels:number[]}> = [];
  const main = read3dMcRgbaPng(get(JAVA_PACK_PATHS.mainTexture));
  sourceTextures.push({ id:"main", name:"main.png", ...main });
  const expectedPaths = new Set<string>([
    JAVA_PACK_PATHS.metadata, JAVA_PACK_PATHS.blockstate,
    JAVA_PACK_PATHS.model, JAVA_PACK_PATHS.mainTexture
  ]);
  for (let i = 1; i <= extra.length; i++) {
    const path = "assets/3dmc/textures/block/tex_" + i + ".png";
    expectedPaths.add(path);
    const png = read3dMcRgbaPng(get(path));
    sourceTextures.push({ id:"texture_" + i, name:"texture_" + i + ".png", ...png });
  }

  const aliasKeys = ["particle", "painted",
    ...sourceTextures.slice(1).map((_,i) => "painted_" + (i + 1)),
    ...model.elements.map((_,index) => "solid_" + index)
  ];
  const textures = asObject(model.textures, "model:textures", aliasKeys);
  for (let i = 0; i < sourceTextures.length; i++) {
    const key = i === 0 ? "painted" : "painted_" + i;
    const value = i === 0 ? "3dmc:block/main" : "3dmc:block/tex_" + i;
    if (textures[key] !== value)
      fail("model:textures", "Missing or invalid texture reference " + key);
  }
  if (textures.particle !== "3dmc:block/main")
    fail("model:textures", "Particle texture must reference the main image.");

  const nodes: Cuboid[] = [];
  let legacySolids = false;
   for (let index = 0; index < model.elements.length; index++) {
    const element = asObject(model.elements[index], "element " + index, ["from","to","faces"]);
    requiredKeys(element, "element " + index, ["from","to","faces"]);
    const from = vec3(element.from, "element " + index + ":from");
    const to = vec3(element.to, "element " + index + ":to");
    const bindings = asObject(element.faces, "element " + index + ":faces", FACES);
    requiredKeys(bindings, "element " + index + ":faces", FACES);
    const mapped: Partial<CuboidFaces> = {};
    const references: string[] = [];
    for (const face of FACES) {
      const binding = asObject(bindings[face], "element " + index + ":" + face,
        ["texture","uv","rotation"]);
      requiredKeys(binding, "element " + index + ":" + face, ["texture","uv"]);
      if (!Array.isArray(binding.uv) || binding.uv.length !== 4 ||
          binding.uv.some((n: unknown) => typeof n !== "number" ||
            !Number.isFinite(n) || n < 0 || n > 16) ||
          binding.uv[0] === binding.uv[2] || binding.uv[1] === binding.uv[3])
        fail("element " + index + ":" + face, "Nonzero UV rectangle must remain within 0–16.");
      const rotation = binding.rotation ?? 0;
      if (![0,90,180,270].includes(rotation as number))
        fail("element " + index + ":" + face, "Only 0°, 90°, 180° and 270° face rotation is supported.");
      if (typeof binding.texture !== "string")
        fail("element " + index + ":" + face, "Texture alias is missing.");
      const reference = binding.texture;
      references.push(reference);
      const paintIndex = reference === "#painted" ? 0 :
        /^#painted_([1-9][0-9]*)$/.test(reference)
          ? Number(reference.slice("#painted_".length)) : -1;
      const solid = reference === "#solid_" + index;
      if (!solid && (paintIndex < 0 || paintIndex >= sourceTextures.length))
        fail("element " + index + ":" + face, "An unsupported texture alias was found.");
      mapped[face] = {
        uv: [...binding.uv] as [number,number,number,number],
        rotation: rotation as FaceRotation,
        textureId: paintIndex >= 0 ? sourceTextures[paintIndex]!.id : "main"
      } satisfies FaceUV;
    }
    const isSolid = references[0] === "#solid_" + index;
    if (isSolid && !references.every(r => r === "#solid_" + index))
      fail("element " + index, "Solid colors cannot mix with per-face painted aliases.");
    if (!isSolid && references.some(r => r === "#solid_" + index))
      fail("element " + index, "Mixed solid and painted faces aren't supported.");

    let color = "#ffffff";
    if (isSolid) {
      const key = "solid_" + index;
      if (textures[key] !== "3dmc:block/solid_" + index)
        fail("model:textures", "Missing solid-color texture alias.");
      const path = "assets/3dmc/textures/block/solid_" + index + ".png";
      const rgba = read3dMcRgbaPng(get(path));
      const legacy = rgba.width === 1 && rgba.height === 1;
      const current = rgba.width === MIN_JAVA_TEXTURE_SIZE && rgba.height === MIN_JAVA_TEXTURE_SIZE;
      if ((!legacy && !current) || rgba.pixels[3] !== 255 ||
          rgba.pixels.some((channel, i) => channel !== rgba.pixels[i % 4]))
        fail(path, "A solid texture must be a uniform opaque 1×1 legacy or 16×16 RGBA image.");
      legacySolids ||= legacy;
      color = "#" + rgba.pixels.slice(0,3).map(hexChannel).join("");
       expectedPaths.add(path);
    }
    nodes.push({
      id: "pack-element-" + index,
      name: "Imported cuboid " + String(index + 1).padStart(2,"0"),
      from, to, material: isSolid ? "solid" : "texture", color,
      faces: mapped as CuboidFaces, visible: true, locked: false
    });
  }
  const aliases = new Set<string>([
    "painted", "particle",
    ...sourceTextures.slice(1).map((_,i) => "painted_" + (i+1)),
    ...nodes.map((node,i) => node.material === "solid" ? "solid_" + i : "").filter(Boolean)
  ]);
  if (Object.keys(textures).some(key => !aliases.has(key)))
    fail("model:textures", "Unused alias would be discarded by import.");
  if ([...files.keys()].some(path => !expectedPaths.has(path)) ||
      [...expectedPaths].some(path => !files.has(path)))
    fail("textures", "Missing or unused resources cannot be retained safely.");
  for (const t of sourceTextures)
    if (t.pixels.some((n,i) => i % 4 === 3 && n !== 255))
      fail("textures", "The Java block profile only imports opaque source images.");

  let document: EditorDocument;
  try {
    document = parseDocument({
      schemaVersion: 3, id:"imported-java-1214-diamond-block",
      name:"Imported diamond block", target: {
        edition:"java", family:"static-block", candidateRelease:"1.21.4", status:"unverified"
      },
      cuboids:nodes, textures:sourceTextures, activeTextureId:"main"
    });
  } catch (error) {
    fail("model", error instanceof Error ? error.message : "Imported source cannot be validated.");
  }
  // Legacy packs with smaller source images remain editable without silent
  // resizing; the export preflight requires the creator to replace them.
  const blockers = inspectJava1214(document).filter(i => i.severity === "error" && i.code !== "TEXTURE_TOO_SMALL");
  if (blockers.length) fail("compatibility", blockers.map(i => i.message).join(" "));
  return { document, legacySolids };
}

/**
 * Preflight only. Never mutates the live document, and never silently flattens
 * unknown data. Current support is the precise 3dMc-authored experimental
 * model/texture resource set, not arbitrary vanilla/third-party packs.
 */
export function inspectJava1214Pack(bytes: Uint8Array): PackImportReport {
  try {
    const files = read3dMcStoredZip(bytes);
    const { document, legacySolids } = inspectOwnExport(files);
    const hasSmallTexture = document.textures.some(texture => texture.width < MIN_JAVA_TEXTURE_SIZE);
    return {
      status: "editable",
      document,
      paths: Array.from(files.keys()),
      notices: [
        hasSmallTexture
          ? "The generated geometry and opaque texture pixels are editable; a small image needs replacement before re-export."
          : "The generated geometry and opaque texture pixels are editable and re-exportable.",
        "Resource packs do not retain native part names, visibility, locks, or undo history; imported editor metadata is initialized.",
        "Per-face texture aliases, UV rectangles and quarter-turns are retained within the supported 16-texture profile; parent models and unrelated resources remain unsupported.",
        ...(legacySolids ? ["Legacy 1×1 solid-color images will be regenerated as 16×16 images when exported; their colors are retained."] : []),
        ...(hasSmallTexture
          ? ["This legacy pack contains an image smaller than 16×16. It remains editable at its original size; replace it with a 16×16, 32×32, or 64×64 image before exporting."] : []),
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

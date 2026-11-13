import { parseDocument, FACE_DIRECTIONS } from "../editor/domain";
import type { Cuboid, CuboidFaces, EditorDocument, FaceRotation, FaceUV, Vec3 } from "../editor/domain";
import type { NativePackProject } from "../editor/nativePackArchive";
import { inspectJava1214, MIN_JAVA_TEXTURE_SIZE, RESOURCE_PACK_FORMAT } from "../export/javaBlock";
import { read3dMcRgbaPng } from "./strictPng";
import { readIndexedJavaStoredZip } from "./storedZip";
import { gameFilePath, parsePackDocument, verifyPackSources } from "../pack/packDocument";
import type { PackDocument, PackItemAsset, PackModelAsset, PackTextureAsset, ResourceLocation } from "../pack/packDocument";
import { JAVA_1214_REPLACEMENTS, makeIndexedJava1214Pack, MAX_INDEXED_EXPORT_BYTES } from "../pack/javaPackBuilder";
import { JAVA_1214_ITEM_TARGETS, parseItemDisplay } from "../pack/itemProfile";

export type IndexedJavaImportReport =
  | { status: "editable"; project: NativePackProject; paths: string[]; notices: string[] }
  | { status: "blocked"; problems: string[] };

const decoder = new TextDecoder("utf-8", { fatal: true });
const descriptions = {
  block: "3dMc experimental block visual - Java Edition 1.21.4",
  combined: "3dMc experimental block and item visuals - Java Edition 1.21.4",
  item: "3dMc experimental item visuals - Java Edition 1.21.4"
} as const;

function fail(path: string, reason: string): never {
  throw new Error(path + ": " + reason);
}

function object(value: unknown, path: string, allowed: readonly string[],
  required: readonly string[] = allowed): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(path, "Expected a JSON object.");
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !allowed.includes(key)) ||
      required.some(key => !Object.hasOwn(data, key)))
    fail(path, "Unknown or missing fields would not survive an editable round trip.");
  return data;
}

function objectMap(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(path, "Expected a JSON object.");
  return value as Record<string, unknown>;
}

function readJson(files: Map<string, Uint8Array>, path: string): unknown {
  const bytes = files.get(path);
  if (!bytes) return fail(path, "Referenced file is missing.");
  try { return JSON.parse(decoder.decode(bytes)) as unknown; }
  catch { return fail(path, "Expected valid UTF-8 JSON."); }
}

function resourceKey(value: unknown, path: string): ResourceLocation {
  if (typeof value !== "string") return fail(path, "Expected a namespaced resource identifier.");
  const match = /^([a-z0-9_.-]{1,64}):([a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*)$/.exec(value);
  if (!match || match[1] === "." || match[1] === ".." ||
      match[2]!.length > 128 || match[2]!.split("/").some(part => part === "." || part === ".."))
    return fail(path, "Unsupported or unsafe resource identifier.");
  return { namespace: match[1]!, path: match[2]! };
}

function fromGamePath(path: string, kind: "models" | "textures" | "blockstates" | "items"): ResourceLocation {
  const match = new RegExp("^assets/([^/]+)/" + kind + "/(.+)\\." +
    (kind === "textures" ? "png" : "json") + "$").exec(path);
  if (!match) return fail(path, "Invalid resource path.");
  const resource = resourceKey(match[1] + ":" + match[2], path);
  if (gameFilePath(kind, resource) !== path) fail(path, "Noncanonical resource path.");
  return resource;
}

function vector(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every(part => typeof part === "number" && Number.isFinite(part)))
    return fail(path, "Expected three finite coordinates.");
  return [value[0] as number, value[1] as number, value[2] as number];
}

function uv(value: unknown, path: string): [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4 ||
      !value.every(part => typeof part === "number" && Number.isFinite(part) && part >= 0 && part <= 16) ||
      value[0] === value[2] || value[1] === value[3])
    return fail(path, "Expected nonzero UV edges within 0–16.");
  return [value[0] as number, value[1] as number, value[2] as number, value[3] as number];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const r = value as Record<string, unknown>;
    return "{" + Object.keys(r).sort().map(k => JSON.stringify(k) + ":" + stable(r[k])).join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

interface ModelRecord {
  resource: ResourceLocation;
  replacement: ResourceLocation;
  raw: Record<string, unknown>;
  id: string;
  sourceId: string;
}

interface ItemRecord {
  resource: ResourceLocation;
  replacement: ResourceLocation;
  raw: Record<string, unknown>;
  base: Record<string, unknown>;
  handAnimationOnSwap: boolean;
}

interface SourceParts {
  document: EditorDocument;
  assets: PackTextureAsset[];
  bindings: PackModelAsset["textures"];
  paintedKeys: string[];
  solidRefs: Map<number, string>;
}

function parseModel(files: Map<string, Uint8Array>, record: ModelRecord,
  number: number, expected: Set<string>): SourceParts {
  const label = gameFilePath("models", record.resource);
  const raw = object(record.raw, label, ["ambientocclusion", "textures", "elements"]);
  if (raw.ambientocclusion !== true || !Array.isArray(raw.elements) ||
      raw.elements.length < 1 || raw.elements.length > 256)
    fail(label, "This profile requires 1–256 cuboids with ambient occlusion enabled.");
  const aliases = objectMap(raw.textures, label + ":textures");
  // Keys must be reconstructed from the exporter's exact alias convention.
  if (typeof aliases.painted !== "string" || typeof aliases.particle !== "string")
    fail(label, "Missing painted or particle texture binding.");
  const numbered = Object.keys(aliases).filter(key => /^painted_[1-9][0-9]*$/.test(key));
  if (numbered.length > 15) fail(label, "More than 16 editable texture sheets.");
  for (let i = 1; i <= numbered.length; i++)
    if (!Object.hasOwn(aliases, "painted_" + i))
      fail(label, "Nonconsecutive painted texture aliases.");
  const paintedKeys = ["painted", ...numbered.sort((a, b) =>
    Number(a.slice(8)) - Number(b.slice(8)))];
  if (aliases.particle !== aliases.painted)
    fail(label, "Particle texture must match the first editable sheet.");
  const textureAssets: PackTextureAsset[] = [];
  const textureRecords: EditorDocument["textures"] = [];
  const textureBindings: PackModelAsset["textures"] = [];
  const paintedPaths: string[] = [];
  for (let i = 0; i < paintedKeys.length; i++) {
    const alias = paintedKeys[i]!;
    const resource = resourceKey(aliases[alias], label + ":textures:" + alias);
    const path = gameFilePath("textures", resource);
    const rgba = read3dMcRgbaPng(files.get(path) ?? fail(path, "Texture file is missing."));
    if (rgba.pixels.some((byte, p) => p % 4 === 3 && byte !== 255))
      fail(path, "Only opaque painted textures can be re-exported by this profile.");
    const sourceTextureId = i === 0 ? "main" : "texture_" + i;
    const assetId = "texture_asset_" + number + "_" + i;
    textureRecords.push({
      id: sourceTextureId,
      name: resource.path.split("/").at(-1)!.slice(0, 96) + ".png",
      width: rgba.width, height: rgba.height, pixels: rgba.pixels
    });
    textureAssets.push({ id: assetId, sourceDocumentId: record.sourceId,
      sourceTextureId, resource });
    textureBindings.push({ textureAssetId: assetId, sourceTextureId });
    paintedPaths.push(path);
    expected.add(path);
  }

  const nodes: Cuboid[] = [];
  const solidRefs = new Map<number, string>();
  for (let i = 0; i < raw.elements.length; i++) {
    const path = label + ":element " + i;
    const element = object(raw.elements[i], path, ["from", "to", "faces"]);
    const from = vector(element.from, path + ":from"), to = vector(element.to, path + ":to");
    const faceData = object(element.faces, path + ":faces", FACE_DIRECTIONS);
    const faces: Partial<CuboidFaces> = {};
    const references: string[] = [];
    for (const face of FACE_DIRECTIONS) {
      const location = path + ":" + face;
      const binding = object(faceData[face], location,
        ["texture", "uv", "rotation"], ["texture", "uv"]);
      if (typeof binding.texture !== "string") fail(location, "Face texture alias is missing.");
      const alias = binding.texture.slice(1);
      if (!binding.texture.startsWith("#") ||
          (alias !== "solid_" + i && !paintedKeys.includes(alias)))
        fail(location, "Unsupported face texture alias.");
      const rotation = binding.rotation ?? 0;
      if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
        fail(location, "Only quarter-turn UV rotations are supported.");
      const textureIndex = paintedKeys.indexOf(alias);
      references.push(binding.texture);
      faces[face] = { uv: uv(binding.uv, location + ":uv"),
        rotation: rotation as FaceRotation,
        textureId: textureIndex < 0 ? "main" :
          textureRecords[textureIndex]!.id } satisfies FaceUV;
    }
    const isSolid = references[0] === "#solid_" + i;
    if (isSolid !== references.every(ref => ref === "#solid_" + i) &&
        references.some(ref => ref === "#solid_" + i))
      fail(path, "Mixed solid and painted face aliases cannot round-trip.");
    let color = "#ffffff";
    if (isSolid) {
      const resource = resourceKey(aliases["solid_" + i], label + ":textures:solid_" + i);
      const pngPath = gameFilePath("textures", resource);
      const image = read3dMcRgbaPng(files.get(pngPath) ?? fail(pngPath, "Solid texture is missing."));
      if (image.width !== MIN_JAVA_TEXTURE_SIZE || image.height !== MIN_JAVA_TEXTURE_SIZE ||
          image.pixels[3] !== 255 ||
          image.pixels.some((byte, j) => byte !== image.pixels[j % 4]))
        fail(pngPath, "Generated solid textures must be uniform opaque 16×16 RGBA.");
      color = "#" + image.pixels.slice(0, 3).map(n => n.toString(16).padStart(2, "0")).join("");
      solidRefs.set(i, resource.namespace + ":" + resource.path);
      expected.add(pngPath);
    }
    nodes.push({ id: "element-" + i,
      name: "Imported cuboid " + String(i + 1).padStart(2, "0"),
      from, to, material: isSolid ? "solid" : "texture",
      color, visible: true, locked: false, faces: faces as CuboidFaces });
  }
  const aliasNames = new Set(["particle", ...paintedKeys,
    ...[...solidRefs.keys()].map(i => "solid_" + i)]);
  if (Object.keys(aliases).length !== aliasNames.size ||
      Object.keys(aliases).some(name => !aliasNames.has(name)))
    fail(label, "Unsupported or unused texture aliases would be discarded.");

  let document: EditorDocument;
  try {
    document = parseDocument({
      schemaVersion: 3, id: record.sourceId,
      name: ("Imported " + record.resource.namespace + ":" + record.resource.path).slice(0, 100),
      target: { edition: "java", family: "static-block",
        candidateRelease: "1.21.4", status: "unverified" },
      cuboids: nodes, textures: textureRecords, activeTextureId: "main"
    });
  } catch (error) {
    fail(label, error instanceof Error ? error.message : "Invalid editable source model.");
  }
  const blockers = inspectJava1214(document)
    .filter(issue => issue.severity === "error");
  if (blockers.length)
    fail(label, blockers.map(issue => issue.message).join(" "));
  return { document, assets: textureAssets, bindings: textureBindings,
    paintedKeys: paintedPaths, solidRefs };
}

function sourceSignature(parts: SourceParts): string {
  return stable({
    cuboids: parts.document.cuboids.map(node => ({
      from: node.from, to: node.to, faces: node.faces, color: node.color, material: node.material
    })),
    textures: parts.document.textures.map(texture => ({
      width: texture.width, height: texture.height, pixels: texture.pixels
    }))
  });
}

function inspect(files: Map<string, Uint8Array>): IndexedJavaImportReport {
  const expected = new Set<string>(["pack.mcmeta"]);
  const metadata = object(readJson(files, "pack.mcmeta"), "pack.mcmeta", ["pack"]);
  const packMeta = object(metadata.pack, "pack.mcmeta:pack", ["pack_format", "description"]);
  if (packMeta.pack_format !== RESOURCE_PACK_FORMAT)
    fail("pack.mcmeta", "Only the Java 1.21.4 format 46 profile can be imported.");

  const blockstatePaths = [...files.keys()].filter(path => path.includes("/blockstates/"));
  const itemPaths = [...files.keys()].filter(path => path.includes("/items/"));
  const hasBlocks = blockstatePaths.length > 0;
  if (!hasBlocks && !itemPaths.length)
    fail("pack.mcmeta", "No supported blockstate or item definitions were found.");
  const description = hasBlocks
    ? itemPaths.length ? descriptions.combined : descriptions.block
    : descriptions.item;
  if (packMeta.description !== description)
    fail("pack.mcmeta", "The pack description does not match the supported generated asset family.");
  if (blockstatePaths.length > 8 || itemPaths.length > 8)
    fail("pack.mcmeta", "At most eight block models and eight item definitions are supported.");

  const models: ModelRecord[] = [];
  const referencedModelPaths = new Set<string>();
  for (const path of blockstatePaths) {
    const replacement = fromGamePath(path, "blockstates");
    if (replacement.namespace !== "minecraft" ||
        !JAVA_1214_REPLACEMENTS.includes(
          replacement.path as typeof JAVA_1214_REPLACEMENTS[number]))
      fail(path, "Unsupported or stateful vanilla block replacement.");
    const raw = object(readJson(files, path), path, ["variants"]);
    const variants = object(raw.variants, path + ":variants", [""]);
    const variant = object(variants[""], path + ":variant", ["model"]);
    const resource = resourceKey(variant.model, path + ":model");
    const modelPath = gameFilePath("models", resource);
    if (referencedModelPaths.has(modelPath)) fail(path, "Duplicate block model resource.");
    referencedModelPaths.add(modelPath);
    models.push({ resource, replacement, raw: object(readJson(files, modelPath),
      modelPath, ["ambientocclusion", "textures", "elements"]),
      id: "model-" + models.length, sourceId: "imported-source-" + models.length });
    expected.add(path); expected.add(modelPath);
  }

  const items: ItemRecord[] = [];
  for (const path of itemPaths) {
    const replacement = fromGamePath(path, "items");
    if (replacement.namespace !== "minecraft" ||
        !JAVA_1214_ITEM_TARGETS.includes(replacement.path as typeof JAVA_1214_ITEM_TARGETS[number]))
      fail(path, "Unsupported item replacement or item namespace.");
    const definition = object(readJson(files, path), path,
      ["model", "hand_animation_on_swap"]);
    if (typeof definition.hand_animation_on_swap !== "boolean")
      fail(path, "Invalid hand-animation configuration.");
    const model = object(definition.model, path + ":model",
      ["type", "model"]);
    if (model.type !== "minecraft:model")
      fail(path, "Conditional, range and composite item definitions are unsupported.");
    const resource = resourceKey(model.model, path + ":model");
    const raw = object(readJson(files, gameFilePath("models", resource)),
      path + ":item model", ["ambientocclusion", "textures", "elements", "display"]);
    const { display: _display, ...base } = raw;
    items.push({ resource, replacement, raw, base,
      handAnimationOnSwap: definition.hand_animation_on_swap as boolean });
    expected.add(path); expected.add(gameFilePath("models", resource));
  }

  if (!hasBlocks) {
    // Item-only exports omit the source block-model file. Group the underlying
    // geometry only when identical item models demonstrate that they share it.
    const bySignature = new Map<string, ModelRecord>();
    for (const item of items) {
      const signature = stable(item.base);
      if (bySignature.has(signature)) continue;
      const index = models.length;
      if (index >= 8) fail("items", "More than eight distinct source models.");
      const aliases = objectMap(item.base.textures, "item model:textures");
      const solid = Object.entries(aliases).find(([key]) => /^solid_(0|[1-9][0-9]*)$/.test(key));
      let resource: ResourceLocation;
      if (solid) {
        const ref = resourceKey(solid[1], "item model:solid");
        const suffix = "/" + solid[0];
        if (ref.namespace === "3dmc" && ref.path === "block/" + solid[0]) {
          resource = { namespace: "3dmc", path: "block/lantern" };
        } else if (ref.path.endsWith(suffix)) {
          resource = { namespace: ref.namespace, path: ref.path.slice(0, -suffix.length) };
        } else fail("item model", "The generated solid resource lacks its source model prefix.");
      } else {
        resource = { namespace: item.resource.namespace, path: "block/imported-source-" + index };
      }
      // These replacement identities are never written for item-only exports.
      const record: ModelRecord = {
        resource, replacement: { namespace: "minecraft", path: JAVA_1214_REPLACEMENTS[index]! },
        raw: item.base, id: "model-" + index, sourceId: "imported-source-" + index
      };
      models.push(record);
      bySignature.set(signature, record);
    }
  }

  if (!models.length || models.length > 8)
    fail("pack", "The archive needs 1–8 editable model assets.");

  const sourceDocuments: EditorDocument[] = [];
  const textureAssets: PackTextureAsset[] = [];
  const modelAssets: PackModelAsset[] = [];
  const sourceParts: SourceParts[] = [];
  const textureOwner = new Map<string, number>();
  for (let i = 0; i < models.length; i++) {
    const entry = models[i]!;
    const parts = parseModel(files, entry, i, expected);
    // For a single model at the legacy resource path, solid colors only use
    // block/solid_N when the source really came from model-0. Other valid
    // exporter IDs use the newer model-path/solid_N convention.
    if (models.length === 1 && entry.resource.namespace === "3dmc" &&
        entry.resource.path === "block/lantern" &&
        [...parts.solidRefs].some(([index, reference]) =>
          reference === "3dmc:block/lantern/solid_" + index))
      entry.id = "model-imported-0";
    // Sharing the same image resource across models is only safe if their
    // complete editable geometry and texels also match (one logical source).
    const matchingOwner = parts.paintedKeys.map(path => textureOwner.get(path))
      .find(index => index !== undefined);
    if (matchingOwner !== undefined) {
      const original = sourceParts[matchingOwner]!;
      if (parts.paintedKeys.length !== original.paintedKeys.length ||
          parts.paintedKeys.some((path, j) => path !== original.paintedKeys[j]) ||
          sourceSignature(parts) !== sourceSignature(original))
        fail("pack:textures", "Shared texture paths belong to incompatible editable source models.");
      entry.sourceId = models[matchingOwner]!.sourceId;
      modelAssets.push({ id: entry.id, sourceDocumentId: entry.sourceId,
        resource: entry.resource, replaces: entry.replacement,
        provenance: "java-1214-import", textures: original.bindings });
    } else {
      const ownerIndex = i;
      // SourceParts indexes are stored by model position, including shared models.
      sourceParts[i] = parts;
      parts.paintedKeys.forEach(path => textureOwner.set(path, ownerIndex));
      sourceDocuments.push(parts.document);
      textureAssets.push(...parts.assets);
      modelAssets.push({ id: entry.id, sourceDocumentId: entry.sourceId,
        resource: entry.resource, replaces: entry.replacement,
        provenance: "java-1214-import", textures: parts.bindings });
    }
  }

  const itemAssets: PackItemAsset[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const matching = models.filter(model => stable(model.raw) === stable(item.base));
    if (matching.length !== 1)
      fail(gameFilePath("models", item.resource),
        matching.length ? "Item source model is ambiguous." : "Item source model is missing.");
    const display = parseItemDisplay(item.raw.display);
    itemAssets.push({ id: "item-" + i, sourceModelId: matching[0]!.id,
      resource: item.resource, replaces: item.replacement,
      handAnimationOnSwap: item.handAnimationOnSwap, display });
  }

  const pack: PackDocument = parsePackDocument({
    schemaVersion: 1, id: "imported-java-1214-pack", name: "Imported Java 1.21.4 pack",
    targetProfile: "java-1.21.4-static-block",
    activeModelId: modelAssets[0]!.id, models: modelAssets, textures: textureAssets,
    ...(itemAssets.length ? { items: itemAssets } : {}),
    ...(!hasBlocks ? { exportBlockVisuals: false } : {})
  });
  verifyPackSources(pack, sourceDocuments);

  // Fail closed if *anything* in the Java resource graph would change or
  // disappear. ZIP entry ordering is irrelevant, every payload must match.
  const regenerated = readIndexedJavaStoredZip(
    makeIndexedJava1214Pack(pack, sourceDocuments).zip);
  if (regenerated.size !== files.size)
    fail("pack", "Import/export would add or remove resource files.");
  for (const [path, bytes] of files) {
    if (!expected.has(path)) fail(path, "Unreferenced asset cannot be safely preserved.");
    const roundTrip = regenerated.get(path);
    if (!roundTrip || bytes.length !== roundTrip.length ||
        bytes.some((value, index) => value !== roundTrip[index]))
      fail(path, "Generated resources are not byte-identical after import; no source was replaced.");
  }
  return {
    status: "editable", project: { pack, sources: sourceDocuments },
    paths: [...files.keys()],
    notices: [
      "All supported model, texture, blockstate and item resources were checked against a lossless Java ZIP re-export.",
      "Java resource packs do not retain native part names, visibility, locks, layers, project IDs or undo history. New editor-only metadata was initialized.",
      "Only 3dMc's supported Java Edition 1.21.4 block and item subset is editable. Unrelated resources and conditional item definitions are refused.",
      "This pack replaces visuals, not block or item behavior. Check the exported pack in Minecraft before claiming compatibility."
    ]
  };
}

/** Strict preflight only. Never alters an active source or partially imports. */
export function inspectIndexedJava1214Pack(bytes: Uint8Array): IndexedJavaImportReport {
  try {
    if (bytes.byteLength > MAX_INDEXED_EXPORT_BYTES)
      fail("ZIP", "Archive exceeds the 12 MB indexed import budget.");
    return inspect(readIndexedJavaStoredZip(bytes));
  } catch (error) {
    return { status: "blocked",
      problems: [error instanceof Error ? error.message : "The pack cannot be imported safely."] };
  }
}

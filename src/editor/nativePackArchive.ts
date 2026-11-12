import { strToU8, zipSync } from "fflate";
import type { EditorDocument } from "./domain";
import { parseDocument } from "./domain";
import { NativeProjectError, decodeNativeProject, readExactStoredZip } from "./nativeArchive";
import type { NativeZipLimits } from "./nativeArchive";
import { read3dMcRgbaPng } from "../import/strictPng";
import { encodeRgbaPng } from "../export/png";
import { PACK_INDEX_VERSION, indexLegacyProject, parsePackDocument, verifyPackSources } from "../pack/packDocument";
import type { PackDocument } from "../pack/packDocument";

/**
 * Native pack container v3. Unlike a Minecraft resource-pack ZIP, this stores
 * multiple editable source models, original RGBA sheets and a pack index.
 * Native v1/v2 source archives remain readable through the legacy decoder.
 */
export const NATIVE_PACK_CONTAINER_VERSION = 3 as const;
export const MAX_NATIVE_PACK_BYTES = 12_000_000;
export const MAX_NATIVE_PACK_SOURCES = 8;
const MAX_PACK_INDEX_BYTES = 80_000;
const MAX_PACK_MANIFEST_BYTES = 40_000;
const MAX_PACK_SOURCE_DESCRIPTOR_BYTES = 2_500_000;
const MAX_PACK_IMAGE_BYTES = 70_000;
const PACK_FILES_LIMIT = 2 + MAX_NATIVE_PACK_SOURCES * 17;
const STAMP = new Date(1980, 0, 1);
const DECODER = new TextDecoder("utf-8", { fatal: true });

export interface NativePackProject {
  pack: PackDocument;
  sources: EditorDocument[];
}

interface SourceEntry {
  id: string;
  document: string;
  textures: string[];
}

function fail(message: string): never { throw new NativeProjectError(message); }

function object(value: unknown, required: readonly string[], label: string,
                optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail(label + " must be a JSON object.");
  const r = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(r, key)) ||
      Object.keys(r).some(key => !required.includes(key) && !optional.includes(key)))
    return fail(label + " has unsupported or missing fields.");
  return r;
}

function decodeJson(bytes: Uint8Array, path: string): unknown {
  try { return JSON.parse(DECODER.decode(bytes)) as unknown; }
  catch { return fail(path + " must contain valid UTF-8 JSON."); }
}
const encodeJson = (value: unknown) => strToU8(JSON.stringify(value, null, 2) + "\n");

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) fail("Secure SHA-256 is unavailable.");
  const hash = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(hash)].map(part => part.toString(16).padStart(2, "0")).join("");
}

function docPath(index: number): string { return "models/" + index + "/document.json"; }
function texturePath(index: number, id: string): string {
  return "models/" + index + "/textures/" + id + ".png";
}

const NATIVE_PACK_ZIP_LIMITS: NativeZipLimits = {
  maxArchiveBytes: MAX_NATIVE_PACK_BYTES, minEntries: 3, maxEntries: PACK_FILES_LIMIT,
  // Accept legacy paths so the v1/v2 parser can migrate them in memory, but
  // the v3 manifest must enumerate and hash the exact new path set.
  isAllowedPath: (path) =>
    path === "manifest.json" || path === "pack.json" || path === "document.json" ||
    /^textures\/[a-zA-Z0-9_-]{1,100}\.png$/.test(path) ||
    /^models\/(?:0|[1-9][0-9]*)\/document\.json$/.test(path) ||
    /^models\/(?:0|[1-9][0-9]*)\/textures\/[a-zA-Z0-9_-]{1,100}\.png$/.test(path),
  maxEntryBytes: (path) =>
    path === "manifest.json" ? MAX_PACK_MANIFEST_BYTES :
    path === "pack.json" ? MAX_PACK_INDEX_BYTES :
    path === "document.json" || path.endsWith("/document.json")
      ? MAX_PACK_SOURCE_DESCRIPTOR_BYTES : MAX_PACK_IMAGE_BYTES
};

/** No silent upgrade: legacy .3dmc files remain untouched until a new save. */
export async function encodeNativePack(index: PackDocument,
                                       sources: readonly EditorDocument[]): Promise<Uint8Array> {
  const pack = parsePackDocument(index);
  if (pack.models.length > MAX_NATIVE_PACK_SOURCES)
    fail("Pack source archives support at most eight models for now.");

  const sourceDocuments = sources.map(parseDocument);
  verifyPackSources(pack, sourceDocuments);
  const referenced = [...new Set(pack.models.map(model => model.sourceDocumentId))];
  if (sourceDocuments.length !== referenced.length ||
      sourceDocuments.some(doc => !referenced.includes(doc.id)))
    fail("Pack sources have missing or unreferenced documents.");

  const byId = new Map(sourceDocuments.map(doc => [doc.id, doc]));
  const files: Record<string, Uint8Array> = { "pack.json": encodeJson(pack) };
  if (files["pack.json"]!.length > MAX_PACK_INDEX_BYTES)
    fail("Pack index exceeds its source metadata budget.");
  const manifestSources: SourceEntry[] = [];

  for (let index = 0; index < referenced.length; index++) {
    const doc = byId.get(referenced[index]!)!;
    const document = docPath(index);
    const descriptors = doc.textures.map(texture => {
      const path = texturePath(index, texture.id);
      const { pixels: _pixels, ...metadata } = texture;
      files[path] = encodeRgbaPng(texture.width, texture.height, texture.pixels);
      if (files[path]!.length > MAX_PACK_IMAGE_BYTES)
        fail("Source texture exceeds its native size budget: " + path);
      return { ...metadata, path };
    });
    const json = encodeJson({ ...doc, textures: descriptors });
    if (json.length > MAX_PACK_SOURCE_DESCRIPTOR_BYTES)
      fail("Source document exceeds its native metadata budget: " + doc.id);
    files[document] = json;
    manifestSources.push({ id: doc.id, document,
      textures: descriptors.map(entry => entry.path) });
  }

  const hashes: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) hashes[path] = await sha256(bytes);
  const manifest = encodeJson({
    format: "3dmc-native-pack", containerVersion: NATIVE_PACK_CONTAINER_VERSION,
    packSchemaVersion: PACK_INDEX_VERSION, pack: "pack.json",
    sources: manifestSources, sha256: hashes
  });
  if (manifest.length > MAX_PACK_MANIFEST_BYTES)
    fail("Native pack manifest exceeds its size budget.");
  const zip = zipSync({ "manifest.json": manifest, ...files },
    { level: 0, mtime: STAMP });
  if (zip.length > MAX_NATIVE_PACK_BYTES)
    fail("Native pack source archive exceeds the 12 MB budget.");
  return zip;
}

/**
 * Strict, complete read. Hashes and all references are checked before any
 * editable project is returned; unknown files never get silently discarded.
 */
export async function decodeNativePack(bytes: Uint8Array): Promise<NativePackProject> {
  const files = readExactStoredZip(bytes, NATIVE_PACK_ZIP_LIMITS);
  const manifestRaw = object(
    decodeJson(files.get("manifest.json")!, "manifest.json"),
    // First inspect the version without assuming a layout.
    ["format", "containerVersion", "packSchemaVersion", "pack", "sources", "sha256"],
    "native pack manifest"
  );
  if (manifestRaw.containerVersion !== NATIVE_PACK_CONTAINER_VERSION)
    fail("Unsupported native pack container version.");
  if (manifestRaw.format !== "3dmc-native-pack" ||
      manifestRaw.packSchemaVersion !== PACK_INDEX_VERSION ||
      manifestRaw.pack !== "pack.json")
    fail("Unrecognized native pack format or pack index version.");
  if (!Array.isArray(manifestRaw.sources) || manifestRaw.sources.length < 1 ||
      manifestRaw.sources.length > MAX_NATIVE_PACK_SOURCES)
    fail("Native pack has an invalid number of source documents.");

  const sourceEntries: SourceEntry[] = (manifestRaw.sources as unknown[]).map((raw, i) => {
    const s = object(raw, ["id", "document", "textures"], "manifest source " + i);
    if (typeof s.id !== "string" || s.id.length < 1 || s.id.length > 100 ||
        s.document !== docPath(i) || !Array.isArray(s.textures) ||
        s.textures.length < 1 || s.textures.length > 16 ||
        !s.textures.every(path => typeof path === "string" &&
          /^models\/(?:0|[1-9][0-9]*)\/textures\/[a-zA-Z0-9_-]{1,100}\.png$/.test(path) &&
          path.startsWith("models/" + i + "/textures/")) ||
        new Set(s.textures).size !== s.textures.length)
      fail("Native pack source paths or IDs are invalid.");
    return { id: s.id as string, document: s.document as string, textures: s.textures as string[] };
  });
  if (new Set(sourceEntries.map(s => s.id)).size !== sourceEntries.length)
    fail("Native pack has duplicate source document IDs.");
  const paths = ["pack.json", ...sourceEntries.flatMap(s => [s.document, ...s.textures])];
  const expected = new Set(["manifest.json", ...paths]);
  if (expected.size !== files.size || [...files.keys()].some(p => !expected.has(p)))
    fail("Native pack contains unknown, missing or untracked source files.");

  const hashRecord = object(manifestRaw.sha256, paths, "native pack SHA-256 list");
  for (const path of paths) {
    const hash = hashRecord[path];
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) ||
        hash !== await sha256(files.get(path)!))
      fail("Native pack SHA-256 integrity failure: " + path);
  }

  const pack = parsePackDocument(decodeJson(files.get("pack.json")!, "pack.json"));
  if (pack.models.length > MAX_NATIVE_PACK_SOURCES)
    fail("Native pack has more than eight model assets.");
  const expectedSourceIds = [...new Set(pack.models.map(m => m.sourceDocumentId))];
  if (expectedSourceIds.length !== sourceEntries.length ||
      sourceEntries.some((s, i) => s.id !== expectedSourceIds[i]))
    fail("Native pack index and source document order disagree.");

  const sources = sourceEntries.map((entry, index) => {
    const raw = object(decodeJson(files.get(entry.document)!, entry.document), [
      "schemaVersion", "id", "name", "target", "cuboids", "textures", "activeTextureId"
    ], entry.document, ["groups", "palette"]);
    if (raw.schemaVersion !== 3 || raw.id !== entry.id || !Array.isArray(raw.textures) ||
        raw.textures.length !== entry.textures.length)
      fail("Native pack source document is incompatible or misidentified.");
    const textures = (raw.textures as unknown[]).map((value, position) => {
      const descriptor = object(value, ["id", "name", "width", "height", "path"],
        "source texture descriptor");
      const path = entry.textures[position]!;
      if (descriptor.path !== path ||
          typeof descriptor.id !== "string" ||
          path !== texturePath(index, descriptor.id))
        fail("Native pack texture path disagrees with its source descriptor.");
      const png = read3dMcRgbaPng(files.get(path)!);
      if (png.width !== descriptor.width || png.height !== descriptor.height)
        fail("Native pack texture dimensions disagree with its metadata.");
      return { id: descriptor.id, name: descriptor.name,
        width: png.width, height: png.height, pixels: png.pixels };
    });
    return parseDocument({ ...raw, textures });
  });
  verifyPackSources(pack, sources);
  return { pack, sources };
}

/**
 * Explicit migration boundary for the current editor: legacy archives become
 * an in-memory single-model pack, while v3 stays fully pack-aware.
 */
export async function openNativePack(bytes: Uint8Array): Promise<NativePackProject> {
  const files = readExactStoredZip(bytes, NATIVE_PACK_ZIP_LIMITS);
  const raw = decodeJson(files.get("manifest.json")!, "manifest.json");
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    fail("Native pack manifest is invalid.");
  const version = (raw as Record<string, unknown>).containerVersion;
  if (version === 1 || version === 2) {
    const source = await decodeNativeProject(bytes);
    return { pack: indexLegacyProject(source), sources: [source] };
  }
  if (version !== NATIVE_PACK_CONTAINER_VERSION)
    fail("Unsupported native pack container version.");
  return decodeNativePack(bytes);
}

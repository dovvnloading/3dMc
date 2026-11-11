import { strToU8, zipSync } from "fflate";
import type { EditorDocument } from "./domain";
import { parseDocument } from "./domain";
import { encodeRgbaPng, crc32 } from "../export/png";
import { read3dMcRgbaPng } from "../import/strictPng";

/**
 * 3dMc native source archive, independent of Minecraft resource packs.
 *
 * v1 layout:
 *   manifest.json
 *   document.json
 *   textures/main.png
 *
 * Only STORED entries are accepted. The parser verifies the complete ZIP
 * directory, path whitelist, CRC32, and SHA-256 of both source records before
 * materializing an editable document. No partial project is ever returned.
 */
export const NATIVE_EXTENSION = ".3dmc";
export const MAX_NATIVE_BYTES = 3_000_000;
export const NATIVE_FILES = [
  "manifest.json", "document.json", "textures/main.png"
] as const;
const MAX_DOCUMENT_BYTES = 2_500_000;
const MAX_IMAGE_BYTES = 70_000;
const MAX_MANIFEST_BYTES = 8_192;
const EMPTY_TIMESTAMP = new Date(1980, 0, 1);
const utf8 = new TextDecoder("utf-8", { fatal: true });

export class NativeProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeProjectError";
  }
}

function reject(message: string): never {
  throw new NativeProjectError(message);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) reject("Secure SHA-256 is unavailable in this browser.");
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), (n) => n.toString(16).padStart(2, "0")).join("");
}

function exactKeys(value: unknown, expected: readonly string[], path: string): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object")
    reject(path + " must be a JSON object.");
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort().join(",");
  if (actual !== [...expected].sort().join(","))
    reject(path + " has unsupported or missing fields. No data was imported.");
  return record;
}

function decodeJson(bytes: Uint8Array, path: string): unknown {
  try { return JSON.parse(utf8.decode(bytes)) as unknown; }
  catch { return reject(path + " is not valid UTF-8 JSON."); }
}

function encodeJson(value: unknown): Uint8Array {
  return strToU8(JSON.stringify(value, null, 2) + "\n");
}

function u16(view: DataView, pos: number): number { return view.getUint16(pos, true); }
function u32(view: DataView, pos: number): number { return view.getUint32(pos, true); }

interface DirectoryEntry {
  name: string;
  offset: number;
  size: number;
  crc: number;
  flags: number;
}

/** Shared strict ZIP envelope for legacy and pack-aware native projects. */
export interface NativeZipLimits {
  maxArchiveBytes: number;
  minEntries: number;
  maxEntries: number;
  isAllowedPath: (name: string) => boolean;
  maxEntryBytes: (name: string) => number;
}

const LEGACY_ZIP_LIMITS: NativeZipLimits = {
  maxArchiveBytes: MAX_NATIVE_BYTES, minEntries: NATIVE_FILES.length, maxEntries: 18,
  isAllowedPath: (name) => NATIVE_FILES.includes(name as typeof NATIVE_FILES[number]) ||
    /^textures\/[a-zA-Z0-9_-]{1,100}\.png$/.test(name),
  maxEntryBytes: (name) => name === NATIVE_FILES[0] ? MAX_MANIFEST_BYTES :
    name === NATIVE_FILES[1] ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES
};

export function readExactStoredZip(bytes: Uint8Array,
                                   limits: NativeZipLimits = LEGACY_ZIP_LIMITS): Map<string, Uint8Array> {
  if (bytes.byteLength < 22 || bytes.byteLength > limits.maxArchiveBytes)
    reject("Native archive is empty, damaged or exceeds the " +
      (limits === LEGACY_ZIP_LIMITS ? "3 MB" : "pack") + " import limit.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (u32(view, end) !== 0x06054b50 || u16(view, end + 20) !== 0 ||
      u16(view, end + 4) !== 0 || u16(view, end + 6) !== 0)
    reject("Native archive requires an unmodified single-disk ZIP directory without comments.");

  const count = u16(view, end + 10);
  if (count < limits.minEntries || count > limits.maxEntries || u16(view, end + 8) !== count)
    reject("Native archive requires a bounded number of source files.");

  const centralStart = u32(view, end + 16);
  const centralSize = u32(view, end + 12);
  if (centralStart === 0xffffffff || centralSize === 0xffffffff ||
      centralStart + centralSize !== end)
    reject("Native archive directory offsets are invalid.");

  const entries: DirectoryEntry[] = [];
  const seen = new Set<string>();
  let pos = centralStart;
  let total = 0;

  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || u32(view, pos) !== 0x02014b50)
      reject("Native ZIP central directory is malformed.");
    const flags = u16(view, pos + 8);
    const method = u16(view, pos + 10);
    const size = u32(view, pos + 24);
    const length = u16(view, pos + 28);
    const extra = u16(view, pos + 30);
    const comment = u16(view, pos + 32);
    const offset = u32(view, pos + 42);
    const next = pos + 46 + length + extra + comment;
    if (next > end || !length || length > 180 || extra || comment ||
        (flags & ~0x0800) !== 0 || method !== 0 || size === 0xffffffff ||
        u32(view, pos + 20) !== size || offset === 0xffffffff)
      reject("Native ZIP contains unsupported compression, metadata or oversized entries.");

    let name: string;
    try { name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + length)); }
    catch { reject("Native archive has an invalid file path."); }
    if (!limits.isAllowedPath(name) || seen.has(name))
      reject("Native archive includes a missing, duplicate or unexpected path: " + name);
    const max = limits.maxEntryBytes(name);
    if (size > max) reject("Native archive file is too large: " + name);
    total += size;
    if (total > limits.maxArchiveBytes) reject("Native archive contents exceed the size budget.");

    entries.push({ name, offset, size, crc: u32(view, pos + 16), flags });
    seen.add(name);
    pos = next;
  }
  if (pos !== end || !seen.has("manifest.json") ||
      (limits === LEGACY_ZIP_LIMITS && !seen.has("document.json")))
    reject("Native archive directory is incomplete.");

  const spans: { from: number; to: number }[] = [];
  const files = new Map<string, Uint8Array>();
  for (const entry of entries) {
    const start = entry.offset;
    if (start + 30 > centralStart || u32(view, start) !== 0x04034b50)
      reject("Native archive local entry is invalid.");
    const length = u16(view, start + 26);
    const extra = u16(view, start + 28);
    const body = start + 30 + length + extra;
    const endOfBody = body + entry.size;
    if (!length || length > 180 || extra || endOfBody > centralStart ||
        u16(view, start + 6) !== entry.flags ||
        u16(view, start + 8) !== 0 ||
        u32(view, start + 14) !== entry.crc ||
        u32(view, start + 18) !== entry.size ||
        u32(view, start + 22) !== entry.size)
      reject("Native archive local header disagrees with its directory.");
    let localName: string;
    try { localName = utf8.decode(bytes.subarray(start + 30, start + 30 + length)); }
    catch { reject("Native archive contains a malformed local path."); }
    if (localName !== entry.name)
      reject("Native archive local file path disagrees with the directory.");
    const data = bytes.slice(body, endOfBody);
    if (crc32(data) !== entry.crc)
      reject("Native archive ZIP checksum mismatch: " + entry.name);
    spans.push({ from: start, to: endOfBody });
    files.set(entry.name, data);
  }
  spans.sort((a, b) => a.from - b.from);
  let cursor = 0;
  for (const span of spans) {
    if (span.from !== cursor || span.to < span.from)
      reject("Native ZIP has overlapping or untracked file bytes.");
    cursor = span.to;
  }
  if (cursor !== centralStart) reject("Native ZIP has data outside tracked files.");
  return files;
}

export async function encodeNativeProject(document: EditorDocument): Promise<Uint8Array> {
  const clean = parseDocument(document);
  const binary: Record<string, Uint8Array> = {};
  const descriptors: Array<{id:string;name:string;width:number;height:number;path:string}> = [];
  const paths: string[] = [];
  for (const texture of clean.textures) {
    const path = "textures/" + texture.id + ".png";
    const { pixels: _pixels, ...info } = texture;
    descriptors.push({ ...info, path });
    paths.push(path);
    binary[path] = encodeRgbaPng(texture.width, texture.height, texture.pixels);
  }
  const descriptor = encodeJson({
    ...clean, textures: descriptors
  });
  if (descriptor.length > MAX_DOCUMENT_BYTES)
    reject("Project exceeds the 2.5 MB native document budget.");
  binary["document.json"] = descriptor;
  const hashes: Record<string,string> = { "document.json": await sha256(descriptor) };
  for (const path of paths) hashes[path] = await sha256(binary[path]!);
  const manifest = encodeJson({
    format: "3dmc-native", containerVersion: 2,
    documentSchemaVersion: 3, document: "document.json",
    textures: paths, sha256: hashes
  });
  const archive = zipSync({
    "manifest.json": manifest, "document.json": descriptor,
    ...Object.fromEntries(paths.map(path => [path, binary[path]!]))
  }, { level: 0, mtime: EMPTY_TIMESTAMP });
  if (archive.length > MAX_NATIVE_BYTES)
    reject("Native source archive exceeds the 3 MB budget.");
  return archive;
}

export async function decodeNativeProject(data: Uint8Array): Promise<EditorDocument> {
  const files = readExactStoredZip(data);
  const rawManifest = decodeJson(files.get("manifest.json")!, "manifest.json");
  if (!rawManifest || typeof rawManifest !== "object")
    reject("Native manifest is invalid.");
  const version = (rawManifest as Record<string, unknown>).containerVersion;
  if (version !== 1 && version !== 2)
    reject("Unsupported native project container version.");

  if (version === 1) {
    const manifest = exactKeys(rawManifest, [
      "format", "containerVersion", "documentSchemaVersion", "document", "texture", "sha256"
    ], "manifest.json");
    if (manifest.format !== "3dmc-native" || manifest.documentSchemaVersion !== 2 ||
        manifest.document !== "document.json" || manifest.texture !== "textures/main.png")
      reject("Unsupported legacy native project manifest.");
    if (files.size !== NATIVE_FILES.length ||
        NATIVE_FILES.some(path => !files.has(path)))
      reject("Native v1 archive must contain exactly three source files.");
    const checks = exactKeys(manifest.sha256, ["document.json","textures/main.png"], "manifest.sha256");
    for (const path of NATIVE_FILES.slice(1)) {
      if (typeof checks[path] !== "string" ||
          checks[path] !== await sha256(files.get(path)!))
        reject("Native v1 integrity verification failed: " + path);
    }
    const document = exactKeys(decodeJson(files.get("document.json")!, "document.json"), [
      "schemaVersion", "id", "name", "target", "cuboids", "texture"
    ], "document.json");
    if (document.schemaVersion !== 2) reject("Native v1 document version changed.");
    exactKeys(document.target, ["edition","family","candidateRelease","status"], "document.target");
    const texture = exactKeys(document.texture, [
      "id","name","width","height","path"
    ], "document.texture");
    if (texture.path !== "textures/main.png" || texture.id !== "main")
      reject("Legacy native texture path or ID is unsupported.");
    if (!Array.isArray(document.cuboids))
      reject("Invalid legacy native elements.");
    for (const node of document.cuboids) {
      const c = exactKeys(node, ["id","name","from","to","material","color","visible","locked","faces"], "cuboid");
      const faces = exactKeys(c.faces, ["down","up","north","south","west","east"], "faces");
      for (const face of Object.values(faces))
        exactKeys(face, ["uv","rotation"], "legacy face");
    }
    const png = read3dMcRgbaPng(files.get("textures/main.png")!);
    if (png.width !== texture.width || png.height !== texture.height)
      reject("Legacy native texture dimensions disagree with metadata.");
    return parseDocument({ ...document, texture: { id:"main", name:texture.name,
      width:png.width, height:png.height, pixels:png.pixels } });
  }

  const manifest = exactKeys(rawManifest, [
    "format","containerVersion","documentSchemaVersion","document","textures","sha256"
  ], "manifest.json");
  if (manifest.format !== "3dmc-native" || manifest.documentSchemaVersion !== 3 ||
      manifest.document !== "document.json" || !Array.isArray(manifest.textures) ||
      manifest.textures.length < 1 || manifest.textures.length > 16 ||
      !manifest.textures.every(p => typeof p === "string" &&
        /^textures\/[a-zA-Z0-9_-]{1,100}\.png$/.test(p)) ||
      new Set(manifest.textures).size !== manifest.textures.length)
    reject("Native v2 manifest has unsupported asset references.");

  const paths = ["document.json", ...(manifest.textures as string[])];
  const expected = new Set(["manifest.json", ...paths]);
  if (files.size !== expected.size || [...files.keys()].some(p => !expected.has(p)))
    reject("The native archive contains unknown, extra or missing texture files.");
  const hashes = exactKeys(manifest.sha256, paths, "manifest.sha256");
  for (const path of paths) {
    const hash = hashes[path];
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) ||
        hash !== await sha256(files.get(path)!))
      reject("Native archive SHA-256 integrity failure: " + path);
  }

  const doc = exactKeys(decodeJson(files.get("document.json")!, "document.json"), [
    "schemaVersion","id","name","target","cuboids","textures","activeTextureId"
  ], "document.json");
  if (doc.schemaVersion !== 3 || !Array.isArray(doc.textures) ||
      doc.textures.length !== manifest.textures.length)
    reject("Native v2 document/schema texture count does not agree.");
  exactKeys(doc.target, ["edition","family","candidateRelease","status"], "document.target");
  if (!Array.isArray(doc.cuboids) || doc.cuboids.length > 2000)
    reject("Native document has an invalid number of elements.");
  for (const node of doc.cuboids) {
    const c = exactKeys(node, ["id","name","from","to","material","color","visible","locked","faces"], "cuboid");
    const faces = exactKeys(c.faces, ["down","up","north","south","west","east"], "faces");
    for (const face of Object.values(faces))
      exactKeys(face, ["uv","rotation","textureId"], "face");
  }
  const textures = doc.textures.map((raw,index) => {
    const item = exactKeys(raw, ["id","name","width","height","path"], "texture");
    const path = (manifest.textures as string[])[index]!;
    if (item.path !== path || path !== "textures/" + item.id + ".png")
      reject("Native texture descriptor path is missing or reordered.");
    const png = read3dMcRgbaPng(files.get(path)!);
    if (png.width !== item.width || png.height !== item.height)
      reject("Native source texture dimensions do not match descriptor.");
    return { id:item.id, name:item.name, width:png.width,
      height:png.height, pixels:png.pixels };
  });
  return parseDocument({ ...doc, textures });
}

export function nativeFilename(name: string): string {
  const basename = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64);
  return (basename || "untitled") + NATIVE_EXTENSION;
}

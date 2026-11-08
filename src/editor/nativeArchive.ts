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
const MAX_MANIFEST_BYTES = 4_096;
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

function readExactStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_NATIVE_BYTES)
    reject("Native archive is empty, damaged or exceeds the 3 MB import limit.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (u32(view, end) !== 0x06054b50 || u16(view, end + 20) !== 0 ||
      u16(view, end + 4) !== 0 || u16(view, end + 6) !== 0)
    reject("Native archive requires an unmodified single-disk ZIP directory without comments.");

  const count = u16(view, end + 10);
  if (count !== NATIVE_FILES.length || u16(view, end + 8) !== count)
    reject("Native archive must contain exactly three source files.");

  const centralStart = u32(view, end + 16);
  const centralSize = u32(view, end + 12);
  if (centralStart === 0xffffffff || centralSize === 0xffffffff ||
      centralStart + centralSize !== end)
    reject("Native archive directory offsets are invalid.");

  const allowed = new Set<string>(NATIVE_FILES);
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
    if (next > end || !length || length > 100 || extra || comment ||
        (flags & ~0x0800) !== 0 || method !== 0 || size === 0xffffffff ||
        u32(view, pos + 20) !== size || offset === 0xffffffff)
      reject("Native ZIP contains unsupported compression, metadata or oversized entries.");

    let name: string;
    try { name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + length)); }
    catch { reject("Native archive has an invalid file path."); }
    if (!allowed.has(name) || seen.has(name))
      reject("Native archive includes a missing, duplicate or unexpected path: " + name);
    const max = name === NATIVE_FILES[0] ? MAX_MANIFEST_BYTES :
      name === NATIVE_FILES[1] ? MAX_DOCUMENT_BYTES : MAX_IMAGE_BYTES;
    if (size > max) reject("Native archive file is too large: " + name);
    total += size;
    if (total > MAX_NATIVE_BYTES) reject("Native archive contents exceed the size budget.");

    entries.push({ name, offset, size, crc: u32(view, pos + 16), flags });
    seen.add(name);
    pos = next;
  }
  if (pos !== end || seen.size !== allowed.size)
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
    if (!length || length > 100 || extra || endOfBody > centralStart ||
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
  const texture = encodeRgbaPng(clean.texture.width, clean.texture.height, clean.texture.pixels);
  const { pixels: _pixels, ...textureInfo } = clean.texture;
  const descriptor = encodeJson({
    ...clean,
    texture: { ...textureInfo, path: NATIVE_FILES[2] }
  });
  if (descriptor.length > MAX_DOCUMENT_BYTES)
    reject("Project exceeds the 2.5 MB native document budget.");

  const manifest = encodeJson({
    format: "3dmc-native",
    containerVersion: 1,
    documentSchemaVersion: clean.schemaVersion,
    document: NATIVE_FILES[1],
    texture: NATIVE_FILES[2],
    sha256: {
      [NATIVE_FILES[1]]: await sha256(descriptor),
      [NATIVE_FILES[2]]: await sha256(texture)
    }
  });
  const archive = zipSync({
    [NATIVE_FILES[0]]: manifest,
    [NATIVE_FILES[1]]: descriptor,
    [NATIVE_FILES[2]]: texture
  }, { level: 0, mtime: EMPTY_TIMESTAMP });
  if (archive.byteLength > MAX_NATIVE_BYTES)
    reject("Native project exceeds the 3 MB archive size budget.");
  return archive;
}

export async function decodeNativeProject(data: Uint8Array): Promise<EditorDocument> {
  const files = readExactStoredZip(data);
  const manifest = exactKeys(decodeJson(files.get(NATIVE_FILES[0])!, NATIVE_FILES[0]), [
    "format", "containerVersion", "documentSchemaVersion", "document", "texture", "sha256"
  ], NATIVE_FILES[0]);

  if (manifest.format !== "3dmc-native" || manifest.containerVersion !== 1 ||
      manifest.documentSchemaVersion !== 2 || manifest.document !== NATIVE_FILES[1] ||
      manifest.texture !== NATIVE_FILES[2])
    reject("Unsupported native project container or document version.");

  const checks = exactKeys(manifest.sha256, [NATIVE_FILES[1], NATIVE_FILES[2]], "manifest.sha256");
  for (const path of NATIVE_FILES.slice(1)) {
    const expected = checks[path];
    if (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected) ||
        expected !== await sha256(files.get(path)!))
      reject("Native project integrity check failed: " + path);
  }

  const description = exactKeys(
    decodeJson(files.get(NATIVE_FILES[1])!, NATIVE_FILES[1]),
    ["schemaVersion", "id", "name", "target", "cuboids", "texture"],
    NATIVE_FILES[1]
  );
  if (description.schemaVersion !== 2)
    reject("Native archive document version is not supported.");
  exactKeys(description.target, ["edition", "family", "candidateRelease", "status"], "document.target");
  const textureInfo = exactKeys(description.texture,
    ["id", "name", "width", "height", "path"], "document.texture");
  if (textureInfo.path !== NATIVE_FILES[2])
    reject("Native texture points outside this archive.");

  const cuboids = description.cuboids;
  if (!Array.isArray(cuboids) || cuboids.length > 2000)
    reject("Native document includes an invalid number of cuboids.");
  for (const [index, node] of cuboids.entries()) {
    const c = exactKeys(node, [
      "id", "name", "from", "to", "material", "color", "visible", "locked", "faces"
    ], "document.cuboids[" + index + "]");
    const faces = exactKeys(c.faces,
      ["down", "up", "north", "south", "west", "east"],
      "document.cuboids[" + index + "].faces");
    for (const face of Object.values(faces))
      exactKeys(face, ["uv", "rotation"], "document.face");
  }

  const image = read3dMcRgbaPng(files.get(NATIVE_FILES[2])!);
  if (image.width !== textureInfo.width || image.height !== textureInfo.height)
    reject("Native texture dimensions disagree with the document descriptor.");

  return parseDocument({
    ...description,
    texture: {
      id: textureInfo.id,
      name: textureInfo.name,
      width: image.width, height: image.height,
      pixels: image.pixels
    }
  });
}

export function nativeFilename(name: string): string {
  const basename = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64);
  return (basename || "untitled") + NATIVE_EXTENSION;
}

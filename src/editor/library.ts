import type { EditorDocument } from "./domain";
import { encodeNativeProject, MAX_NATIVE_BYTES } from "./nativeArchive";
import { MAX_NATIVE_PACK_BYTES } from "./nativePackArchive";
import { buildPackZipInWorker } from "./packJobs";
import type { NativePackProject } from "./nativePackArchive";
import type { PackDocument } from "../pack/packDocument";
import { runImportJobInWorker } from "./importJobs";

export const LIBRARY_DATABASE = "3dmc-project-library-v1";
export const MAX_LIBRARY_SNAPSHOTS = 12;
export interface LibraryEntry {
  id: string; label: string; projectName: string; documentId: string;
  savedAt: number; revision: number; byteLength: number; sha256: string;
  /** Pre-v2 local records have no kind and are always standalone native projects. */
  kind?: "document" | "pack";
  modelCount?: number;
}
interface StoredEntry extends LibraryEntry { archive: ArrayBuffer; }
export interface LibraryListing { entries: LibraryEntry[]; damaged: number; }
export type LibraryOpened = { kind: "document"; document: EditorDocument } |
  ({ kind: "pack" } & NativePackProject);
const STORE = "snapshots";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(LIBRARY_DATABASE, 1);
    const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onblocked = () => fail(new Error("The backup library is blocked by another tab. Close the older tab and retry. Your portable download remains available."));
    request.onerror = () => fail(request.error ?? new Error("The local backup library could not be opened."));
    request.onsuccess = () => {
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true; db.onversionchange = () => db.close(); resolve(db);
    };
  });
}
function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore,
  result: (value: T) => void, reject: (error: Error) => void) => void): Promise<T> {
  return openDatabase().then(db => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    try { transaction = db.transaction(STORE, mode); }
    catch (error) { db.close(); reject(error); return; }
    let value: T, complete = false, failure: Error | null = null;
    const abort = (error: Error) => {
      failure = error;
      try { transaction.abort(); } catch { db.close(); reject(error); }
    };
    transaction.oncomplete = () => {
      db.close();
      if (complete) resolve(value); else reject(new Error("The backup transaction completed without a result."));
    };
    transaction.onabort = () => { db.close(); reject(failure ?? transaction.error ?? new Error("The backup transaction was aborted; no success was acknowledged.")); };
    transaction.onerror = () => { failure ??= transaction.error ?? new Error("The local backup operation failed. Download a portable project copy."); };
    try { operation(transaction.objectStore(STORE), next => { value = next; complete = true; }, abort); }
    catch (error) { abort(error instanceof Error ? error : new Error("The backup transaction failed.")); }
  }));
}
export function validateLibraryEntry(value: unknown): LibraryEntry {
  if (!value || typeof value !== "object") throw new Error("Invalid backup metadata.");
  const entry = value as Partial<LibraryEntry>;
  if (typeof entry.id !== "string" || !/^snapshot-[a-f0-9-]{36}$/.test(entry.id) ||
      typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 100 ||
      typeof entry.projectName !== "string" || !entry.projectName || entry.projectName.length > 100 ||
      typeof entry.documentId !== "string" || !entry.documentId || entry.documentId.length > 100 ||
      !Number.isSafeInteger(entry.savedAt) || entry.savedAt! <= 0 ||
      !Number.isSafeInteger(entry.revision) || entry.revision! < 0 ||
      (entry.kind !== undefined && entry.kind !== "document" && entry.kind !== "pack") ||
      !Number.isSafeInteger(entry.byteLength) || entry.byteLength! < 1 ||
      entry.byteLength! > (entry.kind === "pack" ? MAX_NATIVE_PACK_BYTES : MAX_NATIVE_BYTES) ||
      (entry.kind === "pack" ? !Number.isSafeInteger(entry.modelCount) ||
        entry.modelCount! < 1 || entry.modelCount! > 8 : entry.modelCount !== undefined) ||
      typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error("Invalid backup metadata.");
  return { id: entry.id, label: entry.label, projectName: entry.projectName, documentId: entry.documentId,
    savedAt: entry.savedAt!, revision: entry.revision!, byteLength: entry.byteLength!, sha256: entry.sha256,
    ...(entry.kind ? { kind: entry.kind } : {}),
    ...(entry.kind === "pack" ? { modelCount: entry.modelCount } : {}) };
}
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Immutable, explicit snapshots. Never overwrites recovery or other snapshots. */
async function storeSnapshot(archive: Uint8Array, fields: Pick<LibraryEntry,
  "projectName" | "documentId" | "revision" | "kind" | "modelCount">, label: string): Promise<LibraryEntry> {
  const metadata = validateLibraryEntry({
    id: "snapshot-" + crypto.randomUUID(), label: label.trim(),
    ...fields, savedAt: Date.now(), byteLength: archive.length, sha256: await digest(archive)
  });
  const record: StoredEntry = { ...metadata, archive: new Uint8Array(archive).buffer };
  return transact("readwrite", (store, result, reject) => {
    const count = store.count();
    count.onsuccess = () => {
      if (count.result >= MAX_LIBRARY_SNAPSHOTS) {
        reject(new Error("The library has 12 snapshots. Download and explicitly delete one before adding another; nothing is automatically evicted.")); return;
      }
      const add = store.add(record);
      add.onsuccess = () => result(metadata);
    };
  });
}

export async function saveLibrarySnapshot(
  source: EditorDocument, revision: number, label = source.name
): Promise<LibraryEntry> {
  const archive = await encodeNativeProject(source);
  return storeSnapshot(archive, {
    projectName: source.name, documentId: source.id, revision, kind: "document"
  }, label);
}

/** Pack snapshots contain every model, texture and editable raster layer in one v3 archive. */
export async function savePackLibrarySnapshot(
  pack: PackDocument, sources: readonly EditorDocument[], revision: number, label = pack.name
): Promise<LibraryEntry> {
  const archive = await buildPackZipInWorker("native", pack, [...sources]);
  return storeSnapshot(archive, {
    projectName: pack.name, documentId: pack.id, revision,
    kind: "pack", modelCount: pack.models.length
  }, label);
}
export function listLibrarySnapshots(): Promise<LibraryListing> {
  return transact("readonly", (store, result, reject) => {
    const entries: LibraryEntry[] = []; let damaged = 0;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { result({ entries: entries.sort((a, b) => b.savedAt - a.savedAt), damaged }); return; }
      if (entries.length + damaged >= MAX_LIBRARY_SNAPSHOTS) { reject(new Error("Library exceeds its bounded snapshot limit. Existing records were not changed.")); return; }
      try { entries.push(validateLibraryEntry(cursor.value)); } catch { damaged++; }
      cursor.continue();
    };
  });
}
async function readSnapshot(entry: LibraryEntry): Promise<Uint8Array> {
  const bytes = await transact<Uint8Array>("readonly", (store, result, reject) => {
    const request = store.get(entry.id);
    request.onsuccess = () => {
      try {
        const metadata = validateLibraryEntry(request.result), raw = request.result as StoredEntry;
        if (metadata.sha256 !== entry.sha256 || metadata.kind !== entry.kind ||
            metadata.modelCount !== entry.modelCount ||
            !(raw.archive instanceof ArrayBuffer) || raw.archive.byteLength !== metadata.byteLength)
          throw new Error("The backup changed or is damaged. The active project was not replaced.");
        result(new Uint8Array(raw.archive));
      } catch (error) { reject(error instanceof Error ? error : new Error("The backup could not be read.")); }
    };
  });
  if (await digest(bytes) !== entry.sha256) throw new Error("The backup checksum failed. The damaged snapshot is preserved and your active project is unchanged.");
  return bytes;
}
/** Decode in a worker and verify that the archive still agrees with its stored identity. */
async function verifyArchive(entry: LibraryEntry, bytes: Uint8Array): Promise<LibraryOpened> {
  const result = await runImportJobInWorker(entry.kind === "pack"
    ? { kind: "pack", bytes }
    : { kind: "single", bytes });
  if (result.kind === "pack" && entry.kind === "pack" &&
      result.project.pack.id === entry.documentId &&
      result.project.pack.models.length === entry.modelCount &&
      result.project.pack.name === entry.projectName)
    return { kind: "pack", ...result.project };
  if (result.kind === "document" && entry.kind !== "pack" &&
      result.document.id === entry.documentId &&
      result.document.name === entry.projectName)
    return { kind: "document", document: result.document };
  throw new Error("The backup metadata does not match its verified source. Your workspace was not replaced.");
}

export async function openLibrarySnapshot(entry: LibraryEntry): Promise<LibraryOpened> {
  return verifyArchive(entry, await readSnapshot(entry));
}
export async function downloadLibraryBytes(entry: LibraryEntry): Promise<Uint8Array> {
  const bytes = await readSnapshot(entry);
  // The verification worker takes ownership of its bytes. Retain the checked copy for download.
  await verifyArchive(entry, new Uint8Array(bytes));
  return bytes;
}
function changeEntry(entry: LibraryEntry, operation: (store: IDBObjectStore, record: StoredEntry) => IDBRequest): Promise<void> {
  return transact<void>("readwrite", (store, result, reject) => {
    const request = store.get(entry.id);
    request.onsuccess = () => {
      try {
        const current = validateLibraryEntry(request.result);
        if (current.sha256 !== entry.sha256 || current.label !== entry.label)
          throw new Error("This backup changed in another tab. Refresh the library before changing it.");
        const change = operation(store, request.result as StoredEntry); change.onsuccess = () => result(undefined);
      } catch (error) { reject(error instanceof Error ? error : new Error("The backup was not changed.")); }
    };
  });
}
export function renameLibrarySnapshot(entry: LibraryEntry, label: string): Promise<void> {
  const normalized = label.trim();
  if (!normalized || normalized.length > 100) return Promise.reject(new Error("Use a backup label of 1–100 characters."));
  return changeEntry(entry, (store, record) => store.put({ ...record, label: normalized }));
}
export function deleteLibrarySnapshot(entry: LibraryEntry): Promise<void> {
  return changeEntry(entry, store => store.delete(entry.id));
}

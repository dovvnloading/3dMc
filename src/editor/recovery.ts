import type { EditorDocument } from "./domain";
import { decodeProject, encodeProject } from "./project";

interface Checkpoint {
  key: "latest" | "previous";
  contents: string;
  digest: string;
  revision: number;
  savedAt: string;
}

export interface RecoveryCandidate {
  document: EditorDocument;
  revision: number;
  savedAt: string;
  fallback: boolean;
}

const DATABASE = "3dmc-recovery-v1";
const STORE = "checkpoints";
let queue: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable.")); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open recovery storage."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function digest(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function publish(entry: Checkpoint): Promise<void> {
  return openDatabase().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const old = store.get("latest");
    old.onsuccess = () => {
      const previous = old.result as Checkpoint | undefined;
      if (previous) store.put({ ...previous, key: "previous" });
      store.put(entry);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Recovery write failed.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Recovery transaction aborted.")); };
  }));
}

/**
 * Single-tab S0 checkpoint queue. Each atomic write publishes complete content;
 * previous remains available when the latest is corrupt. A multi-tab writer
 * lease/generation fence is still required before production recovery claims.
 */
export function saveRecovery(document: EditorDocument, revision: number): Promise<void> {
  // Reserve publication order synchronously, before the asynchronous digest.
  // Otherwise revision N+1 can hash faster and publish before revision N.
  const contents = encodeProject(document);
  const operation = queue.catch(() => undefined).then(async () => {
    const entry: Checkpoint = {
      key: "latest", contents, revision, digest: await digest(contents),
      savedAt: new Date().toISOString()
    };
    await publish(entry);
  });
  queue = operation;
  return operation;
}

export async function readRecovery(): Promise<RecoveryCandidate | null> {
  const db = await openDatabase();
  const records = await new Promise<(Checkpoint | undefined)[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const latest = store.get("latest");
    const previous = store.get("previous");
    tx.oncomplete = () => resolve([
      latest.result as Checkpoint | undefined,
      previous.result as Checkpoint | undefined
    ]);
    tx.onerror = () => reject(tx.error ?? new Error("Could not read recovery data."));
  }).finally(() => db.close());

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || typeof record.contents !== "string" || record.contents.length > 1_500_000) continue;
    try {
      if (await digest(record.contents) !== record.digest) continue;
      return { document: decodeProject(record.contents), revision: record.revision,
        savedAt: record.savedAt, fallback: i > 0 };
    } catch { /* Try the previous acknowledged checkpoint. */ }
  }
  return null;
}

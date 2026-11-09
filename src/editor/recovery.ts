import type { EditorDocument } from "./domain";
import { decodeProject, encodeProject, MAX_PROJECT_BYTES } from "./project";

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

export interface RecoveryLease {
  ownerId: string;
  generation: number;
  expiresAt: number;
}

export type RecoveryClaim =
  | { granted: true; lease: RecoveryLease }
  | { granted: false; expiresAt: number };

export class RecoveryOwnershipLost extends Error {
  constructor() {
    super("This tab no longer owns local recovery. Download a backup or explicitly take over editing.");
    this.name = "RecoveryOwnershipLost";
  }
}

/** The editor must never acknowledge a checkpoint its own reader would reject. */
export class RecoverySnapshotTooLarge extends Error {
  constructor(readonly actualBytes: number) {
    super(`Local recovery snapshot (${(actualBytes / 1_000_000).toFixed(2)} MB) exceeds the 1.5 MB limit. Download a .3dmc source backup; these changes were not saved locally.`);
    this.name = "RecoverySnapshotTooLarge";
  }
}

const DATABASE = "3dmc-recovery-v1";
const STORE = "checkpoints";
const OWNERS = "ownership";
const LEASE_MS = 20_000;
const OWNER_KEY = "writer";
let queue: Promise<void> = Promise.resolve();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("IndexedDB is unavailable.")); return; }
    // An upgrade preserves all v1 checkpoints in place. Ownership lives in a
    // separate object store so the writer and its checkpoint can share a tx.
    const request = indexedDB.open(DATABASE, 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "key" });
      if (!request.result.objectStoreNames.contains(OWNERS))
        request.result.createObjectStore(OWNERS, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open recovery storage."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("An older tab is blocking the recovery database upgrade."));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function digest(contents: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Secure digest support is unavailable.");
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents));
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface OwnershipRow extends RecoveryLease { key: typeof OWNER_KEY }

function sameLease(row: OwnershipRow | undefined, lease: RecoveryLease, now: number): boolean {
  return !!row && row.ownerId === lease.ownerId &&
    row.generation === lease.generation && row.expiresAt > now;
}

function ownershipTransaction<T>(
  decide: (row: OwnershipRow | undefined, store: IDBObjectStore, now: number) => T
): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(OWNERS, "readwrite");
    const store = tx.objectStore(OWNERS);
    let result: T;
    let decided = false;
    let failure: unknown;
    const request = store.get(OWNER_KEY);
    request.onsuccess = () => {
      try {
        result = decide(request.result as OwnershipRow | undefined, store, Date.now());
        decided = true;
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); if (decided) resolve(result); else reject(new Error("Recovery ownership transaction did not complete.")); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Recovery ownership transaction failed.")); };
    tx.onabort = () => { db.close(); reject(failure ?? tx.error ?? new Error("Recovery ownership transaction was aborted.")); };
  }));
}

/** A tab must actively claim ownership before writing checkpoints. */
export function claimRecoveryWriter(ownerId: string, takeOver = false): Promise<RecoveryClaim> {
  if (!ownerId || ownerId.length > 100) return Promise.reject(new Error("Invalid writer identity."));
  return ownershipTransaction((row, store, now) => {
    if (row && row.ownerId !== ownerId && row.expiresAt > now && !takeOver)
      return { granted: false, expiresAt: row.expiresAt } as RecoveryClaim;
    const generation = row?.ownerId === ownerId && row.expiresAt > now
      ? row.generation : (row?.generation ?? 0) + 1;
    const lease: RecoveryLease = { ownerId, generation, expiresAt: now + LEASE_MS };
    store.put({ key: OWNER_KEY, ...lease } satisfies OwnershipRow);
    return { granted: true, lease } as RecoveryClaim;
  });
}

/** Browser focus and heartbeat renewal never reclaims a lease it lost. */
export function renewRecoveryWriter(lease: RecoveryLease): Promise<RecoveryLease | null> {
  return ownershipTransaction((row, store, now) => {
    if (!sameLease(row, lease, now)) return null;
    const updated = { ...lease, expiresAt: now + LEASE_MS };
    store.put({ key: OWNER_KEY, ...updated } satisfies OwnershipRow);
    return updated;
  });
}

/** A new source project gets a fresh generation; pending saves become stale. */
export function rotateRecoveryWriter(lease: RecoveryLease): Promise<RecoveryLease> {
  return ownershipTransaction((row, store, now) => {
    if (!sameLease(row, lease, now)) throw new RecoveryOwnershipLost();
    const updated: RecoveryLease = {
      ...lease, generation: lease.generation + 1, expiresAt: now + LEASE_MS
    };
    store.put({ key: OWNER_KEY, ...updated } satisfies OwnershipRow);
    return updated;
  });
}

function publish(entry: Checkpoint, lease: RecoveryLease): Promise<void> {
  return openDatabase().then((db) => new Promise<void>((resolve, reject) => {
    // The ownership check and checkpoint publication are in the SAME IDB
    // transaction. No suspended or displaced tab can race this atomic fence.
    const tx = db.transaction([OWNERS, STORE], "readwrite");
    const ownerStore = tx.objectStore(OWNERS);
    const checkpointStore = tx.objectStore(STORE);
    let lostOwnership = false;
    let writeFailure: unknown;
    const owner = ownerStore.get(OWNER_KEY);
    owner.onsuccess = () => {
      if (!sameLease(owner.result as OwnershipRow | undefined, lease, Date.now())) {
        lostOwnership = true;
        return;
      }
      const old = checkpointStore.get("latest");
      old.onsuccess = () => {
        try {
          const previous = old.result as Checkpoint | undefined;
          if (previous) checkpointStore.put({ ...previous, key: "previous" });
          checkpointStore.put(entry);
        } catch (error) {
          // A quota or storage exception must abort the entire transaction,
          // preserving both acknowledged checkpoints and surfacing failure.
          writeFailure = error;
          tx.abort();
        }
      };
    };
    tx.oncomplete = () => {
      db.close();
      if (lostOwnership) reject(new RecoveryOwnershipLost());
      else resolve();
    };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Recovery write failed.")); };
    tx.onabort = () => {
      db.close();
      reject(writeFailure ?? tx.error ?? new Error("Recovery transaction aborted."));
    };
  }));
}

/**
 * Per-tab sequencing is reserved before hashing; cross-tab serialization is
 * supplied by the generation check inside publish(). An old queued write may
 * fail safely but can never publish after a later ownership takeover.
 */
export async function saveRecovery(
  document: EditorDocument, revision: number, lease: RecoveryLease
): Promise<void> {
  // Encode/validate before taking a place in the write queue or opening an
  // IndexedDB transaction. readRecovery refuses records above this same byte
  // limit, so accepting one here would produce a false "saved" confirmation.
  if (!Number.isSafeInteger(revision) || revision < 0)
    throw new Error("Recovery revision must be a nonnegative safe integer.");
  const contents = encodeProject(document);
  const byteLength = new TextEncoder().encode(contents).byteLength;
  if (byteLength > MAX_PROJECT_BYTES) throw new RecoverySnapshotTooLarge(byteLength);
  const operation = queue.catch(() => undefined).then(async () => {
    const entry: Checkpoint = {
      key: "latest", contents, revision,
      digest: await digest(contents), savedAt: new Date().toISOString()
    };
    await publish(entry, lease);
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
    tx.onerror = () => reject(tx.error ?? new Error(
      "Recovery read transaction failed or was aborted."
    ));
    tx.onabort = () => reject(tx.error ?? new Error("Recovery read transaction aborted."));
  }).finally(() => db.close());

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (!record || typeof record.contents !== "string" ||
        !Number.isSafeInteger(record.revision) || record.revision < 0 ||
        typeof record.savedAt !== "string" ||
        !Number.isFinite(Date.parse(record.savedAt)) ||
        new TextEncoder().encode(record.contents).byteLength > MAX_PROJECT_BYTES) continue;
    try {
      if (await digest(record.contents) !== record.digest) continue;
      const document = decodeProject(record.contents);
      return { document, revision: record.revision,
        savedAt: record.savedAt, fallback: i > 0 };
    } catch { /* Fall back to the previous independently validated checkpoint. */ }
  }
  return null;
}

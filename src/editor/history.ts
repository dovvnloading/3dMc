import type { EditorDocument } from "./domain";

export interface History {
  present: EditorDocument;
  past: EditorDocument[];
  future: EditorDocument[];
  /** Monotonic for all committed operations, including undo and redo. */
  revision: number;
}

const MAX_ENTRIES = 50;
/** Soft cap on retained unique raster RGBA array memory in JS snapshots. */
export const MAX_HISTORY_PIXEL_BYTES = 32_000_000;

/**
 * Bound immutable history by unique pixel-buffer references, preserving
 * structural sharing. Retain the most recent undo even if a single source
 * is larger than the soft limit.
 */
export function trimHistorySnapshots<T>(entries: readonly T[], current: T,
  documents: (snapshot: T) => readonly EditorDocument[],
  budget = MAX_HISTORY_PIXEL_BYTES): T[] {
  const history = entries.slice(-MAX_ENTRIES);
  const memory = (snapshots: readonly T[]) => {
    const unique = new Set<readonly number[]>();
    let total = 0;
    for (const snapshot of snapshots) for (const doc of documents(snapshot)) {
      for (const texture of doc.textures) {
        for (const pixels of [texture.pixels, ...(texture.layers ?? []).map(l => l.pixels)]) {
          if (!unique.has(pixels)) { unique.add(pixels); total += pixels.length * 8; }
        }
      }
    }
    return total;
  };
  while (history.length > 1 && memory([...history, current]) > budget)
    history.shift();
  return history;
}


export const createHistory = (present: EditorDocument): History =>
  ({ present, past: [], future: [], revision: 0 });

export function commit(history: History, next: EditorDocument): History {
  if (next === history.present) return history;
  return {
    present: next,
    past: trimHistorySnapshots([...history.past, history.present], next, doc => [doc]),
    future: [],
    revision: history.revision + 1
  };
}

export function undo(history: History): History {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1]!;
  return {
    present: previous, past: history.past.slice(0, -1),
    future: [history.present, ...history.future],
    revision: history.revision + 1
  };
}

export function redo(history: History): History {
  if (!history.future.length) return history;
  return {
    present: history.future[0]!,
    past: trimHistorySnapshots([...history.past, history.present], history.future[0]!, doc => [doc]),
    future: history.future.slice(1),
    revision: history.revision + 1
  };
}

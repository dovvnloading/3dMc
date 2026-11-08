import type { EditorDocument } from "./domain";

export interface History {
  present: EditorDocument;
  past: EditorDocument[];
  future: EditorDocument[];
  /** Monotonic for all committed operations, including undo and redo. */
  revision: number;
}

const MAX_ENTRIES = 50;

export const createHistory = (present: EditorDocument): History =>
  ({ present, past: [], future: [], revision: 0 });

export function commit(history: History, next: EditorDocument): History {
  if (next === history.present) return history;
  return {
    present: next,
    past: [...history.past, history.present].slice(-MAX_ENTRIES),
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
    past: [...history.past, history.present].slice(-MAX_ENTRIES),
    future: history.future.slice(1),
    revision: history.revision + 1
  };
}

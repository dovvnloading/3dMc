import { parseDocument } from "./domain";
import type { EditorDocument } from "./domain";

export const MAX_PROJECT_BYTES = 1_500_000;
export const EXTENSION = ".3dmc.json"; // Transitional S0 file, not the planned ZIP .3dmc container.

export function encodeProject(doc: EditorDocument): string {
  return JSON.stringify(parseDocument(doc));
}

export function decodeProject(text: string): EditorDocument {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES)
    throw new Error("The project exceeds the current 1.5 MB import limit.");
  let value: unknown;
  try { value = JSON.parse(text) as unknown; }
  catch { throw new Error("This file is not valid project JSON."); }
  return parseDocument(value);
}

export function safeFilename(name: string): string {
  const basename = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 64);
  return (basename || "asset") + EXTENSION;
}

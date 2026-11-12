import type { EditorDocument } from "./domain";
import { isHex } from "./domain";

export const DEFAULT_PALETTE: readonly string[] = [
  "#f5d184", "#80dbbf", "#bb8870", "#c76d68",
  "#aebce2", "#f1f2f6", "#384f49", "#222e38"
];
export const MAX_PALETTE_COLORS = 16;

/** Palette is editor-only source metadata, not a Minecraft texture export. */
export function paletteColors(document: EditorDocument): readonly string[] {
  return document.palette ?? DEFAULT_PALETTE;
}

export function addPaletteColor(document: EditorDocument, color: string): EditorDocument {
  if (!isHex(color)) return document;
  const current = paletteColors(document);
  const next = color.toLowerCase();
  if (current.some(item => item.toLowerCase() === next) ||
      current.length >= MAX_PALETTE_COLORS) return document;
  return { ...document, palette: [...current, next] };
}

export function removePaletteColor(document: EditorDocument, color: string): EditorDocument {
  const current = paletteColors(document);
  if (current.length <= 1 || !current.some(item => item.toLowerCase() === color.toLowerCase()))
    return document;
  return { ...document, palette: current.filter(item =>
    item.toLowerCase() !== color.toLowerCase()) };
}

export function movePaletteColor(document: EditorDocument, color: string,
                                 direction: "left" | "right"): EditorDocument {
  const current = paletteColors(document);
  const index = current.findIndex(item => item.toLowerCase() === color.toLowerCase());
  const target = index + (direction === "left" ? -1 : 1);
  if (index < 0 || target < 0 || target >= current.length) return document;
  const next = [...current];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return { ...document, palette: next };
}

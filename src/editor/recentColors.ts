import { normalizeHex } from "./color";

export const MAX_RECENT_COLORS = 12;

/** Session-only list of distinct colours that actually changed painted pixels. */
export function addRecentColor(previous: readonly string[], paintedColor: string): readonly string[] {
  const color = normalizeHex(paintedColor);
  if (!color) return previous;
  if (previous[0] === color) return previous;
  return [color, ...previous.filter(item => item.toLowerCase() !== color)]
    .slice(0, MAX_RECENT_COLORS);
}

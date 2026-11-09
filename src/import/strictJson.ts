/** Bounded JSON with duplicate-key rejection; JSON.parse alone loses that evidence. */
export function parseStrictJson(text: string, label: string, maxBytes = 1_000_000): unknown {
  if (text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes)
    throw new Error(`${label}: JSON exceeds the ${maxBytes}-byte limit.`);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${label}: Invalid JSON.`); }
  let offset = 0;
  const whitespace = () => { while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < text.length) {
      const character = text[offset++];
      if (character === "\\") offset++;
      else if (character === '"') return JSON.parse(text.slice(start, offset)) as string;
    }
    throw new Error(`${label}: Unterminated string.`);
  };
  const visit = (depth: number) => {
    if (depth > 64) throw new Error(`${label}: JSON nesting exceeds 64 levels.`);
    whitespace();
    if (text[offset] === "{") {
      offset++; whitespace(); const keys = new Set<string>();
      while (text[offset] !== "}") {
        const key = string();
        if (keys.has(key)) throw new Error(`${label}: Duplicate JSON field “${key}” is not accepted.`);
        keys.add(key); whitespace(); offset++; visit(depth + 1); whitespace();
        if (text[offset] === ",") { offset++; whitespace(); } else break;
      }
      offset++;
    } else if (text[offset] === "[") {
      offset++; whitespace();
      while (text[offset] !== "]") {
        visit(depth + 1); whitespace();
        if (text[offset] === ",") { offset++; whitespace(); } else break;
      }
      offset++;
    } else if (text[offset] === '"') string();
    else while (offset < text.length && !/[\s,}\]]/.test(text[offset]!)) offset++;
  };
  visit(0);
  return parsed;
}

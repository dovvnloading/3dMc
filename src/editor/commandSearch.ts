import type { EditorCommand } from "./commands";

function normalize(text: string): string {
  return text.toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

function tokenScore(token: string, value: string): number {
  if (!value) return 0;
  if (value === token) return 120;
  if (value.startsWith(token)) return 90;
  if (value.split(/[^a-z0-9]+/).some(word => word.startsWith(token))) return 65;
  return value.includes(token) ? 30 : 0;
}

/** All query words must match. Exact titles win over prefixes and substrings;
 * ties preserve registry order. Disabled entries remain searchable. */
export function filterEditorCommands(commands: readonly EditorCommand[], search: string): EditorCommand[] {
  const query = normalize(search);
  if (!query) return [...commands];
  const words = query.split(" ");
  return commands.map((command, index) => {
    const title = normalize(command.title);
    const fields: readonly [string, number][] = [
      [title, 5],
      [normalize(command.keywords?.join(" ") ?? ""), 2],
      [normalize(command.category), 1],
      [normalize(command.id.replace(/[.-]/g, " ")), 1]
    ];
    let score = title === query ? 1000 : 0;
    for (const word of words) {
      const matching = Math.max(...fields.map(([value, weight]) => tokenScore(word, value) * weight));
      if (!matching) return { command, index, score: -1 };
      score += matching;
    }
    return { command, index, score };
  }).filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || Number(b.command.enabled) - Number(a.command.enabled) || a.index - b.index)
    .map(item => item.command);
}

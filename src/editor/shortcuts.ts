import type { EditorCommand, ShortcutArea } from "./commands";

/** The shortcut reference renders registry data, including disabled actions and alternate keys. */
export const SHORTCUT_AREAS: readonly ShortcutArea[] =
  ["Project", "Edit", "Model tools", "Paint tools", "View"];

export interface ShortcutEntry {
  id: string;
  title: string;
  shortcuts: readonly string[];
}
export interface ShortcutGroup {
  area: ShortcutArea;
  entries: ShortcutEntry[];
}

export function groupEditorShortcuts(commands: readonly EditorCommand[]): ShortcutGroup[] {
  return SHORTCUT_AREAS.map(area => ({
    area,
    entries: commands.filter(command => command.shortcut && command.shortcutArea === area)
      .map(command => ({
        id: command.id,
        title: command.title,
        shortcuts: [command.shortcut!, ...(command.alternateShortcuts ?? [])]
      }))
  }));
}

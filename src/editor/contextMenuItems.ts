import type { EditorCommand } from "./commands";

export type ContextMenuSurface = "element" | "group" | "empty";
export interface ContextMenuItem {
  command: EditorCommand;
  label: string;
}

const compactLabels: Record<string, string> = {
  "edit.rename": "Rename",
  "edit.rename-group": "Rename",
  "edit.duplicate": "Duplicate",
  "edit.delete": "Delete",
  "edit.group": "Group",
  "edit.ungroup": "Ungroup",
  "edit.select-all": "Select all"
};

/** Only choose registry entries: no menu-local action or duplicate enabled logic. */
export function buildContextMenuItems(commands: readonly EditorCommand[],
  surface: ContextMenuSurface, selectionIsGroup = false): ContextMenuItem[] {
  const byId = new Map(commands.map(command => [command.id, command]));
  // Applicability is independent of enabled state: a read-only group still
  // needs to show a disabled Ungroup action, not a misleading Group action.
  const groupAction = surface === "group" || selectionIsGroup ? "edit.ungroup" : "edit.group";
  const ids = surface === "empty"
    ? ["edit.select-all", "view.frame-all", "view.iso", "view.front", "view.right", "view.top"]
    : [surface === "group" ? "edit.rename-group" : "edit.rename",
      "edit.duplicate", "edit.delete", "edit.visibility", "edit.lock", groupAction, "view.frame"];
  return ids.flatMap(id => {
    const command = byId.get(id);
    if (!command) throw new Error("Missing context menu command: " + id);
    return [{ command, label: compactLabels[id] ?? command.title.replace(/^View: /, "") }];
  });
}

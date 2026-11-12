import type { EditorDocument } from "./domain";
import { editableSelection, SelectionEditError } from "./selection";

/** Grouping only organizes source parts. It never transforms geometry or game output. */
export function groupSelection(document: EditorDocument, ids: readonly string[],
                               groupId: string, name: string): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (nodes.length < 2)
    throw new SelectionEditError("Select at least two editable parts to create a group.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(groupId) ||
      document.groups?.some(group => group.id === groupId))
    throw new SelectionEditError("Group identity is missing or already exists.");
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 100)
    throw new SelectionEditError("Group names must contain 1–100 characters.");
  const members = new Set(nodes.map(node => node.id));
  const retained = (document.groups ?? []).map(group => ({
    ...group, memberIds: group.memberIds.filter(id => !members.has(id))
  })).filter(group => group.memberIds.length > 0);
  if (retained.length >= 100)
    throw new SelectionEditError("The source supports at most 100 groups.");
  return { ...document, groups: [
    ...retained, { id: groupId, name: cleanName, memberIds: nodes.map(node => node.id) }
  ] };
}

/** Name edits and ungrouping are metadata-only single history entries. */
export function renameGroup(document: EditorDocument, groupId: string,
                            name: string): EditorDocument {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 100)
    throw new SelectionEditError("Group names must contain 1–100 characters.");
  const group = document.groups?.find(item => item.id === groupId);
  if (!group) throw new SelectionEditError("The selected group no longer exists.");
  if (group.name === cleanName) return document;
  return { ...document, groups: document.groups!.map(item =>
    item.id === groupId ? { ...item, name: cleanName } : item) };
}

export function ungroup(document: EditorDocument, groupId: string): EditorDocument {
  if (!document.groups?.some(group => group.id === groupId))
    throw new SelectionEditError("The selected group no longer exists.");
  return { ...document, groups: document.groups.filter(group => group.id !== groupId) };
}

import type { Axis, Cuboid, EditorDocument, Vec3 } from "./domain";
import { copyFaces, isValidCuboid } from "./domain";

/** Selection belongs to the session, never the native document or undo history. */
export interface Selection {
  readonly ids: readonly string[];
  readonly primary: string | null;
  readonly anchor: string | null;
}
export interface SelectionModifiers {
  readonly toggle?: boolean;
  readonly range?: boolean;
}
export const emptySelection = (): Selection => ({ ids: [], primary: null, anchor: null });
export const selectOnly = (id: string | null): Selection => id === null ? emptySelection() :
  { ids: [id], primary: id, anchor: id };

export function reconcileSelection(selection: Selection, available: readonly string[]): Selection {
  const allowed = new Set(available);
  const ids = selection.ids.filter((id, index, all) => allowed.has(id) && all.indexOf(id) === index);
  const primary = selection.primary && ids.includes(selection.primary) ? selection.primary : ids.at(-1) ?? null;
  const anchor = selection.anchor && allowed.has(selection.anchor) ? selection.anchor : primary;
  if (ids.length === selection.ids.length && ids.every((id, i) => id === selection.ids[i]) &&
      primary === selection.primary && anchor === selection.anchor) return selection;
  return { ids, primary, anchor };
}

/** Range order is the current filtered hierarchy, not a stale array index. */
export function selectAt(selection: Selection, id: string, order: readonly string[],
  modifiers: SelectionModifiers = {}): Selection {
  if (!order.includes(id)) return selection;
  if (modifiers.range) {
    const anchor = selection.anchor && order.includes(selection.anchor) ? selection.anchor : id;
    const a = order.indexOf(anchor), b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const ids = modifiers.toggle ? [...new Set([...selection.ids, ...range])] : [...range];
    return { ids, primary: id, anchor };
  }
  if (modifiers.toggle) {
    const ids = selection.ids.includes(id) ? selection.ids.filter(item => item !== id) : [...selection.ids, id];
    return { ids, primary: ids.includes(id) ? id : ids.at(-1) ?? null, anchor: id };
  }
  return selectOnly(id);
}

export class SelectionEditError extends Error {
  constructor(message: string) { super(message); this.name = "SelectionEditError"; }
}

export interface SelectionBounds { readonly from: Vec3; readonly to: Vec3; readonly center: Vec3; readonly size: Vec3; }
export function selectionBounds(nodes: readonly Cuboid[]): SelectionBounds | null {
  if (!nodes.length) return null;
  const from: [number, number, number] = [Infinity, Infinity, Infinity];
  const to: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const node of nodes) for (const axis of [0, 1, 2] as const) {
    from[axis] = Math.min(from[axis], node.from[axis]);
    to[axis] = Math.max(to[axis], node.to[axis]);
  }
  return { from, to, center: from.map((v, a) => (v + to[a]!) / 2) as unknown as Vec3,
    size: from.map((v, a) => to[a]! - v) as unknown as Vec3 };
}

/** No partial edit: missing, hidden or locked members reject the complete batch. */
export function editableSelection(document: EditorDocument, ids: readonly string[]): Cuboid[] {
  const wanted = new Set(ids);
  const nodes = document.cuboids.filter(node => wanted.has(node.id));
  if (nodes.length !== wanted.size) throw new SelectionEditError("The selection changed. Select the parts again before editing.");
  const protectedNode = nodes.find(node => node.locked || !node.visible);
  if (protectedNode) throw new SelectionEditError(
    `“${protectedNode.name}” is ${protectedNode.locked ? "locked" : "hidden"}. Unlock/show it or remove it from the selection. No parts were changed.`
  );
  return nodes;
}

function publish(document: EditorDocument, replacements: readonly Cuboid[]): EditorDocument {
  if (replacements.some(node => !isValidCuboid(node))) throw new SelectionEditError(
    "The complete edit was rejected: every part must have positive size up to 64 units and coordinates within −256…256. No parts were changed."
  );
  const byId = new Map(replacements.map(node => [node.id, node]));
  let changed = false;
  const cuboids = document.cuboids.map(node => {
    const next = byId.get(node.id);
    if (!next || (node.from.every((n, a) => n === next.from[a]) &&
        node.to.every((n, a) => n === next.to[a]))) return node;
    changed = true;
    return next;
  });
  return changed ? { ...document, cuboids } : document;
}
const finite = (v: Vec3) => v.every(Number.isFinite);
const rounded = (n: number) => Math.round(n * 10000) / 10000;

/** Affine transform around a shared model-space pivot. Preview is never persisted. */
export function transformSelection(document: EditorDocument, ids: readonly string[],
  translation: Vec3, scale: Vec3 = [1, 1, 1], pivot?: Vec3): EditorDocument {
  if (!finite(translation) || !finite(scale) || scale.some(n => n <= 0) || (pivot && !finite(pivot)))
    throw new SelectionEditError("Use finite translation and positive scale values. No parts were changed.");
  const nodes = editableSelection(document, ids);
  const bounds = selectionBounds(nodes);
  if (!bounds || (translation.every(n => n === 0) && scale.every(n => n === 1))) return document;
  const origin = pivot ?? bounds.center;
  const point = (values: Vec3): Vec3 => values.map((value, axis) =>
    rounded(origin[axis]! + (value - origin[axis]!) * scale[axis]! + translation[axis]!)
  ) as unknown as Vec3;
  return publish(document, nodes.map(node => ({ ...node, from: point(node.from), to: point(node.to) })));
}

/** Position moves the whole selection; size scales it about its minimum corner. */
export function setSelectionBounds(document: EditorDocument, ids: readonly string[],
  property: "position" | "size", axis: Axis, value: number): EditorDocument {
  if (!Number.isFinite(value) || (property === "size" && value <= 0))
    throw new SelectionEditError("Enter a finite value; selection size must be positive.");
  const bounds = selectionBounds(editableSelection(document, ids));
  if (!bounds) return document;
  const delta: [number, number, number] = [0, 0, 0];
  const scale: [number, number, number] = [1, 1, 1];
  if (property === "position") delta[axis] = value - bounds.from[axis];
  else scale[axis] = value / bounds.size[axis];
  return transformSelection(document, ids, delta, scale, bounds.from);
}


/** Align bounding box edges or centers without resizing any part or changing UVs. */
export function alignSelection(document: EditorDocument, ids: readonly string[],
  axis: Axis, edge: "minimum" | "center" | "maximum"): EditorDocument {
  const nodes = editableSelection(document, ids);
  const bounds = selectionBounds(nodes);
  if (!bounds || nodes.length < 2) return document;
  const target = edge === "minimum" ? bounds.from[axis] :
    edge === "maximum" ? bounds.to[axis] : bounds.center[axis];
  const edgeOf = (node: Cuboid) => edge === "minimum" ? node.from[axis] :
    edge === "maximum" ? node.to[axis] : (node.from[axis] + node.to[axis]) / 2;
  const moved = nodes.map(node => shiftPart(node, axis, target - edgeOf(node)));
  return publish(document, moved);
}

/** Keep the outermost centers fixed and space intermediate centers evenly. */
export function distributeSelection(document: EditorDocument, ids: readonly string[],
  axis: Axis): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (nodes.length < 3) return document;
  const center = (node: Cuboid) => (node.from[axis] + node.to[axis]) / 2;
  // ES stable sort retains scene order as the tie breaker.
  const ordered = [...nodes].sort((a, b) => center(a) - center(b));
  const first = center(ordered[0]!), last = center(ordered[ordered.length - 1]!);
  if (first === last) return document;
  const spaced = ordered.map((node, index) =>
    shiftPart(node, axis, first + (last - first) * index / (ordered.length - 1) - center(node)));
  return publish(document, spaced);
}

function shiftPart(node: Cuboid, axis: Axis, offset: number): Cuboid {
  if (offset === 0) return node;
  const shift = (values: Vec3): Vec3 => values.map((value, a) =>
    a === axis ? rounded(value + offset) : value) as unknown as Vec3;
  return { ...node, from: shift(node.from), to: shift(node.to) };
}

export function setEachSize(document: EditorDocument, ids: readonly string[], axis: Axis,
  value: number): EditorDocument {
  if (!Number.isFinite(value) || value <= 0 || value > 64)
    throw new SelectionEditError("Each part must be larger than zero and at most 64 units.");
  return publish(document, editableSelection(document, ids).map(node => {
    const to = [...node.to] as [number, number, number];
    to[axis] = rounded(node.from[axis] + value);
    return { ...node, to };
  }));
}

export function deleteSelection(document: EditorDocument, ids: readonly string[]): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (!nodes.length) return document;
  const removed = new Set(nodes.map(node => node.id));
  return { ...document, cuboids: document.cuboids.filter(node => !removed.has(node.id)) };
}

/** IDs are supplied by the caller once, outside React's replayable updater. */
export function duplicateSelection(document: EditorDocument, ids: readonly string[],
  newIds: readonly string[], offset: Vec3 = [1, 0, 1]): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (!nodes.length) return document;
  const existing = new Set(document.cuboids.map(node => node.id));
  if (newIds.length !== nodes.length || new Set(newIds).size !== newIds.length ||
      newIds.some(id => !id || id.length > 100 || existing.has(id)) || !finite(offset))
    throw new SelectionEditError("Duplicate identifiers or offset are invalid. No parts were added.");
  if (document.cuboids.length + nodes.length > 2000)
    throw new SelectionEditError("This duplication exceeds the 2,000-part source limit. No parts were added.");
  const copies = nodes.map((node, index): Cuboid => ({
    ...node, id: newIds[index]!, name: node.name.slice(0, 95) + " copy", faces: copyFaces(node.faces),
    from: node.from.map((n, axis) => rounded(n + offset[axis]!)) as unknown as Vec3,
    to: node.to.map((n, axis) => rounded(n + offset[axis]!)) as unknown as Vec3
  }));
  if (copies.some(node => !isValidCuboid(node)))
    throw new SelectionEditError("The duplicate would exceed the source geometry limits. No parts were added.");
  return { ...document, cuboids: [...document.cuboids, ...copies] };
}

export interface SelectionGesture {
  readonly source: EditorDocument;
  readonly ids: readonly string[];
  readonly pivot: Vec3;
}
export function beginSelectionGesture(source: EditorDocument, ids: readonly string[]): SelectionGesture {
  const bounds = selectionBounds(editableSelection(source, ids));
  if (!bounds) throw new SelectionEditError("Select at least one editable part.");
  return { source, ids: [...new Set(ids)], pivot: bounds.center };
}
export function commitSelectionGesture(current: EditorDocument, gesture: SelectionGesture,
  translation: Vec3, scale: Vec3): EditorDocument {
  // A property edit, project switch, undo or ownership change invalidates the old source.
  if (current !== gesture.source) return current;
  return transformSelection(current, gesture.ids, translation, scale, gesture.pivot);
}
export const cancelSelectionGesture = (gesture: SelectionGesture): EditorDocument => gesture.source;

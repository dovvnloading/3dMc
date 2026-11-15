import type { Axis, Cuboid, EditorDocument, Vec3 } from "./domain";
import { copyFaces, isValidCuboid, pruneGroupMembers } from "./domain";
import { mapRotationToBounds, transformedBounds } from "./elementRotation";
import type { ElementAngle } from "./elementRotation";

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
export function selectionBounds(nodes: readonly Pick<Cuboid, "from" | "to">[]): SelectionBounds | null {
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

/** Extents of the actually rendered geometry, including rotation, rescale and off-center pivots. */
function visibleSelectionBounds(nodes: readonly Cuboid[]): SelectionBounds | null {
  return selectionBounds(nodes.map(node => transformedBounds(node)));
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

function sameRotation(a: Cuboid["rotation"], b: Cuboid["rotation"]): boolean {
  return a === b || !!(a && b && a.axis === b.axis && a.angle === b.angle &&
    a.rescale === b.rescale && a.origin.every((value, axis) => value === b.origin[axis]));
}

function publish(document: EditorDocument, replacements: readonly Cuboid[]): EditorDocument {
  if (replacements.some(node => !isValidCuboid(node))) throw new SelectionEditError(
    "The complete edit was rejected: Java single-axis cuboids need legal rotation angles, pivots and coordinates within −256…256, and positive sizes up to 64 units. No parts were changed."
  );
  const byId = new Map(replacements.map(node => [node.id, node]));
  let changed = false;
  const cuboids = document.cuboids.map(node => {
    const next = byId.get(node.id);
    if (!next || (node.from.every((n, a) => n === next.from[a]) &&
        node.to.every((n, a) => n === next.to[a]) && sameRotation(node.rotation, next.rotation))) return node;
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
  if (nodes.some(node => node.rotation) && scale.some(factor => factor !== 1))
    throw new SelectionEditError("Scaling a selection containing rotated elements is not representable by Java single-axis cuboids. Resize them individually; no parts changed.");
  const bounds = selectionBounds(nodes);
  if (!bounds || (translation.every(n => n === 0) && scale.every(n => n === 1))) return document;
  const origin = pivot ?? bounds.center;
  const point = (values: Vec3): Vec3 => values.map((value, axis) =>
    rounded(origin[axis]! + (value - origin[axis]!) * scale[axis]! + translation[axis]!)
  ) as unknown as Vec3;
  return publish(document, nodes.map(node => {
    const from = point(node.from), to = point(node.to);
    return { ...node, from, to, ...(node.rotation ? { rotation: mapRotationToBounds(node, from, to) } : {}) };
  }));
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


/** Align the visible, transformed bounding-box edges or centers without resizing. */
export function alignSelection(document: EditorDocument, ids: readonly string[],
  axis: Axis, edge: "minimum" | "center" | "maximum"): EditorDocument {
  const nodes = editableSelection(document, ids);
  const bounds = visibleSelectionBounds(nodes);
  if (!bounds || nodes.length < 2) return document;
  const target = edge === "minimum" ? bounds.from[axis] :
    edge === "maximum" ? bounds.to[axis] : bounds.center[axis];
  const edgeOf = (node: Cuboid) => {
    const visible = transformedBounds(node);
    return edge === "minimum" ? visible.from[axis] :
      edge === "maximum" ? visible.to[axis] : (visible.from[axis] + visible.to[axis]) / 2;
  };
  return publish(document, nodes.map(node => shiftPart(node, axis, target - edgeOf(node))));
}

/**
 * Reflect every visible corner about the selection's visible center. Conjugating
 * a Java single-axis rotation with a reflection negates the angle if the
 * reflected axis is perpendicular to the rotation axis. The pivot itself must
 * be reflected as well; rescale commutes with the reflection.
 *
 * Face bindings/UVs stay on their original local faces (texture pixels are not
 * independently flipped). Unsupported out-of-range geometry/pivots reject all.
 */
export function mirrorSelection(document: EditorDocument, ids: readonly string[],
  axis: Axis): EditorDocument {
  const nodes = editableSelection(document, ids);
  const bounds = visibleSelectionBounds(nodes);
  if (!bounds) return document;
  // Quantize the shared reflection plane more coarsely than coordinates.
  // This suppresses trig roundoff when computing the plane a second time,
  // while retaining source detail well beyond the editor's usual 4 decimals.
  // Valid Java coordinates/pivots keep both scaled integers safely below 2^53.
  const scale = 1e12;
  const sumScaled = Math.round((bounds.from[axis] + bounds.to[axis]) * 1e9) * 1e3;
  const reflected = (value: number) => (sumScaled - Math.round(value * scale)) / scale;
  const axisName = (["x", "y", "z"] as const)[axis];
  return publish(document, nodes.map(node => {
    const from = [...node.from] as [number, number, number];
    const to = [...node.to] as [number, number, number];
    from[axis] = reflected(node.to[axis]);
    to[axis] = reflected(node.from[axis]);
    const rotation = node.rotation && {
      ...node.rotation,
      angle: (node.rotation.axis === axisName ? node.rotation.angle : -node.rotation.angle) as ElementAngle,
      origin: node.rotation.origin.map((value, component) =>
        component === axis ? reflected(value) : value) as unknown as Vec3
    };
    return { ...node, from, to, ...(rotation ? { rotation } : {}) };
  }));
}

/** Keep the outermost visible centers fixed and evenly space intermediate centers. */
export function distributeSelection(document: EditorDocument, ids: readonly string[],
  axis: Axis): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (nodes.length < 3) return document;
  const center = (node: Cuboid) => {
    const bounds = transformedBounds(node);
    return (bounds.from[axis] + bounds.to[axis]) / 2;
  };
  // ES stable sort retains scene order as the tie breaker.
  const ordered = [...nodes].sort((a, b) => center(a) - center(b));
  const first = center(ordered[0]!), last = center(ordered[ordered.length - 1]!);
  if (first === last) return document;
  const spaced = ordered.map((node, index) =>
    index === 0 || index === ordered.length - 1 ? node :
      shiftPart(node, axis, first + (last - first) * index / (ordered.length - 1) - center(node)));
  return publish(document, spaced);
}

/** A rigid world translation must move the rotation pivot by the exact same amount. */
function shiftPart(node: Cuboid, axis: Axis, offset: number): Cuboid {
  if (offset === 0) return node;
  const shift = (values: Vec3): Vec3 => values.map((value, component) =>
    component === axis ? value + offset : value) as unknown as Vec3;
  return { ...node, from: shift(node.from), to: shift(node.to),
    ...(node.rotation ? { rotation: { ...node.rotation, origin: shift(node.rotation.origin) } } : {}) };
}

export function setEachSize(document: EditorDocument, ids: readonly string[], axis: Axis,
  value: number): EditorDocument {
  if (!Number.isFinite(value) || value <= 0 || value > 64)
    throw new SelectionEditError("Each part must be larger than zero and at most 64 units.");
  return publish(document, editableSelection(document, ids).map(node => {
    const to = [...node.to] as [number, number, number];
    to[axis] = rounded(node.from[axis] + value);
    return { ...node, to, ...(node.rotation ? { rotation: mapRotationToBounds(node, node.from, to) } : {}) };
  }));
}

export function deleteSelection(document: EditorDocument, ids: readonly string[]): EditorDocument {
  const nodes = editableSelection(document, ids);
  if (!nodes.length) return document;
  const removed = new Set(nodes.map(node => node.id));
  return { ...document, cuboids: document.cuboids.filter(node => !removed.has(node.id)),
    ...(document.groups ? { groups: pruneGroupMembers(document.groups, removed) } : {})
  };
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
  const copies = nodes.map((node, index): Cuboid => {
    const from = node.from.map((n, axis) => rounded(n + offset[axis]!)) as unknown as Vec3;
    const to = node.to.map((n, axis) => rounded(n + offset[axis]!)) as unknown as Vec3;
    return { ...node, id: newIds[index]!, name: node.name.slice(0, 95) + " copy",
      faces: copyFaces(node.faces), from, to,
      ...(node.rotation ? { rotation: mapRotationToBounds(node, from, to) } : {}) };
  });
  if (copies.some(node => !isValidCuboid(node)))
    throw new SelectionEditError("The duplicate would exceed the source geometry limits. No parts were added.");
  return { ...document, cuboids: [...document.cuboids, ...copies] };
}

/**
 * Repeat a selection at a fixed model-space offset per copy. The caller reserves
 * all stable IDs before dispatch; failures never create a partially edited source.
 * Copies retain independent face metadata and shared source texture references.
 */
export function repeatSelection(document: EditorDocument, ids: readonly string[],
  newIds: readonly string[], count: number, step: Vec3): EditorDocument {
  if (!Number.isSafeInteger(count) || count < 1 || count > 64 ||
      !finite(step) || step.every(value => value === 0))
    throw new SelectionEditError(
      "Choose 1–64 copies and a finite, nonzero X/Y/Z step. No parts were added."
    );
  const nodes = editableSelection(document, ids);
  if (!nodes.length) return document;
  const total = nodes.length * count;
  if (document.cuboids.length + total > 2000)
    throw new SelectionEditError("The array exceeds the 2,000-part source limit. No parts were added.");
  const existing = new Set(document.cuboids.map(node => node.id));
  if (newIds.length !== total || new Set(newIds).size !== total ||
      newIds.some(id => !id || id.length > 100 || existing.has(id)))
    throw new SelectionEditError("Array copy identifiers are invalid or already exist. No parts were added.");

  const copies = Array.from({ length: count }, (_, copyIndex) =>
    nodes.map((node, nodeIndex): Cuboid => {
      const from = node.from.map((value, axis) =>
        rounded(value + step[axis]! * (copyIndex + 1))) as unknown as Vec3;
      const to = node.to.map((value, axis) =>
        rounded(value + step[axis]! * (copyIndex + 1))) as unknown as Vec3;
      return { ...node,
        id: newIds[copyIndex * nodes.length + nodeIndex]!,
        name: node.name.slice(0, 92) + " copy " + (copyIndex + 1),
        faces: copyFaces(node.faces), from, to,
        ...(node.rotation ? { rotation: mapRotationToBounds(node, from, to) } : {}) };
    })
  ).flat();

  if (copies.some(node => !isValidCuboid(node)))
    throw new SelectionEditError(
      "An array copy would exceed the supported geometry bounds. No parts were added."
    );
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

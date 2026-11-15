import type { EditorDocument, Cuboid } from "./domain";
import { isValidCuboid } from "./domain";
import { editableSelection, SelectionEditError } from "./selection";
import {
  defaultElementRotation, elementCenter, isElementRotation, isJavaElementAngle
} from "./elementRotation";
import type { ElementAngle, ElementAxis, ElementRotation } from "./elementRotation";

function updateRotation(document: EditorDocument, ids: readonly string[],
  operation: (node: Cuboid, current: ElementRotation) => ElementRotation | undefined): EditorDocument {
  if (document.target.candidateRelease !== "1.21.4")
    throw new SelectionEditError("Element rotation is available only for the Java 1.21.4 experimental profile.");
  const selected = editableSelection(document, ids);
  if (!selected.length) return document;
  const replacements = new Map<string, Cuboid>();
  for (const node of selected) {
    const nextRotation = operation(node, node.rotation ?? defaultElementRotation(node));
    if (nextRotation !== undefined && !isElementRotation(nextRotation))
      throw new SelectionEditError("Rotation rejected: select a permitted axis and angle and finite pivot coordinates within −256…256. Nothing changed.");
    const identical = nextRotation === undefined ? node.rotation === undefined :
      node.rotation !== undefined && nextRotation.axis === node.rotation.axis &&
      nextRotation.angle === node.rotation.angle && nextRotation.rescale === node.rotation.rescale &&
      nextRotation.origin.every((value, i) => value === node.rotation!.origin[i]);
    // Choosing the already-displayed default on a previously unrotated part is
    // a true no-op. Do not materialize metadata or consume an undo entry.
    const defaultValue = !node.rotation ? defaultElementRotation(node) : null;
    if (identical || (defaultValue && nextRotation &&
        nextRotation.axis === defaultValue.axis && nextRotation.angle === defaultValue.angle &&
        nextRotation.rescale === defaultValue.rescale &&
        nextRotation.origin.every((value, i) => value === defaultValue.origin[i]))) continue;
    const { rotation: _previous, ...rest } = node;
    const next: Cuboid = { ...rest, ...(nextRotation ? { rotation: nextRotation } : {}) };
    if (!isValidCuboid(next))
      throw new SelectionEditError("Rotation rejected by the strict model validator. No elements changed.");
    replacements.set(node.id, next);
  }
  return replacements.size ? { ...document,
    cuboids: document.cuboids.map(node => replacements.get(node.id) ?? node) } : document;
}

export function setElementAxis(document: EditorDocument, ids: readonly string[], axis: ElementAxis): EditorDocument {
  if (axis !== "x" && axis !== "y" && axis !== "z")
    throw new SelectionEditError("Choose X, Y or Z. No element changed.");
  return updateRotation(document, ids, (_node, rotation) => ({ ...rotation, axis }));
}
export function setElementAngle(document: EditorDocument, ids: readonly string[], angle: ElementAngle): EditorDocument {
  if (!isJavaElementAngle(angle))
    throw new SelectionEditError("Java 1.21.4 only accepts −45°, −22.5°, 0°, 22.5° and 45°. No element changed.");
  return updateRotation(document, ids, (_node, rotation) => ({ ...rotation, angle }));
}
export function setElementPivot(document: EditorDocument, ids: readonly string[], axis: 0 | 1 | 2,
  value: number): EditorDocument {
  if (![0, 1, 2].includes(axis) || !Number.isFinite(value) || value < -256 || value > 256)
    throw new SelectionEditError("Pivot coordinates must be finite within −256…256. No element changed.");
  return updateRotation(document, ids, (_node, rotation) => ({ ...rotation,
    origin: rotation.origin.map((part, index) => index === axis ? value : part) as [number, number, number] }));
}
export function setElementRescale(document: EditorDocument, ids: readonly string[], rescale: boolean): EditorDocument {
  if (typeof rescale !== "boolean") throw new SelectionEditError("Rescale must be on or off.");
  return updateRotation(document, ids, (_node, rotation) => ({ ...rotation, rescale }));
}
export function centerElementPivots(document: EditorDocument, ids: readonly string[]): EditorDocument {
  return updateRotation(document, ids, (node, rotation) => ({ ...rotation, origin: elementCenter(node) }));
}
export function resetElementRotations(document: EditorDocument, ids: readonly string[]): EditorDocument {
  return updateRotation(document, ids, () => undefined);
}

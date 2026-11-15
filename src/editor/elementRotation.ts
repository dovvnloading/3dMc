import type { Cuboid, Vec3 } from "./domain";

/** Java 1.21.4's single-axis element rotation, not per-face UV rotation. */
export const JAVA_ELEMENT_ANGLES = [-45, -22.5, 0, 22.5, 45] as const;
export type ElementAngle = typeof JAVA_ELEMENT_ANGLES[number];
export type ElementAxis = "x" | "y" | "z";
export interface ElementRotation {
  axis: ElementAxis;
  angle: ElementAngle;
  origin: Vec3;
  rescale: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validAxis = (value: unknown): value is ElementAxis =>
  value === "x" || value === "y" || value === "z";
export const isJavaElementAngle = (value: unknown): value is ElementAngle =>
  typeof value === "number" && JAVA_ELEMENT_ANGLES.some(angle => angle === value);
const validOrigin = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 &&
  value.every(part => typeof part === "number" && Number.isFinite(part) && part >= -256 && part <= 256);

/** No coercion, rounding, unknown fields, multi-axis or relaxed future-version angles. */
export function isElementRotation(value: unknown): value is ElementRotation {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 4 &&
    ["axis", "angle", "origin", "rescale"].every(key => Object.hasOwn(value, key)) &&
    validAxis(value.axis) && isJavaElementAngle(value.angle) &&
    validOrigin(value.origin) && typeof value.rescale === "boolean";
}

/** Java permits omitted origin (8,8,8) and rescale (false); native source is always explicit. */
export function parseJavaElementRotation(value: unknown, context: string): ElementRotation {
  if (!isRecord(value) || Object.keys(value).some(key =>
    !["axis", "angle", "origin", "rescale"].includes(key)) ||
    !validAxis(value.axis) || !isJavaElementAngle(value.angle) ||
    (value.origin !== undefined && !validOrigin(value.origin)) ||
    (value.rescale !== undefined && typeof value.rescale !== "boolean"))
    throw new Error(`${context}: Unsupported element rotation. Java 1.21.4 accepts only one x/y/z axis, angles -45, -22.5, 0, 22.5 or 45°, a finite origin and boolean rescale.`);
  return {
    axis: value.axis, angle: value.angle,
    origin: value.origin === undefined ? [8, 8, 8] : [...value.origin] as [number, number, number],
    rescale: value.rescale ?? false
  };
}

export function elementCenter(node: Pick<Cuboid, "from" | "to">): Vec3 {
  return [0, 1, 2].map(axis => (node.from[axis]! + node.to[axis]!) / 2) as [number, number, number];
}

export function defaultElementRotation(node: Pick<Cuboid, "from" | "to">): ElementRotation {
  return { axis: "y", angle: 0, origin: elementCenter(node), rescale: false };
}

/** Positive, perpendicular compensation: scale = sec(angle), not a rotation on extra axes. */
export function elementRescale(rotation: ElementRotation): Vec3 {
  const factor = rotation.rescale ? 1 / Math.cos(rotation.angle * Math.PI / 180) : 1;
  return [rotation.axis === "x" ? 1 : factor,
    rotation.axis === "y" ? 1 : factor,
    rotation.axis === "z" ? 1 : factor];
}

/** Column-vector transform: T(origin) * R(axis,angle) * S(perpendicular) * T(-origin). */
export function transformElementPoint(point: Vec3, rotation?: ElementRotation): Vec3 {
  if (!rotation) return [...point] as [number, number, number];
  const p = rotation.origin;
  const scale = elementRescale(rotation);
  const [x, y, z] = point.map((v, i) => (v - p[i]!) * scale[i]!) as [number, number, number];
  const c = Math.cos(rotation.angle * Math.PI / 180), s = Math.sin(rotation.angle * Math.PI / 180);
  const rotated = rotation.axis === "x" ? [x, y * c - z * s, y * s + z * c] :
    rotation.axis === "y" ? [x * c + z * s, y, -x * s + z * c] :
      [x * c - y * s, x * s + y * c, z];
  return [rotated[0]! + p[0], rotated[1]! + p[1], rotated[2]! + p[2]];
}

/** Face normals remain unit length and retain their original semantic face labels. */
export function transformElementNormal(normal: Vec3, rotation?: ElementRotation): Vec3 {
  if (!rotation) return [...normal] as [number, number, number];
  return transformElementPoint(normal.map((v, axis) => v + rotation.origin[axis]!) as [number, number, number],
    { ...rotation, rescale: false }).map((v, axis) => v - rotation.origin[axis]!) as [number, number, number];
}

export function transformedCorners(node: Pick<Cuboid, "from" | "to" | "rotation">): Vec3[] {
  const result: Vec3[] = [];
  for (const x of [node.from[0], node.to[0]])
    for (const y of [node.from[1], node.to[1]])
      for (const z of [node.from[2], node.to[2]])
        result.push(transformElementPoint([x, y, z], node.rotation));
  return result;
}

export function transformedBounds(node: Pick<Cuboid, "from" | "to" | "rotation">):
  { from: Vec3; to: Vec3 } {
  const corners = transformedCorners(node);
  return {
    from: [0, 1, 2].map(axis => Math.min(...corners.map(corner => corner[axis]!))) as [number, number, number],
    to: [0, 1, 2].map(axis => Math.max(...corners.map(corner => corner[axis]!))) as [number, number, number]
  };
}

/** Move and local resize preserve the pivot's relative location inside the unrotated cuboid. */
export function mapRotationToBounds(node: Cuboid, from: Vec3, to: Vec3): ElementRotation | undefined {
  if (!node.rotation) return undefined;
  return {
    ...node.rotation,
    origin: node.rotation.origin.map((value, axis) => from[axis]! +
      (value - node.from[axis]!) * (to[axis]! - from[axis]!) /
      (node.to[axis]! - node.from[axis]!)) as [number, number, number]
  };
}

export function copyElementRotation(rotation?: ElementRotation): ElementRotation | undefined {
  return rotation && { ...rotation, origin: [...rotation.origin] as [number, number, number] };
}

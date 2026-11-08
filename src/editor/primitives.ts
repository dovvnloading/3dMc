import { createDefaultFaces, updateCuboid } from "./domain";
import type { EditorDocument, Cuboid, MaterialKind, Vec3 } from "./domain";

export type PrimitiveId = "cube" | "half-slab" | "column" | "panel" | "small-cube";

interface PrimitiveSpec {
  id: PrimitiveId;
  label: string;
  description: string;
  from: Vec3;
  to: Vec3;
}

export const PRIMITIVE_PRESETS: readonly PrimitiveSpec[] = [
  {
    id: "cube", label: "Full block", description: "16 × 16 × 16 units",
    from: [0, 0, 0], to: [16, 16, 16]
  },
  {
    id: "half-slab", label: "Half slab", description: "16 × 8 × 16 units",
    from: [0, 0, 0], to: [16, 8, 16]
  },
  {
    id: "column", label: "Narrow column", description: "4 × 16 × 4 units",
    from: [6, 0, 6], to: [10, 16, 10]
  },
  {
    id: "panel", label: "Thin panel", description: "16 × 16 × 2 units",
    from: [0, 0, 7], to: [16, 16, 9]
  },
  {
    id: "small-cube", label: "Small cube", description: "8 × 8 × 8 units",
    from: [4, 4, 4], to: [12, 12, 12]
  }
];

export function addPrimitive(
  document: EditorDocument, id: string, primitive: PrimitiveId
): EditorDocument {
  const shape = PRIMITIVE_PRESETS.find((entry) => entry.id === primitive);
  if (!shape || !id || id.length > 100 ||
      document.cuboids.length >= 2000 ||
      document.cuboids.some((node) => node.id === id)) return document;
  const node: Cuboid = {
    id, name: shape.label,
    from: [...shape.from] as [number, number, number],
    to: [...shape.to] as [number, number, number],
    material: "solid", color: "#8ca794",
    faces: createDefaultFaces(), visible: true, locked: false
  };
  return { ...document, cuboids: [...document.cuboids, node] };
}

/**
 * A painted material uses the pixel sheet without a viewport-only tint.
 * A solid material adopts a neutral default color for deliberate editing.
 * The canonical UV mapping is preserved in both directions.
 */
export function setCuboidMaterial(
  document: EditorDocument, id: string, material: MaterialKind
): EditorDocument {
  if (material !== "solid" && material !== "texture") return document;
  return updateCuboid(document, id, (node) => {
    if (node.material === material) return node;
    return {
      ...node, material,
      color: material === "texture" ? "#ffffff" : "#8ca794"
    };
  });
}

/** Scene order is authored state and controls generated Java element order. */
export function moveCuboid(
  document: EditorDocument, id: string, direction: "up" | "down"
): EditorDocument {
  const from = document.cuboids.findIndex((node) => node.id === id);
  if (from < 0 || document.cuboids[from]?.locked) return document;
  const to = from + (direction === "up" ? -1 : 1);
  if (to < 0 || to >= document.cuboids.length) return document;
  const moved = [...document.cuboids];
  [moved[from], moved[to]] = [moved[to]!, moved[from]!];
  return { ...document, cuboids: moved };
}

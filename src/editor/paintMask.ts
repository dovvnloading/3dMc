import type { EditorDocument, FaceDirection } from "./domain";
import { textureById } from "./domain";
import type { PixelMask } from "./pixels";
import { logicalUVToPixelRect } from "./uv";

/**
 * A face samples texels whose centers lie inside its UV rectangle. Reversed
 * bounds and quarter-turn rotations do not change the set of sampled pixels.
 */
export function facePaintMask(document: EditorDocument, nodeId: string,
  direction: FaceDirection, textureId: string): PixelMask | null {
  const node = document.cuboids.find(part => part.id === nodeId);
  const texture = textureById(document, textureId);
  if (!node || !texture || node.locked || !node.visible || node.material !== "texture" ||
      node.faces[direction].textureId !== textureId) return null;
  const [u1, v1, u2, v2] =
    logicalUVToPixelRect(node.faces[direction].uv, texture.width, texture.height);
  return {
    left: Math.min(u1, u2), top: Math.min(v1, v2),
    right: Math.max(u1, u2), bottom: Math.max(v1, v2)
  };
}

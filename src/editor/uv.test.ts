import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { createDefaultFaces } from "./domain";
import { applyFaceUvs, BOX_FACE_ORDER, faceFromTriangle,
  localToLogicalUV, localToThreeUV, logicalUVToPixelRect } from "./uv";
import { uvToTexel } from "./pixels";

describe("Minecraft face UV mapping", () => {
  it("maps all six box face groups to stable semantic directions", () => {
    expect(BOX_FACE_ORDER).toEqual(["east", "west", "up", "down", "south", "north"]);
    expect(Array.from({ length: 12 }, (_, index) => faceFromTriangle(index)))
      .toEqual(BOX_FACE_ORDER.flatMap((face) => [face, face]));
    expect(faceFromTriangle(-1)).toBeNull();
    expect(faceFromTriangle(12)).toBeNull();
  });

  it("maps logical texel rectangles at 16, 32 and 64 pixels without assuming 16 physical pixels", () => {
    const binding = { uv: [2, 4, 14, 12] as const, rotation: 0 as const, textureId: "main" };
    expect(logicalUVToPixelRect(binding.uv, 16, 16)).toEqual([2, 4, 14, 12]);
    expect(logicalUVToPixelRect(binding.uv, 32, 32)).toEqual([4, 8, 28, 24]);
    expect(logicalUVToPixelRect(binding.uv, 64, 64)).toEqual([8, 16, 56, 48]);
    const [u, v] = localToThreeUV("north", binding, .25, .25);
    expect(uvToTexel(u, v, 16, 16)).toEqual([5, 6]);
    expect(uvToTexel(u, v, 32, 32)).toEqual([10, 12]);
    expect(uvToTexel(u, v, 64, 64)).toEqual([20, 24]);
  });

  it("preserves mirrored bounds and quarter turns, reversing rotation on down", () => {
    const binding = { uv: [12, 3, 2, 13] as const, rotation: 0 as const, textureId: "main" };
    expect(localToLogicalUV("north", binding, 0, 0)).toEqual([12, 3]);
    expect(localToLogicalUV("north", binding, 1, 1)).toEqual([2, 13]);
    expect(localToLogicalUV("north", { ...binding, rotation: 90 }, 0, 0)).toEqual([12, 13]);
    expect(localToLogicalUV("down", { ...binding, rotation: 90 }, 0, 0)).toEqual([2, 3]);
    expect(localToLogicalUV("north", { ...binding, rotation: 180 }, 0, 0)).toEqual([2, 13]);
    expect(localToLogicalUV("north", { ...binding, rotation: 270 }, 0, 0)).toEqual([2, 3]);
  });

  it("bakes every face mapping into the exact UVs consumed by raycasting and the renderer", () => {
    const faces = createDefaultFaces();
    faces.north = { uv: [2, 4, 14, 12], rotation: 90, textureId: "main" };
    faces.down = { uv: [0, 1, 8, 13], rotation: 90, textureId: "main" };
    const box = new BoxGeometry(1, 1, 1);
    applyFaceUvs(box, faces);
    const uv = box.getAttribute("uv");
    // Each face has four independent vertices; box begins with upper-left.
    expect([uv.getX(20), uv.getY(20)]).toEqual([2 / 16, 1 - 12 / 16]);
    expect([uv.getX(12), uv.getY(12)]).toEqual([8 / 16, 1 - 1 / 16]);
    // Both triangles that raycasting addresses share the same baked face UVs.
    expect(box.groups).toHaveLength(6);
    box.dispose();
  });
});

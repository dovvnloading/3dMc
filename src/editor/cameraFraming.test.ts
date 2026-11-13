import { describe, expect, it } from "vitest";
import { createSampleDocument } from "./domain";
import type { EditorDocument, Vec3 } from "./domain";
import { createAetherheartDocument } from "./aetherheart";
import { frameDocumentCamera, isAetherheartShowcase } from "./cameraFraming";
import type { CameraView } from "./cameraFraming";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const size = Math.hypot(...a);
  return [a[0] / size, a[1] / size, a[2] / size];
};

describe("scene-aware camera framing", () => {
  it("recognizes a renamed, saved showcase without treating other names as templates", () => {
    const aether = createAetherheartDocument();
    expect(isAetherheartShowcase({ ...aether, id: "a-user-copy", name: "My star engine" })).toBe(true);
    expect(isAetherheartShowcase({ ...createSampleDocument(), name: aether.name })).toBe(false);
  });

  it("fits every Aetherheart corner in front/right/top/iso views, including portrait", () => {
    const doc = createAetherheartDocument();
    for (const aspect of [0.62, 1.15, 1.8])
      for (const view of ["iso", "front", "right", "top"] as CameraView[]) {
        const frame = frameDocumentCamera(doc, view, aspect);
        const direction = unit([
          frame.position[0] - frame.target[0], frame.position[1] - frame.target[1],
          frame.position[2] - frame.target[2]
        ]);
        const right = unit(cross([0, 1, 0], direction));
        const up = cross(direction, right);
        const tanHalfFov = Math.tan(Math.PI / 9);
        for (const node of doc.cuboids) {
          for (const x of [node.from[0], node.to[0]])
            for (const y of [node.from[1], node.to[1]])
              for (const z of [node.from[2], node.to[2]]) {
                const relative: Vec3 = [(x - 8) / 16 - frame.target[0],
                  y / 16 - frame.target[1], (z - 8) / 16 - frame.target[2]];
                const depth = frame.distance - dot(relative, direction);
                expect(depth).toBeGreaterThan(0);
                expect(Math.abs(dot(relative, right)) / (depth * tanHalfFov * aspect))
                  .toBeLessThanOrEqual(0.781);
                expect(Math.abs(dot(relative, up)) / (depth * tanHalfFov))
                  .toBeLessThanOrEqual(0.781);
              }
        }
      }
  });

  it("improves the showcase scale without forcibly zooming ordinary models", () => {
    const showcase = frameDocumentCamera(createAetherheartDocument(), "iso", 1.15);
    const ordinary = frameDocumentCamera(createSampleDocument(), "iso", 1.15);
    expect(showcase.distance).toBeGreaterThan(2.5);
    expect(showcase.distance).toBeLessThan(3.8);
    expect(ordinary.distance).toBeGreaterThan(4.3);
    expect(ordinary.distance).toBeLessThan(5.8);
  });

  it("keeps the empty project camera finite and the fallback target stable", () => {
    const doc: EditorDocument = { ...createSampleDocument(), cuboids: [] };
    const frame = frameDocumentCamera(doc, "iso", 1.4);
    expect(frame.target).toEqual([0, 0.58, 0]);
    expect(frame.position.every(Number.isFinite)).toBe(true);
  });
});

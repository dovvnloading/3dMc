import { describe, expect, it } from "vitest";
import { createSampleDocument, toggleFlag } from "./domain";
import { createHistory, commit, undo, redo } from "./history";
import { PRIMITIVE_PRESETS, addPrimitive, setCuboidMaterial, moveCuboid } from "./primitives";
import { makeNewProject } from "./templates";

const blank = () => makeNewProject({
  template: "blank", name: "Shapes test", resolution: 32, id: "shape-source"
});

describe("creator primitive library", () => {
  it("creates all supported shapes with correct geometry and unique source IDs", () => {
    let doc = blank();
    for (const preset of PRIMITIVE_PRESETS) {
      doc = addPrimitive(doc, preset.id + "-instance", preset.id);
    }
    expect(doc.cuboids).toHaveLength(PRIMITIVE_PRESETS.length);
    for (let i = 0; i < PRIMITIVE_PRESETS.length; i++) {
      const node = doc.cuboids[i]!;
      expect(node.from).toEqual(PRIMITIVE_PRESETS[i]?.from);
      expect(node.to).toEqual(PRIMITIVE_PRESETS[i]?.to);
      expect(node.name).toBe(PRIMITIVE_PRESETS[i]?.label);
      expect(node.material).toBe("solid");
      expect(node.faces.north.uv).toEqual([0, 0, 16, 16]);
    }
    expect(addPrimitive(doc, "cube-instance", "cube")).toBe(doc);
    expect(addPrimitive(doc, "bad", "unknown" as "cube")).toBe(doc);
  });

  it("changes from solid to painted material without losing face UV definitions", () => {
    let doc = addPrimitive(blank(), "cube-01", "cube");
    const faces = doc.cuboids[0]!.faces;
    doc = setCuboidMaterial(doc, "cube-01", "texture");
    expect(doc.cuboids[0]).toMatchObject({
      material: "texture", color: "#ffffff"
    });
    expect(doc.cuboids[0]?.faces).toEqual(faces);
    expect(setCuboidMaterial(doc, "cube-01", "texture")).toBe(doc);
    const locked = toggleFlag(doc, "cube-01", "locked");
    expect(setCuboidMaterial(locked, "cube-01", "solid")).toBe(locked);
    doc = setCuboidMaterial(doc, "cube-01", "solid");
    expect(doc.cuboids[0]?.color).toBe("#8ca794");
  });

  it("reorders elements with one undo step without renaming or deleting content", () => {
    const source = createSampleDocument();
    const start = source.cuboids.map((n) => n.id);
    const history = commit(createHistory(source), moveCuboid(source, "roof", "up"));
    expect(history.present.cuboids[1]?.id).toBe("roof");
    expect(history.present.cuboids[2]?.id).toBe("base");
    expect(undo(history).present.cuboids.map((n) => n.id)).toEqual(start);
    expect(redo(undo(history)).present.cuboids[1]?.id).toBe("roof");

    expect(moveCuboid(source, "body", "up")).toBe(source);
    expect(moveCuboid(source, "handle-right", "down")).toBe(source);
    const locked = toggleFlag(source, "roof", "locked");
    expect(moveCuboid(locked, "roof", "up")).toBe(locked);
  });
});

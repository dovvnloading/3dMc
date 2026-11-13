import { describe, expect, it } from "vitest";
import { createApothecaryCabinet } from "./apothecaryCabinet";
import { PREFAB_LIBRARY, PrefabInsertError, insertLibraryPrefab } from "./library";
import { createSampleDocument, parseDocument } from "../domain";
import { makeNewProject } from "../templates";
import { createHistory, commit, undo, redo } from "../history";
import { flattenTextureLayers, setRasterLayerPixels } from "../layers";
import { renameGroup } from "../groups";
import { selectionBounds } from "../selection";
import { encodeNativeProject, decodeNativeProject } from "../nativeArchive";
import { inspectJava1214, makeJava1214Pack, buildJava1214Model } from "../../export/javaBlock";

const blank = () => makeNewProject({
  template: "blank", resolution: 32, name: "A cabinet workshop", id: "cabinet-workshop"
});
const source = () => createApothecaryCabinet();

describe("Apothecary Cabinet — authored furniture prefab", () => {
  it("is a recognizable, intentionally assembled 16-unit furniture item", () => {
    const fixture = source();
    expect(fixture).toEqual(source()); // same actual content, independent of time
    expect(PREFAB_LIBRARY).toContainEqual(expect.objectContaining({
      id: fixture.id, category: "Furniture", name: fixture.name
    }));
    expect(fixture.parts.length).toBeGreaterThan(80);
    expect(fixture.parts.length).toBeLessThan(150);
    expect(new Set(fixture.parts.map(p => p.name)).size).toBe(fixture.parts.length);
    expect(new Set(fixture.parts.map(p => p.id)).size).toBe(fixture.parts.length);
    expect(fixture.parts.every(p =>
      p.material === "texture" && p.color === "#ffffff" &&
      p.visible && !p.locked &&
      p.from.every((n, i) => n >= 0 && n < p.to[i]! && p.to[i]! <= 16)
    )).toBe(true);
    const names = fixture.parts.map(part => part.name);
    expect(names.filter(name => name.includes("oak front"))).toHaveLength(4);
    expect(names.filter(name => name.includes("bowed brass pull"))).toHaveLength(4);
    expect(names.filter(name => name.includes("square blown-glass belly"))).toHaveLength(3);
    expect(names.filter(name => name.includes("handwritten paper seal"))).toHaveLength(3);
    expect(names).toEqual(expect.arrayContaining([
      "Hutch / supporting display shelf",
      "Carcass / continuous oak work surface",
      "Tools / open book left parchment",
      "Tools / porcelain mortar heavy base",
      "Tools / crushed verdant herbs inside mortar",
      "Tools / wooden pestle shaft"
    ]));
    expect(fixture.palette).toHaveLength(16);
  });

  it("provides real 32px opaque, editable material sheets with distinct art", () => {
    const fixture = source();
    expect(fixture.textures).toHaveLength(11);
    expect(new Set(fixture.textures.map(texture => texture.id)).size).toBe(11);
    for (const t of fixture.textures) {
      expect(t.width).toBe(32);
      expect(t.height).toBe(32);
      expect(t.pixels).toHaveLength(32 * 32 * 4);
      expect(t.pixels.every((channel, i) => i % 4 !== 3 || channel === 255)).toBe(true);
      expect(new Set(Array.from({ length: 1024 }, (_, index) =>
        t.pixels.slice(index * 4, index * 4 + 3).join(","))).size).toBeGreaterThan(6);
    }
    expect(fixture.textures.filter(texture => texture.layers)).toHaveLength(8);
    expect(fixture.parts.some(part => part.faces.up.textureId !== part.faces.south.textureId)).toBe(true);
  });

  it("maps individual ink drawings to the displayed face and leaves the narrow parchment edges blank", () => {
    const fixture = source();
    const sheet = fixture.textures.find(t => t.id === "apc-vellum")!;
    const ink = sheet.layers!.find(layer => layer.id === "details")!;
    const inkPattern = (uv: readonly number[]) => {
      const [x0, y0, x1, y1] = uv.map(edge => Math.round(edge * sheet.width / 16)) as [number, number, number, number];
      const rows: string[] = [];
      for (let y = y0; y < y1; y++) {
        let row = "";
        for (let x = x0; x < x1; x++) row += ink.pixels[(y * sheet.width + x) * 4 + 3] ? "#" : ".";
        rows.push(row);
      }
      return rows.join("\n");
    };
    const bottles = fixture.parts.filter(node => node.name.endsWith("handwritten paper seal"));
    const pages = fixture.parts.filter(node => node.name.includes("open book") && node.name.endsWith("parchment"));
    expect(bottles).toHaveLength(3);
    expect(pages).toHaveLength(2);
    const marks = [...bottles.map(node => node.faces.south), ...pages.map(node => node.faces.up)]
      .map(face => inkPattern(face.uv));
    expect(marks.every(pattern => pattern.includes("#"))).toBe(true);
    expect(new Set(marks).size).toBe(5);
    for (const node of [...bottles, ...pages]) {
      expect(node.faces.east.textureId).toBe(sheet.id);
      expect(inkPattern(node.faces.east.uv)).toMatch(/^\.+$/);
    }
  });

  it("inserts once as an editor group; undo/redo is exactly one step", () => {
    const original = blank();
    const inserted = insertLibraryPrefab(original, "apothecary-cabinet", "cab-01");
    expect(inserted.cuboids.length).toBe(source().parts.length);
    expect(inserted.groups).toHaveLength(1);
    expect(inserted.groups![0]!.name).toBe("Apothecary Cabinet · 01");
    expect(inserted.groups![0]!.memberIds).toEqual(inserted.cuboids.map(part => part.id));
    expect(inserted.textures).toHaveLength(12); // one existing sheet + 11 authored sheets
    expect(inserted.palette).toEqual(source().palette);
    expect(parseDocument(inserted)).toEqual(inserted);
    const history = commit(createHistory(original), inserted);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toEqual(original);
    expect(redo(undo(history)).present).toEqual(inserted);
    expect(insertLibraryPrefab(inserted, "apothecary-cabinet", "cab-01")).toBe(inserted);
  });

  it("inserts alongside, not through, existing content and reuses every original material", () => {
    const first = insertLibraryPrefab(blank(), "apothecary-cabinet", "cab-01");
    const second = insertLibraryPrefab(first, "apothecary-cabinet", "cab-02");
    expect(second.groups).toHaveLength(2);
    expect(second.textures).toHaveLength(first.textures.length);
    const firstIds = new Set(first.groups![0]!.memberIds);
    const old = second.cuboids.filter(part => firstIds.has(part.id));
    const newer = second.cuboids.filter(part => second.groups![1]!.memberIds.includes(part.id));
    expect(new Set(second.cuboids.map(part => part.id)).size).toBe(second.cuboids.length);
    expect(Math.max(...old.map(part => part.to[0]))).toBeLessThanOrEqual(
      Math.min(...newer.map(part => part.from[0])));
    const third = insertLibraryPrefab(second, "apothecary-cabinet", "cab-03");
    const thirdParts = third.cuboids.filter(part => third.groups![2]!.memberIds.includes(part.id));
    expect(Math.max(...thirdParts.map(part => part.to[0]))).toBeLessThanOrEqual(0);
    expect(third.textures).toHaveLength(first.textures.length);
    expect(third.groups?.map(g => g.name)).toEqual([
      "Apothecary Cabinet · 01", "Apothecary Cabinet · 02",
      "Apothecary Cabinet · 03"
    ]);
  });

  it("does not repaint existing edited textures or exceed the 16-sheet cap", () => {
    const first = insertLibraryPrefab(blank(), "apothecary-cabinet", "cab-a");
    const recolored = {
      ...first, textures: first.textures.map(texture => texture.id !== "apc-oak" ? texture : {
        ...texture, pixels: texture.pixels.map((n, i) => i === 0 ? 5 : n)
      })
    };
    const second = insertLibraryPrefab(recolored, "apothecary-cabinet", "cab-b");
    expect(second.textures).toHaveLength(first.textures.length + 1);
    expect(second.textures.find(t => t.id === "apc-oak")!.pixels[0]).toBe(5);
    expect(second.textures.some(t => t.id === "apc-oak-copy-2")).toBe(true);
    const added = second.cuboids.filter(node => second.groups![1]!.memberIds.includes(node.id));
    expect(added.some(node => Object.values(node.faces)
      .some(face => face.textureId === "apc-oak-copy-2"))).toBe(true);

    const full = {
      ...blank(), textures: [...blank().textures,
        ...Array.from({ length: 15 }, (_, i) => ({
          ...blank().textures[0]!, id: "unused-" + i
        }))]
    };
    expect(parseDocument(full).textures).toHaveLength(16);
    expect(() => insertLibraryPrefab(full, "apothecary-cabinet", "no-room"))
      .toThrow(PrefabInsertError);
    expect(full.cuboids).toHaveLength(0);
  });

  it("restores authored paint layers on new instances after flattening or painting beneath opaque detail", () => {
    const first = insertLibraryPrefab(blank(), "apothecary-cabinet", "cab-a");
    const [metal, potion] = first.textures.filter(t => t.layers).slice(0, 2);
    const flattened = flattenTextureLayers(first, metal!.id);
    const [ground, details] = potion!.layers!;
    const covered = details!.pixels.findIndex((channel, index) => index % 4 === 3 && channel === 255) - 3;
    expect(covered).toBeGreaterThanOrEqual(0);
    const paint = [...ground!.pixels];
    paint[covered] = 255 - paint[covered]!;
    const edited = setRasterLayerPixels(flattened, potion!.id, ground!.id, paint);
    expect(edited.textures.find(t => t.id === potion!.id)!.pixels).toEqual(potion!.pixels);

    const second = insertLibraryPrefab(edited, "apothecary-cabinet", "cab-b");
    const newIds = new Set(second.groups![1]!.memberIds);
    const newer = second.cuboids.filter(part => newIds.has(part.id));
    for (const original of [metal!, potion!]) {
      const copyId = original.id + "-copy-2";
      expect(second.textures.find(t => t.id === copyId)).toEqual({ ...original, id: copyId });
      expect(second.textures.find(t => t.id === original.id)).toEqual(edited.textures.find(t => t.id === original.id));
      expect(newer.some(part => Object.values(part.faces).some(face => face.textureId === copyId))).toBe(true);
      expect(newer.some(part => Object.values(part.faces).some(face => face.textureId === original.id))).toBe(false);
    }
    const third = insertLibraryPrefab(second, "apothecary-cabinet", "cab-c");
    expect(third.textures).toEqual(second.textures);
  });

  it("uses a free Java-exportable bay when all three X positions in the center row are occupied", () => {
    const first = blank();
    const blocker = { ...createSampleDocument().cuboids[0]!, from: [-16, 0, 0], to: [32, 16, 16] };
    const project = parseDocument({ ...first, cuboids: [blocker] });
    const inserted = insertLibraryPrefab(project, "apothecary-cabinet", "off-row");
    const bounds = selectionBounds(inserted.cuboids.slice(1))!;
    expect(bounds.from[2] >= 16 || bounds.to[2] <= 0).toBe(true);
    expect(inspectJava1214(inserted).filter(issue => issue.severity === "error")).toEqual([]);
  });

  it("keeps group names unique after an earlier cabinet is renamed", () => {
    const first = insertLibraryPrefab(blank(), "apothecary-cabinet", "cab-a");
    const second = insertLibraryPrefab(first, "apothecary-cabinet", "cab-b");
    const renamed = renameGroup(second, second.groups![0]!.id, "Workbench");
    const third = insertLibraryPrefab(renamed, "apothecary-cabinet", "cab-c");
    expect(third.groups!.map(group => group.name)).toEqual([
      "Workbench", "Apothecary Cabinet · 02", "Apothecary Cabinet · 01"
    ]);
  });

  it("can be appended to a busy starter scene with no content destruction", () => {
    const original = createSampleDocument();
    const doc = insertLibraryPrefab(original, "apothecary-cabinet", "starter-prop");
    expect(doc.cuboids.slice(0, original.cuboids.length)).toEqual(original.cuboids);
    expect(doc.textures.find(t => t.id === "main")).toEqual(original.textures[0]);
    const added = doc.cuboids.slice(original.cuboids.length);
    expect(Math.min(...added.map(n => n.from[0]))).toBeGreaterThanOrEqual(16);
    expect(doc.groups![0]!.memberIds).toHaveLength(added.length);
  });

  it("round-trips as a native project and passes the experimental Java asset preflight", async () => {
    const doc = insertLibraryPrefab(blank(), "apothecary-cabinet", "export-test");
    expect(inspectJava1214(doc).filter(issue => issue.severity === "error")).toEqual([]);
    const model = buildJava1214Model(doc);
    expect(model.elements).toHaveLength(doc.cuboids.length);
    const java = makeJava1214Pack(doc);
    expect(java.paths).toContain("assets/minecraft/blockstates/diamond_block.json");
    expect(java.gameVerified).toBe(false);
    expect(java.zip.length).toBeGreaterThan(1000);
    const archive = await encodeNativeProject(doc);
    expect((await decodeNativeProject(archive))).toEqual(doc);
  });
});

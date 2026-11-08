import { describe, expect, it } from "vitest";
import { FACE_DIRECTIONS } from "../editor/domain";
import { encodeNativeProject, decodeNativeProject } from "../editor/nativeArchive";
import { buildJava1214Model } from "../export/javaBlock";
import { inspectExternalModel, materializeExternalModel, resourceId } from "./externalModel";
import { parseStrictJson } from "./strictJson";

const faces = () => Object.fromEntries(FACE_DIRECTIONS.map((face, i) => [face,
  { uv: i % 2 ? [16, 0, 0, 16] : [0, 0, 16, 16], rotation: (i % 4) * 90, texture: "#surface" }]));
const model = () => ({ ambientocclusion: true, textures: { particle: "#surface", surface: "sample:block/stone" },
  elements: [{ from: [1, 2, 3], to: [15, 14, 13], faces: faces() }] });
const sources = () => [{ resource: "sample:block/model", text: JSON.stringify(model()) }];
const image = () => ({ width: 16, height: 16, pixels: Array.from({ length: 16 * 16 * 4 }, (_, i) => i % 4 === 3 ? 255 : i % 251) });

describe("strict JSON source evidence", () => {
  it("rejects duplicate keys including escaped spellings", () => {
    expect(() => parseStrictJson('{"x":1,"x":2}', "fixture")).toThrow(/Duplicate/);
    expect(() => parseStrictJson('{"x":1,"\\u0078":2}', "fixture")).toThrow(/Duplicate/);
    expect(parseStrictJson('{"x":[{"x":"escaped \\\" quote"}]}', "fixture")).toEqual({ x: [{ x: 'escaped " quote' }] });
  });
  it("rejects invalid JSON, deep input and byte-budget overflow", () => {
    expect(() => parseStrictJson("{", "fixture")).toThrow(/Invalid/);
    expect(() => parseStrictJson("[".repeat(70) + "0" + "]".repeat(70), "fixture")).toThrow(/64/);
    expect(() => parseStrictJson('"ééé"', "fixture", 5)).toThrow(/byte/);
  });
});

describe("bounded external block-model preflight", () => {
  it("imports independently authored explicit cuboids without own-pack metadata", async () => {
    const plan = inspectExternalModel(sources(), "sample:block/model");
    expect(plan.textures).toEqual(["sample:block/stone"]);
    const result = materializeExternalModel(plan, [{ resource: "sample:block/stone", image: image() }], "external-test", "Stone fixture");
    expect(result.document.cuboids[0]!.from).toEqual([1, 2, 3]);
    expect(result.document.cuboids[0]!.faces.east.rotation).toBe(90);
    const archive = await encodeNativeProject(result.document);
    expect(await decodeNativeProject(archive)).toEqual(result.document);
    const exported = buildJava1214Model(result.document);
    for (const direction of FACE_DIRECTIONS) {
      expect(exported.elements[0]!.faces[direction].uv).toEqual(model().elements[0]!.faces[direction]!.uv);
    }
  });
  it("resolves local parent geometry with child texture overrides and reports resolution", () => {
    const local = [
      { resource: "sample:block/parent", text: JSON.stringify(model()) },
      { resource: "sample:block/child", text: JSON.stringify({ parent: "sample:block/parent", textures: { surface: "sample:block/new" } }) }
    ];
    const plan = inspectExternalModel(local, "sample:block/child");
    expect(plan.chain).toEqual(["sample:block/child", "sample:block/parent"]);
    expect(plan.textures).toEqual(["sample:block/new"]);
    expect(plan.notices.join(" ")).toContain("standalone");
  });
  it("rejects missing parents and parent/texture cycles without fetching anything", () => {
    expect(() => inspectExternalModel([{ resource: "sample:a", text: '{"parent":"sample:missing"}' }], "sample:a")).toThrow(/Missing local/);
    expect(() => inspectExternalModel([{ resource: "sample:a", text: '{"parent":"sample:b"}' },
      { resource: "sample:b", text: '{"parent":"sample:a"}' }], "sample:a")).toThrow(/Parent cycle/);
    const broken = model(); broken.textures.surface = "#particle";
    expect(() => inspectExternalModel([{ resource: "sample:a", text: JSON.stringify(broken) }], "sample:a")).toThrow(/alias cycle/);
  });
  it("rejects unknown model/element/face properties and missing faces instead of dropping them", () => {
    const variants = [
      { ...model(), display: {} }, { ...model(), ambientocclusion: false },
      { ...model(), elements: [{ ...model().elements[0], rotation: { axis: "y", angle: 22.5 } }] },
      { ...model(), elements: [{ ...model().elements[0], faces: { ...faces(), north: { texture: "#surface", uv: [0,0,16,16], cullface: "north" } } }] },
      { ...model(), elements: [{ ...model().elements[0], faces: { north: faces().north } }] }
    ];
    for (const variant of variants) expect(() => inspectExternalModel([{ resource: "sample:a", text: JSON.stringify(variant) }], "sample:a")).toThrow();
  });
  it("does not guess implicit UVs, invalid rotations, malformed bounds or missing aliases", () => {
    for (const face of [{ texture: "#surface" }, { texture: "#surface", uv: [0,0,16,16], rotation: 45 },
      { texture: "#unknown", uv: [0,0,16,16] }, { texture: "#surface", uv: [0,0,0,16] }]) {
      const variant = { ...model(), elements: [{ ...model().elements[0], faces: { ...faces(), north: face } }] };
      expect(() => inspectExternalModel([{ resource: "sample:a", text: JSON.stringify(variant) }], "sample:a")).toThrow();
    }
    const variant = { ...model(), elements: [{ ...model().elements[0], from: [-17, 0, 0] }] };
    expect(() => inspectExternalModel([{ resource: "sample:a", text: JSON.stringify(variant) }], "sample:a")).toThrow(/coordinates/);
  });
  it("requires exact local bindings; rejects duplicate resources and unsafe identifiers", () => {
    const plan = inspectExternalModel(sources(), "sample:block/model");
    expect(() => materializeExternalModel(plan, [], "test", "Test")).toThrow(/Missing PNG/);
    expect(() => inspectExternalModel([...sources(), ...sources()], "sample:block/model")).toThrow(/same resource/);
    for (const value of ["../texture", "sample:/absolute", "sample:a/../b", "https://host/image", "sample:a.png", "sample:a//b"])
      expect(() => resourceId(value)).toThrow();
    expect(resourceId("block/stone")).toBe("minecraft:block/stone");
  });
  it("keeps normalized source alpha and refuses implicit resizing", () => {
    const plan = inspectExternalModel(sources(), "sample:block/model"), translucent = image(); translucent.pixels[3] = 0;
    const result = materializeExternalModel(plan, [{ resource: "sample:block/stone", image: translucent }], "test", "Alpha");
    expect(result.document.textures[0]!.pixels[3]).toBe(0);
    expect(() => materializeExternalModel(plan, [{ resource: "sample:block/stone", image: { ...image(), width: 128, height: 128 } }], "test", "Large")).toThrow(/64/);
  });
});

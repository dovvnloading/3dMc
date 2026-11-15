import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8, strToU8, zipSync } from "fflate";
import { createSampleDocument, parseDocument, setAxisValue } from "./domain";
import { createHistory, commit, redo, undo } from "./history";
import {
  defaultElementRotation, elementRescale, isElementRotation, mapRotationToBounds,
  parseJavaElementRotation, transformElementNormal, transformElementPoint, transformedCorners,
  transformedBounds
} from "./elementRotation";
import type { ElementRotation } from "./elementRotation";
import { centerElementPivots, resetElementRotations, setElementAngle, setElementAxis,
  setElementPivot, setElementRescale } from "./rotationCommands";
import { duplicateSelection, mirrorSelection, repeatSelection, transformSelection } from "./selection";
import { encodeNativeProject, decodeNativeProject } from "./nativeArchive";
import { encodeNativePack, decodeNativePack } from "./nativePackArchive";
import { encodePackCheckpoint, decodePackCheckpoint } from "./recovery";
import { indexLegacyProject } from "../pack/packDocument";
import { buildJava1214Model, inspectJava1214, JAVA_PACK_PATHS, makeJava1214Pack } from "../export/javaBlock";
import { inspectJava1214Pack } from "../import/javaPack";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import { inspectIndexedJava1214Pack } from "../import/indexedJavaPack";
import { inspectExternalModel, materializeExternalModel } from "../import/externalModel";

const rotation: ElementRotation = { axis: "y", angle: 45, origin: [8, 0, 8], rescale: false };
const rotated = () => setElementAngle(setElementPivot(setElementAxis(
  createSampleDocument(), ["body"], "y"), ["body"], 1, 5), ["body"], 22.5);

describe("Java 1.21.4 single-axis element rotation", () => {
  it("validates the exact optional native object without rounding, unknown fields or later-version transforms", () => {
    const original = createSampleDocument();
    expect(parseDocument(original)).toEqual(original);
    expect(setElementAngle(original, ["body"], 0)).toBe(original);
    expect(setElementAxis(original, ["body"], "y")).toBe(original);
    expect(centerElementPivots(original, ["body"])).toBe(original);
    expect(isElementRotation(rotation)).toBe(true);
    for (const value of [
      { ...rotation, angle: 17 }, { ...rotation, axis: ["x", "z"] },
      { ...rotation, origin: [NaN, 0, 0] }, { ...rotation, origin: [257, 0, 0] },
      { ...rotation, rescale: "true" }, { ...rotation, extra: "future" },
      { ...rotation, origin: [8, 8] }, { ...rotation, axis: "q" }
    ]) {
      expect(isElementRotation(value)).toBe(false);
      expect(() => parseDocument({ ...original, cuboids: [
        { ...original.cuboids[0]!, rotation: value }, ...original.cuboids.slice(1)
      ] })).toThrow(/Invalid cuboid/);
    }
    expect(() => parseJavaElementRotation({ ...rotation, axes: ["x"] }, "element")).toThrow(/Unsupported/);
    expect(() => parseJavaElementRotation({ axis: "x", angle: 30 }, "element")).toThrow(/Unsupported/);
    expect(() => parseDocument({ ...original, schemaVersion: 2, cuboids: [
      { ...original.cuboids[0]!, rotation }, ...original.cuboids.slice(1)
    ] })).toThrow(/Legacy project contains unsupported element rotation/);
    expect(() => parseJavaElementRotation({ axis: "z", angle: -22.5 }, "element")).toThrow(/Unsupported/);
    expect(parseJavaElementRotation({ axis: "z", angle: -22.5, origin: [8, 8, 8] }, "element")).toEqual({
      axis: "z", angle: -22.5, origin: [8, 8, 8], rescale: false
    });
    expect(defaultElementRotation(original.cuboids[0]!)).toEqual({
      axis: "y", angle: 0, origin: [8, 7.5, 8], rescale: false
    });
  });

  it("rotates translated corners and semantic normals around nonzero pivots", () => {
    const transformed = transformElementPoint([9, 0, 8], rotation);
    expect(transformed[0]).toBeCloseTo(8 + Math.SQRT1_2);
    expect(transformed[2]).toBeCloseTo(8 - Math.SQRT1_2);
    expect(transformElementPoint(rotation.origin, rotation)).toEqual(rotation.origin);
    const normal = transformElementNormal([0, 0, -1], rotation);
    expect(normal[0]).toBeCloseTo(-Math.SQRT1_2);
    expect(normal[1]).toBeCloseTo(0);
    expect(normal[2]).toBeCloseTo(-Math.SQRT1_2);
    const cube = { from: [0, 0, 0] as const, to: [16, 16, 16] as const,
      rotation: { ...rotation, origin: [8, 8, 8] as const } };
    const corners = transformedCorners(cube);
    expect(corners).toHaveLength(8);
    const bounds = transformedBounds(cube);
    expect(bounds.from[0]).toBeCloseTo(8 - 8 * Math.SQRT2);
    expect(bounds.to[0]).toBeCloseTo(8 + 8 * Math.SQRT2);
    expect(bounds.from[2]).toBeCloseTo(8 - 8 * Math.SQRT2);
    expect(bounds.to[2]).toBeCloseTo(8 + 8 * Math.SQRT2);
  });

  it("compensates on precisely the two axes perpendicular to the selected axis", () => {
    for (const axis of ["x", "y", "z"] as const) {
      const source: ElementRotation = { ...rotation, axis, angle: 45, rescale: true };
      const factors = elementRescale(source);
      expect(factors[["x", "y", "z"].indexOf(axis)]).toBe(1);
      factors.forEach((factor, index) => {
        if (index !== ["x", "y", "z"].indexOf(axis)) expect(factor).toBeCloseTo(Math.SQRT2);
      });
    }
    const noComp = transformElementPoint([9, 0, 8], rotation);
    const withComp = transformElementPoint([9, 0, 8], { ...rotation, rescale: true });
    expect(withComp[0] - 8).toBeCloseTo((noComp[0] - 8) * Math.SQRT2);
  });

  it("uses transactional selection edits, refuses locked/hidden and restores exact sources", () => {
    const original = createSampleDocument();
    let history = createHistory(original);
    const rotatedBoth = setElementAngle(original, ["body", "base"], -22.5);
    expect(rotatedBoth.cuboids[0]!.rotation?.origin).toEqual([8, 7.5, 8]);
    expect(rotatedBoth.cuboids[1]!.rotation?.origin).toEqual([8, 2, 8]);
    history = commit(history, rotatedBoth);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(original);
    expect(redo(undo(history)).present).toBe(rotatedBoth);
    const locked = { ...original, cuboids: original.cuboids.map(node =>
      node.id === "base" ? { ...node, locked: true } : node) };
    expect(() => setElementAngle(locked, ["body", "base"], 45)).toThrow(/locked/i);
    expect(() => setElementAngle(original, ["body"], 15 as never)).toThrow(/only accepts/i);
    const reset = resetElementRotations(rotatedBoth, ["body", "base"]);
    expect(reset.cuboids.every(node => node.rotation === undefined)).toBe(true);
    expect(centerElementPivots(rotatedBoth, ["body"]).cuboids[0]?.rotation?.origin).toEqual([8, 7.5, 8]);
    expect(setElementRescale(rotatedBoth, ["body"], true).cuboids[0]?.rotation?.rescale).toBe(true);
  });

  it("maps pivots on positional changes, resize, duplicate and array without changing angles", () => {
    const source = rotated();
    const original = source.cuboids[0]!;
    const moved = setAxisValue(source, "body", "position", 0, 4);
    expect(moved.cuboids[0]!.rotation?.origin[0]).toBe(9);
    expect(moved.cuboids[0]!.rotation?.origin[1]).toBe(5);
    const resized = setAxisValue(source, "body", "size", 1, 18);
    expect(resized.cuboids[0]?.rotation?.origin[1]).toBeCloseTo(3 + (5 - 3) * 2);
    expect(mapRotationToBounds(original, [4, 3, 3], [14, 12, 13])?.origin[0]).toBe(9);
    const cloned = duplicateSelection(source, ["body"], ["rotated-clone"]);
    expect(cloned.cuboids.at(-1)?.rotation?.angle).toBe(22.5);
    const repeated = repeatSelection(source, ["body"], ["array-copy"], 1, [2, 0, 0]);
    expect(repeated.cuboids.at(-1)?.rotation?.origin[0]).toBe(10);
    const shifted = transformSelection(source, ["body"], [2, 0, 0], [1, 1, 1]);
    expect(shifted.cuboids[0]?.rotation?.origin[0]).toBe(10);
    const mirrored = mirrorSelection(source, ["body"], 0);
    expect(mirrored.cuboids[0]?.rotation?.angle).toBe(-22.5);
    expect(mirrorSelection(mirrored, ["body"], 0).cuboids[0]).toEqual(original);
    expect(() => transformSelection(source, ["body"], [0, 0, 0], [1.2, 1, 1])).toThrow(/not representable/);
  });

  it("keeps native v2, pack v3 and pack recovery source geometry byte-exact after reopen", async () => {
    const source = setElementRescale(rotated(), ["body"], true);
    const reopened = await decodeNativeProject(await encodeNativeProject(source));
    expect(reopened).toEqual(source);
    const pack = indexLegacyProject(source);
    const reopenedPack = await decodeNativePack(await encodeNativePack(pack, [source]));
    expect(reopenedPack.sources).toEqual([source]);
    expect(decodePackCheckpoint(encodePackCheckpoint(pack, [source]))).toEqual({ pack, sources: [source] });
    const previous = createSampleDocument();
    expect((await decodeNativeProject(await encodeNativeProject(previous))).cuboids[0]?.rotation).toBeUndefined();
  });

  it("exports and strictly reimports one-axis rotation through Java and indexed Java packs", () => {
    const source = setElementRescale(rotated(), ["body"], true);
    expect(inspectJava1214(source).filter(issue => issue.severity === "error")).toEqual([]);
    const model = buildJava1214Model(source);
    expect(model.elements[0]!.rotation).toEqual({
      origin: [8, 5, 8], axis: "y", angle: 22.5, rescale: true
    });
    expect(buildJava1214Model(createSampleDocument()).elements[0]!.rotation).toBeUndefined();
    const zipped = makeJava1214Pack(source).zip;
    const zipModel = JSON.parse(strFromU8(unzipSync(zipped)[JAVA_PACK_PATHS.model]!));
    expect(zipModel.elements[0].rotation).toEqual(model.elements[0]!.rotation);
    const imported = inspectJava1214Pack(zipped);
    expect(imported.status).toBe("editable");
    if (imported.status !== "editable") throw new Error(imported.problems.join("; "));
    expect(imported.document.cuboids[0]?.rotation).toEqual(source.cuboids[0]?.rotation);
    // A future-version angle must be blocked in both strict ZIP readers.
    const rewrite = (bytes: Uint8Array, modelPath: string) => {
      const files = unzipSync(bytes);
      const decoded = JSON.parse(strFromU8(files[modelPath]!)) as {
        elements: Array<{ rotation?: { angle: number } }>;
      };
      decoded.elements[0]!.rotation!.angle = 17;
      files[modelPath] = strToU8(JSON.stringify(decoded));
      return zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
    };
    expect(inspectJava1214Pack(rewrite(zipped, JAVA_PACK_PATHS.model)).status).toBe("blocked");
    const indexed = makeIndexedJava1214Pack(indexLegacyProject(source), [source]);
    const indexedReopened = inspectIndexedJava1214Pack(indexed.zip);
    expect(indexedReopened.status).toBe("editable");
    if (indexedReopened.status !== "editable") throw new Error(indexedReopened.problems.join("; "));
    expect(indexedReopened.project.sources[0]?.cuboids[0]?.rotation).toEqual(source.cuboids[0]?.rotation);
    expect(inspectIndexedJava1214Pack(rewrite(indexed.zip, JAVA_PACK_PATHS.model)).status).toBe("blocked");
    const invalid = { ...source, cuboids: [
      { ...source.cuboids[0]!, rotation: { ...source.cuboids[0]!.rotation!, angle: 17 } },
      ...source.cuboids.slice(1)
    ] } as unknown as typeof source;
    expect(inspectJava1214(invalid)).toContainEqual(expect.objectContaining({
      severity: "error", code: "ELEMENT_ROTATION_UNSUPPORTED", nodeId: "body"
    }));
  });

  it("imports supported local models and blocks future-rotation fields instead of flattening them", () => {
    const original = createSampleDocument();
    const face = Object.fromEntries(["down", "up", "north", "south", "west", "east"].map(direction =>
      [direction, { uv: [0, 0, 16, 16], texture: "#painted" }]));
    const model = { textures: { painted: "test:block/painted" }, elements: [{
      from: [3, 3, 3], to: [13, 12, 13], rotation, faces: face
    }] };
    const files = [{ resource: "test:block/angled", text: JSON.stringify(model) }];
    const plan = inspectExternalModel(files, "test:block/angled");
    const imported = materializeExternalModel(plan, [{
      resource: "test:block/painted", image: original.textures[0]!
    }], "test-angled", "Angled");
    expect(imported.document.cuboids[0]?.rotation).toEqual(rotation);
    expect(() => inspectExternalModel([{
      ...files[0]!, text: JSON.stringify({ ...model, elements: [
        { ...model.elements[0]!, rotation: { axis: "x", angle: 30, origin: [8, 8, 8], rescale: false } }
      ] })
    }], "test:block/angled")).toThrow(/Unsupported element rotation/);
  });
});

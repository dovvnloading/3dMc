import { describe, expect, it } from "vitest";
import { createSampleDocument, deleteCuboid, parseDocument } from "./domain";
import { deleteSelection } from "./selection";
import { commit, createHistory, redo, undo } from "./history";
import { groupSelection, renameGroup, ungroup } from "./groups";
import { decodeNativeProject, encodeNativeProject } from "./nativeArchive";
import { decodeNativePack, encodeNativePack } from "./nativePackArchive";
import { indexLegacyProject } from "../pack/packDocument";

describe("named editor-only source groups", () => {
  it("groups, renames, ungroups and reassigns cuboids with reversible history", () => {
    const source = createSampleDocument();
    const snapshot = JSON.stringify(source);
    const grouped = groupSelection(source, ["base", "body"], "frame", "Frame");
    expect(grouped.groups).toEqual([{ id: "frame", name: "Frame",
      memberIds: ["body", "base"] }]);
    expect(grouped.cuboids).toBe(source.cuboids);
    expect(grouped.textures).toBe(source.textures);
    const renamed = renameGroup(grouped, "frame", "Copper shell");
    expect(renamed.groups![0]!.name).toBe("Copper shell");
    expect(renameGroup(renamed, "frame", "Copper shell")).toBe(renamed);
    const migrated = groupSelection(renamed, ["base", "roof"], "upper", "Upper");
    expect(migrated.groups).toEqual([
      { id: "frame", name: "Copper shell", memberIds: ["body"] },
      { id: "upper", name: "Upper", memberIds: ["base", "roof"] }
    ]);
    const cleared = ungroup(migrated, "upper");
    expect(cleared.groups).toEqual([{ id: "frame", name: "Copper shell", memberIds: ["body"] }]);
    expect(parseDocument(grouped)).toEqual(grouped);
    const history = commit(createHistory(source), grouped);
    expect(history.past).toHaveLength(1);
    expect(undo(history).present).toBe(source);
    expect(redo(undo(history)).present).toBe(grouped);
    expect(JSON.stringify(source)).toBe(snapshot);
  });

  it("cleans up references when grouped parts are deleted and allows restoring them", () => {
    const source = groupSelection(createSampleDocument(), ["body", "base"], "frame", "Frame");
    const partial = deleteSelection(source, ["body"]);
    expect(partial.groups).toEqual([{ id: "frame", name: "Frame", memberIds: ["base"] }]);
    const empty = deleteCuboid(partial, "base");
    expect(empty.groups).toEqual([]);
    expect(parseDocument(empty)).toEqual(empty);
    expect(undo(commit(createHistory(source), empty)).present).toBe(source);
  });

  it("rejects unknown group fields, orphaned IDs and overlapping memberships", () => {
    const source = createSampleDocument();
    expect(() => groupSelection(source, ["body"], "frame", "Frame")).toThrow(/two editable/);
    expect(() => groupSelection(source, ["body", "base"], "bad id", "Frame")).toThrow(/identity/);
    const grouped = groupSelection(source, ["body", "base"], "frame", "Frame");
    expect(() => groupSelection(grouped, ["base", "roof"], "frame", "Duplicate")).toThrow(/identity/);
    expect(() => renameGroup(grouped, "frame", "   ")).toThrow(/name/);
    expect(() => ungroup(grouped, "missing")).toThrow(/no longer exists/);
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const unknown = clone(grouped) as typeof grouped & { groups: any[] };
    unknown.groups![0]!.future = "unsupported";
    expect(() => parseDocument(unknown)).toThrow(/unknown/);
    const orphan = clone(grouped);
    orphan.groups![0]!.memberIds = ["missing"];
    expect(() => parseDocument(orphan)).toThrow(/missing cuboid/);
    const duplicate = clone(grouped);
    duplicate.groups![0]!.memberIds = ["body", "body"];
    expect(() => parseDocument(duplicate)).toThrow(/duplicated/);
    const overlapping = clone(grouped);
    overlapping.groups!.push({ id: "other", name: "Other", memberIds: ["base"] });
    expect(() => parseDocument(overlapping)).toThrow(/duplicated/);
    expect(source.groups).toBeUndefined();
  });

  it("round-trips groups in portable standalone and multi-model source ZIPs", async () => {
    const source = groupSelection(createSampleDocument(), ["body", "base"], "frame", "Frame");
    const standalone = await decodeNativeProject(await encodeNativeProject(source));
    expect(standalone).toEqual(source);
    const packIndex = indexLegacyProject(source);
    const restored = await decodeNativePack(await encodeNativePack(packIndex, [source]));
    expect(restored.sources).toEqual([source]);
    expect(restored.pack).toEqual(packIndex);
    const oldSource = createSampleDocument();
    expect((await decodeNativeProject(await encodeNativeProject(oldSource))).groups).toBeUndefined();
  });
});

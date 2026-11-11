import { describe, expect, it } from "vitest";
import { addTexture, createSampleDocument, removeTexture, setAxisValue } from "../editor/domain";
import { commit, createHistory, undo } from "../editor/history";
import { undoPackSession } from "./packSession";
import { advancePackFromEditor, packHistoryView, upgradeEditorHistory } from "./editorBridge";

describe("pack editor history integration", () => {
  it("keeps legacy undo snapshots when entering pack mode", () => {
    const doc = createSampleDocument();
    const old = commit(createHistory(doc), setAxisValue(doc, "body", "position", 0, 5));
    const pack = upgradeEditorHistory(old);
    expect(packHistoryView(pack).past).toHaveLength(1);
    expect(packHistoryView(pack).present.cuboids[0]?.from[0]).toBe(5);
    expect(packHistoryView(undoPackSession(pack)).present.cuboids[0]?.from[0]).toBe(3);
    expect(upgradeEditorHistory(undo(old)).future).toHaveLength(1);
  });
  it("coordinates source texture additions and removals with pack references", () => {
    const pack = upgradeEditorHistory(createHistory(createSampleDocument()));
    const before = packHistoryView(pack);
    const addedDoc = addTexture(before.present, { id: "details", name: "details.png", width: 16,
      height: 16, pixels: new Array(16 * 16 * 4).fill(255) });
    const added = advancePackFromEditor(pack, before, commit(before, addedDoc));
    expect(added.present.pack.models[0]?.textures).toHaveLength(2);
    expect(added.present.pack.textures).toHaveLength(2);
    expect(added.present.sources[0]?.textures).toHaveLength(2);
    const next = packHistoryView(added);
    const removed = advancePackFromEditor(added, next,
      commit(next, removeTexture(next.present, "details", "main")));
    expect(removed.present.pack.textures).toHaveLength(1);
    expect(removed.present.sources[0]?.textures).toHaveLength(1);
    expect(undoPackSession(removed).present.pack.textures).toHaveLength(2);
  });
});

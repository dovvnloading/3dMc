import { describe, expect, it, vi } from "vitest";
import { createSampleDocument } from "./domain";
import { createEditorCommands } from "./commands";
import type { EditorCommandActions, EditorCommandContext } from "./commands";

function fixture() {
  const state: EditorCommandContext = {
    document: createSampleDocument(),
    mode: "model",
    selectedIds: ["body"],
    selectedId: "body",
    sceneSearch: "",
    editDisabledReason: null,
    canUndo: false,
    canRedo: false,
    rotatedSelection: false,
    rotateToolReason: null,
    savingProject: false,
    importingPack: false,
    importingTexture: false
  };
  const actions: EditorCommandActions = {
    newProject: vi.fn(), openProject: vi.fn(), saveProject: vi.fn(),
    importPack: vi.fn(), exportMinecraft: vi.fn(), exportTexture: vi.fn(),
    importTexture: vi.fn(), saveLegacyJson: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    addCuboid: vi.fn(), addShape: vi.fn(), duplicate: vi.fn(), deleteSelection: vi.fn(),
    selectAll: vi.fn(), changeMode: vi.fn(), switchTool: vi.fn(), navigate: vi.fn(),
    openPackStudio: vi.fn(), openCreatorPanel: vi.fn(), openRecoveryDetails: vi.fn()
  };
  const commands = (changes: Partial<EditorCommandContext> = {}) => createEditorCommands({ ...state, ...changes }, actions);
  const get = (id: string, changes: Partial<EditorCommandContext> = {}) => {
    const command = commands(changes).find(command => command.id === id);
    if (!command) throw new Error("Missing command: " + id);
    return command;
  };
  return { state, actions, commands, get };
}

describe("editor command registry", () => {
  it("has stable unique IDs and covers editor actions with metadata", () => {
    const { commands } = fixture();
    const all = commands();
    expect(all.length).toBeGreaterThan(35);
    expect(new Set(all.map(command => command.id)).size).toBe(all.length);
    expect(all.every(command => command.title.length && command.category.length)).toBe(true);
    for (const id of ["project.new", "project.open", "project.save", "project.export",
      "edit.undo", "edit.redo", "edit.select-all", "edit.duplicate", "edit.delete",
      "create.cuboid", "create.half-slab", "mode.model", "mode.paint", "mode.preview",
      "tool.select", "tool.move", "tool.resize", "tool.rotate", "tool.pencil", "tool.eraser",
      "tool.fill", "tool.eyedropper", "tool.line", "tool.rectangle", "view.iso", "view.top",
      "dialog.pack-studio", "dialog.import-model", "dialog.library", "dialog.region", "dialog.face"]) {
      expect(all.some(command => command.id === id), id).toBe(true);
    }
    expect(all.find(command => command.id === "project.save")?.shortcut).toBe("Ctrl/Cmd+S");
  });

  it("calls the editor's handlers rather than reimplementing actions", () => {
    const { actions, get } = fixture();
    get("project.new").run();
    get("project.save").run();
    get("create.half-slab").run();
    get("mode.paint").run();
    get("tool.select").run();
    get("view.top").run();
    get("dialog.import-model").run();
    expect(actions.newProject).toHaveBeenCalledOnce();
    expect(actions.saveProject).toHaveBeenCalledOnce();
    expect(actions.addShape).toHaveBeenCalledWith("half-slab");
    expect(actions.changeMode).toHaveBeenCalledWith("paint");
    expect(actions.switchTool).toHaveBeenCalledWith("select");
    expect(actions.navigate).toHaveBeenCalledWith("top");
    expect(actions.openCreatorPanel).toHaveBeenCalledWith("import");
  });

  it("blocks missing-history and missing-selection actions, even when run is called", () => {
    const { actions, get } = fixture();
    for (const id of ["edit.undo", "edit.redo", "edit.duplicate", "edit.delete"]) {
      const command = get(id, { selectedIds: [] });
      expect(command.enabled).toBe(false);
      expect(command.disabledReason).toBeTruthy();
      command.run();
    }
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.redo).not.toHaveBeenCalled();
    expect(actions.duplicate).not.toHaveBeenCalled();
    expect(actions.deleteSelection).not.toHaveBeenCalled();
  });

  it("disables edit commands when local recovery is unavailable, but permits navigation and backups", () => {
    const { get, actions } = fixture();
    const changes = { editDisabledReason: "Resolve recovery first.", canUndo: true };
    for (const id of ["project.new", "project.open", "edit.undo", "edit.duplicate",
      "create.cuboid", "dialog.import-model"]) {
      const command = get(id, changes);
      expect(command.enabled).toBe(false);
      expect(command.disabledReason).toBe("Resolve recovery first.");
      command.run();
    }
    get("mode.paint", changes).run();
    get("project.save", changes).run();
    expect(actions.newProject).not.toHaveBeenCalled();
    expect(actions.undo).not.toHaveBeenCalled();
    expect(actions.changeMode).toHaveBeenCalledWith("paint");
    expect(actions.saveProject).toHaveBeenCalledOnce();
  });

  it("enforces paint/model tool modes and rotation limitations", () => {
    const { get, actions } = fixture();
    const unavailable = get("tool.rotate", { rotateToolReason: "Unsupported target." });
    expect(unavailable.disabledReason).toBe("Unsupported target.");
    unavailable.run();
    expect(actions.switchTool).not.toHaveBeenCalled();
    expect(get("tool.resize", { rotatedSelection: true }).enabled).toBe(false);
    expect(get("tool.pencil").disabledReason).toContain("Paint mode");
    expect(get("tool.move", { mode: "paint" }).disabledReason).toContain("Model mode");
    expect(get("tool.eraser", { mode: "paint" }).enabled).toBe(true);
    expect(get("tool.select", { mode: "preview" }).enabled).toBe(false);
  });

  it("explains protected selection, the scene filter, and face-tool availability", () => {
    const { state, get } = fixture();
    const protectedDoc = {
      ...state.document,
      cuboids: state.document.cuboids.map(node =>
        node.id === "body" ? { ...node, locked: true } : node)
    };
    expect(get("edit.duplicate", { document: protectedDoc }).disabledReason).toMatch(/locked/i);
    expect(get("edit.delete", { document: protectedDoc }).disabledReason).toMatch(/locked/i);
    expect(get("edit.select-all", { sceneSearch: "not a real element name" }).disabledReason)
      .toMatch(/match the scene filter/);
    expect(get("dialog.face", { mode: "paint", selectedId: null }).disabledReason)
      .toMatch(/textured element/);
    expect(get("dialog.region", { mode: "paint" }).enabled).toBe(true);
  });

  it("does not offer duplication when the selection would exceed the source limit", () => {
    const { state, get, actions } = fixture();
    const source = state.document.cuboids[0]!;
    const fullDocument = { ...state.document,
      cuboids: Array.from({ length: 1999 }, (_, index) => ({ ...source, id: "node-" + index })) };
    const duplicate = get("edit.duplicate", {
      document: fullDocument, selectedIds: ["node-0", "node-1"], selectedId: "node-1"
    });
    expect(duplicate.disabledReason).toContain("2,000-element limit");
    duplicate.run();
    expect(actions.duplicate).not.toHaveBeenCalled();
  });

  it("blocks concurrent save/pack imports and unsupported Pack Studio", () => {
    const { state, get } = fixture();
    expect(get("project.save", { savingProject: true }).enabled).toBe(false);
    expect(get("project.import-pack", { importingPack: true }).enabled).toBe(false);
    expect(get("project.import-png", { importingTexture: true }).enabled).toBe(false);
    const unsupported = { ...state.document, target: { ...state.document.target, candidateRelease: "26.3" as const } };
    expect(get("dialog.pack-studio", { document: unsupported }).disabledReason).toContain("1.21.4");
  });
});

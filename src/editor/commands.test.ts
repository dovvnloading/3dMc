import { describe, expect, it, vi } from "vitest";
import { createSampleDocument } from "./domain";
import { createEditorCommands } from "./commands";
import type { EditorCommandActions, EditorCommandContext } from "./commands";
import { groupEditorShortcuts, SHORTCUT_AREAS } from "./shortcuts";
import { keyToShortcut, resolveEditorShortcut } from "./useEditorKeyboardShortcuts";

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
    symmetry: "off",
    rotateToolReason: null,
    savingProject: false,
    importingPack: false,
    importingTexture: false
  };
  const actions: EditorCommandActions = {
    newProject: vi.fn(), openProject: vi.fn(), saveProject: vi.fn(),
    importPack: vi.fn(), exportMinecraft: vi.fn(), exportTexture: vi.fn(),
    importTexture: vi.fn(), saveLegacyJson: vi.fn(), undo: vi.fn(), redo: vi.fn(),
    cancelCurrentTool: vi.fn(), decreaseBrushSize: vi.fn(), increaseBrushSize: vi.fn(),
    frameSelection: vi.fn(), frameAll: vi.fn(), openShortcuts: vi.fn(), openCommandPalette: vi.fn(),
    addCuboid: vi.fn(), addShape: vi.fn(), duplicate: vi.fn(), deleteSelection: vi.fn(),
    rename: vi.fn(), renameGroup: vi.fn(), setSelectionVisibility: vi.fn(),
    setSelectionLocked: vi.fn(), groupSelection: vi.fn(), ungroup: vi.fn(),
    selectAll: vi.fn(), changeMode: vi.fn(), switchTool: vi.fn(),
    cycleSymmetry: vi.fn(), setSymmetry: vi.fn(), navigate: vi.fn(),
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
      "tool.fill", "tool.eyedropper", "tool.line", "tool.rectangle", "tool.ellipse",
      "paint.symmetry.cycle", "paint.symmetry.off", "paint.symmetry.x", "paint.symmetry.y", "paint.symmetry.both",
      "view.iso", "view.top", "view.frame", "dialog.shortcuts", "dialog.command-palette",
      "paint.brush.decrease", "paint.brush.increase", "edit.cancel",
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
    expect(get("tool.ellipse", { mode: "paint" }).enabled).toBe(true);
    expect(get("tool.select", { mode: "preview" }).enabled).toBe(true); // V worked in every mode.
  });

  it("exposes symmetry modes, ellipse and collision-free Paint shortcuts", () => {
    const { commands, get, actions } = fixture();
    const all = commands({ mode: "paint", symmetry: "x" });
    const getShortcut = (id: string) => all.find(command => command.id === id)?.shortcut;
    expect(getShortcut("tool.ellipse")).toBe("O");
    expect(getShortcut("paint.symmetry.cycle")).toBe("M");
    expect(all.filter(command => command.shortcut === "M")).toHaveLength(1);
    expect(all.filter(command => command.shortcut === "O")).toHaveLength(1);
    get("tool.ellipse", { mode: "paint" }).run();
    get("paint.symmetry.cycle", { mode: "paint" }).run();
    get("paint.symmetry.both", { mode: "paint" }).run();
    expect(actions.switchTool).toHaveBeenCalledWith("ellipse");
    expect(actions.cycleSymmetry).toHaveBeenCalledOnce();
    expect(actions.setSymmetry).toHaveBeenCalledWith("both");
    expect(get("paint.symmetry.x", { mode: "model" }).enabled).toBe(false);
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

describe("shortcut reference", () => {
  it("groups every shortcut directly from the registry, including unavailable tools and alternate keys", () => {
    const { commands } = fixture();
    const modelCommands = commands();
    const paintCommands = commands({ mode: "paint" });
    const groups = groupEditorShortcuts(modelCommands);
    expect(groups.map(group => group.area)).toEqual(SHORTCUT_AREAS);
    expect(groups.every(group => group.entries.length > 0)).toBe(true);
    const entries = groups.flatMap(group => group.entries);
    const shortcutCommands = modelCommands.filter(command => command.shortcut);
    expect(entries.map(entry => entry.id)).toHaveLength(shortcutCommands.length);
    expect(new Set(entries.map(entry => entry.id)).size).toBe(shortcutCommands.length);
    for (const command of shortcutCommands) {
      const entry = entries.find(entry => entry.id === command.id);
      expect(entry?.shortcuts).toEqual([command.shortcut, ...(command.alternateShortcuts ?? [])]);
      expect(command.shortcutArea, command.id).toBeDefined();
    }
    expect(groupEditorShortcuts(paintCommands).map(group => group.entries.map(entry => entry.id)))
      .toEqual(groups.map(group => group.entries.map(entry => entry.id)));
    expect(groups.find(group => group.area === "Paint tools")?.entries.some(entry => entry.id === "tool.eraser"))
      .toBe(true); // Listed even when currently disabled in Model mode.
    expect(entries.find(entry => entry.id === "edit.redo")?.shortcuts)
      .toEqual(["Ctrl/Cmd+Shift+Z", "Ctrl/Cmd+Y"]);
    expect(entries.find(entry => entry.id === "edit.delete")?.shortcuts)
      .toEqual(["Delete", "Backspace"]);
    expect(entries.find(entry => entry.id === "view.frame")?.shortcuts).toEqual(["F"]);
    expect(modelCommands.find(command => command.id === "view.iso")?.shortcut).toBeUndefined();
    expect(entries.find(entry => entry.id === "dialog.shortcuts")?.shortcuts).toEqual(["?"]);
  });

  it("dispatches shared E to Rotate in Model and Eraser in Paint, not a disabled command", () => {
    const { commands, actions } = fixture();
    const model = resolveEditorShortcut(commands({ mode: "model" }), "E");
    expect(model.registered).toBe(true);
    expect(model.command?.id).toBe("tool.rotate");
    model.command?.run();
    expect(actions.switchTool).toHaveBeenCalledWith("rotate");

    const paint = resolveEditorShortcut(commands({ mode: "paint" }), "E");
    expect(paint.registered).toBe(true);
    expect(paint.command?.id).toBe("tool.eraser");
    paint.command?.run();
    expect(actions.switchTool).toHaveBeenCalledWith("eraser");

    const blocked = resolveEditorShortcut(commands({ mode: "paint" }), "Ctrl/Cmd+D");
    expect(blocked.registered).toBe(true);
    expect(blocked.command).toBeUndefined();
    expect(resolveEditorShortcut(commands({ mode: "paint" }), "Ctrl/Cmd+Y").registered).toBe(true);
    expect(resolveEditorShortcut(commands({ mode: "paint" }), "F").command?.id).toBe("view.frame");
    expect(resolveEditorShortcut(commands({ mode: "paint" }), "x").registered).toBe(false);
  });

  it("avoids same-mode collisions and invokes the existing handlers", () => {
    const { commands, actions, get } = fixture();
    for (const mode of ["model", "paint", "preview"] as const) {
      const occupied = new Set<string>();
      for (const command of commands({ mode })) {
        if (!command.enabled) continue;
        for (const shortcut of [command.shortcut, ...(command.alternateShortcuts ?? [])]) {
          if (!shortcut) continue;
          expect(occupied.has(shortcut), `Duplicate ${mode} shortcut: ${shortcut}`).toBe(false);
          occupied.add(shortcut);
        }
      }
    }
    get("view.frame").run();
    get("dialog.shortcuts").run();
    get("dialog.command-palette").run();
    get("paint.brush.increase", { mode: "paint" }).run();
    get("edit.cancel").run();
    expect(actions.frameSelection).toHaveBeenCalledOnce();
    expect(actions.openShortcuts).toHaveBeenCalledOnce();
    expect(actions.openCommandPalette).toHaveBeenCalledOnce();
    expect(actions.increaseBrushSize).toHaveBeenCalledOnce();
    expect(actions.cancelCurrentTool).toHaveBeenCalledOnce();
  });

  it("normalizes platform modifiers, the question mark, and both deletion keys", () => {
    const key = (changes: Partial<Parameters<typeof keyToShortcut>[0]>) =>
      keyToShortcut({ key: "f", ctrlKey: false, metaKey: false, shiftKey: false,
        altKey: false, isComposing: false, ...changes });
    expect(key({})).toBe("F");
    expect(key({ key: "?", shiftKey: true })).toBe("?");
    expect(key({ key: "/", shiftKey: true })).toBe("?");
    expect(key({ key: "k", metaKey: true })).toBe("Ctrl/Cmd+K");
    expect(key({ key: "Z", ctrlKey: true, shiftKey: true })).toBe("Ctrl/Cmd+Shift+Z");
    expect(key({ key: "Delete" })).toBe("Delete");
    expect(key({ key: "Backspace" })).toBe("Backspace");
    expect(key({ key: "[" })).toBe("[");
    expect(key({ altKey: true })).toBeNull();
    expect(key({ shiftKey: true })).toBe("F"); // Preserve existing Shift+letter behavior.
    expect(key({ key: "Delete", shiftKey: true })).toBe("Delete");
    expect(key({ key: "Escape", shiftKey: true })).toBe("Esc");
    expect(key({ key: "{", shiftKey: true })).toBeNull();
    expect(key({ isComposing: true })).toBeNull();
  });
});

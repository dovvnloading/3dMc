import { describe, expect, it, vi } from "vitest";
import { createSampleDocument } from "./domain";
import { createEditorCommands } from "./commands";
import type { EditorCommandActions, EditorCommandContext } from "./commands";
import { buildContextMenuItems } from "./contextMenuItems";
import { findSelectedGroup } from "./groups";
import { DEFAULT_VIEWPORT_DISPLAY } from "./viewportProjection";
import type { ContextMenuSurface } from "./contextMenuItems";

function fixture(changes: Partial<EditorCommandContext> = {}) {
  const state: EditorCommandContext = {
    document: createSampleDocument(), mode: "model",
    selectedIds: ["body"], selectedId: "body", sceneSearch: "",
    editDisabledReason: null, canUndo: false, canRedo: false,
    rotatedSelection: false, symmetry: "off", rotateToolReason: null,
    savingProject: false, importingPack: false, importingTexture: false,
    viewportDisplay: DEFAULT_VIEWPORT_DISPLAY,
    ...changes
  };
  const calls = vi.fn();
  const actions = new Proxy({} as EditorCommandActions, {
    get: (_target, prop) => (...args: unknown[]) => calls(String(prop), ...args)
  });
  const commands = createEditorCommands(state, actions);
  const menu = (surface: ContextMenuSurface) =>
    buildContextMenuItems(commands, surface, !!findSelectedGroup(state.document, state.selectedIds));
  const item = (surface: ContextMenuSurface, id: string) => {
    const found = menu(surface).find(entry => entry.command.id === id);
    if (!found) throw new Error("Missing menu item " + id);
    return found;
  };
  return { state, calls, commands, menu, item };
}

describe("registry-backed context menus", () => {
  it("builds an element menu in action order, retaining shortcut and run references", () => {
    const { menu, commands, calls, item } = fixture();
    expect(menu("element").map(entry => entry.label)).toEqual(
      ["Rename", "Duplicate", "Delete", "Hide", "Lock", "Group", "Frame selection"]);
    expect(item("element", "edit.duplicate").command).toBe(
      commands.find(command => command.id === "edit.duplicate"));
    expect(item("element", "edit.duplicate").command.shortcut).toBe("Ctrl/Cmd+D");
    expect(item("element", "edit.delete").command.alternateShortcuts).toContain("Backspace");
    item("element", "edit.duplicate").command.run();
    expect(calls).toHaveBeenCalledWith("duplicate");
    expect(item("element", "edit.group").command.disabledReason).toMatch(/two elements/);
  });

  it("acts on multi-selection, but cannot rename multiple ungrouped parts", () => {
    const { item, calls } = fixture({ selectedIds: ["body", "base"], selectedId: "base" });
    expect(item("element", "edit.duplicate").command.enabled).toBe(true);
    expect(item("element", "edit.delete").command.enabled).toBe(true);
    expect(item("element", "edit.group").command.enabled).toBe(true);
    expect(item("element", "edit.rename").command.disabledReason).toMatch(/one element/);
    item("element", "edit.group").command.run();
    expect(calls).toHaveBeenCalledWith("groupSelection");
  });

  it("recognizes whole groups for group-row rename and ungroup, not regrouping", () => {
    const document = { ...createSampleDocument(),
      groups: [{ id: "g", name: "Handle", memberIds: ["body", "base"] }] };
    const { menu, item, calls } = fixture({
      document, selectedIds: ["base", "body"], selectedId: "body"
    });
    expect(menu("element").map(entry => entry.command.id)).toContain("edit.ungroup");
    expect(menu("group").map(entry => entry.command.id)).toContain("edit.rename-group");
    expect(item("group", "edit.ungroup").command.enabled).toBe(true);
    item("group", "edit.rename-group").command.run();
    item("group", "edit.ungroup").command.run();
    expect(calls).toHaveBeenCalledWith("renameGroup", "g");
    expect(calls).toHaveBeenCalledWith("ungroup", "g");
  });

  it("displays protection reasons and still permits unlocking and showing hidden parts", () => {
    const source = createSampleDocument();
    const document = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, locked: true, visible: false } : node) };
    const { menu, item, calls } = fixture({ document });
    expect(item("element", "edit.duplicate").command.disabledReason).toMatch(/locked/);
    expect(item("element", "edit.delete").command.disabledReason).toMatch(/locked/);
    expect(item("element", "edit.group").command.enabled).toBe(false);
    expect(item("element", "edit.rename").command.disabledReason).toMatch(/Unlock/);
    expect(menu("element").map(entry => entry.label)).toContain("Show");
    expect(menu("element").map(entry => entry.label)).toContain("Unlock");
    item("element", "edit.visibility").command.run();
    item("element", "edit.lock").command.run();
    expect(calls).toHaveBeenCalledWith("setSelectionVisibility", true);
    expect(calls).toHaveBeenCalledWith("setSelectionLocked", false);
  });

  it("handles mixed visibility/locks and preserves reasons from the source registry", () => {
    const source = createSampleDocument();
    const document = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "base" ? { ...node, visible: false, locked: true } : node) };
    const { menu, item } = fixture({
      document, selectedIds: ["body", "base"], selectedId: "base"
    });
    expect(menu("element").map(entry => entry.label)).toContain("Hide");
    expect(menu("element").map(entry => entry.label)).toContain("Lock");
    expect(item("element", "edit.group").command.disabledReason).toMatch(/Unlock and show/);
    expect(item("element", "edit.delete").command.disabledReason).toMatch(/locked/);
    expect(item("element", "edit.visibility").command.enabled).toBe(true);
    expect(item("element", "edit.lock").command.enabled).toBe(true);
  });

  it("allows rotated element context actions and frames selected geometry", () => {
    const source = createSampleDocument();
    const document = { ...source, cuboids: source.cuboids.map(node =>
      node.id === "body" ? { ...node, rotation: {
        axis: "y" as const, angle: 22.5 as const, origin: [8, 8, 8] as [number, number, number],
        rescale: false
      } } : node) };
    const { item } = fixture({ document, rotatedSelection: true });
    expect(item("element", "edit.duplicate").command.enabled).toBe(true);
    expect(item("element", "view.frame").command.enabled).toBe(true);
    expect(item("element", "edit.rename").command.enabled).toBe(true);
  });

  it("populates the empty viewport from all/select and camera commands", () => {
    const { menu, item, calls } = fixture({ selectedIds: [], selectedId: null });
    expect(menu("empty").map(entry => entry.label)).toEqual(
      ["Select all", "Frame all", "Isometric", "Front", "Right", "Top"]);
    expect(item("empty", "view.frame-all").command.enabled).toBe(true);
    item("empty", "view.frame-all").command.run();
    expect(calls).toHaveBeenCalledWith("frameAll");
    expect(item("empty", "edit.select-all").command.shortcut).toBe("Ctrl/Cmd+A");
  });

  it("shows disabled Ungroup rather than Group for a protected whole group", () => {
    const document = { ...createSampleDocument(),
      groups: [{ id: "g", name: "Assembly", memberIds: ["body", "base"] }] };
    const { menu, item } = fixture({
      document, selectedIds: ["body", "base"], selectedId: "base",
      editDisabledReason: "Read-only tab."
    });
    expect(menu("element").map(entry => entry.command.id)).toContain("edit.ungroup");
    expect(item("element", "edit.ungroup").command.disabledReason).toBe("Read-only tab.");
  });

  it("keeps disabled reasons and guards from the registry when editing is blocked", () => {
    const { menu, item, calls } = fixture({ editDisabledReason: "Resolve recovery first." });
    const disabled = item("element", "edit.visibility").command;
    expect(disabled.enabled).toBe(false);
    expect(disabled.disabledReason).toBe("Resolve recovery first.");
    disabled.run();
    expect(calls).not.toHaveBeenCalled();
    expect(menu("element").some(entry => entry.command.id === "view.frame")).toBe(true);
    expect(item("element", "view.frame").command.enabled).toBe(true);
  });

  it("guards missing and stale selections without losing viewport commands", () => {
    const { item } = fixture({ selectedIds: ["missing"], selectedId: "missing" });
    expect(item("element", "edit.visibility").command.disabledReason).toMatch(/changed/);
    expect(item("element", "edit.lock").command.disabledReason).toMatch(/changed/);
    expect(item("element", "edit.rename").command.enabled).toBe(false);
    expect(item("element", "view.frame").command.enabled).toBe(true);
  });
});

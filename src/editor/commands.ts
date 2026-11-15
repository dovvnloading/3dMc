import type { Mode, Tool, ViewKind } from "../components/EditorViewport";
import type { EditorDocument } from "./domain";
import type { SymmetryMode } from "./paintGeometry";
import { PRIMITIVE_PRESETS } from "./primitives";
import type { PrimitiveId } from "./primitives";

export type CreatorPanelName = "region" | "face" | "import" | "library" | "workspace";
export type CommandCategory = "Project" | "Edit" | "Create" | "Mode" | "Tool" | "View" | "Dialog";

export interface EditorCommand {
  id: string;
  title: string;
  category: CommandCategory;
  shortcut?: string;
  keywords?: readonly string[];
  enabled: boolean;
  disabledReason?: string;
  run: () => void;
}

export interface EditorCommandContext {
  document: EditorDocument;
  mode: Mode;
  selectedIds: readonly string[];
  sceneSearch: string;
  editDisabledReason: string | null;
  canUndo: boolean;
  canRedo: boolean;
  rotatedSelection: boolean;
  symmetry: SymmetryMode;
  rotateToolReason: string | null;
  savingProject: boolean;
  importingPack: boolean;
  importingTexture: boolean;
  selectedId: string | null;
}

export interface EditorCommandActions {
  newProject: () => void;
  openProject: () => void;
  saveProject: () => void;
  importPack: () => void;
  exportMinecraft: () => void;
  exportTexture: () => void;
  importTexture: () => void;
  saveLegacyJson: () => void;
  undo: () => void;
  redo: () => void;
  addCuboid: () => void;
  addShape: (primitive: PrimitiveId) => void;
  duplicate: () => void;
  deleteSelection: () => void;
  selectAll: () => void;
  changeMode: (mode: Mode) => void;
  switchTool: (tool: Tool) => void;
  cycleSymmetry: () => void;
  setSymmetry: (mode: SymmetryMode) => void;
  navigate: (view: ViewKind) => void;
  openPackStudio: () => void;
  openCreatorPanel: (panel: CreatorPanelName) => void;
  openRecoveryDetails: () => void;
}

/**
 * Pure registry of UI actions. The callbacks must be the editor's existing
 * handlers, not parallel implementations of history, file or selection logic.
 *
 * Disabled commands are guarded here as well as in the palette, so invoking a
 * stale command cannot accidentally run a disabled action.
 */
export function createEditorCommands(state: EditorCommandContext, actions: EditorCommandActions): EditorCommand[] {
  const commands: EditorCommand[] = [];
  const add = (id: string, title: string, category: CommandCategory, run: () => void,
    disabledReason: string | null = null, shortcut?: string, keywords?: readonly string[]) => {
    commands.push({
      id, title, category, shortcut, keywords,
      enabled: disabledReason === null,
      ...(disabledReason === null ? {} : { disabledReason }),
      run: () => { if (disabledReason === null) run(); }
    });
  };
  const editReason = state.editDisabledReason;
  const editOr = (reason: string | null) => editReason ?? reason;
  // A large multi-selection can contain every cuboid. Avoid a quadratic scan
  // of the entire scene every time the command palette/editor re-renders.
  const byId = new Map(state.document.cuboids.map(node => [node.id, node] as const));
  const selection = state.selectedIds.map(id => byId.get(id));
  const protectedNode = selection.find(node => node && (!node.visible || node.locked));
  const selectionReason = state.mode !== "model" ? "Switch to Model mode to edit the selection."
    : !selection.length ? "Select at least one element first."
    : selection.some(node => !node) ? "The selection changed. Select the elements again."
    : protectedNode ? "“" + protectedNode.name + "” is " +
      (protectedNode.locked ? "locked" : "hidden") + ". Unlock or show it first."
    : null;
  const sceneQuery = state.sceneSearch.toLowerCase();
  const matchingEditable = state.document.cuboids.filter(node => node.visible && !node.locked &&
    node.name.toLowerCase().includes(sceneQuery)).length;
  const duplicateLimitReason = state.document.cuboids.length + selection.length > 2000
    ? "Duplicating this selection exceeds the 2,000-element limit." : null;
  const selectAllReason = state.mode !== "model" ? "Switch to Model mode to select elements."
    : matchingEditable === 0 ? "No visible, unlocked elements match the scene filter." : null;
  const modelToolReason = state.mode !== "model" ? "Switch to Model mode to use this tool." : null;
  const paintToolReason = state.mode !== "paint" ? "Switch to Paint mode to use this tool." : null;
  const maxElementsReason = state.document.cuboids.length >= 2000 ? "The project has reached the 2,000-element limit." : null;

  add("project.new", "New project", "Project", actions.newProject, editReason, "Ctrl/Cmd+N", ["template", "create"]);
  add("project.open", "Open project", "Project", actions.openProject, editReason, undefined, ["import 3dmc", "load file"]);
  add("project.save", "Save project", "Project", actions.saveProject,
    state.savingProject ? "A project archive is already being prepared." : null, "Ctrl/Cmd+S", ["download backup 3dmc"]);
  add("project.import-pack", "Import Java pack", "Project", actions.importPack,
    editOr(state.importingPack ? "A pack is already being inspected." : null), undefined, ["open zip"]);
  add("project.export", "Minecraft export", "Project", actions.exportMinecraft, null, undefined, ["resource pack", "java zip"]);
  add("project.export-png", "Export texture PNG", "Project", actions.exportTexture, null, undefined, ["download image"]);
  add("project.import-png", "Import texture PNG", "Project", actions.importTexture,
    editOr(state.importingTexture ? "A texture is already being read." : null), undefined, ["replace image"]);
  add("project.legacy-json", "Download legacy JSON backup", "Project", actions.saveLegacyJson, null, undefined, ["save export"]);

  add("edit.undo", "Undo", "Edit", actions.undo,
    editOr(state.canUndo ? null : "There is nothing to undo."), "Ctrl/Cmd+Z");
  add("edit.redo", "Redo", "Edit", actions.redo,
    editOr(state.canRedo ? null : "There is nothing to redo."), "Ctrl/Cmd+Shift+Z", ["Ctrl/Cmd+Y"]);
  add("edit.select-all", "Select all editable", "Edit", actions.selectAll,
    selectAllReason, "Ctrl/Cmd+A", ["selection", "visible matches"]);
  add("edit.duplicate", "Duplicate selection", "Edit", actions.duplicate,
    editOr(selectionReason ?? duplicateLimitReason), "Ctrl/Cmd+D", ["copy elements"]);
  add("edit.delete", "Delete selection", "Edit", actions.deleteSelection,
    editOr(selectionReason), "Del / Backspace", ["remove elements"]);

  add("create.cuboid", "Add cuboid", "Create", actions.addCuboid, editOr(maxElementsReason), undefined, ["shape box"]);
  for (const primitive of PRIMITIVE_PRESETS) {
    add("create." + primitive.id, "Add shape: " + primitive.label, "Create",
      () => actions.addShape(primitive.id), editOr(maxElementsReason), undefined,
      ["primitive", "shape", primitive.description]);
  }

  for (const next of ["model", "paint", "preview"] as const) {
    add("mode." + next, "Switch to " + next.charAt(0).toUpperCase() + next.slice(1) + " mode",
      "Mode", () => actions.changeMode(next), null, undefined, ["workspace"]);
  }

  const modelTools: readonly [Tool, string, string | undefined][] = [
    ["select", "Select", "V"], ["move", "Move", "W"],
    ["resize", "Resize", "R"], ["rotate", "Rotate", "E"]
  ];
  for (const [next, title, shortcut] of modelTools) {
    const specificReason = next === "resize" && state.rotatedSelection
      ? "Resize gizmo is unavailable for rotated elements; use local Size fields."
      : next === "rotate" ? state.rotateToolReason : null;
    add("tool." + next, "Tool: " + title, "Tool", () => actions.switchTool(next),
      modelToolReason ?? specificReason, shortcut, ["transform", "model"]);
  }
  const paintTools: readonly [Tool, string, string][] = [
    ["pencil", "Pencil", "B"], ["eraser", "Eraser", "E"],
    ["fill", "Fill", "G"], ["eyedropper", "Eyedropper", "I"],
    ["line", "Line", "L"], ["rectangle", "Rectangle", "U"], ["ellipse", "Ellipse", "O"]
  ];
  for (const [next, title, shortcut] of paintTools) {
    add("tool." + next, "Tool: " + title, "Tool", () => actions.switchTool(next),
      paintToolReason, shortcut, ["paint", "brush", "texture"]);
  }
  add("paint.symmetry.cycle", "Cycle texture symmetry (" + state.symmetry.toUpperCase() + ")",
    "Tool", actions.cycleSymmetry, paintToolReason, "M", ["mirror", "axis", "texture"]);
  for (const [mode, title] of [
    ["off", "Off"], ["x", "Mirror X"], ["y", "Mirror Y"], ["both", "Both axes"]
  ] as const) {
    add("paint.symmetry." + mode, "Symmetry: " + title, "Tool",
      () => actions.setSymmetry(mode), paintToolReason, undefined,
      ["paint", "mirror", "axis", "texture"]);
  }

  for (const [kind, title] of [["iso", "Isometric"], ["front", "Front"], ["right", "Right"],
    ["top", "Top"]] as const) {
    add("view." + kind, "View: " + title, "View", () => actions.navigate(kind),
      null, kind === "iso" ? "F" : undefined, ["camera", "preset", kind]);
  }
  add("view.reset", "Reset camera", "View", () => actions.navigate("iso"), null, undefined, ["view default"]);

  add("dialog.pack-studio", "Open Pack Studio", "Dialog", actions.openPackStudio,
    editOr(state.document.target.candidateRelease !== "1.21.4" ?
      "Pack Studio requires experimental Java 1.21.4." : null), undefined, ["multi-model", "assets"]);
  add("dialog.import-model", "Import external model", "Dialog", () => actions.openCreatorPanel("import"),
    editReason, undefined, ["java block", "external"]);
  add("dialog.library", "Open project library", "Dialog", () => actions.openCreatorPanel("library"),
    null, undefined, ["snapshots", "restore"]);
  add("dialog.workspace", "Open workspace guide", "Dialog", () => actions.openCreatorPanel("workspace"),
    null, undefined, ["help", "layouts"]);
  add("dialog.region", "Open pixel region tools", "Dialog", () => actions.openCreatorPanel("region"),
    editOr(paintToolReason), undefined, ["select copy paste mirror pixels"]);
  const selected = byId.get(state.selectedId ?? "");
  add("dialog.face", "Open face tools", "Dialog", () => actions.openCreatorPanel("face"),
    editOr(paintToolReason ?? (!selected || selected.material !== "texture" ?
      "Select a textured element to edit its faces." : null)), undefined, ["uv", "texture"]);
  add("dialog.recovery", "Open recovery details", "Dialog", actions.openRecoveryDetails,
    null, undefined, ["save status", "local"]);
  return commands;
}

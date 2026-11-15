import { describe, expect, it } from "vitest";
import { filterEditorCommands } from "./commandSearch";
import type { EditorCommand } from "./commands";

const command = (id: string, title: string, options: Partial<EditorCommand> = {}): EditorCommand => ({
  id, title, category: "Project", enabled: true, run: () => undefined, ...options
});
const entries = [
  command("project.backup", "Download legacy JSON backup", { keywords: ["save project"] }),
  command("project.save", "Save project", { shortcut: "Ctrl/Cmd+S" }),
  command("view.front", "View: Front", { category: "View", keywords: ["camera preset"] }),
  command("tool.fill", "Tool: Fill", { category: "Tool", enabled: false,
    disabledReason: "Switch to Paint mode.", keywords: ["paint brush"] }),
  command("tool.eyedropper", "Tool: Eyedropper", { category: "Tool", keywords: ["paint sample color"] })
];

describe("command palette search", () => {
  it("preserves registry order for an empty or whitespace query", () => {
    expect(filterEditorCommands(entries, "")).toEqual(entries);
    expect(filterEditorCommands(entries, " \t ")).toEqual(entries);
  });

  it("ranks exact title above prefix, word prefix and keyword matches", () => {
    expect(filterEditorCommands(entries, "SAVE PROJECT")[0]?.id).toBe("project.save");
    expect(filterEditorCommands(entries, "save")[0]?.id).toBe("project.save");
    expect(filterEditorCommands(entries, "view front")[0]?.id).toBe("view.front");
  });

  it("matches terms without regard to case, whitespace or order", () => {
    expect(filterEditorCommands(entries, "  CAMERA   FRONT ").map(item => item.id)).toEqual(["view.front"]);
    expect(filterEditorCommands(entries, "sample paint").map(item => item.id)).toEqual(["tool.eyedropper"]);
  });

  it("keeps disabled commands searchable with the same reason", () => {
    const [match] = filterEditorCommands(entries, "Fill");
    expect(match?.id).toBe("tool.fill");
    expect(match?.enabled).toBe(false);
    expect(match?.disabledReason).toBe("Switch to Paint mode.");
  });

  it("does not include entries missing any search word", () => {
    expect(filterEditorCommands(entries, "save rotate")).toHaveLength(0);
    expect(filterEditorCommands(entries, "unfindable")).toHaveLength(0);
  });

  it("uses registry order to break equal relevance ties", () => {
    const same = [
      command("one", "Reset camera"),
      command("two", "Reset camera"),
      command("three", "Reset camera")
    ];
    expect(filterEditorCommands(same, "reset").map(item => item.id)).toEqual(["one", "two", "three"]);
  });
});

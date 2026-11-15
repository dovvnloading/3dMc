import { useEffect } from "react";
import type { EditorCommand } from "./commands";

/** The spelling used by the command registry, across Windows and macOS. */
export function keyToShortcut(event: Pick<KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing">): string | null {
  if (event.isComposing || event.altKey) return null;
  if (event.ctrlKey || event.metaKey) {
    if (event.ctrlKey && event.metaKey || !/^[a-z]$/i.test(event.key)) return null;
    return "Ctrl/Cmd+" + (event.shiftKey ? "Shift+" : "") + event.key.toUpperCase();
  }
  if (event.key === "?" || (event.shiftKey && event.key === "/")) return "?";
  if (event.key === "Escape") return "Esc";
  if (event.key === "Delete" || event.key === "Backspace" ||
      event.key === "[" || event.key === "]") return event.key;
  // Existing unmodified letter and deletion shortcuts also worked with Shift.
  return /^[a-z]$/i.test(event.key) ? event.key.toUpperCase() : null;
}

/** Never hijack editing fields, IME composition or an already open native modal. */
export function useEditorKeyboardShortcuts(commands: readonly EditorCommand[],
  beforeEscape: () => boolean): void {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]') ||
          document.querySelector('[role="dialog"]')) return;
      const shortcut = keyToShortcut(event);
      if (!shortcut) return;
      if (shortcut === "Esc" && beforeEscape()) { event.preventDefault(); return; }
      const command = commands.find(command =>
        command.shortcut === shortcut || command.alternateShortcuts?.includes(shortcut));
      if (!command) return;
      // Disabled editor commands must not fall through to a browser shortcut
      // (e.g. Ctrl+N opening another tab while project editing is blocked).
      event.preventDefault();
      if (!command.enabled || (event.repeat && ["M", "F", "?", "Ctrl/Cmd+K"].includes(shortcut))) return;
      command.run();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [commands, beforeEscape]);
}

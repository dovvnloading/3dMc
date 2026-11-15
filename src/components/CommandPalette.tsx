import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import type { EditorCommand } from "../editor/commands";
import { filterEditorCommands } from "../editor/commandSearch";
import { ModalDialog } from "./ModalDialog";
import "./command-palette.css";

export function CommandPalette({ open, onClose, commands }: {
  open: boolean;
  onClose: () => void;
  commands: readonly EditorCommand[];
}) {
  // Remounting the dialog resets its search and selection on every invocation.
  return open ? <CommandPaletteDialog commands={commands} onClose={onClose}/> : null;
}

function CommandPaletteDialog({ commands, onClose }: {
  commands: readonly EditorCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const results = useMemo(() => filterEditorCommands(commands, query), [commands, query]);
  const enabledResults = results.filter(command => command.enabled);
  const active = enabledResults.find(command => command.id === activeId) ?? enabledResults[0];

  useEffect(() => {
    if (active) document.getElementById("command-palette-" + active.id)?.scrollIntoView({ block: "nearest" });
  }, [active?.id]);

  const run = (command: EditorCommand) => {
    if (!command.enabled) return;
    onClose();
    command.run();
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); onClose(); return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!enabledResults.length) return;
      const current = active ? enabledResults.indexOf(active) : -1;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = (current + delta + enabledResults.length) % enabledResults.length;
      setActiveId(enabledResults[next]!.id);
    } else if (event.key === "Enter" && !(event.metaKey || event.ctrlKey || event.altKey)) {
      event.preventDefault();
      if (active) run(active);
    }
  };

  return <ModalDialog className="modal command-palette-modal" labelledBy="command-palette-title" onCancel={onClose}>
    <div className="command-palette-heading">
      <div><span className="command-palette-kicker">3dMc STUDIO</span><h2 id="command-palette-title">Command palette</h2></div>
      <button type="button" className="command-palette-close" aria-label="Close command palette" onClick={onClose}><X size={18}/></button>
    </div>
    <label htmlFor="command-palette-search" className="command-palette-label">Search commands</label>
    <div className="command-palette-search"><Search size={19}/>
      <input id="command-palette-search" role="combobox" aria-autocomplete="list" aria-expanded="true"
        aria-controls="command-palette-results"
        aria-activedescendant={active ? "command-palette-" + active.id : undefined}
        type="search" data-dialog-initial-focus autoComplete="off" spellCheck={false}
        value={query} placeholder="Type a command or action…" onChange={event => { setQuery(event.target.value); setActiveId(null); }}
        onKeyDown={onSearchKeyDown}/>
      <kbd>Esc</kbd>
    </div>
    <div id="command-palette-results" className="command-palette-results" role="listbox" aria-label="Commands">
      {results.length ? results.map(command => <button type="button" role="option"
        id={"command-palette-" + command.id} key={command.id}
        className={"command-palette-option" + (active?.id === command.id ? " selected" : "")}
        aria-selected={active?.id === command.id} aria-disabled={!command.enabled}
        disabled={!command.enabled} tabIndex={-1} title={command.disabledReason}
        onMouseEnter={() => { if (command.enabled) setActiveId(command.id); }}
        onClick={() => run(command)}>
        <span className="command-palette-option-text"><strong>{command.title}</strong>
          <small>{command.category}{command.disabledReason ? " · " + command.disabledReason : ""}</small></span>
        {command.shortcut && <kbd>{[command.shortcut, ...(command.alternateShortcuts ?? [])].join(" / ")}</kbd>}
      </button>) : <p className="command-palette-empty">No matching commands. Try a tool, view, or file action.</p>}
    </div>
    <div className="command-palette-footer">
      <span role="status" aria-live="polite">{results.length} {results.length === 1 ? "command" : "commands"}</span>
      <span>↑ ↓ Navigate <span aria-hidden="true">·</span> Enter Run <span aria-hidden="true">·</span> Esc Close</span>
    </div>
  </ModalDialog>;
}

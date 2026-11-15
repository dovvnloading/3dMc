import { X } from "lucide-react";
import type { EditorCommand } from "../editor/commands";
import { groupEditorShortcuts } from "../editor/shortcuts";
import { ModalDialog } from "./ModalDialog";
import "./shortcut-reference.css";

/** One source of truth: group every shortcut directly from live palette commands. */
export function ShortcutReferenceDialog({ commands, onClose }: {
  commands: readonly EditorCommand[];
  onClose: () => void;
}) {
  const groups = groupEditorShortcuts(commands);
  return <ModalDialog className="modal shortcut-reference-modal"
    labelledBy="shortcut-reference-title" onCancel={onClose}>
    <div className="shortcut-reference-heading">
      <div><span className="shortcut-reference-kicker">3dMc STUDIO</span>
        <h2 id="shortcut-reference-title">Keyboard shortcuts</h2></div>
      <button type="button" data-dialog-initial-focus className="shortcut-reference-close"
        aria-label="Close keyboard shortcuts" onClick={onClose}><X size={18}/></button>
    </div>
    <p className="shortcut-reference-description">Shortcuts for the current workspace. Tool keys apply in their respective modes.</p>
    <div className="shortcut-reference-groups" aria-label="Shortcuts by area">
      {groups.map((group, index) => <section key={group.area}
        aria-labelledby={"shortcut-reference-area-" + index}>
        <h3 id={"shortcut-reference-area-" + index}>{group.area}</h3>
        <dl>{group.entries.map(entry => <div className="shortcut-reference-entry" key={entry.id}>
          <dt>{entry.title}</dt>
          <dd>{entry.shortcuts.map(key => <kbd key={key}>{key}</kbd>)}</dd>
        </div>)}</dl>
      </section>)}
    </div>
    <div className="shortcut-reference-footer">Esc closes this dialog</div>
  </ModalDialog>;
}

import { useState } from "react";
import type { FormEvent } from "react";
import { ModalDialog } from "./ModalDialog";

export function RenameElementDialog({ name, kind, onRename, onClose }: {
  name: string;
  kind: "element" | "group";
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(name);
  const clean = draft.trim();
  const valid = clean.length > 0 && clean.length <= 100;
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    if (clean !== name) onRename(clean);
    onClose();
  };
  return <ModalDialog className="modal rename-context-dialog" labelledBy="rename-context-title" onCancel={onClose}>
    <h2 id="rename-context-title">Rename {kind}</h2>
    <form onSubmit={save}>
      <label htmlFor="rename-context-input">Name</label>
      <input id="rename-context-input" data-dialog-initial-focus autoComplete="off"
        className="text-control" value={draft} maxLength={101}
        onChange={event => setDraft(event.target.value)}/>
      {!valid && <p role="alert">Enter a name of 1–100 characters.</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={!valid}>Rename</button>
      </div>
    </form>
  </ModalDialog>;
}

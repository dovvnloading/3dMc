import { useId } from "react";
import type { ReactNode } from "react";
import { ModalDialog } from "./ModalDialog";

/** Native top-layer modal: focus containment, inert background and explicit restoration. */
export function CreatorDialog({ title, kicker, onClose, busy = false, children, wide = false }: {
  title: string; kicker?: string; onClose: () => void; busy?: boolean; children: ReactNode; wide?: boolean;
}) {
  const titleId = useId();
  return <ModalDialog labelledBy={titleId} className={"creator-dialog" + (wide ? " creator-dialog-wide" : "")}
    onCancel={() => { if (!busy) onClose(); }}>
    <div className="creator-dialog-heading"><div>{kicker && <span>{kicker}</span>}<h2 id={titleId}>{title}</h2></div>
      <button type="button" data-dialog-initial-focus disabled={busy} className="creator-close" aria-label={"Close " + title} onClick={onClose}>×</button></div>
    {children}
  </ModalDialog>;
}

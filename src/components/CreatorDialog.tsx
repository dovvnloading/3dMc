import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

/** Native top-layer modal: focus containment, inert background and explicit restoration. */
export function CreatorDialog({ title, kicker, onClose, busy = false, children, wide = false }: {
  title: string; kicker?: string; onClose: () => void; busy?: boolean; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current; dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
    className={"creator-dialog" + (wide ? " creator-dialog-wide" : "")}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="creator-dialog-heading"><div>{kicker && <span>{kicker}</span>}<h2 id={titleId}>{title}</h2></div>
      <button type="button" autoFocus disabled={busy} className="creator-close" aria-label={"Close " + title} onClick={onClose}>×</button></div>
    {children}
  </dialog>;
}

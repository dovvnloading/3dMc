import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

/** Native modal with predictable keyboard wrapping and focus restoration. */
export function ModalDialog({ className, labelledBy, onCancel, children }: {
  className: string; labelledBy: string; onCancel?: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const wrapFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(control => control.tabIndex >= 0 && control.getClientRects().length > 0);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0]!, last = controls[controls.length - 1]!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return <dialog ref={ref} role="dialog" className={"app-dialog " + className} aria-modal="true" aria-labelledby={labelledBy}
    onKeyDown={wrapFocus} onCancel={event => { event.preventDefault(); onCancel?.(); }}>
    {children}
  </dialog>;
}

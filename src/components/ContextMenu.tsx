import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ContextMenuItem } from "../editor/contextMenuItems";
import { nextMenuIndex } from "../editor/contextMenuKeyboard";
import type { MenuNavigationKey } from "../editor/contextMenuKeyboard";
import "./context-menu.css";

interface Props {
  x: number;
  y: number;
  label: string;
  items: readonly ContextMenuItem[];
  onClose: (restoreFocus: boolean) => void;
}

/** Accessible, viewport-clamped menu shared by the scene tree and 3D canvas. */
export function ContextMenu({ x, y, label, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(() =>
    nextMenuIndex(items.map(item => item.command), -1, "Home"));

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const padding = 8;
    setPosition({
      left: Math.max(padding, Math.min(x, window.innerWidth - menu.offsetWidth - padding)),
      top: Math.max(padding, Math.min(y, window.innerHeight - menu.offsetHeight - padding))
    });
  }, [x, y, items.length]);

  useLayoutEffect(() => {
    if (!position) return;
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (active < 0) menuRef.current?.focus();
    else {
      buttons?.[active]?.focus();
      buttons?.[active]?.scrollIntoView({ block: "nearest" });
    }
  }, [active, position]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose(false);
    };
    const scrolling = (event: Event) => {
      // Scrolling a tall menu is allowed; scrolling the page/scene closes it.
      if (!menuRef.current?.contains(event.target as Node)) onClose(false);
    };
    const resize = () => onClose(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolling, true);
    // Canvas zoom/orbit consumes wheel input without scrolling the document.
    window.addEventListener("wheel", scrolling, { capture: true, passive: true });
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolling, true);
      window.removeEventListener("wheel", scrolling, true);
      window.removeEventListener("resize", resize);
    };
  }, [onClose]);

  const run = (index: number) => {
    const command = items[index]?.command;
    if (!command?.enabled) return;
    onClose(true);
    command.run();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The global editor shortcuts must never execute behind an open menu.
    event.stopPropagation();
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); onClose(true); return;
    }
    if (event.key === "Tab") { onClose(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" ||
        event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(current => nextMenuIndex(items.map(item => item.command),
        current, event.key as MenuNavigationKey));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      run(active);
    }
  };

  return createPortal(
    <div ref={menuRef} className="editor-context-menu" role="menu" tabIndex={-1}
      aria-label={label} onKeyDown={onKeyDown} onContextMenu={event => event.preventDefault()}
      style={{
        left: position?.left ?? x, top: position?.top ?? y,
        visibility: position ? "visible" : "hidden"
      }}>
      {items.map(({ command, label: itemLabel }, index) =>
        <button type="button" key={command.id} role="menuitem" tabIndex={index === active ? 0 : -1}
          aria-label={itemLabel} aria-disabled={!command.enabled}
          aria-describedby={command.disabledReason ? "context-reason-" + index : undefined}
          disabled={!command.enabled} title={command.disabledReason}
          className={index === active ? "context-item active" : "context-item"}
          onMouseEnter={() => { if (command.enabled) setActive(index); }}
          onClick={() => run(index)}>
          <span className="context-item-copy"><span>{itemLabel}</span>
            {command.disabledReason && <small id={"context-reason-" + index}>{command.disabledReason}</small>}
          </span>
          {command.shortcut && <kbd>{[command.shortcut, ...(command.alternateShortcuts ?? [])].join(" / ")}</kbd>}
        </button>)}
    </div>, document.body
  );
}

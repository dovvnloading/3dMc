import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from "./brush";

/** Paint-only brush shortcuts live outside the shared Model-mode key handler. */
export function usePaintBrushShortcuts(active: boolean,
  setSize: Dispatch<SetStateAction<number>>, cancelStroke: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
          (event.key !== "[" && event.key !== "]")) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, button, [contenteditable], [role=dialog]") ||
          document.querySelector("[role=dialog]")) return;
      event.preventDefault();
      cancelStroke();
      setSize(size => Math.max(MIN_BRUSH_SIZE, Math.min(MAX_BRUSH_SIZE,
        size + (event.key === "]" ? 1 : -1))));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, setSize, cancelStroke]);
}

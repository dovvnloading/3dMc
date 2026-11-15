import { useEffect, useState } from "react";
import { DEFAULT_VIEWPORT_DISPLAY } from "./viewportProjection";
import type { ViewportDisplay } from "./viewportProjection";

const KEY = "3dmc.viewport-display";

/** Viewport preferences are UI session state, never project/source metadata. */
export function parseViewportDisplay(value: unknown): ViewportDisplay {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return DEFAULT_VIEWPORT_DISPLAY;
  const record = value as Record<string, unknown>;
  return {
    projection: record.projection === "orthographic" ? "orthographic" : "perspective",
    grid: typeof record.grid === "boolean" ? record.grid : DEFAULT_VIEWPORT_DISPLAY.grid,
    axes: typeof record.axes === "boolean" ? record.axes : DEFAULT_VIEWPORT_DISPLAY.axes,
    outline: typeof record.outline === "boolean" ? record.outline : DEFAULT_VIEWPORT_DISPLAY.outline
  };
}

function readSession(): ViewportDisplay {
  if (typeof window === "undefined") return DEFAULT_VIEWPORT_DISPLAY;
  try {
    const stored = window.sessionStorage.getItem(KEY);
    return stored ? parseViewportDisplay(JSON.parse(stored) as unknown) : DEFAULT_VIEWPORT_DISPLAY;
  } catch {
    // Privacy modes can deny storage. Session settings still work in memory.
    return DEFAULT_VIEWPORT_DISPLAY;
  }
}

export function useViewportDisplay() {
  const [display, setDisplay] = useState<ViewportDisplay>(readSession);
  useEffect(() => {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(display)); }
    catch { /* Storage permission is optional for UI preferences. */ }
  }, [display]);
  return [display, setDisplay] as const;
}

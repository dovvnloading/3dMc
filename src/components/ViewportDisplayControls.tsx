import type { ViewportDisplay, ViewportDisplayKey } from "../editor/viewportProjection";
import "./viewport-display.css";

/** Camera/display controls use the same session state as the command palette. */
export function ViewportDisplayControls({ display, onToggleProjection, onToggleDisplay }: {
  display: ViewportDisplay;
  onToggleProjection: () => void;
  onToggleDisplay: (key: ViewportDisplayKey) => void;
}) {
  return <div className="viewport-display" role="group" aria-label="Viewport projection and display">
    <button type="button" className={display.projection === "orthographic" ? "current" : ""}
      aria-label="Toggle orthographic projection (Numpad 5)"
      title={"Switch to " + (display.projection === "perspective" ? "orthographic" : "perspective") + " (Numpad 5)"}
      aria-pressed={display.projection === "orthographic"}
      onClick={onToggleProjection}>{display.projection === "perspective" ? "PERSP" : "ORTHO"}</button>
    {([
      ["grid", "GRID", "Shift+1"],
      ["axes", "XYZ", "Shift+2"],
      ["outline", "EDGE", "Shift+3"]
    ] as const).map(([key, text, shortcut]) =>
      <button type="button" key={key} className={display[key] ? "current" : ""}
        aria-label={"Toggle " + (key === "outline" ? "selection outlines" : key) + " (" + shortcut + ")"}
        title={(display[key] ? "Hide " : "Show ") + key + " (" + shortcut + ")"}
        aria-pressed={display[key]} onClick={() => onToggleDisplay(key)}>{text}</button>)}
  </div>;
}

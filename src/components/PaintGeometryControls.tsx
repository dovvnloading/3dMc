import type { SymmetryMode } from "../editor/paintGeometry";
import type { Tool } from "./EditorViewport";
import "./paint-geometry-controls.css";

const options: readonly { mode: SymmetryMode; label: string }[] = [
  { mode: "off", label: "Off" }, { mode: "x", label: "Mirror X" },
  { mode: "y", label: "Mirror Y" }, { mode: "both", label: "Both axes" }
];

export function PaintGeometryControls({ symmetry, onSymmetry, filled, onFilled, onCancel, tool }: {
  symmetry: SymmetryMode;
  onSymmetry: (mode: SymmetryMode) => void;
  filled: boolean;
  onFilled: (filled: boolean) => void;
  onCancel: () => void;
  tool: Tool;
}) {
  return <section className="paint-geometry-controls" aria-label="Symmetry and shape settings">
    <div className="paint-symmetry-heading">
      <strong>Texture symmetry</strong>
      <span role="status" className={symmetry === "off" ? "symmetry-off" : "symmetry-on"}>
        {symmetry === "off" ? "OFF" : "ON · " + (symmetry === "both" ? "X + Y" : symmetry.toUpperCase())}
      </span>
    </div>
    <div className="paint-symmetry-modes" role="group" aria-label="Paint symmetry">
      {options.map(option => <button type="button" key={option.mode}
        title={option.label + " symmetry (M cycles modes)"}
        aria-label={option.label + " symmetry"}
        aria-pressed={symmetry === option.mode}
        onClick={() => { onCancel(); onSymmetry(option.mode); }}>
        {option.label}
      </button>)}
    </div>
    <p>Mirror marks around this sheet’s X/Y center lines. M cycles Off → X → Y → Both. Guides show enabled axes.</p>
    <label className="paint-shape-fill">
      <input type="checkbox" aria-label="Fill rectangle and ellipse"
        checked={filled} onChange={event => { onCancel(); onFilled(event.currentTarget.checked); }}/>
      Fill rectangle and ellipse
    </label>
    <p>{tool === "rectangle" || tool === "ellipse"
      ? "Drag for a live preview. Shift constrains to a square/circle; Alt draws from the centre. Escape cancels."
      : "Choose Rectangle (U) or Ellipse (O); Shift and Alt adjust the shape while dragging."}</p>
  </section>;
}

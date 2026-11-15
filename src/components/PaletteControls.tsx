import { Check } from "lucide-react";
import type { EditorDocument } from "../editor/domain";
import { addPaletteColor, MAX_PALETTE_COLORS, movePaletteColor,
  paletteColors, removePaletteColor } from "../editor/palette";
import "./palette-controls.css";

interface Props {
  document: EditorDocument;
  color: string;
  recentColors: readonly string[];
  onChoose: (color: string) => void;
  onEdit: (change: (document: EditorDocument) => EditorDocument) => void;
}

/** Project swatches are source assets; recent paint choices only live in this app session. */
export function PaletteControls({ document, color, recentColors, onChoose, onEdit }: Props) {
  const colors = paletteColors(document);
  const index = colors.findIndex(value => value.toLowerCase() === color.toLowerCase());
  return <div className="palette-workspace" aria-label="Project color palette">
    <div className="palette-swatch-groups">
      <div className="palette-swatch-group">
        <span className="palette-group-title">Project</span>
        <div className="palette" role="group" aria-label="Color swatches">
          {colors.map(swatch => {
            const chosen = swatch.toLowerCase() === color.toLowerCase();
            return <button type="button" key={swatch}
              style={{ background: swatch }} className={chosen ? "chosen" : ""}
              aria-label={"Choose color " + swatch} title={swatch}
              aria-pressed={chosen} onClick={() => onChoose(swatch)}>
              {chosen && <Check size={14}/>}
            </button>;
          })}
        </div>
      </div>
      <div className="palette-swatch-group">
        <span className="palette-group-title">Recent</span>
        <div className="palette recent-palette" role="group" aria-label="Recent painted colors">
          {recentColors.map(swatch => {
            const chosen = swatch.toLowerCase() === color.toLowerCase();
            return <button type="button" key={swatch}
              style={{ background: swatch }} className={chosen ? "chosen" : ""}
              aria-label={"Choose recent color " + swatch} title={swatch}
              aria-pressed={chosen} onClick={() => onChoose(swatch)}>
              {chosen && <Check size={14}/>}
            </button>;
          })}
          {!recentColors.length && <span className="palette-empty">Paint to add colours</span>}
        </div>
      </div>
    </div>
    <div className="palette-actions">
      <span>{colors.length}/{MAX_PALETTE_COLORS} swatches</span>
      <button type="button" aria-label="Add selected color to palette"
        disabled={index >= 0 || colors.length >= MAX_PALETTE_COLORS}
        onClick={() => onEdit(current => addPaletteColor(current, color))}>Add color</button>
      <button type="button" aria-label="Remove selected palette swatch"
        disabled={index < 0 || colors.length <= 1}
        onClick={() => onEdit(current => removePaletteColor(current, color))}>Remove</button>
      <button type="button" aria-label="Move selected swatch left"
        disabled={index <= 0}
        onClick={() => onEdit(current => movePaletteColor(current, color, "left"))}>←</button>
      <button type="button" aria-label="Move selected swatch right"
        disabled={index < 0 || index >= colors.length - 1}
        onClick={() => onEdit(current => movePaletteColor(current, color, "right"))}>→</button>
    </div>
  </div>;
}

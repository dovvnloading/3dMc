import type { BrushShape } from "../editor/brush";
import { MAX_BRUSH_SIZE, MIN_BRUSH_SIZE } from "../editor/brush";
import "./paint-brush-controls.css";

export function PaintBrushControls({ size, shape, disabled, onSize, onShape }: {
  size: number;
  shape: BrushShape;
  disabled: boolean;
  onSize: (size: number) => void;
  onShape: (shape: BrushShape) => void;
}) {
  return <section className="paint-brush-controls" aria-label="Brush settings">
    <label htmlFor="brush-size-range">Brush size · {size} px <small>[ / ]</small></label>
    <input id="brush-size-range" type="range" min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE}
      step={1} value={size} disabled={disabled} aria-label="Brush size"
      onChange={event => onSize(Number(event.currentTarget.value))}/>
    <div role="group" aria-label="Brush footprint" className="paint-brush-shapes">
      <button type="button" aria-pressed={shape === "square"} disabled={disabled}
        onClick={() => onShape("square")}>Square</button>
      <button type="button" aria-pressed={shape === "round"} disabled={disabled}
        onClick={() => onShape("round")}>Round</button>
    </div>
    <p>Odd sizes center on the texel. Even sizes extend right and down.</p>
  </section>;
}

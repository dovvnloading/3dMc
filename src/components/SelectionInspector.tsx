import { useEffect, useState } from "react";
import type { Axis, EditorDocument } from "../editor/domain";
import { alignSelection, distributeSelection, selectionBounds, setEachSize, setSelectionBounds, transformSelection } from "../editor/selection";

interface Props {
  document: EditorDocument;
  ids: readonly string[];
  snap: number;
  setSnap: (value: number) => void;
  apply: (operation: (document: EditorDocument) => EditorDocument) => boolean;
  duplicate: () => void;
  remove: () => void;
  clear: () => void;
}
function BatchNumber({ label, value, disabled, onCommit }: {
  label: string; value: number | null; disabled: boolean; onCommit: (value: number) => boolean;
}) {
  const display = value === null ? "" : String(Number(value.toFixed(4)));
  const [draft, setDraft] = useState(display);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(display); setInvalid(false); }, [display]);
  return <label className="batch-number"><span>{label}</span>
    <input aria-label={label} inputMode="decimal" value={draft} placeholder={value === null ? "Mixed" : undefined}
      disabled={disabled} aria-invalid={invalid} title={value === null ? "Selected parts have different values" : label}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation();
          event.currentTarget.value = display; setDraft(display); setInvalid(false);
          event.currentTarget.blur();
        }
      }}
      onBlur={event => {
        const input = event.currentTarget.value.trim();
        if (input === display) return;
        if (!input || !Number.isFinite(Number(input)) || !onCommit(Number(input))) {
          setDraft(display); setInvalid(true); return;
        }
        setInvalid(false);
      }}/>
    {invalid && <small role="status">Edit rejected; last valid value retained.</small>}
  </label>;
}

/** Numeric controls are an equivalent, keyboard-operable route to the shared gizmo. */
export function SelectionInspector(props: Props) {
  const wanted = new Set(props.ids);
  const nodes = props.document.cuboids.filter(node => wanted.has(node.id));
  const bounds = selectionBounds(nodes);
  if (!bounds) return null;
  const disabled = nodes.some(node => node.locked || !node.visible);
  const axes = [0, 1, 2] as const;
  const label = (axis: Axis) => ["X", "Y", "Z"][axis];
  return <div className="batch-inspector" aria-label="Multiple element properties">
    <div className="selection-heading"><div>
      <span>SELECTED ELEMENTS</span><h2>{nodes.length} parts selected</h2>
      <p>One edit. One undo step.</p>
    </div></div>
    <div className="inspector-scroll">
      <div className="inspector-group">
        <h3>Selection bounds</h3>
        <p className="batch-help">Moving the corner preserves spacing. Resizing scales every selected part around the minimum corner.</p>
        {disabled && <p className="batch-warning" role="status">The selection contains locked or hidden parts. Unlock/show them or deselect them. No partial edits are applied.</p>}
        {(["position", "size"] as const).map(property => <div key={property} className="batch-field-row">
          <h4>{property === "position" ? "Corner position" : "Overall size"}</h4>
          <div className="batch-fields">{axes.map(axis => <BatchNumber key={property + axis}
            label={`Selection ${label(axis)} ${property}`} disabled={disabled}
            value={property === "position" ? bounds.from[axis] : bounds.size[axis]}
            onCommit={value => props.apply(doc => setSelectionBounds(doc, props.ids, property, axis, value))}/>)}</div>
        </div>)}
        <label className="form-caption" htmlFor="batch-snap">Move snap</label>
        <select id="batch-snap" className="select-control" aria-label="Move snap increment" value={props.snap}
          onChange={event => props.setSnap(Number(event.target.value))}>
          {[0.25, 0.5, 1, 2].map(n => <option key={n} value={n}>{n} unit{n > 1 ? "s" : ""}</option>)}
        </select>
        <div className="batch-nudges" role="group" aria-label="Move selection by snap increment">
          {axes.flatMap(axis => ([-1, 1] as const).map(sign => <button type="button" key={axis + ":" + sign}
            disabled={disabled} aria-label={`Move selection ${sign > 0 ? "+" : "−"}${label(axis)}`}
            onClick={() => {
              const delta: [number, number, number] = [0, 0, 0]; delta[axis] = sign * props.snap;
              props.apply(doc => transformSelection(doc, props.ids, delta));
            }}>{sign > 0 ? "+" : "−"}{label(axis)}</button>))}
        </div>
      </div>
      <div className="inspector-group">
        <h3>Each part size</h3>
        <p className="batch-help">Mixed means the dimensions differ. Enter a value to size every part equally while keeping its own minimum corner.</p>
        <div className="batch-fields">{axes.map(axis => {
          const values = nodes.map(node => node.to[axis] - node.from[axis]);
          const same = values.every(n => Math.abs(n - values[0]!) < 0.000001);
          return <BatchNumber key={axis} label={`Each part ${label(axis)} size`} disabled={disabled}
            value={same ? values[0]! : null}
            onCommit={value => props.apply(doc => setEachSize(doc, props.ids, axis, value))}/>;
        })}</div>
      </div>
      <div className="inspector-group">
        <h3>Align and distribute</h3>
        <p className="batch-help">Align minimum edges, centers, or maximum edges without resizing. Distribution keeps the outer centers fixed and spaces the other centers evenly; parts may overlap.</p>
        <div className="batch-align-grid" role="group" aria-label="Align selected parts">
          {axes.map(axis => <div key={axis} className="batch-align-axis">
            <span>{label(axis)} axis</span>
            {(["minimum", "center", "maximum"] as const).map(edge =>
              <button type="button" key={edge} disabled={disabled}
                aria-label={"Align " + label(axis) + " " + edge}
                onClick={() => props.apply(doc => alignSelection(doc, props.ids, axis, edge))}>
                {edge === "minimum" ? "Min" : edge === "maximum" ? "Max" : "Center"}
              </button>)}
          </div>)}
        </div>
        <div className="batch-distribute" role="group" aria-label="Distribute selected parts">
          {axes.map(axis => <button type="button" key={axis} disabled={disabled || nodes.length < 3}
            aria-label={"Distribute " + label(axis) + " centers"}
            onClick={() => props.apply(doc => distributeSelection(doc, props.ids, axis))}>
            Spread {label(axis)}
          </button>)}
        </div>
        {nodes.length < 3 && <p className="batch-help">Select three or more editable parts to distribute centers.</p>}
      </div>
      <div className="inspector-group">
        <h3>Selection actions</h3>
        <div className="element-actions">
          <button type="button" disabled={disabled} onClick={props.duplicate}>Duplicate selection</button>
          <button type="button" disabled={disabled} onClick={props.remove}>Delete selection</button>
        </div>
        <button type="button" className="inline-action" onClick={props.clear}>Clear selection</button>
        <p className="batch-help">Shift selects a range in the scene. Ctrl/Cmd toggles a part. Shift-click toggles parts in the viewport. Paint mode edits the active face only.</p>
      </div>
    </div>
  </div>;
}

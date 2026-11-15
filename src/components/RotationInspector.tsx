import { useEffect, useId, useRef, useState } from "react";
import type { EditorDocument } from "../editor/domain";
import { defaultElementRotation } from "../editor/elementRotation";
import { JAVA_ELEMENT_ANGLES } from "../editor/elementRotation";
import type { ElementAngle, ElementAxis } from "../editor/elementRotation";
import {
  centerElementPivots, resetElementRotations, setElementAngle,
  setElementAxis, setElementPivot, setElementRescale
} from "../editor/rotationCommands";
import "./rotation.css";

interface Props {
  document: EditorDocument;
  ids: readonly string[];
  apply: (operation: (document: EditorDocument) => EditorDocument) => unknown;
}

const equal = <T,>(values: readonly T[]): T | null =>
  values.length && values.every(value => Object.is(value, values[0])) ? values[0]! : null;

function PivotField({ axis, value, disabled, onCommit }: {
  axis: 0 | 1 | 2;
  value: number | null;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const label = (["X", "Y", "Z"] as const)[axis];
  const display = value === null ? "" : String(value);
  const [draft, setDraft] = useState(display);
  const [invalid, setInvalid] = useState(false);
  const escape = useRef(false);
  useEffect(() => { setDraft(display); setInvalid(false); }, [display]);
  return <label className="rotation-pivot-field">
    <span className={"axis-letter axis-" + label.toLowerCase()}>{label}</span>
    <input aria-label={"Pivot " + label} inputMode="decimal" type="text" spellCheck={false}
      placeholder={value === null ? "Mixed" : undefined} value={draft} disabled={disabled}
      aria-invalid={invalid} title={"Pivot " + label + " (model units; −256…256)"}
      onChange={event => { setDraft(event.target.value); setInvalid(false); escape.current = false; }}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation();
          escape.current = true; setDraft(display); setInvalid(false); event.currentTarget.blur();
        }
      }}
      onBlur={event => {
        if (escape.current) { escape.current = false; return; }
        const valueText = event.currentTarget.value.trim();
        if (valueText === display) return;
        const next = Number(valueText);
        if (!valueText || !Number.isFinite(next) || next < -256 || next > 256) {
          setDraft(display); setInvalid(true); return;
        }
        setInvalid(false); onCommit(next);
      }}/>
    {invalid && <small role="status">Invalid pivot; previous value retained.</small>}
  </label>;
}

/** Shared controls operate on a complete selection as ONE immutable history commit. */
export function RotationInspector({ document, ids, apply }: Props) {
  const nodes = document.cuboids.filter(node => ids.includes(node.id));
  const rescaleId = useId(), hintId = useId();
  const toggle = useRef<HTMLInputElement>(null);
  const values = nodes.map(node => node.rotation ?? defaultElementRotation(node));
  const axis = equal(values.map(value => value.axis));
  const angle = equal(values.map(value => value.angle));
  const rescale = equal(values.map(value => value.rescale));
  const pivot = ([0, 1, 2] as const).map(component =>
    equal(values.map(value => value.origin[component])));
  const disabledReason = document.target.candidateRelease !== "1.21.4" ?
    "Element rotation is only available for experimental Java 1.21.4, not this target." :
    nodes.find(node => node.locked || !node.visible) ?
      "Unlock and show every selected element before rotating; no partial changes are made." : null;
  const disabled = disabledReason !== null;
  const hasRotation = nodes.some(node => node.rotation !== undefined);
  useEffect(() => { if (toggle.current) toggle.current.indeterminate = rescale === null; }, [rescale]);
  if (!nodes.length) return null;
  return <section className="inspector-group rotation-inspector" aria-label="Element rotation">
    <div className="rotation-title"><h3>Rotation</h3><span>EXPERIMENTAL</span></div>
    <p className="rotation-help" id={hintId}>Java 1.21.4 element axis/angle, separate from face UV rotation. The ring snaps to the five legal angles.</p>
    {disabledReason && <p className="rotation-reason" role="status">{disabledReason}</p>}
    <div className="rotation-pair">
      <label>Axis
        <select aria-label="Element rotation axis" disabled={disabled} value={axis ?? "mixed"}
          aria-describedby={hintId} onChange={event => apply(doc =>
            setElementAxis(doc, ids, event.target.value as ElementAxis))}>
          {axis === null && <option value="mixed" disabled>Mixed</option>}
          <option value="x">X</option><option value="y">Y</option><option value="z">Z</option>
        </select>
      </label>
      <label>Angle
        <select aria-label="Element rotation angle" disabled={disabled} value={angle === null ? "mixed" : String(angle)}
          onChange={event => apply(doc => setElementAngle(doc, ids, Number(event.target.value) as ElementAngle))}>
          {angle === null && <option value="mixed" disabled>Mixed</option>}
          {JAVA_ELEMENT_ANGLES.map(degrees => <option key={degrees} value={String(degrees)}>{degrees}°</option>)}
        </select>
      </label>
    </div>
    <div className="rotation-pivot-heading"><strong>Pivot</strong><span>Model units</span></div>
    <div className="rotation-pivot-row">{([0, 1, 2] as const).map(axisIndex =>
      <PivotField key={axisIndex} axis={axisIndex} value={pivot[axisIndex] ?? null} disabled={disabled}
        onCommit={value => apply(doc => setElementPivot(doc, ids, axisIndex, value))}/>)}</div>
    <button className="rotation-secondary" type="button" disabled={disabled}
      title={disabledReason ?? "Centre each element's own pivot on its unrotated cuboid"}
      onClick={() => apply(doc => centerElementPivots(doc, ids))}>Centre on element{nodes.length > 1 ? "s" : ""}</button>
    <label className="rotation-rescale" htmlFor={rescaleId}>
      <input ref={toggle} id={rescaleId} type="checkbox" disabled={disabled}
        checked={rescale ?? false} aria-label="Rescale rotated element"
        onChange={event => apply(doc => setElementRescale(doc, ids, event.target.checked))}/>
      <span>Rescale {rescale === null && <em>(Mixed)</em>}</span>
    </label>
    <p className="rotation-help">Compensates perpendicular dimensions after tilting; it does not change the source cuboid's size.</p>
    <button className="rotation-reset" type="button" disabled={disabled || !hasRotation}
      title={disabledReason ?? (!hasRotation ? "Selected elements have no rotation to reset" : "Remove rotation and restore axis-aligned geometry")}
      onClick={() => apply(doc => resetElementRotations(doc, ids))}>Reset rotation</button>
    {!hasRotation && !disabled && <p className="rotation-help">No element rotation yet. Choosing an axis, angle or pivot creates one.</p>}
    {nodes.length > 1 && <p className="rotation-help">Mixed values are shown individually. Each edit changes only that property for all selected elements in one undo step.</p>}
  </section>;
}

import { useState } from "react";
import type { Vec3 } from "../editor/domain";

interface Props {
  selectedCount: number;
  totalCount: number;
  disabled: boolean;
  onCreate: (copies: number, step: Vec3) => void;
}

/** Shared single-/multi-selection array authoring, with one atomic commit. */
export function SelectionArrayTools({ selectedCount, totalCount, disabled, onCreate }: Props) {
  const [countInput, setCountInput] = useState("2");
  const [stepInputs, setStepInputs] = useState<[string, string, string]>(["2", "0", "0"]);
  const copies = Number(countInput);
  const step: Vec3 = stepInputs.map(Number) as unknown as Vec3;
  const valid = countInput.trim() !== "" && Number.isSafeInteger(copies) &&
    copies >= 1 && copies <= 64 && totalCount + copies * selectedCount <= 2000 &&
    stepInputs.every(value => value.trim() !== "") &&
    step.every(Number.isFinite) && step.some(value => value !== 0);
  const updateStep = (axis: number, value: string) =>
    setStepInputs(current => current.map((entry, index) =>
      index === axis ? value : entry) as [string, string, string]);

  return <div className="batch-array-tools" aria-label="Duplicate array settings">
    <p className="batch-help">Repeat the selected {selectedCount === 1 ? "part" : "parts"} along a step vector.
      Every copy keeps its shape, material and painted-face UVs. One action, one undo step.</p>
    <label className="batch-number batch-array-count">
      <span>Number of copies (1–64)</span>
      <input type="number" min={1} max={64} step={1} aria-label="Array copies"
        value={countInput} disabled={disabled}
        onChange={event => setCountInput(event.currentTarget.value)}/>
    </label>
    <div className="batch-fields batch-array-steps">
      {(["X", "Y", "Z"] as const).map((axis, index) =>
        <label key={axis} className="batch-number">
          <span>Step {axis}</span>
          <input type="number" step="any" aria-label={"Array step " + axis}
            value={stepInputs[index]} disabled={disabled}
            onChange={event => updateStep(index, event.currentTarget.value)}/>
        </label>)}
    </div>
    <button className="batch-array-apply" type="button" disabled={disabled || !valid}
      onClick={() => onCreate(copies, step)}>
      Create array copies
    </button>
    {!disabled && !valid && <p className="batch-help" role="status">
      Enter 1–64 copies, a nonzero finite step, and stay within the 2,000-part limit.
    </p>}
  </div>;
}

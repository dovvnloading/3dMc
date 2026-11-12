import { useEffect, useState } from "react";

const PRESETS = [0.25, 0.5, 1, 2, 4, 8, 16] as const;

interface Props {
  value: number;
  onChange: (value: number) => void;
}

/** Shared snapping precision for gizmo movement and keyboard nudges. */
export function MoveSnapControl({ value, onChange }: Props) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(value)); setInvalid(false); }, [value]);

  const commitDraft = (input: string) => {
    const parsed = Number(input.trim());
    const valid = input.trim() !== "" && Number.isFinite(parsed) &&
      parsed >= 0.01 && parsed <= 16;
    if (!valid) {
      setDraft(String(value)); setInvalid(true);
      return;
    }
    const next = Math.round(parsed * 10000) / 10000;
    setDraft(String(next));
    setInvalid(false);
    onChange(next);
  };

  return <div className="move-snap-control" role="group" aria-label="Move snapping">
    <label><span>Move snap</span>
      <select className="select-control" aria-label="Move snap increment"
        value={PRESETS.includes(value as typeof PRESETS[number]) ? value : "custom"}
        onChange={event => {
          const next = event.currentTarget.value;
          if (next !== "custom") onChange(Number(next));
        }}>
        {PRESETS.map(n => <option key={n} value={n}>{n} unit{n === 1 ? "" : "s"}</option>)}
        {!PRESETS.includes(value as typeof PRESETS[number]) &&
          <option value="custom">Custom ({value})</option>}
      </select>
    </label>
    <label><span>Custom increment (0.01–16)</span>
      <input aria-label="Custom move snap" type="number" min={0.01} max={16}
        step="any" value={draft} aria-invalid={invalid}
        onChange={event => { setDraft(event.currentTarget.value); setInvalid(false); }}
        onBlur={event => commitDraft(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            event.preventDefault(); event.stopPropagation();
            event.currentTarget.value = String(value);
            setDraft(String(value)); setInvalid(false);
            event.currentTarget.blur();
          }
        }}/>
    </label>
    {invalid && <small role="status">Snap must be 0.01–16 units; last valid value restored.</small>}
  </div>;
}

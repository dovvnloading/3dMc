import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { hexToHsv, hsvToHex, normalizeHex, parseFullHex, parseHex, parseRgbChannel, rgbToHex } from "../editor/color";
import type { HSV } from "../editor/color";
import "./color-picker.css";

interface Props {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
function channelDrafts(value: string): [string, string, string] {
  const { r, g, b } = parseHex(value) ?? { r: 0, g: 0, b: 0 };
  return [String(r), String(g), String(b)];
}

/** In-flow disclosure avoids clipping by the scrolling inspector. No native colour input. */
export function ColorPicker({ label, value, onChange, disabled = false }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0 });
  const [hexDraft, setHexDraft] = useState(() => value.toUpperCase());
  const [rgbDraft, setRgbDraft] = useState<[string, string, string]>(() => channelDrafts(value));

  useEffect(() => {
    const normalized = normalizeHex(value) ?? "#000000";
    setHexDraft(normalized.toUpperCase());
    setRgbDraft(channelDrafts(normalized));
    // When editing gray/black, retain the chosen hue even if RGB cannot express it.
    if (lastEmitted.current !== normalized) setHsv(hexToHsv(normalized)!);
    lastEmitted.current = null;
  }, [value]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    square.current?.focus();
    const onOutsidePointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointer);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [open]);

  const emit = (next: string, fromHsv = false) => {
    if (next === normalizeHex(value)) return;
    // Text fields must update the SV cursor/hue too. HSV interactions already
    // carry more precise values (including a hue invisible at S=0 or V=0).
    if (!fromHsv) setHsv(hexToHsv(next)!);
    lastEmitted.current = next;
    onChange(next);
  };
  const chooseHsv = (next: HSV) => {
    setHsv(next);
    emit(hsvToHex(next), true);
  };
  const choosePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    chooseHsv({
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width),
      v: clamp(1 - (event.clientY - rect.top) / rect.height)
    });
  };
  const onSquareKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? .1 : .01;
    let next: HSV | null = null;
    switch (event.key) {
      case "ArrowLeft": next = { ...hsv, s: clamp(hsv.s - step) }; break;
      case "ArrowRight": next = { ...hsv, s: clamp(hsv.s + step) }; break;
      case "ArrowUp": next = { ...hsv, v: clamp(hsv.v + step) }; break;
      case "ArrowDown": next = { ...hsv, v: clamp(hsv.v - step) }; break;
      case "Home": next = { ...hsv, s: 0 }; break;
      case "End": next = { ...hsv, s: 1 }; break;
      case "PageUp": next = { ...hsv, v: clamp(hsv.v + .1) }; break;
      case "PageDown": next = { ...hsv, v: clamp(hsv.v - .1) }; break;
    }
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    chooseHsv(next);
  };
  const chooseRgb = (index: 0 | 1 | 2, text: string) => {
    const next: [string, string, string] = [...rgbDraft];
    next[index] = text;
    setRgbDraft(next);
    const values = next.map(parseRgbChannel);
    if (values.some(channel => channel === null)) return;
    emit(rgbToHex({ r: values[0]!, g: values[1]!, b: values[2]! })!);
  };

  return <div className="color-picker" ref={root}>
    <button type="button" className="color-picker-trigger" ref={trigger}
      aria-label={label} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? id : undefined} disabled={disabled}
      onClick={() => {
        // A dismissed invalid draft must not survive when the picker reopens.
        if (!open) {
          setHexDraft((normalizeHex(value) ?? "#000000").toUpperCase());
          setRgbDraft(channelDrafts(value));
        }
        setOpen(previous => !previous);
      }}>
      <span className="color-picker-preview" style={{ backgroundColor: value }} aria-hidden="true"/>
      <span className="color-picker-value">{value.toUpperCase()}</span>
      <span aria-hidden="true" className="color-picker-chevron">{open ? "▴" : "▾"}</span>
    </button>
    {open && <div className="color-picker-panel" id={id} role="dialog" aria-label={label + " picker"}>
      <div className="color-picker-square" ref={square} tabIndex={0} role="slider"
        aria-label="Saturation and brightness" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={"Saturation " + Math.round(hsv.s * 100) + "%, brightness " + Math.round(hsv.v * 100) + "%"}
        aria-describedby={id + "-help"}
        style={{ background: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(" + hsv.h + " 100% 50%)" }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          choosePointer(event);
        }}
        onPointerMove={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) choosePointer(event);
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={onSquareKey}>
        <span className="color-picker-cursor" aria-hidden="true"
          style={{ left: (hsv.s * 100) + "%", top: ((1 - hsv.v) * 100) + "%" }}/>
      </div>
      <div className="color-picker-help" id={id + "-help"}>← → saturation · ↑ ↓ brightness</div>
      <label className="color-picker-hue-label" htmlFor={id + "-hue"}>
        Hue <span>{Math.round(hsv.h)}°</span>
      </label>
      <input id={id + "-hue"} className="color-picker-hue" aria-label="Hue"
        type="range" min={0} max={360} step={1}
        value={Math.round(hsv.h)} onChange={event =>
          chooseHsv({ ...hsv, h: Number(event.currentTarget.value) })}/>
      <div className="color-picker-fields">
        <label className="color-picker-hex">Hex
          <input aria-label="Hex color" type="text" spellCheck={false} autoComplete="off"
            value={hexDraft} aria-invalid={parseFullHex(hexDraft) === null}
            onChange={event => {
              const text = event.currentTarget.value;
              setHexDraft(text);
              const normalized = parseFullHex(text);
              if (normalized) emit(normalized);
            }}
            onBlur={() => setHexDraft((normalizeHex(value) ?? "#000000").toUpperCase())}/>
        </label>
        {(["R", "G", "B"] as const).map((channel, index) =>
          <label key={channel}>{channel}
            <input type="text" inputMode="numeric" aria-label={channel + " channel"}
              autoComplete="off" value={rgbDraft[index]}
              aria-invalid={parseRgbChannel(rgbDraft[index]!) === null}
              onChange={event => chooseRgb(index as 0 | 1 | 2, event.currentTarget.value)}
              onBlur={() => setRgbDraft(channelDrafts(value))}/>
          </label>)}
      </div>
    </div>}
  </div>;
}

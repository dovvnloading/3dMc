import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { FaceDirection, FaceUV, FaceUVRect } from "../editor/domain";
import { dragFaceUV } from "../editor/uvEditing";
import type { UVDragHandle } from "../editor/uvEditing";
import { faceLabel, logicalUVToPixelRect } from "../editor/uv";

interface Props {
  face: FaceUV;
  name: FaceDirection;
  width: number;
  height: number;
  zoom: number;
  editing: boolean;
  pixelSnap: boolean;
  onCommit: (source: FaceUV, rect: FaceUVRect) => void;
}
interface Drag {
  pointerId: number;
  capture: HTMLElement;
  x: number;
  y: number;
  zoom: number;
  handle: UVDragHandle;
  source: FaceUV;
  snap: boolean;
  commit: Props["onCommit"];
}

/** An independent preview: only a completed drag publishes a document edit. */
export function UVRegionOverlay(props: Props) {
  const active = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<FaceUVRect | null>(null);
  const uv = preview ?? props.face.uv;
  const [u1, v1, u2, v2] = logicalUVToPixelRect(uv, props.width, props.height);
  const left = Math.min(u1, u2), top = Math.min(v1, v2);
  const width = Math.abs(u2 - u1), height = Math.abs(v2 - v1);
  const cancel = () => { active.current = null; setPreview(null); };

  useEffect(() => { active.current = null; setPreview(null); },
    [props.face, props.name, props.width, props.height, props.editing]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        event.preventDefault(); cancel();
      }
    };
    const blur = () => { if (active.current) cancel(); };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const begin = (event: PointerEvent<HTMLElement>, handle: UVDragHandle) => {
    if (!props.editing || event.button !== 0 || active.current) return;
    event.preventDefault(); event.stopPropagation();
    active.current = {
      pointerId: event.pointerId, capture: event.currentTarget,
      x: event.clientX, y: event.clientY, zoom: props.zoom,
      handle, source: props.face, snap: props.pixelSnap, commit: props.onCommit
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(props.face.uv);
  };
  const calculate = (event: PointerEvent<HTMLElement>) => {
    const state = active.current;
    if (!state || state.pointerId !== event.pointerId) return null;
    return dragFaceUV(state.source.uv, state.handle,
      [(event.clientX - state.x) / state.zoom, (event.clientY - state.y) / state.zoom],
      props.width, props.height, state.snap);
  };
  const onMove = (event: PointerEvent<HTMLElement>) => {
    if (active.current?.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const next = calculate(event);
    if (next) setPreview(next);
  };
  const onUp = (event: PointerEvent<HTMLElement>) => {
    const state = active.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const final = calculate(event);
    active.current = null; setPreview(null);
    if (state.capture.hasPointerCapture(state.pointerId))
      state.capture.releasePointerCapture(state.pointerId);
    if (final && final.some((value, index) => value !== state.source.uv[index]))
      state.commit(state.source, final);
  };
  const onCancel = (event: PointerEvent<HTMLElement>) => {
    if (active.current?.pointerId !== event.pointerId) return;
    event.stopPropagation(); cancel();
  };
  const onKeyboard = (event: KeyboardEvent<HTMLElement>, handle: UVDragHandle) => {
    const directions: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1]
    };
    const delta = directions[event.key];
    if (!delta || !props.editing) return;
    event.preventDefault(); event.stopPropagation();
    const size = event.shiftKey ? 4 : 1;
    const next = dragFaceUV(props.face.uv, handle,
      [delta[0] * size, delta[1] * size], props.width, props.height, true);
    if (next.some((value, index) => value !== props.face.uv[index]))
      props.onCommit(props.face, next);
  };

  const corners: Array<{ handle: UVDragHandle; label: string; x: number; y: number }> = [
    { handle: "nw", label: "U1 V1", x: u1, y: v1 },
    { handle: "ne", label: "U2 V1", x: u2, y: v1 },
    { handle: "sw", label: "U1 V2", x: u1, y: v2 },
    { handle: "se", label: "U2 V2", x: u2, y: v2 }
  ];
  return <div className={"uv-selection-rect" + (props.editing ? " uv-interactive" : "")}
    style={{ left: left * props.zoom, top: top * props.zoom,
      width: width * props.zoom, height: height * props.zoom }}
    role={props.editing ? "button" : undefined}
    aria-label={props.editing ? "Move selected face UV region" : undefined}
    aria-hidden={!props.editing} tabIndex={props.editing ? 0 : undefined}
    data-uv-dragging={active.current ? "true" : undefined}
    onPointerDown={event => begin(event, "move")}
    onPointerMove={onMove} onPointerUp={onUp}
    onPointerCancel={onCancel} onLostPointerCapture={onCancel}
    onKeyDown={event => onKeyboard(event, "move")}>
    <span>{faceLabel(props.name)}</span>
    {props.editing && corners.map(corner => <button key={corner.handle}
      type="button" className={"uv-drag-handle handle-" + corner.handle}
      aria-label={"Resize UV " + corner.label} title={"Resize UV " + corner.label}
      style={{ left: (corner.x - left) / width * 100 + "%",
        top: (corner.y - top) / height * 100 + "%" }}
      onPointerDown={event => begin(event, corner.handle)}
      onKeyDown={event => onKeyboard(event, corner.handle)}/>)}
  </div>;
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { insideMask } from "../editor/pixels";
import type { Texel, PixelMask } from "../editor/pixels";
import { mirroredTexels } from "../editor/paintGeometry";
import type { PaintModifiers, SymmetryMode } from "../editor/paintGeometry";
import type { BrushShape } from "../editor/brush";
import { brushTexels, footprintOutline } from "../editor/brush";
import type { FaceDirection, FaceUV, FaceUVRect } from "../editor/domain";
import { faceLabel } from "../editor/uv";
import { clampSheetView, sheetContainsPoint, sheetFitView, sheetPan,
  sheetPointToTexel, sheetResetView, sheetZoomAt } from "../editor/sheetView";
import type { SheetView } from "../editor/sheetView";
import { UVRegionOverlay } from "./UVRegionOverlay";
import { SymmetryGuides } from "./SymmetryGuides";
import type { Tool } from "./EditorViewport";
import { Minus, Plus } from "lucide-react";
import "./texture-sheet.css";

interface Props {
  projectId: string;
  textureId: string;
  pixels: number[];
  width: number;
  height: number;
  tool: Tool;
  color: string;
  brushSize: number;
  brushShape: BrushShape;
  symmetry: SymmetryMode;
  paintMask?: PixelMask | null;
  painting: boolean;
  face: FaceUV | null;
  faceName: FaceDirection | null;
  uvEditable: boolean;
  onCommitUV: (source: FaceUV, rect: FaceUVRect) => void;
  onBegin: (texel: Texel, face: string, textureId: string, modifiers?: PaintModifiers) => void;
  onMove: (texel: Texel, face: string, textureId: string, modifiers?: PaintModifiers) => void;
  onEnd: () => void;
  onCancel: () => void;
  onSample: (texel: Texel) => void;
  onFill: (texel: Texel) => void;
}

const FACE = "texture-canvas";
// View state is session-only, never written to native source or undo history.
const views = new Map<string, SheetView>();
function remember(key: string, view: SheetView) {
  views.delete(key);
  views.set(key, view);
  if (views.size > 32) views.delete(views.keys().next().value!);
}
interface PanGesture {
  pointerId: number;
  lastX: number;
  lastY: number;
}

export function TextureSurface(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const strokePointer = useRef<number | null>(null);
  const lastStrokeTexel = useRef<Texel>([0, 0]);
  const pan = useRef<PanGesture | null>(null);
  const pointerOver = useRef(false);
  const space = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [cursor, setCursor] = useState<Texel>([0, 0]);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [editUV, setEditUV] = useState(false);
  const [pixelSnap, setPixelSnap] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const key = props.projectId + ":" + props.textureId + ":" + props.width + "x" + props.height;
  const [view, setView] = useState<SheetView>(() =>
    sheetResetView(props.width, props.height, 280, 240));
  const viewRef = useRef(view);
  viewRef.current = view;

  const applyView = useCallback((next: SheetView) => {
    viewRef.current = next;
    remember(key, next);
    setView(next);
  }, [key]);
  const viewportSize = () => ({
    width: viewportRef.current?.clientWidth ?? 280,
    height: viewportRef.current?.clientHeight ?? 240
  });
  useLayoutEffect(() => {
    const { width, height } = viewportSize();
    const restored = views.get(key);
    applyView(restored
      ? clampSheetView(restored, props.width, props.height, width, height)
      : sheetResetView(props.width, props.height, width, height));
    setCursor([0, 0]); setHovered(false);
  }, [key, applyView, props.width, props.height]);
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    let previousWidth = node.clientWidth, previousHeight = node.clientHeight;
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth, height = node.clientHeight;
      if (width === previousWidth && height === previousHeight) return;
      const updated = clampSheetView({
        ...viewRef.current,
        x: viewRef.current.x + (width - previousWidth) / 2,
        y: viewRef.current.y + (height - previousHeight) / 2
      }, props.width, props.height, width, height);
      previousWidth = width; previousHeight = height;
      applyView(updated);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, applyView, props.width, props.height]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0) return;
      event.preventDefault();
      if (strokePointer.current !== null) return;
      const rect = element.getBoundingClientRect();
      const units = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const { width, height } = viewportSize();
      applyView(sheetZoomAt(viewRef.current,
        viewRef.current.zoom * Math.exp(-units / 350),
        event.clientX - rect.left, event.clientY - rect.top,
        props.width, props.height, width, height));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [key, applyView, props.width, props.height]);

  useEffect(() => {
    const down = (event: globalThis.KeyboardEvent) => {
      if (event.key !== " " || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]") ||
          document.querySelector("[role=dialog]") ||
          (target?.closest("button") && !pointerOver.current)) return;
      space.current = true; setSpaceHeld(true);
      // A focused tool button must not activate on Space when the pointer is over the sheet.
      if (pointerOver.current || (target && viewportRef.current?.contains(target))) event.preventDefault();
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.key === " ") {
        if (space.current) event.preventDefault();
        space.current = false; setSpaceHeld(false);
      }
    };
    const blur = () => {
      space.current = false; setSpaceHeld(false);
      if (pan.current && viewportRef.current?.hasPointerCapture(pan.current.pointerId))
        viewportRef.current.releasePointerCapture(pan.current.pointerId);
      pan.current = null;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  useEffect(() => {
    // Shift and Alt must refresh a held shape even if the pointer stops moving.
    const updateModifiers = (event: globalThis.KeyboardEvent) => {
      if (strokePointer.current === null ||
          (props.tool !== "rectangle" && props.tool !== "ellipse") ||
          (event.key !== "Shift" && event.key !== "Alt")) return;
      event.preventDefault();
      props.onMove(lastStrokeTexel.current, FACE, props.textureId,
        { shiftKey: event.shiftKey, altKey: event.altKey });
    };
    window.addEventListener("keydown", updateModifiers);
    window.addEventListener("keyup", updateModifiers);
    return () => {
      window.removeEventListener("keydown", updateModifiers);
      window.removeEventListener("keyup", updateModifiers);
    };
  }, [props.tool, props.textureId, props.onMove]);

  useEffect(() => { setEditUV(false); }, [props.tool]);
  useEffect(() => { if (!props.face || !props.uvEditable) setEditUV(false); },
    [props.face, props.uvEditable]);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(props.pixels),
      props.width, props.height), 0, 0);
  }, [props.pixels, props.width, props.height]);
  useEffect(() => {
    if (!props.painting && strokePointer.current !== null) {
      const id = strokePointer.current;
      strokePointer.current = null;
      if (canvasRef.current?.hasPointerCapture(id)) canvasRef.current.releasePointerCapture(id);
    }
  }, [props.painting]);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Texel => {
    const bounds = viewportRef.current!.getBoundingClientRect();
    return sheetPointToTexel(event.clientX, event.clientY, bounds, viewRef.current,
      props.width, props.height);
  };
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current || strokePointer.current !== null ||
        !(event.button === 1 || (event.button === 0 && space.current))) return;
    event.preventDefault(); event.stopPropagation();
    pan.current = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setHovered(false);
  };
  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const active = pan.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const { width, height } = viewportSize();
    applyView(sheetPan(viewRef.current, event.clientX - active.lastX, event.clientY - active.lastY,
      props.width, props.height, width, height));
    active.lastX = event.clientX; active.lastY = event.clientY;
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current?.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    pan.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const cancelPan = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current?.pointerId === event.pointerId) pan.current = null;
  };
  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || strokePointer.current !== null || editUV || pan.current) return;
    const point = pointAt(event);
    setCursor(point);
    event.currentTarget.focus();
    if (props.tool === "eyedropper") { props.onSample(point); return; }
    if (props.tool === "fill") { props.onFill(point); return; }
    if (!["pencil", "eraser", "line", "rectangle", "ellipse"].includes(props.tool)) return;
    strokePointer.current = event.pointerId;
    lastStrokeTexel.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onBegin(point, FACE, props.textureId,
      { shiftKey: event.shiftKey, altKey: event.altKey });
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = viewportRef.current!.getBoundingClientRect();
    setHovered(sheetContainsPoint(event.clientX, event.clientY, bounds,
      viewRef.current, props.width, props.height));
    const point = pointAt(event);
    setCursor(point);
    if (strokePointer.current === event.pointerId) {
      lastStrokeTexel.current = point;
      props.onMove(point, FACE, props.textureId,
        { shiftKey: event.shiftKey, altKey: event.altKey });
    }
  };
  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (strokePointer.current !== event.pointerId) return;
    strokePointer.current = null;
    props.onMove(pointAt(event), FACE, props.textureId,
      { shiftKey: event.shiftKey, altKey: event.altKey });
    props.onEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const pointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (strokePointer.current !== event.pointerId) return;
    strokePointer.current = null;
    props.onCancel();
  };
  const lostCapture = (event: PointerEvent<HTMLCanvasElement>) => {
    if (strokePointer.current !== event.pointerId) return;
    strokePointer.current = null;
    props.onCancel();
  };
  const zoomBy = (factor: number) => {
    if (strokePointer.current !== null) return;
    const { width, height } = viewportSize();
    applyView(sheetZoomAt(viewRef.current, viewRef.current.zoom * factor,
      width / 2, height / 2, props.width, props.height, width, height));
  };
  const reset = () => {
    if (strokePointer.current !== null) return;
    const { width, height } = viewportSize();
    applyView(sheetResetView(props.width, props.height, width, height));
  };
  const fit = () => {
    if (strokePointer.current !== null) return;
    const { width, height } = viewportSize();
    applyView(sheetFitView(props.width, props.height, width, height));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (editUV) {
      // Escape from the UV overlay cancels its active drag; do not also close edit mode.
      if (event.key === "Escape" && event.target === canvasRef.current) {
        event.preventDefault(); setEditUV(false);
      }
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault(); zoomBy(1.25); return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault(); zoomBy(1 / 1.25); return;
    }
    if (event.key === "0") { event.preventDefault(); reset(); return; }
    const delta: Record<string, Texel> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
    };
    const move = delta[event.key];
    if (move) {
      event.preventDefault();
      setCursor(([x, y]) => [
        Math.max(0, Math.min(props.width - 1, x + move[0])),
        Math.max(0, Math.min(props.height - 1, y + move[1]))
      ]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (props.tool === "fill") props.onFill(cursor);
      else if (props.tool === "eyedropper") props.onSample(cursor);
      else if (["pencil", "eraser", "line", "rectangle", "ellipse"].includes(props.tool)) {
        props.onBegin(cursor, FACE, props.textureId); props.onEnd();
      }
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); props.onCancel();
    }
  };
  const focusTexels = useMemo(() => {
    if (props.paintMask === null) return [];
    const paintTool = ["pencil", "eraser", "line", "rectangle", "ellipse"].includes(props.tool);
    const source = brushTexels(cursor, paintTool ? props.brushSize : 1,
      paintTool ? props.brushShape : "square", props.width, props.height);
    const visited = new Set<string>();
    return source.flatMap(point => mirroredTexels(point, props.width, props.height, props.symmetry))
      .filter(([x, y]) => {
        const key = x + "," + y;
        if (visited.has(key) || !insideMask(props.paintMask ?? undefined, x, y)) return false;
        visited.add(key); return true;
      });
  }, [cursor, props.tool, props.brushSize, props.brushShape,
    props.width, props.height, props.paintMask, props.symmetry]);
  const outline = useMemo(() => footprintOutline(focusTexels), [focusTexels]);
  const zoomLabel = (Math.round(view.zoom * 10) / 10).toString() + "×";

  return <section className="texture-editor" aria-label="Texture editor">
    <div className="texture-header">
      <div><strong>Texture sheet</strong>
        <span>{props.faceName ? faceLabel(props.faceName) + " face UV" : "Shared texture"} · {props.width} × {props.height}</span>
      </div>
      <div className="texture-header-tools">
        {props.face && <button type="button" aria-label="Edit face UV on texture sheet"
          aria-pressed={editUV} disabled={!props.uvEditable}
          className={"uv-edit-toggle" + (editUV ? " active" : "")}
          onClick={() => { setEditUV(current => !current); props.onCancel(); }}>
          {editUV ? "Done editing UV" : "Edit face UV"}
        </button>}
        {editUV && <label className="uv-snap-toggle">
          <input type="checkbox" checked={pixelSnap}
            onChange={event => setPixelSnap(event.currentTarget.checked)}/>
          Snap UV to pixels
        </label>}
      </div>
      <div className="sheet-navigation">
        <div className="zoom-controls" aria-label="Texture zoom">
          <button type="button" title="Zoom out (-)" aria-label="Zoom out texture" onClick={() => zoomBy(1 / 1.25)}><Minus size={14}/></button>
          <span role="status" aria-label="Texture zoom level">{zoomLabel}</span>
          <button type="button" title="Zoom in (+)" aria-label="Zoom in texture" onClick={() => zoomBy(1.25)}><Plus size={14}/></button>
        </div>
        <button type="button" aria-label="Fit texture sheet" onClick={fit}>Fit</button>
        <button type="button" aria-label="Reset texture view" title="Reset texture zoom (0)" onClick={reset}>Reset</button>
        <label className="sheet-grid-toggle"><input type="checkbox" aria-label="Show pixel grid"
          checked={showGrid} onChange={event => setShowGrid(event.currentTarget.checked)}/>Grid</label>
      </div>
    </div>
    <div className={"texture-scroll" + (pan.current || spaceHeld ? " sheet-pan-cursor" : "")}
      ref={viewportRef} aria-label="Texture canvas navigation"
      onPointerEnter={() => { pointerOver.current = true; }}
      onPointerLeave={() => { pointerOver.current = false; }}
      onPointerDownCapture={beginPan} onPointerMoveCapture={movePan}
      onPointerUpCapture={endPan} onPointerCancelCapture={cancelPan}
      onLostPointerCapture={cancelPan}
      onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
      onKeyDown={onKeyDown}>
      <div className="texture-pixel-wrap" style={{
        width: props.width * view.zoom, height: props.height * view.zoom,
        transform: `translate3d(${view.x}px, ${view.y}px, 0)`
      }}>
        <canvas ref={canvasRef} width={props.width} height={props.height}
          style={{ width: props.width * view.zoom, height: props.height * view.zoom }}
          tabIndex={0}
          aria-label="Texture pixels. Arrow keys move the texel cursor; Enter paints, fills or samples. Space and drag pans."
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
          onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
          onPointerCancel={pointerCancel} onLostPointerCapture={lostCapture}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}/>
        {showGrid && view.zoom >= 6 && <div aria-hidden="true" className="sheet-pixel-grid"
          style={{ backgroundSize: `${view.zoom}px ${view.zoom}px` }}/>}
        <SymmetryGuides mode={props.symmetry} width={props.width} height={props.height} zoom={view.zoom}/>
        {props.face && props.faceName && <UVRegionOverlay
          face={props.face} name={props.faceName}
          width={props.width} height={props.height} zoom={view.zoom}
          editing={editUV && props.uvEditable} pixelSnap={pixelSnap}
          onCommit={props.onCommitUV}/>}
        {(hovered || focused) && outline && <svg aria-hidden="true" className="sheet-brush-outline"
          width={props.width * view.zoom} height={props.height * view.zoom}
          viewBox={`0 0 ${props.width} ${props.height}`} preserveAspectRatio="none">
          <path d={outline} fill="none" stroke="#121619" strokeWidth={3 / view.zoom}/>
          <path d={outline} fill="none" stroke="#ffffff" strokeWidth={1 / view.zoom}/>
        </svg>}
      </div>
    </div>
    <div className="texture-footer">
      <span>Texel {cursor[0] + 1}, {cursor[1] + 1}</span>
      <span>Alpha {Math.round((props.pixels[(cursor[1] * props.width + cursor[0]) * 4 + 3] ?? 255) / 255 * 100)}%</span>
      <span>Color <i className="color-dot" style={{ background: props.color }}/>{props.color.toUpperCase()}</span>
    </div>
    <p className="texture-note">{editUV ?
      "Drag the UV rectangle to move it, or drag a corner to resize it. Arrow keys on handles move one pixel; Shift moves four. Escape cancels." :
      "Wheel zooms under the pointer; Space+drag or middle-drag pans. Fit shows the full sheet, Reset restores working zoom. Arrow keys move the texel cursor; Enter paints. Pixel grid appears at 6× and above."}</p>
  </section>;
}

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Texel } from "../editor/pixels";
import type { FaceDirection, FaceUV, FaceUVRect } from "../editor/domain";
import { faceLabel } from "../editor/uv";
import { UVRegionOverlay } from "./UVRegionOverlay";
import type { Tool } from "./EditorViewport";
import { Minus, Plus } from "lucide-react";

interface Props {
  pixels: number[];
  width: number;
  height: number;
  tool: Tool;
  color: string;
  painting: boolean;
  face: FaceUV | null;
  faceName: FaceDirection | null;
  uvEditable: boolean;
  onCommitUV: (source: FaceUV, rect: FaceUVRect) => void;
  onBegin: (texel: Texel, face: string) => void;
  onMove: (texel: Texel, face: string) => void;
  onEnd: () => void;
  onCancel: () => void;
  onSample: (texel: Texel) => void;
  onFill: (texel: Texel) => void;
}

const FACE = "texture-canvas";

export function TextureSurface(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokePointer = useRef<number | null>(null);
  const [zoom, setZoom] = useState(() => props.width >= 64 || props.height >= 64 ? 4 : 8);
  const [cursor, setCursor] = useState<Texel>([0, 0]);
  const [editUV, setEditUV] = useState(false);
  const [pixelSnap, setPixelSnap] = useState(true);
  useEffect(() => { setEditUV(false); }, [props.tool]);
  useEffect(() => { if (!props.face || !props.uvEditable) setEditUV(false); },
    [props.face, props.uvEditable]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.putImageData(new ImageData(new Uint8ClampedArray(props.pixels),
      props.width, props.height), 0, 0);
  }, [props.pixels, props.width, props.height]);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): Texel => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(props.width - 1,
        Math.floor(((event.clientX - bounds.left) / bounds.width) * props.width))),
      Math.max(0, Math.min(props.height - 1,
        Math.floor(((event.clientY - bounds.top) / bounds.height) * props.height)))
    ];
  };

  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || strokePointer.current !== null || editUV) return;
    const point = pointAt(event);
    setCursor(point);
    if (props.tool === "eyedropper") { props.onSample(point); return; }
    if (props.tool === "fill") { props.onFill(point); return; }
    if (!["pencil", "eraser", "line", "rectangle"].includes(props.tool)) return;
    strokePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onBegin(point, FACE);
  };

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointAt(event);
    setCursor(point);
    if (strokePointer.current === event.pointerId) props.onMove(point, FACE);
  };

  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (strokePointer.current !== event.pointerId) return;
    strokePointer.current = null;
    props.onMove(pointAt(event), FACE);
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
    // Successful pointerup clears the token before releasing capture.
    if (strokePointer.current !== event.pointerId) return;
    strokePointer.current = null;
    props.onCancel();
  };
  useEffect(() => {
    if (!props.painting) strokePointer.current = null;
  }, [props.painting]);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (editUV) {
      if (event.key === "Escape") { event.preventDefault(); setEditUV(false); }
      return;
    }
    const delta: Record<string, Texel> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
    };
    const movement = delta[event.key];
    if (movement) {
      event.preventDefault();
      setCursor(([x, y]) => [
        Math.max(0, Math.min(props.width - 1, x + movement[0])),
        Math.max(0, Math.min(props.height - 1, y + movement[1]))
      ]);
    } else if (event.key === " " &&
      (props.tool === "pencil" || props.tool === "eraser" ||
       props.tool === "line" || props.tool === "rectangle")) {
      event.preventDefault();
      props.onBegin(cursor, FACE);
      props.onEnd();
    } else if (event.key === " " && props.tool === "fill") {
      event.preventDefault();
      props.onFill(cursor);
    } else if (event.key === "Enter" && props.tool === "eyedropper") {
      event.preventDefault();
      props.onSample(cursor);
    } else if (event.key === "Escape") {
      props.onCancel();
    }
  };

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
      <div className="zoom-controls" aria-label="Texture zoom">
        <button title="Zoom out" onClick={() => setZoom((n) => Math.max(4, n - 2))}><Minus size={14}/></button>
        <span>{zoom}×</span>
        <button title="Zoom in" onClick={() => setZoom((n) => Math.min(16, n + 2))}><Plus size={14}/></button>
      </div>
    </div>
    <div className="texture-scroll">
      <div className="texture-pixel-wrap" style={{ width: props.width * zoom, height: props.height * zoom }}>
        <canvas ref={canvasRef} width={props.width} height={props.height}
          style={{ width: props.width * zoom, height: props.height * zoom }}
          tabIndex={0}
          aria-label="Texture pixels. Arrow keys move the cursor; Space paints with pencil or Enter samples with eyedropper."
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
          onPointerCancel={pointerCancel} onLostPointerCapture={lostCapture}
          onKeyDown={onKeyDown} />
        {props.face && props.faceName && <UVRegionOverlay
          face={props.face} name={props.faceName}
          width={props.width} height={props.height} zoom={zoom}
          editing={editUV && props.uvEditable} pixelSnap={pixelSnap}
          onCommit={props.onCommitUV}/>}

        <div className="texel-focus" aria-hidden="true"
          style={{ width: zoom, height: zoom, left: cursor[0] * zoom, top: cursor[1] * zoom }} />
      </div>
    </div>
    <div className="texture-footer">
      <span>Texel {cursor[0] + 1}, {cursor[1] + 1}</span>
      <span>Alpha {Math.round((props.pixels[(cursor[1] * props.width + cursor[0]) * 4 + 3] ?? 255) / 255 * 100)}%</span>
      <span>Color <i className="color-dot" style={{ background: props.color }}/>{props.color.toUpperCase()}</span>
    </div>
    <p className="texture-note">{editUV ?
      "Drag the UV rectangle to move it, or drag a corner to resize it. Arrow keys on the region and handles move one pixel; Shift moves four. Release commits one edit; Escape cancels." :
      "Brushes and fill edit the shared RGBA sheet. The outlined region belongs to the selected 3D face; choose Edit face UV to change its mapping without changing pixels."}</p>
  </section>;
}

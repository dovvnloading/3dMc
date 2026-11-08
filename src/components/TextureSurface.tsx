import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Texel } from "../editor/pixels";
import type { Tool } from "./EditorViewport";
import { Minus, Plus } from "lucide-react";

interface Props {
  pixels: number[];
  width: number;
  height: number;
  tool: Tool;
  color: string;
  painting: boolean;
  onBegin: (texel: Texel, face: string) => void;
  onMove: (texel: Texel, face: string) => void;
  onEnd: () => void;
  onCancel: () => void;
  onSample: (texel: Texel) => void;
}

const FACE = "texture-canvas";

export function TextureSurface(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(8);
  const [cursor, setCursor] = useState<Texel>([0, 0]);

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
    if (event.button !== 0) return;
    const point = pointAt(event);
    setCursor(point);
    if (props.tool === "eyedropper") { props.onSample(point); return; }
    if (props.tool !== "pencil") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onBegin(point, FACE);
  };

  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = pointAt(event);
    setCursor(point);
    if (props.painting) props.onMove(point, FACE);
  };

  const pointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (props.painting) props.onEnd();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
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
    } else if (event.key === " " && props.tool === "pencil") {
      event.preventDefault();
      props.onBegin(cursor, FACE);
      props.onEnd();
    } else if (event.key === "Enter" && props.tool === "eyedropper") {
      event.preventDefault();
      props.onSample(cursor);
    } else if (event.key === "Escape") {
      props.onCancel();
    }
  };

  return <section className="texture-editor" aria-label="Texture editor">
    <div className="texture-header">
      <div><strong>Texture sheet</strong><span>Shared UV sample · {props.width} × {props.height}</span></div>
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
          onPointerCancel={props.onCancel} onKeyDown={onKeyDown} />
        <div className="texel-focus" aria-hidden="true"
          style={{ width: zoom, height: zoom, left: cursor[0] * zoom, top: cursor[1] * zoom }} />
      </div>
    </div>
    <div className="texture-footer">
      <span>Texel {cursor[0] + 1}, {cursor[1] + 1}</span>
      <span>Color <i className="color-dot" style={{ background: props.color }}/>{props.color.toUpperCase()}</span>
    </div>
    <p className="texture-note">This early texture proof maps one shared sheet across textured faces. Per-face UV editing and Minecraft texture export require the compatibility stage.</p>
  </section>;
}

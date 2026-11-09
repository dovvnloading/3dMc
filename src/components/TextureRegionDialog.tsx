import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { EditorDocument, PixelTexture } from "../editor/domain";
import { assertPixelRect, clearPixelRegion, commitTextureDraft, copyPixelRegion, mirrorPixelRegion, pastePixelRegion } from "../editor/regions";
import type { PixelClipboard, PixelRect } from "../editor/regions";
import { CreatorDialog } from "./CreatorDialog";

interface Props {
  source: EditorDocument;
  current: EditorDocument;
  texture: PixelTexture;
  clipboard: PixelClipboard | null;
  onCopy: (clipboard: PixelClipboard) => void;
  onApply: (operation: (document: EditorDocument) => EditorDocument) => boolean;
  onClose: () => void;
}
const fields = ["x", "y", "width", "height"] as const;
export function TextureRegionDialog(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState(props.texture.pixels);
  const [draft, setDraft] = useState({ x: "0", y: "0", width: String(Math.min(4, props.texture.width)), height: String(Math.min(4, props.texture.height)) });
  const [message, setMessage] = useState<string | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; before: typeof draft } | null>(null);
  const image = { width: props.texture.width, height: props.texture.height, pixels };
  const rect: PixelRect = { x: Number(draft.x), y: Number(draft.y), width: Number(draft.width), height: Number(draft.height) };
  let invalid: string | null = null;
  try {
    if (fields.some(key => draft[key].trim() === "")) throw new Error("Enter every region coordinate and dimension.");
    assertPixelRect(image, rect);
  } catch (error) { invalid = error instanceof Error ? error.message : "Invalid region."; }
  const stale = props.current !== props.source;
  const changed = pixels.some((value, index) => value !== props.texture.pixels[index]);
  const scale = Math.min(12, Math.max(4, Math.floor(384 / props.texture.width)));
  useEffect(() => {
    canvasRef.current?.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels), image.width, image.height), 0, 0);
  }, [pixels, image.width, image.height]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(image.width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * image.width))),
      y: Math.max(0, Math.min(image.height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * image.height)))
    };
  };
  const perform = (operation: () => void) => {
    try { operation(); setMessage(null); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The region operation was rejected."); }
  };
  const copy = () => { if (!invalid) perform(() => { props.onCopy(copyPixelRegion(image, rect)); }); };
  const paste = () => { if (!invalid && props.clipboard) perform(() => setPixels(pastePixelRegion(image, props.clipboard!, rect.x, rect.y))); };
  return <CreatorDialog title="Edit pixel region" kicker="EXACT RGBA · STAGED PREVIEW" onClose={props.onClose} wide>
    <p className="creator-description">Select a rectangle by dragging or entering pixel coordinates. Operations stay in this preview until Apply. Copy/paste replaces all four RGBA channels exactly, without blending or resizing.</p>
    <div className="region-workbench" onKeyDown={event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select") || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "c") { event.preventDefault(); event.stopPropagation(); copy(); }
      if (event.key.toLowerCase() === "v") { event.preventDefault(); event.stopPropagation(); paste(); }
    }}>
      <div className="region-preview-scroll"><div className="region-preview" style={{ width: image.width * scale, height: image.height * scale }}>
        <canvas ref={canvasRef} width={image.width} height={image.height} tabIndex={0}
          aria-label="Pixel region preview. Drag to select; numeric controls provide the keyboard alternative."
          style={{ width: image.width * scale, height: image.height * scale }}
          onPointerDown={event => {
            if (event.button !== 0 || pointer.current) return;
            const start = point(event); pointer.current = { id: event.pointerId, ...start, before: draft };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft({ x: String(start.x), y: String(start.y), width: "1", height: "1" });
          }} onPointerMove={event => {
            const start = pointer.current; if (!start || start.id !== event.pointerId) return;
            const end = point(event);
            setDraft({ x: String(Math.min(start.x, end.x)), y: String(Math.min(start.y, end.y)),
              width: String(Math.abs(end.x - start.x) + 1), height: String(Math.abs(end.y - start.y) + 1) });
          }} onPointerUp={event => {
            if (pointer.current?.id !== event.pointerId) return;
            pointer.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          }} onPointerCancel={() => { if (pointer.current) setDraft(pointer.current.before); pointer.current = null; }}
          onLostPointerCapture={() => { if (pointer.current) setDraft(pointer.current.before); pointer.current = null; }}/>
        {!invalid && <div className="region-outline" aria-hidden="true" style={{ left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale }}/ >}
      </div></div>
      <div className="region-properties">
        <h3>{props.texture.name}</h3><p>{image.width} × {image.height} pixels · coordinates start at zero</p>
        <div className="creator-number-grid">{fields.map(key => <label key={key}>
          <span>{key === "x" ? "Left X" : key === "y" ? "Top Y" : key === "width" ? "Width" : "Height"}</span>
          <input type="number" step="1" aria-label={"Region " + key} aria-invalid={!!invalid} value={draft[key]}
            onChange={event => { setDraft(current => ({ ...current, [key]: event.target.value })); setMessage(null); }}/>
        </label>)}</div>
        <div className="creator-button-grid">
          <button type="button" disabled={!!invalid} onClick={copy}>Copy region</button>
          <button type="button" disabled={!!invalid || !props.clipboard} onClick={paste}>Paste at region corner</button>
          <button type="button" disabled={!!invalid} onClick={() => perform(() => setPixels(mirrorPixelRegion(image, rect, "horizontal")))}>Mirror pixels horizontally</button>
          <button type="button" disabled={!!invalid} onClick={() => perform(() => setPixels(mirrorPixelRegion(image, rect, "vertical")))}>Mirror pixels vertically</button>
          <button type="button" disabled={!!invalid} onClick={() => perform(() => setPixels(clearPixelRegion(image, rect)))}>Clear region</button>
          <button type="button" disabled={!changed} onClick={() => { setPixels(props.texture.pixels); setMessage(null); }}>Reset preview</button>
        </div>
        <p className="creator-help" role="status">{props.clipboard ? `Editor clipboard: ${props.clipboard.width} × ${props.clipboard.height} RGBA pixels. It remains available when switching texture sheets.` : "The editor clipboard is local to this session; no system clipboard access is requested."}</p>
      </div>
    </div>
    {(invalid || message) && <p className="creator-error" role="alert">{invalid ?? message}</p>}
    {stale && <p className="creator-error" role="alert">The source changed. Cancel and reopen this preview; newer work will not be overwritten.</p>}
    <p className="creator-help">Every face referencing this sheet sees the applied pixels. Clearing introduces transparency, which remains a blocker for the experimental Java exporter.</p>
    <div className="creator-dialog-actions"><button type="button" onClick={props.onClose}>Cancel preview</button>
      <button type="button" className="creator-primary" disabled={!changed || stale || !!invalid} onClick={() => {
        if (props.onApply(current => commitTextureDraft(current, props.source, props.texture.id, pixels))) props.onClose();
      }}>Apply pixel edits</button></div>
  </CreatorDialog>;
}

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  FACE_DIRECTIONS, assignFaceTexture, updateCuboid, updateFaceRotation, updateFaceUV
} from "../editor/domain";
import type { Cuboid, EditorDocument, FaceDirection, FaceRotation, FaceUV, PixelTexture } from "../editor/domain";
import { faceLabel, logicalUVToPixelRect } from "../editor/uv";

function UVField({ label, value, opposite, disabled, onCommit }: {
  label: string; value: number; opposite: number;
  disabled: boolean; onCommit: (next: number) => void;
}) {
  const formatted = String(Number(value.toFixed(4)));
  const [draft, setDraft] = useState(formatted);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(formatted); setError(null); }, [formatted]);
  const confirm = (text: string) => {
    const next = Number(text.trim());
    if (!text.trim() || !Number.isFinite(next) || next < 0 || next > 16 || next === opposite) {
      setDraft(formatted);
      setError("Use a value from 0 to 16, different from the opposite edge.");
      return;
    }
    setError(null);
    onCommit(next);
  };
  return <label className={"uv-field" + (error ? " invalid" : "")}>
    <span>{label}</span>
    <input aria-label={"Face UV " + label} type="text" inputMode="decimal"
      disabled={disabled} value={draft} onChange={(event) => {
        setDraft(event.target.value); setError(null);
      }} onBlur={(event) => confirm(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = formatted; setDraft(formatted); setError(null);
          event.currentTarget.blur();
        }
      }}/>
    {error && <span className="uv-field-error" title={error} role="alert">!</span>}
  </label>;
}

export function FaceUVInspector({ selected, face, setFace, commitDocument, textures, textureWidth, textureHeight }: {
  selected: Cuboid;
  face: FaceDirection;
  setFace: (face: FaceDirection) => void;
  commitDocument: (fn: (document: EditorDocument) => EditorDocument) => void;
  textures: PixelTexture[];
  textureWidth: number;
  textureHeight: number;
}) {
  const mapping = selected.faces[face];
  const pixels = logicalUVToPixelRect(mapping.uv, textureWidth, textureHeight);
  const reset = () => commitDocument((doc) => updateCuboid(doc, selected.id, (node) => {
    const current = node.faces[face];
    if (current.rotation === 0 && current.uv.every((n, i) => n === [0, 0, 16, 16][i]))
      return node;
    const defaultFace: FaceUV = { uv: [0, 0, 16, 16], rotation: 0,
      textureId: current.textureId };
    return { ...node, faces: { ...node.faces, [face]: defaultFace } };
  }));
  return <section className="face-uv-section" aria-label="Face UV mapping">
    <div className="panel-section-heading">
      <h3>Face UV mapping</h3><span className="uv-section-chip">0–16 coordinates</span>
    </div>
    <p className="face-uv-description">
      Choose a cuboid face. Its UV region selects the pixels shown on that surface.
    </p>
    <div className="face-selector" role="group" aria-label="Choose cuboid face">
      {FACE_DIRECTIONS.map((direction) => <button key={direction} type="button"
        aria-pressed={face === direction}
        className={face === direction ? "selected" : ""}
        onClick={() => setFace(direction)}>{faceLabel(direction)}</button>)}
    </div>
    <label className="face-rotation-label">
      <span>Texture for {face} face</span>
      <select aria-label="Face texture asset" className="select-control"
        value={mapping.textureId} disabled={selected.locked}
        onChange={(event) => commitDocument((doc) =>
          assignFaceTexture(doc, selected.id, face, event.target.value))}>
        {textures.map(asset => <option key={asset.id} value={asset.id}>
          {asset.name} · {asset.width}×{asset.height}
        </option>)}
      </select>
    </label>
    <div className="form-caption">UV rectangle <span>edges</span></div>
    <div className="face-uv-grid" key={selected.id + ":" + face}>
      {(["U1", "V1", "U2", "V2"] as const).map((label, index) => {
        const field = index as 0 | 1 | 2 | 3;
        const paired = [2, 3, 0, 1][index] as 0 | 1 | 2 | 3;
        return <UVField key={label} label={label}
          disabled={selected.locked} value={mapping.uv[field]} opposite={mapping.uv[paired]}
          onCommit={(next) => commitDocument((doc) => updateFaceUV(doc, selected.id, face, field, next))}/>;
      })}
    </div>
    <label className="face-rotation-label">
      <span>Texture rotation</span>
      <select className="select-control" aria-label="Face texture rotation"
        disabled={selected.locked} value={mapping.rotation}
        onChange={(event) => {
          const rotation = Number(event.target.value) as FaceRotation;
          commitDocument((doc) => updateFaceRotation(doc, selected.id, face, rotation));
        }}>
        <option value={0}>0°</option>
        <option value={90}>90°</option>
        <option value={180}>180°</option>
        <option value={270}>270°</option>
      </select>
    </label>
    <div className="face-pixel-summary">
      <span>Pixel region</span>
      <strong>{pixels.map((v) => Number(v.toFixed(2))).join(" · ")}</strong>
    </div>
    <button type="button" className="face-reset" disabled={selected.locked}
      onClick={reset}><RotateCcw size={14}/>Reset this face to full texture</button>
    <p className="face-uv-note">
      A texture is shared by every face that references its pixels.
      The editor preview uses the authored mapping; Minecraft rendering remains unverified.
    </p>
  </section>;
}

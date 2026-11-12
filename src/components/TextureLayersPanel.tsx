import { useEffect, useState } from "react";
import type { EditorDocument, PixelTexture } from "../editor/domain";
import {
  MAX_RASTER_LAYERS, addRasterLayer, flattenTextureLayers, moveRasterLayer,
  removeRasterLayer, renameRasterLayer, selectRasterLayer,
  setRasterLayerOpacity, setRasterLayerVisibility
} from "../editor/layers";

interface Props {
  texture: PixelTexture;
  commit: (operation: (doc: EditorDocument) => EditorDocument) => void;
}

function LayerOpacity({ value, disabled, onApply }: {
  value: number; disabled: boolean; onApply: (value: number) => void;
}) {
  const current = String(Math.round(value * 100));
  const [draft, setDraft] = useState(current), [error, setError] = useState(false);
  useEffect(() => { setDraft(current); setError(false); }, [current]);
  const finish = (text: string) => {
    if (text.trim() === current) return;
    const next = Number(text);
    if (!text.trim() || !Number.isFinite(next) || next < 0 || next > 100) {
      setDraft(current); setError(true); return;
    }
    setError(false); setDraft(String(next)); onApply(next / 100);
  };
  return <label className="raster-opacity">
    <span>Opacity</span>
    <input type="number" aria-label="Active layer opacity" min={0} max={100} step={1}
      value={draft} aria-invalid={error} disabled={disabled}
      onChange={event => { setDraft(event.target.value); setError(false); }}
      onBlur={event => finish(event.currentTarget.value)}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.stopPropagation(); event.currentTarget.value = current;
          setDraft(current); setError(false); event.currentTarget.blur();
        }
      }}/>
    <span>%</span>
    {error && <small role="status">Enter 0–100.</small>}
  </label>;
}

function LayerName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const finish = (text: string) => {
    const next = text.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return <input className="raster-layer-name" aria-label={"Rename layer " + value}
    maxLength={100} value={draft} title="Layer name"
    onChange={event => setDraft(event.target.value)}
    onBlur={event => finish(event.currentTarget.value)}
    onKeyDown={event => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        event.stopPropagation(); event.currentTarget.value = value;
        setDraft(value); event.currentTarget.blur();
      }
    }}/>;
}

/** Editor-only layer source; Paint and game export always use its flattened PNG. */
export function TextureLayersPanel({ texture, commit }: Props) {
  const layers = texture.layers;
  const active = layers?.find(layer => layer.id === texture.activeLayerId) ?? null;
  const create = () => {
    const id = "layer_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const baseId = "layer_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    commit(doc => addRasterLayer(doc, texture.id, id, baseId));
  };
  return <section className="raster-layers-panel" aria-label="Texture layers">
    <div className="raster-layers-heading">
      <h3>Texture layers</h3>
      <span>{layers ? layers.length + "/" + MAX_RASTER_LAYERS : "Flattened"}</span>
    </div>
    {!layers ? <>
      <p className="raster-layer-help">Start an editable layer stack from this texture. The current pixels become the Background layer, and a transparent layer is selected for painting.</p>
      <button type="button" className="raster-layer-create"
        aria-label="Enable editable texture layers" onClick={create}>
        Enable layers
      </button>
    </> : <>
      <div className="raster-layer-list" role="group" aria-label="Editable texture layer order">
        {[...layers].reverse().map((layer, row) => {
          const index = layers.length - 1 - row;
          const selected = layer.id === texture.activeLayerId;
          return <div className={"raster-layer-row" + (selected ? " current" : "")}
            key={layer.id} data-layer-id={layer.id}>
            <button type="button" className="raster-layer-select"
              aria-label={"Select layer " + layer.name} aria-pressed={selected}
              onClick={() => commit(doc => selectRasterLayer(doc, texture.id, layer.id))}>
              <span aria-hidden="true">{selected ? "●" : "○"}</span>
            </button>
            <LayerName key={layer.id} value={layer.name}
              onCommit={name => commit(doc => renameRasterLayer(doc, texture.id, layer.id, name))}/>
            <button type="button" className="raster-layer-toggle"
              aria-label={(layer.visible ? "Hide layer " : "Show layer ") + layer.name}
              onClick={() => commit(doc => setRasterLayerVisibility(doc, texture.id, layer.id, !layer.visible))}>
              {layer.visible ? "Visible" : "Hidden"}
            </button>
            <span className="raster-layer-percent">{Math.round(layer.opacity * 100)}%</span>
            <button type="button" aria-label={"Move layer " + layer.name + " up"}
              disabled={index === layers.length - 1}
              onClick={() => commit(doc => moveRasterLayer(doc, texture.id, layer.id, "up"))}>↑</button>
            <button type="button" aria-label={"Move layer " + layer.name + " down"}
              disabled={index === 0}
              onClick={() => commit(doc => moveRasterLayer(doc, texture.id, layer.id, "down"))}>↓</button>
          </div>;
        })}
      </div>
      {active && <div className="raster-layer-detail">
        <LayerOpacity key={active.id} value={active.opacity}
          disabled={!active.visible}
          onApply={value => commit(doc =>
            setRasterLayerOpacity(doc, texture.id, active.id, value))}/>
        {!active.visible && <span role="status">The active layer is hidden; show it before painting.</span>}
        {active.opacity === 0 && <span role="status">The active layer is fully transparent; raise opacity before painting.</span>}
      </div>}
      <div className="raster-layer-actions">
        <button type="button" aria-label="Add texture layer"
          disabled={layers.length >= MAX_RASTER_LAYERS} onClick={create}>
          Add layer
        </button>
        <button type="button" aria-label="Delete active texture layer"
          disabled={layers.length <= 1 || !active}
          onClick={() => { if (active) commit(doc => removeRasterLayer(doc, texture.id, active.id)); }}>
          Delete layer
        </button>
        <button type="button" aria-label="Flatten editable texture layers"
          onClick={() => commit(doc => flattenTextureLayers(doc, texture.id))}>
          Flatten layers
        </button>
      </div>
      <p className="raster-layer-help">Layers are stored in editable .3dmc sources. Java resource packs and exported PNGs use the visible, opacity-adjusted flattened result. Flattening is undoable.</p>
    </>}
  </section>;
}

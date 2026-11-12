import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EditorDocument } from "../editor/domain";
import { addPackItem, editPackIndex, removePackItem, setItemHandAnimation,
  setPackItemDisplay, setPackItemResource } from "../pack/packSession";
import type { PackSession } from "../pack/packSession";
import { MAX_PACK_ITEMS, resourceKey } from "../pack/packDocument";
import { defaultItemDisplay, ITEM_DISPLAY_CONTEXTS, itemContextName,
  JAVA_1214_ITEM_TARGETS } from "../pack/itemProfile";
import type { ItemAxis, ItemDisplayContext, ItemDisplayTransform } from "../pack/itemProfile";
import { ItemDisplayPreview } from "./ItemDisplayPreview";

function ItemTextField({ label, value, onCommit }: {
  label: string; value: string; onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="pack-studio-field"><span>{label}</span>
    <input aria-label={label} value={draft} maxLength={128} spellCheck={false}
      onChange={event => setDraft(event.target.value)}
      onBlur={event => {
        const next = event.currentTarget.value.trim();
        if (next && next !== value) onCommit(next);
        // Revert an invalid attempted edit; a successful change updates value
        // through the canonical pack session and refreshes this controlled field.
        setDraft(value);
      }}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.stopPropagation(); event.currentTarget.value = value;
          setDraft(value); event.currentTarget.blur();
        }
      }}/>
  </label>;
}

function ItemNumberField({ label, value, minimum, maximum, onCommit }: {
  label: string; value: number; minimum: number; maximum: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(String(value)); setInvalid(false); }, [value]);
  const finish = (text: string) => {
    if (text.trim() === String(value)) return;
    const parsed = Number(text.trim());
    if (!text.trim() || !Number.isFinite(parsed) ||
        parsed < minimum || parsed > maximum) {
      setDraft(String(value)); setInvalid(true); return;
    }
    setInvalid(false); setDraft(String(parsed)); onCommit(parsed);
  };
  return <label className="pack-item-number">
    <span>{label}</span>
    <input type="number" aria-label={label} min={minimum} max={maximum} step="any"
      value={draft} aria-invalid={invalid}
      onChange={event => { setDraft(event.target.value); setInvalid(false); }}
      onBlur={event => finish(event.currentTarget.value)}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.stopPropagation(); event.currentTarget.value = String(value);
          setDraft(String(value)); setInvalid(false); event.currentTarget.blur();
        }
      }}/>
    {invalid && <small role="status">Use {minimum}–{maximum}; unchanged.</small>}
  </label>;
}

interface Props {
  session: PackSession;
  source: EditorDocument;
  onEdit: (operation: (current: PackSession) => PackSession) => void;
}

/**
 * Separate item identities and display contexts from the block model source.
 * Every operation is a validated pack session edit; no independent history.
 */
export function ItemStudioPanel({ session, source, onEdit }: Props) {
  const pack = session.present.pack;
  const activeModelId = pack.activeModelId;
  const items = (pack.items ?? []).filter(item => item.sourceModelId === activeModelId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [context, setContext] = useState<ItemDisplayContext>("gui");
  const selected = items.find(item => item.id === selectedId) ?? items[0] ?? null;
  const unavailable = new Set((pack.items ?? []).map(item => item.replaces.path));
  const nextTarget = JAVA_1214_ITEM_TARGETS.find(target => !unavailable.has(target));
  const add = () => {
    if (!nextTarget || (pack.items?.length ?? 0) >= MAX_PACK_ITEMS) return;
    const key = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const id = "item_" + key;
    onEdit(current => addPackItem(current, {
      id, sourceModelId: activeModelId,
      resource: { namespace: "3dmc", path: "item/" + nextTarget + "_" + key },
      replaces: { namespace: "minecraft", path: nextTarget },
      display: defaultItemDisplay(), handAnimationOnSwap: true
    }));
    setSelectedId(id);
  };
  const update = (operation: (itemId: string) => (current: PackSession) => PackSession) => {
    if (selected) onEdit(operation(selected.id));
  };
  const editValue = (field: keyof ItemDisplayTransform, axis: ItemAxis, value: number) =>
    update(id => current => setPackItemDisplay(current, id, context, field, axis, value));

  return <section className="pack-item-studio" aria-label="Java item assets">
    <div className="pack-item-studio-header">
      <div><h3>Java item authoring <span>{(pack.items ?? []).length}/{MAX_PACK_ITEMS}</span></h3>
        <p>Use the active editable model for an item visual. Its geometry and textures stay linked to the source.</p>
      </div>
      <button type="button" onClick={add} disabled={!nextTarget ||
        (pack.items?.length ?? 0) >= MAX_PACK_ITEMS}
        aria-label="Add Java item"><Plus size={15}/>Add item</button>
    </div>
    {items.length > 0 && <div className="pack-item-tabs" role="group" aria-label="Item assets for selected model">
      {items.map(item => <button type="button" key={item.id}
        aria-pressed={item.id === selected?.id}
        onClick={() => setSelectedId(item.id)}>
        {resourceKey(item.replaces)}
      </button>)}
    </div>}
    {!selected ? <p className="pack-studio-help">
      No item visual uses this model yet. Add an item to author its definition and preview inventory and hand transforms.
    </p> : <div className="pack-item-workspace" key={selected.id}>
      <div className="pack-item-fields">
        <label className="pack-item-select">Vanilla item visual to replace
          <select aria-label="Item replacement target" value={selected.replaces.path}
            onChange={event => update(id => current =>
              setPackItemResource(current, id, selected.resource,
                { namespace: "minecraft", path: event.target.value }))}>
            {JAVA_1214_ITEM_TARGETS.map(target => <option key={target} value={target}
              disabled={unavailable.has(target) && target !== selected.replaces.path}>
              minecraft:{target}
            </option>)}
          </select>
        </label>
        <div className="pack-studio-resource-fields">
          <ItemTextField label="Item model namespace" value={selected.resource.namespace}
            onCommit={namespace => update(id => current =>
              setPackItemResource(current, id,
                { ...selected.resource, namespace }, selected.replaces))}/>
          <ItemTextField label="Item model path" value={selected.resource.path}
            onCommit={path => update(id => current =>
              setPackItemResource(current, id,
                { ...selected.resource, path }, selected.replaces))}/>
        </div>
        <div className="pack-item-generated-paths">
          <span>Definition <code>assets/minecraft/items/{selected.replaces.path}.json</code></span>
          <span>Model <code>assets/{selected.resource.namespace}/models/{selected.resource.path}.json</code></span>
        </div>
        <label className="pack-item-hand-animation">
          <input type="checkbox" aria-label="Animate hand on item swap"
            checked={selected.handAnimationOnSwap}
            onChange={event => update(id => current =>
              setItemHandAnimation(current, id, event.target.checked))}/>
          Animate hand when switching items
        </label>
        <label className="pack-item-select">Display context
          <select aria-label="Item display context" value={context}
            onChange={event => setContext(event.target.value as ItemDisplayContext)}>
            {ITEM_DISPLAY_CONTEXTS.map(value =>
              <option value={value} key={value}>{itemContextName(value)}</option>)}
          </select>
        </label>
        <div className="pack-item-transform-grid">
          {(["rotation", "translation", "scale"] as const).map(field => {
            const minimum = field === "scale" ? 0.01 : field === "translation" ? -16 : -360;
            const maximum = field === "scale" ? 4 : field === "translation" ? 16 : 360;
            return <fieldset key={field} className="pack-item-transform">
              <legend>{field[0]!.toUpperCase() + field.slice(1)}</legend>
              <div>{(["X", "Y", "Z"] as const).map((axis, index) =>
                <ItemNumberField key={field + context + axis}
                  label={itemContextName(context) + " " + field + " " + axis}
                  minimum={minimum} maximum={maximum}
                  value={selected.display[context][field][index]}
                  onCommit={value => editValue(field, index as ItemAxis, value)}/>)}</div>
            </fieldset>;
          })}
        </div>
        <div className="pack-item-bottom-actions">
          <button type="button" aria-label="Reset item display transforms"
            onClick={() => update(id => current => editPackIndex(current, pack => ({
              ...pack, items: pack.items!.map(item => item.id === id ?
                { ...item, display: defaultItemDisplay() } : item)
            })))}>Reset display</button>
          <button type="button" aria-label="Remove Java item"
            onClick={() => update(id => current => removePackItem(current, id))}>
            <Trash2 size={14}/>Remove item
          </button>
        </div>
      </div>
      <div className="pack-item-preview-column">
        <h4>{itemContextName(context)} preview</h4>
        <ItemDisplayPreview document={source} display={selected.display[context]}/>
        <p className="pack-studio-help">
          Approximate local 3D transform preview. Rotate the camera to inspect the item.
          The exported JSON contains these numeric display values; in-game appearance is not yet verified.
        </p>
      </div>
    </div>}
    <p className="pack-studio-help">
      Java 1.21.4 items use a separate <code>items/</code> definition that points to a raw model.
      This replaces visuals for supported existing vanilla items, not item behavior or components.
      Other items and custom item_model components require a later format extension.
    </p>
  </section>;
}

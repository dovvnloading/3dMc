import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { strToU8, zipSync } from "fflate";
import type { EditorDocument } from "../editor/domain";
import { decodeBrowserPng } from "../editor/textureImport";
import type { DecodedTexture } from "../editor/textureImport";
import { inspectExternalModel, materializeExternalModel } from "../import/externalModel";
import type { ExternalModelPlan } from "../import/externalModel";
import { CreatorDialog } from "./CreatorDialog";

interface ModelFile { key: string; resource: string; name: string; text: string; bytes: Uint8Array; }
interface TextureFile { resource: string; name: string; image: DecodedTexture; bytes: Uint8Array; }
const safeStem = (name: string) => name.replace(/\.json$/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 70) || "model";
const sha256 = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))))
  .map(value => value.toString(16).padStart(2, "0")).join("");

export function ExternalModelDialog({ currentName, onOpen, onBackup, onClose }: {
  currentName: string; onOpen: (document: EditorDocument) => Promise<boolean>; onBackup: () => Promise<void>; onClose: () => void;
}) {
  const [models, setModels] = useState<ModelFile[]>([]), [rootKey, setRootKey] = useState("");
  const [images, setImages] = useState<Map<string, TextureFile>>(() => new Map());
  const [name, setName] = useState("Imported block model"), [acknowledged, setAcknowledged] = useState(false);
  const [reading, setReading] = useState(false), [opening, setOpening] = useState(false), [bundling, setBundling] = useState(false);
  const [error, setError] = useState<string | null>(null), [status, setStatus] = useState<string | null>(null);
  const [projectId] = useState(() => "external-" + crypto.randomUUID());
  const generation = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const busy = reading || opening || bundling;
  const inspected = useMemo<{ plan: ExternalModelPlan | null; error: string | null }>(() => {
    if (!models.length) return { plan: null, error: null };
    try {
      const root = models.find(model => model.key === rootKey);
      if (!root) return { plan: null, error: "Choose the root model to import." };
      return { plan: inspectExternalModel(models, root.resource), error: null };
    } catch (cause) { return { plan: null, error: cause instanceof Error ? cause.message : "Model validation failed." }; }
  }, [models, rootKey]);
  const prepared = useMemo<{ document: EditorDocument | null; error: string | null }>(() => {
    if (!inspected.plan) return { document: null, error: null };
    try {
      return { document: materializeExternalModel(inspected.plan,
        inspected.plan.textures.flatMap(resource => images.has(resource) ? [images.get(resource)!] : []), projectId, name).document, error: null };
    } catch (cause) { return { document: null, error: cause instanceof Error ? cause.message : "Texture validation failed." }; }
  }, [inspected.plan, images, projectId, name]);
  const readModels = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return;
    const request = ++generation.current; setReading(true); setError(null); setStatus(null); setAcknowledged(false);
    try {
      if (files.length > 16 || files.some(file => file.size > 1_000_000) || files.reduce((total, file) => total + file.size, 0) > 4_000_000)
        throw new Error("Choose at most 16 model JSON files, at most 1 MB each and 4 MB combined.");
      const decoded: ModelFile[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        decoded.push({ key: crypto.randomUUID(), resource: "imported:block/" + safeStem(file.name), name: file.name, text, bytes });
      }
      if (!alive.current || generation.current !== request) return;
      setModels(decoded); setRootKey(decoded[0]!.key); setImages(new Map()); setName(files[0]!.name.replace(/\.json$/i, "").slice(0, 100));
    } catch (cause) { if (alive.current && generation.current === request) setError(cause instanceof Error ? cause.message : "Could not read local model files."); }
    finally { if (alive.current && generation.current === request) setReading(false); }
  };
  const bindImage = async (resource: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const request = ++generation.current; setReading(true); setError(null); setStatus(null);
    try {
      const image = await decodeBrowserPng(file);
      if (image.width > 64 || image.height !== image.width || (image.width & (image.width - 1)) !== 0)
        throw new Error("Choose a square power-of-two PNG no larger than 64×64. External model import never silently resizes images.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!alive.current || generation.current !== request) return;
      setImages(current => new Map(current).set(resource, { resource, name: file.name, image, bytes }));
    } catch (cause) { if (alive.current && generation.current === request) setError(cause instanceof Error ? cause.message : "PNG binding failed."); }
    finally { if (alive.current && generation.current === request) setReading(false); }
  };
  const downloadOriginals = async () => {
    if (busy) return; setBundling(true); setError(null);
    try {
      const files: Record<string, Uint8Array> = Object.create(null);
      const manifest: Array<{ path: string; resource: string; originalName: string; sha256: string }> = [];
      for (const [index, source] of models.entries()) {
        const path = `models/source-${index + 1}.json`; files[path] = source.bytes;
        manifest.push({ path, resource: source.resource, originalName: source.name, sha256: await sha256(source.bytes) });
      }
      for (const [index, source] of [...images.values()].entries()) {
        const path = `textures/source-${index + 1}.png`; files[path] = source.bytes;
        manifest.push({ path, resource: source.resource, originalName: source.name, sha256: await sha256(source.bytes) });
      }
      files["source-manifest.json"] = strToU8(JSON.stringify({ format: "3dmc-original-import-sources", version: 1,
        root: models.find(model => model.key === rootKey)?.resource ?? null, files: manifest }, null, 2));
      const bytes = zipSync(files, { level: 0, mtime: new Date("1980-01-01T00:00:00Z") });
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
      const link = document.createElement("a"); link.href = url; link.download = "3dmc-original-model-sources.zip";
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setStatus("Original-source bundle download started. JSON and PNG bytes are unchanged; the manifest records their bindings and SHA-256 hashes.");
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Could not package original sources."); }
    finally { if (alive.current) setBundling(false); }
  };
  return <CreatorDialog title="Import external block model" kicker="LOCAL JAVA SUBSET · PREFLIGHT BEFORE REPLACEMENT" onClose={onClose} busy={opening || bundling} wide>
    <p className="creator-description">Supply explicit cuboid JSON and its local dependencies. Supported: six explicit faces, UV rectangles and quarter-turns, local parent inheritance and up to 16 square PNG sheets ≤64 px. Unsupported fields block import instead of disappearing. No assets are fetched from the network.</p>
    <label className="creator-file-control"><span>Choose model JSON files</span><input aria-label="External model JSON files" type="file" accept=".json,application/json" multiple disabled={busy} onChange={readModels}/></label>
    {!!models.length && <>
      <div className="external-model-sources" aria-label="Model resource bindings">{models.map(model => <label key={model.key}><span>{model.name}</span>
        <input aria-label={"Resource ID for " + model.name} value={model.resource} disabled={busy} spellCheck={false} onChange={event => {
          const value = event.target.value; setModels(current => current.map(item => item.key === model.key ? { ...item, resource: value } : item)); setAcknowledged(false);
        }}/></label>)}</div>
      <div className="external-model-options"><label><span>Root model</span><select aria-label="Root model" value={rootKey} disabled={busy} onChange={event => { setRootKey(event.target.value); setAcknowledged(false); }}>
        {models.map(model => <option key={model.key} value={model.key}>{model.name}</option>)}</select></label>
        <label><span>New project name</span><input aria-label="Imported project name" value={name} maxLength={100} disabled={busy} onChange={event => setName(event.target.value)}/></label></div>
    </>}
    {inspected.error && <p className="creator-error" role="alert">{inspected.error}</p>}
    {inspected.plan && <>
      <div className="external-summary"><span><strong>{inspected.plan.elements.length}</strong> cuboids</span><span><strong>{inspected.plan.chain.length}</strong> local model files in chain</span><span><strong>{inspected.plan.textures.length}</strong> texture dependencies</span></div>
      <h3>Bind the exact PNG resources</h3>
      <div className="external-texture-bindings">{inspected.plan.textures.map(resource => <label key={resource}><span>{resource}</span>
        <input type="file" aria-label={"PNG for " + resource} accept=".png,image/png" disabled={busy} onChange={event => void bindImage(resource, event)}/>
        <small>{images.has(resource) ? `${images.get(resource)!.name} · ${images.get(resource)!.image.width}×${images.get(resource)!.image.height} decoded RGBA` : "Missing local image"}</small>
      </label>)}</div>
      {prepared.error && <p className="creator-error" role="status">{prepared.error}</p>}
      {inspected.plan.unusedModels.length > 0 && <p className="creator-help">Unused local model files are not part of the editable copy: {inspected.plan.unusedModels.join(", ")}. They remain in the original-source bundle.</p>}
      <div className="external-notices">{inspected.plan.notices.map(notice => <p key={notice}>{notice}</p>)}</div>
      {prepared.document?.textures.some(texture => texture.pixels.some((value, index) => index % 4 === 3 && value !== 255)) &&
        <p className="creator-error">These images include transparency. Native RGBA is preserved after browser decoding, but Java pack export will remain blocked until the textures are opaque.</p>}
      <label className="creator-acknowledgment"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={event => setAcknowledged(event.target.checked)}/>
        <span>I understand this creates a resolved editable copy, not a lossless copy of the original parent links or resource-pack structure.</span></label>
    </>}
    {reading && <p role="status">Validating local source bytes…</p>}
    {error && <p className="creator-error" role="alert">{error}</p>}
    {status && <p className="creator-success" role="status">{status}</p>}
    <p className="creator-help">Import replaces “{currentName}” only after confirmation. Browser PNG decoding can normalize hidden RGB values; the original-source bundle retains the original compressed files.</p>
    <div className="creator-dialog-actions"><button type="button" disabled={busy} onClick={() => void onBackup()}>Download current project</button>
      <button type="button" disabled={busy || !models.length} onClick={() => void downloadOriginals()}>Download original sources</button>
      <button type="button" disabled={opening || bundling} onClick={onClose}>Cancel import</button>
      <button type="button" className="creator-primary" disabled={busy || !prepared.document || !acknowledged} onClick={async () => {
        const imported = prepared.document; if (!imported || busy) return;
        setOpening(true); setError(null);
        try { if (await onOpen(imported)) onClose(); else setError("The workspace could not be safely replaced. No source files were modified."); }
        catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Import did not complete."); }
        finally { if (alive.current) setOpening(false); }
      }}>{opening ? "Opening verified source…" : "Import resolved copy"}</button></div>
  </CreatorDialog>;
}

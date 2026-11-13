import { useEffect, useRef, useState } from "react";
import { Download, FolderOpen, Layers3, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { ChangeEvent } from "react";
import type { EditorDocument } from "../editor/domain";
import { renameProject } from "../editor/domain";
import { nativeFilename } from "../editor/nativeArchive";
import { MAX_NATIVE_PACK_BYTES } from "../editor/nativePackArchive";
import { readImportFile, runImportJobInWorker } from "../editor/importJobs";
import { ImportProgress } from "./ImportProgress";
import type { ImportProgressState } from "./ImportProgress";
import { buildPackZipInWorker } from "../editor/packJobs";
import { startBrowserDownload } from "../editor/exportJobs";
import { indexLegacyProject, resourceKey } from "../pack/packDocument";
import { JAVA_1214_REPLACEMENTS } from "../pack/javaPackBuilder";
import { describeTextureDependencies, searchPackModels } from "../pack/assetBrowser";
import {
  activePackDocument, activePackModel, addPackModel, createPackSession,
  editActivePackDocument, editPackIndex, redoPackSession, removePackModel,
  selectPackModel, setModelResource, setTextureResource, undoPackSession
} from "../pack/packSession";
import type { PackSession } from "../pack/packSession";
import { ModalDialog } from "./ModalDialog";
import { ItemStudioPanel } from "./ItemStudioPanel";
import "./pack-studio.css";

interface Props {
  source: EditorDocument;
  onClose: () => void;
  session?: PackSession;
  onChange?: (session: PackSession) => void;
  onOpenPack?: (session: PackSession) => Promise<boolean>;
}


const makeId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** One blur/Enter = one validated undoable metadata edit. Escape cancels. */
function PackField({ label, value, onCommit, maxLength = 128 }: {
  label: string; value: string; onCommit: (next: string) => void; maxLength?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="pack-studio-field"><span>{label}</span>
    <input type="text" aria-label={label} value={draft} maxLength={maxLength}
      spellCheck={false}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) { onCommit(next); setDraft(value); }
      }}
      onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { event.stopPropagation(); setDraft(value); }
      }}/>
  </label>;
}

/**
 * The asset manager of the same pack session used by the live editor.
 * Pack names, models and resource paths commit through validated pack history.
 * Opening a new pack replaces the entire workspace, never a single asset.
 */
export function PackStudioDialog({ source, onClose, session: external, onChange, onOpenPack }: Props) {
  const [local, setLocal] = useState<PackSession>(
    () => createPackSession(indexLegacyProject(source), [source])
  );
  const session = external ?? local;
  const setSession = onChange ?? setLocal;
  const [lastSavedRevision, setLastSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openProgress, setOpenProgress] = useState<ImportProgressState | null>(null);
  const [message, setMessage] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [pending, setPending] = useState<PackSession | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const jobAbortRef = useRef<AbortController | null>(null);
  const openAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    jobAbortRef.current?.abort();
    openAbortRef.current?.abort();
  }, []);

  const pack = session.present.pack;
  const active = activePackModel(session);
  const activeDoc = activePackDocument(session);
  const dirty = session.revision !== lastSavedRevision;
  const visibleModels = searchPackModels(pack, session.present.sources, modelQuery);

  const change = (operation: (current: PackSession) => PackSession) => {
    try {
      const next = operation(sessionRef.current);
      sessionRef.current = next;
      setSession(next);
      setMessage("");
      setConfirmClose(false);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pack operation was rejected. No assets changed.");
      return false;
    }
  };

  const close = () => {
    if (external) { onClose(); return; }
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const cancelOpen = () => {
    if (!openAbortRef.current) return;
    openAbortRef.current.abort();
    openAbortRef.current = null;
    setOpening(false);
    setOpenProgress(null);
    setMessage("Import canceled. The current pack and models were not changed.");
  };

  const prepareOpen = async (file: File, kind: "pack" | "single") => {
    openAbortRef.current?.abort();
    const controller = new AbortController();
    openAbortRef.current = controller;
    const captured = sessionRef.current;
    const current = () => openAbortRef.current === controller && !controller.signal.aborted;
    setOpening(true);
    setPending(null);
    setOpenProgress({ name: file.name, stage: "reading", loaded: 0, total: file.size });
    setMessage("");
    try {
      if (kind === "pack" && file.size > MAX_NATIVE_PACK_BYTES)
        throw new Error("The source pack exceeds the 12 MB limit. Nothing was replaced.");
      if (kind === "single" && file.size > 3_000_000)
        throw new Error("The single-model source exceeds the 3 MB import limit.");
      const bytes = await readImportFile(file, controller.signal, (loaded, total) => {
        if (current()) setOpenProgress({ name: file.name, stage: "reading", loaded, total });
      });
      if (!current()) return;
      setOpenProgress({ name: file.name, stage: "validating", loaded: file.size, total: file.size });
      const result = await runImportJobInWorker({ kind, bytes }, controller.signal);
      if (!current()) return;
      if (sessionRef.current !== captured) {
        setMessage("The pack changed during import. Choose the file again; no newer edits were replaced.");
        return;
      }
      if (kind === "pack" && result.kind === "pack") {
        setPending(createPackSession(result.project.pack, result.project.sources));
        setMessage("Review the pack before replacing the current Pack Studio session.");
      } else if (kind === "single" && result.kind === "document") {
        addSource(result.document);
      } else {
        throw new Error("The import worker returned an unexpected source type.");
      }
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : "The selected source could not be imported.");
    } finally {
      if (openAbortRef.current === controller) {
        openAbortRef.current = null;
        setOpening(false);
        setOpenProgress(null);
      }
    }
  };
  const choosePack = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void prepareOpen(file, "pack");
  };

  const loadPending = async () => {
    if (!pending) return;
    if (onOpenPack && !(await onOpenPack(pending))) return;
    sessionRef.current = pending;
    if (!onOpenPack) setSession(pending);
    setLastSavedRevision(pending.revision);
    setPending(null);
    setMessage("Source pack loaded. All models and textures were retained.");
    setConfirmClose(false);
  };

  const nextReplacement = () => {
    const names = new Set(pack.models.map(model => model.replaces.path));
    return JAVA_1214_REPLACEMENTS.find(name => !names.has(name)) ?? null;
  };

  const addSource = (document: EditorDocument) => {
    const replacement = nextReplacement();
    if (!replacement) {
      setMessage("This Java 1.21.4 experiment supports up to eight distinct block replacements per pack.");
      return;
    }
    if (document.target.candidateRelease !== "1.21.4") {
      setMessage("Choose a Java 1.21.4 source project. This pack format does not export the 26.3 target.");
      return;
    }
    const id = makeId();
    // An imported or duplicated model gets a new source identity; no
    // source texture IDs, RGBA bytes or native geometry are discarded.
    const copy: EditorDocument = { ...document, id: "source_" + id };
    const modelId = "model_" + id;
    const textureAssets = copy.textures.map((texture, index) => ({
      id: "asset_" + id + "_" + index,
      sourceDocumentId: copy.id,
      sourceTextureId: texture.id,
      resource: {
        namespace: "3dmc",
        path: "block/asset_" + id + "_" + index
      }
    }));
    const model = {
      id: modelId, sourceDocumentId: copy.id,
      resource: { namespace: "3dmc", path: "block/model_" + id },
      replaces: { namespace: "minecraft", path: replacement },
      textures: textureAssets.map(texture => ({
        sourceTextureId: texture.sourceTextureId, textureAssetId: texture.id
      })),
      provenance: "editor" as const
    };
    change(current => addPackModel(current, copy, model, textureAssets));
  };

  const addFromFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void prepareOpen(file, "single");
  };

  const save = async () => {
    if (jobAbortRef.current) return;
    const controller = new AbortController();
    jobAbortRef.current = controller;
    setSaving(true);
    const captured = sessionRef.current;
    try {
      const bytes = await buildPackZipInWorker("native",
        captured.present.pack, captured.present.sources, controller.signal);
      if (controller.signal.aborted) return;
      startBrowserDownload({
        filename: nativeFilename(captured.present.pack.name),
        mimeType: "application/zip",
        content: bytes
      });
      if (sessionRef.current === captured) setLastSavedRevision(captured.revision);
      setMessage("Pack-aware .3dmc source download started. Keep it as your editable backup.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Could not prepare the source pack.");
    } finally {
      if (jobAbortRef.current === controller) jobAbortRef.current = null;
      setSaving(false);
    }
  };

  const exportPack = async () => {
    if (jobAbortRef.current) return;
    const controller = new AbortController();
    jobAbortRef.current = controller;
    setExporting(true);
    const captured = sessionRef.current;
    try {
      const bytes = await buildPackZipInWorker("java",
        captured.present.pack, captured.present.sources, controller.signal);
      if (controller.signal.aborted) return;
      const sourcePack = captured.present.pack;
      const slug = sourcePack.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 55) || "pack";
      startBrowserDownload({
        filename: slug + "-java-1.21.4-experimental.zip",
        mimeType: "application/zip", content: bytes
      });
      setMessage(sourcePack.exportBlockVisuals === false ?
        "Item-only experimental ZIP download started. No vanilla blockstates were replaced." :
        "Experimental ZIP download started. Review the block and item visuals in Minecraft Java 1.21.4.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Export blocked. No source assets changed.");
    } finally {
      if (jobAbortRef.current === controller) jobAbortRef.current = null;
      setExporting(false);
    }
  };

  const cancelPackJob = () => {
    if (!jobAbortRef.current) return;
    jobAbortRef.current.abort();
    setMessage("Pack preparation canceled. No download was started.");
  };

  const textureList = active.textures.map(binding => {
    const asset = pack.textures.find(item => item.id === binding.textureAssetId)!;
    const sourceTexture = activeDoc.textures.find(item => item.id === binding.sourceTextureId)!;
    return { asset, sourceTexture };
  });

  return <ModalDialog className="pack-studio-dialog" labelledBy="pack-studio-title" onCancel={close}>
    <div className="pack-studio-head">
      <div>
        <span className="export-kicker">JAVA 1.21.4 · EXPERIMENTAL PACK WORKSPACE</span>
        <h2 id="pack-studio-title"><Layers3 size={20}/>Pack Studio</h2>
        <p>Manage multiple editable models in one workspace. Close this panel and choose a model in Scene to edit it in 3D.</p>
      </div>
      <button className="text-button quiet" type="button" onClick={close}>Close</button>
    </div>

    <div className="pack-studio-naming">
      <PackField label="Pack name" maxLength={100} value={pack.name}
        onCommit={name => change(current => editPackIndex(current, index => ({
          ...index, name
        })))} />
      <span>Saved as one portable .3dmc pack source; source model names are independent.</span>
    </div>
    <div className="pack-studio-tools">
      <label className="pack-studio-export-blocks">
        <input type="checkbox" aria-label="Also replace vanilla block visuals"
          checked={pack.exportBlockVisuals !== false}
          disabled={!(pack.items?.length) && pack.exportBlockVisuals !== false}
          onChange={event => {
            const enabled = event.currentTarget.checked;
            change(current => editPackIndex(current, index => ({
              ...index, exportBlockVisuals: enabled
            })));
          }}/>
        Also replace vanilla blocks
      </label>
      <input ref={fileRef} type="file" hidden accept=".3dmc,application/zip"
        onChange={event => void choosePack(event)}/>
      <button type="button" disabled={opening} onClick={() => fileRef.current?.click()}>
        <FolderOpen size={15}/>Open source pack
      </button>
      <button type="button" disabled={saving || exporting} onClick={() => void save()}>
        <Save size={15}/>{saving ? "Preparing source…" : "Save pack .3dmc"}
      </button>
      <button type="button" disabled={saving || exporting} onClick={() => void exportPack()}>
        <Download size={15}/>{exporting ? "Building ZIP…" : "Export Java ZIP"}
      </button>
      {(saving || exporting) && <button type="button" onClick={cancelPackJob}>Cancel preparation</button>}
      <button type="button" disabled={!session.past.length}
        onClick={() => change(undoPackSession)} aria-label="Undo pack operation">Undo</button>
      <button type="button" disabled={!session.future.length}
        onClick={() => change(redoPackSession)} aria-label="Redo pack operation">Redo</button>
    </div>
    {openProgress && <ImportProgress progress={openProgress} onCancel={cancelOpen} inline/>}

    {pending && <div className="pack-studio-confirm" role="group" aria-label="Confirm source pack replacement">
      <p>Replace this Pack Studio session with <strong>{pending.present.pack.name}</strong> ({pending.present.pack.models.length} models)? Download a source backup first if needed.</p>
      <button type="button" onClick={() => void loadPending()}>Load selected pack</button>
      <button type="button" onClick={() => { setPending(null); setMessage(""); }}>Cancel</button>
    </div>}

    <div className="pack-studio-layout">
      <section className="pack-studio-models" aria-label="Pack models">
        <h3>Models <span>{pack.models.length}/{JAVA_1214_REPLACEMENTS.length} supported replacements</span></h3>
        <div className="pack-studio-search">
          <Search size={15} aria-hidden="true"/>
          <input type="search" aria-label="Search pack models" placeholder="Model, path, texture…"
            maxLength={120} value={modelQuery} onChange={event => setModelQuery(event.target.value)}/>
          {modelQuery && <button type="button" aria-label="Clear pack search"
            onClick={() => setModelQuery("")}><X size={15}/></button>}
        </div>
        <p className="pack-studio-result-count" role="status">
          {modelQuery ? visibleModels.length + " of " + pack.models.length + " models match" :
            pack.models.length + " model" + (pack.models.length === 1 ? "" : "s") + " in this pack"}
        </p>
        <div role="listbox" aria-label="Pack model assets">
          {visibleModels.map(model => {
            const item = session.present.sources.find(doc => doc.id === model.sourceDocumentId)!;
            return <button type="button" role="option" aria-selected={model.id === pack.activeModelId}
              className={model.id === pack.activeModelId ? "active" : ""} key={model.id}
              onClick={() => change(current => selectPackModel(current, model.id))}>
              <strong>{item.name}</strong>
              <small>{resourceKey(model.replaces)} · {item.cuboids.length} elements</small>
            </button>;
          })}
          {visibleModels.length === 0 && <p className="pack-studio-empty">
            No models match your search. The active model and source data are unchanged.
          </p>}
        </div>
        <input ref={addFileRef} type="file" hidden accept=".3dmc,application/zip"
          onChange={event => void addFromFile(event)}/>
        <button type="button" disabled={opening || !nextReplacement()}
          onClick={() => addSource({ ...activeDoc, name: activeDoc.name.slice(0, 95) + " copy" })}><Plus size={14}/>Duplicate model</button>
        <button type="button" disabled={opening || !nextReplacement()}
          onClick={() => addFileRef.current?.click()}><Plus size={14}/>Add model from .3dmc</button>
        <button type="button" disabled={pack.models.length === 1}
          onClick={() => change(current => removePackModel(current, active.id))}>
          <Trash2 size={14}/>Remove selected model
        </button>
      </section>

      <section className="pack-studio-details" aria-label="Selected pack model">
        <h3>{activeDoc.name}</h3>
        {external && <button className="pack-studio-edit-model" type="button" onClick={onClose}>
          Edit selected model in 3D
        </button>}
        {modelQuery && !visibleModels.some(model => model.id === active.id) &&
          <p className="pack-studio-help">The selected model is hidden by the search filter. Clear the search to see it in the list.</p>}
        <PackField label="Model name" maxLength={100} value={activeDoc.name}
          onCommit={name => change(current => editActivePackDocument(
            current, source => renameProject(source, name)))}/>
        <p>Source model ID: <code>{activeDoc.id}</code></p>
        <p>Resource: <code>{resourceKey(active.resource)}</code></p>
        <div className="pack-studio-resource-fields">
          <PackField label="Model resource namespace" maxLength={64}
            value={active.resource.namespace}
            onCommit={namespace => change(current => setModelResource(current, active.id,
              { ...active.resource, namespace }, active.replaces))}/>
          <PackField label="Model resource path" maxLength={128}
            value={active.resource.path}
            onCommit={path => change(current => setModelResource(current, active.id,
              { ...active.resource, path }, active.replaces))}/>
        </div>
        <p>Replaces: <code>{resourceKey(active.replaces)}</code></p>
        <label>Replacement target
          <select aria-label="Pack replacement target" value={active.replaces.path}
            onChange={event => change(current => setModelResource(
              current, active.id, active.resource,
              { namespace: "minecraft", path: event.target.value }))}>
            {JAVA_1214_REPLACEMENTS.map(target =>
              <option key={target} value={target}>minecraft:{target}</option>)}
          </select>
        </label>
        <p className="pack-studio-help">Each replacement target must be unique. With block replacement disabled above, block models remain editable source assets but their vanilla blockstates are not exported. This resource pack changes visuals, not gameplay or collision.</p>
        <h4>Texture dependencies</h4>
        <div className="pack-studio-textures">
          {textureList.map(({ asset, sourceTexture }) => {
            const usage = describeTextureDependencies(activeDoc, sourceTexture.id);
            return <div key={asset.id}><strong>{sourceTexture.name}</strong><span>
              {sourceTexture.width}×{sourceTexture.height} · {resourceKey(asset.resource)}
            </span>
              <span className="pack-studio-usage" aria-label={"Texture dependencies " + sourceTexture.name}>
                {usage.faceCount === 0 ? "Not assigned to painted faces" :
                  usage.faceCount + " painted " + (usage.faceCount === 1 ? "face" : "faces") +
                  " across " + usage.cuboidCount + " " +
                  (usage.cuboidCount === 1 ? "element" : "elements")}
              </span>
              {usage.uses.length > 0 && <ul className="pack-studio-usage-list">
                {usage.uses.slice(0, 3).map(item =>
                  <li key={item.cuboidId}>{item.cuboidName}: {item.faces.join(", ")}</li>)}
                {usage.uses.length > 3 && <li>+{usage.uses.length - 3} more elements</li>}
              </ul>}
              <div className="pack-studio-resource-fields">
                <PackField label={"Texture namespace " + sourceTexture.name}
                  maxLength={64} value={asset.resource.namespace}
                  onCommit={namespace => change(current => setTextureResource(
                    current, asset.id, { ...asset.resource, namespace }))}/>
                <PackField label={"Texture path " + sourceTexture.name}
                  value={asset.resource.path}
                  onCommit={path => change(current => setTextureResource(
                    current, asset.id, { ...asset.resource, path }))}/>
              </div>
            </div>;
          })}
        </div>
        <p className="pack-studio-help">Pack archive saves all source models, names, RGBA pixels and UV bindings. The main editor Save now downloads the complete pack source.</p>
      </section>
    </div>
    <ItemStudioPanel session={session} source={activeDoc} onEdit={change}/>
    <div className="pack-studio-foot">
      <span aria-live="polite">{message || (external ? "All models share live editing, Undo, and local recovery. Download a .3dmc source backup to keep a portable copy." : dirty ? "Unsaved Pack Studio changes. Save your .3dmc source pack." : "Pack Studio source is ready.")}</span>
      {!external && confirmClose && <div className="pack-studio-confirm" role="group" aria-label="Confirm discard unsaved pack">
        <strong>Unsaved pack changes will be lost.</strong>
        <button type="button" onClick={onClose}>Discard and close</button>
        <button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button>
      </div>}
    </div>
  </ModalDialog>;
}

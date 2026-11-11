import { useRef, useState } from "react";
import { Download, FolderOpen, Layers3, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import type { EditorDocument } from "../editor/domain";
import { decodeNativeProject, nativeFilename } from "../editor/nativeArchive";
import { decodeNativePack, encodeNativePack, MAX_NATIVE_PACK_BYTES } from "../editor/nativePackArchive";
import { startBrowserDownload } from "../editor/exportJobs";
import { indexLegacyProject, resourceKey } from "../pack/packDocument";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import {
  activePackDocument, activePackModel, addPackModel, createPackSession, editPackIndex,
  redoPackSession, removePackModel, selectPackModel, setModelResource, setTextureResource,
  undoPackSession
} from "../pack/packSession";
import type { PackSession } from "../pack/packSession";
import { ModalDialog } from "./ModalDialog";
import "./pack-studio.css";

interface Props {
  source: EditorDocument;
  onClose: () => void;
}

const makeId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/**
 * An isolated pack assembly workspace. The current editor remains unchanged.
 * Opening and saving a pack is all-or-nothing; it never flattens or silently
 * imports v3 into the single-model editor or its local recovery checkpoints.
 */
export function PackStudioDialog({ source, onClose }: Props) {
  const [session, setSession] = useState<PackSession>(
    () => createPackSession(indexLegacyProject(source), [source])
  );
  const [lastSavedRevision, setLastSavedRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [pending, setPending] = useState<PackSession | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addFileRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const pack = session.present.pack;
  const active = activePackModel(session);
  const activeDoc = activePackDocument(session);
  const dirty = session.revision !== lastSavedRevision;

  const change = (operation: (current: PackSession) => PackSession) => {
    try {
      const next = operation(sessionRef.current);
      sessionRef.current = next;
      setSession(next);
      setMessage("");
      setConfirmClose(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pack operation was rejected. No assets changed.");
    }
  };

  const close = () => {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  };

  const choosePack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_NATIVE_PACK_BYTES) {
      setMessage("The source pack exceeds the 12 MB limit. Nothing was replaced.");
      return;
    }
    setOpening(true);
    try {
      const opened = await decodeNativePack(new Uint8Array(await file.arrayBuffer()));
      setPending(createPackSession(opened.pack, opened.sources));
      setMessage("Review the pack before replacing the current Pack Studio session.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The pack could not be opened.");
    } finally {
      setOpening(false);
    }
  };

  const loadPending = () => {
    if (!pending) return;
    sessionRef.current = pending;
    setSession(pending);
    setLastSavedRevision(pending.revision);
    setPending(null);
    setMessage("Source pack loaded. All models and textures were retained.");
    setConfirmClose(false);
  };

  const nextReplacement = () => {
    const names = new Set(pack.models.map(model => model.replaces.path));
    return ["diamond_block", "iron_block"].find(name => !names.has(name)) ?? null;
  };

  const addSource = (document: EditorDocument) => {
    const replacement = nextReplacement();
    if (!replacement) {
      setMessage("This Java 1.21.4 experiment supports two non-conflicting block replacements per pack.");
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

  const addFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 3_000_000) {
      setMessage("The single-model source exceeds the 3 MB import limit.");
      return;
    }
    setOpening(true);
    try {
      const document = await decodeNativeProject(new Uint8Array(await file.arrayBuffer()));
      addSource(document);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The source model could not be imported.");
    } finally {
      setOpening(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    const captured = sessionRef.current;
    try {
      const bytes = await encodeNativePack(captured.present.pack, captured.present.sources);
      startBrowserDownload({
        filename: nativeFilename(captured.present.pack.name),
        mimeType: "application/zip",
        content: bytes
      });
      if (sessionRef.current === captured) setLastSavedRevision(captured.revision);
      setMessage("Pack-aware .3dmc source download started. Keep it as your editable backup.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare the source pack.");
    } finally {
      setSaving(false);
    }
  };

  const exportPack = () => {
    try {
      const result = makeIndexedJava1214Pack(
        sessionRef.current.present.pack, sessionRef.current.present.sources);
      const slug = pack.name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 55) || "pack";
      startBrowserDownload({
        filename: slug + "-java-1.21.4-experimental.zip",
        mimeType: "application/zip", content: result.zip
      });
      setMessage("Experimental ZIP download started. Check both replacements in Minecraft Java 1.21.4.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export blocked. No source assets changed.");
    }
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
        <p>Assemble and preserve multiple editable models without replacing the open editor. Live editing of secondary models is a later integration step.</p>
      </div>
      <button className="text-button quiet" type="button" onClick={close}>Close</button>
    </div>

    <div className="pack-studio-tools">
      <input ref={fileRef} type="file" hidden accept=".3dmc,application/zip"
        onChange={event => void choosePack(event)}/>
      <button type="button" disabled={opening} onClick={() => fileRef.current?.click()}>
        <FolderOpen size={15}/>Open source pack
      </button>
      <button type="button" disabled={saving} onClick={() => void save()}>
        <Save size={15}/>{saving ? "Saving…" : "Save pack .3dmc"}
      </button>
      <button type="button" onClick={exportPack}><Download size={15}/>Export Java ZIP</button>
      <button type="button" disabled={!session.past.length}
        onClick={() => change(undoPackSession)} aria-label="Undo pack operation">Undo</button>
      <button type="button" disabled={!session.future.length}
        onClick={() => change(redoPackSession)} aria-label="Redo pack operation">Redo</button>
    </div>

    {pending && <div className="pack-studio-confirm" role="group" aria-label="Confirm source pack replacement">
      <p>Replace this Pack Studio session with <strong>{pending.present.pack.name}</strong> ({pending.present.pack.models.length} models)? Download a source backup first if needed.</p>
      <button type="button" onClick={loadPending}>Load selected pack</button>
      <button type="button" onClick={() => { setPending(null); setMessage(""); }}>Cancel</button>
    </div>}

    <div className="pack-studio-layout">
      <section className="pack-studio-models" aria-label="Pack models">
        <h3>Models <span>{pack.models.length}/2 supported replacements</span></h3>
        <div role="listbox" aria-label="Pack model assets">
          {pack.models.map(model => {
            const item = session.present.sources.find(doc => doc.id === model.sourceDocumentId)!;
            return <button type="button" role="option" aria-selected={model.id === pack.activeModelId}
              className={model.id === pack.activeModelId ? "active" : ""} key={model.id}
              onClick={() => change(current => selectPackModel(current, model.id))}>
              <strong>{item.name}</strong>
              <small>{resourceKey(model.replaces)} · {item.cuboids.length} elements</small>
            </button>;
          })}
        </div>
        <input ref={addFileRef} type="file" hidden accept=".3dmc,application/zip"
          onChange={event => void addFromFile(event)}/>
        <button type="button" disabled={opening || !nextReplacement()}
          onClick={() => addSource(activeDoc)}><Plus size={14}/>Duplicate model</button>
        <button type="button" disabled={opening || !nextReplacement()}
          onClick={() => addFileRef.current?.click()}><Plus size={14}/>Add model from .3dmc</button>
        <button type="button" disabled={pack.models.length === 1}
          onClick={() => change(current => removePackModel(current, active.id))}>
          <Trash2 size={14}/>Remove selected model
        </button>
      </section>

      <section className="pack-studio-details" aria-label="Selected pack model">
        <h3>{activeDoc.name}</h3>
        <p>Source model ID: <code>{activeDoc.id}</code></p>
        <p>Resource: <code>{resourceKey(active.resource)}</code></p>
        <p>Replaces: <code>{resourceKey(active.replaces)}</code></p>
        <label>Replacement target
          <select aria-label="Pack replacement target" value={active.replaces.path}
            onChange={event => change(current => setModelResource(
              current, active.id, active.resource,
              { namespace: "minecraft", path: event.target.value }))}>
            <option value="diamond_block">minecraft:diamond_block</option>
            <option value="iron_block">minecraft:iron_block</option>
          </select>
        </label>
        <p className="pack-studio-help">The two supported replacement paths must be unique. This resource pack changes visuals, not gameplay or collision.</p>
        <h4>Texture dependencies</h4>
        <div className="pack-studio-textures">
          {textureList.map(({ asset, sourceTexture }) =>
            <div key={asset.id}><strong>{sourceTexture.name}</strong><span>
              {sourceTexture.width}×{sourceTexture.height} · {resourceKey(asset.resource)}
            </span></div>)}
        </div>
        <p className="pack-studio-help">Pack archive saves all source models, names, RGBA pixels and UV bindings. Standard editor Save still downloads its current single-model project.</p>
      </section>
    </div>
    <div className="pack-studio-foot">
      <span aria-live="polite">{message || (dirty ? "Unsaved Pack Studio changes. Save your .3dmc source pack." : "Pack Studio source is ready.")}</span>
      {confirmClose && <div className="pack-studio-confirm" role="group" aria-label="Confirm discard unsaved pack">
        <strong>Unsaved pack changes will be lost.</strong>
        <button type="button" onClick={onClose}>Discard and close</button>
        <button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button>
      </div>}
    </div>
  </ModalDialog>;
}

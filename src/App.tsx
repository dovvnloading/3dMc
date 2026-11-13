import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, Box, ChevronDown, Copy, Download, Eraser, Eye, EyeOff,
  FolderOpen, FilePlus2, ImagePlus, PackageOpen, Info, Layers3, Lock, LockOpen, Maximize2, PanelLeftClose, PanelRightClose,
  MousePointer2, Move3D, Paintbrush, PaintBucket, Pipette, Plus, Redo2, RotateCcw,
  Save, Search, Settings2, SlidersHorizontal, Trash2, Undo2, Minus, Square
} from "lucide-react";
import {
  activeTexture, addTexture, affectedFaces, textureById, removeTexture, renameTexture, selectTexture,
  addCuboid, createSampleDocument, renameCuboid, renameProject, setAxisValue, setJavaCandidateRelease,
  setMaterialColor, setTexturePixels, toggleFlag
} from "./editor/domain";
import type { Cuboid, EditorDocument, EditorGroup, FaceDirection, Vec3 } from "./editor/domain";
import { commit, createHistory, redo, undo } from "./editor/history";
import type { History } from "./editor/history";
import { commitSelectionGesture, deleteSelection, duplicateSelection, repeatSelection, reconcileSelection, selectAt, selectOnly } from "./editor/selection";
import type { Selection, SelectionGesture, SelectionModifiers } from "./editor/selection";
import { SelectionInspector } from "./components/SelectionInspector";
import { SelectionArrayTools } from "./components/SelectionArrayTools";
import { MoveSnapControl } from "./components/MoveSnapControl";
import { groupSelection, renameGroup, ungroup } from "./editor/groups";
import { ExportIssueList } from "./components/ExportIssueList";
import { PackStudioDialog } from "./components/PackStudioDialog";
import { CreatorTools } from "./components/CreatorTools";
import "./components/selection.css";
import { nativeFilename } from "./editor/nativeArchive";
import { MAX_NATIVE_PACK_BYTES } from "./editor/nativePackArchive";
import { readImportFile, runImportJobInWorker } from "./editor/importJobs";
import { ImportProgress } from "./components/ImportProgress";
import type { ImportProgressState } from "./components/ImportProgress";
import { buildPackZipInWorker } from "./editor/packJobs";
import type { NativePackProject } from "./editor/nativePackArchive";
import { inspectIndexedJava1214Pack } from "./pack/exportPreflight";
import { activePackDocument, createPackSession, redoPackSession, selectPackModel, undoPackSession } from "./pack/packSession";
import type { PackSession } from "./pack/packSession";
import { advancePackFromEditor, packHistoryView, upgradeEditorHistory } from "./pack/editorBridge";
import { prepareJavaPackDownload, prepareLegacyJsonDownload, prepareNativeProjectDownload,
  prepareSixFaceDiagnosticDownload, prepareTexturePngDownload, startBrowserDownload } from "./editor/exportJobs";
import { makeNewProject } from "./editor/templates";
import { PRIMITIVE_PRESETS, addPrimitive, moveCuboid, setCuboidMaterial } from "./editor/primitives";
import type { PrimitiveId } from "./editor/primitives";
import type { NewProjectOptions } from "./editor/templates";
import { claimRecoveryWriter, readAnyRecovery, renewRecoveryWriter, rotateRecoveryWriter, saveRecovery, savePackRecovery, RecoveryOwnershipLost, RecoverySnapshotTooLarge } from "./editor/recovery";
import type { AnyRecoveryCandidate, RecoveryLease } from "./editor/recovery";
import { floodFill, readHex } from "./editor/pixels";
import { facePaintMask } from "./editor/paintMask";
import { activeRasterLayer, setRasterLayerPixels } from "./editor/layers";
import { beginPaintGesture, commitGizmoTransform, commitPaintGesture, continuePaintGesture } from "./editor/gestures";
import type { PaintGesture } from "./editor/gestures";
import type { Texel } from "./editor/pixels";
import { EditorViewport } from "./components/EditorViewport";
import type { Mode, Tool, ViewKind, ViewRequest } from "./components/EditorViewport";
import { TextureSurface } from "./components/TextureSurface";
import { TextureLayersPanel } from "./components/TextureLayersPanel";
import { TextureImportDialog } from "./components/TextureImportDialog";
import { decodeBrowserPng, importTextureIntoDocument, resampleNearest } from "./editor/textureImport";
import type { DecodedTexture, TextureImportPolicy } from "./editor/textureImport";
import { FaceUVInspector } from "./components/FaceUVInspector";
import { PaletteControls } from "./components/PaletteControls";
import { applyFaceUV, copyFaceUV } from "./editor/uvEditing";
import type { FaceUVClipboard } from "./editor/uvEditing";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { ModalDialog } from "./components/ModalDialog";
import { RecoveryDetailsDialog } from "./components/RecoveryDetailsDialog";
import { recoveryStatusText } from "./editor/recoveryPresentation";
import type { RecoveryAcknowledgement, RecoveryStatus, WriterStatus } from "./editor/recoveryPresentation";
import type { PackImportReport } from "./import/javaPack";
import { inspectJava1214, JavaExportBlocked, JAVA_PACK_PATHS } from "./export/javaBlock";
import type { ExportIssue } from "./export/javaBlock";

type CommitFn = (document: EditorDocument) => EditorDocument;

function IconButton({ label, children, onClick, disabled = false, active = false }: {
  label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return <button type="button" className={"icon-button" + (active ? " active" : "")}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
function CommittedText({ id, label, className, value, disabled = false, onCommit }: {
  id?: string; label: string; className: string; value: string; disabled?: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commitDraft = (input: string) => {
    const next = input.trim().slice(0, 100);
    if (next && next !== value) onCommit(next); else setDraft(value);
  };
  return <input id={id} aria-label={label} className={className} value={draft}
    maxLength={100} disabled={disabled} spellCheck={false} onChange={event => setDraft(event.target.value)}
    onBlur={event => commitDraft(event.currentTarget.value)} onKeyDown={event => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") { event.currentTarget.value = value; setDraft(value); event.currentTarget.blur(); }
    }}/>;
}
function NumericField({ label, value, onCommit, property }: {
  label: string; value: number; onCommit: (n: number) => void; property: "position" | "size";
}) {
  const display = String(Number(value.toFixed(4)));
  const [draft, setDraft] = useState(display), [issue, setIssue] = useState(false);
  useEffect(() => { setDraft(display); setIssue(false); }, [display]);
  const confirm = (input: string) => {
    const next = Number(input.trim());
    const valid = input.trim() !== "" && Number.isFinite(next) &&
      (property === "size" ? next > 0 && next <= 64 : next >= -256 && next <= 256);
    if (!valid) { setDraft(display); setIssue(true); return; }
    setIssue(false); onCommit(next);
  };
  return <label className={"axis-field" + (issue ? " invalid" : "")} title={label}>
    <span className={"axis-letter axis-" + label.toLowerCase()}>{label}</span>
    <input type="text" inputMode="decimal" spellCheck={false} aria-label={label + " " + property} value={draft}
      onChange={event => { setDraft(event.target.value); setIssue(false); }}
      onBlur={event => confirm(event.currentTarget.value)} onKeyDown={event => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = display; setDraft(display); setIssue(false); event.currentTarget.blur();
        }
      }}/>
    {issue && <span className="field-warning" title="Value outside supported numeric range; restored last valid value">!</span>}
  </label>;
}
function AxisRow({ title, selected, property, commitDocument }: {
  title: string; selected: Cuboid; property: "position" | "size"; commitDocument: (fn: CommitFn) => void;
}) {
  return <div className="form-group"><div className="form-caption">{title}<span>model units</span></div>
    <div className="axis-grid">{([0, 1, 2] as const).map(axis => {
      const current = property === "position" ? selected.from[axis] : selected.to[axis] - selected.from[axis];
      return <NumericField key={selected.id + property + axis} label={(["X", "Y", "Z"] as const)[axis]}
        value={current} property={property} onCommit={value => commitDocument(doc => setAxisValue(doc, selected.id, property, axis, value))}/>;
    })}</div>
  </div>;
}
function SectionHeading({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return <div className="panel-section-heading"><h3>{title}</h3>{trailing}</div>;
}
function getFilename(date: Date): string {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function App() {
  const [history, setHistory] = useState<History>(() => createHistory(createSampleDocument()));
  const [packSession, setPackSession] = useState<PackSession | null>(null);
  const packRef = useRef(packSession); packRef.current = packSession;
  const [openSession, setOpenSession] = useState(0);
  const activeSession = useRef(openSession); activeSession.current = openSession;
  const historyRef = useRef(history); historyRef.current = history;
  const doc = history.present, texture = activeTexture(doc);
  const exportIssues = useMemo(() => packSession
    ? inspectIndexedJava1214Pack(packSession.present.pack, packSession.present.sources)
    : inspectJava1214(doc), [doc, packSession]);
  const [selection, setSelection] = useState<Selection>(() => selectOnly("body"));
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  useEffect(() => setCollapsedGroups([]), [openSession, doc.id]);
  const selectedId = selection.primary, selectedIds = selection.ids;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const setSelectedId = useCallback((id: string | null) => setSelection(selectOnly(id)), []);
  const [selectedFace, setSelectedFace] = useState<FaceDirection>("north");
  const [uvClipboard, setUVClipboard] = useState<FaceUVClipboard | null>(null);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const selected = doc.cuboids.find(node => node.id === selectedId) ?? null;
  const faceAsset = selected ? textureById(doc, selected.faces[selectedFace].textureId) : null;
  const selectedIndex = doc.cuboids.findIndex(node => node.id === selectedId);
  useEffect(() => {
    setSelection(current => {
      const reconciled = reconcileSelection(current, doc.cuboids.map(node => node.id));
      return current.ids.length && !reconciled.ids.length ? selectOnly(doc.cuboids[0]?.id ?? null) : reconciled;
    });
  }, [doc.cuboids]);
  const [mode, setMode] = useState<Mode>("model"), [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(1);
  const [view, setView] = useState<ViewRequest>({ kind: "iso", count: 0 });
  const [color, setColor] = useState("#80dbbf"), [brushSize, setBrushSize] = useState<1 | 2 | 4>(1);
  const [constrainPaint, setConstrainPaint] = useState(false);
  const [search, setSearch] = useState("");
  const [sceneOpen, setSceneOpen] = useState(() => window.innerWidth > 1000);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 760);
  const [draftPixels, setDraftPixels] = useState<number[] | null>(null);
  const [draftTextureId, setDraftTextureId] = useState<string | null>(null);
  const drag = useRef<PaintGesture | null>(null);
  const [cancelToken, setCancelToken] = useState(0);
  const writerId = useRef(crypto.randomUUID()), writerRef = useRef<RecoveryLease | null>(null);
  const [writerStatus, setWriterStatus] = useState<WriterStatus>("checking");
  const [writerEpoch, setWriterEpoch] = useState(0), [takingOver, setTakingOver] = useState(false);
  const awaitingRecoveryRef = useRef(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("unsaved");
  const [lastAcknowledgedRecovery, setLastAcknowledgedRecovery] = useState<RecoveryAcknowledgement | null>(null);
  const [recoveryDetailsOpen, setRecoveryDetailsOpen] = useState(false);
  const [libraryRequest, setLibraryRequest] = useState(0);
  const [candidate, setCandidate] = useState<AnyRecoveryCandidate | null>(null), [bootChecked, setBootChecked] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<EditorDocument | null>(null);
  const [pendingPackOpen, setPendingPackOpen] = useState<NativePackProject | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false), [savingProject, setSavingProject] = useState(false);
  const [pendingPack, setPendingPack] = useState<PackImportReport | null>(null);
  const [pendingTexture, setPendingTexture] = useState<DecodedTexture | null>(null);
  const [textureImportMode, setTextureImportMode] = useState<"replace" | "new">("replace");
  const [deletingTextureId, setDeletingTextureId] = useState<string | null>(null);
  const [deleteReplacementId, setDeleteReplacementId] = useState<string | null>(null);
  const [textureReading, setTextureReading] = useState(false), [packInspecting, setPackInspecting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [packStudioOpen, setPackStudioOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "building" | "started">("idle");
  const [lastExport, setLastExport] = useState<{ revision: number; bytes: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saveProjectRef = useRef<() => Promise<void>>(async () => undefined);
  const fileRef = useRef<HTMLInputElement>(null), packFileRef = useRef<HTMLInputElement>(null), textureFileRef = useRef<HTMLInputElement>(null);
  const sceneListRef = useRef<HTMLDivElement>(null);
  const activeRevision = useRef(history.revision); activeRevision.current = history.revision;
  const fileIntent = useRef(0), openingProject = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => {
    saveAbortRef.current?.abort();
    exportAbortRef.current?.abort();
    importAbortRef.current?.abort();
  }, []);
  useEffect(() => { importAbortRef.current?.abort(); }, [openSession]);
  const textureSource = useRef<{ document: EditorDocument; mode: "replace" | "new" } | null>(null);

  // PackSession is authoritative in pack mode. The legacy History is only an
  // adapter for existing commands; it is never a second durable undo stack.
  const publishPackSession = useCallback((advance: (current: PackSession) => PackSession): boolean => {
    const current = packRef.current;
    if (!current) return false;
    const next = advance(current);
    if (next === current) return false;
    packRef.current = next;
    const view = packHistoryView(next);
    historyRef.current = view; activeRevision.current = next.revision;
    setPackSession(next); setHistory(view);
    return true;
  }, []);
  const publishHistory = useCallback((advance: (current: History) => History): boolean => {
    const current = historyRef.current, next = advance(current);
    if (next === current) return false;
    if (packRef.current) return publishPackSession(pack => advancePackFromEditor(pack, current, next));
    historyRef.current = next; activeRevision.current = next.revision;
    setHistory(next);
    return true;
  }, [publishPackSession]);
  const commitDocument = useCallback((operation: CommitFn) => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return;
    if (drag.current) {
      drag.current = null; setDraftPixels(null); setDraftTextureId(null); setCancelToken(current => current + 1);
    }
    try { publishHistory(current => commit(current, operation(current.present))); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The edit was rejected; no project data changed."); }
  }, [publishHistory]);
  const clearStroke = useCallback(() => {
    drag.current = null; setDraftPixels(null); setDraftTextureId(null); setCancelToken(current => current + 1);
  }, []);
  const switchTool = (next: Tool) => { clearStroke(); setTool(next); };
  const selectNode = useCallback((id: string | null, modifiers: SelectionModifiers = {}) => {
    clearStroke();
    setSelection(current => id === null ? selectOnly(null) :
      selectAt(current, id, historyRef.current.present.cuboids.map(node => node.id), modifiers));
  }, [clearStroke]);
  const locateExportIssue = (issue: ExportIssue) => {
    // Pack preflight checks every source model. An error on another model must
    // switch the live editor before attempting to locate its cuboid or sheet.
    if (issue.sourceDocumentId && historyRef.current.present.id !== issue.sourceDocumentId) {
      const target = packRef.current?.present.pack.models.find(model =>
        model.sourceDocumentId === issue.sourceDocumentId);
      if (!target) {
        setNotice("The source model for this export issue is no longer in the pack.");
        return;
      }
      switchPackModel(target.id);
      if (historyRef.current.present.id !== issue.sourceDocumentId) {
        setNotice("Select an editable source model before locating this export issue.");
        return;
      }
    }
    const source = historyRef.current.present;
    if (issue.nodeId) {
      if (!source.cuboids.some(node => node.id === issue.nodeId)) return;
      clearStroke();
      setSelectedId(issue.nodeId);
      setSearch(""); // Make a filtered-out element visible in the hierarchy.
      setMode("model"); setTool("select");
    } else if (issue.textureId) {
      const textureId = issue.textureId;
      if (!textureById(source, textureId)) return;
      clearStroke();
      // Match asset-list selection: navigating is not a document edit or undo step.
      publishHistory(current => {
        const next = selectTexture(current.present, textureId);
        return next === current.present ? current : { ...current, present: next };
      });
      setMode("paint"); setTool("pencil");
    } else return;

    setSceneOpen(true); setInspectorOpen(true);
    setExportOpen(false);
  };
  const applyBatch = useCallback((operation: CommitFn): boolean => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return false;
    const source = historyRef.current.present;
    try {
      const next = operation(source);
      if (next !== source) { clearStroke(); commitDocument(current => current === source ? next : current); }
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The entire selection edit was rejected. No parts were changed.");
      return false;
    }
  }, [clearStroke, commitDocument]);
  const duplicateCurrentSelection = useCallback(() => {
    if (!selectedIds.length) return;
    const ids = selectedIds.map(() => crypto.randomUUID());
    if (applyBatch(current => duplicateSelection(current, selectedIds, ids)))
      setSelection({ ids, primary: ids.at(-1) ?? null, anchor: ids[0] ?? null });
  }, [selectedIds, applyBatch]);
  const repeatCurrentSelection = useCallback((copies: number, step: Vec3) => {
    if (!selectedIds.length || !Number.isSafeInteger(copies) || copies < 1 || copies > 64) return;
    // Reserve IDs once, before React updater replay, and commit all copies atomically.
    const ids = Array.from({ length: selectedIds.length * copies }, () => crypto.randomUUID());
    if (applyBatch(current => repeatSelection(current, selectedIds, ids, copies, step))) {
      const lastLayer = ids.slice(-selectedIds.length);
      setSelection({ ids: lastLayer, primary: lastLayer.at(-1) ?? null,
        anchor: lastLayer[0] ?? null });
    }
  }, [selectedIds, applyBatch]);
  const createGroupFromSelection = useCallback(() => {
    if (selectedIds.length < 2) return;
    const id = "group_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const name = "Group " + ((historyRef.current.present.groups?.length ?? 0) + 1);
    if (applyBatch(current => groupSelection(current, selectedIds, id, name))) setSearch("");
  }, [selectedIds, applyBatch]);
  const deleteCurrentSelection = useCallback(() => {
    applyBatch(current => deleteSelection(current, selectedIds));
  }, [selectedIds, applyBatch]);
  const selectEditable = useCallback(() => {
    clearStroke();
    const ids = historyRef.current.present.cuboids.filter(node => node.visible && !node.locked &&
      node.name.toLowerCase().includes(search.toLowerCase())).map(node => node.id);
    setSelection({ ids, primary: ids.at(-1) ?? null, anchor: ids[0] ?? null });
  }, [search, clearStroke]);
  const transformBatch = useCallback((gesture: SelectionGesture, translation: Vec3, scale: Vec3) => {
    applyBatch(current => commitSelectionGesture(current, gesture, translation, scale));
  }, [applyBatch]);

  const paintMask = useCallback((source: EditorDocument, textureId: string,
    faceKey = "texture-canvas") => {
    if (!constrainPaint) return undefined;
    let nodeId = selectedId;
    let direction = selectedFace;
    if (faceKey !== "texture-canvas") {
      const colon = faceKey.lastIndexOf(":");
      if (colon < 0) return null;
      nodeId = faceKey.slice(0, colon);
      direction = faceKey.slice(colon + 1) as FaceDirection;
    }
    return nodeId ? facePaintMask(source, nodeId, direction, textureId) : null;
  }, [constrainPaint, selectedId, selectedFace]);
  const beginPaint = useCallback((texel: Texel, face: string, textureId = historyRef.current.present.activeTextureId) => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current || drag.current ||
        (tool !== "pencil" && tool !== "eraser" && tool !== "line" && tool !== "rectangle")) return;
    const source = historyRef.current.present;
    const mask = paintMask(source, textureId, face);
    if (mask === null) { setNotice("Choose a visible, unlocked painted face using this texture, or disable UV-constrained painting."); return; }
    try {
      const started = beginPaintGesture(source, texel, face, color, brushSize, tool, textureId, mask);
      drag.current = started; setDraftTextureId(started.textureId); setDraftPixels(started.pixels);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Cannot paint the active texture layer.");
    }
  }, [color, brushSize, tool, paintMask]);
  const continuePaint = useCallback((texel: Texel, face: string, textureId = historyRef.current.present.activeTextureId) => {
    const current = drag.current; if (!current || current.textureId !== textureId) return;
    const next = continuePaintGesture(current, texel, face); drag.current = next; setDraftPixels(next.pixels);
  }, []);
  const finishPaint = useCallback(() => {
    const current = drag.current; if (!current) return;
    drag.current = null; setDraftPixels(null); setDraftTextureId(null);
    commitDocument(document => {
      const next = commitPaintGesture(document, current);
      return next === document ? document : selectTexture(next, current.textureId);
    });
  }, [commitDocument]);
  const samplePaint = useCallback((texel: Texel, textureId = historyRef.current.present.activeTextureId) => {
    const sheet = textureById(historyRef.current.present, textureId);
    if (sheet) setColor(readHex(sheet.pixels, sheet.width, texel));
  }, []);
  const fillPaint = useCallback((texel: Texel,
    textureId = historyRef.current.present.activeTextureId, faceKey?: string) => {
    if (tool !== "fill" || !writerRef.current || awaitingRecoveryRef.current) return;
    commitDocument(current => {
      const sheet = textureById(current, textureId); if (!sheet) return current;
      const mask = paintMask(current, textureId, faceKey);
      if (mask === null) return current;
      const layer = activeRasterLayer(sheet);
      if (sheet.layers && !layer) return current;
      if (layer && (!layer.visible || layer.opacity === 0)) {
        setNotice("Show the active layer and increase its opacity before filling.");
        return current;
      }
      const input = layer?.pixels ?? sheet.pixels;
      const filled = floodFill(input, sheet.width, sheet.height, texel, color, mask);
      const changed = layer ? setRasterLayerPixels(current, textureId, layer.id, filled)
        : setTexturePixels(current, filled, textureId);
      return changed === current ? current : selectTexture(changed, textureId);
    });
  }, [color, tool, commitDocument, paintMask]);
  const changeMode = (next: Mode) => {
    clearStroke(); setMode(next);
    if (next === "paint") setSelectedId(selectedId);
    switchTool(next === "paint" ? "pencil" : "select");
  };
  const transform = useCallback((id: string, position: Vec3, scale: Vec3) => {
    commitDocument(document => commitGizmoTransform(document, id, position, scale));
  }, [commitDocument]);
  const markWriterLost = useCallback((failed = false) => {
    writerRef.current = null; clearStroke();
    setWriterStatus(failed ? "failed" : "blocked"); setRecoveryStatus(failed ? "failed" : "blocked");
  }, [clearStroke]);

  useEffect(() => {
    let alive = true;
    Promise.all([readAnyRecovery(), claimRecoveryWriter(writerId.current)]).then(([restored, claim]) => {
      if (!alive) return;
      setCandidate(restored); awaitingRecoveryRef.current = restored !== null;
      if (claim.granted) { writerRef.current = claim.lease; setWriterStatus("owned"); }
      else { writerRef.current = null; setWriterStatus("blocked"); setRecoveryStatus("blocked"); }
      setBootChecked(true);
    }).catch(() => {
      if (!alive) return; setWriterStatus("failed"); setRecoveryStatus("failed"); setBootChecked(true);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (writerStatus !== "owned") return;
    let inFlight = false;
    const renew = () => {
      const lease = writerRef.current; if (!lease || inFlight) return;
      inFlight = true;
      renewRecoveryWriter(lease).then(updated => {
        if (writerRef.current?.generation !== lease.generation || writerRef.current?.ownerId !== lease.ownerId) return;
        if (!updated) markWriterLost(); else writerRef.current = updated;
      }).catch(() => {
        if (writerRef.current?.generation === lease.generation) markWriterLost(true);
      }).finally(() => { inFlight = false; });
    };
    const visible = () => { if (!document.hidden) renew(); };
    const timer = window.setInterval(renew, 4_000);
    window.addEventListener("focus", renew); document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", renew); document.removeEventListener("visibilitychange", visible); };
  }, [writerStatus, markWriterLost]);
  useEffect(() => {
    const cancel = () => clearStroke();
    window.addEventListener("blur", cancel); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("blur", cancel); window.removeEventListener("pointercancel", cancel); };
  }, [clearStroke]);
  useEffect(() => {
    if (writerStatus !== "owned" || awaitingRecoveryRef.current || (history.revision === 0 && openSession === 0)) return;
    const lease = writerRef.current; if (!lease) return;
    setRecoveryStatus("unsaved");
    const revision = history.revision, snapshot = history.present, session = openSession;
    const current = () => writerRef.current?.generation === lease.generation &&
      activeSession.current === session && activeRevision.current === revision;
    const timer = window.setTimeout(() => {
      if (!current()) return;
      setRecoveryStatus("saving");
      const pack = packRef.current;
      const save = pack ? savePackRecovery(pack.present.pack, pack.present.sources, revision, lease)
        : saveRecovery(snapshot, revision, lease);
      save.then(() => {
        if (current()) {
          setLastAcknowledgedRecovery({ session, revision, savedAt: Date.now(),
            modelCount: pack?.present.pack.models.length ?? 1 });
          setRecoveryStatus("saved");
        }
      }).catch((error: unknown) => {
        if (!current()) return;
        if (error instanceof RecoveryOwnershipLost) markWriterLost();
        else {
          setRecoveryStatus("failed");
          if (error instanceof RecoverySnapshotTooLarge) setNotice(error.message);
        }
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [history, openSession, writerStatus, writerEpoch, markWriterLost]);
  const takeOverWriter = async () => {
    if (takingOver) return;
    setTakingOver(true);
    try {
      const claim = await claimRecoveryWriter(writerId.current, true);
      if (!claim.granted) throw new RecoveryOwnershipLost();
      writerRef.current = claim.lease;
      const latest = await readAnyRecovery(); awaitingRecoveryRef.current = latest !== null;
      setCandidate(latest); setWriterStatus("owned"); setWriterEpoch(epoch => epoch + 1); setRecoveryStatus("unsaved");
      setNotice("This tab now owns local recovery. Choose the saved session or keep this workspace before editing.");
    } catch (error) {
      setWriterStatus("failed"); setNotice(error instanceof Error ? error.message : "Could not take over local recovery.");
    } finally { setTakingOver(false); }
  };
  const keepCurrentWorkspace = () => { awaitingRecoveryRef.current = false; setCandidate(null); setWriterEpoch(epoch => epoch + 1); };
  const navigate = (kind: ViewKind) => setView(current => ({ kind, count: current.count + 1 }));
  const runUndo = useCallback(() => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return;
    clearStroke();
    if (packRef.current) publishPackSession(undoPackSession);
    else publishHistory(undo);
  }, [clearStroke, publishHistory, publishPackSession]);
  const runRedo = useCallback(() => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return;
    clearStroke();
    if (packRef.current) publishPackSession(redoPackSession);
    else publishHistory(redo);
  }, [clearStroke, publishHistory, publishPackSession]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) { event.preventDefault(); clearStroke(); return; }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]") || document.querySelector("[role=dialog]")) return;
      const command = event.metaKey || event.ctrlKey, key = event.key.toLowerCase();
      if (command && key === "n") { event.preventDefault(); setNewProjectOpen(true); return; }
      if (command && key === "s") { event.preventDefault(); void saveProjectRef.current(); return; }
      if (command && key === "a" && mode === "model") { event.preventDefault(); selectEditable(); return; }
      if (command && key === "d" && mode === "model") { event.preventDefault(); duplicateCurrentSelection(); return; }
      if (command && key === "z") { event.preventDefault(); if (event.shiftKey) runRedo(); else runUndo(); return; }
      if (command && key === "y") { event.preventDefault(); runRedo(); return; }
      if (command || event.altKey) return;
      if (key === "escape" && document.querySelector('[data-uv-dragging="true"]')) return;
      if (key === "escape") { clearStroke(); setShapeMenuOpen(false); switchTool("select"); }
      if (key === "v") switchTool("select");
      if (key === "w" && mode === "model") switchTool("move");
      if (key === "r" && mode === "model") switchTool("resize");
      if (key === "b" && mode === "paint") switchTool("pencil");
      if (key === "e" && mode === "paint") switchTool("eraser");
      if (key === "g" && mode === "paint") switchTool("fill");
      if (key === "i" && mode === "paint") switchTool("eyedropper");
      if (key === "l" && mode === "paint") switchTool("line");
      if (key === "u" && mode === "paint") switchTool("rectangle");
      if (key === "f") navigate("iso");
      if ((key === "delete" || key === "backspace") && mode === "model" && selectedIds.length) {
        event.preventDefault(); deleteCurrentSelection();
      }
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [mode, selectedIds, runUndo, runRedo, clearStroke, selectEditable, duplicateCurrentSelection, deleteCurrentSelection]);

  const saveLegacyJson = () => {
    try {
      startBrowserDownload(prepareLegacyJsonDownload(doc));
      setNotice("Legacy JSON backup download started. Keep this as an additional portable copy.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare the JSON backup."); }
  };
  const saveProject = async () => {
    if (savingProject || saveAbortRef.current) return;
    const controller = new AbortController();
    saveAbortRef.current = controller;
    setSavingProject(true);
    try {
      const pack = packRef.current;
      if (pack) {
        const bytes = await buildPackZipInWorker("native", pack.present.pack, pack.present.sources, controller.signal);
        if (controller.signal.aborted) return;
        startBrowserDownload({ filename: nativeFilename(pack.present.pack.name),
          mimeType: "application/zip", content: bytes });
        setNotice("Complete pack-aware .3dmc backup download started. All models and textures are included.");
      } else {
        startBrowserDownload(await prepareNativeProjectDownload(doc));
        if (controller.signal.aborted) return;
        setNotice("Native .3dmc project download started. Keep the archive as your portable backup.");
      }
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "Could not prepare your native project archive.");
    } finally {
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
      setSavingProject(false);
    }
  };
  saveProjectRef.current = saveProject;
  const downloadJavaPack = async () => {
    if (exportAbortRef.current) return;
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportStatus("building");
    const capturedRevision = historyRef.current.revision;
    try {
      const pack = packRef.current;
      if (pack) {
        const bytes = await buildPackZipInWorker("java", pack.present.pack, pack.present.sources, controller.signal);
        if (controller.signal.aborted) return;
        startBrowserDownload({ filename: "3dmc-multi-model-java-1.21.4-experimental.zip",
          mimeType: "application/zip", content: bytes });
        setLastExport({ revision: capturedRevision, bytes: bytes.length });
      } else {
        const prepared = prepareJavaPackDownload(doc);
        if (controller.signal.aborted) return;
        startBrowserDownload(prepared.file);
        setLastExport({ revision: capturedRevision, bytes: prepared.bytes });
      }
      setExportStatus("started");
      setNotice("Experimental Java pack download started. This artifact still requires an in-game check.");
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportStatus("idle");
        setNotice(error instanceof JavaExportBlocked ? error.issues.filter(issue => issue.severity === "error").map(issue => issue.message).join(" ") :
          error instanceof Error ? error.message : "Could not prepare the resource pack.");
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      if (controller.signal.aborted) setExportStatus("idle");
    }
  };
  const downloadDiagnosticPack = () => {
    try {
      startBrowserDownload(prepareSixFaceDiagnosticDownload());
      setNotice("Six-face diagnostic download started. Install the unmodified ZIP in Java 1.21.4 and record screenshots/logs; game verification remains pending.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not prepare the diagnostic pack."); }
  };
  const chooseTexture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    importAbortRef.current?.abort();
    const request = ++fileIntent.current, session = activeSession.current;
    const source = historyRef.current.present, importMode = textureImportMode;
    const current = () => fileIntent.current === request && activeSession.current === session;
    setTextureReading(true); setPackInspecting(false);
    try {
      const decoded = await decodeBrowserPng(file); if (!current()) return;
      if (historyRef.current.present !== source) {
        setNotice("The project or selected texture changed while the PNG was decoding. Choose the image again; no pixels were replaced."); return;
      }
      textureSource.current = { document: source, mode: importMode }; setPendingTexture(decoded);
    } catch (error) {
      if (current()) setNotice(error instanceof Error ? error.message : "The PNG couldn't be imported.");
    } finally { if (current()) setTextureReading(false); }
  };
  const applyImportedTexture = (policy: TextureImportPolicy) => {
    const image = pendingTexture, captured = textureSource.current; if (!image || !captured) return;
    const id = "tex_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const accepted = applyBatch(current => {
      if (current !== captured.document) throw new Error("The source changed after PNG preflight. Cancel and choose the image again; newer work was preserved.");
      if (captured.mode === "replace") return importTextureIntoDocument(current, image, policy);
      const source = activeTexture(current);
      const width = policy === "use-png-size" ? image.width : source.width;
      const height = policy === "use-png-size" ? image.height : source.height;
      const pixels = resampleNearest(image.pixels, image.width, image.height, width, height);
      return addTexture(current, { id, name: image.name, width, height, pixels });
    });
    if (accepted) {
      setPendingTexture(null); textureSource.current = null;
      setNotice(captured.mode === "new" ? "New texture asset added. Assign it to individual faces in the Paint inspector." :
        "Selected texture replaced with one undoable edit. Save a .3dmc backup.");
    }
  };
  const downloadTexturePng = () => {
    try {
      startBrowserDownload(prepareTexturePngDownload(doc));
      setNotice("PNG texture download started. Native .3dmc source preserves your complete editable project.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export PNG."); }
  };
  const cancelImport = () => {
    const controller = importAbortRef.current;
    if (!controller) return;
    controller.abort();
    importAbortRef.current = null;
    fileIntent.current++;
    setImportProgress(null);
    setPackInspecting(false);
    setNotice("Import canceled. Your current project was not changed.");
  };

  const inspectImportFile = async (file: File, kind: "source" | "java") => {
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const request = ++fileIntent.current;
    const session = activeSession.current;
    const revision = activeRevision.current;
    const source = historyRef.current.present;
    const pack = packRef.current?.present;
    const current = () => !controller.signal.aborted &&
      importAbortRef.current === controller &&
      fileIntent.current === request && activeSession.current === session;
    setTextureReading(false);
    setPackInspecting(kind === "java");
    setImportProgress({ name: file.name, stage: "reading", loaded: 0, total: file.size });
    if (kind === "source") { setPendingOpen(null); setPendingPackOpen(null); }
    else setPendingPack(null);
    try {
      if (kind === "source" && file.size > MAX_NATIVE_PACK_BYTES)
        throw new Error("File exceeds the 12 MB source pack import budget.");
      if (kind === "java" && file.size > MAX_NATIVE_PACK_BYTES)
        throw new Error("This ZIP exceeds the 12 MB supported Java pack-import limit.");
      const bytes = await readImportFile(file, controller.signal, (loaded, total) => {
        if (current()) setImportProgress({ name: file.name, stage: "reading", loaded, total });
      });
      if (!current()) return;
      setImportProgress({ name: file.name, stage: "validating", loaded: file.size, total: file.size });
      const result = await runImportJobInWorker(kind === "source"
        ? { kind: "source", filename: file.name, bytes }
        : { kind: "java", bytes }, controller.signal);
      if (!current()) return;
      if (activeRevision.current !== revision || historyRef.current.present !== source ||
          packRef.current?.present !== pack) {
        setNotice("The workspace changed during import. Choose the file again; no edits were replaced.");
        return;
      }
      if (result.kind === "pack") setPendingPackOpen(result.project);
      else if (result.kind === "document") setPendingOpen(result.document);
      else if (result.kind === "java") setPendingPack(result.report);
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "The selected file could not be imported.";
      if (kind === "java") setPendingPack({ status: "blocked", problems: [message] });
      else setNotice(message);
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
        setImportProgress(null);
        setPackInspecting(false);
      }
    }
  };

  const chooseProject = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void inspectImportFile(file, "source");
  };
  const choosePack = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void inspectImportFile(file, "java");
  };
  const acceptOpen = async (document: EditorDocument): Promise<boolean> => {
    const lease = writerRef.current;
    if (!lease) { setNotice("Editing is paused. Take over local recovery before opening this document."); return false; }
    if (openingProject.current) return false;
    openingProject.current = true; fileIntent.current++; clearStroke();
    setTextureReading(false); setPackInspecting(false);
    try {
      const rotated = await rotateRecoveryWriter(lease);
      if (writerRef.current?.generation !== lease.generation) return false;
      writerRef.current = rotated; awaitingRecoveryRef.current = false;
      packRef.current = null; setPackSession(null);
      const nextHistory = createHistory(document), nextSession = activeSession.current + 1;
      historyRef.current = nextHistory; activeRevision.current = nextHistory.revision; activeSession.current = nextSession;
      setWriterEpoch(epoch => epoch + 1); setHistory(nextHistory); setOpenSession(nextSession);
      setSelectedId(document.cuboids[0]?.id ?? null); setSelectedFace("north"); setSearch(""); setShapeMenuOpen(false);
      setMode("model"); switchTool("select"); setPendingOpen(null); setPendingPackOpen(null); setPackStudioOpen(false); setPendingPack(null); setPendingTexture(null); textureSource.current = null;
      setCandidate(null); setRecoveryStatus("unsaved"); setLastAcknowledgedRecovery(null); setDeletingTextureId(null); setDeleteReplacementId(null);
      setNotice("Project opened. Local recovery is updating; download a .3dmc archive for a portable backup."); return true;
    } catch (error) {
      markWriterLost(); setNotice(error instanceof Error ? error.message : "Could not safely open the project."); return false;
    } finally { openingProject.current = false; }
  };
  /** Writer rotation prevents stale checkpoints from overwriting a newly opened pack. */
  const acceptPackOpen = async (next: PackSession): Promise<boolean> => {
    const lease = writerRef.current;
    if (!lease) { setNotice("Take over recovery before opening a source pack."); return false; }
    if (openingProject.current) return false;
    openingProject.current = true; fileIntent.current++; clearStroke();
    try {
      const rotated = await rotateRecoveryWriter(lease);
      if (writerRef.current?.generation !== lease.generation) return false;
      writerRef.current = rotated; awaitingRecoveryRef.current = false;
      packRef.current = next; setPackSession(next);
      const view = packHistoryView(next), doc = activePackDocument(next);
      const stamp = activeSession.current + 1;
      historyRef.current = view; activeRevision.current = next.revision; activeSession.current = stamp;
      setHistory(view); setOpenSession(stamp); setWriterEpoch(epoch => epoch + 1);
      setSelectedId(doc.cuboids[0]?.id ?? null); setSelectedFace("north");
      setSearch(""); setShapeMenuOpen(false); setMode("model"); setTool("select");
      setPendingOpen(null); setPendingPackOpen(null); setPendingPack(null);
      setPendingTexture(null); textureSource.current = null;
      setDeletingTextureId(null); setDeleteReplacementId(null);
      setPackStudioOpen(false); setCandidate(null); setRecoveryStatus("unsaved"); setLastAcknowledgedRecovery(null);
      setNotice("Pack opened with " + next.present.pack.models.length + " editable models. Recovery is updating.");
      return true;
    } catch (error) {
      markWriterLost(); setNotice(error instanceof Error ? error.message : "Could not safely open the pack.");
      return false;
    } finally { openingProject.current = false; }
  };
  const resetActiveModelView = (doc: EditorDocument) => {
    clearStroke(); fileIntent.current++;
    const stamp = activeSession.current + 1;
    activeSession.current = stamp; setOpenSession(stamp);
    setSelectedId(doc.cuboids[0]?.id ?? null); setSelectedFace("north");
    setSearch(""); setMode("model"); setTool("select");
    setPendingTexture(null); textureSource.current = null;
    setDeletingTextureId(null); setDeleteReplacementId(null);
  };
  const switchPackModel = (id: string) => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return;
    const before = packRef.current;
    if (!before || before.present.pack.activeModelId === id) return;
    try {
      clearStroke();
      if (publishPackSession(current => selectPackModel(current, id)))
        resetActiveModelView(activePackDocument(packRef.current!));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not switch models."); }
  };
  const changePackStudioSession = (next: PackSession) => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) return;
    const before = packRef.current;
    if (!before) return;
    try {
      const switching = before.present.pack.activeModelId !== next.present.pack.activeModelId;
      if (publishPackSession(() => next) && switching) resetActiveModelView(activePackDocument(next));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Pack change was rejected."); }
  };
  const openPackStudio = () => {
    if (!writerRef.current || awaitingRecoveryRef.current || openingProject.current) {
      setNotice("Take over recovery before editing a pack."); return;
    }
    if (!packRef.current) {
      try {
        const next = upgradeEditorHistory(historyRef.current);
        packRef.current = next; setPackSession(next);
        const view = packHistoryView(next);
        historyRef.current = view; activeRevision.current = view.revision;
        setHistory(view);
        const stamp = activeSession.current + 1;
        activeSession.current = stamp; setOpenSession(stamp);
        setWriterEpoch(epoch => epoch + 1);
      } catch (error) { setNotice(error instanceof Error ? error.message : "Cannot open pack workspace."); return; }
    }
    setPackStudioOpen(true);
  };
  const createNewProject = async (options: NewProjectOptions): Promise<boolean> => {
    const opened = await acceptOpen(makeNewProject(options)); if (opened) setNewProjectOpen(false); return opened;
  };
  const addElement = () => {
    const id = crypto.randomUUID(); commitDocument(current => addCuboid(current, id));
    setSelectedId(id); setMode("model"); switchTool("select");
  };
  const addShape = (primitive: PrimitiveId) => {
    const id = crypto.randomUUID(); commitDocument(current => addPrimitive(current, id, primitive));
    setShapeMenuOpen(false); setSelectedId(id); setMode("model"); switchTool("select");
  };
  const visibleTexture = textureById(doc, draftTextureId ?? doc.activeTextureId) ?? texture;
  const viewPixels = draftPixels ?? visibleTexture.pixels;
  const groupedMembers = new Set((doc.groups ?? []).flatMap(group => group.memberIds));
  const query = search.toLowerCase().trim();
  const sceneEntries: Array<{ kind: "group"; group: EditorGroup } | { kind: "part"; node: Cuboid }> = [];
  for (const group of doc.groups ?? []) {
    const candidates = doc.cuboids.filter(node => group.memberIds.includes(node.id));
    const displayed = candidates.filter(node =>
      node.name.toLowerCase().includes(query) || group.name.toLowerCase().includes(query));
    if (!displayed.length) continue;
    sceneEntries.push({ kind: "group", group });
    if (!collapsedGroups.includes(group.id))
      sceneEntries.push(...displayed.map(node => ({ kind: "part" as const, node })));
  }
  sceneEntries.push(...doc.cuboids.filter(node =>
    !groupedMembers.has(node.id) && node.name.toLowerCase().includes(query))
    .map(node => ({ kind: "part" as const, node })));
  const matching = sceneEntries.flatMap(entry => entry.kind === "part" ? [entry.node] : []);
  const focusableId = matching.some(node => node.id === selectedId) ? selectedId : matching[0]?.id;
  const statusText = recoveryStatusText(writerStatus, recoveryStatus);

  return <div className={"app-shell" + (!sceneOpen ? " scene-collapsed" : "") + (!inspectorOpen ? " inspector-collapsed" : "")}>
    {bootChecked && <>
    <header className="app-bar">
      <div className="brand" aria-label="3dMc Studio"><span className="brand-mark"><Box size={19} strokeWidth={2.3}/></span>
        <span>3dMc</span><span className="brand-divider"/><span className="brand-subtitle">Studio</span></div>
      <div className="project-header">
        <CommittedText label="Project name" className="project-title" value={doc.name} onCommit={name => commitDocument(current => renameProject(current, name))}/>
        <label className="profile-label" title={packSession ? "Pack target is pinned to Java 1.21.4" : "Target compatibility is experimental"}>Java · Static block
          <select className="target-select" aria-label="Minecraft target version" value={doc.target.candidateRelease} disabled={!!packSession}
            onChange={event => commitDocument(current => setJavaCandidateRelease(current, event.target.value === "26.3" ? "26.3" : "1.21.4"))}>
            <option value="1.21.4">1.21.4 · Experimental</option><option value="26.3">26.3 · Not supported</option>
          </select>
        </label>
      </div>
      <div className="app-actions"><div className="history-actions">
        <IconButton label="Undo (Ctrl/Cmd+Z)" disabled={!history.past.length} onClick={runUndo}><Undo2 size={17}/></IconButton>
        <IconButton label="Redo (Ctrl/Cmd+Shift+Z)" disabled={!history.future.length} onClick={runRedo}><Redo2 size={17}/></IconButton>
      </div>
        <button className="text-button quiet new-project-trigger" aria-label="New project" title="Create a new project" onClick={() => setNewProjectOpen(true)}><FilePlus2 size={16}/>New</button>
        <input type="file" ref={fileRef} accept=".3dmc,.json,application/json,application/zip" hidden onChange={chooseProject}/>
        <button className="text-button subtle" onClick={() => fileRef.current?.click()} title="Open a .3dmc native project or legacy JSON"><FolderOpen size={16}/>Open</button>
        <input type="file" ref={packFileRef} accept=".zip,application/zip" hidden onChange={choosePack}/>
        <button className="text-button subtle" onClick={() => packFileRef.current?.click()} disabled={packInspecting} title="Import a 3dMc experimental Java 1.21.4 resource pack">
          <PackageOpen size={16}/>{packInspecting ? "Inspecting…" : "Import pack"}</button>
        <button className="text-button quiet" onClick={() => void saveProject()} disabled={savingProject} title={packSession ? "Download complete pack-aware .3dmc source" : "Download native .3dmc source project"}><Save size={16}/>{savingProject ? "Preparing…" : "Save project"}</button>
        <button className="text-button subtle" onClick={openPackStudio} disabled={doc.target.candidateRelease !== "1.21.4"} title={doc.target.candidateRelease === "1.21.4" ? "Assemble and save a multi-model source pack" : "Pack Studio currently requires Java 1.21.4"}><Layers3 size={16}/>Pack Studio</button>
        <button className="text-button primary" onClick={() => setExportOpen(true)} title="Experimental pack export; in-game validation is pending"><Download size={16}/>Minecraft export</button>
      </div>
    </header>
    {importProgress && <ImportProgress progress={importProgress} onCancel={cancelImport}/>}
    <nav className="mode-bar" aria-label="Editor modes"><div className="mode-spacer">
      <IconButton label={sceneOpen ? "Collapse scene panel" : "Expand scene panel"} onClick={() => setSceneOpen(current => !current)} active={!sceneOpen}><PanelLeftClose size={16}/></IconButton>
      <IconButton label={inspectorOpen ? "Collapse inspector" : "Expand inspector"} onClick={() => setInspectorOpen(current => !current)} active={!inspectorOpen}><PanelRightClose size={16}/></IconButton>
      <span className="workspace-dot"/><span>WORKSPACE</span></div>
      <div className="mode-tabs" role="tablist" aria-label="Authoring mode">{(["model", "paint", "preview"] as const).map(item =>
        <button key={item} role="tab" aria-selected={mode === item} className={"mode-tab" + (mode === item ? " current" : "")} onClick={() => changeMode(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>
      <div className="mode-options creator-options"><CreatorTools key={openSession} document={doc} revision={history.revision} pack={packSession?.present} mode={mode}
        selectedId={selectedId} face={selectedFace} onApply={applyBatch} onOpen={acceptOpen}
        onOpenPack={project => acceptPackOpen(createPackSession(project.pack, project.sources))}
        onBackup={saveProject} onCancelGesture={clearStroke} libraryRequest={libraryRequest}
        onNewProject={() => setNewProjectOpen(true)} onModeChange={changeMode}
        onExport={() => setExportOpen(true)}
        onLayout={layout => { clearStroke(); setSceneOpen(layout === "balanced"); setInspectorOpen(layout !== "canvas"); if (layout === "paint") changeMode("paint"); }}/></div>
    </nav>
    <div className="editor-grid">
      <aside className="scene-panel" aria-label="Scene hierarchy">
        {packSession && <div className="pack-editor-selector" role="group" aria-label="Pack asset browser">
          <label htmlFor="active-pack-model">PACK MODELS <span>{packSession.present.pack.models.length} assets</span></label>
          <select id="active-pack-model" aria-label="Active pack model" value={packSession.present.pack.activeModelId}
            onChange={event => switchPackModel(event.target.value)}>
            {packSession.present.pack.models.map(model => <option key={model.id} value={model.id}>
              {packSession.present.sources.find(source => source.id === model.sourceDocumentId)?.name ?? model.id} · {model.replaces.path}
            </option>)}
          </select>
          <button type="button" onClick={openPackStudio}>Manage pack assets</button>
        </div>}
        <SectionHeading title="Scene" trailing={<button type="button" className="shape-trigger" aria-label="Add primitive" aria-expanded={shapeMenuOpen} aria-controls="shape-creation-menu"
          onClick={() => setShapeMenuOpen(value => !value)}><Plus size={15}/><span>Add shape</span><ChevronDown size={13}/></button>}/>
        {shapeMenuOpen && <div id="shape-creation-menu" className="shape-creation-menu" role="menu" aria-label="Choose a primitive"><div className="shape-menu-title">ADD A CUBOID PRIMITIVE</div>
          {PRIMITIVE_PRESETS.map(shape => <button type="button" role="menuitem" key={shape.id} onClick={() => addShape(shape.id)}><Box size={16}/><span><strong>{shape.label}</strong><small>{shape.description}</small></span></button>)}</div>}
        <div className="scene-search"><Search size={15}/><input value={search} aria-label="Filter scene elements" onChange={event => setSearch(event.target.value)} placeholder="Find an element…"/></div>
        <div className="scene-selection-tools"><button type="button" onClick={selectEditable} title="Select visible, unlocked matches (Ctrl/Cmd+A)">Select editable</button>
          <button type="button" onClick={() => selectNode(null)}>Clear</button>
          <button type="button" disabled={mode !== "model" || selectedIds.length < 2}
            onClick={createGroupFromSelection} aria-label="Group selected parts">Group</button>
          <span aria-live="polite">{selectedIds.length} selected</span></div>
        <div ref={sceneListRef} className="scene-list" role="listbox" aria-label="Scene elements" aria-multiselectable="true">
          {doc.cuboids.length === 0 && <div className="scene-empty-start"><Box size={29} strokeWidth={1.2}/><strong>Your canvas is ready</strong><p>Add the first cuboid to begin shaping your asset.</p>
            <button onClick={addElement}><FilePlus2 size={14}/>Add first cuboid</button></div>}
          {doc.cuboids.length > 0 && sceneEntries.length === 0 && <div className="empty-list">No matching elements.<button onClick={() => setSearch("")}>Clear search</button></div>}
          {sceneEntries.map(entry => {
            if (entry.kind === "group") {
              const group = entry.group;
              const collapsed = collapsedGroups.includes(group.id);
              return <div key={group.id} className="scene-group-row" role="presentation">
                <button type="button" aria-expanded={!collapsed}
                  aria-label={(collapsed ? "Expand group " : "Collapse group ") + group.name}
                  onClick={() => setCollapsedGroups(current => collapsed ?
                    current.filter(id => id !== group.id) : [...current, group.id])}>
                  <ChevronDown size={14} className={collapsed ? "closed" : ""}/>
                </button>
                <CommittedText label={"Rename group " + group.name}
                  className="scene-group-name" value={group.name}
                  onCommit={name => { applyBatch(current => renameGroup(current, group.id, name)); }}/>
                <button type="button" aria-label={"Select group " + group.name}
                  onClick={() => { clearStroke(); setSelection({
                    ids: [...group.memberIds], primary: group.memberIds.at(-1) ?? null,
                    anchor: group.memberIds[0] ?? null
                  }); }}>Select</button>
                <button type="button" aria-label={"Ungroup " + group.name}
                  onClick={() => { applyBatch(current => ungroup(current, group.id)); }}>Ungroup</button>
              </div>;
            }
            const node = entry.node;
            const index = matching.indexOf(node);
            return <div role="option" aria-selected={selectedSet.has(node.id)} tabIndex={focusableId === node.id ? 0 : -1}
            key={node.id} className={"scene-row" + (groupedMembers.has(node.id) ? " grouped-part" : "") + (selectedSet.has(node.id) ? " selected" : "") + (selectedId === node.id ? " primary-selected" : "") + (!node.visible ? " hidden-row" : "")}
            onClick={event => {
              clearStroke(); setSelection(current => selectAt(current, node.id, matching.map(item => item.id), { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey }));
            }} onKeyDown={event => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault(); clearStroke();
                setSelection(current => selectAt(current, node.id, matching.map(item => item.id), { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey }));
              }
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? matching.length - 1 : Math.max(0, Math.min(matching.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
                const next = matching[nextIndex]; if (!next) return;
                clearStroke();
                if (!(event.ctrlKey || event.metaKey) || event.shiftKey) setSelection(current => selectAt(current, next.id, matching.map(item => item.id), { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey }));
                sceneListRef.current?.querySelectorAll<HTMLElement>("[role=option]")[nextIndex]?.focus();
              }
            }}>
            <Box size={15} strokeWidth={1.7}/><span className="scene-row-name">{node.name}</span>
            <button className="scene-row-action" aria-label={(node.visible ? "Hide " : "Show ") + node.name} title={node.visible ? "Hide" : "Show"}
              onClick={event => { event.stopPropagation(); commitDocument(current => toggleFlag(current, node.id, "visible")); }}>{node.visible ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
            <button className="scene-row-action" aria-label={(node.locked ? "Unlock " : "Lock ") + node.name} title={node.locked ? "Unlock" : "Lock"}
              onClick={event => { event.stopPropagation(); commitDocument(current => toggleFlag(current, node.id, "locked")); }}>{node.locked ? <Lock size={14}/> : <LockOpen size={14}/>}</button>
          </div>;
          })}
        </div>
        <div className="scene-footer"><SectionHeading title="Assets" trailing={<span className="counter">{String(doc.textures.length).padStart(2, "0")}</span>}/>
          <div className="texture-slot-list" role="group" aria-label="Texture assets">{doc.textures.map(asset => <div key={asset.id} className={"texture-slot" + (doc.activeTextureId === asset.id ? " active" : "")}>
            <button type="button" aria-label={"Select texture " + asset.name} aria-pressed={doc.activeTextureId === asset.id} className="texture-slot-select" onClick={() => {
              clearStroke(); publishHistory(state => { const next = selectTexture(state.present, asset.id); return next === state.present ? state : { ...state, present: next }; });
            }}><Paintbrush size={16}/><span><strong>{asset.name}</strong><small>{asset.width}×{asset.height} · {asset.id === "main" ? "Main" : asset.id.slice(-5)}</small></span></button>
            <button type="button" aria-label={"Delete texture " + asset.name} disabled={doc.textures.length <= 1} onClick={() => {
              setDeletingTextureId(asset.id); setDeleteReplacementId(doc.textures.find(t => t.id !== asset.id)?.id ?? null);
            }}><Trash2 size={14}/></button></div>)}</div>
          <button type="button" className="texture-add-slot" disabled={doc.textures.length >= 16 || textureReading} onClick={() => { setTextureImportMode("new"); textureFileRef.current?.click(); }}><Plus size={14}/>Add texture from PNG<span>{doc.textures.length}/16</span></button>
          <div className="texture-selected-rename"><CommittedText key={texture.id} label="Texture name" className="texture-rename-input" value={texture.name} onCommit={name => commitDocument(current => renameTexture(current, texture.id, name))}/></div>
          <input ref={textureFileRef} type="file" accept=".png,image/png" hidden onChange={chooseTexture}/>
          <div className="texture-asset-actions"><button type="button" aria-label="Import texture PNG" disabled={textureReading} onClick={() => { setTextureImportMode("replace"); textureFileRef.current?.click(); }}><ImagePlus size={14}/>{textureReading ? "Reading…" : "Import PNG"}</button>
            <button type="button" aria-label="Download texture PNG" onClick={downloadTexturePng}><Download size={14}/>Export PNG</button></div>
          <button type="button" className="legacy-json-link" onClick={saveLegacyJson} title="Additional portable legacy .3dmc.json backup">Download legacy JSON backup</button>
          <div className="scene-meta"><span>{packSession ? "Pack source · .3dmc v3" : "Native source · .3dmc v2"}</span><span>{doc.textures.length} textures</span></div>
        </div>
      </aside>
      <main className="stage" aria-label="3D editing workspace"><div className="stage-main">
        <div className="view-topbar"><div className="view-top-left"><span className="view-mode"><span className="view-spark"/> {mode === "preview" ? "PREVIEW" : "PERSPECTIVE"}</span><span className="view-separator"/><span>{mode === "paint" ? "TEXTURED · EDITABLE" : "TEXTURED"}</span></div>
          <div className="view-top-right"><span className="dot"/><span>LOCAL SESSION</span></div></div>
        <EditorViewport document={doc} pixels={viewPixels} selectedId={selectedId} selectedIds={selectedIds}
          selectedFace={selectedFace} onSelectFace={setSelectedFace} mode={mode} tool={tool} view={view} snap={snap} painting={!!draftPixels}
          cancelToken={cancelToken} draftTextureId={draftTextureId} onSelect={selectNode} onBeginPaint={beginPaint} onContinuePaint={continuePaint}
          onFinishPaint={finishPaint} onCancelPaint={clearStroke} onSample={samplePaint} onFill={fillPaint} onTransform={transform} onBatchTransform={transformBatch}/>
        {mode !== "preview" && <div className="tool-rail" aria-label="Editor tools">{mode === "model" ? <>
          <IconButton active={tool === "select"} label="Select (V)" onClick={() => switchTool("select")}><MousePointer2 size={18}/></IconButton>
          <IconButton active={tool === "move"} label="Move (W)" onClick={() => switchTool("move")}><Move3D size={18}/></IconButton>
          <IconButton active={tool === "resize"} label="Resize (R)" onClick={() => switchTool("resize")}><Maximize2 size={18}/></IconButton><div className="rail-divider"/>
          <IconButton label="Add cuboid" onClick={addElement}><Plus size={19}/></IconButton>
        </> : <>
          <IconButton active={tool === "pencil"} label="Pixel pencil (B)" onClick={() => switchTool("pencil")}><Paintbrush size={18}/></IconButton>
          <IconButton active={tool === "line"} label="Line tool (L)" onClick={() => switchTool("line")}><Minus size={18}/></IconButton>
          <IconButton active={tool === "rectangle"} label="Rectangle outline (U)" onClick={() => switchTool("rectangle")}><Square size={18}/></IconButton>
          <IconButton active={tool === "eraser"} label="Pixel eraser (E)" onClick={() => switchTool("eraser")}><Eraser size={18}/></IconButton>
          <IconButton active={tool === "fill"} label="Fill connected area (G)" onClick={() => switchTool("fill")}><PaintBucket size={18}/></IconButton>
          <IconButton active={tool === "eyedropper"} label="Eyedropper (I)" onClick={() => switchTool("eyedropper")}><Pipette size={18}/></IconButton>
        </>}</div>}
        <div className="view-bottom"><div className="view-tool-caption">{mode === "paint" ? tool === "fill" ? "Fill a four-connected RGBA region · one undo step" : tool === "eraser" ? "Erase RGBA pixels in 3D or 2D · Esc cancels" : tool === "line" ? "Drag a straight pixel line · release to commit · Esc cancels" : tool === "rectangle" ? "Drag a rectangle outline · release to commit · Esc cancels" : "Paint in 3D or on the texture sheet · Esc cancels stroke" : mode === "preview" ? "Preview only · No edits are applied in this mode" : tool === "select" ? "Select an element · Shift/Ctrl/Cmd to multi-select · V" : tool === "move" ? "Drag a gizmo axis to move · W" : "Drag a gizmo axis to resize · R"}</div>
          <div className="camera-views">{(["iso", "front", "right", "top"] as const).map(kind => <button key={kind} className={view.kind === kind ? "current" : ""} onClick={() => navigate(kind)} aria-label={"View " + kind}>{kind.toUpperCase()}</button>)}
            <IconButton label="Reset camera" onClick={() => navigate("iso")}><RotateCcw size={15}/></IconButton></div></div>
      </div>
        {mode === "paint" && <TextureSurface pixels={viewPixels} width={visibleTexture.width} height={visibleTexture.height} tool={tool} color={color} painting={!!draftPixels}
          face={selected?.material === "texture" && selected.faces[selectedFace].textureId === visibleTexture.id ? selected.faces[selectedFace] : null}
          faceName={selected?.material === "texture" && selected.faces[selectedFace].textureId === visibleTexture.id ? selectedFace : null}
          uvEditable={!!selected && selected.visible && !selected.locked && selected.material === "texture"}
          onCommitUV={(sourceFace, rect) => commitDocument(current =>
            current === doc && selected && selected.faces[selectedFace] === sourceFace
              ? applyFaceUV(current, selected.id, selectedFace,
                { uv: rect, rotation: sourceFace.rotation }, sourceFace) : current)}
          onBegin={beginPaint} onMove={continuePaint} onEnd={finishPaint} onCancel={clearStroke} onSample={samplePaint} onFill={fillPaint}/>}
      </main>
      <aside className="inspector-panel" aria-label="Properties inspector"><SectionHeading title="Inspector" trailing={<Settings2 size={17} className="section-muted-icon"/>}/>
        {selectedIds.length > 1 && mode !== "paint" ? <SelectionInspector document={doc} ids={selectedIds} snap={snap} setSnap={setSnap} apply={applyBatch}
          duplicate={duplicateCurrentSelection} repeat={repeatCurrentSelection}
          remove={deleteCurrentSelection} clear={() => selectNode(null)}/> : selected ? <>
          <div className="selection-heading"><div className="selection-glyph"><Box size={20}/></div><div><span>SELECTED ELEMENT</span><h2>{selected.name}</h2><p>Cuboid · {selected.material === "texture" ? "Textured surface" : "Solid material"}</p></div></div>
          <div className="inspector-scroll">
            {mode === "paint" && <FaceUVInspector selected={selected} face={selectedFace} setFace={direction => {
              clearStroke(); setSelectedFace(direction);
              publishHistory(state => { const next = selectTexture(state.present, selected.faces[direction].textureId); return next === state.present ? state : { ...state, present: next }; });
            }} commitDocument={commitDocument} textures={doc.textures} textureWidth={faceAsset?.width ?? texture.width} textureHeight={faceAsset?.height ?? texture.height}
              copiedUV={uvClipboard}
              onCopyUV={() => setUVClipboard(copyFaceUV(selected.faces[selectedFace]))}
              onPasteUV={() => { if (uvClipboard) commitDocument(current =>
                applyFaceUV(current, selected.id, selectedFace, uvClipboard)); }}/>}
            <div className="inspector-group"><SectionHeading title="Transform" trailing={<SlidersHorizontal size={15} className="section-muted-icon"/>}/>
              <AxisRow title="Position · corner" selected={selected} property="position" commitDocument={commitDocument}/><AxisRow title="Size" selected={selected} property="size" commitDocument={commitDocument}/>
              <div className="form-group"><MoveSnapControl value={snap} onChange={setSnap}/></div>
              {selected.locked && <div className="inline-note"><Lock size={14}/>Unlock this element to edit geometry.</div>}
              <div className="inline-note"><Info size={14}/>Rotation requires a verified Java target capability profile.</div>
            </div>
            <div className="inspector-group"><SectionHeading title="Appearance"/><div className="form-group"><div className="form-caption">Surface type</div>
              <div className="material-switch" role="group" aria-label="Element material"><button type="button" aria-pressed={selected.material === "solid"} disabled={selected.locked} onClick={() => commitDocument(current => setCuboidMaterial(current, selected.id, "solid"))}>Solid color</button>
                <button type="button" aria-pressed={selected.material === "texture"} disabled={selected.locked} onClick={() => commitDocument(current => setCuboidMaterial(current, selected.id, "texture"))}>Painted</button></div></div>
              {selected.material === "texture" ? <><div className="surface-summary"><div className="texture-swatch" style={{ background: "#d1a65d" }}/><div><strong>{texture.name}</strong><span>Shared texture · {texture.width} × {texture.height}</span></div></div>
                <button className="inline-action" onClick={() => changeMode("paint")}><Paintbrush size={15}/>Edit texture <span>→</span></button></> : <><div className="form-caption">Material color</div>
                <div className="color-control"><input type="color" aria-label="Element color" value={selected.color} disabled={selected.locked} onChange={event => commitDocument(current => setMaterialColor(current, selected.id, event.target.value))}/><span>{selected.color.toUpperCase()}</span></div></>}
            </div>
            <div className="inspector-group"><SectionHeading title="Element actions"/><div className="element-actions">
              <button disabled={selected.locked || !selected.visible} onClick={duplicateCurrentSelection}><Copy size={15}/>Duplicate</button>
              <button disabled={selected.locked || !selected.visible} onClick={deleteCurrentSelection}><Trash2 size={15}/>Delete</button></div>
              <div className="reorder-actions" role="group" aria-label="Scene ordering"><button type="button" aria-label="Move selected element up" disabled={selected.locked || selectedIndex <= 0} onClick={() => commitDocument(current => moveCuboid(current, selected.id, "up"))}><ArrowUp size={14}/>Move up</button>
                <button type="button" aria-label="Move selected element down" disabled={selected.locked || selectedIndex < 0 || selectedIndex >= doc.cuboids.length - 1} onClick={() => commitDocument(current => moveCuboid(current, selected.id, "down"))}><ArrowDown size={14}/>Move down</button></div>
              <label className="form-caption rename-label" htmlFor="element-name">Element name</label><CommittedText id="element-name" label="Element name" className="text-control" value={selected.name} disabled={selected.locked} onCommit={name => commitDocument(current => renameCuboid(current, selected.id, name))}/>
            </div>
            {mode === "model" && <div className="inspector-group">
              <SectionHeading title="Duplicate array"/>
              <SelectionArrayTools selectedCount={1} totalCount={doc.cuboids.length}
                disabled={selected.locked || !selected.visible} onCreate={repeatCurrentSelection}/>
            </div>}
          </div>
        </> : <div className="empty-inspector"><Box size={28}/><h2>Nothing selected</h2><p>Choose an element in the scene or click a visible part in the viewport.</p><button className="text-button quiet" onClick={addElement}><Plus size={15}/>Add cuboid</button></div>}
        {mode === "paint" && <div className="paint-options"><SectionHeading title="Paint controls"/>
          <TextureLayersPanel key={texture.id} texture={texture} commit={commitDocument}/>
          <div className="paint-import-actions">
          <button type="button" onClick={() => { setTextureImportMode("replace"); textureFileRef.current?.click(); }} disabled={textureReading}><ImagePlus size={14}/>Replace PNG</button>
          <button type="button" onClick={downloadTexturePng}><Download size={14}/>Export PNG</button></div>
          <div className="form-caption">Brush color</div>
          <PaletteControls document={doc} color={color} onChoose={setColor}
            onEdit={change => commitDocument(change)}/>
          <div className="color-control"><input type="color" aria-label="Custom paint color" value={color} onChange={event => setColor(event.target.value)}/><span>{color.toUpperCase()}</span></div>
          <div className="paint-tool-note" role="status">{tool === "fill" ? "Bucket fills only connected pixels with exactly matching RGBA values." : tool === "eraser" ? "Eraser makes pixels fully transparent (alpha 0). Java export requires an opaque texture." : tool === "line" ? "Line previews from its original starting pixel and commits one edit on release." : tool === "rectangle" ? "Rectangle draws an outline from its original corners. Drag again to change its preview before releasing." : "Pencil paints opaque pixels. Click the eyedropper to sample an RGB color."}</div>
          <div className="form-caption">Brush size</div><div className="segmented">{([1, 2, 4] as const).map(size => <button key={size} aria-pressed={brushSize === size} disabled={tool === "fill" || tool === "eyedropper"} onClick={() => setBrushSize(size)}>{size} px</button>)}</div>
          <label className="face-paint-constrain">
            <input type="checkbox" aria-label="Constrain paint to selected face UV"
              checked={constrainPaint} onChange={event => { clearStroke(); setConstrainPaint(event.currentTarget.checked); }}/>
            <span>Constrain to selected face UV</span>
          </label>
          {constrainPaint && <p className="face-paint-hint">
            Paint and fill are clipped to the active face's texture region. Shared pixels may still appear on other faces.
          </p>}
        </div>}
        <div className="inspector-bottom"><Info size={15}/><span>Experimental Java exporter · check your pack in game</span></div>
      </aside>
    </div>
    <footer className="status-bar"><div aria-live="polite" className={"save-status status-" + recoveryStatus}><span className="status-indicator"/>{statusText}</div><span className="status-divider"/>
      <button onClick={() => setRecoveryDetailsOpen(true)}>Recovery details <Info size={12}/></button>
      <div className="status-space"/><span>{selectedIds.length > 1 ? selectedIds.length + " selected" : selected ? "1 selected · " + selected.name : doc.cuboids.length + " elements"}</span><span className="status-divider"/><span>Grid {snap} unit</span><span className="status-divider"/><span className="status-profile">Java pack experiment</span>
    </footer>
    </>}
    {recoveryDetailsOpen && <RecoveryDetailsDialog
      writer={writerStatus} status={recoveryStatus} session={openSession} revision={history.revision}
      acknowledgement={lastAcknowledgedRecovery} modelCount={packSession?.present.pack.models.length ?? 1}
      savingBackup={savingProject} onClose={() => setRecoveryDetailsOpen(false)}
      onBackup={() => { void saveProject(); }}
      onLibrary={() => { setRecoveryDetailsOpen(false); setLibraryRequest(value => value + 1); }}/>}
    {!bootChecked && <ModalDialog className="modal writer-modal" labelledBy="recovery-boot-title">
      <h2 id="recovery-boot-title">Checking local recovery ownership…</h2>
      <p>Editing begins after this tab verifies its recovery writer. No project data is changed during this check.</p>
    </ModalDialog>}
    {bootChecked && writerStatus !== "owned" && <ModalDialog className="writer-modal" labelledBy="writer-title"><div className="modal-icon"><Lock size={22}/></div>
      <h2 id="writer-title">{writerStatus === "blocked" ? "Another tab controls local recovery" : "Local recovery isn't available"}</h2><p>{writerStatus === "blocked" ? "This editor is read-only here to protect the other tab's saved work. You can download the current project, or explicitly take over editing. A suspended older tab will no longer be able to overwrite this tab's checkpoints." : "You can still download the current project as a portable backup. Retry ownership only when you're ready to edit."}</p>
      <div className="modal-actions"><button className="text-button quiet" onClick={saveProject}><Save size={15}/>Download backup</button><button className="text-button primary" disabled={takingOver} onClick={takeOverWriter}>{takingOver ? "Taking over…" : "Take over editing"}</button></div>
    </ModalDialog>}
    {candidate && bootChecked && writerStatus === "owned" && <ModalDialog className="recovery-banner" labelledBy="recovery-title"><div><Info size={19}/><p><strong id="recovery-title">Continue a local session?</strong><span>{candidate.kind === "pack" ? candidate.pack.name + " · " + candidate.pack.models.length + " models" : candidate.document.name} · {getFilename(new Date(candidate.savedAt))}{candidate.fallback ? " · Latest checkpoint could not be verified; this previous checkpoint is available" : ""}</span></p></div>
      <button className="text-button quiet" onClick={keepCurrentWorkspace}>Keep current workspace</button><button className="text-button primary" onClick={() => candidate.kind === "pack" ? void acceptPackOpen(createPackSession(candidate.pack, candidate.sources)) : void acceptOpen(candidate.document)}>Recover project</button></ModalDialog>}
    {notice && <div role="status" className="notice-toast"><Info size={17}/><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
    {packStudioOpen && <PackStudioDialog source={doc} session={packSession ?? undefined}
      onChange={changePackStudioSession} onOpenPack={acceptPackOpen}
      onClose={() => setPackStudioOpen(false)}/>}
    {exportOpen && <ModalDialog className="modal export-modal" labelledBy="pack-export-title" onCancel={() => { exportAbortRef.current?.abort(); setExportOpen(false); }}>
      <div className="export-heading"><div className="modal-icon"><Download size={22}/></div><div><span className="export-kicker">JAVA EDITION · RESOURCE PACK</span><h2 id="pack-export-title">Experimental resource pack</h2></div></div>
      <p>Build a Java Edition <strong>1.21.4</strong> resource pack (format <strong>46</strong>) that {packSession ? <>
        contains <strong>{packSession.present.pack.models.length} model assets</strong> and replaces {packSession.present.pack.models.map(model => model.replaces.namespace + ":" + model.replaces.path).join(", ")}
      </> : <>replaces the visual model of <strong>minecraft:diamond_block</strong></>}. Gameplay, lighting, and collision do not change.</p>
      <label className="export-target-control" htmlFor="export-target"><span>Target profile</span><select id="export-target" className="select-control" value={doc.target.candidateRelease} disabled={!!packSession} onChange={event => commitDocument(current => setJavaCandidateRelease(current, event.target.value === "26.3" ? "26.3" : "1.21.4"))}>
        <option value="1.21.4">Java Edition 1.21.4 · Export experiment</option><option value="26.3">Java Edition 26.3 · Unsupported</option></select></label>
      <div className="export-file-list" aria-label="Files in the export"><strong>Output files</strong><code>{JAVA_PACK_PATHS.metadata}</code><code>{JAVA_PACK_PATHS.blockstate}</code><code>{JAVA_PACK_PATHS.model}</code><code>{JAVA_PACK_PATHS.mainTexture}</code><span>Plus {doc.cuboids.filter(node => node.material === "solid").length} generated solid-color texture files.</span></div>
      <section className="diagnostic-fixture" aria-label="Six-face compatibility fixture"><div><strong>Six-face orientation test</strong><p>Download a separate, reproducible 64×64 diagnostic cube with labeled faces, upward arrows and asymmetric corner markers. It does not use or change your current project.</p></div><button className="text-button quiet" onClick={downloadDiagnosticPack}><Download size={15}/>Download six-face diagnostic ZIP</button></section>
      <ExportIssueList issues={exportIssues} onLocate={locateExportIssue}/>
      {lastExport && <p className="export-last">Last download started for revision {lastExport.revision} ({Math.round(lastExport.bytes / 1024)} KiB).{lastExport.revision !== history.revision ? " New changes have not been exported." : ""}</p>}
      <div className="modal-actions"><button className="text-button quiet" data-dialog-initial-focus onClick={() => { exportAbortRef.current?.abort(); setExportOpen(false); }}>{exportStatus === "building" ? "Cancel build" : "Close"}</button><button className="text-button primary" onClick={() => void downloadJavaPack()} disabled={exportStatus === "building" || exportIssues.some(issue => issue.severity === "error")}><Download size={15}/>{exportStatus === "building" ? "Building…" : "Download experimental ZIP"}</button></div>
    </ModalDialog>}
    {deletingTextureId && <ModalDialog className="modal import-modal" labelledBy="delete-texture-heading" onCancel={() => { setDeletingTextureId(null); setDeleteReplacementId(null); }}><h2 id="delete-texture-heading">Delete texture asset?</h2>
      <p>This will remove <strong>{textureById(doc, deletingTextureId)?.name}</strong>. Its {affectedFaces(doc, deletingTextureId).length} assigned faces must be remapped to an existing texture. The operation is one undoable change.</p>
      <label className="form-caption" htmlFor="delete-replacement">Replacement texture</label><select id="delete-replacement" className="select-control" value={deleteReplacementId ?? ""} onChange={event => setDeleteReplacementId(event.target.value)}>{doc.textures.filter(t => t.id !== deletingTextureId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <div className="delete-impact" aria-label="Affected face bindings">{affectedFaces(doc, deletingTextureId).slice(0, 24).map((entry, index) => <span key={entry.nodeId + entry.face + index}>{entry.name}: {entry.face}</span>)}{affectedFaces(doc, deletingTextureId).length > 24 && <span>And more…</span>}</div>
      <div className="modal-actions"><button className="text-button quiet" onClick={() => setDeletingTextureId(null)}>Cancel</button><button className="text-button primary" disabled={!deleteReplacementId} onClick={() => {
        const currentId = deletingTextureId, fallback = deleteReplacementId; if (!fallback) return;
        commitDocument(current => removeTexture(current, currentId, fallback)); setDeletingTextureId(null); setDeleteReplacementId(null);
        setNotice("Texture removed; affected face assignments were remapped in one undoable edit.");
      }}>Remove and remap</button></div>
    </ModalDialog>}
    {pendingTexture && <TextureImportDialog image={pendingTexture} isAdding={textureSource.current?.mode === "new"} currentWidth={texture.width} currentHeight={texture.height}
      paintedFaces={doc.cuboids.filter(node => node.material === "texture").length}
      hasLayers={!!texture.layers && textureSource.current?.mode === "replace"} onClose={() => { setPendingTexture(null); textureSource.current = null; }} onConfirm={applyImportedTexture}/>}
    {pendingPack && <ModalDialog className="modal import-modal" labelledBy="pack-import-title" onCancel={() => setPendingPack(null)}>
      <div className="import-header"><div className="modal-icon"><PackageOpen size={22}/></div><div><span className="export-kicker">IMPORT PREFLIGHT · JAVA 1.21.4</span><h2 id="pack-import-title">{pendingPack.status === "editable" ? "Import editable block pack?" :
        pendingPack.status === "editable-pack" ? "Import editable Java pack?" :
        "Pack cannot be safely imported"}</h2></div></div>
      {pendingPack.status === "editable" ? <><p>This pack matches the supported 3dMc experimental export format. Import it as a <strong> new editable project</strong> with its geometry and opaque texture pixels.</p>
        <div className="import-summary"><div><span>ELEMENTS</span><strong>{pendingPack.document.cuboids.length}</strong></div><div><span>TEXTURE</span><strong>{activeTexture(pendingPack.document).width} × {activeTexture(pendingPack.document).height}</strong></div><div><span>FILES</span><strong>{pendingPack.paths.length}</strong></div></div>
        <div className="import-notices"><h3>What to know before importing</h3>{pendingPack.notices.map(message => <p key={message}><Info size={15}/>{message}</p>)}</div>
        <p className="import-consequence">Your current workspace will be replaced. Download your current native project first if you need an independent copy. The original ZIP is never modified.</p>
        <div className="modal-actions"><button className="text-button quiet" data-dialog-initial-focus onClick={() => setPendingPack(null)}>Cancel</button><button className="text-button primary" onClick={() => void acceptOpen(pendingPack.document)}><PackageOpen size={15}/>Import as editable project</button></div>
      </> : pendingPack.status === "editable-pack" ? <>
        <p>This Java Edition 1.21.4 ZIP matches the supported 3dMc multi-asset format. Import every source model and texture into one editable Pack Studio session.</p>
        <div className="import-summary">
          <div><span>MODELS</span><strong>{pendingPack.project.pack.models.length}</strong></div>
          <div><span>TEXTURES</span><strong>{pendingPack.project.pack.textures.length}</strong></div>
          <div><span>ITEMS</span><strong>{pendingPack.project.pack.items?.length ?? 0}</strong></div>
          <div><span>FILES</span><strong>{pendingPack.paths.length}</strong></div>
        </div>
        <div className="import-notices"><h3>Verified resources</h3>
          <p><Info size={15}/>All referenced resources were checked against an equivalent re-export.</p>
          {pendingPack.project.pack.models.map(model => <p key={model.id}><Info size={15}/>
            {model.resource.namespace + ":" + model.resource.path} · {pendingPack.project.pack.exportBlockVisuals === false
              ? "item-only source" : model.replaces.namespace + ":" + model.replaces.path}</p>)}
          {(pendingPack.project.pack.items ?? []).map(item => <p key={item.id}><Info size={15}/>
            Item {item.replaces.namespace + ":" + item.replaces.path} → {item.resource.namespace + ":" + item.resource.path}</p>)}
          {pendingPack.notices.map(message => <p key={message}><Info size={15}/>{message}</p>)}
        </div>
        <details className="import-resource-preview"><summary>Inspect ZIP resource files ({pendingPack.paths.length})</summary>
          <div>{pendingPack.paths.slice(0, 80).map(path => <code key={path}>{path}</code>)}
          {pendingPack.paths.length > 80 && <p>And {pendingPack.paths.length - 80} additional validated files.</p>}</div>
        </details>
        <p className="import-consequence">This replaces the current workspace only after confirmation. Download your current .3dmc source first if needed. Minecraft ZIP files do not contain native editor names, history or layers.</p>
        <div className="modal-actions">
          <button className="text-button quiet" data-dialog-initial-focus onClick={() => setPendingPack(null)}>Cancel</button>
          <button className="text-button primary" onClick={() => void acceptPackOpen(createPackSession(pendingPack.project.pack, pendingPack.project.sources))}><PackageOpen size={15}/>Import complete pack</button>
        </div>
      </> : <><p>No changes were made to your project. This importer accepts only the supported 3dMc Java 1.21.4 export subset.</p><div className="import-blockers">{pendingPack.problems.map(message => <p key={message}><AlertCircle size={16}/><span>{message}</span></p>)}</div>
        <p className="import-consequence">Other resource packs may use valid Minecraft features that this editor cannot yet preserve. They are blocked rather than partially converted.</p><div className="modal-actions"><button className="text-button primary" data-dialog-initial-focus onClick={() => setPendingPack(null)}>Keep working</button></div></>}
    </ModalDialog>}
    {newProjectOpen && <NewProjectDialog onClose={() => setNewProjectOpen(false)} onCreate={createNewProject} onBackup={saveProject}/>}
    {pendingPackOpen && <ModalDialog className="modal" labelledBy="pack-open-title" onCancel={() => setPendingPackOpen(null)}>
      <div className="modal-icon"><Layers3 size={23}/></div><h2 id="pack-open-title">Open source pack?</h2>
      <p><strong>{pendingPackOpen.pack.name}</strong> contains {pendingPackOpen.pack.models.length} complete editable model(s). It will replace the current workspace; download a backup first if needed.</p>
      <div className="modal-actions"><button className="text-button quiet" onClick={() => setPendingPackOpen(null)}>Cancel</button>
        <button className="text-button primary" onClick={() => void acceptPackOpen(createPackSession(pendingPackOpen.pack, pendingPackOpen.sources))}>Open source pack</button></div>
    </ModalDialog>}
    {pendingOpen && <ModalDialog className="modal" labelledBy="open-dialog-title" onCancel={() => setPendingOpen(null)}><div className="modal-icon"><AlertCircle size={23}/></div><h2 id="open-dialog-title">Open this project?</h2><p><strong>{pendingOpen.name}</strong> will replace the current workspace. Download your current project first if you want a portable copy.</p><div className="modal-actions"><button className="text-button quiet" onClick={() => setPendingOpen(null)}>Cancel</button><button className="text-button primary" onClick={() => acceptOpen(pendingOpen)}>Open project</button></div></ModalDialog>}
  </div>;
}

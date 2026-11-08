import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle, ArrowDown, ArrowUp, Box, Check, ChevronDown, Copy, Download, Eraser, Eye, EyeOff,
  FolderOpen, FilePlus2, ImagePlus, PackageOpen, Info, Lock, LockOpen, Maximize2, PanelLeftClose, PanelRightClose,
  MousePointer2, Move3D, Paintbrush, PaintBucket, Pipette, Plus, Redo2, RotateCcw,
  Save, Search, Settings2, SlidersHorizontal, Trash2, Undo2
} from "lucide-react";
import {
  activeTexture, addTexture, affectedFaces, textureById,
  removeTexture, renameTexture, selectTexture,
  addCuboid, createSampleDocument, deleteCuboid, duplicateCuboid,
  renameCuboid, renameProject, setAxisValue, setJavaCandidateRelease, setMaterialColor,
  setTexturePixels, toggleFlag
} from "./editor/domain";
import type { Cuboid, EditorDocument, FaceDirection, Vec3 } from "./editor/domain";
import { commit, createHistory, redo, undo } from "./editor/history";
import type { History } from "./editor/history";
import { decodeProject, encodeProject, MAX_PROJECT_BYTES, safeFilename } from "./editor/project";
import { decodeNativeProject, encodeNativeProject, MAX_NATIVE_BYTES, nativeFilename } from "./editor/nativeArchive";
import { makeNewProject } from "./editor/templates";
import { PRIMITIVE_PRESETS, addPrimitive, moveCuboid, setCuboidMaterial } from "./editor/primitives";
import type { PrimitiveId } from "./editor/primitives";
import type { NewProjectOptions } from "./editor/templates";
import {
  claimRecoveryWriter, readRecovery, renewRecoveryWriter, rotateRecoveryWriter,
  saveRecovery, RecoveryOwnershipLost
} from "./editor/recovery";
import type { RecoveryCandidate, RecoveryLease } from "./editor/recovery";
import { floodFill, readHex } from "./editor/pixels";
import {
  beginPaintGesture, commitGizmoTransform, commitPaintGesture, continuePaintGesture
} from "./editor/gestures";
import type { PaintGesture } from "./editor/gestures";
import type { Texel } from "./editor/pixels";
import { EditorViewport } from "./components/EditorViewport";
import type { Mode, Tool, ViewKind, ViewRequest } from "./components/EditorViewport";
import { TextureSurface } from "./components/TextureSurface";
import { TextureImportDialog } from "./components/TextureImportDialog";
import { decodeBrowserPng, importTextureIntoDocument, resampleNearest } from "./editor/textureImport";
import type { DecodedTexture, TextureImportPolicy } from "./editor/textureImport";
import { encodeRgbaPng } from "./export/png";
import { FaceUVInspector } from "./components/FaceUVInspector";
import { NewProjectDialog } from "./components/NewProjectDialog";
import { makeSixFaceDiagnosticDocument } from "./compatibility/diagnostic";
import { inspectJava1214Pack } from "./import/javaPack";
import type { PackImportReport } from "./import/javaPack";
import {
  inspectJava1214, JavaExportBlocked, JAVA_PACK_PATHS, makeJava1214Pack
} from "./export/javaBlock";

type RecoveryStatus = "unsaved" | "saving" | "saved" | "failed" | "blocked";
type WriterStatus = "checking" | "owned" | "blocked" | "failed";
type CommitFn = (document: EditorDocument) => EditorDocument;
const SWATCHES = ["#f5d184", "#80dbbf", "#bb8870", "#c76d68", "#aebce2", "#f1f2f6", "#384f49", "#222e38"];

function IconButton({ label, children, onClick, disabled = false, active = false }: {
  label: string; children: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return <button type="button" className={"icon-button" + (active ? " active" : "")}
    aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

function CommittedText({ id, label, className, value, disabled = false, onCommit }: {
  id?: string; label: string; className: string; value: string;
  disabled?: boolean; onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commitDraft = (input: string) => {
    const next = input.trim().slice(0, 100);
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return <input id={id} aria-label={label} className={className} value={draft}
    maxLength={100} disabled={disabled} spellCheck={false}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={(event) => commitDraft(event.currentTarget.value)}
    onKeyDown={(event) => {
      if (event.key === "Enter") event.currentTarget.blur();
      if (event.key === "Escape") {
        event.currentTarget.value = value;
        setDraft(value);
        event.currentTarget.blur();
      }
    }}/>;
}

function NumericField({ label, value, onCommit, property }: {
  label: string; value: number; onCommit: (n: number) => void;
  property: "position" | "size";
}) {
  const display = String(Number(value.toFixed(4)));
  const [draft, setDraft] = useState(display);
  const [issue, setIssue] = useState(false);
  useEffect(() => { setDraft(display); setIssue(false); }, [display]);
  const restore = () => { setDraft(display); setIssue(false); };
  const confirm = (input: string) => {
    const next = Number(input.trim());
    const valid = input.trim() !== "" && Number.isFinite(next) &&
      (property === "size" ? next > 0 && next <= 64 : next >= -256 && next <= 256);
    if (!valid) { setDraft(display); setIssue(true); return; }
    setIssue(false);
    onCommit(next);
  };
  return <label className={"axis-field" + (issue ? " invalid" : "")} title={label}>
    <span className={"axis-letter axis-" + label.toLowerCase()}>{label}</span>
    <input type="text" inputMode="decimal" spellCheck={false}
      aria-label={label + " " + property} value={draft}
      onChange={(event) => { setDraft(event.target.value); setIssue(false); }}
      onBlur={(event) => confirm(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          event.currentTarget.value = display;
          restore();
          event.currentTarget.blur();
        }
      }} />
    {issue && <span className="field-warning" title="Value outside supported numeric range; restored last valid value">!</span>}
  </label>;
}

function AxisRow({ title, selected, property, commitDocument }: {
  title: string; selected: Cuboid; property: "position" | "size";
  commitDocument: (fn: CommitFn) => void;
}) {
  return <div className="form-group">
    <div className="form-caption">{title}<span>model units</span></div>
    <div className="axis-grid">
      {([0, 1, 2] as const).map((axis) => {
        const current = property === "position" ? selected.from[axis] : selected.to[axis] - selected.from[axis];
        return <NumericField key={selected.id + property + axis}
          label={(["X", "Y", "Z"] as const)[axis]} value={current} property={property}
          onCommit={(value) => commitDocument((doc) => setAxisValue(doc, selected.id, property, axis, value))} />;
      })}
    </div>
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
  const [openSession, setOpenSession] = useState(0);
  const activeSession = useRef(openSession);
  activeSession.current = openSession;
  const historyRef = useRef(history);
  historyRef.current = history;
  const doc = history.present;
  const texture = activeTexture(doc);
  const exportIssues = useMemo(() => inspectJava1214(doc), [doc]);
  const [selectedId, setSelectedId] = useState<string | null>("body");
  const [selectedFace, setSelectedFace] = useState<FaceDirection>("north");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const selected = doc.cuboids.find((node) => node.id === selectedId) ?? null;
  const faceAsset = selected ? textureById(doc, selected.faces[selectedFace].textureId) : null;
  const selectedIndex = doc.cuboids.findIndex((node) => node.id === selectedId);
  // Undoing a duplicate or deleting the active part must not strand selection
  // on a missing ID. The next available element remains editable immediately.
  useEffect(() => {
    if (selectedId && !doc.cuboids.some((node) => node.id === selectedId))
      setSelectedId(doc.cuboids[0]?.id ?? null);
  }, [selectedId, doc.cuboids]);
  const [mode, setMode] = useState<Mode>("model");
  const [tool, setTool] = useState<Tool>("select");
  const [snap, setSnap] = useState(1);
  const [view, setView] = useState<ViewRequest>({ kind: "iso", count: 0 });
  const [color, setColor] = useState("#80dbbf");
  const [brushSize, setBrushSize] = useState<1 | 2 | 4>(1);
  const [search, setSearch] = useState("");
  const [sceneOpen, setSceneOpen] = useState(() => window.innerWidth > 1000);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 760);
  const [draftPixels, setDraftPixels] = useState<number[] | null>(null);
  const [draftTextureId, setDraftTextureId] = useState<string | null>(null);
  const drag = useRef<PaintGesture | null>(null);
  const [cancelToken, setCancelToken] = useState(0);
  const writerId = useRef(crypto.randomUUID());
  const writerRef = useRef<RecoveryLease | null>(null);
  const [writerStatus, setWriterStatus] = useState<WriterStatus>("checking");
  const [writerEpoch, setWriterEpoch] = useState(0);
  const [takingOver, setTakingOver] = useState(false);
  const awaitingRecoveryRef = useRef(false);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("unsaved");
  const [candidate, setCandidate] = useState<RecoveryCandidate | null>(null);
  const [bootChecked, setBootChecked] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<EditorDocument | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [pendingPack, setPendingPack] = useState<PackImportReport | null>(null);
  const [pendingTexture, setPendingTexture] = useState<DecodedTexture | null>(null);
  const [textureImportMode, setTextureImportMode] = useState<"replace" | "new">("replace");
  const [deletingTextureId, setDeletingTextureId] = useState<string | null>(null);
  const [deleteReplacementId, setDeleteReplacementId] = useState<string | null>(null);
  const [textureReading, setTextureReading] = useState(false);
  const [packInspecting, setPackInspecting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "building" | "started">("idle");
  const [lastExport, setLastExport] = useState<{ revision: number; bytes: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const saveProjectRef = useRef<() => Promise<void>>(async () => undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const packFileRef = useRef<HTMLInputElement>(null);
  const textureFileRef = useRef<HTMLInputElement>(null);
  const activeRevision = useRef(history.revision);
  activeRevision.current = history.revision;

  const commitDocument = useCallback((operation: CommitFn) => {
    if (!writerRef.current || awaitingRecoveryRef.current) return;
    // Independent property edits cancel an in-progress paint preview instead of
    // silently dropping its pixels later or applying it to a changed document.
    if (drag.current) {
      drag.current = null;
      setDraftPixels(null);
      setDraftTextureId(null);
      setCancelToken((current) => current + 1);
    }
    setHistory((current) => commit(current, operation(current.present)));
  }, []);

  const clearStroke = useCallback(() => {
    drag.current = null;
    setDraftPixels(null);
    setDraftTextureId(null);
    setCancelToken((current) => current + 1);
  }, []);
  const switchTool = (next: Tool) => {
    clearStroke();
    setTool(next);
  };

  const beginPaint = useCallback((texel: Texel, face: string,
    textureId = historyRef.current.present.activeTextureId) => {
    if (!writerRef.current || awaitingRecoveryRef.current || drag.current) return;
    if (tool !== "pencil" && tool !== "eraser") return;
    const started = beginPaintGesture(historyRef.current.present, texel, face, color, brushSize, tool, textureId);
    drag.current = started;
    setDraftTextureId(started.textureId);
    setDraftPixels(started.pixels);
  }, [color, brushSize, tool]);

  const continuePaint = useCallback((texel: Texel, face: string,
    textureId = historyRef.current.present.activeTextureId) => {
    const current = drag.current;
    if (!current || current.textureId !== textureId) return;
    const next = continuePaintGesture(current, texel, face);
    drag.current = next;
    setDraftPixels(next.pixels);
  }, []);

  const finishPaint = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setDraftPixels(null);
    setDraftTextureId(null);
    commitDocument((document) => {
      const next = commitPaintGesture(document, current);
      return next === document ? document : selectTexture(next, current.textureId);
    });
  }, [commitDocument]);

  const samplePaint = useCallback((texel: Texel,
    textureId = historyRef.current.present.activeTextureId) => {
    const sheet = textureById(historyRef.current.present, textureId);
    if (sheet) setColor(readHex(sheet.pixels, sheet.width, texel));
  }, []);

  const fillPaint = useCallback((texel: Texel,
    textureId = historyRef.current.present.activeTextureId) => {
    if (tool !== "fill" || !writerRef.current || awaitingRecoveryRef.current) return;
    commitDocument((current) => {
      const sheet = textureById(current, textureId);
      if (!sheet) return current;
      const changed = setTexturePixels(current, floodFill(
        sheet.pixels, sheet.width, sheet.height, texel, color
      ), textureId);
      return changed === current ? current : selectTexture(changed, textureId);
    });
  }, [color, tool, commitDocument]);

  const changeMode = (next: Mode) => {
    clearStroke();
    setMode(next);
    switchTool(next === "paint" ? "pencil" : "select");
  };

  const transform = useCallback((id: string, position: Vec3, scale: Vec3) => {
    commitDocument((document) => commitGizmoTransform(document, id, position, scale));
  }, [commitDocument]);

  const markWriterLost = useCallback((failed = false) => {
    writerRef.current = null;
    clearStroke();
    setWriterStatus(failed ? "failed" : "blocked");
    setRecoveryStatus(failed ? "failed" : "blocked");
  }, [clearStroke]);

  useEffect(() => {
    let alive = true;
    Promise.all([readRecovery(), claimRecoveryWriter(writerId.current)]).then(([restored, claim]) => {
      if (!alive) return;
      setCandidate(restored);
      awaitingRecoveryRef.current = restored !== null;
      if (claim.granted) {
        writerRef.current = claim.lease;
        setWriterStatus("owned");
      } else {
        writerRef.current = null;
        setWriterStatus("blocked");
        setRecoveryStatus("blocked");
      }
      setBootChecked(true);
    }).catch(() => {
      if (!alive) return;
      setWriterStatus("failed");
      setRecoveryStatus("failed");
      setBootChecked(true);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (writerStatus !== "owned") return;
    let inFlight = false;
    const renew = () => {
      const lease = writerRef.current;
      if (!lease || inFlight) return;
      inFlight = true;
      renewRecoveryWriter(lease).then((updated) => {
        // A new project may have rotated the generation while renewing.
        if (writerRef.current?.generation !== lease.generation ||
            writerRef.current?.ownerId !== lease.ownerId) return;
        if (!updated) markWriterLost();
        else writerRef.current = updated;
      }).catch(() => {
        if (writerRef.current?.generation === lease.generation) markWriterLost(true);
      }).finally(() => { inFlight = false; });
    };
    const visible = () => { if (!document.hidden) renew(); };
    const timer = window.setInterval(renew, 4_000);
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [writerStatus, markWriterLost]);

  useEffect(() => {
    const cancel = () => clearStroke();
    window.addEventListener("blur", cancel);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [clearStroke]);

  useEffect(() => {
    if (writerStatus !== "owned" || awaitingRecoveryRef.current) return;
    // Initial starter has no checkpoint, but explicitly opened projects always
    // publish an initial snapshot, even before their first edit.
    if (history.revision === 0 && openSession === 0) return;
    const lease = writerRef.current;
    if (!lease) return;
    setRecoveryStatus("unsaved");
    const revision = history.revision;
    const snapshot = history.present;
    const session = openSession;
    const current = () => writerRef.current?.generation === lease.generation &&
      activeSession.current === session && activeRevision.current === revision;
    const timer = window.setTimeout(() => {
      if (!current()) return;
      setRecoveryStatus("saving");
      saveRecovery(snapshot, revision, lease).then(() => {
        if (current()) setRecoveryStatus("saved");
      }).catch((error: unknown) => {
        if (!current()) return;
        if (error instanceof RecoveryOwnershipLost) markWriterLost();
        else setRecoveryStatus("failed");
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
      const latest = await readRecovery();
      awaitingRecoveryRef.current = latest !== null;
      setCandidate(latest);
      setWriterStatus("owned");
      setWriterEpoch((epoch) => epoch + 1);
      setRecoveryStatus("unsaved");
      setNotice("This tab now owns local recovery. Choose the saved session or keep this workspace before editing.");
    } catch (error) {
      setWriterStatus("failed");
      setNotice(error instanceof Error ? error.message : "Could not take over local recovery.");
    } finally {
      setTakingOver(false);
    }
  };

  const keepCurrentWorkspace = () => {
    awaitingRecoveryRef.current = false;
    setCandidate(null);
    setWriterEpoch((epoch) => epoch + 1);
  };

  const navigate = (kind: ViewKind) => setView((current) => ({ kind, count: current.count + 1 }));
  const runUndo = useCallback(() => {
    if (!writerRef.current || awaitingRecoveryRef.current) return;
    clearStroke();
    setHistory((state) => undo(state));
  }, [clearStroke]);
  const runRedo = useCallback(() => {
    if (!writerRef.current || awaitingRecoveryRef.current) return;
    clearStroke();
    setHistory((state) => redo(state));
  }, [clearStroke]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      // Gesture cancellation must work even while a pointer has capture.
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        clearStroke();
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setNewProjectOpen(true);
        return;
      }
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProjectRef.current();
        return;
      }
      if (command && event.key.toLowerCase() === "d" && selectedId && mode === "model") {
        event.preventDefault();
        const node = historyRef.current.present.cuboids.find((item) => item.id === selectedId);
        if (node && !node.locked) {
          const duplicatedId = crypto.randomUUID();
          commitDocument((document) => duplicateCuboid(document, selectedId, duplicatedId));
          setSelectedId(duplicatedId);
        }
        return;
      }
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) runRedo(); else runUndo(); return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault(); runRedo(); return;
      }
      if (command || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "escape") { clearStroke(); setShapeMenuOpen(false); switchTool("select"); }
      if (key === "v") switchTool("select");
      if (key === "w" && mode === "model") switchTool("move");
      if (key === "r" && mode === "model") switchTool("resize");
      if (key === "b" && mode === "paint") switchTool("pencil");
      if (key === "e" && mode === "paint") switchTool("eraser");
      if (key === "g" && mode === "paint") switchTool("fill");
      if (key === "i" && mode === "paint") switchTool("eyedropper");
      if (key === "f") navigate("iso");
      if ((key === "delete" || key === "backspace") && selectedId && mode === "model") {
        commitDocument((document) => deleteCuboid(document, selectedId));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [mode, selectedId, runUndo, runRedo, commitDocument, clearStroke]);

  const saveLegacyJson = () => {
    try {
      const text = encodeProject(doc);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = safeFilename(doc.name);
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice("Legacy JSON backup download started. Keep this as an additional portable copy.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare the JSON backup.");
    }
  };

  const saveProject = async () => {
    if (savingProject) return;
    setSavingProject(true);
    try {
      const archive = await encodeNativeProject(doc);
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], {
        type: "application/zip"
      }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = nativeFilename(doc.name);
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice("Native .3dmc project download started. Keep the archive as your portable backup.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare your native project archive.");
    } finally {
      setSavingProject(false);
    }
  };

  saveProjectRef.current = saveProject;

  const downloadJavaPack = () => {
    if (exportStatus === "building") return;
    setExportStatus("building");
    const capturedRevision = history.revision;
    try {
      const pack = makeJava1214Pack(doc);
      const blob = new Blob([new Uint8Array(pack.zip)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = "3dmc-diamond-block-java-1.21.4-experimental.zip";
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setLastExport({ revision: capturedRevision, bytes: pack.zip.length });
      setExportStatus("started");
      setNotice("Experimental Java pack download started. This artifact still requires an in-game check.");
    } catch (error) {
      setExportStatus("idle");
      setNotice(error instanceof JavaExportBlocked
        ? error.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ")
        : error instanceof Error ? error.message : "Could not prepare the resource pack.");
    }
  };

  const downloadDiagnosticPack = () => {
    try {
      // This fixed, independently labeled specimen does not mutate or export
      // the current user's document. It remains a game-unverified fixture.
      const pack = makeJava1214Pack(makeSixFaceDiagnosticDocument());
      const url = URL.createObjectURL(new Blob([new Uint8Array(pack.zip)], {
        type: "application/zip"
      }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = "3dmc-java-1.21.4-six-face-orientation-test.zip";
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice("Six-face diagnostic download started. Install the unmodified ZIP in Java 1.21.4 and record screenshots/logs; game verification remains pending.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare the diagnostic pack.");
    }
  };

  const chooseTexture = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const session = activeSession.current;
    setTextureReading(true);
    try {
      const decoded = await decodeBrowserPng(file);
      if (activeSession.current !== session) return;
      setPendingTexture(decoded);
    } catch (error) {
      if (activeSession.current === session)
        setNotice(error instanceof Error ? error.message : "The PNG couldn't be imported.");
    } finally {
      setTextureReading(false);
    }
  };

  const applyImportedTexture = (policy: TextureImportPolicy) => {
    const image = pendingTexture;
    if (!image) return;
    try {
      if (textureImportMode === "new") {
        const source = activeTexture(historyRef.current.present);
        const width = policy === "use-png-size" ? image.width : source.width;
        const height = policy === "use-png-size" ? image.height : source.height;
        const pixels = resampleNearest(image.pixels, image.width, image.height, width, height);
        const newAsset = { id: "tex_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16),
          name: image.name, width, height, pixels };
        commitDocument(current => addTexture(current, newAsset));
        setNotice("New texture asset added. Assign it to individual faces in the Paint inspector.");
      } else {
        commitDocument(current => importTextureIntoDocument(current, image, policy));
        setNotice("Selected texture replaced with one undoable edit. Save a .3dmc backup.");
      }
      setPendingTexture(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The PNG couldn't be applied.");
    }
  };

  const downloadTexturePng = () => {
    try {
      const png = encodeRgbaPng(texture.width, texture.height, texture.pixels);
      const url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: "image/png" }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = texture.name.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80).replace(/\.png$/i, "") + ".png";
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice("PNG texture download started. Native .3dmc source preserves your complete editable project.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export PNG.");
    }
  };

  const chooseProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      let imported: EditorDocument;
      if (file.size > MAX_NATIVE_BYTES)
        throw new Error("File exceeds the 3 MB project import budget.");
      // Browsers may rename downloads or supply a temporary file without its
      // original extension. Inspect the ZIP signature before deciding codec.
      // Neither filename nor MIME type is trusted as validation of its contents.
      const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const nativeZip = signature[0] === 0x50 && signature[1] === 0x4b &&
        signature[2] === 0x03 && signature[3] === 0x04;
      if (nativeZip || file.name.toLowerCase().endsWith(".3dmc")) {
        imported = await decodeNativeProject(new Uint8Array(await file.arrayBuffer()));
      } else {
        if (file.size > MAX_PROJECT_BYTES)
          throw new Error("Legacy JSON project exceeds the 1.5 MB import limit.");
        imported = decodeProject(await file.text());
      }
      setPendingOpen(imported);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The project could not be opened.");
    }
  };

  const choosePack = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      setPendingPack({ status: "blocked", problems: ["This ZIP exceeds the 2 MB pack-import limit."] });
      return;
    }
    setPackInspecting(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPendingPack(inspectJava1214Pack(bytes));
    } catch (error) {
      setPendingPack({
        status: "blocked",
        problems: [error instanceof Error ? error.message : "Could not read the selected ZIP."]
      });
    } finally {
      setPackInspecting(false);
    }
  };

  const acceptOpen = async (document: EditorDocument): Promise<boolean> => {
    const lease = writerRef.current;
    if (!lease) {
      setNotice("Editing is paused. Take over local recovery before opening this document.");
      return false;
    }
    try {
      // Invalidate every queued save for the previous document before changing
      // the active source. Its content can never publish in the new session.
      const rotated = await rotateRecoveryWriter(lease);
      if (writerRef.current?.generation !== lease.generation) return false;
      writerRef.current = rotated;
      awaitingRecoveryRef.current = false;
      clearStroke();
      setWriterEpoch((epoch) => epoch + 1);
      setHistory(createHistory(document));
      setOpenSession((session) => session + 1);
      setSelectedId(document.cuboids[0]?.id ?? null);
      setSelectedFace("north");
      setSearch("");
      setShapeMenuOpen(false);
      setMode("model"); switchTool("select"); setPendingOpen(null); setPendingPack(null);
      setPendingTexture(null);
      setCandidate(null); setRecoveryStatus("unsaved");
      setDeletingTextureId(null); setDeleteReplacementId(null);
      setNotice("Project opened. Local recovery is updating; download a .3dmc archive for a portable backup.");
      return true;
    } catch (error) {
      markWriterLost();
      setNotice(error instanceof Error ? error.message : "Could not safely open the project.");
      return false;
    }
  };

  const createNewProject = async (options: NewProjectOptions): Promise<boolean> => {
    const created = makeNewProject(options);
    const opened = await acceptOpen(created);
    if (opened) setNewProjectOpen(false);
    return opened;
  };

  const addElement = () => {
    const id = crypto.randomUUID();
    commitDocument((current) => addCuboid(current, id));
    setSelectedId(id); setMode("model"); switchTool("select");
  };

  const addShape = (primitive: PrimitiveId) => {
    const id = crypto.randomUUID();
    commitDocument((current) => addPrimitive(current, id, primitive));
    setShapeMenuOpen(false);
    setSelectedId(id);
    setMode("model");
    switchTool("select");
  };

  const visibleTexture = textureById(doc, draftTextureId ?? doc.activeTextureId) ?? texture;
  const viewPixels = draftPixels ?? visibleTexture.pixels;
  const matching = doc.cuboids.filter((node) => node.name.toLowerCase().includes(search.toLowerCase()));
  const statusText = writerStatus === "blocked" ? "Other tab owns recovery" :
    writerStatus === "failed" ? "Recovery unavailable — download backup" :
    recoveryStatus === "saved" ? "Saved on this device" :
    recoveryStatus === "saving" ? "Saving locally…" :
    recoveryStatus === "failed" ? "Local save unavailable" :
    writerStatus === "checking" ? "Checking recovery ownership…" : "Unsaved local changes";

  return <div className={"app-shell" + (!sceneOpen ? " scene-collapsed" : "") +
    (!inspectorOpen ? " inspector-collapsed" : "")}>
    <header className="app-bar">
      <div className="brand" aria-label="3dMc Studio"><span className="brand-mark"><Box size={19} strokeWidth={2.3}/></span>
        <span>3dMc</span><span className="brand-divider"/><span className="brand-subtitle">Studio</span></div>
      <div className="project-header">
        <CommittedText label="Project name" className="project-title" value={doc.name}
          onCommit={(name) => commitDocument((current) => renameProject(current, name))} />
        <label className="profile-label" title="Target compatibility is experimental">
          Java · Static block
          <select className="target-select" aria-label="Minecraft target version"
            value={doc.target.candidateRelease} onChange={(event) => {
              const release = event.target.value === "26.3" ? "26.3" : "1.21.4";
              commitDocument((current) => setJavaCandidateRelease(current, release));
            }}>
            <option value="1.21.4">1.21.4 · Experimental</option>
            <option value="26.3">26.3 · Not supported</option>
          </select>
        </label>
      </div>
      <div className="app-actions">
        <div className="history-actions">
          <IconButton label="Undo (Ctrl/Cmd+Z)" disabled={!history.past.length} onClick={runUndo}><Undo2 size={17}/></IconButton>
          <IconButton label="Redo (Ctrl/Cmd+Shift+Z)" disabled={!history.future.length} onClick={runRedo}><Redo2 size={17}/></IconButton>
        </div>
        <button className="text-button quiet new-project-trigger" aria-label="New project"
          title="Create a new project" onClick={() => setNewProjectOpen(true)}>
          <FilePlus2 size={16}/>New
        </button>
        <input type="file" ref={fileRef} accept=".3dmc,.json,application/json,application/zip" hidden onChange={chooseProject} />
        <button className="text-button subtle" onClick={() => fileRef.current?.click()}
          title="Open a .3dmc native project or legacy JSON"><FolderOpen size={16}/>Open</button>
        <input type="file" ref={packFileRef} accept=".zip,application/zip" hidden onChange={choosePack}/>
        <button className="text-button subtle" onClick={() => packFileRef.current?.click()}
          disabled={packInspecting} title="Import a 3dMc experimental Java 1.21.4 resource pack">
          <PackageOpen size={16}/>{packInspecting ? "Inspecting…" : "Import pack"}
        </button>
        <button className="text-button quiet" onClick={() => void saveProject()}
          disabled={savingProject} title="Download native .3dmc source project">
          <Save size={16}/>{savingProject ? "Preparing…" : "Save project"}
        </button>
        <button className="text-button primary" onClick={() => setExportOpen(true)}
          title="Experimental pack export; in-game validation is pending">
          <Download size={16}/>Minecraft export
        </button>
      </div>
    </header>

    <nav className="mode-bar" aria-label="Editor modes">
      <div className="mode-spacer">
        <IconButton label={sceneOpen ? "Collapse scene panel" : "Expand scene panel"}
          onClick={() => setSceneOpen((current) => !current)} active={!sceneOpen}>
          <PanelLeftClose size={16}/></IconButton>
        <IconButton label={inspectorOpen ? "Collapse inspector" : "Expand inspector"}
          onClick={() => setInspectorOpen((current) => !current)} active={!inspectorOpen}>
          <PanelRightClose size={16}/></IconButton>
        <span className="workspace-dot"/><span>WORKSPACE</span>
      </div>
      <div className="mode-tabs" role="tablist" aria-label="Authoring mode">
        {(["model", "paint", "preview"] as const).map((item) =>
          <button key={item} role="tab" aria-selected={mode === item}
            className={"mode-tab" + (mode === item ? " current" : "")}
            onClick={() => changeMode(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}</button>)}
      </div>
      <div className="mode-options">
        <span className="mode-hint">{mode === "model" ? "Precision modeling" :
          mode === "paint" ? "Shared texture · pixel editor" : "Clean preview"}</span>
        <ChevronDown size={15} className="muted-icon" aria-hidden="true"/>
      </div>
    </nav>

    <div className="editor-grid">
      <aside className="scene-panel" aria-label="Scene hierarchy">
        <SectionHeading title="Scene" trailing={
          <button type="button" className="shape-trigger" aria-label="Add primitive"
            aria-expanded={shapeMenuOpen} aria-controls="shape-creation-menu"
            onClick={() => setShapeMenuOpen((value) => !value)}>
            <Plus size={15}/><span>Add shape</span><ChevronDown size={13}/>
          </button>
        }/>
        {shapeMenuOpen && <div id="shape-creation-menu" className="shape-creation-menu"
          role="menu" aria-label="Choose a primitive">
          <div className="shape-menu-title">ADD A CUBOID PRIMITIVE</div>
          {PRIMITIVE_PRESETS.map((shape) => <button type="button" role="menuitem"
            key={shape.id} onClick={() => addShape(shape.id)}>
            <Box size={16}/><span><strong>{shape.label}</strong>
              <small>{shape.description}</small></span>
          </button>)}
        </div>}
        <div className="scene-search"><Search size={15}/><input value={search} aria-label="Filter scene elements"
          onChange={(event) => setSearch(event.target.value)} placeholder="Find an element…"/></div>
        <div className="scene-list" role="listbox" aria-label="Scene elements">
          {doc.cuboids.length === 0 && <div className="scene-empty-start">
            <Box size={29} strokeWidth={1.2}/>
            <strong>Your canvas is ready</strong>
            <p>Add the first cuboid to begin shaping your asset.</p>
            <button onClick={addElement}><FilePlus2 size={14}/>Add first cuboid</button>
          </div>}
          {doc.cuboids.length > 0 && matching.length === 0 &&
            <div className="empty-list">No matching elements.
              <button onClick={() => setSearch("")}>Clear search</button>
            </div>}
          {matching.map((node) => <div role="option" aria-selected={selectedId === node.id}
            tabIndex={0} key={node.id} className={"scene-row" + (selectedId === node.id ? " selected" : "") +
              (!node.visible ? " hidden-row" : "")}
            onClick={() => setSelectedId(node.id)}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") {
              event.preventDefault(); setSelectedId(node.id);
            }}}>
            <Box size={15} strokeWidth={1.7}/><span className="scene-row-name">{node.name}</span>
            <button className="scene-row-action" aria-label={(node.visible ? "Hide " : "Show ") + node.name}
              title={node.visible ? "Hide" : "Show"} onClick={(event) => {
                event.stopPropagation(); commitDocument((current) => toggleFlag(current, node.id, "visible"));
              }}>{node.visible ? <Eye size={14}/> : <EyeOff size={14}/>}</button>
            <button className="scene-row-action" aria-label={(node.locked ? "Unlock " : "Lock ") + node.name}
              title={node.locked ? "Unlock" : "Lock"} onClick={(event) => {
                event.stopPropagation(); commitDocument((current) => toggleFlag(current, node.id, "locked"));
              }}>{node.locked ? <Lock size={14}/> : <LockOpen size={14}/>}</button>
          </div>)}
        </div>
        <div className="scene-footer">
          <SectionHeading title="Assets" trailing={<span className="counter">01</span>}/>
          <div className="texture-slot-list" role="group" aria-label="Texture assets">
            {doc.textures.map(asset => <div key={asset.id} className={
              "texture-slot" + (doc.activeTextureId === asset.id ? " active" : "")
            }>
              <button type="button" aria-label={"Select texture " + asset.name}
                aria-pressed={doc.activeTextureId === asset.id}
                className="texture-slot-select"
                onClick={() => {
                  clearStroke();
                  setHistory(state => {
                    const next = selectTexture(state.present, asset.id);
                    return next === state.present ? state : { ...state, present: next };
                  });
                }}>
                <Paintbrush size={16}/>
                <span><strong>{asset.name}</strong>
                  <small>{asset.width}×{asset.height} · {asset.id === "main" ? "Main" : asset.id.slice(-5)}</small>
                </span>
              </button>
              <button type="button" aria-label={"Delete texture " + asset.name}
                disabled={doc.textures.length <= 1}
                onClick={() => {
                  setDeletingTextureId(asset.id);
                  setDeleteReplacementId(doc.textures.find(t => t.id !== asset.id)?.id ?? null);
                }}><Trash2 size={14}/></button>
            </div>)}
          </div>
          <button type="button" className="texture-add-slot"
            disabled={doc.textures.length >= 16 || textureReading}
            onClick={() => { setTextureImportMode("new"); textureFileRef.current?.click(); }}>
            <Plus size={14}/>Add texture from PNG
            <span>{doc.textures.length}/16</span>
          </button>
          <div className="texture-selected-rename">
            <CommittedText key={texture.id} label="Texture name" className="texture-rename-input"
              value={texture.name}
              onCommit={(name) => commitDocument(current =>
                renameTexture(current, texture.id, name))}/>
          </div>
          <input ref={textureFileRef} type="file" accept=".png,image/png" hidden
            onChange={chooseTexture}/>
          <div className="texture-asset-actions">
            <button type="button" aria-label="Import texture PNG"
              disabled={textureReading}
              onClick={() => { setTextureImportMode("replace"); textureFileRef.current?.click(); }}>
              <ImagePlus size={14}/>{textureReading ? "Reading…" : "Import PNG"}
            </button>
            <button type="button" aria-label="Download texture PNG"
              onClick={downloadTexturePng}><Download size={14}/>Export PNG</button>
          </div>
          <button type="button" className="legacy-json-link" onClick={saveLegacyJson}
            title="Additional portable legacy .3dmc.json backup">Download legacy JSON backup</button>
          <div className="scene-meta"><span>Native source · .3dmc v2</span>
            <span>{doc.textures.length} textures</span></div>
        </div>
      </aside>

      <main className="stage" aria-label="3D editing workspace">
        <div className="stage-main">
          <div className="view-topbar">
            <div className="view-top-left">
              <span className="view-mode"><span className="view-spark"/> {mode === "preview" ? "PREVIEW" : "PERSPECTIVE"}</span>
              <span className="view-separator"/>
              <span>{mode === "paint" ? "TEXTURED · EDITABLE" : "TEXTURED"}</span>
            </div>
            <div className="view-top-right"><span className="dot"/><span>LOCAL SESSION</span></div>
          </div>
          <EditorViewport document={doc} pixels={viewPixels} selectedId={selectedId}
            selectedFace={selectedFace} onSelectFace={setSelectedFace}
            mode={mode} tool={tool} view={view} snap={snap} painting={!!draftPixels}
            cancelToken={cancelToken} draftTextureId={draftTextureId}
            onSelect={setSelectedId} onBeginPaint={beginPaint} onContinuePaint={continuePaint}
            onFinishPaint={finishPaint} onCancelPaint={clearStroke} onSample={samplePaint}
            onFill={fillPaint} onTransform={transform}/>
          {mode !== "preview" && <div className="tool-rail" aria-label="Editor tools">
            {mode === "model" ? <>
              <IconButton active={tool === "select"} label="Select (V)" onClick={() => switchTool("select")}><MousePointer2 size={18}/></IconButton>
              <IconButton active={tool === "move"} label="Move (W)" onClick={() => switchTool("move")}><Move3D size={18}/></IconButton>
              <IconButton active={tool === "resize"} label="Resize (R)" onClick={() => switchTool("resize")}><Maximize2 size={18}/></IconButton>
              <div className="rail-divider"/>
              <IconButton label="Add cuboid" onClick={addElement}><Plus size={19}/></IconButton>
            </> : <>
              <IconButton active={tool === "pencil"} label="Pixel pencil (B)" onClick={() => switchTool("pencil")}><Paintbrush size={18}/></IconButton>
              <IconButton active={tool === "eraser"} label="Pixel eraser (E)" onClick={() => switchTool("eraser")}><Eraser size={18}/></IconButton>
              <IconButton active={tool === "fill"} label="Fill connected area (G)" onClick={() => switchTool("fill")}><PaintBucket size={18}/></IconButton>
              <IconButton active={tool === "eyedropper"} label="Eyedropper (I)" onClick={() => switchTool("eyedropper")}><Pipette size={18}/></IconButton>
            </>}
          </div>}
          <div className="view-bottom">
            <div className="view-tool-caption">{mode === "paint" ?
              tool === "fill" ? "Fill a four-connected RGBA region · one undo step" :
              tool === "eraser" ? "Erase RGBA pixels in 3D or 2D · Esc cancels" :
              "Paint in 3D or on the texture sheet · Esc cancels stroke" :
              mode === "preview" ? "Preview only · No edits are applied in this mode" :
              tool === "select" ? "Select an element to inspect and edit · V" :
              tool === "move" ? "Drag a gizmo axis to move · W" : "Drag a gizmo axis to resize · R"}</div>
            <div className="camera-views">
              {(["iso", "front", "right", "top"] as const).map((kind) =>
                <button key={kind} className={view.kind === kind ? "current" : ""} onClick={() => navigate(kind)}
                  aria-label={"View " + kind}>{kind.toUpperCase()}</button>)}
              <IconButton label="Reset camera" onClick={() => navigate("iso")}><RotateCcw size={15}/></IconButton>
            </div>
          </div>
        </div>
        {mode === "paint" && <TextureSurface pixels={viewPixels} width={visibleTexture.width}
          height={visibleTexture.height} tool={tool} color={color} painting={!!draftPixels}
          face={selected?.material === "texture" &&
            selected.faces[selectedFace].textureId === visibleTexture.id
            ? selected.faces[selectedFace] : null}
          faceName={selected?.material === "texture" &&
            selected.faces[selectedFace].textureId === visibleTexture.id ? selectedFace : null}
          onBegin={beginPaint} onMove={continuePaint} onEnd={finishPaint} onCancel={clearStroke}
          onSample={samplePaint} onFill={fillPaint}/>}
      </main>

      <aside className="inspector-panel" aria-label="Properties inspector">
        <SectionHeading title="Inspector" trailing={<Settings2 size={17} className="section-muted-icon"/>}/>
        {selected ? <>
          <div className="selection-heading"><div className="selection-glyph"><Box size={20}/></div>
            <div><span>SELECTED ELEMENT</span><h2>{selected.name}</h2><p>Cuboid · {selected.material === "texture" ? "Textured surface" : "Solid material"}</p></div></div>
          <div className="inspector-scroll">
            {mode === "paint" && <FaceUVInspector selected={selected} face={selectedFace}
              setFace={(direction) => {
                clearStroke();
                setSelectedFace(direction);
                setHistory(state => {
                  const nextTextureId = selected.faces[direction].textureId;
                  const next = selectTexture(state.present, nextTextureId);
                  return next === state.present ? state : { ...state, present: next };
                });
              }} commitDocument={commitDocument}
              textures={doc.textures}
              textureWidth={faceAsset?.width ?? texture.width}
              textureHeight={faceAsset?.height ?? texture.height}/>}
            <div className="inspector-group">
              <SectionHeading title="Transform" trailing={<SlidersHorizontal size={15} className="section-muted-icon"/>}/>
              <AxisRow title="Position · corner" selected={selected} property="position" commitDocument={commitDocument}/>
              <AxisRow title="Size" selected={selected} property="size" commitDocument={commitDocument}/>
              <div className="form-group"><div className="form-caption">Move snap</div>
                <select aria-label="Move snap increment" className="select-control" value={snap}
                  onChange={(event) => setSnap(Number(event.target.value))}>
                  <option value={0.25}>0.25 unit</option><option value={0.5}>0.5 unit</option>
                  <option value={1}>1 unit</option><option value={2}>2 units</option>
                </select></div>
              {selected.locked && <div className="inline-note"><Lock size={14}/>Unlock this element to edit geometry.</div>}
              <div className="inline-note"><Info size={14}/>Rotation requires a verified Java target capability profile.</div>
            </div>
            <div className="inspector-group">
              <SectionHeading title="Appearance"/>
              <div className="form-group">
                <div className="form-caption">Surface type</div>
                <div className="material-switch" role="group" aria-label="Element material">
                  <button type="button" aria-pressed={selected.material === "solid"}
                    disabled={selected.locked}
                    onClick={() => commitDocument((current) =>
                      setCuboidMaterial(current, selected.id, "solid"))}>Solid color</button>
                  <button type="button" aria-pressed={selected.material === "texture"}
                    disabled={selected.locked}
                    onClick={() => commitDocument((current) =>
                      setCuboidMaterial(current, selected.id, "texture"))}>Painted</button>
                </div>
              </div>
              {selected.material === "texture" ? <>
                <div className="surface-summary"><div className="texture-swatch" style={{ background: "#d1a65d" }}/>
                  <div><strong>{texture.name}</strong><span>Shared texture · {texture.width} × {texture.height}</span></div></div>
                <button className="inline-action" onClick={() => changeMode("paint")}><Paintbrush size={15}/>Edit texture <span>→</span></button>
              </> : <>
                <div className="form-caption">Material color</div>
                <div className="color-control"><input type="color" aria-label="Element color"
                  value={selected.color} disabled={selected.locked} onChange={(event) =>
                    commitDocument((current) => setMaterialColor(current, selected.id, event.target.value))}/>
                  <span>{selected.color.toUpperCase()}</span></div>
              </>}
            </div>
            <div className="inspector-group">
              <SectionHeading title="Element actions"/>
              <div className="element-actions">
                <button disabled={selected.locked} onClick={() => {
                  const id = crypto.randomUUID();
                  commitDocument((current) => duplicateCuboid(current, selected.id, id));
                  setSelectedId(id);
                }}><Copy size={15}/>Duplicate</button>
                <button disabled={selected.locked} onClick={() =>
                  commitDocument((current) => deleteCuboid(current, selected.id))}><Trash2 size={15}/>Delete</button>
              </div>
              <div className="reorder-actions" role="group" aria-label="Scene ordering">
                <button type="button" aria-label="Move selected element up"
                  disabled={selected.locked || selectedIndex <= 0}
                  onClick={() => commitDocument((current) =>
                    moveCuboid(current, selected.id, "up"))}>
                  <ArrowUp size={14}/>Move up</button>
                <button type="button" aria-label="Move selected element down"
                  disabled={selected.locked || selectedIndex < 0 ||
                    selectedIndex >= doc.cuboids.length - 1}
                  onClick={() => commitDocument((current) =>
                    moveCuboid(current, selected.id, "down"))}>
                  <ArrowDown size={14}/>Move down</button>
              </div>
              <label className="form-caption rename-label" htmlFor="element-name">Element name</label>
              <CommittedText id="element-name" label="Element name" className="text-control"
                value={selected.name} disabled={selected.locked}
                onCommit={(name) => commitDocument((current) => renameCuboid(current, selected.id, name))}/>
            </div>
          </div>
        </> : <div className="empty-inspector"><Box size={28}/><h2>Nothing selected</h2>
          <p>Choose an element in the scene or click a visible part in the viewport.</p>
          <button className="text-button quiet" onClick={addElement}><Plus size={15}/>Add cuboid</button></div>}
        {mode === "paint" && <div className="paint-options">
          <SectionHeading title="Paint controls"/>
          <div className="paint-import-actions">
            <button type="button" onClick={() => {
              setTextureImportMode("replace"); textureFileRef.current?.click();
            }} disabled={textureReading}><ImagePlus size={14}/>Replace PNG</button>
            <button type="button" onClick={downloadTexturePng}><Download size={14}/>Export PNG</button>
          </div>
          <div className="form-caption">Brush color</div>
          <div className="palette">{SWATCHES.map((swatch) =>
            <button key={swatch} style={{ background: swatch }} className={swatch === color ? "chosen" : ""}
              aria-label={"Choose color " + swatch} title={swatch}
              onClick={() => setColor(swatch)}>{swatch === color && <Check size={14}/>}</button>)}</div>
          <div className="color-control"><input type="color" aria-label="Custom paint color"
            value={color} onChange={(event) => setColor(event.target.value)}/><span>{color.toUpperCase()}</span></div>
          <div className="paint-tool-note" role="status">
            {tool === "fill" ? "Bucket fills only connected pixels with exactly matching RGBA values." :
              tool === "eraser" ? "Eraser makes pixels fully transparent (alpha 0). Java export requires an opaque texture." :
              "Pencil paints opaque pixels. Click the eyedropper to sample an RGB color."}
          </div>
          <div className="form-caption">Brush size</div>
          <div className="segmented">{([1, 2, 4] as const).map((size) =>
            <button key={size} aria-pressed={brushSize === size} disabled={tool === "fill" || tool === "eyedropper"}
              onClick={() => setBrushSize(size)}>
              {size} px</button>)}</div>
        </div>}
        <div className="inspector-bottom"><Info size={15}/>
          <span>Experimental Java exporter · in-game verification pending</span></div>
      </aside>
    </div>

    <footer className="status-bar">
      <div aria-live="polite" className={"save-status status-" + recoveryStatus}><span className="status-indicator"/>
        {statusText}</div>
      <span className="status-divider"/>
      <button onClick={() => setNotice("Recovery uses a single-tab writer generation with atomic checkpoints and a verified previous version. Another tab must explicitly take over. Browser storage is not a portable backup; download a project copy.")}>Recovery details <Info size={12}/></button>
      <div className="status-space"/>
      <span>{selected ? "1 selected · " + selected.name : doc.cuboids.length + " elements"}</span>
      <span className="status-divider"/><span>Grid {snap} unit</span>
      <span className="status-divider"/><span className="status-profile">Java pack experiment</span>
    </footer>

    {!bootChecked && <div className="boot-loader" aria-live="polite">Checking local recovery ownership…</div>}
    {bootChecked && writerStatus !== "owned" && <div className="writer-shade">
      <div className="writer-modal" role="dialog" aria-modal="true" aria-labelledby="writer-title">
        <div className="modal-icon"><Lock size={22}/></div>
        <h2 id="writer-title">{writerStatus === "blocked"
          ? "Another tab controls local recovery" : "Local recovery isn't available"}</h2>
        <p>{writerStatus === "blocked"
          ? "This editor is read-only here to protect the other tab's saved work. You can download the current project, or explicitly take over editing. A suspended older tab will no longer be able to overwrite this tab's checkpoints."
          : "You can still download the current project as a portable backup. Retry ownership only when you're ready to edit."}</p>
        <div className="modal-actions">
          <button className="text-button quiet" onClick={saveProject}>
            <Save size={15}/>Download backup
          </button>
          <button className="text-button primary" disabled={takingOver}
            onClick={takeOverWriter}>{takingOver ? "Taking over…" : "Take over editing"}</button>
        </div>
      </div>
    </div>}
    {candidate && bootChecked && writerStatus === "owned" &&
      <div className="recovery-screen-shade" aria-hidden="true" />}
    {candidate && bootChecked && writerStatus === "owned" && <div className="recovery-banner" role="status">
      <div><Info size={19}/><p><strong>Continue a local session?</strong>
        <span>{candidate.document.name} · {getFilename(new Date(candidate.savedAt))}
          {candidate.fallback ? " · Previous verified checkpoint" : ""}</span></p></div>
      <button className="text-button quiet" onClick={keepCurrentWorkspace}>Keep current workspace</button>
      <button className="text-button primary" onClick={() => acceptOpen(candidate.document)}>Recover project</button>
    </div>}
    {notice && <div role="status" className="notice-toast"><Info size={17}/><span>{notice}</span>
      <button onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button></div>}
    {exportOpen && <div className="modal-shade"><div className="modal export-modal" role="dialog"
      aria-modal="true" aria-labelledby="pack-export-title"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setExportOpen(false); } }}>
      <div className="export-heading">
        <div className="modal-icon"><Download size={22}/></div>
        <div><span className="export-kicker">OUTPUT EXPERIMENT · NOT GAME VERIFIED</span>
          <h2 id="pack-export-title">Experimental resource pack</h2></div>
      </div>
      <p>Build a Java Edition <strong>1.21.4</strong> resource pack (format <strong>46</strong>)
        that replaces the visual model of <strong>minecraft:diamond_block</strong>.
        Gameplay, lighting, and collision do not change.</p>
      <label className="export-target-control" htmlFor="export-target">
        <span>Target profile</span>
        <select id="export-target" className="select-control"
          value={doc.target.candidateRelease} onChange={(event) => {
            const release = event.target.value === "26.3" ? "26.3" : "1.21.4";
            commitDocument((current) => setJavaCandidateRelease(current, release));
          }}>
          <option value="1.21.4">Java Edition 1.21.4 · Export experiment</option>
          <option value="26.3">Java Edition 26.3 · Unsupported</option>
        </select>
      </label>
      <div className="export-file-list" aria-label="Files in the export">
        <strong>Output files</strong>
        <code>{JAVA_PACK_PATHS.metadata}</code>
        <code>{JAVA_PACK_PATHS.blockstate}</code>
        <code>{JAVA_PACK_PATHS.model}</code>
        <code>{JAVA_PACK_PATHS.mainTexture}</code>
        <span>Plus {doc.cuboids.filter((node) => node.material === "solid").length} generated solid-color texture files.</span>
      </div>
      <section className="diagnostic-fixture" aria-label="Six-face compatibility fixture">
        <div>
          <strong>Six-face orientation test</strong>
          <p>Download a separate, reproducible 64×64 diagnostic cube with labeled faces,
            upward arrows and asymmetric corner markers. It does not use or change your current project.
            Minecraft Java 1.21.4 verification is still pending.</p>
        </div>
        <button className="text-button quiet" onClick={downloadDiagnosticPack}>
          <Download size={15}/>Download six-face diagnostic ZIP
        </button>
      </section>
      <div className="export-issues">
        <strong>Preflight · {exportIssues.filter((issue) => issue.severity === "error").length} blockers</strong>
        {exportIssues.map((issue) => <div key={issue.code + (issue.nodeId ?? "")}
          className={"export-issue issue-" + issue.severity}>
          {issue.severity === "error" ? <AlertCircle size={15}/> : <Info size={15}/>}
          <span><b>{issue.severity === "error" ? "Fix required" : "Notice"}</b>
            {issue.message}</span>
          {issue.nodeId && <button onClick={() => {
            setSelectedId(issue.nodeId!); setMode("model"); switchTool("select"); setExportOpen(false);
          }}>Locate</button>}
        </div>)}
      </div>
      {lastExport && <p className="export-last">
        Last download started for revision {lastExport.revision} ({Math.round(lastExport.bytes / 1024)} KiB).
        {lastExport.revision !== history.revision ? " New changes have not been exported." : ""}
      </p>}
      <div className="modal-actions">
        <button className="text-button quiet" autoFocus onClick={() => setExportOpen(false)}>Close</button>
        <button className="text-button primary" onClick={downloadJavaPack}
          disabled={exportStatus === "building" || exportIssues.some((issue) => issue.severity === "error")}>
          <Download size={15}/>{exportStatus === "building" ? "Building…" : "Download experimental ZIP"}
        </button>
      </div>
    </div></div>}

    {deletingTextureId && <div className="modal-shade">
      <div className="modal import-modal" role="dialog" aria-modal="true"
        aria-labelledby="delete-texture-heading">
        <h2 id="delete-texture-heading">Delete texture asset?</h2>
        <p>This will remove <strong>{textureById(doc, deletingTextureId)?.name}</strong>.
          Its {affectedFaces(doc, deletingTextureId).length} assigned faces
          must be remapped to an existing texture. The operation is one undoable change.</p>
        <label className="form-caption" htmlFor="delete-replacement">Replacement texture</label>
        <select id="delete-replacement" className="select-control"
          value={deleteReplacementId ?? ""}
          onChange={event => setDeleteReplacementId(event.target.value)}>
          {doc.textures.filter(t => t.id !== deletingTextureId).map(t =>
            <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="delete-impact" aria-label="Affected face bindings">
          {affectedFaces(doc, deletingTextureId).slice(0, 24).map((entry, index) =>
            <span key={entry.nodeId + entry.face + index}>{entry.name}: {entry.face}</span>)}
          {affectedFaces(doc, deletingTextureId).length > 24 && <span>And more…</span>}
        </div>
        <div className="modal-actions">
          <button className="text-button quiet" onClick={() => setDeletingTextureId(null)}>Cancel</button>
          <button className="text-button primary" disabled={!deleteReplacementId}
            onClick={() => {
              const currentId = deletingTextureId;
              const fallback = deleteReplacementId;
              if (!fallback) return;
              commitDocument(current => removeTexture(current, currentId, fallback));
              setDeletingTextureId(null); setDeleteReplacementId(null);
              setNotice("Texture removed; affected face assignments were remapped in one undoable edit.");
            }}>Remove and remap</button>
        </div>
      </div>
    </div>}
    {pendingTexture && <TextureImportDialog image={pendingTexture}
      isAdding={textureImportMode === "new"}
      currentWidth={texture.width} currentHeight={texture.height}
      paintedFaces={doc.cuboids.filter((node) => node.material === "texture").length}
      onClose={() => setPendingTexture(null)}
      onConfirm={applyImportedTexture}/>}
    {pendingPack && <div className="modal-shade">
      <div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="pack-import-title"
        onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setPendingPack(null); } }}>
        <div className="import-header">
          <div className="modal-icon"><PackageOpen size={22}/></div>
          <div>
            <span className="export-kicker">IMPORT PREFLIGHT · JAVA 1.21.4</span>
            <h2 id="pack-import-title">
              {pendingPack.status === "editable" ? "Import editable block pack?" : "Pack cannot be safely imported"}
            </h2>
          </div>
        </div>
        {pendingPack.status === "editable" ? <>
          <p>This pack matches the supported 3dMc experimental export format. Import it as a
            <strong> new editable project</strong> with its geometry and opaque texture pixels.</p>
          <div className="import-summary">
            <div><span>ELEMENTS</span><strong>{pendingPack.document.cuboids.length}</strong></div>
            <div><span>TEXTURE</span><strong>{activeTexture(pendingPack.document).width} × {activeTexture(pendingPack.document).height}</strong></div>
            <div><span>FILES</span><strong>{pendingPack.paths.length}</strong></div>
          </div>
          <div className="import-notices">
            <h3>What to know before importing</h3>
            {pendingPack.notices.map((message) => <p key={message}><Info size={15}/>{message}</p>)}
          </div>
          <p className="import-consequence">Your current workspace will be replaced. Download your current native
            project first if you need an independent copy. The original ZIP is never modified.</p>
          <div className="modal-actions">
            <button className="text-button quiet" autoFocus onClick={() => setPendingPack(null)}>Cancel</button>
            <button className="text-button primary" onClick={() => {
              const imported = pendingPack.document;
              setPendingPack(null);
              acceptOpen(imported);
              setNotice("Experimental pack imported as an editable project. Download a native project backup to retain your work.");
            }}><PackageOpen size={15}/>Import as editable project</button>
          </div>
        </> : <>
          <p>No changes were made to your project. This importer accepts only the exact
            structure produced by the 3dMc experimental Java 1.21.4 exporter.</p>
          <div className="import-blockers">
            {pendingPack.problems.map((message) =>
              <p key={message}><AlertCircle size={16}/><span>{message}</span></p>)}
          </div>
          <p className="import-consequence">Other resource packs may use valid Minecraft features that this
            editor cannot yet preserve. They are blocked rather than partially converted.</p>
          <div className="modal-actions">
            <button className="text-button primary" autoFocus onClick={() => setPendingPack(null)}>Keep working</button>
          </div>
        </>}
      </div>
    </div>}
    {newProjectOpen && <NewProjectDialog
      onClose={() => setNewProjectOpen(false)}
      onCreate={createNewProject} onBackup={saveProject}/>}
    {pendingOpen && <div className="modal-shade"><div className="modal" role="dialog" aria-modal="true"
      aria-labelledby="open-dialog-title">
      <div className="modal-icon"><AlertCircle size={23}/></div>
      <h2 id="open-dialog-title">Open this project?</h2>
      <p><strong>{pendingOpen.name}</strong> will replace the current workspace. Download your current project first if you want a portable copy.</p>
      <div className="modal-actions">
        <button className="text-button quiet" onClick={() => setPendingOpen(null)}>Cancel</button>
        <button className="text-button primary" onClick={() => acceptOpen(pendingOpen)}>Open project</button>
      </div>
    </div></div>}
  </div>;
}

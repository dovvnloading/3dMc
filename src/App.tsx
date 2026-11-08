import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle, Box, Check, ChevronDown, Copy, Download, Eye, EyeOff,
  FolderOpen, PackageOpen, Info, Lock, LockOpen, Maximize2, PanelLeftClose, PanelRightClose,
  MousePointer2, Move3D, Paintbrush, Pipette, Plus, Redo2, RotateCcw,
  Save, Search, Settings2, SlidersHorizontal, Trash2, Undo2
} from "lucide-react";
import {
  addCuboid, createSampleDocument, deleteCuboid, duplicateCuboid,
  renameCuboid, renameProject, setAxisValue, setJavaCandidateRelease, setMaterialColor, setTexturePixels,
  toggleFlag, updateCuboid
} from "./editor/domain";
import type { Cuboid, EditorDocument, FaceDirection, Vec3 } from "./editor/domain";
import { commit, createHistory, redo, undo } from "./editor/history";
import type { History } from "./editor/history";
import { decodeProject, encodeProject, MAX_PROJECT_BYTES, safeFilename } from "./editor/project";
import { readRecovery, saveRecovery } from "./editor/recovery";
import type { RecoveryCandidate } from "./editor/recovery";
import { drawStroke, readHex } from "./editor/pixels";
import type { Texel } from "./editor/pixels";
import { EditorViewport } from "./components/EditorViewport";
import type { Mode, Tool, ViewKind, ViewRequest } from "./components/EditorViewport";
import { TextureSurface } from "./components/TextureSurface";
import { FaceUVInspector } from "./components/FaceUVInspector";
import { inspectJava1214Pack } from "./import/javaPack";
import type { PackImportReport } from "./import/javaPack";
import {
  inspectJava1214, JavaExportBlocked, JAVA_PACK_PATHS, makeJava1214Pack
} from "./export/javaBlock";

type RecoveryStatus = "unsaved" | "saving" | "saved" | "failed";
type CommitFn = (document: EditorDocument) => EditorDocument;
type Drag = { pixels: number[]; previous: Texel; face: string };
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
  const exportIssues = useMemo(() => inspectJava1214(doc), [doc]);
  const [selectedId, setSelectedId] = useState<string | null>("body");
  const [selectedFace, setSelectedFace] = useState<FaceDirection>("north");
  const selected = doc.cuboids.find((node) => node.id === selectedId) ?? null;
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
  const drag = useRef<Drag | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus>("unsaved");
  const [candidate, setCandidate] = useState<RecoveryCandidate | null>(null);
  const [bootChecked, setBootChecked] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<EditorDocument | null>(null);
  const [pendingPack, setPendingPack] = useState<PackImportReport | null>(null);
  const [packInspecting, setPackInspecting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "building" | "started">("idle");
  const [lastExport, setLastExport] = useState<{ revision: number; bytes: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const packFileRef = useRef<HTMLInputElement>(null);
  const activeRevision = useRef(history.revision);
  activeRevision.current = history.revision;

  const commitDocument = useCallback((operation: CommitFn) => {
    setHistory((current) => commit(current, operation(current.present)));
  }, []);

  const clearStroke = useCallback(() => { drag.current = null; setDraftPixels(null); }, []);
  const beginPaint = useCallback((texel: Texel, face: string) => {
    if (drag.current) return;
    const active = historyRef.current.present.texture;
    const pixels = drawStroke(active.pixels, active.width, active.height, texel, texel, color, brushSize);
    drag.current = { pixels, previous: texel, face };
    setDraftPixels(pixels);
  }, [color, brushSize]);
  const continuePaint = useCallback((texel: Texel, face: string) => {
    const current = drag.current;
    if (!current) return;
    const texture = historyRef.current.present.texture;
    const previous = current.face === face ? current.previous : texel;
    const pixels = drawStroke(current.pixels, texture.width, texture.height,
      previous, texel, color, brushSize);
    drag.current = { pixels, previous: texel, face };
    setDraftPixels(pixels);
  }, [color, brushSize]);
  const finishPaint = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    commitDocument((document) => setTexturePixels(document, current.pixels));
    setDraftPixels(null);
  }, [commitDocument]);
  const samplePaint = useCallback((texel: Texel) => {
    const texture = historyRef.current.present.texture;
    setColor(readHex(texture.pixels, texture.width, texel));
  }, []);

  const changeMode = (next: Mode) => {
    clearStroke();
    setMode(next);
    setTool(next === "paint" ? "pencil" : "select");
  };

  const transform = useCallback((id: string, position: Vec3, scale: Vec3) => {
    commitDocument((document) => updateCuboid(document, id, (node) => {
      const originalCenter = [
        (node.from[0] + node.to[0] - 16) / 32,
        (node.from[1] + node.to[1]) / 32,
        (node.from[2] + node.to[2] - 16) / 32
      ];
      const delta = position.map((value, i) => (value - originalCenter[i]!) * 16);
      const oldCenter = node.from.map((value, i) => (value + node.to[i]!) / 2);
      const from = node.from.map((value, i) => {
        if (Math.abs(scale[i]! - 1) < 0.00001) return value + delta[i]!;
        const newSize = (node.to[i]! - value) * scale[i]!;
        return oldCenter[i]! + delta[i]! - newSize / 2;
      }) as [number, number, number];
      const to = node.to.map((value, i) => {
        if (Math.abs(scale[i]! - 1) < 0.00001) return value + delta[i]!;
        const newSize = (value - node.from[i]!) * scale[i]!;
        return oldCenter[i]! + delta[i]! + newSize / 2;
      }) as [number, number, number];
      const rounded = (values: [number, number, number]): [number, number, number] =>
        values.map((value) => Math.round(value * 10000) / 10000) as [number, number, number];
      if (node.from.every((value, i) => Math.abs(value - from[i]!) < 0.00001) &&
          node.to.every((value, i) => Math.abs(value - to[i]!) < 0.00001)) return node;
      return { ...node, from: rounded(from), to: rounded(to) };
    }));
  }, [commitDocument]);

  useEffect(() => {
    let alive = true;
    readRecovery().then((result) => {
      if (alive) { setCandidate(result); setBootChecked(true); }
    }).catch(() => {
      if (alive) { setRecoveryStatus("failed"); setBootChecked(true); }
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    // The starter has no recovery history, but an explicitly opened project
    // must publish its revision-zero snapshot even before its first edit.
    if (history.revision === 0 && openSession === 0) return;
    setRecoveryStatus("unsaved");
    const revision = history.revision;
    const snapshot = history.present;
    const session = openSession;
    const timer = window.setTimeout(() => {
      setRecoveryStatus("saving");
      saveRecovery(snapshot, revision).then(() => {
        if (activeSession.current === session && activeRevision.current === revision) setRecoveryStatus("saved");
      }).catch(() => { if (activeSession.current === session && activeRevision.current === revision) setRecoveryStatus("failed"); });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [history, openSession]);

  const navigate = (kind: ViewKind) => setView((current) => ({ kind, count: current.count + 1 }));
  const runUndo = useCallback(() => { clearStroke(); setHistory((state) => undo(state)); }, [clearStroke]);
  const runRedo = useCallback(() => { clearStroke(); setHistory((state) => redo(state)); }, [clearStroke]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault(); if (event.shiftKey) runRedo(); else runUndo(); return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault(); runRedo(); return;
      }
      if (command || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "escape") { clearStroke(); setTool("select"); }
      if (key === "v") setTool("select");
      if (key === "w" && mode === "model") setTool("move");
      if (key === "r" && mode === "model") setTool("resize");
      if (key === "b" && mode === "paint") setTool("pencil");
      if (key === "i" && mode === "paint") setTool("eyedropper");
      if (key === "f") navigate("iso");
      if ((key === "delete" || key === "backspace") && selectedId && mode === "model") {
        commitDocument((document) => deleteCuboid(document, selectedId));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [mode, selectedId, runUndo, runRedo, commitDocument, clearStroke]);

  const saveProject = () => {
    try {
      const json = encodeProject(doc);
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = globalThis.document.createElement("a");
      link.href = url;
      link.download = safeFilename(doc.name);
      globalThis.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setNotice("Project download started. Keep the file as a portable backup.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not prepare your project.");
    }
  };

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

  const chooseProject = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error("File exceeds the 1.5 MB prototype limit.");
      const imported = decodeProject(await file.text());
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

  const acceptOpen = (document: EditorDocument) => {
    clearStroke();
    setHistory(createHistory(document));
    setOpenSession((session) => session + 1);
    setSelectedId(document.cuboids[0]?.id ?? null);
    setSelectedFace("north");
    setMode("model"); setTool("select"); setPendingOpen(null);
    setCandidate(null); setRecoveryStatus("unsaved");
    setNotice("Project opened. A portable copy has not been written by this session.");
  };

  const addElement = () => {
    const id = crypto.randomUUID();
    commitDocument((current) => addCuboid(current, id));
    setSelectedId(id); setMode("model"); setTool("select");
  };

  const viewPixels = draftPixels ?? doc.texture.pixels;
  const matching = doc.cuboids.filter((node) => node.name.toLowerCase().includes(search.toLowerCase()));
  const statusText = recoveryStatus === "saved" ? "Saved on this device" :
    recoveryStatus === "saving" ? "Saving locally…" :
    recoveryStatus === "failed" ? "Local save unavailable" : "Unsaved local changes";

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
        <input type="file" ref={fileRef} accept=".json,application/json" hidden onChange={chooseProject} />
        <button className="text-button subtle" onClick={() => fileRef.current?.click()} title="Open a .3dmc.json project"><FolderOpen size={16}/>Open</button>
        <input type="file" ref={packFileRef} accept=".zip,application/zip" hidden onChange={choosePack}/>
        <button className="text-button subtle" onClick={() => packFileRef.current?.click()}
          disabled={packInspecting} title="Import a 3dMc experimental Java 1.21.4 resource pack">
          <PackageOpen size={16}/>{packInspecting ? "Inspecting…" : "Import pack"}
        </button>
        <button className="text-button quiet" onClick={saveProject}><Save size={16}/>Save project</button>
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
        <SectionHeading title="Scene" trailing={<IconButton label="Add cuboid" onClick={addElement}><Plus size={17}/></IconButton>}/>
        <div className="scene-search"><Search size={15}/><input value={search} aria-label="Filter scene elements"
          onChange={(event) => setSearch(event.target.value)} placeholder="Find an element…"/></div>
        <div className="scene-list" role="listbox" aria-label="Scene elements">
          {matching.length === 0 && <div className="empty-list">No matching elements. <button onClick={() => setSearch("")}>Clear search</button></div>}
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
          <div className="asset-entry"><div className="asset-icon"><Paintbrush size={17}/></div>
            <div><strong>{doc.texture.name}</strong><span>{doc.texture.width} × {doc.texture.height} · RGBA</span></div></div>
          <div className="scene-meta"><span>Prototype format</span><span>1 shared texture</span></div>
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
            onSelect={setSelectedId} onBeginPaint={beginPaint} onContinuePaint={continuePaint}
            onFinishPaint={finishPaint} onCancelPaint={clearStroke} onSample={samplePaint}
            onTransform={transform}/>
          {mode !== "preview" && <div className="tool-rail" aria-label="Editor tools">
            {mode === "model" ? <>
              <IconButton active={tool === "select"} label="Select (V)" onClick={() => setTool("select")}><MousePointer2 size={18}/></IconButton>
              <IconButton active={tool === "move"} label="Move (W)" onClick={() => setTool("move")}><Move3D size={18}/></IconButton>
              <IconButton active={tool === "resize"} label="Resize (R)" onClick={() => setTool("resize")}><Maximize2 size={18}/></IconButton>
              <div className="rail-divider"/>
              <IconButton label="Add cuboid" onClick={addElement}><Plus size={19}/></IconButton>
            </> : <>
              <IconButton active={tool === "pencil"} label="Pixel pencil (B)" onClick={() => setTool("pencil")}><Paintbrush size={18}/></IconButton>
              <IconButton active={tool === "eyedropper"} label="Eyedropper (I)" onClick={() => setTool("eyedropper")}><Pipette size={18}/></IconButton>
            </>}
          </div>}
          <div className="view-bottom">
            <div className="view-tool-caption">{mode === "paint" ?
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
        {mode === "paint" && <TextureSurface pixels={viewPixels} width={doc.texture.width}
          height={doc.texture.height} tool={tool} color={color} painting={!!draftPixels}
          face={selected?.material === "texture" ? selected.faces[selectedFace] : null}
          faceName={selected?.material === "texture" ? selectedFace : null}
          onBegin={beginPaint} onMove={continuePaint} onEnd={finishPaint} onCancel={clearStroke}
          onSample={samplePaint}/>}
      </main>

      <aside className="inspector-panel" aria-label="Properties inspector">
        <SectionHeading title="Inspector" trailing={<Settings2 size={17} className="section-muted-icon"/>}/>
        {selected ? <>
          <div className="selection-heading"><div className="selection-glyph"><Box size={20}/></div>
            <div><span>SELECTED ELEMENT</span><h2>{selected.name}</h2><p>Cuboid · {selected.id === "body" ? "Textured surface" : "Solid material"}</p></div></div>
          <div className="inspector-scroll">
            {mode === "paint" && <FaceUVInspector selected={selected} face={selectedFace}
              setFace={setSelectedFace} commitDocument={commitDocument}
              textureWidth={doc.texture.width} textureHeight={doc.texture.height}/>}
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
              {selected.material === "texture" ? <>
                <div className="surface-summary"><div className="texture-swatch" style={{ background: "#d1a65d" }}/>
                  <div><strong>{doc.texture.name}</strong><span>Shared texture · {doc.texture.width} × {doc.texture.height}</span></div></div>
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
          <div className="form-caption">Brush color</div>
          <div className="palette">{SWATCHES.map((swatch) =>
            <button key={swatch} style={{ background: swatch }} className={swatch === color ? "chosen" : ""}
              aria-label={"Choose color " + swatch} title={swatch}
              onClick={() => setColor(swatch)}>{swatch === color && <Check size={14}/>}</button>)}</div>
          <div className="color-control"><input type="color" aria-label="Custom paint color"
            value={color} onChange={(event) => setColor(event.target.value)}/><span>{color.toUpperCase()}</span></div>
          <div className="form-caption">Pencil size</div>
          <div className="segmented">{([1, 2, 4] as const).map((size) =>
            <button key={size} aria-pressed={brushSize === size} onClick={() => setBrushSize(size)}>
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
      <button onClick={() => setNotice("Local recovery protects acknowledged checkpoints in this browser only. Download the project as a portable backup. Concurrent-tab editing is not yet guarded.")}>Recovery details <Info size={12}/></button>
      <div className="status-space"/>
      <span>{selected ? "1 selected · " + selected.name : doc.cuboids.length + " elements"}</span>
      <span className="status-divider"/><span>Grid {snap} unit</span>
      <span className="status-divider"/><span className="status-profile">Java pack experiment</span>
    </footer>

    {!bootChecked && <div className="boot-loader" aria-live="polite">Checking local recovery…</div>}
    {candidate && bootChecked && <div className="recovery-banner" role="status">
      <div><Info size={19}/><p><strong>Continue a local session?</strong>
        <span>{candidate.document.name} · {getFilename(new Date(candidate.savedAt))}
          {candidate.fallback ? " · Previous verified checkpoint" : ""}</span></p></div>
      <button className="text-button quiet" onClick={() => setCandidate(null)}>Start sample</button>
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
      <div className="export-issues">
        <strong>Preflight · {exportIssues.filter((issue) => issue.severity === "error").length} blockers</strong>
        {exportIssues.map((issue) => <div key={issue.code + (issue.nodeId ?? "")}
          className={"export-issue issue-" + issue.severity}>
          {issue.severity === "error" ? <AlertCircle size={15}/> : <Info size={15}/>}
          <span><b>{issue.severity === "error" ? "Fix required" : "Notice"}</b>
            {issue.message}</span>
          {issue.nodeId && <button onClick={() => {
            setSelectedId(issue.nodeId!); setMode("model"); setTool("select"); setExportOpen(false);
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
            <div><span>TEXTURE</span><strong>{pendingPack.document.texture.width} × {pendingPack.document.texture.height}</strong></div>
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

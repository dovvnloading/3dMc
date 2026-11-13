import { useState } from "react";
import { BookOpen, FolderArchive, LayoutPanelTop, Scan, Shapes, UnfoldHorizontal } from "lucide-react";
import type { EditorDocument, FaceDirection } from "../editor/domain";
import { activeTexture } from "../editor/domain";
import type { PixelClipboard } from "../editor/regions";
import type { Mode } from "./EditorViewport";
import type { PackSnapshot } from "../pack/packSession";
import type { NativePackProject } from "../editor/nativePackArchive";
import { CreatorDialog } from "./CreatorDialog";
import { TextureRegionDialog } from "./TextureRegionDialog";
import { FaceToolsDialog } from "./FaceToolsDialog";
import { ExternalModelDialog } from "./ExternalModelDialog";
import { ProjectLibraryDialog } from "./ProjectLibraryDialog";
import "./creator-tools.css";

type Panel = "region" | "face" | "import" | "library" | "workspace" | null;
export function CreatorTools({ document, revision, pack, mode, selectedId, face, onApply, onOpen, onOpenPack, onBackup, onLayout, onCancelGesture }: {
  document: EditorDocument; revision: number; pack?: PackSnapshot | null; mode: Mode; selectedId: string | null; face: FaceDirection;
  onApply: (operation: (document: EditorDocument) => EditorDocument) => boolean;
  onOpen: (document: EditorDocument) => Promise<boolean>;
  onOpenPack: (pack: NativePackProject) => Promise<boolean>; onBackup: () => Promise<void>;
  onLayout: (layout: "balanced" | "canvas" | "paint") => void; onCancelGesture: () => void;
}) {
  const [panel, setPanel] = useState<Panel>(null), [source, setSource] = useState<EditorDocument | null>(null);
  const [clipboard, setClipboard] = useState<PixelClipboard | null>(null);
  // A snapshot and its revision must come from the same render, including in pack mode.
  const [librarySource, setLibrarySource] = useState<{
    source: EditorDocument; revision: number; pack?: PackSnapshot | null;
  } | null>(null);
  const open = (next: Panel) => {
    onCancelGesture(); setSource(document);
    if (next === "library") setLibrarySource({ source: document, revision, pack });
    setPanel(next);
  };
  const close = () => { setPanel(null); setSource(null); setLibrarySource(null); };
  const node = document.cuboids.find(item => item.id === selectedId);
  return <div className="creator-tools" aria-label="Creator workflow tools">
    {mode === "paint" && <>
      <button type="button" onClick={() => open("region")} title="Select, copy, paste and mirror exact RGBA regions"><Scan size={14}/><span>Pixel region</span></button>
      <button type="button" disabled={!node || node.material !== "texture"} onClick={() => open("face")} title="UV sharing, reverse bounds and independent face textures"><UnfoldHorizontal size={14}/><span>Face tools</span></button>
    </>}
    <button type="button" onClick={() => open("import")} title="Preflight a supported external Java block model with local PNG dependencies"><Shapes size={14}/><span>Import model</span></button>
    <button type="button" onClick={() => open("library")} title="Explicit, verified local native snapshots"><FolderArchive size={14}/><span>Library</span></button>
    <button type="button" onClick={() => open("workspace")} aria-label="Workspace guide and layouts" title="Workspace layouts, commands and save semantics"><BookOpen size={15}/></button>
    {panel === "region" && source && <TextureRegionDialog source={source} current={document} texture={activeTexture(source)}
      clipboard={clipboard} onCopy={setClipboard} onApply={onApply} onClose={close}/>}
    {panel === "face" && selectedId && <FaceToolsDialog document={document} nodeId={selectedId} face={face} onApply={onApply} onClose={close}/>}
    {panel === "import" && <ExternalModelDialog currentName={document.name} onOpen={onOpen} onBackup={onBackup} onClose={close}/>}
    {panel === "library" && librarySource && <ProjectLibraryDialog source={librarySource.source} revision={librarySource.revision}
      pack={librarySource.pack} onOpen={onOpen} onOpenPack={onOpenPack} onBackup={onBackup} onClose={close}/>}
    {panel === "workspace" && <CreatorDialog title="Workspace guide and layouts" kicker="ONE PROJECT · MODEL, PAINT AND PREVIEW" onClose={close}>
      <h3>Workspace layouts</h3><div className="creator-button-grid">{(["balanced", "canvas", "paint"] as const).map(layout =>
        <button type="button" key={layout} onClick={() => { onLayout(layout); close(); }}><LayoutPanelTop size={15}/>{layout === "balanced" ? "Reset balanced layout" : layout === "canvas" ? "Focus canvas" : "Paint workspace"}</button>)}</div>
      <p className="creator-help">Layouts change panels and authoring mode only; geometry, pixels, selection history and saved source are not edited.</p>
      <h3>Useful commands</h3><dl className="creator-shortcuts">
        <dt>Ctrl/Cmd + A</dt><dd>Select visible, unlocked scene matches in Model mode.</dd>
        <dt>Shift + click / arrows</dt><dd>Select a range in the scene. Ctrl/Cmd-click toggles a part.</dd>
        <dt>Shift/Ctrl/Cmd + viewport click</dt><dd>Toggle one visible part without replacing the selection.</dd>
        <dt>W / R / V</dt><dd>Move, resize and select. Numeric inspector fields provide exact alternatives.</dd>
        <dt>Ctrl/Cmd + D</dt><dd>Duplicate the complete editable selection as one undo step.</dd>
        <dt>B / E / G / I</dt><dd>Pencil, eraser, connected RGBA fill and eyedropper in Paint mode.</dd>
        <dt>Ctrl/Cmd + Z / Shift + Z</dt><dd>Undo and redo. Typing fields and dialogs keep their own shortcuts.</dd>
        <dt>Escape</dt><dd>Cancel live gestures or staged region previews without a content edit.</dd>
        <dt>Ctrl/Cmd + S</dt><dd>Start a portable native .3dmc download.</dd>
      </dl>
      <h3>Three different save outcomes</h3><p className="creator-description"><strong>Saved on this device</strong> acknowledges the active recovery revision. <strong>Library snapshot saved</strong> acknowledges one explicit immutable backup. <strong>Download started</strong> means the browser received a file; it does not prove the file reached durable storage.</p>
      <p className="creator-help">Minecraft Java 1.21.4 export remains experimental. Browser tests cannot establish actual game compatibility or device-wide performance.</p>
      <div className="creator-dialog-actions"><button type="button" onClick={close}>Back to editor</button></div>
    </CreatorDialog>}
  </div>;
}

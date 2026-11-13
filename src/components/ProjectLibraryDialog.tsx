import { useEffect, useRef, useState } from "react";
import type { EditorDocument } from "../editor/domain";
import { deleteLibrarySnapshot, downloadLibraryBytes, listLibrarySnapshots, openLibrarySnapshot,
  renameLibrarySnapshot, saveLibrarySnapshot, savePackLibrarySnapshot } from "../editor/library";
import type { LibraryEntry } from "../editor/library";
import type { NativePackProject } from "../editor/nativePackArchive";
import type { PackSnapshot } from "../pack/packSession";
import { startBrowserDownload } from "../editor/exportJobs";
import { CreatorDialog } from "./CreatorDialog";

export function ProjectLibraryDialog({ source, revision, pack, onOpen, onOpenPack, onBackup, onClose }: {
  source: EditorDocument; revision: number; pack?: PackSnapshot | null;
  onOpen: (document: EditorDocument) => Promise<boolean>;
  onOpenPack: (project: NativePackProject) => Promise<boolean>;
  onBackup: () => Promise<void>; onClose: () => void;
}) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]), [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [status, setStatus] = useState("");
  const [label, setLabel] = useState(pack?.pack.name ?? source.name), [confirm, setConfirm] = useState<{ entry: LibraryEntry; action: "open" | "delete" } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null), [rename, setRename] = useState("");
  const alive = useRef(true);
  const refresh = async () => {
    const listing = await listLibrarySnapshots();
    if (!alive.current) return;
    setEntries(listing.entries);
    if (listing.damaged) setError(`${listing.damaged} damaged metadata record(s) were preserved, not opened or deleted. Download a portable copy of the current project.`);
  };
  useEffect(() => {
    alive.current = true;
    refresh().catch(cause => { if (alive.current) setError(cause instanceof Error ? cause.message : "Library unavailable."); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, []);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(null); setStatus("");
    try { await operation(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "The backup operation failed."); }
    finally { if (alive.current) setBusy(false); }
  };
  return <CreatorDialog title="Local project library" kicker="EXPLICIT SNAPSHOTS · NOT CLOUD STORAGE" onClose={onClose} busy={busy} wide>
    <p className="creator-description">Keep up to 12 independently verified native snapshots on this device. Each snapshot is a new copy, never an overwrite of recovery or an earlier backup. Snapshots remain in browser storage; download .3dmc files to keep portable backups.</p>
    {pack && <p className="creator-help" role="status">Pack mode: a snapshot includes all {pack.pack.models.length} editable models, textures and source layers, not just the active model.</p>}
    <div className="library-save-row"><label><span>New snapshot label</span><input aria-label="New snapshot label" maxLength={100} value={label} onChange={event => setLabel(event.target.value)}/></label>
      <button type="button" className="creator-primary" disabled={busy || loading || !label.trim() || entries.length >= 12} onClick={() => void run(async () => {
        const saved = pack
          ? await savePackLibrarySnapshot(pack.pack, pack.sources, revision, label)
          : await saveLibrarySnapshot(source, revision, label);
        await refresh(); if (alive.current) setStatus(`Snapshot saved on this device: ${saved.label} · revision ${saved.revision}.`);
      })}>Save new local snapshot</button>
      <button type="button" disabled={busy} onClick={() => void onBackup()}>Download current project</button></div>
    <div className="library-list-heading"><h3>{entries.length}/12 snapshots</h3><button type="button" disabled={busy} onClick={() => void run(refresh)}>Refresh library</button></div>
    {loading && <p role="status">Reading local snapshots…</p>}
    {!loading && !entries.length && <p className="creator-empty">No local snapshots yet. Add one above without replacing your current recovery checkpoint.</p>}
    <div className="library-list">{entries.map(entry => <article key={entry.id} className="library-entry" aria-label={"Backup " + entry.label}>
      <div><strong>{entry.label}</strong><p>{entry.projectName} · {entry.kind === "pack"
          ? `Complete pack · ${entry.modelCount} editable models`
          : "Standalone project"} · revision {entry.revision} · {new Date(entry.savedAt).toLocaleString()}</p><small>{Math.ceil(entry.byteLength / 1024)} KiB · SHA-256 {entry.sha256.slice(0, 12)}…</small></div>
      <div className="library-entry-actions"><button type="button" disabled={busy} onClick={() => setConfirm({ entry, action: "open" })}>Open copy</button>
        <button type="button" disabled={busy} onClick={() => void run(async () => {
          const bytes = await downloadLibraryBytes(entry);
          startBrowserDownload({
            filename: (entry.label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "backup") + ".3dmc",
            mimeType: "application/zip", content: bytes
          });
          if (alive.current) setStatus("Verified native backup download started. This does not prove a durable file write.");
        })}>Download</button>
        <button type="button" disabled={busy} onClick={() => { setRenaming(entry.id); setRename(entry.label); }}>Rename</button>
        <button type="button" disabled={busy} onClick={() => setConfirm({ entry, action: "delete" })}>Delete</button></div>
      {renaming === entry.id && <div className="library-rename"><input aria-label="Rename backup" maxLength={100} value={rename} onChange={event => setRename(event.target.value)}/>
        <button type="button" disabled={busy || !rename.trim()} onClick={() => void run(async () => { await renameLibrarySnapshot(entry, rename); setRenaming(null); await refresh(); })}>Save label</button>
        <button type="button" onClick={() => setRenaming(null)}>Cancel rename</button></div>}
    </article>)}</div>
    {confirm && <section className="library-confirm" aria-label="Confirm backup action"><h3>{confirm.action === "open" ? "Replace the workspace with a verified copy?" : "Delete this local snapshot?"}</h3>
      <p><strong>{confirm.entry.label}</strong>. {confirm.action === "open" ? "Download the current project first when you need an independent copy. The library record itself will remain unchanged." : "Only this named snapshot will be removed. The current workspace and recovery checkpoints are not deleted."}</p>
      <button type="button" disabled={busy} onClick={() => setConfirm(null)}>Cancel action</button>
      <button type="button" className="creator-primary" disabled={busy} onClick={() => void run(async () => {
        const chosen = confirm; if (chosen.action === "delete") {
          await deleteLibrarySnapshot(chosen.entry); setConfirm(null); await refresh(); setStatus("The selected local snapshot was deleted.");
        } else {
          const restored = await openLibrarySnapshot(chosen.entry);
          const opened = restored.kind === "pack"
            ? await onOpenPack(restored)
            : await onOpen(restored.document);
          if (opened) onClose(); else throw new Error("The workspace could not be safely replaced. Your library snapshot is unchanged.");
        }
      })}>{confirm.action === "open" ? "Open verified copy" : "Delete selected snapshot"}</button>
    </section>}
    {error && <p className="creator-error" role="alert">{error}</p>}
    {status && <p className="creator-success" role="status">{status}</p>}
    <div className="creator-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Close library</button></div>
  </CreatorDialog>;
}

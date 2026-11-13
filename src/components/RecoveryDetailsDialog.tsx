import { Download, FolderArchive, HardDrive, Info } from "lucide-react";
import { ModalDialog } from "./ModalDialog";
import { currentAcknowledgement, isCurrentRevisionSaved, recoveryStatusText } from "../editor/recoveryPresentation";
import type { RecoveryAcknowledgement, RecoveryStatus, WriterStatus } from "../editor/recoveryPresentation";

export function RecoveryDetailsDialog({ writer, status, revision, session, acknowledgement,
  modelCount, savingBackup, onBackup, onLibrary, onClose }: {
  writer: WriterStatus;
  status: RecoveryStatus;
  revision: number;
  session: number;
  acknowledgement: RecoveryAcknowledgement | null;
  modelCount: number;
  savingBackup: boolean;
  onBackup: () => void;
  onLibrary: () => void;
  onClose: () => void;
}) {
  const latest = currentAcknowledgement(acknowledgement, session);
  const savedCurrent = isCurrentRevisionSaved(writer, status, session, revision, acknowledgement);
  const savedTime = latest ? new Date(latest.savedAt).toLocaleString() : null;

  return <ModalDialog className="modal recovery-details-modal"
    labelledBy="recovery-details-title" onCancel={onClose}>
    <div className="recovery-details-head"><HardDrive size={22}/>
      <div><span className="export-kicker">LOCAL-FIRST SOURCE PROTECTION</span>
        <h2 id="recovery-details-title">Backup and recovery status</h2></div>
    </div>
    <p role="status" className="recovery-details-status"><strong>{recoveryStatusText(writer, status)}</strong>
      {savedCurrent
        ? ` · Current revision ${revision} acknowledged`
        : ` · Revision ${revision} is not confirmed saved locally`}</p>
    <section>
      <h3>Automatic recovery</h3>
      {latest
        ? <p>Last acknowledged checkpoint: revision <strong>{latest.revision}</strong>,
          {latest.modelCount === 1 ? " one source model" : ` ${latest.modelCount} source models`},
          saved {savedTime}. {savedCurrent
            ? "This revision finished its local storage transaction."
            : "Subsequent changes are not covered by that acknowledgement."}</p>
        : <p>No checkpoint has been acknowledged for the current workspace session.</p>}
      <p>Recovery keeps a latest and previous verified checkpoint on this device.
        Another tab must explicitly take over before writing; local recovery is not a portable backup.</p>
      {status === "failed" && <p className="recovery-details-warning">
        The latest checkpoint write failed. The editor retains your current work in memory;
        download a portable source copy before closing the tab.</p>}
    </section>
    <section>
      <h3>Library snapshots</h3>
      <p>Explicit named copies stay separate from automatic recovery. The library can save
        the complete {modelCount > 1 ? `${modelCount}-model pack` : "project"} without replacing existing snapshots.</p>
      <button type="button" className="text-button subtle" onClick={onLibrary}>
        <FolderArchive size={15}/>Open library
      </button>
    </section>
    <section>
      <h3>Portable .3dmc source</h3>
      <p>A download includes editable source data. “Download started” means the browser
        received the file, not that the file was durably stored on disk.</p>
      <button type="button" className="text-button primary" disabled={savingBackup}
        onClick={onBackup}><Download size={15}/>{savingBackup ? "Preparing backup…" : "Download source backup"}</button>
    </section>
    <p className="recovery-details-note"><Info size={14}/>
      Minecraft resource-pack ZIP exports are separate from editable .3dmc backups.</p>
    <div className="modal-actions">
      <button type="button" className="text-button quiet" data-dialog-initial-focus
        onClick={onClose}>Close</button>
    </div>
  </ModalDialog>;
}

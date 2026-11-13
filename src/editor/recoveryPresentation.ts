export type RecoveryStatus = "unsaved" | "saving" | "saved" | "failed" | "blocked";
export type WriterStatus = "checking" | "owned" | "blocked" | "failed";

/** This record exists only after the IndexedDB transaction has committed. */
export interface RecoveryAcknowledgement {
  session: number;
  revision: number;
  savedAt: number;
  modelCount: number;
}

export function recoveryStatusText(writer: WriterStatus, save: RecoveryStatus): string {
  if (writer === "blocked") return "Other tab owns recovery";
  if (writer === "failed") return "Recovery unavailable — download backup";
  if (writer === "checking") return "Checking recovery ownership…";
  if (save === "saved") return "Saved on this device";
  if (save === "saving") return "Saving locally…";
  if (save === "failed") return "Local save unavailable · download backup";
  return "Unsaved local changes";
}

export function currentAcknowledgement(
  acknowledged: RecoveryAcknowledgement | null, session: number
): RecoveryAcknowledgement | null {
  return acknowledged?.session === session ? acknowledged : null;
}

/** A revision is only shown as safely recovered once the active writer committed it. */
export function isCurrentRevisionSaved(
  writer: WriterStatus, save: RecoveryStatus, currentSession: number,
  currentRevision: number, acknowledgement: RecoveryAcknowledgement | null
): boolean {
  return writer === "owned" && save === "saved" &&
    currentAcknowledgement(acknowledgement, currentSession)?.revision === currentRevision;
}

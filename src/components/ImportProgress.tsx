export interface ImportProgressState {
  name: string;
  stage: "reading" | "validating";
  loaded: number;
  total: number;
}

/** Progress percentages refer only to bytes read, never the unknown validation time. */
export function ImportProgress({ progress, onCancel, inline = false }: {
  progress: ImportProgressState; onCancel: () => void; inline?: boolean;
}) {
  const percent = progress.total > 0
    ? Math.min(100, Math.floor(progress.loaded * 100 / progress.total)) : 0;
  return <div className={"import-progress" + (inline ? " inline" : "")} role="status" aria-live="polite">
    <span className="import-progress-label">
      {progress.stage === "reading"
        ? "Reading " + progress.name + " · " + percent + "%"
        : "Validating " + progress.name + " in the background…"}
    </span>
    {progress.stage === "reading" && progress.total > 0 &&
      <progress max={progress.total} value={progress.loaded} aria-label="Import file bytes read"/>}
    <button type="button" onClick={onCancel}>Cancel import</button>
  </div>;
}

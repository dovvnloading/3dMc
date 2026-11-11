import { AlertCircle, Info } from "lucide-react";
import type { ExportIssue } from "../export/javaBlock";

interface Props {
  issues: readonly ExportIssue[];
  onLocate: (issue: ExportIssue) => void;
}

/** Preflight diagnostics remain navigable even when multiple assets have the same error. */
export function ExportIssueList({ issues, onLocate }: Props) {
  const blockers = issues.filter(issue => issue.severity === "error").length;
  return <div className="export-issues">
    <strong>Preflight · {blockers} blockers</strong>
    {issues.map((issue, index) => <div
      key={issue.code + ":" + (issue.nodeId ?? issue.textureId ?? "general") + ":" + index}
      className={"export-issue issue-" + issue.severity}>
      {issue.severity === "error" ? <AlertCircle size={15}/> : <Info size={15}/>}
      <span><b>{issue.severity === "error" ? "Fix required" : "Notice"}</b>{issue.sourceName && <small className="export-issue-source">Model: {issue.sourceName}</small>}{issue.message}</span>
      {(issue.nodeId || issue.textureId) && <button type="button"
        title={issue.nodeId ? "Locate affected element" : "Locate affected texture"}
        onClick={() => onLocate(issue)}>Locate</button>}
    </div>)}
  </div>;
}

import type { EditorDocument } from "./domain";
import type { NativePackProject } from "./nativePackArchive";
import type { PackImportReport } from "../import/javaPack";
import type { NativePackProject } from "./nativePackArchive";

/** Extends Java preflight without widening the original single-block contract. */
export type JavaImportReport = PackImportReport |
  { status: "editable-pack"; project: NativePackProject; paths: string[]; notices: string[] };

/** Only validated, detached import previews cross the worker boundary. */
export type ImportJobRequest =
  | { kind: "source"; filename: string; bytes: Uint8Array }
  | { kind: "pack"; bytes: Uint8Array }
  | { kind: "single"; bytes: Uint8Array }
  | { kind: "java"; bytes: Uint8Array }
  | { kind: "java-pack"; bytes: Uint8Array };

export type ImportJobResult =
  | { kind: "document"; document: EditorDocument }
  | { kind: "pack"; project: NativePackProject }
  | { kind: "java"; report: JavaImportReport };

export type ImportJobReply =
  | { success: true; result: ImportJobResult }
  | { success: false; error: string };

const aborted = () => new DOMException("Import preparation canceled.", "AbortError");

function validResult(request: ImportJobRequest, value: unknown): value is ImportJobResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ImportJobResult>;
  if (result.kind === "document") {
    return request.kind !== "java" && request.kind !== "pack" &&
      !!result.document && typeof result.document === "object" &&
      typeof result.document.id === "string";
  }
  if (result.kind === "pack") {
    const project = result.project;
    return request.kind !== "java" && request.kind !== "single" &&
      !!project && typeof project === "object" &&
      !!project.pack && Array.isArray(project.sources);
  }
  if (result.kind === "java") {
    const report = result.report;
    return (request.kind === "java" || request.kind === "java-pack") &&
      !!report && typeof report === "object" &&
      (report.status === "blocked"
        ? Array.isArray(report.problems) && report.problems.every(item => typeof item === "string")
        : report.status === "editable"
          ? !!report.document && Array.isArray(report.paths) && Array.isArray(report.notices)
          : report.status === "editable-pack" && !!report.project?.pack &&
            Array.isArray(report.project.sources) &&
            Array.isArray(report.paths) && Array.isArray(report.notices));
  }
  return false;
}

/**
 * Only file-reading progress is a measurable percentage. Validation happens
 * inside a worker and is deliberately shown as an indeterminate phase.
 * A canceled reader cannot publish bytes or a late progress update.
 */
export function readImportFile(file: Blob, signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    let settled = false;
    function cleanup(): void {
      signal?.removeEventListener("abort", onAbort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      reader.onprogress = null;
    }
    function finish(error: Error | null, bytes?: Uint8Array): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(bytes!);
    }
    function onAbort(): void {
      if (reader.readyState === FileReader.LOADING) reader.abort();
      finish(aborted());
    }
    reader.onprogress = event => {
      if (!settled && !signal?.aborted && event.lengthComputable)
        onProgress?.(event.loaded, event.total);
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) finish(null, new Uint8Array(reader.result));
      else finish(new Error("The selected file could not be read as bytes."));
    };
    reader.onerror = () => finish(reader.error ?? new Error("Could not read the selected file."));
    reader.onabort = () => finish(aborted());
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try { reader.readAsArrayBuffer(file); }
    catch (error) { finish(error instanceof Error ? error : new Error("Could not start reading the file.")); }
  });
}

/**
 * Worker owns all source and Java archive inspection. The input ArrayBuffer is
 * transferred (never used again by the caller) to avoid a second large copy.
 * Cancellation terminates the worker; late messages cannot resolve the job.
 */
export function runImportJobInWorker(request: ImportJobRequest,
  signal?: AbortSignal): Promise<ImportJobResult> {
  if (signal?.aborted) return Promise.reject(aborted());

  return new Promise<ImportJobResult>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./importJobs.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Could not start the import worker."));
      return;
    }

    let settled = false;
    function cleanup(): void {
      signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    function finish(error: Error | null, result?: ImportJobResult): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(result!);
    }
    function onAbort(): void { finish(aborted()); }

    worker.onmessage = (event: MessageEvent<ImportJobReply>) => {
      const reply = event.data;
      if (reply?.success === true && validResult(request, reply.result)) {
        finish(null, reply.result);
      } else if (reply?.success === false && typeof reply.error === "string") {
        finish(new Error(reply.error));
      } else {
        finish(new Error("The import worker returned an invalid result."));
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      finish(new Error("The import worker failed. No project was replaced."));
    };
    worker.onmessageerror = () => finish(new Error("Could not read the import worker's response."));

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      worker.postMessage(request,
        request.bytes.buffer instanceof ArrayBuffer ? [request.bytes.buffer] : []);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Could not send the file to the import worker."));
    }
  });
}

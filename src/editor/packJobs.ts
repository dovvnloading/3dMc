import type { EditorDocument } from "./domain";
import type { PackDocument } from "../pack/packDocument";

/**
 * Prepare complete pack artifacts off the UI thread. Structured cloning keeps
 * the captured source snapshot isolated from subsequent editor changes.
 */
export type PackJobKind = "native" | "java";

export interface PackJobRequest {
  kind: PackJobKind;
  pack: PackDocument;
  sources: EditorDocument[];
}

export type PackJobReply =
  | { success: true; bytes: Uint8Array }
  | { success: false; error: string };

export function buildPackZipInWorker(kind: PackJobKind, pack: PackDocument,
  sources: EditorDocument[], signal?: AbortSignal): Promise<Uint8Array> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Pack preparation canceled.", "AbortError"));
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./packJobs.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Could not start pack preparation worker."));
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
    function finish(error: Error | null, bytes?: Uint8Array): void {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(bytes!);
    }
    function onAbort(): void {
      finish(new DOMException("Pack preparation canceled.", "AbortError"));
    }

    worker.onmessage = (event: MessageEvent<PackJobReply>) => {
      const reply = event.data;
      if (reply?.success === true && reply.bytes instanceof Uint8Array) {
        finish(null, reply.bytes);
      } else if (reply?.success === false && typeof reply.error === "string") {
        finish(new Error(reply.error));
      } else {
        finish(new Error("Pack preparation worker returned an invalid result."));
      }
    };
    worker.onerror = event => {
      event.preventDefault();
      finish(new Error("The pack preparation worker failed. No download was started."));
    };
    worker.onmessageerror = () => {
      finish(new Error("Could not read the pack preparation worker's response."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }

    try {
      worker.postMessage({ kind, pack, sources } satisfies PackJobRequest);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Could not send the project to the pack worker."));
    }
  });
}

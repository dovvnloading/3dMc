import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorDocument } from "./domain";
import type { ImportJobReply, ImportJobRequest, ImportJobResult } from "./importJobs";
import { readImportFile, runImportJobInWorker } from "./importJobs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  static throwOnSend = false;
  onmessage: ((event: MessageEvent<ImportJobReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  request: ImportJobRequest | null = null;
  transfer: Transferable[] | undefined;
  terminated = false;

  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: ImportJobRequest, transfer?: Transferable[]): void {
    if (FakeWorker.throwOnSend) throw new Error("Cannot clone file");
    this.request = request;
    this.transfer = transfer;
  }
  terminate(): void { this.terminated = true; }
  respond(reply: ImportJobReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<ImportJobReply>);
  }
}

class FakeReader {
  static LOADING = 1;
  static instances: FakeReader[] = [];
  readyState = 1;
  result: ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onprogress: ((event: ProgressEvent<FileReader>) => void) | null = null;
  aborted = false;

  constructor() { FakeReader.instances.push(this); }
  readAsArrayBuffer(_blob: Blob): void { /* Controlled by the test. */ }
  abort(): void {
    this.aborted = true;
    this.readyState = 2;
    this.onabort?.({} as ProgressEvent<FileReader>);
  }
  progress(loaded: number, total: number): void {
    this.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent<FileReader>);
  }
  complete(bytes: Uint8Array): void {
    this.readyState = 2;
    this.result = new Uint8Array(bytes).buffer;
    this.onload?.({} as ProgressEvent<FileReader>);
  }
}

const bytes = () => new Uint8Array([80, 75, 3, 4]);
const sample = { id: "source" } as EditorDocument;
const sourceRequest = (): ImportJobRequest => ({ kind: "source", filename: "source.3dmc", bytes: bytes() });

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.throwOnSend = false;
  FakeReader.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("FileReader", FakeReader);
});
afterEach(() => vi.unstubAllGlobals());

describe("cancelable import worker transport", () => {
  it("transfers source bytes and resolves a validated source preview", async () => {
    const request = sourceRequest();
    const pending = runImportJobInWorker(request);
    const worker = FakeWorker.instances[0]!;
    expect(worker.request).toEqual(request);
    expect(worker.transfer).toEqual([request.bytes.buffer]);
    const result: ImportJobResult = { kind: "document", document: sample };
    worker.respond({ success: true, result });
    await expect(pending).resolves.toEqual(result);
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
  });

  it("accepts native pack and blocked Java preflight without mutating the editor", async () => {
    const packPending = runImportJobInWorker({ kind: "pack", bytes: bytes() });
    const packWorker = FakeWorker.instances[0]!;
    const result: ImportJobResult = {
      kind: "pack", project: { pack: { id: "pack" } as never, sources: [sample] }
    };
    packWorker.respond({ success: true, result });
    await expect(packPending).resolves.toEqual(result);

    const javaPending = runImportJobInWorker({ kind: "java", bytes: bytes() });
    FakeWorker.instances[1]!.respond({
      success: true, result: { kind: "java", report: { status: "blocked", problems: ["Not supported"] } }
    });
    await expect(javaPending).resolves.toMatchObject({
      kind: "java", report: { status: "blocked" }
    });
  });

  it("aborts an in-flight job and ignores replies after termination", async () => {
    const controller = new AbortController();
    const pending = runImportJobInWorker(sourceRequest(), controller.signal);
    const worker = FakeWorker.instances[0]!;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
    worker.respond({ success: true, result: { kind: "document", document: sample } });
  });

  it("does not create a worker when already canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runImportJobInWorker(sourceRequest(), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("propagates codec rejection and cleans up", async () => {
    const pending = runImportJobInWorker(sourceRequest());
    const worker = FakeWorker.instances[0]!;
    worker.respond({ success: false, error: "Invalid project manifest" });
    await expect(pending).rejects.toThrow("Invalid project manifest");
    expect(worker.terminated).toBe(true);
  });

  it("refuses malformed and wrong-kind replies", async () => {
    const pending = runImportJobInWorker(sourceRequest());
    FakeWorker.instances[0]!.respond({
      success: true, result: { kind: "document", document: null as never }
    });
    await expect(pending).rejects.toThrow("invalid result");

    const javaPending = runImportJobInWorker({ kind: "java", bytes: bytes() });
    FakeWorker.instances[1]!.respond({ success: true,
      result: { kind: "document", document: sample } });
    await expect(javaPending).rejects.toThrow("invalid result");
  });

  it("rejects worker execution, cloning and message decoding failures", async () => {
    FakeWorker.throwOnSend = true;
    const cloneFailure = runImportJobInWorker(sourceRequest());
    await expect(cloneFailure).rejects.toThrow("Cannot clone file");
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    FakeWorker.throwOnSend = false;

    const runtimeFailure = runImportJobInWorker(sourceRequest());
    const event = { preventDefault: vi.fn() } as unknown as ErrorEvent;
    FakeWorker.instances[1]!.onerror?.(event);
    await expect(runtimeFailure).rejects.toThrow("worker failed");
    expect(event.preventDefault).toHaveBeenCalled();

    const decodingFailure = runImportJobInWorker(sourceRequest());
    FakeWorker.instances[2]!.onmessageerror?.({} as MessageEvent);
    await expect(decodingFailure).rejects.toThrow("Could not read");
  });
});

describe("cancelable import file reader", () => {
  it("reports actual byte-reading progress and returns the bytes", async () => {
    const progress = vi.fn();
    const pending = readImportFile(new Blob(["fixture"]), undefined, progress);
    const reader = FakeReader.instances[0]!;
    reader.progress(3, 7);
    reader.complete(new Uint8Array([1, 2, 3]));
    await expect(pending).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(progress).toHaveBeenCalledWith(3, 7);
    expect(reader.onload).toBeNull();
    expect(reader.onprogress).toBeNull();
  });

  it("aborts the reader and rejects instead of publishing late bytes", async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    const pending = readImportFile(new Blob(["fixture"]), controller.signal, progress);
    const reader = FakeReader.instances[0]!;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(reader.aborted).toBe(true);
    reader.progress(7, 7);
    reader.complete(new Uint8Array([1]));
    expect(progress).not.toHaveBeenCalled();
  });

  it("never starts reading a file after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readImportFile(new Blob(["fixture"]), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(FakeReader.instances).toHaveLength(0);
  });
});

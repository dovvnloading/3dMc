import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorDocument } from "./domain";
import type { PackDocument } from "../pack/packDocument";
import { buildPackZipInWorker } from "./packJobs";
import type { PackJobReply, PackJobRequest } from "./packJobs";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<PackJobReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  request: PackJobRequest | null = null;
  terminated = false;

  constructor() { FakeWorker.instances.push(this); }
  postMessage(request: PackJobRequest): void { this.request = request; }
  terminate(): void { this.terminated = true; }
  respond(reply: PackJobReply): void {
    this.onmessage?.({ data: reply } as MessageEvent<PackJobReply>);
  }
}

const pack = { id: "test" } as PackDocument;
const sources = {} as Record<string, EditorDocument>;

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

describe("pack worker jobs", () => {
  it("sends the captured artifact kind and resolves exact bytes", async () => {
    const pending = buildPackZipInWorker("java", pack, sources);
    const worker = FakeWorker.instances[0]!;
    expect(worker.request).toEqual({ kind: "java", pack, sources });
    const bytes = new Uint8Array([80, 75, 3, 4]);
    worker.respond({ success: true, bytes });
    await expect(pending).resolves.toEqual(bytes);
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
  });

  it("terminates a running job when canceled, without accepting a download", async () => {
    const controller = new AbortController();
    const pending = buildPackZipInWorker("native", pack, sources, controller.signal);
    const worker = FakeWorker.instances[0]!;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
    expect(worker.onmessage).toBeNull();
  });

  it("does not start a worker for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(buildPackZipInWorker("java", pack, sources, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("propagates validation failures and cleans up the worker", async () => {
    const pending = buildPackZipInWorker("native", pack, sources);
    const worker = FakeWorker.instances[0]!;
    worker.respond({ success: false, error: "Invalid pack reference." });
    await expect(pending).rejects.toThrow("Invalid pack reference.");
    expect(worker.terminated).toBe(true);
  });

  it("rejects malformed worker results instead of reporting a download", async () => {
    const pending = buildPackZipInWorker("java", pack, sources);
    const worker = FakeWorker.instances[0]!;
    worker.respond({ success: true, bytes: [] as unknown as Uint8Array });
    await expect(pending).rejects.toThrow("invalid result");
    expect(worker.terminated).toBe(true);
  });
});

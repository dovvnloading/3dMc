import { encodeNativePack } from "./nativePackArchive";
import { makeIndexedJava1214Pack } from "../pack/javaPackBuilder";
import type { PackJobReply, PackJobRequest } from "./packJobs";

const scope = self as unknown as {
  postMessage(message: PackJobReply, transfer?: Transferable[]): void;
};

self.addEventListener("message", (event: MessageEvent<PackJobRequest>) => {
  void (async () => {
    try {
      const { kind, pack, sources } = event.data;
      const bytes = kind === "native"
        ? await encodeNativePack(pack, sources)
        : kind === "java"
          ? makeIndexedJava1214Pack(pack, sources).zip
          : (() => { throw new Error("Unsupported pack preparation job."); })();

      // Transferring the produced ZIP avoids copying a second large byte array
      // back to the editor. Source documents were cloned into the worker.
      scope.postMessage({ success: true, bytes },
        bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : []);
    } catch (error) {
      scope.postMessage({
        success: false,
        error: error instanceof Error ? error.message : "Pack preparation failed."
      });
    }
  })();
});

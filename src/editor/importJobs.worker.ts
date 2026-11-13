import { prepareImport } from "./importPreparation";
import type { ImportJobReply, ImportJobRequest } from "./importJobs";

const scope = self as unknown as {
  postMessage(message: ImportJobReply): void;
};

self.addEventListener("message", (event: MessageEvent<ImportJobRequest>) => {
  void (async () => {
    try {
      const result = await prepareImport(event.data);
      scope.postMessage({ success: true, result });
    } catch (error) {
      scope.postMessage({
        success: false,
        error: error instanceof Error ? error.message : "Import validation failed."
      });
    }
  })();
});

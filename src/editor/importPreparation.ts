import { decodeProject, MAX_PROJECT_BYTES } from "./project";
import { decodeNativeProject, MAX_NATIVE_BYTES } from "./nativeArchive";
import { decodeNativePack, MAX_NATIVE_PACK_BYTES, openNativePack } from "./nativePackArchive";
import { inspectJava1214Pack } from "../import/javaPack";
import { inspectIndexedJava1214Pack } from "../import/indexedJavaPack";
import { MAX_INDEXED_EXPORT_BYTES } from "../pack/javaPackBuilder";
import type { ImportJobRequest, ImportJobResult } from "./importJobs";

/** Pure codec boundary: all import preflight runs without React or live project state. */
export async function prepareImport(request: ImportJobRequest): Promise<ImportJobResult> {
  const bytes = request.bytes;
  if (!(bytes instanceof Uint8Array)) throw new Error("Invalid import file bytes.");

  switch (request.kind) {
    case "source": {
      if (bytes.length > MAX_NATIVE_PACK_BYTES)
        throw new Error("File exceeds the 12 MB source pack import budget.");
      const nativeZip = (bytes[0] === 0x50 && bytes[1] === 0x4b &&
        bytes[2] === 0x03 && bytes[3] === 0x04) ||
        request.filename.toLowerCase().endsWith(".3dmc");
      if (!nativeZip) {
        if (bytes.length > MAX_PROJECT_BYTES)
          throw new Error("Legacy JSON project exceeds the 1.5 MB import limit.");
        return { kind: "document",
          document: decodeProject(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
      }
      // Preserve the existing Open behavior: v1/v2 remain standalone projects.
      // A native v3 archive remains a complete multi-model source pack.
      if (bytes.length > MAX_NATIVE_BYTES)
        return { kind: "pack", project: await decodeNativePack(bytes) };
      try {
        return { kind: "pack", project: await decodeNativePack(bytes) };
      } catch {
        return { kind: "document", document: await decodeNativeProject(bytes) };
      }
    }
    case "pack":
      if (bytes.length > MAX_NATIVE_PACK_BYTES)
        throw new Error("The source pack exceeds the 12 MB limit.");
      return { kind: "pack", project: await openNativePack(bytes) };
    case "single":
      if (bytes.length > MAX_NATIVE_BYTES)
        throw new Error("The single-model source exceeds the 3 MB import limit.");
      return { kind: "document", document: await decodeNativeProject(bytes) };
    case "java":
    case "java-pack": {
      if (bytes.length > MAX_INDEXED_EXPORT_BYTES)
        throw new Error("This ZIP exceeds the 12 MB Java pack-import limit.");
      // Preserve the legacy single-diamond-block behavior from the main
      // editor's Import pack action. Pack Studio always opens a full pack.
      if (request.kind === "java" && bytes.length <= 2_000_000) {
        const legacy = inspectJava1214Pack(bytes);
        if (legacy.status === "editable") return { kind: "java", report: legacy };
      }
      const indexed = inspectIndexedJava1214Pack(bytes);
      return { kind: "java", report: indexed.status === "editable"
        ? { status: "editable-pack", project: indexed.project,
            paths: indexed.paths, notices: indexed.notices }
        : { status: "blocked", problems: indexed.problems } };
    }
    default:
      throw new Error("Unsupported import job.");
  }
}

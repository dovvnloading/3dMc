import type { EditorDocument } from "./domain";
import { activeTexture } from "./domain";
import { encodeProject, safeFilename } from "./project";
import { encodeNativeProject, nativeFilename } from "./nativeArchive";
import { makeSixFaceDiagnosticDocument } from "../compatibility/diagnostic";
import { makeJava1214Pack } from "../export/javaBlock";
import { encodeRgbaPng } from "../export/png";

/**
 * File preparation is independent of React state, recovery ownership,
 * notifications and the viewport. Download is a distinct browser boundary.
 */
export interface PreparedDownload {
  filename: string;
  mimeType: string;
  content: string | Uint8Array;
}

export function prepareLegacyJsonDownload(document: EditorDocument): PreparedDownload {
  return {
    filename: safeFilename(document.name),
    mimeType: "application/json",
    content: encodeProject(document)
  };
}

export async function prepareNativeProjectDownload(document: EditorDocument): Promise<PreparedDownload> {
  return {
    filename: nativeFilename(document.name),
    mimeType: "application/zip",
    content: await encodeNativeProject(document)
  };
}

export function prepareJavaPackDownload(document: EditorDocument):
  { file: PreparedDownload; bytes: number } {
  const pack = makeJava1214Pack(document);
  return {
    file: {
      filename: "3dmc-diamond-block-java-1.21.4-experimental.zip",
      mimeType: "application/zip",
      content: pack.zip
    },
    bytes: pack.zip.length
  };
}

export function prepareSixFaceDiagnosticDownload(): PreparedDownload {
  return {
    filename: "3dmc-java-1.21.4-six-face-orientation-test.zip",
    mimeType: "application/zip",
    content: makeJava1214Pack(makeSixFaceDiagnosticDocument()).zip
  };
}

export function prepareTexturePngDownload(document: EditorDocument): PreparedDownload {
  const texture = activeTexture(document);
  return {
    filename: texture.name.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 80)
      .replace(/\.png$/i, "") + ".png",
    mimeType: "image/png",
    content: encodeRgbaPng(texture.width, texture.height, texture.pixels)
  };
}

/** A caller reports success only after the browser has been asked to download. */
export function startBrowserDownload(file: PreparedDownload): void {
  const content = typeof file.content === "string" ? file.content : new Uint8Array(file.content);
  const url = URL.createObjectURL(new Blob([content], { type: file.mimeType }));
  const link = globalThis.document.createElement("a");
  try {
    link.href = url;
    link.download = file.filename;
    globalThis.document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

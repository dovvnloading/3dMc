import { strToU8, zipSync } from "fflate";
import { parseDocument } from "../editor/domain";
import { FACE_DIRECTIONS } from "../editor/domain";
import type { Cuboid, EditorDocument } from "../editor/domain";
import { hexToRGB } from "../editor/pixels";
import { encodeRgbaPng } from "./png";

export const JAVA_RELEASE = "1.21.4" as const;
export const RESOURCE_PACK_FORMAT = 46 as const;
export const REPLACEMENT_BLOCK = "minecraft:diamond_block" as const;
export const REPLACEMENT_NAME = "diamond_block" as const;
export const GAME_EXPORT_VERIFIED = false as const;

export const JAVA_PACK_PATHS = {
  metadata: "pack.mcmeta",
  blockstate: "assets/minecraft/blockstates/diamond_block.json",
  model: "assets/3dmc/models/block/lantern.json",
  mainTexture: "assets/3dmc/textures/block/main.png"
} as const;

export interface ExportIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
}

export class JavaExportBlocked extends Error {
  constructor(public readonly issues: ExportIssue[]) {
    super("The document does not meet the Java 1.21.4 exporter contract.");
    this.name = "JavaExportBlocked";
  }
}

export interface JavaPackResult {
  zip: Uint8Array;
  paths: string[];
  issues: ExportIssue[];
  release: typeof JAVA_RELEASE;
  packFormat: typeof RESOURCE_PACK_FORMAT;
  replaces: typeof REPLACEMENT_BLOCK;
  gameVerified: typeof GAME_EXPORT_VERIFIED;
}

const error = (code: string, message: string, nodeId?: string): ExportIssue =>
  ({ severity: "error", code, message, ...(nodeId ? { nodeId } : {}) });

const warning = (code: string, message: string): ExportIssue =>
  ({ severity: "warning", code, message });

const insideJavaBounds = (node: Cuboid): boolean =>
  node.from.every((v) => v >= -16 && v <= 32) &&
  node.to.every((v) => v >= -16 && v <= 32);

export function inspectJava1214(document: EditorDocument): ExportIssue[] {
  const issues: ExportIssue[] = [];
  if (document.target.edition !== "java" || document.target.family !== "static-block" ||
      document.target.candidateRelease !== JAVA_RELEASE) {
    issues.push(error("TARGET_NOT_SUPPORTED", "Choose Java Edition 1.21.4 in the project target before exporting."));
  }
  if (document.cuboids.length === 0)
    issues.push(error("EMPTY_MODEL", "Add at least one cuboid to export a visible block."));
  if (document.cuboids.length > 256)
    issues.push(error("TOO_MANY_ELEMENTS", "This experimental exporter supports at most 256 cuboids."));

  const powerOfTwo = (n: number) => Number.isSafeInteger(n) && n > 0 && (n & (n - 1)) === 0;
  for (const t of document.textures) {
    if (!powerOfTwo(t.width) || t.width !== t.height || t.width > 64)
      issues.push(error("TEXTURE_DIMENSIONS", "Texture " + t.name +
        " must be square, power-of-two, and at most 64×64 texels."));
    if (t.pixels.some((part, i) => i % 4 === 3 && part !== 255))
      issues.push(error("TEXTURE_ALPHA", "Texture " + t.name +
        " uses alpha. This Java 1.21.4 profile supports opaque pixels only."));
  }

  for (const node of document.cuboids) {
    // makeJava1214Pack() validates the full document before encoding.
    if (!insideJavaBounds(node)) {
      issues.push(error("ELEMENT_BOUNDS",
        `Element "${node.name}" extends outside Java model element bounds (-16 to 32 units). Move or resize it.`,
        node.id));
    }
    if (node.material === "texture" && node.color.toLowerCase() !== "#ffffff") {
      issues.push(error("UNSUPPORTED_TINT",
        `Element "${node.name}" uses a viewport tint that this exporter cannot reproduce. Reset its material color to white.`,
        node.id));
    }
  }

  issues.push(warning("NOT_GAME_VERIFIED",
    "The ZIP is structurally tested, but this generated artifact has not been checked in Minecraft Java 1.21.4."));
  issues.push(warning("VISUAL_REPLACEMENT_ONLY",
    "This pack changes every diamond block's visual model, not collision, lighting, crafting, or gameplay."));
  issues.push(warning("PREVIEW_APPROXIMATE",
    "UV orientation, shading, and Minecraft's rendering may differ from this browser preview."));
  return issues;
}

// Source face directions come from the versioned domain model.

export function buildJava1214Model(document: EditorDocument) {
  const textures: Record<string, string> = { particle: "3dmc:block/main" };
  document.textures.forEach((_, index) => {
    textures[index === 0 ? "painted" : "painted_" + index] =
      index === 0 ? "3dmc:block/main" : "3dmc:block/tex_" + index;
  });
  const elements = document.cuboids.map((node, i) => {
    const solidKey = `solid_${i}`;
    if (node.material === "solid") textures[solidKey] = `3dmc:block/solid_${i}`;
    const faces = Object.fromEntries(FACE_DIRECTIONS.map((face) => {
      const binding = node.faces[face];
      const textureIndex = document.textures.findIndex(t => t.id === binding.textureId);
      const key = node.material === "solid" ? solidKey :
        textureIndex === 0 ? "painted" : "painted_" + textureIndex;
      return [face, {
        uv: [...binding.uv], texture: "#" + key,
        ...(binding.rotation === 0 ? {} : { rotation: binding.rotation })
      }];
    }));
    return { from: [...node.from], to: [...node.to], faces };
  });
  return { ambientocclusion: true, textures, elements };
}

function encodeJson(object: unknown): Uint8Array {
  return strToU8(JSON.stringify(object, null, 2) + "\n");
}

export function makeJava1214Pack(document: EditorDocument): JavaPackResult {
  // Re-run validation at this external boundary, even if UI controls are disabled.
  let source: EditorDocument;
  try { source = parseDocument(document); }
  catch (cause) {
    throw new JavaExportBlocked([error("INVALID_SOURCE",
      cause instanceof Error ? cause.message : "Document validation failed.")]);
  }
  const issues = inspectJava1214(source);
  if (issues.some((issue) => issue.severity === "error")) throw new JavaExportBlocked(issues);

  const files: Record<string, Uint8Array> = {
    [JAVA_PACK_PATHS.metadata]: encodeJson({
      pack: {
        pack_format: RESOURCE_PACK_FORMAT,
        description: "3dMc experimental block visual - Java Edition 1.21.4"
      }
    }),
    [JAVA_PACK_PATHS.blockstate]: encodeJson({
      variants: { "": { model: "3dmc:block/lantern" } }
    }),
    [JAVA_PACK_PATHS.model]: encodeJson(buildJava1214Model(source)),
    [JAVA_PACK_PATHS.mainTexture]: encodeRgbaPng(
      source.textures[0]!.width, source.textures[0]!.height, source.textures[0]!.pixels)
  };
  source.textures.slice(1).forEach((t, index) => {
    files[`assets/3dmc/textures/block/tex_${index + 1}.png`] =
      encodeRgbaPng(t.width, t.height, t.pixels);
  });

  source.cuboids.forEach((node, i) => {
    if (node.material !== "solid") return;
    const [r, g, b] = hexToRGB(node.color);
    files[`assets/3dmc/textures/block/solid_${i}.png`] = encodeRgbaPng(1, 1, [r, g, b, 255]);
  });

  // The fixed DOS epoch and insertion ordering make repeated exports byte-identical.
  // All entries are already compressed PNG or tiny JSON; STORE avoids needless work.
  const zip = zipSync(files, { level: 0, mtime: new Date(1980, 0, 1) });
  return {
    zip, paths: Object.keys(files), issues,
    release: JAVA_RELEASE, packFormat: RESOURCE_PACK_FORMAT,
    replaces: REPLACEMENT_BLOCK, gameVerified: GAME_EXPORT_VERIFIED
  };
}

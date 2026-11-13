import { createDefaultFaces, createSampleDocument, parseDocument } from "./domain";
import type { EditorDocument, Cuboid } from "./domain";
import { makeSixFaceDiagnosticDocument } from "../compatibility/diagnostic";
import { createAetherheartDocument } from "./aetherheart";

export type ProjectTemplate = "aetherheart" | "blank" | "cube" | "lantern" | "diagnostic";
export type TextureResolution = 16 | 32 | 64;

export interface NewProjectOptions {
  template: ProjectTemplate;
  name: string;
  resolution: TextureResolution;
  id?: string;
}

export const PROJECT_TEMPLATES: Array<{
  id: ProjectTemplate;
  title: string;
  detail: string;
  elements: string;
  image: string;
  texture: string;
}> = [
  { id: "blank", title: "Empty canvas", detail: "An open scene for your own shapes and ideas.",
    elements: "0 elements", image: "◻", texture: "Choose 16–64 px" },
  { id: "cube", title: "Textured block", detail: "One full-block cuboid with an editable pixel surface.",
    elements: "1 element", image: "▣", texture: "Choose 16–64 px" },
  { id: "lantern", title: "Copper Lantern", detail: "Seven assembled parts and a painted reference texture.",
    elements: "7 elements", image: "✦", texture: "32 × 32 px" },
  { id: "diagnostic", title: "UV laboratory", detail: "Six labeled faces for learning UV orientation.",
    elements: "1 element", image: "⌗", texture: "64 × 64 px" },
  { id: "aetherheart", title: "The Aetherheart", detail: "A complete celestial relay: a floating crystal, three gyroscopes, carved pylons and original pixel art.",
    elements: "236 editable parts", image: "✶", texture: "10 painted materials · 32/64 px" },
];

function starterPixels(resolution: TextureResolution): number[] {
  const pixels: number[] = [];
  for (let y = 0; y < resolution; y++)
    for (let x = 0; x < resolution; x++) {
      const tile = (Math.floor(x / Math.max(2, resolution / 8)) +
        Math.floor(y / Math.max(2, resolution / 8))) % 2;
      const color = tile ? [220, 229, 222] : [244, 248, 242];
      // A small distinct border makes UV flips easier to inspect on day one.
      const border = x === 0 || y === 0 || x === resolution - 1 || y === resolution - 1;
      pixels.push(...(border ? [71, 124, 103] : color), 255);
    }
  return pixels;
}

export function makeNewProject(options: NewProjectOptions): EditorDocument {
  const name = options.name.trim().slice(0, 100);
  if (!name) throw new Error("Give your new project a name.");
  if (![16, 32, 64].includes(options.resolution))
    throw new Error("Choose a 16, 32 or 64 pixel texture resolution.");
  const id = options.id || crypto.randomUUID();
  if (!id || id.length > 100) throw new Error("Invalid project ID.");

  if (options.template === "aetherheart" || options.template === "lantern" || options.template === "diagnostic") {
    const source = options.template === "aetherheart" ? createAetherheartDocument() :
      options.template === "lantern" ? createSampleDocument() : makeSixFaceDiagnosticDocument();
    return parseDocument({ ...source, id, name });
  }
  if (options.template !== "blank" && options.template !== "cube")
    throw new Error("Unknown project template.");

  const cuboids: Cuboid[] = options.template === "cube" ? [{
    id: "main-cuboid",
    name: "Main block",
    from: [0, 0, 0], to: [16, 16, 16],
    material: "texture", color: "#ffffff", faces: createDefaultFaces(),
    visible: true, locked: false
  }] : [];

  return parseDocument({
    schemaVersion: 3, id, name,
    target: { edition: "java", family: "static-block",
      candidateRelease: "1.21.4", status: "unverified" },
    cuboids,
    textures: [{ id: "main", name: "albedo.png", width: options.resolution,
      height: options.resolution, pixels: starterPixels(options.resolution) }],
    activeTextureId: "main"
  });
}

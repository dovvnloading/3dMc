import { createDefaultFaces, FACE_DIRECTIONS } from "../domain";
import { flattenRasterLayers } from "../layers";
import type { Cuboid, CuboidFaces, FaceDirection, FaceUVRect, PixelTexture, Vec3 } from "../domain";

/**
 * Hand-authored, one-block-wide furniture: an apothecary's working cabinet.
 *
 * This is an actual reusable model, not an editor template, a staged scene,
 * or a renderer decoration. Each physical component is an independently
 * editable cuboid in the native document. Color and lettering come from
 * purpose-built opaque 32 px pixel sheets, including editable detail layers.
 *
 * SOUTH (positive Z) is the front with four labeled drawers.
 * Y=0 is the floor; X/Z occupy 0..16 Minecraft model units.
 */
export const APOTHECARY_NAME = "Apothecary Cabinet";
export const APOTHECARY_ID = "apothecary-cabinet" as const;

type RGB = readonly [number, number, number];
type Surface = "apc-walnut" | "apc-oak" | "apc-endgrain" | "apc-iron" |
  "apc-brass" | "apc-porcelain" | "apc-verde" | "apc-azure" |
  "apc-rose" | "apc-vellum" | "apc-leather";
type Paint = (x: number, y: number) => RGB;
type Ink = (x: number, y: number) => RGB | null;

export interface AuthoredPrefab {
  readonly id: typeof APOTHECARY_ID;
  readonly name: typeof APOTHECARY_NAME;
  readonly description: string;
  readonly parts: readonly Cuboid[];
  readonly textures: readonly PixelTexture[];
  readonly palette: readonly string[];
}

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const color = (r: number, g: number, b: number): RGB => [byte(r), byte(g), byte(b)];
const shade = (rgb: RGB, n: number): RGB => color(rgb[0] + n, rgb[1] + n, rgb[2] + n);
const noise = (x: number, y: number, seed: number): number =>
  (((x * 43 + y * 71 + seed * 137) ^ ((x + 3) * (y + seed * 7))) % 13) - 6;

function sheet(id: Surface, name: string, pigment: Paint, detail?: Ink): PixelTexture {
  const pixels: number[] = [];
  const markings: number[] = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    pixels.push(...pigment(x, y), 255);
    if (detail) {
      const ink = detail(x, y);
      markings.push(...(ink ?? [0, 0, 0]), ink ? 255 : 0);
    }
  }
  if (!detail) return { id, name, width: 32, height: 32, pixels };
  const layers = [
    { id: "ground", name: "01 · Pigment", visible: true, opacity: 1, pixels },
    { id: "details", name: "02 · Hand-painted detail", visible: true, opacity: 1, pixels: markings }
  ];
  return {
    id, name, width: 32, height: 32, layers, activeLayerId: "details",
    pixels: flattenRasterLayers(layers, 32, 32)
  };
}

// Editable ink atlas. Coordinates are source pixels, also used for the Java
// UVs. Distinct silhouettes survive minification better than tiny lettering.
const seals = {
  verdant: { x: 0, y: 0, ink: ["..........", ".....###..", "...#####..", "..####.#..", "..###.....", "...#......", "..#.......", ".........."] },
  moon:    { x: 10, y: 0, ink: ["..........", "....###...", "...##.....", "..###.....", "...###..#.", "....####..", ".....##...", ".........."] },
  ember:   { x: 20, y: 0, ink: ["..........", ".....#....", "....##....", "...###.#..", "..######..", "...#.###..", "....###...", ".........."] },
  drawer:  { x: 0, y: 8, ink: ["................", ".++++++++++++++.", ".+............+.", ".+..###.####..+.", ".+............+.", ".++++++++++++++.", "................"] },
  crest:   { x: 16, y: 8, ink: ["................", "......+##+......", ".....##..##.....", ".++++#.++.#++++.", ".....######.....", ".......++.......", "................"] },
  leftPage: { x: 0, y: 16, ink: ["...........", ".+++++++...", "...........", "..####.##..", "...........", "......##...", ".....###...", "..##.#.....", "..####.##..", "....####...", ".....#.....", "....#......", "...........", "..###.###..", "...........", "..........."] },
  rightPage: { x: 11, y: 16, ink: ["...........", "..+++++++..", "...........", "..####.##..", "...........", "..##.####..", "...........", "..###.##...", "...........", "..##.####..", "...........", "..####.....", "...........", "....+++....", "...........", "..........."] },
  sage: { x: 22, y: 16, ink: ["..........", "...#..##..", "..####.#..", "....###...", "...#......", "..#.......", ".........."] },
  salt: { x: 22, y: 23, ink: ["..........", "....##....", "...####...", "..##..##..", "...####...", "....##....", ".........."] }
} as const;
type Decal = keyof typeof seals;

function paperInk(x: number, y: number): RGB | null {
  for (const stamp of Object.values(seals)) {
    const mark = stamp.ink[y - stamp.y]?.[x - stamp.x];
    if (mark === "#") return [70, 47, 34];
    if (mark === "+") return [155, 100, 48];
  }
  return null;
}

function decalUV(decal: Decal): FaceUVRect {
  const { x, y, ink } = seals[decal];
  return [x / 2, y / 2, (x + ink[0].length) / 2, (y + ink.length) / 2];
}

function materials(): PixelTexture[] {
  return [
    sheet("apc-walnut", "Apothecary · dark walnut.png", (x, y) => {
      const line = (y + Math.floor(x / 7)) % 7 === 0;
      const knot = ((x - 22) ** 2) / 25 + ((y - 13) ** 2) / 12;
      return shade([75, 50, 39], noise(x, y, 1) / 2 + (line ? -9 : 0) +
        (knot > 0.8 && knot < 1.4 ? 10 : 0));
    }),
    sheet("apc-oak", "Apothecary · warm oak grain.png", (x, y) => {
      const grain = (y + Math.floor(Math.sin(x * 0.18) * 1.1) + 7) % 7;
      const knot = ((x - 19) ** 2) / 24 + ((y - 20) ** 2) / 10;
      return shade([153, 103, 64], noise(x, y, 2) / 2 +
        (grain === 0 ? -15 : grain === 1 ? 5 : 0) +
        (knot > 0.8 && knot < 1.4 ? -13 : 0));
    }),
    sheet("apc-endgrain", "Apothecary · cut oak rings.png", (x, y) => {
      const distance = Math.hypot(x - 16, (y - 16) * 1.12);
      const ring = Math.floor(distance + Math.sin(x * .29 + y * .18));
      return shade([186, 136, 85], noise(x, y, 3) / 2 + (ring % 4 === 0 ? -19 : 8));
    }),
    sheet("apc-iron", "Apothecary · forged blue iron.png", (x, y) => {
      const brushed = y % 5 === 0 ? 10 : 0;
      return shade([62, 75, 84], noise(x, y, 4) / 1.7 + brushed - (x % 16 === 0 ? 12 : 0));
    }, (x, y) => {
      const rivet = [5, 26].some(cx => [5, 26].some(cy =>
        Math.abs(cx - x) <= 1 && Math.abs(cy - y) <= 1));
      return rivet ? [141, 154, 159] : null;
    }),
    sheet("apc-brass", "Apothecary · engraved brass.png", (x, y) =>
      shade([193, 142, 68], noise(x, y, 5) / 2 + (x % 8 === 0 ? -19 : 0) +
        (x % 8 === 1 ? 19 : 0)), (x, y) =>
      (y === 4 || y === 27) && x > 4 && x < 27 ? [246, 201, 116] :
        (x === 4 || x === 27) && y > 4 && y < 27 ? [91, 71, 42] : null),
    sheet("apc-porcelain", "Apothecary · cream porcelain.png", (x, y) => {
      const crackle = (x * 7 + y * 13) % 59 === 0;
      return shade([218, 211, 180], noise(x, y, 6) / 2 + (crackle ? -24 : 0));
    }, (x, y) =>
      y === 4 || y === 27 ? [136, 164, 151] :
        (x === 5 && y > 8 && y < 23) ? [239, 233, 210] : null),
    sheet("apc-verde", "Apothecary · verdant tonic.png", (x, y) => {
      const facet = x < 8 ? -22 : x > 24 ? -11 : 0;
      return color(39 + x * .9 + facet, 125 + y * 1.2 + facet, 108 + x * 1.3 + facet);
    }, (x, y) =>
      (x === 9 || x === 10) && y >= 6 && y <= 25 ? [175, 247, 206] :
        x === 24 && y >= 10 && y <= 20 ? [98, 221, 180] : null),
    sheet("apc-azure", "Apothecary · moonwater.png", (x, y) => {
      const facet = x < 8 ? -18 : x > 24 ? -15 : 0;
      return color(66 + x * 1.3 + facet, 132 + y * .9 + facet, 190 + x * .6 + facet);
    }, (x, y) =>
      (x === 9 || x === 10) && y >= 6 && y <= 25 ? [194, 240, 250] :
        x === 24 && y >= 10 && y <= 20 ? [126, 206, 251] : null),
    sheet("apc-rose", "Apothecary · emberroot elixir.png", (x, y) => {
      const facet = x < 8 ? -20 : x > 24 ? -13 : 0;
      return color(169 + y * .8 + facet, 67 + x * .7 + facet, 78 + x * .8 + facet);
    }, (x, y) =>
      (x === 9 || x === 10) && y >= 6 && y <= 25 ? [255, 187, 180] :
        x === 24 && y >= 10 && y <= 20 ? [235, 132, 131] : null),
    sheet("apc-vellum", "Apothecary · handwritten labels.png", (x, y) =>
      shade([231, 212, 167], noise(x, y, 10) / 2 + (y % 4 === 1 ? -4 : 0)), paperInk),
    sheet("apc-leather", "Apothecary · burgundy leather.png", (x, y) =>
      shade([102, 48, 52], noise(x, y, 11) / 1.8 +
        (x < 4 || x > 27 || y < 4 || y > 27 ? -15 : 0)), (x, y) =>
      ((x === 6 || x === 25) && y >= 6 && y <= 25) ||
      ((y === 6 || y === 25) && x >= 6 && x <= 25) ? [196, 134, 87] : null)
  ];
}

interface FaceFinish {
  readonly front?: Surface;
  readonly top?: Surface;
  readonly fullUv?: boolean;
  readonly decal?: Decal;
  readonly verticalGrain?: boolean;
}
function faces(from: Vec3, to: Vec3, surface: Surface, index: number,
  finish: FaceFinish = {}): CuboidFaces {
  const w = to[0] - from[0], h = to[1] - from[1], d = to[2] - from[2];
  const spans: Record<FaceDirection, readonly [number, number]> = {
    down: [w, d], up: [w, d], north: [w, h],
    south: [w, h], west: [d, h], east: [d, h]
  };
  const result = createDefaultFaces(surface);
  for (const [faceIndex, direction] of FACE_DIRECTIONS.entries()) {
    const decalFace = finish.decal === "leftPage" || finish.decal === "rightPage" ? "up" : "south";
    if (finish.decal && direction === decalFace) {
      result[direction] = { textureId: "apc-vellum", rotation: 0, uv: decalUV(finish.decal) };
      continue;
    }
    const textureId = direction === "south" && finish.front ? finish.front :
      direction === "up" && finish.top ? finish.top : surface;
    // The narrow sides of a paper seal or page sample unmarked parchment.
    if (textureId === "apc-vellum") {
      result[direction] = { textureId, rotation: 0, uv: [11.25, 15.25, 15.75, 15.75] };
      continue;
    }
    const side = direction !== "up" && direction !== "down";
    const turn = finish.verticalGrain && side;
    const full = finish.fullUv && side;
    const [width, height] = spans[direction];
    const su = full ? 16 : Math.min(15.5, Math.max(1, (turn ? height : width) * 1.5));
    const sv = full ? 16 : Math.min(15.5, Math.max(1, (turn ? width : height) * 1.5));
    const u = ((index * 3 + faceIndex) % 5) / 4 * (16 - su);
    const v = ((index * 2 + faceIndex * 3) % 5) / 4 * (16 - sv);
    result[direction] = { textureId, uv: [u, v, u + su, v + sv], rotation: turn ? 90 : 0 };
  }
  return result;
}

export function createApothecaryCabinet(): AuthoredPrefab {
  const parts: Cuboid[] = [];
  const add = (chapter: string, name: string, from: Vec3, to: Vec3,
    surface: Surface, finish: FaceFinish = {}) => {
    const serial = parts.length + 1;
    parts.push({
      id: "apc-part-" + String(serial).padStart(3, "0"),
      name: chapter + " / " + name,
      from, to, color: "#ffffff", material: "texture",
      faces: faces(from, to, surface, serial, finish),
      visible: true, locked: false
    });
  };
  const walnut: Surface = "apc-walnut", oak: Surface = "apc-oak",
    cut: Surface = "apc-endgrain", iron: Surface = "apc-iron",
    brass: Surface = "apc-brass", ceramic: Surface = "apc-porcelain",
    paper: Surface = "apc-vellum";

  // The lower cabinet is deep enough for the worktop. Its feet, mouldings
  // and panel frames meet at their edges instead of sharing exterior faces.
  for (const [side, x] of [["left", 1.16], ["right", 13.66]] as const)
    for (const [depth, z] of [["back", 2.58], ["front", 12.84]] as const) {
      add("Carcass", side + " " + depth + " turned foot",
        [x, 0, z], [x + 1.18, 1.21, z + 1.3], walnut, { verticalGrain: true });
      add("Carcass", side + " " + depth + " foot capital",
        [x - .13, 1.21, z - .15], [x + 1.31, 1.78, z + 1.45], oak);
    }
  add("Carcass", "sturdy enclosed base", [1.5, 1.78, 2.76], [14.5, 7.5, 14.2], walnut);
  add("Carcass", "front kick rail", [1.24, 1.78, 14.2], [14.76, 2.32, 14.58], oak);
  add("Carcass", "front upper rail", [1.24, 7.05, 14.2], [14.76, 7.5, 14.58], oak);
  add("Carcass", "left corner stile", [1.24, 2.32, 14.2], [2.12, 7.05, 14.65], oak, { verticalGrain: true });
  add("Carcass", "right corner stile", [13.88, 2.32, 14.2], [14.76, 7.05, 14.65], oak, { verticalGrain: true });
  add("Carcass", "central dovetail divider", [7.77, 2.32, 14.2], [8.23, 7.05, 14.62], oak, { verticalGrain: true });
  add("Carcass", "shadow line below countertop", [1, 7.5, 1.88], [15, 7.84, 15.12], walnut);
  add("Carcass", "continuous oak work surface", [.72, 7.84, 1.64], [15.28, 8.46, 15.38], oak);
  add("Carcass", "front counter lip", [.64, 7.88, 15.38], [15.36, 8.32, 15.64], walnut);
  add("Carcass", "counter edge brass inlay", [.94, 8.07, 15.64], [15.06, 8.2, 15.76], brass);

  for (const [side, x0, x1, inner0, inner1] of [
    ["left", 1.05, 1.5, 1.25, 1.5], ["right", 14.5, 14.95, 14.5, 14.75]
  ] as const) {
    add("Carcass", side + " inset side field", [inner0, 2.92, 3.94], [inner1, 6.54, 12.86], walnut);
    add("Carcass", side + " upper side moulding", [x0, 6.54, 3.54], [x1, 6.88, 13.26], oak);
    add("Carcass", side + " lower side moulding", [x0, 2.58, 3.54], [x1, 2.92, 13.26], oak);
    add("Carcass", side + " forward side stile", [x0, 2.92, 12.86], [x1, 6.54, 13.26], oak, { verticalGrain: true });
    add("Carcass", side + " rear side stile", [x0, 2.92, 3.54], [x1, 6.54, 3.94], oak, { verticalGrain: true });
  }
  add("Carcass", "upper back rail", [1.5, 6.95, 2.42], [14.5, 7.34, 2.76], oak);
  add("Carcass", "lower back rail", [1.5, 1.91, 2.42], [14.5, 2.3, 2.76], oak);
  add("Carcass", "back center stile", [7.74, 2.3, 2.46], [8.26, 6.95, 2.76], oak, { verticalGrain: true });

  const drawerRows = [[2.52, 4.59, "lower"], [4.8, 6.88, "upper"]] as const;
  const drawerColumns = [[2.28, 7.64, "left"], [8.36, 13.72, "right"]] as const;
  for (const [y0, y1, row] of drawerRows)
    for (const [x0, x1, column] of drawerColumns) {
      const label = row + " " + column, midX = (x0 + x1) / 2, midY = (y0 + y1) / 2;
      add("Drawers", label + " recessed dark joint", [x0, y0, 14.2], [x1, y1, 14.43], walnut);
      add("Drawers", label + " solid oak front", [x0 + .13, y0 + .12, 14.43],
        [x1 - .13, y1 - .12, 14.76], oak);
      add("Drawers", label + " raised bottom chamfer", [x0 + .19, y0 + .12, 14.76],
        [x1 - .19, y0 + .25, 14.84], walnut);
      add("Drawers", label + " engraved brass label", [midX - 1.08, midY + .10, 14.76],
        [midX + 1.08, midY + .68, 14.88], brass, { front: paper, decal: "drawer" });
      add("Drawers", label + " left handle socket", [midX - .92, midY - .49, 14.76],
        [midX - .58, midY - .19, 15.12], iron);
      add("Drawers", label + " right handle socket", [midX + .58, midY - .49, 14.76],
        [midX + .92, midY - .19, 15.12], iron);
      add("Drawers", label + " bowed brass pull", [midX - .82, midY - .51, 15.12],
        [midX + .82, midY - .30, 15.34], brass);
    }

  // A shallow rack stands against the rear of the worktop. There is no
  // overhead structure in front of the bottles or above the working area.
  add("Hutch", "inset walnut back panel", [1.88, 8.46, 2.06], [14.12, 15.26, 2.72], walnut);
  for (const [side, x0, x1] of [["left", 1.04, 1.88], ["right", 14.12, 14.96]] as const) {
    add("Hutch", side + " rear upright", [x0, 8.46, 1.96], [x1, 15.26, 3.24], oak, { verticalGrain: true });
    add("Hutch", side + " cantilever shelf bracket", [x0, 10.9, 3.24], [x1, 11.36, 6.90], oak);
    add("Hutch", side + " stepped bracket heel", [x0, 10.36, 3.24], [x1, 10.9, 5.26], walnut);
  }
  add("Hutch", "supporting display shelf", [1.02, 11.36, 2.72], [14.98, 11.80, 7.58], oak);
  add("Hutch", "display shelf carved front edge", [.96, 11.38, 7.58], [15.04, 11.72, 7.84], walnut);
  add("Hutch", "shelf edge brass stringing", [1.20, 11.5, 7.84], [14.80, 11.61, 7.96], brass);
  add("Hutch", "rear cornice shadow rail", [.84, 15.26, 1.78], [15.16, 15.48, 3.35], walnut);
  add("Hutch", "overhanging rear crown", [.54, 15.48, 1.58], [15.46, 15.74, 3.58], oak);
  add("Hutch", "raised crest", [5.43, 15.74, 1.76], [10.57, 16, 3.30], walnut);
  add("Hutch", "maker's mark apron", [6.1, 10.91, 7.58], [9.9, 11.38, 7.84], walnut);
  add("Hutch", "center brand plaque", [6.37, 10.98, 7.84], [9.63, 11.49, 7.98],
    brass, { front: paper, decal: "crest" });

  // Broad shouldered tonic, tall narrow moonwater vial and squat red elixir.
  // Every heel sits on the shelf and each stopper seats on its brass collar.
  const shelfY = 11.8;
  const potions = [
    { name: "Verdant tonic", x: 3.78, z: 5.58, width: 2.82, depth: 1.96, shoulder: 13.45,
      top: 14.92, neck: 1.02, potion: "apc-verde", decal: "verdant" },
    { name: "Moonwater", x: 8.04, z: 4.90, width: 1.86, depth: 1.56, shoulder: 14.05,
      top: 15.55, neck: .73, potion: "apc-azure", decal: "moon" },
    { name: "Emberroot elixir", x: 12.09, z: 5.58, width: 2.53, depth: 2.20, shoulder: 13.28,
      top: 14.54, neck: 1.27, potion: "apc-rose", decal: "ember" }
  ] as const;
  for (const { name, x, z, width, depth, shoulder, top, neck, potion, decal } of potions) {
    const left = x - width / 2, right = x + width / 2, back = z - depth / 2, front = z + depth / 2;
    add("Bottles", name + " dark glass heel", [left + .14, shelfY, back + .12],
      [right - .14, shelfY + .18, front - .12], potion);
    add("Bottles", name + " square blown-glass belly", [left, shelfY + .18, back],
      [right, shoulder, front], potion, { fullUv: true });
    add("Bottles", name + " stepped glass shoulder", [left + .22, shoulder, back + .14],
      [right - .22, shoulder + .22, front - .14], potion);
    add("Bottles", name + " narrow glass neck", [x - neck / 2, shoulder + .22, z - neck / 2],
      [x + neck / 2, top - .58, z + neck / 2], potion);
    add("Bottles", name + " spun brass collar", [x - neck / 2 - .09, top - .58, z - neck / 2 - .09],
      [x + neck / 2 + .09, top - .37, z + neck / 2 + .09], brass);
    add("Bottles", name + " fitted cork", [x - neck * .40, top - .37, z - neck * .40],
      [x + neck * .40, top, z + neck * .40], cut);
    add("Bottles", name + " handwritten paper seal", [x - .55, shelfY + .37, front],
      [x + .55, shelfY + 1.25, front + .08], paper, { decal });
  }

  add("Tools", "burgundy recipe book cover", [2.18, 8.46, 10.23], [7.98, 8.67, 14.28], "apc-leather");
  add("Tools", "open book left parchment", [2.45, 8.67, 10.45], [4.90, 8.91, 14.04],
    paper, { decal: "leftPage" });
  add("Tools", "open book right parchment", [5.06, 8.67, 10.45], [7.71, 8.91, 14.04],
    paper, { decal: "rightPage" });
  add("Tools", "stitched book spine", [4.90, 8.67, 10.4], [5.06, 8.85, 14.09], "apc-leather");
  add("Tools", "ribbon bookmark", [6.85, 8.67, 14.04], [7.16, 8.73, 14.53], "apc-rose");

  // Both ingredient jars stand forward of the bottle rack. Their different
  // heights leave the lids and seal illustrations readable in a three-quarter view.
  for (const { label, x, z, w, lipY, content, decal } of [
    { label: "ground sage", x: 3.2, z: 8.64, w: 1.77, lipY: 10.27, content: "apc-verde", decal: "sage" },
    { label: "moon salt", x: 6.84, z: 8.56, w: 1.64, lipY: 9.85, content: "apc-azure", decal: "salt" }
  ] as const) {
    add("Tools", label + " tall ceramic jar", [x - w / 2, 8.46, z - .72], [x + w / 2, lipY, z + .72], ceramic);
    add("Tools", label + " filled lip", [x - w * .42, lipY, z - .64], [x + w * .42, lipY + .18, z + .64], content);
    add("Tools", label + " black iron lid", [x - w / 2, lipY + .18, z - .76], [x + w / 2, lipY + .37, z + .76], iron);
    add("Tools", label + " paper identification band", [x - .53, lipY - .87, z + .72], [x + .53, lipY - .29, z + .80],
      paper, { decal });
  }
  // The waist and clipped-corner lip give the open mortar a bowl profile.
  // Short returns close the stepped corners without overlapping the rims.
  add("Tools", "porcelain mortar heavy base", [10.87, 8.46, 10.80], [13.06, 8.80, 12.85], ceramic);
  add("Tools", "mortar bowl floor", [10.44, 8.80, 10.54], [13.48, 9.14, 13.12], ceramic);
  add("Tools", "mortar left wall", [10.29, 9.14, 10.57], [10.63, 10.04, 13.09], ceramic);
  add("Tools", "mortar right wall", [13.29, 9.14, 10.57], [13.63, 10.04, 13.09], ceramic);
  add("Tools", "mortar back wall", [10.72, 9.14, 10.18], [13.20, 10.04, 10.57], ceramic);
  add("Tools", "mortar front wall", [10.72, 9.14, 13.09], [13.20, 10.04, 13.48], ceramic);
  for (const [direction, z0, z1] of [["back", 10.57, 10.88], ["front", 12.78, 13.09]] as const) {
    add("Tools", "mortar " + direction + " left return", [10.63, 9.14, z0], [11.04, 10.04, z1], ceramic);
    add("Tools", "mortar " + direction + " right return", [12.88, 9.14, z0], [13.29, 10.04, z1], ceramic);
  }
  add("Tools", "crushed verdant herbs inside mortar", [11.05, 9.14, 10.59], [12.87, 9.35, 13.07], "apc-verde");
  add("Tools", "porcelain pestle head", [11.87, 9.35, 11.11], [12.60, 9.95, 11.80], ceramic);
  add("Tools", "wooden pestle shaft", [12.17, 9.95, 11.25], [12.58, 11.42, 11.66], oak, { verticalGrain: true });
  add("Tools", "rounded pestle grip", [12.09, 11.42, 11.17], [12.66, 11.72, 11.74], walnut);

  return {
    id: APOTHECARY_ID,
    name: APOTHECARY_NAME,
    description: "Oak-and-walnut cabinet with four drawers, labeled elixirs, open ledger, jars, and a porcelain mortar.",
    parts, textures: materials(),
    palette: [
      "#36251e", "#6a422c", "#9f663d", "#ba8855", "#c18e44", "#f6c974",
      "#3e4b54", "#ded3b4", "#e4d1a5", "#66d3ae", "#9aebce",
      "#8ac3ed", "#c16878", "#662e34", "#ece1c3", "#2c201d"
    ]
  };
}

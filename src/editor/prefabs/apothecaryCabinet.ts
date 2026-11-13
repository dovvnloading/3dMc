import { createDefaultFaces, FACE_DIRECTIONS } from "../domain";
import { flattenRasterLayers } from "../layers";
import type { Cuboid, CuboidFaces, FaceDirection, PixelTexture, Vec3 } from "../domain";

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

function materials(): PixelTexture[] {
  return [
    sheet("apc-walnut", "Apothecary · dark walnut.png", (x, y) => {
      const line = (y + Math.floor(x / 7)) % 7 === 0;
      const knot = ((x - 22) ** 2) / 25 + ((y - 13) ** 2) / 12;
      return shade([54, 37, 30], noise(x, y, 1) / 2 + (line ? -12 : 0) +
        (knot > 0.8 && knot < 1.4 ? 10 : 0));
    }),
    sheet("apc-oak", "Apothecary · warm oak grain.png", (x, y) => {
      const grain = (y + Math.floor(Math.sin(x * 0.35) * 1.7)) % 7;
      const knot = ((x - 19) ** 2) / 24 + ((y - 20) ** 2) / 10;
      return shade([159, 102, 61], noise(x, y, 2) / 1.8 +
        (grain === 0 ? -24 : grain === 1 ? 10 : 0) +
        (knot > 0.8 && knot < 1.4 ? -19 : 0));
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
    sheet("apc-vellum", "Apothecary · handwritten labels.png", (x, y) => {
      const edge = x < 3 || y < 3 || x > 28 || y > 28;
      return shade(edge ? [174, 139, 87] : [228, 209, 165],
        noise(x, y, 10) / 2 - (y > 25 ? 7 : 0));
    }, (x, y) => {
      const border = (x === 5 || x === 26) && y >= 5 && y <= 26 ||
        (y === 5 || y === 26) && x >= 5 && x <= 26;
      const writing = [11, 15, 19, 23].includes(y) && x >= 9 && x <= (y === 19 ? 20 : 23) &&
        (x % 5 !== 0);
      return border ? [136, 97, 57] : writing ? [80, 65, 51] : null;
    }),
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
    const span = spans[direction];
    const su = finish.fullUv ? 16 : Math.min(15.5, Math.max(1, span[0] * 1.5));
    const sv = finish.fullUv ? 16 : Math.min(15.5, Math.max(1, span[1] * 1.5));
    const u = finish.fullUv ? 0 : ((index * 3 + faceIndex) % 5) / 4 * (16 - su);
    const v = finish.fullUv ? 0 : ((index * 2 + faceIndex * 3) % 5) / 4 * (16 - sv);
    result[direction] = {
      uv: [u, v, u + su, v + sv], rotation: 0,
      textureId: direction === "south" && finish.front ? finish.front :
        direction === "up" && finish.top ? finish.top : surface
    };
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

  // SUPPORT STRUCTURE — four real feet, a deep lower carcase, exposed oak
  // joinery and a durable butcher-block counter. The near face is Z-positive.
  for (const [side, x] of [["left", 1.1], ["right", 13.7]] as const)
    for (const [depth, z] of [["back", 2.35], ["front", 13.15]] as const)
      add("Carcass", side + " " + depth + " turned foot",
        [x, 0, z], [x + 1.2, 2.35, z + 1.35], walnut);
  add("Carcass", "sturdy enclosed base", [1.65, 1.7, 2.8], [14.35, 7.75, 14.2], walnut);
  add("Carcass", "front kick rail", [1.35, 1.85, 14.05], [14.65, 2.35, 14.58], oak);
  add("Carcass", "front upper rail", [1.35, 7.08, 14.05], [14.65, 7.52, 14.58], oak);
  add("Carcass", "left corner stile", [1.25, 2.3, 14.03], [2.12, 7.48, 14.65], oak);
  add("Carcass", "right corner stile", [13.88, 2.3, 14.03], [14.75, 7.48, 14.65], oak);
  add("Carcass", "central dovetail divider", [7.75, 2.3, 14.08], [8.25, 7.48, 14.7], cut);
  add("Carcass", "left side chamfer", [1.1, 2.15, 3.0], [1.65, 7.5, 13.9], oak);
  add("Carcass", "right side chamfer", [14.35, 2.15, 3.0], [14.9, 7.5, 13.9], oak);
  add("Carcass", "shadow line below countertop", [1.0, 7.48, 1.8], [15.0, 7.85, 15.2], walnut);
  add("Carcass", "continuous oak work surface", [0.7, 7.85, 1.6], [15.3, 8.48, 15.45], oak);
  add("Carcass", "front counter lip", [0.65, 7.88, 15.28], [15.35, 8.27, 15.68], cut);
  add("Carcass", "counter edge brass inlay", [1.0, 7.96, 15.7], [15.0, 8.08, 15.85], brass);
  // A raised fielded panel on EACH outside cheek makes the broad lower
  // carcass read like joinery rather than an undecorated solid wood cube.
  for (const [side, x0, x1] of [
    ["left", .99, 1.10], ["right", 14.90, 15.01]
  ] as const) {
    add("Carcass", side + " inset side field", [x0, 3.18, 4.09],
      [x1, 6.53, 12.58], walnut);
    add("Carcass", side + " upper side moulding", [x0, 6.54, 3.93],
      [x1, 6.82, 12.74], cut);
    add("Carcass", side + " lower side moulding", [x0, 2.92, 3.93],
      [x1, 3.19, 12.74], cut);
    add("Carcass", side + " forward side stile", [x0, 3.16, 12.4],
      [x1, 6.55, 12.74], oak);
    add("Carcass", side + " rear side stile", [x0, 3.16, 3.93],
      [x1, 6.55, 4.27], oak);
  }

  for (const [side, x] of [["left", 1.15], ["right", 14.4]] as const) {
    add("Carcass", side + " square brass corner", [x, 8.3, 14.62],
      [x + .46, 8.5, 15.04], brass);
  }

  // STORAGE — two rows of physical inset drawers, with separate walnut
  // shadow-rebates, oak faces, engraved label frames and pulled iron handles.
  const drawerRows = [[2.62, 4.58, "lower"], [4.85, 6.85, "upper"]] as const;
  const drawerColumns = [[2.30, 7.62, "left"], [8.38, 13.70, "right"]] as const;
  for (const [y0, y1, row] of drawerRows)
    for (const [x0, x1, column] of drawerColumns) {
      const label = row + " " + column, midX = (x0 + x1) / 2,
        midY = (y0 + y1) / 2;
      add("Drawers", label + " recessed dark joint", [x0, y0, 14.2],
        [x1, y1, 14.42], walnut);
      add("Drawers", label + " solid oak front", [x0 + .16, y0 + .15, 14.39],
        [x1 - .16, y1 - .15, 14.72], oak, { front: oak });
      add("Drawers", label + " raised bottom chamfer", [x0 + .2, y0 + .14, 14.7],
        [x1 - .2, y0 + .30, 14.79], cut);
      add("Drawers", label + " engraved brass label", [midX - .77, midY + .10, 14.74],
        [midX + .77, midY + .57, 14.88], brass, { front: paper });
      add("Drawers", label + " left handle socket", [midX - .73, midY - .24, 14.72],
        [midX - .46, midY + .01, 15.01], iron);
      add("Drawers", label + " right handle socket", [midX + .46, midY - .24, 14.72],
        [midX + .73, midY + .01, 15.01], iron);
      add("Drawers", label + " bowed brass pull", [midX - .65, midY - .27, 15.01],
        [midX + .65, midY - .13, 15.18], brass);
    }

  // HUTCH — open front, two substantial side cheeks and a full-height
  // panelled back. The long mid shelf supports three separate potion bottles.
  add("Hutch", "inset walnut back panel", [1.83, 8.49, 1.92],
    [14.17, 15.42, 2.62], walnut);
  // Open side frames make the merchandise visible from a three-quarter
  // viewpoint instead of enclosing the shelves in two solid opaque walls.
  add("Hutch", "left rear upright", [1.02, 8.49, 2.04],
    [1.85, 15.44, 3.35], walnut);
  add("Hutch", "right rear upright", [14.15, 8.49, 2.04],
    [14.98, 15.44, 3.35], walnut);
  for (const [side, x] of [["left", 1.02], ["right", 14.15]] as const) {
    add("Hutch", side + " lower open-frame rail", [x, 10.91, 3.32],
      [x + .83, 11.35, 13.65], oak);
    add("Hutch", side + " upper open-frame rail", [x, 14.75, 3.32],
      [x + .83, 15.16, 13.65], oak);
  }
  add("Hutch", "left front upright", [1.01, 8.45, 13.64],
    [2.15, 15.42, 14.72], oak);
  add("Hutch", "right front upright", [13.85, 8.45, 13.64],
    [14.99, 15.42, 14.72], oak);
  add("Hutch", "left carved back pilaster", [2.55, 8.6, 2.61],
    [2.98, 15.36, 2.93], oak);
  add("Hutch", "right carved back pilaster", [13.02, 8.6, 2.61],
    [13.45, 15.36, 2.93], oak);
  add("Hutch", "center back inlay", [7.76, 8.6, 2.62],
    [8.24, 15.29, 2.87], cut);
  add("Hutch", "supporting display shelf", [1.7, 11.46, 2.7],
    [14.3, 11.94, 14.55], oak);
  add("Hutch", "display shelf carved front edge", [1.65, 11.42, 14.47],
    [14.35, 11.79, 14.84], cut);
  // Shadow moulding follows the crown's perimeter. A solid shadow slab here
  // would erase the open skylight and conceal the colored bottles from above.
  add("Hutch", "rear cornice shadow rail", [0.88, 15.22, 1.75],
    [15.12, 15.49, 3.12], walnut);
  add("Hutch", "front cornice shadow rail", [0.88, 15.22, 14.12],
    [15.12, 15.49, 15.1], walnut);
  add("Hutch", "left cornice shadow rail", [0.88, 15.22, 3.12],
    [1.89, 15.49, 14.12], walnut);
  add("Hutch", "right cornice shadow rail", [14.11, 15.22, 3.12],
    [15.12, 15.49, 14.12], walnut);
  // The original full-size roof hid almost every bottle in the elevated
  // editor view. Four structural crown rails keep the silhouette while
  // exposing the hand-modeled potion stock from above and both sides.
  add("Hutch", "overhanging rear crown", [0.38, 15.48, 1.5],
    [15.62, 15.91, 3.06], oak);
  add("Hutch", "overhanging front crown", [0.38, 15.48, 14.27],
    [15.62, 15.91, 15.57], oak);
  add("Hutch", "overhanging left crown", [0.38, 15.48, 3.06],
    [1.85, 15.91, 14.27], oak);
  add("Hutch", "overhanging right crown", [14.15, 15.48, 3.06],
    [15.62, 15.91, 14.27], oak);
  add("Hutch", "front cornice moulding", [0.55, 15.49, 15.48],
    [15.45, 15.83, 15.87], cut);
  add("Hutch", "center brand plaque", [6.13, 15.57, 15.85],
    [9.87, 15.81, 15.98], brass, { front: paper });
  for (const x of [2.4, 5.6, 10.4, 13.6])
    add("Hutch", "corbeled shelf support at " + x, [x, 11.0, 13.9],
      [x + .33, 11.47, 14.41], brass);
  for (const x of [2.3, 13.4])
    add("Hutch", "upper crest brass rivet at " + x,
      [x, 15.65, 15.82], [x + .28, 15.9, 15.98], brass);

  // THREE POTIONS — separate bottle feet, faceted bodies, tapered necks,
  // collars, corks, parchment labels and side glints. No fake alpha/lighting.
  const potions: readonly [string, number, number, Surface][] = [
    ["Verdant tonic", 4.0, 10.52, "apc-verde"],
    ["Moonwater", 8.0, 9.65, "apc-azure"],
    ["Emberroot elixir", 12.0, 10.52, "apc-rose"]
  ];
  for (const [name, x, z, potion] of potions) {
    add("Bottles", name + " dark glass heel", [x - .92, 11.95, z - .86],
      [x + .92, 12.2, z + .86], iron);
    add("Bottles", name + " square blown-glass belly", [x - 1.07, 12.17, z - .95],
      [x + 1.07, 13.88, z + .95], potion, { fullUv: true });
    add("Bottles", name + " narrow glass neck", [x - .43, 13.88, z - .42],
      [x + .43, 14.47, z + .42], potion, { fullUv: true });
    add("Bottles", name + " spun brass collar", [x - .55, 14.27, z - .51],
      [x + .55, 14.46, z + .51], brass);
    add("Bottles", name + " fitted cork", [x - .35, 14.48, z - .35],
      [x + .35, 15.04, z + .35], cut);
    add("Bottles", name + " handwritten paper seal",
      [x - .68, 12.58, z + .95], [x + .68, 13.28, z + 1.07],
      paper, { fullUv: true });
    add("Bottles", name + " glass glint", [x + .78, 12.39, z + .945],
      [x + .88, 13.52, z + 1.07], ceramic);
  }

  // WORK SURFACE — open recipe book, two reagent jars and a real mortar
  // assembled from an inset bottom, four porcelain walls and visible herbs.
  add("Tools", "burgundy recipe book cover", [2.56, 8.49, 9.99],
    [7.52, 8.68, 13.28], "apc-leather");
  add("Tools", "open book left parchment", [2.87, 8.68, 10.23],
    [4.84, 8.88, 13.04], paper, { top: paper, fullUv: true });
  add("Tools", "open book right parchment", [4.89, 8.68, 10.23],
    [7.24, 8.88, 13.04], paper, { top: paper, fullUv: true });
  add("Tools", "stitched book spine", [4.76, 8.7, 10.03],
    [4.95, 8.97, 13.25], walnut);
  add("Tools", "raised gilt book corner", [7.1, 8.68, 12.9],
    [7.37, 8.81, 13.17], brass);
  for (const [label, x, z, content] of [
    ["ground sage", 3.8, 5.45, "apc-verde"],
    ["moon salt", 8.0, 5.56, "apc-azure"]
  ] as const) {
    add("Tools", label + " tall ceramic jar",
      [x - .86, 8.5, z - .7], [x + .86, 10.35, z + .7], ceramic);
    add("Tools", label + " filled lip",
      [x - .73, 10.31, z - .64], [x + .73, 10.48, z + .64], content);
    add("Tools", label + " black iron lid",
      [x - .92, 10.47, z - .78], [x + .92, 10.66, z + .78], iron);
    add("Tools", label + " paper identification band",
      [x - .66, 9.05, z + .69], [x + .66, 9.61, z + .80], paper,
      { fullUv: true });
  }
  add("Tools", "porcelain mortar heavy base", [10.34, 8.48, 9.58],
    [13.92, 8.86, 13.1], ceramic);
  add("Tools", "mortar left wall", [10.33, 8.86, 9.56],
    [10.79, 10.06, 13.12], ceramic);
  add("Tools", "mortar right wall", [13.48, 8.86, 9.56],
    [13.94, 10.06, 13.12], ceramic);
  add("Tools", "mortar back wall", [10.76, 8.86, 9.56],
    [13.5, 10.06, 10.02], ceramic);
  add("Tools", "mortar front wall", [10.76, 8.86, 12.66],
    [13.5, 10.06, 13.12], ceramic);
  add("Tools", "crushed verdant herbs inside mortar", [10.85, 8.85, 10.05],
    [13.39, 9.06, 12.6], "apc-verde");
  add("Tools", "wooden pestle shaft", [12.25, 9.14, 10.85],
    [12.67, 11.12, 11.27], cut);
  add("Tools", "porcelain pestle head", [12.11, 9.16, 10.73],
    [12.81, 9.77, 11.39], ceramic);

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

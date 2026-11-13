import { createDefaultFaces, FACE_DIRECTIONS, parseDocument } from "./domain";
import { flattenRasterLayers } from "./layers";
import type { Cuboid, CuboidFaces, EditorDocument, EditorGroup, FaceDirection, FaceRotation, PixelTexture, Vec3 } from "./domain";

/**
 * THE AETHERHEART — a complete, editable Minecraft block-model showcase.
 *
 * No external images, downloads, random values or renderer-only objects.
 * Every visible detail is a real cuboid with real face UVs and one of ten
 * editable pixel sheets. The scene is deterministic for portable archives,
 * local recovery and reproducible Java 1.21.4 pack experiments.
 */
export const AETHERHEART_NAME = "The Aetherheart · Celestial Relay";
type RGB = readonly [number, number, number];
type Surface = "stone" | "onyx" | "brass" | "gold" | "copper" | "aether" | "stars" | "runes" | "ivory" | "violet";
type Mark = (x: number, y: number) => RGB | null;
const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
const rgb = (r: number, g: number, b: number): RGB => [clamp(r), clamp(g), clamp(b)];
function grain(x: number, y: number, salt: number): number {
  const n = (Math.imul(x + salt * 31, 374761393) ^ Math.imul(y + salt * 17, 668265263)) >>> 0;
  return ((n ^ (n >>> 13)) % 25) - 12;
}
function tint(base: RGB, delta: number): RGB {
  return rgb(base[0] + delta, base[1] + delta, base[2] + delta);
}
function star(x: number, y: number, cx: number, cy: number, size = 2): boolean {
  return (x === cx && Math.abs(y - cy) <= size) || (y === cy && Math.abs(x - cx) <= size);
}
const constellations: readonly (readonly [number, number])[] = [
  [7, 8], [15, 17], [24, 10], [38, 18], [53, 8], [49, 33],
  [34, 42], [18, 49], [7, 37], [53, 52], [31, 29], [41, 59]
];

function paintSheet(
  id: Surface, name: string, size: 32 | 64,
  base: (x: number, y: number) => RGB, detail?: Mark
): PixelTexture {
  const basePixels: number[] = [], detailPixels: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    basePixels.push(...base(x, y), 255);
    if (detail) {
      const ink = detail(x, y);
      detailPixels.push(...(ink ?? [0, 0, 0]), ink ? 255 : 0);
    }
  }
  if (!detail) return { id, name, width: size, height: size, pixels: basePixels };
  const layers = [
    { id: id + "-pigment", name: "01 · Ground pigment", visible: true, opacity: 1, pixels: basePixels },
    { id: id + "-etching", name: "02 · Painted details", visible: true, opacity: 1, pixels: detailPixels }
  ];
  return {
    id, name, width: size, height: size, layers,
    activeLayerId: id + "-etching",
    pixels: flattenRasterLayers(layers, size, size)
  };
}

function makeMaterials(): PixelTexture[] {
  return [
    paintSheet("stone", "01 · Midnight basalt.png", 32, (x, y) => {
      const grout = x % 16 === 0 || y % 16 === 0;
      return tint([39, 49, 68], grain(x, y, 1) + (grout ? -16 : 0) + (x % 8 === y % 8 ? 3 : 0));
    }),
    paintSheet("onyx", "02 · Polished voidstone.png", 32, (x, y) => {
      const gleam = (x + y * 2) % 21 <= 1;
      return tint([21, 28, 48], grain(x, y, 2) / 2 + (gleam ? 14 : 0));
    }),
    paintSheet("brass", "03 · Antique brass.png", 32, (x, y) => {
      const rib = x % 8 === 0 ? -24 : x % 8 === 1 ? 13 : 0;
      return tint([148, 100, 54], grain(x, y, 3) + rib + (y % 16 === 0 ? -17 : 0));
    }),
    paintSheet("gold", "04 · Sun-gilt filigree.png", 32, (x, y) => {
      const sheen = x % 11 <= 2 ? 24 : (x + y) % 13 === 0 ? 30 : 0;
      return tint([212, 162, 89], grain(x, y, 4) / 2 + sheen - (y % 16 === 15 ? 27 : 0));
    }),
    paintSheet("copper", "05 · Patinated copper.png", 32, (x, y) => {
      const patina = grain(Math.floor(x / 3), Math.floor(y / 3), 5) > 3;
      return tint(patina ? [66, 137, 126] : [119, 85, 76], grain(x, y, 5) / 2);
    }),
    paintSheet("aether", "06 · Aetherheart crystal.png", 64, (x, y) => {
      const dx = Math.abs(x - 31.5), dy = Math.abs(y - 31.5);
      const depth = Math.max(0, 1 - Math.max(dx, dy) / 33);
      const facet = (x < 32 ? -12 : 14) + (y < 32 ? 12 : -5);
      const edge = Math.abs(dx - dy) <= 1 ? 20 : 0;
      return rgb(29 + depth * 67 + facet * 0.55 + edge,
        110 + depth * 121 + facet + edge,
        164 + depth * 83 + facet * 0.5 + edge);
    }, (x, y) => {
      if (star(x, y, 32, 32, 12) && (x === 32 || y === 32)) return [218, 255, 246];
      if (Math.abs(x - 32) === Math.abs(y - 32) && Math.abs(x - 32) < 12) return [112, 240, 239];
      if (star(x, y, 14, 16, 2) || star(x, y, 49, 46, 2)) return [185, 255, 245];
      if ((x + y * 11) % 137 === 0) return [133, 225, 248];
      return null;
    }),
    paintSheet("stars", "07 · Celestial chart.png", 64, (x, y) =>
      tint([28, 35, 80], grain(x, y, 7) / 2 + (x % 16 === 0 || y % 16 === 0 ? 5 : 0)),
    (x, y) => {
      if (constellations.some(([cx, cy]) => star(x, y, cx, cy, 1))) return [243, 232, 172];
      if (constellations.some(([cx, cy]) => x === cx + 1 && y === cy + 1)) return [110, 218, 226];
      if ((x * 37 + y * 19) % 163 === 0) return [155, 173, 214];
      if (Math.abs(x - y - 8) < 1 && x > 15 && x < 42) return [74, 120, 170];
      return null;
    }),
    paintSheet("runes", "08 · Astral inscriptions.png", 64, (x, y) =>
      tint([31, 56, 80], grain(x, y, 8) / 2 - (x % 16 === 0 || y % 16 === 0 ? 12 : 0)),
    (x, y) => {
      const u = x % 16, v = y % 16;
      const glyph = (u === 4 && v >= 3 && v <= 12) ||
        (u === 11 && v >= 3 && v <= 12) ||
        (v === 3 && u >= 4 && u <= 11) ||
        (v === 12 && u >= 4 && u <= 11) ||
        (u === v && u > 5 && u < 11) ||
        (u + v === 15 && u > 5 && u < 11);
      if (glyph) return x < 32 ? [116, 235, 208] : [226, 189, 113];
      return null;
    }),
    paintSheet("ivory", "09 · Moonstone porcelain.png", 32, (x, y) =>
      tint([198, 219, 210], grain(x, y, 9) / 2 + ((x + y) % 11 === 0 ? 16 : 0))),
    paintSheet("violet", "10 · Nebula amethyst.png", 32, (x, y) => {
      const jewel = Math.abs(x - 16) + Math.abs(y - 16) < 18;
      return tint(jewel ? [118, 81, 170] : [73, 50, 116], grain(x, y, 10) + (x === y ? 18 : 0));
    })
  ];
}

interface Finish { readonly faceTextures?: Partial<Record<FaceDirection, Surface>>; readonly fullUv?: boolean; }

/** Keep UVs inside 0–16 Minecraft space; small pieces sample small, offset tiles. */
function makeFaces(
  from: Vec3, to: Vec3, surface: Surface, serial: number, finish: Finish
): CuboidFaces {
  const width = to[0] - from[0], height = to[1] - from[1], depth = to[2] - from[2];
  const spans: Record<FaceDirection, readonly [number, number]> = {
    up: [width, depth], down: [width, depth],
    north: [width, height], south: [width, height],
    east: [depth, height], west: [depth, height]
  };
  const faces = createDefaultFaces(surface);
  FACE_DIRECTIONS.forEach((direction, faceIndex) => {
    const [uSpan, vSpan] = spans[direction];
    const u = Math.min(16 - uSpan, ((serial * 3 + faceIndex * 7) % 9) / 2);
    const v = Math.min(16 - vSpan, ((serial * 5 + faceIndex * 3) % 9) / 2);
    const uv: [number, number, number, number] =
      finish.fullUv ? [0, 0, 16, 16] : [u, v, u + uSpan, v + vSpan];
    const rotation: FaceRotation = finish.fullUv ? 0 :
      direction === "up" ? 90 : direction === "west" ? 270 : 0;
    faces[direction] = {
      uv, rotation, textureId: finish.faceTextures?.[direction] ?? surface
    };
  });
  return faces;
}

export function createAetherheartDocument(): EditorDocument {
  const cuboids: Cuboid[] = [], groups: EditorGroup[] = [];
  function add(name: string, from: Vec3, to: Vec3, surface: Surface, finish: Finish = {}): void {
    const serial = cuboids.length + 1;
    cuboids.push({
      id: "aether-" + String(serial).padStart(3, "0"), name,
      from, to, color: "#ffffff", material: "texture",
      faces: makeFaces(from, to, surface, serial, finish),
      visible: true, locked: false
    });
  }
  function section(id: string, name: string, build: () => void): void {
    const start = cuboids.length;
    build();
    groups.push({ id, name, memberIds: cuboids.slice(start).map(node => node.id) });
  }
  const corners = [
    { x: 2.8, z: 2.8, label: "NW" }, { x: 13.2, z: 2.8, label: "NE" },
    { x: 2.8, z: 13.2, label: "SW" }, { x: 13.2, z: 13.2, label: "SE" }
  ];

  section("foundation", "01 · Carved foundation", () => {
    add("Floating basalt footing", [1, 0, 1], [15, 1.15, 15], "stone");
    add("Shadow-cut bevel", [0.5, 1.15, 0.5], [15.5, 1.65, 15.5], "onyx");
    add("Gilded perimeter ledge", [0, 1.65, 0], [16, 2.05, 16], "brass");
    add("Basalt upper plinth", [0.55, 2.05, 0.55], [15.45, 2.85, 15.45], "stone");
    add("Celestial inlay · full star map", [2, 2.85, 2], [14, 3.07, 14], "onyx",
      { faceTextures: { up: "stars" }, fullUv: true });
    add("Recessed aether socket", [6.55, 3.07, 6.55], [9.45, 4.3, 9.45], "brass",
      { faceTextures: { up: "aether" } });
    for (const corner of corners) {
      const { x, z, label } = corner;
      add(label + " · foundation foot", [x - 1.25, 0, z - 1.25], [x + 1.25, 1.5, z + 1.25], "onyx");
      add(label + " · corner fillet", [x - 1.15, 2.82, z - 1.15], [x + 1.15, 3.25, z + 1.15], "gold");
    }
    for (const [edge, a, b] of [
      ["north", [0.9, 2.7, 0.65], [15.1, 3.15, 1.1]],
      ["south", [0.9, 2.7, 14.9], [15.1, 3.15, 15.35]],
      ["west", [0.65, 2.7, 0.9], [1.1, 3.15, 15.1]],
      ["east", [14.9, 2.7, 0.9], [15.35, 3.15, 15.1]]
    ] as const) {
      add("Top filigree · " + edge, a, b, "gold");
    }
    for (const [edge, a, b] of [
      ["north", [1.1, 1.31, 0.5], [14.9, 1.61, 0.82]],
      ["south", [1.1, 1.31, 15.18], [14.9, 1.61, 15.5]],
      ["west", [0.5, 1.31, 1.1], [0.82, 1.61, 14.9]],
      ["east", [15.18, 1.31, 1.1], [15.5, 1.61, 14.9]]
    ] as const) {
      add("Lower gold seam · " + edge, a, b, "brass");
    }
  });

  section("inscriptions", "02 · Compass and runic inscriptions", () => {
    for (let i = 0; i < 4; i++) {
      const p = 4.4 + i * 2.4;
      add("North · luminous scale " + (i + 1), [p, 3.07, 1.15], [p + 0.56, 3.28, 1.65], "runes");
      add("South · luminous scale " + (i + 1), [p, 3.07, 14.35], [p + 0.56, 3.28, 14.85], "runes");
      add("West · luminous scale " + (i + 1), [1.15, 3.07, p], [1.65, 3.28, p + 0.56], "runes");
      add("East · luminous scale " + (i + 1), [14.35, 3.07, p], [14.85, 3.28, p + 0.56], "runes");
    }
    for (const [name, box] of [
      ["North compass", [[7.1, 3.08, 3.35], [8.9, 3.32, 4.55]]],
      ["South compass", [[7.1, 3.08, 11.45], [8.9, 3.32, 12.65]]],
      ["West compass", [[3.35, 3.08, 7.1], [4.55, 3.32, 8.9]]],
      ["East compass", [[11.45, 3.08, 7.1], [12.65, 3.32, 8.9]]]
    ] as const) {
      add(name + " · enamel plaque", box[0], box[1], "runes", { fullUv: true });
    }
  });

  section("pylons", "03 · Four jewel-mounted pylons", () => {
    for (const { x, z, label } of corners) {
      add(label + " · broad copper shoe", [x - 1.18, 3.1, z - 1.18], [x + 1.18, 4.3, z + 1.18], "copper");
      add(label + " · gilded boot ring", [x - 1, 4.3, z - 1], [x + 1, 4.68, z + 1], "gold");
      add(label + " · monolithic basalt spine", [x - 0.72, 4.68, z - 0.72], [x + 0.72, 15.66, z + 0.72], "stone");
      const insideX = x < 8 ? x + 0.7 : x - 0.88;
      const insideZ = z < 8 ? z + 0.7 : z - 0.88;
      add(label + " · inner-facing brass conduit X",
        [insideX, 5.2, z - 0.25], [insideX + 0.18, 15.15, z + 0.25], "brass");
      add(label + " · inner-facing cyan conduit Z",
        [x - 0.25, 5.2, insideZ], [x + 0.25, 15.15, insideZ + 0.18], "aether");
      for (const [index, y] of [6.4, 10.2, 14.3].entries()) {
        add(label + " · engraved collar " + (index + 1),
          [x - 0.94, y, z - 0.94], [x + 0.94, y + 0.38, z + 0.94], index === 1 ? "gold" : "brass");
      }
      add(label + " · inset aether eye",
        [x - 0.35, 11.64, z - 0.95], [x + 0.35, 12.6, z - 0.68], "aether", { fullUv: true });
      add(label + " · keystone shoulder",
        [x - 1.13, 15.66, z - 1.13], [x + 1.13, 16.65, z + 1.13], "copper");
      add(label + " · engraved capital",
        [x - 0.96, 16.65, z - 0.96], [x + 0.96, 17.13, z + 0.96], "gold");
      add(label + " · finial stem",
        [x - 0.34, 17.13, z - 0.34], [x + 0.34, 18.35, z + 0.34], "brass");
      add(label + " · opal finial",
        [x - 0.53, 18.35, z - 0.53], [x + 0.53, 19.15, z + 0.53], "ivory");
      add(label + " · right rivet",
        [x + 0.72, 8.1, z - 0.17], [x + 0.97, 8.52, z + 0.17], "gold");
    }
  });

  section("canopy", "04 · Openwork clockwork canopy", () => {
    for (const [label, a, b] of [
      ["north", [2.4, 16.64, 2.2], [13.6, 17.15, 3.15]],
      ["south", [2.4, 16.64, 12.85], [13.6, 17.15, 13.8]],
      ["west", [2.2, 16.64, 3.1], [3.15, 17.15, 12.9]],
      ["east", [12.85, 16.64, 3.1], [13.8, 17.15, 12.9]]
    ] as const) add("Perimeter truss · " + label, a, b, "brass");
    for (const [label, a, b] of [
      ["north", [3.4, 17.15, 2.53], [12.6, 17.47, 2.9]],
      ["south", [3.4, 17.15, 13.1], [12.6, 17.47, 13.47]],
      ["west", [2.53, 17.15, 3.4], [2.9, 17.47, 12.6]],
      ["east", [13.1, 17.15, 3.4], [13.47, 17.47, 12.6]]
    ] as const) add("Bright canopy pinstripe · " + label, a, b, "gold");
    add("Central celestial gearbox", [6.5, 17.5, 6.5], [9.5, 18.6, 9.5], "copper");
    add("Crown of the north star", [7.05, 18.6, 7.05], [8.95, 19.17, 8.95], "gold");
    add("Topmost moonstone", [7.5, 19.17, 7.5], [8.5, 20.22, 8.5], "ivory", { fullUv: true });
    for (const [label, a, b] of [
      ["north", [7.75, 16.02, 6.45], [8.25, 17.5, 6.95]],
      ["south", [7.75, 16.02, 9.05], [8.25, 17.5, 9.55]],
      ["west", [6.45, 16.02, 7.75], [6.95, 17.5, 8.25]],
      ["east", [9.05, 16.02, 7.75], [9.55, 17.5, 8.25]]
    ] as const) add("Hanging anchor · " + label, a, b, "gold");
  });

  section("gimbals", "05 · Three celestial gyroscope rings", () => {
    // Each piece follows the local tangent instead of using the previous,
    // uniformly oversized rectangles. This leaves genuinely open negative
    // space through the rings, so the heart remains the visual focal point.
    const count = 20, centerY = 11.5, step = Math.PI * 2 / count;
    const radius = 4.55, equatorialRadius = 4.83;
    for (let i = 0; i < count; i++) {
      const angle = i * step, s = Math.sin(angle), c = Math.cos(angle);
      const halfHorizontal = Math.abs(s) * radius * step / 2 + 0.24;
      const halfVertical = Math.abs(c) * radius * step / 2 + 0.24;
      const gx = 8 + radius * c, gy = centerY + radius * s;
      const gz = 8 + radius * s;
      const material: Surface = i % 5 === 0 ? "ivory" : i % 2 === 0 ? "gold" : "brass";
      add("Meridian I · segment " + String(i + 1).padStart(2, "0"),
        [gx - halfHorizontal, gy - halfVertical, 7.56],
        [gx + halfHorizontal, gy + halfVertical, 8.07], material);
      add("Meridian II · segment " + String(i + 1).padStart(2, "0"),
        [7.93, gy - halfVertical, gz - halfHorizontal],
        [8.44, gy + halfVertical, gz + halfHorizontal],
        i % 5 === 0 ? "aether" : material);
      const ex = 8 + equatorialRadius * c, ez = 8 + equatorialRadius * s;
      const halfX = Math.abs(s) * equatorialRadius * step / 2 + 0.21;
      const halfZ = Math.abs(c) * equatorialRadius * step / 2 + 0.21;
      add("Equatorial orbit · segment " + String(i + 1).padStart(2, "0"),
        [ex - halfX, centerY - 0.22, ez - halfZ],
        [ex + halfX, centerY + 0.22, ez + halfZ],
        i % 5 === 0 ? "violet" : "copper");
    }
  });

  section("heart", "06 · The suspended Aetherheart crystal", () => {
    const slices = [
      [7.25, 8.1, 0.64], [8.1, 9.15, 1.35], [9.15, 10.1, 2.12],
      [10.1, 13.5, 2.63], [13.5, 14.65, 1.83], [14.65, 15.72, 1.06],
      [15.72, 16.4, 0.42]
    ] as const;
    slices.forEach(([fromY, toY, radius], index) => {
      add("Crystal facet · ascending tier " + (index + 1),
        [8 - radius, fromY, 8 - radius], [8 + radius, toY, 8 + radius],
        index === 0 || index === 6 ? "ivory" : index === 1 || index === 5 ? "violet" : "aether",
        { fullUv: true });
    });
    add("Visible north crystal facet", [6.55, 10.56, 5.11], [9.45, 12.92, 5.39], "aether", { fullUv: true });
    add("Visible south crystal facet", [6.55, 10.56, 10.61], [9.45, 12.92, 10.89], "aether", { fullUv: true });
    add("Visible east crystal facet", [10.61, 10.56, 6.55], [10.89, 12.92, 9.45], "aether", { fullUv: true });
    add("Visible west crystal facet", [5.11, 10.56, 6.55], [5.39, 12.92, 9.45], "aether", { fullUv: true });
    // Move the crossed light-bars onto the visible crystal faces; the previous
    // pair was entirely buried inside the solid central tier.
    add("Crosswind filament X", [5.55, 11.73, 4.94], [10.45, 12.04, 5.15], "ivory");
    add("Crosswind filament Z", [10.85, 11.73, 5.55], [11.06, 12.04, 10.45], "ivory");
    for (const [seamIndex, [direction, a, b]] of ([
      ["north", [6.25, 10.46, 4.96], [6.48, 13.25, 5.12]],
      ["north", [9.52, 10.46, 4.96], [9.75, 13.25, 5.12]],
      ["south", [6.25, 10.46, 10.88], [6.48, 13.25, 11.04]],
      ["south", [9.52, 10.46, 10.88], [9.75, 13.25, 11.04]],
      ["west", [4.96, 10.46, 6.25], [5.12, 13.25, 6.48]],
      ["west", [4.96, 10.46, 9.52], [5.12, 13.25, 9.75]],
      ["east", [10.88, 10.46, 6.25], [11.04, 13.25, 6.48]],
      ["east", [10.88, 10.46, 9.52], [11.04, 13.25, 9.75]]
    ] as const).entries()) {
      add("Prismatic light seam · " + direction + " " + (seamIndex % 2 ? "right" : "left"), a, b, "ivory");
    }
    add("Suspension bead above", [7.58, 16.4, 7.58], [8.42, 16.95, 8.42], "gold");
    add("Suspension bead below", [7.58, 6.6, 7.58], [8.42, 7.25, 8.42], "gold");
  });

  section("lenses", "07 · Four arcane focusing instruments", () => {
    const lenses = [
      { label: "North", x: 8, z: 2.6, axis: "z" },
      { label: "South", x: 8, z: 13.4, axis: "z" },
      { label: "West", x: 2.6, z: 8, axis: "x" },
      { label: "East", x: 13.4, z: 8, axis: "x" }
    ] as const;
    for (const lens of lenses) {
      const { label, x, z, axis } = lens;
      const halfX = axis === "x" ? 0.3 : 0.79, halfZ = axis === "z" ? 0.3 : 0.79;
      add(label + " · copper optical carriage",
        [x - halfX, 10.83, z - halfZ], [x + halfX, 12.38, z + halfZ], "copper");
      add(label + " · luminous aether lens",
        [x - halfX - 0.11, 11.09, z - halfZ - 0.11],
        [x + halfX + 0.11, 12.02, z + halfZ + 0.11], "aether", { fullUv: true });
      add(label + " · royal gold lens brow",
        [x - halfX - 0.16, 12.17, z - halfZ - 0.16],
        [x + halfX + 0.16, 12.47, z + halfZ + 0.16], "gold");
    }
  });

  section("shards", "08 · Orbiting star-shards and sparks", () => {
    const fragments = [
      [4.3, 8.8, 5.9], [11.9, 8.2, 10.8], [5, 15.8, 10.7], [11.5, 16.0, 4.9],
      [8.1, 5.6, 4.6], [4.5, 13.8, 8.4], [11.45, 6.2, 7.8], [8.6, 14.9, 12.1]
    ] as const;
    fragments.forEach(([x, y, z], i) => {
      const radius = i % 3 === 0 ? 0.57 : 0.38;
      add("Astral shard · " + String(i + 1).padStart(2, "0"),
        [x - radius, y, z - radius], [x + radius, y + 0.9, z + radius],
        i % 3 === 0 ? "violet" : i % 2 ? "ivory" : "aether", { fullUv: true });
      if (i % 2 === 0) add("Spark beneath shard " + (i + 1),
        [x - 0.15, y - 0.5, z - 0.15], [x + 0.15, y - 0.15, z + 0.15], "gold");
    });
  });

  section("clockwork", "09 · Clockwork accents and signed details", () => {
    for (const [label, x, z] of [
      ["NW", 5.1, 5.1], ["NE", 10.9, 5.1], ["SW", 5.1, 10.9], ["SE", 10.9, 10.9]
    ] as const) {
      add("Gilt engraved floor boss · " + label,
        [x - 0.7, 3.07, z - 0.7], [x + 0.7, 3.43, z + 0.7], "gold",
        { faceTextures: { up: "runes" }, fullUv: true });
      add("Inset moonstone · " + label,
        [x - 0.31, 3.43, z - 0.31], [x + 0.31, 3.68, z + 0.31], "ivory");
    }
    for (let i = 0; i < 4; i++) {
      const x = 5.35 + i * 1.76;
      add("Crown perforation · north " + (i + 1),
        [x, 16.78, 2.12], [x + 0.4, 17.33, 2.48], "violet");
      add("Crown perforation · south " + (i + 1),
        [x, 16.78, 13.52], [x + 0.4, 17.33, 13.88], "aether");
    }
  });

  return parseDocument({
    schemaVersion: 3,
    id: "aetherheart-showcase", name: AETHERHEART_NAME,
    target: { edition: "java", family: "static-block", candidateRelease: "1.21.4", status: "unverified" },
    cuboids, groups, textures: makeMaterials(), activeTextureId: "aether",
    palette: [
      "#151c30", "#273144", "#946436", "#d4a259", "#ead9a6", "#427f7e",
      "#80dbbf", "#b7fff3", "#235097", "#6369b0", "#764fa8", "#b982d8",
      "#c6dbd2", "#ffffff", "#7d554c", "#314757"
    ]
  });
}

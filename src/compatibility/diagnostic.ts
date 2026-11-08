import { createDefaultFaces, parseDocument } from "../editor/domain";
import type { EditorDocument, FaceDirection } from "../editor/domain";

/**
 * Independent creator-facing six-face inspection fixture.
 * Every face uses a different 16×16 tile in a 64×64 sheet, with a letter,
 * an upward arrow and non-symmetric corner markers. Nothing here represents
 * actual observed Minecraft behavior; it is an expected-output test oracle.
 */
export const FACE_DIAGNOSTIC_LAYOUT = [
  { face: "north", col: 0, row: 0, color: [218, 78, 90], letter: "N" },
  { face: "east",  col: 1, row: 0, color: [55, 170, 153], letter: "E" },
  { face: "south", col: 2, row: 0, color: [72, 108, 206], letter: "S" },
  { face: "west",  col: 3, row: 0, color: [155, 108, 197], letter: "W" },
  { face: "up",    col: 0, row: 1, color: [198, 145, 45], letter: "U" },
  { face: "down",  col: 1, row: 1, color: [78, 123, 77], letter: "D" }
] as const satisfies ReadonlyArray<{
  face: FaceDirection;
  col: number;
  row: number;
  color: readonly [number, number, number];
  letter: string;
}>;

const GLYPHS: Record<string, readonly string[]> = {
  N: ["10001", "11001", "10101", "10011", "10001"],
  E: ["11111", "10000", "11110", "10000", "11111"],
  S: ["01110", "10000", "01110", "00001", "11110"],
  W: ["10001", "10001", "10101", "10101", "01010"],
  U: ["10001", "10001", "10001", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "11110"]
};

export const FACE_TILE_SIZE = 16;
export const FACE_TEXTURE_SIZE = 64;

export function makeSixFaceDiagnosticDocument(): EditorDocument {
  const pixels = new Array<number>(FACE_TEXTURE_SIZE * FACE_TEXTURE_SIZE * 4);
  const put = (x: number, y: number, rgb: readonly number[]) => {
    const i = (y * FACE_TEXTURE_SIZE + x) * 4;
    pixels[i] = rgb[0]!;
    pixels[i + 1] = rgb[1]!;
    pixels[i + 2] = rgb[2]!;
    pixels[i + 3] = 255;
  };
  const fill = (x: number, y: number, w: number, h: number, rgb: readonly number[]) => {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) put(col, row, rgb);
  };

  fill(0, 0, FACE_TEXTURE_SIZE, FACE_TEXTURE_SIZE, [25, 30, 39]);
  const faces = createDefaultFaces();
  for (const entry of FACE_DIAGNOSTIC_LAYOUT) {
    const x = entry.col * FACE_TILE_SIZE;
    const y = entry.row * FACE_TILE_SIZE;
    fill(x, y, FACE_TILE_SIZE, FACE_TILE_SIZE, entry.color);
    for (let index = 0; index < FACE_TILE_SIZE; index++) {
      put(x + index, y, [23, 31, 42]);
      put(x + index, y + 15, [23, 31, 42]);
      put(x, y + index, [23, 31, 42]);
      put(x + 15, y + index, [23, 31, 42]);
    }
    // Corners indicate original UV orientation in Minecraft:
    // WHITE top-left, BLACK top-right, YELLOW bottom-left, PINK bottom-right.
    fill(x + 1, y + 1, 3, 3, [255, 255, 255]);
    fill(x + 12, y + 1, 3, 3, [12, 17, 25]);
    fill(x + 1, y + 12, 3, 3, [255, 228, 65]);
    fill(x + 12, y + 12, 3, 3, [252, 135, 175]);
    // A consistent upward-pointing arrow, regardless of the face's normal.
    fill(x + 7, y + 5, 2, 4, [248, 250, 255]);
    put(x + 6, y + 6, [248, 250, 255]);
    put(x + 9, y + 6, [248, 250, 255]);
    put(x + 7, y + 4, [248, 250, 255]);
    put(x + 8, y + 4, [248, 250, 255]);
    const glyph = GLYPHS[entry.letter]!;
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row]!.length; col++) {
        if (glyph[row]![col] === "1") put(x + 6 + col, y + 9 + row, [247, 250, 255]);
      }
    }
    faces[entry.face] = {
      uv: [entry.col * 4, entry.row * 4, entry.col * 4 + 4, entry.row * 4 + 4],
      rotation: 0
    };
  }

  return parseDocument({
    schemaVersion: 2,
    id: "java-1214-six-face-diagnostic",
    name: "Six-face UV diagnostic",
    target: {
      edition: "java", family: "static-block",
      candidateRelease: "1.21.4", status: "unverified"
    },
    cuboids: [{
      id: "orientation-cube", name: "Orientation test cube",
      from: [0, 0, 0], to: [16, 16, 16],
      color: "#ffffff", material: "texture",
      faces, visible: true, locked: false
    }],
    texture: {
      id: "main", name: "six-face-asymmetric.png",
      width: FACE_TEXTURE_SIZE, height: FACE_TEXTURE_SIZE, pixels
    }
  });
}

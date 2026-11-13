/**
 * Implemented Minecraft target contracts are distinct from editable .3dmc
 * schema versions. A selectable target is never equivalent to working support.
 *
 * The registry is deliberately data-only so domain, UI, validators and codecs
 * can share exact capabilities without pulling in browser or rendering code.
 */
export const JAVA_1214_PROFILE = {
  id: "java-1.21.4-static-block",
  edition: "java",
  release: "1.21.4",
  label: "Java Edition 1.21.4",
  availability: "experimental",
  resourcePackFormat: 46,
  assetFamilies: ["static-block", "static-item"],
  limits: {
    maxCuboidsPerModel: 256,
    maxModelsPerPack: 8,
    maxItemDefinitionsPerPack: 8,
    maxTextureSheetsPerModel: 16,
    maxTexturePixels: 64,
    minExportTexturePixels: 16,
    maxIndexedZipBytes: 12_000_000
  },
  texture: {
    alpha: false,
    squarePowerOfTwo: true,
    faceUvRange: [0, 16],
    supportedFaceRotations: [0, 90, 180, 270]
  },
  blockReplacements: [
    "diamond_block", "iron_block", "gold_block", "emerald_block",
    "lapis_block", "redstone_block", "netherite_block", "obsidian"
  ],
  itemReplacements: [
    "stick", "paper", "apple", "diamond_sword",
    "iron_ingot", "gold_ingot", "diamond", "emerald"
  ],
  itemModelType: "minecraft:model",
  limitation: "Resource packs only replace visuals, never block/item behavior.",
  verifiedInGame: false
} as const;

export const JAVA_263_PROFILE = {
  id: "java-26.3-static-block",
  edition: "java",
  release: "26.3",
  label: "Java Edition 26.3",
  availability: "unsupported",
  reason: "No 26.3 export/import codec, semantics or game-rendering profile has been implemented."
} as const;

export type JavaTargetRelease = typeof JAVA_1214_PROFILE.release |
  typeof JAVA_263_PROFILE.release;
export type JavaTargetProfile = typeof JAVA_1214_PROFILE | typeof JAVA_263_PROFILE;

export const JAVA_TARGET_PROFILES: readonly JavaTargetProfile[] =
  [JAVA_1214_PROFILE, JAVA_263_PROFILE];

export function getJavaTargetProfile(release: string): JavaTargetProfile | null {
  return JAVA_TARGET_PROFILES.find(profile => profile.release === release) ?? null;
}

export function implementedJava1214Profile(release: string): typeof JAVA_1214_PROFILE {
  if (release !== JAVA_1214_PROFILE.release)
    throw new Error("Java " + release +
      " is not supported by the current static-block/item codec. " +
      "Only the experimental Java " + JAVA_1214_PROFILE.release + " profile is implemented.");
  return JAVA_1214_PROFILE;
}

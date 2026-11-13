import { describe, expect, it } from "vitest";
import { JAVA_1214_PROFILE, JAVA_263_PROFILE, JAVA_TARGET_PROFILES,
  getJavaTargetProfile, implementedJava1214Profile } from "./profileRegistry";

describe("Minecraft Java versioned capability registry", () => {
  it("defines one implemented 1.21.4 static block/item contract", () => {
    expect(JAVA_1214_PROFILE.edition).toBe("java");
    expect(JAVA_1214_PROFILE.release).toBe("1.21.4");
    expect(JAVA_1214_PROFILE.availability).toBe("experimental");
    expect(JAVA_1214_PROFILE.resourcePackFormat).toBe(46);
    expect(JAVA_1214_PROFILE.assetFamilies).toEqual(["static-block", "static-item"]);
    expect(JAVA_1214_PROFILE.limits.maxModelsPerPack).toBe(8);
    expect(JAVA_1214_PROFILE.limits.maxTextureSheetsPerModel).toBe(16);
    expect(JAVA_1214_PROFILE.limits.minExportTexturePixels).toBe(16);
    expect(JAVA_1214_PROFILE.texture.supportedFaceRotations).toEqual([0, 90, 180, 270]);
    expect(new Set(JAVA_1214_PROFILE.blockReplacements).size)
      .toBe(JAVA_1214_PROFILE.blockReplacements.length);
    expect(new Set(JAVA_1214_PROFILE.itemReplacements).size)
      .toBe(JAVA_1214_PROFILE.itemReplacements.length);
    expect(JAVA_1214_PROFILE.verifiedInGame).toBe(false);
  });

  it("records unsupported targets explicitly without manufacturing a codec", () => {
    expect(JAVA_TARGET_PROFILES).toHaveLength(2);
    expect(getJavaTargetProfile("26.3")).toBe(JAVA_263_PROFILE);
    expect(getJavaTargetProfile("26.3")?.availability).toBe("unsupported");
    expect(getJavaTargetProfile("1.21.4")).toBe(JAVA_1214_PROFILE);
    expect(getJavaTargetProfile("0.0")).toBeNull();
    expect(implementedJava1214Profile("1.21.4")).toBe(JAVA_1214_PROFILE);
    expect(() => implementedJava1214Profile("26.3")).toThrow(/not supported/);
    expect(() => implementedJava1214Profile("unknown")).toThrow(/not supported/);
  });
});

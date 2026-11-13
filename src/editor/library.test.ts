import { describe, expect, it } from "vitest";
import { MAX_LIBRARY_SNAPSHOTS, validateLibraryEntry } from "./library";
import { MAX_NATIVE_BYTES } from "./nativeArchive";
import { MAX_NATIVE_PACK_BYTES } from "./nativePackArchive";

const oldRecord = () => ({
  id: "snapshot-12345678-1234-1234-1234-123456789abc",
  label: "Before UV edit", projectName: "Lantern", documentId: "lantern",
  savedAt: 100, revision: 2, byteLength: 1024, sha256: "a".repeat(64)
});

describe("bounded, backward-compatible library metadata", () => {
  it("preserves v1 standalone records without a kind field", () => {
    expect(validateLibraryEntry({ ...oldRecord(), archive: new ArrayBuffer(1024) }))
      .toEqual(oldRecord());
  });

  it("validates new standalone records without changing their size contract", () => {
    expect(validateLibraryEntry({ ...oldRecord(), kind: "document" }))
      .toEqual({ ...oldRecord(), kind: "document" });
    expect(() => validateLibraryEntry({ ...oldRecord(), kind: "document",
      byteLength: MAX_NATIVE_BYTES + 1 })).toThrow(/metadata/);
  });

  it("admits larger complete native packs only with a bounded model count", () => {
    const pack = { ...oldRecord(), kind: "pack", modelCount: 3,
      byteLength: MAX_NATIVE_BYTES + 1 };
    expect(validateLibraryEntry(pack)).toEqual(pack);
    expect(MAX_LIBRARY_SNAPSHOTS).toBe(12);
    expect(MAX_NATIVE_PACK_BYTES).toBeGreaterThan(pack.byteLength);
  });

  it("rejects broken legacy and pack metadata before any archive is read", () => {
    const invalid = [
      { id: "../file" }, { label: " " }, { savedAt: NaN },
      { revision: -1 }, { byteLength: 4_000_000 }, { sha256: "invalid" },
      { kind: "garbage" }, { kind: "pack" }, { modelCount: 2 },
      { kind: "document", modelCount: 2 },
      { kind: "pack", modelCount: 0 }, { kind: "pack", modelCount: 9 },
      { kind: "pack", modelCount: 2, byteLength: MAX_NATIVE_PACK_BYTES + 1 }
    ];
    for (const change of invalid)
      expect(() => validateLibraryEntry({ ...oldRecord(), ...change })).toThrow(/metadata/);
  });
});

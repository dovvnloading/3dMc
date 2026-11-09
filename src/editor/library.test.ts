import { describe, expect, it } from "vitest";
import { validateLibraryEntry } from "./library";
const metadata = () => ({ id: "snapshot-12345678-1234-1234-1234-123456789abc", label: "Before UV edit", projectName: "Lantern", documentId: "lantern", savedAt: 100, revision: 2, byteLength: 1024, sha256: "a".repeat(64) });
describe("bounded backup metadata", () => {
  it("returns only validated metadata, not archive bytes", () => {
    expect(validateLibraryEntry({ ...metadata(), archive: new ArrayBuffer(2) })).toEqual(metadata());
  });
  it("rejects malformed metadata and unsafe sizes", () => {
    for (const invalid of [{ id: "../file" }, { label: " " }, { savedAt: NaN }, { revision: -1 }, { byteLength: 4_000_000 }, { sha256: "not-a-digest" }])
      expect(() => validateLibraryEntry({ ...metadata(), ...invalid })).toThrow(/metadata/);
  });
});

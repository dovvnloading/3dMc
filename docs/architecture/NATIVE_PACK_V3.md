# Native multi-model project archives (container v3)

**Status:** native v3 source archives and an isolated, user-visible **Pack Studio** assembly workspace are implemented. Pack Studio can assemble, inspect, save/reopen, and export supported multi-model packs, but **live 3D editing of secondary pack models and pack-wide recovery are not yet implemented**. The main editor's Save/Open and local recovery remain single-model for safety.

## Format boundaries

There are **three independent version numbers**:

- Native editor source document: schema v3 (`EditorDocument`, one model and its textures)
- Pack-wide asset index: schema v1 (`PackDocument`, source IDs, texture references, resource paths and block replacements)
- Native source ZIP: container v3 (`.3dmc` files holding the pack index and all source documents)

Minecraft Java 1.21.4 resource-pack format 46 is unrelated. A source project archive can preserve transparent paint and locked/hidden elements that the current experimental game exporter cannot output.

## Container layout

A v3 archive is a deterministic, uncompressed ZIP containing:

```text
manifest.json
pack.json
models/0/document.json
models/0/textures/main.png
models/1/document.json
models/1/textures/main.png
...
```

The `manifest.json` declares `format: "3dmc-native-pack"`, `containerVersion: 3`, `packSchemaVersion: 1`, `pack: "pack.json"`, ordered `sources[]` with source IDs and exact file lists, and SHA-256 hashes for every payload except the manifest. ZIP checksums protect the stored directory entries; hashes protect the logical source files. Source documents retain schema v3 but refer to their PNG images via explicit descriptors. Source model identities are stored in the manifest and document, not guessed from filenames.

The active model is selected by the pack index. Source documents remain canonical, separate and immutable during archive encoding. No renderer meshes, browser recovery leases, or history stacks are serialized.

## Safety invariants

- Read only exact, non-compressed ZIP entries with bounded paths, entry sizes and file counts, and no ZIP64, comments, extra data, overlapping ranges or duplicate names.
- Require the exact files declared by the manifest and valid SHA-256 for every referenced document, texture and pack index.
- Validate source-document schema and PNG dimensions, pack index identity, and all model/texture reference bindings before returning editable data. No partial import or silent orphaned source files.
- Limit to eight model assets and a 12 MB total archive, with existing 64-pixel source textures and per-file budgets. These are initial limits, not a promise of unbounded projects.
- Preserve model names, element locks/visibility, per-face UV/rotation, complete RGBA pixels and active-model selection through round-trip tests.
- Existing v1/v2 native archives are still decoded by the original exact parser. `openNativePack` migrates a supported Java 1.21.4 legacy project in memory using `indexLegacyProject` without modifying its source bytes. An old document targeting unsupported 26.3 is not silently converted to a supported pack; the old single-model reader remains available.
- The old `decodeNativeProject` API must reject v3 rather than returning only one model and dropping the rest.

## Implementation APIs

`encodeNativePack(pack, sources)` writes the v3 source container.

`decodeNativePack(bytes)` reads **only** native pack v3 after verifying all included data.

`openNativePack(bytes)` recognizes v1/v2 and migrates them to an in-memory single-asset pack, or decodes v3 intact. Callers must treat the returned pack plus all source documents as one logical project. Do not pass only the active model to the old editor's document-replacement path and claim a successful pack import.

## Isolated Pack Studio assembly workflow

The main editor toolbar now offers **Pack Studio** for the supported Java 1.21.4 source target. The modal snapshots the current source model without changing the active editor or its recovery checkpoint. A creator can duplicate the model, add another existing single-model `.3dmc` source, choose between the two currently allowlisted property-free block replacements, inspect texture bindings, remove models, and undo/redo pack operations. The pack editor only offers a second replacement when one remains available, so its two-asset cap is intentionally narrower than the underlying eight-model source archive contract.

**Save pack .3dmc** produces native container v3 with all source documents and RGBA textures. **Open source pack** supports v3 and migrates supported v1/v2 projects into the staged session. It requires confirmation before discarding the staged pack and warns before closing with unsaved changes. **Export Java ZIP** invokes the validated indexed Java 1.21.4 writer; combined packs and the iron-block target still require independent in-game verification.

Pack Studio is explicitly an **isolated assembly workspace**, not a second active 3D editor. Closing it does not change the open model. Its source pack must be downloaded before closing to persist changes; it is not backed by local recovery yet. The main editor's standard Save/Open remains the existing single-model v2 route, which intentionally rejects v3 archives rather than silently stripping other models.

## Remaining integration work

1. Give the editor an authoritative pack session and separate active-model histories without losing changes on asset switching.
2. Extend Pack Studio's limited model assembly browser with safe user-defined resource paths, asset naming, search, and target-aware dependency inspection.
3. Make pack-aware v3 Save/Open the main editor workflow **only after** the active-model editing and recovery contract is implemented; continue to support legacy .3dmc and JSON files.
4. Integrate the strict target-profile validation and indexed Java writer in the export UI, and test combined packs in Minecraft before claiming game compatibility.
5. Add regression coverage for interruptions, quota failures, and aborted editor switches.

This work belongs to Workstreams A, D and F in the [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md).

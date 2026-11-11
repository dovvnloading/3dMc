# Native multi-model project archives (container v3)

**Status:** native v3 pack archives, live multi-model editing, Pack Studio management, complete source Save/Open, and generation-fenced pack-wide recovery are implemented for Java 1.21.4 pack projects. Native v1/v2 and legacy JSON remain readable. Java ZIP export is still experimental, and the iron-block/combined-pack appearance requires further in-game verification.

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

## Unified live Pack Studio workflow

The main workspace and Pack Studio manage **one pack session**. Use the model selector in the Scene hierarchy to switch the source being edited in Model/Paint/Preview. Pack Studio can duplicate or import source models, select allowed block replacements, inspect texture bindings, remove models and undo pack operations.

**Save project** downloads a complete native v3 pack archive when pack mode is active. **Open** recognizes v3 source packs, validates the complete archive before making changes, and requires confirmation to replace the workspace. Existing v1/v2 native and legacy JSON source projects retain their standalone workflow; the old single-model decoder still rejects v3 rather than dropping other models. A separate **Save pack .3dmc** action exists in Pack Studio for the same complete pack source.

Pack-wide browser recovery now stores the complete validated index, every source model, full RGBA textures and active asset as one hashed, generation-fenced checkpoint. Stale tabs cannot overwrite a newer owner's checkpoint. Recovery remains **local to this browser** and does not replace a portable .3dmc backup.

The indexed Java exporter supports two explicit property-free replacements (`minecraft:diamond_block` and `minecraft:iron_block`) as an experimental profile. The combined pack and iron-block target still require separate in-game checks; exporting these visuals does not register new game behavior.

## Remaining work

1. Improve asset paths, names, search, and dependency inspection in the model browser
2. Measure pack-wide recovery quotas, larger model/history performance and multi-device interaction
3. Verify combined-block Java 1.21.4 output in game and add a strict supported-target registry
4. Expand named-version import/export capabilities incrementally without claiming arbitrary pack support

This work belongs to Workstreams A, D and F in the [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md).

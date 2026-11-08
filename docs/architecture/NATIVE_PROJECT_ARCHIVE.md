# Native .3dmc source project — v1 contract

**Status:** Implemented and testable. Native source archives preserve more authoring data than Minecraft resource packs; they are not themselves Minecraft assets.

## Purpose

A resource-pack ZIP is a target-specific exported **game artifact**. It cannot recover every editing property, including part names, locks, visibility flags or history. The .3dmc archive is the editor's **portable source of truth**: it contains the canonical document, validated texture bytes, and format/integrity metadata. The app never silently substitutes a game export for a source project.

The **Save project** action now downloads **<safe-project-name>.3dmc**. **Open** accepts .3dmc and legacy .3dmc.json. Existing JSON files remain available as an explicit **Download legacy JSON backup** action in the Scene panel.

## Archive layout

Version 1 uses exactly three entries:

| Path | Description |
| --- | --- |
| manifest.json | format identifier, container version, schema version, the two content paths and their SHA-256 digests |
| document.json | canonical editor document v2 with names, ordered cuboids, dimensions, transforms, materials, per-face UV rectangles/rotations, visibility and locks; texture metadata points to the PNG rather than duplicating its pixels |
| textures/main.png | authoritative 8-bit RGBA pixel buffer, from top-left, 16–64 pixels per dimension |

All entries are STORED (ZIP compression method 0) with deterministic timestamps. Paths are fixed and never derived from user-controlled names. The contents are serialized in deterministic order so exporting the same source document produces the same archive bytes.

A compact manifest example:

\`\`\`json
{
  "format": "3dmc-native",
  "containerVersion": 1,
  "documentSchemaVersion": 2,
  "document": "document.json",
  "texture": "textures/main.png",
  "sha256": {
    "document.json": "<64-character SHA-256 hex>",
    "textures/main.png": "<64-character SHA-256 hex>"
  }
}
\`\`\`

The digest authenticates **integrity relative to this manifest**, not identity or a signer. There is no cloud account or encrypted storage in this version.

## Safety and fidelity

The import boundary checks all of the following before constructing an editable document:

- File size <= 3 MB, exactly three whitelisted paths, no unexpected files or duplicate names.
- Consistent ZIP central/local headers, no compressed/encrypted entries, no untracked bytes or overlapping regions, valid CRC32 on each entry.
- Independent SHA-256 matches for document.json and textures/main.png.
- Exact known metadata keys, declared native v1/schema v2, finite and valid cuboid/texture fields, no extra content silently dropped.
- PNG checksum, bounded RGBA8 decode, matching pixel dimensions, and canonical document validation.
- No mutation of the current workspace until explicit confirmation of a completely valid file.

Unknown future formats, missing blobs or unsupported files produce actionable errors rather than a best-effort lossy import. The native source retains full RGBA alpha values; the separate **Java 1.21.4 experimental exporter** still blocks unsupported alpha and unrelated geometry semantics.

## Creation workflow

**New** opens a starter gallery with four clearly scoped choices: **Empty canvas**, **Textured block**, **Copper Lantern**, and **UV laboratory**. The first two offer 16, 32 and 64-pixel textures; the reference templates retain their 32- and 64-pixel source sheets. Creating another project resets selection and undo history, rotates the local checkpoint writer generation to fence older saves, and schedules recovery for the fresh project. It does not claim the old workspace was durably backed up: the dialog offers a separate project download first.

## Migration and limitations

- Legacy .3dmc.json v1 and v2 documents continue to reopen through the old parser. A v1 source without face bindings receives six default full-sheet UV maps as a copy; its original file remains unchanged.
- This first native archive is one canonical document plus one PNG. It does **not** preserve arbitrary extra resources, animation, Bedrock structures, meshes or multiple source textures. Those require explicit future container versions and migration contracts.
- The native archive has no edit history. Undo history is session-local; reopening starts a new history.
- Downloads are initiated through the browser; a successful download event is **not** proof that the user retained the file. Local IndexedDB recovery is a separate device-local feature and never a substitute for a portable backup.
- The Java 1.21.4 game-pack codec remains experimental until the independent Minecraft client check in Issue #4.

## Verification

Vitest tests cover deterministic archives, exact paths, manifest and SHA checks, preservation of geometry/names/locks/visibility/UVs/alpha, v1 JSON migration, unknown format rejection, unexpected paths, truncated/mutated ZIP, bad CRC and invalid sizes. Chromium tests cover creating blank and textured projects, undo, saving/reopening a native project, importing legacy JSON, and preserving changes across source reopen.

The GitHub Pages production smoke still verifies that the bundled site loads under /3dMc/ and supports normal editing and archive download.

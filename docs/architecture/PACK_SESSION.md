# Pack-wide editor session and command history

**Status:** pure pack-session commands implemented, with focused tests. **Not yet connected to the current workspace, recovery store, native Save/Open buttons, or multi-asset browser.**

## State and ownership

A `PackSession` owns one canonical `PackSnapshot` containing the validated pack index and all editable source model documents. Its `past`, `future` and monotonic `revision` form **one authoritative history sequence** for both source-model edits and pack-index operations. Renderer meshes and browser storage objects do not become source state.

The active model is resolved through `pack.activeModelId` and the source-document ID. `selectPackModel` changes that pointer without adding a content undo entry, but advances the session revision so persistence could eventually acknowledge the new active workspace. Undo/redo prefers the currently selected model when it still exists in the restored snapshot and falls back to the saved active model when it does not.

## Reviewable operations now implemented

- `createPackSession` validates the pack index, source document schemas, file-independent asset IDs, references and the exact set of source models. At most eight indexed models may be open in this early profile.
- `editActivePackDocument` commits a validated edit to the active source using the shared history. Editing one model never edits another model's pixels or geometry.
- `addPackModel` appends an explicitly identified source document, model resource, replacement resource, and texture asset references.
- `removePackModel` removes a model and its orphaned pack textures and source document (if no other model refers to it). A pack retains at least one model. Undo can restore the removed source from the previous snapshot.
- `setModelResource` and `setTextureResource` rename output resource locations without modifying source geometry or changing internal stable IDs.
- `undoPackSession` and `redoPackSession` restore source documents and pack-wide metadata together; normal commands discard the redo branch when making a new edit.
- All commands use the existing pack index/source validators and reject duplicate output paths, unbound textures, unsupported metadata, stale source identities and invalid operations without partially applying them.

## Deliberate boundaries

The session does **not** yet automatically create pack texture asset bindings when a source document adds or deletes a texture. Such edits are rejected until the asset browser supports a reference-aware texture operation. This avoids silently dropping pixel data.

The session is not yet the live application's recovery document. The current editor still uses its original single-model `History`; replacing that with this session requires a carefully tested UI/recovery migration. Importing a v3 multi-asset source archive into the old single-model state would be lossy, so the interface does not do that.

## Next integration steps

1. Introduce a pack-aware recovery payload with versioned migration from existing single-model checkpoints, writer-generation fencing, and explicit interrupted-write behavior.
2. Render a pack asset browser with task-complete creation, switching, renaming, duplication and deletion using these commands, while keeping one authoritative revision sequence.
3. Wire native v3 source archive Save/Open and indexed resource pack export to the validated session (with progress/cancellation if required by measured workloads).
4. Add browser tests for complete multi-asset create → edit → switch → undo → save → reopen → export flows, plus real-game checks for the configured Java block replacements.

See the [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md) and [pack document contract](PACK_DOCUMENT.md).

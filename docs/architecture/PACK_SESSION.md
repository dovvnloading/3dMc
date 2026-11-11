# Pack-wide editor session and command history

**Status:** pack session is connected to the live 3D workspace, Pack Studio manager, pack-wide recovery and native v3 Save/Open for supported Java 1.21.4 projects. Existing legacy single-model projects retain their original editing and source-file path until entering pack mode.

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

## Integration checkpoint

The Scene panel model selector switches the authoritative active source document without duplicating history. Model and Paint tools operate on the selected source, while pack-level additions and replacements share the same undo stream. Source texture additions/removals update pack texture bindings atomically. The current source filename and ID remain stable across model switches; active selection and unfinished paint gestures are reset when switching.

Standard **Save project** downloads container v3 for pack mode; **Open** recognizes v3 and requires confirmation before replacing the complete workspace. The existing v1/v2 project path is retained for single-model projects. Pack sessions recover through generation-fenced, hashed IndexedDB checkpoints that include every source and the active model. Opening or recovering a different pack rotates the writer generation to prevent stale writes.

## Asset discovery and texture dependencies

Pack Studio now offers case-insensitive, multi-term filtering by model name, model/source IDs, replacement block, output resource paths and texture names/paths. Filtering changes only the visible list, **never** the selected source model, geometry, texture bytes, recovery snapshot or undo history. Empty-result views keep the active model safely selected. The **Edit selected model in 3D** action closes the manager and returns to the same live workspace.

Each source texture displays how many painted faces refer to it and which cuboids use those faces. Hidden cuboids count as dependencies because their source assignments still matter; cuboids with solid materials are excluded from painted-face counts. Resource names and dependency summaries are derived from the authoritative pack session rather than cached display state.

The current Java 1.21.4 export profile still permits at most two configured block replacements. Search is not a claim of broader Minecraft target support.

## Remaining work

- Larger pack asset browsing, target-aware model grouping and richer dependency diagnostics
- Tested performance/quotas on larger multi-model projects and cross-device usability
- More precise in-game verification for multiple block replacements and unsupported feature diagnostics
- Deferred migration of unsupported Java 26.3 sources; never advertise unsupported versions as exportable

See the [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md).

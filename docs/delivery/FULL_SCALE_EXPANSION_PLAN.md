# 3dMc: Full-Scale Expansion Plan

## Product direction

Build 3dMc into a polished, local-first Minecraft asset studio where creators can model, paint, organize, validate, and export complete resource packs.

The goal is an approachable workflow that produces dependable game-ready assets, not a general-purpose replacement for every 3D editor.

### Primary users

- Resource-pack creators building custom visual assets.
- Builders who want to customize their Minecraft worlds.
- Beginners who need an approachable creation workflow.
- Experienced creators who value precision and reliable exports.

Keep the core editor usable without accounts or a backend. Add optional online services only when they solve a demonstrated problem.

## Initial push: development milestones only

The current push is for **building the editor**. Milestones must deliver implemented code and usable creator features, not planning, documentation sweeps, test campaigns, in-game certification, performance reports, creator studies, or release sign-off. Work directly from the unimplemented features below. Keep existing safety and source-data protections while coding.

Routine developer checks can accompany a change, but testing and compatibility evidence are **not separate stages or blockers for progressing through this initial implementation push**. In-game, hardware, cross-browser, and release validation can happen later. Until verified, Minecraft compatibility claims remain explicitly experimental.

## Current foundation

Reviewed baseline: main at `552b14466f258a308b575a9bcd3717527aab18a1`.

Already present:

- React, TypeScript, Vite, Three.js, and React Three Fiber.
- Model, Paint, and Preview modes.
- Cuboid modeling, numeric editing, and move/resize gizmos.
- Multi-selection, batch edits, duplication, deletion, and scene ordering.
- Transactional gestures and undo/redo.
- Per-face UV rectangles, quarter-turn UV rotation, and texture assignment.
- Up to 16 named texture sheets and pixel-painting tools.
- Native `.3dmc` archives, migration, recovery, and local project snapshots.
- Bounded external Java model import with dependency preflight.
- Experimental Java 1.21.4 resource-pack export and pack-wide preflight.
- Unified Pack Studio multi-model editing, native pack v3 Save/Open, and pack-wide recovery.
- Configurable block/model/texture resource paths with diamond/iron visual replacements.
- Align/distribute modeling tools, searchable pack assets, and texture dependency inspection.
- Unit, browser, cross-browser, and compiled-site testing infrastructure.

Current constraints:

- Indexed Java export currently supports only `minecraft:diamond_block` and `minecraft:iron_block` visual replacements, not arbitrary block targets.
- It does not create block behavior, crafting recipes, collision, or new game registrations.
- Java export is restricted to the documented 1.21.4 static-block subset.
- The 26.3 option is marked unsupported; it is not a second working target.
- Native textures are limited to 64×64, and export has additional opacity and dimension restrictions.
- The document supports more cuboids than the current exporter can output.
- Geometry has align/distribute but not named groups, geometry mirroring, or element rotation.
- `App.tsx` owns substantial interaction and project orchestration.
- External import is intentionally narrower than arbitrary Minecraft pack support.

Older foundation-stage and quality-gate roadmaps are historical references, not required steps before further development.

## Define the first full release

A useful v1 should let a creator:

1. Start from a template or supported existing asset.
2. Create and organize multiple models and textures.
3. Model, UV-map, and paint with precise controls.
4. Save, reopen, and recover an editable project.
5. Choose supported Java block replacements and item workflows.
6. See clear target-specific warnings and errors.
7. Export a coherent multi-asset resource pack.
8. Understand exactly which Minecraft versions and features are supported.

### Defer until the core is dependable

- General polygon sculpting or CAD.
- Full Bedrock parity.
- Rigging and animation.
- Third-party executable plugins.
- Marketplace, payments, and social features.
- Real-time collaboration.
- AI generation as a requirement for normal editing.
- Broad claims of support for every Minecraft version.

## Workstream A: strengthen the foundation

### Keep documentation aligned as needed (not a milestone)

Update capability descriptions alongside the corresponding implementation changes. Do not schedule stand-alone documentation, research, or test-evidence stages during the initial push.

### Split responsibilities out of `App.tsx`

Extract in small, behavior-preserving steps:

- Editor session and command dispatch.
- Selection and tool state.
- Recovery and document replacement.
- Import/export jobs.
- Workspace layout and dialogs.

Preserve one canonical document, one revision sequence, and one authoritative history/transaction path. Renderer objects should remain derived from the document.

**Implementation target:** Behavior-preserving extracted modules that keep editing, cancellation, save/reopen, painting, and recovery working. Avoid a wholesale rewrite.

### Improve diagnostics

- Let an issue select the affected model, element, face, or texture.
- Explain the problem and offer a concrete corrective action.
- Distinguish unsupported content from malformed files.
- Preserve the source project if import or export fails.
- Explain the difference between recovery data, saved source projects, and exported game assets.

## Workstream B: productive modeling

Implement in roughly this order:

1. Named groups and a navigable hierarchy.
2. Align, distribute, and geometry-mirror operations.
3. Duplicate with offset and repeat/array tools.
4. Better numeric transforms and configurable snapping.
5. Element rotation and pivot editing within target-format limits.
6. Reusable components or prefabs.

### Design constraints

- Decide whether groups merely organize elements or also carry transforms before changing the schema.
- Treat grouping as an editor feature unless the export format has an equivalent.
- Keep geometry rotation distinct from existing UV rotation.
- Restrict or explicitly bake operations that the selected export target cannot represent.
- Never silently approximate unsupported geometry.

**Done when:** Each operation is undoable; cancel restores the exact prior document; locked/hidden rules remain consistent; and save/reopen preserves the new structure.

## Workstream C: UVs and painting

### UV workflow

- Add interactive UV selection and dragging alongside numeric controls.
- Highlight the corresponding 3D face and 2D region together.
- Add pixel snapping, copy/paste, and predictable mirrored mappings.
- Warn about overlaps and shared texture regions.
- Offer basic box-UV generation and optional packing for supported cuboids.
- Make conversions explicit so existing face bindings are not silently changed.

### Paint tools

- Line and rectangle tools.
- Selection masks and face-constrained painting.
- Palette management and flexible brush sizes.
- Previewable texture resize and crop.
- Texture naming, search, and usage inspection.

### Layers, after storage and history are ready

- Begin with raster layers, visibility, opacity, and reordering.
- Preserve editable layers in native projects.
- Flatten deterministically for game output.
- Integrate strokes and layer operations with shared undo.
- Add complex blending only after basic layer editing and deterministic flattening work.

**Done when:** 2D and 3D painting share the same pixel operations; rotated and mirrored UV fixtures affect the intended texels; exported output matches the supported preview; and layered projects reopen without data loss.

## Workstream D: complete resource packs

This is the highest-value expansion beyond the current experimental exporter.

### 1. Introduce a pack document

Represent:

- Pack metadata and target profile.
- Multiple model assets with stable IDs and resource paths.
- Textures and references.
- Supported blockstate and item relationships.
- Imported source and provenance.
- Diagnostics and export configuration.

Keep the active model editor separate from the pack-wide asset index.

### 2. Remove the hard-coded export identity

- Make namespaces and resource paths configurable.
- Let creators choose supported vanilla replacement targets.
- Detect duplicate paths and conflicting replacements.
- Preserve the current diamond-block export as a regression fixture.
- Explain that a resource pack changes visuals, not game behavior, unless a separate mod or plugin provides that behavior.

### 3. Support multiple assets

- Build an asset browser with search, rename, duplicate, and dependency inspection.
- Make rename/delete operations reference-aware.
- Add pack-wide validation.
- Generate deterministic ZIP exports.
- Preview generated files and affected vanilla targets before export.
- On import, distinguish editable assets, preserved originals, and unsupported content.

### 4. Add Java item workflows separately

- Define a version-specific item profile.
- Add item display contexts and corresponding previews.
- Generate the item definitions and model relationships required by that version.
- Build representative inventory, handheld, and display previews; defer formal in-game testing.
- Do not assume block export proves item compatibility.

**Done when:** A creator can make several assets, reopen the source project, and export one working pack without manually repairing generated JSON.

## Workstream E: versioned compatibility

Create a profile registry shared by the UI, validators, importers, and exporters.

Each profile should declare:

- Edition and exact supported version or range.
- Asset family.
- Coordinate, geometry, and rotation restrictions.
- Texture and material capabilities.
- Import behavior and export mappings.
- Known preview limitations.

Keep source-project schema versions separate from Minecraft format versions. A dropdown option must never imply support before its implementation exists; newly implemented formats remain experimental until verified later.

Start with the existing Java 1.21.4 profile. Choose the next target based on creator demand and the relevant current format documentation.

Expand imports field by field with representative source examples. Preserve original files where needed, retain existing archive and resource limits, and avoid silently discarding unsupported semantics.

## Workstream F: performance and data safety

As larger-project capabilities are implemented:

- Instrument memory, paint latency, history size, and export time where needed to guide code optimizations; formal benchmarking comes later.
- Replace expensive pixel snapshots with region or tile deltas where measurements justify it.
- Keep periodic recovery checkpoints.
- Move expensive decoding, encoding, and packaging into workers.
- Provide progress and cancellation for longer operations.
- Reject stale worker results using document and revision identity.
- Dispose GPU resources on replacement and shutdown.

Raise texture limits in bounded increments, such as 128 and then 256 pixels, rather than promising unlimited projects.

### Persistence

- Multiple named projects and a useful recent-project view.
- Clear backup/export reminders when browser storage is at risk.
- Safe, backward-compatible schema migrations.
- Recovery from quota errors and interrupted writes.
- No silent eviction of user-saved snapshots.
- Direct file saving where supported, with a download fallback.

**Done when:** A large reference project can be edited, repeatedly reopened, and exported without unbounded resource growth or loss of acknowledged edits.

## Workstream G: product polish

- Task-based onboarding: create → edit → paint → save → export.
- Original example projects demonstrating complete workflows.
- Contextual help and searchable commands.
- Consistent shortcuts and focus restoration.
- Clear empty, loading, unsupported, and recovery states.
- Desktop-first editing and usable narrow-screen inspection.
- Accessible labels, contrast, and non-color-only status indicators.
- Downloadable example projects and sample packs.

Defer release notes, bug-report processes, license inventories, product studies and launch preparation until the development push is complete. Consider offline installation or a desktop wrapper after user demand is established.

## Initial implementation sequence — development only

The foundational pack workflow is already implemented: live multi-model editing, native pack Save/Open and recovery, asset browser search and rename, indexed Java export, and align/distribute tools. **Do not repeat completed foundation work or add verification-only milestones.** Continue with these existing, unimplemented workstream features:

### Milestone 1: modeling and organization

- Implement named groups with a navigable hierarchy and reference-safe group operations.
- Add geometry mirroring and duplicate-with-offset/repeat/array tools; align/distribute already exist.
- Improve numeric transforms and configurable snapping without changing unsupported game geometry silently.

### Milestone 2: interactive UV and painting

- Implement interactive UV selection and dragging with linked 3D face highlighting.
- Add pixel snapping, face UV copy/paste and predictable mirrored mappings.
- Build line and rectangle paint tools, followed by palette and brush improvements.

### Milestone 3: item and format authoring

- Implement a version-scoped Java item authoring profile and necessary model/definition relationships.
- Add item editing and inventory/handheld/display previews.
- Extend bounded import handling for the supported fields and supported Java export targets.

### Milestone 4: richer editable projects

- Add editable raster layers, visibility, opacity and reordering, plus deterministic export flattening.
- Improve larger-project history, worker-based import/export, progress/cancel handling and source recovery.
- Add useful project organization, onboarding, keyboard accessibility and workspace polish.

Each milestone is complete for this push when its **code and UI actually work** with undo, save and reopen where applicable. These are feature-development increments, not calendar deadlines or release-certification gates. Later game/device/browser evidence does not block moving to the next implementation milestone.

## Divide work among code agents

- **Core:** document schema, commands, history, migrations, and persistence.
- **Modeling:** hierarchy, transforms, selection, and geometry tools.
- **Texture:** UV workflows, painting, layers, and pixel tests.
- **Compatibility:** profile and format implementation, importers, and exporters.
- **Integration:** connect features to the live editor, pack session, persistence, and existing UI.

### Coordination rules

- Agree on shared document contracts before parallel implementation.
- Assign one owner to each branch or heavily shared file.
- Keep PRs small and tied to complete creator tasks.
- Separate behavior-preserving refactors from new features.
- Integrate working code without turning review or testing into a separate development stage.
- Keep unverified game targets labeled experimental; implementation is not in-game certification.

## Development milestone completion (initial push)

A milestone is implemented when:

- Its feature is accessible and usable through the editor, not just an API or planning document.
- Edits use the canonical document or pack history and have appropriate undo/cancel behavior.
- Editable source state survives the relevant Save/Open path.
- Invalid input is handled without destroying existing work.
- Unsupported or unverified target behavior is not misrepresented as production-ready.

Do not make separate QA, game fixture, benchmarking, research, documentation, user study, or release-approval stages prerequisites for initial development. Ordinary developer checks are useful but are not milestones. Formal compatibility and release verification will be done later, before claiming verified support.

## Risks to watch

- Feature scope can outrun actual format compatibility.
- Higher texture limits multiply memory and history costs.
- An attractive preview may still differ from Minecraft.
- Broad import support can lose source semantics silently.
- Simultaneous schema changes can break old projects.
- Accounts and collaboration can consume effort without improving core creation.

**Guiding priority:** Make creating and exporting a complete, useful resource pack excellent before expanding into every Minecraft asset family.
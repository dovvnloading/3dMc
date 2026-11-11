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
- Experimental Java 1.21.4 resource-pack export.
- Unit, browser, cross-browser, and compiled-site testing infrastructure.

Current constraints:

- Export currently replaces `minecraft:diamond_block` using fixed paths.
- It does not create block behavior, crafting recipes, collision, or new game registrations.
- Java export is restricted to the documented 1.21.4 static-block subset.
- The 26.3 option is marked unsupported; it is not a second working target.
- Native textures are limited to 64×64, and export has additional opacity and dimension restrictions.
- The document supports more cuboids than the current exporter can output.
- Geometry does not yet have element rotation or a group hierarchy.
- `App.tsx` owns substantial interaction and project orchestration.
- External import is intentionally narrower than arbitrary Minecraft pack support.

Some older roadmap language describes an earlier foundation stage and conflicts with the current implementation and practical testing direction. Reconcile it before planning new work.

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

### 1. Align the documentation with reality

- Update the README, roadmap, backlog, and decision records to match the code.
- Clearly separate implemented, experimental, planned, and unsupported capabilities.
- Preserve useful game and device test observations without describing them as universal certification.
- Keep testing practical and proportional rather than introducing heavy release gates for every change.

**Done when:** A new contributor can understand what works today, what is next, and what is explicitly unsupported.

### 2. Split responsibilities out of `App.tsx`

Extract in small, behavior-preserving steps:

- Editor session and command dispatch.
- Selection and tool state.
- Recovery and document replacement.
- Import/export jobs.
- Workspace layout and dialogs.

Preserve one canonical document, one revision sequence, and one authoritative history/transaction path. Renderer objects should remain derived from the document.

**Done when:** Existing editing, cancellation, save/reopen, painting, and recovery tests pass after each extraction. Avoid a wholesale rewrite.

### 3. Improve diagnostics

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
- Add complex blending only after preview/export agreement is tested.

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
- Test representative inventory, handheld, and display cases.
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

Keep source-project schema versions separate from Minecraft format versions. A dropdown option must never imply support before its implementation and tests exist.

Start with the existing Java 1.21.4 profile. Choose the next target based on creator demand and the relevant current format documentation.

Expand imports field by field with real fixtures. Preserve original files where needed, retain existing archive and resource limits, and avoid silently discarding unsupported semantics.

## Workstream F: performance and data safety

Before increasing limits:

- Measure memory, paint latency, history size, and export time.
- Replace expensive pixel snapshots with region or tile deltas where measurements justify it.
- Keep periodic recovery checkpoints.
- Move expensive decoding, encoding, and packaging into workers.
- Provide progress and cancellation for longer operations.
- Reject stale worker results using document and revision identity.
- Dispose GPU resources on replacement and shutdown.

Raise texture limits in measured steps, such as 128 and then 256 pixels, rather than promising unlimited projects.

### Persistence

- Multiple named projects and a useful recent-project view.
- Clear backup/export reminders when browser storage is at risk.
- Safe, tested schema migrations.
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
- Release notes, known limitations, and downloadable sample packs.
- A bug-report template requesting version, target profile, and reproduction steps.
- An optional sanitized diagnostic bundle, with no automatic project uploads.
- Third-party asset/license inventory and clear Minecraft affiliation wording.

Consider offline installation or a desktop wrapper after user demand is established. If adding a service worker, test updates, stale caches, and recovery before claiming reliable offline use.

## Suggested implementation sequence

### First cycle: prepare the foundation

- Reconcile stale documentation.
- Extract one clear orchestration boundary from `App.tsx`.
- Add issue-to-element navigation.
- Design the pack document and migration contract.
- Implement configurable resource identity while preserving the current exporter fixture.

### Second cycle: complete the pack workflow

- Add a multi-asset browser and reference-safe operations.
- Export a small pack with several supported assets.
- Add groups and align/mirror tools.
- Improve interactive UV selection.

### Third cycle: expand creation capability

- Add a complete Java item profile.
- Expand supported imports using real examples and fixtures.
- Add high-value paint tools and palette management.
- Measure larger texture/history workloads and fix demonstrated bottlenecks.

### Following cycles

- Layers and higher texture budgets.
- Product polish informed by repeat users.
- A second explicitly supported Minecraft profile.
- Then decide whether Bedrock, animation, or integrations offer the most value.

These are ordering blocks, not calendar promises. Re-estimate after each usable slice.

## Divide work among code agents

- **Core:** document schema, commands, history, migrations, and persistence.
- **Modeling:** hierarchy, transforms, selection, and geometry tools.
- **Texture:** UV workflows, painting, layers, and pixel tests.
- **Compatibility:** profiles, imports, exports, and game fixtures.
- **Integration/review:** cross-feature regressions, documentation, and release checks.

### Coordination rules

- Agree on shared document contracts before parallel implementation.
- Assign one owner to each branch or heavily shared file.
- Keep PRs small and tied to complete creator tasks.
- Separate behavior-preserving refactors from new features.
- Review exact PR heads and rerun affected checks after integration.
- Do not claim in-game compatibility from unit tests alone.

## Definition of done

A feature is ready when it:

- Solves a concrete creator task through the visible UI.
- Has defined cancel, undo, and redo behavior.
- Survives save/reopen and relevant recovery paths.
- Handles invalid input without damaging current work.
- Has focused regression tests and relevant browser checks.
- Documents target-format restrictions.
- Includes a real game check when changed export behavior requires one.

Use the existing test infrastructure and add evidence where it reduces meaningful risk. Avoid requiring a formal certification exercise for every small change.

## Risks to watch

- Feature scope can outrun actual format compatibility.
- Higher texture limits multiply memory and history costs.
- An attractive preview may still differ from Minecraft.
- Broad import support can lose source semantics silently.
- Simultaneous schema changes can break old projects.
- Accounts and collaboration can consume effort without improving core creation.

**Guiding priority:** Make creating and exporting a complete, useful resource pack excellent before expanding into every Minecraft asset family.
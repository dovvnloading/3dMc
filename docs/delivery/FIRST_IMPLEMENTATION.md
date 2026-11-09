# First executable slice

**Status:** executable main-branch foundation with face-aware UV authoring implemented. See the current [testing notes](ALPHA_RELEASE_GATE.md).

This slice contains a React/Three.js application with a versioned cuboid/texture document and a bounded Java 1.21.4 experimental model and pack codec.

## Run

1. Install Node.js 22.12+ and npm.
2. Run `npm ci`.
3. Run `npm run dev` and open the printed local URL.
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. After `npx playwright install chromium`, run `npm run test:e2e` for Chromium workflow smoke tests.

Direct and transitive dependencies are now locked in `package-lock.json`; CI installs with `npm ci`.

## Currently executable

- Orbit, pan, zoom and select an original multi-cuboid lantern.
- Select from the synchronized scene list, hide and lock elements.
- Move or resize a selected cuboid with a viewport gizmo or exact inspector fields.
- Add, duplicate, delete, and rename elements.
- Open a contextual **Add shape** primitive library: full block, half slab, narrow column, thin panel, or small cube. Switch between solid-color and painted material and arrange the scene's element order.
- Use shared document undo/redo for geometry and pixel changes, including material conversion and scene order. Desktop Ctrl/Cmd+N opens New Project, Ctrl/Cmd+S downloads a native source, and Ctrl/Cmd+D duplicates the selected unlocked element.
- Paint actual RGBA texels in a 2D panel or by hitting a textured cuboid face in 3D, using face-specific UV mapping.
- Import external PNG textures through a preflight that offers nearest-neighbor scaling into the existing sheet or adoption of a square 16/32/64px PNG; export the editable texture as a standalone PNG. Both dimensions and pixels are one undoable edit.
- Paint with a pencil, a transparent eraser and exact four-connected flood fill on the shared RGBA sheet (2D or via 3D face picking); inspect alpha and undo complete strokes/fills.
- Select any cuboid face in Paint, edit its four UV edges and quarter-turn texture rotation, reset face UVs, and inspect the highlighted pixel region.
- Inspect a clean Preview mode.
- Download and reopen the self-contained native `.3dmc` ZIP source archive (manifest, document JSON, and editable PNG) with SHA-256 validation. Legacy `.3dmc.json` files and schema-v1→v2 migration remain supported.
- Create a **New Project** from an empty canvas, textured cube, copper lantern, or six-face UV lab. Choose 16/32/64-pixel texture sizes for the first two and use a deliberate replace-workspace confirmation.
- Save small local IndexedDB checkpoints atomically with a previous-candidate fallback and a writer-generation fence.
- Complete 2D paint strokes as one history action; Escape, pointer cancellation, loss of capture and window blur cancel transient pixels. 3D gizmo commits happen at normal gesture completion and cancel by restoring preview transforms.
- Create an explicitly **experimental Java Edition 1.21.4 pack** (resource-pack format 46), including an override for `minecraft:diamond_block`, six face references per cuboid, a source texture PNG, solid-color PNGs, and a ZIP archive.
- Re-import this exact generated resource-pack ZIP subset, with strict archive and PNG validation, a reviewable preflight, explicit native-metadata loss notices, and an editable recovered geometry/texture document.
- Review blockers and warnings before export; unsupported targets, out-of-range cuboids, and alpha prevent a misleading ZIP.
- Reject unrecognized project schemas, invalid sizes, unsupported profiles, and invalid texture bytes.

## Important limitations

- **Java 1.21.4 export is experimental, not game-verified.** It has deterministic structure and pixel tests, but the actual generated pack has not yet been checked in Minecraft. Do not label it compatible or ready for production use.
- Existing 26.3 candidate project files still open, but require an explicit target change before attempting this 1.21.4 export.
- The new **.3dmc native archive** uses a versioned, integrity-checked ZIP layout. Container v2 supports up to 16 named RGBA textures (each at most 64×64), explicit per-face source IDs/UVs and editor-only flags, while retaining validated container v1 support. This is the first portable source version, not an unlimited multi-texture or animation format. Legacy `.3dmc.json` is an opt-in compatibility backup.
- The exporter now writes explicit supported UV rectangles and quarter-turn face rotations. The first ZIP importer accepts only these generated structures. Third-party pack import, element transforms/rotation, dependency graphs, and renderer/game parity remain future work. The source project keeps richer metadata than the game output.
- Rotation editing is hidden until the selected profile is verified. Scale/translation gizmos are an integration proof, not an exhaustive interaction implementation.
- IndexedDB checkpoints now use **a single-tab lease and a monotonic generation** checked in the same transaction as publication. Another tab opens read-only and must explicitly take over; an older writer cannot publish new checkpoints after takeover. Browser storage is not a portable backup.
- Reloading creates a new writer identity. A recent lease may require an explicit takeover before continuing; the app retains the recovered content for an explicit decision.
- Quota exhaustion, battery/device sleep, interrupted source imports, other browser engines and cross-process GPU behavior are not exhaustively validated. A failed local save must leave a working native download route.
- The current history stores document snapshots (up to 50 operations) for small samples. Tiled texture history and larger workloads come later.
- No browser usability study, accessibility audit, real-device benchmark, or Minecraft game test has been run. CI build/unit tests do not substitute for those gates.

## Next required engineering tasks

1. Maintain green locked-install and Chromium smoke-test CI; expand the browser and real-device interaction matrix.
2. Extend the now-tested gesture controller to more browser/input devices and lost-capture/interrupted gizmo stress cases.
3. Extend the now-atomic writer-generation fence with explicit fault injection for quota exhaustion, upgrade blocking, corruption and checkpoint garbage collection.
4. Complete the [pinned Java 1.21.4 compatibility proof](../compatibility/JAVA_1214_EXPORT.md): independently check the blockstate/model and six-face texture directions in-game, record evidence, then decide whether to promote the profile.
5. Expand the v3 multi-texture workflow with GPU/device performance evidence and independently verified Minecraft render parity; the first migration and per-asset hashes are covered by tests. The initial `.3dmc` layout and manifest are documented in [Native archive](../architecture/NATIVE_PROJECT_ARCHIVE.md).
6. Run the creator task study and device baseline before any claim of polished release readiness.

Follow the dependency and acceptance rules in [BACKLOG.md](BACKLOG.md) and [QUALITY_GATES.md](QUALITY_GATES.md).

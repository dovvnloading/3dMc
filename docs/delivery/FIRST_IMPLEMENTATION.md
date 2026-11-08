# First executable slice

**Branch:** feat/editor-core-slice (stacked on docs/editor-foundation)

This change begins implementation and is deliberately not a claim that S0 or S1 quality gates have passed. It contains a real React/Three.js application, with a small cuboid/texture document that is not yet a Minecraft Java model codec.

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
- Use shared document undo/redo for geometry and pixel changes.
- Paint actual RGBA texels in a 2D panel or by hitting a textured cuboid face in 3D.
- Inspect a clean Preview mode.
- Download and reopen a constrained `.3dmc.json` prototype project.
- Save small local IndexedDB checkpoints atomically with a previous-candidate fallback.
- Create an explicitly **experimental Java Edition 1.21.4 pack** (resource-pack format 46), including an override for `minecraft:diamond_block`, six face references per cuboid, a source texture PNG, solid-color PNGs, and a ZIP archive.
- Review blockers and warnings before export; unsupported targets, out-of-range cuboids, and alpha prevent a misleading ZIP.
- Reject unrecognized project schemas, invalid sizes, unsupported profiles, and invalid texture bytes.

## Important limitations

- **Java 1.21.4 export is experimental, not game-verified.** It has deterministic structure and pixel tests, but the actual generated pack has not yet been checked in Minecraft. Do not label it compatible or ready for production use.
- Existing 26.3 candidate project files still open, but require an explicit target change before attempting this 1.21.4 export.
- The `.3dmc.json` file is a **transitional source format**. It is not the planned versioned ZIP `.3dmc` archive, and it supports one shared texture with a 64×64 ceiling.
- The exporter uses a full 0–16 UV rectangle on every face and replaces the blockstate mapping. Per-face UV editing, rotation, dependency imports, and renderer/game parity remain future work. The source project keeps richer metadata than the game output.
- Rotation editing is hidden until the selected profile is verified. Scale/translation gizmos are an integration proof, not an exhaustive interaction implementation.
- Local checkpoint publication is serialized within one tab. **A multi-tab ownership-generation fence is not yet implemented.** Work in one active tab; save a portable project file before risky operations. Browser storage is not a portable backup.
- The current history stores document snapshots (up to 50 operations) for small samples. Tiled texture history and larger workloads come later.
- No browser usability study, accessibility audit, real-device benchmark, or Minecraft game test has been run. CI build/unit tests do not substitute for those gates.

## Next required engineering tasks

1. Maintain green locked-install and Chromium smoke-test CI; expand the browser and real-device interaction matrix.
2. Implement a complete gesture transaction controller, including tests for lost pointer capture, cancellation, and exact numeric commit semantics.
3. Finish multi-tab recovery fencing and fault injection, including stale save completions, quota exhaustion, corruption, and checkpoint garbage collection.
4. Complete the [pinned Java 1.21.4 compatibility proof](../compatibility/JAVA_1214_EXPORT.md): independently check the blockstate/model and six-face texture directions in-game, record evidence, then decide whether to promote the profile.
5. Replace the transitional JSON project with a versioned native archive and migrations.
6. Run the creator task study and device baseline before any claim of polished release readiness.

Follow the dependency and acceptance rules in [BACKLOG.md](BACKLOG.md) and [QUALITY_GATES.md](QUALITY_GATES.md).

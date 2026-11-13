# 3dMc

An open-source, browser-based studio for creating and modifying Minecraft assets with React and Three.js.

**Product direction:** a precise 3D editor that feels approachable from the first session. Model, paint, inspect, and export in one coherent workspace, with Minecraft compatibility built into the editing experience.

## Web app

**GitHub Pages:** [Open 3dMc Studio](https://dovvnloading.github.io/3dMc/).

**Example prefab — The Aetherheart:** In the existing **New Project** picker, choose **The Aetherheart** to load a complete, editable Minecraft block model. Its 236 cuboids, nine groups, ten painted texture assets, layered rune artwork, UVs, and material palette are real editor data, not a special showcase UI. [Prefab breakdown and export limitations](docs/delivery/AETHERHEART_SHOWCASE.md).

**Pack Studio (experimental):** One shared pack session now powers the live 3D Model/Paint editor and Pack Studio asset manager. Switch between models in the Scene panel, edit each model's geometry and textures, undo across pack operations, recover the whole pack locally, and save/reopen a multi-model `.3dmc` source archive. The initial Java 1.21.4 pack export remains limited to two compatible block replacements, and additional game validation is pending. See [native pack v3 and Pack Studio boundaries](docs/architecture/NATIVE_PACK_V3.md).

The public site must publish Vite's compiled `dist/` files, **not** the raw repository `index.html` and TypeScript sources. The [Pages deployment guide](docs/delivery/PAGES_DEPLOYMENT.md) explains the automated release workflow and one-time Pages **Source: GitHub Actions** setting. Local development is still `npm ci && npm run dev`; GitHub Pages uses `npm run build -- --mode github-pages`.

## Project status

**An executable editor is on the main branch.** It provides a React/Three.js viewport, cuboid authoring, texture painting, undo/redo, project files and local recovery. Per-face UV rectangles, four quarter-turn rotations and native project schema v3 (up to 16 named texture sheets) are implemented. The current reliability slice adds **atomic painting gestures and generation-fenced local recovery across tabs**. The planning documents describe the project direction and testing goals. A **Java 1.21.4 experimental resource-pack pipeline** now exports model/blockstate JSON, PNGs and ZIPs, and can import the exact subset of packs it generates for further editing. It performs strict file and schema checks and shows a preflight before replacing the workspace. A new **New Project** workflow offers empty, textured-block, lantern and six-face reference templates. The default source backup is now a self-contained **.3dmc** ZIP archive; legacy .3dmc.json files remain supported. The experimental Java pack codec now also round-trips supported face UV rectangles and quarter-turn rotations. The diagnostic and an authored lantern have been [tested in Minecraft 1.21.4](docs/evidence/java-1.21.4-2026-11-09/REPORT.md); the exporter does not register new block behavior or claim arbitrary third-party pack import.

The current creator milestone makes the first session useful: choose a template, shape and paint it, and download a source project you can reopen later. The texture workflow includes **PNG import with explicit scaling/size choices, separate named texture assets and per-face assignments, native PNG export, transparent erasing, and RGBA-aware connected fill**, retaining one-step undo and honest alpha warnings for the experimental Java pack target. A contextual primitive library now provides full blocks, slabs, columns, panels, and small cubes; material controls switch between a solid swatch and the shared painted texture. Scene ordering is explicit and undoable. The first target remains a deliberately small Java block asset profile. A creator should be able to shape an original cuboid asset, paint it, undo changes, save and reopen their project, and export a resource pack verified in a specific Minecraft release.

## Start here

Read the [planning guide](docs/README.md) for the recommended reading order and the decisions that remain open. The [native project format contract](docs/architecture/NATIVE_PROJECT_ARCHIVE.md) describes the portable .3dmc source archive and legacy migration. The [resource lifecycle and recovery baseline](docs/delivery/RESOURCE_AND_RECOVERY_BASELINE.md) records the 1/4/16 sheet reference tests and interrupted storage cases. The [PNG texture workflow](docs/delivery/TEXTURE_WORKFLOW.md) explains the import preflight, pixel scaling and current limits. [Creation tools and shortcuts](docs/delivery/CREATOR_TOOLS.md) explain the primitive library, materials, scene ordering and keyboard workflows. The [reliability implementation notes](docs/delivery/RELIABILITY_SLICE.md) distinguish what is protected today from future fault-injection and device testing. The [six-face game worksheet](docs/compatibility/SIX_FACE_GAME_CHECK.md) documents a reproducible asymmetric fixture, and the [game report](docs/evidence/java-1.21.4-2026-11-09/REPORT.md) records its Minecraft 1.21.4 run.

| Document | What it answers |
| --- | --- |
| [Product brief](docs/product/PRODUCT_BRIEF.md) | Who the editor serves, what quality means, and what the first release includes |
| [Workspace specification](docs/design/WORKSPACE_SPEC.md) | The layout, modes, interactions, onboarding, shortcuts, and recovery experience |
| [Design system](docs/design/DESIGN_SYSTEM.md) | The visual language, component contracts, accessibility, and design review standards |
| [Technical design](docs/architecture/TECHNICAL_DESIGN.md) | Document state, rendering, commands, painting, persistence, workers, and module boundaries |
| [Pack document contract](docs/architecture/PACK_DOCUMENT.md) | Pack-wide asset IDs, resource path validation, and planned native migration |
| [Native pack source archive v3](docs/architecture/NATIVE_PACK_V3.md) | Multi-model ZIP, legacy migration, live Save/Open and recovery limitations |
| [Compatibility strategy](docs/architecture/COMPATIBILITY.md) | Asset families, format profiles, import/export fidelity, and version evidence |
| [Full-scale expansion plan](docs/delivery/FULL_SCALE_EXPANSION_PLAN.md) | Current expansion milestone: priority workstreams, implementation cycles, coordination, and definition of done |
| [Expansion implementation checkpoint](docs/delivery/EXPANSION_PROGRESS.md) | Integrated pack workflow, test evidence, current limitations and next development slices |
| [Delivery roadmap](docs/delivery/ROADMAP.md) | Stages, dependencies, staffing assumptions, and the first two sprints |
| [Quality gates](docs/delivery/QUALITY_GATES.md) | Testing goals and engineering guidance |
| [Implementation backlog](docs/delivery/BACKLOG.md) | Ordered work packages with acceptance criteria and dependencies |
| [Decision register](docs/decisions/DECISIONS.md) | Proposed defaults, alternatives, consequences, and when to revisit them |
| [Research notes](docs/research/SOURCES.md) | Primary sources, their implications, and the limits of the research |

## Proposed foundation

- React and TypeScript for the interface; Three.js through a thin React Three Fiber integration for the viewport.
- One Vite application with clear internal modules, starting without a required backend or account.
- A versioned editor document independent of rendering objects, with transactional undo and separate native project saving and game export.
- Three initial workspace modes: **Model**, **Paint**, and **Preview**. More advanced controls appear in context.
- Explicit compatibility profiles, starting with a tested subset of Java block models. Java items, Bedrock entities and animation, and other formats follow their own readiness gates.

Dependency versions are pinned in the lockfile, and the current game experiment targets Minecraft Java 1.21.4. The executable implementation is documented in [First implementation](docs/delivery/FIRST_IMPLEMENTATION.md). To run it locally: `npm ci` followed by `npm run dev`. The dependency lockfile is committed; use `npm ci` for reproducible installation. The [Java 1.21.4 export experiment](docs/compatibility/JAVA_1214_EXPORT.md) explains its exact output and the recorded in-game check.

## Quality commitment

The prototype is allowed to have a small feature set. Its implemented tools must still have coherent interaction states, keyboard access, useful errors, reversible edits, honest save status, and verified output. Tests and recorded game checks guide improvements.

## License

[Apache License 2.0](LICENSE).

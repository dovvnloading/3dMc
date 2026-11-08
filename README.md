# 3dMc

An open-source, browser-based studio for creating and modifying Minecraft assets with React and Three.js.

**Product direction:** a precise 3D editor that feels approachable from the first session. Model, paint, inspect, and export in one coherent workspace, with Minecraft compatibility built into the editing experience.

## Web app

**GitHub Pages:** [Open 3dMc Studio](https://dovvnloading.github.io/3dMc/).

The public site must publish Vite's compiled `dist/` files, **not** the raw repository `index.html` and TypeScript sources. The [Pages deployment guide](docs/delivery/PAGES_DEPLOYMENT.md) explains the automated release workflow and one-time Pages **Source: GitHub Actions** setting. Local development is still `npm ci && npm run dev`; GitHub Pages uses `npm run build -- --mode github-pages`.

## Project status

**An executable editor is on the main branch.** It provides a React/Three.js viewport, cuboid authoring, texture painting, undo/redo, project files and local recovery. Per-face UV rectangles, four quarter-turn rotations and native project schema v2 are now implemented. The current reliability slice adds **atomic painting gestures and generation-fenced local recovery across tabs**. The planning documents remain proposed acceptance criteria, not evidence of Minecraft compatibility or a shipped release. A **Java 1.21.4 experimental resource-pack pipeline** now exports model/blockstate JSON, PNGs and ZIPs, and can import the exact subset of packs it generates for further editing. It performs strict file and schema checks and shows a preflight before replacing the workspace. A new **New Project** workflow offers empty, textured-block, lantern and six-face reference templates. The default source backup is now a self-contained **.3dmc** ZIP archive; legacy .3dmc.json files remain supported. The experimental Java pack codec now also round-trips supported face UV rectangles and quarter-turn rotations. It has **not** been verified in-game, does not register new block behavior, and does not claim arbitrary third-party pack import.

The current creator milestone makes the first session useful: choose a template, shape and paint it, and download a source project you can reopen later. The next texture milestone adds **PNG import with explicit scaling/size choices and native PNG export**, retaining undo and an honest alpha warning for the experimental Java pack target. A contextual primitive library now provides full blocks, slabs, columns, panels, and small cubes; material controls switch between a solid swatch and the shared painted texture. Scene ordering is explicit and undoable. The first target remains a deliberately small Java block asset profile. A creator should be able to shape an original cuboid asset, paint it, undo changes, save and reopen their project, and export a resource pack verified in a specific Minecraft release.

## Start here

Read the [planning guide](docs/README.md) for the recommended reading order and the decisions that remain open. The [native project format contract](docs/architecture/NATIVE_PROJECT_ARCHIVE.md) describes the portable .3dmc source archive and legacy migration. The [PNG texture workflow](docs/delivery/TEXTURE_WORKFLOW.md) explains the import preflight, pixel scaling and current limits. [Creation tools and shortcuts](docs/delivery/CREATOR_TOOLS.md) explain the primitive library, materials, scene ordering and keyboard workflows. The [reliability implementation notes](docs/delivery/RELIABILITY_SLICE.md) distinguish what is protected today from future fault-injection and device testing. The [six-face game verification worksheet](docs/compatibility/SIX_FACE_GAME_CHECK.md) documents a reproducible asymmetric fixture for Minecraft 1.21.4; real in-game testing remains outstanding.

| Document | What it answers |
| --- | --- |
| [Product brief](docs/product/PRODUCT_BRIEF.md) | Who the editor serves, what quality means, and what the first release includes |
| [Workspace specification](docs/design/WORKSPACE_SPEC.md) | The layout, modes, interactions, onboarding, shortcuts, and recovery experience |
| [Design system](docs/design/DESIGN_SYSTEM.md) | The visual language, component contracts, accessibility, and design review standards |
| [Technical design](docs/architecture/TECHNICAL_DESIGN.md) | Document state, rendering, commands, painting, persistence, workers, and module boundaries |
| [Compatibility strategy](docs/architecture/COMPATIBILITY.md) | Asset families, format profiles, import/export fidelity, and version evidence |
| [Delivery roadmap](docs/delivery/ROADMAP.md) | Stages, dependencies, staffing assumptions, and the first two sprints |
| [Quality gates](docs/delivery/QUALITY_GATES.md) | The evidence required to call a milestone usable, reliable, and performant |
| [Implementation backlog](docs/delivery/BACKLOG.md) | Ordered work packages with acceptance criteria and dependencies |
| [Decision register](docs/decisions/DECISIONS.md) | Proposed defaults, alternatives, consequences, and when to revisit them |
| [Research notes](docs/research/SOURCES.md) | Primary sources, their implications, and the limits of the research |

## Proposed foundation

- React and TypeScript for the interface; Three.js through a thin React Three Fiber integration for the viewport.
- One Vite application with clear internal modules, starting without a required backend or account.
- A versioned editor document independent of rendering objects, with transactional undo and separate native project saving and game export.
- Three initial workspace modes: **Model**, **Paint**, and **Preview**. More advanced controls appear in context.
- Explicit compatibility profiles, starting with a tested subset of Java block models. Java items, Bedrock entities and animation, and other formats follow their own readiness gates.

Exact dependency versions, the initial Minecraft release, and the supported browser matrix will be pinned during the first compatibility and platform probes. The executable implementation is documented in [First implementation](docs/delivery/FIRST_IMPLEMENTATION.md). To run it locally: `npm ci` followed by `npm run dev`. The dependency lockfile is committed; use `npm ci` for reproducible installation. The [Java 1.21.4 export experiment](docs/compatibility/JAVA_1214_EXPORT.md) explains its exact output and remaining in-game check.

## Quality commitment

The prototype is allowed to have a small feature set. Its implemented tools must still have coherent interaction states, keyboard access, useful errors, reversible edits, honest save status, and verified output. Each stage has an explicit exit gate; scope expands only after that gate is met.

## License

[Apache License 2.0](LICENSE).

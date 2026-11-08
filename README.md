# 3dMc

An open-source, browser-based studio for creating and modifying Minecraft assets with React and Three.js.

**Product direction:** a precise 3D editor that feels approachable from the first session. Model, paint, inspect, and export in one coherent workspace, with Minecraft compatibility built into the editing experience.

## Project status

**Planning foundation — application implementation has not started.** This repository currently contains the product definition, interaction and visual specifications, technical design, compatibility strategy, and staged delivery plan. Features described in these documents are proposals and acceptance criteria, not shipped capabilities.

The first implementation milestone is a polished, complete editing loop for a deliberately small Java block asset profile. A creator should be able to shape an original cuboid asset, paint it, undo changes, save and reopen their project, and export a resource pack verified in a specific Minecraft release.

## Start here

Read the [planning guide](docs/README.md) for the recommended reading order and the decisions that remain open.

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

Exact dependency versions, the initial Minecraft release, and the supported browser matrix will be pinned during the first compatibility and platform probes. There is no application build or development command yet; see the [first implementation sequence](docs/delivery/BACKLOG.md#first-implementation-sequence).

## Quality commitment

The prototype is allowed to have a small feature set. Its implemented tools must still have coherent interaction states, keyboard access, useful errors, reversible edits, honest save status, and verified output. Each stage has an explicit exit gate; scope expands only after that gate is met.

## License

[Apache License 2.0](LICENSE).

# Implementation backlog

**Status:** proposed work queue; no items are implemented. **Prepared:** 2026-11-08.

This backlog converts the product direction into reviewable work packages. It is intentionally ordered by dependencies and product outcomes. The [roadmap](ROADMAP.md) owns milestone scope and staffing assumptions; [quality gates](QUALITY_GATES.md) own measurable release criteria.

## How to use this backlog

Each package has one accountable role, dependencies, an observable acceptance condition, and the evidence to attach to its implementation PR. A role is a responsibility, not a promise of staffing. One person may hold several roles.

Split a package when it cannot be reviewed as a coherent change. Implement thin cross-module paths early, then strengthen them. Do not defer save, undo, or target correctness until the visible shell is complete.

All S0/S1 items below are required for the proposed first product proof unless a scope change is recorded in the decision register. Later items are candidate commitments gated by research and the previous release's evidence. “Depends on” expresses completion dependencies; exploratory design work may run earlier.

Suggested implementation-issue fields: user outcome, scope, exclusions, dependencies, acceptance criteria, evidence, owner, and unresolved risk. These entries are ready to become issues when the milestone is scheduled; they are not already-created GitHub issues.

## S0: direction and compatibility proof

### FND-01 — Pin the first compatibility contract

**Owner:** format engineer. **Depends on:** product brief.

Select one exact stable Java release, asset family, schema/pack evidence, and existing block replacement target. Record supported fields, explicitly unsupported inputs, preview limitations, and a capability-profile identifier. Validate that the intended replacement route actually affects the chosen block.

**Acceptance/evidence:** a committed profile manifest proposal, links to primary release evidence, one manually inspected valid package, and an in-game screenshot/log tied to the exact release. No floating “latest” claim or unverified pack-format number.

### FND-02 — Observe representative creator tasks

**Owner:** product designer. **Depends on:** product brief.

Recruit a small mixed cohort of newcomers and experienced creators. Observe starting, navigation, selection, painting shared UVs, saving, and exporting in their current workflow. Test a low-cost workspace interaction concept. Record failures, useful conventions, and terminology the participants understand.

**Acceptance/evidence:** task script, consented notes, participant experience mix, severity-ranked findings, and changes to the workspace specification. Separate formative observations from quantitative claims about the wider audience.

### FND-03 — Build the format fixture corpus

**Owner:** format engineer. **Depends on:** FND-01.

Create original positive and negative fixtures for face orientation, asymmetric textures, rotations allowed by the target, UV edge cases, missing references, invalid values, parent/dependency handling, and unsupported fields. Include expected import class and diagnostics.

**Acceptance/evidence:** source provenance, expected semantic documents, expected export structures, and a fixture-to-capability table. Keep minimal fixtures readable enough to diagnose one failure at a time.

### FND-04 — Prove the viewport and UV mapping

**Owner:** graphics engineer. **Depends on:** FND-03.

Run a disposable rendering probe with the reference asset and directional pixel markings. Prove face mapping, camera axes, picking, texture orientation, filtering, color handling, and the transform conventions planned for the domain model.

**Acceptance/evidence:** annotated renders and automated numeric checks for every face, plus comparison against the selected game fixture. Record deviations; do not fix a mirrored face by an unexplained global texture flip.

### FND-05 — Prove document and history semantics

**Owner:** frontend/core engineer. **Depends on:** FND-03.

Represent a small asset without renderer objects. Execute, cancel, undo, and redo a transform and pixel stroke. Exercise deletion, duplication, invalid numeric input, and a new edit after undo. Estimate history memory using actual changed pixel data.

**Acceptance/evidence:** documented transaction state machine, stable IDs, serializer round-trip, and invariant tests. A single gesture yields one history item, and cancellation restores the pre-gesture document.

### FND-06 — Prove storage and recovery behavior

**Owner:** frontend/platform engineer. **Depends on:** FND-05.

Test IndexedDB transactions, texture blob storage, an interrupted write, quota failure, a second tab, and explicit native-file import/export on the proposed browser set. Evaluate file-picker enhancement and download fallback separately.

**Acceptance/evidence:** a failure table, recovery procedure, verified checkpoint semantics, and honest status wording. Reopening a corrupted or incomplete newest checkpoint finds the last valid revision without mutating the saved source.

### FND-07 — Establish the visual and interaction specimen

**Owner:** product designer + frontend engineer. **Depends on:** FND-02.

Specify typography, surfaces, focus, selection, numeric fields, tree rows, toolbar states, dialogs, diagnostics, and save status. Show the reference task at target desktop sizes and zoom, including empty and error states.

**Acceptance/evidence:** reviewed component specimen and flow recordings; measured color contrast; a navigation preset choice supported by observations. The specimen follows the design system and does not use placeholder controls to imply unimplemented behavior.

### FND-08 — Close the foundation gate

**Owner:** technical lead + product owner. **Depends on:** FND-01 through FND-07.

Choose the runtime/package baseline, browser/OS matrix, two reference hardware classes, initial texture/document budgets, and the S1 task script. Re-estimate work with actual staffing and probe findings.

**Acceptance/evidence:** completed S0 gate record with open risks, owners, and a concrete mitigation for each blocking risk. Update the decision register and quality thresholds. An unresolved export or recovery proof blocks a claim that the architecture is ready.

## S1: polished vertical slice

### CORE-01 — Create the application foundation

**Owner:** frontend engineer. **Depends on:** FND-08.

Scaffold React/TypeScript/Vite with a pinned compatible dependency set and lockfile. Establish internal feature boundaries, formatting, type checking, a focused unit-test runner, browser-test setup, and a production build. Add a minimal CI workflow only for checks that can run meaningfully.

**Acceptance/evidence:** a clean install and reproducible build; smoke test; documented local commands; no secrets or runtime network dependency for the core sample asset.

### CORE-02 — Implement the versioned editor document

**Owner:** core engineer. **Depends on:** CORE-01, FND-05.

Implement the document schema, stable IDs, geometry and texture references, target profile, validators, and serializer. Separate document content from session layout, selection, and transient interactions. Create the original reference project as a fixture.

**Acceptance/evidence:** schema and identity invariants, rejected invalid input, deterministic serialization policy, and renderer-independent native round-trip tests.

### CORE-03 — Implement command transactions and history

**Owner:** core engineer. **Depends on:** CORE-02.

Add execute/preview/commit/cancel, undo, redo, history labels, history budget policy, dirty-revision tracking, and committed-change notifications. Keep commands reusable from menus, shortcuts, inspector, and viewport tools.

**Acceptance/evidence:** mixed geometry/paint test sequences; one gesture per history item; redo invalidation; no history entry on cancellation; state equivalence after undo and redo. Attach a recording of one visible operation through multiple entry points.

### UX-01 — Build the workspace shell and stateful components

**Owner:** frontend engineer + designer. **Depends on:** CORE-01, FND-07.

Implement project chrome, Model/Paint/Preview navigation, a restrained tool rail, hierarchy area, inspector, optional texture panel, and status region. Provide deliberate resize/collapse behavior and reset layout. Use genuine empty, loading, selected, invalid, disabled, and error states.

**Acceptance/evidence:** reviewed desktop/compact layouts, keyboard/focus checks, zoom checks, and mode transitions preserving context. Every visible action is implemented, accurately disabled with a reason, or absent.

### CORE-04 — Implement the viewport and navigation controller

**Owner:** graphics engineer. **Depends on:** CORE-02, FND-04.

Render the document, grid, selection overlays, and orientation control. Support orbit, pan, zoom, frame selection, orthographic views, and a trackpad-compatible navigation path. Schedule rendering on demand outside active gestures/animation.

**Acceptance/evidence:** coordinate fixture matches; documented input precedence; no paint/transform activation while navigating; pointer capture and WebGL context-loss handling; reference-device trace and resource-lifetime check.

### CORE-05 — Synchronize selection, hierarchy, and inspector

**Owner:** frontend/core engineer. **Depends on:** CORE-03, CORE-04, UX-01.

Implement selection by stable ID, viewport picking, hierarchy focus and selection, rename, hide, and lock states. Distinguish selection from keyboard focus and visibility from export inclusion.

**Acceptance/evidence:** viewport/tree/inspector agreement, occluded-selection recovery, keyboard tree operations, deleted selection handling, and tests that hidden/locked elements follow the documented picking rules.

### CORE-06 — Deliver exact transforms and numeric fields

**Owner:** graphics/core engineer. **Depends on:** CORE-05.

Implement move and resize, target-valid rotations where proven, pivot semantics, snapping, and numeric commits. Use the same transaction for gizmo and inspector paths. Reject invalid values with an actionable reason while preserving the last valid document.

**Acceptance/evidence:** precision and snapping fixtures; Escape cancellation; repeated undo/redo; focus-loss behavior; consistent values after direct manipulation; no silent clamping that changes the intended operation.

### CORE-07 — Deliver basic cuboid authoring operations

**Owner:** core engineer. **Depends on:** CORE-03, CORE-05.

Add, duplicate, delete, and rename cuboids with sensible names, placement, texture assignment, and selection. Keep structural operations in the command system. Ensure duplicate geometry does not accidentally create a confusing texture copy or hidden shared ownership.

**Acceptance/evidence:** the reference asset can be built or changed using real controls; undo restores deleted references; generated IDs are unique; operations obey profile capabilities.

### TEX-01 — Implement the texture asset store

**Owner:** graphics/core engineer. **Depends on:** CORE-02, FND-04.

Store authoritative texture pixels and metadata outside renderer-owned textures. Define color encoding, alpha semantics, import dimension checks, sampling, pixel revisions, and GPU upload ownership. Share resources without losing edit identity.

**Acceptance/evidence:** pixel exactness fixtures, transparent-edge tests, bounded decoded memory, deterministic import/export pixels, and no resource leak across repeated texture replacement.

### TEX-02 — Implement the 2D pixel editor

**Owner:** texture/frontend engineer. **Depends on:** TEX-01, CORE-03, UX-01.

Add an opaque pencil and eyedropper with integer pixel targeting, color selection, clear brush footprint, zoom and pan, a readable pixel grid, and transaction-based strokes. Erasing and transparent painting are exposed only after the target alpha capability is verified, provisionally in S2. Imported alpha data still receives explicit validation.

**Acceptance/evidence:** continuous fast strokes, edge clipping, single-pixel edits, a stroke cancelled mid-gesture, exact undo/redo, and a non-hover path to essential controls.

### TEX-03 — Connect 3D painting to the same pixel engine

**Owner:** graphics/texture engineer. **Depends on:** TEX-02, CORE-04, CORE-05.

Map ray hits and face coordinates to authoritative texture pixels. Define visible-surface painting, face locks, shared/mirrored UV notices, interpolation, and navigation-versus-brush arbitration. Preview the actual affected surface before writing.

**Acceptance/evidence:** matching 2D/3D strokes on six oriented faces, seam and UV-boundary fixtures, shared-region behavior, no hidden backface painting by default, and input-to-render-submission measurement under the canonical quality-gate protocol, paired with observed responsiveness.

### TEX-04 — Show linked UV and texture context

**Owner:** texture/frontend engineer. **Depends on:** TEX-01, CORE-05, UX-01.

Display the selected face's UV area, texture dimensions, and face orientation. Use deterministic template mapping for the first slice and clearly indicate shared areas. Detailed unwrap/packing remains S2.

**Acceptance/evidence:** selection links both views, markings remain legible at small textures, and the creator can identify the texture and pixels a face uses without opening raw JSON.

### IO-01 — Import the declared supported subset

**Owner:** format engineer. **Depends on:** CORE-02, TEX-01, FND-03.

Open a matching Java model and required PNGs plus the native reference project. Parse into a temporary candidate document, resolve allowed local dependencies, show missing/unsupported information, then commit replacement or opening only after success.

**Acceptance/evidence:** positive and negative fixture corpus; malformed input never replaces active work; no automatic external URL fetching; import classification is accurate. Broader pack traversal is not required here.

### IO-02 — Validate and export the first game package

**Owner:** format engineer. **Depends on:** CORE-02, TEX-01, FND-01, FND-03.

Build an export snapshot, validation report, target-specific model/texture files, correct namespace/path mapping, and the minimal verified resource-pack structure. Provide file summary, blocking issue links, and installation/test guidance.

**Acceptance/evidence:** deterministic semantic output, dependency and path checks, re-import of supported data, and an in-game inspection of the exact generated artifact and release. The UI calls it a replacement visual, not a new gameplay block.

### IO-03 — Save, reopen, and recover native projects

**Owner:** platform/core engineer. **Depends on:** CORE-03, TEX-01, FND-06.

Implement versioned `.3dmc` save/reopen, committed local recovery checkpoints, corrupt-checkpoint fallback, multi-tab conflict handling, and the save/recovery/export status distinctions. Keep geometry and referenced pixel blobs consistent across each acknowledged checkpoint.

**Acceptance/evidence:** interrupted-write and quota drills, texture/geometry recovery together, source preservation during migration failure, and no false saved message after a failed or merely initiated download.

### UX-02 — Deliver commands, shortcuts, and first-run guidance

**Owner:** frontend engineer + designer. **Depends on:** CORE-03, UX-01, CORE-05.

Provide searchable commands, visible menu equivalents, context-sensitive shortcut hints, focused-input protections, and a brief optional first-run guide. Honor the chosen navigation preset and avoid collisions with browser shortcuts.

**Acceptance/evidence:** the reference task works with visible controls; core nonspatial operations have keyboard paths; shortcuts do not edit the scene while typing; help explains the current context rather than opening a wall of documentation.

### QA-01 — Complete the reference journey

**Owner:** QA + product designer. **Depends on:** all S1 CORE, TEX, IO, and UX packages.

Run the lantern task from first launch through model changes, painting, undo, native save, reload, recovery, export, and game check. Observe creators without rescuing them from confusing controls. Record build, browser, target, fixture, and device.

**Acceptance/evidence:** the S1 product gate passes or produces a scoped fix queue. A partial flow, a developer-only command, or a manually repaired export does not count as an unassisted completion.

### QA-02 — Close reliability, accessibility, and performance risks

**Owner:** QA + relevant engineers. **Depends on:** QA-01; individual checks begin earlier.

Run the S1 failure matrix, measured budgets, keyboard/zoom checks, reduced-motion checks, context-loss recovery, long edit/undo cycles, and repeated open/close resource tests. Address severe defects before adding features.

**Acceptance/evidence:** a gate report with actual results and limitations, fix references, and explicit unresolved risks. Only then label the result the first polished vertical slice.

## S2: creator alpha

| ID / owner | User outcome and scope | Depends on | Acceptance evidence |
| --- | --- | --- | --- |
| ALPHA-01 / format | Import supported real-world assets with parent and texture dependency resolution | S1 gate | Representative creator files; cycle/missing-reference diagnostics; preserved originals; no silent flattening |
| ALPHA-02 / core | Multi-select, group, reorder, isolate, and bulk edit without selection ambiguity | CORE-03, CORE-05, S1 gate | Mixed-value inspector behavior; hierarchy and undo invariants; batch edits respect target limits |
| ALPHA-03 / texture | Edit face UVs, rotate/mirror supported mappings, and detect overlap | TEX-03, TEX-04, S1 gate | Directional atlas fixtures; exact pixel mapping; shared-UV warning and deliberate make-unique workflow |
| ALPHA-04 / texture | Use flood fill, line/shape tools, palettes, constrained symmetry, and erasing once alpha support is proved | TEX-02, S1 gate | Deterministic raster tests; selection/mask boundaries; one operation per undo; symmetry reports its scope |
| ALPHA-05 / texture/platform | Add bounded texture layers with source preservation and predictable flattened export | TEX-01, CORE-03, IO-03, S1 gate | Compositing/alpha fixtures; history memory measurements; native reopen retains layers; export proof |
| ALPHA-06 / frontend | Work faster with deliberate layout presets, command discovery, and history inspection | UX-01, UX-02, S1 gate | Repeated expert task timings; layout reset; history branching behavior; no focus or shortcut regressions |
| ALPHA-07 / platform | Maintain multiple local projects and robust backups | IO-03, S1 gate | Recent-project metadata correctness; rename/delete semantics; quota handling; portable source backup path |
| ALPHA-08 / QA/design | Establish alpha usability and maintenance readiness | ALPHA-01 through ALPHA-07 | Quality-gate evidence; creator feedback addressed by severity; supportable browser/target matrix |

## S3: Java production beta

| ID / owner | User outcome and scope | Depends on | Acceptance evidence |
| --- | --- | --- | --- |
| JAVA-01 / format | Author Java items with the selected release's model and definition requirements | S2 gate; new target probe | Official version evidence, codec fixtures, correct paths, and generated item used in-game |
| JAVA-02 / graphics/design | Adjust supported item display contexts with clear contextual previews | JAVA-01 | Coordinate fixtures, declared preview limits, game screenshots for each promised context |
| JAVA-03 / format/frontend | Assemble and re-export small resource packs with understandable dependencies | ALPHA-01, JAVA-01 | Namespace/path validation; collision reporting; deterministic packaging; no unrelated files overwritten |
| JAVA-04 / texture/format | Introduce texture animation or other material capabilities one verified feature at a time | S2 gate; capability-specific probe | Native source preservation, timing/alpha fixtures, declared engine limits, game proof |
| JAVA-05 / QA/release | Publish a maintainable beta with a precise support matrix and migration/recovery policy | JAVA-01 through JAVA-03; JAVA-04 only if in release scope | Release gate, broader creator study, known limitations, reproducible builds, upgrade and rollback drill |

Do not make JAVA-04 a hidden prerequisite for beta. A capability can remain explicitly unsupported if it does not serve the chosen release's reference tasks.

## S4: Bedrock and animation

| ID / owner | User outcome and scope | Depends on | Acceptance evidence |
| --- | --- | --- | --- |
| BED-01 / format | Add an exact Bedrock geometry profile and scoped pack integration | Java beta gate; separate format probe | Versioned geometry fixtures; hierarchy/pivot/UV conversion checks; target game proof |
| BED-02 / core/graphics | Author bones and rig hierarchy with reversible parenting and transforms | BED-01 | Bind/pose separation; transform-order fixtures; reparent and undo invariants |
| BED-03 / animation/design | Animate supported channels with a clear timeline and curve editor | BED-02 | Deterministic sampling, interpolation and time-unit fixtures, keyboard timeline tasks, source round-trip |
| BED-04 / format/QA | Validate animation integration and controllers within explicitly declared scope | BED-03 | Game comparisons; supported expression behavior; unsupported code remains inert; no implied complete Bedrock runtime |

## S5: evidence-led expansion

These are discovery candidates, not a scheduled catch-all release.

| Candidate | Prerequisite evidence | Boundary to protect |
| --- | --- | --- |
| Skin authoring | Creator demand and verified skin layout/version fixtures | Skin semantics are separate from arbitrary mesh export |
| Modded mesh/animation adapters | Maintained target specification, test environment, and owner | Codec support does not imply vanilla support |
| Asset libraries and batch operations | Repeated multi-asset tasks justify indexing and bulk editing | Bulk changes remain inspectable and reversible |
| Optional cloud backup/review | Local workflow is reliable and cross-device/review demand is established | No account requirement for basic local authoring |
| Real-time collaboration | Document conflict semantics, texture conflict policy, offline reconciliation prototype | Deterministic transactions and recovery remain understandable |
| Third-party extensions | At least two concrete external integrations and a permissions model | Do not execute untrusted code inside the privileged editor |
| General mesh tools | A target that preserves them and a valid export workflow | No “export anywhere” promise or automatic destructive conversion |

## First implementation sequence

1. Close FND-01 and establish the format fixtures in FND-03. In parallel, run creator/navigation work in FND-02 and visual-system work in FND-07.
2. Prove rendering/UVs, history, and persistence with FND-04 through FND-06. Review FND-08 with actual results.
3. Scaffold CORE-01; land the independent document and transaction system in CORE-02/03. Build the shell and viewport against real fixture data.
4. Connect selection and one complete transform to history and recovery. This is the first integrated editing path.
5. Connect authoritative texture pixels, 2D painting, and 3D painting; make both participate in the same history and save path.
6. Complete import/export, native reopen, status, help, and failure states. Run QA-01/02 on the exact deliverable.

The critical path is **target evidence → document/codec meaning → transactions → editable geometry and texture → persistent source and validated output → user and game verification**. Visual design, component development, and fixture preparation can run alongside it. Adding more panels does not shorten this path.

## Implementation PR evidence template

Every feature PR should answer:

- What creator task becomes possible or more reliable?
- Which command, document, and profile boundaries does it use?
- What happens on cancel, undo, invalid input, interrupted storage, and unsupported targets?
- Which acceptance cases were actually exercised, on which fixture/build/browser/device?
- What remains outside the supported behavior?

Attach a short interaction recording for visible behavior, focused test results for data invariants, and game output evidence when compatibility changes. A documentation-only PR reports document verification; it should not claim application tests that do not exist.

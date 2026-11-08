# Foundation decision register

**Status:** proposed defaults for implementation planning. **Prepared:** 2026-11-08.

These decisions establish a coherent starting point. They have not been ratified through creator studies, runtime benchmarks, or game compatibility tests. S0 supplies that evidence. Change a decision by recording the new evidence, consequences, and affected documents; do not silently change the meaning of a profile or saved document.

## D01 — React, TypeScript, Three.js, and a thin React Three Fiber integration

**Decision.** Start with one Vite application. React owns application UI, TypeScript expresses internal contracts, and Three.js provides rendering and spatial operations. React Three Fiber integrates scene lifetime with the application, while high-frequency interaction stays in a dedicated controller path.

**Why.** The user's requested technology direction fits a browser editor. A client-side application keeps the first authoring loop independent of server availability and gives direct control over the viewport. Vite provides an official React/TypeScript template and static build output; see [Vite's guide](https://vite.dev/guide/).

**Alternatives considered.** Direct Three.js without R3F removes a framework layer but increases integration work. A server-oriented framework can be useful for a marketing site or later account features, but is not a dependency of editing local assets. A different renderer would require a reason stronger than preference given the user's stated direction.

**Consequences.** Keep a narrow renderer boundary and explicit resource ownership. Do not send every pointer move through React component state. R3F's own guidance calls out this performance risk; see [performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls). Pin compatible package versions in S0/S1 and a lockfile when the application is scaffolded. This plan does not invent a tested version set.

**Revisit when.** A measured renderer limitation blocks a validated requirement. WebGPU is a possible future capability, not an initial browser prerequisite.

## D02 — Java static block visuals first

**Decision.** Prove one carefully scoped Java block-model workflow first, including a resource-pack replacement for an existing block. Add Java items and Bedrock through their own verified profiles.

**Why.** This is a small, meaningful unit of modeling, texturing, packaging, and in-game validation. It exercises the complete product loop without requiring rigging, animation evaluation, or arbitrary mesh conversion.

**Alternatives considered.** Bedrock first is reasonable if early users mainly make entities; S0 can still change this choice. Supporting every edition simultaneously makes every control, importer, preview, and export harder to validate. A completely generic mesh editor does not establish Minecraft export correctness.

**Consequences.** A new visual asset is not described as a newly registered vanilla block. The default profile constrains editing according to tested capabilities. Exact release, schema evidence, and target block are selected during S0. See [compatibility](../architecture/COMPATIBILITY.md).

**Revisit when.** Creator interviews show a substantially stronger first use case, or format probes make the initial path impractical. Keep reusable core work separate from the codec so a changed first profile is affordable.

## D03 — Local-first authoring; optional services later

**Decision.** No account or backend is required for the initial core loop. Use browser storage for recovery and explicit native-project files for portable source work. File-picker APIs are progressive enhancements, with ordinary file input and download paths available.

**Why.** Opening an asset and making a first edit should not require identity, workspace provisioning, or upload. Local-first processing also makes document ownership and privacy easier to explain.

**Consequences.** Browser storage is not a backup guarantee. Quota failures, eviction, private browsing, multiple tabs, and interrupted writes must be handled. Browser-managed storage behavior is documented by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). Offline reload is a separate tested capability; a service worker is added only with update and cache-recovery tests.

**Revisit when.** Users need cross-device work, team review, or hosted asset libraries. Add these behind storage and service boundaries without changing the core command model.

## D04 — The editor document is the source of truth

**Decision.** Persist normalized, versioned domain data and asset blobs. Do not serialize Three.js scene objects or React state as the native document.

**Why.** Game codecs, native saves, history, and validation need consistent meaning even when rendering changes. React also recommends avoiding contradictory and duplicated state; see [state structure](https://react.dev/learn/choosing-the-state-structure).

**Consequences.** Scene objects are derived and disposable. Selection stores stable IDs. View state, transient gestures, document data, and derived diagnostics have separate lifetimes. The document can be validated and edited in tests without a browser or GPU. Runtime schema validation is required at file boundaries; TypeScript alone does not validate imported data.

**Revisit when.** A new asset family needs data the current schema cannot represent. Add a discriminated representation and migration rather than overloading an unrelated field.

## D05 — Transactions are the unit of editing

**Decision.** A complete user operation is one reversible transaction: one transform drag, numeric-field commit, brush stroke, duplicate, or texture reassignment. Pointer movement is a preview, not a sequence of independent undo steps.

**Why.** Coherent undo makes experimentation safe and lets every UI entry point use the same operation semantics.

**Consequences.** Cancel, lost pointer capture, focus loss, deletion of a selected object, and interrupted imports need defined outcomes. Texture history uses bounded changed regions or tiles; geometry history can use compact before/after data or patches. Committed work triggers autosave, dirty state, diagnostics, and render invalidation through defined events. Redo is cleared after a new committed edit following undo. View-only navigation does not consume ordinary document undo history.

**Alternative considered.** Whole-document snapshots are useful for a small proof and recovery checkpoints but become expensive for large layered textures. An event-sourced distributed system is unnecessary for the first local editor.

**Revisit when.** Measured history cost or a future collaboration requirement justifies a different storage strategy. Preserve visible transaction behavior.

## D06 — One workspace with contextual depth

**Decision.** Start with Model, Paint, and Preview. Keep project controls, hierarchy, inspector, selection, and navigation consistent. UV tools appear in the appropriate task context. Animation appears only for profiles that support it.

**Why.** A user can learn one spatial and interaction model. Advanced operations become discoverable without filling the default screen with every possible panel.

**Consequences.** Avoid separate beginner/pro interfaces, arbitrary panel docking in the first milestone, and unexplained mode-specific shortcuts. Provide a small number of intentional layouts, resize/collapse, and reset layout. A command palette and visible menus expose advanced operations without requiring memorization.

**Revisit when.** Observed tasks require a persistent second viewport, dedicated UV layout, or another mode. Add it because it improves those tasks, and preserve selection and context through the change.

## D07 — Native project saving and target export remain separate

**Decision.** Define a `.3dmc` native archive containing a versioned manifest, editable document, textures/source layers, and required project-owned assets. Game export is produced from a validated snapshot through a target codec.

**Why.** Export can flatten or omit data that is useful for editing. It must not mutate or replace the source project implicitly.

**Consequences.** Save state tracks the native revision independently from export state and local-recovery state. A browser download is reported as prepared/started unless a supported file API confirms a completed write. Unknown newer native versions open safely or fail clearly; they never overwrite the source after a speculative migration.

**Revisit when.** Packaging or versioning evidence suggests a better native container. Keep project source preservation as the invariant.

## D08 — Capabilities and compatibility evidence drive tools

**Decision.** Use a profile registry containing edition, asset family, verified game/schema versions, supported operations, validation rules, codec identity, and preview limitations.

**Why.** Different targets have different restrictions, and version changes can affect those restrictions. The same capability facts should inform the UI, validation, conversion report, and export pipeline.

**Consequences.** “Imported,” “editable,” “previewed,” and “export verified” are distinct states. A profile is not marked supported until representative positive and negative fixtures pass and a documented game check confirms output. A target change runs an analysis before changing the document.

**Revisit when.** Real fixtures reveal the capability model is too coarse. Prefer explicit per-feature capability fields to scattered conditionals on a display-name string.

## D09 — Preserve unsupported source data only when it remains safe

**Decision.** Keep provenance and supported source metadata, and report unknown fields. Do not promise lossless round-tripping for fields whose meaning, references, or relationship to edited geometry is unknown.

**Why.** Blindly retaining unknown values can still produce a broken file after an edit. Silently dropping them is also unacceptable.

**Consequences.** An import can be editable, view-only, or blocked with a reason. Untouched source files may be preserved byte-for-byte; supported edits are assessed by semantic equivalence, not JSON formatting. Conversions produce a report and a separate target output. The original native document remains available.

**Revisit when.** A previously unsupported field gains a tested semantic adapter.

## D10 — A shared pixel engine precedes advanced paint effects

**Decision.** Both the 2D texture panel and 3D brush hit-testing write through one pixel operation engine. Start with deterministic pixel-art operations and a small texture budget. Add layers and more complex composition after memory and history behavior are measured.

**Why.** Two independent paint implementations would risk seams, coordinate mismatches, inconsistent undo, and different output for the same pixel.

**Consequences.** Define face orientation, UV boundaries, mirrored/shared mappings, color encoding, alpha handling, and texture filtering explicitly. Start with a measured CPU/raster implementation; move expensive compositing or encoding to workers as needed. A GPU effect must not change exported pixel meaning without a documented conversion.

**Revisit when.** Recorded workloads exceed the responsiveness or memory budget.

## D11 — Internal modules before a plugin platform

**Decision.** Keep a modular application in one repository/package initially. Extract domain, commands, geometry, texture engine, codecs, storage, and viewport boundaries in source. Avoid publishing packages, a plugin host, or a microservice system before a second real consumer exists.

**Why.** Clear dependencies are valuable immediately; independently versioned infrastructure is not yet demonstrated to be necessary.

**Consequences.** A codec is a controlled internal interface before it becomes an extension API. Third-party plugin execution, remote content permissions, signing, and marketplace governance are later product and security work, not incidental switches.

**Revisit when.** Multiple maintained formats or integrations need independently deployable components.

## D12 — Quality gates govern scope expansion

**Decision.** Every implemented feature ships with its interaction states, keyboard path, error behavior, undo policy, persistence behavior, and relevant output evidence. A narrow prototype must still meet its declared standard.

**Why.** Reliability and interaction coherence become harder to retrofit once multiple tools depend on inconsistent foundations.

**Consequences.** Milestones are demonstrations of complete outcomes, not counts of buttons or merged pull requests. Planned numeric thresholds are hypotheses until benchmarked. User studies inform the interaction model; automated tests protect invariants. A polished screenshot does not satisfy an end-to-end gate.

**Revisit when.** A target metric proves inappropriate under documented conditions. Adjust the metric openly; do not silently reclassify a failure as success.

## Decisions to close during S0

| ID | Question | Evidence required | Owner role | Latest decision point |
| --- | --- | --- | --- | --- |
| O01 | Which exact Java release and format profile? | Official release/schema evidence plus representative fixtures | Graphics/format engineer | Before codec implementation is called supported |
| O02 | Which existing block is the first replacement target? | Simple reproducible visual mapping and in-game comparison | Format engineer + product lead | Before S1 export flow is frozen |
| O03 | Which mouse/trackpad navigation preset is default? | Observed novice and experienced-creator navigation tasks | Product designer | Before S1 interaction contract is frozen |
| O04 | Which small initial texture and document budgets? | CPU/GPU memory and stroke measurements on baseline devices | Graphics engineer | Before S1 acceptance thresholds are finalized |
| O05 | Which browser/OS versions form the release matrix? | Feature probes and realistic audience coverage | Frontend lead + QA | Before S1 browser claims |
| O06 | What staffing and calendar are actually available? | Named roles and weekly capacity | Project owner | Before dates are treated as commitments |
| O07 | Which initial primitives and state library? | Accessible component and subscription/update spike | Frontend lead + designer | At scaffold PR; keep the shortlist small |

The defaults in this register authorize useful planning and probes. They do not require a large up-front approval ceremony. Escalate an assumption when evidence changes the product direction, user-visible compatibility, or a meaningful commitment of time or money.

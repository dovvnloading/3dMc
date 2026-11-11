# Delivery roadmap

**Status:** historical stage proposal (2026-11-08), retained for context. An executable editor and an experimental Java 1.21.4 exporter now exist; the claim below that work is still at the planning foundation is outdated. Use the [full-scale expansion plan](FULL_SCALE_EXPANSION_PLAN.md) for current priorities, and verify historical checklist items against code and tests before scheduling them. Durations and numeric thresholds below are hypotheses, not commitments or certifications.

This roadmap turns the product direction into an order of work. The [backlog](BACKLOG.md) holds actionable work; [quality gates](QUALITY_GATES.md) define the evidence required to claim a stage is complete. Target support is governed by the [compatibility contract](../architecture/COMPATIBILITY.md). Reassess the plan after S0 and at every subsequent gate.

## 1. What the first delivery must accomplish

The first milestone is a small, complete authoring experience: a creator opens an original opaque cuboid lantern, changes its shape, paints it, corrects a mistake, saves the editable project, reopens it, and exports a validated resource pack that works in one explicitly pinned Java Edition release. The same editing contract includes one complete, documented external model import subset with its selected local texture dependencies; broad resource-pack import is S2 work.

The pack replaces the model of one known, supported existing vanilla block. It does not register a new vanilla block. The sample's appearance should be attractive using opaque surfaces; glowing material, transparency, animated textures, and renderer parity beyond the selected profile are separate capabilities.

This narrow scope still requires a high standard. Navigation must feel predictable. Selection must be legible. A transform or paint gesture must undo as a single action. A failed import must leave existing work intact. Saving must report the actual state of the document and textures. Export errors must lead the creator to an understandable fix. Every visible control in the supported workflow must work, including its disabled, error, loading, empty, and keyboard states.

The unit of delivery is a complete user task. “Viewport finished,” “painting finished,” and “exporter finished” are engineering progress descriptions, not independently useful milestones. Integration of those parts is the product.

## 2. Dependencies and the critical path

The critical path begins with evidence about the target format. A polished interface on top of an unproven asset model is expensive to repair.

| Dependency | What it unlocks | Required evidence |
| --- | --- | --- |
| Pin a Minecraft release, asset profile, and replacement target | A precise export and preview contract | An independently authored minimal pack works in that release; supported fields and exclusions are recorded |
| Set coordinate, UV, texture, and identity conventions | Predictable editing and serialization | Asymmetric six-face fixtures show axes, orientation, texture addressing, and rotations correctly |
| Define the canonical document and command transactions | Modeling, painting, undo, saving, import, and export | Begin, preview, commit, cancel, undo, and redo preserve the document invariants |
| Integrate selection, transforms, and painting | A meaningful creative workflow | A user can complete one mixed geometry-and-texture edit sequence with coherent history |
| Make document and texture persistence atomic | Trustworthy reopening and recovery | The last acknowledged revision restores after interruption; failures preserve work and explain the next action |
| Validate and export a document snapshot | A useful Minecraft artifact | Diagnostics identify exact problems; generated files pass independent checks and an in-game inspection |
| Test with creators and revise interaction | An editor people can operate without coaching | Observed task results, recorded friction, and a second pass on the most serious issues |

Design exploration, original sample creation, research recruitment, and benchmark harness work can run alongside the technical probes. They must converge on the same contracts. Do not build separate modeling and painting history systems, or let persistence serialize mutable renderer objects.

Browser automation verifies application behavior. Real-device interaction checks establish input and rendering quality. In-game checks establish the claimed Minecraft behavior. These are different forms of evidence and all are needed before the corresponding claims are made.

### Ownership without organizational overhead

A small team can combine roles. Each risk still needs an accountable owner.

| Responsibility | Decisions and deliverables |
| --- | --- |
| Product and interaction design | Golden workflow, scope, tool discoverability, visual hierarchy, interaction states, research synthesis |
| Editor core and persistence | Document schema, stable identities, commands, history, migrations, local persistence, portable project format |
| Graphics and authoring | Camera, selection, transforms, UV mapping, paint interaction, renderer lifecycle, device performance |
| Compatibility | Versioned profiles, import/export semantics, diagnostics, fixtures, pack assembly, in-game verification |
| Quality and research | Reproduction cases, CI coverage, fault injection, usability sessions, release evidence |

For a two-engineer team, one person should lead editor core and persistence, the other graphics and compatibility, with deliberate shared review of document and coordinate contracts. Fractional QA and design participation must be scheduled into the work rather than deferred until an engineer declares it complete.

## 3. Stage definitions

### S0 — Direction & compatibility proof

**Purpose:** retire the assumptions most likely to force a rewrite, and make the first supported experience concrete.

**Suggested initial timebox:** one to two weeks for the reference small team, with a narrower spike if staffing is lower. This is a discovery allowance, not a guarantee that all unknowns will resolve within it.

Deliver:

- One exact Java Edition release and supported static block profile, with a known replacement target and explicit format limitations.
- An original opaque lantern and an independently authored minimal resource pack, inspected in that release. Record the release, pack metadata, replacement path, and observed result.
- Asymmetric coordinate and six-face UV fixtures. Probe the rotations, origins, units, face visibility, texture references, and mapping behavior actually required by the profile.
- A minimal canonical document and command prototype that can apply, cancel, undo, serialize, and reopen one transform without depending on the renderer.
- A persistence probe that stores a document and its texture bytes together and simulates interruption and quota failure. Show “Saved on this device” only after the complete revision commits; distinguish local recovery from a portable native project download.
- The primary mouse and trackpad interaction map, initial workspace states, keyboard alternatives, and a prototype of the first-time task.
- Named device and browser configurations for initial support, a reproducible benchmark protocol, and provisional document/import limits.

**Exit decision:** either the target is viable and its constraints are documented, or the team narrows or changes the first profile before building the editor around it. A failed probe is useful evidence. A broad “supports Minecraft” claim is not an acceptable substitute.

### S1 — Polished vertical slice

**Purpose:** deliver the first coherent creative task at the intended product quality.

The supported workflow includes cuboid selection and editing, numeric and direct transforms, the necessary snapping behavior, an opaque pencil and eyedropper with a corresponding 2D texture view, shared undo/redo, narrow external model import and native project opening, portable native project saving, truthful local autosave and recovery, validation, and working game export. Alpha authoring and erasing are provisionally S2 work after the target behavior is verified; core RGBA storage remains lossless from S1.

Model, Paint, and Preview should feel like views onto one project. The creator should not need to manage internal editor state to move between them. The layout, camera controls, focus handling, tool feedback, and error behavior must already reflect the final product's design principles.

The milestone is not complete until the original lantern can traverse the entire loop, the export has been checked in the pinned game release, recovery has been fault-tested, and formative users have attempted the task. The [S1 gate](QUALITY_GATES.md#8-stage-exit-gates) is mandatory for calling this a polished prototype.

Scope can be reduced to protect that standard. General polygon meshes, rigs, animation timelines, accounts, collaboration, custom plugins, and a marketplace are not dependencies of this stage. Later additions should be judged against the same editing and recovery contracts.

### S2 — Creator alpha

**Purpose:** make repeated use and supported external assets reliable, and improve the workflow based on observed work.

Broaden the tested import corpus within the explicitly supported profile. Add the next authoring operations because creators encounter specific limitations: for example, multi-selection, repeated elements, controlled mirroring, more useful UV editing, or texture organization. Each addition must preserve selection, history, native saves, export validation, and understandable feedback.

S1 establishes baseline protection against concurrent-tab overwrites and storage quota failures. The alpha broadens those checks across larger projects, more conflict and interruption cases, repeated sessions, unsupported fields, and the selected browser matrix. A creator must be able to diagnose an unsupported import without risking their open project. Narrow format support is acceptable when it is clear and useful.

Entry requires S1 quality to hold. Exit requires evidence from external projects and repeat sessions, not only the curated starter. Prioritize the most common failed tasks and expensive workarounds before adding another mode.

### S3 — Java production beta

**Purpose:** support a production-oriented Java workflow with clearly versioned capabilities, release discipline, and support documentation.

Java item authoring, display contexts, and pack management enter as explicit capabilities with their own fixtures and target releases. Do not treat a working block exporter as proof of item compatibility. For each capability, define import, editing, preview, validation, and export behavior and verify the resulting artifact in the supported game release.

Establish native project migrations, version compatibility rules, documented file ownership, release notes, known limitations, and a recoverable update/rollback story. Pack workflow may now include multiple assets, reference inspection, conflict detection, and deterministic packaging when the evidence supports their value.

Exit requires that the supported task set works beyond the development team's samples, and that users can understand what an update changes, recover their work, and obtain useful diagnostics. “Production beta” describes the supported contract and release process; it does not imply exhaustive support for all Minecraft content.

### S4 — Bedrock & animation

**Purpose:** add the next asset families without degrading the established editor.

Start with separate discovery gates for Bedrock geometry/material/resource relationships and animation/rig behavior. They may share editor infrastructure, but they need distinct format contracts and real-game verification. The order of implementation depends on user demand and the results of those probes.

Extend the canonical document only after representative data and editing tasks justify the extension. Define hierarchy, pivots, clips, timing, interpolation, playback, and target constraints before exposing a timeline. Each supported target must complete an import or creation → edit → playback/preview → save/recover → validated export → game check loop.

Re-estimate this stage when S3 and the new probes provide evidence. There is no credible calendar commitment for S4 in this foundation plan.

### S5 — Ecosystem breadth

**Purpose:** expand into more Minecraft asset workflows and connected capabilities when the core is stable and demand is demonstrated.

Potential work includes additional asset families and profiles, extension APIs, reusable project libraries, cloud backup, collaboration, and assistive automation. These are options, not bundled promises. Each should have a specific creator problem, a measurable benefit, a bounded security and compatibility model, and an owner for ongoing maintenance.

Cloud services are not necessary for the initial authoring tool. Plugin execution, shared editing, and generated assets introduce their own trust, history, conflict, provenance, and recovery problems. Introduce them after the local editing contract is reliable and the benefit justifies the operating cost.

## 4. Conditional staffing and timing scenarios

The following ranges are **low-confidence planning estimates**, not delivery promises. They are cumulative elapsed calendar time from **S0 kickoff, including S0 discovery**, to the named gate. They assume experienced people, sustained availability, the narrow profile above, access to the target game for validation, prompt product decisions, and no initial cloud or collaboration work.

| Staffing scenario | S1 polished vertical slice | S2 creator alpha | S3 Java production beta |
| --- | --- | --- | --- |
| One experienced engineer, fractional design and QA | 12–20 weeks | 6–10 months | 10–16 months |
| Two senior engineers, one product designer, fractional QA/research | 6–10 weeks | 12–20 weeks | 20–32 weeks |
| Four experienced engineers, one product designer, dedicated QA/research | 5–8 weeks | 10–16 weeks | 16–26 weeks |

The two-engineer scenario is the planning reference. It allows parallel progress on the editor and its fidelity contract without requiring a large organization. A larger team can improve coverage and parallelism, but document, interaction, compatibility, and integration decisions remain serial constraints.

Reserve roughly a quarter of available capacity as an initial planning allowance for integration, design iteration, defect repair, and user feedback. This is not a validated productivity ratio. Reforecast using observed throughput and remaining uncertainty after S0 and each stage. If the gate is at risk, reduce the supported task set before lowering recovery, correctness, or interaction standards.

Do not attach dates to S4 or S5 before their discovery work. Solo work and part-time work should use smaller work packets and the same gates; shortening quality review to match a sprint label creates misleading progress.

## 5. First two implementation sprints

These are **two-week implementation planning windows** for the reference small team, starting **after the S0 gate passes**. Release pinning, independent pack validation, coordinate/UV conventions, and the command/persistence probes are completed prerequisites. No blocking S0 assumption may carry into implementation; documented nonblocking limitations remain part of the supported profile. Sprint 2 is an early complete loop candidate, not a promise that all S1 usability and polish gates will already pass. If implementation disproves an S0 assumption, stop the dependent work, resolve it, and reforecast.

### Sprint 1 — Prove one edit can survive the whole system

**User outcome:** open the original sample, make a deliberate shape change, undo and redo it, save a native project, and reopen the same result. Recheck the already-proven pinned game baseline as the integration reference.

| Workstream | Owner | Dependency | Reviewable evidence |
| --- | --- | --- | --- |
| Recheck target and game baseline | Compatibility lead | Passed S0 gate; pinned release and replacement block | Confirmed original minimal pack and exact profile; retained in-game evidence used as the independent integration reference |
| Application foundation | Core engineer | Passed S0/FND-08 gate and repository conventions | React/TypeScript/Vite shell, pinned dependencies and lockfile, reproducible start/build instructions |
| Document and command contract | Core engineer with graphics review | Units, axes, identities | Pure document operations; begin/preview/commit/cancel; one transform inverse; semantic save/reopen test |
| Viewport and interaction | Graphics engineer with designer | Coordinate fixture | Camera orbit/pan/zoom, selection, focus, transform preview, cancellation; physical mouse and trackpad observations |
| Workspace design | Product designer | Golden task and interaction map | Working hierarchy, inspector, mode navigation, relevant states, numeric alternative, scoped keyboard behavior |
| Native persistence integration | Core engineer | Proven S0 persistence probe and versioned document | Integrated complete document/texture revision save; reopen equivalence; truthful “Saved on this device” and failure states |
| Test and research setup | Shared QA/research owner | Working app slice | Command and UV assertions, one browser save/reopen flow, recruited first-session participants |

**Sprint acceptance:** the demonstrated edit does not drift between numeric values, viewport, history, and reopened project. The already-proven pack baseline remains the independent reference for the unfinished exporter. The review records integration findings and nonblocking limitations; unresolved blocking S0 assumptions are not permitted.

Avoid spending this sprint on elaborate docking, multiple asset formats, a large widget library, or an empty dashboard. Build reusable foundations where two real uses justify them. A beautiful shell without the save/reopen proof is not the sprint outcome.

### Sprint 2 — Connect shape, paint, recovery, and game export

**User outcome:** complete an early version of the lantern workflow, including a mistake and a recovery event, and inspect the exported result in the pinned game release.

| Workstream | Owner | Dependency | Reviewable evidence |
| --- | --- | --- | --- |
| Minimum modeling task | Graphics/core pair | Stable commands and selection | Required add/duplicate/delete and numeric/direct transform actions; snapping; Escape restores gesture start |
| Minimum paint task | Graphics engineer | Proven face/UV convention | Opaque one-pixel pencil with interpolated stroke coverage, eyedropper, clipping, 2D texture view, predictable one-stroke undo |
| Narrow external import | Compatibility/core pair | Pinned supported subset and temporary-document validation | Local model and texture dependency import; useful diagnostics; unsupported or malformed input leaves the active project intact |
| Mixed history | Core engineer | Geometry and paint commands | Geometry → paint → transform → undo/redo sequence restores the expected geometry and texture bytes |
| Atomic save and recovery | Core engineer | Revision persistence probe | Last acknowledged document/texture revision restores after interruption; quota failure preserves in-memory work and enables native download |
| Validator and pack export | Compatibility lead | Pinned profile, document snapshot | Actionable node/face/field diagnostics; correct references and pack metadata; actual exported pack checked in game |
| Interaction polish | Designer with engineers | Integrated workflow | Focus restoration, hotkey context, readable selection and tools, useful failure messages, complete visible control states |
| Formative study and repairs | QA/research owner | Safe runnable loop | Six to eight mixed-experience participants, including at least three novices and three experienced creators; observed task outcomes; highest-impact friction fixes |
| Gate evidence | Shared release owner | All above | Actual-versus-target scorecard, defects by severity, fixture results, device observations, explicit remaining S1 work |

Study recruitment can begin in Sprint 1. If participants or the integrated loop are unavailable, report the research as pending; do not infer usability from team familiarity. Keep study data anonymous and avoid capturing personal projects without consent.

**Sprint acceptance:** the team can demonstrate the early integrated loop and its failure handling. Incomplete work must remain visible in the backlog and scorecard. Subsequent S1 sprints concentrate on correctness, repeatability, interaction refinement, and observed usability until the complete gate passes.

## 6. What can move in parallel

After the S0 gate passes, the following implementation work can proceed in parallel:

- The designer refines state coverage and task flows while engineers implement the current slice.
- Compatibility work creates independent fixtures and game checks while graphics work improves input and preview.
- Persistence fault injection proceeds alongside modeling and painting because it exercises the shared document contract.
- Research recruitment and session preparation proceed before the next integrated build is ready.

The following work should remain sequential: approving a document contract before downstream serialization; validating a migration before replacing any saved revision; inspecting an import before replacing the open project; checking export support before claiming fidelity; and reviewing research evidence before expanding scope to solve an assumed need.

## 7. Planning risks and responses

| Risk | Early signal | Planned response |
| --- | --- | --- |
| Attractive viewport masks incorrect game semantics | Editor and game disagree on the asymmetric fixture | Stop dependent features; repair the profile/conventions and add the discrepancy as a permanent fixture |
| Prototype becomes a shell with disconnected tools | Demos avoid saving, reopening, mistakes, or export | Require the entire golden task at sprint review; reduce breadth until it works |
| Geometry and paint history diverge | Undo changes one subsystem but leaves the other stale | Use shared transaction ownership and a mixed-operation acceptance sequence |
| Browser persistence is mistaken for a backup | UI says saved before all bytes commit, or fails silently on quota | Make local commit acknowledgment explicit; retain portable native download and verified recovery candidates |
| “All things Minecraft” overwhelms the first release | Work starts on multiple incompatible profiles simultaneously | Keep one supported profile until its gate passes; separate discovery from implementation |
| Expert shortcuts make first use opaque | Creators need coaching to select, paint, or export | Improve direct controls, contextual hints, and task defaults; retain efficient expert paths |
| Format or dependency drift undermines reproducibility | Results vary with an unspecified “latest” version | Pin and record versions; upgrade through fixtures and game checks |
| Staffing estimate hides scarce graphics or compatibility expertise | Core decisions repeatedly block several workstreams | Reforecast, obtain targeted expertise, or reduce the supported operation set |
| New feature destabilizes existing projects | Schema changes ship without migration or rollback evidence | Require native round-trip and migration gates before release |

## 8. Delivery cadence and scope control

Use one short weekly review of the complete creative task, one focused design/engineering critique of its most important interaction, and a sprint review that compares measured results with the proposed targets. The purpose is to expose gaps while changes are still cheap.

At each stage exit, maintain a small release evidence packet: commit and dependency versions, supported targets, fixtures, actual benchmark conditions and results, usability observations, unresolved issues, and explicit reviewer decisions. The detailed packet is defined in [quality gates](QUALITY_GATES.md#10-release-evidence-and-rollback).

Feature requests enter the backlog with the creator problem they solve and the existing task they improve. Expand scope after the current contract is trustworthy. If a gate fails, assign the failure an owner and a review point, then choose between fixing it and explicitly narrowing the release contract. Quietly renaming a failed milestone is not a delivery decision.

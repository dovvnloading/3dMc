# Quality gates and evidence

**Status:** engineering guidance and proposed targets, not mandatory release gates. See the [testing notes](ALPHA_RELEASE_GATE.md) for the checks actually run. Treat numeric targets as goals rather than measured results.

Read alongside the [roadmap](ROADMAP.md), [backlog](BACKLOG.md), [workspace specification](../design/WORKSPACE_SPEC.md), and [compatibility contract](../architecture/COMPATIBILITY.md). A narrower supported workflow can pass a gate. An unreliable workflow cannot earn an exception because it is a prototype.

## 1. Document and interaction invariants

Every supported content operation must preserve these properties:

- The canonical document owns content. The viewport, inspector, history, persistence, and exporters agree on stable identities, units, coordinates, geometry, and texture bytes.
- Numeric edits and direct manipulation use the same command semantics. One completed gesture creates one history entry. Escape cancels a live gesture and restores its starting state. A new content edit after undo clears the redo branch.
- Undo and redo restore geometry and pixel bytes exactly where the operation is lossless. Camera movement and selection do not accidentally enter content history. Test mixed geometry → paint → transform sequences, not only each tool separately.
- Native save/reopen preserves all supported editable content. Test semantic equivalence with explicit numeric tolerances; do not substitute screenshots for document comparisons. Pixel data and stable identifiers should compare exactly.
- Import parses and validates into a temporary document. Failure leaves the active project intact. Unsupported content is rejected or clearly reported before acceptance; it is never silently discarded under a lossless claim.
- Export reads one immutable revision. Validation and generated files must refer to that same revision, including textures. Continuing to edit cannot produce a pack containing mixed revisions.

S1 includes one complete, documented external model import subset with its selected local texture dependencies, plus native project opening. It does not require general resource-pack traversal. The first paint contract is an **opaque pencil and eyedropper**, with corresponding 2D texture editing. Storage and history preserve RGBA bytes correctly, but alpha authoring, erasing, and alpha appearance in game require separate evidence and are provisionally S2 work.

## 2. Persistence, recovery, and failure handling

Use the workspace specification's exact states: **Saving…**, **Saved on this device**, **Unsaved changes**, and **Local save failed**. Show “Saved on this device” only after persistence acknowledges the complete committed document/texture revision. A download request shows **Download started**; it does not prove a file reached durable disk storage.

The recovery guarantee is the last acknowledged revision **while the browser's project storage remains available**. Do not promise to recover unfinished gestures or data the browser/user has removed. Browser storage limits and eviction behavior vary, so local persistence is not a portable backup guarantee; native project download remains a separate action. [Browser storage behavior](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

| Scripted failure | Required outcome |
| --- | --- |
| Refresh or close after acknowledged save | Reopen the same supported geometry and texture bytes |
| Interrupt a write between document and texture updates | Recover a complete valid revision; never combine partial revisions |
| Quota exhaustion, blocked storage, or transaction failure | Keep in-memory content; show failure; offer Retry and Download project |
| Latest checkpoint corrupted | Offer a verified earlier candidate, identifying its timestamp; preserve candidates for recovery |
| Newest checkpoint corrupts after blob cleanup | The retained previous checkpoint still has every required blob and restores correctly |
| Save N completes after save N+1 | The checkpoint pointer and active save status cannot move backward; acknowledgments remain tied to their captured content |
| Project switches while a save completes | The completion cannot mark the newly opened project's content saved |
| Unsupported future project schema | Refuse incompatible opening safely and retain original bytes |
| Failed migration | Leave the original project available; never replace it with partial output |
| Second tab opens the same project | Prevent silent concurrent overwrite; use a lock/read-only or explicit fork policy |
| Former writer resumes after another tab takes over | The stale ownership generation cannot publish or delete project data; download/fork remains available |
| WebGL context loss | Keep the canonical document; attempt renderer recovery and retain a project-download path |

WebGL context loss is a real browser condition, so renderer recovery must be exercised rather than assumed. [WebGL context state](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/isContextLost)

S1 requires the basic second-tab overwrite guard. S2 broadens conflict, quota, and repeated-session coverage. Recovery opens a copy of the selected valid checkpoint; it does not overwrite a potentially newer document automatically. Every scripted recovery case must restore the expected acknowledged revision or produce an explicit, truthful unavailable/corrupt-storage outcome. Inject failures at transaction boundaries, not just before a save starts.

## 3. Compatibility and artifact fidelity

For each claimed capability, maintain valid and invalid fixtures, expected diagnostics, and a human-readable explanation. Cover axes and units, origins, supported rotations, six asymmetric face UVs, texture orientation, reference resolution, missing dependencies, namespaces, and pack metadata. A symmetric cube cannot reveal all orientation errors.

Use an independent oracle: manually authored minimal fixtures, externally specified expected values, and inspection in the pinned game release. An importer and exporter agreeing with each other is insufficient if they share the same error. Define what is exact, what uses a numeric tolerance, and what is an acknowledged preview approximation.

Exercise an export of revision N while editing proceeds to N+1. The snapshot export may complete and must remain labeled N; it cannot contain newer pixels or clear the newer document's save/export status. Stale mutation jobs and stale diagnostics follow their own stricter policies.

The S1 artifact is a tiny resource pack replacing one known supported existing vanilla block model with the original opaque lantern. Verify the **actual exported pack**, without manual repairs, in the exact pinned release. Record the replacement target, pack hash, game version, screenshots, and relevant diagnostics. This proves the supported replacement workflow; it does not prove registration of a new vanilla block or compatibility with every block.

Retain original fixtures and redistribution-safe test data in the repository. Do not commit game binaries or proprietary extracted assets. Java items, additional release profiles, Bedrock, and animation each need their own end-to-end evidence before support is claimed.

## 4. Performance budgets and measurement

S0 names at least two real reference configurations, including a supported integrated-GPU laptop. Record CPU/GPU, RAM, OS, GPU driver, browser version, viewport, device pixel ratio, refresh rate, power mode, and network conditions. Lock a repeatable camera path and edit sequence. Separate cold startup from warm interaction; collect enough repeated runs to publish median, p95, sample count, and outliers.

Initial synthetic fixtures are **budget hypotheses**, not supported game asset limits:

| Fixture | Proposed contents | Purpose |
| --- | --- | --- |
| Starter | 24 cuboids; one 64 × 64 texture | First-use task and startup |
| Reference | 500 cuboids; four 512 × 512 textures | Responsive routine editing |
| Stress | 2,000 cuboids; four 1,024 × 1,024 textures | Bounds, cancellation, and graceful overload |

| Proposed acceptance target | Measurement method |
| --- | --- |
| Reference camera/manipulation p95 frame interval ≤20 ms, with a 60 fps design goal | Foreground scripted interaction on real reference devices; report long frames and dropped-frame distribution |
| Core input-to-render-submission feedback p95 ≤50 ms | Timestamp input handling through the frame that submits the changed state; disclose that this is not measured display latency |
| Selection and single undo/redo p95 ≤100 ms | Instrument command receipt to visible state submission on reference fixture |
| Starter becomes usable within 3 seconds | Cold load under the S0-pinned network/cache protocol; stop clock only when viewport and first edit work |
| Local acknowledgment within 2 seconds after a committed reference edit | Include scheduling/debounce and complete transaction time; report failure separately |
| Reference validation/export within 2 seconds | Time immutable snapshot to completed downloadable artifact; verify artifact separately |
| Expensive work remains understandable and cancellable | Show progress when work exceeds one second; cancellation preserves the active document and completes at the next bounded work checkpoint |
| No continuing resource accumulation after repeated project replacement | Run 100 open/close cycles; inspect renderer resource counts and post-cleanup memory trend, accounting for garbage-collection variability |

The stress fixture need not meet the reference latency budget. It must remain bounded, reject oversized input before dangerous allocation, and explain limits. Idle rendering should stop when the scene is unchanged, with exceptions for deliberate preview activity. CI timing is useful for regression trends; shared runners are not evidence of real-device interaction quality. A missed reference target triggers investigation, optimization, or an explicitly narrower published envelope.

## 5. Usability and accessibility

### Study design and decision rules

If a creator study is useful, an earlier proposal suggested 6–8 mixed-experience participants for S1 and 5–8 novices plus 5–8 experienced creators for S2. A study is optional, and small cohorts are not statistically representative market samples.

The proposed targets are:

- At least **80% make a meaningful first edit within 60 seconds** after the starter is ready, without coaching.
- At least **80% complete resize, opaque paint, correction with undo, preview, native save/reopen, and validated export within 10 minutes**, starting with the ready starter. Game installation time is excluded; artifact validity is independently checked.
- Every participant can find a recovery route after the scripted recoverable failure, with no irreversible loss caused by the interface.
- Creators can explain the difference between “Saved on this device,” native project download, and Minecraft export after the task.

Report exact counts as well as percentages: 80% means at least 5/6, 6/7, or 7/8 in an S1 study. Report novice and experienced outcomes separately; a pooled pass must not conceal a cohort repeatedly blocked by the same core interaction. Repeat the study on repaired areas when a recurring blocker appears. Do not replace missing participants with team members or silently count coached attempts as unassisted successes.

Use the original lantern, consistent task wording, and fresh app state. Record completion, elapsed time, wrong turns, assistance, and recovery behavior. Observe first; ask participants to explain their decisions afterward. Track expert friction qualitatively, including repetitive actions and shortcut discoverability. Obtain consent for recordings and avoid collecting personal asset content unnecessarily.

### Accessible operation

Treat WCAG 2.2 AA as the target for the surrounding application UI; do not claim conformance without an audit. Provide labels, visible focus, logical tab order, readable contrast, reduced motion, and feedback beyond color. Make selection available through the hierarchy and transforms through numeric fields. Essential controls must work with keyboard focus, and hotkeys must respect text editing and modal contexts. [WCAG 2.2 reference](https://www.w3.org/WAI/WCAG22/quickref/)

Dragging interactions need a usable single-pointer alternative unless dragging is essential. Numeric entry, click-to-select, and explicit move actions can provide these alternatives for supported tasks. [Dragging movements guidance](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

Manually check keyboard-only operation, screen-reader navigation of the DOM interface, focus restoration after dialogs, mouse and trackpad behavior, and supported browser zoom. Describe remaining limitations of visual painting and the 3D canvas precisely instead of treating a keyboard-accessible toolbar as proof that the whole editor is accessible.

## 6. Visual and interaction completeness

Review the working application against the design tokens and workspace specification. Every exposed control must perform a meaningful action or have an understandable disabled state. Verify selection contrast against light and dark textures, small numeric values, long object names, empty and populated lists, validation messages, loading states, storage failures, and recovery dialogs.

At the declared minimum supported viewport and at 125% and 200% browser zoom, essential actions must remain reachable through responsive layout or an explicit compact layout. Verify tooltips do not hide required controls, menus stay on-screen, and focus remains visible. Camera movement, gizmos, painting, and text input must not steal each other's gestures. Inspect physical mouse and trackpad interaction; screenshots alone cannot establish input quality.

## 7. Engineering verification and input safety

The following checks apply at the stated cadence. Report actual runs and their commit; the existence of a test harness alone is not a passing result.

| Cadence | Required verification |
| --- | --- |
| Each application PR | Reproducible locked install, type checks, lint, production build, changed domain/codec tests, relevant browser task coverage |
| Core/history/storage changes | Operation/inverse properties, mixed history, native round-trip, atomic-save faults, schema compatibility |
| Compatibility changes | Valid/invalid corpus, independent expected semantics, deterministic artifact content, relevant actual-game check before release |
| Scheduled and release runs | Selected browser matrix, real-device performance, recovery fault suite, keyboard/accessibility checks, long sessions |
| Visual/interaction changes | Focused state screenshots plus manual interaction; review intentional baseline differences |

Browser tests should operate through user-visible behavior, isolate storage and data, and avoid depending on uncontrolled services. Pin screenshot fonts, viewport, browser, and environment; distinguish rendering tolerances from real visual regressions. These practices follow [Playwright's test guidance](https://playwright.dev/docs/best-practices).

Test untrusted files as data. Set and document compressed size, expanded size, entry-count, nesting, decoded-pixel, and processing-time limits during S0. Cover malformed JSON, invalid numbers, oversized textures, missing references, path traversal, duplicate paths, and compressed-archive expansion. Check bounds before allocation where possible; use bounded processing and cancellation. Do not execute imported scripts, interpret names as HTML, or automatically fetch URLs found in a model. Diagnostics must not expose unrelated local data.

Use dependency and license review appropriate to the shipped code. Initial telemetry must exclude asset bytes and project contents; any later upload or remote processing requires an explicit product decision and clear user disclosure. Avoid introducing infrastructure solely to satisfy a hypothetical future feature.

## 8. Optional planning milestones

These earlier milestone targets are planning guidance, not prerequisites for ordinary fixes or issue closure.

| Stage | Evidence required to exit |
| --- | --- |
| **S0 Direction & compatibility proof** | Pinned release/profile and independent working pack; coordinates/UV proof; document/command and persistence probes; explicit browser/device envelope, limits, interaction plan, and re-estimate. No blocking format or storage assumption remains unresolved. |
| **S1 Polished vertical slice** | Complete lantern workflow; narrow external import and native open; opaque pencil/eyedropper; shared history; truthful save/recovery; validated export checked in game; basic concurrent-tab guard; performance, visual, accessibility, and formative usability results. No open P0/P1 in the supported scope. |
| **S2 Creator alpha** | Broader supported import corpus and repeat-use evidence; larger projects and browser matrix; storage/conflict edge cases; larger study cohorts; any enabled alpha/eraser behavior verified for its target. Existing S1 gates continue to pass. |
| **S3 Java production beta** | Every claimed Java item/display/pack capability has an independent complete-loop fixture; migrations and rollback exercised; release notes, support boundaries, and diagnostics usable outside the team. |
| **S4 Bedrock & animation** | Separate discovery evidence followed by complete loops for each claimed format/animation capability; compatibility, playback, save/recovery, and game checks. No inherited Java-support assumption. |
| **S5 Ecosystem breadth** | Each addition has demonstrated demand, a bounded contract, operational ownership, and its own security/recovery/compatibility evidence. |

A study or device check that was not run is **pending**, not passed by inference. Stage gates combine engineering and observed use; a green CI run alone is insufficient.

## 9. Defect severity and scope decisions

**P0:** data loss or corruption, unauthorized data disclosure, or imported content executing outside its intended data contract. **P1:** a supported core task cannot finish, export is materially incorrect, routine work crashes, save status falsely claims persistence, or an essential control is inaccessible without a usable alternative. **P2:** recoverable friction or a contained visual/interaction defect without those consequences.

Release with no known P0/P1 affecting the declared scope. P2 issues need an owner, documented impact, and a planned decision. A genuinely optional capability may be removed from the exposed/released scope. This cannot justify leaving silent corruption, false save status, or misleading compatibility claims in the core workflow.

## 10. Release evidence and rollback

Keep a compact evidence packet with commit SHA, dependency lockfile, document schema version, supported game profile, browser/device configurations, fixture and artifact hashes, relevant test results, benchmark protocol/results, usability counts by cohort, actual-game observations, known issues, and reviewer decisions. Separate **target**, **measured**, **failed**, and **pending**. Retain enough traces and screenshots to reproduce material failures without storing unnecessary user content.

Exercise rollback before production beta. A previous app must either read a newer project safely or refuse it without overwriting anything. Migrate into a validated copy, preserve the source, and keep native download available. The update flow must account for cached app versions and schema compatibility. Restoring an older deployment is not a recovery plan if it destroys newer project data.

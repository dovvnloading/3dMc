# v0.2 Creator Alpha: release evidence and decision record

**Release status: NOT CERTIFIED.** Tracking issue [#19](https://github.com/dovvnloading/3dMc/issues/19) is the source of truth. Implemented code has merged through [#20](https://github.com/dovvnloading/3dMc/pull/20) and [#21](https://github.com/dovvnloading/3dMc/pull/21); this document does not authorize a v0.2 tag, GA claim, Minecraft compatibility statement, or WCAG 2.2 AA declaration.

The project's limited target is browser-authored static Minecraft Java block visuals, with a bounded external Java model import subset and an **experimental** 1.21.4 resource pack replacing `minecraft:diamond_block`. It does not add block behavior or claim general Java/Bedrock format support. See [quality gates](QUALITY_GATES.md) for the acceptance targets, cohort sizes and defect severity definitions.

## What has already been verified in automation

| Claim | Evidence | Boundary |
| --- | --- | --- |
| Atomic selection, geometry and RGBA/UV workflows, external import, verified local snapshots, backup recovery | Merged [#20](https://github.com/dovvnloading/3dMc/pull/20), fix [#21](https://github.com/dovvnloading/3dMc/pull/21) and unit/Chromium regression tests | Does not demonstrate an independent human accessibility review or long-term browser storage durability |
| Locked install, typecheck, unit/domain tests, build, Chromium workflows, Firefox/WebKit **automated** smoke | [main CI run 42545823789](https://github.com/dovvnloading/3dMc/actions/runs/42545823789) on commit `77ad2f2` | Shared-runner/browser automation is not a named physical-device test |
| Compiled production Pages smoke, publish path at `/3dMc/` | [main Pages run 42545823782](https://github.com/dovvnloading/3dMc/actions/runs/42545823782) on commit `77ad2f2` | Build and upload results are not a substitute for hands-on game/client verification |
| SHA-256 references and automation provenance | CI artifact `editor-workspace-smoke`: `evidence/release-evidence.json`, source snapshot and fixtures; [generation script](../../scripts/release-evidence.mjs) | The script deliberately labels manual gates **pending**, including on green CI runs |

**Evidence is pinned to the run and commit above, not automatically transferable to a future release candidate.** On the chosen v0.2 candidate, rerun locked install, Vitest, browser smoke, compiled Pages, source snapshot and artifact hashing. Record exact commit, CI URLs, failures/retries and hashes in the decision record below.

## Outstanding release-blocking gates

| Gate | Responsible evidence | Required proof |
| --- | --- | --- |
| [#22 Minecraft 1.21.4](https://github.com/dovvnloading/3dMc/issues/22) | Actual Java 1.21.4 client, unchanged diagnostic *and* authored packs | SHA-256 for each ZIP, six labeled asymmetric views (plus oblique/close-up), authored lantern parts, in-game version, relevant `latest.log` and resource-pack warnings |
| [#23 devices, input, failure and performance](https://github.com/dovvnloading/3dMc/issues/23) | At least two named physical configurations including integrated-GPU laptop | Browser/OS/GPU versions, mouse+trackpad, suspend/resume, fault/backup results, repeated median/p95/count, resource-lifecycle and 100-cycle observations |
| [#24 independent accessibility and UX review](https://github.com/dovvnloading/3dMc/issues/24) | A real reviewer with documented keyboard and assistive-technology/browser setup | Keyboard tree and numeric alternative paths, modal focus/restore, 125%/200% zoom, status/labels, reduced motion and severity-ranked findings |
| [#25 creator repeat-use and final decision](https://github.com/dovvnloading/3dMc/issues/25) | 5–8 novices and 5–8 experienced creators, with repeated sessions | Participant count by cohort, unassisted task counts/times, observed friction/fixes, P0/P1 triage, reviewer sign-off, Go/No-Go |

### Game evidence, without altering the exported artifact

Follow the [six-face worksheet](../compatibility/SIX_FACE_GAME_CHECK.md) on an exact **Java Edition 1.21.4** client. Record the project revision and Git commit that produced the diagnostic and authored ZIPs. Preserve original files; changing pack bytes after export invalidates the comparison. On Linux/macOS use `sha256sum <filename.zip>` (macOS may use `shasum -a 256`); in Windows PowerShell use `Get-FileHash <filename.zip> -Algorithm SHA256`. Record any errors or warnings from `latest.log`, with personal paths redacted.

[A November 9, 2026 automation-operated client run](../evidence/java-1.21.4-2026-11-09/REPORT.md) records unchanged packs, screenshots and redacted logs. It found a block-atlas mipmap defect; the linked candidate fixed the warning in a second game session. This partial evidence does not replace the independent human game review required by #22 and is pinned to the revisions in that report.

Do not count parser/exporter round-tripping or the 3D preview as an independent oracle. A game-side face failure triggers a defect/fix, a fresh original ZIP and another complete game run.

### Named-device benchmark minimum

For both devices record OS/CPU/GPU/driver, RAM, browser/version, viewport, DPR, refresh rate, power mode, cache/network condition, workload fixture and timestamp source. Run repeated cold launch, camera navigation, selection/transform, 2D/3D paint, undo, local recovery/save, native reopen and Java export. Preserve raw samples, not just averages. Apply the *proposed* targets from [quality gates](QUALITY_GATES.md): p95 frame interval ≤20 ms, input-to-render-submission ≤50 ms, selection/undo ≤100 ms, initial editor usable ≤3 s, local save acknowledgement ≤2 s, reference export ≤2 s. If any miss, record the result and mitigation/narrower published support envelope—never silently convert a target into a measurement.

[A November 9, 2026 Windows/NVIDIA desktop run](../evidence/device-windows-2026-11-09/REPORT.md) records the 1/4/16-sheet resource workload and 100 automated project replacements with raw measurements. It covers one configuration and does not satisfy the named-device matrix or the latency targets.

Specifically test lost capture, blur/Escape, hidden-tab resume, another-tab takeover, blocked/quota storage, corrupted latest checkpoint, native backup and renderer context loss. Repeat 1/4/16-sheet GPU resource checks and 100 project switches, noting measurement limitations.

### Creator and accessibility evidence

A keyboard-only person must be able to accomplish core tasks through hierarchy/numeric controls without depending on a 3D drag. Record assistive technology, focus handling, readable errors, zoom, non-color cues and observed blockers. Use severity definitions in [quality gates](QUALITY_GATES.md): **P0** data loss, confidentiality or execution outside data contract; **P1** prevented core task, materially incorrect export, routine crash, false persistence status or inaccessible essential control; **P2** recoverable friction.

The S2 study requires 5–8 novices **and** 5–8 experienced creators, with repeat-use participants. Report unassisted completion counts for the 60-second first edit and ten-minute full edit–paint–undo–preview–reopen–export task, as well as recovery discovery. Compare against the 80% goal with exact denominators and split cohorts. Ask for participant consent and avoid collecting private asset contents.

## Evidence packet template — fill with measured facts only

Copy this into the final issue comment or a linked `docs/evidence/v0.2/<commit>/` record. `PENDING` is valid before testing; unverified values must never be filled with guesses.

| Required field | Recorded value |
| --- | --- |
| Decision / date / reviewers | PENDING |
| Source commit SHA + dependency lockfile SHA-256 | PENDING |
| Editor schema / native container version | Schema 3 / container 2 (verify on candidate) |
| CI checks + production Pages run URLs | PENDING for release candidate |
| Diagnostic ZIP exact SHA-256; authored ZIP exact SHA-256 | PENDING / PENDING |
| Minecraft client version, six-face observations, authored-pack evidence/logs | PENDING — #22 |
| Device #1 and #2, raw samples, latency p95s and fault evidence | PENDING — #23 |
| Browser/OS/assistive technology, keyboard, zoom and usability audit | PENDING — #24 |
| Novice and expert sample sizes, unassisted numerator/denominator, repeat-use | PENDING — #25 |
| Known P0/P1 count and linked resolutions/retests | PENDING — must be zero |
| P2 inventory, owner, impact, explicit support limitations | PENDING |
| Scope exclusions, upgrade/reopen/rollback check | PENDING |
| Formal Go/No-Go decision and approver | **NO-GO until all above is evidenced** |

## Exit protocol

1. Every child gate #22–#25 has its actual supporting files, method, results and reviewer; defects have fixes and independent retests. A missing human evaluation is **pending**, not passing.
2. CI passes at the proposed release source commit, with a reproducible manifest and no known P0/P1 in the supported scope. The native save/reopen and rollback story is not weakened by a release.
3. Record the evidence packet and an explicit signed **Go** decision in [#19](https://github.com/dovvnloading/3dMc/issues/19), then update claims/tags only within what the evidence proves. Until then, keep #19 open and Java pack export labeled **experimental/unverified**.

Historical #4/#6/#8 were closed *not planned*; that action did not complete their validation. The active gates above carry those requirements forward.

# Editing and recovery reliability slice

**Status:** Implemented for the small editor document and tested in headless Chromium. Not a complete production recovery, browser-compatibility, or performance certification.

## Creator-visible behavior

- An opaque pencil gesture has an immutable source document. Dragging previews changed RGBA pixels, and the complete stroke creates a single undo action. Escape, pointer cancellation, lost 2D pointer capture, switching tools or modes, window blur and replacing the project abandon the preview and leave the source exactly unchanged.
- The gizmo changes temporary Three.js presentation transforms until normal pointer release. Canceling the gesture restores the unmodified source; invalid transforms are rejected by the document validator.
- Each local editor tab has a random runtime writer identity, a renewable 20-second IndexedDB lease, and a monotonic generation. Opening a different document rotates the generation so previously queued work cannot publish into the new session.
- **The ownership check and checkpoint publication occur in one IndexedDB readwrite transaction.** An old or suspended tab cannot publish after another tab takes ownership, even if its hash/compression completes later.
- The second tab opens in a read-only modal, offering **Download backup** and **Take over editing**. A takeover reads the latest verified checkpoint, then asks the user to recover it or keep the current in-memory workspace before allowing edits.
- A reload is a new runtime identity. If another lease remains active, the user must explicitly take over rather than have the application guess that the former editor closed.
- Saves acknowledge only the active writer generation, project session and document revision. A failed checkpoint leaves the native project download action available.
- The JSON autosave is deliberately bounded to 1.5 MB, which is smaller than the portable native .3dmc archive budget. A too-large valid project rejects its autosave **before opening a write transaction**, retains the last acknowledged checkpoint, and shows a specific download-backup warning instead of falsely reporting "Saved on this device". Saving a portable .3dmc remains available.

## Storage contract

The IndexedDB database retains its historical name \`3dmc-recovery-v1\` for migration. Version 2 creates a separate \`ownership\` store alongside the original \`checkpoints\` store; existing checkpoints remain untouched by the schema upgrade. Latest and previous copies are separately hashed with SHA-256. A corrupt latest copy falls back to the validated previous checkpoint.

The in-process publication queue controls ordering before asynchronous hashing. Cross-tab exclusion is enforced again inside the actual database transaction. There is no network sync, user account, cloud storage, or promise that browser storage survives user-cleared data.

## Test evidence

- Unit tests cover pure canceled, committed, cross-face and obsolete paint gestures; exact undo; and final gizmo transform validation.
- Headless Chromium tests exercise Escape and pointercancel during painting, two-tab takeover, stale-generation rejection, corruption fallback, project save/reopen, and existing export/import workflows.
- GitHub Actions runs locked npm installation, TypeScript validation, Vitest, a production build and Chromium workflows.

## Remaining work

- Full pointer/trackpad hardware matrix, gizmo lost-capture torture cases, native file-saver durability and per-device latency measurements.
- Deliberate quota-exhaustion and transaction-abort fault injection across browsers. Single-file recovery is a bounded JSON snapshot; a future asset blob graph requires reachability-based GC.
- Offline/secure-context policy, mobile/touch input, real user studies, GPU memory and frame-time benchmarks.
- [Java 1.21.4 in-game verification](https://github.com/dovvnloading/3dMc/issues/4), including asymmetric six-face fixtures, is a separate gate. Successful browser/codec tests cannot satisfy it.

See [Issue #8](https://github.com/dovvnloading/3dMc/issues/8) for remaining reliability tasks and [Issue #6](https://github.com/dovvnloading/3dMc/issues/6) for the UV performance/evidence gate.


## Additional transaction-abort and lost-capture tests

The recovery browser suite now injects a real IndexedDB read-transaction abort and checks that the read rejects promptly instead of hanging. Another scenario aborts a readwrite transaction during checkpoint publication and confirms the last acknowledged source is intact. A third scenario cancels a pencil stroke by losing pointer capture, verifying identical pixels and no new undo entry. Oversized source tests now check that a native-valid 1,300-part/16-sheet document cannot be acknowledged as recoverable under the smaller JSON limit; the prior checkpoint remains readable and a portable .3dmc archive round-trips. Corrupted revision/timestamp metadata also triggers previous-checkpoint fallback.

If an IndexedDB version upgrade is blocked by an older tab, a late-opened database connection is now closed rather than leaked after the failure was already reported. These are Chromium fault injections, not a certification for every browser or device suspension pattern.

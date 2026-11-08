# Creator Alpha implementation and evidence

Tracking: [#19](https://github.com/dovvnloading/3dMc/issues/19). Implementation is reviewed in [#20](https://github.com/dovvnloading/3dMc/pull/20). A green automated check is not an actual Minecraft or real-hardware certification.

## Atomic selection slice

Selection is session state: ordered stable IDs, an active part and a range anchor. It never changes native schema v3/container v2 and does not enter content history. Click replaces selection; Ctrl/Cmd-click toggles. Shift-click or Shift+Arrow in the filtered scene selects a range. In the 3D viewport, Shift/Ctrl/Cmd-click toggles. Select editable and Ctrl/Cmd+A select visible, unlocked filter matches. Typing and open dialogs retain their own shortcuts.

Multiple editable parts share one temporary transform parent and one gizmo. Move uses the selected snap increment. Resize scales around the selection center in the viewport. The numeric Selection bounds fields explicitly move the aggregate minimum corner or resize about that corner; Each part size uses mixed values and preserves each part's own corner. These different pivots are deliberate, labeled operations, not silent approximations.

The domain validates the entire result before publishing. If any selected part is missing, locked, hidden or exceeds source coordinate/size limits, **nothing** is changed. Duplication allocates all IDs once outside React replayable updates; it copies face bindings and keeps the intended shared texture identities. Delete and duplicate are one history step. Empty/identity operations do not add history.

A gizmo gesture captures an immutable source document. Escape, blur, pointer cancellation, capture loss, mode/tool changes, changed content and project replacement abandon previews. A stale gesture cannot commit into another source. Selection-only changes do not write content. Undoing structural edits reconciles missing selected IDs to a usable surviving part.

## Evidence boundaries

- Unit tests exercise range/toggle selection, exact history behavior, affine bounds, invalid/locked/hidden/missing members, source part limits, source round-trip, cancellation and stale-source rejection.
- Chromium task tests exercise numeric batch movement, mixed dimensions, duplication/deletion, native archive reopen, source equality, keyboard cancellation and filtered selection.
- Compiled Pages tests exercise the real production subpath, not only Vite development.
- Real pointer/trackpad, non-Chromium suspension, hardware latency, creator repeat-use and actual Minecraft 1.21.4 evidence remain explicit gates in #19. Do not call the complete alpha released from this document alone.

## Creator workflow integration — implementation status

The **Creator workflow tools** strip adds the following intentionally bounded features to the existing editor without changing the native v3 schema:

- **Pixel region** (Paint): rectangular numeric or pointer selection, exact RGBA copy, paste, clear and horizontal/vertical mirror on one named source image. Changes remain in a staged preview until confirmed; cancel is a no-op, and Apply is one undoable history operation. When the active source changes during preflight, the stale preview cannot overwrite it.
- **Face tools** (Paint): reference-sharing inspection across face UV regions, reverse U/V logical bounds, and *make face independent* by copying its source image into a new texture slot. This is not arbitrary UV unwrapping or atlas packing. Locked/hidden authoring constraints and the 16-sheet native budget still apply.
- **Import model**: explicit local JSON/PNG dependency preflight for the declared supported Java static-block subset, with parent resolution bounded to the uploaded corpus and strict rejection of unknown or unsupported fields. The import is an *editable resolved copy*, never a claim of faithful arbitrary third-party resource-pack import. The UI can download an archive of provided originals for provenance; a failed parse does not replace the open project.
- **Library**: explicit, independently checksummed, immutable native snapshots in IndexedDB. The 12-snapshot bound never auto-evicts saved work; a replacement is confirmed, a previously saved snapshot is verified before opening, and portable .3dmc download remains separate. Browser clearing or eviction remains outside this guarantee.
- **Workspace**: balanced, canvas and paint layouts; scoped shortcut guidance; truthful distinctions among acknowledged recovery, library snapshots and browser download initiation.

The shared App history path now publishes authoritative revisions synchronously before React batches a render. Rapid successive commands cannot silently overwrite an earlier command's result; undo/redo also use the same revision source. Asynchronous PNG, pack and project reads are generation-fenced, and a new project opening temporarily prevents unrelated edits while the recovery writer lease rotates.

The single-part 3D gizmo controls its actual temporary geometry anchor, and both single-part and multi-part transforms roll back on interrupted gestures.

## Automated evidence

- Source selection, batch transforms, one-step history, invalid/locked/hidden selection rejection and source file equivalence are covered in domain and Chromium tests.
- Additional Chromium workflows open real dialogs and assert exact native source bytes/values before and after canceled region edits, atomic face-image reassignment, rejected/accepted JSON+PNG external imports, and verified local snapshot restoration.
- Rapid same-turn duplicate keyboard commands are checked as *two* separate, recoverable and undoable document changes.
- The GitHub Pages suite exercises a **compiled** production bundle at the real repository subpath, not a Vite development server.
- [Integrated Chromium/production checks, November 8, 2026](https://github.com/dovvnloading/3dMc/actions/runs/42534869914) passed on the reviewed draft branch. A separate Firefox/WebKit smoke matrix is being added as an explicit additional gate; record its actual result before claiming browser support.

## Still required before a Creator Alpha release

- Real Java Edition 1.21.4 verification with unchanged exported resource packs, pinned game/client versions, exact hashes, six asymmetric face views and logs.
- Named real-device GPU and input-to-render traces, pointer/trackpad and suspend/resume coverage beyond Chromium automation, and a declared supported browser/device envelope.
- Actual repeat-use creator studies, report of task success/failure by cohort, and changes addressing important observed friction.
- An independent review of architecture, UX/accessibility, performance and failure paths, with **no known P0/P1** affecting the declared supported workflow.

**State:** implementation under review in PR #20. This document does not claim Minecraft game parity, hardware performance certification, or v0.2 release readiness. Administrative closure of #4/#6/#8 did not satisfy their outstanding validation gates.

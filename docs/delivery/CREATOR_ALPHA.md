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

## Remaining alpha workstreams

Pixel-region clipboard and UV-sharing workflows; bounded external model/texture dependency import; workspace and backup improvements; full device/browser evidence; creator studies; unchanged game artifact validation. Their completion must be recorded with executable tests or actual observations, not inferred from the administrative closure of #4/#6/#8.

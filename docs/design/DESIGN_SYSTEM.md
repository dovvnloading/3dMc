# Design system

**Status: Proposed foundation.** Tokens and component contracts are implementation starting points, not evidence of an implemented or accessible product. Research and contrast calculations reviewed **2026-11-08**. Read alongside the [workspace specification](WORKSPACE_SPEC.md).

## 1. What premium means here

Premium is a product property: legible controls, stable layout, accurate visual feedback, precise editing, complete states, and confidence that work is safe. A restrained visual language supports those properties. Decorative effects cannot compensate for ambiguous selection, brittle undo, or an unreliable export.

The proposed direction is a neutral charcoal workspace with a warm jade action color and a distinct lavender focus color. Let the model and texture supply most of the visual variety. Use a consistent scale, quiet separators, clear typography, and carefully controlled density. Avoid branded Minecraft textures in application chrome, continuous ambient animation, heavy glow, and layered translucent panels that make asset colors difficult to judge.

The first interactive slice ships with this system. There is no planned phase in which low-quality placeholders establish contradictory interaction habits and are later “polished.” Scope can be narrow while execution remains complete.

## 2. Semantic color tokens

Use semantic names in components. Raw values belong in the token definition only. A second theme can follow after the initial theme is verified; do not promise automatic theme switching until every canvas, overlay, and diagnostic state has been checked.

| Token | Value | Intended role |
| --- | --- | --- |
| `surface.canvas` | `#141619` | Viewport surround and deepest application surface |
| `surface.panel` | `#1B1E23` | Persistent panels and application bars |
| `surface.raised` | `#242831` | Menus, popovers, and elevated surfaces |
| `surface.control` | `#2B303A` | Input and secondary-control fill |
| `border.decorative` | `#343A46` | Nonessential section separators |
| `border.interactive` | `#748196` | Required control boundaries and state outlines |
| `text.primary` | `#F0F2F6` | Main labels, values, and content |
| `text.secondary` | `#B8C0CD` | Supporting labels and descriptions |
| `text.muted` | `#8F9AAE` | Low-emphasis information that must remain readable |
| `action.primary` | `#80DBBF` | Primary action fill and selected accents |
| `action.onPrimary` | `#10251F` | Text/icons on the primary action fill |
| `focus.ring` | `#A0AFFF` | Keyboard focus, distinct from selection |
| `selection.fill` | `#213C35` | Selected hierarchy rows and mode states |
| `status.error` | `#FF9B9B` | Error text, icon, and diagnostic accent |
| `status.warning` | `#F2CC82` | Warning text, icon, and diagnostic accent |
| `status.info` | `#A8C5FF` | Informational notices and links |
| `axis.x` | `#EA8F8F` | X axis, always accompanied by X or shape cues |
| `axis.y` | `#90D0A4` | Y axis, always accompanied by Y or shape cues |
| `axis.z` | `#8EB6F2` | Z axis, always accompanied by Z or shape cues |

Reserve the bright action color for important actions and selected states. Do not fill every toolbar control with it. Selection uses a filled region plus outline or marker; focus uses a ring. Error, warning, and success states use text and an icon in addition to color. Axis letters persist even when a user customizes axis colors later.

Avoid opacity reductions on required text. Disabled controls can be visually quieter, but a relevant reason remains readable through adjacent text or a focusable explanation. Inactive and disabled are different states: an inactive mode is available; a disabled action cannot currently run.

## 3. Contrast verification

The following ratios were calculated from the opaque hexadecimal tokens using WCAG relative luminance: linearize sRGB channels, combine them with coefficients 0.2126, 0.7152, and 0.0722, then divide lighter luminance plus 0.05 by darker luminance plus 0.05. Rounded values are shown. Normal text generally needs 4.5:1; large text needs 3:1; required non-text control and graphical information generally needs 3:1 against adjacent colors. [Source: WCAG 2.2 contrast requirements](https://www.w3.org/TR/WCAG22/).

| Foreground / background | Calculated ratio | Permitted use |
| --- | ---: | --- |
| Primary text / panel | 14.91:1 | All normal interface text |
| Secondary text / panel | 9.12:1 | Supporting text |
| Muted text / panel | 5.89:1 | Readable low-emphasis text |
| Muted text / control | 4.66:1 | Supporting input text; do not lower opacity |
| Primary text / control | 11.81:1 | Input values and secondary buttons |
| On-primary text / primary action | 9.80:1 | Primary button label and icon |
| Primary action / selected fill | 7.26:1 | Selected marker and text |
| Focus ring / panel | 8.01:1 | Focus indicator |
| Focus ring / control | 6.35:1 | Focus indicator against controls |
| Interactive border / panel | 4.24:1 | Required control boundary |
| Interactive border / control | 3.36:1 | Required control boundary |
| Decorative border / panel | 1.46:1 | Decorative separation only |
| Error / panel | 8.29:1 | Error labels and icons |
| Warning / panel | 10.93:1 | Warning labels and icons |
| Info / panel | 9.63:1 | Informational labels and icons |
| X / canvas | 7.62:1 | Axis indicator with label |
| Y / canvas | 10.14:1 | Axis indicator with label |
| Z / canvas | 8.74:1 | Axis indicator with label |

The decorative divider deliberately does not meet the interactive-boundary threshold. It must never be the only cue identifying an input, selected state, or essential control. Use the interactive border where a boundary is required. Jade buttons use the dark on-primary token, not white text.

These token calculations are not an application conformance audit. Real rendered states, antialiasing, image backgrounds, alpha blending, focus visibility, and adjacent surfaces need review. A selection outline against arbitrary texture colors requires a dual-tone treatment or other robust contrast strategy; a token measured against the canvas background is insufficient.

## 4. Typography and density

Use a clean system sans-serif stack initially, avoiding a webfont dependency before it contributes measurable value. Use one family throughout chrome. Tabular numerals are required in transform fields and coordinates. Code-like asset identifiers can use the system monospace stack in contexts where character distinction matters.

| Role | Proposed size / line height | Weight |
| --- | --- | --- |
| Main controls and values | 14 / 20 CSS px | 400–500 |
| Dense hierarchy rows | 13 / 20 CSS px | 400; selected 500 |
| Supporting descriptions | 13 / 18 CSS px | 400 |
| Compact section labels | 12 / 16 CSS px | 600 |
| Dialog heading | 18 / 24 CSS px | 600 |
| Empty-state heading | 16 / 22 CSS px | 600 |
| Numeric field values | 14 / 20 CSS px, tabular | 400–500 |

Do not reduce text size to solve an overflowing inspector. Reflow fields, disclose advanced groups, or widen the panel. Avoid all-caps paragraphs and long labels with excessive letter spacing. Truncated names have a readable tooltip and accessible full label. Edited names show the full value in a usable input.

Use a four-CSS-pixel spacing base: 4, 8, 12, 16, 24, and 32. Default panel padding is 12–16; related controls use 8; section boundaries use 16–24. Rows align labels and values consistently across inspector sections. Separators communicate meaningful groups rather than enclosing every property in a new card.

Control radius is 6 CSS px; popovers and dialogs use 8–12. Use restrained shadows for overlapping surfaces only. Persistent panels need no floating-card shadow. Icons use one stroke style and optical size, generally 16 or 18 CSS px in a 32–36 CSS px target. A 16 px drawing is not a 16 px hit area.

The product default target is at least 32 × 32 CSS px for frequent toolbar actions and 36 px field height where space allows. Coarse-pointer controls aim for 44 × 44. The WCAG 2.2 minimum target criterion is 24 × 24 CSS px with specified exceptions; it should be treated as a floor, not the desired editing density. [Source: WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## 5. Component contracts

Every component needs default, hover, focus, pressed, selected where relevant, disabled, and error/loading states where applicable. The implementation must not infer a state only from a change in color.

| Component | Required behavior |
| --- | --- |
| Primary and secondary button | Stable dimensions, explicit label, visible pressed feedback; loading label describes the action. Do not shift neighboring controls when a spinner appears. |
| Icon button | Accessible name and tooltip; active state remains visible. Frequent actions retain a usable hit target. |
| Mode tabs | Model/Paint/Preview use tab semantics and keyboard navigation. Selection marker, text, and background distinguish the active mode. |
| Numeric field | Direct entry, steppers, units, valid/invalid state, precise focus ring, and rollback behavior. Scrubbing is optional, never the sole input route. |
| Scene/hierarchy row | S1 provides single selection with separate focus, visibility, and lock states. Rename does not move the row. S2 adds grouped indentation/disclosure, multi-selection, and reordering. |
| Menu and command search | Group related actions, show shortcuts, support search where present, and return focus on close. Disable unavailable actions with a reason. |
| Splitter | Wide invisible hit area, visible hover/focus treatment, keyboard resize and reset, minimum widths enforced. |
| Dialog | One clear purpose, title, consequence, primary action, cancel, focus containment, Escape behavior, and focus restoration. |
| Palette/color control | Named current color, text-entry value, selected swatch marker, recent colors, and an accessible alternative to spatial picking. |
| Diagnostic row | Severity icon and label, affected object/file, specific explanation, and Locate/Fix action when possible. |
| Toast | Concise transient confirmation; no essential instruction or only available recovery action disappears with it. |
| Progress state | Name the operation; give determinate progress only when real totals exist. Offer cancel when cancellation is implemented safely. |

Tooltips appear after approximately 500 ms of dwell and on keyboard focus where helpful. They add a description and shortcut; they do not carry information needed to understand a destructive action. Tooltip content does not substitute for an accessible name.

Inspector sections use disclosure consistently. Common controls start expanded; genuinely advanced fields start collapsed with a clear heading. The selection's name and essential transform fields stay easy to find. Avoid deeply nested accordions and horizontal tab bars inside several vertical tab systems.

Context menus provide shortcuts to existing actions. They must not contain the only implementation of rename, delete, relink, or export. A command palette can improve expert speed, but a creator should still complete the entire first workflow through visible controls.

Empty states should explain what can happen next. An empty Scene panel offers Add element. An empty texture slot offers Create texture and Import texture. A filtered hierarchy with no matches offers Clear filter. An empty panel should never look like a failed render.

## 6. Viewport and texture presentation

Use a neutral background and a subtle, configurable grid. The origin and orientation are clear without saturating the workspace. Axis labels persist. The grid recedes at ordinary working zoom; it must not compete with individual texture pixels. Selected and hovered geometry remain distinguishable in textured, solid, and wireframe views.

The selection outline is stable during camera motion and does not obscure small cuboids. Handles use adequate hit areas independent of the visible mesh. A screen-space numeric overlay may help during a gesture, but the same value remains available in the inspector. Avoid obscuring the active face with a large floating toolbar.

S1 Paint exposes the opaque Pencil and Eyedropper, a crisp texel cursor, immediate color feedback, and linked UV inspection. Editable UV rectangles and an alpha-capable Eraser are provisionally S2; each remains hidden until its profile capability is verified. Texture rendering uses intentional pixel filtering; design review must inspect seams, magnification, alpha edges when supported, and sampling at noninteger zoom. Texture colors should not change merely because the user opened another panel. The architecture specification owns the exact color-management and rendering pipeline.

Preview mode removes editing distractions and labels the preview conditions. A studio view may aid shape inspection, while a target preview evaluates supported game appearance. These must be identifiable. Bloom, depth of field, cinematic grading, and dramatic reflections are inappropriate as default evidence of export correctness. An attractive model preview cannot substitute for the pinned in-game compatibility fixture.

## 7. Motion and response

Geometry manipulation, pencil feedback, selection, and field changes update directly. Do not ease a transform toward the pointer or animate a paint stroke after the user has finished it. Interface transitions may use approximately 100–160 ms easing for panel disclosure and popovers. Avoid animated rearrangement of the inspector while the user is reaching for a field.

Respect reduced-motion preferences. Camera transitions can be disabled or made immediate. Provide the destination view through a direct action even when an animated transition is offered. No persistent spinning, pulsing, or celebratory effect should distract from authoring.

The canonical [quality-gates document](../delivery/QUALITY_GATES.md) owns input-feedback thresholds, reference hardware, asset fixtures, and performance exit criteria. Those are measurement targets, not achieved performance claims. The engineering proxy measures input-to-render-submission latency; it does not measure when pixels reach the display. Pair that measurement with observed responsiveness during real editing tasks, and reserve input-to-display claims for dedicated display-latency measurements. Long operations keep the last valid canvas visible and show useful progress. A disabled button must not appear unresponsive; it explains what prerequisite is missing.

## 8. Responsive behavior and language

Component layouts use available panel width, not hardcoded desktop assumptions. At narrow widths, labels and values stack predictably, error text wraps, and primary actions remain reachable. A focused Canvas/Scene/Inspector arrangement is preferable to three unusably narrow columns. Dialogs fit the viewport, permit vertical scrolling, and keep their title and actions understandable.

Browser zoom and text resizing are supported. Test ordinary UI at 200% and reflow at 400%; reserve the two-dimensional layout exception for editing surfaces that require it. Do not dismiss overflowing menus or clipped forms as an inherent limitation of a 3D application. [Source: WCAG resize text and reflow](https://www.w3.org/TR/WCAG22/).

Use the creator's vocabulary: element, face, texture, size, target version, resource pack. Introduce UV as **UV mapping — where each face reads its texture**, then use the shorter term after context is established. Avoid exposing internal renderer, serializer, or state-management terms in normal creation flows.

| Situation | Proposed language |
| --- | --- |
| Successful local persistence | “Saved on this device” |
| Export requested | “Download started” |
| Missing texture | “The lantern body uses a texture we could not find. Relink it to restore this surface.” |
| Unsupported rotation | “This target profile does not support that rotation. Choose one of the available angles.” |
| Save failure | “Your latest changes could not be saved on this device. Retry, or download the project to keep a copy.” |
| Export consequence | “This pack replaces the visual model of [verified block] in [pinned version].” |

An error explains the problem, its effect, and the next useful action. When relevant, it also locates the affected object. Keep technical detail behind an expandable Details section with a copy action for support. Never display a raw stack trace as the primary explanation.

## 9. First-slice implementation and review

S1 requires a coherent component set: application/mode bars, buttons and tool rail, menus, numeric fields, hierarchy rows, inspector disclosures, texture palette, view controls, splitter, dialogs, diagnostics, save indicator, recovery surface, and export result. Each is implemented with its relevant states and keyboard behavior. Additional components require a real workflow justification.

Review real rendered software at the agreed desktop sizes, narrow layout, zoom levels, and both mouse and trackpad input. Review the asset at useful working zooms rather than only a flattering screenshot. Capture actual interface states for review; an illustrative mockup must be labeled as a concept.

The qualitative S1 design review complements the canonical [quality gates](../delivery/QUALITY_GATES.md). It passes only when selection and focus are distinct; primary editing actions are discoverable; transforms and paint feel immediate; labels and numbers remain legible; controls do not jump; errors can be resolved in context; undo and cancellation behave consistently; local save and recovery are truthful; and export accurately describes the pinned replacement target. These standards remain in force as S2–S5 add capabilities.

The system should evolve through observed friction. If users repeatedly search for an action, improve its placement or language before adding another toolbar. If experts repeatedly repeat a sequence, add a shortcut or batch action without breaking the visible route. If a feature cannot meet these contracts yet, reduce the exposed scope until it can.

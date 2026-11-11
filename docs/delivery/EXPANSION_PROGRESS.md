# 3dMc expansion implementation checkpoint

**Reviewed:** November 11, 2026. **Status:** integrated first-cycle pack workflow; experimental Minecraft compatibility. This ledger tracks the [full-scale expansion plan](FULL_SCALE_EXPANSION_PLAN.md), which remains the guiding design milestone.

## Implemented product slice

The browser editor and Pack Studio share one pack session and a single history. The Scene panel selects the active model for real 3D geometry and pixel editing. Pack Studio can assemble native model assets, rename pack/model identities, edit namespaces and resource paths, select supported replacements, and inspect texture dependencies. The current Java 1.21.4 configuration offers **two** property-free visual replacement choices: `minecraft:diamond_block` and `minecraft:iron_block`.

Saving a pack-mode project produces a native **container v3** `.3dmc` archive with the validated pack index, all editable source models, and their RGBA textures. Native v1/v2 single-model projects and legacy JSON remain readable; existing standalone projects do not silently become a multi-asset pack. Source documents, pack index and native ZIP container are versioned separately.

Local recovery stores the complete pack as a generation-fenced, hashed checkpoint with previous-version fallback. Switching models preserves other models' edits and uses one content undo history. Export preflight diagnoses the entire pack and the Locate action jumps to the affected model and cuboid or texture.

## Pull requests and validation

| PR | Scope | Outcome |
| --- | --- | --- |
| [#40](https://github.com/dovvnloading/3dMc/pull/40) | Pack-wide atomic recovery with legacy checkpoint support | Merged, recovery fault tests |
| [#41](https://github.com/dovvnloading/3dMc/pull/41) | Live multi-model editor, shared history, pack Save/Open and export | Merged; CI passed, including Chromium, Firefox/WebKit and compiled-site checks |
| [#42](https://github.com/dovvnloading/3dMc/pull/42) | Editable pack/model names and resource paths | Merged; CI passed |
| [#43](https://github.com/dovvnloading/3dMc/pull/43) | Locate preflight errors across source models | Merged; CI passed |

An independent sandbox was used as a fallback when Actions was delayed. It found and fixed a native ZIP validation error before merging #40 and verified the live pack workflows. The complete Chromium suite for the live editor passed **58/58** tests in an independent run. The test command and constraints are documented in [independent validation](INDEPENDENT_VALIDATION.md); GitHub CI and deployment results are tracked separately.

## Boundaries — do not overclaim

- **Minecraft appearance:** the earlier Java 1.21.4 in-game evidence covers the original diagnostic and lantern examples, **not** every multi-model combination or the iron-block replacement. Extra targets require real-game verification.
- **Pack formats:** the editable Java resource-pack importer remains a deliberately narrow legacy exporter subset. Native `.3dmc` v3 can reopen all modeled source assets; it is not the same as arbitrary third-party Minecraft ZIP import.
- **Authoring limits:** the native pack archive supports up to eight source models, but the current UI exposes two non-conflicting replacement choices; model geometry remains cuboid-based. Existing source textures are capped at 64×64, with further export restrictions.
- **Recovery:** browser recovery is local, not a substitute for a portable backup. `Save project` downloads the complete pack in pack mode.
- **Version claims:** Bedrock, animation, Java item definitions, unsupported Java releases, general meshes and modded formats are not production-ready capabilities.
- **Quality:** passing browser tests does not certify every device, all accessibility workflows or real Minecraft renderer parity.

## Next engineering slices

1. **Game fixture and compatibility evidence:** independently test a combined diamond/iron resource pack in Java 1.21.4; record exact ZIP hash, screenshots and observed behavior. Keep the result labeled experimental until verified.
2. **Pack authoring improvements:** improve asset browser search, naming, source organization and dependency diagnostics while retaining reference-safe undo/redo.
3. **Larger pack reliability:** measure memory, rendering and IndexedDB quota behavior for realistic multi-source projects, including corrupt or interrupted saves and tab takeovers.
4. **Format expansion:** extend supported replacement registries, strict Java import and then version-scoped item authoring only with representative fixtures and a documented compatibility contract.

**Milestone rule:** source integrity and a complete create → edit → switch → save → reopen → export workflow take priority over additional formats.

# Java Edition 1.21.4 block-pack export experiment

**Implementation stage:** Experimental S0 compatibility spike. **Game check:** Pending; no Minecraft client or extracted proprietary assets were used for this change.

## Exact output contract

- **Edition/release:** Minecraft Java Edition 1.21.4, stable, with resource-pack version **46**.
- **Replacement:** Visual model of the existing `minecraft:diamond_block`. This does not add a new vanilla block, change collision, supply light, or alter gameplay.
- **Blockstate dispatch:** `assets/minecraft/blockstates/diamond_block.json` uses an explicit single empty variant pointing to `3dmc:block/lantern`. A resource pack can override a vanilla model via a blockstate/model reference; do not assume the game's default stone blockstate selects a single model.
- **Model:** `assets/3dmc/models/block/lantern.json`, with explicit `elements`, six face bindings, whole-sheet `[0,0,16,16]` logical UV rectangles, and namespaced texture references.
- **Images:** `assets/3dmc/textures/block/main.png` holds the editable opaque RGBA pixel sheet. Solid-color elements each receive an independently encoded 1×1 PNG, so viewport-only solid colors aren't silently lost.
- **Metadata:** `pack.mcmeta` contains `pack.pack_format = 46`.
- **ZIP:** Flat expected resource paths, uncompressed ZIP entries, fixed file timestamps. Repeated exports of the same document have identical bytes in the same runtime environment.
- **Preview truth:** The browser viewport is an editor approximation. Face UV orientation, shading, and in-game output still need independent comparison; the generator does not claim parity.

## Preflight rules

A project must select the 1.21.4 experimental profile. It must contain 1–256 valid cuboids with all element coordinates inside `[-16, 32]`. Its shared texture must be square, power-of-two, at most 64×64, and entirely opaque. Textured cuboids may not use an additional material tint; the exporter refuses source data it cannot represent as specified.

Every visible or hidden cuboid is included in the game export. Scene visibility and locking remain editing-only properties. Element names stay in the native source rather than being invented as a Java model field. The output uses a generated fixed namespace/path to prevent project names or model identifiers from traversing archive paths.

Unsupported projects produce blocking diagnostics rather than a lossy file. There is no automatic conversion from candidate 26.3 semantics to Java 1.21.4; the user must intentionally select the supported experiment target and resolve issues.

## Verification already automated

Unit tests inspect the actual ZIP contents, independent expected paths and JSON fields, resource-pack format, six faces, unchanged source geometry, opaque pixel values after PNG deflate, PNG chunk CRCs, byte-for-byte deterministic re-export, and blocking conditions. Chromium smoke tests exercise the export dialog and a browser download, plus an out-of-bounds element with a Locate action.

These tests prove the **packaging contract**, not Minecraft acceptance. An importer and exporter agreeing with each other is not sufficient independent proof, and the application has no right to call its generated output game-verified yet.

## Required independent game check

Use a legitimate installation of **Minecraft Java 1.21.4** and a fresh world with a known camera setup:

1. Export the original sample. Keep the downloaded ZIP unchanged and record its SHA-256, project revision, application commit, and selected target.
2. Place the ZIP in the installation's `resourcepacks` folder, enable it, and reload resources. Record warnings and the `latest.log` diagnostics relevant to models/textures.
3. Place a diamond block (e.g., `/setblock ~ ~ ~ minecraft:diamond_block`) in a controlled scene. Inspect its model from all six directions, at close and normal distance.
4. Confirm the seven lantern cuboids appear, the color textures load correctly, and the overridden blockstate consistently selects the new visual. Compare axis orientation, six face markings, UV scaling, geometry bounds, and lighting against independently authored expected fixtures.
5. Disable the pack to confirm the vanilla diamond-block visual returns. Re-enable to verify reproducibility.
6. Preserve screenshots, exact game release, fixture hash, ZIP hash, model/blockstate content, and any deviations. Add fixes to fixture tests before raising the profile's support state.

Do **not** repair the generated pack by hand and then call the original exporter verified. If corrections are needed, change the codec and regenerate an entirely new artifact.

## Primary references

- [Official 1.21.4 release notes](https://feedback.minecraft.net/hc/en-us/articles/32385811139085-Minecraft-Java-Edition-1-21-4-The-Garden-Awakens) — resource-pack format 46, item-model pipeline changes.
- [Forge 1.21.x model documentation](https://docs.minecraftforge.net/en/1.21.x/resources/client/models/) — cuboid elements, model JSON, textures, and logical 0–16 UV coordinates. A structural reference for a version family, not the in-game oracle.
- [Minecraft model definitions](https://minecraft.wiki/w/Block_model) — resource locations and model/element properties.
- [Minecraft blockstate definitions](https://minecraft.wiki/w/Blockstates_definition) — explicit variant dispatch.

## Next compatibility boundaries

The native project schema remains transitional `.3dmc.json`. Imported model and resource-pack support, per-face UV rectangles, pivots, rotations, target texture references beyond one sheet, texture alpha, and a versioned native archive are not included. Each needs its own fixture and preservation contract before export can be promoted beyond this experiment.

The release-agnostic strategy remains in [COMPATIBILITY.md](../architecture/COMPATIBILITY.md).

## Round-trip import (the next bounded slice)

The Java 1.21.4 experiment can now re-import the **exact STORED ZIP subset emitted by 3dMc's own exporter** and recover editable cuboid bounds, material/color assignments and the shared opaque RGBA texture. The import runs as a preflight report; nothing replaces the active project until the user explicitly accepts it.

This is **not** a general Minecraft resource-pack importer. A valid ZIP containing additional resources, inherited models, different per-face textures, rotations, UV rectangles, compressed ZIP entries, unsupported PNG formats, alternate blockstate variants, or unknown fields is **blocked with a specific reason** rather than silently flattened.

ZIP inspection rejects oversized archives, unexpected paths, repeated names, non-stored/compressed entries, malformed directories/local headers, mismatched sizes and CRCs, and overlapping/untracked bytes. The PNG decoder accepts only the bounded RGBA8/filter-0 output from our encoder and checks PNG chunk CRCs plus zlib Adler-32 using a fixed-size inflate buffer.

Native-only part names, visibility/lock flags, the source project ID and undo history do not exist in the resource pack, so they are **reinitialized visibly** after import. Saving a native project preserves these attributes going forward. Semantic round-trip tests check geometry, colors and opaque texture bytes and require the exporter to regenerate identical ZIP bytes for its own original output.

The in-game verification issue remains [#4](https://github.com/dovvnloading/3dMc/issues/4). Passing import/export byte tests still does not prove Minecraft rendering fidelity.

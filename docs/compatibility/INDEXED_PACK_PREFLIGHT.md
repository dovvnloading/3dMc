# Indexed Java 1.21.4 pack preflight

**Status:** implemented for the experimental pack-profile exporter. This is **source and generated-path validation**, not an in-game Minecraft compatibility certification.

The live editor checks every source model in the selected pack before enabling **Download experimental ZIP**. A blocker in an inactive model includes the owning model name and stable source ID so **Locate** can switch to that model and select the affected cuboid or texture.

## Checks

- The entire pack index and all referenced editable source models must be valid and compatible with the constrained Java 1.21.4 static-block profile.
- The only allowed vanilla visual replacements are `minecraft:diamond_block` and `minecraft:iron_block`. Stateful vanilla blocks require a separate target profile.
- Generated blockstate JSON, model JSON, declared texture PNG and solid-material texture PNG paths are checked against one file registry. A generated path collision blocks export **before** packaging and instructs the creator to edit resource identities in Pack Studio.
- Source-specific geometry bounds, unsupported tints and non-opaque/invalid texture issues are shown alongside their source model name.
- Pack-wide warnings name the actual replacements instead of incorrectly claiming every model replaces diamond blocks.
- The final ZIP writer still validates everything at its own execution boundary. UI preflight is not a substitute for exporter-side validation.

The preflight reuses the **same generated solid-texture path function** as the writer, preserving the legacy single-diamond-block fixture and the multi-model path convention.

## Validation evidence

Focused unit tests cover a valid legacy pack, a two-model pack, unsupported stateful replacement, dangling references, source-specific geometry errors, and a collision between a named texture and a generated solid PNG.

The browser test builds a two-model pack, intentionally collides a declared texture path with a generated solid texture, confirms Download is disabled and the source is identified, corrects the path, and confirms the blocker is cleared. New ZIP combinations still require real-game checks.

See the [pack contract](../architecture/PACK_DOCUMENT.md), [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md), and [Java compatibility evidence](../evidence/java-1.21.4-2026-11-09/REPORT.md).

## Exact generated-file preview

Pack Studio now offers **Preview Java ZIP files** before download. The list includes
`pack.mcmeta`, every generated blockstate/model JSON, each bound source texture
and each generated solid-material PNG, together with the owning source model.
It shows the exact vanilla block replacements affected by the current pack.
The download button is disabled if the preflight has errors, and the opened
preview explains the blockers and the source to correct.

The preview and editor's existing export gate use the same non-mutating
`planIndexedJava1214Pack` result. A focused unit test asserts that the planned
paths (including order) match the actual writer's ZIP entry paths for a
two-model diamond/iron pack; a browser test compares the visible list with
downloaded ZIP entries and verifies collision correction. The writer still
revalidates immediately before packaging.

This is a source/path verification aid, **not** a Minecraft renderer or
in-game compatibility check. The combined diamond/iron fixture still needs
game screenshots, exact ZIP hash and a recorded Java 1.21.4 client run.

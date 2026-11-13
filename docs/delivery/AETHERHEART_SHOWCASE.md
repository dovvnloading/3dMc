# The Aetherheart — Celestial Relay

A deliberately ambitious, fully editable starter scene for the [3dMc Studio](../../README.md).
It is a **Minecraft Java static-block visual**, not an animated entity, new block registration,
a functioning light source, or a claim of in-game visual parity.

## Open it

1. Open 3dMc Studio and choose **New**.
2. Select **The Aetherheart** from the normal project template list.
3. Create the project. It opens in the **existing Model workspace** with the
   first element selected, just like every other project.
4. Use the existing Scene hierarchy and numeric inspector to select, move,
   reshape, duplicate, group or hide any of its parts. Switch to **Preview**
   for an unobstructed view or to **Paint** to edit the pixel-art materials.
   The Aetherheart, Celestial chart and Astral inscriptions have editable
   raster layers.
5. Use **Save project** to download the complete native `.3dmc` source, or
   **Minecraft export** for an **experimental Java 1.21.4 diamond-block
   visual replacement**.

Starting this template replaces the current workspace. Download the current project
first if you want an independent copy; local recovery is not a portable backup.

## Built entirely with native tools

| Assembly | Detail |
| --- | --- |
| Carved foundation | Layered basalt, gilded rims, dark stone, a star-map inlay and a crystal socket |
| Compass and inscriptions | Individual rune scale markers and cardinal enamel plaques |
| Four pylons | Copper boots, basalt spines, dual inset conduits, collars, eyes, finials and rivets |
| Clockwork canopy | Open-frame trusses, bright pinstripes, a suspended crown and tiny upper anchors |
| Three gyroscopes | Two perpendicular meridians and a broad horizontal orbit, built from 60 individually editable segments |
| Suspended Aetherheart | Seven prism tiers, painted crystal face facets, intersecting filaments and suspension beads |
| Focusing lenses | Four luminous optical assemblies surrounding the gyroscope |
| Orbiting fragments | Eight star-shards and four little floating gold sparks |
| Finishing accents | Engraved floor bosses, moonstones and crown detailing |

**Document stats:** 236 cuboids across 9 scene groups, 10 distinct 32/64-pixel
textures, editable pigment/etching layers on 3 of those textures, a 16-color
palette, per-face UV coordinates and quarter-turn UV rotations. All 236 cuboids
remain visible and unlocked. Every element uses a real painted texture rather
than a renderer-only material or a generated solid-color export PNG.

The design is **deterministic**: identical new projects produce the same
geometry, texels and UVs. Choosing a name or project ID creates a distinct
editable copy without changing the artwork. All authored elements fit within
the editor's Java model bounds and below the current 256-cuboid export cap.

## Visual direction

Imagine a carved obsidian museum relic built by celestial engineers. The
foundation is dark and weighty; the eye moves up through warm antique brass
pylons into light, overlapping gyroscopic orbits. The violet-and-cyan heart
feels suspended between them. Luminous rune plates, ivory finials and sparse
floating shards supply scale and contrast without closing off the view.

The source produces its own **reproducible pixel paintings** without network
downloads or third-party assets. Pixel sheets deliberately use both
base pigments and editable transparent detail layers. Their flattened
output is opaque, so the experimental Java pack export does not run into
the current alpha restriction.

## Fidelity and performance

- The scene uses **real native cuboids**, not a static screenshot or a GLTF
  outside the editor's authoring model.
- When all six faces reference one texture, the renderer reuses one
  material for that cuboid, reducing the draw-call cost of a detailed scene
  without losing independent UV transforms.
- The model is deliberately **static**. The rings and fragments suggest
  motion but do not animate. There are no emissive materials or true bloom
  effects in this authoring profile; the glowing appearance is painted into
  the texture colors.
- The Java 1.21.4 exporter replaces the visual model of **all diamond blocks**
  in the pack's scope. It does not alter collision, gameplay, crafting,
  light levels or textures in other Minecraft editions.
- Game parity is **not yet verified**. Use the exporter warnings and perform
  in-game visual inspection before describing the asset as release-ready.

## Checks

`src/editor/aetherheart.test.ts` covers deterministic construction, group
integrity, strict source validation, opaque/layered texture consistency,
Java model preflight/build and native `.3dmc` save/open parity.

`e2e/aetherheart.spec.ts` covers loading the prefab through the ordinary New Project flow, numeric editing and undo, Model/Paint/Preview modes, native project save/reopen, and a Java ZIP export.

The seven-part Copper Lantern remains the startup document, and the app's original layout, inspector, canvas controls, and camera behavior are unchanged. The new prefab is simply another native project source.

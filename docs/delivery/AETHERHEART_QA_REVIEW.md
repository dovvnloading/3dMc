# The Aetherheart — visual and functional QA review

**Review date:** 2026-11-13  
**Baseline:** `713b64e` (initial merged showcase)  
**Scope:** 3dMc editor, new-project onboarding, renderer, camera, source model,
native project archives and experimental Minecraft Java 1.21.4 ZIP export.

This is a repeatable QA review, **not** a claim that the resource pack has
been verified in Minecraft itself.

## Issues found in the baseline screenshot

1. **Small first impression.** The original 216-part model occupied too little
   of its available viewport. Its only camera default was tuned for a much
   smaller seven-part lantern.
2. **Partially hidden focal point.** The near diagonal pylon sat directly over
   the suspended crystal, while uniformly oversized gyroscope segments
   increased visual clutter.
3. **Invisible authored decoration.** Two crystal light bars were entirely
   buried inside a solid crystal tier and therefore could not contribute
   to the rendered model.
4. **Unhelpful empty state.** The initial Preview inspector said
   "Nothing selected", despite the template having nine genuine assemblies
   and ten painted materials.
5. **Shallow end-to-end coverage.** The first E2E only created a project and
   downloaded legacy JSON; it did not test view switching, guided editing or
   the native-save-to-Java-export workflow.

## Changes made

- Replace the fixed camera position with a deterministic camera frame
  calculated from the **actual visible cuboid bounds**, perspective and
  workspace aspect ratio. Framing is recalculated on view reset, document
  change or resize, not on every geometry edit. The featured gallery ISO
  angle is deliberately off the obscuring near diagonal.
- Reshape the three gyroscopes into **60 tangent-sized stepped segments**.
  Their silhouette remains Minecraft-style cuboids, but there is more open
  air around the core. Color accents repeat in a deliberate pattern.
- Paint the dominant core facet cyan, move both previously hidden
  cross-light-bars onto exterior faces, add eight individually editable
  ivory seams, move the focus lenses toward the outside of the rings, and
  add restrained preview-only warm/cool lighting.
- Treat the first view as a curated artifact exhibit: editorial title
  and contextual inspector with real **Inspect crystal**, **Explore
  gyroscopes**, and **Paint star chart** actions. These take the user
  into Model/Paint without changing any source geometry.
- Ensure guided actions safely handle renamed or removed parts, and
  reduce inspector vertical space so all three shortcuts are discoverable.

## Source invariants

| Invariant | Guard |
| --- | --- |
| 236 source cuboids | Unit assertions + E2E source download |
| Nine exhaustive, non-overlapping groups | Domain validation + unit assertions |
| Ten distinct material sheets, with three 2-layer paintings | Native source validation + archive round trip |
| Unique names and IDs | Unit assertions |
| All texture alpha opaque for Java export | Unit assertion and Java export preflight |
| Full per-face source UVs and rotation remain intact | Native codec tests and actual model-generation tests |
| Upper bound of 256 Java export cuboids | Unit preflight and ZIP generation |
| Gallery fits in ISO, front, right, top at portrait and wide aspects | Perspective corner-projection unit test |
| No source replaced without explicit Open/New confirmation | Existing editor/recovery E2E workflow |
| Native `.3dmc` saves/reopens the whole authored scene | Dedicated browser E2E and unit archive round trip |
| Experimental Java ZIP downloads with 236 elements | Dedicated browser E2E and unit pack export |

## Reproduce the visual check

1. Launch the compiled studio, **New → The Aetherheart → Create project**.
2. Confirm all three guided shortcuts are visible in a 1440×900 viewport.
3. In Preview, inspect ISO framing. The center crystal should be readable
   *between* the columns. Check **Front**, **Right**, **Top**, then **ISO**
   and make sure the complete model remains inside the viewport.
4. From the guided inspector, inspect the core, return to Preview and
   clear selection, inspect the gyroscopes, return to Preview and clear
   selection, then open **Paint the star chart**. The star-chart sheet
   and 2D paint canvas should both be active.
5. Download the legacy JSON and inspect 236 cuboids, nine groups and
   ten materials. Download a native `.3dmc`, reopen it, and check that
   all 236 elements return unchanged.
6. Generate the Java 1.21.4 experimental ZIP and check that the export
   preflight has **no errors**; retain its compatibility warnings.

The E2E test captures the initial and ISO-reset screenshots, so visual
regressions can be reviewed against a real browser render rather than
mockup imagery.

## Explicit limitations and residual risk

- Everything in this scene is a static, axis-aligned cuboid; **no rotating
  ring animation** or real refraction is exported.
- The warm/cool additional lights exist in **Preview only**. Minecraft
  block-model export changes neither illumination nor gameplay.
- Java 1.21.4 export currently replaces the appearance of **diamond blocks**
  rather than registering a new block. **In-game appearance has not been
  verified in this QA pass**.
- Headless Firefox environments may use the editor's intentional WebGL
  fallback even when model, painting, native files and ZIP export work.
  Browser screenshots must not be described as proof of real-world GPU
  compatibility.
- This review covers code, automated tests and real browser screenshots.
  It is not a screen-reader usability study, a device lab performance
  benchmark or an in-game compliance certificate.

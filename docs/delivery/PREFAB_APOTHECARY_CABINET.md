# Prefab library · Apothecary Cabinet

**Asset:** Apothecary Cabinet  
**Family:** Minecraft-style furniture / static Java block model  
**Bounds:** 16 × 16 × 16 model units  
**Source:** `src/editor/prefabs/apothecaryCabinet.ts`  
**Insertion:** `src/editor/prefabs/library.ts`

This is an **insertable furniture prefab**, not a project template, a title screen,
or a custom editor mode. It uses the normal 3dMc geometry, scene groups, texture
sheets, UVs, paint tools, undo history and portable project format.

## Insert it

Open a project (preferably an **Empty canvas** for a clean first look), then:

1. In the existing Scene panel, choose **Add shape**.
2. Under **PREFAB LIBRARY · FURNITURE**, select **Apothecary Cabinet**.
3. The entire cabinet is inserted as one undoable edit and one named Scene group.
   Use the group's **Select** action to move or scale the whole item, or expand
   it to edit an individual part. Click **Paint** to modify its real 32px textures.
4. Use **Save project** to download the editable native `.3dmc` ZIP, and **Open**
   to recover it. Undo/Redo adds or removes the whole item, including its new textures.
5. Insert the prefab again to create another independent grouped instance.
   Existing materials are reused unless their pixels were edited, in which case
   the new instance receives separate original paint sheets.

The placement algorithm uses a free 16-unit-wide bay, prioritizing positions
within the experimental Java model bounds. It **never stacks a new prefab
through an existing object's bounding box**. If a legal bay is not available,
the insertion is rejected without any partial changes.

## What was actually modeled

| Physical subsystem | Authored details |
|---|---|
| Frame | Four turned feet, enclosed walnut base, oak corner joinery, butcher-block countertop and brass inlay |
| Drawers | Four distinct recessed drawer fronts, edge chamfers, handwritten label plates, iron sockets and brass pulls |
| Hutch | Panelled walnut back, open lattice sides, turned uprights, visible pilasters, display shelf and four-piece crown frame |
| Apothecary stock | Three individually modeled square glass potions (green, blue and red), each with a glass foot, colored body, neck, collar, cork, label and glint |
| Worktop | Open handwritten leather-bound recipe book, two ceramic ingredient jars and a hollow-looking porcelain mortar with visible crushed herbs and pestle |

**Materials:** Eleven actual pixel-art texture assets, including carefully
shaded oak/walnut wood grain, cut endgrain, brushed iron, engraved brass,
ceramic, colored glass tonics, handwritten vellum and burgundy leather.
Several contain two editable raster layers for the base pigments and detailed
pixel painting. They use fully opaque output to satisfy the current exporter.

The prefab uses only canonical editable cuboids and UV bindings. The
renderer correctly depth-writes its fully opaque painted materials and draws
single-sheet boxes with one material, so near woodwork doesn't show distant
bottles through solid faces. Existing genuine transparent paint still uses
the alpha blending path. All visible
items are part of the model source; **no added UI overlays or renderer-only
objects** are used. It is recognizable as freestanding furniture from the
front, side and top, rather than an abstract arrangement of shapes.

## Export boundaries

The Java 1.21.4 ZIP export can encode the cabinet's axis-aligned cuboids,
pixel sheets and per-face assignments in a **visual replacement for the
existing diamond block**. This experiment does **not** register new
furniture behavior, collision, lighting, interactions, or crafting. It is
not claimed to have been visually verified in Minecraft. Keep total scene
elements at or below 256 and fit exported elements in -16..32 units for
the current Java experiment.

For a clean Java-exportable copy, start from **Empty canvas** and insert
one cabinet; adding furniture to an existing model may exceed export bounds
or the 256-cuboid experimental limit.

## Regression and compatibility checks

- `src/editor/prefabs/library.test.ts`: construction, naming, material
  quality and layers, strict source validation, grouping, placement,
  edited-texture isolation, texture-slot cap, undo/redo, Java model
  generation and native archive round trip.
- `e2e/prefab-library.spec.ts`: actual library menu insertion, unchanged
  starter project, scene grouping, repeated instances, undo/redo, native
  save/reopen and generated ZIP contents.
- `e2e-matrix/prefab-library.spec.ts`: runs these creator workflows in
  Firefox and WebKit.

There are no changes to the editor layout, camera controls, project creation,
existing primitives or the startup Lantern document.

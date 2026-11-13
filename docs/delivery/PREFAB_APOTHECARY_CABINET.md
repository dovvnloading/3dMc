# Prefab library · Apothecary Cabinet

**Asset:** Apothecary Cabinet  
**Family:** Minecraft-style furniture / static Java block model  
**Placement cell:** 16 × 16 × 16 model units

**Source:** `src/editor/prefabs/apothecaryCabinet.ts`  
**Insertion:** `src/editor/prefabs/library.ts`

The cabinet uses the editor’s ordinary cuboids, scene groups, texture sheets,
per-face UVs, paint tools, undo history and portable project format.

## Insert it

Open a project (preferably an **Empty canvas** for a clean first look), then:

1. In the existing Scene panel, choose **Add shape**.
2. Under **PREFAB LIBRARY · FURNITURE**, select **Apothecary Cabinet**.
3. The editor selects the whole cabinet in one named, collapsed Scene group.
   Move or scale it immediately with the selection tools. Expand the group or
   type a part name in **Filter scene elements** to edit a single part. Choose
   **Edit texture** in its inspector to paint the selected face's 32px sheet.
4. Use **Save project** to download the editable native `.3dmc` ZIP, and **Open**
   to recover it. Undo/Redo adds or removes the whole item, including its new textures.
5. Inserting again creates separate geometry. Copies share unchanged sheets,
   so painting a shared sheet updates every copy using it. If you change a
   sheet's pixels or editable layer stack before inserting again, the new
   cabinet uses a fresh copy of that authored material.

The editor finds the nearest free 16-unit bay across the floor. It checks all
nine bays within the experimental Java bounds before looking farther out. If
every supported bay intersects existing geometry, insertion stops before
changing the project.

## Cabinet construction

| Part | Geometry and finish |
|---|---|
| Base and countertop | Four stepped feet, recessed walnut side panels, framed back and continuous oak worktop with a brass front inlay |
| Drawers | Two rows of two oak fronts, dark recessed joints, brass label plates and brass pulls on paired iron sockets |
| Hutch | Shallow bracketed shelf against a walnut backboard, brass edge strip and maker’s plaque, with a stepped crown along the rear |
| Bottles | A broad green tonic, a tall blue moonwater vial and a squat red elixir, each with a stepped shoulder, cork, brass collar and illustrated seal |
| Worktop | Leather-bound open recipe book with two illustrated pages and a ribbon, two covered ingredient jars, and a stepped porcelain mortar with modeled herbs and pestle |

Eleven opaque 32 × 32 pixel sheets supply the wood, hardware, porcelain,
colored glass, parchment and leather. Eight sheets carry separately editable
base and detail layers. Each page, bottle seal and jar label samples its own
region of the parchment sheet. Upright wood members use rotated grain.

## Java export

The experimental Java 1.21.4 ZIP replaces the diamond block’s visual model.
It contains the cabinet’s cuboids, per-face UV bindings and opaque texture
PNGs. The game retains the diamond block’s collision and behavior. The
exporter accepts up to 256 elements and coordinates from −16 to 32. Start
from **Empty canvas** for a single-cabinet export.

Both the single-model and indexed-pack export formats use the first project
texture for block particles. Inserting the cabinet into **Empty canvas**
preserves that project’s starter checkerboard in the first slot. The export
therefore assigns the checkerboard to particles even though the furniture
faces use the authored materials. In-game appearance remains unverified.

## Regression checks

- Geometry tests trace sightlines to eight landmarks from the editor camera,
  check the footing and support of each component, and detect overlapping
  coplanar faces. See `src/editor/prefabs/apothecaryCabinet.test.ts`.
- The prefab domain tests cover distinct label and page UVs, texture layers
  and isolation after hidden paint or flattening, non-overlapping placement,
  group naming, undo/redo, native archive round-trip and Java export.
  See `src/editor/prefabs/library.test.ts`.
- Browser tests insert and move the complete cabinet, find and edit a
  member, select the bound face texture, undo and redo insertion, reopen
  the native project and inspect the Java ZIP.
  See `e2e/prefab-library.spec.ts` and `e2e-matrix/prefab-library.spec.ts`.
- The Firefox and WebKit visual checks require an actual WebGL render,
  capture isometric, front, right and top views, check for woodwork and potion
  colors, and compare draw calls with and without the group selection outline.
  See `e2e-matrix/cabinet-views.spec.ts`.

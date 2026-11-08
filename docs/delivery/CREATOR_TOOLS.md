# Editor creation tools — primitive library and materials

**Status:** Implemented for the current cuboid document. The Java 1.21.4 resource-pack adapter is still experimental and has not completed the in-game proof.

## Author a new model

1. Select **New** and choose an empty canvas or a textured block. The project name and starting texture resolution are editable before creation.
2. In the Scene panel, use **Add shape** to choose a full block, half slab, narrow column, thin panel or small cube. The part is immediately selected in the hierarchy and 3D viewport.
3. The Inspector's **Transform** section supports precise corner position and size. The **Appearance → Surface type** control chooses a colored solid or the shared painted texture.
4. Switch to **Paint** and edit face UVs and texture pixels on the selected painted cuboid.
5. Use **Move up / Move down** under **Element actions** to change the authored scene order. The resulting Java model preserves the ordered cuboid array.
6. Save the **.3dmc native project**, reopen it to continue editing, or export the explicitly experimental Java Edition 1.21.4 resource pack.

## Primitive geometry

| Preset | Min XYZ | Max XYZ | Purpose |
| --- | --- | --- | --- |
| Full block | [0,0,0] | [16,16,16] | Whole-block starting geometry |
| Half slab | [0,0,0] | [16,8,16] | Low profile, base or shelf |
| Narrow column | [6,0,6] | [10,16,10] | Support, handle or pole |
| Thin panel | [0,0,7] | [16,16,9] | Door-like trim or sign |
| Small cube | [4,4,4] | [12,12,12] | Centered detail |

Every primitive starts as an editable solid-color cuboid with independent face bindings. Each new element gets a fresh identifier; duplicate IDs or unsupported presets are rejected in the domain layer.

## Material switching

**Solid color** uses the precise editable color picker and no shared texture map. **Painted** uses the project's one RGBA texture, with no viewport-only tint. Switching to Painted resets the element material color to white so a Java export does not unexpectedly change its appearance; switching back to Solid color chooses a neutral baseline green. UV coordinates are preserved across material changes.

Locked elements cannot be converted, reordered, resized or deleted until unlocked. Material and reorder edits are separate reversible transactions.

## Keyboard

| Shortcut | Behavior |
| --- | --- |
| Ctrl/Cmd+N | Open New Project gallery |
| Ctrl/Cmd+S | Download native .3dmc source archive |
| Ctrl/Cmd+D | Duplicate the currently selected unlocked model cuboid |
| Ctrl/Cmd+Z | Undo the last committed document edit |
| Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y | Redo |
| V | Select tool |
| W | Move tool (Model) |
| R | Resize tool (Model) |
| B | Pencil (Paint) |
| I | Eyedropper (Paint) |
| Escape | Cancel a gesture or dismiss the shape menu |

Global shortcuts intentionally avoid typing into input fields, dropdowns, editable text or open dialogs. A keyboard can also activate the shape menu and surface switches directly without relying on a canvas pointer hit.

## Verified boundaries

Domain tests validate shape coordinates, material conversion, UV preservation, scene ordering, locked-element protection and undo/redo. Chromium tests exercise an added slab's dimensions, turning it into a painted element, preserving Java preflight validity, reordering it and reversing the order through history. Browser tests also exercise new-project, duplicate and save shortcuts.

The editor does not yet include groups, pivot rotations, bones, animation, arbitrary meshes, multiselect or more than one shared texture. Those require their own document semantics and target-specific compatibility tests. A saved project being editable does not certify its exported resource pack in Minecraft.

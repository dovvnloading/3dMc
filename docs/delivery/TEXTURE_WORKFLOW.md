# PNG import, replacement and export — first texture workflow

**Status:** Implemented for a single shared RGBA texture. Exact Java resource-pack rendering still requires independent Minecraft 1.21.4 verification in Issue #4.

## Creator workflow

1. Open your project, switch to **Paint** or find the **Assets** row in the Scene panel.
2. Select **Import PNG** and choose a PNG file. The editor validates the signature, image header CRC, dimensions and size before browser decoding.
3. Review the preflight preview, dimensions, opaque/translucent pixel count and all effects on existing painted elements.
4. Choose one policy:
   - **Keep the current canvas** (default). The image is mapped into the existing width and height using **integer nearest-neighbor** sampling, with no blur. A non-square source will stretch to the existing aspect ratio.
   - **Use the PNG dimensions**. Available only for square **16×16, 32×32 or 64×64** PNGs. Preserves all decoded texels and changes the project's source image resolution.
5. Confirm to replace the **one shared texture**; all painted cuboids that use it update together. The operation creates **one undo entry**, and its old pixels and dimensions remain in history until its bounded session history expires.
6. Choose **Export PNG** to download just the current source texture, or **Save project** to download a full editable .3dmc archive.

Both policies preserve logical per-face UV edges from 0–16 and their rotations, so the selected texture region scales with the sheet dimensions rather than silently changing authored UV values.

## Input and safety boundary

- PNG only, maximum **1.5 MB file bytes**, and **256×256 source dimensions**. 256px files must be imported using **Keep the current canvas**, which rescales to the native texture's current editable limit (maximum 64px per side).
- Common PNG RGBA, RGB, indexed/palette and grayscale encodings are decoded through the browser's image decoder, then normalized to straight RGBA bytes with a top-left origin. Invalid headers, truncated or unsupported PNGs fail without replacing the project.
- PNG IHDR CRC and permitted bit depth, color type, compression, filter and interlace values are verified before decoding. The browser decoder must agree with header dimensions.
- Browser canvas decoding can normalize color management and RGB values hidden behind fully transparent pixels. **The editor does not claim bit-perfect preservation of the original compressed PNG file**. Keep the original image if hidden RGB data matters.
- Existing native .3dmc files faithfully preserve the RGBA sheet *after* import, including alpha. The current experimental Java Edition 1.21.4 pack exporter requires an opaque, power-of-two square texture; importing alpha may result in actionable export blockers.
- The source archive and IndexedDB recovery are distinct. An import isn't a portable backup until the creator downloads a native .3dmc file. The PNG preflight never mutates the active project before confirmation.
- Unexpected format variants, larger PNGs and corrupted or compressed data beyond browser decode support are blocked. Image processing never traverses uploaded paths or writes to disk on its own.

## Tests and future scope

Unit tests verify header CRC/dimensions, exact nearest-neighbor channel output, square texture policy, alpha persistence through native project archives, and Java alpha blockers. Chromium tests upload RGBA and tiny PNG files, inspect preflight, confirm source-size and scaled imports, undo/redo, reopen native source, export PNG and reject invalid inputs. Production Pages smoke checks that exported PNG can be reimported into the compiled app.

The next paint slice includes an opaque pencil (B), transparent eraser (E), exact four-connected RGBA fill (G) and eyedropper (I). Pencil and eraser draw at 1/2/4-pixel brush sizes, capturing the mode at the beginning of a gesture. Escape, lost pointer capture or focus loss cancels previews; a completed stroke or fill makes at most one undo entry. Fill treats alpha as part of region membership, so a partly transparent area is not merged with an otherwise identical opaque area. The 2D canvas supports Arrow keys for pixel focus and Space to use a brush or fill. The 3D viewport uses the same baked face UV-to-texel mapping. Painted meshes display alpha in the editor preview, while Java 1.21.4 export remains blocked for non-opaque source textures.

Future texture milestones include explicit alpha-aware eyedropper controls, selection/masks, improved non-square atlas workflows, per-face texture references and multi-texture native archive versioning. The current editor intentionally owns **one** shared texture; importing a PNG doesn't create a new independent texture slot.

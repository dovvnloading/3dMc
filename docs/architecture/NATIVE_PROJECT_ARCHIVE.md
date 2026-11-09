# Native .3dmc source projects — container v2

This is the portable **editable source** format, not a Minecraft resource pack. The first version used a single main.png. **Native container v2** now stores multiple named textures and preserves per-face source references; opening native container v1 is still supported.

## Versioned layout

Each archive contains a bounded STORED (method 0) ZIP directory, with no comments, unexpected paths, or compressed entries. Archive size is limited to 3 MB and there are at most 16 PNG texture assets, each up to 64×64 RGBA.

| Path | Contents |
| --- | --- |
| manifest.json | Format 3dmc-native, containerVersion 2, documentSchemaVersion 3, SHA-256 of every source entry, ordered PNG paths |
| document.json | Native document v3: cuboids with six faces each containing UV/rotation/**textureId**, ordered textures with stable IDs and editable metadata, activeTextureId |
| textures/<id>.png | One RGBA8 source PNG for each ordered texture asset |

Example manifest shape:

\`\`\`json
{
  "format": "3dmc-native",
  "containerVersion": 2,
  "documentSchemaVersion": 3,
  "document": "document.json",
  "textures": ["textures/main.png", "textures/texture_1.png"],
  "sha256": {
    "document.json": "<64-character SHA-256 hex>",
    "textures/main.png": "<64-character SHA-256 hex>",
    "textures/texture_1.png": "<64-character SHA-256 hex>"
  }
}
\`\`\`

On import, the strict reader verifies the complete ZIP directory, local/central field agreement, CRC, ordered whitelisted paths, per-file size, SHA checksums, PNG pixel/dimension equality, exact known object fields, source IDs, and absence of dangling texture references. An invalid file does not replace the workspace. SHA-256 is an **integrity check**, not a digital signature or authenticity assertion.

The source preserves every texture's RGBA bytes, visibility/locks, part names and Java UV mappings. Undo history is not included.

## Migrations

- Legacy **.3dmc.json v1**: each cuboid gets six default full-sheet UV faces, all referencing the existing main image.
- Legacy **.3dmc.json v2**: existing face UVs/rotations are retained byte-for-byte and assigned textureId main; the shared PNG becomes textures[0].
- **.3dmc native container v1**: the v1 manifest/doc/PNG are validated independently, then migrated to the v3 source model without overwriting the original file.
- Native **v2**: no migration; all named texture images and assignments are reconstructed and validated.

## Editing and deletion

The Assets panel lists up to 16 texture sheets with stable IDs, names, dimensions and PNG import options. Selecting, renaming, adding, replacing or deleting a texture uses the document/history path. Deletion **requires a destination** and previews the impacted faces; the actual transaction removes the source and atomically remaps every reference.

The face inspector chooses which texture each face reads. Normalized logical UVs 0–16 and quarter-turn rotations are independent of the sheet's pixel dimensions. 2D and 3D painting address the assigned image, not a different active sheet. Browser-started downloads are not proof of durable user-owned storage. IndexedDB checkpoints are separately retained and fenced by writer generation.

Java resource-pack export is a separate experimental profile; it may lose native-only names and flags and does not prove Minecraft game rendering. See [Issue #22](https://github.com/dovvnloading/3dMc/issues/22).

# Java 1.21.4: six-face game verification worksheet

**Status:** The diagnostic and an authored lantern were inspected in Minecraft Java 1.21.4. The [recorded game check](../evidence/java-1.21.4-2026-11-09/REPORT.md) contains the unchanged packs, screenshots, hashes and logs for that run.

## Generate the exact test pack

1. Run 3dMc at the commit being verified (npm ci and npm run dev), open **Minecraft export**, and choose **Download six-face diagnostic ZIP**. This downloads an independent fixture; it does **not** export or modify the active project.
2. Keep the resulting **3dmc-java-1.21.4-six-face-orientation-test.zip** unchanged. Record the application commit and ZIP SHA-256. Use sha256sum on macOS/Linux or Get-FileHash -Algorithm SHA256 on PowerShell.
3. Verify the exact Minecraft **Java Edition 1.21.4** client. The resource pack declares format **46**; do not extrapolate to newer or older releases.
4. Disable conflicting packs, place the ZIP in the client's resourcepacks directory, enable it in the Resource Packs screen, and reload resources. Record any warning or model/texture error from latest.log.

## Expected face markers

The cube replaces the *visual model* of every minecraft:diamond_block. It uses one opaque 64×64 shared sheet and six separate 16×16 regions. Each region has a face letter, a white upward arrow and deliberately different corner markers.

| Face | Letter | Background RGB | Tile origin (pixels) | Logical UV rectangle |
| --- | --- | --- | --- | --- |
| North | N | 218, 78, 90 | 0, 0 | [0,0,4,4] |
| East | E | 55, 170, 153 | 16, 0 | [4,0,8,4] |
| South | S | 72, 108, 206 | 32, 0 | [8,0,12,4] |
| West | W | 155, 108, 197 | 48, 0 | [12,0,16,4] |
| Up | U | 198, 145, 45 | 0, 16 | [0,4,4,8] |
| Down | D | 78, 123, 77 | 16, 16 | [4,4,8,8] |

Each tile has **white at upper-left**, **black at upper-right**, **yellow at lower-left** and **pink at lower-right**. The arrow and letter reveal flips and quarter-turns that a symmetric tile would conceal. These are authored expectations, **not observed Minecraft results**.

For the up and down views, use camera yaw 180° when comparing these corner positions; yaw 0° rotates the whole view by 180°. Record the heading with each screenshot.

## Record independent in-game evidence

In a clean creative test world:

1. Place one block with /setblock ~ ~ ~ minecraft:diamond_block and frame the cube with unobstructed views.
2. Capture six labeled viewpoints: north, east, south, west, top, bottom. For each, record the observed letter, background, arrow orientation and all four corner positions; note any distortion, mirroring, seams or missing textures.
3. Capture an oblique view and a close-up, checking lighting and UV interpolation.
4. Disable the pack to confirm the vanilla diamond-block appearance; re-enable and capture the repeated output.
5. Record any compatibility warning or log error. Do not hand-patch the ZIP and claim that the original exporter passed.

Suggested evidence worksheet:

| Observed face | Color/letter | Arrow points | White corner | Black corner | Yellow corner | Pink corner | Pass? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| North | | | | | | | |
| East | | | | | | | |
| South | | | | | | | |
| West | | | | | | | |
| Up | | | | | | | |
| Down | | | | | | | |

Record screenshots, the table, app commit, ZIP SHA-256, relevant `latest.log` excerpts and client release. Also check an **unchanged authored lantern ZIP** (not just the diagnostic fixture); retain both hashes.

## What CI proves—and what it doesn't

Automated tests check exact six-tile locations, distinct colors, asymmetric corner bytes, all six model-face UV references, PNG bytes, deterministic ZIP packaging, semantic import/re-export and a browser download/reopen workflow. The [game check](../evidence/java-1.21.4-2026-11-09/REPORT.md) adds a real-client observation for the tested 1.21.4 fixtures; it does not establish rendering for every possible pack or version.

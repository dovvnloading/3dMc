# Minecraft Java 1.21.4 game check

**Result: a real client run found an atlas-mipmap defect; a fix removed it in a second real-client run.** These observations were made through computer automation on November 9, 2026, on the configuration recorded below.

## What was tested

- Minecraft Java Edition **1.21.4, vanilla**, on Windows 11 Home 10.0.26200, with an Intel Core i5-10400F and NVIDIA GeForce RTX 3060 Ti (driver 32.0.16.1088). A separately configured game directory had no conflicting resource packs. The [debug-screen screenshot](client-version-debug.png) records the client version and graphics information. Two new superflat creative worlds were created; spectator mode and teleport commands were used for fixed camera positions. This single configuration is not the named-device performance matrix.
- The diagnostic and authored lantern ZIPs were downloaded by the application and copied without modification. SHA-256 was checked before and after game use. The original lantern has seven elements; its body X size was edited from 10 to 11 model units.
- The initial source was commit `77ad2f2e2630a31c3c93c373464011743511102b`; the retest source was commit `ef891e40383493c99ac7cab4948b6c81a347f3b9`. The dependency-lock SHA-256 was `769006692224a779a9e535dd2c128bdf527f8f8e1a4efbd5918f0d223b9c7959` for both. The browser used for each export was headless Chrome 156.0.8078.80.

| Original application download | Bytes | SHA-256 |
| --- | ---: | --- |
| [Diagnostic, initial](3dmc-java-1.21.4-six-face-orientation-test.zip) | 2,500 | `7e909985c8f596dc1c0cd40bfec8b0c57b70692ebc4920e8fd277e52e30d7e51` |
| [Lantern, before fix](3dmc-diamond-block-java-1.21.4-experimental.zip) | 10,254 | `c8e77114a79acb91567d95567b20400aeaa4e0ec96bc15656bd0e6ca4708f857` |
| [Diagnostic, fix candidate](fixed/3dmc-java-1.21.4-six-face-orientation-test.zip) | 2,500 | `7e909985c8f596dc1c0cd40bfec8b0c57b70692ebc4920e8fd277e52e30d7e51` |
| [Lantern, fix candidate](fixed/3dmc-diamond-block-java-1.21.4-experimental.zip) | 10,325 | `ceb10a9ec95f9d9db468e03f2bab89a04856b2628e03cf2df47239531a8e83e2` |

The candidate diagnostic has the same bytes and hash as the initial diagnostic. All six detailed diagnostic views below were captured during the initial run; the byte-identical candidate was [loaded again in the retest](fixed/diagnostic-retest-oblique.png). Screenshots are copies of the game's original F2 files, renamed for navigation; their image bytes were not edited.

## Six-face observations

With the stated camera headings, each face showed its expected letter, arrow pointing toward the top of the image, and white/black/yellow/pink corners in upper-left/upper-right/lower-left/lower-right order. Minecraft's directional shading made some colors, especially the underside, darker than the source RGB. No missing or mirrored marker was observed in these views.

| Face | Observed color and letter | Camera yaw / pitch | Screenshot |
| --- | --- | --- | --- |
| North | Red, N | 0° / 0° | [North](diagnostic-north.png) |
| East | Teal, E | 90° / 0° | [East](diagnostic-east.png) |
| South | Blue, S | 180° / 0° | [South](diagnostic-south.png) |
| West | Purple, W | −90° / 0° | [West](diagnostic-west.png) |
| Up | Ochre, U | 180° / 90° | [Up](diagnostic-up-yaw-180.png) |
| Down | Dark green, D | 180° / −90° | [Down](diagnostic-down-yaw-180.png) |

The top and bottom appearance depends on camera heading: at yaw 0° the whole view is rotated 180° ([up](diagnostic-up-yaw-0.png), [down](diagnostic-down-yaw-0.png)). Record the heading when comparing the worksheet; the original worksheet does not specify one. An [oblique view](diagnostic-oblique.png) and the close face views show the edges and sampling. Disabling the diagnostic restored the [vanilla diamond block](diagnostic-disabled-vanilla.png); [re-enabling](diagnostic-reenabled.png) restored the fixture.

## Lantern and atlas finding

The initial lantern showed the textured body, foundation, canopy, top plate and three-piece handle, including [close](lantern-close.png), [opposite-side](lantern-opposite.png), [top](lantern-top.png) and [underside](lantern-bottom.png) views. It loaded in a second fresh world, returned to [vanilla on disable](lantern-disabled-vanilla.png), and [returned on re-enable](lantern-reenabled-fresh-world.png).

The initial client log nevertheless reported that a generated 1×1 solid texture forced the **entire block atlas** from mip level 4 to 0, even though the lantern appeared recognizable. The [redacted initial log excerpt](pre-fix-log-excerpt.txt) includes both warnings and the atlas creation lines. A separate profile-service lookup error at startup is noted there with its identifier and response redacted; it was not a model or texture loading error.

The fix in [PR #28](https://github.com/dovvnloading/3dMc/pull/28) generates 16×16 uniform opaque solid textures and blocks source sheets smaller than 16×16 at export. Legacy 1×1 solid-color packs remain importable. In the second session, the [fixed lantern](fixed/lantern-initial.png) rendered, fell back to [vanilla when disabled](fixed/lantern-disabled-vanilla.png), and [returned when re-enabled](fixed/lantern-reenabled.png) in the fresh world. The [redacted retest log](fixed/retest-log-excerpt.txt) reports `1024x512x4` for the block atlas at initial load and after re-enable, with **zero WARN/ERROR lines** in that session. No pack-format warning was shown.

The test profile and both worlds remain in the isolated work directory for a reviewer. The screenshots and logs support the narrow tested diamond-block replacement only; they do not establish broader Java compatibility, a hardware SLA, accessibility conformance, or a signed human release gate.

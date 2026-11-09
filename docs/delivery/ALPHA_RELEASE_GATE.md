# Testing and release notes

3dMc is a browser-based Minecraft static-block editor. Its Java resource-pack export remains experimental and replaces the visual model of `minecraft:diamond_block`; it does not add block behavior or support every Minecraft format.

## Existing checks

- The [Minecraft 1.21.4 game check](../evidence/java-1.21.4-2026-11-09/REPORT.md) records unchanged diagnostic and lantern packs, six face views, hashes and client logs. The atlas mipmap defect found during that run was fixed in [#28](https://github.com/dovvnloading/3dMc/pull/28).
- The [Windows/NVIDIA device run](../evidence/device-windows-2026-11-09/REPORT.md) records 1/4/16 texture cases and 100 project replacements, including raw resource counts and timings.
- The repository's CI runs the locked install, typecheck, unit tests, browser workflows and compiled Pages checks. Each run is tied to its own commit and records its artifacts.

These results describe the configurations and examples actually tested. Other Minecraft versions, hardware, accessibility tools and arbitrary packs may behave differently.

## Practical verification

Run `npm ci`, `npm test` and `npm run build`, followed by the relevant browser tests for the changed workflow. For changes to the Java export, use the [six-face worksheet](../compatibility/SIX_FACE_GAME_CHECK.md) and an unchanged generated pack in Minecraft when a game check is useful. Keep native project backups separate from resource-pack exports.

Additional device tests, accessibility reviews and creator studies can be useful when available, but they are not prerequisites for ordinary fixes or for closing the former planning issues. Record what was actually tested and fix concrete problems as they are found.

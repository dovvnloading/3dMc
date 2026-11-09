# Windows desktop resource-lifecycle observation

On November 9, 2026, Playwright operated a headed browser on one physical desktop. The test passed the existing 1/4/16/1 texture resource checks and completed 100 additional alternating 16-sheet and one-sheet project replacements. This is an automated run on the configuration recorded below.

## Configuration and provenance

- Code under test: commit [`561eb15da28207bc2394054d911db740aa1ec6a9`](https://github.com/dovvnloading/3dMc/commit/561eb15da28207bc2394054d911db740aa1ec6a9); dependency-lock SHA-256 `769006692224a779a9e535dd2c128bdf527f8f8e1a4efbd5918f0d223b9c7959`. The commit combines the dialog and atlas fixes. Its [CI run](https://github.com/dovvnloading/3dMc/actions/runs/42613294146) is separate from this desktop run.
- Windows 11 Home 10.0.26200, Intel Core i5-10400F (6 cores / 12 threads), 17,016,135,680 bytes physical RAM, NVIDIA GeForce RTX 3060 Ti, Windows driver 32.0.16.1088. Display: 1920×1080 at 60 Hz; Windows High performance power plan.
- Google Chrome 156.0.8078.80, headed, 1440×900 viewport, device pixel ratio 1, page visible. WebGL reported `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti (0x00002489) Direct3D11 vs_5_0 ps_5_0, D3D11)` through `WEBGL_debug_renderer_info`.
- The Vite development server and browser were local. The browser and server were warm during the repeated replacements; this is not a cold-launch benchmark. The workload was generated locally from opaque 64×64 RGBA textures, with a visible cuboid per sheet, and did not use private project assets.

## Recorded results

The first sequence opened one, four, sixteen, then one distinct sheet. Three.js reported **4, 7, 19, then 4 texture objects** and **4, 7, 19, then 4 geometry objects**, respectively. The existing test's resource-release assertions passed. These are renderer object counts, not GPU memory bytes.

The next 100 replacements alternated 16 sheets with one sheet, 50 samples each. Each elapsed measurement includes Playwright file selection, the open-project confirmation, waiting for the expected texture count and canvas, pressing the framing shortcut, and two animation-frame callbacks. The median and nearest-rank p95 below describe this automated workload only; they are **not** the project's input-latency or export targets.

| Reopened project | Samples | Median elapsed | p95 elapsed | Range | Three.js texture count range |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 sheet | 50 | 342 ms | 458 ms | 242–474 ms | 4–4 |
| 16 sheets | 50 | 394 ms | 512 ms | 278–579 ms | 19–19 |

The sampled Chromium JS heap varied between 44,245,388 and 147,124,380 bytes for one-sheet samples and between 53,371,260 and 137,831,860 bytes for 16-sheet samples. Garbage collection was not controlled, so these samples alone cannot prove or exclude a leak. No uncaught `pageerror` was recorded by the test. The Vite console relayed two Three.js warnings: `THREE.Clock` is deprecated and `PCFSoftShadowMap` fell back to `PCFShadowMap`.

The renderer uses demand-driven frames. The probe's recorded intervals include idle gaps and must **not** be compared to the p95 ≤20 ms continuous frame-interval target. No input-to-render, save, export, cold-start or human input latency target was measured in this run.

## Reproduce and inspect

- [Raw measurements](measurements.json), including every replacement sample; SHA-256 `6de44d654229b24c6a5702b94cf7bc5c4cf465363faea006c7fd681448a33c6b`.
- [Final editor screenshot](one-sheet-after-100.png), [test workload](hardware-device.spec.ts), and [Playwright configuration](playwright.config.ts). The recorded test was run from the repository root with a temporary config and the same workload; this copy adjusts only its location and explanatory comment.
- After installing the locked dependencies, run `npx playwright test --config docs/evidence/device-windows-2026-11-09/playwright.config.ts` from the repository root on the stated Windows/Chrome setup. Check the reported renderer: software rendering or a different GPU is a different configuration. The run writes fresh output under `test-results/performance/`.

This run did not measure physical mouse/trackpad behavior, cold/warm task timings, or save/export/input latency on other devices.

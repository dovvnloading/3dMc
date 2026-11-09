# Resource lifecycle and recovery reference tests

**Scope:** Repeatable Playwright Chromium tests on GitHub Actions. Not an in-person GPU benchmark, a mobile hardware claim or proof of Minecraft rendering parity.

## WebGL texture performance workload

The editor supports up to **16 named 64×64 RGBA images**. The reference suite constructs real native .3dmc archives with 1, 4 and 16 distinct images, each bound to a visible cuboid, then switches back to one texture.

For each project, the test records elapsed milliseconds from file upload to responsive editor; Chromium JS heap bytes; actual Three.js WebGL texture and geometry counts; draw calls, triangles, pixel ratio and available frame-interval samples.

The regression condition checks that returning to one sheet releases GPU resources back to near the initial one-sheet count. These counters cannot determine the GPU driver's precise allocated memory bytes.

The renderer now caches each map by stable asset ID and dimensions. A pixel edit updates only its changed CanvasTexture; selecting a different texture does not force unrelated sheets to upload again.

### Evidence

Open the Editor checks GitHub Actions workflow artifact named **editor-workspace-smoke**. Inspect the measured output at performance/texture-lifecycle.json and the screenshot performance/one-sheet-after-recovery.png.

To run the reference test locally after npm ci and Playwright Chromium install:

    npx playwright test e2e/texture-performance.spec.ts

Only the development build at /?benchmark=1 exposes the optional diagnostics snapshot. The production Pages bundle excludes that component.

## Recovery interruption workload

The e2e/recovery-fault.spec.ts suite injects an aborted readonly checkpoint transaction, a readwrite abort while a checkpoint is staged, and lost pointer capture during an unfinished pencil gesture.

Other existing workflows test two-tab writer-generation fencing, intentional takeover, corrupted-latest fallback, quota failure and portable download.

## What this does NOT prove

Headless Chromium/SwiftShader timings are a regression baseline, not a hardware SLA. Real-device profiling still requires a named browser/OS/GPU, time-to-render and GPU memory observations, 2D/3D stroke latency and six-face visual inspection.

The [Minecraft 1.21.4 game check](../evidence/java-1.21.4-2026-11-09/REPORT.md) and [Windows/NVIDIA device run](../evidence/device-windows-2026-11-09/REPORT.md) record what was exercised locally.

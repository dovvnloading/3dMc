# Research notes and source register

**Reviewed:** 2026-11-08. These notes support planning; they are not a compatibility certification or a substitute for the S0 experiments.

## Evidence policy

Use official specifications, release notes, project documentation, and original source fixtures for technical decisions. A source establishes the behavior it actually describes. It does not establish that 3dMc already implements it, that every game release has the same behavior, or that a benchmark will meet a proposed target.

For implementation, record an exact release or source revision with the fixture. Living documentation and pages labeled `latest` or `stable` may change. Keep enough original test metadata to reproduce the decision later.

## Repository baseline

The inspected repository was [dovvnloading/3dMc](https://github.com/dovvnloading/3dMc), at initial commit [2a35e5f507db037fab2d4c41cc089e2c55cec797](https://github.com/dovvnloading/3dMc/commit/2a35e5f507db037fab2d4c41cc089e2c55cec797). It contained a short README and an Apache 2.0 LICENSE. No application code, build configuration, or test suite existed at that baseline. The foundation documents are new proposed work on top of it.

## Minecraft references

| Source | Relevant evidence | Planning implication |
| --- | --- | --- |
| [Java 1.21.4 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-4) | Introduces item-definition changes and paths under `assets/<namespace>/items/` | Item export needs a version-aware adapter beyond geometry JSON |
| [Java 1.21.6 official release notes](https://feedback.minecraft.net/hc/en-us/articles/37432144057997-Minecraft-Java-Edition-1-21-6-Chase-the-Skies) | Changes block-model rotation angle restrictions for that release | Do not encode an older angle set as a universal Minecraft rule |
| [Java 1.21.11 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-11) | Adds multi-axis element rotation and removes the prior angle-range restriction | Rotation semantics belong in the target profile and fixtures |
| [Java 26.1 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1) | Documents changes to block-model texture and render-pass behavior | Texture and transparency support also needs versioned evidence |
| [Java 26.3 release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3) | Documents a change from `shade` to `shade_direction_override` for block-model elements | Preserve source meaning and report conversions when fields change |
| [Forge 1.21.x model documentation](https://docs.minecraftforge.net/en/1.21.x/resources/client/models/) | Primary project documentation for cuboid model structure and logical UV addressing in its stated version context | Use as a structural reference, then prove the selected vanilla release with fixtures; Mojang release notes govern release-specific changes |
| [Bedrock geometry v1.26.40 reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/visualreference/geometry.v1.26.40?view=minecraft-bedrock-stable) | Describes geometry, bones, cubes, face UVs, and deprecated `poly_mesh` | Bedrock gets a separate capability profile; a schema mention alone does not justify arbitrary-mesh support |
| [Bedrock animations overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationsoverview?view=minecraft-bedrock-stable) | Distinguishes animation data, controllers, and entity integration | A timeline alone does not complete an animated-asset workflow |

The version examples explain why compatibility must be explicit. They do not select a first supported release by themselves. S0 must pair the chosen release's documentation with authored positive/negative fixtures and an actual game check. Neither Java nor Bedrock support is implemented by this planning change.

## Interface and implementation references

| Source | Relevant evidence | Planning implication |
| --- | --- | --- |
| [Blockbench](https://www.blockbench.net/) | Existing project describes modeling, in-app painting, animation, and plugins | Use mature workflows as a research baseline; validate differentiation with creators |
| [Vite getting started](https://vite.dev/guide/) | Official React/TypeScript template and static application build workflow | A small client-side application is a viable starting structure |
| [React state structure](https://react.dev/learn/choosing-the-state-structure) | Guidance on avoiding redundant, contradictory, and duplicated state | Keep authoritative document data and derived UI/scene state separate |
| [React Three Fiber scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance) | On-demand rendering, invalidation, and resource reuse | Idle scenes should not require continuous rendering; measure actual workloads |
| [React Three Fiber performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) | Warns against reactive state updates in high-frequency frame and pointer paths | Gesture previews need a deliberate fast path |
| [Three.js resource disposal](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) | GPU resources need explicit disposal/lifetime management | Repeated project and texture replacement needs leak checks |
| [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) | Browser storage has quota and persistence conditions | Local recovery and explicit source-file saving have different guarantees |
| [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) | Describes file handles, permissions, and origin-private storage | Feature-detect enhancements and retain a portable file-input/download flow |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Testable accessibility requirements | Define keyboard, contrast, focus, target-size, and reflow gates; do not infer conformance from a checklist alone |
| [WAI-ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) | Distinguishes keyboard focus and selection and documents tree navigation | The outliner needs an intentional keyboard and selection model |

Additional specialist references may appear next to the relevant decisions in the design and architecture documents. They remain subject to the same evidence and versioning policy.

## Research still required

1. Observe actual creator tasks and compare the proposed workflow against their current one. No user interviews were conducted as part of this planning change.
2. Select and test the exact first Java release and replacement block. No Minecraft client was run for this planning change.
3. Validate coordinate, rotation, UV, alpha, and color behavior with controlled fixtures. A correct-looking illustrative render is not an export-fidelity test.
4. Measure gesture latency, frame times, decoded texture memory, history growth, and save/recovery behavior on declared devices and browsers.
5. Evaluate keyboard and assistive-technology workflows on implemented components. No application accessibility certification is implied.
6. Resolve dependency versions and browser feature support when scaffolding the application, then keep reproducible lockfiles and a release matrix.

These are scheduled work items in [S0 and S1](../delivery/BACKLOG.md), with explicit quality gates. They are not hidden assumptions behind a claim that the editor is already production-ready.

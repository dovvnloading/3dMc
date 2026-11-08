# Product brief

**Status:** proposed product direction. **Prepared:** 2026-11-08. **Implementation:** not started.

## 1. Product promise

3dMc is a browser-based studio for making Minecraft assets. Its defining experience should be the ability to understand an asset, change it confidently, and get a trustworthy result into the intended game environment without assembling a separate workflow for every small task.

The product should feel like a serious creative instrument: responsive, precise, visually calm, consistent, and recoverable. Ease of use comes from clear defaults and well-sequenced information. Professional depth comes from accurate transforms, predictable selection, editable source documents, transparent constraints, and an efficient path to advanced tools.

The long-term ambition includes models, textures, skins, animated entities, and the packaging and integration needed to use them. That ambition is delivered as explicit asset profiles. It does not require every profile or an entire general-purpose 3D suite in the first release.

The shorthand “3djs” in the initial request is interpreted as **Three.js**, with React for the application interface. This is a working technical interpretation, not an existing implementation constraint.

## 2. What premium means here

The visual standard is essential, but the full standard is behavioral. A beautiful editor that loses a brush stroke, changes the wrong texture, or silently alters an export does not meet this brief.

| Dimension | Product obligation | Observable evidence |
| --- | --- | --- |
| Clarity | The current asset, mode, selection, target, and save state are understandable | A creator can explain what will change before acting |
| Craft | Typography, density, icons, spacing, and state changes form one system | Visual review covers complete workflows at supported sizes |
| Responsiveness | Editing follows the hand; expensive work does not freeze the interface | Recorded interaction and frame-time measurements |
| Precision | Numeric and direct manipulation agree; constraints are intentional | Repeatable transforms and codec fixtures |
| Trust | Changes are reversible; saving and export report what actually happened | Recovery drills, undo invariants, and versioned game checks |
| Approachability | A first asset is achievable without knowing an editor's vocabulary | Unassisted task studies with new creators |
| Depth | Repeated expert work becomes efficient without changing applications | Shortcut, batch-edit, UV, and asset-library workflows |

“State of the art” is the desired quality bar, not a claim of superiority over an evaluated market. The project must earn that claim with task outcomes and evidence.

## 3. Who the first release serves

### Primary creator: resource-pack author

This person understands Minecraft's visual language and wants to change an existing block or item. They may know a current modeling tool, but should not need to translate every small edit into a manual file operation. Their highest-value tasks are opening an existing asset, finding a part or face, modifying geometry or pixels, checking the result in context, and exporting predictable files.

### Primary learner: first custom-asset creator

This person knows the game but may not know UVs, pivots, normals, or resource locations. Their first session should start from a sensible object and show an immediate relationship between a control and the result. Advanced terminology can be introduced at the point of use with a plain-language explanation. The interface must remain the same as their skills grow.

### Secondary creator: experienced 3D or pixel artist

This person expects selection discipline, exact transforms, snapping, clear pivots, keyboard access, orthographic views, usable UV tools, and a reliable history. Familiar conventions should transfer, while unfamiliar Minecraft restrictions should be explained before export.

### Later audiences

Bedrock add-on authors, riggers and animators, modded-format authors, teams maintaining many assets, and educators are valid expansion audiences. They introduce different formats, integration obligations, and collaboration needs. Their future requirements should inform boundaries, without becoming requirements for every early screen.

## 4. Jobs to be done

| Job | User's question | Successful outcome |
| --- | --- | --- |
| Begin | “How do I start making a block?” | Choose an asset type, see a useful starting object, make a visible edit |
| Understand | “Which part and texture am I changing?” | Viewport, hierarchy, face highlight, and inspector agree |
| Shape | “Can I make this exactly the right size?” | Drag or enter dimensions with clear units, snapping, and undo |
| Paint | “Can I put this color on that face?” | Brush feedback identifies the actual pixels and any shared mapping |
| Inspect | “Will this look right in the game?” | A clearly labeled approximation, compatibility diagnostics, and a verified export path |
| Continue | “Will my work still be here?” | Reopen a native project or a clearly identified recovery checkpoint |
| Deliver | “Which files do I need, and where do they go?” | Export a target-specific package with a readable manifest and instructions |
| Expand | “Can I do a more advanced version?” | Relevant tools appear without requiring a new mental model |

## 5. The first complete experience

The reference task is to create an original cuboid lantern, change its shape and painted surface, and use it as a replacement visual for one existing Java block. The initial demonstration uses opaque pixels. Transparency, emissive appearance, and complex block behaviors add separate renderer and game-integration questions and are not prerequisites for proving the core loop.

The reference asset must be authored for this project or have suitable provenance. It should exercise multiple cuboids, distinct face orientations, asymmetric pixel markings, a shared texture, and names a person can understand. It should be small enough to inspect manually.

### First session

1. The home screen offers **New asset**, **Open project**, and a small number of useful starting examples. A new visitor can start without an account.
2. **New asset** offers a plain-language block template and shows the target edition and profile. Advanced version details are available, but the workflow does not begin with a configuration wall.
3. The workspace opens with the asset framed and an appropriate part selected. A brief optional hint explains navigation; it does not block editing.
4. The creator changes the body width by dragging a handle or editing a dimension. The model, inspector, selection, and undo label update together.
5. The creator enters **Paint**, chooses a color, and paints the selected visible surface. The 2D texture view and 3D model reflect the same pixels.
6. **Preview** provides neutral/game-oriented presentation and a small set of useful viewing contexts. It clearly distinguishes approximate appearance from actual game validation.
7. **Export** checks the selected target and reveals a concise file summary and any actionable issues. The first package changes one existing block's visual asset; it does not claim to register a new vanilla block.
8. The creator saves an editable `.3dmc` project and can reopen it with names, structure, texture source data, target, and editable properties intact.

### Returning session

Reopen the last local project or choose a project file. Restore the useful view and panel arrangement. Show whether the open content comes from a saved file or a newer recovery checkpoint. Repeated export should remember the target and choices while revalidating the current document.

## 6. Simplicity through progressive disclosure

There is one workspace, with three initial task modes: **Model**, **Paint**, and **Preview**. UV editing is a contextual part of modeling and painting. Animation becomes a mode only when an implemented asset profile supports it.

The hierarchy, inspector, mode navigation, and project controls stay in stable places. Mode changes preserve the camera and meaningful selection. Controls appear because they apply to the selected element and target, not because the user has declared themselves a beginner or an expert.

The default inspector exposes the few values needed for the current task. Less frequent properties are grouped under explicit sections. Searchable commands and shortcuts let experienced users move quickly. Tooltips explain purpose, shortcut, and a relevant restriction when needed.

Power is introduced in layers:

| Layer | Examples | How the user finds it |
| --- | --- | --- |
| Always available | Select, move, size, undo, save, export | Stable visible controls |
| Contextual | Face texture, UV rectangle, pivot, target-specific properties | Selection and mode |
| On demand | Detailed UV work, history, project diagnostics, layout presets | Named panels and command search |
| Profile-specific | Item display contexts, bones, animation channels | Asset type and compatibility capabilities |

A disabled control needs a useful reason. A control that can never apply to the current profile should normally be absent. A missing feature must not be disguised as an active control that only displays a promotional message.

## 7. Scope by release horizon

### S1: polished vertical slice

This is the first implemented product proof, after S0 research and compatibility probes. It contains a deliberately small set of real operations:

- Create a project from the original reference asset or a blank cuboid.
- Open a matching, explicitly supported model-and-texture fixture and reopen the native project format. General pack import is later.
- Select a part consistently from the viewport and hierarchy; inspect its properties.
- Add, rename, duplicate, delete, move, and resize cuboids through the command system. Rotation scope follows the pinned profile and fixture proof.
- Use a precise camera, orientation controls, grid, snapping, frame-selection action, and numeric input.
- Paint with a pixel pencil and choose existing colors with an eyedropper through a shared texture engine; expose a linked 2D view and explain shared UV changes. The reference task stays opaque. Erasing and transparent painting follow a verified alpha capability, provisionally in S2.
- Undo and redo each complete transform or stroke as one operation.
- Save/reopen the native project, recover an acknowledged checkpoint, and report failures honestly.
- Validate and export the narrow target package; inspect it in the selected Minecraft release.
- Support the error, loading, empty, unavailable-feature, and recovery states required by this loop.

No item is complete solely because it looks present in the shell. S1 is not done until the full task works across those boundaries.

### S2: creator alpha

Expand the same loop: robust supported-subset imports, file dependency resolution, reliable face/UV editing, multi-selection and group operations, useful pixel-art tools, controlled texture layers, palette workflows, history inspection, and better everyday productivity. Increase task coverage and recovery testing before expanding the number of target ecosystems.

### S3: Java production beta

Add the verified Java item workflow, target-specific display/definition behavior, repeatable resource-pack assembly, dependency diagnostics, broader version coverage where tested, and release-level usability, accessibility, performance, and stability evidence. Texture animation and material special cases are individually scoped capabilities, not implied by the word “texture.”

### S4: Bedrock and animation

Add a dedicated Bedrock profile with its geometry, pivots, hierarchy, animation and packaging requirements. Provide rigging and timeline interactions only once the profile and evaluation engine are proved. Reuse the workspace, command infrastructure, native document, and diagnostics where their meaning remains valid.

### S5: broader asset platform

Evaluate skins, modded mesh adapters, additional authoring representations, batch asset operations, reusable libraries, controlled extensions, optional cloud backup, review workflows, and collaboration. Each must have a clear audience, fidelity contract, and maintenance owner.

### Explicitly outside the first product proof

Arbitrary polygon sculpting, retopology, physics simulation, full world editing, gameplay scripting, a universal material graph, a plugin marketplace, live multiplayer editing, required authentication, asset generation services, and mobile feature parity are not S1 deliverables. They may be evaluated later when they solve a demonstrated creator problem.

## 8. Minecraft is a family of targets

The product must ask which asset is being authored, rather than assuming all Minecraft content has one representation. A cuboid block model, an item definition, an entity rig, a skin, and an arbitrary modded mesh have different meanings and export obligations. The [compatibility strategy](../architecture/COMPATIBILITY.md) is authoritative for those distinctions and the primary references behind them.

The first profile is Java static block visual authoring. The exact Minecraft release is chosen in S0 and stored with every fixture and export test. The plan deliberately avoids a floating “works with latest Minecraft” promise.

Import success, editability, preview fidelity, and game export support are separate claims. A file that can be displayed is not necessarily safe to edit and re-export. Unsupported data must be preserved when safe, clearly reported, or rejected before the active project changes. Destructive conversions require an explicit choice and retain the editable original.

## 9. Save and export are different user outcomes

**Save project** keeps the editable source of work. **Export for Minecraft** produces the files needed for the selected target. Exporting a flattened texture or a constrained game format must not discard the richer source document.

Automatic local recovery is a third function. Browser storage can be constrained or evicted; it is not equivalent to an externally saved project file. The interface should distinguish a committed recovery checkpoint, a completed supported file write, and a download that has merely been handed to the browser. See [MDN's storage model](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

The initial application can operate locally after its assets are available. A promise of fully offline reload requires a separately tested application-cache and update strategy. Accounts and a server are not dependencies of the basic authoring loop.

## 10. Competitive learning and differentiation

Blockbench is an important workflow reference: its own description includes low-poly modeling, texture painting, animation, and extensibility. That means “a web editor with cubes and painting” alone is not a demonstrated differentiator. See the [Blockbench project](https://www.blockbench.net/).

The proposed differentiator is an unusually coherent combination of immediate approachability, precise editing, understandable target compatibility, dependable recovery, and a polished end-to-end workflow. This is a hypothesis to test against creators' existing tools, not an assertion that competitors lack these qualities.

Observe real tasks in existing tools: opening a model with missing textures, selecting an occluded part, changing a size without moving the pivot, painting a face that shares UVs, undoing across tools, and producing a valid package. Record what is efficient and what is confusing. Design the interaction rules from those observations rather than copying a screenshot.

## 11. Product evidence and success measures

The [quality gates](../delivery/QUALITY_GATES.md) contain the proposed thresholds and measurement conditions. At the product level, success means:

- New creators complete the reference task without a facilitator operating the editor for them.
- Experienced creators can make common exact changes efficiently using visible controls or shortcuts.
- Creators know which part, texture, target, and save state they are working with.
- Valid exports produce the expected result in a recorded target release.
- Interrupted editing restores acknowledged work or clearly identifies the last recoverable checkpoint.
- UI and performance regressions are detected before a release expands scope.

The useful north-star signal is a completed authoring session with a valid output and a recoverable source project. Page views, time spent in the app, and feature count do not establish that outcome.

During initial studies, collect task completion, time, wrong-target edits, navigation mistakes, recovery confidence, and reasons for abandoning export. Keep the sample and uncertainty explicit. A small formative study can reveal problems; it cannot establish a population-wide success rate.

Telemetry is optional and minimal. If introduced, it should measure operation timings and anonymous failure categories without collecting project contents, texture pixels, asset names, local file paths, or private creative work by default. Initial research can use consented moderated sessions and local benchmark logs.

## 12. Decision discipline

The current defaults are enough to begin S0. Audience priority, the first precise target release, the default navigation preset, and the first export integration are the high-value assumptions to validate. They are recorded in the [decision register](../decisions/DECISIONS.md).

When a milestone slips, reduce breadth before lowering the baseline for undo, recovery, error clarity, supported inputs, or export correctness. When creators struggle, simplify the workflow before adding more onboarding. When a feature requires a new conceptual system, prove the smallest complete use case before exposing a general editor for it.

The result should be a tool that grows with its user while keeping each individual task easy to understand.

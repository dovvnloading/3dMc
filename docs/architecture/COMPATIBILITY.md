# Minecraft compatibility contract

**Status:** Proposed. **Research date:** 2026-11-08. **Implementation status:** Planning only; no codec, game compatibility, or round-trip claim is established by this document.

3dMc should make a precise promise: a creator can make an asset, understand its constraints, and export it successfully to a named Minecraft target. “Minecraft compatible” is too broad to guide editing or describe an export. The target must identify an edition, game release, asset family, and tested capability profile.

The first milestone is Java Edition static block model authoring. Its proof is an original, opaque, cuboid lantern exported as a resource-pack replacement for one existing vanilla block model. Stage 0 must select and verify the exact Java release and replacement block. The model changes that block's visual resource; it does not register a new block, change its collision shape, or create gameplay behavior.

See [technical design](TECHNICAL_DESIGN.md), [decisions](../decisions/DECISIONS.md), and [roadmap](../delivery/ROADMAP.md) for the implementation and delivery context.

## 1. Support is a set of distinct promises

Every profile needs four independently reported states:

| State | Meaning | Evidence required |
| --- | --- | --- |
| Import supported | The application understands the file and its dependencies well enough to represent it safely. | Parser, schema, dependency, and malformed-input fixtures. |
| Editing supported | Named changes have defined semantics and can be undone. | Domain invariants, command tests, and preservation tests. |
| Preview supported | The viewport represents the listed rendering features. | Asymmetric UV, transform, color, material, and context fixtures. |
| Export verified | The captured output has been loaded and checked in the stated game release. | Automated semantic checks plus recorded in-game verification. |

A file can be viewable without being safely editable. A valid JSON file can still reference missing textures. An accurate-looking viewport can still export a model the game rejects. The UI must never collapse these cases into a single green check.

Keep profile evidence separate from per-artifact evidence. A tested fixture corpus can support a label such as “Exporter tested for Java [release].” A new generated asset can say “Validated for this profile” after its structural and semantic checks pass. Show “Checked in game” only when a verification record identifies that exact artifact hash and target. A profile's successful sample does not certify every later user-created export.

The project target should read like “Java · static block · [verified release]” with a concise capability explanation. An imported file's declared format is evidence, not a complete version detector: several game releases can share a file structure while assigning different behavior to it. Ask for a target when necessary, offer a verified default for new projects, and retain the chosen profile in the native project.

## 2. Asset family boundaries

| Family | Authoring representation | Integration and limits | Planned stage |
| --- | --- | --- | --- |
| Java static block models | Cuboid elements, face texture references, UVs, pivots, supported element transforms, and model metadata. | Parent models, texture aliases, blockstate references, pack metadata, and version-specific rendering rules. | S1 narrow verified subset; S2 broader authoring. |
| Java items | Geometry together with an explicit item definition and display context. | Current item definitions may select or combine models and depend on runtime properties. Legacy item overrides require a different profile. | S3. |
| Bedrock geometry | Bones, cubes, pivots, per-face or box UVs, locators, and supported schema fields. | Geometry alone does not complete an entity: materials, textures, render controllers, and client/behavior resources can participate. | S4. |
| Bedrock animation | Bone animation tracks, timing, interpolation, and a supported expression subset. | Animation controllers and Molang introduce runtime conditions that a static preview cannot infer. | S4, after geometry. |
| Player skins | Pixel images mapped to a selected player template and model variant. | Skin templates and their overlay regions need a dedicated paint workflow, rather than arbitrary mesh editing. | Later, after core painting. |
| General meshes | Explicit reference or native editor mesh representation. | Arbitrary triangle topology is not automatically representable by vanilla Java cuboid model elements. A conversion must describe its approximation. | S5 research. |
| Modded formats | Adapter-defined representation and target runtime. | A mod loader, mod, version, and exporter can impose different topology and animation contracts. | S5, one verified adapter at a time. |

The Forge project's [1.21.x model documentation](https://docs.minecraftforge.net/en/1.21.x/resources/client/models/) describes cuboid elements in the Java JSON model pipeline. This is primary documentation for that project's version-scoped integration, not a universal Mojang specification; the selected vanilla release still requires original fixture proof in S0. Bedrock's [geometry reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/visualreference/geometry.v1.26.40?view=minecraft-bedrock-stable) and [entity creation guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoaddentity) establish a different resource pipeline. These are separate format families, even when their visible results look similar.

Groups in the native editor initially organize objects. They must not silently become Minecraft bones or imply an exportable hierarchy. Likewise, a tool called “rotate” must expose the active target's supported operation rather than applying any possible transform and hoping export can repair it.

## 3. Java model rules are versioned

Hardcoding an old restriction into the whole editor would immediately make the product misleading. Official Java release notes document substantial changes:

| Verified change | Consequence for 3dMc |
| --- | --- |
| [Java 1.21.6](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-6) permits numeric element angles within the then-supported range, rather than only multiples of 22.5 degrees. | An older discrete-angle picker cannot define all later profiles. |
| [Java 1.21.11](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-11) introduces multi-axis element rotation and removes the previous angle range restriction. It retains the older axis/angle representation, which takes precedence if both are supplied. | Store rotation meaning and source encoding separately. Emit one intentional representation appropriate to the selected profile. |
| The same 1.21.11 notes describe X, then Y, then Z rotation and preserve the meaning of original face direction names for culling. | Transform composition and cull-face metadata require fixtures; rotating a face does not automatically rename its source direction. |
| [Java 26.1](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-1) changes texture definitions and translucent rendering passes. | Texture references and material behavior cannot be modeled as one timeless string-only schema. |
| [Java 26.3](https://www.minecraft.net/en-us/article/minecraft-java-edition-26-3) changes shading fields, including the replacement of `shade` by `shade_direction_override`. | Shading import, preview, and export belong to a release-aware codec and rendering profile. |

This table records changes, not the release selected for the initial product. Stage 0 must choose a released target, record the official source, build fixtures against that version, and establish the exact subset promised by S1. A later release does not automatically become supported because its predecessor loads successfully.

A profile describes allowed fields, numeric domains, transform encodings, face rules, texture reference forms, shading behavior, pack metadata, and supported dependency types. Unknowns are explicit. The inspector should explain a constraint next to the relevant control; the exporter repeats validation independently so that pasted JSON, migrations, and future extensions cannot bypass it.

The first lantern avoids transparency, animation, special renderers, and complex blockstate combinations. This keeps the initial game proof narrow while exercising actual geometry, texture painting, UVs, persistence, and output. It is a deliberate test asset, not a claim that those other features are unimportant.

## 4. Java items require a separate pipeline

Modern item definitions are not simply a second folder for block geometry. The official [Java 1.21.4 notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-4) describe the item-model selection pipeline: an `item_model` resource identifier resolves an item definition under `assets/<namespace>/items/`, and the definition can reference geometry through a model type. The notes also describe removal of the older `overrides` mechanism from the block-model format.

For example, a definition at `assets/example/items/lantern.json` and geometry at `assets/example/models/item/lantern.json` play different roles. Their apparent shared name must not make the domain merge them. Display transforms, item contexts, conditional selection, and runtime state also need explicit representations.

S3 should initially support a simple, verified static definition referencing one model. Importing a composite, conditional, range-based, or special item definition should produce an understandable support report. A creator can inspect its dependencies and choose an available context; the application must not silently flatten a definition graph into the model that happened to render first.

Legacy overrides remain a separate compatibility profile. Conversion between legacy and modern definitions requires a rule-by-rule migration report and test cases. Editing geometry does not authorize rewriting unrelated definition behavior. “This geometry is editable; this runtime selection rule is retained but not previewed” is a useful statement when it is backed by preservation tests.

## 5. Bedrock is a later adapter, with its own proof

The [Bedrock geometry reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/visualreference/geometry.v1.12.0?view=minecraft-bedrock-stable) describes bones, cubes, pivots, cube rotation, texture dimensions, UVs, and locators. Its schema describes direction-specific faces, including omitted faces that are not drawn. These details must survive normalization rather than being approximated as generic scene objects.

Do not interpret the presence of `poly_mesh` in a schema as a safe arbitrary-mesh export opportunity. Microsoft's [geometry source documentation](https://github.com/MicrosoftDocs/minecraft-creator/blob/main/creator/Reference/Content/VisualReference/geometry.v1.21.0.md) marks `poly_mesh` deprecated and states that new content using it errors. The newer geometry documentation must be checked for the exact target when Bedrock work begins. A texture-derived mesh feature is also a different capability from importing arbitrary triangle meshes.

Animation adds another boundary. The [official animation overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationsoverview) describes bone position, rotation, scale, keyframes, and Molang. Start with verified static geometry and then a documented animation subset. Expressions must use a restricted parser/evaluator with named supported inputs; imported text must never execute as JavaScript. Unsupported expressions need a visible preview limitation, not a fabricated runtime value presented as accurate.

## 6. Coordinate, transform, and UV contracts

### Coordinates and transforms

Use a documented canonical convention: right-handed coordinates, Y up, north along negative Z, and 16 editor model units per block. This is an editor design decision. Each codec must prove its mapping; it is not an assertion that every external format uses interchangeable transforms.

For a cuboid with bounds `from` and `to`:

- Size is `to - from`.
- Center is `(from + to) / 2`.
- A renderer that uses one scene unit per block scales model positions by `1 / 16` at its boundary.
- The element pivot remains its own point. It is not replaced by the cuboid center.

For column-vector math, rotating a point around pivot `p` means `T(p) × R × T(-p)`. A profile specifying X, then Y, then Z corresponds to `Rz × Ry × Rx` under that convention. Do not infer equivalence from a Three.js Euler order string. Test transformed corners and normals directly, including nonzero pivots and mixed rotations.

Keep original semantic face labels, visible face normals, and cull metadata distinct. A rotated north face is still the source's north face when the selected format says so. Rounding belongs to an explicit input or export rule; do not repeatedly quantize canonical coordinates while dragging. Unsupported negative extents, non-finite values, scale, or shear must produce validation errors or an explicit conversion, depending on the profile.

### UV spaces

The Forge project's [1.21.x model documentation](https://docs.minecraftforge.net/en/1.21.x/resources/client/models/) describes a logical 0–16 UV space scaled across a texture. Use that version-scoped evidence to propose the initial Java codec mapping, then prove it against original fixtures from the selected vanilla release in S0. Bedrock's [geometry reference](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/visualreference/geometry.v1.12.0?view=minecraft-bedrock-stable) defines texel coordinates together with declared texture dimensions. These spaces must not be treated as identical pixel coordinates.

Represent editable UV rectangles in texture-edge coordinates with an explicit texture extent and retain the source encoding. For Java texture width `W`, logical coordinate `u` maps to pixel edge `u × W / 16`. A 16-unit UV span therefore covers a whole 32-pixel image when `W = 32`; it does not mean 16 physical pixels. Bedrock's declared dimensions and actual image dimensions must both be checked and explained when they differ.

The render boundary normalizes by texture width and height. Flip the vertical coordinate exactly once according to the selected image upload convention. Painting must use the same mapping in reverse. Pixel centers, pixel edges, UV rectangle endpoints, and inclusive brush pixels are different concepts; name them in code rather than passing generic numeric tuples between subsystems. S1 offers opaque Pencil and Eyedropper; erasing and alpha authoring follow a verified transparency profile, provisionally in S2.

Create six deliberately asymmetric face textures with corner colors, direction arrows, and labels. Test face orientation, all supported UV rotations, mirroring, reversed bounds, partial rectangles, omitted faces, and dimensions greater than 16. A checkerboard alone cannot expose every mirrored or rotated face error.

Texture resizing is an explicit operation. Offer defined choices such as resampling the image while preserving normalized coverage, or changing the canvas while preserving texel positions. Preview the result and make the image and UV changes one undo transaction. Never silently reinterpret a texture's resolution during import or export.

## 7. Dependencies, unknown data, and round trips

Model import is a dependency-graph operation. Preserve resource identifiers as namespace/path pairs; normalize paths using format rules, not OS paths. Resolve parent chains, texture aliases, blockstate references, and item-model references within a selected import set or an explicitly supplied resource context. Detect cycles, missing parents, unresolved aliases, duplicate resource names, and conflicting files before presenting a complete asset.

S1 may support a limited dependency set, but it must state that boundary. A missing parent can alter geometry or rendering; a fallback cube must be labeled a fallback. Do not silently fetch arbitrary URLs or assume the application's bundled sample resources supply the user's Minecraft installation.

Use three import outcomes:

1. **Editable:** the relevant structure and semantics are understood and tested.
2. **View only:** useful data can be displayed, but edits would risk losing or misinterpreting behavior.
3. **Blocked:** malformed, unsafe, unresolved, or unsupported data prevents a reliable representation.

An unknown-field sidecar is useful but does not prove preservation. If an unknown field points to an element that is deleted, retaining its bytes can make the export wrong. The adapter must declare whether a particular edit leaves unknown content safe, requires an explicit conversion, or blocks export. Preserve the untouched original file separately when useful; it must not be confused with the edited asset.

“Round trip” means semantic equivalence for a stated subset: supported geometry, pivots, UVs, references, display properties, and required metadata survive import and export. It does not mean byte-for-byte JSON identity after an edit. Ordering, whitespace, numeric spelling, and inherited versus flattened structures can differ while meaning remains equivalent. Conversely, valid JSON and similar screenshots do not prove equivalent meaning.

Native `.3dmc` source files retain editor information such as object names, groups, source provenance, and future paint layers. Game exports may flatten that information. Export is derived output; it must not replace or erase the native source.

## 8. Export contract and Stage 0 evidence

Export captures a specific document revision and profile. Resolve dependencies, validate, encode, package, and report from that immutable snapshot. If editing continues, the result remains “exported revision N”; it does not mark revision N+1 as exported or saved.

Errors should identify an object, face, texture, or resource and provide a useful action: select the object, supply the missing texture, change the target, or inspect an explicitly described conversion. A conversion that drops or approximates information requires a preview and a confirmed operation with undo. Do not repair an invalid file by quietly deleting fields, clamping rotations, or substituting placeholder textures.

For the S1 pack, produce only the original resources and metadata needed for the verified replacement. Record which existing block model is replaced, its relevant blockstate path, the game version, and the expected in-game placement/orientation behavior. The actual game's resource reload and rendering result are the acceptance test; a ZIP download is not that test.

The Stage 0 proof must produce:

| Evidence | Required result |
| --- | --- |
| Exact profile record | Edition, released game version, resource-pack metadata rules, reference links, and supported subset. |
| Replacement selection | One existing block and the model/blockstate dependency path that makes the replacement visible. |
| Geometry fixtures | Single cube, asymmetric cuboid, multiple elements, noncentral pivot, each supported rotation form, and boundary values. |
| Texture fixtures | Six-face orientation, resolution mapping, alias resolution, and opaque pixel-color checks. |
| Failure fixtures | Missing dependencies, cycles, unknown fields, invalid numbers, unsupported features, and hostile archives. |
| Round-trip report | Semantic comparison of import/export/import with explicit excluded features. |
| Game record | Screenshots, game release, fixture revision/hash, pack load result, and visible discrepancies. |

Do not proceed from S0 to a claim of verified export until these records exist. Open questions include the selected release, the best replacement block, the minimum dependency resolver, shading fidelity, and practical file/texture limits. Resolve these through the small compatibility spike, not by expanding the first milestone into every Minecraft asset family.

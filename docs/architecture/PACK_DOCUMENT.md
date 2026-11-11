# Pack document and native migration contract (design slice)

**Status:** pack schema and graph validation implemented, with an experimental deterministic indexed Java pack writer. Native persistence, asset browser and UI wiring **not yet implemented**. Use the [full-scale expansion plan](../delivery/FULL_SCALE_EXPANSION_PLAN.md) for the milestone order.

## Why a separate pack index

A native v3 \`EditorDocument\` currently represents one editable model, its cuboids, named texture sheets, and editing target. The editor history, recovery writer, and renderer all work from that single authoritative document. The Java 1.21.4 exporter hard-codes a diamond-block replacement.

The pack index introduced in \`src/pack/packDocument.ts\` is a second, *pack-wide* description; it is not a replacement for the editor's canonical document and is not yet persisted into \`.3dmc\` files. It records stable model and texture asset IDs, resource paths, the selected Java target, original source document IDs, explicit texture bindings, replacement relationships, provenance, and the active model's ID.

### Current data contract

- \`schemaVersion: 1\` – version of the **pack index** (independent of native editor document schema v3, native ZIP container v2 and Minecraft pack format 46).
- \`id\`, \`name\`, \`targetProfile: "java-1.21.4-static-block"\`, \`activeModelId\`.
- \`models[]\` – stable ID; source project ID; model resource location (\`namespace:path\`); vanilla block being visually replaced; explicit mapping from each source texture ID to a pack texture asset ID; provenance (\`editor\` or \`java-1214-import\`).
- \`textures[]\` – stable ID; source document ID and source texture ID; export resource location.

No mutable Three.js meshes, renderer state, pixel buffers, undo stacks, or open-tab recovery leases belong in the pack index. Model and texture pixels stay in versioned source documents. The active asset is an index pointer; switching it must not fork history for the same model.

## Validation rules now implemented

\`parsePackDocument\` clones known fields and refuses unknown fields instead of silently discarding data. It checks the explicit index version and profile; bounded asset counts; IDs; Minecraft-style lowercase namespaces and safe resource paths; one active model; dangling or mismatched texture bindings; unused texture assets; and collisions in generated model, blockstate, and texture file paths.

\`verifyPackSources\` separately checks that source documents exist, have the supported Java 1.21.4 static-block target, and still contain every referenced texture ID. Both operations fail without changing source content. Version, path, and reference errors must block packaging rather than silently pick a fallback.

\`indexLegacyProject\` demonstrates migration from one validated v3 editor project to one pack index. It retains the existing fixture's \`minecraft:diamond_block\` replacement and \`3dmc:block/lantern\`, \`3dmc:block/main\`, \`3dmc:block/tex_N\` resource identities. No on-disk migration has been triggered.

## Indexed Java 1.21.4 export slice

\`src/pack/javaPackBuilder.ts\` now exports \`makeIndexedJava1214Pack(index, sourceDocuments)\`. It consumes the validated resource identities without modifying the source models. It can package at most eight models into a deterministic ZIP, with an explicit 12 MB cap. Blockstates are limited to property-free \`minecraft:diamond_block\` and \`minecraft:iron_block\` replacements; the latter and any combined pack still require separate in-game verification. This is an internal API, not yet an editor UI export choice.

The writer reuses the existing geometry and UV encoding, and keeps the one-model diamond-block \`makeJava1214Pack\` ZIP **byte-identical** in tests. A collision between generated solid-material textures and declared resources blocks export. The old strict Java pack importer still only understands the legacy 3dMc diamond-block structure; it must reject alternate paths rather than pretending to preserve unsupported data.

## Persistence and format migration (next implementation boundary)

1. Define a new **native container version** before embedding the pack index into saved archives. Do not add unrecognized fields to existing v2 archives or change their existing files in place.
2. Read native containers v1/v2 and legacy JSON as before; migrate them in memory to the newer pack-aware project format, with a single indexed asset and stable default paths. Keep imported originals until a safe conversion is validated.
3. Save the new pack-aware native representation with its own manifest/version, bounded source documents and texture resources, and per-file checksums. Verify each model and reference before acknowledging a successful save.
4. Support explicit active-asset switching without bypassing the editor's canonical document and undo transaction path; do not serialize scene objects or partially committed paint gestures.
5. Keep the \`makeJava1214Pack(source)\` diamond-block ZIP byte-identical in regression tests while a separate future pack writer learns to emit arbitrary approved namespace/resource paths and multiple non-conflicting replacements.
6. Expand the strict Java import profile separately. Until its exact accepted relationships are specified and fixture-tested, do not claim that multi-asset packs or arbitrary third-party packs can be reopened as editable source.

## Important compatibility boundaries

The pack index validates resource identities and references **only**. It does not establish that any arbitrary vanilla blockstate is safe to replace or that an arbitrary version/profile is supported. Java 1.21.4 static block export remains experimental. The only existing tested replacement fixture is \`minecraft:diamond_block\`; new replacement selections require an explicit target registry, generated-file tests and a real-game check before making compatibility claims.

A resource pack changes visuals. It does not register new blocks, crafting recipes, collision, lighting, or gameplay behavior.

## Completion checkpoint

- [x] Pack-wide versioned asset and texture index, distinct from the editor document.
- [x] Stable IDs, explicit source relationships, path/collision validation.
- [x] In-memory single-model legacy indexing that preserves current resource paths.
- [x] Unit tests for valid legacy conversion and malformed, duplicate, or dangling input.
- [ ] Persisted pack-aware \`.3dmc\` source container with tested migrations.
- [ ] Reference-safe multi-asset operations, asset browser, and active editor switching.
- [x] Internal configurable model/replacement writer with a strict small target allowlist (not wired to UI or native persistence).
- [ ] Deterministic multi-asset ZIP and compatible import.

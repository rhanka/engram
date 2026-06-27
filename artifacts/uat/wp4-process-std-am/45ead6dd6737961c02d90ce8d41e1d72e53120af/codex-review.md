PASS_WITH_NOTES

- OK: `src/scene-hierarchies.ts:40-65` keeps the tree lane constrained to `reference`/`validated` and expands `SceneHierarchyOverlayArc.status` to the full requested overlay lifecycle set: `guessed`, `proposed`, `inferred`, `candidate`, `rejected`, and `superseded`.
- OK: `src/scene-hierarchies.ts:207-230` routes `reference`/`validated` arcs through the tree path and all other statuses through `overlay_arcs`; endpoint-missing arcs are counted as dangling rather than silently entering the wrong lane.
- OK: `src/scene-hierarchies.ts:177-185` and `src/scene-hierarchies.ts:316-334` preserve raw stable IDs verbatim for overlay `parent_id`/`child_id`, tree keys, and `registry_record_id`. The regression test at `tests/scene-hierarchies.test.ts:289-313` explicitly rejects dotted/dashed/colon ID remapping artifacts.
- NOTE: `src/types.ts:488-499` adds `guessed` to `OntologyStatus`, and `src/scene-hierarchies.ts:61-65` includes it in the sidecar overlay union, so the current unions are consistent. Residual type-safety risk remains because `OntologyStatus` still ends in `| string`; TypeScript cannot force `overlayStatus()` to be exhaustive if a future named lifecycle status is added. Runtime behavior is total today because `src/scene-hierarchies.ts:163-170` maps unknown non-tree statuses to `proposed`.
- NOTE: `tests/process-std-am-wp4-uat.test.ts:111-202` is not tautological for the artifact path: it compiles the PROCESS_STD fixture via `compileHierarchies()`, writes `hierarchies.json`/`hierarchy-index.json`, runs `buildStaticStudio()`, verifies emitted `scene-hierarchies.json` and `workspace-manifest.json`, and calls `handleOntologyStudioRequest()` for workspace/reconciliation/evidence URLs. The route checks at `tests/process-std-am-wp4-uat.test.ts:196-202` are smoke-level: they assert 200 responses and shared tab markup, but do not assert selected-tab state or candidate/evidence-specific body content.

Test result actually observed:

- Ran from an archived copy of commit `45ead6dd6737961c02d90ce8d41e1d72e53120af` at `/tmp/graphify-review-45ead6d`: `npm test -- --run tests/process-std-am-wp4-uat.test.ts tests/scene-hierarchies.test.ts tests/scene-hierarchies-emitter.test.ts`
- Result: 3 test files passed, 22 tests passed, 0 failed.

Explicit lifecycle/routing/id verdict:

- Reference vs proposed/other statuses are distinguishable: `reference` and `validated` remain tree-lane statuses; `proposed` and the other lifecycle overlay statuses are emitted as overlay arcs.
- Lifecycle-lane routing holds for the requested set: `guessed`, `proposed`, `inferred`, `candidate`, `rejected`, and `superseded` all route to `overlay_arcs`; `reference` and `validated` route to `nodes_by_id`.
- Stable ID preservation holds: raw hierarchy IDs are copied verbatim into sidecar keys, overlay endpoints, and `registry_record_id`; no slug/remap path is present in the reviewed diff.

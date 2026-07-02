# WP4 process-std-AM — UAT evidence / double-review record

- HEAD: `8e1a25c5cc157fdf4cf83831e1be5e17855fd8ec`
- Branch: `feat/process-std-am-wp4-uat-evidence`
- Run date (UTC): 2026-06-27
- Runner: `vitest run` (vitest v4.1.6, node v22.22.1)

This is a factual record of what was actually executed and observed. Nothing here
is asserted that was not run. The transient emit harness used to persist the
artifacts (`tests/zz-wp4-emit-artifacts.test.ts`) drove the SAME source modules
the suite asserts against and was deleted after the run; no source file was modified.

## 1. Tests executed (full output: `test-run.txt`)

Command:
```
npx vitest run --reporter=verbose \
  tests/process-std-am-wp4-uat.test.ts tests/ontology-process-std-am.test.ts \
  tests/ontology-hierarchies.test.ts tests/scene-hierarchies.test.ts \
  tests/scene-hierarchies-emitter.test.ts tests/workspace-manifest.test.ts
```

Observed result: **Test Files 6 passed (6) — Tests 76 passed (76)**, exit 0.

| Test file | tests passed |
| --- | --- |
| tests/process-std-am-wp4-uat.test.ts | 2 |
| tests/ontology-process-std-am.test.ts | 17 |
| tests/ontology-hierarchies.test.ts | 22 |
| tests/scene-hierarchies.test.ts | 13 |
| tests/scene-hierarchies-emitter.test.ts | 7 |
| tests/workspace-manifest.test.ts | 15 |
| **total** | **76** |

The two `process-std-am-wp4-uat` cases are the representative end-to-end UAT: (a) "emits
ontology + workspace hierarchy artifacts and renders workspace/reconciliation/
evidence routes", (b) "keeps Radar-compatible cited-source refs on Signal and
DesignationEvent nodes". Both passed.

## 2. Artifacts emitted (real code path)

All artifacts were produced by the production modules — `compileHierarchies` /
`buildHierarchyIndex` (`src/ontology-hierarchies.ts`), `buildStaticStudio`
(`src/studio-export.ts`) which internally calls `emitSceneHierarchies`
(`src/scene-hierarchies-emitter.ts` → pure builder `src/scene-hierarchies.ts`) and
`emitWorkspaceManifest` (`src/workspace-manifest-emitter.ts`), fed from the
checked-in fixture `tests/fixtures/process-std-am/` (profile `graphify/ontology-profile.yaml`,
registry `references/forest.csv`). No artifact was hand-edited.

- `hierarchies.json`, `hierarchy-index.json` — compiled ontology hierarchy + index.
- `scene-hierarchies.json` — `graphify_scene_hierarchies_v1` studio sidecar.
- `workspace-manifest.json` — `graphify_workspace_manifest_v1` bundle descriptor.
- `reconciliation-candidates.json` — candidate set as the studio reads it.
- `scene-and-sidecars.json` — consolidated bundle (scene + sidecars).
- `reconciliation-lifecycle-output.json` — lifecycle states on hierarchy edges.

## 3. Verifications actually performed against the emitted bytes

- **Ontology output fidelity.** The emitted `hierarchies.json` (9 arcs) and
  `hierarchy-index.json` are **byte-identical** to the checked-in expected fixtures
  `tests/fixtures/process-std-am/expected/forest-hierarchies.json` and
  `expected/forest-hierarchy-index.json` (compared via `JSON.stringify` equality →
  `true`). Index: roots `["AM01","AM03","AM06","AM08","MISSING_PARENT"]`, depth 4,
  cycles `[]`.

- **Hierarchy exported into studio scene + sidecars.** `buildStaticStudio` wrote
  `scene-hierarchies.json` next to `scene.json`; `result.sceneHierarchiesPath`
  pointed at it and `result.reconciliationCount === 1` (asserted green in the UAT).
  The sidecar's deep branch is intact:
  `nodes_by_id["AM0104.01.10.02"] = { parent_id: "AM0104.01.10", level: 4,
  registry_record_id: "AM0104.01.10.02", status: "reference" }`.

- **Manifest discoverability.** `workspace-manifest.json` lists `present_count: 5`
  with `scene-hierarchies` present, `schema: graphify_scene_hierarchies_v1`,
  `role: hierarchy`, plus `scene`, `graph`, `entities`,
  `reconciliation-candidates` (each with sha256 + size_bytes).

- **Stable-ID preservation across reconciliation (D2).** Scene nodes use slugged
  native ids but carry the **raw** registry id verbatim as `registry_record_id`:
  `registry_processes_AM0104_01 → AM0104.01`. The sidecar keys are those raw ids
  **verbatim** — `AM01, AM0104, AM0104.01, AM0104.01.10, AM0104.01.10.02` (dots
  preserved, no `.`/`-`→`_` transform). The reconciliation candidate
  (`candidate_id: registry_processes_AM0104_01`, `canonical_id:
  registry_processes_AM0104`, `status: candidate`) joins back to the same raw ids,
  i.e. the ids survive both sides of the join unchanged.

- **Reference vs proposed / lifecycle layers distinct.** `reconciliation-lifecycle-output.json`
  was produced by feeding `buildSceneHierarchySidecar` (the real lane-splitting
  builder) a set of arcs over the real PROCESS_STD stable ids carrying every lifecycle
  status. The builder routed them deterministically:
  - tree (authoritative) lane — `reference` (`AM01→AM0104`) and `validated`
    (`AM0104→AM0104.01`);
  - overlay lane — `candidate`, `proposed`, `inferred`, `guessed`, `rejected`,
    `superseded` (6 edges). `lifecycle_states_present` =
    `["candidate","guessed","inferred","proposed","reference","rejected","superseded","validated"]`.
  The reference arcs are the profile-compiled fixture arcs verbatim; the
  non-reference arcs are clones of real fixture (parent,child) pairs with status
  overridden, used only to exercise the lanes the v1 profile pipeline does not
  itself emit (it only emits `status:"reference"`). The lane routing / levels /
  conflicts are computed by the builder, not hand-written.

## 4. Honest limitations

- The non-`reference` lifecycle arcs in `reconciliation-lifecycle-output.json` are
  synthetic annotations layered on real stable ids: v1's profile pipeline emits
  only `reference` arcs, so candidate/validated/etc. cannot arise from the fixture
  registry alone. What is demonstrated end-to-end is that the production builder
  classifies each declared status into the correct lane while preserving ids — not
  that the v1 pipeline generates non-reference statuses on its own.
- The studio route rendering (workspace/reconciliation/evidence tabs) is asserted
  inside the passing UAT test via `handleOntologyStudioRequest` returning HTTP 200
  with the three `data-tab` markers; it is not separately re-captured as an HTML
  artifact here.

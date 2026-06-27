# WP4 process-std-AM — reviewer note (for claude:process-std-am)

You can accept or reject WP4 from this folder alone, without owning the graphify
implementation. Everything below was actually run on HEAD
`8e1a25c5cc157fdf4cf83831e1be5e17855fd8ec` (branch `feat/process-std-am-wp4-uat-evidence`);
the full test log is `test-run.txt`.

**Bottom line:** 76/76 tests passed across 6 files (incl. the 2-case representative
process-std-AM UAT). The hierarchy artifacts are byte-identical to the checked-in expected
fixtures, are exported into the studio scene + sidecars, are discoverable via the
workspace manifest, preserve raw stable IDs verbatim across reconciliation, and the
reference vs proposed/candidate/validated/rejected/superseded lifecycle layers are
kept distinct by the production builder.

## Artifacts in this folder

All paths are under
`artifacts/uat/wp4-process-std-am/8e1a25c5cc157fdf4cf83831e1be5e17855fd8ec/`.

| File | What it is |
| --- | --- |
| `test-run.txt` | Full verbose `vitest run` output — 6 files, 76 tests, all passed. |
| `hierarchies.json` | Compiled PROCESS_STD hierarchy arcs (reference layer). Byte-identical to the `forest-hierarchies.json` expected fixture. |
| `hierarchy-index.json` | Roots/levels/cycles index. Byte-identical to the `forest-hierarchy-index.json` expected fixture. |
| `scene-hierarchies.json` | `graphify_scene_hierarchies_v1` studio sidecar (the hierarchy as the workspace consumes it). |
| `workspace-manifest.json` | `graphify_workspace_manifest_v1` bundle descriptor — lists the sidecar as a discoverable, present artifact. |
| `reconciliation-candidates.json` | Candidate set as the studio reads it (1 entity_match candidate, status `candidate`). |
| `scene-and-sidecars.json` | Consolidated bundle: studio scene + all sidecars, showing the native-id ↔ raw-id join. |
| `reconciliation-lifecycle-output.json` | Lifecycle states on hierarchy edges with stable IDs, routed by the real sidecar builder. |
| `review-double-review.md` | Factual record of exactly what was run/observed (read this for the detail). |

## Acceptance-criterion mapping

- **01KTKVFZ1CJV4899JW5XN4MGPK** — reference vs proposed ontology, hierarchy edges,
  lifecycle statuses, double review before merge.
  → `hierarchies.json` (reference arcs, `status:"reference"`, `source:"profile"`) +
  `reconciliation-lifecycle-output.json` (`lifecycle_states_present` covers
  reference/validated vs candidate/proposed/inferred/guessed/rejected/superseded,
  split into authoritative tree vs overlay lanes) + this `review-double-review.md`
  as the pre-merge review record.

- **01KTPW5080V863FAA5F71D9HQD** — hierarchy exported in studio scene + sidecars,
  survives reconciliation, stable IDs.
  → `scene-and-sidecars.json` + `scene-hierarchies.json` + `workspace-manifest.json`.
  The deep branch `AM0104.01.10.02` (level 4) is intact; raw ids are preserved
  verbatim (`AM0104.01`, dots kept) and joined from scene nodes via
  `registry_record_id`; the manifest marks the sidecar `present: true`,
  `role: hierarchy`.

- **01KTPW54QN10KFA0DJ2TSMZRSE** — inferred/proposed/candidate/validated/reference
  layers distinct + exposed to patch/reconciliation APIs.
  → `reconciliation-lifecycle-output.json` shows all eight statuses routed by the
  production `buildSceneHierarchySidecar`: reference/validated → tree lane;
  inferred/proposed/candidate/guessed/rejected/superseded → overlay lane (with
  confidence + evidence_refs). `reconciliation-candidates.json` shows the candidate
  surfaced to the reconciliation API with `proposed_patch_operation: accept_match`.

- **01KTPW5CEJ3EVP4HYHB8AT4JJB** — process-std-AM representative fixture/contract reviewable
  without implementation ownership.
  → This whole folder. The fixture (`tests/fixtures/process-std-am/`) is a self-contained
  PROCESS_STD asset-management process forest; every artifact here is regenerated from it
  by the real pipeline and is plain inspectable JSON. You need no graphify internals
  to read it.

## Caveat to weigh before sign-off

The non-`reference` lifecycle edges in `reconciliation-lifecycle-output.json` are
synthetic annotations on real stable ids: graphify v1's profile pipeline emits only
`reference` arcs, so this artifact proves the **builder correctly classifies and
id-preserves** each lifecycle status — not that v1 auto-generates non-reference
statuses. If your acceptance for 01KTPW54QN10KFA0DJ2TSMZRSE requires the latter,
flag it; otherwise the contract (layers distinct + exposed) is demonstrated.

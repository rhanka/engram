# SPEC_EVOL_TARGET_CONFIGURATION_QA

## Status

- Product: Graphify TypeScript port
- Scope: persisted target configuration, resolved run manifest, deterministic QA gate, and publication preflight
- Ladder: EVOL validated for planning
- Trigger: public mystery studio handover regression, 2026-06-17
- Validation requirement: two independent 5.5 xhigh reviews before implementation planning
- Validation status: PASS after remediation
- Implementation status: not started

## Validation Log

- Manifest/exhaustive-citation review, 5.5 xhigh: first pass BLOCK because the
  manifest proof was presence-based. Remediated with a structured citation
  extraction contract, canonical contract hash allowlist, and extraction-unit
  coverage. Second pass PASS.
- QA/publication review, 5.5 xhigh: first pass BLOCK because partial sidecars,
  scratch provenance, QA report binding, truncated reconciliation responses, and
  chrome self-compare were under-specified. Remediated with full sidecar
  coverage, artifact provenance, report hash binding, complete reconciliation
  requirements, and non-self chrome references. Second pass BLOCK only on
  precomputed report binding for data-only chrome. Remediated with data allowlist
  and chrome/non-data tree hashes. Final pass PASS.

## Incident Summary

The public mystery studio handover served a scratch Opus comparison graph as a
candidate publication bundle. The bundle kept the live SPA chrome but replaced
the data with artifacts that did not satisfy the previously validated UAT
contract:

- `character_sherlock_holmes.citation_count`: expected at least the UAT value
  `89`; served Opus bundle had `16`.
- inline Sherlock citations: served bundle had `8` because the effective
  citation policy resolved to `inlineTopK=8`.
- reconciliation candidates: expected the UAT broad-ranked set around `31`;
  served Opus bundle had `0`.
- descriptions: UAT bundle had full coverage; served Opus bundle had a missing
  description.
- the source directory was documented as scratch/no-publish, but no QA gate
  blocked serving it.

The earlier Claude handover requirement was not ambiguous: for the mystery
target the intended behavior is ALL extracted citations, with a lean inline
preview and the full list served lazily. `inlineTopK=8` is only a display
projection. A publishable target must therefore prove both:

- the producing extraction/assembly run used the exhaustive citation contract;
- the final bundle exposes the full citation set through `ontology/citations.json`
  or another explicitly configured full store.

This is not only a bad artifact choice. It exposes a product gap: once a target
configuration is decided, Graphify does not persist that decision as an
auditable target, does not stamp the resolved policy into a run manifest, and
does not run deterministic QA against the final bundle.

## Root Cause

### Citation policy root cause

`SPEC_CITATIONS` introduced a resolved policy with `inlineTopK=8` defaults for
mixed, long-document, and entity-corpus builds. The implementation matches that
spec:

- `src/citation-policy.ts` sets the global default to `{ describeCap: 10,
  inlineTopK: 8 }`.
- long-document and entity-corpus defaults also set `inlineTopK: 8`.
- `resolveCitationPolicyForRoot()` reads `.graphify_detect.json` and CLI flags,
  then calls `resolveCitationPolicy()` with no project config tier.
- the code comment explicitly says the config tier is inert in v1: the
  `citations:` YAML block is not wired into the code-mode CLI.
- the public mystery pack `graphify.yaml` declares `dataprep.citation_minimum:
  section`, but no target citation surface such as full display via sidecar or
  a project-specific top-K.

On the public pack, the effective policy is therefore:

```json
{ "describeCap": "all", "inlineTopK": 8 }
```

This is not inherently wrong: `inlineTopK=8` is the bounded Level-1 preview from
`SPEC_CITATIONS`. It becomes wrong only when a publication target requires full
display but the run has no full sidecar and no proof that extraction captured
all citations.

The Opus reindex prompt lost the binding extraction contract. Its batch
instructions required only "at least one `citations[]` entry" per entity, not
ALL extracted citations, no `citation_count`, no `ontology/citations.json`, and
no sidecar consistency check. The served graph had 8 inline Sherlock citations
because of top-K display, but the more serious failure was upstream: the raw
Opus graph had only 16 Sherlock citations available before trimming.

### Reconciliation root cause

The multimodel Opus harness is a scratch comparison lane. Its own README says
`NO publish, NO live push`. Its `assemble.mjs` merges extraction batches,
applies assembly hygiene, clusters, and writes `graph-<model>.json`. It does
not generate `reconciliation-candidates.json`. The staged studio switch
therefore had `{"total":0,"items":[]}` from the first served artifact, not from
a UI rendering failure.

### Publication root cause

The last-mile operation copied live chrome and overlaid data files, which is the
right shape for a data-only republish, but it had no formal data contract. A
bundle could be served if files existed, even when it violated the intended UAT
metrics.

## Goals

- Persist target configuration in project-owned files so decisions survive the
  session that made them.
- Stamp every producing run with the resolved target and resolved policy so
  actual outputs can be compared with what was intended.
- Provide a deterministic `graphify qa` command that evaluates the final bundle,
  not only the intermediate `.graphify/graph.json`.
- Make QA generic and project-configured; no Sherlock or mystery constants in
  Graphify core.
- Make publication/export commands able to fail closed when the target says QA
  is blocking.
- Keep the QA engine offline: no LLM, no network, no hidden sampling.

## Non-Goals

- Do not decide global Graphify citation defaults in this spec. The target layer
  can override them per project/publication.
- Do not add mention-level citation extraction. QA can detect an insufficient
  count but cannot invent missing citations.
- Do not hardcode mystery pack UAT thresholds in Graphify core.
- Do not require every local experimental graph to pass publication QA. Blocking
  applies only when a target is selected or a publication command opts into it.
- Do not require semantic community labels unless the target config asks for
  them.

## Proposed Target Config

Add a `quality.targets` block to `graphify.yaml` / `.graphify/config.yaml`.
Each target is a named contract for a publishable surface.

```yaml
quality:
  targets:
    mystery_public_studio:
      kind: studio-static-bundle
      bundle_path: .graphify/studio
      baseline_bundle_path: .graphify/baselines/public-studio-0.14.1
      publication:
        blocking: true
        require_resolved_manifest: true
        data_only_chrome: true
        chrome_reference_path: .graphify/baselines/public-studio-0.14.1
        deny_source_path_patterns:
          - ".graphify/scratch/**"
        data_allowlist:
          - graph.json
          - scene.json
          - entities.json
          - reconciliation-candidates.json
          - workspace-manifest.json
          - ontology/citations.json
      citations:
        extraction:
          mode: all_extracted   # all_extracted | bounded_sample | unknown
          require_producer_proof: true
          contract_id: graphify_all_extracted_entity_citations_v1
          allowed_contract_hashes:
            - "sha256:..."
          require_batch_coverage: true
        display: full           # full | inline
        inline:
          mode: top_k           # full | top_k
          top_k: 8              # required when mode=top_k
        require_sidecar: true   # full display is served from ontology/citations.json
        min_count_by_node:
          character_sherlock_holmes: 89
        no_shrink_by_node:
          character_sherlock_holmes:
            baseline_field: citation_count
            max_drop: 0
      graph:
        min_nodes: 2091
        min_edges: 3168
        shrink_guard:
          nodes:
            max_drop: 0
          edges:
            max_drop: 0
        max_missing_descriptions: 0
        max_orphan_nodes: 0     # target-specific, not a global Graphify default
      reconciliation:
        min_candidates: 31
        shrink_guard:
          candidates:
            max_drop: 0
        require_groupable_by_type: true
      communities:
        require_semantic_labels: false
```

Rules:

- Target config is source-controlled project data, not a transient CLI choice.
- `citations.extraction.mode: all_extracted` means the producer must declare
  and manifest that it asked for all extracted citations per entity and that the
  assembly path unions same-entity citations instead of retaining a sample. QA
  cannot infer this from an 8-item inline preview.
- `citations.extraction.contract_id` and `allowed_contract_hashes` identify a
  structured citation extraction contract, not arbitrary prompt text. For
  blocking publication targets, QA must validate either a built-in canonical
  contract by ID/hash or a manifest-embedded contract whose canonical JSON hash
  is allowlisted by the target.
- `require_batch_coverage: true` means every contributing extraction unit,
  batch, or imported graph fragment must declare the same validated citation
  contract. A single legacy/unknown/bounded batch fails the publication target.
- `citations.display: full` means the published user-facing surface must have
  the full citation set. The preferred storage is `inline.mode: top_k` plus
  `require_sidecar: true`; `inline.mode: full` exists only for small/special
  bundles that explicitly accept the eager payload cost.
- `citations.inline.mode: top_k` means `node.citations.length <= top_k` and
  `citation_count` / sidecar must carry the true count.
- `require_groupable_by_type` is evaluated by resolving candidate endpoint IDs
  against `graph.json` and reading `node_type` / `type`.
- Baseline comparisons are optional for local QA but mandatory when any
  `shrink_guard` or `no_shrink_by_node` rule is configured. Those rules are
  blocking errors, not informational deltas.
- `chrome_reference_path` must not resolve to the same directory as the bundle
  being validated when `data_only_chrome` is true; otherwise the chrome hash
  comparison is self-referential and fails closed.

## Config Resolution

- Config discovery follows the existing project config search order:
  `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`,
  `.graphify/config.yml`.
- Relative paths in a target resolve from the config file directory.
- `--target <id>` selects `quality.targets.<id>`.
- `--bundle <path>` overrides the target `bundle_path` only for the QA input
  under evaluation; it does not mutate the target or the resolved manifest.
- If `publication.blocking: true`, `graphify qa --target <id>` exits non-zero
  on any error even without `--fail-on-error`; `--fail-on-error` exists for
  advisory targets and CI scripts that want strictness.
- A QA-only target may omit producer fields, but a publication target may not.
- `graphify qa` must not require the full normalized project config when the
  file is used only as a target contract. The current project config loader
  requires `profile.path` and `inputs.corpus`; QA therefore uses a tolerant
  target loader that parses and validates only `quality.targets`. Producer
  commands that also need corpus/profile settings still use the full existing
  loader.

## Structured Citation Extraction Contract

The manifest cannot merely carry a free-form prompt hash. A hash proves bytes,
not semantics. For publication QA, the cited producer contract must be
structured and canonicalized:

```json
{
  "schema": "graphify_citation_extraction_contract_v1",
  "id": "graphify_all_extracted_entity_citations_v1",
  "mode": "all_extracted",
  "requirements": {
    "emit_all_extracted_citations_per_entity": true,
    "bounded_samples_allowed": false,
    "minimum_one_citation_only_allowed": false,
    "same_entity_merge": "union_by_citation_identity",
    "inline_projection_is_not_storage": true,
    "full_store_required_when_display_full": true
  },
  "citation_identity": ["source_file", "page", "section", "paragraph_id"]
}
```

QA computes the sha256 over canonical JSON: sorted object keys, no insignificant
whitespace, stable array order. A blocking target that sets
`require_producer_proof: true` passes only when:

- the manifest embeds this structured contract or references a Graphify built-in
  contract ID known to the installed version;
- the computed contract hash is present in
  `citations.extraction.allowed_contract_hashes`;
- the embedded/reference contract's `mode` matches the target mode;
- every extraction unit listed in the manifest has the same validated contract
  hash when `require_batch_coverage` is true.

If a run imports external fragments and cannot prove every fragment's contract,
the fragment contract is `unknown` and a blocking publication target fails. This
is deliberate: scratch comparison graphs remain usable for analysis, but they
cannot be served as a target publication without provenance.

## Resolved Run Manifest

Every target-selected command that writes a publication-targetable bundle must
emit a manifest next to the output or under
`.graphify/runs/<run-id>/resolved-target.json`. Non-target scratch commands may
omit it, but then they cannot pass a blocking publication target.

```json
{
  "schema": "graphify_resolved_target_v1",
  "target_id": "mystery_public_studio",
  "target_hash": "sha256:...",
  "graphify_version": "0.14.x",
  "producer": {
    "command": "graphify studio bundle",
    "cwd": "/path/to/project",
    "git_head": "..."
  },
  "artifacts": {
    "graph.json": {
      "bundle_path": "graph.json",
      "source_path": ".graphify/runs/2026-06-17/graph.json",
      "source_kind": "generated",
      "sha256": "sha256:..."
    },
    "scene.json": {
      "bundle_path": "scene.json",
      "source_path": ".graphify/runs/2026-06-17/scene.json",
      "source_kind": "generated",
      "sha256": "sha256:..."
    },
    "reconciliation-candidates.json": {
      "bundle_path": "reconciliation-candidates.json",
      "source_path": ".graphify/runs/2026-06-17/reconciliation-candidates.json",
      "source_kind": "generated",
      "sha256": "sha256:..."
    },
    "ontology/citations.json": {
      "bundle_path": "ontology/citations.json",
      "source_path": ".graphify/runs/2026-06-17/ontology/citations.json",
      "source_kind": "generated",
      "sha256": "sha256:..."
    }
  },
  "resolved_policy": {
    "corpus_type": "long-document",
    "citations": {
      "extraction": {
        "mode": "all_extracted",
        "contract_id": "graphify_all_extracted_entity_citations_v1",
        "contract_hash": "sha256:...",
        "contract": {
          "schema": "graphify_citation_extraction_contract_v1",
          "id": "graphify_all_extracted_entity_citations_v1",
          "mode": "all_extracted"
        },
        "assembly": {
          "same_entity_merge": "union_by_citation_identity",
          "dedupe_key": ["source_file", "page", "section", "paragraph_id"]
        }
      },
      "describeCap": "all",
      "display": "full",
      "inline": { "mode": "top_k", "topK": 8 },
      "sidecar": { "required": true }
    }
  },
  "inputs": {
    "config_path": "graphify.yaml",
    "graph_path": ".graphify/graph.json",
    "bundle_path": ".graphify/studio"
  },
  "extraction_units": [
    {
      "id": "batch-000",
      "source_path": ".graphify/extraction/batch-000.json",
      "contract_id": "graphify_all_extracted_entity_citations_v1",
      "contract_hash": "sha256:...",
      "citation_mode": "all_extracted"
    }
  ]
}
```

The `contract` object above is abbreviated for readability; a real embedded
contract must contain the full canonical contract fields from
`## Structured Citation Extraction Contract`, or reference a built-in contract
ID/hash known to Graphify.

The manifest is evidence, not the source of truth. QA verifies that the manifest
matches the project target and that the final bundle matches the manifest. For a
blocking publication target, the manifest is mandatory and these are errors:

- missing manifest
- `target_hash` not matching the current target config
- `resolved_policy.citations.extraction.mode` missing, `unknown`, or not equal
  to the target's `all_extracted` requirement
- missing producer proof, such as the structured extraction contract,
  contract hash, or assembly merge mode, when `require_producer_proof` is true
- contract hash not present in the target's `allowed_contract_hashes`
- embedded contract hash mismatch after canonicalization
- extraction unit missing when `require_batch_coverage` is true
- any extraction unit with `citation_mode` other than `all_extracted`, with an
  unknown contract, or with a contract hash not allowlisted by the target
- missing artifact provenance (`bundle_path`, `source_path`, `source_kind`,
  `sha256`) for a required publication artifact
- source path matching `publication.deny_source_path_patterns`
- artifact hash mismatch
- stale or mismatched precomputed QA report for the bundle being served, copied,
  or pushed. A standalone `graphify qa` run produces the report and does not
  require one to exist beforehand.

The manifest must not claim exhaustive citations merely because
`inlineTopK=8` was applied. Bounded inline projection and exhaustive extraction
are separate facts and are validated separately.

## QA Command

Add:

```bash
graphify qa --target mystery_public_studio --bundle .graphify/studio
graphify qa --target mystery_public_studio --bundle .graphify/studio --write-report
graphify qa --target mystery_public_studio --bundle .graphify/studio --fail-on-error
```

Output:

```json
{
  "schema": "graphify_qa_report_v1",
  "target_id": "mystery_public_studio",
  "target_hash": "sha256:...",
  "manifest_hash": "sha256:...",
  "bundle_path": ".graphify/studio",
  "artifact_hashes": {
    "graph.json": "sha256:...",
    "scene.json": "sha256:...",
    "reconciliation-candidates.json": "sha256:...",
    "ontology/citations.json": "sha256:..."
  },
  "chrome": {
    "data_only": true,
    "data_allowlist_hash": "sha256:...",
    "bundle_non_data_tree_hash": "sha256:...",
    "chrome_reference_path": ".graphify/baselines/public-studio-0.14.1",
    "chrome_reference_tree_hash": "sha256:..."
  },
  "status": "failed",
  "summary": { "passed": 7, "failed": 2, "warned": 1 },
  "checks": [
    {
      "id": "citations.min_count_by_node.character_sherlock_holmes",
      "severity": "error",
      "expected": ">= 89",
      "actual": 16
    },
    {
      "id": "reconciliation.min_candidates",
      "severity": "error",
      "expected": ">= 31",
      "actual": 0
    }
  ]
}
```

The QA reader loads the final bundle layout:

- `graph.json`
- `scene.json`
- `entities.json`
- `reconciliation-candidates.json`
- optional `ontology/citations.json`
- optional `workspace-manifest.json`
- optional resolved target manifest

The QA report is bound to the exact evaluation inputs: target hash, manifest
hash, artifact hashes, bundle path, and, for `data_only_chrome`, the data
allowlist hash plus both non-data tree hashes (`bundle_non_data_tree_hash` and
`chrome_reference_tree_hash`). A publication command may either run QA
in-process against the staged bundle or consume a precomputed report only if all
hashes match the final staged bytes and the current chrome reference bytes. A
changed artifact or changed chrome/reference tree invalidates the report.

Accepted reconciliation file shapes:

- response shape:
  `graphify_ontology_reconciliation_candidates_response_v1`, counted from a
  complete response only;
- queue shape:
  `graphify_ontology_reconciliation_candidates_v1`, counted from
  `candidate_count` and `candidates[]`.

The endpoint IDs used for type grouping are `candidate_id` and `canonical_id`.
If a queue uses nested records in the future, the parser must normalize them
into the same pair shape before checks run.

For publication QA, reconciliation checks must run over a complete candidate
array. A response-shape file is acceptable only when it proves `offset=0`,
`items.length === total`, and any graph hash/staleness fields match the current
`graph.json`. Otherwise QA treats the candidate count as unverifiable and fails
closed. Queue shape is preferred for publication because it is already the full
candidate set.

## Check Families

### Policy checks

- target exists and validates
- resolved run manifest exists when the target requires it
- resolved citation policy matches the target
- structured citation extraction contract validates against target mode and
  allowed hashes when producer proof is required
- all extraction units validate against the same allowed contract when batch
  coverage is required
- required artifact provenance fields exist and source paths do not match denied
  patterns
- data-only publication keeps every non-data file byte-identical to the
  `chrome_reference_path` when requested
- data allowlist is honored; any changed file outside it is an error for
  `data_only_chrome`
- source provenance is allowed by the target; scratch/no-publish sources are
  rejected when denied

### Graph checks

- node/edge counts meet thresholds
- no unexpected shrink versus baseline when configured; `max_drop: 0` is an
  exact no-shrink guard
- missing descriptions are within target limit
- orphan nodes are within target limit
- checked nodes exist by stable ID

### Citation checks

- producer manifest proves the configured extraction mode when required
- per-node `citation_count` meets configured minimums
- inline citation surface matches `full` or `top_k`
- sidecar presence and count consistency match target
- `citation_count` is never less than `citations.length`
- `display: full` fails unless the full list is available either through the
  sidecar or, explicitly, through full inline storage
- when `display: full` and `require_sidecar` are true, the sidecar schema must
  validate, its `graph_signature` / graph hash must match the current graph, and
  every graph node with `citation_count > 0` must have a sidecar entry whose
  `count` and `citations.length` match `graph.json` `citation_count`
- configured `min_count_by_node` / `no_shrink_by_node` nodes are checked
  explicitly even if they carry zero or missing citation counts, so a missing
  sentinel cannot pass by absence
- node-level no-shrink rules compare the configured field against the baseline

### Reconciliation checks

- candidate count meets target minimum
- candidate endpoint IDs resolve in `graph.json`
- candidates are groupable by type when requested
- candidate schema is one of the accepted response/queue schemas
- publication QA rejects paginated/truncated candidate responses whose full item
  array cannot be verified
- stale/hash fields, when present, must not contradict the current graph

### Community checks

- if semantic labels are required, generic `Community N` labels fail
- if semantic labels are not required, generic labels are only informational

## Publication Integration

Publication-like commands must take a target and run QA on the final staged
bundle before serving, copying, or pushing it.

```bash
graphify studio bundle --target mystery_public_studio --out .graphify/studio-next
graphify qa --target mystery_public_studio --bundle .graphify/studio-next --fail-on-error
```

If `quality.targets.<id>.publication.blocking` is true, the publication command
fails closed on QA errors and refuses to operate without:

- selected target
- resolved target manifest
- QA executed in-process on the staged bundle, or a precomputed QA report whose
  target hash, manifest hash, artifact hashes, and `data_only_chrome` tree
  hashes match the final staged bytes and current chrome reference bytes
- no provenance denial such as `.graphify/scratch/**`

Experimental scratch commands may still run without a target, but they must not
serve, copy, or push a bundle through a publication command.

## Decisions

### D1 - Target config location

Recommendation: store target contracts in project config under
`quality.targets`. This keeps the decision source-controlled and reviewable.
Generated `.graphify/runs/*/resolved-target.json` files are evidence only.

Alternative: store targets only under `.graphify/targets/*.json`. That is
easier for generated state but weaker for review because `.graphify` may be
ignored or overwritten.

### D2 - Citation inline surface

Recommendation: target config separates user-facing citation display from
storage. Graphify defaults may remain bounded, but a publication target can
require full display via `ontology/citations.json` and still keep
`graph.json` lean with `inline.mode: top_k`. `inline.mode: full` remains
available only as an explicit small-bundle choice.

This addresses the incident directly: a decided target would have rejected an
effective `inlineTopK=8` run if no full sidecar/display surface existed, and it
would have rejected the Opus graph for shrinking Sherlock's `citation_count`
from the baseline.

It also rejects a graph whose producer prompt only asked for "at least one"
citation per entity, even if the resulting graph happens to satisfy an inline
top-K shape. The target's extraction requirement is part of the manifest
contract, not a UI convention.

### D3 - QA blocking semantics

Recommendation: `graphify qa` is advisory for non-publication targets, blocking
with `--fail-on-error`, and always blocking for targets whose
`publication.blocking` is true. This keeps experiments cheap while making
publish flows safe.

### D4 - Domain thresholds

Recommendation: thresholds live in the project target, not in Graphify code.
Graphify provides generic predicates; the mystery pack supplies values like
`character_sherlock_holmes >= 89` and `reconciliation >= 31`.

### D5 - Evaluation surface

Recommendation: QA reads the final bundle path. Intermediate graph state can be
checked too, but it is not sufficient for publication because the incident was
created by a last-mile bundle overlay.

### D6 - Baseline shrink semantics

Recommendation: baseline deltas are informational by default, but become
blocking when a target config declares `shrink_guard` or `no_shrink_by_node`.
This prevents a future graph from barely clearing an absolute minimum while
silently regressing from the last accepted bundle.

### D7 - QA config loader

Recommendation: implement a target-only config parser for `graphify qa` and keep
the existing strict project config loader for producer commands. This allows a
repo to commit a minimal QA target without also declaring an ontology profile or
corpus, while still letting full project builds validate their richer config.

### D8 - Citation policy model boundary

Recommendation: do not overload the existing `ResolvedCitationPolicy`
(`describeCap`, numeric `inlineTopK`) with the target's display contract. Add a
separate normalized target citation policy:

```ts
type TargetCitationDisplay = "inline" | "full";
type TargetCitationInline = { mode: "top_k"; topK: number } | { mode: "full" };
type TargetCitationExtraction = "all_extracted" | "bounded_sample" | "unknown";
```

Producer commands still resolve the implementation policy (`describeCap`,
`inlineTopK`). QA compares the resolved implementation policy plus final bundle
artifacts against the target display contract.

### D9 - Producer proof for exhaustive citations

Recommendation: publication targets may require producer proof. For citations,
that proof is a structured citation extraction contract whose canonical hash is
allowlisted by the target, plus the assembly merge mode that preserved it. The
final bundle still carries the measured counts; the producer proof explains
whether those counts came from the intended exhaustive process or from a bounded
sample. This is what would have rejected the scratch Opus reindex prompt before
serving.

### D10 - Artifact provenance and QA report binding

Recommendation: manifest artifacts are structured records, not bare hashes.
Each required publication artifact records `bundle_path`, `source_path`,
`source_kind`, and `sha256`. QA reports are bound to the exact target hash,
manifest hash, artifact hashes, and, for data-only chrome publications, the
data allowlist hash plus both non-data tree hashes. Publication commands either
run QA in-process or verify that the precomputed report still matches the final
staged bytes and current chrome reference bytes.

### D11 - Full sidecar means full sidecar

Recommendation: when a target says `display: full` and `require_sidecar: true`,
QA validates the sidecar for every citation-bearing node, not only sentinel
nodes. Sentinel thresholds such as Sherlock are additional UAT checks; they are
not a substitute for full-store coverage.

## Implementation Notes

- Extend `GraphifyProjectConfig` / `NormalizedProjectConfig` with
  `quality.targets`.
- Add a target-only loader so `graphify qa` can read `quality.targets` without
  requiring `profile.path` / `inputs.corpus`.
- Wire target-selected citation knobs into `resolveCitationPolicyForRoot` only
  for implementation fields that already exist (`describeCap`, numeric
  `inlineTopK`); keep display/full-sidecar semantics in the target QA layer.
- Add pure parsers and evaluators under a new `src/quality-target.ts` /
  `src/qa.ts` split.
- Add a canonical JSON hashing helper for structured citation extraction
  contracts; do not hash raw prompt text as the only proof.
- Extend target manifests so artifacts are structured provenance records.
- Bind QA reports to target, manifest, and artifact hashes.
- Add CLI command `graphify qa`.
- Keep QA report writing deterministic and sorted.
- Add fixture tests for:
  - target config validation
  - producer manifest rejection when target requires `all_extracted` but the
    manifest says `bounded_sample`, `unknown`, or omits extraction proof
  - contract hash rejection when the embedded structured contract hash is not in
    `allowed_contract_hashes`
  - extraction-unit coverage rejection when one batch/fragment is unknown or
    bounded
  - effective policy/display mismatch (`inlineTopK=8` with no full sidecar when
    target says full display)
  - sidecar count mismatch (`graph.json.citation_count` differs from
    `ontology/citations.json.nodes[id].count` or `citations.length`)
  - stale/mismatched citation sidecar graph signature
  - missing sidecar entries for non-sentinel citation-bearing nodes
  - Sherlock-like min-count check using synthetic IDs
  - reconciliation total check
  - truncated/paginated reconciliation response rejection
  - groupable-by-type check
  - artifact provenance rejection for denied `.graphify/scratch/**` sources
  - stale QA report rejection after an artifact hash changes
  - stale QA report rejection after the chrome reference tree or staged
    non-data tree changes under `data_only_chrome`
  - `data_only_chrome` rejection when `chrome_reference_path` self-compares with
    the staged bundle
  - data-only chrome hash check

## Acceptance Criteria

- A project can commit a target config that records citation, graph,
  reconciliation, community, and publication expectations.
- A publication target can require `citations.extraction.mode: all_extracted`;
  QA fails if the resolved manifest cannot prove that contract.
- QA validates exhaustive citation proof by structured contract hash allowlist,
  not by accepting any manifest field named `all_extracted`.
- Running a build with the wrong citation display/inline policy produces a QA
  failure.
- Running a build whose prompt/producer only requires one citation per entity
  fails the target, even if the inline citations array has exactly top-K items.
- Running QA against a bundle with a partial or stale `ontology/citations.json`
  fails when the target requires full sidecar display.
- Running QA against a bundle with zero reconciliation candidates fails when
  `min_candidates` is positive.
- Running QA against a paginated/truncated reconciliation response fails for a
  publication target even if `total` is high enough.
- Running QA against the Opus incident bundle fails for citation count and
  reconciliation count, and for provenance if it is sourced from
  `.graphify/scratch/**`.
- Running QA against the previous UAT bundle passes the configured mystery
  thresholds except any explicitly waived sidecar/community-label checks.
- A blocking publication target cannot be served/copied/pushed without a
  matching resolved manifest and passing QA run or matching precomputed QA
  report, including matching chrome tree hashes when `data_only_chrome` is
  enabled.
- A data-only republish fails if any file outside the data allowlist changes
  relative to the chrome reference bundle.
- No LLM or network call is required for QA.

# SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION

## Status

- Product: Graphify TypeScript port
- Scope: ontology lifecycle, reconciliation, patching, optional write surfaces
- Spec state: baseline accepted; patch/MCP/candidate foundations implemented; read-only candidate API contract specified; candidate query helpers, decision-log preview parser, CLI/skill preview, MCP tools and HTTP/studio shell are implemented; public-pack-derived isolated UAT is executed; write-enabled studio remains open
- State root: `.graphify/`
- Activation: explicit ontology profile workflow only
- Default behavior: unchanged and read-only

This spec complements `SPEC_ONTOLOGY_DATAPREP_PROFILES.md` and `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md`.
It defines how Graphify should support reviewable ontology changes without turning `graph.json` into the source of truth.

This spec must remain generic. It must not introduce real customer, partner, project, regulated-domain, or proprietary ontology examples.

## Problem

Graphify can already load project ontology profiles, validate profile-aware extraction, compile ontology artifacts, and expose a read-only MCP graph server.

That is not enough for serious ontology lifecycle work. Users need to:

- review ambiguous extracted mentions
- reconcile mentions to canonical entities
- accept or reject registry matches
- propose aliases and mappings
- promote candidates through review statuses
- inspect evidence before hardening facts
- persist decisions in a way that survives graph rebuilds
- keep every mutation auditable and reversible

A static viewer cannot safely do this by itself. A browser page loaded from disk cannot be the authority for project writes, and `graph.json` must not be edited directly because it is a derived artifact.

## Core Contract

Graphify ontology writes follow this flow:

```text
viewer or agent -> propose patch -> validate patch -> apply to authoritative project state -> rebuild derived graph and ontology artifacts
```

Rules:

- `.graphify/graph.json` is derived output and is never the direct write target.
- `.graphify/ontology/*.json` artifacts are derived output unless a consuming project explicitly promotes selected artifacts.
- Write targets are project-owned sources: ontology profile files, registry files, reconciliation decision logs, or reviewed patch files.
- Applying a patch must be deterministic and must not call an LLM.
- LLMs and assistants may propose patches, but deterministic validation decides whether a patch is structurally acceptable.
- Human review is required before promotion to hardened or validated status unless the project config explicitly allows deterministic auto-acceptance for a narrow rule.
- Every applied patch records author, timestamp, reason, input graph hash, profile hash, source evidence references, and before/after summary.

## Configurable Evidence And Reconciliation Policy

Ontology lifecycle behavior must be driven by project profile policy, not by hard-coded domain heuristics.

Profiles may define:

- required evidence fields, such as source reference, section reference, snippet, confidence and optional offsets
- status transition rules
- relation promotion rules
- alias merge rules
- candidate sorting rules
- auto-acceptance rules, when a project chooses to allow narrow deterministic promotion

LLMs and assistant skills may help users calibrate those rules by sampling candidates and proposing profile diffs. They must not be part of deterministic validation or patch apply.

Minimum generic behavior:

- candidate generation can attach evidence snippets and confidence/provenance handles
- validation can reject patches that do not satisfy the active profile policy
- policy changes are explicit profile patches or diffs
- no product docs, fixtures or defaults encode a project-specific ontology

Example policy categories, intentionally domain-neutral:

```yaml
evidence_policy:
  minimum:
    source_ref: required
    section_ref: recommended
    snippet: required
    confidence: required
    offsets: optional
  snippet:
    max_chars: 800

reconciliation_policy:
  status_transitions:
    candidate: [needs_review, validated, rejected]
    needs_review: [validated, rejected]
    validated: [deprecated]
    rejected: []
  acceptance_rules:
    promote_relation:
      require_source_grounding: true
      require_direct_mention: true
    merge_alias:
      require_shared_entity_context: true
      require_human_review: true
```

## Authoritative State

Graphify should distinguish generated state from authoritative state.

Generated state under `.graphify/`:

- profile state
- extraction candidates
- ontology output artifacts
- reconciliation candidates
- validation reports
- temporary patch previews
- local audit scratch

Project-owned state outside `.graphify/`:

- ontology profile YAML/JSON
- registry CSV/JSON/YAML files
- optional committed reconciliation decision logs
- optional committed reviewed patch logs
- optional project-specific mapping files

Default generated paths:

```text
.graphify/ontology/
  reconciliation/
    candidates.json
    validation.json
    pending-patches.jsonl
    applied-patches.jsonl
    rejected-patches.jsonl
```

When a project wants decisions to be versioned, Graphify should support explicit export paths such as:

```yaml
outputs:
  ontology:
    reconciliation:
      decisions_path: graphify/reconciliation/decisions.jsonl
      patches_path: graphify/reconciliation/patches.jsonl
```

Graphify must not assume those paths by default.

## Patch Model

Patch records are append-only instructions. They are not direct graph mutations.

Synthetic shape:

```json
{
  "schema": "graphify_ontology_patch_v1",
  "id": "patch-20260505-0001",
  "operation": "accept_match",
  "status": "proposed",
  "profile_hash": "sha256",
  "graph_hash": "sha256",
  "target": {
    "candidate_id": "candidate-node-id",
    "canonical_id": "canonical-node-id"
  },
  "evidence_refs": ["source-ref-id"],
  "reason": "Synthetic evidence confirms the match.",
  "author": "local-user",
  "created_at": "ISO-8601"
}
```

Required operation families:

- `accept_match`: attach a candidate mention to a canonical entity.
- `reject_match`: reject a candidate mapping.
- `create_canonical`: create a new canonical entity from reviewed evidence.
- `merge_alias`: attach an alias to a canonical entity.
- `set_status`: change review status within profile policy.
- `add_relation`: add a typed relation with evidence.
- `reject_relation`: reject a candidate relation.
- `deprecate_entity`: mark a canonical entity as deprecated.
- `supersede_entity`: link a deprecated entity to its replacement.

Patch validation checks:

- patch schema is valid
- profile hash matches the active profile unless explicitly rebased
- graph hash matches the candidate generation graph unless explicitly rebased
- operation is allowed by the active profile policy
- target nodes, relations, registry records and evidence refs exist
- relation endpoints satisfy profile constraints
- status transitions satisfy hardening rules
- no patch writes outside the configured repository path jail

## CLI Surface

Proposed deterministic commands:

```bash
graphify ontology candidates --profile-state .graphify/profile/profile-state.json --out .graphify/ontology/reconciliation/candidates.json
graphify ontology patch validate --profile-state .graphify/profile/profile-state.json --patch patch.json
graphify ontology patch apply --profile-state .graphify/profile/profile-state.json --patch patch.json --dry-run
graphify ontology patch apply --profile-state .graphify/profile/profile-state.json --patch patch.json --write
graphify ontology patch export --profile-state .graphify/profile/profile-state.json --out graphify/reconciliation/patches.jsonl
graphify ontology rebuild --config graphify.yaml
```

Rules:

- `validate` never mutates files.
- `apply --dry-run` is the default in assistant workflows.
- `apply --write` requires an explicit flag.
- Commands must warn if the Git worktree is dirty before applying patches.
- Commands must never stage, commit, or push.
- After any write, Graphify should mark derived artifacts stale or run an explicit rebuild when requested.

## MCP Write Surface

The existing `graphify serve` MCP server remains read-only by default.

Mutation tools are exposed only through an explicit write mode:

```bash
graphify ontology serve --write --config graphify.yaml
```

Proposed MCP tools:

- `list_reconciliation_candidates`
- `get_reconciliation_candidate`
- `propose_ontology_patch`
- `validate_ontology_patch`
- `apply_ontology_patch`
- `export_ontology_patches`
- `ontology_rebuild_status`

Guardrails:

- write mode is disabled by default
- write mode binds only to local stdio or localhost transports
- every apply tool supports `dry_run: true`
- non-dry-run apply requires an explicit confirmation field
- tool responses include changed files, stale artifacts, and next rebuild command
- tools must not expose secrets, absolute home paths, or ignored artifact contents

## Read-Only Reconciliation API Contract

Read-only API routes are the first browser/studio surface. They may read generated
candidate queues, authoritative decision logs, and local audit logs, but they must
not accept mutation payloads.

Minimal routes:

- `GET /api/ontology/reconciliation/candidates`
- `GET /api/ontology/reconciliation/candidates/:id`
- `GET /api/ontology/reconciliation/decision-log`
- `GET /api/ontology/rebuild-status`

`GET /api/ontology/reconciliation/candidates` accepts these query parameters:

- `status`
- `kind`
- `operation`
- `canonical_id`
- `candidate_id`
- `min_score`
- `query`
- `sort=score|id`
- `order=asc|desc`
- `limit`
- `offset`

Candidate list responses use this wrapper:

```json
{
  "schema": "graphify_ontology_reconciliation_candidates_response_v1",
  "generated_at": "ISO-8601",
  "graph_hash": "sha256",
  "profile_hash": "sha256",
  "stale": false,
  "total": 1,
  "limit": 50,
  "offset": 0,
  "items": []
}
```

Decision-log preview responses use this wrapper:

```json
{
  "schema": "graphify_ontology_reconciliation_decision_log_v1",
  "total": 1,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "source": "authoritative",
      "path": "graphify/reconciliation/decisions.jsonl",
      "recorded_at": "ISO-8601",
      "patch": {}
    }
  ]
}
```

Decision-log preview filters:

- `source=authoritative|audit|both`
- `status=applied|rejected|all`
- `operation`
- `node_id`
- `from`
- `to`
- `limit`
- `offset`

`GET /api/ontology/rebuild-status` returns `graph_hash`, `profile_hash`,
`needs_update`, `candidates_match`, and `decision_log_available`. It must not
rebuild, apply, export, or write any file.

Security rules:

- read-only routes never expose absolute local paths
- file reads stay inside configured project/reconciliation paths
- missing or stale artifacts are reported as data state, not auto-created
- write mode, localhost token, and dry-run/apply behavior belong to the later studio write surface

Current implementation slice:

- `src/ontology-reconciliation.ts` can load a generated candidate queue and return the read-only response wrapper with status/kind/operation/id/score/query filters, score/id sorting and pagination
- `src/ontology-patch.ts` can read authoritative and audit JSONL decision logs as a bounded preview without mutating project files
- decision-log preview implements source filtering, status/operation/node/from/to filters, relative path reporting, malformed-line warnings and pagination
- `src/ontology-reconciliation-api.ts` shares read-only candidate, decision-log and rebuild-status responses across MCP and HTTP
- `src/ontology-studio.ts` exposes a read-only localhost studio shell and GET-only JSON routes; write APIs and token-gated apply remain later work

## Local Studio Surface

A browser UI needs a local HTTP API. A static `graph.html` cannot write safely.

Proposed command:

```bash
graphify ontology studio --config graphify.yaml
```

Read-only studio mode:

- serves static ontology/reconciliation assets
- visualizes candidates, evidence, aliases and relation proposals
- exports patch JSON for manual application

Write-enabled studio mode:

```bash
graphify ontology studio --config graphify.yaml --write
```

Write mode:

- binds to `127.0.0.1`
- uses a random local token printed to the terminal
- writes only through the same patch core used by CLI and MCP
- defaults every apply action to preview/dry-run
- records append-only audit events
- warns when the worktree is dirty

## UI Direction

The current HTML graph viewer should not be stretched into an ontology reconciliation product.

If Graphify adds a professional reconciliation UI, it should be a separate Svelte application or package that consumes Graphify ontology artifacts and patch APIs.

Design constraints:

- use Svelte for the UI implementation
- consume `../sent-tech-design-system` once it exists
- keep a small adapter layer so Graphify can build without that design system during open-source development
- make required design tokens explicit before implementation
- avoid hardcoding domain colors, labels, icons, or taxonomy names
- keep the static-export fallback: users can still export a patch JSON without a live write server

The public-domain mystery saga corpus is the preferred real UAT for this design phase. It stays external to Graphify under `public-domaine-mystery-sagas-pack`; Graphify must not vendor the real corpus. Use it to mock concrete UI flows for character canonicalization, aliases, narrator/person splits, relations, evidence review, patch preview and audit trail. See `spec/SPEC_PUBLIC_DOMAIN_MYSTERY_UAT.md`.

Required token categories before implementation:

- typography scale and font families
- spacing scale
- radius scale
- elevation/shadow scale
- surface, border and text colors
- interactive focus and hover colors
- status colors for `candidate`, `needs_review`, `validated`, `rejected`, `superseded`
- confidence and evidence-strength colors
- graph node, edge, selection and highlight colors
- density settings for table-heavy review screens

## Design Research Phase

Before implementing the Svelte studio, run a design research pass over powerful open-source ontology or mapping tools.

The goal is not to clone their stack. The goal is to capture interaction patterns that are easy to use while still supporting ontology concepts.

Initial references to evaluate:

- WebProtege: collaborative web ontology editing, change tracking and review patterns.
- VocBench: collaborative SKOS/OWL vocabulary and ontology management.
- OpenRefine reconciliation: candidate matching, scoring, faceting, bulk accept/reject, and human-in-the-loop cleanup.
- WebVOWL: ontology visualization and graph readability patterns.
- Karma or equivalent semantic mapping tools: source-to-ontology mapping and provenance review patterns.

Research outputs:

- screen pattern inventory
- core user journeys
- component inventory
- token requirements
- accessibility risks
- scalability risks for large ontologies
- write-safety model review
- recommendation for MVP vs later features

The initial research baseline is recorded in `SPEC_ONTOLOGY_STUDIO_DESIGN_RESEARCH.md`.

## Skill Contract

Assistant skills should treat ontology lifecycle work as reviewable changes.

Rules:

- assistants may propose patches
- assistants must validate patches before suggesting application
- assistants must not apply non-dry-run patches without explicit user approval
- assistants must warn on dirty worktrees
- assistants must describe which authoritative files would change
- assistants must not edit generated `graph.json` directly
- assistants must rebuild or mark derived artifacts stale after an approved write
- assistants must keep examples synthetic and product-generic

## Tests

Future tests should cover:

- patch schema validation
- invalid profile hash rejection
- invalid graph hash warning or rebase path
- endpoint validation for `add_relation`
- status transition validation
- dry-run apply with no filesystem changes
- write apply updates only configured authoritative files
- append-only audit log creation
- read-only MCP server exposes no mutation tools
- write MCP server exposes mutation tools only with explicit write flag
- studio API rejects writes without token
- path jail blocks writes outside the repo
- dirty worktree warning is emitted before apply

## UAT

- Public-pack-derived isolated UAT was executed in `/tmp/graphify-mystery-uat` from `../public-domaine-mystery-sagas-pack`.
- The UAT validated the profile, ran dataprep on `3` semantic files, compiled ontology outputs with `12` nodes, `6` relations and `11` wiki pages, and generated a deterministic Holmes entity-match candidate queue.
- Patch validation covered valid `accept_match`, `merge_alias`, `add_relation`, `set_status` and `reject_match` scenarios, plus invalid evidence-ref, status-transition and relation-endpoint scenarios.
- Patch dry-run reported only authoritative decision log, audit log and stale-marker changed files; write apply appended to both configured decision/audit logs and marked `.graphify/needs_update`.
- Read-only studio API routes were verified for candidates, decision-log and rebuild-status; responses used relative paths and reported `needs_update: true` after write apply.
- Run ontology output generation on a synthetic profile and produce reconciliation candidates.
- Validate a patch that accepts a candidate match.
- Dry-run apply the patch and verify changed-file preview.
- Apply the patch in a disposable repo and verify only authoritative project-owned files change.
- Rebuild Graphify and verify derived ontology artifacts reflect the applied decision.
- Start read-only MCP and verify mutation tools are absent.
- Start write-enabled MCP and verify mutation tools require dry-run or confirmation.
- Start read-only studio and export a patch JSON.
- Start write-enabled studio and verify token-gated local apply.

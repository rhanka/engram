# SPEC_ONTOLOGY_OUTPUT_ARTIFACTS

## Status

- Product: Graphify TypeScript port
- Scope: optional profile-driven ontology and LLM Wiki output compilation
- State root: `.graphify/`
- Activation: explicit ontology profile output config only
- Default behavior: unchanged

This spec defines optional compiled ontology artifacts and profile-aware LLM Wiki pages. It complements the existing graph, report and community wiki without replacing them.

Ontology lifecycle, reconciliation and write surfaces are specified in `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`. This output spec treats compiled ontology artifacts as derived outputs, not as the authoritative write target.

## Problem

Graphify can already build a graph and validate profile-aware extraction. Some downstream dataprep workflows need a second output shape:

- canonical entity tables
- alias indexes
- source and occurrence records
- typed relation tables
- retrieval-oriented wiki pages
- machine-readable manifests

The existing `.graphify/wiki/` is organized around graph communities. That is useful for graph exploration, but it is not the same as a profile-driven LLM Wiki organized around canonical entities and source-backed evidence.

## Goals

- Compile optional ontology artifacts from Graphify extraction, profile registries and validated graph data.
- Keep all ontology semantics profile-declared.
- Produce generic JSON artifacts that consuming projects can map into their own retrieval systems.
- Produce optional entity-centric Markdown pages suitable for LLM retrieval.
- Preserve provenance and validation status for every compiled record.
- Reuse existing profile validation, registry loading, semantic cache, PDF/OCR sidecars and graph build.

## Non-Goals

- Do not hardcode any domain-specific node type, relation type, taxonomy, or document category.
- Do not add real customer, partner, project, regulated-domain, medical, financial, legal, or proprietary examples.
- Do not replace `.graphify/graph.json`.
- Do not replace `.graphify/GRAPH_REPORT.md`.
- Do not replace the existing community wiki.
- Do not add embeddings, vector stores, SQLite, MCP, or remote database writes.
- Do not call an LLM by default for canonicalization.

## Compatibility Contract

This feature is inert unless the active ontology profile declares output artifacts.

Without `outputs.ontology` or equivalent explicit profile config:

- no `.graphify/ontology/` directory is created
- existing graph and wiki outputs are unchanged
- no canonicalization pass runs
- no additional validation errors are introduced
- no LLM execution port is initialized

## Human Review And Ambiguity Policy

Default ambiguity policy is `review-required non-blocking`.

Rules:

- Ambiguous canonicalization, alias attachment, registry attachment or relation evidence does not fail the whole build.
- Ambiguous records are preserved as candidates with `status: needs_review`.
- Ambiguous records must not be merged into canonical hardened nodes.
- Ambiguous records must not appear in hardened exports as accepted facts.
- Ambiguities are written to `validation.json`, profile reports and affected wiki pages.
- Human or assistant review can resolve ambiguity by updating project-owned registries, labels or profile rules.
- Human or assistant review should be represented as validated patches or decision logs; generated `graph.json` and compiled ontology artifacts must not be edited directly.

## Profile Output Config

Synthetic ontology profile extension:

```yaml
outputs:
  ontology:
    enabled: true
    artifact_schema: graphify_ontology_outputs_v1
    canonical_node_types:
      - Component
      - Procedure
      - Tool
    source_node_types:
      - DocumentSource
    occurrence_node_types:
      - Observation
    alias_fields:
      - aliases
      - normalized_terms
    relation_exports:
      - relation_type: evidences
      - relation_type: requires_tool
    wiki:
      enabled: true
      page_node_types:
        - Component
      include_backlinks: true
      include_source_snippets: true
```

Rules:

- All listed node and relation types must exist in `node_types` and `relation_types`.
- The names above are synthetic examples, not built-in Graphify types.
- Consuming projects own their real profile files.
- Graphify package tests must use only synthetic fixtures.

## Output Layout

Generated artifacts live under `.graphify/ontology/`:

```text
.graphify/ontology/
  manifest.json
  nodes.json
  aliases.json
  relations.json
  sources.json
  occurrences.json
  validation.json
  index.json
  wiki/
    index.md
    index.json
    entities/
      <entity-id>.md
```

These artifacts are local runtime outputs by default. Whether a consuming project commits them is a project decision, not a Graphify default.

Implemented command surface:

- `graphify profile ontology-output --profile-state .graphify/profile/profile-state.json --input extraction.json --out-dir .graphify/ontology` is the public CLI wrapper.
- `ontology-output --profile-state <path> --input <path> --out-dir <dir>` is the skill runtime command.

Both commands are inert unless the loaded ontology profile declares `outputs.ontology.enabled: true`. They compile deterministic artifacts from already-produced extraction/profile evidence and do not initialize an LLM port.

## Manifest

`manifest.json`:

```json
{
  "schema": "graphify_ontology_outputs_v1",
  "graph_hash": "sha256",
  "profile_hash": "sha256",
  "generated_at": "ISO-8601",
  "node_count": 0,
  "relation_count": 0,
  "wiki_page_count": 0,
  "source_graph": ".graphify/graph.json"
}
```

## Canonical Nodes

`nodes.json` contains profile-selected canonical records:

```json
[
  {
    "id": "stable-node-id",
    "type": "Component",
    "label": "Synthetic component label",
    "aliases": ["alternate label"],
    "normalized_terms": ["synthetic component label", "alternate label"],
    "status": "candidate",
    "confidence": 0.8,
    "source_refs": ["source-ref-id"],
    "registry_refs": ["registry-record-id"],
    "graph_node_ids": ["graph-node-id"]
  }
]
```

Rules:

- `type` must be profile-declared.
- `status` must follow profile hardening policy when present.
- `registry_refs` are optional and only valid for configured registries.
- Canonicalization is deterministic by default.
- Ambiguous canonicalization creates separate candidate records rather than merging them.
- Candidate-only ambiguous records remain visible for review but are excluded from hardened outputs.

## Aliases

`aliases.json`:

```json
[
  {
    "term": "alternate label",
    "normalized": "alternate label",
    "node_id": "stable-node-id",
    "source": "profile|registry|extraction|caption",
    "confidence": 0.8
  }
]
```

Alias normalization rules:

- trim whitespace
- collapse repeated spaces
- preserve original case in display fields
- store a lowercase search normalization
- do not merge two canonical nodes solely because labels are similar
- emit review warnings for ambiguous aliases
- ambiguous aliases attach to no hardened canonical node until reviewed

## Relations

`relations.json`:

```json
[
  {
    "id": "stable-relation-id",
    "type": "requires_tool",
    "source_id": "stable-source-node-id",
    "target_id": "stable-target-node-id",
    "confidence": 0.75,
    "evidence_refs": ["source-ref-id"],
    "graph_edge_ids": ["graph-edge-id"]
  }
]
```

Rules:

- Relation types must be profile-declared.
- Source and target node types must pass profile validation.
- Relations without evidence are allowed only if the profile explicitly allows inferred records.

## Sources And Occurrences

`sources.json` records source documents, pages, sidecars and image artifacts:

```json
[
  {
    "id": "source-ref-id",
    "source_file": "/absolute/source.pdf",
    "page": 12,
    "sidecar": ".graphify/converted/pdf/example.md",
    "image_artifact": ".graphify/converted/pdf/example_images/image_1.png",
    "quote": "short source-backed excerpt",
    "bbox": [0, 0, 100, 100]
  }
]
```

`occurrences.json` records profile-selected source-backed observations:

```json
[
  {
    "id": "occurrence-id",
    "type": "Observation",
    "summary": "Synthetic source-backed observation.",
    "linked_node_ids": ["stable-node-id"],
    "source_refs": ["source-ref-id"],
    "confidence": 0.7
  }
]
```

The profile decides which node types are occurrence-like. Graphify must not ship a built-in domain concept for occurrences.

## Entity Wiki

The optional ontology wiki is entity-centric, not community-centric.

Each page should include:

- canonical label and type
- aliases and normalized terms
- source-backed summary
- registry attachments when present
- direct relations
- source evidence list
- backlinks
- validation warnings

Example page layout:

```markdown
# Synthetic Component Label

Type: Component
Status: candidate

## Summary

Source-backed summary generated from validated extraction evidence.

## Aliases

- alternate label

## Relations

- requires_tool -> Synthetic Tool Label

## Evidence

- source.pdf, page 12

## Backlinks

- Synthetic Procedure Label
```

Rules:

- Page templates are generic.
- Profile config may choose which types get pages.
- Generated pages must not introduce facts absent from graph/profile evidence.
- If an LLM summary is used through an execution port, it must be optional and provenance-preserving.

## Retrieval Index

`index.json` provides a generic retrieval projection:

```json
{
  "schema": "graphify_ontology_index_v1",
  "entries": [
    {
      "id": "stable-node-id",
      "type": "Component",
      "label": "Synthetic component label",
      "aliases": ["alternate label"],
      "wiki_path": ".graphify/ontology/wiki/entities/stable-node-id.md",
      "source_refs": ["source-ref-id"],
      "relation_ids": ["stable-relation-id"]
    }
  ]
}
```

Graphify may call this an ontology retrieval index, but it must not prescribe a consuming application's retrieval channel names.

## Canonicalization

Default canonicalization is deterministic:

- registry match by configured ID
- exact normalized label match
- exact alias match when unambiguous
- source-backed extracted label otherwise creates a candidate node

Optional LLM-assisted canonicalization can be added later through `SPEC_LLM_EXECUTION_PORTS.md`, but it must be explicit and must produce reviewable diffs before replacing deterministic candidates.

When LLM-assisted canonicalization is enabled:

- proposed merges are written as review diffs
- unresolved proposals stay `needs_review`
- deterministic validation decides whether a reviewed proposal can be promoted
- no LLM proposal can overwrite deterministic candidates without explicit review state

## Validation

Ontology output validation checks:

- all exported node types are profile-declared
- all exported relation types are profile-declared
- relation source and target types satisfy the profile
- source refs point to known source files, sidecars or image artifacts
- aliases do not ambiguously attach to multiple canonical nodes without a warning
- wiki pages reference only exported node IDs
- generated summaries cite evidence when citation policy requires it

Validation output goes to `.graphify/ontology/validation.json` and profile reports.

## Tests

Automated tests should cover:

- no ontology output directory when outputs are not configured
- profile loader validation for `outputs.ontology` type declarations
- profile config validation for output declarations
- deterministic canonical node compilation from synthetic extraction
- registry-backed alias compilation
- relation export with profile-compatible source and target types
- validation failure for undeclared output type
- entity wiki page generation from synthetic evidence
- retrieval index generation
- no LLM port initialization by default
- optional caption sidecar evidence feeding source refs

## UAT

- Run a normal graphify build without ontology outputs and verify no `.graphify/ontology/` directory exists.
- Run a synthetic profile with ontology outputs enabled and verify JSON artifacts are generated.
- Open generated entity wiki pages and verify every statement traces back to evidence or registry data.
- Introduce an invalid relation type in synthetic extraction and verify validation fails or warns according to policy.
- Confirm no domain-specific built-in types are present in generated code or default fixtures.

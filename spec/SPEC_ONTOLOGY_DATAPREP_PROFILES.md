# SPEC_ONTOLOGY_DATAPREP_PROFILES

## Status

- Product: Graphify TypeScript port
- Scope: project-configured ontology dataprep profiles
- Target: additive feature; no behavior change without a project config, profile flag, or config flag
- State root: `.graphify/`

This document defines how Graphify runs ontology-aware dataprep through project configuration while preserving the normal one-command assistant experience:

```bash
$graphify
```

The consuming project should define what to parse, which ontology profile to apply, and which dataprep policies to use. Graphify should orchestrate the rest.

This spec must not include customer-specific, partner-specific, project-specific, or proprietary ontology examples. Examples use a synthetic equipment-maintenance domain only.

## Problem

Graphify already performs substantial dataprep:

- corpus detection and file classification
- PDF preflight and optional OCR sidecars
- transcript and converted-document preparation
- semantic detection generation
- semantic cache management
- AST extraction for code
- assistant-driven semantic extraction for documents, papers and images
- extraction validation
- graph build, clustering, reports, wiki and exports

The missing layer is not a separate dataprep product. The missing layer is a generic way for a project to declare:

- where the source corpus lives
- which reference registries should be loaded
- which generated folders are valid semantic inputs
- which folders are acquisition artifacts and should not be interpreted directly
- which ontology types and relations should constrain extraction
- which citation and review policies should be enforced

Without that layer, users must manually pass paths and manually explain the domain to the assistant on each run.

## Goal

Make `$graphify` convention-driven.

When Graphify runs in a project root, it should look for a project config file, load it, then run the configured dataprep and ontology extraction pipeline.

Nominal assistant command:

```bash
$graphify
```

Equivalent local deterministic CLI entrypoint:

```bash
graphify profile dataprep . --config graphify.yaml
```

The project config points to an ontology profile. The ontology profile defines semantic constraints. The project config defines physical inputs and dataprep behavior.

Compatibility clarification:

- Profile behavior is activated only by a discovered project config, an explicit `--config`, or an explicit `--profile`.
- A committed `graphify.yaml` is an intentional project opt-in, equivalent to passing `--config graphify.yaml`.
- If no project config, `--config`, or `--profile` is present, Graphify behavior must remain unchanged.
- The full semantic extraction path remains assistant/skill orchestrated in this lot. CLI/runtime commands expose deterministic local steps for discovery, dataprep, prompt generation, validation and reporting; they fail clearly rather than pretending to run assistant semantic extraction without an assistant or configured provider.

## Non-Goals

- Do not include real customer or project ontology examples in Graphify.
- Do not make profile extraction authoritative business validation.
- Do not require MCP.
- Do not require embeddings.
- Do not require a database.
- Do not manage remote backups, object storage buckets or external artifact retention.
- Do not fork the existing PDF/OCR/transcript preparation pipeline.
- Do not change existing Graphify behavior when no config or profile is supplied.
- Do not force users to pass `--profile` for the normal configured-project workflow.

## Project Config

Graphify should auto-detect a root-level project config in this order:

```text
graphify.yaml
graphify.yml
.graphify/config.yaml
.graphify/config.yml
```

The config file declares physical inputs and dataprep policy.

Synthetic example:

```yaml
version: 1

profile:
  path: graphify/ontology-profile.yaml

inputs:
  corpus:
    - raw/manuals
    - raw/procedures
    - derived/ocr
  registries:
    - references/components.csv
    - references/tooling.csv
  generated:
    - derived/pdf-sidecars
    - derived/extracted-images
  exclude:
    - derived/full-page-screenshots
    - tmp

dataprep:
  pdf_ocr: auto
  prefer_ocr_markdown: true
  use_extracted_pdf_images: true
  full_page_screenshot_vision: false
  citation_minimum: page
  preserve_source_structure: true

outputs:
  state_dir: .graphify
  write_html: true
  write_wiki: true
  write_profile_report: true
```

Rules:

- `profile.path` is resolved relative to the config file.
- `inputs.corpus` are primary source folders.
- `inputs.registries` are reference data files or folders.
- `inputs.generated` are generated but semantically useful artifacts.
- `inputs.exclude` removes paths from detection and semantic extraction.
- `dataprep.full_page_screenshot_vision: false` means full rendered pages can be preserved as evidence but should not be sent to general image extraction.
- Config paths are physical paths. Ontology semantics remain in the ontology profile.

## Ontology Profile

The ontology profile is a YAML or JSON file referenced by the project config. It declares semantic constraints, not filesystem layout.

Synthetic example:

```yaml
id: equipment-maintenance-demo
version: 1
default_language: en

node_types:
  MaintenanceProcess:
    aliases: [process, maintenance step]
    status_policy: hardenable
  Component:
    aliases: [part, replaceable unit]
    registry: components
  Procedure:
    source_backed: true
  Tool:
    aliases: [tool, fixture, software utility]
  Figure:
    source_backed: true

relation_types:
  inspects:
    source: MaintenanceProcess
    target: Component
  replaces:
    source: MaintenanceProcess
    target: Component
  requires_tool:
    source: MaintenanceProcess
    target: Tool
  evidences:
    source: Procedure
    target: [MaintenanceProcess, Component, Tool]
  depicts:
    source: Figure
    target: [MaintenanceProcess, Component, Tool]

registries:
  components:
    source: components
    id_column: component_id
    label_column: component_name
    alias_columns: [component_code]
    node_type: Component
  tooling:
    source: tooling
    id_column: tool_id
    label_column: tool_name
    alias_columns: [tool_code]
    node_type: Tool

citation_policy:
  minimum_granularity: page
  require_source_file: true
  allow_bbox: when_available

hardening:
  statuses: [candidate, attached, needs_review, validated, rejected, superseded]
  default_status: candidate
  promotion_requires:
    - source_citation
    - allowed_relation_type
    - registry_match_for_registered_types
```

Rules:

- `registries.*.source` refers to a named registry source discovered from `graphify.yaml`.
- The profile can be reused across projects with different physical paths.
- Graphify must not ship real business registries in its package or tests.

## User Experience

### Configured Project

In a configured project:

```bash
$graphify
```

Graphify should:

1. Resolve the TypeScript runtime as it does today.
2. Discover `graphify.yaml`.
3. Load the ontology profile referenced by the config.
4. Resolve configured corpus, generated and registry paths.
5. Apply exclusions before detection.
6. Run existing detection.
7. Run existing semantic preparation, including PDF preflight/OCR sidecars.
8. Load registries and emit registry extraction fragments.
9. Build profile-aware prompts.
10. Run semantic extraction for uncached source chunks.
11. Validate base extraction shape.
12. Validate profile constraints.
13. Merge registry, AST and semantic extraction.
14. Build graph, reports, HTML and optional wiki.
15. Write profile QA report.

### Explicit Overrides

These deterministic local commands are available:

```bash
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
```

The assistant skill runtime exposes the same mechanics through `dist/skill-runtime.js` as:

```bash
node dist/skill-runtime.js project-config --root . --out .graphify/profile/project-config.normalized.json --profile-out .graphify/profile/ontology-profile.normalized.json
node dist/skill-runtime.js configured-dataprep --root . --config graphify.yaml
node dist/skill-runtime.js profile-prompt --profile-state .graphify/profile/profile-state.json --out .graphify/profile/profile-prompt.md
node dist/skill-runtime.js profile-validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
node dist/skill-runtime.js profile-report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
```

`--config` loads both physical inputs and the referenced profile. `--profile` remains an activation concept for explicit profile-aware assistant flows, but the current public local CLI exposes profile behavior through the `graphify profile ...` namespace rather than pretending `graphify . --profile` can perform assistant extraction by itself.

### No Config

If no config and no profile are supplied, Graphify behaves exactly as it does today.

## Architecture

### Project Config Loader

Create `src/project-config.ts`.

Responsibilities:

- discover supported config filenames
- read YAML or JSON config files
- validate config structure
- resolve paths relative to the config file
- normalize dataprep defaults
- expose a typed `GraphifyProjectConfig`

The loader must not run corpus detection. It only normalizes configuration.

### Ontology Profile Loader

Create `src/ontology-profile.ts`.

Responsibilities:

- read YAML or JSON profile files
- validate profile structure
- normalize defaults
- bind profile registry declarations to project config registry sources
- expose a typed `OntologyProfile`

The profile loader reads semantic constraints. It should not know project-specific path conventions beyond named registry bindings.

### Registry Loader

Create `src/profile-registry.ts`.

Responsibilities:

- load CSV, JSON and YAML registries declared by the project config
- bind loaded registry sources to profile registry definitions
- map configured columns to canonical registry records
- generate stable node IDs
- preserve aliases, raw fields and source provenance
- emit registry nodes as Graphify `Extraction` fragments

Canonical record:

```ts
export interface RegistryRecord {
  registryId: string;
  id: string;
  label: string;
  aliases: string[];
  nodeType: string;
  sourceFile: string;
  raw: Record<string, unknown>;
}
```

### Configured Dataprep

Create `src/configured-dataprep.ts`.

Responsibilities:

- expand configured input roots
- apply exclude rules
- call existing `detect()`
- call existing `prepareSemanticDetection()`
- load profile registries
- write deterministic configured state under `.graphify/profile/`
- generate a dataprep report

Expected artifacts:

```text
.graphify/profile/project-config.normalized.json
.graphify/profile/ontology-profile.normalized.json
.graphify/profile/profile-state.json
.graphify/profile/registries/*.json
.graphify/profile/registry-extraction.json
.graphify/profile/semantic-detection.json
.graphify/profile/dataprep-report.md
.graphify/profile/profile-report.md
```

Configured dataprep must reuse the existing PDF/OCR/transcript pipeline.

Semantic cache isolation is profile-aware. The generic cache path remains compatible; profile flows derive a namespace from `profile-state.json` and the normalized profile hash so generic cached extraction cannot satisfy profile-aware extraction.

### Profile Prompt Builder

Create `src/profile-prompts.ts`.

Responsibilities:

- build semantic extraction instructions from the ontology profile
- list allowed node types and relation types
- explain registry matching rules
- require citations according to the profile
- include review status rules
- include input-specific instructions from the project config
- produce chunk-specific prompts for documents, papers, OCR sidecars and images

Profile mode should replace or extend the current generic semantic extraction relation list.

### Profile Validation

Create `src/profile-validate.ts`.

Responsibilities:

- run base `validateExtraction()`
- validate `node_type`
- validate `relation`
- validate source and target node type compatibility
- validate required citation fields
- validate registry links where configured
- emit machine-readable errors
- emit a Markdown validation audit

This validates profile conformance. It does not validate business truth.

### Profile QA Report

Create `src/profile-report.ts`.

Responsibilities:

- summarize configured inputs
- summarize registry coverage
- list orphan registry records
- list extracted entities without registry attachment
- list invalid or ambiguous relations
- list high-degree nodes
- list low-evidence relation types
- list candidates eligible for human review

The report is a QA artifact, not an approval artifact.

## Extraction Schema Extension

Keep the current `Extraction` shape backward compatible. Add optional attributes.

Node attributes:

```ts
node_type?: string;
registry_id?: string;
registry_record_id?: string;
aliases?: string[];
status?: "candidate" | "attached" | "needs_review" | "validated" | "rejected" | "superseded";
citations?: Citation[];
```

Edge attributes:

```ts
status?: "candidate" | "attached" | "needs_review" | "validated" | "rejected" | "superseded";
citations?: Citation[];
evidence_text?: string;
```

Citation:

```ts
export interface Citation {
  source_file: string;
  source_url?: string;
  page?: number;
  section?: string;
  paragraph_id?: string;
  figure_id?: string;
  bbox?: [number, number, number, number];
}
```

## Skill Evolution

Graphify assistant skills should gain a configured-project branch:

1. If no explicit path is given, use `.` as today.
2. Before detection, check whether a supported project config exists.
3. If config exists, load it and its referenced ontology profile.
4. Resolve configured inputs and exclusions.
5. Run configured dataprep.
6. Generate extraction prompts from the profile.
7. Ask semantic extraction agents to output Graphify `Extraction` JSON with profile attributes.
8. Run base validation and profile validation.
9. Finalize graph build through existing runtime commands.
10. Generate the profile QA report.

This preserves `$graphify` as the primary UX.

The domain-specific behavior comes from the consuming project's config and profile files, not from hardcoded prompt text in Graphify.

## Tests

Use only synthetic fixtures.

Required tests:

- project config loader discovers `graphify.yaml`
- project config loader resolves relative paths
- project config loader applies defaults
- ontology profile loader accepts valid YAML and JSON
- ontology profile loader rejects missing `id`, invalid node types and invalid relation definitions
- registry loader maps a synthetic CSV to canonical records
- registry extraction emits valid base Graphify extraction
- configured dataprep excludes configured artifact folders
- profile validation rejects unknown node types
- profile validation rejects unknown relation types
- profile validation rejects incompatible source and target node types
- profile validation enforces required citation fields
- CLI config validation exits non-zero for invalid configs
- existing non-config Graphify tests remain unchanged

Synthetic fixture structure:

```text
tests/fixtures/profile-demo/
  graphify.yaml
  graphify/ontology-profile.yaml
  references/components.csv
  references/tooling.csv
  raw/manuals/manual.md
  derived/full-page-screenshots/page-001.png
  expected/project-config-normalized.json
  expected/profile-normalized.json
```

## Implementation Outline

1. Add project config TypeScript types.
2. Add project config discovery, loader and tests.
3. Add ontology profile TypeScript types.
4. Add ontology profile loader and validation tests.
5. Add registry loader and CSV fixture tests.
6. Add registry-to-extraction conversion.
7. Add configured dataprep over existing `detect()` and `prepareSemanticDetection()`.
8. Add profile validation over base `validateExtraction()`.
9. Add profile prompt builder.
10. Add CLI/runtime commands and skill-template flow for config/profile.
11. Add profile QA report.
12. Update README and `spec/SPEC_GRAPHIFY.md`.

## Acceptance Criteria

- `$graphify` in a configured project auto-loads `graphify.yaml`.
- No customer-specific or project-specific example appears in Graphify.
- Existing Graphify commands behave the same without config or `--profile`.
- A synthetic config can declare corpus, generated inputs, registries and exclusions.
- A synthetic profile can constrain node and relation types.
- Synthetic registry records can become graph nodes with stable IDs.
- Configured dataprep reuses existing PDF/OCR/transcript preparation.
- Profile validation catches illegal relations and missing citations.
- Profile prompts differ from generic prompts when config/profile is active.
- Profile QA report distinguishes candidates from validated records.
- All tests use synthetic data only.

## Recommendation

Implement ontology dataprep profiles as a generic configured-project capability.

Graphify should own reusable mechanics: config discovery, profile loading, registry normalization, configured dataprep, profile-aware prompts, profile validation, graph analysis and QA reports.

Consuming projects should own their real configs, real profiles, proprietary registries, review workflows and final domain-specific wiki pages.

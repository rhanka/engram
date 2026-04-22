# Ontology Dataprep Profiles Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic configured-project `ontology dataprep profiles` mode that lets Graphify load project config, ontology profile constraints, synthetic-style registries, and profile-aware validation while preserving the normal non-configured Graphify behavior.

**Architecture:** This is an additive layer over the existing TypeScript pipeline. Project config and ontology profiles normalize inputs before calling `detect()` and `prepareSemanticDetection()`, registry records become ordinary Graphify `Extraction` fragments, profile validation wraps `validateExtraction()`, and graph build/report/export/wiki remain the existing pipeline. Full semantic extraction remains assistant/skill orchestrated in this lot; CLI/runtime commands expose deterministic local discovery, dataprep, validation, prompt and reporting steps.

**Tech Stack:** TypeScript, Node.js 20+, Commander, Vitest, existing Graphify modules, direct `yaml` dependency for YAML parsing, direct `csv-parse` dependency for CSV registries, existing PDF/OCR/transcript preparation.

---

## Current Status

- [x] `ontology dataprep profiles` base implementation is complete.
- [x] `spec/SPEC_IMAGE_DATAPREP_ROUTING.md` defines optional crop/caption/routing dataprep.
- [x] `spec/SPEC_LLM_EXECUTION_PORTS.md` defines provider-neutral assistant, batch, mesh and off execution modes.
- [x] `spec/SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md` defines optional ontology/wiki output compilation.
- [x] Ambiguity policy is `review-required non-blocking`.
- [x] Image routing policy is `calibration-first`; Graphify must not ship magic cascade rules.
- [x] Assistant role is `assistant-as-calibration-analyst`; TypeScript replay owns acceptance.
- [x] Routing rules and labels are project-owned, versionable files referenced from `graphify.yaml`.
- [x] Calibration gate requires `false_primary = 0`; missing or ambiguous labels produce `pending_labels`.
- [x] Production cascade requires `accept_matrix`; otherwise Graphify must block automatic cascade routing.
- [x] Ontology alias/canonicalization ambiguity is `candidate-only`, marked `needs_review`, and excluded from hardened outputs.
- [x] Commit the three new specs plus this plan update.
- [x] Lot A committed as `8f65cba` (`feat: add advanced dataprep config contracts`).
- [x] Lot B committed as `752c5e6` (`feat: add provider-neutral llm execution ports`).
- [x] Lot C committed as `22c2c39` (`feat: add image dataprep manifests and schemas`).
- [x] Lot D core committed as `ea49a61` (`feat: add image routing calibration workflow`).
- [x] Lot E core committed as `6027541` (`feat: add image dataprep batch import export`).
- [x] Lot F core committed as `57d9873` (`feat: add optional ontology output artifacts`).
- [x] Lot D CLI/skill workflow integration committed as `4f4c409` (`feat: integrate advanced dataprep runtime workflows`).
- [x] Lot E accepted-rule deep-pass export and overwrite policy committed as `4f4c409` (`feat: integrate advanced dataprep runtime workflows`).
- [x] Lot F profile-report/CLI integration committed as `4f4c409` (`feat: integrate advanced dataprep runtime workflows`).
- [x] Lot G README, skills and UAT prepared in the docs tranche.

## Next Evolution Plan - Image Dataprep, LLM Ports, Ontology Outputs

**Goal:** Implement the three new specs as strictly opt-in capabilities without changing default `$graphify` behavior.

**Compatibility Guardrails:**

- [x] No direct LLM provider is constructed without explicit config.
- [x] No image dataprep artifacts are generated without `dataprep.image_analysis.enabled: true` or an explicit image dataprep command.
- [x] No `.graphify/ontology/` output is generated without explicit ontology output config.
- [x] No domain-specific type, taxonomy, label, registry or ontology example is added to Graphify.
- [x] Existing non-configured tests prove `detect()`, `prepareSemanticDetection()`, `validateExtraction()`, build, report and export behavior are unchanged.

### Lot A - Config Surface And Type Contracts

**Files:**
- Modify: `src/types.ts`
- Modify: `src/project-config.ts`
- Modify: `tests/project-config.test.ts`
- Modify: `tests/public-api.test.ts`
- Modify: `spec/SPEC_GRAPHIFY.md`

- [x] Add `GraphifyImageAnalysisPolicy` with `enabled`, `mode`, `artifact_source`, `caption_schema`, `routing_profile`, `primary_model`, `deep_model`, `calibration`, `max_markdown_context_chars`, and `batch`.
- [x] Add `GraphifyLlmExecutionPolicy` with `mode: assistant|batch|mesh|off`, text JSON, vision JSON, batch and mesh config blocks.
- [x] Add ontology output config types for profile-declared `outputs.ontology`.
- [x] Normalize config paths for `calibration.rules_path` and `calibration.labels_path` relative to `graphify.yaml`.
- [x] Validate `mode` enums and fail fast for malformed advanced config.
- [x] Add tests proving absent advanced config normalizes to inert defaults.
- [x] Commit as `feat: add advanced dataprep config contracts`.

### Lot B - LLM Execution Ports

**Files:**
- Create: `src/llm-execution.ts`
- Create: `tests/llm-execution.test.ts`
- Modify: `src/index.ts`

- [x] Define `TextJsonGenerationClient`, `VisionJsonAnalysisClient`, `BatchVisionJsonClient`, and `LlmMeshAdapter` ports.
- [x] Implement assistant no-call adapter that writes/validates instruction artifacts only.
- [x] Implement preflight validation for `batch` and `mesh` modes without adding provider SDK dependencies.
- [x] Add secret redaction helpers for generated audit metadata.
- [x] Add tests proving default config constructs no provider and reads no API key.
- [x] Add tests proving `assistant` mode works without credentials.
- [x] Add tests proving `batch` and `mesh` fail clearly without required adapter/provider config.
- [x] Commit as `feat: add provider-neutral llm execution ports`.

### Lot C - Image Dataprep Manifest And Caption Schemas

**Files:**
- Create: `src/image-dataprep.ts`
- Create: `src/image-caption-schema.ts`
- Create: `tests/image-dataprep.test.ts`
- Modify: `src/paths.ts`
- Modify: `src/skill-runtime.ts`
- Modify: `src/cli.ts`

- [x] Build `.graphify/image-dataprep/manifest.json` from OCR crop artifacts and direct image inputs.
- [x] Preserve provenance to original file, source page, sidecar path, image path, MIME type and SHA-256.
- [x] Validate `generic_image_caption_v1` sidecars.
- [x] Validate `generic_image_routing_v1` sidecars.
- [x] Ensure full-page screenshot artifacts are excluded by default.
- [x] Add assistant-mode prompt artifact generation without provider calls.
- [x] Add tests proving no image dataprep directory is created without opt-in.
- [x] Commit as `feat: add image dataprep manifests and schemas`.

### Lot D - Calibration Workflow

**Files:**
- Create: `src/image-routing-calibration.ts`
- Create: `tests/image-routing-calibration.test.ts`
- Modify: `src/skill-runtime.ts`
- Modify: `src/cli.ts`
- Modify: `src/skills/*`

- [x] Implement deterministic sample selection into `.graphify/calibration/<run-id>/samples.json`.
- [x] Implement machine-readable labels loader for `graphify_image_routing_labels_v1`.
- [x] Implement project-owned routing rules loader for `graphify_image_routing_rules_v1`.
- [x] Implement TypeScript replay of proposed rules without provider calls.
- [x] Compute `false_primary`, false `deep`, missing labels, ambiguous labels and estimated deep ratio.
- [x] Gate acceptance with `false_primary = 0`; missing or ambiguous labels produce `pending_labels`.
- [x] Emit decisions `accept_matrix`, `revise_matrix`, `reject_cascade`, or `pending_labels`.
- [x] Block automatic production cascade unless rules declare `decision: accept_matrix`.
- [x] Update skills so Codex/Claude/Gemini can act as `assistant-as-calibration-analyst`.
- [x] Commit integration as `feat: integrate advanced dataprep runtime workflows`.

### Lot E - Batch And Mesh Import/Export

**Files:**
- Create: `src/image-dataprep-batch.ts`
- Create: `tests/image-dataprep-batch.test.ts`
- Modify: `src/llm-execution.ts`
- Modify: `src/skill-runtime.ts`
- Modify: `src/cli.ts`

- [x] Export provider-neutral JSONL requests for primary captioning.
- [x] Import mocked primary results into caption and routing sidecars.
- [x] Generate deep-pass JSONL only for accepted-rule `deep` routes.
- [x] Import mocked deep results without overwriting valid prior sidecars unless `--force`.
- [x] Reject invalid provider JSON before downstream use.
- [x] Redact all secrets from manifests, reports and logs.
- [x] Commit as `feat: add image dataprep batch import export`.

### Lot F - Ontology Output Artifacts

**Files:**
- Create: `src/ontology-output.ts`
- Create: `tests/ontology-output.test.ts`
- Modify: `src/profile-report.ts`
- Modify: `src/paths.ts`
- Modify: `src/skill-runtime.ts`
- Modify: `src/cli.ts`

- [x] Generate `.graphify/ontology/manifest.json` only when ontology outputs are configured.
- [x] Compile profile-selected canonical candidate nodes into `nodes.json`.
- [x] Compile alias records into `aliases.json`.
- [x] Compile profile-valid relations into `relations.json`.
- [x] Compile source refs and occurrence-like records according to profile declarations.
- [x] Mark ambiguous canonicalization or alias attachment as `needs_review`.
- [x] Exclude `needs_review` ambiguity from hardened outputs.
- [x] Generate entity-centric wiki pages only for configured page node types.
- [x] Generate `index.json` retrieval projection without prescribing consuming application channel names.
- [x] Commit as `feat: add optional ontology output artifacts`.

### Lot G - Documentation, Skills, And UAT

**Files:**
- Modify: `README.md`
- Modify: translated README files if present
- Modify: `spec/SPEC_GRAPHIFY.md`
- Modify: `src/skills/*`
- Modify: `PLAN.md`

- [x] Update README with opt-in image dataprep, LLM execution ports, calibration workflow and ontology outputs.
- [x] Update specs to reflect final implemented CLI names and artifact paths.
- [x] Update all assistant skills with calibration analyst workflow and non-disruption rules.
- [x] Add UATs for baseline no-config behavior, assistant calibration, accepted rules, blocked cascade and ontology output generation.
- [x] Run `npm run lint`.
- [x] Run `npm run build`.
- [x] Run `npm test`.
- [x] Run `git diff --check`.
- [ ] Check off completed plan items and commit as `docs: document advanced dataprep workflows`.

### UAT Checklist

- [ ] Baseline no-config: run `graphify update .` in a repo without `graphify.yaml` and verify no `.graphify/image-dataprep/` or `.graphify/ontology/` directory is created.
- [ ] Assistant calibration: run runtime `image-calibration-samples`, let the assistant propose labels/rules, then run `image-calibration-replay` and verify the decision is reviewable.
- [ ] Accepted rules: set project-owned routing rules to `decision: accept_matrix`, run deep `image-batch-export`, and verify only deterministic `deep` routes are exported.
- [ ] Blocked cascade: change rules to `pending_labels` or `revise_matrix`, rerun deep `image-batch-export`, and verify it fails before writing production deep requests.
- [ ] Ontology output: run `graphify profile ontology-output --profile-state .graphify/profile/profile-state.json --input extraction.json --out-dir .graphify/ontology` on a synthetic profile with `outputs.ontology.enabled: true` and verify JSON + wiki artifacts are generated.

## Scope And Compatibility Rules

- [x] Profile behavior activates only when Graphify discovers a project config, receives `--config`, or receives `--profile`.
- [x] A committed `graphify.yaml` is an explicit project opt-in. Without config/profile activation, existing commands and skills must behave exactly as they do today.
- [x] Do not introduce real customer, partner, project, dataset, registry, or proprietary ontology examples into code, docs, fixtures, tests, or package assets.
- [x] Use synthetic equipment-maintenance fixtures only.
- [x] Do not add new MCP tools, embeddings, vector stores, databases, remote registry fetching, or a forked PDF/OCR/transcript pipeline in this lot.
- [x] Reuse `detect()`, `prepareSemanticDetection()`, PDF/OCR sidecars, semantic cache mechanics, `validateExtraction()`, build, report, export, and wiki.
- [x] Keep `.graphify/` as the state root. Profile artifacts live under `.graphify/profile/`.
- [x] Keep base `Extraction`, `GraphNode`, `GraphEdge`, and `Hyperedge` backward compatible.
- [x] Keep profile validation as an additional wrapper. Do not weaken or overload `validateExtraction()`.
- [x] Keep semantic cache compatible but profile-isolated, so generic cached extraction cannot satisfy profile-aware extraction.

## Contradictions Resolved In The Spec

- [x] `--profile` is not the only activation path. `graphify.yaml` and `--config` are explicit project opt-ins and therefore compatible with the additive contract.
- [x] `graphify . --config graphify.yaml` must not pretend to perform assistant semantic extraction from a pure local CLI if no assistant/provider path exists. The local CLI/runtime can validate config, run local dataprep, produce prompts, validate fragments, and report; the skill orchestrates assistant extraction.
- [x] Profile reports and profile artifacts are additive. They do not replace `GRAPH_REPORT.md`, `graph.json`, `graph.html`, or `.graphify/wiki/index.md`.

## File Responsibility Map

- [x] `src/project-config.ts`: discover and load `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, `.graphify/config.yml`; resolve physical input paths; normalize dataprep defaults.
- [x] `src/ontology-profile.ts`: load YAML/JSON ontology profiles; validate semantic constraints; bind profile registry declarations to project config registry sources.
- [x] `src/profile-registry.ts`: load CSV/JSON/YAML registries; map configured columns to canonical records; convert records to base-valid Graphify extraction fragments.
- [x] `src/configured-dataprep.ts`: expand configured inputs, apply exclusions, call `detect()` and `prepareSemanticDetection()`, load registries, and write deterministic `.graphify/profile/` artifacts.
- [x] `src/profile-prompts.ts`: build profile-aware extraction prompts for skills and chunked semantic extraction.
- [x] `src/profile-validate.ts`: run `validateExtraction()` first, then enforce profile node, relation, citation, status, and registry constraints.
- [x] `src/profile-report.ts`: write profile QA reports from config, profile, registries, graph, and validation results.
- [x] `src/paths.ts`: add typed profile artifact paths under `.graphify/profile/`.
- [x] `src/cache.ts`: add optional profile cache namespace/hash support without changing current generic cache keys.
- [x] `src/skill-runtime.ts`: expose deterministic runtime commands for skills.
- [x] `src/cli.ts`: expose minimal public profile/config commands without disrupting existing commands.
- [x] `src/skills/*`: add the configured-project branch to every distributed assistant skill, with platform-specific syntax preserved.
- [x] `src/index.ts`: export public profile/config types and helper functions.
- [x] `tests/fixtures/profile-demo/`: synthetic config, profile, registries, docs, generated-artifact folders, and expected normalized outputs.

---

## Lot 0 - Baseline And Spec Alignment

**Files:**
- Read: `spec/SPEC_ONTOLOGY_DATAPREP_PROFILES.md`
- Read: `spec/SPEC_GRAPHIFY.md`
- Read: `spec/SPEC_PDF_OCR_PREPROCESSING.md`
- Modify: `PLAN.md`
- Modify only if contradictory: `spec/SPEC_ONTOLOGY_DATAPREP_PROFILES.md`

- [x] **Step 0.1: Verify working tree before implementation**

Run:

```bash
git status --short --branch
```

Expected: only intended docs/spec changes are present before code implementation starts.

- [x] **Step 0.2: Verify baseline tests before code changes**

Run:

```bash
npm run lint
npm run build
npm test
git diff --check
```

Expected: baseline is green or any pre-existing failure is recorded before implementation starts.

- [x] **Step 0.3: Record the activation rule**

The implementation PR must state:

```text
Profile activation requires one of: discovered project config, --config, --profile.
No config/profile activation means no behavior change.
```

## Lot 1 - Project Config Types And Loader

**Files:**
- Modify: `src/types.ts`
- Create: `src/project-config.ts`
- Modify: `src/index.ts`
- Create: `tests/project-config.test.ts`
- Modify: `tests/public-api.test.ts`

- [x] **Step 1.1: Add failing public type/export tests**

Add assertions that `GraphifyProjectConfig`, config loader functions, and normalized config result types are exported from `src/index.ts`.

Run:

```bash
npx vitest run tests/public-api.test.ts
```

Expected before implementation: export assertions fail.

- [x] **Step 1.2: Define project config types**

Add additive TypeScript types for:

```text
GraphifyProjectConfig
GraphifyProjectConfigProfile
GraphifyProjectInputs
GraphifyDataprepPolicy
GraphifyOutputPolicy
NormalizedProjectConfig
ProjectConfigDiscoveryResult
ProjectConfigValidationIssue
```

- [x] **Step 1.3: Add config discovery tests**

Cover discovery order:

```text
graphify.yaml
graphify.yml
.graphify/config.yaml
.graphify/config.yml
```

Expected: first existing file in the documented order wins.

- [x] **Step 1.4: Implement config discovery and loading**

Implement:

```text
discoverProjectConfig(root)
loadProjectConfig(configPath)
parseProjectConfig(raw, sourcePath)
normalizeProjectConfig(config, sourcePath)
validateProjectConfig(config)
```

- [x] **Step 1.5: Resolve paths relative to config**

Tests must prove:

```text
profile.path resolves relative to config file
inputs.corpus resolves relative to config file
inputs.registries resolves relative to config file
inputs.generated resolves relative to config file
inputs.exclude resolves relative to config file
outputs.state_dir defaults to .graphify
```

- [x] **Step 1.6: Verify project config loader**

Run:

```bash
npx vitest run tests/project-config.test.ts tests/public-api.test.ts
npm run lint
npm run build
```

Expected: project config loader tests, lint, and build pass.

## Lot 2 - Ontology Profile Types And Loader

**Files:**
- Modify: `src/types.ts`
- Create: `src/ontology-profile.ts`
- Modify: `src/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/ontology-profile.test.ts`

- [x] **Step 2.1: Add direct YAML dependency**

Add `yaml` as a direct dependency. Do not rely on transitive dependencies.

- [x] **Step 2.2: Add failing profile loader tests**

Cover:

```text
valid YAML profile
valid JSON profile
missing id
missing version
invalid node type map
invalid relation source type
invalid relation target type
registry referencing unknown config registry source
stable profile hash
default status from hardening.default_status
```

- [x] **Step 2.3: Define ontology profile types**

Add:

```text
OntologyProfile
OntologyNodeType
OntologyRelationType
OntologyRegistrySpec
OntologyCitationPolicy
OntologyHardeningPolicy
OntologyStatus
ProfileBinding
```

- [x] **Step 2.4: Implement profile loading**

Implement:

```text
loadOntologyProfile(profilePath, options)
parseOntologyProfile(raw, sourcePath)
normalizeOntologyProfile(profile)
bindOntologyProfile(profile, normalizedProjectConfig)
hashOntologyProfile(profile)
validateOntologyProfile(profile)
```

- [x] **Step 2.5: Keep semantics separate from paths**

Profile loader may bind named registry sources from project config, but it must not encode project-specific physical path conventions.

- [x] **Step 2.6: Verify ontology profile loader**

Run:

```bash
npx vitest run tests/ontology-profile.test.ts tests/project-config.test.ts
npm run lint
npm run build
```

Expected: ontology loader tests, config tests, lint, and build pass.

## Lot 3 - Synthetic Fixture Set

**Files:**
- Create: `tests/fixtures/profile-demo/graphify.yaml`
- Create: `tests/fixtures/profile-demo/graphify/ontology-profile.yaml`
- Create: `tests/fixtures/profile-demo/references/components.csv`
- Create: `tests/fixtures/profile-demo/references/tooling.csv`
- Create: `tests/fixtures/profile-demo/raw/manuals/manual.md`
- Create: `tests/fixtures/profile-demo/derived/full-page-screenshots/page-001.png` or text stub if image binary is unnecessary
- Create: `tests/fixtures/profile-demo/expected/project-config-normalized.json`
- Create: `tests/fixtures/profile-demo/expected/profile-normalized.json`

- [x] **Step 3.1: Create synthetic project config fixture**

The fixture config must include:

```text
profile.path
inputs.corpus
inputs.registries
inputs.generated
inputs.exclude
dataprep.pdf_ocr
dataprep.prefer_ocr_markdown
dataprep.use_extracted_pdf_images
dataprep.full_page_screenshot_vision
outputs.state_dir
```

- [x] **Step 3.2: Create synthetic ontology profile fixture**

Use synthetic types only:

```text
MaintenanceProcess
Component
Procedure
Tool
Figure
```

Use synthetic relations only:

```text
inspects
replaces
requires_tool
evidences
depicts
```

- [x] **Step 3.3: Create synthetic registry fixtures**

Registry rows must use fake IDs and labels such as:

```text
CMP-001, Demo Filter Cartridge, DFC-001
TOOL-001, Demo Torque Fixture, DTF-001
```

- [x] **Step 3.4: Add fixture hygiene check**

Run:

```bash
rg -n "customer|partner|client|proprietary|confidential|real project|production asset|account" tests/fixtures/profile-demo
```

Expected: no output.

## Lot 4 - Registry Loader And Canonical Records

**Files:**
- Create: `src/profile-registry.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/profile-registry.test.ts`

- [x] **Step 4.1: Add direct CSV dependency**

Add `csv-parse` as a direct dependency and use `csv-parse/sync` for deterministic fixture tests.

- [x] **Step 4.2: Add failing registry loader tests**

Cover:

```text
CSV registry from configured source
JSON registry from configured source
YAML registry from configured source
id_column mapping
label_column mapping
alias_columns mapping
raw field preservation
sourceFile provenance
duplicate record ID rejection
unknown configured registry source rejection
```

- [x] **Step 4.3: Define canonical registry record**

Implement the spec shape:

```text
RegistryRecord {
  registryId
  id
  label
  aliases
  nodeType
  sourceFile
  raw
}
```

- [x] **Step 4.4: Implement registry loading**

Implement:

```text
loadProfileRegistries(binding)
loadProfileRegistry(registrySpec, sourcePath)
normalizeRegistryRecord(registrySpec, rawRecord, sourceFile)
```

- [x] **Step 4.5: Verify registry loader**

Run:

```bash
npx vitest run tests/profile-registry.test.ts tests/ontology-profile.test.ts
npm run lint
npm run build
```

Expected: registry loader, profile loader, lint, and build pass.

## Lot 5 - Registry To Graphify Extraction Conversion

**Files:**
- Modify: `src/profile-registry.ts`
- Modify: `tests/profile-registry.test.ts`
- Modify: `tests/validate.test.ts`

- [x] **Step 5.1: Add failing registry extraction tests**

Assert registry records convert to a base-valid `Extraction` with:

```text
nodes
edges: []
hyperedges: []
input_tokens: 0
output_tokens: 0
```

- [x] **Step 5.2: Implement stable registry node IDs**

Use deterministic node IDs:

```text
registry_<registryId>_<recordId>
```

Normalize unsafe characters while keeping stable mapping.

- [x] **Step 5.3: Preserve profile attributes on nodes**

Registry node attributes must include:

```text
node_type
registry_id
registry_record_id
aliases
status
profile_id
profile_version
profile_hash
source_file
file_type: document
```

- [x] **Step 5.4: Do not infer registry edges by default**

Only create edges when a later explicit profile mapping is introduced. This lot emits registry nodes only.

- [x] **Step 5.5: Verify base validation compatibility**

Run:

```bash
npx vitest run tests/profile-registry.test.ts tests/validate.test.ts
```

Expected: registry extraction passes `validateExtraction()`; existing validation tests still pass.

## Lot 6 - Profile Paths And Configured Dataprep

**Files:**
- Modify: `src/paths.ts`
- Create: `src/configured-dataprep.ts`
- Create: `tests/configured-dataprep.test.ts`
- Modify: `tests/pipeline.test.ts`

- [x] **Step 6.1: Add profile path contract tests**

Expected profile paths:

```text
.graphify/profile/project-config.normalized.json
.graphify/profile/ontology-profile.normalized.json
.graphify/profile/profile-state.json
.graphify/profile/registries/
.graphify/profile/registry-extraction.json
.graphify/profile/semantic-detection.json
.graphify/profile/dataprep-report.md
```

- [x] **Step 6.2: Implement profile paths**

Extend `resolveGraphifyPaths()` with a `profile` path group while preserving all existing fields.

- [x] **Step 6.3: Add configured dataprep tests**

Cover:

```text
configured corpus roots are included
configured generated roots are included when semantically useful
configured exclude roots are removed before detection
full-page screenshot folder is excluded from image semantic extraction when full_page_screenshot_vision is false
prepareSemanticDetection() is called with configured PDF/OCR policy
registry extraction is written
dataprep report is written
```

- [x] **Step 6.4: Implement configured dataprep**

Implement:

```text
runConfiguredDataprep(root, options)
buildConfiguredDetectionInputs(config)
applyConfiguredExcludes(detection, config)
writeProfileState(result)
```

- [x] **Step 6.5: Reuse existing PDF/OCR/transcript pipeline**

`configured-dataprep.ts` must call `prepareSemanticDetection()` and must not import provider-specific OCR modules directly.

- [x] **Step 6.6: Verify dataprep**

Run:

```bash
npx vitest run tests/configured-dataprep.test.ts tests/pipeline.test.ts
npm run lint
npm run build
```

Expected: configured dataprep tests pass and existing pipeline tests remain unchanged.

## Lot 7 - Profile-Isolated Semantic Cache

**Files:**
- Modify: `src/cache.ts`
- Modify: `src/skill-runtime.ts`
- Create or modify: `tests/cache.test.ts`
- Modify: `tests/cli-runtime.test.ts`

- [x] **Step 7.1: Add failing cache isolation tests**

Prove:

```text
generic cache hit does not satisfy profile cache
profile A cache does not satisfy profile B cache
same profile hash can reuse profile cache
generic cache API remains backward compatible
```

- [x] **Step 7.2: Implement optional cache namespace**

Add optional cache namespace/profile hash parameters to cache helpers. Default behavior must write/read the same paths as today.

- [x] **Step 7.3: Thread namespace through runtime commands**

Add optional `--cache-namespace <value>` or `--profile-state <path>` to semantic cache runtime commands used by profile mode.

- [x] **Step 7.4: Verify cache behavior**

Run:

```bash
npx vitest run tests/cache.test.ts tests/cli-runtime.test.ts
npm run lint
npm run build
```

Expected: generic cache tests and profile cache isolation tests pass.

## Lot 8 - Profile-Aware Validation

**Files:**
- Create: `src/profile-validate.ts`
- Create: `tests/profile-validate.test.ts`
- Modify: `tests/validate.test.ts`
- Modify: `src/index.ts`

- [x] **Step 8.1: Add failing validation wrapper tests**

Cover:

```text
base invalid extraction returns base validation errors
unknown node_type is an error for profile-aware nodes
unknown relation is an error
incompatible source node type is an error
incompatible target node type is an error
missing source_file citation is an error when required
missing page citation is an error when minimum_granularity is page
registry-backed type without registry link is an error or warning per hardening policy
generic AST code nodes without node_type are accepted
```

- [x] **Step 8.2: Implement profile validation wrapper**

Implement:

```text
validateProfileExtraction(extraction, profileState, options)
profileValidationResultToMarkdown(result)
profileValidationResultToJson(result)
```

The first operation must be `validateExtraction(extraction)`.

- [x] **Step 8.3: Keep issue severities machine-readable**

Use explicit severities:

```text
error
warning
info
```

- [x] **Step 8.4: Verify profile validation**

Run:

```bash
npx vitest run tests/profile-validate.test.ts tests/validate.test.ts
npm run lint
npm run build
```

Expected: profile validation is enforced only by the wrapper.

## Lot 9 - Profile Prompt Builder

**Files:**
- Create: `src/profile-prompts.ts`
- Create: `tests/profile-prompts.test.ts`
- Modify: `src/index.ts`

- [x] **Step 9.1: Add failing prompt builder tests**

Assert prompt output includes:

```text
allowed node types
allowed relation types
registry matching rules
citation policy
status/hardening rules
configured input hints
JSON Extraction output schema
instruction to avoid invented proprietary ontology content
chunk-specific document/paper/image guidance
```

- [x] **Step 9.2: Implement prompt builder**

Implement:

```text
buildProfileExtractionPrompt(profileState, options)
buildProfileChunkPrompt(profileState, chunk, options)
buildProfileValidationPrompt(profileState, extraction, options)
```

- [x] **Step 9.3: Bound prompt size**

Registry context must include counts and small synthetic-safe samples, not entire large registries.

- [x] **Step 9.4: Verify prompts**

Run:

```bash
npx vitest run tests/profile-prompts.test.ts
npm run lint
npm run build
```

Expected: prompts are deterministic, profile-aware, and generic.

## Lot 10 - Runtime Commands For Skills

**Files:**
- Modify: `src/skill-runtime.ts`
- Modify: `tests/cli-runtime.test.ts`

- [x] **Step 10.1: Add failing runtime command tests**

Add tests for:

```text
project-config --root <dir> --out <json> --profile-out <json>
configured-dataprep --root <dir> --config <file> --out-dir .graphify
profile-prompt --profile-state <file> --out <md>
profile-validate-extraction --profile-state <file> --input <json> --json
profile-report --profile-state <file> --graph <graph.json> --out <md>
```

- [x] **Step 10.2: Implement runtime commands**

Commands must write deterministic files and return non-zero on invalid config/profile/extraction.

- [x] **Step 10.3: Preserve existing runtime commands**

Existing commands such as `detect`, `prepare-semantic-detect`, `check-semantic-cache`, `merge-semantic`, `merge-extraction`, and `finalize-build` must keep their current arguments and behavior.

- [x] **Step 10.4: Verify runtime**

Run:

```bash
npx vitest run tests/cli-runtime.test.ts
npm run lint
npm run build
```

Expected: new profile runtime commands pass and existing runtime command tests still pass.

## Lot 11 - Public CLI Surface

**Files:**
- Modify: `src/cli.ts`
- Modify: `tests/cli.test.ts`

- [x] **Step 11.1: Add failing CLI tests**

Cover:

```text
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
graphify . --config graphify.yaml does not run fake LLM extraction from local CLI
graphify . without config/profile preserves existing behavior
```

- [x] **Step 11.2: Implement minimal `profile` namespace**

Add:

```text
graphify profile validate
graphify profile dataprep
graphify profile validate-extraction
graphify profile report
```

- [x] **Step 11.3: Add config/profile flags carefully**

If a standalone `graphify <path>` route exists during implementation, add `--config` and `--profile` there. If it does not, add a tested safe path fallback or `build [path]` route without stealing existing subcommands.

- [x] **Step 11.4: Fail clearly without assistant/provider semantic extraction**

The local CLI must not claim to complete profile semantic extraction unless it has actually received/validated extraction JSON or is running inside an assistant skill flow.

- [x] **Step 11.5: Verify CLI**

Run:

```bash
npx vitest run tests/cli.test.ts tests/cli-runtime.test.ts
npm run lint
npm run build
```

Expected: profile CLI commands pass and existing CLI commands remain unchanged.

## Lot 12 - Assistant Skills Configured-Project Branch

**Files:**
- Modify: `src/skills/skill-codex.md`
- Modify: `src/skills/skill.md`
- Modify: `src/skills/skill-gemini.toml`
- Modify: `src/skills/skill-opencode.md`
- Modify: `src/skills/skill-claw.md`
- Modify: `src/skills/skill-droid.md`
- Modify: `src/skills/skill-trae.md`
- Modify: `src/skills/skill-windows.md`
- Modify: `src/skills/skill-vscode.md`
- Modify: `src/skills/skill-kiro.md`
- Modify: `tests/skills.test.ts`
- Modify: `tests/codex-integration.test.ts`

- [x] **Step 12.1: Add failing skill tests**

Assert every distributed skill includes the same profile/config contract, adapted to its platform invocation syntax:

```text
config discovery before normal detection
profile activation rule
configured-dataprep runtime command
profile prompt runtime command
profile validation runtime command
profile report runtime command
fallback to existing flow when no config/profile is active
```

- [x] **Step 12.2: Update Codex skill workflow**

Add a branch:

```text
if graphify.yaml/.graphify/config.yaml exists or invocation includes --config/--profile:
  run project-config/configured-dataprep
  use profile semantic detection and profile prompt
  run semantic extraction as today
  validate base extraction
  validate profile extraction
  merge registry, AST and semantic extraction
  finalize through existing build/report/export runtime commands
  write profile QA report
else:
  keep existing non-profile workflow
```

- [x] **Step 12.3: Propagate equivalent workflow to non-Codex skills**

Apply the same configured-project branch to:

```text
Claude skill: /graphify syntax
Gemini skill: TOML command syntax
OpenCode skill: /graphify syntax
OpenClaw skill: /graphify syntax
Factory Droid skill: /graphify syntax
Trae skill: /graphify syntax
Windows Claude skill: PowerShell-compatible snippets where present
VS Code Copilot skill: Copilot instruction wording
Kiro skill: Kiro skill and steering wording
```

Do not blindly copy Codex shell snippets into platforms that use different command or shell conventions.

- [x] **Step 12.4: Preserve runtime proof**

Skills that already prove the TypeScript runtime must still verify `.graphify/.graphify_runtime.json` contains `"runtime": "typescript"`. Skills without runtime-proof blocks must still tell users to use the TypeScript package and not Python fallback behavior.

- [x] **Step 12.5: Verify skill updates**

Run:

```bash
npx vitest run tests/skills.test.ts tests/codex-integration.test.ts
npm run lint
npm run build
```

Expected: skill tests pass, Codex integration tests pass, and every distributed skill documents the configured-project branch as opt-in.

## Lot 13 - Profile QA Report

**Files:**
- Create: `src/profile-report.ts`
- Create: `tests/profile-report.test.ts`
- Modify: `src/index.ts`

- [x] **Step 13.1: Add failing profile report tests**

Assert report includes:

```text
project config summary
profile id/version/hash
configured input summary
registry coverage
orphan registry records
extracted entities without registry attachment
invalid or ambiguous relations
high-degree nodes
low-evidence relation types
candidates eligible for human review
PDF/OCR sidecar summary when present
```

- [x] **Step 13.2: Implement profile report**

Write `.graphify/profile/profile-report.md` or the configured output path. Do not replace `GRAPH_REPORT.md`.

- [x] **Step 13.3: Keep report advisory**

The report is QA and review guidance. It must not label outputs as business-approved truth.

- [x] **Step 13.4: Verify report**

Run:

```bash
npx vitest run tests/profile-report.test.ts
npm run lint
npm run build
```

Expected: report is deterministic and additive.

## Lot 14 - Synthetic End-To-End Flow

**Files:**
- Create: `tests/profile-pipeline.test.ts`
- Modify only if needed: `tests/pipeline.test.ts`

- [x] **Step 14.1: Add synthetic E2E test**

Use `tests/fixtures/profile-demo` to run:

```text
project config discovery
ontology profile loading
registry loading
registry extraction conversion
configured dataprep
profile prompt generation
profile validation wrapper
profile report
graph build with registry and synthetic semantic extraction
```

- [x] **Step 14.2: Verify graph export preserves profile attributes**

Assert `graph.json` nodes preserve:

```text
node_type
registry_id
registry_record_id
status
citations
```

- [x] **Step 14.3: Verify normal pipeline remains unchanged**

Run the existing pipeline tests alongside profile E2E.

- [x] **Step 14.4: Run E2E verification**

Run:

```bash
npx vitest run tests/profile-pipeline.test.ts tests/pipeline.test.ts tests/validate.test.ts
npm run lint
npm run build
```

Expected: profile E2E passes and non-profile pipeline/validation tests pass.

## Lot 15 - Skills, READMEs, And Product Spec Updates

**Files:**
- Re-check: `src/skills/skill-codex.md`
- Re-check: `src/skills/skill.md`
- Re-check: `src/skills/skill-gemini.toml`
- Re-check: `src/skills/skill-opencode.md`
- Re-check: `src/skills/skill-claw.md`
- Re-check: `src/skills/skill-droid.md`
- Re-check: `src/skills/skill-trae.md`
- Re-check: `src/skills/skill-windows.md`
- Re-check: `src/skills/skill-vscode.md`
- Re-check: `src/skills/skill-kiro.md`
- Modify: `README.md`
- Modify: `README.ja-JP.md`
- Modify: `README.zh-CN.md`
- Modify: `spec/SPEC_GRAPHIFY.md`
- Modify: `spec/SPEC_ONTOLOGY_DATAPREP_PROFILES.md`
- Read and modify only if profile/config wording is relevant: `worked/example/README.md`
- Read and modify only if profile/config wording is relevant: `worked/httpx/README.md`
- Read and modify only if profile/config wording is relevant: `worked/karpathy-repos/README.md`
- Read and modify only if profile/config wording is relevant: `worked/mixed-corpus/README.md`

- [x] **Step 15.1: Update README in English**

Document:

```text
what project config does
what ontology profiles do
what registries do
synthetic example only
config/profile activation rule
CLI/runtime commands
skill-driven full semantic extraction
profile validation
profile QA report
LLM Wiki compatibility
no behavior change without config/profile
```

- [x] **Step 15.2: Update translated READMEs**

Mirror the English README changes in:

```text
README.ja-JP.md
README.zh-CN.md
```

Keep translations aligned structurally with `README.md` and preserve the TypeScript fork narrative.

- [x] **Step 15.3: Audit example READMEs**

Read:

```text
worked/example/README.md
worked/httpx/README.md
worked/karpathy-repos/README.md
worked/mixed-corpus/README.md
```

Update only the example READMEs that mention run flow, profile/config behavior, skill invocation, `.graphify/`, or semantic extraction. Do not add ontology-profile examples to unrelated worked examples.

- [x] **Step 15.4: Re-check all skills after docs**

After README wording is settled, re-check distributed skills for consistency:

```text
src/skills/skill-codex.md
src/skills/skill.md
src/skills/skill-gemini.toml
src/skills/skill-opencode.md
src/skills/skill-claw.md
src/skills/skill-droid.md
src/skills/skill-trae.md
src/skills/skill-windows.md
src/skills/skill-vscode.md
src/skills/skill-kiro.md
```

Expected: no skill contradicts README or claims profile mode runs without config/profile activation.

- [x] **Step 15.5: Update global product spec**

Update `spec/SPEC_GRAPHIFY.md` with:

```text
maintained branch is main
configured ontology dataprep profiles are additive
profile artifacts live under .graphify/profile/
LLM Wiki remains .graphify/wiki/index.md
MCP/embeddings/database remain deferred for this feature
```

- [x] **Step 15.6: Update profile spec after implementation**

Reflect actual command names, artifact paths, cache isolation mechanism, validation behavior, and deferred items.

- [x] **Step 15.7: Verify docs and skills**

Run:

```bash
git diff --check
npx vitest run tests/skills.test.ts tests/codex-integration.test.ts
rg -n "v3[-]typescript|TO[D]O|TB[D]" README.md README.ja-JP.md README.zh-CN.md spec PLAN.md src/skills
```

Expected: skill tests pass, no stale branch references unless historical, and no placeholder markers.

## Lot 16 - Final Verification, Graph Refresh, And Commit Discipline

**Files:**
- Modify after code changes: `.graphify/`

- [x] **Step 16.1: Run full test suite**

Run:

```bash
npm run lint
npm run build
npm test
git diff --check
```

Expected: all pass.

- [x] **Step 16.2: Refresh graph state**

Run after code changes:

```bash
npx graphify hook-rebuild
```

Expected: `.graphify/` is current for changed code files.

- [x] **Step 16.3: Inspect graph impact**

Run:

```bash
graphify summary --graph .graphify/graph.json
graphify review-delta --graph .graphify/graph.json
```

Expected: profile changes are localized to config/profile/dataprep/validation/skill areas.

- [x] **Step 16.4: Commit in coherent lots**

Use one commit per implementation lot or tightly coupled group:

```text
types/config loader
profile loader
fixtures/registry loader
dataprep/cache
validation/prompts
runtime/CLI/skill
report/E2E/docs
```

- [x] **Step 16.5: PR checklist**

The PR must state:

```text
profile mode is activated only by config/profile
fixtures are synthetic
PDF/OCR/transcript pipeline is reused
semantic cache is profile-isolated
base validateExtraction behavior is unchanged
full semantic extraction remains skill-orchestrated
profile QA report is additive
all distributed skills are updated
README.md and translated READMEs are updated
non-profile tests pass
```

## Deferred Out Of This Lot

- New MCP profile tools.
- Embeddings or vector search.
- Database-backed registries.
- Remote registry fetching.
- Proprietary ontology packs.
- Automatic domain ontology inference.
- Standalone provider-backed CLI semantic extraction.
- Separate profile wiki product.
- New OCR/PDF/transcript pipeline.


---

## Code Review Graph Alignment Roadmap

Orientation specs:

```text
spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md
spec/SPEC_CODE_REVIEW_GRAPH_OPPORUNITY.md
```

Primary reference implementation:

```text
tirth8205/code-review-graph v2.3.2
commit db2d2df789c25a101e33477b898c1840fb4c7bc7
package version 2.3.2
local inspection clone: /tmp/code-review-graph-v2.3.2
```

Product decision:

```text
Clone code-review-graph review algorithms conceptually.
Keep Graphify generic and TypeScript-first.
Keep .graphify/graph.json as the source of truth.
Use a Graphify adapter instead of adopting SQLite as default storage.
Only deviate from code-review-graph when the deviation preserves Graphify's existing architecture.
```

### Accepted Decisions

- [x] F1A: maintain durable upstream traceability in `UPSTREAM_GAP.md` rather than only branch-local specs.
- [x] F2A: audit Safi Python Graphify v4 periodically as conceptual lineage, not strict commit-by-commit parity.
- [x] CRG alignment principle: each review feature starts with a spec phase that cites the exact CRG source files, functions, tests, and intentional Graphify deviations.
- [x] CRG alignment principle: implementation phases port CRG tests or equivalent Vitest fixtures before production code.
- [x] CRG alignment principle: F11 report/wiki enrichment is included in this roadmap, but implemented after F7 flows exist.

### Preparation Completed

- [x] Merged the two research branches into `main` before extending this roadmap.
- [x] Removed obsolete research worktrees after confirming their branches were contained in `main`.
- [x] Refreshed local graph context with `graphify update .`.
- [x] Treat refreshed `.graphify` output as working context only until input-scope excludes generated `dist/` artifacts from graph rebuilds.
- [x] Used Codex 5.4 xhigh agents for parallel CRG plan refinement.

### Execution Sequence

This is the required implementation order even though F4 is the user-facing first-call tool:

- [x] F1 source lock and durable traceability.
- [x] F2 Python Graphify v4 drift audit.
- [x] F3 review graph store adapter.
- [x] F7 execution flows.
- [x] F8 affected flows.
- [x] F5 review context and blast radius.
- [x] F6 risk-scored detect changes.
- [x] F4 minimal context first-call tool.
- [x] F10 skills and LLM review workflow.
- [x] F11 report, wiki, and HTML enrichment after F7/F8 flow artifacts exist.
- [ ] F12 benchmarks, honesty metrics, and known limits.

F9 is a gate, not only a standalone feature: every algorithmic feature below must port the relevant CRG behavior tests before runtime code is accepted.

### F1 - Source Lock And Durable Traceability

CRG source basis:

```text
code-review-graph docs/architecture.md
code-review-graph docs/COMMANDS.md
code-review-graph CHANGELOG.md
```

Graphify target:

```text
UPSTREAM_GAP.md becomes the durable source-lock and decision table.
spec/SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md remains the dated research snapshot.
```

- [x] **Spec phase:** Write `spec/SPEC_UPSTREAM_TRACEABILITY.md` using `SPEC_UPSTREAM_DUAL_CATCHUP_2026_04.md` as the initial source-lock table.
- [x] **Spec phase:** Record exact refs for Safi Python Graphify v4, Safi Python `v0.4.23`, and CRG `v2.3.2`.
- [x] **Spec phase:** Define row states `covered`, `intentional-delta`, `deferred`, `rejected`, `needs-review`.
- [x] **Spec phase:** Define a rule that local tags are never trusted when `git fetch --tags` reports clobber risk.
- [x] **Implementation phase:** Update `UPSTREAM_GAP.md` with the durable source-lock table.
- [x] **Implementation phase:** Add an upstream refresh checklist to `PLAN.md`.
- [x] **Verification phase:** Run `git diff --check`.
- [x] **Commit:** `docs: lock upstream traceability refs`

### F2 - Safi Python Graphify v4 Drift Audit

CRG source basis:

```text
Not a CRG feature.
This preserves the original Python Graphify lineage while CRG informs review features.
```

Graphify target:

```text
Python v4 is audited for conceptual drift.
TypeScript deltas remain intentional: .graphify, npm, faster-whisper-ts, OCR/PDF, lifecycle, review commands.
```

- [x] **Spec phase:** Extend `spec/SPEC_UPSTREAM_TRACEABILITY.md` with a Python v4 audit section.
- [x] **Spec phase:** Define the allowed result types: docs-only, parity-needed, intentional-delta, obsolete-upstream.
- [x] **Implementation phase:** Update `UPSTREAM_GAP.md` with latest Python v4 refs and drift summary.
- [x] **Implementation phase:** Update README only if Python v4 changed user-facing behavior worth mentioning.
- [x] **Verification phase:** Run `git diff --check`.
- [x] **Commit:** `docs: refresh python graphify v4 drift audit`

### F3 - ReviewGraphStoreLike Adapter

CRG source basis:

```text
code_review_graph/graph.py: GraphStore
code_review_graph/tools/review.py: get_review_context(), detect_changes_func()
code_review_graph/tools/context.py: get_minimal_context()
code_review_graph/changes.py: analyze_changes(), map_changes_to_nodes(), compute_risk_score()
code_review_graph/flows.py: trace_flows(), get_affected_flows()
```

What CRG does:

```text
All review tools query SQLite-backed GraphStore primitives:
nodes by file, node by qualified name, edges by source/target, communities, flow memberships, transitive tests.
```

Graphify target:

```text
Implement the same review-facing interface over .graphify/graph.json and Graphology.
Do not introduce SQLite as default storage.
Keep an optional index/cache sidecar deferred unless performance forces it.
```

- [x] **Spec phase:** Write `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md` as the umbrella spec for F3-F12.
- [x] **Spec phase:** Define `ReviewGraphStoreLike` methods matching CRG review needs.
- [x] **Spec phase:** Map CRG `GraphNode` fields to Graphify nodes, including `id`, `name`, `qualified_name`, `kind`, `file_path`, `line_start`, `line_end`, `is_test`, `community_id`, and `extra`.
- [x] **Spec phase:** Record deviations where Graphify lacks line ranges or TESTED_BY edges and define fallback behavior.
- [x] **Implementation phase:** Create `src/review-store.ts`.
- [x] **Implementation phase:** Create `tests/review-store.test.ts`.
- [x] **Implementation phase:** Load from `graph.json`, normalize paths, expose node/edge query helpers, and preserve current graph JSON schema.
- [x] **Verification phase:** Run `npm test -- tests/review-store.test.ts`.
- [x] **Verification phase:** Run `npm run lint`, `npm run build`, `npm test`, `git diff --check`.
- [x] **Commit:** `feat(review): add graph review store adapter`

### F4 - Minimal Context First Tool

CRG source basis:

```text
code_review_graph/tools/context.py: get_minimal_context()
code-review-graph CLAUDE.md: first call must be get_minimal_context()
code-review-graph docs/LLM-OPTIMIZED-REFERENCE.md: target <=5 tool calls and <=800 context tokens
```

What CRG does:

```text
Returns ultra-compact task orientation:
graph stats, risk if git changes exist, top communities, top critical flows, key affected entities, and next tool suggestions.
Task keywords choose suggestions for review, debug, refactor, onboard, or architecture.
```

Graphify target:

```text
Add `graphify minimal-context` and skill-runtime equivalent.
Output stays compact and machine-readable.
Use Graphify's existing summary/community data plus F3 adapter and F7 flows when available.
Implement after F7, F8, F5, and F6 even though this is the recommended first assistant call.
```

- [x] **Spec phase:** Add F4 details to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Copy CRG output contract conceptually: `summary`, `risk`, `key_entities`, `communities`, `flows_affected`, `next_tool_suggestions`.
- [x] **Spec phase:** Define behavior before flows exist: omit `flows_affected` or return empty list with `flows_available=false`.
- [x] **Spec phase:** Define compactness budget based on CRG `<=800` context-token guidance and Graphify's existing `summary` output.
- [x] **Implementation phase:** Create `src/minimal-context.ts`.
- [x] **Implementation phase:** Create `tests/minimal-context.test.ts`.
- [x] **Implementation phase:** Add CLI command `minimal-context --task <task> --base <ref> --graph <path>`.
- [x] **Implementation phase:** Add skill-runtime command for assistant workflows.
- [x] **Implementation phase:** Keep MCP/serve surface deferred; no parallel API contract added.
- [x] **Verification phase:** Port CRG behavior tests for review/debug/refactor/onboard suggestion routing.
- [x] **Verification phase:** Assert compact output does not require reading raw source files wholesale.
- [x] **Verification phase:** Run targeted tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(review): add minimal context entrypoint`

### F5 - Review Context And Blast Radius

CRG source basis:

```text
code_review_graph/tools/review.py: get_review_context()
code_review_graph/tools/review.py: _extract_relevant_lines()
code_review_graph/tools/review.py: _generate_review_guidance()
code-review-graph skills/review-delta/SKILL.md
code-review-graph skills/review-pr/SKILL.md
```

What CRG does:

```text
Auto-detects changed files from git.
Computes impact radius at max_depth=2.
Returns changed files, impacted files, changed nodes, impacted nodes, edges, optional source snippets, and review guidance.
Minimal mode returns only counts, risk, key entities, test gap count, and next tools.
```

Graphify target:

```text
Add `graphify review-context` rather than hiding this under existing `review-delta`.
Keep compatibility by letting `review-delta` call or reference the same implementation later.
Use F3 adapter and existing Graphify review blast-radius helpers where equivalent.
```

- [x] **Spec phase:** Add F5 details to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Define `detail_level=minimal|standard` and `include_source` behavior aligned with CRG.
- [x] **Spec phase:** Define source-snippet safety caps and sensitive-file exclusions.
- [x] **Spec phase:** Decide where existing `review-delta` and `review-analysis` delegate to the new CRG-aligned implementation without breaking current outputs.
- [x] **Implementation phase:** Create `src/review-context.ts`.
- [x] **Implementation phase:** Create `tests/review-context.test.ts`.
- [x] **Implementation phase:** Add CLI and skill-runtime commands.
- [x] **Implementation phase:** Generate review guidance for test gaps, wide blast radius, inheritance edges, and cross-file impact.
- [x] **Verification phase:** Port CRG review context tests using synthetic TypeScript/Python fixtures.
- [x] **Verification phase:** Run targeted tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(review): add focused review context`

### F6 - Risk-Scored Detect Changes

CRG source basis:

```text
code_review_graph/changes.py: parse_git_diff_ranges()
code_review_graph/changes.py: _parse_unified_diff()
code_review_graph/changes.py: map_changes_to_nodes()
code_review_graph/changes.py: compute_risk_score()
code_review_graph/changes.py: analyze_changes()
code_review_graph/tools/review.py: detect_changes_func()
tests/test_changes.py
```

What CRG does:

```text
Runs `git diff --unified=0`.
Parses file hunks to changed line ranges.
Maps ranges to function/class/test nodes by line overlap.
Falls back to file-level nodes when line ranges are absent.
Scores each changed node with flow participation, cross-community callers, test coverage, security keywords, and caller count.
Returns risk score, changed functions, affected flows, test gaps, and top review priorities.
```

Graphify target:

```text
Add `graphify detect-changes` aligned with CRG.
Use F3 adapter, F7 flows, and existing Graphify edge/community data.
Keep `review-analysis` as existing API, but allow it to reuse detect-changes later.
```

- [x] **Spec phase:** Add F6 details to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Copy CRG risk factors and weights as initial defaults.
- [x] **Spec phase:** Define fallback when Graphify nodes lack `line_start` and `line_end`.
- [x] **Spec phase:** Define safe git ref validation based on CRG `_SAFE_GIT_REF`.
- [x] **Spec phase:** Define dirty-worktree behavior: warn permanently, analyze explicitly requested refs/files, and never mutate git state.
- [x] **Implementation phase:** Create `src/detect-changes.ts`.
- [x] **Implementation phase:** Create `tests/detect-changes.test.ts`.
- [x] **Implementation phase:** Port CRG unified-diff parser tests.
- [x] **Implementation phase:** Port CRG risk scoring tests for untested functions, security keywords, caller count, and flow participation.
- [x] **Implementation phase:** Add CLI and skill-runtime commands.
- [x] **Verification phase:** Run targeted tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(review): add risk-scored detect changes`

### F7 - Execution Flows

CRG source basis:

```text
code_review_graph/flows.py: detect_entry_points()
code_review_graph/flows.py: trace_flows()
code_review_graph/flows.py: compute_criticality()
code_review_graph/flows.py: store_flows()
code_review_graph/flows.py: incremental_trace_flows()
tests/test_flows.py
```

What CRG does:

```text
Detects entry points through no incoming CALLS, framework decorators, and conventional names.
Traces forward BFS through CALLS edges with max_depth=15 and cycle detection.
Skips trivial single-node flows.
Scores criticality with file spread 0.30, external calls 0.20, security sensitivity 0.25, test gap 0.15, depth 0.10.
Persists flows and flow memberships in SQLite.
```

Graphify target:

```text
Port CRG heuristics and weights to TypeScript with minimal changes.
Persist derived flow artifacts under `.graphify/flows.json` or embed as optional generated output.
Do not require a database.
```

- [x] **Spec phase:** Add F7 details to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Copy CRG entrypoint decorator/name patterns into a TypeScript constants section.
- [x] **Spec phase:** Define Graphify flow artifact schema: `name`, `entry_point`, `path`, `depth`, `node_count`, `file_count`, `files`, `criticality`.
- [x] **Spec phase:** Define whether `tests` are excluded by default and how `include_tests` works.
- [x] **Implementation phase:** Create `src/flows.ts`.
- [x] **Implementation phase:** Create `tests/flows.test.ts`.
- [x] **Implementation phase:** Port CRG tests for roots, decorators, name patterns, test exclusion, cycles, max depth, multi-file flows, and criticality.
- [x] **Implementation phase:** Add CLI commands `flows build`, `flows list`, and `flows get`.
- [x] **Implementation phase:** Add skill-runtime commands for list/get.
- [x] **Verification phase:** Run targeted flow tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(review): derive execution flows`

### F8 - Affected Flows

CRG source basis:

```text
code_review_graph/flows.py: get_affected_flows()
code_review_graph/tools/review.py: get_affected_flows_func()
code_review_graph/main.py: get_affected_flows_tool()
```

What CRG does:

```text
Finds nodes belonging to changed files.
Finds flows containing those node IDs.
Returns affected flows sorted by criticality with step details.
Works as a separate tool so agents expand only when needed.
```

Graphify target:

```text
Add `graphify affected-flows`.
Use F7 flow artifacts and F3 adapter.
Expose as a separate skill-runtime command and reference it from minimal-context and detect-changes suggestions.
```

- [x] **Spec phase:** Add F8 details to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Define changed-file discovery from explicit `--files` or `--base`.
- [x] **Implementation phase:** Add affected-flow query to `src/flows.ts` or create `src/affected-flows.ts`.
- [x] **Implementation phase:** Add `tests/affected-flows.test.ts`.
- [x] **Implementation phase:** Add CLI and skill-runtime commands.
- [x] **Verification phase:** Test affected flows are sorted by criticality and include step details.
- [x] **Verification phase:** Run targeted tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(review): add affected flow analysis`

### F9 - Port CRG Tests Before Runtime Changes

CRG source basis:

```text
tests/test_changes.py
tests/test_flows.py
tests/test_tools.py
tests/test_integration_v2.py
tests/test_prompts.py
tests/test_skills.py
tests/test_wiki.py
tests/test_eval.py
```

What CRG does:

```text
Validates algorithm behavior with synthetic fixtures before MCP usage.
Tests diff parsing, line overlap, dedupe, risk scoring, entrypoint detection, BFS tracing, cycles, depth limits, and multi-file flow metadata.
Also tests prompt/skill workflow, wiki generation, evaluation metrics, and full-pipeline integration.
```

Graphify target:

```text
Every CRG-aligned feature starts RED by porting the relevant CRG test semantics to Vitest.
Fixtures remain synthetic and generic.
```

- [ ] **Spec phase:** Add a CRG test-porting matrix to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [ ] **Spec phase:** For every CRG test copied conceptually, record source test path and Graphify target test path.
- [ ] **Spec phase:** Define fixture fields required for functions, classes, tests, CALLS edges, TESTED_BY-style edges, communities, flows, changed ranges, and line metadata.
- [ ] **Implementation phase:** Create fixture helpers for review graph nodes, calls, TESTED_BY edges, communities, and flows.
- [ ] **Implementation phase:** Port flow tests before prompt/report/benchmark tests because later features depend on reliable flow artifacts.
- [ ] **Implementation phase:** Port change/risk tests before minimal-context and review-context tests because those outputs depend on changed-node accuracy.
- [ ] **Implementation phase:** Keep each feature's tests in its feature file rather than one giant test file.
- [ ] **Verification phase:** Require RED/GREEN evidence in every feature commit.
- [ ] **Verification phase:** Include one integration fixture that exercises changed files, affected flows, test gaps, report/wiki enrichment, and benchmark metrics together.
- [ ] **Commit:** Fold test-port commits into each feature lot rather than one separate commit unless shared test helpers are needed.

### F10 - Skills And LLM Review Workflow

CRG source basis:

```text
code-review-graph CLAUDE.md
code-review-graph docs/LLM-OPTIMIZED-REFERENCE.md
code-review-graph skills/review-delta/SKILL.md
code-review-graph skills/review-pr/SKILL.md
code_review_graph/main.py: MCP tool registration
code_review_graph/prompts.py
code_review_graph/skills.py
```

What CRG does:

```text
For agent workflows, always starts with get_minimal_context.
Uses detail_level=minimal unless more detail is needed.
Targets <=5 graph tool calls and <=800 tokens of graph context.
Escalates from minimal context to detect_changes, affected_flows, and review_context based on risk.
Provides prompt/workflow templates for review, architecture mapping, debugging, onboarding, and pre-merge checks.
```

Graphify target:

```text
Update Graphify skills to make `$graphify minimal-context` the first review call.
Keep Codex syntax `$graphify`, not Claude slash syntax.
Preserve existing Graphify commands for non-review graph usage.
Expose CLI/skill workflow first; add MCP prompt/tool parity only after the CLI contract is stable.
```

- [x] **Spec phase:** Add F10 skill workflow to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Define review workflow states: orient, detect, expand flows, expand snippets, final review.
- [x] **Spec phase:** Map CRG tool names to Graphify commands: `get_minimal_context`, `detect_changes`, `get_affected_flows`, and `get_review_context`.
- [x] **Spec phase:** Define dirty worktree warning interaction with input-scope once that branch lands.
- [x] **Spec phase:** Define stale graph behavior: warn first, rebuild when appropriate, and do not trust stale semantic review output.
- [x] **Implementation phase:** Update `src/skills/skill-codex.md`, `src/skills/skill.md`, `src/skills/skill-gemini.toml`, and other distributed skills.
- [x] **Implementation phase:** Keep MCP prompts/tools deferred; no second behavior contract added.
- [x] **Implementation phase:** Add `tests/skills.test.ts` assertions for minimal-context first-call guidance.
- [x] **Implementation phase:** Preserve existing workflows for build, update, query, summary, review-delta, review-analysis, review-eval, and recommend-commits.
- [x] **Verification phase:** Run `npm test -- tests/skills.test.ts tests/codex-integration.test.ts`.
- [x] **Verification phase:** Run lint, build, full tests, `git diff --check`.
- [x] **Commit:** `docs(skills): align review workflow with code-review-graph`

### F11 - Report, Wiki, And HTML Enrichment After Flows

CRG source basis:

```text
code_review_graph/wiki.py: community pages include execution flows through the community
code_review_graph/visualization.py: flow highlighting support
code-review-graph README.md: blast radius and flow visualization narrative
code_review_graph/tools/build.py: precomputed summaries
tests/test_wiki.py
tests/test_visualization.py
```

What CRG does:

```text
Once flows exist, wiki pages list execution flows through each community.
Visualization can highlight an active flow by dimming unrelated nodes and edges.
This is downstream of flow detection, not a prerequisite for review analysis.
Build tooling precomputes summaries so report/wiki/tooling do not repeatedly traverse the whole graph.
```

Graphify target:

```text
Implement after F7 and F8, in the same roadmap.
Add optional sections to GRAPH_REPORT.md and .graphify/wiki.
Add HTML flow highlighting only if current exporter can support it without a full rewrite.
Keep existing Graphify god nodes, surprises, hyperedges, communities, ambiguous nodes, knowledge gaps, suggested questions, and audit sections intact.
```

- [x] **Spec phase:** Add F11 report/wiki/html section to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [x] **Spec phase:** Define report sections: top critical flows, affected flows for current diff, high-risk nodes, test gaps.
- [x] **Spec phase:** Define wiki sections: flows through community and flow membership links.
- [x] **Spec phase:** Define slug-collision behavior compatible with CRG's unique slug suffixing while preserving current Graphify wiki links.
- [x] **Spec phase:** Define HTML behavior as optional and non-blocking if graph is too large.
- [x] **Implementation phase:** Modify `src/report.ts` and `src/wiki.ts`; keep HTML highlighting deferred to avoid a renderer rewrite.
- [x] **Implementation phase:** Render flow/review sections only when grounded data exists; no placeholder sections that look authoritative.
- [x] **Implementation phase:** Add `tests/report.test.ts` and `tests/wiki.test.ts`; skip focused HTML tests because HTML behavior is deferred.
- [x] **Verification phase:** Generate a synthetic graph with flows and verify report/wiki include CRG-style flow sections.
- [x] **Verification phase:** Port wiki tests for expected sections, generated index links, idempotent generation, empty graph handling, and slug collisions.
- [x] **Verification phase:** Run report/wiki/export tests, lint, build, full tests, `git diff --check`.
- [x] **Commit:** `feat(output): add flow-aware report and wiki sections`

### F12 - Benchmarks, Honesty Metrics, And Known Limits

CRG source basis:

```text
code_review_graph/eval/benchmarks/impact_accuracy.py
code_review_graph/eval/benchmarks/flow_completeness.py
code_review_graph/eval/benchmarks/token_efficiency.py
code_review_graph/eval/token_benchmark.py
code_review_graph/eval/scorer.py
code_review_graph/eval/runner.py
code_review_graph/eval/reporter.py
code-review-graph README.md benchmark and limitations sections
tests/test_eval.py
```

What CRG does:

```text
Documents that impact analysis favors recall over precision.
Reports impact accuracy as conservative.
Measures token efficiency and flow completeness.
Admits flow detection is weaker on some language/framework combinations.
Simulates review, architecture, debug, onboarding, and pre-merge workflows against expected outputs.
```

Graphify target:

```text
Add review benchmark/UAT fixtures before claiming CRG-equivalent behavior.
Report false positives honestly.
Do not overclaim flow quality in languages where parser metadata is weak.
Use deterministic local fixtures by default; do not import CRG's network clone runner into the default test path.
```

- [ ] **Spec phase:** Add F12 benchmark section to `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md`.
- [ ] **Spec phase:** Define benchmark case schema: graph input, changed files or diff ranges, expected impacted nodes/files/flows, expected tests, and expected review summary facts.
- [ ] **Spec phase:** Define metrics: changed-node recall, impacted-file precision, impacted-file recall, impacted-file F1, token budget, flow completeness, test-gap recall, false-positive count.
- [ ] **Spec phase:** Define output format for both Markdown and machine-readable JSON benchmark results.
- [ ] **Implementation phase:** Add `tests/review-benchmark.test.ts` or `tests/review-uat.test.ts` with synthetic repositories.
- [ ] **Implementation phase:** Add a CLI/internal command only if it is useful for maintainers; otherwise keep benchmarks as tests.
- [ ] **Documentation phase:** Document known limits in README after implementation.
- [ ] **Documentation phase:** Label token measurements as estimates unless measured from actual model calls.
- [ ] **Verification phase:** Run benchmark tests and full suite.
- [ ] **Commit:** `test(review): add code review graph alignment benchmarks`

### Deferred CRG Features

- [ ] Keep SQLite storage deferred behind a separate storage/index spec.
- [ ] Keep embeddings and semantic search deferred behind a separate privacy and provider spec.
- [ ] Keep VS Code extension work deferred behind a separate package spec.
- [ ] Keep multi-repo registry and cross-repo search deferred behind a separate multi-repo spec.
- [ ] Keep notebook/language additions outside this CRG review roadmap unless selected in a dedicated input-surface spec.

### Release Gate For CRG-Aligned Review Features

- [ ] `spec/SPEC_CODE_REVIEW_GRAPH_ALIGNMENT.md` exists and cites CRG source files/functions/tests.
- [ ] Every accepted feature has a spec phase completed before implementation.
- [ ] Every algorithmic feature ports CRG tests or equivalent Vitest fixtures before implementation.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.
- [ ] `npx graphify hook-rebuild` or `graphify update .` runs after code changes.
- [ ] `.graphify` output does not include transient worktree paths.
- [ ] README and skills describe only implemented review behavior.

---

## Research Backlog - LLM Wiki Benchmark

Source spec: `spec/SPEC_LLM_WIKI_BENCHMARK_2026_04.md`. This is a research backlog, not implemented behavior.

- [x] Merge the April 2026 LLM wiki benchmark study branch into main as docs-only material.
- [ ] Review the retained benchmark set before turning recommendations into product roadmap items.
- [ ] Decide whether to specify a `.graphify/wiki/` v2 contract with article manifests, stable IDs, citations, stale metadata, and reading paths.
- [ ] Decide whether to expose agent/MCP wiki tools for index, read, search, graph path explain, and wiki lint.
- [ ] Decide whether to add token-aware context packs for wiki articles, communities, paths, and review impact.
- [ ] Decide whether to add reviewable wiki rebuild bundles with manual-edit protection.
- [ ] Decide whether to add provenance/lifecycle labels for observed, documented, inferred, reviewed, edited, stale, and retired wiki facts.
- [ ] Decide whether to add Mermaid validation/repair and click-to-source metadata.
- [ ] Keep optional semantic search adapters deferred until wiki/MCP/token contracts are accepted.
- [ ] Re-check stars, releases, package versions, and downloads before citing benchmark numbers externally.

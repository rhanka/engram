# Ontology Dataprep Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic configured-project `ontology dataprep profiles` mode that lets Graphify load project config, ontology profile constraints, synthetic-style registries, and profile-aware validation while preserving the normal non-configured Graphify behavior.

**Architecture:** This is an additive layer over the existing TypeScript pipeline. Project config and ontology profiles normalize inputs before calling `detect()` and `prepareSemanticDetection()`, registry records become ordinary Graphify `Extraction` fragments, profile validation wraps `validateExtraction()`, and graph build/report/export/wiki remain the existing pipeline. Full semantic extraction remains assistant/skill orchestrated in this lot; CLI/runtime commands expose deterministic local discovery, dataprep, validation, prompt and reporting steps.

**Tech Stack:** TypeScript, Node.js 20+, Commander, Vitest, existing Graphify modules, direct `yaml` dependency for YAML parsing, direct `csv-parse` dependency for CSV registries, existing PDF/OCR/transcript preparation.

---

## Scope And Compatibility Rules

- [ ] Profile behavior activates only when Graphify discovers a project config, receives `--config`, or receives `--profile`.
- [ ] A committed `graphify.yaml` is an explicit project opt-in. Without config/profile activation, existing commands and skills must behave exactly as they do today.
- [ ] Do not introduce real customer, partner, project, dataset, registry, or proprietary ontology examples into code, docs, fixtures, tests, or package assets.
- [ ] Use synthetic equipment-maintenance fixtures only.
- [ ] Do not add new MCP tools, embeddings, vector stores, databases, remote registry fetching, or a forked PDF/OCR/transcript pipeline in this lot.
- [ ] Reuse `detect()`, `prepareSemanticDetection()`, PDF/OCR sidecars, semantic cache mechanics, `validateExtraction()`, build, report, export, and wiki.
- [ ] Keep `.graphify/` as the state root. Profile artifacts live under `.graphify/profile/`.
- [ ] Keep base `Extraction`, `GraphNode`, `GraphEdge`, and `Hyperedge` backward compatible.
- [ ] Keep profile validation as an additional wrapper. Do not weaken or overload `validateExtraction()`.
- [ ] Keep semantic cache compatible but profile-isolated, so generic cached extraction cannot satisfy profile-aware extraction.

## Contradictions Resolved In The Spec

- [ ] `--profile` is not the only activation path. `graphify.yaml` and `--config` are explicit project opt-ins and therefore compatible with the additive contract.
- [ ] `graphify . --config graphify.yaml` must not pretend to perform assistant semantic extraction from a pure local CLI if no assistant/provider path exists. The local CLI/runtime can validate config, run local dataprep, produce prompts, validate fragments, and report; the skill orchestrates assistant extraction.
- [ ] Profile reports and profile artifacts are additive. They do not replace `GRAPH_REPORT.md`, `graph.json`, `graph.html`, or `.graphify/wiki/index.md`.

## File Responsibility Map

- [ ] `src/project-config.ts`: discover and load `graphify.yaml`, `graphify.yml`, `.graphify/config.yaml`, `.graphify/config.yml`; resolve physical input paths; normalize dataprep defaults.
- [ ] `src/ontology-profile.ts`: load YAML/JSON ontology profiles; validate semantic constraints; bind profile registry declarations to project config registry sources.
- [ ] `src/profile-registry.ts`: load CSV/JSON/YAML registries; map configured columns to canonical records; convert records to base-valid Graphify extraction fragments.
- [ ] `src/configured-dataprep.ts`: expand configured inputs, apply exclusions, call `detect()` and `prepareSemanticDetection()`, load registries, and write deterministic `.graphify/profile/` artifacts.
- [ ] `src/profile-prompts.ts`: build profile-aware extraction prompts for skills and chunked semantic extraction.
- [ ] `src/profile-validate.ts`: run `validateExtraction()` first, then enforce profile node, relation, citation, status, and registry constraints.
- [ ] `src/profile-report.ts`: write profile QA reports from config, profile, registries, graph, and validation results.
- [ ] `src/paths.ts`: add typed profile artifact paths under `.graphify/profile/`.
- [ ] `src/cache.ts`: add optional profile cache namespace/hash support without changing current generic cache keys.
- [ ] `src/skill-runtime.ts`: expose deterministic runtime commands for skills.
- [ ] `src/cli.ts`: expose minimal public profile/config commands without disrupting existing commands.
- [ ] `src/skills/*`: add the configured-project branch to every distributed assistant skill, with platform-specific syntax preserved.
- [ ] `src/index.ts`: export public profile/config types and helper functions.
- [ ] `tests/fixtures/profile-demo/`: synthetic config, profile, registries, docs, generated-artifact folders, and expected normalized outputs.

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

- [ ] **Step 8.1: Add failing validation wrapper tests**

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

- [ ] **Step 8.2: Implement profile validation wrapper**

Implement:

```text
validateProfileExtraction(extraction, profileState, options)
profileValidationResultToMarkdown(result)
profileValidationResultToJson(result)
```

The first operation must be `validateExtraction(extraction)`.

- [ ] **Step 8.3: Keep issue severities machine-readable**

Use explicit severities:

```text
error
warning
info
```

- [ ] **Step 8.4: Verify profile validation**

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

- [ ] **Step 9.1: Add failing prompt builder tests**

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

- [ ] **Step 9.2: Implement prompt builder**

Implement:

```text
buildProfileExtractionPrompt(profileState, options)
buildProfileChunkPrompt(profileState, chunk, options)
buildProfileValidationPrompt(profileState, extraction, options)
```

- [ ] **Step 9.3: Bound prompt size**

Registry context must include counts and small synthetic-safe samples, not entire large registries.

- [ ] **Step 9.4: Verify prompts**

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

- [ ] **Step 10.1: Add failing runtime command tests**

Add tests for:

```text
project-config --root <dir> --out <json> --profile-out <json>
configured-dataprep --root <dir> --config <file> --out-dir .graphify
profile-prompt --profile-state <file> --out <md>
profile-validate-extraction --profile-state <file> --input <json> --json
profile-report --profile-state <file> --graph <graph.json> --out <md>
```

- [ ] **Step 10.2: Implement runtime commands**

Commands must write deterministic files and return non-zero on invalid config/profile/extraction.

- [ ] **Step 10.3: Preserve existing runtime commands**

Existing commands such as `detect`, `prepare-semantic-detect`, `check-semantic-cache`, `merge-semantic`, `merge-extraction`, and `finalize-build` must keep their current arguments and behavior.

- [ ] **Step 10.4: Verify runtime**

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

- [ ] **Step 11.1: Add failing CLI tests**

Cover:

```text
graphify profile validate --config graphify.yaml
graphify profile dataprep . --config graphify.yaml
graphify profile validate-extraction --profile-state .graphify/profile/profile-state.json --input extraction.json
graphify profile report --profile-state .graphify/profile/profile-state.json --graph .graphify/graph.json --out .graphify/profile/profile-report.md
graphify . --config graphify.yaml does not run fake LLM extraction from local CLI
graphify . without config/profile preserves existing behavior
```

- [ ] **Step 11.2: Implement minimal `profile` namespace**

Add:

```text
graphify profile validate
graphify profile dataprep
graphify profile validate-extraction
graphify profile report
```

- [ ] **Step 11.3: Add config/profile flags carefully**

If a standalone `graphify <path>` route exists during implementation, add `--config` and `--profile` there. If it does not, add a tested safe path fallback or `build [path]` route without stealing existing subcommands.

- [ ] **Step 11.4: Fail clearly without assistant/provider semantic extraction**

The local CLI must not claim to complete profile semantic extraction unless it has actually received/validated extraction JSON or is running inside an assistant skill flow.

- [ ] **Step 11.5: Verify CLI**

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

- [ ] **Step 12.1: Add failing skill tests**

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

- [ ] **Step 12.2: Update Codex skill workflow**

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

- [ ] **Step 12.3: Propagate equivalent workflow to non-Codex skills**

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

- [ ] **Step 12.4: Preserve runtime proof**

Skills that already prove the TypeScript runtime must still verify `.graphify/.graphify_runtime.json` contains `"runtime": "typescript"`. Skills without runtime-proof blocks must still tell users to use the TypeScript package and not Python fallback behavior.

- [ ] **Step 12.5: Verify skill updates**

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

- [ ] **Step 13.1: Add failing profile report tests**

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

- [ ] **Step 13.2: Implement profile report**

Write `.graphify/profile/profile-report.md` or the configured output path. Do not replace `GRAPH_REPORT.md`.

- [ ] **Step 13.3: Keep report advisory**

The report is QA and review guidance. It must not label outputs as business-approved truth.

- [ ] **Step 13.4: Verify report**

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

- [ ] **Step 14.1: Add synthetic E2E test**

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

- [ ] **Step 14.2: Verify graph export preserves profile attributes**

Assert `graph.json` nodes preserve:

```text
node_type
registry_id
registry_record_id
status
citations
```

- [ ] **Step 14.3: Verify normal pipeline remains unchanged**

Run the existing pipeline tests alongside profile E2E.

- [ ] **Step 14.4: Run E2E verification**

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

- [ ] **Step 15.1: Update README in English**

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

- [ ] **Step 15.2: Update translated READMEs**

Mirror the English README changes in:

```text
README.ja-JP.md
README.zh-CN.md
```

Keep translations aligned structurally with `README.md` and preserve the TypeScript fork narrative.

- [ ] **Step 15.3: Audit example READMEs**

Read:

```text
worked/example/README.md
worked/httpx/README.md
worked/karpathy-repos/README.md
worked/mixed-corpus/README.md
```

Update only the example READMEs that mention run flow, profile/config behavior, skill invocation, `.graphify/`, or semantic extraction. Do not add ontology-profile examples to unrelated worked examples.

- [ ] **Step 15.4: Re-check all skills after docs**

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

- [ ] **Step 15.5: Update global product spec**

Update `spec/SPEC_GRAPHIFY.md` with:

```text
maintained branch is main
configured ontology dataprep profiles are additive
profile artifacts live under .graphify/profile/
LLM Wiki remains .graphify/wiki/index.md
MCP/embeddings/database remain deferred for this feature
```

- [ ] **Step 15.6: Update profile spec after implementation**

Reflect actual command names, artifact paths, cache isolation mechanism, validation behavior, and deferred items.

- [ ] **Step 15.7: Verify docs and skills**

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

- [ ] **Step 16.1: Run full test suite**

Run:

```bash
npm run lint
npm run build
npm test
git diff --check
```

Expected: all pass.

- [ ] **Step 16.2: Refresh graph state**

Run after code changes:

```bash
npx graphify hook-rebuild
```

Expected: `.graphify/` is current for changed code files.

- [ ] **Step 16.3: Inspect graph impact**

Run:

```bash
graphify summary --graph .graphify/graph.json
graphify review-delta --graph .graphify/graph.json
```

Expected: profile changes are localized to config/profile/dataprep/validation/skill areas.

- [ ] **Step 16.4: Commit in coherent lots**

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

- [ ] **Step 16.5: PR checklist**

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

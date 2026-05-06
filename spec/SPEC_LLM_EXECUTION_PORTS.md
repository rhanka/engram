# SPEC_LLM_EXECUTION_PORTS

## Status

- Product: Graphify TypeScript port
- Scope: provider-neutral LLM execution boundaries for optional advanced dataprep and explicit headless extraction
- Activation: explicit config or assistant skill flow only
- Default behavior: no direct LLM provider calls

This spec defines narrow execution ports for optional Graphify features that need text or vision reasoning. It separates Graphify core from provider SDKs, API keys, batch APIs and external LLM mesh runtimes. The current direct-provider implementation uses Vercel AI SDK as a temporary adapter layer; the port is intentionally narrow so it can be replaced by the future Entropic SDK.

## Problem

Graphify's core architecture is assistant-first:

- deterministic local commands prepare inputs
- assistant skills perform semantic extraction
- Graphify validates, builds, clusters, reports and exports

New optional dataprep features need a clean way to choose between:

- the current assistant path, where Codex/Claude/Gemini does the work
- batch provider calls, where Graphify writes requests and imports results
- a custom mesh/runtime, such as a separately published internal provider layer

Without explicit ports, provider logic will leak into PDF/OCR preparation, image routing, profile validation and ontology compilation.

## Goals

- Keep Graphify core provider-neutral.
- Make direct LLM execution opt-in.
- Support assistant, direct, batch and mesh/custom modes with the same logical contracts.
- Keep secrets outside committed config and generated artifacts.
- Make model and provider selection explicit.
- Allow future adapters without changing core dataprep logic.

## Non-Goals

- Do not add a resident Graphify backend.
- Do not make Vercel AI SDK a permanent product abstraction. It is allowed as a temporary direct-provider adapter until the Entropic SDK replaces it.
- Do not make Graphify responsible for organization-wide model governance.
- Do not add embeddings or vector stores.
- Do not make provider calls during default `$graphify`.
- Do not store raw API keys in `.graphify/`.

## Compatibility Contract

Without explicit config:

- no provider runtime is constructed
- no API key is read
- no batch request is written
- no direct text or vision model call is made
- assistant semantic extraction keeps the existing behavior

Existing commands that use assistant skills remain valid. Optional LLM ports only serve new advanced flows that explicitly request them.

## Execution Modes

`assistant`

- Default for advanced semantic work.
- Graphify writes manifests, prompts and validation contracts.
- The active assistant performs reasoning and writes sidecars.
- No API key is required by Graphify runtime.

`batch`

- Graphify writes provider-neutral or adapter-specific batch requests.
- A provider adapter handles upload/submission/status/download/import.
- Batch outputs are normalized into Graphify sidecars.
- Provider credentials are required through environment variables or local uncommitted config.

`direct`

- Graphify calls a configured provider directly through the temporary Vercel AI SDK adapter.
- Supported providers are OpenAI, Anthropic, Google Gemini, Mistral and Cohere.
- This mode is explicit only: command flag or `llm_execution.mode: direct`.
- Provider credentials are read from environment variables only.
- The implementation keeps upstream-style token-aware chunking, bounded parallelism and retry/merge outside the provider SDK.
- This mode must be removable without changing Graphify extraction, validation, build, report or export contracts.

`mesh`

- Graphify calls a local or package-provided LLM mesh adapter.
- The mesh owns provider selection, retries, quotas and policy.
- Graphify still validates normalized responses against its schemas.

`off`

- Graphify prepares deterministic artifacts only.
- No assistant prompt, provider request or mesh call is produced.

## Human Review And Ambiguity Policy

Default ambiguity policy is `review-required non-blocking`.

Rules:

- Provider outputs that fail schema validation are rejected, not repaired silently.
- Provider outputs that pass schema validation but carry uncertain semantics are marked `needs_review`.
- `needs_review` records remain auditable and can feed reports.
- `needs_review` records cannot be promoted into hardened ontology outputs or accepted routing matrices.
- Human or assistant review can create labels, proposed rules, or review decisions, but deterministic Graphify replay and validation own acceptance.

## Config Shape

Synthetic config:

```yaml
llm_execution:
  mode: assistant
  provider: none
  text_json:
    model: env:GRAPHIFY_TEXT_MODEL
  vision_json:
    primary_model: env:GRAPHIFY_IMAGE_PRIMARY_MODEL
    deep_model: env:GRAPHIFY_IMAGE_DEEP_MODEL
  batch:
    provider: env:GRAPHIFY_BATCH_PROVIDER
    completion_window: 24h
  mesh:
    adapter: env:GRAPHIFY_LLM_MESH_ADAPTER
```

Rules:

- `mode: assistant` is valid without provider credentials.
- `mode: direct` requires a supported provider and provider credential environment variable.
- `mode: batch` requires a provider adapter and credentials.
- `mode: mesh` requires an adapter package or local module.
- `env:NAME` references are resolved at runtime and never written back with secret values.
- Model names are never implied by Graphify core.

## Core Ports

The TypeScript implementation should expose narrow interfaces.

```ts
export interface TextJsonGenerationClient {
  readonly mode: "assistant" | "direct" | "batch" | "mesh";
  readonly provider: string;
  readonly model?: string;
  generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;
}
```

```ts
export interface VisionJsonAnalysisClient {
  readonly mode: "assistant" | "direct" | "batch" | "mesh";
  readonly provider: string;
  readonly primaryModel?: string;
  readonly deepModel?: string;
  analyzeImage(input: VisionJsonAnalysisInput): Promise<VisionJsonAnalysisResult>;
}
```

```ts
export interface BatchVisionJsonClient {
  readonly provider: string;
  exportRequests(input: BatchVisionExportInput): Promise<BatchVisionExportResult>;
  importResults(input: BatchVisionImportInput): Promise<BatchVisionImportResult>;
}
```

These are logical ports. Concrete file names and class names can change during implementation, but the boundaries must remain:

- core passes normalized inputs
- adapters handle provider mechanics
- adapters return JSON values plus audit metadata
- core validates returned JSON against Graphify schemas

## Provider Boundary

Provider adapters may know about:

- HTTP endpoints
- SDK clients
- upload APIs
- batch job IDs
- retry semantics
- provider response metadata

Graphify core may know only:

- requested capability: text JSON, vision JSON, batch vision JSON
- configured model aliases
- input artifact paths and prompt payload
- expected schema name
- normalized JSON output
- audit metadata needed for reports

## Secret Handling

Secrets can be supplied by:

- environment variables
- shell session exports
- uncommitted local `.env` loaded by a consuming adapter
- external mesh runtime configuration

Secrets must not be:

- committed to Graphify examples
- written to `.graphify/`
- embedded in manifests
- included in reports
- printed in command output

Generated audit metadata can record:

- provider name
- model name
- request ID
- batch ID
- token or cost estimates when returned
- elapsed time
- non-sensitive error codes

## Assistant Adapter

The assistant adapter is a no-call adapter. It should:

- write prompt instructions
- write expected output paths
- validate that expected output sidecars appear
- fail clearly if a command tries to synchronously wait for model output without a real provider

This preserves the current skill flow and keeps Codex/Claude/Gemini as valid processing agents.

Assistant-as-calibration-analyst is a supported role:

- Graphify prepares samples, primary outputs, reports and proposed output paths.
- The assistant reviews evidence and proposes machine-readable labels or rule changes.
- Graphify replays proposed rules deterministically before accepting them.
- The assistant must not make production route decisions at runtime.

## Batch Adapter

The batch adapter should support:

- request JSONL export
- provider submission metadata
- polling or external status import
- result normalization
- failure records per item

Batch requests must include enough context for reproducibility:

- schema name
- prompt version
- image artifact reference
- page-local Markdown context
- profile hash when profile mode is active
- output path

## Mesh Adapter

The mesh adapter is for a separately managed LLM runtime. Graphify should treat it as a black box with a stable local API:

```ts
export interface LlmMeshAdapter {
  generateTextJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;
  analyzeVisionJson(input: VisionJsonAnalysisInput): Promise<VisionJsonAnalysisResult>;
  exportBatchVisionJson?(input: BatchVisionExportInput): Promise<BatchVisionExportResult>;
  importBatchVisionJson?(input: BatchVisionImportInput): Promise<BatchVisionImportResult>;
}
```

This is the preferred integration point for an external multi-provider runtime. Vercel AI SDK or any other SDK can exist behind this adapter, but should not become a Graphify core dependency unless there is a separate product decision.

## Error Behavior

- Missing config in `assistant` mode is not an error.
- Missing credentials in `batch` or `mesh` mode is a hard preflight error.
- Provider item failures are imported as item-level failures when possible.
- Invalid provider JSON is not silently repaired; it is rejected with schema errors.
- Partial results must be auditable and must not overwrite valid prior sidecars unless `--force` is explicit.

## Tests

Automated tests should cover:

- default config constructs no provider client
- `assistant` mode requires no API key
- `batch` mode fails fast without provider config
- `mesh` mode fails fast without adapter config
- `env:NAME` resolution does not leak secret values into normalized config
- assistant adapter writes instructions only
- mocked batch adapter exports and imports normalized JSON
- invalid provider JSON is rejected before downstream use
- audit metadata redacts sensitive values

## UAT

- Run baseline `$graphify .` and verify no provider initialization logs appear.
- Run image dataprep in `assistant` mode and verify only manifest/prompt artifacts are written.
- Run batch export with mocked provider config and verify JSONL is created without submitting.
- Import synthetic batch results and verify normalized sidecars pass schema validation.
- Run with a fake secret and verify it is absent from `.graphify/` artifacts and reports.

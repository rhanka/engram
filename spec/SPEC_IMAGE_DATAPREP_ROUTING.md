# SPEC_IMAGE_DATAPREP_ROUTING

## Status

- Product: Graphify TypeScript port
- Scope: optional image crop captioning and deterministic routing after OCR/PDF preparation
- State root: `.graphify/`
- Activation: explicit project config only
- Default behavior: unchanged

This spec defines a generic image dataprep layer for PDF/OCR outputs, standalone images, and generated figure crops. It is inspired by downstream technical-document pipelines, but it must remain domain-neutral and profile-driven.

## Problem

Graphify already prepares PDFs before semantic extraction:

- text-layer PDFs become Markdown sidecars
- scanned or low-text PDFs can use Mistral OCR
- OCR image artifacts can be added to semantic `files.image`
- assistant skills can inspect image artifacts during semantic extraction

The missing layer is structured image dataprep:

- identify which generated image artifacts are useful for semantic extraction
- create consistent captions and structured visual signals
- route simple images to a cheaper/fast model and complex images to a stronger model
- support offline batch processing and result import
- preserve provenance from image crop back to source document and page

This must not turn Graphify into a domain-specific document parser. The image routing vocabulary, target node types, relation types and model choices must come from project config and ontology profile extensions.

## Goals

- Add an optional image dataprep routing contract after PDF/OCR sidecar generation and before semantic extraction.
- Use OCR-extracted crops and local image inputs as first-class semantic evidence.
- Prefer cropped images and page-local OCR Markdown context over rendered full-page screenshots.
- Support deterministic routing decisions from structured caption output.
- Support three execution styles through the LLM execution ports spec: assistant, batch, and mesh/custom.
- Preserve exact provenance to original file, page, crop artifact and OCR sidecar.
- Keep Graphify generic: no built-in customer, regulated-domain, or proprietary ontology terms.

## Non-Goals

- Do not change normal `$graphify` behavior without explicit config.
- Do not hardcode model names as product defaults.
- Do not hardcode domain-specific visual classes, node types or relation types.
- Do not send rendered full-page PDF screenshots to vision models by default.
- Do not introduce embeddings, databases, MCP, or a resident backend.
- Do not replace assistant semantic extraction.
- Do not make paid LLM calls during `detect()` or normal PDF preflight.

## Compatibility Contract

The feature is inert unless one of these is true:

- project config declares `dataprep.image_analysis.enabled: true`
- CLI passes an explicit image dataprep command
- a future profile command explicitly requests image dataprep artifacts

Without activation:

- `detect()` output must not change
- `prepareSemanticDetection()` must not call any image LLM provider
- no image caption files or batch manifests are generated
- base `validateExtraction()` behavior must remain unchanged
- semantic extraction remains assistant/skill orchestrated as it is today

## Human Review And Ambiguity Policy

Default ambiguity policy is `review-required non-blocking`.

Rules:

- Graphify continues the local build when an image caption, routing signal or imported provider result is ambiguous.
- Ambiguous records are marked `needs_review`.
- Ambiguous records remain auditable sidecars, but they are excluded from hardened ontology outputs and accepted routing matrices.
- Ambiguous records are reported in dataprep/profile reports.
- Graphify must not silently promote an ambiguous image finding into an authoritative extraction, accepted routing rule or hardened ontology output.

## Pipeline Position

Image dataprep runs after these existing steps:

1. `detect()` classifies corpus files.
2. PDF preflight creates local Markdown sidecars when possible.
3. Optional Mistral OCR creates Markdown plus extracted image artifacts for low-text PDFs.
4. Office/transcript sidecars are prepared.

Image dataprep then consumes:

- OCR Markdown sidecars
- OCR-extracted image artifacts
- directly supplied image files
- optional profile registry context

It produces optional structured sidecars consumed by semantic extraction prompts, profile validation and optional ontology output compilation.

## Config Shape

Synthetic project config extension:

```yaml
dataprep:
  pdf_ocr: auto
  use_extracted_pdf_images: true
  full_page_screenshot_vision: false
  image_analysis:
    enabled: true
    mode: assistant
    artifact_source: ocr_crops
    caption_schema: generic_image_caption_v1
    routing_profile: generic_image_routing_v1
    primary_model: env:GRAPHIFY_IMAGE_PRIMARY_MODEL
    deep_model: env:GRAPHIFY_IMAGE_DEEP_MODEL
    calibration:
      rules_path: graphify/image-routing-rules.yaml
      labels_path: graphify/image-routing-labels.yaml
    max_markdown_context_chars: 8000
    batch:
      completion_window: 24h
      output_dir: .graphify/image-dataprep/batch
```

Rules:

- `mode` is defined in `SPEC_LLM_EXECUTION_PORTS.md`.
- `artifact_source: ocr_crops` means use OCR-extracted image assets, not full-page screenshots.
- `primary_model` and `deep_model` are symbolic config values. Graphify must not choose vendor-specific defaults in core.
- `caption_schema` and `routing_profile` name versioned Graphify schemas.
- Missing model/provider config in `assistant` mode is valid because the assistant performs the work.
- Missing model/provider config in `batch` or `mesh` mode fails before any partial provider call.
- `calibration.rules_path` and `calibration.labels_path` are project-owned, versionable files resolved relative to the config file.
- `.graphify/calibration/` stores run artifacts, reports and proposals; it is not the source of truth for accepted project rules.

## Artifact Contract

Generated artifacts live under `.graphify/image-dataprep/`:

```text
.graphify/image-dataprep/
  manifest.json
  captions/
    <artifact-id>.caption.json
  routing/
    <artifact-id>.routing.json
  batch/
    primary.jsonl
    deep.jsonl
    import-manifest.json
  imports/
    <provider-run-id>.json
```

`manifest.json` contains:

```json
{
  "schema": "graphify_image_dataprep_manifest_v1",
  "source_state_hash": "sha256",
  "mode": "assistant",
  "artifact_count": 0,
  "generated_at": "ISO-8601",
  "artifacts": []
}
```

Each image artifact reference contains:

```json
{
  "id": "stable-artifact-id",
  "path": ".graphify/converted/pdf/example_images/image_1.png",
  "source_file": "/absolute/source.pdf",
  "source_page": 12,
  "source_sidecar": ".graphify/converted/pdf/example.md",
  "source_kind": "ocr_crop",
  "mime_type": "image/png",
  "sha256": "sha256"
}
```

## Generic Caption Schema

`generic_image_caption_v1`:

```json
{
  "schema": "generic_image_caption_v1",
  "artifact_id": "stable-artifact-id",
  "summary": "Short neutral description of visible content.",
  "visible_text": ["literal text visible in the image"],
  "visual_content_type": "diagram",
  "semantic_density": "low|medium|high",
  "entity_candidates": [
    {
      "label": "candidate label",
      "type_hint": "profile-declared-node-type-or-generic",
      "evidence": "visible text or visual cue",
      "confidence": 0.75
    }
  ],
  "relationship_candidates": [
    {
      "source_label": "source candidate",
      "relation_hint": "profile-declared-relation-or-generic",
      "target_label": "target candidate",
      "evidence": "arrow, containment, table row, caption, or text cue",
      "confidence": 0.7
    }
  ],
  "uncertainties": ["specific uncertainty"],
  "provenance": {
    "source_file": "/absolute/source.pdf",
    "source_page": 12,
    "image_path": ".graphify/converted/pdf/example_images/image_1.png"
  }
}
```

Rules:

- `type_hint` and `relation_hint` are hints, not authoritative ontology validation.
- If a profile is active, hints should prefer declared profile node and relation types.
- If no profile is active, hints must stay generic.
- Captions must not invent IDs from registries unless visible evidence or registry context supports them.

## Generic Routing Profile

`generic_image_routing_v1`:

```json
{
  "schema": "generic_image_routing_v1",
  "artifact_id": "stable-artifact-id",
  "visual_content_type": "diagram",
  "routing_signal": "skip|primary|deep",
  "reasons": ["dense relationships", "multiple entity candidates"],
  "requires_deep_reasoning": true,
  "proposed_next_model": "config:deep_model"
}
```

Deterministic routing uses the caption plus config:

- non-content images route to `skip`
- low-density images route to `primary`
- high-density images with multiple relationships route to `deep`
- profile-specific high-value visual classes can route to `deep`
- ambiguous captions can route to `deep` only when configured

The routing engine must be deterministic TypeScript. It must not ask a model which model to use after the caption has been produced.

## Calibration-First Routing

Graphify must not ship magic default cascade rules. Deterministic rules are calibrated per project or profile.

The calibration workflow is:

1. `sample`: Graphify selects a deterministic, stratified set of image artifacts and writes `.graphify/calibration/<run-id>/samples.json`.
2. `primary`: the configured primary model or assistant flow produces `generic_image_caption_v1` plus `generic_image_routing_v1` for every sample.
3. `label`: an assistant acting as calibration analyst reviews samples, captions, and optional paired model outputs, then proposes labels in the project-owned labels file.
4. `propose`: Graphify or the assistant proposes a deterministic routing matrix in `.graphify/calibration/<run-id>/proposed-rules.yaml`.
5. `replay`: Graphify applies the proposed rules without provider calls and compares routes against labels.
6. `decide`: Graphify writes a calibration report with one decision: `accept_matrix`, `revise_matrix`, `reject_cascade`, or `pending_labels`.
7. `promote`: only an accepted matrix can be copied into the project-owned `calibration.rules_path`.

Assistant role:

- Codex, Claude, Gemini, or another assistant may act as `assistant-as-calibration-analyst`.
- The assistant can propose labels, explain false positives/false negatives, and propose rule changes.
- The assistant must not own production route decisions; TypeScript replay owns acceptance.

## Project-Owned Labels

Labels live in a versioned project file referenced by `calibration.labels_path`.

Generic label taxonomy:

```yaml
schema: graphify_image_routing_labels_v1
labels:
  - artifact_id: stable-artifact-id
    label: primary_sufficient
    rationale: OCR markdown and primary caption are enough for retrieval and ontology output.
  - artifact_id: another-artifact-id
    label: deep_useful_for_wiki
    rationale: Deep reasoning adds useful entity relationships for wiki output.
```

Allowed labels:

- `primary_sufficient`
- `deep_useful_for_retrieval`
- `deep_useful_for_wiki`
- `deep_required`
- `ambiguous`

Rules:

- Labels must be machine-readable.
- Labels must be stable enough to review in pull requests.
- Missing labels produce `pending_labels`.
- `ambiguous` labels produce `pending_labels` unless an explicit calibration policy excludes them from the gate.

## Project-Owned Routing Rules

Accepted rules live in a versioned project file referenced by `calibration.rules_path`.

Synthetic shape:

```yaml
schema: graphify_image_routing_rules_v1
decision: accept_matrix
caption_schema: generic_image_caption_v1
routing_profile: generic_image_routing_v1

routes:
  skip:
    visual_content_types: [cover, index, blank]
  primary:
    visual_content_types: [simple_view, table, photo]
  deep:
    visual_content_types: [architecture_diagram, flow_diagram]
    when:
      min_relationship_candidates: 2
      min_entity_candidates: 3
```

Rules:

- Rules are project behavior and should be committed by consuming projects when used in production.
- `.graphify/calibration/` proposals are not accepted rules.
- A production cascade must require `decision: accept_matrix`.
- If the matrix is not accepted, Graphify must block automatic cascade routing and require `assistant`, `primary-only`, or `off`.

## Calibration Gate

The default gate is strict:

- `false_primary` must be zero on labeled samples.
- `false_primary` means an artifact labeled `deep_required`, `deep_useful_for_wiki`, or `deep_useful_for_retrieval` was routed to `primary` or `skip`.
- False `deep` decisions do not block acceptance; they are reported as estimated cost overhead.
- Missing labels produce `pending_labels`.
- Ambiguous labels produce `pending_labels` unless an explicit policy excludes them from the gate.

Decision semantics:

- `accept_matrix`: the rules can be promoted and used for production cascade.
- `revise_matrix`: rules need adjustment and replay.
- `reject_cascade`: the sample shows the cascade is not useful or too unstable.
- `pending_labels`: labels are missing or unresolved.

## Batch Flow

Batch mode has four phases:

1. `plan`: collect image artifacts and produce `manifest.json`.
2. `export`: write provider-neutral JSONL requests for primary captions.
3. `route`: import primary outputs and write deep-pass JSONL requests where needed.
4. `import`: normalize provider outputs into `captions/*.json` and `routing/*.json`.

Provider-specific upload mechanics belong in the LLM execution adapter, not in this spec.

## Assistant Flow

Assistant mode does not call a provider from Graphify runtime. Instead, Graphify writes a compact manifest and prompt instructions so Codex, Claude, Gemini, or another assistant can:

- inspect listed crops
- write caption JSON sidecars
- run deterministic local routing
- inspect deep-routed crops if needed
- preserve provenance

This preserves the current skill-driven architecture and avoids hidden LLM calls.

## Validation

Validation must check:

- caption JSON schema version
- artifact IDs match `manifest.json`
- provenance paths resolve to known sidecars or input files
- `routing_signal` is one of `skip`, `primary`, `deep`
- profile hints reference declared types only when profile mode is active
- no caption sidecar can satisfy profile evidence requirements unless it has source file and page provenance

Validation warnings should not mutate the graph. They should feed profile reports and dataprep reports.

## Tests

Automated tests should cover:

- no image dataprep artifacts when config is absent
- config parsing for `dataprep.image_analysis`
- manifest generation from mocked OCR crop artifacts
- full-page screenshot exclusion by default
- caption schema validation
- deterministic routing from synthetic captions
- batch JSONL export without provider calls
- import of mocked provider outputs
- assistant mode writing instructions without requiring API keys
- profile-aware rejection of undeclared type hints

## UAT

- Run baseline `$graphify .` in a repo without config and verify no `.graphify/image-dataprep/` is created.
- Run configured assistant mode on synthetic OCR crops and verify a manifest is created without provider calls.
- Import synthetic caption outputs and verify routing sidecars are generated.
- Run profile validation and verify invalid type hints are warnings or errors according to profile policy.
- Confirm generated semantic prompts include caption sidecars when available.

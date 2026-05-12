# SPEC_WIKI_ENTITY_DESCRIPTIONS

## Status

- Product: Graphify TypeScript port
- Scope: optional source-grounded descriptions in generated wiki articles
- Spec state: baseline accepted; render-only sidecar consumption implemented; generation command/API contract specified; assistant-first generation core implemented; CLI wiring and direct provider creation remain open
- Implemented activation: explicit `graphify export wiki|obsidian --descriptions <path>` render path
- Planned activation: explicit generation command/config/skill options only
- Default behavior: unchanged

This spec defines an optional enrichment layer for Graphify wiki output. It applies to both code graphs and document/knowledge-base graphs, and it must reuse the existing LLM execution ports: assistant, direct, batch and mesh.

## Problem

The current wiki is useful for navigation, but many pages are still mostly structural: references, connections, source files, and audit counts. That is valuable for agents, but it does not read like a useful article for a human or an LLM consuming the wiki as a compact knowledge base.

Users need a short description of what an entity is and why it matters in the graph, while preserving Graphify's provenance and anti-hallucination constraints.

## Goals

- Add a short factual `Description` paragraph to wiki articles.
- Keep descriptions source-grounded and auditable.
- Support both code entities and document/domain entities.
- Support both node/entity articles and optional community descriptions.
- Reuse existing LLM execution modes: `assistant`, `direct`, `batch`, `mesh`.
- Keep generated Markdown readable while storing machine-readable description metadata.
- Avoid changing wiki output unless the feature is explicitly enabled.

## Non-Goals

- Do not make descriptions authoritative ontology state.
- Do not write descriptions into `graph.json`.
- Do not generate long mini-Wikipedia articles in the first lot.
- Do not require exact source offsets before the feature can be useful.
- Do not add a new provider abstraction outside the existing LLM execution ports.
- Do not make external provider calls unless the user explicitly enables direct/batch/mesh mode.

## User-Facing Behavior

Default wiki generation stays unchanged.

Implemented render-only CLI shape:

```bash
graphify export wiki --graph .graphify/graph.json --descriptions .graphify/wiki-descriptions.json
graphify export obsidian --graph .graphify/graph.json --descriptions .graphify/wiki-descriptions.json
```

The render path consumes an existing sidecar index and must not call a provider.

Planned generation CLI shape:

```bash
graphify . --wiki --wiki-descriptions
graphify . --wiki --wiki-descriptions --wiki-community-descriptions
graphify wiki describe --graph .graphify/graph.json --mode assistant
graphify wiki describe --graph .graphify/graph.json --mode direct --backend openai
```

Equivalent config shape:

```yaml
wiki:
  descriptions:
    enabled: true
    nodes: true
    communities: false
    style: short_factual
    insufficient_evidence: omit
```

The exact CLI names may be adjusted during implementation, but the feature must remain explicit and opt-in.

## Generation Command And API Contract

The first generation implementation should ship `graphify wiki describe` before
retrofitting the root `/graphify . --wiki` workflow. That keeps generation
separate from rendering and makes provider boundaries explicit.

Initial command shape:

```bash
graphify wiki describe --graph .graphify/graph.json --mode assistant
graphify wiki describe --graph .graphify/graph.json --mode direct --backend openai
graphify wiki describe --graph .graphify/graph.json --targets nodes --out .graphify/wiki/descriptions
graphify wiki describe --graph .graphify/graph.json --targets all --overwrite
```

Initial options:

- `--graph <path>`: source graph, default `.graphify/graph.json`
- `--mode <assistant|direct|batch|mesh>`: `assistant` and `direct` are first-class in the first implementation; `batch` and `mesh` may fail fast with clear follow-up guidance
- `--backend <provider>`: direct mode only, using the existing `DirectLlmProvider` list
- `--model <id>`: optional direct-mode model override
- `--targets <nodes|communities|all>`: node targets first, community generation optional but planned
- `--out <dir>`: default `.graphify/wiki/descriptions`
- `--overwrite` / `--force`: regenerate records even when graph hash, prompt version, provider/model and cache key still match

Generation API responsibilities:

- collect target nodes and optional target communities from the graph
- build deterministic, source-grounded prompt inputs from labels, types, source files, confidence/provenance and local graph neighborhood
- dispatch through the existing LLM execution port; assistant mode writes instructions only and does not call any provider
- write one per-target sidecar plus an index, then let `graphify export wiki|obsidian --descriptions` render them
- preserve `graph_hash`, `prompt_version`, `cache_key`, mode/provider/model and evidence metadata for invalidation
- skip or mark records as `insufficient_evidence` when source support is too weak

Current implementation slice:

- `src/wiki-description-generation.ts` collects deterministic node/community targets
- it builds source-grounded prompts from graph metadata, source refs and local neighborhoods
- assistant mode writes instructions through an injected `TextJsonGenerationClient` and records `insufficient_evidence` until an assistant writes valid output
- completed injected clients may return partial generated fields; Graphify wraps them with schema, target, graph hash, generator and cache metadata before persistence
- when `outputDir` is provided, per-target sidecars are written under that directory and the renderable index is written at `${outputDir}.json`
- CLI command wiring, provider/client construction, batch/mesh export/import and root workflow integration remain follow-up work

Cache and invalidation:

- reuse a record only when graph hash, prompt version, provider/model, target id/kind and cache key match
- treat records whose target no longer exists as stale and omit them from rendering
- never call a provider during render-only exports

Canonical target keys:

- node records are keyed by raw Graphify node id
- community index records are keyed by the numeric community id string while each sidecar keeps `target_id: "community:<id>"`
- per-target sidecar filenames must be sanitized and collision-safe

## Description Style

The first implementation generates short factual descriptions:

- 3 to 6 sentences maximum
- no speculation
- no marketing language
- no implementation advice
- no facts absent from the provided context
- plain language that works for both humans and LLM readers

For code entities, the description should explain the role of the function/class/module/service in the local graph.

For document entities, the description should explain what the entity represents in the corpus and how it relates to nearby entities.

For ontology entities, the description should use canonical entity, aliases, relations, evidence refs and validation status when present.

## Storage Contract

Descriptions are rendered into the Markdown wiki articles, but the source of the generated paragraph is a sidecar artifact.

Generated files:

```text
.graphify/wiki/
  descriptions.json
  descriptions/
    <target-id>.json
```

Markdown pages include a normal paragraph:

```markdown
## Description

Short source-grounded explanation of the entity.
```

Sidecar schema:

```json
{
  "schema": "graphify_wiki_description_v1",
  "target_id": "node-id",
  "target_kind": "node",
  "status": "generated",
  "description": "Short source-grounded explanation.",
  "evidence_refs": ["src/foo.ts", "docs/bar.md#section"],
  "confidence": 0.82,
  "cache_key": "sha256",
  "generator": {
    "mode": "assistant",
    "provider": "assistant",
    "model": null,
    "prompt_version": "wiki-description-v1"
  },
  "created_at": "ISO-8601"
}
```

When evidence is insufficient:

```json
{
  "schema": "graphify_wiki_description_v1",
  "target_id": "node-id",
  "target_kind": "node",
  "status": "insufficient_evidence",
  "description": null,
  "evidence_refs": [],
  "confidence": null,
  "cache_key": "sha256",
  "generator": {
    "mode": "assistant",
    "provider": "assistant",
    "model": null,
    "prompt_version": "wiki-description-v1"
  }
}
```

The Markdown wiki must omit the `Description` section when status is `insufficient_evidence`.

## Cache And Invalidation

Description cache keys are derived from:

- `target_id`
- graph hash
- prompt version
- execution mode
- provider/model when applicable

If any of those values change, the description is stale and must be regenerated before it is rendered.

The cache must not include API keys or local absolute paths.

## Evidence Policy

Every generated description must be source-grounded.

Rules:

- no description is valid without at least one evidence reference
- prompts must instruct the model to use only supplied context
- generated records must include `evidence_refs`
- validation rejects descriptions that reference unknown targets
- validation rejects generated descriptions with no evidence refs unless the status is `insufficient_evidence`
- insufficient evidence is recorded in the sidecar but not rendered into Markdown

## Target Selection

The first implementation should support:

- node descriptions for god node articles
- node descriptions for ontology entity pages
- optional community descriptions behind a separate flag/config field

Community descriptions are disabled by default even when node descriptions are enabled.

## LLM Execution Modes

The feature reuses existing LLM execution ports:

- `assistant`: write instructions for Codex/Claude/Gemini skill-driven generation
- `direct`: call configured direct text backend
- `batch`: export/import description-generation requests
- `mesh`: call a configured custom adapter

The prompt input should be compact and deterministic:

- target label/type/source
- source snippets or source references when available
- direct neighbors grouped by relation
- community label and top nodes
- flow context for code graphs when available
- ontology aliases/status/evidence when available

## Integration Points

Community wiki (`src/wiki.ts`):

- load validated description sidecars when writing pages
- insert `## Description` after page metadata and before structural sections
- support optional community descriptions

Ontology wiki (`src/ontology-output.ts`):

- render entity descriptions from sidecars or compile-time description map
- keep descriptions separate from canonical ontology state

Skills:

- document `--wiki-descriptions`
- in assistant mode, generate description JSON sidecars first, then rerun or continue wiki rendering
- warn about provider cost for direct/batch modes
- never invent descriptions without evidence refs

## Tests

Required tests:

- wiki output unchanged when descriptions are disabled
- generated node description is rendered into Markdown
- `insufficient_evidence` records are not rendered
- community description renders only when the community option is enabled
- cache key changes when graph hash, prompt version or model changes
- validation rejects description records with missing evidence refs
- assistant mode writes instructions without provider calls
- direct mode is covered with mocked LLM client, not real provider calls in normal CI

## UAT

Run on two corpora:

- code corpus: small TypeScript fixture with function/class/module relations
- docs corpus: `../public-domaine-mystery-sagas-pack` three-work demo

Expected UAT result:

- god node pages gain short factual descriptions
- mystery entity pages explain characters/works/events only from source-grounded context
- no description is rendered for targets with insufficient evidence
- sidecar JSON contains provenance and cache metadata

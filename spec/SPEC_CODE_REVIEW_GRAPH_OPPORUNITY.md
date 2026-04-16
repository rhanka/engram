# SPEC_CODE_REVIEW_GRAPH_OPPORUNITY

## Purpose

This document compares the current Graphify TypeScript repo against the cloned `code-review-graph` project and turns that comparison into a concrete backlog for an augmented Graphify. It is a product/spec document, not a marketing note and not a feature checklist.

The baseline for Graphify is [`spec/SPEC_GRAPHIFY.md`](/home/antoinefa/src/graphify/spec/SPEC_GRAPHIFY.md). The comparison target is the cloned repo in `/tmp/code-review-graph`.

## Scope Of Comparison

This comparison is intentionally selective. It focuses on the parts of `code-review-graph` that are strategically reusable for Graphify, and on the parts that Graphify should explicitly not copy.

Compared dimensions:

- product intent and target workflows
- graph architecture and storage model
- review and diff workflows
- assistant integration model
- data model and persistence
- evaluation and benchmarks
- install and distribution

Explicitly out of scope:

- Python runtime parity
- exact API or CLI name matching
- a wholesale rewrite of Graphify into a code-review-only tool

## Baseline Summary

### Graphify

Graphify is the maintained TypeScript port. It is a multimodal, assistant-native knowledge-graph product that turns folders into durable graph artifacts and supports code, documents, papers, images, URLs, and local audio/video transcripts. Its primary outputs are `graph.json`, `GRAPH_REPORT.md`, and `graph.html`, with optional wiki and export formats.

### code-review-graph

`code-review-graph` is a Python 3.10+ code-review product. It is centered on incremental repository parsing, review-delta analysis, blast-radius computation, flows, communities, optional embeddings, and an MCP surface designed to answer "what changed and what should I read" questions.

## High-Signal Deltas

| Dimension | Graphify today | code-review-graph today | What it means |
|---|---|---|---|
| Product center | General knowledge graph for assistants | Code-review-first review system | Graphify can borrow review workflows without narrowing its identity |
| Input scope | Code + multimodal corpora | Code-centric, with notebooks and review metadata | Graphify is broader; clone is deeper on review mechanics |
| Storage | File-based graph artifacts and caches | SQLite graph store with migrations | Clone is persistence-first; Graphify is portability-first |
| Retrieval | Graph traversal, explanation, exports | Blast radius, FTS, embeddings, review context | Clone is stronger at fast review context; Graphify is stronger at cross-assistant portability |
| Assistant surface | Multi-platform skills and runtime proof | Claude Code-centric MCP prompts and tools | Graphify has wider distribution; clone has a tighter review UX |
| Benchmarks | Build/query/report metrics, but no systematic review eval suite | Explicit eval framework and benchmark reports | Graphify needs a better measurement loop if it wants review-mode credibility |

## Product Spec Deltas

### Graphify strengths to preserve

- Multimodal scope is part of the product identity. It already covers code, documents, papers, screenshots, URLs, and audio/video transcription.
- The assistant skill model is portable across Codex, Claude, Gemini, Copilot CLI, Aider, OpenCode, Cursor, Droid, Trae, and others.
- File-based artifacts are easy to inspect, version, and hand to other tools.
- Confidence and provenance labels are explicit, which keeps the graph honest.

### code-review-graph strengths to borrow

- It frames the product around a concrete user outcome: reviewing changes with minimal context.
- It exposes review-specific vocabulary: blast radius, impacted files, test gaps, hub nodes, bridge nodes, flows, and pre-merge checks.
- It provides a compact first-hop tool for assistants before deeper analysis.

### Product delta that matters

Graphify should not become a review-only product. The best opportunity is a review-first slice on top of the existing multimodal graph: a code-review projection, a review-delta workflow, and a minimal-context first hop, while leaving the broader knowledge-graph product intact.

## Architectural Deltas

### Graphify architecture

- TypeScript runtime with Graphology as the main graph structure.
- Graph and audit outputs are file-based.
- Assistant skills call explicit runtime commands for deterministic steps.
- Multimodal inputs are normalized and merged into the same graph pipeline.

### code-review-graph architecture

- Python runtime with a SQLite persistence layer.
- Incremental update and post-process steps are part of the architecture, not only the UX.
- MCP tools are the primary assistant interface.
- Review-specific derived tables and summary views are precomputed.

### Strategic architectural implications

- Graphify should keep the TypeScript runtime and file-based artifacts as the default architecture.
- The SQLite storage model is a good idea for a review database, but it is not a good default rewrite for Graphify.
- The most reusable architectural idea is not SQLite itself; it is the split between raw graph, derived review views, and compact assistant-facing summaries.

## Workflow Deltas

### Graphify workflows

- build a graph from a workspace or path
- query, path, explain, and traverse the graph
- add external content into the graph
- watch and hook-based rebuilds
- assistant-specific install flows

### code-review-graph workflows

- build
- update
- detect-changes
- review-delta
- review-pr
- status, visualize, wiki, register, eval, serve

### Workflow opportunity

Graphify has the underlying graph substrate but not a first-class review workflow. The highest-value addition is a `review-delta` / `review-pr` layer that starts from changed files, computes a minimal impacted subgraph, and returns review guidance instead of generic graph traversal.

## Data Model And Storage Deltas

### Graphify data model

- `nodes`, `links`, and `hyperedges`
- confidence labels such as `EXTRACTED`, `INFERRED`, and `AMBIGUOUS`
- semantic provenance is explicit and visible in outputs
- the canonical artifact is `graphify-out/graph.json`

### code-review-graph data model

- SQLite `nodes`, `edges`, `metadata`, `flows`, `communities`, and FTS tables
- optional `embeddings` table
- precomputed summary tables for community, flow, and risk views
- code entities are the primary node types

### Storage implication

Graphify should not replace its file-based graph with SQLite just to mirror the clone. The better opportunity is a review-oriented derived layer on top of the existing graph:

- a code-review projection over the existing graph
- compact review summaries persisted as artifacts
- optional cache or registry layers if they materially improve review latency

## Assistant Integration Deltas

### Graphify today

- Multi-platform skills are first-class.
- Codex uses `$graphify ...`; Claude and most other assistants use `/graphify ...`.
- Platform installers write the right instructions and hooks for each client.
- The TypeScript runtime exposes explicit deterministic steps to the skills.

### code-review-graph today

- The assistant surface is narrower and review-centric.
- MCP prompts are opinionated workflows: review, architecture, debug, onboarding, pre-merge.
- The MCP tools are tailored to blast radius and review quality.

### Integration implication

Graphify should reuse the idea of compact first-hop review prompts and small assistant-facing workflow templates, but keep its broader multi-assistant installation model. The product opportunity is "review mode for many assistants", not "one assistant plugin to rule them all".

## Evaluation And Benchmark Deltas

### code-review-graph advantage

- It has explicit eval fixtures and benchmark reports for token efficiency, impact accuracy, build performance, search quality, and workflow quality.
- It can show whether a review workflow is actually cheaper and better than naive file scanning.

### Graphify gap

- Graphify has build and smoke tests, but it does not yet have an equally explicit evaluation system for review-focused workflows.

### Evaluation implication

If Graphify adds review-mode features, they should come with benchmarks. The right metrics are not just build speed:

- token savings versus raw file reads
- impacted-file recall
- precision of review context
- quality of the compact first-hop summary
- multimodal extraction regression coverage

## Install And Distribution Deltas

### code-review-graph distribution

- Python `pip` / `pipx` / `uvx`
- MCP configuration written during install
- optional dependency groups for embeddings, communities, wiki, and eval

### Graphify distribution

- npm package `graphifyy`
- assistant-specific installers
- npm/Node is already the correct release path for the current repo

### Distribution implication

Graphify should keep npm as the distribution root. The reusable idea from `code-review-graph` is not the Python packaging stack; it is the install-time preview, platform detection, and targeted configuration story.

## Opportunity Backlog For An Augmented Graphify

### P0

#### 1. `adopt` minimal-context first hop

Why:

- `code-review-graph` has a strong "ask for the small summary first" pattern.
- Graphify already has enough graph data to return a compact, assistant-friendly overview.
- This is low-risk and immediately useful across assistants.

TS repo implications:

- add a compact MCP/tool surface or CLI subcommand that returns graph size, top hubs, key communities, and the next best graph action
- wire skills so the first call is a minimal summary, not a deep traversal
- keep the response small enough to be the default entry point for large repos

#### 2. `adapt` review-delta / review-pr workflows

Why:

- This is the core feature Graphify does not yet have.
- The clone shows that a review-oriented product can be much more actionable than generic graph exploration.
- Graphify already has graph traversal, diff awareness, and analysis primitives to support it.

TS repo implications:

- add a review-specific workflow that starts from changed files or a PR diff
- compute an impacted subgraph and return prioritized findings
- expose test-gap warnings, dependency chains, and risk level
- consider `graphify review-delta` and `graphify review-pr` as first-class modes

#### 3. `adapt` blast-radius, hub, bridge, and knowledge-gap analysis

Why:

- The clone’s architecture vocabulary is sharper for maintainers and reviewers.
- Graphify already computes communities and surprising links, so this is a natural extension.

TS repo implications:

- add review-oriented report sections for hub nodes, bridge nodes, and impacted tests
- surface a "what could break" view alongside existing god-node and surprise analysis
- derive the review view from the existing graph rather than storing a separate code-review database

#### 4. `adopt` evaluation harness for review quality

Why:

- A review product needs proof, not just output.
- The clone’s eval framework is one of its strongest product assets.

TS repo implications:

- add benchmark cases for token efficiency, impact recall, and review guidance quality
- keep benchmark outputs reproducible and committed to the repo
- report both structural metrics and assistant-facing metrics

### P1

#### 5. `adapt` optional embeddings and hybrid search

Why:

- Useful for large corpora and fuzzy retrieval.
- Should remain optional, because Graphify’s core identity is graph-first, not vector-first.

TS repo implications:

- add embeddings as an opt-in accelerator, not a default storage model
- keep structural graph traversal as the primary truth
- use embeddings to improve retrieval and first-hop suggestions, not to replace the graph

#### 6. `adapt` multi-repo registry

Why:

- Valuable for teams with many repos.
- It extends Graphify from workspace-scoped to fleet-scoped without changing the core graph model.

TS repo implications:

- add an optional registry layer for multiple repositories and aliases
- keep per-repo graphs local and versioned
- support cross-repo search only when explicitly requested

#### 7. `adapt` review-oriented prompt pack and docs slices

Why:

- The clone’s `review_changes`, `architecture_map`, `debug_issue`, and `pre_merge_check` prompts are a good shape.
- Graphify already has assistant-specific skills; it can expose a tighter set of workflow prompts for review mode.

TS repo implications:

- add small assistant-facing review prompts or skill sections
- keep the prompt surfaces narrow and deterministic
- make the prompts consume the new minimal-context and review-delta primitives

#### 8. `adapt` install-time previews and better per-platform targeting

Why:

- The clone’s install flow is explicit about what it will touch.
- Graphify already supports many platforms, so better install previews would reduce footguns.

TS repo implications:

- add or preserve dry-run style previews for install actions
- keep platform detection explicit
- surface exactly which files and hooks will be written before changes are applied

### P2

#### 9. `defer` VS Code extension parity

Why:

- The clone ships an editor extension, but Graphify’s current leverage is in assistant integration and portable graph artifacts.
- An extension is useful, but it is not the highest-value reuse target.

TS repo implications:

- treat an editor extension as a later distribution surface, not part of the core graph engine work
- only build it once review-mode workflows and assistant primitives are stable

#### 10. `defer` SQLite persistence as an optional backend

Why:

- It could improve review-specific indexing and caching.
- It would also make Graphify less portable and would complicate the current file-based product identity.

TS repo implications:

- do not switch the default store
- only add SQLite if a specific review-mode performance problem cannot be solved with file artifacts and caches

### Rejections

#### 11. `reject` Python runtime and packaging model

Why:

- The current repo is explicitly a maintained TypeScript port.
- The npm/TS distribution and assistant integration model are strategic assets, not temporary scaffolding.

TS repo implications:

- do not copy the Python packaging stack
- do not move release responsibility away from npm
- keep the TS runtime as the source of truth for the maintained repo

#### 12. `reject` narrowing Graphify into a code-review-only product

Why:

- This would delete one of Graphify’s strongest differentiators: multimodal input and assistant portability.
- The best version of Graphify is augmented, not shrunk.

TS repo implications:

- add a review-focused slice on top of the existing graph
- keep docs, papers, images, URLs, and transcripts in scope
- do not make review mode the only supported workflow

## Recommended Augmented Graphify Shape

The highest-value future shape is:

- keep the current multimodal, file-based Graphify graph as the source of truth
- add a review-delta / review-pr workflow for code changes
- add a minimal-context first hop for assistants
- add blast-radius, hub, bridge, and gap analysis views as review aids
- add optional embeddings only as a retrieval accelerator
- add a multi-repo registry only if team use cases need it
- keep the TypeScript runtime and skill-based assistant integration model intact

That path borrows the strongest ideas from `code-review-graph` without copying its storage model or narrowing Graphify’s product identity.

## README And Positioning Implications

If Graphify adopts features inspired by `code-review-graph`, the README and repo narrative need to stay disciplined. The product should be presented as an augmented Graphify, not as a clone and not as a stealth pivot away from the upstream line.

Required narrative points:

- Graphify remains the maintained TypeScript port of the original Graphify product.
- `code-review-graph` is a useful comparison point and idea source for review-mode workflows, not the repository this project is trying to become.
- The repo still aligns against the original Graphify `v3` line through the mirrored `v3` branch.
- New review-oriented features should be described as an additional operating mode on top of the multimodal graph, not as a replacement product.

README evolution implied by this opportunity set:

- add a compact "branch model" section explaining `v3-typescript` versus `v3`
- add an "alignment and divergence" note explaining that upstream Graphify remains the parity anchor while review-mode ideas may be borrowed from other adjacent systems
- add a "review mode" roadmap or feature slice only after there is a real implementation surface, not while it is still a thought experiment
- avoid wording that suggests Graphify now depends on SQLite, Python packaging, or a code-review-only runtime

This matters because the repo now sits between two reference points:

- upstream Graphify for parity and product lineage
- `code-review-graph` for workflow ideas around review-mode ergonomics

The documentation should acknowledge both without becoming ambiguous about which product this repo actually ships.

## Spec Boundary

This document is an opportunity analysis, not a commitment to implement every borrowed feature. The useful questions are:

- what makes review faster and more accurate?
- what can be layered on top of the existing Graphify graph?
- what should stay out because it would weaken Graphify’s broader product?

The short answer is: adopt the review workflow, adapt the analysis and eval layers, defer editor/database extras, and reject anything that would replace Graphify’s multimodal, TS-native identity.

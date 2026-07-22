# WP6 Platform & Parity

## Objective

- [x] Deliver one tested parity/safety increment from `main` at `d9d2b23`.
- [x] Freeze Python Graphify, CodeReviewGraph, and Repowise intake decisions.
- [x] Preserve the provider-neutral embedding seam and record the mesh contract gate.
- [x] Leave WP6 and every leaf in an evidence-accurate Track state.

## Scope

- [x] Allowed: `src/serve.ts`, focused MCP tests, vector import-guard test, WP6 spec/plan, `UPSTREAM_GAP.md`, release metadata, generated graph artifacts, Track CLI events.
- [x] Forbidden: `studio/**`, `src/storage/postgres.ts`, `src/storage/types.ts`, provider-specific embedding adapters, gateway wire code, unrelated Track items, unrelated local WIP.
- [x] Conditional: `package.json`, `package-lock.json`, `CHANGELOG.md` only for a coherent patch release after implementation gates.
- [x] Conditional: `.graphify/GRAPH_REPORT.md` and `.graphify/graph.json` only from the required hook rebuild, preserving pre-existing graph changes.

## Lot 0 — Spec And Dependency Plan

- [x] Reconcile two independent `gpt-5.6-sol` `xhigh` adversarial reviews.
- [x] Commit `SPEC_EVOL_WP6_PLATFORM_PARITY` and this dependency-ordered plan.
- [x] Mark WP6, intake, and embedding specifications accurately in Track.
- [x] Record the published mesh/gateway embedding contract as an external dependency.

## Lot 1 — Bounded MCP Parity

- [x] Add a shared line-boundary response budget helper in `src/serve.ts`.
- [x] Add `token_budget` to `get_neighbors` and `get_community` schemas and handlers.
- [x] Put truncation notices at the top and bottom with shown/omitted counts and narrowing hints.
- [x] Preserve under-budget output and expose edge relation-site provenance when present.
- [x] Make traversal output cut at line boundaries with prominent honest truncation.
- [x] Add focused MCP tests for schemas, compatibility, bounds, counts, hints, and provenance.

## Lot 2 — Embedding Neutrality Guard

- [x] Add a repository test forbidding provider SDK and gateway imports under `src/storage/vector/**`.
- [x] Keep `EmbeddingProvider` injection as the active production boundary.
- [x] Do not add `MeshEmbeddingProvider` until a published mesh tarball closes the contract gate.
- [x] Run focused vector storage and import-guard tests.

## Lot 3 — Intake Ledger And Coordination

- [x] Refresh `UPSTREAM_GAP.md` to the 2026-07-22 locks and `0.17.2` baseline.
- [x] Record concrete adopt/defer/reject outputs for all three upstreams.
- [x] Record shared-root h2a conductor, mesh-owner response, subagent reviews, and collision avoidance.
- [x] Update Track through the CLI without rewriting or staging unrelated pre-existing events.

## Lot 4 — Release Gates And Completion Review

- [x] Run focused MCP and vector gates.
- [x] Run unit/integration tests, lint, and build.
- [x] Run package/tarball smoke and install UAT without publishing.
- [x] Run `graphify review-delta`, `graphify portable-check`, and `track validate` (portable-check exposed 2,510 pre-existing corpus/research path findings; see Feedback Loop).
- [x] Run `npx graphify hook-rebuild` after code edits and verify graph freshness.
- [x] Run two independent completion reviews and resolve WP6 blocking findings.

## Lot 5 — Release Decision

- [x] Prepare patch release notes against the already-pending `0.17.2`; do not create an artificial `0.17.3` skip while npm `latest` is `0.17.1`.
- [x] Verify npm identity, latest package version, tarball contents, and provenance capability; identity is unauthorized locally and CI is the only configured OIDC provenance path.
- [x] Publish only from a clean intended source with all gates green and provenance verified; no publish was attempted.
- [x] Stop at release-ready commits and state the exact human publish gate.

## Gate Evidence

- Clean isolated functional commit: `027dac8` (no shared-checkout WIP in the artifact).
- Focused: 53 passed, 4 live-database skips; lint passed.
- Full smoke: build passed; 2,418 passed, 13 intentional skips; tarball pack/install, CLI, bundled files, and library exports passed.
- Graph: `review-delta` found no likely test gaps; hook rebuild produced 8,841 nodes / 80,646 edges and `stale=false`.
- Track: acceptance runs attached to all four leaves; `track validate` passed; intake is done while parity, coordination, embedding, and WP6 remain in progress.

## Feedback Loop

- **Accepted / resolved:** completion review found an unbudgeted traversal header, under-budget seed-header compatibility regression, narrow provider-package denylist, stale Repowise head, broken h2a anchor, and incomplete plan evidence. The response envelope now includes headers/notices in the approximate bound while preserving complete under-budget headers; vector imports use an infrastructure allowlist, Repowise is locked through `210b8fa`, the anchor exists, and clean-clone evidence is recorded.
- **Rejected:** bumping to `0.17.3`. Registry evidence shows npm `latest=0.17.1`, no `v0.17.2` tag exists, and repository release tests identify `0.17.2` as the prepared candidate. Owner: WP6 conductor. Status: resolved by evidence and corrected wording.
- **Deferred / publish blocker:** `graphify portable-check .graphify` reports 2,510 pre-existing paths in corpus snapshots, historical research, fixtures, and route-like labels. WP6 changed none of those committed artifacts and did not mass-rewrite them. Owner: repository portability/data-curation follow-up. Status: open before publication under the spec's full-repository gate.
- **Deferred / publish blocker:** dependency audit reports 5 high advisories in the full install (1 high runtime through `mistral-ocr -> ws`, plus dev/optional findings) and low no-fix Ollama exposure. Owner: dependency-security follow-up. Status: open before publication; no broad lockfile refresh was folded into WP6.
- **External blocker:** npm `whoami` is `E401`; local provenance is false. The tag workflow has `id-token: write` and Trusted Publishing, but must run from merged default-branch commit `v0.17.2` after portability/security disposition. Status: no npm publish attempted.

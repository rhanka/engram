# WP6 Platform & Parity

## Objective

- [ ] Deliver one tested parity/safety increment from `main` at `d9d2b23`.
- [ ] Freeze Python Graphify, CodeReviewGraph, and Repowise intake decisions.
- [ ] Preserve the provider-neutral embedding seam and record the mesh contract gate.
- [ ] Leave WP6 and every leaf in an evidence-accurate Track state.

## Scope

- [ ] Allowed: `src/serve.ts`, focused MCP tests, vector import-guard test, WP6 spec/plan, `UPSTREAM_GAP.md`, release metadata, generated graph artifacts, Track CLI events.
- [ ] Forbidden: `studio/**`, `src/storage/postgres.ts`, `src/storage/types.ts`, provider-specific embedding adapters, gateway wire code, unrelated Track items, unrelated local WIP.
- [ ] Conditional: `package.json`, `package-lock.json`, `CHANGELOG.md` only for a coherent patch release after implementation gates.
- [ ] Conditional: `.graphify/GRAPH_REPORT.md` and `.graphify/graph.json` only from the required hook rebuild, preserving pre-existing graph changes.

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

- [ ] Refresh `UPSTREAM_GAP.md` to the 2026-07-22 locks and `0.17.2` baseline.
- [ ] Record concrete adopt/defer/reject outputs for all three upstreams.
- [ ] Record shared-root h2a conductor, mesh-owner response, subagent reviews, and collision avoidance.
- [ ] Update Track through the CLI without rewriting or staging unrelated pre-existing events.

## Lot 4 — Release Gates And Completion Review

- [ ] Run focused MCP and vector gates.
- [ ] Run unit/integration tests, lint, and build.
- [ ] Run package/tarball smoke and install UAT without publishing.
- [ ] Run `graphify review-delta`, `graphify portable-check`, and `track validate`.
- [ ] Run `npx graphify hook-rebuild` after code edits and verify graph freshness.
- [ ] Run two independent completion reviews and resolve blocking findings.

## Lot 5 — Release Decision

- [ ] Prepare patch release notes and version metadata only if the code and gates are coherent.
- [ ] Verify npm identity, latest package version, tarball contents, and provenance capability.
- [ ] Publish only from a clean intended source with all gates green and provenance verified.
- [ ] Otherwise stop at release-ready commits and state the exact human publish gate.

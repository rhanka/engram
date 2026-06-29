# SPEC_GRAPH_DB_BACKENDS (proposal)

## Status

- Stage: Draft / proposal (no implementation). Companion to
  `.graphify/scratch/DESIGN_GRAPH_DB_BACKENDS_CONCRETE.md`.
- Builds on: `SPEC_STORAGE_BACKENDS.md` (the GraphStore push port) and
  `SPEC_GRAPH_STORAGE_BACKENDS.md` (the mirror/roadmap matrix).
- Scope: a **read/aggregation projection** on the existing push-only GraphStore mirror so
  group-by, hierarchy, neighborhood, antecedence, and time-window queries are served from a
  DB (Postgres / Spanner / Neo4j) instead of recomputed client-side on a 33 MB scene.
- Non-goal: changing the canonical store. `.graphify/graph.json` stays the source of truth;
  every backend remains a pushed projection that never mutates it.

## Motivation

The process-std-am graph (47,762 nodes) ships a 33.8 MB `scene.json` and the studio recomputes
group-by in the browser on every toggle (`studio/src/lib/groupBy.js`). The merged backends
(`src/storage/{postgres,spanner,neo4j}.ts`) are real push-mirrors with only a raw-query
passthrough and one 1-hop neighbor query — they do nothing to make grouping instant. This
spec adds the missing read layer and the studio query API that consumes it.

## Normative requirements

### R1 — Derived projection, rebuilt on push

Each capable backend SHOULD, inside the SAME push transaction as the node/edge upsert,
(re)build a derived read layer keyed to the snapshot `topology_signature`:
- Group-by axis columns lifted into typed, indexable columns/properties:
  `node_type`, `community`, `class_id` + `class_path`, `registry`, `status`, `ts`, `degree`.
- A precomputed group-aggregate object: `(axis, key, label, count, parent_key)` — one row per
  group, so a group-by read is O(#groups), independent of node count.
- (Optional) a hierarchy closure (closure table or `SUBCLASS_OF*` backbone) for O(1) subtree
  fetch on hot axes.
Derived objects MUST never disagree with the committed snapshot; a failed push leaves the
previous projection intact (the existing transaction/rollback rule, `postgres.ts:606-640`).

### R2 — Capability-gated read API

Extend `GraphStoreCapabilities` (`src/storage/types.ts:9-14`) with an optional `aggregate:
boolean`. Backends that set it expose typed read methods (not just raw `query`):
`groupCounts(axis, filter?)`, `subtree(axis, key)`, `neighborhood(id, hops, limit)`,
`antecedence(id, relation, dir, limit)`, `timeline(bucket)`, `window(params)`. Callers MUST
check capabilities before use; a backend without `aggregate` falls back to in-process
computation over graph.json.

### R3 — Studio query API

The studio data layer (`studio/src/lib/api.js`) gains accessors mirroring `fetchScene` /
`fetchClassHierarchies` exactly (bundle short-circuit → server route → static fallback →
never throw): `fetchGroups`, `fetchSubtree`, `fetchNeighborhood`, `fetchAntecedence`,
`fetchTimeline`, `fetchWindow`. The server (`src/ontology-studio.ts`) gains the matching
`/api/ontology/{groups,subtree,neighborhood,antecedence,timeline,window,layer}` routes,
backed by the GraphStore read API when configured, else in-process. Static export
(`scripts/build-studio-demo.mjs`) emits `groups.json` (and per-layout position sidecars) for
offline parity.

### R4 — No 33 MB transfer

First paint MUST NOT require the full scene. It loads group aggregates (a few KB) plus a
windowed/top-N slice; detail hydrates by viewport, group expansion, or k-hop. Every
traversal/window endpoint MUST bound results with `LIMIT` + keyset/cursor paging.

### R5 — Per-layout precomputed positions

Replace the single pinned layout baked into `scene.json` (`graph-layout.ts:392-415`,
`build-studio-demo.mjs:304`) with `graph_positions(layout_id, node_id, x, y, z?)` populated
at push for each enabled layout (force / typed-layer / dag / lattice / 3d / time). Layout
switch becomes a positions query, not a client re-simulation.

## Backend applicability (summary; detail in the design doc §3)

| Workload | Postgres | Spanner (GQL) | Neo4j (Cypher) |
|---|---|---|---|
| Group-by counts | aggregate table + axis index (best to materialize) | aggregate table + secondary index | precomputed `:GroupCount` nodes |
| Hierarchy subtree | recursive CTE / closure matview | `MATCH -[:PARENT_OF]->{1,k}` | `<-[:SUBCLASS_OF*0..]-` |
| DAG / antecedence | recursive CTE + depth | quantified GQL path | `-[:PRECEDES*1..]->` (idiomatic) |
| k-hop neighborhood | bounded recursive CTE (extends `queryNeighbors`) | interleaved edges + path | `-[*1..k]-` |
| Time window/buckets | `ts` BRIN/BTREE + `date_trunc` GROUP BY | secondary index + GROUP BY | `:Entity(ts)` index |

Property-graph (Neo4j/Spanner-GQL) wins on variable-depth traversal (antecedence chains, deep
subtrees, path A→B). Relational + a counts table is equal/better for flat counts and time
buckets. Default deployment = Postgres alone (CTEs for traversal); Neo4j is the upgrade when
paths dominate.

## Lot sequence (smallest first)

LOT 0 `graphify store push` CLI wiring (registry exists, command missing) →
LOT 1 Postgres group aggregates + `/groups` + rail counts (the instant-regroupement win) →
LOT 2 subtree + k-hop (recursive CTE) →
LOT 3 windowed scene loader + `graph_positions` (kills the 33 MB transfer) →
LOT 4 time slices →
LOT 5 Neo4j/Spanner traversal endpoints →
LOT 6 per-layout precompute for display variants.

## Open decisions (owner)

1. Postgres as default process-std-am backend, Neo4j as the traversal upgrade? (recommended yes)
2. Which profile-declared node attribute is the temporal `ts`?
3. Recursive-CTE-only first vs closure matview now? (recommended: CTE first)

All requirements are additive and reversible over the unchanged canonical graph.json.

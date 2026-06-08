# SPEC_ONTOLOGY_HIERARCHIES

## Status

- Product: Graphify TypeScript port
- Scope: profile-driven ontology hierarchy generation, sidecar artifacts, studio passthrough
- Spec state: **Draft — decision surface, not yet approved**
- State root: `.graphify/`
- Activation: explicit ontology profile `hierarchies` block only
- Default behavior: unchanged and artifact-free

This spec defines how Graphify should compile hierarchy artifacts from a declared
`hierarchies` block in the ontology profile. It covers the `hierarchies.json` and
`hierarchy-index.json` sidecar, integration with the existing compile step in
`src/ontology-output.ts`, studio passthrough (already wired), and two product
decisions the owner must resolve before implementation can begin.

This spec complements `SPEC_ONTOLOGY_OUTPUT_ARTIFACTS.md` and
`SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`. It does not replace them.

This spec must remain generic. It must not introduce real customer, partner,
project, regulated-domain, or proprietary ontology examples.

---

## Problem

Graphify already accepts a `hierarchies` block in its ontology profile YAML/JSON.
The type system, normalizer, and validator for that block are fully implemented.

**`OntologyHierarchySpec`** (`src/types.ts:581-588`) declares six fields:
`registry`, `parent_column`, `child_column`, `relation_type`,
`parent_node_type`, `child_node_type`.

**`normalizeHierarchy`** (`src/ontology-profile.ts:160-169`) converts each entry
to a `NormalizedOntologyHierarchySpec` and stores the result on
`NormalizedOntologyProfile.hierarchies` (`src/types.ts:692`).

**`validateOntologyProfile`** (`src/ontology-profile.ts:234, 331-358`) checks
that every hierarchy entry references a valid registry, valid node types, and a
valid relation type.

Despite this, **`src/ontology-output.ts`** never reads `profile.hierarchies`.
The compile step (`compileOntologyOutputs`, L220-268) writes six sidecar files —
`manifest.json`, `nodes.json`, `aliases.json`, `relations.json`,
`validation.json`, `index.json` — but produces no hierarchy artifacts. The
declared structure is validated and then silently dropped.

At the same time, the studio scene passthrough **is already in place** (commit
`7bbba08`). `NODE_PROFILE_FIELDS` in `src/studio-scene.ts:139-159` lists
`parent_id`, `child_ids`, `level`, `code`, `hierarchy_id`, `hierarchy_ids` for
nodes, and `EDGE_PROFILE_FIELDS` (L161-171) lists `hierarchy_id`, `structural`
for edges. These fields are copied verbatim from graph nodes when present
(`copyOwnFields`, L374). The studio front-end will receive and render hierarchy
fields as soon as the core emits them.

**The gap:** the profile declares hierarchies, validation passes, but no
hierarchy artifact is generated and no node receives hierarchy fields during
compile. The studio passthrough is ready; the core generation step is missing.

---

## Goals

- Generate `hierarchies.json` and `hierarchy-index.json` under
  `.graphify/ontology/` from every declared `OntologyHierarchySpec` entry.
- Make the compile step in `src/ontology-output.ts` the single callsite for
  hierarchy generation (additive, profile-gated, no new command required).
- Produce artifacts that the studio passthrough (`NODE_PROFILE_FIELDS`,
  `EDGE_PROFILE_FIELDS`) can consume without further changes.
- Detect and report cycles; reject cyclic hierarchies rather than silently
  dropping them.
- Keep hierarchy generation registry-bound in v1 (no LLM, no extraction guessing).
- Leave `graph.json` schema unchanged (hierarchies remain a sidecar, not a
  graph-level field).
- Preserve the existing artifact-free default: if no `hierarchies` block is
  declared, no file is written and behavior is byte-identical to today.

## Non-Goals

- Do not hardcode any domain-specific node type, taxonomy, or relation name.
- Do not add real customer, partner, project, regulated-domain, or proprietary
  examples.
- Do not extract hierarchies from text via LLM in v1.
- Do not change the `graph.json` schema.
- Do not replace or conflict with existing `nodes.json`, `relations.json`,
  or `index.json` sidecar files.
- Do not implement a hierarchy reconciliation cycle in v1 (see Decision 1).
- Do not implement cross-work-corpus hierarchy merging in v1 (see Decision 2).

---

## Proposed Artifact Schema `graphify_ontology_hierarchies_v1`

### `hierarchies.json`

Path: `.graphify/ontology/hierarchies.json`

```json
{
  "schema": "graphify_ontology_hierarchies_v1",
  "graph_hash": "<sha256>", "profile_hash": "<sha256>",
  "generated_at": "<ISO-8601>", "hierarchy_count": 1, "entry_count": 42,
  "entries": [
    { "hierarchy_id": "genre_taxonomy", "parent_id": "fiction",
      "child_id": "mystery", "level": 1, "type": "is_a",
      "confidence": 1.0, "evidence_refs": ["registries/genre_taxonomy.csv"],
      "source": "profile" }
  ]
}
```

Fields: `hierarchy_id` (spec key), `parent_id` / `child_id` (resolved node ids
— see Decision 2), `level` (depth from root = 0), `type` (`is_a` | `part_of` |
`broader` | `custom:<x>`), `confidence` (1.0 for registry-bound; reserved for
`< 1.0` when extraction added), `evidence_refs`, `source` (`"profile"` /
`"registry"` / `"extracted"` — last reserved for v2).

### `hierarchy-index.json`

Path: `.graphify/ontology/hierarchy-index.json`

```json
{
  "schema": "graphify_ontology_hierarchies_v1", "generated_at": "<ISO-8601>",
  "hierarchies": {
    "genre_taxonomy": {
      "root_ids": ["fiction", "non_fiction"], "depth": 3,
      "node_count": 42, "arc_count": 41, "cycles_detected": false,
      "paths": {
        "mystery": ["fiction", "mystery"],
        "cozy_mystery": ["fiction", "mystery", "cozy_mystery"]
      }
    }
  }
}
```

`paths` provides pre-computed ancestor chains (root→leaf) for O(1) breadcrumb
lookup in the studio. The index builder records a cycle error in `validation.json`
and does not emit the cyclic hierarchy entry.

### Integration Point in `compileOntologyOutputs` (`src/ontology-output.ts`)

The hierarchy compile step is inserted inside `compileOntologyOutputs`
(currently L220-268), after `compileRelations` and before the manifest write.
It reads `options.profile.hierarchies`, joins parent→child arcs to the
already-compiled `nodes` array, runs BFS for level assignment and ancestor-path
computation, detects cycles, and writes `hierarchies.json` +
`hierarchy-index.json`. If no `hierarchies` entries are declared, both files
are skipped (no empty-file footprint). The manifest gains two optional count
fields (`hierarchy_count`, `hierarchy_entry_count`); absent when zero, so
existing consumers are unaffected.

---

## Decision 1 — Hierarchy Lifecycle: Declarative vs. Reconciliation Cycle

**Context.** The existing patch model (`src/ontology-patch.ts`) supports a
reviewed lifecycle for entity matches and relations (operations: `accept_match`,
`reject_match`, `create_canonical`, `merge_alias`, `set_status`, `add_relation`,
`reject_relation`, `deprecate_entity`, `supersede_entity`). The reconciliation
candidate queue (`src/ontology-reconciliation.ts`) always sets `status:
"candidate"` and proposes `accept_match` patches.

The question is whether hierarchy arcs should enter that same review pipeline,
or whether they should remain purely declarative.

---

**Option 1a — Hierarchies follow the entity lifecycle (candidate → patch →
decision log)**

Arcs are generated as candidates (`kind: "hierarchy_arc"`, `status: "candidate"`),
accepted or rejected via patches, and hardened to `hierarchies.json` only after
an `accept_relation` patch. The studio gains a new candidate queue view. The
decision log records every arc acceptance with registry evidence ref.

Consequences: arcs become reviewable alongside entity matches; the reconciliation
API needs a new `kind` filter; `OntologyReconciliationCandidateKind` is extended.
The main cost: profile-declared arcs (confidence = 1.0, fully deterministic from
the registry) go through a review queue that adds operational overhead with no
epistemic benefit in v1. Value would materialize in v2 when LLM-extracted arcs
(confidence < 1.0) require human arbitration. Timeline impact: medium.

---

**Option 1b — Hierarchies are frozen at profile (declarative, rebuild-only)**

Registry-bound arcs are structural facts, not probabilistic matches. They are
generated deterministically from the declared spec and registry data, written to
`hierarchies.json`, and invalidated by a full rebuild when the profile or
registry changes. No patch, no candidate queue, no decision log entry.
`validation.json` is the only review surface (cycle detection blocks compile).

When LLM-extracted arcs are introduced, the spec is revisited: extracted arcs
would enter the candidate queue while registry-bound arcs remain declarative.
Timeline impact: low — self-contained addition to `compileOntologyOutputs`,
no new types, no new API routes.

---

**Recommendation: Option 1b in v1, with a reserved `source: "extracted"` lane
for v2.**

The patch model's value is in managing uncertain matches. Profile-declared arcs
are not uncertain. The `source` field is forward-compatible: `"profile"` /
`"registry"` arcs stay declarative; `"extracted"` arcs (reserved) enter the
queue. The decision log is not polluted with trivially accepted registry rows.

**Product owner: confirm 1b, or escalate to 1a if hierarchy arcs require human
sign-off even when registry-bound.**

---

## Decision 2 — Canonical ID Scheme for Parent and Child

**Context.** When `compileOntologyOutputs` compiles `nodes.json`, each node
receives an `id`. That id is used to link arcs in `hierarchies.json`. Two
schemes are available.

---

**Option 2a — Registry IDs (registry `id_column`, stable cross-works)**

`parent_id` / `child_id` reference the registry's `id_column` value directly.
These ids are stable by construction and independent of extraction runs.

Consequences: ids are deterministic at profile-parse time; no dependency on the
reconciliation cycle completing first. For cross-work reuse (public-pack corpus
extension, 7→25 works), the same registry id is the same canonical concept in
every work's build — no remapping needed. Risk: if a registry uses unstable
auto-generated ids, cross-work reuse breaks; mitigation is the existing
`validateOntologyProfile` check that requires an explicit `id_column`
(L364, `src/ontology-profile.ts`).

---

**Option 2b — Reconciliation canonical IDs (patch-attested, graph-derived)**

`parent_id` / `child_id` reference the `canonical_id` produced by
`create_canonical` / `accept_match` patches in `src/ontology-patch.ts`.
Benefit: unified id space across `relations.json`, `index.json`, and
`hierarchies.json`. Cost: generation depends on the reconciliation cycle
completing first (sequencing dependency); canonical ids may diverge across
builds if the decision log is not exported; sharing ids across 25 works requires
a versioned shared decision log.

---

**Recommendation: Option 2a in v1.**

Registry ids are available at profile-parse time, stable across builds, and
directly reusable for cross-work reconciliation in the public-pack corpus. The
sequencing dependency imposed by Option 2b is unjustified when registry bindings
already attest the arc with confidence = 1.0.

**Product owner: confirm 2a, or escalate to 2b if a unified id space with
`relations.json` is a hard studio requirement.**

---

## Integration Summary

### Compile step (core)

File: `src/ontology-output.ts`

- New internal function `compileHierarchies(nodes, profile, outputDir)` called
  from `compileOntologyOutputs` after `compileRelations` and before the manifest
  write.
- Iterates `profile.hierarchies` entries, reads the bound registry (already
  resolved in `NormalizedOntologyRegistrySpec.bound_source_path`), joins
  parent→child arcs to compiled `nodes` by registry id, runs BFS for level
  assignment and ancestor-path computation, detects cycles, writes
  `hierarchies.json` and `hierarchy-index.json`.
- Cycle errors are appended to `validationIssues` (same list as alias issues)
  and also written to `validation.json`.
- If no hierarchies are declared: both files are skipped, manifest fields are
  `0`.

### Studio scene passthrough (already complete)

File: `src/studio-scene.ts`

Commit `7bbba08` already added `parent_id`, `child_ids`, `level`, `code`,
`hierarchy_id`, `hierarchy_ids` to `NODE_PROFILE_FIELDS` (L151-156) and
`hierarchy_id`, `structural` to `EDGE_PROFILE_FIELDS` (L169-170). The studio
will receive these fields as soon as graph nodes carry them. No further change
to the passthrough is required for v1.

### Graph schema impact

None. `graph.json` is unaffected. The hierarchy sidecar lives under
`.graphify/ontology/hierarchies.json` and `.graphify/ontology/hierarchy-index.json`.
These paths follow the existing `.graphify/ontology/` artifact pattern
(`nodes.json`, `aliases.json`, `relations.json`, `manifest.json`, `index.json`,
`validation.json`) established by `compileOntologyOutputs`.

The graph schema remains at its current version. If graph nodes need to carry
`parent_id`/`child_ids` for the studio passthrough, these fields are populated
at graph-build time from the registry binding, not from `hierarchies.json`
(the sidecar is a compiled view; the graph node fields are the source that the
scene passthrough already reads).

### Artifact paths

```text
.graphify/ontology/
  hierarchies.json        # arc list (graphify_ontology_hierarchies_v1)
  hierarchy-index.json    # root_ids, depth, ancestor paths per hierarchy
  manifest.json           # extended with hierarchy_count, hierarchy_entry_count
  validation.json         # extended with cycle detection errors
```

---

## Planned Tests

- Valid `hierarchies` block: `hierarchies.json` written, all ids resolve to
  compiled nodes, levels correct, index paths consistent.
- No `hierarchies` block: neither sidecar file is written.
- Cycle in registry data: cycle error in `validation.json`, cyclic arc excluded
  from `hierarchies.json`.
- `manifest.json` carries correct count fields (0 when no hierarchies declared).
- Studio passthrough: graph node with `parent_id` / `hierarchy_ids` passes
  those fields through `copyOwnFields` in `src/studio-scene.ts` (already tested
  since commit `7bbba08`; coverage extends once core emits the fields).
- Registry id stability: same registry + profile → same ids across two builds.

---

## Open Decisions

1. **Decision 1 (owner required)** — Hierarchy lifecycle: declarative rebuild-only
   (Option 1b, recommended) vs. candidate→patch cycle (Option 1a). See
   section "Decision 1" above.

2. **Decision 2 (owner required)** — Canonical ID scheme: registry ids (Option 2a,
   recommended) vs. reconciliation canonical ids (Option 2b). See section
   "Decision 2" above.

3. **guessed→validated policy** — The treatment of hierarchy arcs whose source
   node carries `status: "guessed"` (i.e., the extraction did not attest the
   registry match directly) is not specified here. This policy is shared with the
   broader entity status hardening work and is tracked separately under
   `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`.

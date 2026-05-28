# Ontology Reconciliation Algorithm Specification

# Goal

- This spec defines HOW reconciliation candidates are generated, scored, batched, and converged. The lifecycle (patch/validate/dry-run/apply, studio, audit) is in `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`.
- Status: **draft for review** — written 2026-05-28 from a user brainstorming session (see `spec/intent/2026-05-28-studio-reconciliation-intent.md`, point 7: "on n'a jamais eu de revue là-dessus"). All design axes below were decided in that session.
- Scope: the matching engine (blocking, scoring, tiers, convergence), its storage-agnostic contract, and the MVP vs deferred split. It must stay TypeScript-runtime-only but **may reimplement any valuable algorithm** (no Python dependency — the constraint is "TS runtime", not "avoid a good algorithm because it originated in Python").

# Problem

Reconciliation answers: *which extracted entities refer to the same real thing, and how do we let a human converge the graph toward a clean canonical set without drowning in manual review?* Two sub-problems, one engine:

1. **Intra-corpus coreference / dedup** — the same real entity appears under variants in the corpus ("Holmes" / "Sherlock Holmes" / "Mr. Holmes"). No external reference.
2. **External registry matching** — link extracted entities to canonical IDs from a profile-declared registry.

# Decisions (brainstorming 2026-05-28)

| Axis | Decision |
| --- | --- |
| Scope | Both sub-problems, same engine. **MVP = intra-corpus coref, deterministic.** External registry, LLM, active learning, DB backends = phase 2. |
| Canonical model | **Canonical + non-destructive alias.** Nothing is deleted. |
| Signals | Lexical (incl. fuzzy reimplemented in TS) + structural + optional LLM (calibration/ranking only). |
| Convergence | Confidence tiers (auto / batch-review / ignore) **+** active-learning loop (phase 2). Iterative until stable. |
| Thresholds & rules | Profile-configurable with sensible code defaults; calibratable by active learning. |
| Storage | `GraphStore` interface defined now; **only in-memory (graphology) adapter implemented**. DB adapters in backlog. |
| Auto-merge UX | Default `apply` + batch-undo; `confirm` mode also available; user is always informed of the active mode and can switch. |

# Canonical entity model — non-destructive alias

When two entities are judged the same, the graph is **not** mutated destructively:

- One entity is **elected canonical** (intra-corpus) **or a new canonical node is minted** when none pre-exists (external-registry case, or when promoting a cluster whose canonical was never a corpus node).
- The other members link to it via an **`alias_of`** edge (and their mentions/occurrences become occurrences of the canonical). The original nodes are **kept**.
- Relations are **aggregated as a view** onto the canonical (the studio and exports resolve `alias_of` transitively); the underlying member nodes and their edges are untouched on disk.
- Consequence: every merge is **100% reversible** (drop the `alias_of`), provenance is preserved, and the model ports trivially to Neo4j/Spanner (an `alias_of` relationship vs a destructive node delete).

Every merge is expressed as an `accept_match` **patch** through the existing patch-core (`SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`): validate → dry-run → apply, append-only audit, dirty-worktree warning. The algorithm never writes the graph directly.

# Matching engine (deterministic, TypeScript)

## 1. Blocking (candidate pre-selection — avoids O(n²))

Group entities into blocks; only pairs within a block are scored. Block keys combine:
- same (or compatible) **type**,
- a shared **normalised token** of the label (case/diacritic-folded, Unicode-aware — reuse the `[^\W\d_]+` vocab tokenizer),
- a shared **neighbour** or **source document**.

Blocking is expressed against the `GraphStore` so it can be **pushed down to the backend** (a Cypher/GQL query for Neo4j/Spanner) instead of an in-memory scan. The in-memory adapter implements it over graphology indices.

## 2. Pairwise scoring (transparent weighted sum)

For each candidate pair, `score = Σ wᵢ · signalᵢ`, every contribution exposed in the candidate record so the user sees *why*:

- **Lexical** — normalised-label equality, declared-alias hit, and fuzzy similarity **reimplemented in TS**: Jaro-Winkler, token-set ratio, Levenshtein-ratio (no Python/native dep). High-value algorithms are adopted regardless of origin language.
- **Structural** — shared-neighbour overlap (Jaccard on neighbour sets), same-source co-occurrence, type compatibility.
- **Evidence** — shared snippets / overlapping occurrences (ties into the citation/occurrence work, intent points 5–6).

Weights `wᵢ` and tier thresholds are **profile-configurable with code defaults** (works cold, portable per corpus).

## 3. LLM signal (phase 2, optional)

The LLM may **re-rank the review shortlist** and **propose thresholds/rules** (active learning). It is **never** part of deterministic validation or patch apply — consistent with `SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`.

# Convergence

## Confidence tiers

| Tier | Condition | Action |
| --- | --- | --- |
| **Auto** | `score ≥ auto_threshold` | emit a journaled `accept_match` patch (see auto-merge UX) |
| **Review** | `review_threshold ≤ score < auto_threshold` | enqueue in the studio batch-review queue, sorted by score |
| **Ignore** | `score < review_threshold` | dropped (not surfaced) |

## Iterative closure

After each batch of decisions, regenerate candidates: accepted merges collapse members into their canonical, **transitive closure** removes now-redundant pairs and may surface new ones (a canonical's enlarged neighbour set changes structural scores). Repeat until a round yields no new accepted/queued candidates = **converged**. Dedup the candidate set against everything already seen (accepted *and* rejected) so judge-rejected pairs do not reappear each round.

## Active learning (phase 2)

From the human's accept/reject sample, calibrate weights/thresholds and re-score the remainder, reducing review volume each round. Calibration output is a **profile patch the user approves** — never a silent change.

# Auto-merge UX (mode `apply` vs `confirm`)

- Config: `reconciliation.auto_merge.mode: apply | confirm` (default `apply`), `reconciliation.auto_merge.threshold` (default to be tuned on the public pack; start conservative).
- **`apply`** (default): the auto tier generates and applies the journaled `accept_match` patch immediately. Because the merge is non-destructive, an **"undo last auto-batch"** reverses the whole batch in one action.
- **`confirm`**: the auto tier **pre-selects** a batch; nothing is written until the user confirms ("Confirm all") — safer while thresholds are unproven.
- **The user is always informed of the active mode.** Studio: a persistent banner atop the review queue — *"Auto-merge: ON · applied above {threshold} · {N} auto-merges this batch · [Undo batch] · [Switch to confirm mode]"* (in `confirm` mode: *"{N} auto-accepts pending · [Confirm all]"*). CLI: print the active mode + threshold before any apply, and on the first run where auto would apply ≥1 merge, show a one-time notice explaining the mode and how to switch.

# Storage-agnostic contract — `GraphStore`

The reconciliation engine talks to a `GraphStore` interface, never to graphology directly:

- **Read**: neighbours of a node, nodes by type, nodes by token, nodes by source; node/edge attributes.
- **Write**: create `alias_of` (merge), create relation — always via the patch-core, so apply stays backend-agnostic.
- **Blocking**: a `candidatePairs(blockSpec)` capability the backend may implement as a pushed-down query.

**Implemented now:** the in-memory adapter over graphology. **Defined now, deferred:** the interface contract is frozen so the engine is written against it from day one. See Backlog.

# MVP vs deferred

**MVP (first reviewable lot):**
- intra-corpus coreference,
- deterministic engine (lexical fuzzy-TS + structural + evidence scoring) with blocking,
- `GraphStore` interface + in-memory adapter,
- confidence tiers with the studio **batch-review queue** (auto-merge `apply`+undo default, `confirm` available),
- candidate output extends `graphify_ontology_reconciliation_candidates_v1` with per-signal score breakdown + tier,
- consumed by the studio review surface (**ties to `SPEC_TRACK_G_WORKSPACE.md` → G-studio-lot4 / #7**).

**Phase 2 / Backlog:**
- LLM re-ranking + active-learning calibration loop,
- external-registry matching pass,
- **DB `GraphStore` adapters (Neo4j, Spanner, others)** — backlog item; interface is ready, implementation deferred until a real backend need,
- pushed-down blocking for those backends.

# Outputs

- Extend `graphify_ontology_reconciliation_candidates_v1`: add `score_breakdown` (per-signal contributions), `tier`, and the resolved `canonical_ref` / `alias_refs`.
- Audit log and decision-log formats unchanged (`SPEC_ONTOLOGY_LIFECYCLE_RECONCILIATION.md`).
- The studio review queue renders the breakdown so the user sees why a pair was proposed.

# Test strategy

- Deterministic unit tests on each fuzzy metric (TS reimplementations) against known string pairs.
- Blocking correctness: no candidate pair is missed vs a brute-force O(n²) reference on a small fixture.
- Scoring: golden candidate sets on a synthetic fixture; tier assignment per thresholds.
- Convergence: a fixture with a 3-variant cluster collapses to one canonical in ≤ N rounds, idempotent on re-run, rejected pairs do not reappear.
- Non-destructive merge: after `accept_match`, member nodes still exist, `alias_of` present, undo restores the pre-merge view byte-for-byte.
- `GraphStore`: the engine passes the same suite through the in-memory adapter (contract test reusable by future DB adapters).

# Open questions

- Exact default `auto_threshold` / `review_threshold` — to be tuned empirically on the public mystery pack during the first UAT (start conservative; auto rare).
- Whether `confirm` should be the default for the very first release until thresholds are trusted (currently `apply`+undo per the user's preference, with `confirm` one switch away).

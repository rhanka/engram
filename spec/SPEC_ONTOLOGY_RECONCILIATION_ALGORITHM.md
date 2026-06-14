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

### 2a. Implemented tiers (MVP — `src/ontology-reconciliation.ts`)

The deployed deterministic generator (`generateOntologyReconciliationCandidates`) emits two tiers, each candidate tagged with `tier`:

- **Exact tier** (`tier: "exact"`). A shared NORMALIZED term across `{label, aliases, normalized_terms}` (case/whitespace-folded). When the two normalized LABELS are equal the pair scores **1.0** (canonical exact match); a shared non-label term (alias / normalized_term) scores **0.85**. This tier is exact-only and depends on the assembly-stage alias/normalized_terms derivation to be more than label-equality (see `SPEC_GRAPHIFY.md → Assembly Hygiene`).
- **Fuzzy tier** (`tier: "fuzzy"`, strictly LOWER confidence). Engaged only for a pair with no shared exact term. It compares honorific-stripped tokens across tagged surface VARIANTS of each label/alias — the parenthetical-**stripped** surface (a `name` variant) and the parenthetical **content** alone (a `paren` variant) — and matches when an admissible variant pair is token-SEQUENCE **equal** (score 0.9), the smaller token set strictly **contains** the larger (score 0.75), or the best `name`↔`name` token **Jaccard** clears `fuzzyThreshold` (default **0.6**, score 0.7). Leading honorifics/titles (Dr., Sir, Colonel, Inspector, Mr., Mrs., Lord, Lady, Captain, Professor, M./Mme./Mlle., …) are stripped before tokenization. Guard rails that keep precision high on a large corpus:
  - **≥ 2 meaningful tokens** required on the smaller side, so a single generic locator ("Greenford", "Seawood", "inn", "butler") cannot match every node that merely mentions it.
  - **`paren`↔`paren` never compared**, so two unrelated nodes sharing a generic descriptor ("(servant)", "(mentioned)", "(Evidence)", "(murder weapon)") do not collide; a `paren` variant matches only another node's real NAME (this is what surfaces "Exmoor estate" ⊆ "Devonshire (Exmoor estate)").
  - **Order-preserving equality** + a **formulaic-series guard**: a pair whose token symmetric-difference is entirely ordinal-ish (roman numerals, digits, single letters) is rejected — "Edward I/II/III", "Part I, Chapter II" vs "Part II, Chapter I" are distinct members, not variants.
  - **Structural container types excluded from the fuzzy tier** by default (`fuzzyExcludeTypes` = Work, ChapterOrStory, Scene, Section, Saga): fuzzy coreference is for ENTITIES; distinct chapters/works are never the same thing and their formulaic titles ("The Adventures of …", "Part I, Chapter II: …") would otherwise dominate the output. The exact tier still runs on these types.

The **type-guard** (`left.type !== right.type` → skip) applies AFTER schema hygiene has canonicalized types, so `place`/`Location` no longer split a pair. Output is ranked by score (exact above fuzzy) and capped (`cap`, default 200). The fuzzy tier is config-gated (`fuzzy`, default ON) and never auto-applies — every candidate remains a non-destructive `accept_match` for human convergence.

**Precision contract (mystery pack).** The fuzzy tier MUST surface genuine qualifier-variants — "Hugo Oberstein" ↔ "Hugo Oberstein (spy)"; "British Museum" ↔ "British Museum (Egyptian Antiquities)" (bridged across `place_`/`location_` by schema hygiene); "Devonshire (Exmoor estate)" ↔ "Exmoor estate"; "Reuben Hornby" ↔ "Reuben Hornby (accused)"; "Gournay-Martin" ↔ "M. Gournay-Martin" — and MUST reject siblings ("Sir Henry" ↔ "Sir Charles Baskerville"), regnal series ("Edward I/II/III"), generic honorific collisions ("Inspector Lestrade" ↔ "Inspector Gregson"), and distinct "Château de …". These cases are pinned in `tests/ontology-reconciliation-fuzzy.test.ts`.

### 2b. Precision guards (broad-ranked posture)

Both tiers over-generate on a large corpus by pairing on a single GENERIC shared token or across surface forms that, on close reading, name DIFFERENT real entities (siblings, spouses, a place vs a landmark inside it). A single deterministic predicate — `differentEntityReason(left, right)` — runs **before a pair is emitted in EITHER tier** (the alias-fed exact tier and the fuzzy tier) and rejects the measured false-positive CLASSES. The posture is **BROAD & RANKED for human review, not maximally strict**: low-confidence near-duplicates that are plausibly the same entity are KEPT (a human triages by score); only the classes that are confidently NOT the same entity are killed. The guards are pure over `{label, aliases}`, deterministic, and NO-KEY.

The rejected classes (each pinned by a unit test):

- **(A) Role-noun / common-noun-only overlap.** When the ONLY shared bare-name token(s) between two labels are all generic role/common nouns (a stop-list: narrator, inspector, servant, doctor, captain, count, lord, lady, mr/mrs/miss/sir, revolver, razor, rope, knife, gun, … extended sensibly across roles, weapons, generic places/events), the pair is rejected — the worst class, the "Narrator (Watson)" ↔ "Narrator (Bunny Manders)" explosion fed through the EXACT tier by the parenthetical-stripping alias derivation. A bare-name + parenthetical-disambiguator pair (one side has no parenthetical and is a subset of the other) is EXEMPT (that is the keep case).
- **(B) Thin overlap + disjoint disambiguators.** A single shared non-generic token (a surname/placename) where BOTH labels carry parentheticals that are mutually disjoint (neither a subset of the other) → different bearers of the name ("Inspector Robinson (Highgate)" ↔ "Mrs. Robinson (housekeeper)"). When one parenthetical REFINES the other (subset), it is the same entity (keep — "Mrs. Robinson (housekeeper)" ↔ "Mrs. Robinson (housekeeper for Smart)").
- **(C) Opposite-gender / relational title.** Rejected when the two surface forms differ by an OPPOSITE-gender honorific (Lord/Lady, Mr/Mrs, Count/Countess, King/Queen, Sir/Dame, Brother/Sister, …), when a parenthetical carries a relational cue (husband/wife/ancestor/widow/son/…) that cross-references the other node, or when a ONE-SIDED gendered title carries an EXTRA given name over the bare-named other ("Lady Hilda Trelawney Hope" ↔ "Trelawney Hope") — spouses/relatives, not the same person. A one-sided NON-gendered title (Inspector/Dr.) is NOT relational (keep "Inspector Lestrade" ↔ "Lestrade (mentioned)"). Gender/relational rules are gated OFF for place types so "Queen Square"/"King's Bench Walk" are not read as honorifics.
- **(D) Containment with a NEW head-noun.** If one place label strictly contains the other but ADDS a new locational/structural head-noun (near, flats, shop, island, museum, memorial, room, building, mine, …) they are DIFFERENT places ("Scotland Yard" ↔ "Black Museum, Scotland Yard"; "Westminster Abbey" ↔ "New flats near Westminster Abbey"; "Grimpen Mire" ↔ "Tin Mine Island in Grimpen Mire"). A place is also rejected when both names share a generic place head-noun (square/street/road/…) but carry DIFFERENT qualifiers for it ("Bloomsbury Square" ↔ "Queen Square, Bloomsbury"). CRITICAL: a trailing PARENTHETICAL disambiguator on a person/thing name (identical name-part) is NOT containment and is KEPT ("Hugo Oberstein" ↔ "Hugo Oberstein (spy)"; "Devonshire" ↔ "Devonshire (Exmoor estate)"; "British Museum" ↔ "British Museum (Egyptian Antiquities)").
- **(E) Address / serial divergence.** Two labels sharing a tail but differing in a leading numeric/address token are distinct addresses ("5A King's Bench Walk" ↔ "6A King's Bench Walk") — the formulaic-series guard extended to address numbers.
- **(F) Divergent distinctive tokens around a shared generic head.** Not a subset/disambiguator pair, the shared tokens include a generic head-noun, and EACH side carries a distinctive (non-generic, non-ordinal) token the other lacks → different entities ("Revenge for John Ferrier" ↔ "Revenge for Lucy Ferrier").

**Measured impact (copy of the mystery pack, 1983 entity nodes).** Candidate count `70 → 31` (within the ~30–40 target band), precision `~29% → ~87%`. All ten must-keep genuine pairs survive (Hugo Oberstein, Devonshire/Exmoor, Black Pearl, Duke/Isaac Green, Marquis/Maurice Mair, Lestrade, Western Sun, Reuben Hornby, Gournay-Martin, Moonshine Murder); all must-reject classes are eliminated (the 15-pair Narrator explosion, every Lord/Lady·Mr/Mrs·Count/Countess pair, the spouse/relational pairs, the place-containment pairs, the 5A/6A address pair). Output stays score-ranked (exact 1.0/0.85 genuine pairs on top; the residual hard semantic cases — different objects of one owner, different events about one subject, impostor-vs-real — sit at the 0.70–0.75 floor for the human to adjudicate).

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

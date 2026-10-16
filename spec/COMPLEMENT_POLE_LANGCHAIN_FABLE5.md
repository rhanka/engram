# COMPLEMENT — POLE-O / Neo4j / LangChain-LangGraph comparative analysis of the Graphify neutral memory engine

**Author:** independent complement analyst (`claude-fable-5`)
**Date:** 2026-08-20
**Status:** design study only; read-only complement to the existing study passes; authorizes no implementation
**Ground truth:** `spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md` (the v2 evol, cited as "v2 §…"), `.graphify/scratch/SPEC_AGENT_MEMORY_SUBSTRATE_87a8cd05.md` (the ratified v1 substrate, cited as "v1 §…"), and the prior passes `REVIEW_SPEC_EVOL_MEMORY_SOL_20260816T125509Z.md`, `ACCEPTANCE_graphify-memory-port_FABLE5_20260816T125154Z.md`, `RENEUTRAL_VERDICT_FABLE5_20260816T150856Z.md`.

**Marking convention.** Every claim about OUR model cites a spec section/line or is marked "(inference)". Every claim about POLE-O, Neo4j, LangChain, or LangGraph is marked "(model knowledge — verify)" — it comes from the analyst's training knowledge (cutoff January 2026), was not measured against a live system in this session, and must be verified before it is load-bearing. Where a fact was not measurable in this repository, the text says "not measured" instead of guessing.

---

## 0. Status observation feeding the evolution decision

The RENEUTRAL verdict (2026-08-16) recorded two open acceptance residuals: C3 (authority-separation inputs absent from `AdmissionPolicyRequestV1`) and C6 (no lifecycle event anchor on commands/events). The v2 spec **as now on disk** carries both closures:

- C3: `AdmissionPolicyRequestV1` now carries `payload_digest`, `policy_evidence_digest`, and `policy_evidence_ref` (v2 §5.3, lines 360–369), and the closure table records the fold (v2 §11, line 1191).
- C6: `LifecycleEventAnchorV1` exists (v2 §5.5, lines 498–503), is required on `LifecycleCommandBaseV1` (line 508) and on persisted `LifecycleEventV2` (line 608), and the closure table records it (v2 §11, line 1194).

Whether the RENEUTRAL reviewer has re-verified these closures is **not measured** here; no later verdict document was found in `spec/`. The opportunities below assume the on-disk v2 text is the model.

---

## 1. AXE A — Ontology: POLE(-O) versus our schema-opaque canonical layer

### 1.1 What POLE-O prescribes (external)

POLE — Person, Object, Location, Event, commonly extended with Organization (POLE-O) — is the canonical entity typology used in UK policing, intelligence analysis, and investigation platforms, and is the standard reference data model in Neo4j's public-safety / investigation field solutions (model knowledge — verify). Its load-bearing prescriptions, as commonly practiced (model knowledge — verify):

1. **Closed top-level entity typology.** Every node is a Person, Object, Location, Event, or Organization; domain subtypes hang under these five.
2. **Event as the hub.** Events are first-class nodes; Persons/Objects/Organizations connect to Events via typed participation relationships (party-to, witnessed, seized-at, …), and Events connect to Locations and time.
3. **Typed, directed relationships** with a controlled vocabulary (KNOWS, OWNS, LOCATED_AT, PARTY_TO, …), often time-bounded.
4. **Structured identifier attributes** on entities (name, date of birth, phone number, registration plate, address components) that exist specifically to drive matching.
5. **Entity resolution as a governed workflow**: candidate generation over identifiers (exact, then fuzzy/similarity), scoring, human adjudication, and a resolution decision that is recorded — in mature practice as a link ("same-as" / resolution node) with provenance, not a silent merge.
6. **Source/provenance grading** on assertions (e.g., intelligence-grading schemes such as 3x5x2/5x5x5) (model knowledge — verify).

### 1.2 What OUR model deliberately does not have — and why that is not the gap

The canonical layer is typology-free by construction:

- `scope_ref` is opaque; "No installation, tenant, workspace, compartment, user, hierarchy, wildcard, or shared/private label exists in the record schema" (v2 §4, line 219). Emitted contracts may contain "no consumer identifier and no evaluator, authorship, review-leg, persona, role, roster, coordination, or topology shape" (v2 D1, line 29).
- The knowledge content is free text components of kind `context | decision | evidence` with citations (v2 §4, lines 149–156); there is no entity-attribute schema.
- The graph is a projection, never canonical (v2 D3, lines 55–59); `graph.json` is a bounded current projection (v2 D10, lines 1142–1146).
- D6 reconciliation "compares assertions; it never deduplicates identity", and "Identity/entity matching scores are never evidence of truth, contradiction, or supersession" (v2 §6, lines 976 and 1020).
- §12 non-goals: Graphify "does not define identity … [or] infer truth from identity resolution" (v2 §12, lines 1201–1203).
- The v1 substrate goes further: an identity-profile projection over human-subject notes is prohibited at admission AND at projection (v1 §3.3), and reconciliation is opt-out by construction with a cross-tier reject (v1 §3.4).

So the correct comparative question is exactly the one posed: what can the **projection + reconciliation layer** adopt or expose from POLE-O without the canonical schema ever learning a typology. The answer is favorable: everything POLE-O prescribes lands cleanly on surfaces our model already reserves for it — and this repository **already contains** the projection-side machinery to host it.

### 1.3 Where each POLE-O element would live in our architecture

**(a) The typology itself → a non-normative POLE-O ontology-profile instance over the projected graph.**
The Graphify codebase (outside `packages/memory`) already has a versioned, hashed, YAML-loaded ontology profile with `node_types`, `relation_types`, `registries`, hierarchies, hardening statuses (`candidate/attached/needs_review/validated/rejected/superseded`), evidence/citation/inference policies, and per-type visual encoding — see `/home/antoinefa/src/graphify/src/ontology-profile.ts` (e.g., `NormalizedOntologyProfile`, `DEFAULT_STATUSES` at line 35) and the non-mutating discovery diff in `/home/antoinefa/src/graphify/src/ontology-discovery.ts` (`mutates_profile: false`, line 105). A POLE-O profile is therefore **a data artifact, not a schema change**: a profile instance declaring Person/Object/Location/Event/Organization node types, their subtypes via the class-hierarchy spec, and a POLE relationship vocabulary as `relation_types`. Per v2 D1 (line 20), the consumer of such a profile is a projection bridge, which "may depend on both sides but [is] not re-exported by `graphify-memory`". The engine tarball stays byte-identical; neutrality holds because the profile is deployment-owned vocabulary, exactly the class of material v2 line 7 pushes out of the normative spec.

**(b) Event-as-hub → materialize projection Event nodes from `PrimaryEventAnchorV1`.**
Our records are already event-anchored: exactly one `primary_event` with `at`, descriptive `type_ref`, and a resolving citation (v2 §4, lines 159–163, 217), and every lifecycle transition carries a citation-bound `LifecycleEventAnchorV1` (v2 §5.5, lines 498–503). A POLE-shaped projection can materialize each anchor as an Event node and attach the record's assertions to it — this is POLE's central structural idea, and our canonical layer supports it **better than a generic document store** because the anchor is mandatory, singular, and citation-bound. (inference from the cited schema; the concrete Event-node materialization is not in the spec today.)

**(c) Structured identifiers → citation locator schemes and profile registries, not record fields.**
`CitationLocatorV1.scheme` is "a registered neutral scheme" (v2 §4, lines 136–139), and the ontology profile carries `registries` (measured in `src/ontology-profile.ts`). POLE-style identifier vocabularies (phone, plate, address, geo) can be registered as locator schemes and profile registries consumed at projection time. What our model does NOT offer is a structured attribute schema inside the record — components are bounded free text (v2 §4, line 153). That is a deliberate neutrality choice; the POLE-compatible compromise is extraction at projection time, which leads to the single real gap below.

**(d) Entity resolution → the existing projection-side reconciliation queue, chartered so it can never leak into D6.**
The repository already implements POLE-shaped ER **at the projection layer**: `/home/antoinefa/src/graphify/src/ontology-reconciliation.ts` defines an `entity_match` candidate queue with `exact | fuzzy` tiers, scores, `shared_terms`, `evidence_refs`, `reasons`, and a non-destructive `accept_match` proposed patch operation (lines 9–56), over per-node-type normalizers (`src/entity-normalizer.ts`). This is precisely where POLE-O ER belongs in our architecture: candidates + adjudication + reversible patches over the projection, never a canonical merge. What is missing is the **normative charter**: the v2 spec states only one direction of the firewall ("identity/entity matching scores are never evidence" for D6 relations, v2 §6, line 1020). It does not state (i) that projection-side ER exists as a sanctioned capability, (ii) that its output is a typed "same-as" projection link with evidence and receipts rather than a merge, (iii) that ER candidates and accepted matches must never enter `AssertionComparisonInputV1` or influence occurrence keys, and (iv) that ER respects scope ("Projection builders never create an edge between records with unequal `scope_ref`", v2 §5.5, line 582 — a same-as edge across scopes would violate this; the charter must say so explicitly). (inference)

**(e) Reconciliation vocabulary → POLE-informed assertion-family packs.**
`AssertionFamilyRegistry` families own their occurrence keys and comparators, are versioned, and are opt-in per record (v2 §6, lines 987–1024). A "POLE-O family pack" — e.g., an occurrence key of the form (typed-event-kind, normalized identifier, valid-interval bucket) for sighting/possession/presence assertion families — is a legitimate registry artifact requiring **zero** schema change, because occurrence-key semantics are family-internal (v2 §6, lines 1015–1016). This imports POLE's comparison discipline (compare assertions about the same real-world occurrence) while keeping D6's identity firewall: the family compares assertions whose occurrence keys collide; it never asserts that two records are "the same entity".

**(f) Source grading → already stronger in our model.**
POLE deployments grade sources with conventions (model knowledge — verify); our model has immutable, receipt-bound trust classes `asserted/earned/signed` with verifier receipts and revocation epochs (v2 §4, lines 193–221), carried into every projection record (`ProjectionRecordV1.trust_class`, v2 §5.7, line 721) and lexical document (line 675). A POLE-O profile can map display/grading vocabulary onto these classes without touching them.

### 1.4 The one structural gap Axe A exposes

**Projection ports never receive accepted content.** `ProjectionBatchV1` carries only `ProjectionRecordV1` — id, digests, `scope_ref`, valid time, trust class, component **kinds**, citation refs (v2 §5.7, lines 708–724). Component **text** exists canonically and in the accepted lexical document (v2 §5.7, lines 664–676), but no normative carrier delivers it to a graph/ontology projection builder. A POLE-O projection (typed entity extraction from accepted assertions) therefore cannot be built from the projection feed alone; it would need per-record authorized `readRecord` calls (v2 §5.7, lines 751–755) with redaction applied — workable but unspecified, unbatched, and with no stated redaction/quarantine rule for the derived typed nodes. (inference) This is Opportunity O1 below, and it also gates half of Axe C.

---

## 2. AXE B — Graph-engine maturity: Neo4j versus the bitemporal journal-canonical design

### 2.1 Where OUR model is ahead

1. **Governed bitemporality.** Neo4j has temporal datatypes and time-tree/versioning *modeling patterns*, but no native bitemporal store: no system-time axis, no as-of query, no stable-pagination guarantee; versioned-graph support is a do-it-yourself pattern or third-party library (model knowledge — verify). Our model has two independent axes with exact inclusive semantics, a gap-free u64 system cursor as ordering authority, dual-as-of reads with pinned defaults, and `STALE_PAGE` refusal when a later page drifts (v2 D4, lines 79–101). Ranking recency is pinned to valid time only (lines 93–101).
2. **Cryptographic accountability.** Domain-separated SHA-256 digests over RFC 8785 canonical bytes for payloads, records, events, receipts (v2 D5, lines 106–117); a hash-chained journal (`previous_event_digest`, v2 §5.6, lines 609–610); replay equivalence between genesis and checkpoint+tail (v2 §5.9, line 968); rank receipts binding snapshot, profile, formula, and revalidation (v2 §7, lines 1051–1069). Neo4j has no receipt or attestation concept; auditing is log-based (model knowledge — verify).
3. **Admission-gated writes and trust classes.** Nothing enters recall without capture → sealed pending quarantine → policy admission → accepted indexing (v2 §5.5–§5.6; pending is invisible everywhere, line 616 and §5.9 line 966). Neo4j writes are immediate; there is no admission concept (model knowledge — verify).
4. **Authorization at result materialization.** "The store is the final eligibility authority. Rank order is never authorization." — every ranked id is revalidated against state, dual time, retention, trust, tombstone, and a freshly revalidated authorization receipt immediately before packet materialization (v2 §5.7, lines 790–791; §7, line 1113). Neo4j RBAC grants label/property visibility at query time but has no per-result revalidation receipt and no deny-by-default receipt expiry model (model knowledge — verify).
5. **Terminal erasure with anti-resurrection.** Tombstone dominates all states, survives replay, and must cascade through FTS, nodes, edges, vectors, caches, aggregates, and exports under one acknowledged cursor receipt (v2 §5.6, line 627; §9, L6 cascade test, line 1160). The v1 substrate motivated this as GDPR-grade complete disappearance including edges (v1 §3.5). Neo4j deletion is deletion — no dominance ledger, no proof that a restore or replay cannot resurrect (model knowledge — verify).
6. **Deterministic, receipt-bound ranking.** Pinned BM25/RRF parameters, pinned profile per pagination sequence, typed `RANKING_UNAVAILABLE` instead of silent fallback (v2 §7, lines 1087–1107). Neo4j full-text scoring is Lucene-based and not receipt-bound or profile-pinned (model knowledge — verify).

### 2.2 Where Neo4j's maturity points to capabilities we LACK

1. **A declarative graph query language.** Cypher (and now ISO GQL) gives pattern matching, variable-length paths, and aggregation over a typed graph (model knowledge — verify). Our public memory surface is text recall with budgets (v2 §7, lines 1036–1049) plus `readRecord`/`readJournal`; there is no path or pattern query over the memory projection in the normative contract. The repo's `graphify query` CLI operates on the code-knowledge graph, not the memory engine (inference; not measured against the memory ports because none are implemented yet). A read-only, eligibility-induced traversal surface is absent by design today — it can be added as a projection port without touching canon.
2. **A graph-algorithm library.** Neo4j GDS ships community detection, centrality, similarity, link prediction, and node embeddings at scale (model knowledge — verify). Our semantic profile uses exactly one algorithm — PPR over the induced eligible subgraph (v2 §7, line 1111) — and `SemanticProjectionPort` exposes only `inducedAdjacency` (v2 §5.8, lines 830–836). Anything beyond (memory clustering, contradiction-cluster detection, similarity-driven ER candidates) has no port today.
3. **Entity-resolution tooling.** Neo4j-ecosystem ER pipelines (node similarity + WCC over candidate links, or partner ER engines) are mature (model knowledge — verify); ours is the young projection-side candidate queue described in §1.3(d), currently for the code-ontology use, and unchartered for memory. Its precision/recall: not measured.
4. **Index breadth.** Neo4j offers range, composite, point (geospatial), full-text, and vector indexes natively (model knowledge — verify). Our canonical contract mandates exactly one accepted-only lexical index with fixed fields (v2 §5.7, lines 664–676) plus optional vector/graph projections. Structured-attribute and geospatial indexing are absent (consistent with the free-text component model). No performance comparison is possible: not measured.
5. **Scale and concurrency posture.** Neo4j provides clustering and read replicas (model knowledge — verify). Our design is a single fenced writer over SQLite (v2 D8, lines 1117–1134) or a fenced Postgres canonical (D9, lines 1136–1140), with a 52,428,800-byte current-projection ceiling (D10, line 1146). This is a deliberate governance choice, not an oversight — but it bounds the memory horizon a single deployment can project. Mitigation exists in-architecture: the projection outbox (`nextProjectionBatch`, v2 §5.7, line 765) is effectively a change-data-capture feed, so a large-scale read surface (including a Neo4j instance) can legally sit **behind `GraphProjectionPort`** as one more projection (v2 §5.8, line 839 explicitly blesses adapter reuse) — provided reads from it are treated as hints, never authority (v2 §5.7, lines 790–791). (inference)
6. **Constraints.** Neo4j enforces uniqueness/existence constraints in-store (model knowledge — verify). Our canonical store enforces digest/idempotency conflicts (v2 §5.5, line 580) but the projection has no constraint language; the ontology profile's hardening statuses partially cover this at the projection layer (measured in `src/ontology-profile.ts`, line 35).

Net assessment: the maturity gaps are all **read-side and projection-side**. None of them argues for weakening the canonical journal; each is addressable as a projection port or adapter, which is exactly the extension shape D3 reserves.

---

## 3. AXE C — LangChain / LangGraph integration for sentropic's agentic model

**Source-gap boundary:** sentropic's actual repository and runtime wiring are **not available in this workspace — not measured**. Whether sentropic uses LangGraph at all, which checkpointer it runs, and what namespace conventions it would adopt are unverified. This axis reasons from LangChain/LangGraph public patterns (model knowledge — verify, as of January 2026) against our published port shapes; every integration conclusion below must be confirmed against the real sentropic wiring before it becomes load-bearing.

### 3.1 The LangChain/LangGraph memory surface (external)

As of early 2026 (model knowledge — verify):

- **LangGraph checkpointer** (`BaseCheckpointSaver`): thread-scoped short-term state — full graph-state snapshots per super-step, keyed by `thread_id`; used for resume, replay, time-travel within a thread.
- **LangGraph `BaseStore`**: cross-thread long-term memory — a namespaced document store: `put(namespace_tuple, key, value_dict)`, `get(namespace, key)`, `delete(namespace, key)`, `search(namespace_prefix, query?, filter?, limit, offset)`; optional semantic search via a configured embedding model; items carry `created_at`/`updated_at`; namespaces are hierarchical tuples like `(user_id, "memories")`. `langmem` layers memory-management tools and background consolidation on top of it.
- **Legacy entity/KG memory** (`ConversationEntityMemory`, `ConversationKGMemory`): deprecated-era chain memories that extracted entities/triples per turn.
- **`langchain-neo4j`**: `Neo4jGraph` (schema-aware Cypher access), `Neo4jVector` (vector store over node properties), `GraphCypherQAChain` (LLM writes Cypher against the graph schema); the `neo4j-graphrag` package ships KG construction pipelines and retrievers (vector, vector+Cypher, text2cypher).
- **Retriever contract** (`BaseRetriever`): query string in, ranked `Document(page_content, metadata)` list out.

### 3.2 Port-by-port mapping

| LangChain/LangGraph expectation (model knowledge — verify) | Our surface (cited) | Fit |
|---|---|---|
| `BaseStore.put(namespace, key, value)` — synchronous, immediately readable, overwrite-by-key | `capture` → sealed pending → `requestAdmission` → `accepted_current` (v2 §5.5 lines 464–496, §5.6 table lines 614–629); records immutable; update = `supersede` (line 622) | **Gap 1, Gap 2** below |
| `get(namespace, key)` | `readRecord(record_id, system_as_of, authorization_receipt)` (v2 §5.7, lines 751–755) — no external-key lookup | **Gap 2** |
| `search(namespace_prefix, query, filter, limit)` | `recall(RecallRequestV2)` — query text, purpose_ref, as-of, budgets, pagination (v2 §7, lines 1036–1049) | Good on text+limit; **Gap 3** (structured filter), **Gap 4** (prefix) |
| `delete(namespace, key)` | `tombstone` lifecycle command requiring a citation/evidence-bound `LifecycleEventAnchorV1` (v2 §5.5, lines 498–520) | **Gap 5** |
| namespace tuple | `scope_ref` opaque, 1–512 bytes; opaque values may carry integration-owned references (v2 §4 line 182; D1 line 30) | Encoding fits; authorization is per exact scope, "no wildcard, hierarchy, namespace override, or multi-scope representation" (v2 §5.2, line 353) → **Gap 4** |
| semantic search w/ configured embeddings | `VectorProjectionPort.query` over the eligible-id allowlist; model is engine-pinned and receipted (v2 §5.8, lines 802–819; §7 line 1111) | Fit; per-call model choice not offered — acceptable, flag to sentropic |
| retriever → `Document` + metadata | `RecallRecordPacketV2` (redacted record, score, rank) + `RankReceiptV1` (v2 §7, lines 1051–1084) | Strong fit; a thin wrapper suffices (**O5**) |
| checkpointer (thread state snapshots) | Nothing — and correctly so: high-churn whole-state blobs are not admission-worthy assertions (inference from §5.5–§5.6 pipeline cost) | Non-goal to state explicitly (**O7**) |
| `GraphCypherQAChain` / GraphRAG over Neo4j | A Neo4j-backed adapter behind `GraphProjectionPort.apply(batch)` is architecture-legal (v2 §5.8, lines 796–799 and 839) | Possible; needs the authority rule (**O6**) and the content feed (**O1**) |

### 3.3 The five concrete gaps

**Gap 1 — Write-then-read consistency.** A LangGraph agent that `put`s a memory expects to `search`/`get` it in the same or next turn (model knowledge — verify). Our pending state "never appears in recall, FTS, projection, export, diagnostics, or portable backup" (v2 §5.6, line 616). The clean resolution needs no spec change: `AdmissionPolicy` owns all evaluation semantics (v2 §5.3, line 387), so a deployment may configure an **auto-accept policy** whose `decide` immediately returns `accept` — the adapter then drives `capture` + `requestAdmission` as one call. What is missing is a published, named adapter contract stating this profile and its consistency guarantee (read-your-writes after the admission receipt's cursor, via `system_as_of >= cursor`), so integrators do not invent a bypass. Note the trade sentropic must decide: auto-accept forfeits the D11-style gate the v1 substrate wanted for asserted notes (v1 §9.3) — that is a policy choice per store, not an engine change. (inference)

**Gap 2 — Mutable external keys.** `BaseStore` keys are overwritable; our records are immutable with supersession chains (v2 §5.6, line 622). The adapter must own a (namespace, key) → current `record_id` mapping and translate overwrite into capture-new + `supersede`, and delete into `tombstone`. That mapping is itself a projection (rebuildable from the journal via `readJournal`, v2 §5.7, line 763) — it must live in the adapter, never in the engine schema. (inference)

**Gap 3 — Structured metadata filters.** `search(filter={...})` filters on value fields (model knowledge — verify); our recall has no structured predicate beyond time axes, scope, and text. Options, in order of invasiveness: (a) adapter-side post-filter over returned packets (correct but budget-wasteful); (b) a projection-side filter index keyed on citation refs / `type_ref` vocabularies (no schema change); (c) a normative structured-tag carrier in the payload — this last would touch `CandidatePayloadV2` and should be resisted until (a)/(b) are shown insufficient: not measured.

**Gap 4 — Namespace-prefix search vs one-scope authorization.** `search` over a namespace *prefix* spans many logical scopes; our authorization binds "one operation, one resource digest, and one exact non-empty `scope_ref`" (v2 §5.2, line 353). The adapter must fan out: enumerate the concrete scopes it manages (adapter-owned catalog), obtain one authorization per scope, issue per-scope recalls, and merge client-side. This is a real ergonomic cost and a deliberate security property — the complement recommends documenting it as such, not weakening §5.2. (inference)

**Gap 5 — Deletion provenance.** `delete` is a bare KV operation; our `tombstone` demands an evidence-bound anchor (`provenance_ref`/`provenance_digest`, v2 §5.5, lines 498–503). The adapter must synthesize a citable deletion-request artifact (e.g., persist the agent/user deletion command as a source and cite it). This is friction with a purpose — the v1 substrate's authority rule for erasure (only the owner or a mandated agent, v1 §3.5) survives through `AuthorizationPort`. The adapter contract must specify the synthesis so integrators do not stub it with garbage digests. (inference)

### 3.4 Where our model is ahead of the LangChain memory stack

`BaseStore`/`langmem` items have no trust model, no admission gate, no bitemporal axes, no receipts, no erasure dominance, and no revalidation-before-return (model knowledge — verify). Behind a `BaseStore` facade, graphify-memory would give a LangGraph runtime: provenance-classed memories (v2 §4, lines 193–204), as-of replayable recall (D4), receipt-bound ranking (v2 §7), and GDPR-grade forget (v2 §5.6, line 627). No LangChain-ecosystem memory backend known to this analyst offers that combination (model knowledge — verify). The integration is therefore asymmetric in our favor: we conform to their calling convention; they gain our governance.

### 3.5 GraphRAG posture

A `GraphCypherQAChain`/GraphRAG path over a Neo4j **projection** of the memory graph is architecture-legal (v2 §5.8, line 839) but must carry one hard rule: projection reads are navigation hints; any content surfaced to the agent, and any eligibility claim, must be re-established through `recall`/`readRecord` with revalidation, because "the store is the final eligibility authority" (v2 §5.7, lines 790–791) and projection staleness is a typed condition (`PROJECTION_STALE`, v2 §5.1, line 243). Without O1 (accepted-content feed) the Neo4j projection would hold only envelope metadata, which already suffices for structural GraphRAG (neighborhood expansion feeding id allowlists into recall) — full-text-in-graph requires O1 plus a redaction ruling. (inference)

---

## 4. Ranked opportunity list

Legend per item: (a) rationale — (b) where it lands — (c) acceptance criterion — (d) neutral/opaque/anti-cycle invariants.

### MUST

**O1 — Accepted-content projection feed (authorized, redaction-governed).**
(a) `ProjectionBatchV1` carries envelopes only (v2 §5.7, lines 708–724); no carrier delivers accepted component text to projection builders, blocking POLE-O typed extraction (Axe A §1.4) and content-bearing GraphRAG (Axe C §3.5).
(b) A new optional data-pure carrier/port in v2 §5.8 (e.g., an authorized `AcceptedContentBatch` keyed to projection cursors, or a normative batched-`readRecord` pattern), with an explicit rule on how `RedactionDirectiveV1` (v2 §5.2, lines 286–291) applies to derived projection artifacts.
(c) A projection builder can construct a typed graph from a fixture journal using only published ports, and a tombstone cascade (v2 §9, L6 test line 1160) removes every derived typed node/edge produced from that content.
(d) Respects all three: data-pure DTO, `scope_ref` stays opaque, lives in `graphify-memory` contracts with bridges outside (v2 D1, line 20); pending quarantine untouched (v2 §5.9, line 966).

**O2 — LangGraph `BaseStore` adapter contract (named integration profile).**
(a) The five Axe C gaps (§3.3) each have a clean in-architecture answer, but only if written down: auto-accept `AdmissionPolicy` profile + consistency statement (Gap 1), adapter-owned key→record mapping via supersede/tombstone (Gap 2), scope-fan-out for prefix search (Gap 4), deletion-provenance synthesis (Gap 5).
(b) A separately owned integration/adapter package (per v2 line 7, integration material is "separately owned"; per D1 the engine never depends on it) plus one non-normative appendix in the evol naming the supported consistency contract.
(c) The reference adapter passes a conformance suite exercising put/get/search/delete round-trips, read-your-writes at `system_as_of >= admission cursor`, and delete → zero hits across recall, FTS, and vector surfaces; the `graphify-memory` tarball is unchanged.
(d) Respects all three: the engine gains no LangChain dependency or vocabulary; namespaces ride inside opaque `scope_ref` values (v2 D1, line 30); anti-cycle edge stays one-way. **Must be confirmed against the real sentropic wiring — source-gap (§3, boundary note).**

**O3 — Projection-side entity-resolution charter (the POLE firewall, both directions).**
(a) ER exists in the codebase (`src/ontology-reconciliation.ts`) but is unchartered for memory; v2 states only that entity-match scores are not D6 evidence (v2 §6, line 1020), not where ER lives, what it emits, or its scope limits.
(b) A short normative addition to v2 §6/§5.8: projection-side ER emits typed "same-as" candidate links with evidence refs and receipts; accepted matches are reversible projection patches, never canonical events; ER output can never enter `AssertionComparisonInputV1`, never crosses unequal `scope_ref` (extending v2 §5.5, line 582), and never aggregates human-subject records into an identity profile (imports v1 §3.3's projection prohibition into v2, where it currently has no explicit successor — (inference)).
(c) A test proving an accepted same-as link changes no canonical digest, produces no reconciliation proposal, and folds out completely on tombstone of either endpoint.
(d) Respects all three; it is precisely the codification that keeps POLE-O ER from ever eroding D6's "never deduplicates identity" (v2 §6, line 976).

### SHOULD

**O4 — POLE-O ontology-profile pack + Event-anchor materialization.**
(a) Gives investigation-grade typology (P/O/L/E/O node types, typed relations, Event-hub materialized from `PrimaryEventAnchorV1`) with zero engine change (Axe A §1.3 a–b).
(b) A profile instance (YAML + registries) consumed by the existing `src/ontology-profile.ts` machinery in a projection bridge; distributed as deployment data, marked non-normative.
(c) A fixture journal projects to a graph where every record hangs off exactly one Event node typed from `primary_event.type_ref`, and the packed `graphify-memory` artifact is byte-identical before/after.
(d) Respects all three; typology exists only in the projection profile, exactly the "non-normative ontology profile over the projected graph" placement.

**O5 — Retriever/`Document` carrier mapping (recall → LangChain retriever).**
(a) Cheap, high-leverage: `RecallRecordPacketV2` + `RankReceiptV1` (v2 §7, lines 1051–1084) map cleanly onto `Document.page_content`/`metadata` (record_id, trust_class, valid_time, citations, receipt digest), making graphify-memory a drop-in governed retriever.
(b) Same integration package as O2; a documented metadata schema for the mapping.
(c) A LangChain `BaseRetriever` conformance test returns documents whose metadata round-trips record_id, trust class, and rank-receipt digest, and returns typed unavailability (never silent empty) when `RANKING_UNAVAILABLE` (v2 §7, line 1087).
(d) Respects all three; read-only consumer of published ports.

**O6 — Projection-read authority rule ("hints, not authority") as one normative sentence.**
(a) Both the Neo4j-projection path (Axe B §2.2.5) and GraphRAG (Axe C §3.5) will tempt integrators to serve results straight from a projection, bypassing revalidation and redaction; v2 implies the prohibition (§5.7, lines 790–791) but never states it for external projection consumers.
(b) One added sentence in v2 D3/§5.8: content or eligibility surfaced to a caller from any projection must be re-established through recall/readRecord revalidation.
(c) The conformance matrix gains a test: a stale projection hit for a tombstoned record yields zero results through any published read path.
(d) Respects all three; it strengthens the existing invariant rather than adding surface.

**O7 — Explicit non-goal: graphify-memory is not a LangGraph checkpointer.**
(a) Thread-state snapshots are high-churn, non-assertional blobs; forcing them through capture/admission would be a misuse and an eventual pressure to weaken quarantine (inference from §5.5–§5.6 cost).
(b) One line in v2 §12 non-goals; the O2 adapter contract points integrators at an ordinary checkpointer next to graphify-memory as the long-term store.
(c) The adapter documentation names the split; no checkpointer interface appears in any `graphify-memory` export.
(d) Respects all three; a boundary statement, not code.

**O8 — Recall structured-filter ladder (decide, then maybe extend).**
(a) LangGraph `search(filter=…)` and POLE attribute queries both want structured predicates; today only text+time+scope exist (v2 §7, lines 1036–1049) — Gap 3.
(b) Staged: adapter post-filter (now); projection-side filter index over citation refs/`type_ref` vocabularies (next); only if measured insufficient, a versioned optional tag carrier in a future payload revision. Insufficiency evidence today: not measured.
(c) Stage 2 acceptance: a filter query resolves through the projection index and every returned id still passes final revalidation (v2 §7, line 1113).
(d) Stages 1–2 respect all three; stage 3 would touch the neutral payload schema and needs its own neutrality review — flagged, not endorsed.

### COULD

**O9 — Read-only graph-pattern query surface over the eligible projection.**
(a) Closes the sharpest Neo4j maturity gap (Cypher-class path/pattern queries — Axe B §2.2.1) for investigation-style questions ("what connects A to B").
(b) A new optional projection port (bounded traversal DSL or pushdown to a Neo4j projection adapter), always induced on eligible ids like `SemanticProjectionPort` (v2 §5.8, lines 830–836), results id-only + fed through revalidation (O6 rule).
(c) A path query never returns an id that final revalidation would remove, and never traverses an edge between unequal `scope_ref` records.
(d) Respects all three if id-only and induced; a content-returning variant would depend on O1.

**O10 — Additional graph-algorithm receipts (community/similarity) behind `SemanticProjectionPort`.**
(a) Neo4j GDS breadth (Axe B §2.2.2) suggests memory clustering and similarity-based ER candidate generation; our port today exposes adjacency only.
(b) Optional extension methods on `SemanticProjectionPort` returning digest-receipted, cursor-pinned results over the induced eligible subgraph; ER candidates route into the O3-chartered queue only.
(c) Algorithm outputs are deterministic for a pinned cursor and reproduce the receipt digest on replay.
(d) Respects all three; data-pure, projection-side, opt-in.

**O11 — POLE-informed assertion-family pack (occurrence keys over typed events/identifiers).**
(a) Imports POLE's compare-the-same-occurrence discipline into D6 without any schema change, since occurrence-key semantics are family-internal (v2 §6, lines 1015–1016).
(b) A versioned `AssertionFamilyRegistry` distribution (registry artifact, not engine code).
(c) Two records asserting the same typed occurrence in the same scope/trust/family yield a stable proposal id; cross-trust and cross-scope pairs propose nothing (v2 §6, line 1020).
(d) Respects all three; opt-in per record via `reconciliation.family_refs` (v2 §4, lines 175–177).

**O12 — Register geo/temporal citation-locator schemes.**
(a) Gives Location (the "L" of POLE) a foothold as registered locator vocabulary (v2 §4, lines 136–139) without any record-schema geo field; projection profiles can then index it.
(b) The neutral scheme registry plus ontology-profile registries.
(c) A citation with a registered geo scheme round-trips capture → accept → projection and becomes filterable at stage 2 of O8.
(d) Respects all three; opaque values, registered neutral scheme names.

**O13 — Record the C3/C6 closure status formally.**
(a) The decision trail currently ends on CONDITIONS-REMAIN while the on-disk spec carries both closures (§0 above); the evolution decision should not rest on an unrefreshed verdict.
(b) A dated re-verification note or refreshed verdict in `spec/`.
(c) A verdict document exists whose evidence cites v2 §5.3 lines 360–369 and §5.5/§5.6 lines 498–503/608.
(d) Process hygiene; no engine surface touched.

---

## 5. Closing judgment

POLE-O and the LangChain stack do not challenge the canonical design — every capability they exhibit that we lack (typed ontology, entity resolution, pattern queries, algorithm breadth, KV-simple memory calls, structured filters) lands on the projection/adapter surfaces that D3 explicitly reserved for it, and in two cases (ontology profiles, ER candidate queues) on machinery this repository has already built for the code-knowledge graph. Conversely, nothing in Neo4j or LangChain reproduces the canonical layer's combination of admission-gated writes, dual-as-of pinned recall, immutable trust bindings, receipt chains, and dominance-grade erasure (Axe B §2.1; all cited). The single structural completion the comparison surfaces is O1 — without an authorized accepted-content projection feed, both the POLE-O projection and content-bearing GraphRAG remain unbuildable from published ports. The single discipline the comparison demands is O3/O6 — write the identity-resolution and projection-authority firewalls down before mature external tooling arrives to test them.

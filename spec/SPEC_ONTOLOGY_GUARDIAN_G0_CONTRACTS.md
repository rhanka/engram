# G0 — Guardian contracts (frozen specification)

| Field | Value |
|---|---|
| Lot | G0 — Guardian contracts (dossier §6.3, line G0) |
| Status | SOLID: independent Astra review, final round after the author switch (review-G0-astra-sol2.out, reviewed SHA-256 31f81e0477a4125c18ad84dede813c71cd221ded48c312d6df105663c354974a); recorded by the conductor on 2026-10-23 |
| Date | 2026-10-23 (Sol author round 2 of 2; selected severity/policy metadata and status corrections) |
| Author role | Spec author (Sol 6.1, effort xhigh), succeeding Muse under the owner rule; Astra alone reviews. Implementation remains in G1–G6 under their own lots. |
| Language | English (specification). Identifiers are language-neutral. |
| Stack rule | Node/TypeScript and native binaries already present only. No Python component, job, image or evaluator is introduced by this specification, by G1, or by any guardian, catalog, MCP-provider, migration or CI check specified here. Source: DOSSIER-ontology-guardian.md:411. |
| Design rule | No design evolution beyond the validated dossier. Where the dossier explicitly delegates a freeze to G0 (serializations in §2.4), this document freezes exactly that point and nothing else. Anything beyond the dossier is listed in §10 as an open question and is not decided here. |
| Code rule | This document specifies data contracts, with verbatim pinned source-type and source-predicate quotations for transcription checks; these quotations are not implementation. An implementation that needs a shape not listed here does not invent it; it raises the gap under §10. |

## Oracle pins (every rule is sourced to a pinned revision)

All line citations below use the short keys in this table. A citation without a key names a file inside the engram repository at the dossier reading; the dossier line that carries it is always given alongside, so the rule remains checkable from the oracle alone.

| Key | Document | Pin |
|---|---|---|
| [D] | DOSSIER-ontology-guardian.md (this directory) | Working-tree file, sha256 d61f576f3f0c2879bd094ce42db945a8093aa191c2c94ad31ddd9ecc1ae6f8f2; realigned on G2 and judged SOLID (review chain recorded at DOSSIER-ontology-guardian.md:730). Cited as [D:line]. |
| [S] | STUDY-conformance-by-graph-composition.md (this directory) | sha256 88b35663a5317caf225769922fbabd50e675750668878c79974000b567d0ead9 (STUDY-conformance-by-graph-composition.md:5). Cited as [S:line]. |
| [G2] | Owner decision G2 | File `/home/antoinefa/src/sentropic/.tmp/governance-unification/decisions.md`, sha256 `731ecd6c0907332ad10ce4f7ae44e7eb812a91767ce60558fe9fb3847df7bcb8`. Normative text at line 9, verbatim: « Engram governs profiles, schemas, fixtures and migrations. The Design System retains and publishes the generic @sentropic/diagram-core executor, layout and rendering. Consumers pin profiles; no second diagram metamodel. » Cited as [G2] (decisions.md:9). |
| [DS] | Design-system sources as cited by the dossier and the study | Pinned revision `25c0f3d33c258fc2b906a4b85219ffce5f67eccc` (DOSSIER-ontology-guardian.md:132; STUDY-conformance-by-graph-composition.md:5). Cited through [D] or [S] with the DS file:line they carry. |
| [R9] | Registry entry contract v9, contract `1.1.4` | File `/home/antoinefa/src/sentropic/.tmp/registry-contract/registry-entry-contract-v9.md`, sha256 `278f6613c0738a0da89679450139f1c0c1935c8224e6cca085d8874b7919ff31` (1102 lines; header at line 5: contract `1.1.4`, planning status, RC-6 blocks the Immo Lot 4 gate). Normative sections cited exactly: §3.2 Common envelope (lines 122–206, closed envelope, field table and normative types `Kind`, `Compatibility`, `Parameters`, `DocumentSchema`, `EntryDependency`, `TransportProfile`, `UiProfile`, `McpPayload`); §3.3 Parameters and bindings (bounded profile `sentropic.parameters/2020-12-bounded-v1`); §4 Skill payload and profile (§4.1) and §4.2 DecisionDossierDocument schema delivery; §5 MCP entry contract (§5.1 definition and capability policy, §5.2 server inventory, §5.3 UI renderer, §5.4 parameter profiles); §8 Versioning, digests, pinning and lifecycle (external RFC 8785 + SHA-256 entry digest, never self-embedded). Final qualification remains `unverified` (DOSSIER-ontology-guardian.md:154). Cited as [R9:§]. |
| [CAT] | Application capability catalog | File `/home/antoinefa/src/sentropic/spec/SPEC_EVOL_CATALOG.md`, sha256 `0f125278e43246a52d0aacbe5bceaa696483d69521392d56347a8801c0dacc7a`. Normative section: §3.1 The five kinds and the shared `CatalogEntry` shape (tagged union `skill \| tool \| agent \| workflow \| canvas`; shared metadata is the intersection of the kinds; kind-specific data in payloads only), with §3.2 `CatalogSource` (synchronous `snapshot()`, optional async `refresh()`) and §3.5 Discovery (`search_skills` stays skill-only; cross-kind discovery is additive `search_catalog`). Cited as [CAT:§3.1]. |
| [MEM] | Memory MCP standard v3.2 | File `.graphify/scratch/design/memory-mcp/SPEC-memory-mcp-v3.2.md`, sha256 `18c697c1cd91287fd9f814c059910ffb4b39ddb1be46af547f384c7d912177b2`. Normative sections cited exactly: M1 Agent-facing capabilities (six frozen tools, each an explicit `CapabilityTool` literal with closed schemas, independently discoverable and authorized); M2 Closed schemas and host-controlled fields; M7 Sentropic standard and both registration levels (publisher entry `(kind: "mcp", id: "sentropic.engram.memory")`, connector `engram-memory`, metadata-only `registry/entries.v1.json` via `./registry/manifest`, pure lazy local definition via `./registry/definitions` whose loader is never evaluated by `register` or `catalog()`, disabled by default). Carried at DOSSIER-ontology-guardian.md:107. Cited as [MEM:M1/M7]. |
| [BC] | bpmn-canvas sources (Report/2, lint contracts, canonical bytes) | Pinned revision `63a9258b8391b535c0ce81bbd10426136c6595d4` (verified commit in `/home/antoinefa/src/bpmn-canvas`). Normative files cited with this pin: `src/profile/report.ts`, `src/profile/lint-contracts.ts`, `src/profile/canonical.ts`, `src/profile/envelope.ts`, `schemas/profile/report-2.schema.json`. Cited as [BC@63a9258:file:line]. |
| [BP] | bpmn-io-py twin sources (Report/2 unified entries) | Repository `/home/antoinefa/src/bpmn-moddle-py` at commit `1254d9a12d591d900353218f1b48f3ca9f9ec356`; corpus authority tag `profile-corpus-v1.0.0` (tag object `dfb8a986933dd86ad176022df13efecb6c73b325`, tagged commit `cb46b3b8f893996a83c056f31f8aa92aa2364bd3`). Normative files: `src/bpmn_io/profile/_lint/report.py`, `src/bpmn_io/profile/_lint/severity.py`. The twin is an existing parity oracle only; G0 introduces no Python component, job, image or evaluator (I-7). Cited as [BP@1254d9a:file:line], corpus as [BP tag profile-corpus-v1.0.0]. |

| [ENG] | Engram source shapes and stable serialization | Commit `8f19554cea3a4397fd66a90c7e9fd5ea54c81626` in `/home/antoinefa/src/graphify`; `src/profile-validate.ts:4–13`, `src/ontology-profile.ts:69–83` and `src/ontology-profile.ts:505–511`. |
| [METHOD] | Required author method | `DESIGN-NOTE-G0-round3.md`, sha256 `27b30f79787c530129bd45f90987072899475e845f60b3cf0dc49ba24035024e`, lines 5–30. |
| [AR3] | Astra final Muse-round-3 findings (correction checklist, no design authority) | `review-G0-astra-r3.out`, sha256 `9edaa4536e6244eb63fd29ba7d444d83a7a51469aec41d08c6b2246fa21588af`; reviewed input sha256 `0a7f5cda9d51d180f0ecc387447d14fc603d724f64fd2b8871188108469314c7`. |

Reading rule. If a statement in this specification and its cited oracle line disagree, the oracle line governs and this specification is defective; the defect is reported, not silently reinterpreted. Display labels, translated names, work-package codes and renderer colours are never identity. Source: DOSSIER-ontology-guardian.md:358.

## 0. Scope, ownership and non-goals

### 0.1 What G0 freezes

G0 freezes five contracts and one fixture inventory, exactly as listed in the lot G0 deliverable. Source: DOSSIER-ontology-guardian.md:517.

| # | Contract frozen here | Section |
|---|---|---|
| 1 | The ontology record | §1 |
| 2 | Stack, derive and merge diagnostics (with the operations that produce them) | §2, §3, §4 |
| 3 | The catalog payload of kind ontology, with the artifactKind mapping and the per-library receipt gate | §5 |
| 4 | The application receipt (and the apply preview) | §6 |
| 5 | The digest rules: contentDigest, pinsDigest, resultDigest, entryDigest, with stability | §7 |
| 6 | The conformance-fixture inventory, per property and per conflict family | §8 |

G1 (sentropic registry and catalog) consumes the §5 payload and the §9 registry surface. G1 does not redefine any field frozen here. Source: DOSSIER-ontology-guardian.md:518.

### 0.2 Guardianship boundary (what the guardian does not own)

Engram as guardian owns profile definitions as data, versions and immutable publication, stacking, derivation and merge contracts with their diagnostics, deprecation and migration records, conformance-corpus references, and catalog entries. Source: DOSSIER-ontology-guardian.md:200.

The guardian does not own execution, rendering, memory or operational schemas. Source: DOSSIER-ontology-guardian.md:202, DOSSIER-ontology-guardian.md:203, DOSSIER-ontology-guardian.md:204, DOSSIER-ontology-guardian.md:205.

| Non-goal | Owner that keeps it | Source |
|---|---|---|
| Execution: Track transitions, writer and projections; h2a mandates and coordination; harness checks; Focus readability. A catalog record settles no decision, acceptance or realization. | Track, h2a, harness, Focus respectively | DOSSIER-ontology-guardian.md:202 |
| Rendering, layout, components, themes and the render standard. No runtime rendering path depends on an MCP call. | Design System | DOSSIER-ontology-guardian.md:203 |
| Memory authority. No ontology import, graph import or catalog operation captures, admits, mutates or resurrects a memory. | Canonical memory journal (D3) | DOSSIER-ontology-guardian.md:204 |
| Operational schemas (ARCH-19 object types). Alignment is by typed reference only. | Sentropic | DOSSIER-ontology-guardian.md:205, DOSSIER-ontology-guardian.md:224 |

Under G2, consumers pin the published executor version once its implementation and qualification are complete; before that, a pinned build-time copy remains valid as the transitional state. Publication is decided; its implementation and its qualification are pending, as two distinct evidence states. No published version is stated as already available: at the pinned DS revision the package records private true. Source: DOSSIER-ontology-guardian.md:203, DOSSIER-ontology-guardian.md:485, STUDY-conformance-by-graph-composition.md:32, [G2].

### 0.3 Standing invariants that bind every contract below

Each invariant is normative for §§1–9. A contract reading that weakens one of them is a defect.

| # | Invariant | Source |
|---|---|---|
| I-1 | D3: the canonical memory journal is the only memory authority; every graph, index, vector, cache, aggregate, export and scene is a projection, and no projection method may commit, admit, mutate or resurrect a canonical record. | DOSSIER-ontology-guardian.md:405 |
| I-2 | D10: graph.json is a bounded current projection (at most 52_428_800 raw bytes) of current accepted envelopes, citation references and projection metadata only; omissions are deterministic and declared. Committed typed subgraphs contain no memory body, identifier, digest, citation, relation or existence signal. | DOSSIER-ontology-guardian.md:406 |
| I-3 | The six memory tools, their closed data shapes, publisher (mcp, sentropic.engram.memory), connector engram-memory, lazy definition and disabled-by-default posture are unchanged by this specification. | DOSSIER-ontology-guardian.md:407 |
| I-4 | Neutrality: engram depends on no host; ontology contracts are data-only contracts with injected ports and import no graphology, coordination, identity, design-system or model-routing library. Dependent adapters live at the consumers. | DOSSIER-ontology-guardian.md:408, STUDY-conformance-by-graph-composition.md:406 |
| I-5 | Deterministic validation decides; assistants may propose, deterministic validators decide; patch apply calls no language model. | DOSSIER-ontology-guardian.md:409 |
| I-6 | No direct graph writes: graph.json and derived ontology artifacts are never the direct write target; writes go to project-owned sources through the patch flow. | DOSSIER-ontology-guardian.md:410 |
| I-7 | Zero Python: no Python code, job, image or evaluator is introduced by the guardian, the catalog, the MCP provider, migrations or CI checks. | DOSSIER-ontology-guardian.md:411 |
| I-8 | Separate authorities stay separate: Git and CI establish technical facts, Track establishes work, decision and acceptance state, the engram journal establishes memory. | DOSSIER-ontology-guardian.md:412 |
| I-9 | No second diagram metamodel: diagram-core types remain the single shape; the guardian references both admitted profile shapes through explicit, versioned adapters and invents no third shape. | DOSSIER-ontology-guardian.md:168, DOSSIER-ontology-guardian.md:190, [G2] |
| I-10 | No fallback to latest anywhere: unknown versions, digests or majors refuse. | DOSSIER-ontology-guardian.md:360 |
| I-11 | Preserved foreign content keeps the levels validated, preserved-unvalidated, unsupported; guardianship indexes preserved content and never promotes it. | DOSSIER-ontology-guardian.md:196 |
| I-12 | New identifiers are language-neutral; persisted values in another language remain readable under explicit mappings and are never rewritten in place. | DOSSIER-ontology-guardian.md:357 |

### 0.4 Vocabulary and family codes

Ontology, profile, instance data and guardian are used exactly as defined in the dossier. Source: DOSSIER-ontology-guardian.md:68, DOSSIER-ontology-guardian.md:69, DOSSIER-ontology-guardian.md:70, DOSSIER-ontology-guardian.md:71.

Family codes used in every table below are the dossier codes, with placement detail in dossier §3. Source: DOSSIER-ontology-guardian.md:213, DOSSIER-ontology-guardian.md:214, DOSSIER-ontology-guardian.md:215, DOSSIER-ontology-guardian.md:216, DOSSIER-ontology-guardian.md:217, DOSSIER-ontology-guardian.md:218, DOSSIER-ontology-guardian.md:219, DOSSIER-ontology-guardian.md:220, DOSSIER-ontology-guardian.md:221, DOSSIER-ontology-guardian.md:222.

| Code | Family | Source |
|---|---|---|
| DIA | Diagram profiles: generic@1, A-prime generated BPMN profiles in diagram-core, archimate@1 and uml@1 skeletons, future C4 | DOSSIER-ontology-guardian.md:213 |
| MECH | BPMN mechanism artifacts: pinned moddle descriptors, profile-mechanism schemas, lint rules, F1 exchange shape | DOSSIER-ontology-guardian.md:214 |
| D2D | d2d private business profile, d2d BPMN base, placement contract, themes; tenant-scoped; content never held by the guardian | DOSSIER-ontology-guardian.md:215 |
| ENG | Engram corpus profiles and entity registries | DOSSIER-ontology-guardian.md:216 |
| TRK | Track work vocabulary | DOSSIER-ontology-guardian.md:217 |
| H2A | h2a coordination vocabularies | DOSSIER-ontology-guardian.md:218 |
| HRN | Harness method vocabulary | DOSSIER-ontology-guardian.md:219 |
| RPK | repo-knowledge@1 with committed typed subgraphs and timing exports | DOSSIER-ontology-guardian.md:220 |
| MEM | Memory assertion families: definitions only; records stay in the canonical journal | DOSSIER-ontology-guardian.md:221 |
| EXT | External ontology packs with provenance and coverage record | DOSSIER-ontology-guardian.md:222 |

Sentropic ARCH-19 operational types are excluded from all six properties; the guardian aligns them by typed reference and offers no operation over them. Source: DOSSIER-ontology-guardian.md:224.

## 1. Contract 1 — The ontology record

### 1.1 Definition

An ontology, for guardian purposes, is a five-part record; no part alone is an ontology. Source: DOSSIER-ontology-guardian.md:185.

| Part | Content | Source |
|---|---|---|
| 1. Versioned profile | The normative declaration, in one of the two admitted shapes (§1.2). No third shape is admitted. | DOSSIER-ontology-guardian.md:187, DOSSIER-ontology-guardian.md:190 |
| 2. Conformance corpus | Fixtures that prove the declaration: valid documents or graphs, rejected cases with asserted diagnostics, inverse sequences. | DOSSIER-ontology-guardian.md:191 |
| 3. Identity and digests | Identity (namespace, id, version) plus the four digests of §7, each computed by a distinct procedure. | DOSSIER-ontology-guardian.md:192 |
| 4. Lineage record | Ordered pinned parents or imports, derivation operations, mapping files to other ontologies, migration functions. | DOSSIER-ontology-guardian.md:193 |
| 5. Catalog entry | The management record of §5, of kind ontology, linked to its invocation tools (§9). | DOSSIER-ontology-guardian.md:194 |

Instances conform to an ontology and are governed through it; an instance is never an ontology. Source: DOSSIER-ontology-guardian.md:196.

### 1.2 The two admitted profile shapes (no unification, no third shape)

Two profile shapes exist today and both stay; the guardian record references each through an explicit, versioned adapter. A silent unification is refused. Source: DOSSIER-ontology-guardian.md:168, DOSSIER-ontology-guardian.md:190.

| Shape | Declaration | Identity inside the shape | Source |
|---|---|---|---|
| Engram shape | OntologyProfile: types, relations with typed endpoints, entity registries, citation, evidence, inference and hardening policies, hierarchies, class hierarchies, outputs; normalized to NormalizedOntologyProfile with profile_hash. | id plus version; content anchor profile_hash (see §7). | DOSSIER-ontology-guardian.md:188 (src/types.ts:1163, src/types.ts:1221 as read there) |
| Diagram shape | diagram-core Profile: entity, port and relation type declarations with roles and cardinalities, executable constraints, limits, completeness. The DS meta-model (SemanticDocument, ViewDocument, nominal references, transactional commands, versioned migration) is the reference for diagram semantics. | Name at major, written name@major, so two majors coexist. | DOSSIER-ontology-guardian.md:189 (packages/diagram-core/src/profile.ts:92, packages/diagram-core/src/profile.ts:21 at [DS]) |

Engram profiles are the reference for corpus and graph semantics; the DS meta-model is the reference for diagram semantics. Source: DOSSIER-ontology-guardian.md:190.

The diagram profile validator requires endpoint types inside one profile; no cross-profile import or join exists today. Stacking (§2) answers this without inventing a join: cross-profile endpoints refuse until a module or join contract covers them. Source: DOSSIER-ontology-guardian.md:177, DOSSIER-ontology-guardian.md:255.

### 1.3 Shared value types used by every contract in this specification

These types are data only. They introduce no model and no execution. Source: DOSSIER-ontology-guardian.md:408, STUDY-conformance-by-graph-composition.md:406.

| Type | Exact form | Source |
|---|---|---|
| Digest | String of exactly 64 lowercase hexadecimal digits: a full SHA-256 value. No truncated, prefixed or FNV form is a Digest in this specification. | DOSSIER-ontology-guardian.md:140 as carried at DOSSIER-ontology-guardian.md:154; DOSSIER-ontology-guardian.md:169 |
| Pin | Closed object with exactly three fields: id (string), version (string, exact, no range, no tag), contentDigest (Digest). A pin with a range, a tag such as latest, or a missing digest is not a Pin. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:367, DOSSIER-ontology-guardian.md:360 |
| Pin list | Ordered array of Pin. Order is significant: two lists with the same pins in a different order are different pin lists. Duplicate pins in one list refuse (see §2). | DOSSIER-ontology-guardian.md:367 |
| Tenant visibility | Either the literal public, or private: followed by one tenant identifier. No other visibility value exists. Private content is never held by the guardian. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:236 |
| Exact version | A single exact version string. Ranges, tags and floating references are refused everywhere in §§1–9. | DOSSIER-ontology-guardian.md:359, DOSSIER-ontology-guardian.md:360 |
| DigestEvidence (single unresolved encoding, used identically in §§1.4, 3.1, 5.3, 5.5, 7.2) | Discriminated union on `evidenceState`. Arm `resolved`: closed object `evidenceState: resolved` plus `digest` (Digest). Arm `unresolved`: closed object `evidenceState: unresolved` with no `digest` field. An unresolved digest is never encoded as an absent field without the sibling state, never as `null`, never as an empty string and never as a placeholder digest. Where a table lists a digest field as « Digest, or absent », the absence is exactly this `unresolved` arm and the sibling `evidenceState` field is present in the same closed object. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:335 (evidence recorded once resolved; no substitute value before that) |

Private lineage types (one definition, reused by §§1.4, 3.1 and 5.3). `ResultingDigests` is the closed object `{ contentDigest: Digest, pinsDigest: Digest, resultEvidence: DigestEvidence }`. `PrivateDerivationRef` is the closed object `{ base: Pin, deltaDigest: Digest, mappingRef?: Pin }`. `PrivateLineage` is the closed object `{ parents: Pin[], derivationRef?: PrivateDerivationRef, mappings: mapping-reference[], migrations: migration-reference[] }`; parents keep stack order. A full owner-side delta is represented guardian-side only by `PrivateDerivationRef`, never by operations or rule bodies. Source: [D:193], [D:236], [D:308], [D:327].

`PrivateDerivationRecord` is the closed object `{ base: Pin, deltaDigest: Digest, mappingRef?: Pin, resultingDigests: ResultingDigests }`. It is a derivation-result record, not the lineage container or its reference. The lossless reference-to-record mapping is: take `base`, `deltaDigest` and optional `mappingRef` from `lineage.derivationRef`, and take `resultingDigests` from the **same candidate/entry version** enclosing `digests`; conversely, project those first three fields back into `derivationRef` and copy `resultingDigests` into enclosing `digests`. Every field is kept; mismatching copies refuse with `digest-mismatch`. No fetch of private content is involved. The reference intentionally does not duplicate `resultingDigests`; without its enclosing digests it is a reference, not a full result record. Source: [D:308], [D:327], [D:368].

The DS FNV-1a hash (fnv1a hex, explicitly non-cryptographic drift detection, never a trust gate) stays an internal drift receipt inside the artifact. It is none of the four digests of §7 and never serves as a catalog digest. Source: DOSSIER-ontology-guardian.md:126, DOSSIER-ontology-guardian.md:169, DOSSIER-ontology-guardian.md:192.

### 1.4 Exact shape of the ontology record (closed)

The record is closed: a field not listed in this table is not part of the G0 record, and a record carrying one refuses at qualification (see §1.7). Field names are the G0 freeze of the dossier fields cited per row; no dossier field is dropped, renamed or merged into another.

| Field | Type | Required | Meaning and closure | Source |
|---|---|---|---|---|
| namespace | String | Yes | Namespace or scope segment of the ontology identity. Together with id and version it forms the ontology identity. | DOSSIER-ontology-guardian.md:192, DOSSIER-ontology-guardian.md:358 |
| id | String | Yes | Stable ontology identifier, language-neutral for new identifiers. Display labels are never this value. | DOSSIER-ontology-guardian.md:357, DOSSIER-ontology-guardian.md:358 |
| version | String (exact version) | Yes | Exact version of this record. Published bytes under (id, version) never change; any change is a new version. | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:359 |
| owner | String | Yes | Durable actor or team handle that owns the ontology. Publication without an owner refuses. | DOSSIER-ontology-guardian.md:230 |
| lifecycle | Enum: draft, published, deprecated, superseded | Yes | Lifecycle state of the profile itself. Entity hardening statuses are a different assertion and are never reused here. | DOSSIER-ontology-guardian.md:229, DOSSIER-ontology-guardian.md:230 |
| completeness | Enum: skeleton, complete | Yes | Declaration completeness only. It never waives evidence and never substitutes for a missing receipt. | DOSSIER-ontology-guardian.md:191, DOSSIER-ontology-guardian.md:340 |
| visibility | Tenant visibility (§1.3) | Yes | public, or private:tenant for tenant-scoped private entries whose content engram never holds. | DOSSIER-ontology-guardian.md:327 |
| profileShape | Enum: engram-profile, diagram-profile, track-vocabulary, timing-reference, mechanism-descriptor | Yes | Shape discriminant of the versioned profile or artifact. The value is exactly one of the five listed. | DOSSIER-ontology-guardian.md:327 |
| artifactKind | Enum: mechanism, base, profile, theme, corpus, contract | Yes | d2d discriminant kept verbatim. Each value maps to exactly one handling in §5.3; no value is dropped, renamed or merged. | DOSSIER-ontology-guardian.md:329, DOSSIER-ontology-guardian.md:331 |
| profileRef | Closed object: canonicalRef (string), contentDigest (Digest) | Yes | Canonical reference to the versioned profile, with its content digest (§7). For private entries this object carries the digest only as recorded evidence; it never carries the private body. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:236 |
| corpusRef | Closed object: ref (string), digest (Digest) | Yes for published; see §1.5 | Conformance-corpus reference and manifest digest. An ontology without a corpus is not admitted and stays a draft outside the catalog. | DOSSIER-ontology-guardian.md:191, DOSSIER-ontology-guardian.md:327 |
| digests | Closed object: contentDigest (Digest), pinsDigest (Digest), resultEvidence (DigestEvidence of §1.3 over resultDigest) | Yes for published; rules in §7 | The three content-side digests. `contentDigest` and `pinsDigest` are always present. `resultDigest` is carried only inside `resultEvidence`: arm `resolved` carries the digest, arm `unresolved` carries no digest value (publication requires `resolved`, §1.5). entryDigest is a field of the catalog entry (§5), computed over the whole entry and never self-embedded; the record references it through its catalog entry, it does not embed a second copy as identity. | DOSSIER-ontology-guardian.md:192, DOSSIER-ontology-guardian.md:369 |
| lineage | Discriminated union on visibility. Public arm: closed object: parents (Pin list), derivation (Derivation record of §3, or absent), mappings (array of mapping references), migrations (array of migration references). Private arm (`private:tenant`): `PrivateLineage` of §1.3 | Yes (parents may be the empty list only for a base with no parent; see §2) | Ordered, pinned lineage. Parents are in stack order. Mapping files and migration functions are referenced, never embedded as profile bytes. The private arm carries no delta operation, no declaration payload and no rule body: derivation is by `PrivateDerivationRef` only. §3.1 uses the explicit §1.3 reference-to-record mapping for `resultingDigests`; §5.3 reuses this same `PrivateLineage` container. | DOSSIER-ontology-guardian.md:193, DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:236 |
| consumers | Array of string | Yes (may be empty only before first publication; publication requires the list to be present) | Catalog ids or repository pins to notify before a major ships. | DOSSIER-ontology-guardian.md:230 |
| supersededBy | Pin, or absent | Required iff lifecycle is superseded; optional iff lifecycle is deprecated and a successor is known; absent otherwise | Successor pin. On a superseded record it is paired with a migration reference; on a deprecated record it records the known successor without changing the deprecation state. | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:234, DOSSIER-ontology-guardian.md:245 |
| migrationRef | String reference, or absent | Required per major where a migration exists; absent only where no migration is defined | Migration reference for the major. Diagram schema migration keeps the original and refuses an unknown major in write. | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:125 |
| deprecatedReason | String, or absent | Required iff lifecycle is deprecated | Deprecation reason. Carried with deprecatedAt in the catalog record (§5); the profile bytes do not carry it. | DOSSIER-ontology-guardian.md:245 |
| deprecatedAt | Date string, or absent | Required iff lifecycle is deprecated | Deprecation date recorded on the catalog record. | DOSSIER-ontology-guardian.md:245 |
| catalogEntryRef | String reference, or absent | Required iff admitted to the catalog; absent for a draft outside the catalog | Reference to the §5 catalog entry of kind ontology. No part alone is an ontology: a draft without admission has no catalog entry and is not presented as catalogued. | DOSSIER-ontology-guardian.md:185, DOSSIER-ontology-guardian.md:191, DOSSIER-ontology-guardian.md:194 |

Closure notes (normative). (a) The record carries no credentials, no secret, no endpoint address and no authorization grant. Source: DOSSIER-ontology-guardian.md:327 (no credentials in entries), DOSSIER-ontology-guardian.md:580. (b) The record carries no memory body, identifier, citation or existence signal. Source: DOSSIER-ontology-guardian.md:406, DOSSIER-ontology-guardian.md:352. (c) For private entries the record carries pins, digests, stack and receipts only; business names and the profile body never appear. Source: DOSSIER-ontology-guardian.md:346, DOSSIER-ontology-guardian.md:386. (d) Entity-registry record data is project data and never catalog content. Source: DOSSIER-ontology-guardian.md:347.

### 1.5 Lifecycle: publication, deprecation, supersession (Manageable)

Operations. publish(id, version), deprecate(id, version, reason), supersede(old, new, migrationRef) are the lifecycle operations, with family spellings in dossier §2.3 Manageable. Source: DOSSIER-ontology-guardian.md:234, DOSSIER-ontology-guardian.md:235, DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:237, DOSSIER-ontology-guardian.md:238, DOSSIER-ontology-guardian.md:239, DOSSIER-ontology-guardian.md:240, DOSSIER-ontology-guardian.md:241, DOSSIER-ontology-guardian.md:242, DOSSIER-ontology-guardian.md:243.

Publication requires all of the following; missing any one refuses and registers nothing. Source: DOSSIER-ontology-guardian.md:230.

| Publication precondition | Source |
|---|---|
| Profile self-validation green (engram validateOntologyProfile discipline; diagram validateProfile discipline, per shape) | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:85, DOSSIER-ontology-guardian.md:128 |
| Conformance corpus green, with every per-library receipt required by §5.4 present; no receipt may be missing | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:340 |
| Licence closure recorded, within MIT, Apache-2.0, CC0 with transitive closure | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:112 |
| Owner present (§1.4) | DOSSIER-ontology-guardian.md:230 |
| Every applicable digest of §7 computed, with `digests.resultEvidence.evidenceState: resolved`; every required receipt also carries resolved, matching result evidence (§5.5) | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:335, DOSSIER-ontology-guardian.md:340 |

Deprecation semantics (all families, normative). Deprecation is a state change on the catalog record, never a deletion and never a profile-byte change. A deprecated version stays resolvable by pin forever, is excluded from new selections by default, and carries reason, deprecatedAt and, when known, supersededBy. Consumers pinned to a deprecated version keep working; only new adoption is discouraged. Digest consequence: contentDigest, pinsDigest and resultDigest are unchanged; entryDigest changes, and a deprecation that leaves entryDigest unchanged fails qualification. Source: DOSSIER-ontology-guardian.md:245, DOSSIER-ontology-guardian.md:369, DOSSIER-ontology-guardian.md:570.

Pins are never deleted; deprecation that would delete a pin refuses. Source: DOSSIER-ontology-guardian.md:235.

### 1.6 Record invariants

| # | Invariant | Source |
|---|---|---|
| R-1 | Identity is (namespace, id, version) for ontologies and (kind, id, entryVersion) for catalog records, completed by the digests of §7. No other value is identity. | DOSSIER-ontology-guardian.md:358 |
| R-2 | Every published version is immutable: bytes under (id, version) never change; any change is a new version; a changed package version forces a new entry version, at least a patch. | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:359 |
| R-3 | skeleton or complete states declaration completeness only; it never waives evidence. | DOSSIER-ontology-guardian.md:191 |
| R-4 | An ontology without a corpus is not admitted to the catalog; it stays a draft outside the catalog. For MECH, D2D and A-prime generated-BPMN entries, admission additionally requires every receipt of §5.4, without any skeleton fallback. | DOSSIER-ontology-guardian.md:191 |
| R-5 | Two stacks with the same top id but different parents are different ontologies (different pinsDigest). | DOSSIER-ontology-guardian.md:251 |
| R-6 | The guardian never holds private content: for any private:tenant entry, no operation returns the private body, and no record field contains it. | DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:257 |
| R-7 | Guardianship governs definitions and mappings, never settlement authority: no record, receipt or catalog state settles a decision, an acceptance or a realization. | DOSSIER-ontology-guardian.md:202 |
| R-8 | Track journals, h2a wire values and other persisted facts are never rewritten by a lifecycle operation; deprecated terms and wire values stay decodable forever under explicit mappings. | DOSSIER-ontology-guardian.md:238, DOSSIER-ontology-guardian.md:239, DOSSIER-ontology-guardian.md:357 |

### 1.7 Typed errors for the record contract

A refusal registers nothing, publishes nothing and deletes nothing. The error code is the typed refusal; the human-readable detail never carries private content, credentials or memory data. Source: DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:352.

| Code | Raised when | Effect | Source |
|---|---|---|---|
| validation-refusal | Profile self-validation is red, a registry binding is unknown, a relation endpoint is outside declared types, or a visual encoding is invalid | Nothing registered | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:237 |
| missing-owner | Publication is attempted without an owner | Nothing registered | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:234 |
| missing-licence-closure | Licence closure is missing, or the transitive closure contains an excluded lineage | Nothing registered; no lifecycle state cures it | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:243 |
| missing-receipt | Any receipt required by §5.4 for the entry scope is missing, at any completeness including skeleton | Not admitted; the candidate stays a draft outside the catalog | DOSSIER-ontology-guardian.md:340, DOSSIER-ontology-guardian.md:344 |
| not-published | Deprecation targets an unpublished version | No state change | DOSSIER-ontology-guardian.md:234 |
| digest-mismatch | Mutated published bytes are presented, a descriptor digest mismatches, or a pinned digest does not recompute equal | Refusal; never a fallback load | DOSSIER-ontology-guardian.md:234, DOSSIER-ontology-guardian.md:256 |
| incompatible_version | An unknown version, digest or major is requested | Refusal; never latest | DOSSIER-ontology-guardian.md:360 |
| integrity_mismatch | An entry or asset digest does not match its bytes | Refusal before any load or effect | DOSSIER-ontology-guardian.md:360 (registry discipline) |
| private-content-refusal | Any operation requests, or would return, the private profile body guardian-side | Refusal; the guardian holds no content to return | DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:257 |

Expected fixtures for this contract are FX-MNG-* in §8.1. The decisive fixtures are: publish then get returns identical bytes; deprecate then get still returns the version with the deprecation record, with contentDigest, pinsDigest and resultDigest unchanged and entryDigest changed. Source: DOSSIER-ontology-guardian.md:234, DOSSIER-ontology-guardian.md:245.

## 2. Contract 2a — Stack diagnostics (effective stacking)

### 2.1 Common diagnostic envelope (stack, derive, merge, validate) — lossless typed variants

Every diagnostic produced by §§2–4 and carried in §6 uses this closed envelope. A diagnostic outside this shape is not a G0 diagnostic. The envelope is lossless: the native code emitted by the validator that produced the finding is preserved verbatim, and every Report/2 field required for field-by-field parity comparison is carried without mapping loss. No native field is dropped, renamed without a verbatim copy, or replaced by a localized sentence.

The envelope is a discriminated union on `origin`. All variants share the common fields; the variant fields below are additional and closed. A consumer that needs only the G0 `code` reads `code`; a parity comparison reads `nativeCode` and the native fields field by field.

#### 2.1.0 Source shapes, transcribed verbatim (pinned), then the G0 extension

**Source shape S-REPORT2** ([BC@63a9258:src/profile/report.ts:6–28]; `ProfileIdentity` is transcribed in §7.2). These are native types; G0 fields are never added inside them.

~~~ts
export const resultOperations = ["complete", "normalize", "validate", "resolveTheme", "mapExport", "serializePrepared", "prepareExport", "getDefinitions", "getSnapshot", "setDefinitions", "applyCommands", "activateBusinessProfile", "setTheme", "restoreSnapshot", "undo", "redo", "exportPrepared"] as const;
export const reportStages = ["load", "import", "complete", "pre-normalize", "normalize", "post-normalize", "layout", "post-layout", "release", "render", "export"] as const;
export const lossClasses = ["semantic-type", "relation-kind", "navigation", "appearance", "layout", "metadata", "unsupported-feature", "provenance-unavailable"] as const;
export const capabilities = ["engine-byte-compatible", "structural", "unsupported"] as const;
export type Capability = typeof capabilities[number];
export interface Coordinate { readonly domain: "tree" | "profile" | "artifact" | "none"; readonly pointer: string | null; readonly targetId: string | null; readonly provenance: "exact" | "unavailable" | "generated" }
export interface ReportEntry {
  readonly code: string; readonly severity: "info" | "warn" | "error";
  readonly classification: "integrity" | "readiness" | "repairable" | "advisory" | "loss";
  readonly stage: typeof reportStages[number]; readonly ruleId: string; readonly messageKey: string;
  readonly disposition: "observed" | "corrected" | "dropped" | "mapped" | "refused";
  readonly source: Coordinate; readonly result: Coordinate; readonly beforePresent: boolean; readonly before?: unknown;
  readonly afterPresent: boolean; readonly after?: unknown;
  readonly originalType?: string; readonly property?: string; readonly causedBy?: string; readonly pageId?: string;
  readonly occurrenceKey?: string; readonly emittedType?: string; readonly legacyCode?: string; readonly lossClass?: typeof lossClasses[number];
}
export interface IdMapping { readonly sourceId: string; readonly resultId: string; readonly domain: "migration" | "export"; readonly pageId?: string; readonly occurrenceKey?: string }
export interface ReportArtifact { readonly format: string; readonly pageId?: string; readonly capability: Capability; readonly digest?: string; readonly entryIndexes: readonly number[] }
export interface Report {
  readonly reportVersion: "2"; readonly operation: string; readonly sourceIdentity?: ProfileIdentity; readonly targetIdentity?: ProfileIdentity;
  readonly inputRevision?: string; readonly outputRevision?: string; readonly entries: readonly ReportEntry[];
  readonly rawStandardFindings: readonly unknown[]; readonly idMap: readonly IdMapping[]; readonly artifacts: readonly ReportArtifact[];
}
~~~

**Native coordinate predicates** ([BC@63a9258:src/profile/report.ts:30–39]), quoted verbatim:

~~~ts
export function validateCoordinate(value: unknown): asserts value is Coordinate {
  const c = record(value, ["domain", "pointer", "targetId", "provenance"]);
  choice(c.domain, ["tree", "profile", "artifact", "none"]); choice(c.provenance, ["exact", "unavailable", "generated"]);
  if (c.pointer !== null) { text(c.pointer, true); if (!validPointer(c.pointer)) failContract(); }
  if (c.targetId !== null) text(c.targetId);
  if (c.provenance === "unavailable" && c.pointer !== null || c.provenance !== "unavailable" && c.pointer === null) failContract();
  if (c.domain === "none" && (c.pointer !== null || c.targetId !== null || c.provenance !== "unavailable")) failContract();
}
export const validPointer = (s: string): boolean => (s === "" || s.startsWith("/")) && !/~(?![01])/.test(s);
~~~

Thus `provenance === "unavailable"` iff `pointer === null`, but `domain === "none"` only **implies** `pointer === null && targetId === null && provenance === "unavailable"`; the converse is not required. Both `{domain:"tree",pointer:null,targetId:"Task_1",provenance:"unavailable"}` and `{domain:"tree",pointer:null,targetId:null,provenance:"unavailable"}` are valid. A pointer is empty or begins with `/` and has no invalid `~` escape. G0 adds no stronger predicate.

Native closure and order are preserved: `validateEntry` requires exactly the S-REPORT2 required fields, permits only its optional fields, checks `beforePresent/afterPresent` against actual field presence, and permits/requires `lossClass` iff classification is `loss`. `compareEntries` first compares stage rank in `reportStages`, then `ruleId, source.domain, source.pointer, source.targetId, code, pageId, occurrenceKey, canonical(before)` when present, and `canonical(after)` when present, with null/absent components before text and UTF-16 text order. Exact canonical duplicate entries refuse in a supplied Report; a supplied Report out of native order refuses. `idMap` retains native `domain, pageId, occurrenceKey, sourceId, resultId` order. Artifact `entryIndexes` are strictly increasing, unique safe integers into this unchanged entries array; every loss entry must be reachable from an artifact; unsupported artifacts have no digest. G0 neither re-sorts nor deduplicates an already produced native report. Source: [BC@63a9258:src/profile/report.ts:40–53], [BC@63a9258:src/profile/report.ts:64–112], [BC@63a9258:schemas/profile/report-2.schema.json:1].

**Native lint barrier**, quoted verbatim ([BC@63a9258:src/profile/lint-contracts.ts:94–96]):

~~~ts
export function lintSummary(entries: readonly Pick<ReportEntry, "severity" | "disposition">[]): { readonly ok: boolean; readonly counts: { info: number; warn: number; error: number } } {
  const counts = { info: 0, warn: 0, error: 0 }; for (const e of entries) { choice(e.severity, ["info", "warn", "error"]); if (!["corrected", "dropped", "mapped"].includes(e.disposition)) counts[e.severity]++; } return { ok: counts.error === 0, counts };
}
~~~

Only entries whose disposition is outside `corrected|dropped|mapped` count. An error with any of those three dispositions does not fail this barrier. The native application result, including retained checks outside lint, is still the producing validator's result (§6.2); G0 does not replace it with an “any error” test.

**Twin source shape S-BPFINDING** ([BP@1254d9a:src/bpmn_io/profile/_lint/report.py:67–104]). Native field transcription: `rule_id: str, code: str, message_key: str, severity: str, classification: str, stage: str, pointer: str | None, target_id: str | None, provenance: str, disposition: str, domain: str = "tree"`. Exact `entry_of` mapping: `rule_id → ruleId`, `message_key → messageKey`, `code/severity/classification/stage/disposition` keep their names and values; `domain/pointer/target_id/provenance → source.{domain,pointer,targetId,provenance}` and the identical copied `result`; `beforePresent = afterPresent = false`, with neither value field present. Every Finding field is mapped. Native twin merge identity includes `origin, ruleId, code, targetId, sourcePointer, stage`; its lint-stage rank and UTF-16 comparator stay native ([BP@1254d9a:src/bpmn_io/profile/_lint/report.py:182–215]). Transport and effective severity stay distinct: `0/1/2/3 → off/warn/error/info`; effective `info` travels through upstream `warn` and the native adapter restores the policy's effective severity before emitting the native entry ([BP@1254d9a:src/bpmn_io/profile/_lint/severity.py:24–76]). G0 never rewrites a native emitted severity or imposes the canvas builder on twin output.

**Source shape S-DSDIAG** ([DS] `packages/diagram-core/src/diagnostics.ts:82–94`), verbatim:

~~~ts
export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  /** Where, as a dotted path into the document or view (`entities.entity:n1.attributes.size`). */
  readonly path: string;
  readonly message: string;
  /** The references the diagnostic is about, raw, so a caller can highlight them. */
  readonly refs?: readonly string[];
  /** Scalar facts a caller may act on (expected/seen revisions, bounds, kinds). */
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}
~~~

The constructor's default severity is `error`; it does not make `Diagnostic.severity` optional ([DS] same file:109–115).

**Source shape S-ENGISSUE** ([ENG] `src/profile-validate.ts:4–13`), verbatim:

~~~ts
export type ProfileValidationSeverity = "error" | "warning" | "info";

export interface ProfileValidationIssue {
  severity: ProfileValidationSeverity;
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  edgeIndex?: number;
}
~~~

**Source shape S-COMPILED** ([BC@63a9258:src/profile/lint-contracts.ts:8–12]), verbatim:

~~~ts
export const lintStages = ["import", "pre-normalize", "post-normalize", "post-layout", "release"] as const;
type Severity = "off" | "info" | "warn" | "error";
export interface Setting { readonly rule: string; readonly severity: string | number; readonly classification?: string; readonly options?: Readonly<Record<string, unknown>> }
interface Rule { readonly id: string; readonly phase: string; readonly [key: string]: unknown }
export interface CompiledLintOptions { readonly mechanismVersion: "1"; readonly profileDigest: string; readonly phase: string; readonly readinessPolicy: string; readonly compiledRules: readonly Rule[]; readonly bindings: readonly { readonly ownerId: string; readonly role: string; readonly targetId: string }[]; readonly severityPolicyDigest: string }
~~~

The `Rule` index signature above is the TypeScript source type, not permission for extra runtime fields. The pinned `validateCompiledOptions` predicate closes each compiled rule to required `id, phase, select, assert, code, message, classification` and optional `repairRecipe, bindings` **only**; `options` is forbidden in a compiled profile rule ([BC@63a9258:src/profile/lint-contracts.ts:81–93]). `Setting.options` belongs to inherited standard-rule settings; profile-local validation settings are closed to `rule, severity, classification` ([BC@63a9258:src/profile/lint-contracts.ts:58–62]). Top-level `CompiledLintOptions.bindings` and a compiled rule's optional `bindings` are separate fields and never substitute for one another.

Field mapping (every native field kept; G0-only routing fields added). For a private run, full owner evidence remains owner-side at `proofBindings.compiledLintEvidence.ownerReceiptRef` (§5.5); the guardian holds that reference, pins and digests, not compiled rule bodies or binding targets.

| Source fields | G0 location | Status |
|---|---|---|
| Every S-REPORT2 ReportEntry field listed above (required and optional, including both Coordinates and presence flags) | Same name in a separate `origin: report2` diagnostic; erasing only G0 routing fields recovers the exact native entry (§2.1.1) | kept |
| Every S-REPORT2 Report field, including `entries, rawStandardFindings, idMap, artifacts` and optional identities/revisions | §6.2 `report` whole, unchanged; `diagnostics` is a separate array, never `report.entries` | kept |
| S-DSDIAG `code, severity, path, message, refs, details` | Same names in `origin: diagram-core` | kept |
| S-ENGISSUE `severity, code, message, path, nodeId, edgeIndex` | Same names in `origin: engram` | kept |
| S-COMPILED `mechanismVersion` | §5.5 public `compiledLintEvidence.compiledOptions.mechanismVersion`; private referenced owner evidence, same path | kept |
| S-COMPILED `profileDigest` | Same location, `.profileDigest`; the native complete-profile digest, not a renamed pin digest | kept |
| S-COMPILED `phase` | Same location, `.phase` | kept |
| S-COMPILED `readinessPolicy` | Same location, `.readinessPolicy` | kept |
| S-COMPILED `compiledRules`, each required `id, phase, select, assert, code, message, classification` and optional `repairRecipe, bindings` | Same location, `.compiledRules`, with all native rule fields; §7.2 public `effectiveRuleSet[].ruleBody` also keeps each applicable rule in full; private owner document/evidence keeps the bodies | kept |
| S-COMPILED top-level `bindings[].ownerId, role, targetId` | Same location, `.bindings[]`; these are not per-rule bindings | kept |
| S-COMPILED `severityPolicyDigest` | Same location, `.severityPolicyDigest`, equal to `proofBindings.severityPolicyDigest`; public P-RESULT binds it; private evidence keeps the run selection separately from the unchanged owner document | kept |
| Setting `rule, severity, classification?, options?` | §5.5 `compiledLintEvidence.settings[]` (private: same fields in referenced owner evidence); full effective settings feed native `severityPolicyDigest` | kept |
| Study §3.2 disposition reference N1–N9 | `studyDisposition`, outside native ReportEntry | renamed (avoids overwriting native `disposition`) |
| No native equivalent | `origin, nativeCode, subjectRef`, plus `reportEntryIndex` only for `report2` | added, G0 routing only |

Common fields (every variant):

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| origin | Enum: report2, diagram-core, engram, guardian | Yes | Discriminant of the variant. Selects which additional closed fields below are present. | STUDY-conformance-by-graph-composition.md:345 |
| code | String, native code for native variants; from the closed per-operation list in §§2.4, 3.4, 4.3 for `guardian` | Yes | Native variants keep their native `code` exactly; only `guardian` uses the G0 conflict codes. The code, not a localized sentence, decides the refusal class. Named diagnostics are required; silent loss is refused by construction. | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:251 |
| nativeCode | String | Yes | Verbatim native code as emitted by the producing validator (diagram-core diagnostic code, engram issue code, `bpmnlint` rule outcome code, or the G0 code itself for guardian-origin findings). Preserved exactly; parity compares this field field by field. For guardian-origin diagnostics (§§2–4 composition, derivation, merge refusals), `nativeCode` equals `code`. | STUDY-conformance-by-graph-composition.md:345 (Report/2 entries: stage, ruleId, code, messageKey, severity, classification, disposition, source coordinate, provenance), DOSSIER-ontology-guardian.md:270 |
| ruleId | String, or null; present in variants `report2` and `guardian` only | Yes in those variants (null allowed only where no rule produced the finding) | Stable rule or check identifier that produced the finding (`bpmnlint` rule id, profile constraint id, or G0 conflict identifier). Variants `diagram-core` and `engram` have no native ruleId and carry none; their check identity is their native `code`. | STUDY-conformance-by-graph-composition.md:153 (rule id, message key, source coordinate per finding), STUDY-conformance-by-graph-composition.md:345 |
| subjectRef | String | Yes | Identifier of the subject: a type id, relation id, attribute name, pin rendered as id@version, or target reference. For private stacks this field never contains private content; it carries the pin or the refusal class only. Added by G0; it never replaces a native coordinate. | DOSSIER-ontology-guardian.md:257, DOSSIER-ontology-guardian.md:295 |

Severity, code-adjacent and locator fields are variant fields, not common fields: each variant keeps its native `severity` literal set, its native locator and its native text field under the source names of §2.1.0, so no native value is ever translated (`warn` never becomes `warning`, a dotted DS `path` never becomes an RFC 6901 pointer, an engram `message` never becomes a `messageKey`). For BPMN lint, the barrier is exactly the native `lintSummary` predicate of §2.1.0 (severity plus disposition), applied to native entries. For `diagram-core`, `engram` and `guardian`, severity `error` blocks. Application result remains the native validator result (§6.2). Every stack, derive and merge refusal in §§2–4 carries a blocking error of its variant.

Variant `report2` (BPMN findings; produced whenever a BPMN target is validated, in any validator role of §6.3). The separate diagnostic copy is exactly S-REPORT2 `ReportEntry` plus the common G0 fields, `reportEntryIndex` and optional `studyDisposition`; the native entry is unchanged. Closed field set, with required/optional status as transcribed:

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| code | String | Yes | Native Report/2 code, verbatim; equals `nativeCode`. | [BC@63a9258:src/profile/report.ts:12] |
| severity | Enum: info, warn, error | Yes | Native emitted Report/2 severity, unchanged. The native adapter has already restored effective `info` from its policy row after upstream transport; G0 performs no severity rewrite. | [BC@63a9258:src/profile/report.ts:12], [BP@1254d9a:src/bpmn_io/profile/_lint/severity.py] |
| classification | Enum: integrity, readiness, repairable, advisory, loss | Yes | Native Report/2 classification, verbatim. | [BC@63a9258:src/profile/report.ts:12] |
| stage | Enum: load, import, complete, pre-normalize, normalize, post-normalize, layout, post-layout, release, render, export | Yes | Native Report/2 stage, verbatim. | [BC@63a9258:src/profile/report.ts:7] |
| ruleId | String | Yes | Native rule id, verbatim (`bpmnlint` rule name without prefix, `profile:<id>` for profile rules, `adapter` for adapter entries). | STUDY-conformance-by-graph-composition.md:345, [BP@1254d9a:src/bpmn_io/profile/_lint/report.py:68] |
| messageKey | String | Yes | Native stable message key, verbatim. Localized text is never this field. | STUDY-conformance-by-graph-composition.md:153 |
| disposition | Enum: observed, corrected, dropped, mapped, refused | Yes | Native Report/2 disposition, verbatim, with its source meaning (observed/corrected/dropped/mapped/refused). It never carries a study §3.2 reference; that reference is `studyDisposition`. Counts for the lint barrier run over entries whose disposition is none of corrected, dropped, mapped. | [BC@63a9258:src/profile/report.ts:12], [BC@63a9258:src/profile/lint-contracts.ts] (`lintSummary`) |
| studyDisposition | String, or absent | No | Study §3.2 disposition reference (N1–N9) where the check sits outside composition; absent for composed-pattern findings. Never invented, never stored in `disposition`. | STUDY-conformance-by-graph-composition.md:321, STUDY-conformance-by-graph-composition.md:345 |
| source | Coordinate of S-REPORT2: closed object domain, pointer, targetId, provenance | Yes | Source coordinate, verbatim, with the S-REPORT2 coordinate invariants. Provenance is never fabricated. | [BC@63a9258:src/profile/report.ts:11] |
| result | Coordinate of S-REPORT2 | Yes | Result coordinate, verbatim. | [BC@63a9258:src/profile/report.ts:11] |
| reportEntryIndex | Nonnegative safe integer | Yes | Index of the copied native entry in the unchanged §6.2 `report.entries`; a G0 mapping field, never a native ReportEntry field. | [S:345], [BC@63a9258:src/profile/report.ts:24–28] |
| beforePresent, afterPresent | Boolean | Yes | Presence flags; `before` is present iff `beforePresent`, `after` iff `afterPresent`. | [BC@63a9258:schemas/profile/report-2.schema.json] |
| before, after | JSON value | Iff the matching flag is true | Verbatim before/after values. | [BC@63a9258:src/profile/report.ts:12] |
| originalType, property, causedBy, pageId, occurrenceKey, emittedType, legacyCode | String | No | Native optional fields, verbatim when present. | [BC@63a9258:src/profile/report.ts:12] |
| lossClass | Enum: semantic-type, relation-kind, navigation, appearance, layout, metadata, unsupported-feature, provenance-unavailable | Required iff classification is loss; forbidden otherwise | Native loss class, verbatim. | [BC@63a9258:src/profile/report.ts:8] |

Variant `diagram-core` (diagram findings from diagram-core validation). The variant is exactly S-DSDIAG `Diagnostic` plus the common fields and `studyDisposition`. Closed field set:

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| code | Closed `DiagnosticCode` union of S-DSDIAG | Yes | Native diagram-core code, verbatim; equals `nativeCode`. | [DS] `packages/diagram-core/src/diagnostics.ts:13` at `25c0f3d3` |
| severity | Enum: error, warning | Yes | Native diagram-core severity (default `error` at the source). No `info` and no `warn` literal exists in this variant. | [DS] `packages/diagram-core/src/diagnostics.ts:82` at `25c0f3d3` |
| path | String | Yes | Native dotted document path (`entities.<id>.attributes.<name>` form where applicable), verbatim. It is not an RFC 6901 pointer and is never rewritten as one. | [DS] `packages/diagram-core/src/diagnostics.ts:84` at `25c0f3d3`, STUDY-conformance-by-graph-composition.md:345 |
| message | String | Yes | Native message, verbatim. | [DS] `packages/diagram-core/src/diagnostics.ts:84` at `25c0f3d3` |
| refs | Array of string | No | Native references, verbatim when present. | [DS] `packages/diagram-core/src/diagnostics.ts:84` at `25c0f3d3` |
| details | Closed map string to string, number or boolean | No | Native scalar facts (expected/seen revisions, bounds, kinds), verbatim when present. | [DS] `packages/diagram-core/src/diagnostics.ts:84` at `25c0f3d3` |
| studyDisposition | String, or absent | No | Study §3.2 reference: N9 for scalar/schema/integrity checks; absent for structural findings. The structural versus scalar/schema/integrity split is recorded here and in `code`, never in an invented classification field. | STUDY-conformance-by-graph-composition.md:145, STUDY-conformance-by-graph-composition.md:333 |

Variant `engram` (extraction findings from engram profile validation). The variant is exactly S-ENGISSUE `ProfileValidationIssue` plus the common fields. Closed field set:

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| code | String | Yes | Native engram issue code, verbatim; equals `nativeCode`. | `src/profile-validate.ts:6` |
| severity | Enum: error, warning, info | Yes | Native engram severity. | `src/profile-validate.ts:4` |
| message | String | Yes | Native message, verbatim. | `src/profile-validate.ts:6` |
| path | String | No | Native path, verbatim when present. | `src/profile-validate.ts:6` |
| nodeId | String | No | Graph node id the issue attaches to, verbatim; absent for edge or envelope issues. | `src/profile-validate.ts:6`, STUDY-conformance-by-graph-composition.md:345 |
| edgeIndex | Integer | No | Graph edge index the issue attaches to; absent for node or envelope issues. | `src/profile-validate.ts:6` |

Variant `guardian` (composition, derivation and merge findings of §§2–4). Closed field set beyond the common fields: `code` (string, from the closed per-operation lists in §§2.4, 3.4, 4.3; equals `nativeCode`), `ruleId` (string, or null only where no rule produced the finding), `severity` (enum: error, warning, info), `path` (string, or null meaning unavailable; RFC 6901 pointer or profile-relative locator where provenance exists, never fabricated), `messageKey` (string, stable key; localized text is presentation and never identity). Source: DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:251, STUDY-conformance-by-graph-composition.md:153.

Losslessness rule (normative). Mapping a native finding into this envelope never discards a native field: every native code, severity, classification, stage, disposition, coordinate and provenance value appears in its named field above. An implementation that maps two distinct native codes to one G0 `code` without preserving `nativeCode` verbatim fails qualification. Conversely, the G0 `code` alone never substitutes for `nativeCode` in a parity comparison. Source: STUDY-conformance-by-graph-composition.md:345.

#### 2.1.1 Separate reversible mapping and ordering

For a native Report/2 report `R`, the §6.2 `report` field is `R` unchanged, including closure, native entry order, duplicate discipline, `idMap`, `artifacts.entryIndexes`, all optional fields, and `rawStandardFindings`. Native validation refuses malformed input; G0 does not repair it. For each original index `i`, make a separate diagnostic copy of `R.entries[i]`, adding only `origin: report2, nativeCode: R.entries[i].code, subjectRef, reportEntryIndex: i` and optional `studyDisposition`. Never insert those G0 fields into `R.entries[i]`, never replace `report.entries` with diagnostics, and never mutate or re-sort `R`. Source: [S:345], native closure/order at [BC@63a9258:src/profile/report.ts:40–112].

Define `nativeEntry(d)` as removal of exactly `origin, nativeCode, subjectRef, reportEntryIndex, studyDisposition` from a `report2` diagnostic, with native field presence and values unchanged. The inverse is prescribed: require exactly one `report2` diagnostic for every native index `0..R.entries.length-1`; place `nativeEntry(d)` at `d.reportEntryIndex`; require exact canonical equality with the corresponding `R.entries[i]` (and `nativeCode === code`). Reject missing, duplicate or out-of-range indexes or a field mismatch. All non-entry Report fields are already retained verbatim in `report`; thus the complete Report is recovered without inferring coordinates, optionals or artifact links. Only the separate copy can be enriched. The round trip also preserves equal comparator keys with distinct native entries. Source: [S:345], [BC@63a9258:src/profile/report.ts:90–112].

Ordering rule for **G0 diagnostics only**: sort by `(code, subjectRef, locator)`, with null locators first. `locator` is `source.pointer` for `report2`, native `path` (or null if absent) for `diagram-core/engram/guardian`; equal keys on `report2` diagnostics keep `reportEntryIndex` order. This permutation has no effect on the native Report. Sorting never changes the subject already selected by a validator; `unique-attribute` parity stays open under Q-G0-2. Source: [S:341], [S:345].

Success-with-reporting rule. An empty diagnostics array means success with no findings. A non-empty array does not by itself mean failure: informational detachments and retirements reported at a non-error native severity (notably successful hierarchy-cycle detachment, §3.4, at `info` in variant `guardian`) are success with reporting. Failure follows the native disposition-sensitive BPMN lint barrier, the other variants’ blocking-error predicates, or the operation-specific failure variant of §§2–4 (§2.1); it never follows array emptiness alone. Source: DOSSIER-ontology-guardian.md:91, DOSSIER-ontology-guardian.md:315.

Private-stack rule. For any private:tenant stack, guardian-side diagnostics record the refusal class, the pins and the digests only, never the content that caused the refusal. Source: DOSSIER-ontology-guardian.md:257.

### 2.2 Stack input and effective-stacking operation

A stack is a declared, ordered list of pinned parents (id, version, contentDigest) in the lineage record. Source: DOSSIER-ontology-guardian.md:251.

| Input or output | Exact shape (closed) | Source |
|---|---|---|
| Stack input | Closed object: layers (Pin list, at least one layer, in stack order, no duplicate pin). The top layer is the last element. No layer is identified by a floating reference. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:367 |
| compose output (non-private) | Discriminated union on `outcome`. Success variant (`outcome: ok`): closed object with effectiveProfile (the composed profile bytes, in the top shape's native form), pinsDigest (Digest), resultDigest (Digest), diagnostics (array of §2.1 diagnostics; empty when no findings, non-empty at info/warning for success-with-reporting such as a detached hierarchy cycle — still success, see §2.1). Failure variant (`outcome: refused`): closed object with diagnostics only (at least one severity-error entry from §2.4) and no effective bytes. The operation returns the effective profile itself on success, not only references to its layers. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:564 |
| compose output (private) | No guardian-side effective bytes exist. Guardian-side compose is refused or delegated to the owner; the guardian handles only pins, pinsDigest and conformance receipts, plus an owner-supplied resultDigest value recorded as receipt data. See §2.5. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:564 |
| resolve relationship | resolve performs the same computation as compose after a catalog lookup. Returning pins without the effective profile for a non-private stack fails qualification. | DOSSIER-ontology-guardian.md:563, DOSSIER-ontology-guardian.md:520 |

Composition computes the single flattened profile (types, relations, constraints, limits after applying each layer in order), stamps the declaration with pinsDigest and the result with resultDigest as distinct values (§7). Source: DOSSIER-ontology-guardian.md:251.

Validation against the effective profile follows the final study in three distinct roles, cited without duplication: transitional validators as parity oracles only; retained checks outside composition, each with its owner named in the study; qualified DS execution as the reference once qualified. No switch to qualified DS execution occurs before proven parity under the study parity gates; for d2d, no switch before lot 6 and its release GO. Source: DOSSIER-ontology-guardian.md:251, STUDY-conformance-by-graph-composition.md:34.

### 2.3 Stack composition rules (normative)

| # | Rule | Source |
|---|---|---|
| S-1 | A child may add types and relations and narrow constraints. | DOSSIER-ontology-guardian.md:251 |
| S-2 | A child may not remove a parent type, widen a cardinality, or redeclare an attribute. This generalizes the DS document type-definition rule (additive refinement, no redeclaration of base attributes). | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:249 |
| S-3 | Unresolved conflicts refuse composition. There is no silent override and no latest fallback; an unknown source yields a typed refusal, never a latest fallback. | DOSSIER-ontology-guardian.md:251 |
| S-4 | An endpoint type declared only in another profile, without a join, refuses until a module or join contract covers it. Splitting repo-knowledge@1 into separate profiles with cross-profile endpoints refuses for the same reason; composition there is inside the single profile as modules. | DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:262 |
| S-5 | No network load occurs at composition time. Descriptor digest mismatch or an unregistered dialect refuses. | DOSSIER-ontology-guardian.md:256 |
| S-6 | A project layer that weakens a core gate (removes a check, widens a pass rule) refuses. An excluded dependency introduced by any layer refuses; composition cannot launder it. | DOSSIER-ontology-guardian.md:261, DOSSIER-ontology-guardian.md:264 |
| S-7 | The composed rule set is a deterministic function of the ordered pins: pinsDigest covers profile pins and rule-sheet pins, resultDigest covers the effective declarations and the effective rule set. A severity conflict between layers is a named diagnostic, never a silent override. Narrowing-only inheritance applies to rules as to declarations. | STUDY-conformance-by-graph-composition.md:353 |

### 2.4 Stack typed errors (closed list for compose and resolve)

Every error below is returned as one or more §2.1 diagnostics with severity error in the `refused` variant, and no effective bytes are returned. Successful reporting that is not a refusal is listed after the table and never appears in the `refused` variant alone.

| Code | Raised when | Source |
|---|---|---|
| parent-type-removal | A child layer removes a parent type | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:255 |
| cardinality-widening | A child layer widens a parent cardinality | DOSSIER-ontology-guardian.md:251 |
| attribute-redeclaration | A child layer redeclares a base attribute | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:258 |
| endpoint-without-join | An endpoint type is declared only in another profile and no module or join contract covers it | DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:262 |
| unpinned-parent | A parent is referenced without an exact pin (including any floating reference) | DOSSIER-ontology-guardian.md:258 |
| digest-mismatch | A layer pin digest does not match its bytes, or a descriptor digest mismatches | DOSSIER-ontology-guardian.md:256, DOSSIER-ontology-guardian.md:257 |
| unregistered-dialect | A mechanism layer names an unregistered dialect | DOSSIER-ontology-guardian.md:256 |
| gate-weakening | A layer removes a core check or widens a pass rule | DOSSIER-ontology-guardian.md:261 |
| excluded-dependency | Any layer introduces a dependency outside the licence whitelist closure | DOSSIER-ontology-guardian.md:264 |
| severity-conflict | Two layers assign different effective severities to the same rule id at the same (phase, readinessPolicy) selection, with no narrowing-only resolution | STUDY-conformance-by-graph-composition.md:353 |
| parent-rule-removal | A child layer removes a parent rule-sheet entry (narrowing-only inheritance applies to rules as to declarations) | STUDY-conformance-by-graph-composition.md:353 |
| duplicate-pin | The same pin (id, version, contentDigest) appears twice in one stack list | DOSSIER-ontology-guardian.md:367 |
| unresolved-conflict | Any other composition conflict remains unresolved after the layers are applied in order | DOSSIER-ontology-guardian.md:251 |
| operation-not-applicable | compose or stacking is requested over TRK, H2A or MEM vocabularies, where composition is not offered (see §2.5) | DOSSIER-ontology-guardian.md:259, DOSSIER-ontology-guardian.md:260, DOSSIER-ontology-guardian.md:263 |
| private-content-refusal | The effective private bytes are requested guardian-side | DOSSIER-ontology-guardian.md:257, DOSSIER-ontology-guardian.md:564 |

Successful reporting (severity info, `outcome: ok`, never a refusal): `hierarchy-cycle-detached` — composition or derivation detached a hierarchy cycle and reports the detached members with their path; the operation succeeds and the diagnostic is part of the success variant. Source: DOSSIER-ontology-guardian.md:91, DOSSIER-ontology-guardian.md:315. A severity-error occurrence of any code above in the same run flips the outcome to `refused`.

### 2.5 Scoped exceptions (stated here, applied identically in §9)

Neither exception is presented as coverage of the general operation. Source: DOSSIER-ontology-guardian.md:251.

| Exception | Exact behaviour | Source |
|---|---|---|
| Private stacks (D2D, any private:tenant entry) | The effective profile is computed inside the owning project; the guardian never holds its content. Guardian-side compose and resolve handle only pins, pinsDigest and conformance receipts, plus a resultDigest value computed and supplied by the owner as receipt data, never recomputed by the guardian from content it does not hold. They never return effective bytes. Byte-identical effective bytes for identical pins is a d2d-side fixture; pins plus receipts with no content field is the guardian-side fixture. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:257 |
| TRK and H2A vocabularies | compose is not offered (divergence D-B7). These vocabularies succeed each other by version plus explicit mapping; layering them would merge assertions that must stay distinct. Requesting stack composition returns operation-not-applicable. Presenting a mapping file as a layer refuses. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:259, DOSSIER-ontology-guardian.md:260, DOSSIER-ontology-guardian.md:678 |
| MEM families | compose is not offered over families. Families stay independent descriptors; reconciliation compares occurrences and does not stack vocabularies. Stacking families to manufacture agreement returns operation-not-applicable. | DOSSIER-ontology-guardian.md:263 |

Family spellings of the stack operation and their refusal cases are normative as tabled in the dossier and inventoried as FX-STK-* in §8.2. Source: DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:256, DOSSIER-ontology-guardian.md:257, DOSSIER-ontology-guardian.md:258, DOSSIER-ontology-guardian.md:259, DOSSIER-ontology-guardian.md:260, DOSSIER-ontology-guardian.md:261, DOSSIER-ontology-guardian.md:262, DOSSIER-ontology-guardian.md:263, DOSSIER-ontology-guardian.md:264.

The decisive stack fixtures are: removing a parent layer changes pinsDigest and the resolved bytes; a document valid under the stack validates; pinsDigest and resultDigest are distinct values under §7. Source: DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:520.

## 3. Contract 2b — Derive diagnostics (inheritance and specialization)

### 3.1 Derivation operation and lineage record

Derivation produces a candidate from a pinned base and a declared delta. The result is a candidate record; publication is a separate qualified act, never a side effect. Source: DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:567.

| Input or output | Exact shape (closed at the envelope; declaration payload stays in the native profile shape) | Source |
|---|---|---|
| Base input | One Pin: (id, version, contentDigest) of the base. A floating base reference refuses; derivation never edits the base. | DOSSIER-ontology-guardian.md:308 |
| Delta input | Discriminated union on visibility. Public arm: closed object: base (Pin, same value as the Base input), operations (ordered array of delta operations, §3.2), mappingRef (Pin of the mapping file of §3.3, or absent only where no operation names a mapping), retiredFixtures (array of closed objects: fixtureRef (string), reason (string); empty where nothing is retired), retiredRules (array of closed objects: ruleId (string), reason (string); empty where nothing is retired). The per-type declaration payload of an add or narrow operation is expressed in the base shape's native declaration form; G0 freezes the envelope and does not redefine that payload (no third shape). Order of operations is significant. Private guardian-side arm (`private:tenant`): `PrivateDerivationRef` of §1.3. The owner computes `deltaDigest` over the full P-DELTA input (§7.2); that full owner-side input never crosses to the guardian. The reference carries no operation, declaration payload or rule body. | DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:190, STUDY-conformance-by-graph-composition.md:355, DOSSIER-ontology-guardian.md:236 |
| Derived candidate output | Discriminated union on `outcome`. Success variant (`outcome: ok`): closed object with candidate record (§1.4 fields with lifecycle draft), lineage derivation record (below), digests (closed object: contentDigest (Digest), pinsDigest (Digest), resultEvidence (DigestEvidence of §1.3 over resultDigest) under §7), diagnostics (array of §2.1 diagnostics; empty when no findings, non-empty at `info` in variant `guardian` for success-with-reporting such as `hierarchy-cycle-detached` — still success). Failure variant (`outcome: refused`): closed object with diagnostics only (at least one native-error entry from §3.4) and no candidate. No bytes of the base are mutated in either variant. | DOSSIER-ontology-guardian.md:308 |
| Lineage derivation record | Discriminated union on the enclosing visibility. Public arm: closed object: base (Pin), operations (the delta operations as applied, in order), resultingDigests (`ResultingDigests` of §1.3). Private arm: `PrivateDerivationRecord` of §1.3. This is the derivation-result record, not a second lineage-container shape: the private candidate and §5.3 entry carry the single `PrivateLineage` container, with `derivationRef` projected from this record and enclosing `digests` equal to `resultingDigests`, exactly by the §1.3 mapping. No operation or declaration is exposed. | DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:236 |

C4 over generic@1 is the first end-to-end derivation proof. Its sequencing against GD-M3 work is a technical planning choice, not an owner question. Source: DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:312.

### 3.2 Delta operations (closed set; closed schemas)

Each operation is a closed object discriminated by `op`. Each carries the subject identifier it acts on. A rename without a mapping entry, and any operation not in this set, refuses. Declaration payloads stay in the base shape's native declaration form (no third shape, §1.2).

| Operation (`op` value) | Closed fields (all required unless marked) | Meaning | Source |
|---|---|---|---|
| `add` | `subject` (string: new type, relation or declaration id), `declaration` (native declaration form of the base shape) | Add a type, relation or declaration that the base does not declare | DOSSIER-ontology-guardian.md:308 |
| `narrow` | `subject` (string: declared type, relation or constraint id), `constraint` (native constraint or cardinality form, strictly narrower than the base value) | Narrow a constraint or cardinality declared by the base | DOSSIER-ontology-guardian.md:308 |
| `rename-with-mapping` | `subject` (string: old term id), `newName` (string: new term id), `mappingEntry` (MappingEntry arm `rename` of §3.3: `kind: rename`, `from` (string, equals `subject`), `to` (string, equals `newName`); the entry lives in the mapping file pinned by `mappingRef`) | Rename a term only together with an explicit typed mapping entry that keeps the old name decodable | DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:315 |
| `deprecate-term` | `subject` (string: term id), `reason` (string) | Mark a term deprecated in the derived lineage, with the base term staying resolvable | DOSSIER-ontology-guardian.md:308 |

Retirements are not delta operations: an inherited fixture is retired only through `retiredFixtures` and a parent rule only through `retiredRules` (both in the Delta input, §3.1), each with a reason. Retiring by silence, or by an operation outside this set, refuses under §3.4. Source: DOSSIER-ontology-guardian.md:308, STUDY-conformance-by-graph-composition.md:355.

### 3.3 Mapping file (closed schema; shared by derive and merge)

Resolution is explicit data. A mapping or alignment file is versioned separately from both parents and reviewed like a profile change. Its G0 envelope is closed; entry payloads that name profile terms stay identifiers, never embedded profile bytes.

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| mappingId | String | Yes | Stable mapping identifier, language-neutral for new mappings. | DOSSIER-ontology-guardian.md:357, DOSSIER-ontology-guardian.md:358 |
| version | String (exact version) | Yes | Exact version of this mapping file. The file is pinned wherever it is referenced (`mappingRef` is a Pin over these bytes). | DOSSIER-ontology-guardian.md:289 |
| contentDigest | Digest | Yes | SHA-256 over the mapping file's canonical bytes (§7). Part of the Pin. | DOSSIER-ontology-guardian.md:367 |
| entries | Array of MappingEntry (discriminated union on `kind`, below) | Yes (may be empty only where the mapping asserts no correspondence) | Typed resolution payloads: one arm per decision type, each closed. A generic correspondence without its decision payload is not a MappingEntry and refuses at qualification. Homonymous terms kept distinct have no entry unifying them; absence of an entry never means equivalence. | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:297, DOSSIER-ontology-guardian.md:298 |

MappingEntry arms (closed; `kind` is the discriminant; no arm carries another arm's fields). The JSON form of every arm is the flat object `{kind, ...arm fields}` canonicalized by P-MAPPING (§7.2), so the rename arm keeps the exact V-MAPPING-1 bytes:

| Arm (`kind`) | Closed fields (all required) | Decision encoded | Source |
|---|---|---|---|
| `rename` | `from` (string), `to` (string) | Old term decodes to new term | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:315 |
| `endpoint` | `from` (string: relation id in the first input), `to` (string: relation id in the second input), `role` (string: endpoint role) | Endpoint correspondence for one role | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:296 |
| `type` | `from` (string: type id in the first input), `to` (string: type id in the second input) | Type correspondence | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:293 |
| `vocabulary` | `from` (string: term in the first vocabulary), `to` (string: term in the second vocabulary) | Vocabulary correspondence; distinct assertions stay distinct | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:297 |
| `cardinality` | `subject` (string: role or subject id), `chosenMin` (integer), `chosenMax` (integer) | The single reviewed cardinality decision for that subject: the candidate carries exactly `chosenMin..chosenMax`. No decision, no merge (§4.2). | DOSSIER-ontology-guardian.md:289 |
| `hierarchy` | `relationId` (string), `chosenShape` (enum: tree, dag), `parentRole` (string), `childRole` (string) | The single reviewed hierarchy decision: shape and both roles for that relation | DOSSIER-ontology-guardian.md:289 |
| `severity` | `ruleId` (string), `phase` (string), `readinessPolicy` (string), `chosenSeverity` (string: effective severity of the resolved selection) | The single reviewed severity decision for that rule at that selection | STUDY-conformance-by-graph-composition.md:353 |

A mapping file never edits a descriptor, never rewrites a journal, and never merges distinct assertions (realization, acceptance, buckets, report colours stay distinct). Source: DOSSIER-ontology-guardian.md:294, DOSSIER-ontology-guardian.md:297.

Inheritance obligations (normative). (a) A derived profile inherits the base conformance-corpus obligations: each inherited fixture must pass or be explicitly retired with a reason. Source: DOSSIER-ontology-guardian.md:308. (b) Licence closure is recomputed over the derived pack; a derivation cannot launder an excluded dependency. Source: DOSSIER-ontology-guardian.md:308. (c) A derived ontology that retires a parent rule records an explicit delta in its rule sheet, never silence. Source: STUDY-conformance-by-graph-composition.md:355. (d) Derivation is expressed as a new vocabulary version plus mapping for TRK and H2A (no inheritance); deriving a term by editing its persisted meaning in place refuses. Source: DOSSIER-ontology-guardian.md:316, DOSSIER-ontology-guardian.md:317. (e) Derivation over a MEM family descriptor is a new descriptor version only; deriving record semantics (admission, forgetting) from a family refuses. Source: DOSSIER-ontology-guardian.md:320.

### 3.4 Derive typed errors (closed list)

Every error below is returned as §2.1 diagnostics with severity error in the `refused` variant, and no candidate is published. Successful reporting (`hierarchy-cycle-detached`, severity info) is defined in §2.4 and applies here identically: a derivation that detaches a hierarchy cycle succeeds and reports it.

| Code | Raised when | Source |
|---|---|---|
| attribute-redeclaration | The delta redeclares a base attribute | DOSSIER-ontology-guardian.md:312 |
| cardinality-widening | The delta widens a base cardinality | DOSSIER-ontology-guardian.md:312 |
| base-edit-refusal | The delta would edit the base in place instead of producing a new version | DOSSIER-ontology-guardian.md:312 |
| unmapped-rename | A rename lets the old name vanish without a mapping entry | DOSSIER-ontology-guardian.md:315 |
| excluded-dependency | The recomputed licence closure of the derived pack contains an excluded dependency | DOSSIER-ontology-guardian.md:321 |
| gate-weakening | A specialization weakens a core gate | DOSSIER-ontology-guardian.md:318 |
| profile-source-unavailable | The source profile of a derivation or migration is unknown; never a latest fallback | DOSSIER-ontology-guardian.md:313, DOSSIER-ontology-guardian.md:360 |
| digest-mismatch | A base pin digest or major mismatches (private derivations record the refusal class guardian-side only) | DOSSIER-ontology-guardian.md:314 |
| missing-relation-matrix | A private derivation is attempted without the explicit relation matrix | DOSSIER-ontology-guardian.md:314 |
| inherited-fixture-unretired | An inherited corpus fixture neither passes nor is retired with a reason | DOSSIER-ontology-guardian.md:308 |
| retired-rule-without-delta | A parent rule is retired without an explicit `retiredRules` entry carrying a reason (silence never retires a rule) | STUDY-conformance-by-graph-composition.md:355 |
| severity-conflict | The delta assigns a severity that conflicts with the inherited selection with no narrowing-only resolution | STUDY-conformance-by-graph-composition.md:353 |
| operation-not-applicable | Inheritance derivation is requested over TRK or H2A vocabularies (successor version plus mapping only), or record semantics are derived from a MEM family descriptor | DOSSIER-ontology-guardian.md:316, DOSSIER-ontology-guardian.md:317, DOSSIER-ontology-guardian.md:320 |
| unknown-delta-operation | The delta contains an operation whose `op` value is outside the closed set of §3.2 | DOSSIER-ontology-guardian.md:308 |

Family spellings are normative as tabled in the dossier and inventoried as FX-DER-* in §8.5. Source: DOSSIER-ontology-guardian.md:312, DOSSIER-ontology-guardian.md:313, DOSSIER-ontology-guardian.md:314, DOSSIER-ontology-guardian.md:315, DOSSIER-ontology-guardian.md:316, DOSSIER-ontology-guardian.md:317, DOSSIER-ontology-guardian.md:318, DOSSIER-ontology-guardian.md:319, DOSSIER-ontology-guardian.md:320, DOSSIER-ontology-guardian.md:321.

The decisive derive fixtures are: C4 documents validate while base fixtures stay green; derived bytes are reproducible from pins plus delta (d2d-side, for private derivations); a delta creating a hierarchy cycle is detached and reported. Source: DOSSIER-ontology-guardian.md:312, DOSSIER-ontology-guardian.md:314, DOSSIER-ontology-guardian.md:315.

## 4. Contract 2c — Merge diagnostics (merge rules and conflicts)

### 4.1 Merge operations

Ontology-to-ontology merge (type sets, relation matrices, constraints) is a new contract in the dossier; it does not exist today and never inherits the instance-merge behaviour. Source: DOSSIER-ontology-guardian.md:288, DOSSIER-ontology-guardian.md:171.

| Operation | Exact shape (closed) | Source |
|---|---|---|
| merge_preview(a, b) — read-only | Inputs: two Pins (a, b). Output: closed object with diagnostics (array of §2.1 diagnostics, one per conflict found; empty only where no conflict exists) and draftMapping (mapping draft, §3.3 shape, or absent only where no conflict needs a mapping entry). No merged bytes are produced by this operation. | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:568 |
| merge(a, b, mapping) — proposal | Inputs: two Pins plus a mapping Pin (the reviewed mapping file of §3.3, versioned separately from both parents). Output is a discriminated union on `outcome`. Success variant (`outcome: ok`): merged candidate record (§1.4, lifecycle draft), mapping Pin, and diagnostics (the resolved-conflict set at severity info; empty where the inputs needed no resolution). Failure variant (`outcome: refused`): diagnostics only (at least one severity-error entry from §4.2) and no candidate bytes. Publication is separate. No merged bytes are produced while any conflict is unresolved. | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:569 |

Resolution is explicit data: a mapping or alignment file, versioned separately from both parents, reviewed like a profile change. Source: DOSSIER-ontology-guardian.md:289.

Instance graph merge stays as-is for instances. When the two graphs carry different ontology versions, the merge requires a declared mapping or refuses; it never falls back to attribute overwrite at the ontology level. Source: DOSSIER-ontology-guardian.md:289. The existing instance merge replaces colliding attribute keys with later-input values and reports no loss; that silent overwrite is the behaviour the ontology contract excludes, and lot G3 carries a regression fixture proving profile merge never falls back to it. Source: DOSSIER-ontology-guardian.md:95, DOSSIER-ontology-guardian.md:520, DOSSIER-ontology-guardian.md:708.

TRK and H2A replace merge by mapping reconciliation (term to term, kept distinct where homonymous); MEM offers no merge over families or records; RPK merges subgraphs only through regeneration, never by direct file merge. Source: DOSSIER-ontology-guardian.md:297, DOSSIER-ontology-guardian.md:298, DOSSIER-ontology-guardian.md:300, DOSSIER-ontology-guardian.md:301.

### 4.2 Conflict families (closed list; each has a named diagnostic)

Each conflict class below has exactly the named diagnostic shown. The G0 code in the first column is the freeze of the dossier class in the second column; no class is dropped or merged into another.

| G0 code | Dossier conflict class | Raised when | Source |
|---|---|---|---|
| type-id-collision | Type-id collision with different declarations | Two inputs declare the same type id with different declarations | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:293 |
| relation-endpoint-incompatible | Relation endpoint incompatibility | A relation's endpoint types are incompatible across the inputs, or a candidate drops a registry binding without a mapping entry | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:296 |
| cardinality-conflict | Cardinality narrowing versus widening | The inputs declare different cardinalities for the same role or subject and the supplied mapping contains no MappingEntry arm `cardinality` (§3.3) for that subject. Pure narrowing and pure widening are both conflicts until that typed decision is supplied; with it, the candidate carries exactly its `chosenMin..chosenMax` and no diagnostic remains. Stack and derive use the directional codes `cardinality-widening` (refusal) and narrowing (admitted) instead; this code is the merge predicate only. | DOSSIER-ontology-guardian.md:289 |
| hierarchy-shape-conflict (resolution) | Hierarchy shape conflict (tree versus dag) | Resolved only by a MappingEntry arm `hierarchy` (§3.3) naming `chosenShape, parentRole, childRole` for that relation; the candidate declares exactly that shape and those roles | DOSSIER-ontology-guardian.md:289 |
| severity-conflict (resolution) | Severity divergence at one selection | Resolved only by a MappingEntry arm `severity` (§3.3) naming `ruleId, phase, readinessPolicy, chosenSeverity`; the effective rule set (§7.2) records exactly that severity with the full rule body | STUDY-conformance-by-graph-composition.md:353 |
| hierarchy-shape-conflict | Hierarchy shape conflict (tree versus dag) | One input declares a hierarchy as a tree and the other as a dag over the same relation | DOSSIER-ontology-guardian.md:289 |
| attribute-redefinition | Attribute redefinition | The same attribute is redefined with a different declaration | DOSSIER-ontology-guardian.md:289 |
| status-vocabulary-divergence | Status-vocabulary divergence | The inputs declare divergent status vocabularies for the same subject | DOSSIER-ontology-guardian.md:289 |

Additional merge refusals (same envelope, severity error).

| Code | Raised when | Source |
|---|---|---|
| gate-weakening | The merged result would be weaker than either parent on a gate, without an explicit reviewed mapping decision | DOSSIER-ontology-guardian.md:299 |
| severity-conflict | The inputs assign different effective severities to the same rule id with no single reviewed mapping decision resolving them | STUDY-conformance-by-graph-composition.md:353 |
| non-deterministic-merge | Merging two pinned descriptor sets is non-deterministic or breaks the closed mechanism grammar (descriptors themselves are never edited by merge) | DOSSIER-ontology-guardian.md:294 |
| digest-mismatch | An input Pin digest does not recompute equal over its bytes | DOSSIER-ontology-guardian.md:256 |
| excluded-dependency | Either parent brings an excluded dependency into the merged closure | DOSSIER-ontology-guardian.md:302 |
| homonym-unification-refusal | Homonymous terms would be unified by name alone across families | DOSSIER-ontology-guardian.md:298 |
| provenance-mismatch | Two committed subgraph files would be merged directly instead of regenerated from merged sources | DOSSIER-ontology-guardian.md:300 |
| operation-not-applicable | Merge is requested over MEM families or records, where it is not offered; conflicting occurrences yield a proposal (contradicts, supersedes, needs_adjudication), never a merged record | DOSSIER-ontology-guardian.md:301 |

### 4.3 Merge invariants

| # | Invariant | Source |
|---|---|---|
| M-1 | Every collision is listed with its diagnostic before any candidate exists; merge refuses while any conflict is unresolved and publishes no candidate bytes. | DOSSIER-ontology-guardian.md:293, DOSSIER-ontology-guardian.md:289 |
| M-2 | Silent attribute overwrite (instance-merge behaviour) at profile level is refused by construction. | DOSSIER-ontology-guardian.md:293 |
| M-3 | Descriptors are upstream-pinned: merge never edits a descriptor; merging two pinned descriptor sets is deterministic under the closed mechanism grammar, and a non-deterministic or grammar-breaking merge refuses. | DOSSIER-ontology-guardian.md:294 |
| M-4 | Private merges execute inside the owning project with declared data and typed diagnostics; the guardian records digests only. Guardian-side merge of private content refuses. F1 removal, where it applies, happens on the owning side with a typed loss report. | DOSSIER-ontology-guardian.md:295, DOSSIER-ontology-guardian.md:132 |
| M-5 | Realization, acceptance, buckets and report colours are four different assertions and are never merged into one vocabulary; the bug versus promotion-only defect distinction survives reconciliation. | DOSSIER-ontology-guardian.md:297, DOSSIER-ontology-guardian.md:168 |
| M-6 | Regenerated subgraphs are checked for conservation of relations and incidence (no semantic relation lost or merged), never for equality of counts across representations. | DOSSIER-ontology-guardian.md:300 |

Family spellings are normative as tabled in the dossier and inventoried as FX-MRG-* in §8.4, with per-conflict-family fixtures in §8.7. Source: DOSSIER-ontology-guardian.md:293, DOSSIER-ontology-guardian.md:294, DOSSIER-ontology-guardian.md:295, DOSSIER-ontology-guardian.md:296, DOSSIER-ontology-guardian.md:297, DOSSIER-ontology-guardian.md:298, DOSSIER-ontology-guardian.md:299, DOSSIER-ontology-guardian.md:300, DOSSIER-ontology-guardian.md:301, DOSSIER-ontology-guardian.md:302.

The decisive merge fixtures are: two profiles declaring the same type id differently yield the named collision diagnostic, then pass with a mapping; relation endpoint incompatibility yields its diagnostic before any candidate exists. Source: DOSSIER-ontology-guardian.md:293, DOSSIER-ontology-guardian.md:296.

## 5. Contract 3 — Catalog payload of kind ontology

### 5.1 Two surfaces, one payload definition

Kind ontology is added on both surfaces; no kind list is silently unified. Source: DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:176.

| Surface | Today (closed list) | G0 addition | Source |
|---|---|---|---|
| Entry registry (v9 envelope) | Exactly skill or mcp | ontology beside skill and mcp | DOSSIER-ontology-guardian.md:154, DOSSIER-ontology-guardian.md:577 |
| Application capability catalog | skill, tool, agent, workflow, canvas as a tagged union over intersection-only shared metadata | ontology added to the union, payload-only kind data | DOSSIER-ontology-guardian.md:155, DOSSIER-ontology-guardian.md:578 |

Shared metadata stays the intersection (name, description, version, category, contextFilter, authzRequirements where applicable); anything kind-specific lives in the payload only. Source: DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:155. Cross-kind discovery stays additive: the skill-only search stays skill-only, and ontology entries surface through the cross-kind search, never by renaming a skill tool. Source: DOSSIER-ontology-guardian.md:578. What apps denotes as a distinct kind beyond the UI entry and application entries is unverified and is deferred as Q-G0-1 to sentropic at lot G1 (§10.2); it is not decided here. Source: DOSSIER-ontology-guardian.md:579, DOSSIER-ontology-guardian.md:701.

G1 consumes this section as its input contract: the registry envelope (§5.2), the ontology payload (§5.3), the mapping (§5.4) and the gate (§5.5). Registration is metadata-only; catalog inspection loads no ontology code (see §9). Source: DOSSIER-ontology-guardian.md:518, DOSSIER-ontology-guardian.md:553.

### 5.2 Registry envelope for an ontology entry (closed; pinned v9 union preserved verbatim)

The envelope is the v9 closed envelope with kind extended to ontology. The pinned v9 union and types below are preserved verbatim; the only G0 change is the added `ontology` kind value and its payload arm. No v9 field is paraphrased, merged or dropped. Unknown fields fail, except the designated qualified extensions object; unknown required extensions fail compatibility. Source: [R9:§3.2] (closed envelope, lines 122–206), DOSSIER-ontology-guardian.md:154, DOSSIER-ontology-guardian.md:577.

Pinned v9 union, verbatim (G0 addition marked): `kind` is exactly one of `skill`, `mcp`, `ontology` (G0 addition). Exactly one kind payload is present; the others are absent. The v9 normative types are: `Compatibility` = closed object with `entryContract` (string), `packages` (array of closed objects: `name` (string), `range` (string)), `schemaProfiles` (array of string), `requiredHostFeatures` (array of string), `optionalHostFeatures` (array of string); `Parameters` = closed object with `schemaVersion` (string), `schema` (closed JSON object), `defaults` (JSON object); `DocumentSchema`, `EntryDependency`, `TransportProfile`, `UiProfile`, `McpPayload` as typed in [R9:§3.2]. Empty or implicit universal support is prohibited. Source: [R9:§3.2].

Source shape S-V9, transcribed verbatim ([R9:§3.2], lines 122–206 of the pinned file; envelope field table and normative types). Envelope fields: `format, contractVersion, kind, id, name, description, entryVersion, publisher, compatibility, parameters, bindings, assets`, exactly one of `skill`/`mcp`, optional `extensions, requiredExtensions`. Normative types, transcribed: `Kind = "skill" | "mcp"`; `Compatibility = { entryContract: string; packages: { name: string; range: string }[]; schemaProfiles: string[]; requiredHostFeatures: string[]; optionalHostFeatures: string[] }`; `Parameters = { schemaVersion: string; schema: JsonObject; defaults: JsonObject }`; `DocumentSchema = { name: string; schemaId: string; version: string; assetPath: string; sha256: string }`; `EntryDependency = { kind: Kind; id: string; entryRange: string; required: boolean; requiredFeatures: string[] }`; `TransportProfile = { id: string; mode: "in-process" | "stdio" | "streamable-http" | "binding"; bindingKey?: string; protocolVersions: string[]; requiredHostFeatures: string[] }`; `UiProfile = { mcpAppsRevision: string; a2uiSchemaRevision: string; resourceMimeTypes: string[]; requiredHostFeatures: string[]; documentSchemas: DocumentSchema[]; catalog: { id: string; version: "0.9.1"; asset: string; sha256: string } }`; `McpPayload = { manifestAsset: string; connectorIds: string[]; transportProfiles: TransportProfile[]; protocolVersions: string[]; authorizationProfileSchemaAsset?: string; capabilityProfiles?: { id: string; tools: string[]; resources: string[]; prompts: string[]; readOnly: boolean }[]; ui?: UiProfile }`. Field-by-field mapping, source to G0: every envelope field and every nested type field above is `kept` under its source name and type; `kind` gains the single value `ontology` (`added` value, no field added); the `ontology` payload arm of §5.3 is `added`; no source field is dropped, renamed or merged.

Kind payload arms, verbatim scope (each arm is closed; the arm not selected is absent):

| Arm (present iff) | Closed content (v9 normative scope; no field added by G0) | Normative source |
|---|---|---|
| `skill` (iff kind is skill) | `profile` (`instructions` or `tools`), `metadata` (category, context filters, logical permission requirements, exact `toolNames`; name/version/description agree with the envelope), `instructionsAsset` (one asset path for `SKILL.md` with package-contained supporting references), `capabilities` (array of closed objects: `id`, `description`, `effect` (`read-only` or `mutation`), `permissions`, optional `inputSchemaRef`, `outputSchemaRef`), `tools` (SkillTool descriptors; `instructions` requires `tools: []` and `metadata.toolNames: []`), `documentSchemas` (`DocumentSchema[]`), `dependencies` (`EntryDependency[]`; no implicit activation) | [R9:§4.1] |
| `mcp` (iff kind is mcp) | `manifestAsset` (string), `connectorIds` (array of string), `transportProfiles` (`TransportProfile[]`), `protocolVersions` (array of string), optional `authorizationProfileSchemaAsset` (string), optional `capabilityProfiles` (array of closed objects: `id`, `tools`, `resources`, `prompts`, `readOnly`), optional `ui` (`UiProfile`). The manifest asset is the existing `AppMcpProviderManifest`; its `providerId` and `version` agree with the descriptor ID/entry version. | [R9:§5.1], [R9:§3.2] (`McpPayload`, `TransportProfile`, `UiProfile`) |
| `ontology` (iff kind is ontology; G0 addition) | The ontology payload of §5.3. No v9 skill or mcp field is reused inside it. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:577 |

| Field | Type | Required | Rule | Source |
|---|---|---|---|---|
| format | Literal sentropic.registry-entry/v1 | Yes | Exact literal. | Registry v9 §3.2 as carried at DOSSIER-ontology-guardian.md:154 |
| contractVersion | Exact version string (this revision 1.1.4) | Yes | Independent of package and protocol versions. | DOSSIER-ontology-guardian.md:154 |
| kind | Enum: skill, mcp, ontology (ontology is the G0 addition) | Yes | Exactly one kind payload is present; the others are absent. | DOSSIER-ontology-guardian.md:154, DOSSIER-ontology-guardian.md:577 |
| id | String (stable id) | Yes | Catalog identity segment. With kind and entryVersion it forms the catalog-record identity, distinct from the ontology identity (§1). | DOSSIER-ontology-guardian.md:358 |
| name | String (nonempty) | Yes | Human and host-local name. Never identity for the ontology itself. | DOSSIER-ontology-guardian.md:154, DOSSIER-ontology-guardian.md:358 |
| description | String (nonempty) | Yes | Entry description. For private entries it contains no business name and no private content. | DOSSIER-ontology-guardian.md:346 |
| entryVersion | Exact version string, no range, no tag | Yes | Versions this entry's public instructions, schemas and capabilities. A changed package version forces a new entry version, at least a patch. | DOSSIER-ontology-guardian.md:154, DOSSIER-ontology-guardian.md:359 |
| publisher | Closed object: packageName (string), packageVersion (exact string) | Yes | Exact packed package identity and version. Package name alone is not authentication. | DOSSIER-ontology-guardian.md:154 |
| compatibility | `Compatibility` type of [R9:§3.2], verbatim: `entryContract` (string), `packages` (array of `{ name, range }`), `schemaProfiles` (array of string), `requiredHostFeatures` (array of string), `optionalHostFeatures` (array of string); for MCP entries the tested protocol revisions and transports live in the `mcp` arm (`protocolVersions`, `transportProfiles`), not duplicated here | Yes | Empty or implicit universal support is refused. | [R9:§3.2] |
| parameters | `Parameters` type of [R9:§3.2], verbatim: `schemaVersion` (string), `schema` (closed JSON object under the bounded profile `sentropic.parameters/2020-12-bounded-v1` of [R9:§3.3]), `defaults` (JSON object, complete declared non-secret defaults or `{}`) | Yes | Bounded parameters only (§9). No credential, path, endpoint address or grant is a parameter value. | [R9:§3.2], [R9:§3.3], DOSSIER-ontology-guardian.md:553 |
| bindings | Array of closed objects: key (string), contract (versioned port contract string), required (boolean) | Yes (empty array allowed) | Logical port keys only, never secrets and never an implementation. | DOSSIER-ontology-guardian.md:154 |
| assets | Array of closed objects: role (string), path (package-contained relative path string), mediaType (string), sha256 (Digest) | Yes | Digest-bound, package-contained assets. Every instruction, schema and catalog asset is included or covered by a complete asset-index file. No traversal or escape. | DOSSIER-ontology-guardian.md:154 |
| ontology | Ontology payload (§5.3) | Required iff kind is ontology; absent otherwise | Exactly the kind payload for ontology. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:577 |
| extensions | Qualified metadata object | No | Qualified keys only. Extension metadata never broadens authority. | Registry discipline (closed envelope with qualified extensions), DOSSIER-ontology-guardian.md:154 |
| requiredExtensions | Array of string | No | Every listed key must exist in extensions and be supported by the consumer, else compatibility refuses. | Registry discipline, DOSSIER-ontology-guardian.md:154 |

The entry digest (entryDigest, §7) is computed externally over the whole entry (RFC 8785 canonical form plus SHA-256) and is never placed inside the entry itself. Source: DOSSIER-ontology-guardian.md:369, [R9:§8]. No credentials appear in any entry; no entry is an authorization grant; invocation rechecks effective policy per call. Source: DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:580.

Packed publisher fixture (zero-load). The packed-entry fixture for this envelope is a packed tarball entry validated from its `registry/entries.v1.json` manifest alone: CI inspects the packed tarball, recomputes every asset `sha256` over exact file bytes, verifies `entryDigest` externally, and observes that `register` and `catalog()` complete with zero ontology code loaded, zero provider import evaluated, and zero loader thunk invoked. Any load, import or thunk invocation during that fixture fails it. This is the G1 exit fixture `FX-CAT-PUB` in §8.6. Source: [R9:§3.2] (`catalog()` returns descriptors without importing executable definitions or invoking handlers; `register` never invokes the loader), DOSSIER-ontology-guardian.md:518, DOSSIER-ontology-guardian.md:553, [MEM:M7].

### 5.3 Ontology payload (closed; the G1 input)

Shared metadata (name, description, version, category, contextFilter, authzRequirements where applicable) is carried by the envelope and catalog metadata, not duplicated inside this payload. Source: DOSSIER-ontology-guardian.md:327. The payload below is closed: a field not listed here is not part of the G0 ontology payload.

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| canonicalRef | String | Yes | Canonical reference of the ontology. | DOSSIER-ontology-guardian.md:327 |
| namespace | String | Yes | Namespace or scope segment (same value as record namespace, §1.4). | DOSSIER-ontology-guardian.md:327 |
| owner | String | Yes | Owner handle (same discipline as §1.4). Domain, where a domain is declared, is a separate string field domain, or absent; owner never encodes a credential. | DOSSIER-ontology-guardian.md:327 (owner/domain) |
| domain | String, or absent | No | Owning domain, where declared. | DOSSIER-ontology-guardian.md:327 |
| profileShape | Enum (§1.4, five values) | Yes | Shape discriminant. | DOSSIER-ontology-guardian.md:327 |
| artifactKind | Enum (§1.4, six values) | Yes | d2d discriminant, mapped in §5.4. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:329 |
| profilePin | Pin | Yes | Pinned profile (id, version, contentDigest) that the entry is about. | STUDY-conformance-by-graph-composition.md:422 (profile pin id@version with profile digest) |
| stack | Pin list | Yes (single-layer stacks list exactly one pin) | Pinned ordered imports or parents, in stack order. | DOSSIER-ontology-guardian.md:327 |
| digests | Closed object: contentDigest (Digest), pinsDigest (Digest), resultEvidence (DigestEvidence of §1.3 over resultDigest) | Yes | Qualification evidence, in the single DigestEvidence encoding of §1.3 (identical in §§1.4, 3.1, 5.3, 5.5, 7.2). `contentDigest` and `pinsDigest` are always applicable digests and always present. `resultDigest` appears only inside `resultEvidence` arm `resolved`; arm `unresolved` carries no digest value and no placeholder stands in for it. entryDigest is not a payload field (it is computed over the whole entry, §5.2). | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:192, DOSSIER-ontology-guardian.md:335 |
| ruleSheets | Array of RuleSheetRef: closed objects: sheetPin (Pin of one unit rule sheet), ruleIds (array of string), selections (array of SelectionMetadata defined below; required for public entries, absent for private entries) | Yes (empty array allowed only where no rule sheet applies; where a composed rule set applies, the composed list is required) | Unit sheets in composed order. Public entries expose every selected rule's effective severity, selected policy and its digest, and study disposition where applicable, through the lossless mapping below. Full rule bodies remain domain-authored and bound by §7.2; private selection evidence remains owner-side under §5.5. P-PINS takes only each sheetPin, never the selection metadata. | [S:422], [S:353], [D:346] |
| lifecycle | Enum (§1.4, four values) | Yes | Lifecycle state mirrored from the record. | DOSSIER-ontology-guardian.md:327 |
| deprecatedReason | String, or absent | Required iff lifecycle is deprecated; absent otherwise | Deprecation reason, mirrored from the record (§1.4). Changing it changes entryDigest; it never changes profile bytes. | DOSSIER-ontology-guardian.md:245, DOSSIER-ontology-guardian.md:327 |
| deprecatedAt | Date string, or absent | Required iff lifecycle is deprecated; absent otherwise | Deprecation date, mirrored from the record (§1.4). | DOSSIER-ontology-guardian.md:245 |
| supersededBy | Pin, or absent | Required iff lifecycle is superseded; optional iff lifecycle is deprecated and a successor is known; absent otherwise | Successor pin, mirrored from the record (§1.4) including the deprecated-with-known-successor case of the dossier lifecycle representation. | DOSSIER-ontology-guardian.md:230, DOSSIER-ontology-guardian.md:245 |
| provenance | Closed object: sourceRef (string), sourceRevision (string: source commit or exact version) | Yes | Provenance of the entry (for protocol vocabularies, the source commit). This object is closed with exactly these two fields: licence closure and coverage are payload fields (`licenceClosure`, `coverage` below), never fields of `provenance`. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:349, DOSSIER-ontology-guardian.md:353 |
| licenceClosure | Closed object: licences (array of string, each MIT, Apache-2.0 or CC0), closureDigest (Digest) | Required iff the entry is an EXT pack entry; absent otherwise | Transitive licence closure, recomputed at admission; an excluded licence refuses (§5.6) and no lifecycle state cures it. | DOSSIER-ontology-guardian.md:112, DOSSIER-ontology-guardian.md:353 |
| coverage | Closed object: declaredLimits (string), coverageDigest (Digest) | Required iff the entry is an EXT pack entry; absent otherwise | Declared coverage record of the pack. | DOSSIER-ontology-guardian.md:353 |
| lineage | Same discriminated lineage union as §1.4; the private arm is exactly `PrivateLineage` of §1.3 | Yes | Derivation lineage and pinned lineage, by reference. §§1.4 and 5.3 use the same `PrivateLineage`; §3.1 maps its `PrivateDerivationRecord.resultingDigests` to these enclosing `digests` by §1.3. No operation, declaration payload or rule body is embedded. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:236 |
| conflictPolicy | String reference | Yes | Reference to the merge and stack conflict handling of §§2–4 (mapping-required, never silent overwrite). The handling itself is §§2–4; this field names which versioned policy record applies and never weakens it. | DOSSIER-ontology-guardian.md:327 |
| completeness | Enum: skeleton, complete | Yes | Declaration completeness only (§1). An entry claiming complete for a skeleton profile refuses. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:344 |
| corpusRef | Closed object: ref (string), digest (Digest) | Yes | Conformance-corpus reference and manifest digest. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:337 |
| receipts | Array of Receipt (§5.5) | Yes | Per-library conformance receipts. Admission refuses while any required receipt is missing (§5.5). | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:340 |
| migrations | Array of string references | Yes (empty allowed only where no migration exists) | Migration references. | DOSSIER-ontology-guardian.md:327 |
| consumers | Array of string | Yes | Consumers to notify before a major ships. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:230 |
| compatibility | Closed object: renderer and adapter compatibility references (strings), each pinned | Yes | Renderer and adapter compatibility. Consumers pin the published executor version once qualified; a pinned build-time copy is the transitional state before that qualification. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:485 |
| visibility | Tenant visibility (§1.3) | Yes | public, or private:tenant. Private entries are deny-as-missing for other tenants. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:346 |
| linkedTools | Array of string references | Yes | Linked invocation-tool entries (§9). Manifests project as ontology entries; invocation happens through linked tool entries. | DOSSIER-ontology-guardian.md:327, DOSSIER-ontology-guardian.md:553 |
| artifactBinding | Discriminated union on `artifactKind` (§5.4 variants) | Yes | Typed binding for the pinned artifact. Exactly the variant for the entry's `artifactKind` is present; the others are absent. Applicable digests inside a variant are always present; evidence not yet resolved is carried as the variant's unresolved state, never as a placeholder digest. | DOSSIER-ontology-guardian.md:329, DOSSIER-ontology-guardian.md:333–338 |

**Selected rule metadata — source, then lossless public-payload mapping.** The pinned study requires, verbatim: « la fiche de règles composée (liste de fiches unitaires du §3.1 avec `ruleId`, sévérité effective de la sélection, `severityPolicyDigest`, disposition §3.2 le cas échéant) » ([S:422]). A digest or a receipt alone does not replace these public fields.

`SelectionMetadata` is a closed object with required `phase` (string), `readinessPolicy` (string), `settings` (the complete effective `Setting[]` value, retaining `rule, severity, classification?, options?` from S-COMPILED), `severityPolicyDigest` (Digest) and `rules` (array of closed objects: required `ruleId` (string), `severity` (effective selected severity), optional `studyDisposition` (study §3.2 reference)). Each public unit sheet lists the selections covered by the entry's qualification scope, with exactly one row per `(phase, readinessPolicy)`. `settings` is the **whole composed selection**, in native effective-setting order, not a sheet-local subset; all sheets for the same selection carry that same value and digest. `rules` lists that unit sheet's `ruleIds` in their declared order, including disabled rules. Severity uses the pinned family's native vocabulary: BPMN `off | info | warn | error`, diagram-core `error | warning`, engram `error | warning | info`; other descriptors use their pinned declared selection vocabulary. No `warn`/`warning` translation is performed. BPMN numeric settings retain their original number in `settings`; only the effective `rules[].severity` is obtained by the native severity predicate (`0/1/2/3` → `off/warn/error/info`, with `info` staying `info`, independently of upstream transport). Sources: [S:422], [S:353], S-COMPILED and [BC@63a9258:src/profile/lint-contracts.ts:8–18,46–83], S-DSDIAG, S-ENGISSUE (§2.1.0).

| Source field or value | Public payload / receipt location | Status and inverse |
|---|---|---|
| Profile identity and native profile digest | `profilePin.id/version/contentDigest`; BPMN native `compiledOptions.profileDigest` remains in §5.5 evidence | kept; the native digest is not renamed or replaced |
| Ordered unit sheet pins and rule ids | `ruleSheets[].sheetPin/ruleIds` | kept; projecting `sheetPin` alone recovers P-PINS `ruleSheets` in the same order |
| Selected `phase, readinessPolicy` | `ruleSheets[].selections[].phase/readinessPolicy`; BPMN evidence keeps the identical native fields | kept; the pair selects the exact qualification scope, with no inferred/default policy |
| Every native effective `Setting` field, including raw severity, classification, permitted options and optional-field presence | `ruleSheets[].selections[].settings` (BPMN: equal to the full §5.5 public evidence `settings`) | kept verbatim; reading this array recovers the complete selected native settings, including numeric severities |
| Effective severity for each selected rule, including `off` | `ruleSheets[].selections[].rules[].ruleId/severity` and §5.5 `ruleVerdicts[].ruleId/severity` | kept; stable selection rule ids are retained, and receipt severity must equal the selected row; native diagnostic ids/fields are unchanged |
| Native `severityPolicyDigest` | `ruleSheets[].selections[].severityPolicyDigest`; receipt `proofBindings.severityPolicyDigest` for `bpmn-parity`, receipt `severityPolicyDigest` for every other arm when rules apply | kept; equal to SHA-256 of the existing canonical `{phase, readinessPolicy, settings}` value, never a hash of just the unit sheet's subset |
| Study §3.2 disposition, where applicable | `ruleSheets[].selections[].rules[].studyDisposition` and `ruleVerdicts[].studyDisposition` | renamed to avoid native Report/2 `disposition`; presence and value round-trip exactly |

Taking the ordered pins/ids plus these selected fields reconstructs all metadata required by [S:422] without reading a rule body or treating a digest as its missing metadata. Reconstructing the native settings preserves raw and effective severity separately. Omission, disagreement between copies, or a stale selection digest refuses admission under §5.5. Private entries carry no `selections` array: the full settings and private rule content stay owner-side, with only the existing pins, receipt verdicts/digests and opaque evidence reference exposed. This retains the private boundary rather than extending the public mapping to private content. Sources: [S:422], [D:236], [D:340], [D:346].

Typed artifact bindings (closed variants; dossier-derived). Each variant is closed. Every evidence field that can be unresolved uses the single DigestEvidence encoding of §1.3 or names its receipt reference under the same two-state discipline; no variant invents a second unresolved shape.

| Variant (`artifactKind`) | Closed fields | Distinction applicable / unresolved | Source |
|---|---|---|---|
| `mechanism` | `mechanismVersion` (string, exact), `descriptorPins` (Pin list: pinned moddle descriptor digests), `compatibilityMatrixVersion` (string, exact) | All three are applicable pins/versions, always present. Verdicts live in receipts (§5.5), never inside the binding. | DOSSIER-ontology-guardian.md:333 |
| `base` | `basePin` (Pin), `bijectionEvidence` (discriminated union: arm `resolved` with `receiptRef` (string); arm `unresolved` with no `receiptRef` field) | `basePin` is always present. Bijection evidence (generated BPMN bases only) is `unresolved` with no receipt reference until the bijection receipt (§5.5 arm `bpmn-bijection`) exists; a non-BPMN base carries arm `resolved` with the base corpus receipt reference. Same two-state discipline as DigestEvidence; the discriminated field names are `evidenceState` values `resolved`/`unresolved`. | DOSSIER-ontology-guardian.md:334, DOSSIER-ontology-guardian.md:132 |
| `profile` | `profilePin` (Pin), `stack` (same value as payload `stack`), `relationMatrixRef` (string reference, required for private profiles; absent otherwise) | Pins and stack are always present; the digests sit in payload `digests` (DigestEvidence). For private profiles the guardian holds pins, digests and receipts only; `relationMatrixRef` names the owner-side matrix without carrying private content. | DOSSIER-ontology-guardian.md:335, DOSSIER-ontology-guardian.md:314 |
| `theme` | `themeDigest` (Digest), `appliesTo` (Pin of the styled profile) | Both always present. Applying the separate theme changes only presentation state, not the styled profile bytes or their digests (§7.2 theme invariant scope; FX-THM-01). The theme artifact retains its own digest. | DOSSIER-ontology-guardian.md:336 |
| `corpus` | `manifestDigest` (Digest), `manifestRef` (string), `sealedVectorsDigest` (Digest), `caseCounts` (closed object: `publishedCases` (integer), `localVectors` (integer)) | Manifest and sealed-vector digests are always present. The two proof sets stay separate counts (176 published cases; 486 local vectors) and are never merged into one figure. | DOSSIER-ontology-guardian.md:337, STUDY-conformance-by-graph-composition.md:162 |
| `contract` | `schemaPin` (Pin: contract schema id, version, contentDigest), `compatibilityMatrixVersion` (string, exact) | Both always present. Per-case verdicts (one error code per case) live in receipts. | DOSSIER-ontology-guardian.md:338 |

Private entries (any `artifactKind`, `private:tenant`): the `lineage` payload field is the single `PrivateLineage` of §1.3, used by §§1.4/5.3 and mapped explicitly from the §3.1 result record (pins, derivationRef and mapping references only); no private body, business name or relation-matrix content is ever a binding field. The guardian-side record proves existence, stack and receipts; content stays in the owning project. Source: DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:346, DOSSIER-ontology-guardian.md:386.

Payload prohibitions (normative). The payload contains: no credentials (DOSSIER-ontology-guardian.md:327); no memory bodies, identifiers or citations (DOSSIER-ontology-guardian.md:352); no entity-registry record data (DOSSIER-ontology-guardian.md:347); no journal bytes as assets (DOSSIER-ontology-guardian.md:348); no runtime session state presented as an ontology (DOSSIER-ontology-guardian.md:349); no business names or profile body for private entries (DOSSIER-ontology-guardian.md:346).

### 5.4 artifactKind mapping (verbatim correspondence; no value dropped)

The d2d kinds are kept verbatim as artifactKind; each maps to exactly one guardian handling. Source: DOSSIER-ontology-guardian.md:329.

| artifactKind (d2d) | Guardian profileShape | What the entry pins | Admission receipts required (gate in §5.5) | Source |
|---|---|---|---|---|
| mechanism | mechanism-descriptor | bpmn-canvas profile-mechanism version plus pinned moddle descriptor digests | Receipt from each implementing library over the parity corpus | DOSSIER-ontology-guardian.md:333 |
| base | diagram-profile (DIA base) or engram-profile (ENG base), according to the base shape | Base profile (id, version, contentDigest) that other artifacts stack over | Base profile's own corpus receipt; bijection receipt when the base is a generated BPMN profile | DOSSIER-ontology-guardian.md:334 |
| profile | diagram-profile, engram-profile or track-vocabulary, according to family | Profile (id, version, contentDigest, pinsDigest) plus layer stack; resultDigest recorded as qualification evidence once resolved | Every per-library corpus receipt for MECH and D2D artifacts; validator receipt for DIA, ENG and TRK artifacts. Every listed receipt is required, none is optional. | DOSSIER-ontology-guardian.md:335 |
| theme | Same profileShape as the profile it styles (presentation layer, never a semantic profile) | Theme artifact digest plus the profile pin it applies to | Receipt that applying the theme changes no semantic digest (view-only check) | DOSSIER-ontology-guardian.md:336 |
| corpus | mechanism-descriptor (corpus manifest as descriptor) | Corpus manifest digest (profile-corpus-v1.0.0, 198 files, manifest-pinned) plus sealed vectors | Manifest recomputation receipt; per-library pass receipts over the corpus | DOSSIER-ontology-guardian.md:337 |
| contract | mechanism-descriptor (for example d2d-placement/1, Report/2, compatibility-verdict schemas) | Contract schema (id, version, contentDigest) plus compatibility-matrix version | Schema-validation receipt plus compatibility-matrix verdicts (one error code per case) | DOSSIER-ontology-guardian.md:338 |

### 5.5 Conformance receipts and the admission gate

Receipt shape (closed, discriminated by family). `Receipt` is a discriminated union on `receiptKind`, with one arm per family and per decision type. Every arm shares the common fields below; the arm fields are additional and closed, and no arm carries another arm's proof fields. The BPMN proof sets (`published-corpus`, `local-expectations`) exist only inside the `bpmn-parity` arm; no other family's receipt names them, and no BPMN receipt is required of a non-BPMN entry. A receipt encodes the validator role actually executed, the complete evaluated result it binds (stack pins with `pinsDigest` and `resultDigest`, §7), the typed transition-qualification evidence where it claims the reference role, the parity status of each rule, and the `not-evaluated` outcome where a check was not evaluated (notably N2 without a DI projection). No receipt presents a transitional oracle or a retained check as the reference. The guardian stores receipts and executes no library itself. Source: DOSSIER-ontology-guardian.md:340, STUDY-conformance-by-graph-composition.md:34, STUDY-conformance-by-graph-composition.md:326.

Common fields (every arm):

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| receiptKind | Enum: bpmn-parity, bpmn-bijection, family-corpus, h2a-vocabulary, mem-descriptor, mechanism-compat, contract-verdict, theme-invariance | Yes | Discriminant of the arm. Exactly the arm for the entry family and decision type is present. | DOSSIER-ontology-guardian.md:340 |
| corpusDigest | Digest | Yes | Digest of the corpus (or corpus manifest) the run covered. | DOSSIER-ontology-guardian.md:340 |
| libraryId | String | Yes | Identity of the implementing library or family validator that produced the receipt. | DOSSIER-ontology-guardian.md:340 |
| libraryVersion | String (exact) | Yes | Version of that library or validator. | DOSSIER-ontology-guardian.md:340 |
| validatorRole | Enum: transitional-oracle, retained-check, qualified-ds-execution | Yes | Role actually executed (§6.3 closed set). `transitional-oracle` witnesses expected verdicts during transition only; `retained-check` is a check outside composition under its study-listed owner; `qualified-ds-execution` is the reference once qualified. | DOSSIER-ontology-guardian.md:270, STUDY-conformance-by-graph-composition.md:34 |
| verdict | Enum: pass, fail | Yes | Library verdict over the corpus. Admission requires pass (see gate). A receipt whose rule verdicts contain `not-evaluated` for a required rule never counts as pass for that rule. | DOSSIER-ontology-guardian.md:340, STUDY-conformance-by-graph-composition.md:326 |
| issuedAt | Date string | Yes | Date the receipt was produced by the library's own test run. | DOSSIER-ontology-guardian.md:340 |
| evaluatedStack | Closed object: stack (Pin list, in stack order), pinsDigest (Digest), resultEvidence (DigestEvidence of §1.3 over the evaluated resultDigest) | Yes | The complete evaluated result the verdicts were produced under: the exact stack pins, their `pinsDigest`, and the resulting `resultDigest` in DigestEvidence form. Admission first requires both this `resultEvidence` and the entry’s `digests.resultEvidence` to have `evidenceState: resolved`; even `verdict: pass` with an `unresolved` arm refuses explicitly (FX-RCPT-UNRESOLVED). Only then compare stack order, `pinsDigest` and resolved result digests field by field (§5.5 gate, FX-RCPT-MISMATCH). For H2A, MEM and TRK, `stack` is the single descriptor/vocabulary pin: it records the evaluated version and invokes no composition operation. For private entries this object carries pins and digests only, never effective bytes. | DOSSIER-ontology-guardian.md:340, DOSSIER-ontology-guardian.md:367, DOSSIER-ontology-guardian.md:368 |
| transitionQualification | Discriminated union on `claim`. Arm `oracle-witness`: closed object claim, parityMatrixDigest (Digest). Arm `reference-qualified`: closed object claim, parityMatrixDigest (Digest), qualifiedExecutorPin (Pin), gateEvidenceRef (string: the parity-gate record, for d2d including the lot-6 release GO reference) | Required iff validatorRole is qualified-ds-execution (then arm `reference-qualified`); arm `oracle-witness` iff validatorRole is transitional-oracle; absent iff validatorRole is retained-check | Typed transition-qualification evidence. A receipt claiming the reference role without `reference-qualified` evidence, or with any required rule at `parity: open`, never satisfies a switch (§5.5 gate). Retained checks carry no transition claim. | STUDY-conformance-by-graph-composition.md:34, STUDY-conformance-by-graph-composition.md:449, DOSSIER-ontology-guardian.md:270 |

Receipt arms (closed; arm fields are additional to the common fields). `ruleVerdicts` is defined once, under the arms, with its study name `studyDisposition`:

| Arm (`receiptKind`) | Closed arm fields | Required for | Source |
|---|---|---|---|
| `bpmn-parity` | `proofBindings` (closed object: proofSet (enum: published-corpus, local-expectations), corpusAuthority (closed object: tag (string), manifestDigest (Digest)), unicodeLockDigest (Digest, or absent only where no text/case/prefix rule applies), profilePin (Pin), severityPolicyDigest (Digest), ruleSheetPins (Pin list), compiledLintEvidence (the public/private-reference union below)), `ruleVerdicts` (required, below) | MECH, D2D and generated-BPMN DIA parity entries: one receipt per implementing library per proof set claimed | STUDY-conformance-by-graph-composition.md:162, STUDY-conformance-by-graph-composition.md:422, STUDY-conformance-by-graph-composition.md:440 |
| `bpmn-bijection` | `descriptorCoverage` (closed object: covered (integer), total (integer); admission requires covered equals total), `roundTripEvidenceRef` (string: moddle JSON to DiagramState round-trip record), `moddleTestPin` (Pin: latest bpmn-moddle as test dependency), `severityPolicyDigest` (Digest or null, selection rule below) | A-prime generated BPMN bases (with the `bpmn-parity` receipts) | [D:340], [D:132], [S:422] |
| `family-corpus` | `family` (enum: DIA, ENG, TRK, HRN, RPK, EXT), `fixtureDigest` (Digest: manifest digest of the family conformance corpus), `severityPolicyDigest` (Digest or null, selection rule below), `ruleVerdicts` (present; may be empty only where no rule sheet applies) | DIA, ENG, TRK, HRN, RPK and EXT validator entries. This arm names no BPMN proof set and requires no BPMN receipt. | [D:340], [S:422] |
| `h2a-vocabulary` | `protocolPin` (Pin), `sourceRevision` (string: exact protocol source commit, equal to payload `provenance.sourceRevision`), `fixtureDigest` (Digest: recorded envelope-corpus manifest), `severityPolicyDigest` (Digest or null, selection rule below), `ruleVerdicts` (present; may be empty when no rule sheet applies) | H2A protocol vocabulary only: retained family validator replays the recorded corpus on the pinned version. No live session state, no BPMN proof set, no bijection or BPMN receipt. | [D:239], [D:279], [D:317], [D:349], [S:422] |
| `mem-descriptor` | `descriptorPin` (Pin), `fixtureDigest` (Digest: descriptor-conformance/reconciliation-input fixture manifest), `severityPolicyDigest` (Digest or null, selection rule below), `ruleVerdicts` (present; may be empty when no rule sheet applies) | MEM descriptor definitions only: retained family validator checks synthetic descriptor fixtures without journal access. No memory body, identifier, digest, citation, existence signal or record-admission verdict; no BPMN proof set or BPMN receipt. Descriptor/corpus digests are not memory-record digests. | [D:242], [D:282], [D:320], [D:352], [D:405–407], [S:422] |
| `mechanism-compat` | `compatibilityMatrixVersion` (string, exact), `caseVerdicts` (array of closed objects: caseId (string), errorCode (string, or absent on pass)), `severityPolicyDigest` (Digest or null, selection rule below) | MECH mechanism and corpus entries (compatibility matrix, one error code per case) | [D:333], [D:337], [D:338], [S:422] |
| `contract-verdict` | `schemaPin` (Pin), `compatibilityMatrixVersion` (string, exact), `caseVerdicts` (array of closed objects: caseId (string), errorCode (string, or absent on pass)), `severityPolicyDigest` (Digest or null, selection rule below) | Contract entries (schema validation plus matrix verdicts) | [D:338], [S:422] |
| `theme-invariance` | `styledProfilePin` (Pin), `semanticDigestsBefore` (closed object: contentDigest (Digest), pinsDigest (Digest), resultDigest (Digest)), `semanticDigestsAfter` (same closed object), `severityPolicyDigest` (Digest or null, selection rule below) | Theme entries: admission requires the before/after objects equal field by field (FX-THM-01) | [D:336], [S:422] |

**Selection binding for non-`bpmn-parity` arms.** Their `severityPolicyDigest` field is always present: the selected Digest when the evaluated scope has a rule sheet, `null` only when no rule sheet applies (including vocabulary/descriptor checks with empty `ruleSheets`). It names the same selection as the entry's public `SelectionMetadata`, or the owner-side selection evidence for a private entry. It introduces no BPMN proof set, compiled BPMN object or composition operation into a family receipt. For `bpmn-parity`, the existing required location remains `proofBindings.severityPolicyDigest`, equal to its compiled evidence; no second copy is added at receipt root. Sources: [S:422], [S:353], [D:340].

`compiledLintEvidence` (BPMN arm only) is a closed discriminated union on `scope`. Arm `public`: `{ scope: public, compiledOptions: S-COMPILED, settings: Setting[] }`, preserving the complete native compiled object and effective settings verbatim. Arm `private-reference`: `{ scope: private-reference, ownerReceiptRef: string }`, an opaque reference to the owner-side closed evidence object `{ compiledOptions: S-COMPILED, settings: Setting[] }`; the full evidence is checked by the owning library, never copied to the guardian. `scope` must match the entry visibility. In both scopes the native digest `compiledOptions.severityPolicyDigest` equals `proofBindings.severityPolicyDigest` and recomputes from the exact `{phase, readinessPolicy, settings}`; `compiledOptions.compiledRules` keeps all full selected bodies, and its top-level `bindings` keeps every `ownerId/role/targetId` separately from per-rule bindings. The public/owner evidence binds the exact requested selection and evaluated binding snapshot; an absent owner reference or a producer-side mismatch refuses, never substitutes an unresolved result. This is storage by reference under the dossier’s private-content boundary, not loss of native fields. Source: [BC@63a9258:src/profile/lint-contracts.ts:46–95], [D:236], [D:276], [D:340], [D:346], [S:353].

H2A and MEM use `validatorRole: retained-check` with no `transitionQualification`: their vocabulary replay and descriptor conformance do not switch to a BPMN composition executor. Their pin and `fixtureDigest` must equal the entry’s `profilePin` and `corpusRef.digest`, respectively; `corpusDigest` equals that same manifest digest. `h2a-vocabulary.protocolPin` and `mem-descriptor.descriptorPin` identify versioned definitions only. Source: [D:279], [D:282], [D:349], [D:352].

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| ruleVerdicts (in arms `bpmn-parity`, `family-corpus`, `h2a-vocabulary`, `mem-descriptor`) | Array of closed objects: ruleId (string), severity (effective selected severity in the pinned native vocabulary, same as §5.3 `rules[].severity`), verdict (enum: off, pass, diagnostic, not-evaluated), parity (enum: proven, open), studyDisposition (string reference to study §3.2, or absent) | Required in arm `bpmn-parity`; present in each family/vocabulary/descriptor arm, empty only where no rule sheet applies; severity required in every row | Explicit per-rule verdict built at the receipt layer above both engines: `off` from the compiled selection (then severity is `off`), `pass` if evaluated without diagnostic, `diagnostic` otherwise, `not-evaluated` where the check was not evaluated (N2 without DI projection: `di-projection: absent`, verdict `not-evaluated`, never `pass`). A required but unevaluated rule still carries its selected severity; it is never relabelled `off`. `parity` records proven parity versus open parity for that rule at the pinned selection; `studyDisposition` carries the §3.2 disposition where the check sits outside composition (renamed from `disposition` for the §2.1 reason: Report/2 `disposition` keeps its native meaning). Severity and study disposition must match the selected metadata, including optional-field presence. An absence in a raw engine result never counts as pass without this layer. | [S:422], [S:345], [S:326], [S:440], [S:449] |

Who produces receipts. (a) For the BPMN mechanism and d2d artifacts, each implementing library means the two existing libraries that implement the shared contracts (the JavaScript library and its twin recorded in the d2d position), each producing its own pass receipt over the same parity corpus (profile-corpus-v1.0.0) and the unicode-case/1 table (UCD 15.0.0); byte parity between the libraries on the shared corpus is part of the receipt. Source: DOSSIER-ontology-guardian.md:340. (b) For A-prime generated BPMN profiles, the receipt is the bijection evidence: descriptor coverage 100 percent plus the moddle JSON to DiagramState round trip, with the latest bpmn-moddle as a test dependency. Source: DOSSIER-ontology-guardian.md:340, DOSSIER-ontology-guardian.md:132. (c) For DIA, ENG, TRK, HRN and RPK artifacts, the receipt is the family's validator run over its conformance corpus (valid fixtures pass, rejected fixtures yield their asserted diagnostics). Source: DOSSIER-ontology-guardian.md:340. (d) H2A receipts are protocol-version replay over a recorded envelope corpus, with the source commit pinned; MEM receipts are descriptor-conformance fixtures without journal access. Neither admits runtime session state or memory records. Source: [D:279], [D:282], [D:349], [D:352].

Gate (normative, no weaker admission). **First require resolved result evidence:** `entry.digests.resultEvidence.evidenceState` and every required `receipt.evaluatedStack.resultEvidence.evidenceState` must both be `resolved`, with present, equal Digest values. A passing receipt (`verdict: pass`) with `resultEvidence: {evidenceState: unresolved}` is explicitly refused, even if every pin, corpus digest and other field matches; two unresolved arms never constitute a match. The same refusal applies to an unresolved entry paired with a resolved receipt. Such evidence may be stored for a draft outside the catalog; it never passes admission. Then compare the evaluated stack in order, `pinsDigest`, and family/selection proof bindings against the entry and requested qualification scope; refuse every mismatch. For public rule-sheet scopes, require the selected `(phase, readinessPolicy)` metadata, recompute its digest over complete settings, and compare that digest with the receipt's selection binding; where the arm carries `ruleVerdicts`, also compare every rule's selected severity/study disposition (§5.3 mapping). A missing required row, missing/incorrect policy digest or stale severity refuses, even with matching result evidence. Private comparisons use the owner-side evidence and retain the same refusal without exposing settings. This applies to every receipt arm, including private-reference, H2A and MEM; no-rule-sheet scopes in non-`bpmn-parity` arms use the explicit `null` selection binding specified above. Source: [D:230], [D:335], [D:340], [D:368], [S:422].

The guardian refuses admission, at any completeness including skeleton, while any required receipt is missing, failed, or mismatched: for MECH, D2D and generated-BPMN DIA entries that means the parity corpus plus a passing receipt from each implementing library (and, for generated BPMN, the bijection evidence). A receipt with `verdict: fail`, a receipt whose `evaluatedStack` (stack, `pinsDigest` or resolved `resultDigest`) or whose arm proof fields do not match the entry pins, a receipt naming the wrong validator role for the transition gate or claiming `qualified-ds-execution` without `reference-qualified` evidence, and a required rule at `not-evaluated` each refuse admission exactly as a missing receipt does. A receipt with `parity: open` on a rule witnesses transition only; it never satisfies a switch to `qualified-ds-execution` for that rule. skeleton describes an incomplete declaration whose required receipts for its declared scope are present and passing; it never substitutes for a missing, failed, mismatched or not-evaluated receipt. An absent/unresolved result or compiled-evidence reference, wrong selection, failed run or proof mismatch has the same `missing-receipt` admission refusal (qualified evidence missing), not a new admitted state. A candidate without full admission evidence stays a draft outside the catalog. The guardian adds no evaluator and runs no additional runtime in CI for this gate: receipts are produced by each library's own test run and submitted as catalog evidence. Source: DOSSIER-ontology-guardian.md:340, STUDY-conformance-by-graph-composition.md:449.

Two proof sets are never conflated (for BPMN parity claims): the published corpus (176 cases) and the local expectations (486 vectors, 68 identifiers in common), with corpus authority at the pinned tag and hash check before use. Every parity claim names which set it covers. Source: STUDY-conformance-by-graph-composition.md:162, STUDY-conformance-by-graph-composition.md:440. The unicode-case/1 lock (UCD 15.0.0) applies to every rule comparing text, case or prefix, with the same table in both libraries and no platform case conversion. Source: STUDY-conformance-by-graph-composition.md:162, DOSSIER-ontology-guardian.md:340.

### 5.6 Catalog invariants and typed errors

| # | Invariant | Source |
|---|---|---|
| C-1 | catalog inspection loads zero ontology code; registration validates metadata only and grants no access. | DOSSIER-ontology-guardian.md:344, DOSSIER-ontology-guardian.md:553 |
| C-2 | Entry validation distinguishes the two registry meanings (entity registries are project data; the entry registry holds catalog records). | DOSSIER-ontology-guardian.md:347 |
| C-3 | A packed entry validates, and get by pin returns identical digests. | DOSSIER-ontology-guardian.md:344 |
| C-4 | Private entries are deny-as-missing for other tenants; cross-tenant listing shows nothing. | DOSSIER-ontology-guardian.md:346, DOSSIER-ontology-guardian.md:561 |
| C-5 | Existing contentDigest values are unchanged by cataloguing (stability proof in §7). | DOSSIER-ontology-guardian.md:518, DOSSIER-ontology-guardian.md:371 |

| Code | Raised when | Source |
|---|---|---|
| missing-receipt | Any required receipt is missing, failed, mismatched, not evaluated for a required rule, or lacks resolved matching result evidence (including a passing receipt with unresolved `resultEvidence`), at any completeness | DOSSIER-ontology-guardian.md:340, DOSSIER-ontology-guardian.md:344, DOSSIER-ontology-guardian.md:345, DOSSIER-ontology-guardian.md:346 |
| completeness-overclaim | An entry claims complete for a skeleton profile | DOSSIER-ontology-guardian.md:344 |
| unpinned-artifact | An entry references an artifact without pinned digests (including any network reference) | DOSSIER-ontology-guardian.md:345 |
| private-content-refusal | A private entry carries business names or the profile body, or declares a visibility other than private:tenant for private content | DOSSIER-ontology-guardian.md:346 |
| registry-meaning-confusion | An entry embeds entity-registry record data as catalog content, includes journal bytes as assets, or presents runtime session state as an ontology | DOSSIER-ontology-guardian.md:347, DOSSIER-ontology-guardian.md:348, DOSSIER-ontology-guardian.md:349 |
| verificationrun-merge-refusal | An entry merges the two VerificationRun types under one record | DOSSIER-ontology-guardian.md:350 |
| missing-service-binding | An export entry lacks the service-revision binding (profile entry plus export entries bound by the manifest) | DOSSIER-ontology-guardian.md:351, DOSSIER-ontology-guardian.md:455 |
| memory-content-refusal | An entry contains memory bodies, identifiers or citations | DOSSIER-ontology-guardian.md:352 |
| excluded-licence | The recomputed licence closure contains an excluded licence | DOSSIER-ontology-guardian.md:353 |

Expected fixtures for this contract are FX-CAT-* in §8.6. The decisive fixtures are: a packed entry validates and catalog inspection loads zero ontology code; the corpus manifest digest recomputes equal; a cross-tenant list shows nothing. Source: DOSSIER-ontology-guardian.md:344, DOSSIER-ontology-guardian.md:345, DOSSIER-ontology-guardian.md:346, DOSSIER-ontology-guardian.md:518.

## 6. Contract 4 — Application receipt (Applicable)

### 6.1 Application targets and operations

Four application targets already exist: a repository (profile binding through project config), a graph or extraction, a diagram, and a view (occurrences resolve against semantic entities; layout consumes semantic to view). Source: DOSSIER-ontology-guardian.md:268.

| Operation | Exact shape (closed) | Source |
|---|---|---|
| validate(target, pin) | Returns the application receipt (§6.2). Validation never mutates the target. | DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:277 |
| apply(target, pin) — preview by default | Closed object: effectiveProfile (composed profile, or pins plus digests plus receipts only for private ontologies), bindingChanges (array of binding-change descriptions), staleArtifacts (array of artifact references), nextRebuild (rebuild command reference). Any write form goes through the existing patch or transaction paths with dry-run default and explicit confirmation. | DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:566 |

Renderer application stays build-time: consumers pin the published executor version once qualified under G2, and a pinned build-time copy remains valid as the transitional state before that qualification; the MCP surface serves agents and the catalog, not the paint path. Source: DOSSIER-ontology-guardian.md:270, [G2].

### 6.2 Receipt shape (closed; exact field set)

The receipt records that this artifact was validated against ontology at version, digest, at the target shown. The field set below is exact; no field is added or renamed.

| Field | Type | Required | Meaning | Source |
|---|---|---|---|---|
| ontologyId | String | Yes | Ontology identifier validated against. | DOSSIER-ontology-guardian.md:270 |
| version | String (exact version) | Yes | Ontology version validated against. No floating version is recorded. | DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:274 |
| contentDigest | Digest | Yes | Content digest of the profile (§7). | DOSSIER-ontology-guardian.md:270 |
| pinsDigest | Digest | Yes | Digest of the declared pins used (§7). Distinct from resultDigest; the two are never interchanged. | DOSSIER-ontology-guardian.md:270 |
| resultDigest | Digest | Yes | Digest of the effective profile actually validated (§7). For private targets the receipt carries pins and digests only, never effective bytes. | DOSSIER-ontology-guardian.md:270 |
| targetKind | Enum: repo, graph, diagram, view | Yes | Kind of target validated. | DOSSIER-ontology-guardian.md:270 |
| targetRef | String | Yes | Reference to the target artifact. | DOSSIER-ontology-guardian.md:270 |
| targetDigest | Digest | Yes | Digest of the target bytes validated. | DOSSIER-ontology-guardian.md:270 |
| validator | Closed object: role (enum in §6.3), implementationId (string), implementationVersion (exact string) | Yes | The validator that actually executed, naming exactly one role (§6.3) plus its implementation identity and version. No receipt presents a transitional oracle or a continuing delegation as the reference. | DOSSIER-ontology-guardian.md:270 |
| result | Enum: valid, invalid, preserved-unvalidated | Yes | Validation result. preserved-unvalidated is a first-class result, not a failure (preserved-content discipline). | DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:196 |
| diagnostics | Separate array of §2.1 G0 diagnostics (lossless variants; `origin` selects the variant) | Yes (empty exactly when result is valid with no findings) | Separate enriched copies under §2.1.1, ordered by the G0 comparator; never the native `report.entries` array. Native severities and field presence are preserved and provenance is never fabricated. For BPMN targets every entry is the `report2` variant carrying the full S-REPORT2 field set of §2.1.0 verbatim (`code`/`nativeCode`, `severity` with `warn`, `classification`, `stage`, native `disposition`, `source` and `result` Coordinates, `beforePresent`/`afterPresent` with `before`/`after`, and every optional field present at the source), so oracle and reference findings compare field by field. Diagram and extraction targets use the `diagram-core` and `engram` variants, preserving their native codes, paths, messages and coordinates without loss. | DOSSIER-ontology-guardian.md:270, STUDY-conformance-by-graph-composition.md:345 |
| report | S-REPORT2 `Report` object of §2.1.0, or absent | Required iff the run produced a Report/2 Report (BPMN targets); absent otherwise | The whole **native** Report, carried unchanged: `reportVersion, operation, entries` (native ReportEntry values in native order), `rawStandardFindings, idMap, artifacts`, plus `sourceIdentity, targetIdentity, inputRevision, outputRevision` when present. No G0 field appears anywhere inside its entries, no Report field is dropped, and artifact indexes retain their original meaning. The separate `diagnostics` array relates to it only by the reversible indexed mapping of §2.1.1; the two arrays are not equal. | [BC@63a9258:src/profile/report.ts:24], DOSSIER-ontology-guardian.md:270 |

For BPMN lint, `result` respects the producing validator’s native disposition-sensitive barrier (§2.1.0); corrected/dropped/mapped errors do not alone make it invalid. Report/2 closure and the §2.1.1 bijection are validated without modifying the supplied Report. For a private target, the full application receipt (including any content-bearing Report or diagnostic values) stays owner-side; the guardian keeps only its receipt reference, pins and digests under [D:276], [D:346], [D:386].

### 6.3 Validator roles (closed; no fourth role)

The validator field names exactly one of three roles, per the final study, cited without duplication. Source: DOSSIER-ontology-guardian.md:270, STUDY-conformance-by-graph-composition.md:34.

| Role value | Meaning | Source |
|---|---|---|
| transitional-oracle | A transitional validator used as parity oracle only (incumbent validators witnessing expected verdicts during transition, in the roles the study assigns them). Never presented as the reference. | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:274 |
| retained-check | A retained check outside composition, executed by its owner as listed in the study. Never transferred to composition. | DOSSIER-ontology-guardian.md:251 |
| qualified-ds-execution | The qualified Design System generic executor evaluating the Engram-governed composed definitions. The reference once qualified. | DOSSIER-ontology-guardian.md:251, [G2] |

Switch rule. No switch to qualified-ds-execution occurs before proven parity under the study parity gates; for d2d, no switch before lot 6 and its release GO. A receipt issued before that proof names the role actually executed (oracle or retained check), never the reference. Source: DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:275, DOSSIER-ontology-guardian.md:276.

Family spellings fix the validator per family (diagram-core verifier under G2 for DIA, with a pinned build-time copy valid only as a transitional parity oracle before qualification; bpmn-canvas verifiers as transitional parity oracles only for MECH; d2d libraries as transitional parity oracles only for D2D, executed inside d2d). Source: DOSSIER-ontology-guardian.md:274, DOSSIER-ontology-guardian.md:275, DOSSIER-ontology-guardian.md:276.

### 6.4 Application invariants and typed errors

| # | Invariant | Source |
|---|---|---|
| A-1 | Validation never mutates the target; writes go only through the patch or transaction paths. Mutating the graph through validate refuses. | DOSSIER-ontology-guardian.md:270, DOSSIER-ontology-guardian.md:277 |
| A-2 | Validating with an unpinned (floating) profile refuses. Unknown schema major in write refuses. | DOSSIER-ontology-guardian.md:274 |
| A-3 | A validation receipt never settles a decision, acceptance or realization. Turning a path verdict into a realization transition refuses. | DOSSIER-ontology-guardian.md:278, DOSSIER-ontology-guardian.md:280 |
| A-4 | Descriptor or profile digest mismatch refuses with a typed code, never a fallback load. Presenting a transitional delegation as continuing or as the reference refuses. | DOSSIER-ontology-guardian.md:275, DOSSIER-ontology-guardian.md:276 |
| A-5 | An MCP call inside an import, lint, render or export path is refused by design; validation there is build-time and vendored by digest. | DOSSIER-ontology-guardian.md:276 |
| A-6 | A hand-edited committed subgraph presented as generated refuses (provenance mismatch). A numeric claim over an unknown (NM) term refuses; the term stays symbolic. Coverage beyond a pack's declared limits refuses; a corpus outside declared coverage yields preserved-unvalidated or a coverage diagnostic, never a silent pass. | DOSSIER-ontology-guardian.md:281, DOSSIER-ontology-guardian.md:283 |
| A-7 | MEM validation is limited to family-descriptor conformance of reconciliation inputs; validating (admitting) a memory through an ontology operation refuses. Validating live session state as if it were a vocabulary refuses. | DOSSIER-ontology-guardian.md:282, DOSSIER-ontology-guardian.md:279 |

Typed errors for this contract use the §2.1 envelope inside the receipt diagnostics, plus receipt-level refusals where no receipt is produced (unpinned profile, digest mismatch before evaluation, private-content request). The codes digest-mismatch, unpinned-parent (applied to the validation pin) and private-content-refusal of §§1–2 apply unchanged. Source: DOSSIER-ontology-guardian.md:274, DOSSIER-ontology-guardian.md:275.

Expected fixtures for this contract are FX-APP-* in §8.3. The decisive fixtures are: the nine rejected diagram cases yield their asserted diagnostics and deleting an occurrence changes no entity; an unknown node or relation type yields its diagnostic with registry existence checked; the parity corpus passes per library as oracle witness during transition. Source: DOSSIER-ontology-guardian.md:274, DOSSIER-ontology-guardian.md:275, DOSSIER-ontology-guardian.md:277.

## 7. Contract 5 — Digest rules (identity and stability)

### 7.1 Four distinct digests (never interchanged)

Each digest answers a different question, is computed over different bytes, and changes under different events. The four procedures are distinct and non-interchangeable; an implementation that derives one from another, or substitutes one for another, fails qualification. Equal values are not by themselves a failure: an unchanged single-layer resolution may legitimately yield equal content and result digests. In particular pinsDigest and resultDigest are not equivalent: neither value may stand in for the other, and equality between them is never used as a check. The only required relation is determinism: recomputing the resolution of the same pins under the same composition rules reproduces the same resultDigest. A composition-rule change can therefore change resultDigest while pinsDigest is unchanged, which is exactly why the two stay separate. Source: DOSSIER-ontology-guardian.md:362.

| Digest | Question answered | Bytes covered (G0 freeze where the dossier delegates it) | Changes when | Existing anchor | Source |
|---|---|---|---|---|---|
| contentDigest | Which profile bytes are these? | The profile's own canonical bytes only (no parents, no catalog metadata). Per shape: d2d artifacts keep their existing c14n canonical bytes hashed with SHA-256, exactly as already computed; engram profiles keep the stable serialization behind profile_hash; diagram profiles use SHA-256 over the profile module's canonical serialization, frozen in §7.2. The DS FNV value is never these bytes' digest. | Only when the profile's own bytes change (new version) | d2d c14n identity; engram profile_hash | DOSSIER-ontology-guardian.md:366 |
| pinsDigest | Which pins were declared? | SHA-256 over the P-PINS preimage of §7.2: ordered layer Pins plus rule-sheet Pins plus the delta digest (P-DELTA) and mapping digest (P-MAPPING) in one hashed object. Even for a single-layer stack this hashes the pin structure, never the profile bytes, so it stays distinct from contentDigest. | When any layer pin, layer order, rule-sheet pin, delta or mapping changes, even if the top profile's own bytes are unchanged | New in the dossier | DOSSIER-ontology-guardian.md:367, STUDY-conformance-by-graph-composition.md:353 |
| resultDigest | Which resolved result was produced? | SHA-256 over the P-RESULT preimage of §7.2: the effective declarations plus the effective rule set. For private stacks the value is computed inside the owning project and recorded by the guardian as receipt data; the guardian never computes it from content it does not hold. | When the resolved effective bytes change: any pin, order or delta change, or a composition-rule change with pins unchanged | New in the dossier | DOSSIER-ontology-guardian.md:368 |
| entryDigest | Which catalog record is this? | RFC 8785 canonical form of the whole catalog entry (metadata, payload, the digests above as fields), computed externally with SHA-256 and never self-embedded. | When any entry field changes (owner, lifecycle including deprecation, consumers, receipts), even if profile bytes, pins and resolved result are unchanged. A state change that leaves entryDigest unchanged fails qualification. | Registry entry digest | DOSSIER-ontology-guardian.md:369 |

Catalog identity uses SHA-256 over the RFC 8785 canonical form; the DS FNV hash remains a drift receipt inside the artifact, never the catalog digest. Source: DOSSIER-ontology-guardian.md:169.

### 7.2 G0 serialization freezes — exact preimages (only where the dossier delegates them)

The dossier delegates exactly two freezes to G0: the diagram-profile canonical serialization for contentDigest, and the pin-list serialization for pinsDigest. Both freezes use the registry canonical form (RFC 8785 canonical JSON plus SHA-256) so that content, pins and entry digests share one canonical discipline without sharing bytes or procedures. The delta and mapping digests that enter the pins preimage are frozen here as part of that delegation, because the dossier defines `pinsDigest` over layers plus delta/mapping digests. No other serialization is frozen by G0; in particular G0 does not re-canonicalize any artifact that already has an identity (see §7.3). Source: DOSSIER-ontology-guardian.md:366, DOSSIER-ontology-guardian.md:367, DOSSIER-ontology-guardian.md:169, [R9:§8].

Canonical discipline for every preimage below (normative). Bytes are the RFC 8785 canonical form of the named JSON value: object keys sorted, no insignificant whitespace, numbers in RFC 8785 form. Arrays keep the order stated per preimage; reordering a stated-ordered array changes the bytes and therefore the digest. A `Digest` value inside a preimage is the 64-digit lowercase hex string itself. `null` means the stated absent case and is hashed as `null`; an absent field is never substituted by an empty string, an empty array (except where the field is defined as an array), or a placeholder digest. Hashing is SHA-256 over the exact UTF-8 bytes, rendered as 64 lowercase hex digits. Source: [R9:§8], DOSSIER-ontology-guardian.md:367.

**Source shapes for §7.2, transcribed verbatim (pinned), then the G0 projections.**

S-DSPROFILE ([DS] `packages/diagram-core/src/profile.ts:86–104`), verbatim; referenced declaration types remain those at lines 21–84 of the same pin:

~~~ts
export interface ProfileLimits {
  readonly maxEntities?: number;
  readonly maxRelations?: number;
  readonly maxEndpointsPerRelation?: number;
}

export interface Profile {
  readonly id: ProfileId;
  readonly name: string;
  readonly version: number;
  readonly completeness: "complete" | "skeleton";
  readonly entityTypes: readonly EntityTypeDeclaration[];
  readonly portTypes: readonly PortTypeDeclaration[];
  readonly relationTypes: readonly RelationTypeDeclaration[];
  readonly constraints: readonly ProfileConstraint[];
  readonly limits: ProfileLimits;
  /** Declared limits, in prose, for a human reading a skeleton profile. */
  readonly notes: readonly string[];
}
~~~

The omitted-limit case is required: `bpmn@1`, `archimate@1` and `uml@1` each declare only `limits: { maxEndpointsPerRelation: 2 }` ([DS] `packages/diagram-core/src/profiles/skeletons.ts:104,152,225`); `generic@1` declares all three ([DS] `packages/diagram-core/src/profiles/generic.ts`). Every limit is optional in S-DSPROFILE, and P-CONTENT-DIAGRAM below preserves that distinction with `null`.

S-ENGRAMHASH is the existing `profile_hash` serialization, not a new RFC 8785 projection. Its source function is transcribed verbatim ([ENG] `src/ontology-profile.ts:69–83`):

~~~ts
function stableForHash(value: unknown, path: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((item, index) => stableForHash(item, [...path, String(index)]));
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === "sourcePath" || key === "profile_hash" || key === "bound_source_path") continue;
      // The local module path is runtime-only. Its portable descriptor (export
      // name + file-content hash) is hashed instead under linking.normalizer.
      if (key === "fn" && path.at(-1) === "normalize" && path.at(-2) === "linking") continue;
      result[key] = stableForHash((value as Record<string, unknown>)[key], [...path, key]);
    }
    return result;
  }
  return value;
}
~~~

Hashing is the pinned `hashOntologyProfile` procedure at [ENG] `src/ontology-profile.ts:505–511`: SHA-256 of `JSON.stringify(stableForHash(profile))`. In addition to the three named runtime keys, the source excludes only `fn` at `linking.normalize.fn` (its portable descriptor remains hashed). The guardian stores the existing anchor, without changing this procedure ([D:366], [D:371]).

S-D2DC14N is the **complete** owner document and the existing `profile-c14n/2` bytes. Native identities, verbatim ([BC@63a9258:src/profile/envelope.ts:7–11]):

~~~ts
export interface IdentityPin { readonly id: string; readonly version: string; readonly sha256: string }
export interface ProfileIdentity {
  readonly mechanismVersion: string; readonly schemaVersion: string; readonly profile: string; readonly version: string;
  readonly sha256: string; readonly base: IdentityPin; readonly descriptors: readonly IdentityPin[];
}
~~~

Native complete-document source shape, verbatim ([BC@63a9258:src/profile/envelope.ts:26–30]):

~~~ts
const profileArraySections = ["descriptors", "capabilities", "producerDelta", "notions", "rules", "recipes", "placements", "themes", "ui",
  "validation", "providerDialects", "exports", "migrations", "resources", "messages", "compatibilityAliases"] as const;
export type CompleteProfileDocument = Omit<ProfileIdentity, "sha256"> & {
  readonly $schema: string; readonly policies: Readonly<Record<string, unknown>>;
} & Readonly<Record<typeof profileArraySections[number], readonly unknown[]>>;
~~~

`CompleteProfileDocument` omits only the identity's derived `sha256`; it requires `$schema`. All declared array sections, including `themes` and `ui` even when empty, stay in the document. `canonicalize` produces its RFC 8785 string; UTF-8 encodes that string; `rawDigest` hashes the given bytes without normalization or trailing-LF removal; `canonicalDigest(value) = rawDigest(canonicalize(value))`. `profileIdentity` computes `sha256` from the entire complete document. Source: [BC@63a9258:src/profile/canonical.ts:19–73], [BC@63a9258:src/profile/envelope.ts:34–42], [D:366–371].

| Source fields | G0 treatment | Mapping status |
|---|---|---|
| S-DSPROFILE `id` | P-CONTENT-DIAGRAM `profile`, identical `name@major` value | renamed (labels the identity within the canonical projection) |
| S-DSPROFILE `completeness, entityTypes, portTypes, relationTypes, constraints` | Same fields and full declared native values in P-CONTENT-DIAGRAM | kept |
| S-DSPROFILE `limits.maxEntities?, maxRelations?, maxEndpointsPerRelation?` | Same limit keys; each missing value is represented by `null` in the delegated canonical projection | kept (omission explicitly encoded) |
| S-DSPROFILE `name, version, notes` | Kept in the referenced native profile; `name/version` identity is represented by `id`, and human notes are outside the delegated content projection | kept in source; excluded only from the delegated projection |
| S-ENGRAMHASH complete value and the exact source exclusions above | Existing `profile_hash` anchor; P-RESULT public uses its stable value as stated below | kept; no re-canonicalization of existing content |
| S-D2DC14N `$schema, mechanismVersion, schemaVersion, profile, version` | Same keys and values in owner canonical bytes for P-CONTENT and private P-RESULT | kept |
| S-D2DC14N `base.{id,version,sha256}` and `descriptors[].{id,version,sha256}` | Native identity-pin objects and declared array order, without conversion to G0 Pin keys | kept |
| S-D2DC14N `policies` | Complete native map, with every field | kept |
| S-D2DC14N `capabilities, producerDelta, notions, rules, recipes, placements, themes, ui, validation, providerDialects, exports, migrations, resources, messages, compatibilityAliases` | All arrays with every full value in declared order; no projection or section deletion | kept |
| ProfileIdentity `sha256` | Native derived output of `canonicalDigest(completeProfileDocument)`, never inserted as a self-field into that complete document | kept as derived identity; absent from native document by the source's `Omit` |

**P-CONTENT-DIAGRAM — diagram-content projection for `contentDigest` (diagram profiles).** The preimage value is the closed object below, canonicalized as above. It is a projection of the profile's declarative content only: the derived-access discipline of the study (strictly derived, no persistence, no second model) applies to instance projection; this freeze projects profile declarations, not instance documents, views, geometry or themes. Source: DOSSIER-ontology-guardian.md:189, STUDY-conformance-by-graph-composition.md:248, [G2].

| Key (canonical order is sorted; listed here in sorted order) | Value | Included / excluded |
|---|---|---|
| `completeness` | String (`skeleton` or `complete`) | Included verbatim. |
| `constraints` | Array of the profile's executable constraint declarations, in declared order, each canonicalized as its native JSON value | Included. |
| `entityTypes` | Array of entity type declarations, in declared order, each canonicalized as its native JSON value (labels, attribute schemas and `abstract` flags included where declared) | Included. |
| `limits` | Closed object with exactly the three keys `maxEntities`, `maxRelations`, `maxEndpointsPerRelation`, each either the declared number or `null` where the source `ProfileLimits` omits it. Omission is hashed as `null`; an omitted limit is never hashed as `0`, never dropped as a key, and never invented. | Included. No other limit key enters the preimage. |
| `portTypes` | Array of port type declarations, in declared order | Included (empty array where none declared). |
| `profile` | String `name@major` (the source `id`) | Included verbatim. |
| `relationTypes` | Array of relation type declarations, in declared order (labels, direction, roles with `min`/`max` cardinalities, endpoint targets and entity types, attributes, and `hierarchy` where declared) | Included. |

Excluded from P-CONTENT-DIAGRAM (never hashed): runtime code, file paths, the DS FNV drift value, view documents, occurrences, geometry, layout results, theme identifiers and token values, and every catalog field. The declarative content is the profile data governed by Engram under G2; the executor machinery is not part of these bytes. `contentDigest` for a diagram profile is SHA-256 over the RFC 8785 bytes of this object and over nothing else. Source: DOSSIER-ontology-guardian.md:366, DOSSIER-ontology-guardian.md:189.

For the other shapes the dossier freezes no new bytes: d2d artifacts keep their existing `profile-c14n/2` canonical bytes hashed with SHA-256 exactly as already computed; engram profiles keep the stable serialization behind `profile_hash`. G0 stores those digests and never recomputes them under P-CONTENT-DIAGRAM. Source: DOSSIER-ontology-guardian.md:366, DOSSIER-ontology-guardian.md:371.

**P-PINS — pin preimage for `pinsDigest` (all shapes).** The preimage value is the closed object below. It mixes profile pins, rule-sheet pins, and the delta/mapping digests in one hashed structure; each component keeps its own digest procedure (P-DELTA, P-MAPPING) and none is derived from another. Source: DOSSIER-ontology-guardian.md:367, STUDY-conformance-by-graph-composition.md:353.

| Key | Value | Order rule |
|---|---|---|
| `deltaDigest` | Digest, or `null` where the stack declares no derivation delta | Single value. |
| `layers` | Array of Pin objects, each exactly `{ contentDigest, id, version }` | Stack order (top layer last). Reordering changes the digest. Even a single-layer stack hashes this array; it never hashes profile bytes. |
| `mappingDigest` | Digest, or `null` where the stack declares no mapping | Single value. |
| `ruleSheets` | Array of Pin objects, each exactly `{ contentDigest, id, version }` pinning one unit rule sheet | Composed order (the order the sheets apply). Empty array where no rule sheet applies. |

`pinsDigest` is SHA-256 over the RFC 8785 bytes of this object. Where rule sheets compose, omitting `ruleSheets` or hashing profile pins alone fails qualification. Source: STUDY-conformance-by-graph-composition.md:353.

The public payload's richer `RuleSheetRef` is mapped to this preimage by `ruleSheets.map(ref => ref.sheetPin)` in composed order. Its `ruleIds` and selected metadata are public catalog fields, not additional Pin fields: P-ENTRY binds them all, while P-RESULT binds the effective rules/settings and selected policy by its existing procedure. P-PINS remains the pin-only object above. Sources: [D:367], [D:369], [S:353], [S:422].

**P-DELTA — delta preimage for the delta digest (complete encoding for partial declarations).** The delta digest entered in P-PINS is SHA-256 over the RFC 8785 bytes of the closed object `{ base, mappingRef, operations, retiredFixtures, retiredRules }` where: `base` is the base Pin (`{ contentDigest, id, version }`); `mappingRef` is the mapping Pin or `null`; `operations` is the delta operations array in applied order, each operation canonicalized as the closed object `{ declarationDigest, op, subject }` (plus `newName` for `rename-with-mapping`, verbatim) where `declarationDigest` is defined per operation, completely, over the single declared value alone — never over a whole profile: for `add`, SHA-256 over the canonical bytes of the one `declaration` value (diagram: RFC 8785 bytes of that declaration JSON value; engram: SHA-256 over `JSON.stringify(stableForHash(declaration))` per S-ENGRAMHASH; d2d: SHA-256 over the `profile-c14n/2` bytes of that declaration value per S-D2DC14N); for `narrow`, the same single-value procedure over the one `constraint` value; for `rename-with-mapping` and `deprecate-term`, which carry no declaration payload, `declarationDigest` is the SHA-256 over the RFC 8785 bytes of the closed object `{ from, kind, to }` of the `rename` arm (for rename) or over the RFC 8785 bytes of `{ reason, subject }` (for deprecate-term) — every operation therefore binds its full payload and no operation borrows a whole-profile serialization; `retiredFixtures` and `retiredRules` are the arrays of §3.1 in declared order, each entry `{ fixtureRef, reason }` or `{ ruleId, reason }` verbatim. A partial declaration (one added type, one narrowed cardinality) is encodable by this procedure alone; applying a whole-profile projection to it fails qualification. Source: DOSSIER-ontology-guardian.md:308, DOSSIER-ontology-guardian.md:367, DOSSIER-ontology-guardian.md:371.

**P-MAPPING — mapping preimage for the mapping digest (`contentDigest` of a mapping file).** The mapping digest is SHA-256 over the RFC 8785 bytes of the closed object `{ entries, mappingId, version }` where `entries` is the MappingEntry array of §3.3 in file order, each entry canonicalized as its flat typed object `{kind, ...arm fields}` with every arm field verbatim (rename: `{from, kind, to}`; cardinality: `{chosenMax, chosenMin, kind, subject}` in canonical sorted order; hierarchy and severity arms with all their decision fields), and the file's own `contentDigest` field is excluded (external digest, never self-embedded). Changing any decision field (`chosenMin`, `chosenMax`, `chosenShape`, `parentRole`, `childRole`, `chosenSeverity`, `role`) changes this digest. Source: DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:367, [R9:§8].

**P-RESULT — resolved-result preimage for `resultDigest` (effective rule bodies bound).** The two scope-specific procedures below retain their prescribed bytes; neither hashes a digest string instead of the effective profile bytes. Source: [D:368], [S:353].

(a) *Guardian-computable diagram/engram scopes:* SHA-256 over RFC 8785 bytes of the closed object `{ effectiveDeclarations, effectiveRuleSet, severityPolicyDigest }`. `effectiveDeclarations` is the P-CONTENT-DIAGRAM object of the effective diagram profile, or the `stableForHash` value of the effective normalized engram profile. `effectiveRuleSet` keeps composed order and consists of closed objects `{ classification, code, messageKey, ruleBody, ruleId, severity }` for the effective selection (empty if no rule sheet applies). `ruleBody` is the **complete** effective native rule value: for a compiled BPMN profile rule, required `id, phase, select, assert, code, message, classification` and only optional `repairRecipe, bindings`. No compiled-rule `options` is permitted. Patterns, thresholds and per-rule bindings are kept verbatim; other families retain their native declaration values. Effective classification and severity are kept in each row; inherited standard-rule options remain native `Setting.options` and enter the full settings value hashed by `severityPolicyDigest`. This digest is the pinned SHA-256 of canonical `{phase, readinessPolicy, settings}` (or `null` if no rule sheet applies). Thus changing an effective body, option, severity, classification or selected policy changes these public P-RESULT bytes, even when ids and pins are held fixed for the fixture. Source: [S:353], [BC@63a9258:src/profile/lint-contracts.ts:46–95].

(b) *Owner-side d2d/private scope, exactly [D] §2.4:* let `E` be the complete effective profile document produced owner-side by `compose/resolve`. Compute `resultDigest = SHA-256(UTF-8(canonicalize(E)))` using the existing `profile-c14n/2` procedure S-D2DC14N. Hash **all** native bytes, including `$schema, base, descriptors, policies` and **all** array sections, notably full `rules/recipes/validation` and `themes/ui`, including empty arrays. Delete no section; add no wrapper, digest string or selector field. The private profile bytes and full native evidence remain owner-side; the guardian stores only pins, resulting digests and receipt references (§5.5), and cannot recompute this value. Source: [D:236], [D:257], [D:366–371], [BC@63a9258:src/profile/envelope.ts:26–42], [BC@63a9258:src/profile/canonical.ts:65–73].

**Owner selector versus owner result.** The native compiler receives `(phase, readinessPolicy)` as a separate argument; exactly one matching `E.validation` table selects effective settings. Its `severityPolicyDigest` hashes `{phase, readinessPolicy, settings}` and therefore binds the run selection. Changing **only** this external selector can change severity and `severityPolicyDigest` with `E`, its canonical bytes and its private `resultDigest` unchanged. Changing a stored validation row (severity, classification or policy-table content), rule body or other field **in E** changes private `resultDigest`. These are different fixture mutations; the procedure does not require the owner to invent a new effective-document format to include runtime arguments. Full native compiled evidence, including the top-level binding snapshot, binds the exact run in §5.5; a result digest alone never certifies a run selection. Source: [D:368], [S:353], [BC@63a9258:src/profile/lint-contracts.ts:46–83]. Concrete selector/row vectors below fix FX-DIG-R3 to these predicates.

**Theme invariant scope.** Applying/removing a separately pinned theme changes presentation state only and leaves the styled profile `E` unchanged ([D:336], FX-THM-01). It does not edit `E.themes` or `E.ui`. Editing either native document section is a profile-byte change and must change its private content/result digest; ignoring even an empty section would violate S-D2DC14N. Public diagram projections continue excluding separate presentation data under P-CONTENT-DIAGRAM. These scopes keep the theme fixture without re-projecting the owner's canonical bytes.

Both procedures hash resolved effective values, not the pin list. A composition-rule mutation that changes the effective declarations/rules (and therefore the owner's `E` where private) changes `resultDigest` while unchanged P-PINS bytes keep `pinsDigest` unchanged ([D:362], [D:368], FX-DIG-01).

**P-ENTRY — entry preimage for `entryDigest`.** `entryDigest` is SHA-256 over the RFC 8785 bytes of the whole catalog entry value (envelope plus selected kind payload, including lifecycle, deprecation fields, receipts and digests as fields), computed externally and never placed inside the entry. Source: DOSSIER-ontology-guardian.md:369, [R9:§8].

Canonical byte vectors (frozen; an implementation must reproduce each digest from the exact bytes). Keys below are already in RFC 8785 sorted order; vectors use the placeholder digests shown and are also stability fixtures in §8 (`FX-DIG-*`).

| Vector | Exact canonical bytes (UTF-8, no trailing newline) | SHA-256 (Digest) |
|---|---|---|
| V-PINS-1 (P-PINS, single layer, no delta/mapping/rules) | `{"deltaDigest":null,"layers":[{"contentDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","id":"generic","version":"1.0.0"}],"mappingDigest":null,"ruleSheets":[]}` (186 bytes) | `467becc10978220abbbe6d9fdad72eddec4c62a3dd9f2150bc3f9fe1bd7313fe` |
| V-DIAGRAM-1 (P-CONTENT-DIAGRAM, minimal) | `{"completeness":"complete","constraints":[],"entityTypes":[{"id":"node"}],"limits":{"maxEndpointsPerRelation":4,"maxEntities":100,"maxRelations":200},"portTypes":[],"profile":"generic@1","relationTypes":[]}` (206 bytes) | `4d2c641281713349753eb80ba40e0b08ec29b2f93847e4d0f2feb18e25381c94` |
| V-MAPPING-1 (P-MAPPING, one rename) | `{"entries":[{"from":"a","kind":"rename","to":"b"}],"mappingId":"m1","version":"1.0.0"}` (86 bytes) | `b5770fd9b0623a047f65ed3d7811340afa965a623faaf0fd3e58babbc1be2516` |
| V-DELTA-1 (P-DELTA, one add) | `{"base":{"contentDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","id":"generic","version":"1.0.0"},"mappingRef":null,"operations":[{"declarationDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","op":"add","subject":"c4-system"}],"retiredFixtures":[],"retiredRules":[]}` (320 bytes) | `436065f4f09c6de4dc7f25f8eb3821088e43f27c2f9454137fc19042bebff3e2` |

A vector mismatch (different bytes or different digest for the same logical value) fails qualification; the vectors, not a prose description of canonicalization, decide the freeze. No other serialization is frozen by G0. Tour-3 note on the four vectors: no vector changes. V-PINS-1 and V-MAPPING-1 are untouched by the tour-3 edits (the rename arm keeps the exact `{from, kind, to}` bytes). V-DIAGRAM-1 declares all three limits, so the omitted-limit-as-`null` encoding produces the identical object and bytes. V-DELTA-1 carries a placeholder `declarationDigest`; the tour-3 single-value procedure still produces that field, so the P-DELTA wrapper bytes are identical. All four digests were recomputed again from the exact bytes in Sol author round 1 with the pinned native canonical functions and match the frozen values (186/206/86/320 bytes); no byte or expected hash changed.

**Owner selector/byte vectors (FX-DIG-R3, normative scope distinction).** These are synthetic canonicalization/compiler values, not a claim of profile/corpus qualification. E0 below is the exact complete-document value (all array sections present, including empty `themes`/`ui`); UTF-8, no trailing newline: 968 bytes, SHA-256 `d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903`. Source procedure: [D:368], S-D2DC14N, [BC@63a9258:src/profile/lint-contracts.ts:46–83].

~~~json
{"$schema":"urn:profile-mechanism:1","base":{"id":"base","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","version":"1.0.0"},"capabilities":[],"compatibilityAliases":[],"descriptors":[{"id":"bpmn","sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","version":"1.0.0"}],"exports":[],"mechanismVersion":"1","messages":[],"migrations":[],"notions":[],"placements":[],"policies":{},"producerDelta":[],"profile":"g0-vector","providerDialects":[],"recipes":[],"resources":[],"rules":[],"schemaVersion":"1.0.0","themes":[],"ui":[],"validation":[{"id":"import","policy":"draft","settings":[{"classification":"readiness","rule":"label-required","severity":"warn"}]},{"id":"import","policy":"accept","settings":[{"classification":"readiness","rule":"label-required","severity":"error"}]},{"id":"release","policy":"accept","settings":[{"classification":"advisory","rule":"label-required","severity":"info"}]}],"version":"1.0.0"}
~~~

E1 is exactly E0 with the sole replacement at JSON Pointer `/validation/0/settings/0/severity`: `"warn"` → `"error"` (no other field, array or order changes). Its canonical bytes have 969 bytes and SHA-256 `f3c0f8f0fb4d1526767df6841e42de873473d72178ca71c88b7b0fd58521eb2c`. The external selectors are never inserted into either document. For every row, `compiledRules: []`, top-level `bindings: []`, default inherited settings `{}` and required-standard list `[]`; the sole effective setting is the named table row above.

| Vector / document | External `(phase, readinessPolicy)` | Effective severity / upstream transport | Native `severityPolicyDigest` | Owner `resultDigest` (whole E) |
|---|---|---|---|---|
| V-OWNER-0a / E0 | `(import, draft)` | `warn` / `warn` | `f4fe529257140570caa80653a2c33b55d942f8ede92a8a03d6dc8e048f1fb7db` | `d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903` |
| V-OWNER-0b / E0 | `(import, accept)` | `error` / `error` | `af61ae36a73bb35ef0271c1edbdb15cf7ed271342edd536d2d4561f2b7057028` | `d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903` |
| V-OWNER-0c / E0 | `(release, accept)` | `info` / `warn` | `8b3bb80431f6df02eb1832c92e4c4e6b07e5056b9e453cf2679e2a583632b918` | `d1ac3edb3fddb851ccbc95ceeae2c57b8d93e8907ed24ac09f0b1194660b1903` |
| V-OWNER-1 / E1 | `(import, draft)` | `error` / `error` | `8eaf5e7eb8909c547f0f55c4fd8f3f65f14951ad9e079ef8bef851bdbe0ca655` | `f3c0f8f0fb4d1526767df6841e42de873473d72178ca71c88b7b0fd58521eb2c` |

V-OWNER-0a → 0b changes readiness policy; 0b → 0c changes phase. Effective severity and selection digest change, while the document and its result digest stay identical. V-OWNER-0a → 1 changes a stored severity row: both selection digest and result digest change. The native `compiledOptions.profileDigest` equals the owner document digest in each row. Deleting `$schema`, `themes` or `ui` (even empty) produces different bytes and cannot verify any of these vectors; applying a separate theme while leaving E fixed keeps them unchanged. This is the prescribed [D:368] byte identity, not an extra normalization.

Sol author round 2 recomputes all eight vectors with the pinned native `canonicalize`, `canonicalDigest`, `compileLintPolicy` and severity predicate: exact bytes, lengths, digests, selected severities and transport values match. All eight preimages and expected values remain unchanged: §§5.3/5.5 restore public selection/receipt metadata, not native document bytes, compiler inputs or any digest procedure. P-PINS projects sheet pins exactly as before; P-CONTENT-DIAGRAM, P-MAPPING, P-DELTA and the complete E0/E1 owner documents are unchanged. P-ENTRY already includes the whole entry, so an entry gains a different `entryDigest` when the restored fields are added or changed; none of the eight vectors is a P-ENTRY vector. FX-CAT-SELECTION below checks the newly visible metadata against these unchanged digest scopes. Sources: [D:366–371], [S:353], [S:422], [BC@63a9258:src/profile/canonical.ts:23–73], [BC@63a9258:src/profile/lint-contracts.ts:14–18,46–83].

**Dossier §2.4 digest procedure, transcribed then extended.** Source procedure ([D] §2.4, DOSSIER-ontology-guardian.md:364): `contentDigest` over the profile's own canonical bytes only (d2d `profile-c14n/2` bytes hashed with SHA-256; engram stable serialization behind `profile_hash`; diagram SHA-256 over the profile module's canonical serialization, frozen by G0); `pinsDigest` over the ordered `(id, version, contentDigest)` pins of every layer plus the delta/mapping digests, hashed in stack order (pin-list serialization frozen by G0); `resultDigest` as SHA-256 over the canonical bytes of the effective profile produced by `compose`/`resolve`, computed inside the owning project for private stacks and recorded by the guardian as receipt data; `entryDigest` as RFC 8785 canonical JSON of the whole catalog entry, computed externally and never self-embedded. Field-by-field mapping: each dossier byte set is `kept` as the corresponding P-CONTENT/P-PINS/P-RESULT/P-ENTRY preimage; G0 `added` items are only the frozen serializations the dossier delegates (P-CONTENT-DIAGRAM projection, P-PINS object, P-DELTA/P-MAPPING encodings) and, per the study, the effective rule set inside P-RESULT (STUDY-conformance-by-graph-composition.md:353: `resultDigest` covers the effective declarations and the effective rule set). No dossier byte set is replaced by a digest of itself.

### 7.4 Preimage completeness (one fixture per semantic input)

For each digest, every semantic input that can change the effective outcome is listed with the exact preimage location where it enters and the §8 fixture that proves it: changing that input changes the digest, and each listed irrelevant change leaves it unchanged. A semantic input with no preimage location, or a fixture that does not decide it, fails qualification.

`contentDigest` (per shape; diagram column is P-CONTENT-DIAGRAM, the other shapes hash their kept source bytes whole):

| Semantic input | Where it enters the preimage | Fixture (§8.6) |
|---|---|---|
| `profile` (`name@major`), `completeness` | P-CONTENT-DIAGRAM keys `profile`, `completeness` | FX-DIG-C1 |
| Each entity type declaration (id, label, attributes, `abstract`) | `entityTypes[]`, declared order | FX-DIG-C2 |
| Each port type declaration | `portTypes[]`, declared order | FX-DIG-C3 |
| Each relation type declaration (roles, `min`/`max`, targets, hierarchy) | `relationTypes[]`, declared order | FX-DIG-C4 |
| Each executable constraint | `constraints[]`, declared order | FX-DIG-C5 |
| Each limit value, and limit omission itself | `limits.maxEntities` / `maxRelations` / `maxEndpointsPerRelation`, omitted as `null` | FX-DIG-C6 |
| Irrelevant: `notes`, theme id/tokens, catalog fields, DS FNV value, file path | Excluded (never hashed) | FX-DIG-C7 (digest unchanged) |

`pinsDigest` (P-PINS; the delta and mapping components enter through P-DELTA/P-MAPPING):

| Semantic input | Where it enters the preimage | Fixture (§8.6) |
|---|---|---|
| Each layer pin (`id`, `version`, `contentDigest`) | `layers[]` Pin objects | FX-DIG-P1 |
| Layer order | `layers[]` order (top last) | FX-DIG-P2 |
| Each rule-sheet pin and composed order | `ruleSheets[]` Pin objects, composed order | FX-DIG-P3 |
| Delta: base pin, each operation in applied order, each single-value payload, retired fixtures/rules with reasons | `deltaDigest` via P-DELTA (`base`, `operations[].declarationDigest`, `retiredFixtures`, `retiredRules`) | FX-DIG-P4 |
| Mapping: each typed entry with all decision fields, entry order, `mappingId`, `version` | `mappingDigest` via P-MAPPING | FX-DIG-P5 |
| Irrelevant: profile bytes behind an unchanged pin; separately applied theme state | Not in P-PINS (a byte change behind a pin is `digest-mismatch`, never a new pinsDigest over old pins) | FX-DIG-P6 (digest unchanged for theme; refusal for byte drift) |

`resultDigest` (P-RESULT; both byte procedures):

| Semantic input | Where it enters the preimage | Fixture (§8.6) |
|---|---|---|
| Effective declarations (composed types, relations, cardinalities, hierarchies, constraints, limits) | `effectiveDeclarations` (guardian scopes); complete native effective-document canonical bytes, with every S-D2DC14N field (owner scope) | FX-DIG-R1 |
| Each effective rule body (pattern `select`/`assert`, thresholds, per-rule bindings; native settings options where permitted) | Full `effectiveRuleSet[].ruleBody` and native settings in `severityPolicyDigest` (guardian scopes); complete `rules`/`recipes`/`validation` bytes (owner scope). Compiled-rule `options` is forbidden. | FX-DIG-R2 |
| Each stored severity/classification and the external severity-policy selection | Public: effective rows plus `severityPolicyDigest` bind both; private: `validation` bytes bind stored tables, while the separate external selector is bound by owner compiled evidence/`severityPolicyDigest`, not added to the prescribed result bytes. V-OWNER-0a/0b/0c share a result digest; V-OWNER-1 changes a stored row and that digest. | FX-DIG-R3 |
| Composition order and composition-rule version (pins held identical) | Order of `effectiveDeclarations`/`effectiveRuleSet` as composed; rule change alters bodies | FX-DIG-R4 (= FX-DIG-01) |
| Irrelevant to the fixed effective result: separate theme application/removal, catalog metadata, pin-list bytes as such, owner external selector/binding snapshot alone | None alters the effective profile bytes. Owner `themes`/`ui` document edits are relevant and change the digest; selectors/bindings still bind their run through native receipt evidence. | FX-THM-01, FX-DIG-R3, FX-DIG-R5 |

`entryDigest` (P-ENTRY: RFC 8785 bytes of the whole entry):

| Semantic input | Where it enters the preimage | Fixture (§8.6) |
|---|---|---|
| Envelope metadata (`id, name, description, entryVersion, publisher, compatibility, parameters, bindings, assets`) | Whole-entry value, envelope keys | FX-DIG-E1 |
| Payload identity and pins (`canonicalRef, namespace, owner, domain, profilePin, stack, profileShape, artifactKind`) | Whole-entry value, payload keys | FX-DIG-E2 |
| Public selected rule metadata (`ruleSheets[].selections`: phase, policy, complete settings, effective severity, policy digest and study disposition), plus receipt severity/policy bindings | Whole-entry value, payload and receipt keys; public P-RESULT also binds effective severity/settings and the policy digest by its existing preimage | FX-CAT-SELECTION |
| Lifecycle, deprecation and successor (`lifecycle, deprecatedReason, deprecatedAt, supersededBy`) | Whole-entry value, payload keys | FX-DIG-04, FX-DIG-E3 |
| Digest fields and evidence states (`digests` incl. DigestEvidence arms, binding digests) | Whole-entry value, payload keys | FX-DIG-E4 |
| Receipts, corpus, lineage, mappings, migrations, consumers, compatibility, visibility, linked tools, licence closure, coverage | Whole-entry value, payload keys | FX-DIG-E5 |
| Irrelevant: profile bytes changed without any entry field changing (impossible for a pinned entry: the pin digest field changes first); the digest itself | `entryDigest` is external, never self-embedded | FX-DIG-E6 (no self-reference; recompute and compare) |

### 7.3 Stability of existing bytes (no re-canonicalization)

Cataloguing must not re-canonicalize anything that already has an identity. Source: DOSSIER-ontology-guardian.md:371.

| Stability rule | Source |
|---|---|
| d2d artifacts keep their existing canonical bytes and digests as contentDigest; the catalog stores the digest and does not recompute it under a different canonicalization (no re-canonicalization by the catalog). | DOSSIER-ontology-guardian.md:371 |
| Engram profiles keep profile_hash as their content anchor. | DOSSIER-ontology-guardian.md:371 |
| Committed subgraphs, corpus manifests (profile-corpus-v1.0.0), sealed vectors and existing documents validate byte-identically before and after cataloguing. Verifiable form: for a fixed set of existing artifacts, recompute contentDigest before the move and after the move; any difference stops the lot. | DOSSIER-ontology-guardian.md:371, DOSSIER-ontology-guardian.md:494 |
| pinsDigest, resultDigest and entryDigest are new values computed about the existing bytes; computing them never modifies the bytes they describe. | DOSSIER-ontology-guardian.md:371 |
| Deprecation changes entryDigest only: contentDigest, pinsDigest and resultDigest stay equal across a deprecation (see §1.5). | DOSSIER-ontology-guardian.md:245, DOSSIER-ontology-guardian.md:369 |
| The byte-identical gate for generic@1 documents, fixtures and h2a dossier-builder output holds before and after any transfer; any difference stops the transfer lot. Byte identity is one control among the full set (digest stability, corpora with every receipt, consumer revalidation, mixed-journal fixtures, announcements, re-pinning rollback); no single control discharges the transfer. | DOSSIER-ontology-guardian.md:494, DOSSIER-ontology-guardian.md:603 |

Identity rules that complete this contract. Identity is (kind, id, entryVersion) for catalog records and (namespace, id, version) for ontologies. Every version is immutable once published. Unknown versions, digests or majors refuse, with no fallback to latest anywhere. Source: DOSSIER-ontology-guardian.md:358, DOSSIER-ontology-guardian.md:359, DOSSIER-ontology-guardian.md:360.

## 8. Conformance-fixture inventory (per property and per conflict family)

How to read this inventory. A claim is verifiable only if a named fixture or command output decides it (exit status, diagnostic code, digest equality, corpus receipt). Source: DOSSIER-ontology-guardian.md:211. Each fixture below names the observable that decides it. Fixture identifiers are G0 inventory identifiers; the behaviour they check is the dossier row cited. A fixture that cannot be decided by one of those observables does not qualify. Lot G3 requires, for stack, derive and merge, a failing-then-passing fixture per conflict class, plus the digest and deprecation fixtures and the no-silent-loss regression fixture. Source: DOSSIER-ontology-guardian.md:520.

### 8.1 Manageable fixtures (FX-MNG)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-MNG-DIA | DIA | Publish creates an immutable (id, version) with applicable digests; deprecate keeps the version resolvable with the deprecation record, contentDigest, pinsDigest and resultDigest unchanged and entryDigest changed; publish then get returns identical bytes | DOSSIER-ontology-guardian.md:234 |
| FX-MNG-MECH | MECH | A pinned descriptor or mechanism version registers with its digest; consumers keep resolving deprecated pins; contentDigest and pinsDigest recompute equal after deprecation, entryDigest changed | DOSSIER-ontology-guardian.md:235 |
| FX-MNG-D2D | D2D | Tenant-scoped publish and deprecate record existence, lifecycle and stack only; tenant-authorized get returns digest plus stack, public get returns deny-as-missing | DOSSIER-ontology-guardian.md:236 |
| FX-MNG-ENG | ENG | Normalized profile plus profile_hash registers; profile self-validation is green, then get by version returns the normalized bytes | DOSSIER-ontology-guardian.md:237 |
| FX-MNG-TRK | TRK | A versioned vocabulary record plus mapping file registers; a legacy journal folds identically before and after deprecation | DOSSIER-ontology-guardian.md:238 |
| FX-MNG-H2A | H2A | A versioned protocol-vocabulary record registers with wire values preserved as facts; replay of a recorded journal and envelope corpus succeeds on the deprecated version | DOSSIER-ontology-guardian.md:239 |
| FX-MNG-HRN | HRN | A versioned method-vocabulary record registers with the two VerificationRun types separately typed; scope and acceptance adapter fixtures pass on old and new versions | DOSSIER-ontology-guardian.md:240 |
| FX-MNG-RPK | RPK | The manifest binds profile version plus service revision plus export digests and the chain verifies; a deprecated export reads with its staleness stamp | DOSSIER-ontology-guardian.md:241 |
| FX-MNG-MEM | MEM | A versioned family descriptor registers with journal records untouched; recall and reconciliation fixtures pass with the deprecated family still resolvable | DOSSIER-ontology-guardian.md:242 |
| FX-MNG-EXT | EXT | A qualified pack with provenance and coverage record registers; the recomputed transitive licence closure contains only MIT, Apache-2.0, CC0 | DOSSIER-ontology-guardian.md:243 |

Refusal fixtures for this property are the §1.7 codes exercised per family (red self-validation, red corpus, missing licence closure, missing owner, not-published, pin deletion). Source: DOSSIER-ontology-guardian.md:234, DOSSIER-ontology-guardian.md:235, DOSSIER-ontology-guardian.md:236, DOSSIER-ontology-guardian.md:237, DOSSIER-ontology-guardian.md:238, DOSSIER-ontology-guardian.md:239, DOSSIER-ontology-guardian.md:240, DOSSIER-ontology-guardian.md:241, DOSSIER-ontology-guardian.md:242, DOSSIER-ontology-guardian.md:243.

### 8.2 Stackable fixtures (FX-STK)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-STK-DIA | DIA | Effective diagram profile bytes with distinct pinsDigest and resultDigest; a document valid under the stack validates; removing a parent layer changes pinsDigest and the resolved bytes | DOSSIER-ontology-guardian.md:255 |
| FX-STK-MECH | MECH | Effective mechanism descriptor set with pins; the compatibility matrix cell (mechanism by profile by document) yields its single error code or pass | DOSSIER-ontology-guardian.md:256 |
| FX-STK-D2D | D2D | d2d-side: byte-identical effective bytes for identical pins. Guardian-side: resolve of a private stack returns pins plus receipts and no content field | DOSSIER-ontology-guardian.md:257 |
| FX-STK-ENG | ENG | Effective NormalizedOntologyProfile with distinct pinsDigest and resultDigest; extraction valid under the stack is accepted and a type added only by the child resolves | DOSSIER-ontology-guardian.md:258 |
| FX-STK-TRK | TRK | compose is absent from the TRK surface; requesting stack composition returns operation-not-applicable; versioning goes through Manageable plus explicit mappings | DOSSIER-ontology-guardian.md:259 |
| FX-STK-H2A | H2A | Mixed-version replay uses per-version decoders; composing two protocol versions returns operation-not-applicable | DOSSIER-ontology-guardian.md:260 |
| FX-STK-HRN | HRN | Effective check set with declared order; harness check fixtures pass against the effective set | DOSSIER-ontology-guardian.md:261 |
| FX-STK-RPK | RPK | One effective profile; both cross-domain relations (job to timing, CI to architecture) validate inside it; source counts stay per representation (66 jobs, 171 needs links, 43 roots, 72 pairs) | DOSSIER-ontology-guardian.md:262 |
| FX-STK-MEM | MEM | Two families reconcile without an effective merged family; stacking to manufacture agreement returns operation-not-applicable | DOSSIER-ontology-guardian.md:263 |
| FX-STK-EXT | EXT | Effective profile with distinct pinsDigest and resultDigest and licence closure recomputed over the stack; derived stack validates the corpus fixtures of each layer | DOSSIER-ontology-guardian.md:264 |
| FX-STK-DIG | All (digest link) | pinsDigest differs from resultDigest as values computed by distinct procedures (legitimately equal values are not rejected; substitution of one for the other fails); recomputing the same pins reproduces the same resultDigest | DOSSIER-ontology-guardian.md:362, DOSSIER-ontology-guardian.md:520 |

Refusal fixtures for this property are the §2.4 codes exercised per family (parent-type-removal, cardinality-widening, attribute-redeclaration, endpoint-without-join, unpinned-parent, digest-mismatch, unregistered-dialect, gate-weakening, excluded-dependency, severity-conflict, parent-rule-removal, duplicate-pin). Source: DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:256, DOSSIER-ontology-guardian.md:257, DOSSIER-ontology-guardian.md:258, DOSSIER-ontology-guardian.md:261, DOSSIER-ontology-guardian.md:264.

### 8.3 Applicable fixtures (FX-APP)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-APP-DIA | DIA | Receipt names the role actually executed (transitional oracle before qualification, qualified DS execution as reference once qualified, with no switch before the parity gates); the nine rejected cases yield their asserted diagnostics; deleting an occurrence changes no entity | DOSSIER-ontology-guardian.md:274 |
| FX-APP-MECH | MECH | Compatibility verdict with one error code per matrix cell and Report/2 diagnostics with RFC 6901 provenance; the parity corpus (198 files) passes per library as oracle witness during transition | DOSSIER-ontology-guardian.md:275 |
| FX-APP-D2D | D2D | d2d receipt (verdict plus diagnostics class) naming the role actually executed; guardian stores the receipt reference only; d2d import of the parity corpus yields byte-identical normalized output | DOSSIER-ontology-guardian.md:276 |
| FX-APP-ENG | ENG | validateProfileExtraction receipt (severity-graded); unknown node or relation type yields its diagnostic and registry record existence is checked; apply previews binding plus stale artifacts | DOSSIER-ontology-guardian.md:277 |
| FX-APP-TRK | TRK | Fold and report reproduce under the pinned vocabulary with baseline-relative buckets; fold of a mixed legacy and new journal yields identical buckets | DOSSIER-ontology-guardian.md:278 |
| FX-APP-H2A | H2A | Recorded envelope corpus replays green on its pinned version | DOSSIER-ontology-guardian.md:279 |
| FX-APP-HRN | HRN | A VerificationRun path failure produces no realization transition | DOSSIER-ontology-guardian.md:280 |
| FX-APP-RPK | RPK | Subgraph validates inside the single profile; per-representation counts asserted separately; a hand-edited subgraph fails the provenance check | DOSSIER-ontology-guardian.md:281 |
| FX-APP-MEM | MEM | Descriptor fixture passes without any journal access | DOSSIER-ontology-guardian.md:282 |
| FX-APP-EXT | EXT | Corpus outside declared coverage yields preserved-unvalidated or a coverage diagnostic, never a silent pass; at most skeleton reliance for a skeleton-admitted pack whose required receipts are present | DOSSIER-ontology-guardian.md:283 |

Refusal fixtures for this property are §6.4 (mutation through validate, floating pin, settlement by receipt, delegation presented as reference, MCP in a runtime path, provenance mismatch, NM numeric claim, memory admission by ontology operation). Source: DOSSIER-ontology-guardian.md:274, DOSSIER-ontology-guardian.md:275, DOSSIER-ontology-guardian.md:276, DOSSIER-ontology-guardian.md:277, DOSSIER-ontology-guardian.md:278, DOSSIER-ontology-guardian.md:280, DOSSIER-ontology-guardian.md:281, DOSSIER-ontology-guardian.md:282, DOSSIER-ontology-guardian.md:283.

### 8.4 Mergeable fixtures (FX-MRG)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-MRG-DIA | DIA | Merged candidate profile plus mapping file; every collision listed with its diagnostic; two profiles declaring the same type id differently yield the named collision diagnostic, then pass with a mapping | DOSSIER-ontology-guardian.md:293 |
| FX-MRG-MECH | MECH | Compatibility verdict plus per-descriptor mapping; merging two pinned descriptor sets reproduces the matrix verdicts deterministically | DOSSIER-ontology-guardian.md:294 |
| FX-MRG-D2D | D2D | d2d merged candidate plus loss report where applicable; guardian records digests only | DOSSIER-ontology-guardian.md:295 |
| FX-MRG-ENG | ENG | Merged profile candidate with registry bindings and hierarchies checked; relation endpoint incompatibility yields its diagnostic before any candidate exists | DOSSIER-ontology-guardian.md:296 |
| FX-MRG-TRK | TRK | Reconciled meaning table (term to term, kept distinct where homonymous); bug versus promotion-only defect stays distinct after reconciliation | DOSSIER-ontology-guardian.md:297 |
| FX-MRG-H2A | H2A | Term mapping with wire facts preserved; the plural AGENTS value maps as a wire value, never corrected | DOSSIER-ontology-guardian.md:298 |
| FX-MRG-HRN | HRN | Merged candidate with gate-weakening conflicts listed; a merge that would drop a gate yields its diagnostic | DOSSIER-ontology-guardian.md:299 |
| FX-MRG-RPK | RPK | Regenerated subgraph from merged sources; adapter counts checked for conservation of relations, never equality with source counts | DOSSIER-ontology-guardian.md:300 |
| FX-MRG-MEM | MEM | Conflicting occurrences yield a proposal (contradicts, supersedes, needs_adjudication), never a merged record | DOSSIER-ontology-guardian.md:301 |
| FX-MRG-EXT | EXT | Merged candidate plus mapping with licence closure recomputed; merged closure still within the whitelist | DOSSIER-ontology-guardian.md:302 |
| FX-MRG-REG | All (regression) | Profile merge never falls back to instance-merge attribute overwrite: a colliding profile attribute without a mapping entry refuses instead of being silently replaced by a later input | DOSSIER-ontology-guardian.md:520, DOSSIER-ontology-guardian.md:708 |

### 8.5 Derivable fixtures (FX-DER)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-DER-DIA | DIA | C4 candidate profile plus lineage; inherited generic@1 fixtures pass or are retired with reasons; C4 documents validate and base fixtures stay green | DOSSIER-ontology-guardian.md:312 |
| FX-DER-MECH | MECH | Migration registry entry tied to the exact source package; a known source migrates, an unknown source yields profile-source-unavailable | DOSSIER-ontology-guardian.md:313 |
| FX-DER-D2D | D2D | Derived private profile inside d2d; derived bytes reproducible from pins plus delta (d2d-side); guardian records lineage digests only | DOSSIER-ontology-guardian.md:314 |
| FX-DER-ENG | ENG | Derived profile candidate with class-hierarchy parents recorded and cycle detachment preserved; derived extraction validates; a delta creating a hierarchy cycle is detached and reported | DOSSIER-ontology-guardian.md:315 |
| FX-DER-TRK | TRK | New version record with old journals still folding; fold equality on a legacy journal under old and mapped-new vocabularies | DOSSIER-ontology-guardian.md:316 |
| FX-DER-H2A | H2A | Versioned successor with replay per version; cross-version replay corpus green | DOSSIER-ontology-guardian.md:317 |
| FX-DER-HRN | HRN | Specialized check set with lineage and core gates intact; specialized set passes core fixtures | DOSSIER-ontology-guardian.md:318 |
| FX-DER-RPK | RPK | New profile version with subgraphs regenerated under it; regenerated subgraphs validate and a timing module delta leaves CI counts unchanged | DOSSIER-ontology-guardian.md:319 |
| FX-DER-MEM | MEM | New descriptor version with occurrence keys and comparators versioned with it; reconciliation fixtures pass per version | DOSSIER-ontology-guardian.md:320 |
| FX-DER-EXT | EXT | Derived pack plus lineage plus recomputed licence closure plus coverage record; each inherited corpus fixture passes or is retired with a reason | DOSSIER-ontology-guardian.md:321 |

### 8.6 Catalogued fixtures (FX-CAT)

| Id | Family | Expected observable (decides pass) | Source |
|---|---|---|---|
| FX-CAT-DIA | DIA | Entry with artifactKind profile or base, applicable digests, corpus reference plus receipts; catalog inspection loads zero ontology code; packed entry validates and get by pin returns identical digests | DOSSIER-ontology-guardian.md:344 |
| FX-CAT-MECH | MECH | Entries for descriptor, mechanism, corpus and contract pins with compatibility verdicts; corpus manifest digest recomputes equal | DOSSIER-ontology-guardian.md:345 |
| FX-CAT-D2D | D2D | Tenant-scoped entries (mechanism, base, profile, theme, corpus, contract) with digests plus stack plus every required receipt; cross-tenant list shows nothing | DOSSIER-ontology-guardian.md:346 |
| FX-CAT-ENG | ENG | Entry per profile version with entity-registry references distinct from the entry registry; entry validation distinguishes the two registry meanings | DOSSIER-ontology-guardian.md:347 |
| FX-CAT-TRK | TRK | Entry with vocabulary version, mapping references, consumers and validators; entry digest verifies and journal files are never entry assets | DOSSIER-ontology-guardian.md:348 |
| FX-CAT-H2A | H2A | Entry per protocol vocabulary version with source commit; get returns the pinned version record | DOSSIER-ontology-guardian.md:349 |
| FX-CAT-HRN | HRN | Entry per method vocabulary version; adapter fixtures referenced from the entry pass | DOSSIER-ontology-guardian.md:350 |
| FX-CAT-RPK | RPK | Profile entry plus export entries bound by the manifest (service revision plus digests); manifest chain verifies end to end | DOSSIER-ontology-guardian.md:351 |
| FX-CAT-MEM | MEM | Entry per family descriptor version with descriptors only and no record data | DOSSIER-ontology-guardian.md:352 |
| FX-CAT-EXT | EXT | Entry with provenance, coverage record and licence closure; closure recomputation matches the entry | DOSSIER-ontology-guardian.md:353 |
| FX-CAT-GATE | MECH, D2D, generated-BPMN DIA | Removing any one required receipt (one library receipt, the corpus receipt, or the bijection evidence) flips admission to missing-receipt at every completeness value, including skeleton; restoring it restores admission. No weaker admission exists. | DOSSIER-ontology-guardian.md:340 |
| FX-CAT-PUB | All (publisher, zero-load) | Packed tarball entry validated from its manifest alone: asset digests recompute equal, `entryDigest` verifies externally, and `register` plus `catalog()` complete with zero ontology code loaded, zero provider import evaluated and zero loader thunk invoked; any load during the fixture fails it | [R9:§3.2], DOSSIER-ontology-guardian.md:518 |
| FX-CAT-SELECTION | Public rule-sheet entries (BPMN and non-BPMN `family-corpus`), with private-vector scope control | Round-trip the §5.3 mapping, preserving all native selected settings (including numeric severity, classification/options and optional-field presence), effective severity and study disposition. Run two independent mutations with pins and rule bodies held fixed: (a) selected severity `warn` → `error`; (b) readiness policy `draft` → `accept` with settings unchanged. Each is visible in `ruleSheets[].selections`, changes the SHA-256 of canonical `{phase, readinessPolicy, settings}`, the applicable receipt policy digest (`proofBindings` for BPMN, root for `family-corpus`), public P-RESULT `resultDigest`, and whole-entry `entryDigest`; mutation (a) also changes `ruleVerdicts[].severity`. `contentDigest` and P-PINS `pinsDigest` remain identical. Keeping an old receipt severity/policy digest refuses admission, including if result evidence matches; dropping study disposition or an optional native setting fails the lossless round trip. With no rule sheet, each non-BPMN arm carries `severityPolicyDigest: null`, empty verdicts where defined, and no BPMN proof fields. Private scope control: V-OWNER-0a → 0b changes receipt selection digest/severity only, with E0/resultDigest unchanged; V-OWNER-0a → 1 changes the stored row and owner result digest. No private selection settings enter the payload. | [S:422], [S:353], [D:340], [D:367–369], [BC@63a9258:src/profile/lint-contracts.ts:14–18,46–83], §§5.3/5.5/7.2 |
| FX-RCPT-FAIL | MECH, D2D, generated-BPMN DIA | A required receipt with `verdict: fail` refuses admission with the same observable as a missing receipt (candidate stays a draft outside the catalog) at every completeness value, including skeleton; no entry is registered | DOSSIER-ontology-guardian.md:340 |
| FX-RCPT-MISMATCH | MECH, D2D, DIA, ENG, TRK | A passing receipt whose `evaluatedStack` (stack order, `pinsDigest` or resolved `resultDigest`) or arm proof fields (proof set, corpus authority, profile pin, severity-policy digest, rule-sheet pins, fixture digest) do not match the entry pins refuses admission; a receipt naming `transitional-oracle` where the gate requires the reference, claiming `qualified-ds-execution` without `reference-qualified` evidence, or covering the wrong proof set (published corpus versus local expectations), refuses identically | STUDY-conformance-by-graph-composition.md:162, STUDY-conformance-by-graph-composition.md:449 |
| FX-RCPT-ARMS | DIA, ENG, TRK, H2A, HRN, RPK, MEM, EXT | `family-corpus` admits only its listed families; `h2a-vocabulary` admits H2A replay of a recorded corpus on its source-commit-pinned protocol version; `mem-descriptor` admits descriptor conformance with zero journal access and no memory-record data. Each uses resolved matching evaluated results; none requires BPMN proofs. Wrong family, runtime H2A state, memory record data, BPMN proof fields in these arms, or a family receipt substituted for MECH/D2D parity refuses. | [D:279], [D:282], [D:340], [D:349], [D:352] |
| FX-RCPT-UNRESOLVED | Every Receipt arm, including private-reference, H2A and MEM | Start from a passing, matching required receipt. Replace only `evaluatedStack.resultEvidence` by `{evidenceState: unresolved}`: admission refuses with `missing-receipt`, even though `verdict: pass` and all pins match. An unresolved entry with a resolved receipt, and two unresolved arms, also refuse. Restore both resolved equal digests: the evidence gate passes. A digest added to an unresolved arm fails schema closure. | [D:230], [D:335], [D:340], §5.5 |
| FX-COMPILED-01 | BPMN evidence | All seven S-COMPILED fields round-trip, including top-level nonempty `bindings` independently from per-rule `bindings`. Native compiled-rule `options` refuses; an inherited Setting’s permitted `options` is preserved and changes `severityPolicyDigest`. For private evidence the guardian sees only `ownerReceiptRef`, pins and digests; full native field equality is checked owner-side. | [BC@63a9258:src/profile/lint-contracts.ts:8–12], [BC@63a9258:src/profile/lint-contracts.ts:46–95], [D:236] |
| FX-DIAG-01 | MECH, D2D (native Report/2 round trip) | Use a native-valid Report with entries whose native stage order differs from G0 code order; include `warn`, a reachable loss entry with `lossClass`, `disposition: dropped`, distinct source/result, before/after values, all optionals, raw findings, sorted idMap and artifact indexes. Enrich and permute only the separate diagnostics. Invert by `reportEntryIndex`: the complete canonical native Report is identical, including entry order and artifact links. Extra G0 fields inside native entries, re-sorting native entries, lost optionals, duplicate/missing indexes or native severity/disposition rewrites fail. | [BC@63a9258:src/profile/report.ts:11–112], [S:345], §§2.1.1/6.2 |
| FX-DIAG-02 | MECH, D2D (native predicates) | Both unavailable tree Coordinates in §2.1.0 validate natively; `domain: none` with a target id refuses. `lintSummary` on error entries with dispositions corrected/dropped/mapped gives `ok: true, counts: {info:0,warn:0,error:0}`; each observed/refused error gives `ok: false, error:1`; warn/info counts remain in their native buckets. G0 and the application receipt preserve these outcomes. | [BC@63a9258:src/profile/report.ts:30–39], [BC@63a9258:src/profile/lint-contracts.ts:94–96] |
| FX-LINEAGE-01 | D2D (private reference/result mapping) | The §3.1 private result record projects to the exact `PrivateDerivationRef` in the single `PrivateLineage` of §§1.4/5.3; enclosing `digests` equals its `resultingDigests`. Reconstituting by §1.3 preserves every field and optional mapping presence. A different enclosing digest refuses; inline operations or bodies refuse; an unresolved draft round-trips but fails publication/admission (§5.5). | [D:236], [D:308], [D:327], §1.3 |
| FX-MAP-01 | All (typed resolutions) | A merge differing only in cardinality refuses without a `cardinality` entry and merges carrying exactly `chosenMin..chosenMax` with one; tree-versus-dag refuses without a `hierarchy` entry and merges with its `chosenShape`/`parentRole`/`childRole`; a severity divergence refuses without a `severity` entry and resolves to exactly `chosenSeverity`; a bare `{from, kind, to}` entry for any of the three refuses at qualification | DOSSIER-ontology-guardian.md:289, STUDY-conformance-by-graph-composition.md:353 |
| FX-RCPT-NOTEVAL | MECH (N2) | A required rule at `not-evaluated` (DI projection absent) never satisfies admission or a parity claim: the entry refuses exactly as with a missing receipt, and the rule's parity stays `open`; recording it as `pass` fails the fixture | STUDY-conformance-by-graph-composition.md:326 |
| FX-THM-01 | DIA, D2D (theme invariance) | Applying a separately pinned theme, then removing it, leaves the styled profile and E byte-identical (including the native `themes` and `ui` sections); it changes presentation state only. Every styled-profile semantic digest stays byte-identical: `contentDigest`, `pinsDigest` and `resultDigest` before theme application equal the same digests after application and after removal; only presentation state differs. Editing the native document’s `themes`/`ui` sections is a different mutation and changes the owner content/result digest; dropping those sections during hashing fails the fixture. Any styled-profile semantic digest change during mere theme application fails the fixture. | DOSSIER-ontology-guardian.md:336 |
| FX-DIG-01 | All (composition-rule-only change) | Holding every pin byte-identical and changing only a composition rule: `pinsDigest` is unchanged (same P-PINS bytes) and `resultDigest` changes (different P-RESULT bytes). Substituting one digest for the other, or leaving `resultDigest` unchanged, fails the fixture. | DOSSIER-ontology-guardian.md:362, DOSSIER-ontology-guardian.md:368 |
| FX-DIG-02 | All (byte stability before/after cataloguing) | For a fixed set of existing artifacts (d2d `profile-c14n/2` bytes, engram `profile_hash` anchors, corpus manifest, sealed vectors, `generic@1` documents): `contentDigest` recomputed before cataloguing equals `contentDigest` after cataloguing, byte for byte; `pinsDigest`, `resultDigest` and `entryDigest` are new values computed about the bytes and modify no described byte. Any `contentDigest` difference stops the lot. | DOSSIER-ontology-guardian.md:371, DOSSIER-ontology-guardian.md:494 |
| FX-DIG-03 | All (canonical vectors) | Each §7.2 vector (V-PINS-1, V-DIAGRAM-1, V-MAPPING-1, V-DELTA-1) recomputes from its exact bytes to its frozen SHA-256; a single-byte change (key order, whitespace, placeholder digest digit) changes the digest and fails the vector check | §7.2 (P-PINS, P-CONTENT-DIAGRAM, P-MAPPING, P-DELTA) |
| FX-DIG-04 | All (deprecation stability) | Deprecation leaves the profile bytes untouched: `contentDigest`, `pinsDigest` and `resultDigest` before deprecation equal the same digests after deprecation, byte for byte, while `entryDigest` changes; a deprecation leaving `entryDigest` unchanged fails qualification | DOSSIER-ontology-guardian.md:245, DOSSIER-ontology-guardian.md:369 |
| FX-DIG-C1 | DIA (content: identity) | Changing only `profile` (`name@major`) or only `completeness` changes `contentDigest`; no other digest is consulted | §7.4 |
| FX-DIG-C2 | DIA (content: entity types) | Changing one entity type (id, attribute schema or `abstract`) changes `contentDigest` | §7.4 |
| FX-DIG-C3 | DIA (content: port types) | Changing one port type declaration changes `contentDigest` | §7.4 |
| FX-DIG-C4 | DIA (content: relation types) | Changing one role `min`/`max`, one endpoint target or one hierarchy shape changes `contentDigest` | §7.4 |
| FX-DIG-C5 | DIA (content: constraints) | Changing one constraint (kind, target or bound) changes `contentDigest` | §7.4 |
| FX-DIG-C6 | DIA (content: limits and omission) | Changing one declared limit changes `contentDigest`; omitting a declared limit (hashed `null`) changes it again; the three pinned skeletons hash with `maxEntities: null, maxRelations: null` and qualify | §7.4, [DS] `packages/diagram-core/src/profiles/skeletons.ts:104` at `25c0f3d3` |
| FX-DIG-C7 | DIA (content: irrelevant) | Changing only `notes`, a theme id/token, a catalog field or the file path leaves `contentDigest` unchanged | §7.4 |
| FX-DIG-P1 | All (pins: layer pins) | Changing one layer pin field (`id`, `version` or `contentDigest`) changes `pinsDigest` | §7.4 |
| FX-DIG-P2 | All (pins: order) | Reordering two layers changes `pinsDigest` and the resolved bytes | §7.4 |
| FX-DIG-P3 | All (pins: rule sheets) | Changing one rule-sheet pin or the composed sheet order changes `pinsDigest` | §7.4 |
| FX-DIG-P4 | All (pins: delta) | Changing the delta base pin, one operation payload (single-value declaration), the operation order, or one retired fixture/rule reason changes `deltaDigest` and therefore `pinsDigest`; a one-type `add` delta encodes without any whole-profile value | §7.4 |
| FX-DIG-P5 | All (pins: mapping) | Changing one typed mapping field (`chosenMin`, `chosenShape`, `chosenSeverity`, `from`, `to`), the entry order, `mappingId` or `version` changes the mapping digest and therefore `pinsDigest` | §7.4 |
| FX-DIG-P6 | All (pins: irrelevant and drift) | Applying a theme leaves `pinsDigest` unchanged; presenting changed bytes behind an unchanged pin refuses with `digest-mismatch` instead of producing a new `pinsDigest` | §7.4 |
| FX-DIG-R1 | All (result: declarations) | Changing one effective declaration (type, cardinality, hierarchy, constraint or limit) with pins held identical changes `resultDigest` | §7.4 |
| FX-DIG-R2 | All (result: rule bodies) | Changing only a pattern inside one effective rule's `select`/`assert` (same `ruleId`, same severity, same pins; owner scope: same change inside the c14n `rules` bytes) changes `resultDigest`; leaving it unchanged fails the fixture | §7.4, §7.2 P-RESULT |
| FX-DIG-R3 | All (result: severity) | Public P-RESULT: changing an effective severity/classification or the policy selection changes `resultDigest`. Owner P-RESULT: changing a stored `validation` row in E changes `resultDigest`; changing only the external selector changes effective severity and `severityPolicyDigest` but leaves E and `resultDigest` unchanged. The four V-OWNER vectors in §7.2 decide both cases; any owner-selector wrapper or `themes`/`ui` deletion fails | §7.4 |
| FX-DIG-R4 | All (result: composition only) | Same as FX-DIG-01: pins identical, composition rule changed, `pinsDigest` unchanged and `resultDigest` changed | §7.4 |
| FX-DIG-OWNER | D2D (complete native owner bytes) | E0 includes `$schema` and every S-D2DC14N section. Mutating each field/section in turn changes its owner content/result digest; specifically, deleting empty `themes` or `ui` changes it and is not a permitted projection. Mutating an effective rule body changes the whole-document digest; all full bodies stay owner-side. Merely changing the external selector or applying a separate theme with E unchanged does not change it. | [D:366–371], [BC@63a9258:src/profile/envelope.ts:26–42], §7.2 V-OWNER |
| FX-DIG-R5 | All (result: irrelevant) | Changing only catalog metadata (owner, consumers) with the effective result held identical leaves `resultDigest` unchanged (and changes `entryDigest` instead) | §7.4 |
| FX-DIG-E1 | All (entry: envelope) | Changing one envelope field (`name`, `entryVersion`, one asset digest) changes `entryDigest` | §7.4 |
| FX-DIG-E2 | All (entry: payload pins) | Changing `profilePin`, one `stack` pin or `owner` changes `entryDigest` | §7.4 |
| FX-DIG-E3 | All (entry: lifecycle) | Deprecating (reason, date, known successor) changes `entryDigest` with the three content digests unchanged (FX-DIG-04 decides the digest side) | §7.4 |
| FX-DIG-E4 | All (entry: digest evidence) | Flipping `resultEvidence` from `unresolved` to `resolved`, or changing one binding digest, changes `entryDigest`; an unresolved arm carrying a digest value fails qualification | §7.4, §1.3 |
| FX-DIG-E5 | All (entry: receipts and lineage) | Adding one required receipt, one mapping reference or one consumer changes `entryDigest` | §7.4 |
| FX-DIG-E6 | All (entry: externality) | `entryDigest` never appears inside the entry it digests; recomputing over the entry with the digest field hypothetically inserted never verifies | §7.4, [R9:§8] |

Concrete selection inputs for **FX-CAT-SELECTION** (same fixture, two independent mutations). Each setting is exactly `{ "classification": "readiness", "rule": "label-required", "severity": <cell below> }`; the complete `settings` array contains that one setting, `phase` stays `import`, and the native canonical digest hashes `{phase, readinessPolicy, settings}`. The `warn` baseline is the existing V-OWNER-0a selection; the severity-only case is V-OWNER-1's selection. The policy-only case selects `accept` with the baseline settings unchanged; it is independent of V-OWNER-0b, whose settings also change. These values were recomputed using the pinned native functions; they add no new serialization or rule body. Sources: [S:422], [S:353], [BC@63a9258:src/profile/canonical.ts:23–73], [BC@63a9258:src/profile/lint-contracts.ts:14–18,46–83].

| FX-CAT-SELECTION case | readinessPolicy | Setting / effective severity | Expected severityPolicyDigest |
|---|---|---|---|
| Baseline | `draft` | `warn` / `warn` | `f4fe529257140570caa80653a2c33b55d942f8ede92a8a03d6dc8e048f1fb7db` |
| Severity only | `draft` | `error` / `error` | `8eaf5e7eb8909c547f0f55c4fd8f3f65f14951ad9e079ef8bef851bdbe0ca655` |
| Policy only, identical settings | `accept` | `warn` / `warn` | `935a32b0f48e494e4e0226473703404562f8cbed025bddd73c2a1c1b5d3927f8` |

### 8.7 Fixtures per conflict family (failing, then passing; required by lot G3)

Each row is run twice: first without the mapping or correction (the named diagnostic must appear and no candidate bytes may be produced), then with the reviewed mapping or correction (the same inputs must compose, derive or merge). Source for the failing-then-passing requirement: DOSSIER-ontology-guardian.md:520.

| Id | Conflict family (G0 code, §4.2 or §§2–3) | Failing observable | Passing observable | Source |
|---|---|---|---|---|
| FX-CF-01 | type-id-collision | merge_preview on two profiles declaring the same type id differently returns type-id-collision and no candidate | Same inputs plus a mapping entry for that type merge to a candidate | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:293 |
| FX-CF-02 | relation-endpoint-incompatible | merge_preview returns relation-endpoint-incompatible before any candidate exists | Same inputs plus an endpoint mapping merge to a candidate with bindings checked | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:296 |
| FX-CF-03 | cardinality-conflict | Inputs declaring different cardinalities for the same role without a mapping decision return cardinality-conflict, including a pure-narrowing versus pure-widening pair (merge); a widening child returns cardinality-widening (stack, derive) | Same inputs plus one reviewed mapping decision for that role merge to a candidate carrying the mapped cardinality; a narrowing-only child composes or derives without a mapping | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:251 |
| FX-CF-04 | hierarchy-shape-conflict | Tree versus dag over the same relation returns hierarchy-shape-conflict | A single declared shape under the mapping merges | DOSSIER-ontology-guardian.md:289 |
| FX-CF-05 | attribute-redefinition (merge) and attribute-redeclaration (stack, derive) | Redefinition or redeclaration returns the named diagnostic | Additive refinement without redeclaration composes, derives or merges | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:312 |
| FX-CF-06 | status-vocabulary-divergence | Divergent status vocabularies return status-vocabulary-divergence | Vocabularies reconciled by an explicit mapping (kept distinct where homonymous) merge as reconciliation | DOSSIER-ontology-guardian.md:289, DOSSIER-ontology-guardian.md:297 |
| FX-CF-07 | parent-type-removal (stack) | A child removing a parent type returns parent-type-removal | An additive child composes to effective bytes | DOSSIER-ontology-guardian.md:251, DOSSIER-ontology-guardian.md:255 |
| FX-CF-08 | endpoint-without-join (stack) | A cross-profile endpoint without a join returns endpoint-without-join | The same relations validate inside one profile with modules (repo-knowledge@1 form) | DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:262 |
| FX-CF-09 | gate-weakening (stack, derive, merge) | A layer, specialization or merge weakening a gate returns gate-weakening | A gate-preserving composition, derivation or merge passes the core fixtures | DOSSIER-ontology-guardian.md:261, DOSSIER-ontology-guardian.md:299, DOSSIER-ontology-guardian.md:318 |
| FX-CF-10 | unmapped-rename (derive) | A rename without a mapping returns unmapped-rename | rename-with-mapping keeps the old name decodable and the legacy fold equal | DOSSIER-ontology-guardian.md:315, DOSSIER-ontology-guardian.md:316 |
| FX-CF-11 | severity-conflict (stack, derive, merge) | Two layers, a delta, or two merge inputs assigning different effective severities to the same rule id at the same selection return severity-conflict and no candidate bytes | A narrowing-only severity resolution, or one reviewed mapping decision for that rule id, composes, derives or merges with the resolved severity recorded in the effective rule set | STUDY-conformance-by-graph-composition.md:353 |
| FX-CF-12 | hierarchy-cycle-detached (success with reporting) | Not a failing case: a delta creating a hierarchy cycle returns `outcome: ok` with a severity-info `hierarchy-cycle-detached` diagnostic naming the detached members; treating the non-empty diagnostics array as failure fails this fixture | The derived candidate exists, the cycle members are detached, and the diagnostic path names the closing members | DOSSIER-ontology-guardian.md:91, DOSSIER-ontology-guardian.md:315 |

Digest and lifecycle fixtures that G3 also requires (stated once, checked here): pinsDigest differs from resultDigest as distinct procedures; deprecation leaves contentDigest, pinsDigest and resultDigest unchanged and changes entryDigest; resolve returns effective bytes for non-private stacks and pins plus receipts without content for private stacks. Source: DOSSIER-ontology-guardian.md:520.

## 9. MCP call surface and registry integration (compatibility contract for G1)

This section freezes no new tool behaviour. It records the compatibility shape that the §5 payload must keep so that the catalog call tool can be registered at the sentropic registry like the memory tool, and so that G1 can consume the payload without redefinition. Implementation and qualification of the provider belong to lot G6; registration of the kind belongs to lot G1. Source: DOSSIER-ontology-guardian.md:518, DOSSIER-ontology-guardian.md:523, DOSSIER-ontology-guardian.md:551.

### 9.1 Provider identity and lazy entry (same standard as memory)

The owner requires an MCP call tool in the registry like for the memory. The memory precedent is exact: one publisher entry, one connector, frozen tool literals with closed schemas, a metadata-only manifest export, a pure lazy local definition whose loader is never evaluated by registration or catalog inspection, bounded parameters, immutable versions, disabled by default. The ontology provider mirrors that shape. Source: DOSSIER-ontology-guardian.md:551.

| Item | G0 freeze (proposed identities are frozen here as the G0/G1 contract; they are not claimed as existing exports) | Source |
|---|---|---|
| Publisher entry | (kind: mcp, id: sentropic.engram.ontology) | DOSSIER-ontology-guardian.md:553 |
| Connector | engram-ontology | DOSSIER-ontology-guardian.md:553 |
| Manifest export | Metadata-only registry entries file (format sentropic.registry-package/v1) exposed as ./registry/manifest in the engram package, alongside the ontology payloads | DOSSIER-ontology-guardian.md:553; memory precedent at SPEC-memory-mcp-v3.2.md:922, carried at DOSSIER-ontology-guardian.md:107 |
| Definition export | Pure lazy local definition shell exposed as ./registry/definitions; its loader is bound by trusted host code to a literal package export and is never invoked by register or catalog inspection | DOSSIER-ontology-guardian.md:553 |
| Projection | Manifests project as ontology entries (§5); invocation happens through linked tool entries | DOSSIER-ontology-guardian.md:553 |
| Lifecycle | register, then select, then configure, then compile, producing one immutable plan or diagnostics. Catalog inspection loads no ontology code; activation is explicit; a model cannot register, select or configure providers. Selection is empty by default; all tools are disabled by default, and a disabled installation loads no provider code. | DOSSIER-ontology-guardian.md:553, DOSSIER-ontology-guardian.md:573 |

Name collisions between the catalog-level provider and the existing per-repository reconciliation surface are refused at compile, never suffixed. The reconciliation tools remain the per-repository lifecycle surface; the new provider is the catalog-level surface. Source: DOSSIER-ontology-guardian.md:573.

### 9.2 Tools (frozen names and semantics; gates follow the memory pattern)

Names follow the memory convention. The set covers effective stacking and deprecation, which a smaller set would omit. Source: DOSSIER-ontology-guardian.md:557.

| Tool | Effect | Semantics (one line; full discipline in the cited row) | Source |
|---|---|---|---|
| engram_ontology_list | Read-only | Discover catalogued ontologies (id, version, completeness, owner, lifecycle, applicable digests, artifactKind). Deny-as-missing for unauthorized tenants. | DOSSIER-ontology-guardian.md:561 |
| engram_ontology_get | Read-only | Return one ontology record by pinned (id, version) or digest. Private entries carry pins, digests, stack and receipts only. Unknown pin refuses; never returns a floating version. | DOSSIER-ontology-guardian.md:562 |
| engram_ontology_resolve | Read-only | Resolve a pinned stack. Non-private: return the resulting effective ontology with distinct pinsDigest and resultDigest. Private: return pins, pinsDigest, stack, artifacts, corpus and receipts (plus an owner-supplied resultDigest where recorded), never effective bytes. TRK and H2A return the pinned version record and mappings; stacking them is operation-not-applicable. | DOSSIER-ontology-guardian.md:563 |
| engram_ontology_compose | Read-only | Effective stacking as a standalone operation (§2), without the catalog lookup. Private stacks refuse guardian-side composition; TRK and H2A return operation-not-applicable. | DOSSIER-ontology-guardian.md:564 |
| engram_ontology_validate | Read-only | Validate a target against a pinned ontology (or an effective profile from resolve or compose); return the §6 receipt, including preserved-unvalidated. Validator roles follow §6.3 with no switch before the parity gates (for d2d, no switch before lot 6 and its release GO). | DOSSIER-ontology-guardian.md:565 |
| engram_ontology_apply | Read-only by default | Preview application (§6.1). Private ontologies preview pins, digests and receipts only. Any write form uses the existing patch or transaction paths with dry-run default and explicit confirmation. | DOSSIER-ontology-guardian.md:566 |
| engram_ontology_derive | Mutation (proposal) | Produce a derived candidate (new version plus lineage plus digests) from a pinned base and a declared delta (§3). Publication is separate. | DOSSIER-ontology-guardian.md:567 |
| engram_ontology_merge_preview | Read-only | Compute merge diagnostics and a draft mapping for two pinned ontologies (§4). Publishes no merged bytes. | DOSSIER-ontology-guardian.md:568 |
| engram_ontology_merge | Mutation (proposal) | Publish a merged candidate plus mapping from a reviewed preview. Refuses on any unresolved conflict. | DOSSIER-ontology-guardian.md:569 |
| engram_ontology_deprecate | Mutation (proposal) | Record deprecation of a published version (reason, optional successor): lifecycle deprecated, other digests unchanged, entryDigest changed (§1.5). Never deletes bytes; the version stays resolvable by pin. Requires the publish-class human-confirmation gate. | DOSSIER-ontology-guardian.md:570 |
| engram_ontology_timing_get | Read-only | Return a pinned timing estimate or series by service revision plus export digest, with applicability status. This is a technical-record read, never a memory read; it never touches the frozen memory data shapes. Specified with the time lots; G0 freezes only its placement in this tool family. | DOSSIER-ontology-guardian.md:571, DOSSIER-ontology-guardian.md:407 |

Per-tool gates follow the memory pattern: each tool is an explicit tool literal with an exact invoke scope, required claims, closed input and output schemas, an external-effect declaration per tool, idempotency where mutation is possible, and elicitation or human confirmation on publish-class operations. Read tools and mutation tools are independently discoverable and independently authorized; enabling the provider does not grant all tools. Source: DOSSIER-ontology-guardian.md:573.

Relation to the d2d resolver proposal, without blurring scopes: for non-private stacks, resolve returns the effective ontology (a general tool shape that remains an explicit, limited divergence from the pins-only proposal); for private stacks the scoped exception is exactly the pins-only shape, hence no divergence there. Build-time vendoring is unaffected in both scopes: runtime paths never call this tool family. Source: DOSSIER-ontology-guardian.md:557, DOSSIER-ontology-guardian.md:674.

### 9.3 Consumption by G1 and hosts

Sentropic retains registry and catalog integration and host authorization; engram publishes entries and definitions; h2a inherits voluntarily through the mesh, as for memory. No credentials in entries; no entry grants authorization; invocation rechecks effective policy per call. Source: DOSSIER-ontology-guardian.md:580. The memory-first order stands and binds sequencing; ontology work does not delay memory. Source: DOSSIER-ontology-guardian.md:509, DOSSIER-ontology-guardian.md:158.

G1 exit evidence that this compatibility must preserve: a packed entry validates; catalog inspection loads zero ontology code; selection is explicit and empty by default; existing contentDigest values are unchanged. Source: DOSSIER-ontology-guardian.md:518. G6 exit evidence: packed discovery and invocation fixtures pass; resolve returns effective bytes for non-private stacks and pins plus receipts without content for private stacks; deprecate changes entryDigest with the other digests unchanged; zero load when disabled; no drift in the memory tools. Source: DOSSIER-ontology-guardian.md:523.

## 10. Questions — technical answers integrated, deferred questions assigned

G0 integrates the technical answers below as normative contract (they close the question for G0) and defers the remaining questions to their named owner without deciding them. An implementation that needs a deferred answer stops at the refusal already specified and records the gap; it does not fill the gap locally. No deferred question is decided in this section.

### 10.1 Technical answers integrated (closed in G0)

| Id | Question | G0 answer (normative; frozen where cited) | Source |
|---|---|---|---|
| Q-G0-3 | Cross-profile join for endpoint types declared across profiles | G0 has no cross-profile join. An endpoint type declared only in another profile refuses with `endpoint-without-join` (§2.4, §2.3 S-4). Cross-domain relations validate as modules inside one profile (the `repo-knowledge@1` form). A future join contract is outside G0 and changes nothing here until it exists. | DOSSIER-ontology-guardian.md:177, DOSSIER-ontology-guardian.md:255, DOSSIER-ontology-guardian.md:262 |
| Q-G0-4 | Registry final qualification and RC-6 | G0 has no RC-6 dependency: G0 freezes payload shapes only and qualifies nothing. Registry final qualification remains `unverified`; lot G1 requires registry and RC-6 closure evidence as its own entry evidence. G0 neither waits for it nor claims it. | DOSSIER-ontology-guardian.md:154, [R9:§3.2] (contract `1.1.4`, planning status) |
| Q-G0-5 | Executor publication, implementation, qualification | Publication is already decided by G2: the Design System retains and publishes the generic executor. Implementation and qualification are two distinct pending evidence states, each requiring its own evidence; neither is claimed as available here. Until qualification, a pinned build-time copy remains valid as the transitional state and consumers pin the published version once qualified. | [G2] (decisions.md:9), DOSSIER-ontology-guardian.md:485, STUDY-conformance-by-graph-composition.md:32 |
| Q-G0-9 | Weaker admission without a receipt (including at `skeleton`) | No admission without a receipt exists, `skeleton` included. A missing, failed, mismatched or not-evaluated required receipt refuses admission (§5.5 gate, fixtures FX-CAT-GATE, FX-RCPT-*). Any weaker rule would require a separate proposal outside G0 and G1 and is not part of this specification. | DOSSIER-ontology-guardian.md:340 |

### 10.2 Deferred questions (assigned, not decided here)

| Id | Question | Deferred to (owner; G0 decides nothing) | Source |
|---|---|---|---|
| Q-G0-1 | What `apps` denotes as a distinct catalog kind beyond the UI entry and application entries | Deferred to sentropic, at lot G1. Escalation to the owner only if an actual selection-behaviour change is shown. G0 records the mapping as `unverified` and decides no kind for it. **Answered by sentropic at G1 (conductor record, 2026-10-24):** « apps » denotes the planned app-template catalogue projection `kind:'app'`, ratified by owner decision D2=B (APP Q4, `spec/SPEC_EVOL_APP_CATALOG.md:46–50`; `spec/SPEC_EVOL_CLUSTER_MESH_MCP_REGISTRY_ARTIFACTS.md:320–322`, §14.1). It is discovery-only: instances are excluded and invocation authorization stays separate. Selection consequence: none, so the escalation condition is not met and no owner question arises. Source: `/home/antoinefa/src/sentropic/.tmp/ontology-g1/spec-plan.md` §2 (l. 28–40), sha256 `5552a3b9cba1108d4a91c0dc16d874802c2b52bb17de647e7ea987636c9a052a`, approved by sentropic. The mapping moves from `unverified` to `answered`. | DOSSIER-ontology-guardian.md:579, DOSSIER-ontology-guardian.md:701 |
| Q-G0-2 | Which canonical duplicate `unique-attribute` reports | Deferred to the design system, owner of that diagnostic contract. G0 prescribes no choice. **Decided by the design system (conductor record, 2026-10-23):** entities are iterated sorted by id in UTF-16 code-unit order; the first entity is the never-reported reference; each later duplicate gets `unique-attribute-violation` at `entities.<id>.attributes.<attr>` with refs `[reported, reference]`; diagnostic shape unchanged. Merged in `sent-tech-design-system` main at `610c0353d899befeb59634b46b9d90f578661731` (#193, squash of `0b1c1e25`): `packages/diagram-core/src/validate.ts`, reversed-insertion fixture `packages/diagram-core/tests/profiles.test.ts:245` (`toEqual` on both orders). Parity for this constraint moves from `open` to `evaluated`: it is now evaluable like any other row, and remains subject to the per-rule parity receipt. | STUDY-conformance-by-graph-composition.md:341 |
| Q-G0-7 | Timing forecast contract, phase-event definitions, outage qualification | Deferred to the time lots: T0 (service and phase definitions) and T2 (forecasts, then adoption), with T3 outage qualification as recorded in the review. G0 freezes no timing semantics beyond §9.2 placement. | DOSSIER-ontology-guardian.md:461, DOSSIER-ontology-guardian.md:524 |
| Q-G0-8 | Track mappings and reader floor; sequencing | Deferred: h2a owns G4 mappings and the reader floor; G3 sequencing is coordinated with Engram and the design system as recorded. Divergence D-B7 requires an h2a agreement or a separate join contract. G0 lists nothing further. **D-B7 decided by the owner (conductor record, 2026-10-25):** option « Versions + correspondances ». TRK and H2A vocabularies succeed each other by version plus explicit mapping; `compose` stays `operation-not-applicable`. No join contract is opened; a future combination need is handled when it is shown. Inputs: the crossed h2a analyses `/home/antoinefa/src/h2a/tmp/h-cond/g0a-last.md` (Astra max) and `g0s-last.md` (Sol max), relayed by h-cond. Both converge on ownership: Engram governs definitions and mappings, Track keeps the journal, transitions and projections, and the guardian decides neither realisation nor acceptance. The mappings, the reader-floor tuple and the G3 sequencing stay with the h2a lot authors. | DOSSIER-ontology-guardian.md:685, DOSSIER-ontology-guardian.md:678 |
| Q-G0-6 | Gated event-matrix cells (`OPEN-THROW`) | Referred to the `OPEN-THROW` gate already pending on the bpmn-canvas side (study §3.2 N5, closed table outside patterns). The gate is neither reopened nor blocking for G0, for the pilot, or for 26-rule parity. G0 retains the closed table by pin only. | STUDY-conformance-by-graph-composition.md:329 |

Closed by G2 (not open): who maintains the diagram verifier code and whether the executor is published. The Design System maintains and publishes the generic executor; Engram governs profiles, schemas, fixtures and migrations. No new question is posed on this point. Source: DOSSIER-ontology-guardian.md:609, DOSSIER-ontology-guardian.md:610, [G2] (decisions.md:9). Frozen technically by G0 (not open): tool naming in §9.2 and the payload field freeze including the artifactKind table in §5. Source: DOSSIER-ontology-guardian.md:685, DOSSIER-ontology-guardian.md:674, DOSSIER-ontology-guardian.md:675.

## Appendix A — Constats fermés (review-G0-astra tour 1 → tour 2)

Une ligne par constat. Chaque fermeture cite la section G0 qui la porte; aucune ne tranche une question différée du §10.2.

| Constat (tour 1) | Fermeture G0 tour 2 |
|---|---|
| BLOQUANT §§2.1, 6.2 — enveloppe diagnostique sans codes natifs ni champs Report/2 | §2.1 variantes typées sans perte (`origin`, `nativeCode` verbatim, `report2`/`diagram-core`/`engram`/`guardian`, champs Report/2 complets); §6.2 diagnostics en variantes sans perte, comparaison champ par champ |
| BLOQUANT §§1.4, 5.3 — dépréciation sans raison/date/successeur; successeur interdit sur déprécié | §1.4 `supersededBy` requis si `superseded`, optionnel si `deprecated` avec successeur connu; §5.3 champs `deprecatedReason`, `deprecatedAt`, `supersededBy` miroirs du dossier |
| BLOQUANT §5.5 — reçus sans rôles, parité, preuves, `not-evaluated` | §5.5 `validatorRole`, `proofBindings` (jeu de preuve, autorité corpus, verrou unicode, épingles), `ruleVerdicts` avec `parity` et verdict `not-evaluated` (N2) |
| BLOQUANT §7.2 — préimages RFC 8785 insuffisantes | §7.2 préimages exactes P-CONTENT-DIAGRAM, P-PINS (fiches comprises), P-DELTA, P-MAPPING, P-RESULT, P-ENTRY figées, avec vecteurs d'octets canoniques V-PINS-1, V-DIAGRAM-1, V-MAPPING-1, V-DELTA-1 |
| MAJEUR §§2–4 — delta/mapping et échecs incomplets; « vide au succès » contre détachement | §§2.2/3.1/4.1 unions `ok`/`refused`; §3.2 schémas delta fermés, §3.3 fichier mapping fermé; §2.4/§3.4 codes complétés (`severity-conflict`, `parent-rule-removal`, `duplicate-pin`, `retired-rule-without-delta`, `unknown-delta-operation`); détachement de cycle réussi rapporté en `ok` (FX-CF-12) |
| MAJEUR §§5.3–5.4 — liaisons d'artefacts typées manquantes | §5.3 `artifactBinding` en variantes fermées par `artifactKind` (licence/clôture, couverture, vecteurs scellés, version de matrice, lignée privée par référence); `digests.evidenceState` distingue digest applicable et preuve non résolue sans digest de substitution |
| MAJEUR §§5.2, 9.1 — enveloppe sans bras `skill`/`mcp`, compatibilité paraphrasée | §5.2 union v9 épinglée conservée telle quelle (types `Compatibility`/`Parameters`/`McpPayload` verbatim, bras `skill`/`mcp`/`ontology` fermés, seul ajout `ontology`); fixture publisher empaquetée sans chargement FX-CAT-PUB (§5.2, §8.6) |
| MAJEUR §§4.2, 8.7 — prédicat cardinalité contre fixture | §4.2 `cardinality-conflict`: cardinalités différentes sans décision mapping unique = conflit, rétrécissement pur compris; FX-CF-03 aligné (échec sans décision, succès avec décision unique; codes directionnels pile/dérivation inchangés) |
| MAJEUR §8 — fixtures reçus/sévérité/thème/composition manquantes | §8.6 FX-RCPT-FAIL, FX-RCPT-MISMATCH, FX-RCPT-NOTEVAL, FX-CAT-PUB; §8.7 FX-CF-11 (`severity-conflict`), FX-CF-12; FX-THM-01 (invariance au thème); FX-DIG-01 à FX-DIG-04 (règle seule, stabilité avant/après à l'octet, vecteurs, dépréciation) |
| MAJEUR Oracles — G2/R9/CAT/MEM sans révisions immuables | Table des oracles: empreintes SHA-256 des quatre fichiers (G2 `731ecd6c…`, R9 `278f6613…`, CAT `0f125278…`, MEM `18c697c1…`) et sections normatives exactes ([R9:§3.2/§3.3/§4/§5/§8], [CAT:§3.1], [MEM:M1/M7], G2 ligne 9) |

## Appendix A2 — Constats fermés (review-G0-astra tour 2 → tour 3)

Une ligne par constat ouvert au tour 2. Aucune ligne ne rouvre un point clos (B2, M3 à M6, vecteurs du §7.2) et aucune ne tranche une question différée du §10.2.

| Constat (tour 2) | Fermeture G0 tour 3 |
|---|---|
| B1 OUVERT §§2.1, 6.2 — `warn` exclu, `disposition` redéfinie, champs natifs perdus | Correction tour 3 complétée après [AR3] : §§2.1.0/2.1.1 transcrivent les types/prédicats natifs et préservent le Report entier sans enrichir, remplacer ni trier `report.entries`; les copies G0 sont indexées et réversibles (§6.2, FX-DIAG-01/02). Validation réservée à Astra. |
| B3 OUVERT §5.5 — liaisons sans empreintes pile/résultat ni preuve de qualification typée | §5.5 conserve `evaluatedStack` et la qualification typée; après [AR3], admission exige explicitement deux évidences `resolved` à digests égaux. `pass` avec résultat non résolu refuse (FX-RCPT-UNRESOLVED), même à `skeleton`. |
| B4 OUVERT §7.2 — limites numériques requises contre squelettes épinglés; P-DELTA en sérialisation de profil entier | §7.2 forme S-DSPROFILE transcrite (limites optionnelles, squelettes à `packages/diagram-core/src/profiles/skeletons.ts:104`); omission encodée `null` dans P-CONTENT-DIAGRAM; P-DELTA redéfini par valeur déclarée unique; fixture FX-DIG-C6 |
| M1 OUVERT §§3.3–4.2 — `{from,kind,to}` sans cardinalité/hiérarchie/sévérité | §3.3 union `MappingEntry` à sept bras typés (`cardinality` à `chosenMin/chosenMax`, `hierarchy` à `chosenShape/parentRole/childRole`, `severity` à `chosenSeverity`); §4.2 résolutions par bras; fixture FX-MAP-01 |
| M2 OUVERT §§1.4, 3.1, 5.3 — lignée privée, licence et états non résolus | Une seule forme `PrivateLineage` (§1.3) est réutilisée en §§1.4/5.3; le record privé de §3.1 est relié à cette référence par une application explicite de chaque champ, dont `resultingDigests` ↔ `digests` englobant. `provenance` reste fermée à deux champs; licence/couverture restent payload EXT; `DigestEvidence` reste unique. FX-LINEAGE-01. |
| BLOQUANT (nouveau) §7.2 P-RESULT — corps de règles effectifs absents de la préimage | P-RESULT lie `effectiveRuleSet[].ruleBody` complet (motifs `select`/`assert`, options) et, côté owner, les octets `rules`/`recipes`/`validation`; fixture FX-DIG-R2 |
| MAJEUR (nouveau) §7.2 P-RESULT — octets effectifs d2d remplacés par un digest | Après [AR3], bras owner = SHA-256 des octets `profile-c14n/2` du document effectif **complet**, avec `$schema`, `themes` et `ui`, sans projection ni wrapper; le gardien garde le digest et la référence au reçu. Sélecteur externe distingué des tables stockées (vecteurs V-OWNER-0a/0b/0c/1, FX-DIG-R3). |
| MAJEUR (nouveau) §5.5 — `proofSet` limité au BPMN | `proofSet` reste exclusivement dans `bpmn-parity`. Les bras `h2a-vocabulary` et `mem-descriptor` complètent les familles sans preuve ni reçu BPMN; `family-corpus`, `bpmn-bijection`, `mechanism-compat`, `contract-verdict`, `theme-invariance` sont conservés. FX-RCPT-ARMS. |

## Appendix A3 — Réponse auteur aux constats finaux [AR3] (Sol, tour 1)

Cette table trace les corrections soumises à Astra; elle ne constitue ni une revue par l'auteur ni un verdict SOLID. Les dispositions Q-G0-1..9 restent celles du §10, sans modification.

| Constat [AR3] | Correction soumise / preuve contractuelle |
|---|---|
| BLOQUANT Report/2 enrichi et retrié | §§2.1.0/2.1.1/6.2 : Report natif inchangé, copies G0 séparées, index originaux et inverse sans perte; FX-DIAG-01 |
| BLOQUANT reçu passant avec résultat non résolu | §5.5 : deux états résolus, puis égalité; refus explicite de `pass + unresolved`; FX-RCPT-UNRESOLVED |
| MAJEUR coordonnées et lintSummary | Transcriptions natives exactes §2.1.0; coordonnées tree indisponibles valides, dispositions corrigées exclues du compte; FX-DIAG-02 |
| MAJEUR bindings / $schema / options | S-COMPILED et S-D2DC14N transcrits; chaque champ mappé, bindings globaux distincts, options de règle compilée interdites; FX-COMPILED-01, FX-DIG-OWNER |
| MAJEUR projection owner non sourcée | §7.2 : document complet, aucune suppression de `themes/ui`; application du thème distincte d'une édition de profil; FX-THM-01 conservée |
| MAJEUR sélection owner et resultDigest | Procédure et FX-DIG-R3 alignées : sélecteur externe seul = résultat inchangé, table stockée modifiée = résultat modifié; quatre vecteurs V-OWNER concrets |
| MAJEUR M2 résultants/références | §1.3 définit conteneur/référence/record; §§1.4/3.1/5.3 appliquent la correspondance explicite de `resultingDigests`; FX-LINEAGE-01 |
| MAJEUR familles H2A et MEM | §5.5 : bras de corpus de vocabulaire/descripteur, sans BPMN ni données de session/mémoire; FX-RCPT-ARMS |

B2, B4, M1, M3–M6, les corps P-RESULT, la portée BPMN de `proofSet` et les quatre vecteurs initiaux restent conservés. Toute validation de ces corrections appartient à Astra.

## Appendix B — Single consistency pass (Sol auteur, tour 2 de 2; [METHOD] point 5)

Contrôle mécanique des noms et des correspondances entre sections. Les conteneurs, références et records distincts sont indiqués comme tels; cette table ne les déclare plus « identiques ». Le verdict de revue reste réservé à Astra.

| Nom vérifié | §§1.4 | §3.1 | §5.3 | §5.5 | §7.2 | Correspondance |
|---|---|---|---|---|---|---|
| `Pin` / `Digest` | Parents et références | Base et mappingRef | profilePin, stack, ruleSheets | Épingles famille/preuves | P-PINS `{contentDigest,id,version}`; les IdentityPin natifs gardent `sha256` dans S-D2DC14N | Valeurs G0 communes; aucun renommage des octets natifs |
| `DigestEvidence` | `digests.resultEvidence` | `resultingDigests.resultEvidence` | `digests.resultEvidence` | `evaluatedStack.resultEvidence` | Résultat de P-RESULT | Unique union §1.3; publication/admission exigent résolu et égal |
| `PrivateLineage` | Conteneur `lineage` | Conteneur du candidat, pas le record de résultat | Même conteneur `lineage` | Aucun corps privé | P-DELTA owner produit deltaDigest | Une seule forme définie §1.3 |
| `PrivateDerivationRef` | `lineage.derivationRef` | Référence privée du delta / projection du record | `lineage.derivationRef` | Références/épingles seules | `base,deltaDigest,mappingRef?` | Champs identiques, jamais d'opérations |
| `PrivateDerivationRecord.resultingDigests` | `digests` englobant | Record de résultat = ref + resultingDigests | `digests` englobant | Le résultat évalué doit correspondre | P-CONTENT/P-PINS/P-RESULT | Application champ à champ §1.3; mismatch refuse; FX-LINEAGE-01 |
| `contentDigest,pinsDigest,resultDigest,entryDigest` | Trois évidences contenu, entrée par référence | Résultats de dérivation | Digests payload, entryDigest externe | Stack évaluée liée au résultat | Quatre préimages séparées | Aucune substitution ni auto-inclusion |
| Native `Report` / G0 diagnostics | — | Diagnostics des opérations | — | Reçus natifs owner-side si privés | Aucun tri natif modifié | §§2.1.1/6.2 : report inchangé, copie enrichie avec reportEntryIndex, inverse exact |
| `severityPolicyDigest` / S-COMPILED | — | — | `ruleSheets[].selections` public garde phase/politique, settings complets, sévérités effectives et digest; privé par référence | BPMN : `proofBindings` + preuve compilée; sept autres bras : champ racine Digest ou null sans fiche; `ruleVerdicts[].severity` égale la sélection | Public : préimage résultat; owner : évidence de sélection séparée; P-PINS projette seulement sheetPin, P-ENTRY inclut les métadonnées | Même nom et même formule native; toutes les bindings conservées; inverse sans perte §5.3 et FX-CAT-SELECTION |
| `studyDisposition` | — | — | — | ruleVerdicts | — | Champ G0 séparé de la `disposition` native en §2.1 |
| `Receipt.receiptKind` | — | — | receipts | Huit bras : bpmn-parity, bpmn-bijection, family-corpus, h2a-vocabulary, mem-descriptor, mechanism-compat, contract-verdict, theme-invariance | Digests de résultat selon scope | `proofSet` uniquement BPMN; H2A/MEM restent leurs contrôles de famille |
| `MappingEntry.kind` | — | rename-with-mapping | — | — | P-MAPPING : tous les champs du bras | Sept bras conservés; cardinalité/hiérarchie/sévérité propres |
| `artifactKind` / `artifactBinding` | Six valeurs | — | Six bras de §5.3/5.4 | Reçus correspondants | Thème appliqué séparément; E privé complet | mechanism/base/profile/theme/corpus/contract inchangés |
| `licenceClosure,coverage,provenance` | Clôture publication | Clôture recalculée | Provenance fermée; champs EXT distincts | Refus excluded-licence | P-ENTRY garde les champs | Ni licence ni couverture dans provenance |
| V-PINS-1 / V-DIAGRAM-1 / V-MAPPING-1 / V-DELTA-1 | — | — | — | — | 186/206/86/320 octets; SHA-256 recalculés | Octets et hashes initiaux inchangés |
| V-OWNER-0a/0b/0c/1 | — | — | Référence owner | Sélection compilée distincte du résultat | E0 968 octets / E1 969 octets, SHA-256 natifs | FX-DIG-R3 distingue sélection externe et modification de document |

## Appendix — Traceability of the G0 deliverable

| G0 deliverable item (lot G0) | Frozen in | Source for the requirement |
|---|---|---|
| Ontology record | §1 | DOSSIER-ontology-guardian.md:517 |
| Stack, derive and merge diagnostics | §§2–4 (envelope §2.1) | DOSSIER-ontology-guardian.md:517 |
| Catalog ontology payload, artifactKind mapping, per-library receipt gate | §5 (§§5.3–5.5) | DOSSIER-ontology-guardian.md:517 |
| Application receipt | §6 | DOSSIER-ontology-guardian.md:517 |
| Digest rules with stability | §7 | DOSSIER-ontology-guardian.md:517 |
| Fixture list per property and per conflict family | §8 (§§8.1–8.7) | DOSSIER-ontology-guardian.md:517 |
| Compatibility with the MCP catalog call tool registered like the memory tool; G1 consumes the payload | §9 (payload §§5.2–5.3) | DOSSIER-ontology-guardian.md:551, DOSSIER-ontology-guardian.md:518 |
| Questions: technical answers integrated, deferred questions assigned without decision | §10 (§10.1 closed in G0; §10.2 deferred to named owners) | Instruction for this lot; dossier open register DOSSIER-ontology-guardian.md:681 |

G0 observable exit: a versioned specification with no conflicting authority and a conformance-fixture list per property and per family. This document is that specification. It changes no code, no profile, no catalog and no Track state. Source: DOSSIER-ontology-guardian.md:517, DOSSIER-ontology-guardian.md:5.

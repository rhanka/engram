# OpenERP ontology under Engram guardianship — specification

| Field | Value |
|---|---|
| Specification | `SPEC-openerp-ontology.md` (this file, English) |
| Ontology | `openerp@1` — record in §1, Engram profile in §2.9, extraction provenance in §§2.1–2.8 |
| Semantic owner | `openerp` (OpenERP keeps semantic authority over its domain) |
| Custodian | `engram`, as ontology guardian (identity, lifecycle, digests, migrations, mappings) |
| Goal | Full interoperability between SAP, Odoo and OpenERP, anchored on open standards only (§4) |
| Guardian contracts | G0 guardian contracts, applied exactly: record (§1.4 of G0), catalog payload (§5.3), lineage (§1.3–§1.4), digest preimages P-CONTENT / P-PINS / P-RESULT / P-ENTRY (§7.2), admission gate (§5.5) |
| Stack rule | Node/TypeScript and native binaries only. Zero Python: no Python code, job, image or evaluator is introduced by this specification, by the export re-run (§6), or by any check in §10. |
| Design rule | No design beyond the pinned sources and the owner decisions below. Anything not sourced is marked `unverified` or listed in §8; it is not decided here. |

## Source pins (every rule is sourced to a pinned revision)

| Key | Source | Pin |
|---|---|---|
| [ONT] | `source/openerp-ontology.json` — deterministic extraction: 43 migrations, 67 entities, 146 typed relations, 57 enumerated fields, 27 table-level invariants, 0 parser gaps | sha256 `dcee5c9da1fdca908e56a049a4af80e289a61beeda14ca9b155993152f2b1213` |
| [RET] | `source/RETROCESSION-openerp-ontology.md` — OpenERP handover to Engram (transactional chain, four invariants, engram-first split, three-column construction) | sha256 `c655288b478b1d18acdfb1a9ab35f632c948f37745225d84adead2f93df6ab45` |
| [EXP] | `source/export-ontology.mjs` — deterministic generator (Node, reads `apps/api/src/db/migrations/*.sql`) | sha256 `5ddf004260695ef53067083bdf253eb4e8dbaf71cba2c299f1e8dcccdcea9f4d` |
| [SUMS] | `source/SHA256SUMS` — snapshot manifest covering [ONT], [RET], [EXP] | sha256 `f74f34b829eb25ee248f21db76ed85a2a4c117e13594dcb845fd5303b65b032a` |
| [G0] | `SPEC-G0-guardian-contracts.md` (parent directory) — frozen guardian contracts, implemented on engram main as `src/ontology-guardian` | sha256 `e6362445f87d6581ac31224c2dc44e15214b3a7debc2afff2b3d25b8b37ff8f6` |
| [ENG] | Engram implementation at `origin/main@636fa9d644088db3c9bdb6ade295dec5a8bf1f78`: `src/ontology-profile.ts` (`validateOntologyProfile`, `normalizeOntologyProfile`, `hashOntologyProfile`, `stableForHash`) and `src/ontology-guardian/digests.ts` + `canonical.ts` (P-PINS, P-MAPPING, P-RESULT, RFC 8785) | commit `636fa9d644088db3c9bdb6ade295dec5a8bf1f78` |
| [PROF] | Native-only profile `openerp@1` — the `OntologyProfile` built by rules N1–N4 in §2.9.1 from [ONT] (Node only; only §2.9.0 native fields), normalized by [ENG] `normalizeOntologyProfile` without a source path | specified in §2.9; validated by FX-OP-02 (§2.9.2) |
| Commit pin | OpenERP repository HEAD `d06d5ece`, origin of [EXP] and of the extracted migrations | `unverified` — the artifacts are not yet versioned in the openerp repo; pinned by sha256 above until OpenERP publishes them (OQ-OP-03) |

Reading rule. If a statement in this specification and its pinned source disagree, the pinned source governs and this specification is defective; the defect is reported, not silently reinterpreted. Display labels and translated names are never identity (G0 reading rule).

## Owner decisions (verbatim, binding)

| Date | Decision |
|---|---|
| 2026-10-24 | « Le modele de donnee devrai etre managé par engram et basé globalement sur un standard soit sap soit odoo (si possible les deux pour gerer l interop) » |
| 2026-10-28 | « Normes ouvertes + SAP/Odoo (Recommandé) ». Open standards are the only normative reference: UBL 2.x / Peppol BIS for invoices, ISO 20022 for payments and bank, SAF-T for the accounting export, OAGIS for inter-ERP exchange. SAP and Odoo are mapping targets only, through their public API identifiers (Odoo: `res.partner`, `account.move`, `account.move.line`, `account.payment` and others; SAP: published OData entity sets). No internal SAP or Odoo structure may be copied. |
| 2026-10-28 | « Question licence on est mit full open nous ». Everything is MIT. Nothing may be derived from proprietary or LGPL schema structure. Only public identifiers may be used, as interop metadata. (§7) |

Vocabulary versioning rule. Vocabularies evolve by versions plus explicit mappings (G0 §10.2, row D-B7, owner decision recorded 2026-10-25: « Versions + correspondances »). This specification applies that rule to the ontology versions (§6) and to each mapping artifact (§4, §6).

## 1. Ontology record `openerp@1`

### 1.1 Five-part record (G0 §1.1)

An ontology is a five-part record; no part alone is an ontology. For `openerp@1`: (1) versioned profile — the normalized native-only Engram profile [PROF] of §2.9 (`engram-profile` shape: `node_types` keys and `relation_types` endpoints only, §2.9.0); the SQL extraction is preserved separately as G0 governed provenance in §§2.1–2.8 (tier G, §2.9.3) and is never the hashed profile; (2) conformance corpus — the acceptance fixtures of §10, packaged as a corpus before admission (not yet packaged, OQ-OP-08; the draft therefore omits `corpusRef`, §1.3); (3) identity and digests — §1.3 and §1.6; (4) lineage record — §1.4; (5) catalog entry — the G0 §5.3 payload instantiated as far as sourced in §1.5, admitted only through the §5.5 gate. Instances (OpenERP rows) conform to the ontology and are governed through it; an instance is never an ontology.

### 1.2 Ownership split (no landgrab)

| Role | Holder | Content |
|---|---|---|
| Semantic owner | `openerp` | Meaning of every entity, relation, enum and invariant of §2; domain changes originate in OpenERP migrations and reach this record only through §6. |
| Custodian (guardian) | `engram` | Identity, lifecycle, digests, migrations between ontology versions, and mappings (§4). Guardianship governs definitions and mappings, never settlement authority (G0 R-7): no record, receipt or catalog state in this specification settles a decision, an acceptance or a realization. |

The G0 record is closed and has no custodian field; custodianship is therefore recorded without adding a field: the record field `owner` carries the semantic owner `openerp`, and Engram acts on the record only through the G0 lifecycle, catalog and tool surfaces (G0 §§1.5, 5, 9). Lineage and provenance (§1.4) mark the external origin: the pack enters the guardian as an external ontology pack (family `EXT`, G0 §0.4), with OpenERP provenance on every version. No OpenERP type is renamed into an Engram-owned type by admission, and no term is presented as Engram-authored.

### 1.3 Exact record (G0 §1.4, closed — instantiated)

| Field | Value for `openerp@1` |
|---|---|
| `namespace` | `openerp` |
| `id` | `openerp` |
| `version` | `1` (exact version; no range, no tag) |
| `owner` | `openerp` (semantic owner; custodian: `engram`, §1.2) |
| `lifecycle` | `draft` — not admitted: the corpus and the receipts required by the G0 §5.5 gate do not exist yet, so the candidate stays a draft outside the catalog (G0 R-4) |
| `completeness` | `complete` — extraction-declaration completeness only ([ONT] reports 0 parser gaps and §§2.1–2.8 transcribe it without loss); it never claims that the native profile states attributes, enumerations or constraints (it states entity and endpoint existence only, §2.9.3), never waives evidence and never substitutes for a missing receipt |
| `visibility` | `public` |
| `profileShape` | `engram-profile` |
| `artifactKind` | `profile` |
| `profileRef` | `{ canonicalRef: "openerp@1", contentDigest: "8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65" }` (normalized native-only profile of §2.9; preimages in §1.6) |
| `corpusRef` | absent — the record is a `draft` (G0 §1.4: `corpusRef` is required for `published`; a draft may omit it). No `DigestEvidence` encoding is used here: in G0 the field type is `{ ref, digest }` with `digest: Digest`, so an unresolved corpus is represented by omission, never by an unresolved arm, `null`, or a placeholder. Supplying `{ ref: "openerp-conformance-corpus@1", digest: <manifest Digest> }` is admission task OQ-OP-08 (owner: `engram` + `openerp`) |
| `digests` | `contentDigest: 8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65`; `pinsDigest: cda06dc8e8895fa8e940b11092f7b720c08053caf7871ad63818b879a3914e6a`; `resultEvidence: { evidenceState: resolved, digest: 8e71a6769cfd313bb44a6943369e5aa4de513802607ea8a4f13ae8b3f98a910f }` (preimages in §1.6). `entryDigest` is computed externally over the catalog entry (P-ENTRY) and never self-embedded; it is not asserted here because the §1.5 payload is incomplete (§1.5, OQ-OP-08, OQ-OP-13). |
| `lineage` | Public arm: `parents: []` (base with no parent; external origin, §1.4), `derivation`: absent, `mappings`: `["openerp-open-standards@1", "openerp-odoo@1", "openerp-sap@1"]` — mapping **reference strings** in the G0 public lineage form (§1.4, [ENG] `PublicLineage.mappings: string[]`), not Pins; the separately resolved mapping Pins are in §4 and §6(c), `migrations`: `[]` (no migration exists at version `1`; §6) |
| `consumers` | `[]` at draft; publication requires the list to be present (G0 §1.4) — populating it is admission task OQ-OP-08, not a sourced fact |
| `supersededBy` | absent (lifecycle is `draft`) |
| `migrationRef` | absent (no migration is defined at version `1`) |
| `deprecatedReason`, `deprecatedAt` | absent (lifecycle is `draft`) |
| `catalogEntryRef` | absent (draft outside the catalog; assigned at admission, §1.5) |

Record closure and invariants R-1 to R-8 (G0 §1.6) apply unchanged. In particular: identity is `(namespace, id, version)` completed by the digests; published profile bytes under `(openerp, 1)` never change — a native-profile change requires a new ontology version; tier-G metadata revisions and tier-X gaps follow §6(b) without forcing a new profile version; unknown versions, digests or majors refuse, with no fallback to latest anywhere (G0 I-10).

### 1.4 Lineage and provenance (external origin)

| Item | Value |
|---|---|
| Family | `EXT` — external ontology pack with provenance and coverage record (G0 §0.4) |
| Provenance (`sourceRef`) | OpenERP repository, snapshot `source/` of this design directory ([ONT], [RET], [EXP], [SUMS]) |
| Provenance (`sourceRevision`) | `d06d5ece` — `unverified` until OpenERP versions the artifacts (OQ-OP-03) |
| Parents | none — the extraction is a base, not a derivation from any guardian profile; `parents: []` is the G0 base case |
| Derivation | absent — no delta operation of G0 §3.2 is asserted; OpenERP did not derive this model from a guardian base |
| Mappings | Lineage reference strings `openerp-open-standards@1`, `openerp-odoo@1`, `openerp-sap@1` (§4); the resolved Pins `(id, version, contentDigest)` for the same artifacts are carried in §4 and §6(c), not in this lineage field |
| Migrations | none at `1`; later versions only through §6 |

Preserved foreign content keeps the G0 levels `validated`, `preserved-unvalidated`, `unsupported` (G0 I-11): guardianship indexes the pack and never promotes its content into an Engram-owned vocabulary.

### 1.5 Catalog payload and admission (G0 §§5.3–5.5)

The catalog entry is the G0 §5.2 registry envelope with `kind: ontology` and the §5.3 ontology payload. Every §5.3 field is either instantiated below or assigned as an admission task with an owner; no value is invented to complete the payload, and `entryDigest` (P-ENTRY over the whole entry) is therefore not asserted in this specification. Instantiated values: `canonicalRef: openerp@1`; `namespace: openerp`; `owner: openerp`; `domain`: absent (no domain declared); `profileShape: engram-profile`; `artifactKind: profile`; `profilePin: { id: "openerp", version: "1", contentDigest: "8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65" }`; `stack`: exactly `[profilePin]` (single layer, in order); `digests`: the §1.3 triple; `ruleSheets: []` (no rule sheet applies, so no selection metadata exists); lifecycle `draft` with `deprecatedReason`, `deprecatedAt`, `supersededBy` absent; `provenance: { sourceRef: "OpenERP repository, snapshot source/ ([ONT], [RET], [EXP], [SUMS])", sourceRevision: "d06d5ece" }` (closed, exactly these two fields; revision `unverified`, OQ-OP-03); `licenceClosure.licences: ["MIT"]` with `closureDigest` as task OQ-OP-13 (recomputed at admission; no G0 preimage for a closure digest is asserted here); `coverage.declaredLimits: "Native profile: 67 entity types (node_types keys), 146 relation types (endpoints) from [ONT] dcee5c9d…; G0 provenance outside the preimage: 776 column rows (773 real + 3 pseudo), 61 enumerated columns, 11 column CHECKs, 27 table invariants (§§2.3–2.7); no instance data, no SAP/Odoo field correspondence"` with `coverageDigest` as task OQ-OP-13; `lineage`: the §1.4 public lineage (mapping reference strings, §1.3); `conflictPolicy: "G0 §§2–4 mapping-required, never silent overwrite (SPEC-G0-guardian-contracts.md e6362445…)"`; `completeness: complete`; `migrations: []`; `visibility: public`; `artifactBinding`: the `profile` variant `{ artifactKind: "profile", profilePin, stack }` with `relationMatrixRef` absent (public entry; the `artifactKind: "profile"` discriminant inside the binding is required by `src/ontology-guardian/catalog.ts` at `636fa9d6`, in addition to the outer payload `artifactKind` field). Admission tasks (unresolved, owned, blocking admission): `corpusRef { ref, digest }` and `consumers` — OQ-OP-08, owner `engram` (catalog) + `openerp` (consumer targets); `receipts` (required `family-corpus` arm for family `EXT`) and the §5.5 gate — OQ-OP-08; `compatibility { renderer, adapter }` pinned references and `linkedTools` — OQ-OP-13, owner `engram`; `licenceClosure.closureDigest` and `coverage.coverageDigest` recomputation — OQ-OP-13. The §5.2 envelope fields (`format`, `contractVersion`, `id`, `name`, `description`, `entryVersion`, `publisher`, `compatibility`, `parameters`, `bindings`, `assets`) are instantiated only at admission together with the completed payload. Payload prohibitions of G0 §5.3 apply: no credentials, no memory content, no entity-registry record data, no journal bytes as assets, no runtime session state.

Admission is the G0 §5.5 gate, with no weaker admission: first, resolved result evidence — the entry `resultEvidence` and every required receipt `evaluatedStack.resultEvidence` must both be arm `resolved` with equal digests (a `pass` receipt with unresolved evidence refuses, fixture FX-RCPT-UNRESOLVED); then stack order, `pinsDigest` and proof bindings are compared field by field. For this `EXT` pack the required receipt is the `family-corpus` arm (family `EXT`) produced by the family validator over the §10 corpus (valid fixtures pass; rejected fixtures yield their asserted diagnostics — G0 §5.5(c) pattern). While any required receipt is missing, failed, mismatched or not-evaluated, admission refuses with `missing-receipt` at any completeness, including `skeleton`, and the candidate stays a draft outside the catalog. The recomputed licence closure must stay within MIT, Apache-2.0, CC0; an excluded licence refuses with `excluded-licence` and no lifecycle state cures it (§7). Packed-entry inspection loads zero ontology code (fixture FX-CAT-PUB).

### 1.6 Digest preimages (G0 §7, applied exactly)

Four distinct digests, never interchanged (G0 §7.1). Canonical discipline: RFC 8785 canonical JSON plus SHA-256, digests rendered as 64 lowercase hex digits (G0 §7.2).

| Digest | Preimage for `openerp@1` | Value |
|---|---|---|
| `contentDigest` | Engram `profile_hash` (G0 §7.2, S-ENGRAMHASH; [ENG] `hashOntologyProfile` at `origin/main@636fa9d6…`): SHA-256 of `JSON.stringify(stableForHash(normalized))`, where `normalized` is the `NormalizedOntologyProfile` produced by [PROF] (§2.9.1, rules N1–N4) followed by [ENG] `normalizeOntologyProfile` called without a source path (so no `sourcePath` enters the value; `stableForHash` sorts object keys recursively and excludes only `sourcePath`, `profile_hash`, `bound_source_path` and `linking.normalize.fn`). The hashed declarations are the native-only `node_types` (67 entity keys, each `{}`), `relation_types` (146 endpoint pairs), `registries`, policies, hierarchies and outputs of §2.9.1 (all policies/hierarchies/outputs are the N1 Engram defaults) — never the SQL extraction object of §§2.1–2.8 and never any column, enumeration or constraint fact (tier G/X, §2.9.3). No re-canonicalization under P-CONTENT-DIAGRAM (G0 §7.3). | `8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65` |
| `pinsDigest` | P-PINS over a single-layer stack with no derivation delta, no mapping and no rule sheet: `{"deltaDigest":null,"layers":[{"contentDigest":"8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65","id":"openerp","version":"1"}],"mappingDigest":null,"ruleSheets":[]}` (exact RFC 8785 bytes, keys in canonical sorted order). Even a single-layer stack hashes the pin structure, never the profile bytes. | `cda06dc8e8895fa8e940b11092f7b720c08053caf7871ad63818b879a3914e6a` |
| `resultDigest` | P-RESULT, guardian-computable engram scope ([ENG] `resultDigestOf`): SHA-256 over the RFC 8785 bytes of `{ effectiveDeclarations: stableForHash(normalized), effectiveRuleSet: [], severityPolicyDigest: null }`, where `normalized` is the same normalized native-only profile as for `contentDigest` — the single layer resolves to its own declarations; no rule sheet applies. | `8e71a6769cfd313bb44a6943369e5aa4de513802607ea8a4f13ae8b3f98a910f` |
| `entryDigest` | P-ENTRY: SHA-256 over the RFC 8785 bytes of the whole §1.5 catalog entry, computed externally at admission and never placed inside the entry. Deprecation later changes `entryDigest` only; the three digests above stay equal (G0 §1.5, FX-DIG-04). | computed at admission (no value asserted here) |

Stability (G0 §7.3): cataloguing recomputes no existing identity under a different canonicalization; `pinsDigest`, `resultDigest` and `entryDigest` are new values computed about the bytes and modify no described byte. Equal digest values from distinct procedures are not by themselves a failure; substitution of one for another is (FX-DIG-01 pattern).

## 2. Extraction provenance (§§2.1–2.8, not hashed) and Engram profile (§2.9, hashed)

Two distinct objects are kept apart throughout this specification. (a) The **extraction provenance** in §§2.1–2.8 reproduces [ONT] field by field — every entity with every column (name, SQL type, nullability, reference, delete rule, enum, column CHECK, `addedBy`), every typed relation, every enumerated field, every column CHECK and every table-level invariant, in source order, with SQL/DDL specifics (index and constraint names, RLS flags, migration file names, clause texts) preserved verbatim. This provenance is tier-G G0 governed metadata (§2.9.3): it is **not** the versioned profile and never enters any digest preimage in §1.6; it is pinned by the [ONT] sha256 and, at admission, by the catalog `provenance`/`coverage` fields (§1.5). (b) The **versioned profile** in §2.9 is the native-only Engram `OntologyProfile` [PROF] built from [ONT] by rules N1–N4 (entity keys and relation endpoints only), normalized by [ENG]; only its normalized form is hashed (§1.6). Nothing is renamed, merged, dropped or completed in (a); the projection performed by (b) is stated exhaustively in §2.9.1, and every value (b) does not carry stays available in (a) under its §2.9.3 tier. Where the extraction carries parser-shaped entries (notably pseudo-columns named `constraint` on `bank_transactions` and `reconciliation_links`, produced where a table-level foreign key was added outside the `CREATE TABLE` body), they are transcribed as extracted in (a) and flagged `as-extracted`; [ONT] reports `parserGaps: []`, and this specification neither repairs nor interprets them in (a) — §2.9.3 states exactly how each is classified (tier G as extracted, tier X for its composite form, OQ-OP-11).

### 2.1 Extraction header and counts ([ONT], verbatim values)

| Field | Value |
|---|---|
| `producer` | `openerp` |
| `producedAt` | `2026-10-27` |
| `method` | `deterministic parse of apps/api/src/db/migrations/*.sql` |
| `scopeUnit` | `organization_id` |
| `tenancyLevels` | `1` |
| `rlsMechanism` | `session setting app.current_organization_id, forced row level security` |
| `parserGaps` | `[]` (0 gaps) |

| Count ([ONT] `counts`) | Value |
|---|---|
| Migrations analyzed | 43 |
| Entities | 67 |
| Entities carrying `organization_id` (`tenantScoped`) | 62 |
| Entities with forced RLS (`forcedRls`) | 60 |
| Typed relations (foreign keys) | 146 |
| Enumerated fields (`CHECK … in`) | 57 |
| Table-level invariants | 27 |

Modules (16, from [RET] §2, confirmed by the `module` values in §2.2): `foundation`, `canon`, `crm`, `project`, `billing`, `banking`, `reporting`, `workflow`, `webhook`, `auth`, `agentic`, `jobs`, `passkey`, `oidc`, `translation`, `openerp`.

Scope exceptions, transcribed: entities without `organization_id` are `organizations` (the tenant root itself; forced RLS applies), `user_identities`, `passkey_credentials`, `passkey_challenges`, `oidc_state`. Tenant-scoped entities without forced RLS are `translation_keys`, `jobs`, `openerp_sessions`. These are extraction facts; no RLS or tenancy policy is decided here (§3.3).

The 43 migration files are counted by [ONT] but not listed as a file list; §2.2 records each entity's `sourceMigration` and every `addedBy` migration exactly as extracted (34 distinct creation migrations and 12 distinct altering migrations are referenced by name). Recovering the remaining file names requires the OpenERP repository, which is outside the pinned snapshot — source-gap, covered by OQ-OP-03.

### 2.2 Entities — index (67)

Columns: entity; module; source migration; column count; table-invariant count; `organization_id` carried (tenant); forced RLS. Full column detail is in §2.3 under the same entity order.

| # | Entity | Module | Source migration | Cols | Inv | Tenant | Forced RLS |
|---|---|---|---|---|---|---|---|
| 1 | `organizations` | foundation | `0001_foundation.sql` | 12 | 0 | false | true |
| 2 | `tenant_settings` | foundation | `0001_foundation.sql` | 13 | 0 | true | true |
| 3 | `users` | foundation | `0001_foundation.sql` | 11 | 1 | true | true |
| 4 | `teams` | foundation | `0001_foundation.sql` | 6 | 0 | true | true |
| 5 | `roles` | foundation | `0001_foundation.sql` | 6 | 1 | true | true |
| 6 | `permission_grants` | foundation | `0001_foundation.sql` | 10 | 1 | true | true |
| 7 | `audit_events` | foundation | `0001_foundation.sql` | 18 | 2 | true | true |
| 8 | `file_objects` | foundation | `0001_foundation.sql` | 10 | 0 | true | true |
| 9 | `comments` | foundation | `0001_foundation.sql` | 9 | 0 | true | true |
| 10 | `notifications` | foundation | `0001_foundation.sql` | 10 | 0 | true | true |
| 11 | `domain_events` | foundation | `0001_foundation.sql` | 8 | 0 | true | true |
| 12 | `user_identities` | canon | `0002_canon_entities.sql` | 11 | 0 | false | false |
| 13 | `organization_members` | canon | `0002_canon_entities.sql` | 7 | 1 | true | true |
| 14 | `fx_rate_snapshots` | canon | `0002_canon_entities.sql` | 8 | 0 | true | true |
| 15 | `timeline_entries` | canon | `0002_canon_entities.sql` | 8 | 0 | true | true |
| 16 | `approval_requests` | canon | `0002_canon_entities.sql` | 14 | 1 | true | true |
| 17 | `idempotency_records` | canon | `0002_canon_entities.sql` | 7 | 1 | true | true |
| 18 | `translation_keys` | translation | `0004_translation_keys.sql` | 9 | 1 | true | false |
| 19 | `jobs` | jobs | `0005_jobs.sql` | 11 | 1 | true | false |
| 20 | `passkey_credentials` | passkey | `0006_passkey_credentials.sql` | 12 | 0 | false | false |
| 21 | `passkey_challenges` | passkey | `0006_passkey_credentials.sql` | 6 | 0 | false | false |
| 22 | `agent_definitions` | agentic | `0008_agentic_entities.sql` | 11 | 1 | true | true |
| 23 | `agent_runs` | agentic | `0008_agentic_entities.sql` | 16 | 0 | true | true |
| 24 | `policy_decisions` | agentic | `0008_agentic_entities.sql` | 9 | 0 | true | true |
| 25 | `tool_calls` | agentic | `0008_agentic_entities.sql` | 11 | 0 | true | true |
| 26 | `supervision_requests` | agentic | `0008_agentic_entities.sql` | 8 | 0 | true | true |
| 27 | `companies` | crm | `0010_crm_companies.sql` | 17 | 0 | true | true |
| 28 | `contacts` | crm | `0011_crm_contacts.sql` | 15 | 0 | true | true |
| 29 | `pipeline_stages` | crm | `0012_crm_pipeline.sql` | 10 | 2 | true | true |
| 30 | `opportunities` | crm | `0012_crm_pipeline.sql` | 18 | 0 | true | true |
| 31 | `leads` | crm | `0013_crm_leads.sql` | 19 | 0 | true | true |
| 32 | `projects` | project | `0015_project_projects.sql` | 13 | 0 | true | true |
| 33 | `project_tasks` | project | `0016_project_tasks.sql` | 13 | 0 | true | true |
| 34 | `time_entries` | project | `0017_project_time_entries.sql` | 14 | 0 | true | true |
| 35 | `rates` | project | `0018_project_rates.sql` | 10 | 1 | true | true |
| 36 | `assignments` | project | `0019_project_assignments.sql` | 12 | 0 | true | true |
| 37 | `invoice_proposals` | project | `0020_project_invoice_proposals.sql` | 13 | 0 | true | true |
| 38 | `invoice_proposal_lines` | project | `0020_project_invoice_proposals.sql` | 10 | 0 | true | true |
| 39 | `invoices` | billing | `0021_billing_invoices.sql` | 24 | 1 | true | true |
| 40 | `invoice_lines` | billing | `0021_billing_invoices.sql` | 10 | 0 | true | true |
| 41 | `payments` | billing | `0022_billing_payments.sql` | 11 | 1 | true | true |
| 42 | `tax_categories` | billing | `0023_billing_taxes.sql` | 9 | 1 | true | true |
| 43 | `tax_rate_versions` | billing | `0023_billing_taxes.sql` | 13 | 0 | true | true |
| 44 | `accounts` | billing | `0024_billing_accounting.sql` | 9 | 1 | true | true |
| 45 | `journal_entries` | billing | `0024_billing_accounting.sql` | 12 | 0 | true | true |
| 46 | `journal_entry_lines` | billing | `0024_billing_accounting.sql` | 8 | 0 | true | true |
| 47 | `quote_handoffs` | crm | `0026_crm_quote_handoffs.sql` | 10 | 0 | true | true |
| 48 | `recurring_billing_schedules` | billing | `0027_billing_recurring_schedules.sql` | 14 | 0 | true | true |
| 49 | `saved_views` | reporting | `0028_reporting_saved_views.sql` | 12 | 0 | true | true |
| 50 | `report_definitions` | reporting | `0029_reporting_report_definitions.sql` | 10 | 0 | true | true |
| 51 | `report_runs` | reporting | `0029_reporting_report_definitions.sql` | 13 | 0 | true | true |
| 52 | `dashboards` | reporting | `0030_reporting_dashboards.sql` | 9 | 0 | true | true |
| 53 | `dashboard_widgets` | reporting | `0030_reporting_dashboards.sql` | 9 | 0 | true | true |
| 54 | `scheduled_deliveries` | reporting | `0031_reporting_scheduled_deliveries.sql` | 17 | 0 | true | true |
| 55 | `delivery_runs` | reporting | `0031_reporting_scheduled_deliveries.sql` | 11 | 0 | true | true |
| 56 | `workflow_definitions` | workflow | `0032_workflow_definitions_runs.sql` | 18 | 0 | true | true |
| 57 | `workflow_runs` | workflow | `0032_workflow_definitions_runs.sql` | 16 | 0 | true | true |
| 58 | `webhook_endpoints` | webhook | `0033_webhook_endpoints_deliveries.sql` | 14 | 0 | true | true |
| 59 | `webhook_deliveries` | webhook | `0033_webhook_endpoints_deliveries.sql` | 15 | 0 | true | true |
| 60 | `openerp_sessions` | openerp | `0034_openerp_sessions.sql` | 13 | 0 | true | false |
| 61 | `oidc_state` | oidc | `0035_oidc_state.sql` | 6 | 0 | false | false |
| 62 | `email_sends` | foundation | `0040_foundation_email_sends.sql` | 14 | 1 | true | true |
| 63 | `bank_accounts` | banking | `0041_banking_reconciliation.sql` | 12 | 2 | true | true |
| 64 | `bank_transactions` | banking | `0041_banking_reconciliation.sql` | 13 | 5 | true | true |
| 65 | `reconciliation_links` | banking | `0041_banking_reconciliation.sql` | 12 | 1 | true | true |
| 66 | `auth_email_verifications` | auth | `0042_auth_email_verification.sql` | 9 | 0 | true | true |
| 67 | `auth_pending_tenant_selections` | auth | `0043_auth_pending_tenant_selections.sql` | 8 | 0 | true | true |

### 2.3 Entities — columns (67, verbatim)

Notation per column row: `type` as extracted; `NN` = `notNull: true`; `→ entity(field)` with the delete rule = extracted typed reference; `enum[…]` = enumerated values of §2.5; `check(…)` = extracted column CHECK of §2.6; `+file` = `addedBy` migration. Rows without a marker carry no such property in [ONT].

#### `organizations` — module `foundation`, source `0001_foundation.sql`, tenant: false, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `legal_name` | `text` | NN |
| `display_name` | `text` | NN |
| `slug` | `text` | NN |
| `status` | `text` | NN; enum[active \| suspended] |
| `default_locale` | `text` | NN; enum[en \| fr] |
| `default_currency` | `text` | NN |
| `default_timezone` | `text` | NN |
| `country` | `text` | NN |
| `province_state` | `text` | NN |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `tenant_settings` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `organization_id` | `uuid` | → `organizations(id)` / no action (default) |
| `supported_locales` | `text[]` | NN |
| `primary_locale` | `text` | NN; enum[en \| fr] |
| `tax_region` | `text` | NN |
| `fiscal_year_start` | `text` | NN |
| `document_numbering_policy` | `jsonb` | NN |
| `retention_policy` | `jsonb` | NN |
| `self_hosted_update_state` | `jsonb` | NN |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `gst_registration_number` | `text` | +`0038_billing_issuer_tenant_settings.sql` |
| `qst_registration_number` | `text` | +`0038_billing_issuer_tenant_settings.sql` |
| `issuer_address` | `jsonb` | +`0038_billing_issuer_tenant_settings.sql` |

#### `users` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `email` | `text` | NN |
| `display_name` | `text` | NN |
| `preferred_locale` | `text` | NN; enum[en \| fr] |
| `status` | `text` | NN; enum[invited \| active \| deactivated] |
| `password_hash` | `text` | — |
| `mfa_state` | `text` | NN |
| `last_login_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `teams` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `parent_team_id` | `uuid` | → `teams(id)` / no action (default) |
| `manager_user_id` | `uuid` | → `users(id)` / no action (default) |
| `status` | `text` | NN |

#### `roles` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `description` | `text` | NN |
| `system_role` | `boolean` | NN |
| `status` | `text` | NN |

#### `permission_grants` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `role_id` | `uuid` | → `roles(id)` / no action (default) |
| `user_id` | `uuid` | → `users(id)` / no action (default) |
| `resource` | `text` | NN |
| `action` | `text` | NN |
| `scope` | `text` | NN |
| `conditions` | `jsonb` | NN |
| `created_by` | `uuid` | → `users(id)` / no action (default) |
| `created_at` | `timestamptz` | NN |

#### `audit_events` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `actor_user_id` | `uuid` | → `users(id)` / no action (default) |
| `actor_type` | `text` | NN |
| `action` | `text` | NN |
| `resource_type` | `text` | NN |
| `resource_id` | `text` | NN |
| `before_summary` | `jsonb` | — |
| `after_summary` | `jsonb` | — |
| `ip_hash` | `text` | — |
| `user_agent_hash` | `text` | — |
| `created_at` | `timestamptz` | NN |
| `source` | `text` | +`0002_canon_entities.sql` |
| `agent_id` | `text` | +`0002_canon_entities.sql` |
| `tool_call_id` | `text` | +`0002_canon_entities.sql` |
| `policy_decision_id` | `text` | +`0002_canon_entities.sql` |
| `delegation_id` | `text` | +`0002_canon_entities.sql` |
| `approval_request_id` | `uuid` | → `approval_requests(id)` / n-a; +`0002_canon_entities.sql` |

#### `file_objects` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `storage_key` | `text` | NN |
| `filename` | `text` | NN |
| `content_type` | `text` | NN |
| `size_bytes` | `bigint` | NN; check(size_bytes >= 0) |
| `checksum` | `text` | NN |
| `visibility_scope` | `text` | NN |
| `created_by` | `uuid` | → `users(id)` / no action (default) |
| `created_at` | `timestamptz` | NN |

#### `comments` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `resource_type` | `text` | NN |
| `resource_id` | `text` | NN |
| `body` | `text` | NN |
| `visibility` | `text` | NN |
| `created_by` | `uuid` | → `users(id)` / no action (default) |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `notifications` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `recipient_user_id` | `uuid` | NN; → `users(id)` / no action (default) |
| `channel` | `text` | NN |
| `subject_key` | `text` | NN |
| `body_key` | `text` | NN |
| `payload` | `jsonb` | NN |
| `status` | `text` | NN |
| `created_at` | `timestamptz` | NN |
| `read_at` | `timestamptz` | — |

#### `domain_events` — module `foundation`, source `0001_foundation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `event_type` | `text` | NN |
| `resource_type` | `text` | NN |
| `resource_id` | `text` | NN |
| `payload_summary` | `jsonb` | NN |
| `emitted_at` | `timestamptz` | NN |
| `consumed_at` | `timestamptz` | — |

#### `user_identities` — module `canon`, source `0002_canon_entities.sql`, tenant: false, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `email` | `text` | NN |
| `display_name` | `text` | NN |
| `preferred_locale` | `text` | NN; enum[en \| fr] |
| `mfa_state` | `text` | NN; enum[not_configured \| passkey \| totp] |
| `status` | `text` | NN; enum[invited \| active \| deactivated] |
| `actor_type` | `text` | NN; enum[human \| agent \| system] |
| `last_login_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `email_verified` | `boolean` | NN; +`0042_auth_email_verification.sql` |

#### `organization_members` — module `canon`, source `0002_canon_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `user_identity_id` | `uuid` | NN; → `user_identities(id)` / no action (default) |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `status` | `text` | NN; enum[invited \| active \| deactivated] |
| `preferred_locale` | `text` | enum[en \| fr] |
| `joined_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `fx_rate_snapshots` — module `canon`, source `0002_canon_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `source_currency` | `char(3)` | NN |
| `target_currency` | `char(3)` | NN |
| `rate` | `numeric(20, 10)` | NN; check(rate > 0) |
| `effective_at` | `timestamptz` | NN |
| `source` | `text` | NN |
| `created_at` | `timestamptz` | NN |

#### `timeline_entries` — module `canon`, source `0002_canon_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `resource_type` | `text` | NN |
| `resource_id` | `text` | NN |
| `actor_user_identity_id` | `uuid` | → `user_identities(id)` / no action (default) |
| `entry_type` | `text` | NN |
| `payload_summary` | `jsonb` | NN |
| `occurred_at` | `timestamptz` | NN |

#### `approval_requests` — module `canon`, source `0002_canon_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `requester_user_identity_id` | `uuid` | NN; → `user_identities(id)` / no action (default) |
| `approver_user_identity_id` | `uuid` | → `user_identities(id)` / no action (default) |
| `approver_role_id` | `uuid` | → `roles(id)` / no action (default) |
| `subject_type` | `text` | NN |
| `subject_id` | `text` | NN |
| `reason` | `text` | NN |
| `urgency` | `text` | NN; enum[low \| normal \| high] |
| `status` | `text` | NN; enum[pending \| approved \| rejected \| escalated \| expired] |
| `decision_reason` | `text` | — |
| `decided_at` | `timestamptz` | — |
| `expires_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `idempotency_records` — module `canon`, source `0002_canon_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `key` | `text` | NN |
| `request_hash` | `text` | NN |
| `response_body_hash` | `text` | NN |
| `status_code` | `integer` | NN |
| `created_at` | `timestamptz` | NN |
| `expires_at` | `timestamptz` | NN |

#### `translation_keys` — module `translation`, source `0004_translation_keys.sql`, tenant: true, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `namespace` | `text` | NN |
| `key` | `text` | NN |
| `locale` | `text` | NN; enum[en \| fr] |
| `label` | `text` | NN |
| `description` | `text` | — |
| `status` | `text` | NN; enum[draft \| active \| archived] |
| `updated_at` | `timestamptz` | NN |

#### `jobs` — module `jobs`, source `0005_jobs.sql`, tenant: true, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `job_type` | `text` | NN |
| `payload` | `jsonb` | NN |
| `status` | `text` | NN; enum[queued \| running \| succeeded \| failed \| cancelled] |
| `attempts` | `integer` | NN |
| `idempotency_key` | `text` | — |
| `scheduled_at` | `timestamptz` | NN |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `last_error` | `text` | — |

#### `passkey_credentials` — module `passkey`, source `0006_passkey_credentials.sql`, tenant: false, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `user_identity_id` | `uuid` | NN; → `user_identities(id)` / cascade |
| `credential_id` | `text` | NN |
| `public_key_cose` | `text` | NN |
| `sign_count` | `bigint` | NN |
| `transports` | `text[]` | NN |
| `aaguid` | `uuid` | — |
| `label` | `text` | NN |
| `backed_up` | `boolean` | NN |
| `device_type` | `text` | NN; enum[singleDevice \| multiDevice] |
| `created_at` | `timestamptz` | NN |
| `last_used_at` | `timestamptz` | — |

#### `passkey_challenges` — module `passkey`, source `0006_passkey_credentials.sql`, tenant: false, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `user_identity_id` | `uuid` | → `user_identities(id)` / cascade |
| `challenge` | `text` | NN |
| `purpose` | `text` | NN; enum[registration \| authentication] |
| `created_at` | `timestamptz` | NN |
| `expires_at` | `timestamptz` | NN |

#### `agent_definitions` — module `agentic`, source `0008_agentic_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `capabilities` | `jsonb` | NN |
| `tools` | `jsonb` | NN |
| `policies` | `jsonb` | NN |
| `budget_caps` | `jsonb` | NN |
| `identity_mode` | `text` | NN; enum[acting_as \| service_principal \| on_behalf_of] |
| `status` | `text` | NN; enum[active \| suspended \| archived] |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `agent_runs` — module `agentic`, source `0008_agentic_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `agent_definition_id` | `uuid` | NN; → `agent_definitions(id)` / no action (default) |
| `triggered_by_user_id` | `uuid` | → `users(id)` / no action (default) |
| `triggered_by_workflow_run_id` | `uuid` | — |
| `acting_principal` | `text` | NN |
| `on_behalf_of` | `text` | — |
| `mode` | `text` | NN; enum[acting_as \| service_principal \| on_behalf_of] |
| `status` | `text` | NN; enum[pending \| running \| succeeded \| failed \| cancelled \| awaiting_approval] |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `budget_consumed` | `jsonb` | NN |
| `approval_request_id` | `uuid` | → `approval_requests(id)` / no action (default) |
| `trace_id` | `text` | — |
| `created_at` | `timestamptz` | NN |
| `policy_decision_id` | `uuid` | → `policy_decisions(id)` / n-a; +`0008_agentic_entities.sql` |

#### `policy_decisions` — module `agentic`, source `0008_agentic_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `agent_run_id` | `uuid` | NN; → `agent_runs(id)` / no action (default) |
| `tool_call_id` | `uuid` | — |
| `policy_id` | `text` | NN |
| `decision` | `text` | NN; enum[allow \| deny \| require_approval] |
| `reason` | `text` | NN |
| `evaluated_at` | `timestamptz` | NN |
| `created_at` | `timestamptz` | NN |

#### `tool_calls` — module `agentic`, source `0008_agentic_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `agent_run_id` | `uuid` | NN; → `agent_runs(id)` / no action (default) |
| `tool_name` | `text` | NN |
| `input` | `jsonb` | NN |
| `output` | `jsonb` | — |
| `status` | `text` | NN; enum[pending \| running \| succeeded \| failed] |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `otel_span_id` | `text` | — |
| `created_at` | `timestamptz` | NN |

#### `supervision_requests` — module `agentic`, source `0008_agentic_entities.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `agent_run_id` | `uuid` | NN; → `agent_runs(id)` / no action (default) |
| `mode` | `text` | NN; enum[inline \| panel] |
| `assigned_to_user_id` | `uuid` | → `users(id)` / no action (default) |
| `decision` | `text` | enum[approve \| reject \| escalate] |
| `decided_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `companies` — module `crm`, source `0010_crm_companies.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `display_name` | `text` | NN |
| `legal_name` | `text` | — |
| `status` | `text` | NN; enum[active \| archived] |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `team_id` | `uuid` | → `teams(id)` / no action (default) |
| `website` | `text` | — |
| `phone` | `text` | — |
| `email` | `text` | — |
| `language` | `text` | check(language is null or language in ('en', 'fr') |
| `tax_region` | `text` | — |
| `billing_address` | `jsonb` | — |
| `shipping_address` | `jsonb` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `deleted_at` | `timestamptz` | +`0014_crm_soft_delete.sql` |

#### `contacts` — module `crm`, source `0011_crm_contacts.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `company_id` | `uuid` | → `companies(id)` / no action (default) |
| `display_name` | `text` | NN |
| `first_name` | `text` | — |
| `last_name` | `text` | — |
| `title` | `text` | — |
| `email` | `text` | — |
| `phone` | `text` | — |
| `language` | `text` | check(language is null or language in ('en', 'fr') |
| `status` | `text` | NN; enum[active \| inactive] |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `deleted_at` | `timestamptz` | +`0014_crm_soft_delete.sql` |

#### `pipeline_stages` — module `crm`, source `0012_crm_pipeline.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `order_index` | `integer` | NN |
| `is_initial` | `boolean` | NN |
| `is_won` | `boolean` | NN |
| `is_lost` | `boolean` | NN |
| `active` | `boolean` | NN |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `opportunities` — module `crm`, source `0012_crm_pipeline.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `company_id` | `uuid` | NN; → `companies(id)` / no action (default) |
| `primary_contact_id` | `uuid` | → `contacts(id)` / no action (default) |
| `name` | `text` | NN |
| `stage_id` | `uuid` | NN; → `pipeline_stages(id)` / no action (default) |
| `status` | `text` | NN; enum[open \| won \| lost \| archived] |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `team_id` | `uuid` | → `teams(id)` / no action (default) |
| `expected_value` | `jsonb` | — |
| `currency` | `text` | — |
| `expected_close_date` | `date` | — |
| `probability_band` | `text` | check(probability_band is null or probability_band in ('low', 'medium', 'high') |
| `service_summary` | `text` | — |
| `loss_reason` | `text` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `deleted_at` | `timestamptz` | +`0014_crm_soft_delete.sql` |

#### `leads` — module `crm`, source `0013_crm_leads.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `source` | `text` | — |
| `display_name` | `text` | NN |
| `company_name` | `text` | — |
| `contact_name` | `text` | — |
| `email` | `text` | — |
| `phone` | `text` | — |
| `description` | `text` | — |
| `status` | `text` | NN; enum[new \| working \| converted \| disqualified] |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `team_id` | `uuid` | → `teams(id)` / no action (default) |
| `converted_at` | `timestamptz` | — |
| `converted_company_id` | `uuid` | → `companies(id)` / no action (default) |
| `converted_contact_id` | `uuid` | → `contacts(id)` / no action (default) |
| `converted_opportunity_id` | `uuid` | → `opportunities(id)` / no action (default) |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `deleted_at` | `timestamptz` | +`0014_crm_soft_delete.sql` |

#### `projects` — module `project`, source `0015_project_projects.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `description` | `text` | — |
| `status` | `text` | NN; enum[draft \| active \| on_hold \| completed \| cancelled] |
| `code` | `text` | — |
| `company_id` | `uuid` | → `companies(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `start_date` | `date` | — |
| `end_date` | `date` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `project_tasks` — module `project`, source `0016_project_tasks.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `project_id` | `uuid` | NN; → `projects(id)` / no action (default) |
| `title` | `text` | NN |
| `description` | `text` | — |
| `status` | `text` | NN; enum[todo \| in_progress \| blocked \| done \| cancelled] |
| `assignee_user_id` | `uuid` | → `users(id)` / no action (default) |
| `due_date` | `date` | — |
| `completed_at` | `timestamptz` | — |
| `parent_task_id` | `uuid` | → `project_tasks(id)` / no action (default) |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `time_entries` — module `project`, source `0017_project_time_entries.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `project_id` | `uuid` | NN; → `projects(id)` / no action (default) |
| `project_task_id` | `uuid` | → `project_tasks(id)` / no action (default) |
| `user_id` | `uuid` | NN; → `users(id)` / no action (default) |
| `entry_date` | `date` | NN |
| `minutes` | `integer` | NN; check(minutes > 0) |
| `description` | `text` | — |
| `billable` | `boolean` | NN |
| `status` | `text` | NN; enum[draft \| submitted \| approved \| rejected] |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `approval_request_id` | `uuid` | → `approval_requests(id)` / n-a; +`0025_project_time_approval.sql` |

#### `rates` — module `project`, source `0018_project_rates.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `amount` | `jsonb` | NN |
| `effective_from` | `date` | NN |
| `effective_to` | `date` | — |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `assignments` — module `project`, source `0019_project_assignments.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `project_id` | `uuid` | NN; → `projects(id)` / no action (default) |
| `user_id` | `uuid` | NN; → `users(id)` / no action (default) |
| `role_label` | `text` | — |
| `allocation_percent` | `integer` | check(allocation_percent between 0 and 100) |
| `start_date` | `date` | — |
| `end_date` | `date` | — |
| `billable_rate_id` | `uuid` | → `rates(id)` / no action (default) |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `invoice_proposals` — module `project`, source `0020_project_invoice_proposals.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `project_id` | `uuid` | NN; → `projects(id)` / no action (default) |
| `company_id` | `uuid` | → `companies(id)` / no action (default) |
| `status` | `text` | NN; enum[draft \| submitted \| approved \| rejected] |
| `period_start` | `date` | — |
| `period_end` | `date` | — |
| `total` | `jsonb` | NN |
| `currency` | `text` | NN |
| `submitted_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `invoice_proposal_lines` — module `project`, source `0020_project_invoice_proposals.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `invoice_proposal_id` | `uuid` | NN; → `invoice_proposals(id)` / no action (default) |
| `source_type` | `text` | NN |
| `source_id` | `uuid` | — |
| `description` | `text` | — |
| `quantity_minutes` | `integer` | NN |
| `unit_rate` | `jsonb` | NN |
| `amount` | `jsonb` | NN |
| `created_at` | `timestamptz` | NN |

#### `invoices` — module `billing`, source `0021_billing_invoices.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `company_id` | `uuid` | NN; → `companies(id)` / no action (default) |
| `project_id` | `uuid` | → `projects(id)` / no action (default) |
| `invoice_proposal_id` | `uuid` | → `invoice_proposals(id)` / no action (default) |
| `invoice_number` | `text` | NN |
| `status` | `text` | NN; enum[draft \| issued \| paid \| partially_paid \| void \| written_off] |
| `currency` | `text` | NN |
| `subtotal` | `jsonb` | NN |
| `tax_total` | `jsonb` | NN |
| `total` | `jsonb` | NN |
| `issue_date` | `date` | — |
| `due_date` | `date` | — |
| `issued_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `tax_category_id` | `uuid` | → `tax_categories(id)` / n-a; +`0023_billing_taxes.sql` |
| `tax_breakdown` | `jsonb` | +`0023_billing_taxes.sql` |
| `notes` | `text` | +`0037_billing_invoice_document_fields.sql` |
| `po_number` | `text` | +`0037_billing_invoice_document_fields.sql` |
| `payment_terms_days` | `integer` | +`0037_billing_invoice_document_fields.sql` |
| `issuer_snapshot` | `jsonb` | +`0039_billing_invoice_identity_snapshots.sql` |
| `customer_snapshot` | `jsonb` | +`0039_billing_invoice_identity_snapshots.sql` |

#### `invoice_lines` — module `billing`, source `0021_billing_invoices.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `invoice_id` | `uuid` | NN; → `invoices(id)` / no action (default) |
| `source_type` | `text` | NN |
| `source_id` | `uuid` | — |
| `description` | `text` | — |
| `quantity` | `integer` | NN |
| `unit_price` | `jsonb` | NN |
| `amount` | `jsonb` | NN |
| `created_at` | `timestamptz` | NN |

#### `payments` — module `billing`, source `0022_billing_payments.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `invoice_id` | `uuid` | NN; → `invoices(id)` / no action (default) |
| `company_id` | `uuid` | → `companies(id)` / no action (default) |
| `amount` | `jsonb` | NN |
| `payment_date` | `date` | NN |
| `method` | `text` | NN; enum[bank_transfer \| card \| cheque \| cash \| other] |
| `reference` | `text` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `tax_categories` — module `billing`, source `0023_billing_taxes.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `name` | `text` | NN |
| `code` | `text` | NN |
| `description` | `text` | — |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `tax_rate_versions` — module `billing`, source `0023_billing_taxes.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `tax_category_id` | `uuid` | NN; → `tax_categories(id)` / no action (default) |
| `jurisdiction` | `text` | NN |
| `label` | `text` | NN |
| `rate_bps` | `integer` | NN; check(rate_bps >= 0) |
| `compound` | `boolean` | NN |
| `effective_from` | `date` | NN |
| `effective_to` | `date` | — |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `accounts` — module `billing`, source `0024_billing_accounting.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `code` | `text` | NN |
| `name` | `text` | NN |
| `type` | `text` | NN; enum[asset \| liability \| equity \| revenue \| expense] |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `journal_entries` — module `billing`, source `0024_billing_accounting.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `entry_date` | `date` | NN |
| `reference` | `text` | — |
| `description` | `text` | — |
| `source_type` | `text` | NN; enum[invoice \| payment \| manual] |
| `source_id` | `uuid` | — |
| `status` | `text` | NN; enum[draft \| posted \| void] |
| `posted_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `journal_entry_lines` — module `billing`, source `0024_billing_accounting.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `journal_entry_id` | `uuid` | NN; → `journal_entries(id)` / no action (default) |
| `account_id` | `uuid` | NN; → `accounts(id)` / no action (default) |
| `debit` | `jsonb` | NN |
| `credit` | `jsonb` | NN |
| `description` | `text` | — |
| `created_at` | `timestamptz` | NN |

#### `quote_handoffs` — module `crm`, source `0026_crm_quote_handoffs.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `opportunity_id` | `uuid` | NN; → `opportunities(id)` / no action (default) |
| `target_type` | `text` | NN; enum[invoice \| project \| subscription] |
| `status` | `text` | NN; enum[pending \| accepted \| rejected \| cancelled] |
| `requested_by_user_id` | `uuid` | → `users(id)` / no action (default) |
| `accepted_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `recurring_billing_schedules` — module `billing`, source `0027_billing_recurring_schedules.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `company_id` | `uuid` | NN; → `companies(id)` / no action (default) |
| `description` | `text` | — |
| `cadence` | `text` | NN; enum[weekly \| monthly \| quarterly \| annual] |
| `amount` | `jsonb` | NN |
| `currency` | `text` | NN |
| `next_run_at` | `date` | NN |
| `active` | `boolean` | NN |
| `last_invoice_id` | `uuid` | → `invoices(id)` / no action (default) |
| `last_run_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `saved_views` — module `reporting`, source `0028_reporting_saved_views.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `resource_type` | `text` | NN |
| `name` | `text` | NN |
| `filters` | `jsonb` | NN |
| `columns` | `jsonb` | NN |
| `sort_by` | `text` | — |
| `is_shared` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `report_definitions` — module `reporting`, source `0029_reporting_report_definitions.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `report_type` | `text` | NN |
| `name` | `text` | NN |
| `parameters` | `jsonb` | NN |
| `is_shared` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `report_runs` — module `reporting`, source `0029_reporting_report_definitions.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `report_definition_id` | `uuid` | NN; → `report_definitions(id)` / no action (default) |
| `triggered_by_user_id` | `uuid` | → `users(id)` / no action (default) |
| `status` | `text` | NN; enum[completed \| failed] |
| `parameters_snapshot` | `jsonb` | NN |
| `result_columns` | `jsonb` | NN |
| `result_rows` | `jsonb` | NN |
| `row_count` | `integer` | NN |
| `error_detail` | `text` | — |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `dashboards` — module `reporting`, source `0030_reporting_dashboards.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `name` | `text` | NN |
| `description` | `text` | — |
| `is_shared` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `dashboard_widgets` — module `reporting`, source `0030_reporting_dashboards.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `dashboard_id` | `uuid` | NN; → `dashboards(id)` / no action (default) |
| `report_definition_id` | `uuid` | NN; → `report_definitions(id)` / no action (default) |
| `title` | `text` | — |
| `position` | `integer` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `scheduled_deliveries` — module `reporting`, source `0031_reporting_scheduled_deliveries.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `name` | `text` | NN |
| `target_type` | `text` | NN; enum[report_definition] |
| `target_id` | `uuid` | NN |
| `cadence` | `text` | NN; enum[daily \| weekly \| monthly \| quarterly \| annual] |
| `timezone` | `text` | NN |
| `next_run_at` | `timestamptz` | NN |
| `last_run_at` | `timestamptz` | — |
| `channel` | `text` | NN; enum[in_app] |
| `recipient_user_ids` | `jsonb` | NN |
| `is_shared` | `boolean` | NN |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `delivery_runs` — module `reporting`, source `0031_reporting_scheduled_deliveries.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `scheduled_delivery_id` | `uuid` | NN; → `scheduled_deliveries(id)` / no action (default) |
| `report_run_id` | `uuid` | → `report_runs(id)` / no action (default) |
| `triggered_by` | `text` | NN; enum[schedule \| manual] |
| `status` | `text` | NN; enum[completed \| failed \| skipped] |
| `error_detail` | `text` | — |
| `snapshot_summary` | `jsonb` | NN |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `workflow_definitions` — module `workflow`, source `0032_workflow_definitions_runs.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `name` | `text` | NN |
| `description` | `text` | — |
| `trigger_type` | `text` | NN |
| `trigger_config` | `jsonb` | NN |
| `action_type` | `text` | NN |
| `action_config` | `jsonb` | NN |
| `is_active` | `boolean` | NN |
| `is_shared` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `cadence` | `text` | +`0036_workflow_schedules.sql` |
| `timezone` | `text` | +`0036_workflow_schedules.sql` |
| `next_run_at` | `timestamptz` | +`0036_workflow_schedules.sql` |
| `last_run_at` | `timestamptz` | +`0036_workflow_schedules.sql` |

#### `workflow_runs` — module `workflow`, source `0032_workflow_definitions_runs.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `workflow_definition_id` | `uuid` | NN; → `workflow_definitions(id)` / no action (default) |
| `trigger_audit_event_id` | `uuid` | — |
| `trigger_event_type` | `text` | NN |
| `trigger_resource_type` | `text` | — |
| `trigger_resource_id` | `uuid` | — |
| `triggered_by` | `text` | NN; enum[event \| manual] |
| `status` | `text` | NN; enum[completed \| failed \| skipped] |
| `created_resource_type` | `text` | — |
| `created_resource_id` | `uuid` | — |
| `action_result` | `jsonb` | NN |
| `error_detail` | `text` | — |
| `started_at` | `timestamptz` | — |
| `completed_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `webhook_endpoints` — module `webhook`, source `0033_webhook_endpoints_deliveries.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `owner_user_id` | `uuid` | → `users(id)` / no action (default) |
| `name` | `text` | NN |
| `target_url` | `text` | NN; check(target_url like 'https://%') |
| `signing_secret` | `text` | NN |
| `event_types` | `jsonb` | NN |
| `is_active` | `boolean` | NN |
| `is_shared` | `boolean` | NN |
| `consecutive_failures` | `integer` | NN |
| `disabled_at` | `timestamptz` | — |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `webhook_deliveries` — module `webhook`, source `0033_webhook_endpoints_deliveries.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `webhook_endpoint_id` | `uuid` | NN; → `webhook_endpoints(id)` / no action (default) |
| `event_type` | `text` | NN |
| `trigger_audit_event_id` | `uuid` | — |
| `payload` | `jsonb` | NN |
| `signature` | `text` | NN |
| `status` | `text` | NN; enum[pending_egress \| succeeded \| failed] |
| `http_status` | `integer` | — |
| `attempt_count` | `integer` | NN |
| `next_retry_at` | `timestamptz` | — |
| `error_detail` | `text` | — |
| `signed_at` | `timestamptz` | NN |
| `delivered_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `openerp_sessions` — module `openerp`, source `0034_openerp_sessions.sql`, tenant: true, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `user_identity_id` | `uuid` | NN; → `user_identities(id)` / cascade |
| `organization_id` | `uuid` | NN; → `organizations(id)` / cascade |
| `session_token_hash` | `text` | NN |
| `refresh_token_hash` | `text` | — |
| `device_name` | `text` | — |
| `ip_address` | `text` | — |
| `user_agent` | `text` | — |
| `mfa_verified` | `boolean` | NN |
| `expires_at` | `timestamptz` | NN |
| `created_at` | `timestamptz` | NN |
| `last_activity_at` | `timestamptz` | NN |
| `revoked_at` | `timestamptz` | — |

#### `oidc_state` — module `oidc`, source `0035_oidc_state.sql`, tenant: false, forced RLS: false
| Column | Type | Properties |
|---|---|---|
| `state` | `text` | — |
| `nonce` | `text` | NN |
| `code_verifier` | `text` | NN |
| `redirect_after` | `text` | — |
| `created_at` | `timestamptz` | NN |
| `expires_at` | `timestamptz` | NN |

#### `email_sends` — module `foundation`, source `0040_foundation_email_sends.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `to_address` | `text` | NN |
| `subject` | `text` | NN |
| `kind` | `text` | NN |
| `resource_type` | `text` | — |
| `resource_id` | `uuid` | — |
| `status` | `text` | NN; enum[queued \| sent \| failed] |
| `provider` | `text` | NN |
| `idempotency_key` | `text` | NN |
| `error` | `text` | — |
| `sent_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `bank_accounts` — module `banking`, source `0041_banking_reconciliation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `provider` | `text` | NN; enum[ofx \| plaid_sandbox] |
| `provider_account_ref` | `text` | NN |
| `display_name` | `text` | NN |
| `account_type` | `text` | NN; enum[checking \| savings \| credit \| loan \| investment \| other] |
| `currency` | `text` | NN |
| `institution` | `text` | NN |
| `active` | `boolean` | NN |
| `deleted_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

#### `bank_transactions` — module `banking`, source `0041_banking_reconciliation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `bank_account_id` | `uuid` | NN |
| `provider` | `text` | NN; enum[ofx \| plaid_sandbox] |
| `provider_transaction_ref` | `text` | NN |
| `posted_at` | `timestamptz` | NN |
| `amount` | `jsonb` | NN |
| `raw_description` | `text` | NN |
| `normalized_snapshot` | `jsonb` | NN |
| `reconciliation_status` | `text` | NN; enum[unmatched \| matched \| ignored] |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `constraint` | `bank_transactions_account_provider_fk` | — |

#### `reconciliation_links` — module `banking`, source `0041_banking_reconciliation.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | NN; → `organizations(id)` / no action (default) |
| `bank_transaction_id` | `uuid` | NN |
| `candidate_kind` | `text` | NN; check(candidate_kind = 'payment') |
| `candidate_id` | `uuid` | NN |
| `score` | `numeric` | NN; check(score >= 0 and score <= 1) |
| `reasons` | `jsonb` | NN |
| `status` | `text` | NN; enum[proposed \| confirmed \| rejected] |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |
| `constraint` | `reconciliation_links_transaction_fk` | — |
| `constraint` | `reconciliation_links_payment_fk` | — |

#### `auth_email_verifications` — module `auth`, source `0042_auth_email_verification.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | → `organizations(id)` / no action (default) |
| `email` | `text` | NN |
| `code_hash` | `text` | NN |
| `verification_token` | `text` | — |
| `expires_at` | `timestamptz` | NN |
| `used` | `boolean` | NN |
| `used_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

#### `auth_pending_tenant_selections` — module `auth`, source `0043_auth_pending_tenant_selections.sql`, tenant: true, forced RLS: true
| Column | Type | Properties |
|---|---|---|
| `id` | `uuid` | — |
| `organization_id` | `uuid` | → `organizations(id)` / no action (default) |
| `user_identity_id` | `uuid` | NN; → `user_identities(id)` / cascade |
| `ceremony_id` | `text` | NN |
| `token_hash` | `text` | NN |
| `expires_at` | `timestamptz` | NN |
| `consumed_at` | `timestamptz` | — |
| `created_at` | `timestamptz` | NN |

### 2.4 Typed relations (146, verbatim)

Every row of [ONT] `relations`: `from.field → to`, `required` = source column `notNull`, and the delete rule. Relation count per direction is not aggregated here; the table is the transcription.

| # | From | Field | To | Required | On delete |
|---|---|---|---|---|---|
| 1 | `tenant_settings` | `organization_id` | `organizations` | false | no action (default) |
| 2 | `users` | `organization_id` | `organizations` | true | no action (default) |
| 3 | `teams` | `organization_id` | `organizations` | true | no action (default) |
| 4 | `teams` | `parent_team_id` | `teams` | false | no action (default) |
| 5 | `teams` | `manager_user_id` | `users` | false | no action (default) |
| 6 | `roles` | `organization_id` | `organizations` | true | no action (default) |
| 7 | `permission_grants` | `organization_id` | `organizations` | true | no action (default) |
| 8 | `permission_grants` | `role_id` | `roles` | false | no action (default) |
| 9 | `permission_grants` | `user_id` | `users` | false | no action (default) |
| 10 | `permission_grants` | `created_by` | `users` | false | no action (default) |
| 11 | `audit_events` | `organization_id` | `organizations` | true | no action (default) |
| 12 | `audit_events` | `actor_user_id` | `users` | false | no action (default) |
| 13 | `audit_events` | `approval_request_id` | `approval_requests` | false | n-a |
| 14 | `file_objects` | `organization_id` | `organizations` | true | no action (default) |
| 15 | `file_objects` | `created_by` | `users` | false | no action (default) |
| 16 | `comments` | `organization_id` | `organizations` | true | no action (default) |
| 17 | `comments` | `created_by` | `users` | false | no action (default) |
| 18 | `notifications` | `organization_id` | `organizations` | true | no action (default) |
| 19 | `notifications` | `recipient_user_id` | `users` | true | no action (default) |
| 20 | `domain_events` | `organization_id` | `organizations` | true | no action (default) |
| 21 | `organization_members` | `user_identity_id` | `user_identities` | true | no action (default) |
| 22 | `organization_members` | `organization_id` | `organizations` | true | no action (default) |
| 23 | `fx_rate_snapshots` | `organization_id` | `organizations` | true | no action (default) |
| 24 | `timeline_entries` | `organization_id` | `organizations` | true | no action (default) |
| 25 | `timeline_entries` | `actor_user_identity_id` | `user_identities` | false | no action (default) |
| 26 | `approval_requests` | `organization_id` | `organizations` | true | no action (default) |
| 27 | `approval_requests` | `requester_user_identity_id` | `user_identities` | true | no action (default) |
| 28 | `approval_requests` | `approver_user_identity_id` | `user_identities` | false | no action (default) |
| 29 | `approval_requests` | `approver_role_id` | `roles` | false | no action (default) |
| 30 | `idempotency_records` | `organization_id` | `organizations` | true | no action (default) |
| 31 | `translation_keys` | `organization_id` | `organizations` | true | no action (default) |
| 32 | `jobs` | `organization_id` | `organizations` | true | no action (default) |
| 33 | `passkey_credentials` | `user_identity_id` | `user_identities` | true | cascade |
| 34 | `passkey_challenges` | `user_identity_id` | `user_identities` | false | cascade |
| 35 | `agent_definitions` | `organization_id` | `organizations` | true | no action (default) |
| 36 | `agent_runs` | `organization_id` | `organizations` | true | no action (default) |
| 37 | `agent_runs` | `agent_definition_id` | `agent_definitions` | true | no action (default) |
| 38 | `agent_runs` | `triggered_by_user_id` | `users` | false | no action (default) |
| 39 | `agent_runs` | `approval_request_id` | `approval_requests` | false | no action (default) |
| 40 | `agent_runs` | `policy_decision_id` | `policy_decisions` | false | n-a |
| 41 | `policy_decisions` | `organization_id` | `organizations` | true | no action (default) |
| 42 | `policy_decisions` | `agent_run_id` | `agent_runs` | true | no action (default) |
| 43 | `tool_calls` | `organization_id` | `organizations` | true | no action (default) |
| 44 | `tool_calls` | `agent_run_id` | `agent_runs` | true | no action (default) |
| 45 | `supervision_requests` | `organization_id` | `organizations` | true | no action (default) |
| 46 | `supervision_requests` | `agent_run_id` | `agent_runs` | true | no action (default) |
| 47 | `supervision_requests` | `assigned_to_user_id` | `users` | false | no action (default) |
| 48 | `companies` | `organization_id` | `organizations` | true | no action (default) |
| 49 | `companies` | `owner_user_id` | `users` | false | no action (default) |
| 50 | `companies` | `team_id` | `teams` | false | no action (default) |
| 51 | `contacts` | `organization_id` | `organizations` | true | no action (default) |
| 52 | `contacts` | `company_id` | `companies` | false | no action (default) |
| 53 | `contacts` | `owner_user_id` | `users` | false | no action (default) |
| 54 | `pipeline_stages` | `organization_id` | `organizations` | true | no action (default) |
| 55 | `opportunities` | `organization_id` | `organizations` | true | no action (default) |
| 56 | `opportunities` | `company_id` | `companies` | true | no action (default) |
| 57 | `opportunities` | `primary_contact_id` | `contacts` | false | no action (default) |
| 58 | `opportunities` | `stage_id` | `pipeline_stages` | true | no action (default) |
| 59 | `opportunities` | `owner_user_id` | `users` | false | no action (default) |
| 60 | `opportunities` | `team_id` | `teams` | false | no action (default) |
| 61 | `leads` | `organization_id` | `organizations` | true | no action (default) |
| 62 | `leads` | `owner_user_id` | `users` | false | no action (default) |
| 63 | `leads` | `team_id` | `teams` | false | no action (default) |
| 64 | `leads` | `converted_company_id` | `companies` | false | no action (default) |
| 65 | `leads` | `converted_contact_id` | `contacts` | false | no action (default) |
| 66 | `leads` | `converted_opportunity_id` | `opportunities` | false | no action (default) |
| 67 | `projects` | `organization_id` | `organizations` | true | no action (default) |
| 68 | `projects` | `company_id` | `companies` | false | no action (default) |
| 69 | `projects` | `owner_user_id` | `users` | false | no action (default) |
| 70 | `project_tasks` | `organization_id` | `organizations` | true | no action (default) |
| 71 | `project_tasks` | `project_id` | `projects` | true | no action (default) |
| 72 | `project_tasks` | `assignee_user_id` | `users` | false | no action (default) |
| 73 | `project_tasks` | `parent_task_id` | `project_tasks` | false | no action (default) |
| 74 | `time_entries` | `organization_id` | `organizations` | true | no action (default) |
| 75 | `time_entries` | `project_id` | `projects` | true | no action (default) |
| 76 | `time_entries` | `project_task_id` | `project_tasks` | false | no action (default) |
| 77 | `time_entries` | `user_id` | `users` | true | no action (default) |
| 78 | `time_entries` | `approval_request_id` | `approval_requests` | false | n-a |
| 79 | `rates` | `organization_id` | `organizations` | true | no action (default) |
| 80 | `assignments` | `organization_id` | `organizations` | true | no action (default) |
| 81 | `assignments` | `project_id` | `projects` | true | no action (default) |
| 82 | `assignments` | `user_id` | `users` | true | no action (default) |
| 83 | `assignments` | `billable_rate_id` | `rates` | false | no action (default) |
| 84 | `invoice_proposals` | `organization_id` | `organizations` | true | no action (default) |
| 85 | `invoice_proposals` | `project_id` | `projects` | true | no action (default) |
| 86 | `invoice_proposals` | `company_id` | `companies` | false | no action (default) |
| 87 | `invoice_proposal_lines` | `organization_id` | `organizations` | true | no action (default) |
| 88 | `invoice_proposal_lines` | `invoice_proposal_id` | `invoice_proposals` | true | no action (default) |
| 89 | `invoices` | `organization_id` | `organizations` | true | no action (default) |
| 90 | `invoices` | `company_id` | `companies` | true | no action (default) |
| 91 | `invoices` | `project_id` | `projects` | false | no action (default) |
| 92 | `invoices` | `invoice_proposal_id` | `invoice_proposals` | false | no action (default) |
| 93 | `invoices` | `tax_category_id` | `tax_categories` | false | n-a |
| 94 | `invoice_lines` | `organization_id` | `organizations` | true | no action (default) |
| 95 | `invoice_lines` | `invoice_id` | `invoices` | true | no action (default) |
| 96 | `payments` | `organization_id` | `organizations` | true | no action (default) |
| 97 | `payments` | `invoice_id` | `invoices` | true | no action (default) |
| 98 | `payments` | `company_id` | `companies` | false | no action (default) |
| 99 | `tax_categories` | `organization_id` | `organizations` | true | no action (default) |
| 100 | `tax_rate_versions` | `organization_id` | `organizations` | true | no action (default) |
| 101 | `tax_rate_versions` | `tax_category_id` | `tax_categories` | true | no action (default) |
| 102 | `accounts` | `organization_id` | `organizations` | true | no action (default) |
| 103 | `journal_entries` | `organization_id` | `organizations` | true | no action (default) |
| 104 | `journal_entry_lines` | `organization_id` | `organizations` | true | no action (default) |
| 105 | `journal_entry_lines` | `journal_entry_id` | `journal_entries` | true | no action (default) |
| 106 | `journal_entry_lines` | `account_id` | `accounts` | true | no action (default) |
| 107 | `quote_handoffs` | `organization_id` | `organizations` | true | no action (default) |
| 108 | `quote_handoffs` | `opportunity_id` | `opportunities` | true | no action (default) |
| 109 | `quote_handoffs` | `requested_by_user_id` | `users` | false | no action (default) |
| 110 | `recurring_billing_schedules` | `organization_id` | `organizations` | true | no action (default) |
| 111 | `recurring_billing_schedules` | `company_id` | `companies` | true | no action (default) |
| 112 | `recurring_billing_schedules` | `last_invoice_id` | `invoices` | false | no action (default) |
| 113 | `saved_views` | `organization_id` | `organizations` | true | no action (default) |
| 114 | `saved_views` | `owner_user_id` | `users` | false | no action (default) |
| 115 | `report_definitions` | `organization_id` | `organizations` | true | no action (default) |
| 116 | `report_definitions` | `owner_user_id` | `users` | false | no action (default) |
| 117 | `report_runs` | `organization_id` | `organizations` | true | no action (default) |
| 118 | `report_runs` | `report_definition_id` | `report_definitions` | true | no action (default) |
| 119 | `report_runs` | `triggered_by_user_id` | `users` | false | no action (default) |
| 120 | `dashboards` | `organization_id` | `organizations` | true | no action (default) |
| 121 | `dashboards` | `owner_user_id` | `users` | false | no action (default) |
| 122 | `dashboard_widgets` | `organization_id` | `organizations` | true | no action (default) |
| 123 | `dashboard_widgets` | `dashboard_id` | `dashboards` | true | no action (default) |
| 124 | `dashboard_widgets` | `report_definition_id` | `report_definitions` | true | no action (default) |
| 125 | `scheduled_deliveries` | `organization_id` | `organizations` | true | no action (default) |
| 126 | `scheduled_deliveries` | `owner_user_id` | `users` | false | no action (default) |
| 127 | `delivery_runs` | `organization_id` | `organizations` | true | no action (default) |
| 128 | `delivery_runs` | `scheduled_delivery_id` | `scheduled_deliveries` | true | no action (default) |
| 129 | `delivery_runs` | `report_run_id` | `report_runs` | false | no action (default) |
| 130 | `workflow_definitions` | `organization_id` | `organizations` | true | no action (default) |
| 131 | `workflow_definitions` | `owner_user_id` | `users` | false | no action (default) |
| 132 | `workflow_runs` | `organization_id` | `organizations` | true | no action (default) |
| 133 | `workflow_runs` | `workflow_definition_id` | `workflow_definitions` | true | no action (default) |
| 134 | `webhook_endpoints` | `organization_id` | `organizations` | true | no action (default) |
| 135 | `webhook_endpoints` | `owner_user_id` | `users` | false | no action (default) |
| 136 | `webhook_deliveries` | `organization_id` | `organizations` | true | no action (default) |
| 137 | `webhook_deliveries` | `webhook_endpoint_id` | `webhook_endpoints` | true | no action (default) |
| 138 | `openerp_sessions` | `user_identity_id` | `user_identities` | true | cascade |
| 139 | `openerp_sessions` | `organization_id` | `organizations` | true | cascade |
| 140 | `email_sends` | `organization_id` | `organizations` | true | no action (default) |
| 141 | `bank_accounts` | `organization_id` | `organizations` | true | no action (default) |
| 142 | `bank_transactions` | `organization_id` | `organizations` | true | no action (default) |
| 143 | `reconciliation_links` | `organization_id` | `organizations` | true | no action (default) |
| 144 | `auth_email_verifications` | `organization_id` | `organizations` | false | no action (default) |
| 145 | `auth_pending_tenant_selections` | `organization_id` | `organizations` | false | no action (default) |
| 146 | `auth_pending_tenant_selections` | `user_identity_id` | `user_identities` | true | cascade |

### 2.5 Enumerated fields (57, verbatim)

Each row is one extracted `CHECK (field in (…))` enumeration. Values keep source order and spelling.

| # | Entity.field | Values |
|---|---|---|
| 1 | `organizations.status` | `active`, `suspended` |
| 2 | `organizations.default_locale` | `en`, `fr` |
| 3 | `tenant_settings.primary_locale` | `en`, `fr` |
| 4 | `users.preferred_locale` | `en`, `fr` |
| 5 | `users.status` | `invited`, `active`, `deactivated` |
| 6 | `user_identities.preferred_locale` | `en`, `fr` |
| 7 | `user_identities.mfa_state` | `not_configured`, `passkey`, `totp` |
| 8 | `user_identities.status` | `invited`, `active`, `deactivated` |
| 9 | `user_identities.actor_type` | `human`, `agent`, `system` |
| 10 | `organization_members.status` | `invited`, `active`, `deactivated` |
| 11 | `organization_members.preferred_locale` | `en`, `fr` |
| 12 | `approval_requests.urgency` | `low`, `normal`, `high` |
| 13 | `approval_requests.status` | `pending`, `approved`, `rejected`, `escalated`, `expired` |
| 14 | `translation_keys.locale` | `en`, `fr` |
| 15 | `translation_keys.status` | `draft`, `active`, `archived` |
| 16 | `jobs.status` | `queued`, `running`, `succeeded`, `failed`, `cancelled` |
| 17 | `passkey_credentials.device_type` | `singleDevice`, `multiDevice` |
| 18 | `passkey_challenges.purpose` | `registration`, `authentication` |
| 19 | `agent_definitions.identity_mode` | `acting_as`, `service_principal`, `on_behalf_of` |
| 20 | `agent_definitions.status` | `active`, `suspended`, `archived` |
| 21 | `agent_runs.mode` | `acting_as`, `service_principal`, `on_behalf_of` |
| 22 | `agent_runs.status` | `pending`, `running`, `succeeded`, `failed`, `cancelled`, `awaiting_approval` |
| 23 | `policy_decisions.decision` | `allow`, `deny`, `require_approval` |
| 24 | `tool_calls.status` | `pending`, `running`, `succeeded`, `failed` |
| 25 | `supervision_requests.mode` | `inline`, `panel` |
| 26 | `supervision_requests.decision` | `approve`, `reject`, `escalate` |
| 27 | `companies.status` | `active`, `archived` |
| 28 | `contacts.status` | `active`, `inactive` |
| 29 | `opportunities.status` | `open`, `won`, `lost`, `archived` |
| 30 | `leads.status` | `new`, `working`, `converted`, `disqualified` |
| 31 | `projects.status` | `draft`, `active`, `on_hold`, `completed`, `cancelled` |
| 32 | `project_tasks.status` | `todo`, `in_progress`, `blocked`, `done`, `cancelled` |
| 33 | `time_entries.status` | `draft`, `submitted`, `approved`, `rejected` |
| 34 | `invoice_proposals.status` | `draft`, `submitted`, `approved`, `rejected` |
| 35 | `invoices.status` | `draft`, `issued`, `paid`, `partially_paid`, `void`, `written_off` |
| 36 | `payments.method` | `bank_transfer`, `card`, `cheque`, `cash`, `other` |
| 37 | `accounts.type` | `asset`, `liability`, `equity`, `revenue`, `expense` |
| 38 | `journal_entries.source_type` | `invoice`, `payment`, `manual` |
| 39 | `journal_entries.status` | `draft`, `posted`, `void` |
| 40 | `quote_handoffs.target_type` | `invoice`, `project`, `subscription` |
| 41 | `quote_handoffs.status` | `pending`, `accepted`, `rejected`, `cancelled` |
| 42 | `recurring_billing_schedules.cadence` | `weekly`, `monthly`, `quarterly`, `annual` |
| 43 | `report_runs.status` | `completed`, `failed` |
| 44 | `scheduled_deliveries.target_type` | `report_definition` |
| 45 | `scheduled_deliveries.cadence` | `daily`, `weekly`, `monthly`, `quarterly`, `annual` |
| 46 | `scheduled_deliveries.channel` | `in_app` |
| 47 | `delivery_runs.triggered_by` | `schedule`, `manual` |
| 48 | `delivery_runs.status` | `completed`, `failed`, `skipped` |
| 49 | `workflow_runs.triggered_by` | `event`, `manual` |
| 50 | `workflow_runs.status` | `completed`, `failed`, `skipped` |
| 51 | `webhook_deliveries.status` | `pending_egress`, `succeeded`, `failed` |
| 52 | `email_sends.status` | `queued`, `sent`, `failed` |
| 53 | `bank_accounts.provider` | `ofx`, `plaid_sandbox` |
| 54 | `bank_accounts.account_type` | `checking`, `savings`, `credit`, `loan`, `investment`, `other` |
| 55 | `bank_transactions.provider` | `ofx`, `plaid_sandbox` |
| 56 | `bank_transactions.reconciliation_status` | `unmatched`, `matched`, `ignored` |
| 57 | `reconciliation_links.status` | `proposed`, `confirmed`, `rejected` |

### 2.6 Column CHECK constraints other than enumerations (11, verbatim)

Extracted non-enum column CHECKs, including the nullable-membership guards on `companies.language`, `contacts.language` and `opportunities.probability_band` (transcribed here because [ONT] stores them in `check`, not in `enum`), the `reconciliation_links.candidate_kind` single-kind guard used in §3.2(d), and the `reconciliation_links.score` range guard.

| # | Entity.field | CHECK |
|---|---|---|
| 1 | `file_objects.size_bytes` | `size_bytes >= 0` |
| 2 | `fx_rate_snapshots.rate` | `rate > 0` |
| 3 | `companies.language` | `language is null or language in ('en', 'fr'` |
| 4 | `contacts.language` | `language is null or language in ('en', 'fr'` |
| 5 | `opportunities.probability_band` | `probability_band is null or probability_band in ('low', 'medium', 'high'` |
| 6 | `time_entries.minutes` | `minutes > 0` |
| 7 | `assignments.allocation_percent` | `allocation_percent between 0 and 100` |
| 8 | `tax_rate_versions.rate_bps` | `rate_bps >= 0` |
| 9 | `webhook_endpoints.target_url` | `target_url like 'https://%'` |
| 10 | `reconciliation_links.candidate_kind` | `candidate_kind = 'payment'` |
| 11 | `reconciliation_links.score` | `score >= 0 and score <= 1` |

### 2.7 Table-level invariants (27, verbatim)

Kinds and clauses exactly as extracted (`compositePrimaryKey`, `unique`, `check:crossColumn`, `check:jsonbShape`, `addedConstraint`, `trigger`), with `addedBy` where present. §3 re-declares these as ontology constraints without changing their content.

| # | Entity | Kind | Clause | Added by |
|---|---|---|---|---|
| 1 | `users` | `unique` | `unique (organization_id, email)` | — |
| 2 | `roles` | `unique` | `unique (organization_id, name)` | — |
| 3 | `permission_grants` | `check:crossColumn` | `check (role_id is not null or user_id is not null)` | — |
| 4 | `audit_events` | `trigger` | `audit_events_no_update before update for each row execute function audit_events_block_mutations()` | `0007_audit_events_partition.sql` |
| 5 | `audit_events` | `trigger` | `audit_events_no_delete before delete for each row execute function audit_events_block_mutations()` | `0007_audit_events_partition.sql` |
| 6 | `organization_members` | `unique` | `unique (user_identity_id, organization_id)` | — |
| 7 | `approval_requests` | `check:crossColumn` | `check (approver_user_identity_id is not null or approver_role_id is not null)` | — |
| 8 | `idempotency_records` | `compositePrimaryKey` | `primary key (organization_id, key)` | — |
| 9 | `translation_keys` | `unique` | `unique (organization_id, namespace, key, locale)` | — |
| 10 | `jobs` | `unique` | `unique (organization_id, idempotency_key)` | — |
| 11 | `agent_definitions` | `unique` | `unique (organization_id, name)` | — |
| 12 | `pipeline_stages` | `unique` | `unique (organization_id, name)` | — |
| 13 | `pipeline_stages` | `unique` | `unique (organization_id, order_index)` | — |
| 14 | `rates` | `unique` | `constraint rates_org_name_unique unique (organization_id, name)` | — |
| 15 | `invoices` | `unique` | `unique (organization_id, invoice_number)` | — |
| 16 | `payments` | `addedConstraint` | `payments_organization_id_id_key unique (organization_id, id)` | `0041_banking_reconciliation.sql` |
| 17 | `tax_categories` | `unique` | `unique (organization_id, code)` | — |
| 18 | `accounts` | `unique` | `unique (organization_id, code)` | — |
| 19 | `email_sends` | `unique` | `unique (organization_id, idempotency_key)` | — |
| 20 | `bank_accounts` | `unique` | `unique (organization_id, provider, provider_account_ref)` | — |
| 21 | `bank_accounts` | `unique` | `unique (organization_id, id, provider)` | — |
| 22 | `bank_transactions` | `check:jsonbShape` | `constraint bank_transactions_amount_shape_check check ( jsonb_typeof(amount) = 'object' and amount ?& array['amountMinor', 'currency', 'scale'] and (amount - 'amountMinor' - 'currency' - 'scale') = '{}'::jsonb and jsonb_typeof(amount -> 'amountMinor') = 'number' and jsonb_typeof(amount -> 'currency') = 'string' and jsonb_typeof(amount -> 'scale') = 'number' and (amount ->> 'currency') ~ '^[A-Z]{3}$' )` | — |
| 23 | `bank_transactions` | `check:jsonbShape` | `constraint bank_transactions_snapshot_shape_check check ( jsonb_typeof(normalized_snapshot) = 'object' and normalized_snapshot ?& array['sourceId', 'providerRef', 'postedAt', 'amount', 'description'] and (normalized_snapshot - 'sourceId' - 'providerRef' - 'postedAt' - 'amount' - 'description' - 'merchant' - 'category') = '{}'::jsonb and jsonb_typeof(normalized_snapshot -> 'sourceId') = 'string' and jsonb_typeof(normalized_snapshot -> 'providerRef') = 'string' and jsonb_typeof(normalized_snapshot -> 'postedAt') = 'string' and jsonb_typeof(normalized_snapshot -> 'amount') = 'object' and jsonb_typeof(normalized_snapshot -> 'description') = 'string' and (not (normalized_snapshot ? 'merchant') or jsonb_typeof(normalized_snapshot -> 'merchant') = 'string') and (not (normalized_snapshot ? 'category') or jsonb_typeof(normalized_snapshot -> 'category') = 'string') and normalized_snapshot -> 'providerRef' = to_jsonb(provider_transaction_ref) and normalized_snapshot ->> 'postedAt' = to_char(posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') and normalized_snapshot -> 'amount' = amount and normalized_snapshot -> 'description' = to_jsonb(raw_description) and octet_length(normalized_snapshot::text) <= 16384 )` | — |
| 24 | `bank_transactions` | `unique` | `unique (organization_id, bank_account_id, provider, provider_transaction_ref)` | — |
| 25 | `bank_transactions` | `unique` | `unique (organization_id, id)` | — |
| 26 | `bank_transactions` | `trigger` | `bank_transactions_immutable_evidence before update or delete for each row execute function protect_imported_bank_transaction()` | `0041_banking_reconciliation.sql` |
| 27 | `reconciliation_links` | `unique` | `unique (organization_id, bank_transaction_id, candidate_kind, candidate_id)` | — |

### 2.8 Transactional document chain (DD3 chain, from [RET] §3)

The following sketch is the workflow sequence reported by [RET] §3 and defines the interoperability scope of §4; its arrows denote workflow order, not extracted foreign keys:

```
opportunities → quote_handoffs → projects → time_entries
  → invoice_proposals → invoice_proposal_lines
  → invoices → invoice_lines → payments
  → journal_entries → journal_entry_lines   (double entry)
  → bank_transactions → reconciliation_links (reconciliation)
```

with `accounts` (chart of accounts), `tax_categories` + `tax_rate_versions` (versioned tax rates) and `fx_rate_snapshots` (frozen exchange rates). Exactly five adjacent pairs have typed relations in §2.4, in the following extracted direction (opposite to the workflow arrows): `quote_handoffs.opportunity_id → opportunities`, `time_entries.project_id → projects`, `invoice_proposal_lines.invoice_proposal_id → invoice_proposals`, `invoice_lines.invoice_id → invoices`, and `journal_entry_lines.journal_entry_id → journal_entries`. The adjacent `payments → journal_entries` step is represented only by the polymorphic `journal_entries.source_type = payment` + `source_id` declaration (§3.2(d)), not by a §2.4 relation. The other six adjacent links are `unverified` relation-coverage gaps: `quote_handoffs → projects`, `time_entries → invoice_proposals`, `invoice_proposal_lines → invoices`, `invoice_lines → payments`, `journal_entry_lines → bank_transactions`, and `bank_transactions → reconciliation_links`. No direct typed link is extracted for them; the last requires the composite foreign-key evidence of OQ-OP-11, and the line-level polymorphic kind sets remain unverified under OQ-OP-10. For the remaining gaps, `openerp` owns publication of relation evidence and `engram` owns any resulting declaration update; workflow order alone establishes no relation. Status enumerations on this chain — `invoices.status` = `draft|issued|paid|partially_paid|void|written_off`, `journal_entries.status` = `draft|posted|void`, `reconciliation_links.status` = `proposed|confirmed|rejected` — are expressed without loss by §2.5.

Double-entry balance is **not** a database constraint in [ONT]: migration 0024 states « Every entry must balance: sum(debit.amountMinor) == sum(credit.amountMinor) » and « exactly one of debit/credit is non-zero per line », but amounts are `jsonb {amountMinor, currency, scale}` snapshots with no CHECK and no trigger ([RET] §3.1). §3.2(e) therefore declares it as an application-enforced constraint; no database enforcement is claimed.

### 2.9 Engram profile — native-only profile `openerp@1` (hashed)

Method (normative for this section). The versioned profile uses **only** fields that exist in the pinned native Engram interface transcribed verbatim in §2.9.0 (`src/types.ts` and `src/ontology-profile.ts` at `636fa9d644088db3c9bdb6ade295dec5a8bf1f78`), and it passes `validateOntologyProfile` at that pin (proof in §2.9.2, fixture FX-OP-02). No attribute model, no constraint model and no other extension is declared inside the profile: at the pin, `OntologyNodeType` ( `src/types.ts:837` ) defines neither an attribute field nor a constraint field, normalization preserves unknown properties through object spreading without validating them, and the validator does not validate them — a profile carrying fabricated attribute types, nonexistent references or fabricated constraint kinds still returns `[]`. Validation success therefore establishes only native conformance (identifier present, version present, at least one node type, endpoint and registry cross-references resolvable, visual-encoding formats), never attribute or constraint semantics. Every source fact that the native fields cannot express is classified in §2.9.3 into G0 governed metadata (outside the profile preimage, pinned by [ONT] or by its own P-MAPPING / admission digest) or into the gap register (§8). Attribute and constraint content preserved outside the native profile is `preserved-unvalidated` in the G0 I-11 levels: indexed under guardianship, never promoted into an Engram-owned vocabulary, and never presented as natively validated. Any change to rules N1–N4 below is a new profile version under §6.

#### 2.9.0 Native interface — verbatim transcription (pinned, [ENG] `636fa9d6`)

Transcription rule. The TypeScript blocks below are verbatim from `git show 636fa9d6:src/types.ts` and `git show 636fa9d6:src/ontology-profile.ts`. Line references name the pinned lines. The profile in §2.9.1 may use only the fields declared here. Nested types are included so that “only native fields” is decidable without consulting another file.

`src/types.ts:495` — status vocabulary (referenced by `OntologyHardeningPolicy`):

```typescript
export type OntologyStatus =
  | "inferred"
  | "proposed"
  | "guessed"
  | "candidate"
  | "validated"
  | "reference"
  | "attached"
  | "needs_review"
  | "rejected"
  | "superseded"
  | string;
```

`src/types.ts:699` — visual encoding (referenced by `OntologyNodeType.visual_encoding`):

```typescript
export type OntologyVisualEncodingShape =
  | "dot"
  | "square"
  | "triangle"
  | "box"
  | "diamond"
  | "star"
  | "hexagon";

/**
 * Glyph fill variant: "solid" (default) paints the shape in the node colour;
 * "hollow" draws the outline only (translucent fill + node-coloured border).
 * Extra encoding dimension so node types sharing a shape stay distinguishable.
 */
export type OntologyVisualEncodingFill = "solid" | "hollow";

/** Glyph border weight: "normal" (default) or "bold" (heavier outline). */
export type OntologyVisualEncodingBorder = "normal" | "bold";

export interface OntologyVisualEncoding {
  shape?: OntologyVisualEncodingShape;
  /**
   * "#RRGGBB" or "#RRGGBBAA" hex color. NOTE: INERT in the static studio — the
   * studio renderer colors nodes by community/group (categorical palette) BY
   * DESIGN, not per-node-type. This field is still format-validated by
   * validateOntologyProfile (so a malformed value is flagged) but is NOT
   * consumed by the scene builder / renderer. Kept for forward-compat / other
   * consumers; `shape` / `fill` / `border` are the encodings the studio honors.
   */
  color_hex?: string;
  /** Fill variant (default "solid"). Additive: absent keeps today's render. */
  fill?: OntologyVisualEncodingFill;
  /** Border weight (default "normal"). Additive: absent keeps today's render. */
  border?: OntologyVisualEncodingBorder;
}
```

`src/types.ts:837` — node type, normalized node type, relation type, registry (verbatim, comments included):

```typescript
export interface OntologyNodeType {
  aliases?: string[];
  registry?: string;
  source_backed?: boolean;
  status_policy?: string;
  linking?: OntologyNodeTypeLinking;
  /**
   * Per-node-type visual encoding override consumed by the static studio scene
   * builder (`studio-scene.ts`): `shape` / `fill` / `border` drive the glyph.
   * (`color_hex` is accepted + format-validated but inert — see above.)
   */
  visual_encoding?: OntologyVisualEncoding;
}

/** Node-type configuration after the L3 linking contract has been compiled. */
export interface NormalizedOntologyNodeType extends Omit<OntologyNodeType, "linking"> {
  linking?: NormalizedOntologyNodeTypeLinking;
}

export interface OntologyRelationType {
  source?: string | string[];
  target?: string | string[];
  source_types?: string[];
  target_types?: string[];
  requires_evidence?: boolean;
  assertion_basis?: string | string[];
  derivation_method?: string | string[];
  derivation_methods?: string[];
}

export interface OntologyRegistrySpec {
  source?: string;
  id_column?: string;
  label_column?: string;
  alias_columns?: string[];
  node_type?: string;
  /** Registry column that scopes label and alias identity. */
  partition_column?: string;
  bound_source_path?: string;
}

export interface OntologyCitationPolicy {
  minimum_granularity?: "file" | "page" | "section" | "paragraph";
  require_source_file?: boolean;
  allow_bbox?: boolean | "when_available";
}

export interface OntologyHardeningPolicy {
  statuses?: OntologyStatus[];
  default_status?: OntologyStatus;
  promotion_requires?: string[];
  status_transitions?: OntologyStatusTransition[];
}

export interface OntologyStatusTransition {
  from?: OntologyStatus | OntologyStatus[];
  to?: OntologyStatus | OntologyStatus[];
  from_statuses?: OntologyStatus[];
  to_statuses?: OntologyStatus[];
  requires?: string[];
}

export interface NormalizedOntologyStatusTransition {
  from_statuses: OntologyStatus[];
  to_statuses: OntologyStatus[];
  requires: string[];
}

export interface OntologyInferencePolicy {
  allow_inferred_relations?: boolean;
  allowed_relation_types?: string[];
  require_evidence_refs?: boolean;
}

export interface NormalizedOntologyInferencePolicy {
  allow_inferred_relations: boolean;
  allowed_relation_types: string[];
  require_evidence_refs: boolean;
}

export interface OntologyEvidencePolicy {
  require_evidence_refs?: boolean;
  min_refs?: number;
  node_types?: string[];
  relation_types?: string[];
}

export interface NormalizedOntologyEvidencePolicy {
  require_evidence_refs: boolean;
  min_refs: number;
  node_types: string[];
  relation_types: string[];
}

export interface OntologyHierarchySpec {
  registry?: string;
  parent_column?: string;
  child_column?: string;
  relation_type?: string;
  parent_node_type?: string;
  child_node_type?: string;
}

export interface NormalizedOntologyHierarchySpec {
  registry: string;
  parent_column: string;
  child_column: string;
  relation_type: string;
  parent_node_type: string;
  child_node_type: string;
}
```

`src/types.ts:736` — linking nested types (referenced by `OntologyNodeType.linking`; verbatim):

```typescript
/**
 * Declarative composition for a registry entity normalizer. Built-ins are
 * applied left-to-right, then the optional synchronous local ESM export runs.
 */
export interface OntologyNodeTypeNormalize {
  builtin?: string[];
  fn?: string;
}

/** Document metadata binding used to scope a partitioned registry. */
export interface OntologyLinkingPartitionFrom {
  /** Front-matter field preferred over any path-layout fallback. */
  source_frontmatter: string;
  /** Declarative fallback: zero-based segment of the source path. */
  else?: { path_segment: number };
}

/** A $0 regex detector. Matches are always intersected with registry membership. */
export interface OntologyLinkingPattern {
  form: string;
  flags?: string;
  /** Kept declarative for consumers; L4a never emits a non-member expansion. */
  expand?: { ranges?: string };
  /** Normalized to `required`; values outside the registry are never emitted. */
  membership?: "required";
}

/**
 * Bounded trigger enum deciding when the opt-in `llm` detector may propose
 * spans. There is NO free-form expression: hybrid recall only calls the model
 * when the declared condition over the $0 detectors' output holds.
 */
export type OntologyLinkLlmTrigger =
  | "zero_candidates"
  | "unresolved_candidates"
  | "below_min_candidates";

/**
 * Declarative configuration for the `llm` detector. The model PROPOSES typed
 * spans only; resolution stays with graphify's exact/none resolver + the
 * verbatim gate. Budget/dry_run are honored before any provider call is made.
 */
export interface OntologyLinkLlmConfig {
  trigger: OntologyLinkLlmTrigger;
  /** Non-negative USD ceiling. `0` disables the detector (no proposals). */
  budget_usd?: number;
  /** When true, never make a paid proposal call for this detector. */
  dry_run?: boolean;
  /** Companion threshold for `below_min_candidates` (defaults to 1). */
  min_candidates?: number;
}

export type OntologyLinkDetector =
  | "lexicon"
  | "pattern"
  | "llm"
  | { pattern: OntologyLinkingPattern }
  | { llm: OntologyLinkLlmConfig };

export interface OntologyLinkingResolve {
  mode: "exact" | "none";
}

export interface OntologyLinkingEvidence {
  verbatim: "required";
  context_window?: number;
}

export interface OntologyNodeTypeLinking {
  preset?: string;
  normalize?: OntologyNodeTypeNormalize;
  partition_from?: OntologyLinkingPartitionFrom;
  detect?: OntologyLinkDetector[];
  /** Convenience spelling for profile authors; normalized into `detect`. */
  patterns?: OntologyLinkingPattern[];
  resolve?: "exact" | "none" | OntologyLinkingResolve;
  evidence?: Partial<OntologyLinkingEvidence>;
}

/** Portable fingerprint of the effective normalizer; runtime paths are absent. */
export interface EntityNormalizerDescriptor {
  contract: "engram_entity_normalizer_v1" | "graphify_entity_normalizer_v1";
  builtins: string[];
  export?: string;
  module_sha256?: string;
  normalizer_hash: string;
}

export interface NormalizedOntologyNodeTypeLinking {
  preset?: string;
  normalize?: OntologyNodeTypeNormalize;
  partition_from?: OntologyLinkingPartitionFrom;
  detect: OntologyLinkDetector[];
  resolve: OntologyLinkingResolve;
  evidence: OntologyLinkingEvidence;
  normalizer: EntityNormalizerDescriptor;
}
```

`src/types.ts:1029` — class hierarchies, outputs, profile and normalized profile (verbatim; `OntologyHierarchyArc`, `OntologyHierarchyIndex` and the compiled `ClassHierarchy` transport shapes are not profile-input fields and are not used by §2.9.1):

```typescript
/** One class in a profile-declared class hierarchy (profile input). */
export interface ClassHierarchyClass {
  /** Parent class name within the same hierarchy, or null for a root class. */
  parent?: string | null;
  /** Optional human-readable label (defaults to the class name). */
  label?: string;
  /**
   * Node types whose entities are instances of this (leaf) class. A node_type
   * may appear under at most one class per hierarchy; duplicates are reported
   * as conflicts and only the first (by sorted class name) wins.
   */
  member_node_types?: string[];
  /**
   * Ids of the REGISTRY hierarchies (`hierarchies:` block → the
   * `engram_scene_hierarchies_v1` sidecar) whose forest this class OWNS.
   * The taxonomy stays one tree: a consumer splices each named forest under
   * this class, so a class like `ABP` is the navigable multi-level process
   * tree instead of a node-type dead end. Purely declarative — the compiled
   * class hierarchy only carries the binding, never the forest itself (the
   * sidecar remains the autonomous transport, D1).
   */
  member_hierarchies?: string[];
}

/** A profile-declared class hierarchy (profile input). */
export interface ClassHierarchySpec {
  /** Class→parent relation (default "subclass_of"). */
  relation_type?: string;
  /** Class→entity membership relation (default "has_instance"). */
  membership_relation_type?: string;
  /** Class name → class definition. */
  classes?: Record<string, ClassHierarchyClass>;
}

/** Profile `class_hierarchies` block: hierarchy_id → spec. */
export type ClassHierarchiesProfileBlock = Record<string, ClassHierarchySpec>;

/** Normalized class definition (all optionals defaulted). */
export interface NormalizedClassHierarchyClass {
  parent: string | null;
  label: string | null;
  member_node_types: string[];
  /** Registry hierarchy ids spliced under this class (see ClassHierarchyClass). */
  member_hierarchies: string[];
}

/** Normalized class hierarchy spec (all optionals defaulted). */
export interface NormalizedClassHierarchySpec {
  relation_type: string;
  membership_relation_type: string;
  classes: Record<string, NormalizedClassHierarchyClass>;
}

export type OntologyRelationExport = string | { relation_type?: string };

export interface OntologyOutputWikiPolicy {
  enabled?: boolean;
  page_node_types?: string[];
  include_backlinks?: boolean;
  include_source_snippets?: boolean;
}

export interface OntologyOutputPolicy {
  enabled?: boolean;
  artifact_schema?: string;
  canonical_node_types?: string[];
  source_node_types?: string[];
  occurrence_node_types?: string[];
  alias_fields?: string[];
  relation_exports?: OntologyRelationExport[];
  wiki?: OntologyOutputWikiPolicy;
}

export interface OntologyProfileOutputs {
  ontology?: OntologyOutputPolicy;
}

export interface OntologyProfile {
  id?: string;
  version?: string | number;
  default_language?: string;
  sourcePath?: string;
  profile_hash?: string;
  node_types?: Record<string, OntologyNodeType>;
  relation_types?: Record<string, OntologyRelationType>;
  registries?: Record<string, OntologyRegistrySpec>;
  citation_policy?: OntologyCitationPolicy;
  hardening?: OntologyHardeningPolicy;
  inference_policy?: OntologyInferencePolicy;
  evidence_policy?: OntologyEvidencePolicy;
  hierarchies?: Record<string, OntologyHierarchySpec>;
  /** EVOL 2.c — class-layer hierarchies (separate from registry hierarchies). */
  class_hierarchies?: Record<string, ClassHierarchySpec>;
  outputs?: OntologyProfileOutputs;
}

export interface NormalizedOntologyRelationType {
  source_types: string[];
  target_types: string[];
  requires_evidence: boolean;
  assertion_basis: string[];
  derivation_methods: string[];
}

export interface NormalizedOntologyRegistrySpec {
  source: string;
  id_column: string;
  label_column: string;
  alias_columns: string[];
  node_type: string;
  /** Present only for registries whose labels and aliases are partition-scoped. */
  partition_column?: string;
  bound_source_path?: string;
}

export interface NormalizedOntologyOutputPolicy {
  enabled: boolean;
  artifact_schema: string;
  canonical_node_types: string[];
  source_node_types: string[];
  occurrence_node_types: string[];
  alias_fields: string[];
  relation_exports: string[];
  wiki: {
    enabled: boolean;
    page_node_types: string[];
    include_backlinks: boolean;
    include_source_snippets: boolean;
  };
}

export interface NormalizedOntologyProfileOutputs {
  ontology: NormalizedOntologyOutputPolicy;
}

export interface NormalizedOntologyProfile {
  id: string;
  version: string;
  default_language: string;
  sourcePath?: string;
  profile_hash: string;
  node_types: Record<string, NormalizedOntologyNodeType>;
  relation_types: Record<string, NormalizedOntologyRelationType>;
  registries: Record<string, NormalizedOntologyRegistrySpec>;
  citation_policy: Required<OntologyCitationPolicy>;
  hardening: Required<Omit<OntologyHardeningPolicy, "status_transitions">> & {
    status_transitions: NormalizedOntologyStatusTransition[];
  };
  inference_policy: NormalizedOntologyInferencePolicy;
  evidence_policy: NormalizedOntologyEvidencePolicy;
  hierarchies: Record<string, NormalizedOntologyHierarchySpec>;
  /**
   * EVOL 2.c — normalized class-layer hierarchies. Always populated by
   * normalizeOntologyProfile (empty when the profile omits the block), but
   * declared OPTIONAL so existing NormalizedOntologyProfile literals stay valid.
   */
  class_hierarchies?: Record<string, NormalizedClassHierarchySpec>;
  outputs: NormalizedOntologyProfileOutputs;
}
```

`src/ontology-profile.ts:289` — entry points (signatures verbatim; full bodies pinned at the cited lines and executed from the pinned source for the §2.9.2 proof — helpers `normalizeStringMap`, `stableForHash`, `relationEndpoints`, `normalizeRelation`, `normalizeRegistry`, `normalizeNodeType`, `normalizeCitationPolicy`, `normalizeHardeningPolicy`, `normalizeInferencePolicy`, `normalizeEvidencePolicy`, `normalizeHierarchies`, `normalizeClassHierarchies`, `normalizeOutputs` at `src/ontology-profile.ts:1` govern the normalized defaults cited in §2.9.1):

```typescript
export function parseOntologyProfile(raw: string | Record<string, unknown>, sourcePath?: string): OntologyProfile {
export function validateOntologyProfile(profile: OntologyProfile): string[] {
export function hashOntologyProfile(
  profile: OntologyProfile | NormalizedOntologyProfile | Omit<NormalizedOntologyProfile, "profile_hash">,
): string {
export function normalizeOntologyProfile(profile: OntologyProfile, sourcePath?: string): NormalizedOntologyProfile {
```

Validation contract at the pin (from the `validateOntologyProfile` body, `src/ontology-profile.ts:298`): it requires a non-empty `id`, a present `version`, at least one node type, a `hardening.default_status` among the declared statuses; it checks `node_types.*.registry` existence and `node_type` agreement, `visual_encoding` formats (`fill` in `solid, hollow`; `border` in `normal, bold`; `shape` in the seven shapes; `color_hex` against `/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/`), relation `source`/`target` presence and membership in `node_types`, status-transition membership, `inference_policy` / `evidence_policy` cross-references, hierarchy completeness and cross-references, registry `source` / `id_column` / `label_column` / `node_type` presence and membership, and output cross-references. It defines no check for any attribute, column, enumeration domain or constraint field, because no such field exists in §2.9.0: unknown properties survive normalization by spreading and are never validated. `normalizeOntologyProfile` (`src/ontology-profile.ts:513`) first calls `validateOntologyProfile` and throws on any error, then defaults every omitted policy, hierarchy and output to the Engram defaults and sets `profile_hash` to `hashOntologyProfile` over the normalized value (SHA-256 of `JSON.stringify(stableForHash(normalized))`; `stableForHash` sorts keys recursively and excludes only `sourcePath`, `profile_hash`, `bound_source_path` and `linking.normalize.fn`).

#### 2.9.1 Native profile — construction rules N1–N4 (exact)

The profile is built deterministically from [ONT] (`dcee5c9d…`, read as JSON, source order preserved) by rules N1–N4. No identifier is invented: every key and endpoint below is copied verbatim from [ONT]. Any change to N1–N4 is a new profile version under §6.

N1 — Profile head. Output is exactly `{ id: "openerp", version: "1", default_language: "en", node_types: N2, relation_types: N3 }` with no other top-level field. All five keys are native `OntologyProfile` fields (§2.9.0). `registries`, `citation_policy`, `hardening`, `inference_policy`, `evidence_policy`, `hierarchies`, `class_hierarchies`, `outputs`, `sourcePath` and `profile_hash` are omitted before normalization; the normalized values hashed in §1.6 are therefore exactly the [ENG] defaults at the pin (`citation_policy { minimum_granularity: "page", require_source_file: true, allow_bbox: "when_available" }`, `hardening` with statuses `candidate|attached|needs_review|validated|rejected|superseded`, `default_status: "candidate"`, `promotion_requires: []`, `status_transitions: []`, `inference_policy { allow_inferred_relations: true, allowed_relation_types: [], require_evidence_refs: false }`, `evidence_policy { require_evidence_refs: false, min_refs: 0, node_types: [], relation_types: [] }`, `hierarchies: {}`, `class_hierarchies: {}`, `registries: {}`, `outputs.ontology { enabled: false, artifact_schema: "engram_ontology_outputs_v1", canonical_node_types: [], source_node_types: [], occurrence_node_types: [], alias_fields: [], relation_exports: [], wiki: { enabled: false, page_node_types: [], include_backlinks: false, include_source_snippets: false } }`). These defaults are Engram normalization facts at the pin, not OpenERP domain semantics, and no OpenERP meaning is read into them.

N2 — Node types (entities only). One `node_types` entry per [ONT] entity, keyed by the verbatim entity name (67 keys, in [ONT] order): `organizations`, `tenant_settings`, `users`, `teams`, `roles`, `permission_grants`, `audit_events`, `file_objects`, `comments`, `notifications`, `domain_events`, `user_identities`, `organization_members`, `fx_rate_snapshots`, `timeline_entries`, `approval_requests`, `idempotency_records`, `translation_keys`, `jobs`, `passkey_credentials`, `passkey_challenges`, `agent_definitions`, `agent_runs`, `policy_decisions`, `tool_calls`, `supervision_requests`, `companies`, `contacts`, `pipeline_stages`, `opportunities`, `leads`, `projects`, `project_tasks`, `time_entries`, `rates`, `assignments`, `invoice_proposals`, `invoice_proposal_lines`, `invoices`, `invoice_lines`, `payments`, `tax_categories`, `tax_rate_versions`, `accounts`, `journal_entries`, `journal_entry_lines`, `quote_handoffs`, `recurring_billing_schedules`, `saved_views`, `report_definitions`, `report_runs`, `dashboards`, `dashboard_widgets`, `scheduled_deliveries`, `delivery_runs`, `workflow_definitions`, `workflow_runs`, `webhook_endpoints`, `webhook_deliveries`, `openerp_sessions`, `oidc_state`, `email_sends`, `bank_accounts`, `bank_transactions`, `reconciliation_links`, `auth_email_verifications`, `auth_pending_tenant_selections`. Each value is exactly `{}` (the empty object): no native `OntologyNodeType` field (`aliases`, `registry`, `source_backed`, `status_policy`, `linking`, `visual_encoding`) carries an OpenERP column fact, and none is populated by invention. Entity existence and identity are the only entity facts the native profile states. Normalization therefore carries each value through unchanged as `{}`.

N3 — Relation types (endpoints only). One `relation_types` entry per [ONT] relation (146 entries, in [ONT] `relations` order), keyed by `"<from>.<field>"` with `from` and `field` verbatim (for example `invoices.company_id`), each value exactly `{ source: "<from>", target: "<to>" }` where `from`/`field`/`to` are the verbatim [ONT] relation fields. Both keys are native `OntologyRelationType` fields (§2.9.0); `source_types`, `target_types`, `requires_evidence`, `assertion_basis`, `derivation_method` and `derivation_methods` are omitted. [ENG] normalization therefore yields `source_types: [from]`, `target_types: [to]`, `requires_evidence: false`, `assertion_basis: []`, `derivation_methods: []` for every entry, and every endpoint names a declared `node_types` key (FX-OP-02). The source column nullability (`required` in §2.4, `notNull` in [ONT]), the delete rule (`onDelete`, including `cascade` and `n-a`) and every column fact are DDL/provenance and never enter the profile; they stay in §§2.3–2.4 (tier G, §2.9.3). Polymorphic pairs (§3.2(d)) produce no relation type, exactly as they produce no row in §2.4.

N4 — Field audit (closed). The pre-normalization value contains only these keys: top-level `id`, `version`, `default_language`, `node_types`, `relation_types`; `node_types.*` values contain no key; `relation_types.*` values contain only `source`, `target`. Every key is declared in §2.9.0 (`OntologyProfile`, `OntologyNodeType`, `OntologyRelationType`). No other key appears anywhere in the value. In particular the profile contains no attribute name, SQL type spelling, nullability flag, reference target field, enumeration value, CHECK text, constraint kind, index/constraint/trigger/function name, migration file name (no string ending in `.sql`), `scopeUnit`, `tenancyLevels`, `rlsMechanism`, `tenantScoped`, `forcedRls`, module name, delete rule, `producedAt` or header count. Each of those facts is classified in §2.9.3 and remains available outside the preimage; none is dropped from the specification.

#### 2.9.2 Validation proof (Node, pinned source, executed for this revision)

The exact N1 value was validated with Node only, reading the pinned Engram source through a TypeScript bundler (no Python at any step): the `src/` tree at `636fa9d6` was archived, `src/ontology-profile.ts` was bundled for Node (the `yaml` import left external and resolved from the workspace `node_modules`), and the bundled `validateOntologyProfile` and `normalizeOntologyProfile` were executed on the N1 value built from the pinned [ONT] file. Observed result for this specification revision: `validateOntologyProfile` returns `[]` (empty error array); `normalizeOntologyProfile` succeeds without a source path; the normalized value carries 67 `node_types` keys (each `{}`) and 146 `relation_types` keys (each with `source_types`/`target_types` singletons, `requires_evidence: false`, `assertion_basis: []`, `derivation_methods: []`) plus the N1 defaults, and its `profile_hash` is the `contentDigest` of §1.6. A control run on the same value with a fabricated non-native field added (an invented attribute type, a nonexistent reference and a fabricated constraint kind inside a `node_types` value) also returns `[]`, which confirms that the validator defines no attribute or constraint check: the `[]` result is therefore claimed only as native conformance, and all attribute/constraint content outside the profile remains `preserved-unvalidated` (§2.9.3). FX-OP-02 re-decides both results from the pinned sources. A different count, a validation error, or a different digest means the candidate is not `openerp@1`.

#### 2.9.3 Three-tier classification — every source fact (native / G0 / gap)

Every entity, relation, column, enumeration, CHECK and invariant of [ONT] is classified here into exactly one primary tier. Tier **N** (native profile) enters the §1.6 preimage. Tier **G** (G0 governed metadata) stays outside the preimage: it is preserved verbatim in §§2.1–2.8 under the [ONT] sha256 pin, re-declared where applicable as a §3 annotation in the closed shape `{ subject, kind, scope, enforcement, source }`, or carried as a §4 mapping artifact under its own P-MAPPING digest; at admission it is further covered by the catalog `provenance` / `coverage` fields and the external P-ENTRY digest (§1.5). Tier **X** (gap) is expressible by neither the native fields nor a G0 shape: it is recorded in §8 with an owner as a candidate extension and is never smuggled into the profile. A native-profile extension is an Engram code change and needs a separate decision (OQ-OP-14); a field-level mapping entry needs a G0 contract decision (OQ-OP-15). Counts below are [ONT] counts, verified against the pinned file.

*Entities (67) — tier N for existence, tier G for all other entity facts.* Each of the 67 entities listed in N2 is tier N exactly as a `node_types` key with value `{}`. Every other entity fact — `module`, `sourceMigration`, `tenantScoped`, `forcedRls` (§2.2, one row per entity) — is tier G (extraction provenance, [ONT] pin). No entity fact is tier X: nothing about an entity is dropped, but only its name is natively stated.

*Relations (146) — tier N for endpoints, tier G for the remaining relation facts.* Each [ONT] relation (rows 1–146 of §2.4, keyed `from.field` in N3) is tier N exactly as a `relation_types` entry `{ source: from, target: to }`. Its `required` flag (the source column `notNull`) and its `onDelete` rule (`no action (default)`, `cascade`, `n-a`) are tier G (§§2.3–2.4 provenance). Whether any individual foreign key carries the tenant (`organization_id` in the key) is tier X per relation (§3.2(b), OQ-OP-11): [ONT] extracts single-column references only, so no tenant-carrying enforcement is asserted for any of the 146 rows; the 8 relations targeting `user_identities` (`organization_members.user_identity_id`, `timeline_entries.actor_user_identity_id`, `approval_requests.requester_user_identity_id`, `approval_requests.approver_user_identity_id`, `passkey_credentials.user_identity_id`, `passkey_challenges.user_identity_id`, `openerp_sessions.user_identity_id`, `auth_pending_tenant_selections.user_identity_id`) are additionally declared not tenant-carried because the target carries no `organization_id`.

*Columns (776 rows: 773 real columns + 3 pseudo-columns) — tier G, with two tier-X sub-gaps.* Every real column of §2.3 (name, SQL type spelling, `notNull`, `references { entity, field }`, `onDelete`, `enum`, `check`, `addedBy`, in [ONT] order) is tier G: preserved verbatim in §2.3 under the [ONT] pin and, where it carries a reference, cross-listed in §2.4. The native profile states none of it (N4). Nullability is taken from the source `notNull` bytes only (§2.3 `NN` marker): in particular for the four CHECK-carried memberships (§2.6), `companies.language` is nullable (`notNull: false`, CHECK `language is null or language in ('en', 'fr'` truncated in [ONT] as extracted), `contacts.language` is nullable (`notNull: false`, same CHECK form), `opportunities.probability_band` is nullable (`notNull: false`, CHECK `probability_band is null or probability_band in ('low', 'medium', 'high'` as extracted), and `reconciliation_links.candidate_kind` is required (`notNull: true`, CHECK `candidate_kind = 'payment'`; §2.3 shows `NN`). No uniform nullability is asserted for the four. The three pseudo-columns (`bank_transactions` type `bank_transactions_account_provider_fk`, `reconciliation_links` types `reconciliation_links_transaction_fk` and `reconciliation_links_payment_fk`, each named `constraint` with `notNull: false` in [ONT]) are tier G as `as-extracted` provenance (§2.3); their exact composite column lists, targets and tenant inclusion are tier X (OQ-OP-11, owner: `openerp` for publication, `engram` for the declaration update). A structured native attribute model (typed attributes with nullability, reference and domain) that a validator could check is tier X as a candidate native-profile extension (OQ-OP-14, owner: `engram`; an Engram code change needing a separate decision).

*Enumerated fields (57 `enum` columns + 4 CHECK memberships = 61 columns) — tier G.* The 57 columns carrying `enum` in [ONT] (rows 1–57 of §2.5, values in verbatim source order) and the four CHECK-carried memberships above (`companies.language: [en, fr]`, `contacts.language: [en, fr]`, `opportunities.probability_band: [low, medium, high]`, `reconciliation_links.candidate_kind: [payment]`, each with the nullability just stated) are tier G (§§2.5–2.6 provenance; the two `journal_entries` / `reconciliation_links` kind sets additionally re-declared in §3.2(d)). The native profile carries no enumeration domain: `OntologyNodeType` and `OntologyRelationType` (§2.9.0) define no value-set field. A native enumeration-domain field with validation is tier X under the same candidate extension (OQ-OP-14).

*Column CHECKs other than memberships (7) — tier G.* `file_objects.size_bytes` (`size_bytes >= 0`, `notNull: true`), `fx_rate_snapshots.rate` (`rate > 0`), `time_entries.minutes` (`minutes > 0`), `assignments.allocation_percent` (`allocation_percent between 0 and 100`, `notNull: false`), `tax_rate_versions.rate_bps` (`rate_bps >= 0`), `webhook_endpoints.target_url` (`target_url like 'https://%'`), `reconciliation_links.score` (`score >= 0 and score <= 1`) — CHECK texts verbatim in §2.6 — are tier G. Together with the 27 table invariants below they were previously abstracted as 34 profile constraints; that abstraction is withdrawn: no constraint object enters the native profile, and §3 re-declares the same content as G0 annotations outside every preimage.

*Table invariants (27) — tier G.* By [ONT] `kind`: 18 `unique` + 1 `addedConstraint` (`payments (organization_id, id)`, `addedBy 0041_banking_reconciliation.sql`), 1 `compositePrimaryKey` (`idempotency_records (organization_id, key)`), 2 `check:crossColumn` (`permission_grants`, `approval_requests`), 2 `check:jsonbShape` (`bank_transactions.amount`, `bank_transactions.normalized_snapshot` with the 16384-byte cap), 3 `trigger` (`audit_events` update, `audit_events` delete, `bank_transactions` update-or-delete) — clauses and `addedBy` verbatim in §2.7, rows 1–27 — are tier G, re-declared in §3.2(a)–(c) with `database` enforcement only where the extraction shows the mechanism. Machine-checked native enforcement of uniqueness, key, shape and immutability is tier X (OQ-OP-14).

*Header, tenancy and chain facts — tier G, with application/unverified remainders in §3.* `producer`, `producedAt`, `method`, `scopeUnit: organization_id`, `tenancyLevels: 1`, `rlsMechanism`, the §2.1 counts (43 / 67 / 62 / 60 / 146 / 57 / 27 / 0), module assignments and the §2.8 chain order are tier G (§§2.1–2.2, 2.8 provenance). Double-entry balance (§3.2(e)) is tier G as an `application` annotation with no database mechanism claimed. The polymorphic kind sets for `invoice_lines.source_type` + `source_id` and `invoice_proposal_lines.source_type` + `source_id` are tier X (OQ-OP-10, owner: `openerp`); `domain_events` immutability is tier X (OQ-OP-12, owner: `openerp`). No source fact is left unclassified: tier N states 67 entity names and 146 endpoint pairs; tier G preserves everything else that [ONT] extracts; tier X names exactly what neither tier can state as a checked structure, each with its §8 owner.

Resulting native counts (normative). Applying N1–N4 to [ONT] yields exactly: 67 `node_types` keys (each `{}`), 146 `relation_types` keys (each `{ source, target }`), and no other profile content. Tier-G preservation counts, outside the preimage, are 776 §2.3 column rows (773 real columns + 3 pseudo-columns), 61 enumerated columns (57 `enum` + 4 CHECK memberships), 11 column CHECKs and 27 table invariants. Tenancy is **not** carried by the native profile bytes beyond relation endpoints: 62 entities carry an `organization_id` column in tier G (§2.3), tenant-scoped uniqueness is a §3 annotation, and scoping enforcement (RLS, session setting `app.current_organization_id`) stays a provenance fact (§3.2(f)) — no RLS mechanism is asserted by the profile bytes. With native identity/version and layer pins held fixed, changing tier-G facts alone leaves `contentDigest`, `pinsDigest` and `resultDigest` unchanged; source/metadata pins and the catalog `entryDigest` remain governed by their own preimages and revisions (§6(b)). Changing a tier-N key or endpoint, or an N1 native input (including `version`), changes `contentDigest` and `resultDigest`; updating the layer Pin then changes `pinsDigest` (§1.6, FX-OP-02, FX-OP-09).

## 3. Invariants as declared constraints

### 3.1 Declaration form

Each invariant of §§2.1–2.8 is re-declared here as a G0 governed annotation in a closed declaration shape: `{ subject, kind, scope, enforcement, source }`, where `scope` is `organization_id` wherever [ONT] carries the tenant column, `enforcement` is `database` where the extraction shows a database mechanism (unique, CHECK, composite key, trigger, forced RLS), `application` where [RET] states the invariant is applicative, and `unverified` where the extraction shows no mechanism. These annotations are tier G (§2.9.3): the native profile (§2.9.0) defines no constraint field, so no §3 declaration enters the native-profile preimage — changing only a §3 annotation, §2.6–§2.7 clause text, or SQL/DDL name or mechanism string leaves `contentDigest`, `pinsDigest` and `resultDigest` unchanged with native identity/version and layer pins fixed. Such metadata remains covered by its source pin and the catalog metadata preimage; native keys, endpoints and N1 inputs, including `version`, enter the profile digests (§§1.6, 6(b)). An annotation is `preserved-unvalidated` (G0 I-11): it asserts the constraint as OpenERP semantics under Engram custodianship, without claiming native validation or enforcement. A declaration asserts the constraint; it does not assert a storage realization (§3.3). Renaming, weakening or dropping a declared constraint is a governed metadata/specification revision under §6(b), never a silent edit of published bytes (G0 R-2); it requires a new native-profile version only if the native preimage changes.

### 3.2 Constraint families

**(a) Uniqueness scoped to `organization_id`.** Declared subjects, verbatim from §2.7 plus the composite primary key: `users (organization_id, email)`; `roles (organization_id, name)`; `organization_members (user_identity_id, organization_id)`; `idempotency_records` primary key `(organization_id, key)`; `translation_keys (organization_id, namespace, key, locale)`; `jobs (organization_id, idempotency_key)`; `agent_definitions (organization_id, name)`; `pipeline_stages (organization_id, name)` and `(organization_id, order_index)`; `rates (organization_id, name)`; `invoices (organization_id, invoice_number)` — the per-tenant document numbering uniqueness; `payments (organization_id, id)`; `tax_categories (organization_id, code)`; `accounts (organization_id, code)`; `email_sends (organization_id, idempotency_key)`; `bank_accounts (organization_id, provider, provider_account_ref)` and `(organization_id, id, provider)`; `bank_transactions (organization_id, bank_account_id, provider, provider_transaction_ref)` and `(organization_id, id)`; `reconciliation_links (organization_id, bank_transaction_id, candidate_kind, candidate_id)`. Enforcement: `database` for every row (extracted `unique` / `compositePrimaryKey` / `addedConstraint`).

**(b) References carrying the tenant (declared per relation; no generalization).** [RET] §3.1 point 2 records the design intent: OpenERP adds the composite uniques `payments (organization_id, id)`, `bank_transactions (organization_id, id)` and `bank_accounts (organization_id, id, provider)` precisely so that foreign keys can include `organization_id`, so that a row cannot reference another tenant's row. [ONT] alone does not prove that any individual foreign key does so: it extracts single-column references (§2.4) and composite foreign keys appear only as the three `as-extracted` pseudo-columns of §2.3 (`bank_transactions`, `reconciliation_links` × 2), whose column lists, targets and exact composite form are not extracted. The declaration is therefore per relation, over all 146 rows of §2.4: (i) the 8 relations targeting the global entity `user_identities` — `organization_members.user_identity_id`, `timeline_entries.actor_user_identity_id`, `approval_requests.requester_user_identity_id`, `approval_requests.approver_user_identity_id`, `passkey_credentials.user_identity_id`, `passkey_challenges.user_identity_id`, `openerp_sessions.user_identity_id`, `auth_pending_tenant_selections.user_identity_id` — are declared **not tenant-carried**: the target carries no `organization_id` (§2.3), so no tenant-carrying guarantee is asserted for them, and a target-side composite unique, where one existed, would not by itself prove a tenant-carrying foreign key in any case; (ii) every other relation of §2.4, including every `organization_id` relation itself, is declared `tenantCarried: unverified` with enforcement `unverified`: the target-side composite uniques above are recorded as design-intent evidence for the `payments`-, `bank_transactions`- and `bank_accounts`-targeting relations only, never as enforcement evidence, and no relation is upgraded to `database` enforcement without its actual composite foreign key. The exact composite forms and the per-key enforcement are OQ-OP-11 (owner: `openerp` for publication of the key definitions, `engram` for the declaration update). No weaker or stronger statement is made for any relation.

**(c) Immutability of bank evidence and audit (database-enforced subjects only).** Declared subjects, each with an extracted mechanism: `bank_transactions` — trigger `bank_transactions_immutable_evidence` (`before update or delete`, function `protect_imported_bank_transaction()`) refusing modification of an imported transaction, plus the two exact-key-set `jsonb` shape CHECKs on `amount` (keys `amountMinor, currency, scale`) and `normalized_snapshot` (required keys `sourceId, providerRef, postedAt, amount, description`; optional `merchant, category`; size cap 16384 bytes), all verbatim in §2.7; `audit_events` — triggers `audit_events_no_update` and `audit_events_no_delete` (function `audit_events_block_mutations()`). Enforcement: `database` (extracted triggers and CHECKs) for these two entities only. No other entity is declared database-immutable: in particular `domain_events` carries `emitted_at` / `consumed_at` and **no** immutability mechanism in [ONT] (§§2.3, 2.7 list no trigger or CHECK for it), so event-outbox immutability is `unverified` as OQ-OP-12 (owner: `openerp`) and is treated in §5 only as a [RET] consumer-pattern proposal, never as an enforced property.

**(d) Polymorphic references with their allowed kinds.** Declared subjects, no foreign key by extraction: `journal_entries.source_type` with allowed kinds `invoice | payment | manual` (enum of §2.5) paired with `journal_entries.source_id` (`uuid`, no reference in §2.4) — target entity is selected by `source_type` (`invoice` → `invoices`, `payment` → `payments`, `manual` → no target; the `manual` arm asserts no target row); `reconciliation_links.candidate_kind` with allowed kinds extracted as the single value `payment` (column CHECK `candidate_kind = 'payment'`, §2.6) paired with `reconciliation_links.candidate_id`, with target `payments` — the `as-extracted` pseudo-columns `constraint:reconciliation_links_transaction_fk` and `constraint:reconciliation_links_payment_fk` (§2.3) record that database foreign keys were added outside the extracted `CREATE TABLE` body, and their exact composite form is `unverified` in [ONT]; `invoice_lines.source_type` + `source_id` and `invoice_proposal_lines.source_type` + `source_id` — polymorphic shape (`source_type` is `text`, `NN`) with **no extracted allowed-kind set**: allowed kinds `unverified` under OQ-OP-10 (owner: `openerp`), recorded here so the gap is explicit rather than completed by invention; the exact composite foreign keys behind the `reconciliation_links` pseudo-columns are likewise `unverified` under OQ-OP-11. Enforcement: `database` for the kind sets carried by an enum or CHECK (`journal_entries`, `reconciliation_links`); `unverified` for the two line-level pairs. A polymorphic reference is never rewritten as a typed relation of §2.4 by this specification; stranded-reference risk stays visible (G0 I-11 levels apply).

**(e) Application-enforced accounting balance.** `journal_entries` / `journal_entry_lines`: every entry balances — sum of debit `amountMinor` equals sum of credit `amountMinor` — and exactly one of debit / credit is non-zero per line (migration 0024 statement carried by [RET] §3.1). Enforcement: `application` — [ONT] shows no CHECK and no trigger, and no database enforcement is claimed. Amounts are `jsonb {amountMinor, currency, scale}` snapshots (§2.3).

**(f) Tenancy mechanism (declared, not decided).** `scopeUnit: organization_id`, `tenancyLevels: 1`, session setting `app.current_organization_id` with forced row level security (§2.1; 62 tenant-scoped entities, 60 with forced RLS, exceptions transcribed in §2.1). Declared as the ontology's scoping contract: consumers address OpenERP data through `organization_id`, never through a faked second level ([RET] §1: the OpenERP binding is `organizationId`).

### 3.3 Interface to Sentropic (no tier or DDL decision here)

This specification decides **no** storage tier and **no** registry DDL policy. Those belong to Sentropic (`SPEC_EVOL_DATA_ARCHITECTURE` DD1/DD7, cited by [RET] §§1, 3.1). The interface named here is only the declaration surface above: Sentropic's registry consumes, per constraint, `{ subject, kind, scope, enforcement, source }` plus the §§2.1–2.8 provenance it points into, and returns its own tier/DDL decision under DD1/DD7 (including the expression-index and dedicated-table policies discussed in [RET]). Whether the four families of §3.2 are admissible as tier-3 criteria, or tenant-scoped uniqueness is treated otherwise in the registry, is [RET] §5 question 2 — owner: Sentropic (DD1/DD7). It is recorded in §8 as OQ-OP-04 and not decided here. Symmetrically, no statement in §3.2 asserts that a generic object store can or cannot realize a constraint; [RET] §3.1 records OpenERP's position (the four families are what a generic store would lose), and the registry decision stays Sentropic's.

## 4. Mapping artifacts (three columns, versioned and digested)

### 4.1 Form and rules

Each column is a separate mapping artifact in the closed G0 §3.3 envelope (`mappingId`, exact `version`, `contentDigest`, typed `entries`), pinned wherever referenced (the resolved Pin is in §4.2–§4.4 and §6(c); the record lineage in §1.3 carries only the reference string), versioned separately from the ontology and from each other (D-B7 rule, §6(c)), and digested by P-MAPPING (SHA-256 over the RFC 8785 bytes of `{ entries, mappingId, version }`, the file's own `contentDigest` excluded — G0 §7.2, [ENG] `mappingDigestOf`). Column (a) is the **only normative column** (owner decision 2026-10-28); columns (b) and (c) are non-normative correspondence targets through public API identifiers only, as interop metadata (§7).

Entry rule for version `1` (normative for this freeze). A correspondence enters `entries` only when it is established from a pinned public reference that names the exact standard revision or API documentation, the exact element, entity set or property, and the individual OpenERP type identifier — a grouped source such as `companies, contacts`, a correspondence carried by an arm whose defined semantics do not cover it, or a correspondence whose applicability is still open (OQ-OP-02) never enters `entries`. G0 §3.3 defines exactly seven `MappingEntry` arms, discriminated by `kind`: `rename { from, to }`, `endpoint { from, to, role }`, `type { from, to }`, `vocabulary { from, to }`, `cardinality { subject, chosenMin, chosenMax }`, `hierarchy { relationId, chosenShape, parentRole, childRole }`, `severity { ruleId, phase, readinessPolicy, chosenSeverity }` (closed fields; no arm carries another arm's fields; [ENG] `MappingEntry` at `636fa9d6`). There is no field arm: a field-level (column-to-element/property) correspondence has no G0 arm whose defined semantics support it, and it must not be encoded as a `type` entry (`type` encodes a type-to-type correspondence only), as a `vocabulary` entry (term-to-term only) or as an `endpoint` entry (relation-endpoint role only). Field-level entries are therefore blocked by the contract gap OQ-OP-15 (owner: `engram` as G0 custodian) until an existing arm is given field semantics by a G0 decision or a new arm is added; type-level entries, once sourced, use the `type` arm with individual `from`/`to` identifiers, vocabulary decisions use `vocabulary`, endpoint-role decisions use `endpoint`, and `cardinality` / `hierarchy` / `severity` decisions use their own arms, never the `type` arm. At this freeze no row meets the entry rule from the pinned sources: the pinned sources name the standard families and four Odoo candidate identifiers (owner decision, [RET] §4) but pin no exact UBL/Peppol, ISO 20022, SAF-T or OAGIS revision-and-element reference, no Odoo public API documentation page, and no SAP published OData metadata. All three artifacts therefore carry exactly `entries: []` — admitted by G0 §3.3 only where the artifact asserts no correspondence — and every coverage row is listed individually in the §4.2–§4.4 registers as `unverified` with its owner and the public reference that must be pinned before an entry may be asserted. No identifier is invented, and absence of an entry never means equivalence (G0 §3.3). A later version asserting a sourced entry publishes a new mapping version with a recomputed digest (§6(c), FX-OP-08).

Scope (coverage registers, per the brief and [RET] §3): the full transactional chain `opportunities`, `quote_handoffs`, `projects`, `time_entries`, `invoice_proposals`, `invoice_proposal_lines`, `invoices`, `invoice_lines`, `payments`, `journal_entries`, `journal_entry_lines`, `bank_transactions`, `reconciliation_links`, plus `accounts`, `tax_categories`, `tax_rate_versions`, `fx_rate_snapshots`, `companies`, `contacts` — 19 types, each listed individually in every register below (no grouped row). All field-level correspondences for these types are likewise `unverified` (open-standards fields: OQ-OP-02; Odoo fields: OQ-OP-05; SAP fields: OQ-OP-06) and assert no entry; independently of sourcing, no field-level entry may be asserted at all until the arm gap OQ-OP-15 is resolved.

### 4.2 Artifact `openerp-open-standards@1` — column (a), normative (empty at version 1, `unverified`)

Complete artifact (G0 §3.3 closed envelope, all four fields; `contentDigest` computed over the P-MAPPING preimage with Node, [ENG] `mappingDigestOf`): `{"mappingId":"openerp-open-standards","version":"1","contentDigest":"0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de3","entries":[]}`. P-MAPPING preimage (the only bytes hashed; the file's own `contentDigest` excluded during hashing): `{"entries":[],"mappingId":"openerp-open-standards","version":"1"}`. Pin: `{ id: "openerp-open-standards", version: "1", contentDigest: "0916d8fc11ece323cfaecf2e58d1dbbb483ecbb46fdb645ad7f212172ae02de3" }`. The artifact asserts no correspondence at version `1`; the register below is the complete coverage list, every row `unverified`. Reference families named by the owner decision (UBL 2.x / Peppol BIS, ISO 20022, SAF-T, OAGIS) are the sourcing targets; before any row may enter `entries`, its exact revision and element must be pinned as a public reference (for example the exact UBL invoice element for an asserted field) — [RET] §4: « Non instruit, à ne pas présenter comme acquis ». Owners: type and field rows `openerp` + `engram` co-design under OQ-OP-02, except the `reconciliation_links` row under OQ-OP-09 (owner: mapping maintainer under `engram` custodianship with `openerp` semantic validation). Peppol applicability in Canada/Québec stays OQ-OP-01 and no row asserts it.

| OpenERP type (individual) | Public reference to pin before any entry | Status |
|---|---|---|
| `opportunities` | OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `quote_handoffs` | OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `projects` | OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `time_entries` | OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `invoice_proposals` | UBL 2.x / Peppol BIS; OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `invoice_proposal_lines` | UBL 2.x / Peppol BIS; OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `invoices` | UBL 2.x / Peppol BIS — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `invoice_lines` | UBL 2.x / Peppol BIS — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `payments` | ISO 20022 payments — exact message revision and element to pin | `unverified` (OQ-OP-02) |
| `journal_entries` | SAF-T accounting export; OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `journal_entry_lines` | SAF-T accounting export; OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `bank_transactions` | ISO 20022 bank — exact message revision and element to pin | `unverified` (OQ-OP-02) |
| `reconciliation_links` | No standard family asserted in the pinned sources — public reference to establish and pin | `unverified` (OQ-OP-09) |
| `accounts` | SAF-T accounting export — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `tax_categories` | SAF-T accounting export; UBL 2.x (invoice use) — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `tax_rate_versions` | SAF-T accounting export — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `fx_rate_snapshots` | ISO 20022 bank; SAF-T accounting export — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `companies` | UBL 2.x (invoice use); OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |
| `contacts` | UBL 2.x (invoice use); OAGIS inter-ERP exchange — exact revision and element to pin | `unverified` (OQ-OP-02) |

### 4.3 Artifact `openerp-odoo@1` — column (b), non-normative (empty at version 1, `unverified`)

Complete artifact (G0 §3.3 closed envelope, all four fields): `{"mappingId":"openerp-odoo","version":"1","contentDigest":"b4eea21d5984a6b968b3d0cde2c21d482615b35ab416eb74e4d2997a7df283e7","entries":[]}`. P-MAPPING preimage (hashed bytes; `contentDigest` excluded during hashing): `{"entries":[],"mappingId":"openerp-odoo","version":"1"}`. Pin: `{ id: "openerp-odoo", version: "1", contentDigest: "b4eea21d5984a6b968b3d0cde2c21d482615b35ab416eb74e4d2997a7df283e7" }` (P-MAPPING, Node, [ENG] `mappingDigestOf`). The artifact asserts no correspondence at version `1`. The owner decision and [RET] §4 name four candidate identifiers (`res.partner`, `account.move`, `account.move.line`, `account.payment`); they are recorded in the register as candidates only — an owner decision or an internal handover is not Odoo public API documentation, so no candidate enters `entries` until the mapping maintainer pins the Odoo public API documentation that establishes the exact object or field correspondence (OQ-OP-05, owner: mapping maintainer under `engram` custodianship with `openerp` semantic validation). No Odoo internal structure is used (§7).

| OpenERP type (individual) | Candidate / reference to pin before any entry | Status |
|---|---|---|
| `opportunities` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `quote_handoffs` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `projects` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `time_entries` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `invoice_proposals` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `invoice_proposal_lines` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `invoices` | Candidate `account.move` named by the owner decision / [RET] §4 — Odoo public API documentation to pin | `unverified` (OQ-OP-05) |
| `invoice_lines` | Candidate `account.move.line` named by the owner decision / [RET] §4 — Odoo public API documentation to pin | `unverified` (OQ-OP-05) |
| `payments` | Candidate `account.payment` named by the owner decision / [RET] §4 — Odoo public API documentation to pin | `unverified` (OQ-OP-05) |
| `journal_entries` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `journal_entry_lines` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `bank_transactions` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `reconciliation_links` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `accounts` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `tax_categories` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `tax_rate_versions` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `fx_rate_snapshots` | Odoo public API documentation — exact object or field to establish and pin | `unverified` (OQ-OP-05) |
| `companies` | Candidate `res.partner` named by the owner decision / [RET] §4 — Odoo public API documentation to pin | `unverified` (OQ-OP-05) |
| `contacts` | Candidate `res.partner` named by the owner decision / [RET] §4 — Odoo public API documentation to pin | `unverified` (OQ-OP-05) |

### 4.4 Artifact `openerp-sap@1` — column (c), non-normative (empty at version 1, `unverified`)

Complete artifact (G0 §3.3 closed envelope, all four fields): `{"mappingId":"openerp-sap","version":"1","contentDigest":"48e2cd9eb8ab05d309ea9713430bc65e18f8d2898d293bfab3299cfdfcbcc5fe","entries":[]}`. P-MAPPING preimage (hashed bytes; `contentDigest` excluded during hashing): `{"entries":[],"mappingId":"openerp-sap","version":"1"}`. Pin: `{ id: "openerp-sap", version: "1", contentDigest: "48e2cd9eb8ab05d309ea9713430bc65e18f8d2898d293bfab3299cfdfcbcc5fe" }` (P-MAPPING over 0 entries, Node, [ENG] `mappingDigestOf`; empty admitted only where the artifact asserts no correspondence, G0 §3.3). No SAP published OData entity set or property is named in any pinned source. Asserting one here would require sourcing it from SAP's published OData metadata first; until then every row below is `unverified` (OQ-OP-06, owner: mapping maintainer under `engram` custodianship with `openerp` semantic validation) and the artifact asserts no correspondence. SAP stays a mapping target through published OData entity sets only, and no internal SAP structure is used (§7).

| OpenERP type (individual) | Public reference to pin before any entry | Status |
|---|---|---|
| `opportunities` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `quote_handoffs` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `projects` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `time_entries` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `invoice_proposals` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `invoice_proposal_lines` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `invoices` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `invoice_lines` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `payments` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `journal_entries` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `journal_entry_lines` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `bank_transactions` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `reconciliation_links` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `accounts` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `tax_categories` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `tax_rate_versions` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `fx_rate_snapshots` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `companies` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |
| `contacts` | SAP published OData metadata — exact entity set or property to establish and pin | `unverified` (OQ-OP-06) |

Custody: the three artifacts are referenced from the ontology record by lineage reference string (§1.3), resolved to the Pins above by consumers, and consumed as adapter metadata outside the OpenERP model — neither SAP nor Odoo internal model becomes the norm for any other party ([RET] §4). Who maintains vendor correspondence beyond this initial freeze (adapter package at Engram, at OpenERP, or a correspondence table published in the registry) is [RET] §5 question 4; this specification records the artifacts under Engram custodianship per the brief's goal and leaves the maintenance split to §8, OQ-OP-07.

## 5. Engram-first split — optional consumer pattern (not part of the ontology)

[RET] §§3.1–3.2 proposes an Engram-first split, against first intuition: the immutable journal and evidence side is the Engram candidate, the mutable business chain is not. This specification presents that split **only** as an optional consumer pattern that an adopter may apply when consuming `openerp@1`. It is not part of the ontology record (§1), not part of the profile (§2), and not a declared constraint (§3): no entity changes guardian, storage or authority by being listed here, and OpenERP keeps its own database and semantic authority ([RET] §1: universality is a contract story, never a shared database).

| OpenERP perimeter (source entities) | Candidate for Engram immutable profiles | Motive ([RET] §3.2) |
|---|---|---|
| Imported bank evidence (`bank_transactions`, §3.2(c)) and `audit_events` | Yes, first — on the Engram immutable profiles (`immutable-chains-v1`, `immutable-boundaries-v1`, as named by [RET] §3.1) | Append-only, immutability required, hash chaining relevant, no business-uniqueness need; database enforcement is extracted for exactly these two entities (triggers of §2.7). Event output (`domain_events`) is listed by [RET] on this side as a proposal only: [ONT] extracts no immutability mechanism for it (§3.2(c)), so its inclusion carries no enforcement claim (OQ-OP-12) |
| Chart of accounts, tax categories and tax versions (`accounts`, `tax_categories`, `tax_rate_versions`) | Possible | Quasi-immutable, versioned |
| Mutable document chain (`invoice_proposals` → `reconciliation_links`, §2.8) | No | Per-tenant uniqueness, referential integrity (tenant-carrying per key `unverified`, §3.2(b)), mutable state, aggregation (§3.2(a), (b), (d)) |

[RET] states the last row as « non vérifiable » for Engram as manager of the mutable business model; this specification records the position without adopting or rejecting it (§3.3 leaves the registry consequence to Sentropic DD1/DD7). Adopting the first two rows is a consumer deployment choice per adopter; refusing them changes nothing in §§1–4.

## 6. Migrations and versioning

**(a) Ontology versions.** `openerp@1` evolves only through explicit new versions under the G0 lifecycle: `publish`, `deprecate(id, version, reason)`, `supersede(old, new, migrationRef)` (G0 §1.5). Published profile bytes never change; a native-profile change requires a new ontology version (G0 R-2), while tier-G metadata is revised under its own governed artifact or catalog entry version (§6(b)) and a tier-X gap creates no profile bytes. Each major that has a migration carries a `migrationRef`; a superseded record pairs `supersededBy` with a migration reference; deprecation changes `entryDigest` only and keeps the deprecated version resolvable by pin forever. Renames of terms occur only as `rename-with-mapping` with an explicit typed mapping entry keeping the old name decodable (G0 §3.2); persisted OpenERP values are never rewritten in place (G0 I-12). Version succession for this `EXT` ontology follows the owner rule recorded at G0 §10.2 row D-B7 (versions plus explicit mappings, §6(c)). The G0 `compose` refusal `operation-not-applicable` is scoped exactly as G0 scopes it — to the `TRK` and `H2A` vocabularies (and, for stacking families, `MEM`) in G0 §2.5 — and is **not** extended to OpenERP: no `compose` refusal is claimed for this `EXT` pack, and no composition is used to produce a successor version here either; succession is by new version plus mapping, as stated.

**(b) Candidate production and diff (two comparisons, never conflated).** (i) *Transcription comparison* — producible from the pinned snapshot alone: a Node comparison of the §§2.1–2.8 provenance and the §2.9.1 native profile (N1–N4) against the pinned [ONT] file (counts, per-entity columns, relations, enums, CHECKs, invariants, native counts 67 / 146, digests §1.6). FX-OP-01(a) and FX-OP-02 decide it; it requires no migration input beyond [ONT]. (ii) *Export reproduction* — **not** producible from the snapshot: re-running [EXP] (`export-ontology.mjs`, Node, zero Python) needs the 43 migration files under `apps/api/src/db/migrations/`, which are not in the snapshot (only the 34 creation and 12 altering file names referenced from [ONT] are pinned, §§2.1–2.3; the full list is OQ-OP-03), and [EXP] stamps `producedAt` from the current date (`new Date().toISOString().slice(0, 10)`), so unchanged migrations on a different date cannot reproduce the pinned file SHA-256 and an empty structural diff never establishes byte equality. Export reproduction is therefore defined as a **semantic comparison** once the inputs are pinned (OQ-OP-03): run [EXP] in the OpenERP repository at the pinned commit, parse both JSON values, set `producedAt` aside (compared separately as a date stamp, never as ontology content), and compare the remaining value (`producer`, `method`, `scopeUnit`, `tenancyLevels`, `rlsMechanism`, `counts`, `entities`, `relations`, `parserGaps`) for exact equality; the file SHA-256 is asserted only for the pinned snapshot file itself, never for a re-run. The candidate diff for versioning compares, in order, the entity set (added / removed entities), per-entity columns (added / removed / retyped columns, nullability changes, `addedBy` provenance), typed relations (added / removed / re-targeted), enumerated fields (added / removed values), column CHECKs, and table-level invariants (added / removed / reworded clauses), plus the header fields (`scopeUnit`, `tenancyLevels`, `rlsMechanism`) and every count, with `producedAt` excluded as stated. Classify each non-empty semantic diff by the actual preimage tiers of §2.9.3, comparing native projections first with identity/version held fixed. **Tier N:** changed native declarations require a new ontology version draft, never an edit of `openerp@1`; assign the next exact version in N1 and the layer Pin, then recompute all three §1.6 digests. Both the declaration change and the assigned `version` enter the native preimage: `contentDigest` and `resultDigest` change, and the updated Pin changes `pinsDigest`. The successor follows the §1.5 admission path (corpus delta fixtures green or explicitly retired with reasons, by the G0 §3.3 inheritance discipline applied to versions), with a `migrationRef` where the change crosses a major. **Tier G only:** changed column metadata, enumerations, CHECKs, invariants or other provenance outside N1–N4 do not require a new native-profile version or `contentDigest`; keep the native identity/version and Pin fixed, so the §1.6 triple stays equal. Preserve the changed facts in a separately pinned metadata/specification revision; a changed §4 artifact gets its own mapping version and P-MAPPING digest (§6(c)), and changed catalog metadata gets a new `entryVersion` and external P-ENTRY digest once the entry is complete (§1.5). No published artifact or entry is overwritten, and no `entryDigest` or coverage digest is asserted for the incomplete draft. A new SQL type spelling is tier-G provenance and never blocks the native projection by approximation. **Tier X:** unsupported attribute/constraint or field-mapping requirements remain owned gaps (OQ-OP-14 / OQ-OP-15); record the evidence in tier G where expressible, but do not fabricate a native field, assign a profile version or claim validation to close a gap. A native extension still needs the separate decision of §2.9.3. Mixed diffs follow each applicable tier; a tier-G-only change cannot become a native-version trigger merely because its source semantics changed. An empty semantic diff means the candidate is equivalent evidence for the current version and changes nothing (it is not claimed as byte-equivalent file evidence). Parser gaps in a candidate run (`parserGaps` non-empty) block versioning until resolved: unmatched input is reported, never silently dropped ([EXP] header rule).

FX-OP-09 digest vectors (Node, executed against the pinned [ENG] `validateOntologyProfile`, `normalizeOntologyProfile`, `pinsDigestOf` and `resultDigestOf`; exact §1.6 procedures, no source path). These are isolated fixture mutations of cloned [ONT]/N1 values, not changes to the pinned source or assertions of new domain facts. The tier-N fixture removes `references` and `onDelete` from the existing `quote_handoffs.opportunity_id` column, removes its matching relation, and updates `counts.relations` from 146 to 145; every other source fact is fixed. The version-only row is a hashing control, not a reason to require succession for tier-G metadata. Native validation returns `[]` for all projected values.

| Fixture case | Native `version` | Expected `contentDigest` | Expected `pinsDigest` | Expected `resultDigest` |
|---|---|---|---|---|
| Tier G: only `organizations.legal_name.notNull` changes from `true` to `false` | `1` | `8c00c51d1132d48dbe7a223f0fb0fb7b7d79fc6894d403b4731ffa265b081e65` | `cda06dc8e8895fa8e940b11092f7b720c08053caf7871ad63818b879a3914e6a` | `8e71a6769cfd313bb44a6943369e5aa4de513802607ea8a4f13ae8b3f98a910f` |
| Tier N: remove the `quote_handoffs.opportunity_id` reference as specified above, then assign the successor version | `2` | `da41330ae7318fc723982e7a0e855376cef742a2431259d00b9ec0b8c3b81837` | `2dd66ac77bca68a8bc12b49b45b9aba2ec64cc3121b3e9f1b729357ffa496166` | `df3e2bdcfe945e725cd83ae838c4fd89ba7eb515058cd6e7022a38f412db8a09` |
| Version-only control: [ONT] unchanged, only N1 `version` and its layer Pin change | `2` | `5b8137063525c84e2662ec1e350233298e9fab7d0615c428bf24728d911228e0` | `cb4732603161a4a1b9c834790f9ea313d780a25c96f73903d9a85bd6e317e256` | `2513c3dcfc0de54b968d5f602b103cd1f7a682de13669f9d744e78e202123a96` |

Tier-X control: with [ONT], N1 and the layer Pin unchanged, recording OQ-OP-14 or OQ-OP-15 as unresolved supplies no native field; all three digests remain the §1.6 values (the tier-G row above), native `version` remains `1`, and the gap stays open. No digest for unsupported semantics is invented.

**(c) Mapping artifacts versioned separately (D-B7).** Each §4 artifact carries its own exact `version` and P-MAPPING `contentDigest`, independent of the ontology version: a mapping correction (first established row, resolved `unverified` row, changed correspondence) publishes a new mapping version without a new ontology version, and an ontology version change does not by itself change any mapping digest. The record lineage (§1.3) carries only mapping **reference strings** (`openerp-open-standards@1`, …); consumers resolve each string to the Pin `(id, version, contentDigest)` stated in §§4.2–4.4 before use, and that resolved Pin — never the lineage string alone — is what a `mappingRef` pins. Floating references refuse (G0 I-10). Changing any typed entry or decision field changes the mapping digest (§4.1).

**(d) Source re-pin.** When OpenERP versions the artifacts in its repository (OQ-OP-03), the § Source pins table is updated to the published commit and the `unverified` mark on `d06d5ece` is removed by a specification revision; until then the sha256 pins govern and the commit pin stays `unverified`.

## 7. Licence

Everything in this specification, in the `openerp@1` record and in the §4 mapping artifacts is **MIT** (owner decision 2026-10-28: « Question licence on est mit full open nous »; [RET] §4 records the OpenERP repository target « original MIT OpenERP implementation »). Concretely:

- **Public identifiers only.** At version `1` no SAP or Odoo identifier is asserted in any active mapping entry (§4: all three artifacts are empty). The only SAP or Odoo material present is four Odoo candidate names recorded as `unverified` sourcing targets in the §4.3 register (named by the owner decision and [RET] §4) and the instruction that future SAP entries use published OData entity sets or properties only (§4.4). Once a public reference is pinned and an entry is asserted, naming that third-party API target is metadata about an interface, not a reproduction of the system behind it ([RET] §4).
- **No derived structure.** No entity, field, relation, cardinality or workflow structure is copied or derived from SAP (proprietary) or from Odoo (LGPLv3) internals. §§2.1–2.8 are transcribed solely from OpenERP's own migrations ([ONT]) and §2.9 projects only OpenERP's own entity names and relation endpoints into the native profile; column (a) will be anchored solely on open standards (UBL 2.x / Peppol BIS, ISO 20022, SAF-T, OAGIS) once its references are pinned; columns (b) and (c) will carry identifiers, never schemas.
- **Why this satisfies the owner order.** The 2026-10-24 order asked for an Engram-managed model based globally on SAP or Odoo, both if possible. The 2026-10-28 order supersedes the anchor: open standards are the only normative reference, and SAP and Odoo become mapping targets. Basing the **norm** on either internal model would have made one proprietary or LGPL structure the reference for the other two parties and put the MIT output under that licence's derivation question ([RET] §4). The three-column construction keeps the three-way interoperability path open without asserting unsourced correspondences — every in-scope OpenERP type carries an owned `unverified` register row toward its open-standard, SAP and Odoo targets (§4), to be promoted to a digested entry only once its public reference is pinned — with no party's internal model becoming another party's norm, and with the MIT closure checkable at admission: the G0 §5.5 licence closure recomputed over the pack must stay within MIT, Apache-2.0, CC0, and an excluded lineage refuses with `excluded-licence` (§1.5). No lifecycle state cures an excluded licence (G0 §1.7).

## 8. Open-questions register (each item has an owner; nothing here is decided)

| Id | Question | Owner | State / source |
|---|---|---|---|
| OQ-OP-01 | Peppol status in Canada / Québec: the OpenERP repository is calibrated Canada/Québec, and the applicability of Peppol BIS there is not established. Until answered, no §4.2 row asserts a Peppol correspondence and no Canadian/Québec applicability claim is made. | `openerp` (domain authority), routed by the conductor | Open — [RET] §4 (« le statut de Peppol au Canada et au Québec »), not instructed |
| OQ-OP-02 | Open-standards correspondences for every §4.2 row (type-level and line-by-line): pin the exact standard revision and element for each OpenERP type and field (UBL/Peppol for invoice documents, ISO 20022 for payments and bank, SAF-T for the accounting export, OAGIS for inter-ERP exchange), including the `jsonb` money shape (`amountMinor, currency, scale` in provenance) against the standard amount components. Until pinned, `openerp-open-standards@1` stays empty. | `openerp` + `engram` co-design (DD3 standard-set freeze) | Open — [RET] §§3–4, §5 question 3 (normative anchor decided 2026-10-28; no exact revision/element pinned in the snapshot) |
| OQ-OP-03 | Commit pin of the sources: [EXP] and the extracted artifacts are not yet versioned in the openerp repo; HEAD `d06d5ece` stays `unverified` until OpenERP publishes them, and the 43-migration file list (§2.1 source-gap) is recoverable only from that repo. | `openerp` (publication), `engram` (re-pin per §6(d)) | Open — brief source pin; [RET] §5 question 1 (canonical JCS descriptor form and `sourceLevel` / lineage for external builders is answered for this record by §1 under G0; the publication half stays open) |
| OQ-OP-04 | Are the four §3.2 families admissible as dedicated-table (tier-3) criteria, or is tenant-scoped uniqueness treated otherwise in the registry? (§3.3 interface.) | Sentropic (DD1/DD7) | Open — [RET] §5 question 2; not decided here |
| OQ-OP-05 | Odoo correspondences for every §4.3 row (including the four candidate identifiers): pin the Odoo public API documentation establishing each exact object or field correspondence. Until pinned, `openerp-odoo@1` stays empty; the owner decision and [RET] §4 alone do not establish a row. | Mapping maintainer under `engram` custodianship, with `openerp` semantic validation | Open — §4.3 register; no Odoo public API documentation pinned in the snapshot |
| OQ-OP-06 | SAP published OData entity sets and properties for every §4.4 row, sourced from SAP's published OData metadata. Until sourced, column (c) asserts nothing. | Mapping maintainer under `engram` custodianship, with `openerp` semantic validation | Open — §4.4; no SAP identifier is sourced in the pinned sources |
| OQ-OP-07 | Vendor-correspondence maintenance split: adapter package at Engram, at OpenERP, or correspondence table published in the registry? (§4 custody records the initial state only.) | Owner, on proposal from `engram` + `openerp` | Open — [RET] §5 question 4 |
| OQ-OP-08 | Catalog admission evidence for `openerp@1`: packaging of the §10 fixtures as `openerp-conformance-corpus@1` with its manifest digest (supplying record and payload `corpusRef`), the `family-corpus` (EXT) receipt under §5.5, and the catalog `consumers` list (publication precondition, §1.3). | `engram` (catalog), `openerp` (consumer notification targets) | Open — admission preconditions, G0 §§1.4–1.5, §5.5; draft omits `corpusRef` until resolved (§1.3) |
| OQ-OP-09 | Normative open-standard correspondence for `reconciliation_links` (§4.2 row): establish and pin the public reference (standard family, exact revision and element), or record that no normative correspondence is asserted. Until resolved, the row stays `unverified` and no reconciliation mapping is claimed. | Mapping maintainer under `engram` custodianship, with `openerp` semantic validation | Open — §4.2; no standard element sourced in the pinned sources |
| OQ-OP-10 | Allowed kinds for the line-level polymorphic pairs `invoice_lines.source_type` + `source_id` and `invoice_proposal_lines.source_type` + `source_id` (§3.2(d)): publish the kind sets, or record that none is asserted. Until resolved, both stay `unverified` and no kind check is passed for them (FX-OP-06). | `openerp` (semantic owner) | Open — §3.2(d); no kind set extracted in [ONT] |
| OQ-OP-11 | Exact composite foreign keys behind the three pseudo-columns (`bank_transactions`, `reconciliation_links` × 2, §2.3) and the per-relation tenant-carrying enforcement of §3.2(b): publish each key's column list, target and tenant inclusion. Until resolved, every non-global relation stays `tenantCarried: unverified` and no `database` enforcement is claimed for tenant-carrying. | `openerp` (publication of key definitions), `engram` (declaration update) | Open — §§2.3, 3.2(b); [ONT] extracts no composite form |
| OQ-OP-12 | Event-outbox immutability beyond `audit_events`: whether `domain_events` (or any other outbox entity) carries a database immutability mechanism (§§3.2(c), 5). Until resolved, only `bank_transactions` and `audit_events` are declared database-immutable. | `openerp` (semantic owner) | Open — §3.2(c); no mechanism extracted for `domain_events` |
| OQ-OP-13 | Remaining catalog payload values (§1.5): pinned `compatibility { renderer, adapter }` references, `linkedTools`, and recomputation of `licenceClosure.closureDigest` and `coverage.coverageDigest` at admission (with the §5.2 envelope fields and `entryDigest` then computed externally). Until resolved, the payload stays incomplete and the candidate stays a draft. | `engram` (catalog custodian) | Open — §1.5; no renderer/adapter pin or closure-digest preimage asserted in this specification |
| OQ-OP-14 | Native-profile structured model (candidate extension): typed attributes (name, type, nullability, reference), enumeration domains and machine-checked constraints (uniqueness, key, shape, immutability) inside the Engram profile with validator support. At `636fa9d6` no such field exists (§2.9.0) and unknown fields are preserved without validation (§2.9.2), so all such content stays `preserved-unvalidated` in tiers G/X (§2.9.3). Until decided, no attribute, domain or constraint claim is presented as natively validated, and `completeness: complete` (§1.3) keeps its narrowed extraction meaning only. A native-profile extension is an Engram code change and needs a separate decision; this specification does not design it. | `engram` (profile owner; code change + validator + separate decision) | Open — §2.9.0–§2.9.3; support gap assigned to Engram |
| OQ-OP-15 | Field-level mapping arm (G0 contract gap): G0 §3.3 defines seven arms (`rename`, `endpoint`, `type`, `vocabulary`, `cardinality`, `hierarchy`, `severity`) and no arm whose semantics cover a column-to-element/property correspondence (§4.1). Until an existing arm is given field semantics by a G0 decision or a new arm is added, no field-level entry may be asserted in any §4 artifact, even once its public reference is pinned (OQ-OP-02 / OQ-OP-05 / OQ-OP-06 cover sourcing only). | `engram` (G0 custodian) | Open — §4.1; blocks every field-level entry, not the empty version-`1` artifacts |

## 9. Consistency table

Single pass over names and correspondences across sections. Distinct containers and records are stated as such; this table declares none of them identical.

| Name verified | §1 record | §2 profile | §3 constraints | §4 mappings | §6 versioning | Correspondence |
|---|---|---|---|---|---|---|
| `openerp@1` identity | `(namespace, id, version) = (openerp, openerp, 1)` | Normalized Engram profile `{ id: "openerp", version: "1", node_types (67), relation_types (146) }` (§2.9) | Subjects are §§2.1–2.8 entity/field names | Register rows name individual §2 types; active `entries` are empty at version `1` | Native-profile changes increment the exact ontology version; metadata revisions and gaps follow §6(b) | One identity; provenance names are never renamed by §§3–4 |
| `contentDigest / pinsDigest / resultDigest / entryDigest` | §1.3 fields; `entryDigest` external, not asserted (incomplete payload) | §1.6 preimages over the §2.9 normalized native-only profile only (67 keys, 146 endpoints) | §3 annotations and §§2.6–2.7 clause texts stay outside native-profile preimages (tier G); source/catalog metadata remain separately governed | Mapping digests are P-MAPPING values over empty `entries`, never record digests | Tier-G-only diffs keep native identity/version, Pin and the digest triple fixed; tier N and assigned N1 `version` change content/result, and repinning changes pins; tier X stays a gap (§6(b), FX-OP-09) | Four distinct procedures (G0 §7.1); no substitution; mapping digests distinct from all four |
| `DigestEvidence` / `corpusRef` | `digests.resultEvidence` (resolved arm with digest); `corpusRef` **absent** on the draft (no unresolved encoding on that field) | — | — | — | `corpusRef { ref, digest }` supplied at admission (OQ-OP-08) | Single G0 §1.3 union where it applies; a `Digest` field is never carried as `null`, unresolved arm, or placeholder |
| Lineage / provenance | §1.4: parents `[]`, mapping **reference strings**, migrations `[]` | External origin (family `EXT`); extraction provenance §§2.1–2.8 not hashed | — | Strings resolved to Pins `(id, version, contentDigest)` in §§4.2–4.4 before use (§6(c)) | §6(d) re-pin on publication | Provenance closed to `{ sourceRef, sourceRevision }`; commit value `unverified` (OQ-OP-03) |
| Four constraint families | — | §2.5–§2.7 source material (tier G) | §3.2(a)–(d) + (e) application balance + (f) tenancy (`preserved-unvalidated` annotations) | No mapping asserts or weakens a constraint | Weakening is a governed metadata revision (§6(b)); a native-preimage change, including N1 `version`, changes profile digests | §3.3: tier/DDL consequence stays Sentropic DD1/DD7 (OQ-OP-04) |
| Polymorphic kinds | — | `journal_entries.source_type` enum; `candidate_kind` CHECK (`notNull: true`); line `source_type` without kind set (tier G/X) | §3.2(d) allowed kinds as extracted; line-level kinds `unverified` (OQ-OP-10) | No artifact maps a polymorphic kind set | Kind-set change is a tier-G metadata revision; native identity/version and digests stay fixed unless the native preimage changes (§6(b)) | Never rewritten as typed relations (§3.2(d)) |
| Database immutability | — | Triggers/CHECKs only on `bank_transactions`, `audit_events` (§2.7) | §3.2(c) `database` for those two entities only; `domain_events` has no mechanism (OQ-OP-12) | Unaffected | Unaffected | No enforcement claim extends to the outbox or any other entity |
| `unverified` marks | Commit pin `d06d5ece`; `corpusRef` absent; `entryDigest` not asserted | 43-file list source-gap; `constraint` pseudo-columns `as-extracted`; attribute/constraint content `preserved-unvalidated` (OQ-OP-14) | Per-relation tenant-carrying (OQ-OP-11); outbox immutability (OQ-OP-12); line-level kinds (OQ-OP-10); composite FK forms (OQ-OP-11) | All rows of columns (a), (b), (c) at version `1`, each with an owner (§§4.2–4.4; OQ-OP-02, 05, 06, 09); field entries blocked by OQ-OP-15 | Export byte-reproduction not claimed from the snapshot (§6(b)) | Each mark names its register row in §8 (OQ-OP-01 … OQ-OP-15); none is presented as acquired ([RET] §4 rule) |
| Optional consumer pattern | Absent from the record | Absent from the profile | Absent from declared constraints | Unaffected | Unaffected | §5 only; adoption is a consumer choice |
| Licence closure | Admission gate (`excluded-licence`); `licences: ["MIT"]`, digest task OQ-OP-13 | §§2.1–2.9 sourced from OpenERP migrations only | — | No asserted identifier at version `1`; future entries identifiers only, no structure | Closure recomputed per version | MIT throughout (§7); closure within MIT/Apache-2.0/CC0 at admission |

## 10. Acceptance fixtures

A claim is verifiable only if a named fixture or command output decides it (exit status, diagnostic code, digest equality, corpus receipt — G0 §8 reading rule). Fixtures FX-OP-* are this ontology's corpus content (`openerp-conformance-corpus@1`, OQ-OP-08); the G0 fixture identifiers cited are the G0 inventory fixtures whose observables are reused unchanged. No fixture in this section asserts a storage tier, a DDL shape, or a SAP/Odoo field correspondence beyond §4.

| Id | Decides | Expected observable (pass) |
|---|---|---|
| FX-OP-01 | Transcription completeness and export reproducibility (§§2.1–2.8, 6(b)) | (a) *From the snapshot (decides transcription):* a Node comparison (zero Python) of §§2.1–2.8 against the pinned [ONT] file finds equal counts 43 / 67 / 62 / 60 / 146 / 57 / 27 / 0 (`parserGaps`), equal per-entity columns (776 rows including the 3 pseudo-columns), relations, enums, CHECKs and invariants, and the pinned file sha256 `dcee5c9d…` verifies. (b) *From the OpenERP repository only (decides reproduction; never claimed from the snapshot):* with the 43 migration inputs pinned (OQ-OP-03), a Node re-run of [EXP] compared semantically — `producedAt` set aside, all other fields exactly equal (§6(b)) — matches [ONT]; asserting the re-run file SHA-256, or running (b) from the snapshot, fails the fixture |
| FX-OP-02 | Native validity and digest correctness (§§1.6, 2.9) | Building [PROF] by N1–N4 from [ONT] with Node and normalizing with [ENG] at `origin/main@636fa9d6…` (no source path, pinned source read through a TypeScript bundler) yields `validateOntologyProfile` = `[]`, native counts 67 `node_types` (each `{}`) / 146 `relation_types` (each `{ source, target }`), a field audit finding no key outside §2.9.0 (N4), and `profile_hash` = `contentDigest`; recomputing P-PINS and P-RESULT from §1.6 reproduces `pinsDigest` and `resultDigest`; adding a fabricated non-native field (invented attribute type, nonexistent reference, fabricated constraint kind) still yields `[]`, proving the result claims native conformance only and tier-G/X content stays `preserved-unvalidated`; changing one tier-N key or endpoint changes `contentDigest` and `resultDigest` while the P-PINS bytes stay fixed until the pin itself changes (FX-DIG pattern), and changing only a tier-G fact changes no profile digest with native identity/version and layer pins fixed (§6(b), FX-OP-09) |
| FX-OP-03 | Record closure and admission refusal (§§1.3, 1.5) | The §1.3 record validates against the closed G0 §1.4 field set (extra field refuses; a `corpusRef` carrying an unresolved encoding instead of omission refuses closure); admission without the `family-corpus` (EXT) receipt refuses with `missing-receipt` at `completeness: complete` and at `skeleton` (FX-CAT-GATE pattern); a `pass` receipt with `resultEvidence: unresolved` refuses identically (FX-RCPT-UNRESOLVED) |
| FX-OP-04 | Licence closure (§7) | The recomputed closure over the pack contains MIT only; injecting a fixture dependency with an excluded licence refuses admission with `excluded-licence` and no lifecycle transition cures it |
| FX-OP-05 | Tenant-scoped uniqueness (§3.2(a)) | As a §3 G0-annotation check (the native profile itself enforces no uniqueness): two `invoices` rows with equal `invoice_number` and distinct `organization_id` both satisfy the annotation; equal `organization_id` + `invoice_number` violates it. Same observable for `accounts (organization_id, code)` and `tax_categories (organization_id, code)` |
| FX-OP-06 | Polymorphic declarations (§3.2(d)) | As a §3 G0-annotation check (the native profile itself enforces no kind domain): `journal_entries.source_type = manual` with any `source_id` satisfies the annotation (no target asserted); `source_type` outside `invoice\|payment\|manual` refuses; `reconciliation_links.candidate_kind` (required, `notNull: true`) outside the extracted set `{payment}` refuses; the two line-level `source_type` pairs report their allowed-kind set as `unverified` (OQ-OP-10) rather than passing a kind check |
| FX-OP-07 | Evidence immutability declarations (§3.2(c)) | As a §3 G0-annotation check over the extracted mechanisms (the native profile itself enforces no immutability): a `bank_transactions` update/delete on an imported row is refused by the declared trigger annotation; an `amount` jsonb value with an extra or missing key refuses the declared shape CHECK; same observable for `audit_events` update/delete triggers |
| FX-OP-08 | Mapping artifact integrity (§4) | Each §4 complete artifact (four fields, `entries: []`) carries a `contentDigest` that recomputes from its stated P-MAPPING preimage with Node ([ENG] `mappingDigestOf`); publishing a first established type entry creates mapping `version: "2"` with a new digest and leaves every ontology digest unchanged (§6(c)); every register row at version `1` carries no typed entry (absence never reads as equivalence), and any entry using the `type` arm for a field decision, any field-level entry before OQ-OP-15 is resolved, or a grouped source identifier, fails qualification |
| FX-OP-09 | Candidate diff and versioning by preimage tier (§6(b)) | In the OpenERP repository with inputs pinned (FX-OP-01(b) setup), re-running [EXP] on unchanged migrations yields an empty semantic diff (`producedAt` set aside) and no new version; claiming byte equality of the re-run file fails. Independently reproducible from the snapshot in Node: (G) changing only `organizations.legal_name.notNull` from `true` to `false` yields a metadata diff, a governed metadata revision and the unchanged version-`1` triple; (N) removing the existing `quote_handoffs.opportunity_id` reference and matching relation as specified in §6(b) changes the native projection, requires a successor draft at version `2`, and yields the three changed digests in the §6(b) vector; (X) unresolved OQ-OP-14 / OQ-OP-15 remains a gap with no native field or version assigned and the unchanged §1.6 triple. The version-only control at `2` also reproduces its three changed digests, proving equality holds only with identity/version fixed. All expected digests are the Node-computed §6(b) values; published `openerp@1` bytes remain unchanged (G0 R-2) |
| FX-OP-10 | Lifecycle stability (§§1.5, 6(a)) | Deprecating a published version leaves `contentDigest`, `pinsDigest`, `resultDigest` equal and changes `entryDigest` (FX-DIG-04); the deprecated version stays resolvable by pin; requesting an unknown version refuses with `incompatible_version`, never a latest fallback |
| FX-OP-11 | Optional-pattern isolation (§5) | Removing §5 from the specification changes no digest in §1.6 and no entry in §4 (the pattern is consumer-side only); a consumer adopting the immutable-profiles row validates `bank_transactions` evidence against §3.2(c) without any ontology change |
| FX-OP-12 | Chain coverage (§§2.8, 4.1) | Each of the 19 types — `opportunities`, `quote_handoffs`, `projects`, `time_entries`, `invoice_proposals`, `invoice_proposal_lines`, `invoices`, `invoice_lines`, `payments`, `journal_entries`, `journal_entry_lines`, `bank_transactions`, `reconciliation_links`, `accounts`, `tax_categories`, `tax_rate_versions`, `fx_rate_snapshots`, `companies`, `contacts` — appears as an individual row in each of the §§4.2, 4.3 and 4.4 registers with an explicit `unverified` mark and a register owner (OQ-OP-02 / OQ-OP-09, OQ-OP-05, OQ-OP-06 respectively); a missing or grouped row fails the fixture |

## Closing statement

This specification freezes `openerp@1` as an external pack under Engram guardianship: OpenERP semantic authority, Engram custodianship, open standards as the only normative anchor, SAP and Odoo as public-identifier mapping targets, MIT throughout. It changes no code, no OpenERP data, no catalog state and no Track state. Points marked `unverified` and the §8 register are the complete list of what this specification does not assert.


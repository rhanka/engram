# SPEC_EVOL — Graphify neutral memory and knowledge engine

**Date:** 2026-08-16  
**Status:** committed design; implementation blocked until L0–L7 and every exit gate pass  
**Artifact:** design only; this document authorizes no source merge, publication, migration, or service activation

Except for Appendix A, which is an evidence ledger, every statement in this document is normative. This document is the sole normative authority for the new capability. Compatibility mappings, identity models, authority topologies, runtime trigger choices, and deployment-specific vocabulary belong in separately owned integration material and are not part of this specification.

## 1. Governing decisions

### D1 — The capability is an isolated, neutral package

The capability is the private package `engram-memory`, rooted at `engram-memory/`, private until a release decision publishes it, with these exports:

- `engram-memory/contracts`: data-only DTOs, port signatures, errors, and receipts; it has no runtime imports;
- `engram-memory`: the engine and pure algorithms; it depends only on `contracts` and injected ports;
- `engram-memory/integration`: the neutral integration surface an external host instantiates — factories, types, and ports only. It carries no process, listener, supervisor, signal handler, credential store, or consumer import, and confers no server semantics; the external host, not graphify, supplies any process, supervision, or transport;
- `engram-memory/sqlite` and `engram-memory/postgres`: canonical-store adapters with their driver dependencies isolated from `contracts` and the engine.

The package has no dependency on the existing root entrypoint, graphology, a coordination library, an identity library, a design system, or a model-routing library. The root entrypoint may depend on `engram-memory`; the reverse edge is forbidden. Projection bridges may depend on both sides but are not re-exported by `engram-memory`.

L0 physically extracts the legacy activity subsystem from `src/agent-stats/**` into a separately owned module and removes its CLI, exports, registry parsing, identity resolution, identifier syntax, role fields, and coordination projection from Graphify. L0 also extracts the legacy `src/memory-*.ts` compatibility implementation and its external source-authority headers; no compatibility API remains published by Graphify. Per owner decision D-1=A (2026-10-06), the organization-scoped exclusion binds the `engram-memory` build, test, generated-contract, and publication closure: every organization-scoped runtime, peer, and development dependency, together with its importing bridge, is removed from that closure or relocated to a separately owned adapter package, and none remains in it. The root manifest, source tree, and lockfile closure outside that package boundary are product dependencies outside the memory boundary. These are extraction lots, not descriptions of the repository's current state.

The hard boundary is accepted only when all of the following hold:

1. dependency and import closure is one-way;
2. runtime, type-only, dynamic, test, fixture, documentation-example, and generated-code edges are checked;
3. emitted `.d.ts` and JSON Schema property names are exactly the property-name set specified here, with `additionalProperties: false` on every object;
4. emitted contracts contain no consumer identifier and no evaluator, authorship, review-leg, persona, role, roster, coordination, or topology shape;
5. opaque string **values** may carry integration-owned references, but their field names and semantics remain the neutral ones defined here.

An import-only test is insufficient. L0 must scan the packed tarball, its dependency lock closure, emitted declarations, generated schemas, source maps, fixtures, and examples.

### D2 — Exactly two neutral deployment modes

| Mode | Process boundary | Canonical store | Administrative provider |
|---|---|---|---|
| `embedded-local` | engine and adapter in the caller process (library); no server | SQLite adapter | injected neutral ports (incl. injected `AdminProviderPort`) |
| `external-host` | engine and adapters instantiated in an external host process via injected ports; graphify provides no server, supervisor, or listener | SQLite adapter (single-node) or Postgres adapter | injected neutral ports (host-supplied `AdminProviderPort`) |

No other mode name is normative. `standalone-service` and `managed-service` are retired. `cluster-mesh`, `nu`, and `h2a` are integration material, outside this specification's normative text. A projection backend is not a canonical-memory backend. Backend selection (SQLite or Postgres) is host configuration, not a mode. `external-host` is strictly graphify's process boundary — not a deployment model; supervision, high availability, and networking are orthogonal host profiles (D-B). The `external-host` Postgres backend is not supported until the Postgres canonical-store parity gate in L6 passes.

Any injected `AdminProviderPort` (§5.10) — together with the `AuthorizationPort`, `AdmissionPolicy`, `EvidenceVerifierPort`, `CryptoPort`, and maintenance interfaces it configures — MUST satisfy these six normative requirements, in `embedded-local` and `external-host` alike:

- bootstrap is default-deny: a new store has no usable authority; `AdminProviderPort.bootstrap` requires an empty administration state and confers authority only through an explicit bootstrap operation, before any valid receipt exists;
- authorization receipts live for at most five minutes and bind the current authorization epoch;
- rotation creates a new credential binding and atomically increments the epoch; revocation records a credential digest and increments the epoch; all earlier receipts then fail revalidation;
- loss of the credential has no bypass path. Recovery is a separate, explicitly authorized restore operation using a verified backup manifest;
- admission may be configured by policy, but Graphify sees only the six-field decision envelope in §5.3;
- redaction defaults to the minimal allowlist and omits derivation lineage unless an explicit policy allows it.

The host — never graphify — carries two custody obligations:

- the random 256-bit credential is placed in the operating-system credential store, or in a user-selected file created atomically with owner-only permissions when no credential store is available; credentials are never accepted from command-line arguments, environment variables, logs, or ordinary configuration files;
- console bootstrap runs on an exclusive local console and only under the active storage fence.

### D-A — SQLite `external-host` is single-node; multi-node requires Postgres

SQLite `external-host` is single-node only. The D8 fence (`flock` kernel lock, `storage_epoch`) is local-node; the D8 filesystem refusals (NFS, SMB, FUSE, removable, unknown) bind the external host, which MUST place the `.db` on a supported local filesystem. Separate nodes hold separate `.db` files and do not share canonical state. Multi-node therefore requires the Postgres backend. A movable local filesystem attached exclusively with drain, attach, and digest verification is a closed alternative and is out of scope for v1.

### D-B — Graphify makes no supervision or availability guarantee

Graphify gives no supervision, high-availability, or reachability guarantee. `external-host` is a process boundary only. Process supervision, restart, networking, and high availability are host obligations expressed as a host deployment profile, outside graphify's contract. Wire delivery of receipts to remote consumers is likewise a host obligation and never an API graphify exposes; if graphify exposed it, graphify would again be a server.

**Receipt-relay host obligations (folded from v4's minimal O3 relay contract).** When the host relays graphify receipts to callers outside the engine process, graphify defines no wire API; the host — never graphify — carries the relay obligations, enumerated here as the D2 credential-custody obligations are enumerated:

- **default in-process restriction:** by default, `external-host` serves only in-process callers of the host; relaying a receipt to any out-of-process or remote consumer is an explicit host decision, not a graphify default;
- **authenticated transport:** any relay runs over a transport the host authenticates end to end;
- **store/epoch binding:** each relayed receipt stays bound to its originating `store_id` and `storage_epoch` (and, for authorization receipts, the authorization epoch), so a receipt cannot be replayed against a different store or a superseded fence;
- **freshness / anti-replay:** the host enforces freshness and anti-replay on relayed receipts within their ≤5-minute validity;
- **no graphify wire API:** wire delivery remains a host obligation and is never an interface graphify exposes; if graphify exposed it, graphify would again be a server.

### D3 — One canonical journal; all search surfaces are projections

Immutable record blobs plus the append-only lifecycle journal are authoritative. Current-state tables, accepted lexical documents, graph nodes/edges, vectors, caches, aggregates, exports, and UI scenes are projections. No projection method, including `GraphStore.pushGraph`, may commit, admit, mutate, or resurrect a canonical memory record.

The public `CanonicalMemoryStorePort` is the only injectable canonical-storage seam. Existing `GraphStore` remains a graphology-bearing projection port. Existing `VectorStore` remains a separate vector projection port; pgvector is not a `GraphStore` and is never described as a canonical backend merely because it can receive vectors. The memory engine communicates with graph and vector projections only through the data-pure projection DTOs in §5.8; bridges to existing stores live outside the isolated package.

## 2. Baseline and intake contract

Implementation targets commit `343690503748f325cc7673b577321271cb0cbb9f`. L0 must explicitly intake or reimplement only the relevant behavior from these pinned commits before writing behavioral RED tests:

| Intake | Purpose | Treatment |
|---|---|---|
| `45b88bddf8a3caa5cfef4a6d572f317c381a8b9d` | closed scene-contract evidence | retain the neutral interval behavior only |
| `a9d5ba1c628f518929e47ce2025933bbb4f636ed` | temporal slice and citation-sidecar seam | retain as a projection consumer of the common temporal predicate |
| `686d24c3d8c81d5884667e803f09f5fe7d14901d` | legacy memory seam bundle | migration input only; do not publish or retain its contract |
| `1bb7f03d917c3833865d0d66241b67850925a536` | append/tombstone projection behavior | characterization input only; canonical writes move to the new port |
| `70dcfb9663e081651b8309f5338f6274e5bc5f03` | SQLite adapter and native-driver evidence | reuse driver mapping where conformant; replace ownership and transactions |

These commits are evidence/intake pins, not a claim that their combined tree is neutral or safe. L0 records exact rebased commit identities in its realization plan. A change of target or intake SHA requires a new baseline audit and refreshed expected RED failure text.

## 3. Time, identity, and canonical encoding

### D4 — Bi-temporality has two independent axes

**Valid time** states when an assertion applies in the represented world. Every record has integer epoch-millisecond `t` and optional `t_end`:

- a bounded valid interval is closed: `[t, t_end]`;
- `t_end === t` is a point;
- absent `t_end` means positive infinity;
- `t_end < t`, non-integers, non-finite numbers, and values outside JavaScript's safe-integer range are invalid;
- membership at `valid_as_of = v` is `t <= v && (t_end === undefined || v <= t_end)`.

**System time** states when Graphify recorded knowledge of a fact. A writer allocates a gap-free unsigned 64-bit journal cursor, represented in JSON as a canonical decimal string without leading zeroes. An event is visible at `system_as_of = s` iff `event.cursor <= s`; the boundary is inclusive. `recorded_at` is a writer-assigned RFC 3339 UTC instant with millisecond precision, monotonically non-decreasing with cursor, but the cursor is the ordering authority. Events with equal `recorded_at` remain ordered by cursor.

A dual-as-of read first folds exactly the events with cursor `<= system_as_of`, then applies valid-time membership at `valid_as_of`. Defaults are captured once at the start of a recall sequence: `system_as_of` defaults to the current high-water cursor and `valid_as_of` defaults to the engine clock (`ClockPort`) at that cursor. The first page receipt pins both values; later pages must reuse them or fail with `STALE_PAGE`. No event recorded after `system_as_of` may affect eligibility, reconciliation, ranking, redaction, or projection inputs for that read.

Supersession, non-current marking, rewind, expiry, trust invalidation, and tombstone act on system time from their journal cursor. A transition may also carry `valid_effective_at`; when present, it changes valid-currentness at and after that closed valid-time boundary. Tombstone dominates every state at and after its system cursor, regardless of valid time. A read at an earlier system cursor remains reconstructible when retention permits it.

Ranking recency uses **valid time only**, never ingestion order or journal cursor. For candidate `i` at `valid_as_of = v`:

```text
anchor_i = (t_end_i is absent) ? v : min(v, t_end_i)
age_i    = max(0, v - anchor_i)
recency_i = exp(-ln(2) * age_i / half_life_ms)
```

Open intervals that are valid at `v` therefore have recency `1`. The profile receipt pins `half_life_ms`.

When a temporal UI filter is active, untimed elements are excluded. A timed element is visible exactly when the closed predicate holds; an edge additionally requires both endpoints. With the filter off, untimed projection scaffolding may be displayed. `sceneTimeRange` uses the minimum finite start and the maximum finite end, falling back to start for an open end. Recall, canonical queries, time slice, scene construction, and the renderer consume one shared fixture but may implement the predicate in their native language.

### D5 — Exact canonical bytes and digest domains

All digestible DTOs use RFC 8785 JSON Canonicalization Scheme UTF-8 bytes. Strings are NFC-normalized before validation; unpaired surrogates, non-safe integers, `-0`, `NaN`, infinities, duplicate keys, and additional properties are rejected. `Digest` is lowercase `sha256:` plus 64 hexadecimal digits.

```text
payload_digest = SHA-256("graphify-memory/payload/v2\0" || JCS(CandidatePayloadV2))
record_digest  = SHA-256("graphify-memory/record/v2\0"  || JCS(record_without_record_digest))
event_digest   = SHA-256("graphify-memory/event/v2\0"   || JCS(event_without_event_digest))
receipt_digest = SHA-256("graphify-memory/<receipt-kind>/v1\0" || JCS(receipt_without_receipt_digest))
proposal_id    = SHA-256("graphify-memory/proposal/v1\0" || JCS(proposal_identity_fields))
eligibility_digest = SHA-256("graphify-memory/reconciliation-eligibility/v1\0" || JCS({
                       comparison_system_as_of,
                       records: [{ record_id, record_digest, authorization_receipt_digest,
                                   revalidation_receipt_digest }]  // both records, UTF-8 ascending record_id
                     }))
receipt_digest(reconciliation-outcome) = SHA-256("graphify-memory/reconciliation-outcome/v1\0" || JCS(outcome_without_receipt_digest))
```

The digest domain-separator prefixes above (and the `scoring_formula_ref` values below) retain the literal string `graphify-memory` after the package was renamed to `engram-memory`: they are hashed/compared byte-for-byte and persisted in existing stores, so changing them would silently invalidate every record, receipt, and profile written before the rename. The prefixes are opaque constants, not the package identifier; only the package name and its module paths were renamed.

The payload digest never substitutes for the record digest. Admission binds the record digest. `record_id` is `mem_` followed by unpadded lower-case base32 of the record-digest bytes. `event_id`, idempotency keys, and opaque references are identities, not alternate content digests.

## 4. Normative data model

The TypeScript below is normative. Generated JSON Schemas must be semantically identical and set `additionalProperties: false` on every object. `ReadonlyArray` is serialized as a JSON array. Optional means absent, never `null`, unless `null` is explicitly in the type.

**Evolution rule (2026-10-06 amendment, D-5).** Within a `…V<n>` DTO, an OPTIONAL field may be added only by a dated EVOL amendment stating its presence condition, together with an entry under `## Unreleased` in the repository `CHANGELOG.md` naming the DTO, the field and that condition. The version consequence is set by the release decision: `engram-memory` is private at `0.0.0` and unpublished (`engram-memory/package.json:2–4`). A required field, a removed field, or a changed meaning requires a new `…V<n+1>` DTO.

```ts
export type Digest = `sha256:${string}`;
export type Cursor = string;                 // canonical unsigned-u64 decimal
export type Instant = string;                // RFC 3339 UTC, millisecond precision
export type OpaqueRef = string;               // NFC UTF-8, 1..512 bytes
export type IdempotencyKey = string;          // NFC UTF-8, 16..256 bytes
export type JsonPointer = string;

export interface ValidIntervalV1 {
  t: number;                                  // safe integer epoch-ms
  t_end?: number;                             // inclusive; absent = +infinity
}

export interface CitationLocatorV1 {
  scheme: string;                             // registered neutral scheme
  value: string;
}

export interface CitationV1 {
  citation_id: string;
  source_ref: OpaqueRef;
  locator: CitationLocatorV1;
  content_digest: Digest;
  observed_at?: Instant;
}

export type MemoryComponentKind = "context" | "decision" | "evidence";

export interface MemoryComponentV2 {
  component_id: string;
  kind: MemoryComponentKind;
  text: string;                               // 1..65_536 UTF-8 bytes
  citation_ids: ReadonlyArray<string>;        // at least one; all must resolve
}

export interface PrimaryEventAnchorV1 {
  at: number;                                 // safe integer epoch-ms
  type_ref: OpaqueRef;                        // descriptive, not a trigger
  citation_id: string;                        // exactly one primary anchor
}

export interface DerivationLineageV1 {
  source_record_ids: ReadonlyArray<string>;   // sorted, unique, 1..64
  transform_ref: OpaqueRef;
  transform_receipt_digest: Digest;
}

export interface RetentionV1 {
  expires_at?: Instant;                       // system-time retention boundary
  derivative_rule: "retain" | "make-ineligible";
}

export interface ReconciliationConsentV1 {
  family_refs: ReadonlyArray<OpaqueRef>;       // sorted, unique; empty = opt out
}

export interface CandidatePayloadV2 {
  schema_version: 2;
  scope_ref: OpaqueRef;                       // opaque protection boundary
  purpose_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  components: ReadonlyArray<MemoryComponentV2>; // 1..64
  primary_component_id: string;               // resolves exactly once
  primary_event: PrimaryEventAnchorV1;
  citations: ReadonlyArray<CitationV1>;        // 1..256, unique ids
  retention: RetentionV1;
  reconciliation: ReconciliationConsentV1;
  derivation?: DerivationLineageV1;
}

export type EvidenceClass = "earned" | "asserted" | "signed";

export interface TrustBindingV1 {
  class: EvidenceClass;
  evidence_digest: Digest;
  verifier_id: OpaqueRef;
  verifier_version: string;
  issued_at: Instant;
  expires_at?: Instant;
  revocation_epoch: Cursor;
  receipt_digest: Digest;
}

export interface MemoryRecordV2 extends CandidatePayloadV2 {
  record_id: string;                          // writer-derived from record_digest
  payload_digest: Digest;
  record_digest: Digest;
  recorded_at: Instant;                       // writer assigned
  recorded_cursor: Cursor;                    // writer assigned
  authorization_receipt_digest: Digest;
  trust: TrustBindingV1;
}
```

The caller supplies `CandidatePayloadV2`, never writer fields or a trust class. Exactly one primary component and exactly one primary event anchor are required. `primary_event.citation_id` must resolve to a citation used by the primary component, and the locator must cover the anchored event. Every component is atomic for citation and redaction purposes; multiple component kinds may coexist.

`scope_ref` is opaque. No installation, tenant, workspace, compartment, user, hierarchy, wildcard, or shared/private label exists in the record schema. Only `AuthorizationPort` may interpret the reference. Scope change is never an in-place mutation.

Evidence class is immutable for a record. `asserted` is the engine's fail-closed class when no configured verifier produces a stronger valid binding. `earned` requires a verifier receipt binding source evidence to the payload digest. `signed` requires a verifier receipt binding a verified cryptographic attestation to the payload digest. The caller cannot request a class. Elevation creates a distinct pending derivative; verifier expiry or revocation appends `trust_invalidated` and makes the old record ineligible without rewriting it.

## 5. Normative ports, errors, and receipts

### 5.1 Common result and typed errors

**2026-10-17 conformance amendment.** `MemoryErrorCode` includes `PROJECTION_OVERSIZED`,
the existing typed refusal when a raw current projection exceeds the §8/D10 byte ceiling.
This corrects an omission in this alias; the implementation and ceiling are unchanged.

```ts
export type MemoryOperation =
  | "capture" | "cancel_capture" | "request_admission"
  | "reject" | "withdraw" | "dispute" | "resolve_dispute" | "expire" | "supersede"
  | "mark_non_current" | "rewind" | "trust_invalidate" | "tombstone"
  | "recall_current" | "recall_history" | "recall_disputed"
  | "propose_capitalisation" | "propose_reconciliation" | "inspect_candidate"
  | "projection_invalidate" | "backup" | "restore" | "admin" | "migrate";

export type MemoryErrorCode =
  | "INVALID_SCHEMA" | "INVALID_DIGEST" | "DIGEST_CONFLICT"
  | "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED"
  | "POLICY_UNAVAILABLE" | "POLICY_STALE" | "ILLEGAL_TRANSITION"
  | "NOT_FOUND" | "ALREADY_TERMINAL" | "DEADLINE_EXCEEDED" | "CANCELLED"
  | "CAPABILITY_UNAVAILABLE" | "STORE_UNAVAILABLE" | "FENCE_LOST"
  | "CURSOR_GAP" | "JOURNAL_CORRUPT" | "BLOB_MISSING"
  | "PROJECTION_STALE" | "PROJECTION_OVERSIZED" | "RANKING_UNAVAILABLE" | "STALE_PAGE"
  | "REGISTRY_VERSION_UNAVAILABLE" | "BACKUP_INVALID" | "RESTORE_REFUSED" | "MIGRATION_LEDGER_INVALID";

export interface MemoryErrorV1 {
  code: MemoryErrorCode;
  operation: MemoryOperation;
  message: string;
  retryable: boolean;
  error_receipt_digest?: Digest;
  denial?: true;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryErrorV1 };
```

Unknown errors are mapped to `STORE_UNAVAILABLE` or `CAPABILITY_UNAVAILABLE`, never exposed as an untyped throw across a public port. Validation may throw only for programmer misuse of the in-process interface; host and storage boundaries always return `Result`.

The `admin` operation is the graphify-mediated entry point (`MemoryPortV2.admin`, §5.5) through which administrative authority reaches the injected `AdminProviderPort` (§5.10): it bootstraps, rotates, or revokes that authority. Graphify defines no built-in administrator; `admin init` is exactly `AdminProviderPort.bootstrap` under an active storage fence. The operation's outcome **is** the port's `AdminEpochReceiptV1` (new in this amendment): no pre-existing valid receipt is required, so first-store bootstrap does not deadlock. A provider-declared authorization denial (`error.denial === true`, §5.10) is mapped by the engine to `UNAUTHORIZED`; when no `AdminProviderPort` is injected, `admin` refuses with `CAPABILITY_UNAVAILABLE`. Because the host reaches administrative authority only through this entry point, the checks below (fence validity, dispatch, denial mapping) are performed by graphify, not by a host that calls `AdminProviderPort` directly.

### 5.2 AuthorizationPort — opaque input, normalized result

```ts
export interface AuthorizationContextV1 {
  credential: string;                         // opaque to Graphify
  context_ref?: OpaqueRef;
}

export interface AuthorizationResourceV1 {
  scope_ref?: OpaqueRef;
  record_id?: string;
  candidate_id?: string;
  source_record_id?: string;
  target_scope_ref?: OpaqueRef;
}

export interface AuthorizationRequestV1 {
  operation: MemoryOperation;
  resource: AuthorizationResourceV1;
  resource_digest: Digest;
  context: AuthorizationContextV1;
  issued_at: Instant;
  deadline_at: Instant;
}

export interface RedactionDirectiveV1 {
  mode: "field-allowlist";
  allowed_fields: ReadonlyArray<JsonPointer>; // sorted, unique
  allow_derivation_lineage: boolean;
  max_packet_bytes: number;
}

export interface AuthorizationAllowedV1 {
  allowed: true;
  decision_id: OpaqueRef;
  policy_version: string;
  operation: MemoryOperation;
  resource_digest: Digest;
  scope_ref: OpaqueRef;
  not_before: Instant;
  expires_at: Instant;
  revocation_epoch: Cursor;
  redaction: RedactionDirectiveV1;
  authentication_receipt_digest: Digest;
  receipt_digest: Digest;
}

export interface AuthorizationDeniedV1 {
  allowed: false;
  decision_id: OpaqueRef;
  policy_version: string;
  operation: MemoryOperation;
  resource_digest: Digest;
  issued_at: Instant;
  reason_ref: OpaqueRef;
  receipt_digest: Digest;
}

export type AuthorizationResultV1 = AuthorizationAllowedV1 | AuthorizationDeniedV1;

export interface AuthorizationRevalidationV1 {
  receipt_digest: Digest;
  checked_at: Instant;
  valid: boolean;
  current_revocation_epoch: Cursor;
  reason: "valid" | "expired" | "revoked" | "unknown";
  revalidation_receipt_digest: Digest;
}

export interface RedactionRequestV1 {
  source_record: MemoryRecordV2;
  target_scope_ref: OpaqueRef;
  directive: RedactionDirectiveV1;
  authorization_receipt_digest: Digest;
}

export interface RedactionResultV1 {
  payload: CandidatePayloadV2;
  source_record_digest: Digest;
  output_payload_digest: Digest;
  policy_version: string;
  receipt_digest: Digest;
}

export interface AuthorizationPort {
  readonly version: 1;
  authorize(request: AuthorizationRequestV1): Promise<Result<AuthorizationResultV1>>;
  revalidate(receipt_digest: Digest, at: Instant): Promise<Result<AuthorizationRevalidationV1>>;
  redact(request: RedactionRequestV1): Promise<Result<RedactionResultV1>>;
}
```

The engine calls the configured port; it never accepts an authorization result supplied directly by a capture or recall caller. Missing, denied, expired, revoked, mismatched-operation, mismatched-resource, or mismatched-scope results deny by default. The normalized schema has no wildcard, hierarchy, namespace override, or multi-scope representation: one allowed result binds one operation, one resource digest, and one exact non-empty `scope_ref`. A caller-requested target reference is inert until the port returns that exact authorized reference. The receipt digest binds every normalized field, while `authentication_receipt_digest` binds the opaque credential/context to a durable principal according to the provider. Graphify validates structure, time bounds, digest binding, exact reference equality, and revocation result; it does not interpret credentials, identity, reference topology, or redaction policy. The port owns redaction policy; Graphify applies its exact field allowlist and byte bound mechanically. Omission is required—pseudonymization is not a substitute for redaction.

### 5.3 AdmissionPolicy — policy owns all evaluation semantics

```ts
export type AdmissionDecision = "accept" | "reject" | "adjudication_required";

export interface AdmissionPolicyRequestV1 {
  policy_id: OpaqueRef;
  policy_version: string;
  record_digest: Digest;
  payload_digest: Digest;                     // knowledge-payload digest of the pending record (distinct from the full record_digest)
  candidate_envelope_ref: OpaqueRef;
  policy_evidence_digest: Digest;             // digest of the authenticated policy-evidence receipt bound to this request
  policy_evidence_ref: OpaqueRef;             // opaque, authenticated carrier from which candidate/submission/admission authority separation is derived; never interpreted by Graphify
  deadline_at: Instant;
}

export interface AdmissionDecisionEnvelopeV1 {
  policy_id: OpaqueRef;
  policy_version: string;
  record_digest: Digest;
  decision: AdmissionDecision;
  issued_at: Instant;
  receipt_digest: Digest;
}

export interface AdmissionPolicy {
  readonly policy_id: OpaqueRef;
  readonly policy_version: string;
  decide(request: AdmissionPolicyRequestV1): Promise<Result<AdmissionDecisionEnvelopeV1>>;
}
```

Evaluator count, evaluator independence, eligibility, authorship exclusion, thresholds, evidence collection, consensus, and adjudication are exclusively internal to `AdmissionPolicy`. They have no field in a Graphify DTO, record, event, error, declaration, or schema. The request carries the authenticated, digest-bound inputs the policy needs to derive candidate/submission/admission authority separation: `payload_digest` and an opaque `policy_evidence_ref` bound by `policy_evidence_digest`. Graphify never interprets the authority contents of `policy_evidence_ref`; it only checks that `payload_digest` matches the immutable pending record's knowledge payload and that `policy_evidence_digest` binds the supplied `policy_evidence_ref`. Graphify validates only that the six-field envelope is exact, its receipt digest is correct, policy id/version matches the configured port, record digest matches the immutable pending record, `issued_at` is timely, and the requested transition is legal. A validation receipt cannot admit. A caller cannot submit a decision envelope. `adjudication_required` leaves the candidate pending and returns a typed non-terminal outcome.

### 5.4 EvidenceVerifierPort and ActivityEvidenceSource

```ts
export interface EvidenceBundleV1 {
  evidence_ref: OpaqueRef;
  evidence_digest: Digest;
  citation_ids: ReadonlyArray<string>;
  attestation?: string;                       // opaque carrier, never trusted alone
}

export interface EvidenceVerificationRequestV1 {
  payload_digest: Digest;
  evidence: EvidenceBundleV1;
  deadline_at: Instant;
}

export interface EvidenceVerifierPort {
  readonly verifier_id: OpaqueRef;
  readonly verifier_version: string;
  classify(request: EvidenceVerificationRequestV1): Promise<Result<TrustBindingV1>>;
  revalidate(receipt_digest: Digest, at: Instant): Promise<Result<TrustRevalidationV1>>;
}

export interface TrustRevalidationV1 {
  binding_receipt_digest: Digest;
  checked_at: Instant;
  valid: boolean;
  current_revocation_epoch: Cursor;
  reason: "valid" | "expired" | "revoked" | "unknown";
  revalidation_receipt_digest: Digest;
}

export interface ActivityEvidenceV1 {
  evidence_id: OpaqueRef;
  subject_ref: OpaqueRef;
  sequence: Cursor;
  valid_time: ValidIntervalV1;
  components: ReadonlyArray<MemoryComponentV2>;
  primary_component_id: string;
  primary_event: PrimaryEventAnchorV1;
  citations: ReadonlyArray<CitationV1>;
  evidence_digest: Digest;
}

export interface ActivityEvidenceRequestV1 {
  after?: Cursor;
  limit: number;                              // 1..500
  valid_window?: ValidIntervalV1;
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;
}

export interface ActivityEvidencePageV1 {
  source_id: OpaqueRef;
  source_version: string;
  evidence: ReadonlyArray<ActivityEvidenceV1>;
  next_after?: Cursor;
  page_digest: Digest;
}

export interface ActivityEvidenceSource {
  readonly source_id: OpaqueRef;
  readonly source_version: string;
  read(request: ActivityEvidenceRequestV1): Promise<Result<ActivityEvidencePageV1>>;
  cancel(cancellation_ref: OpaqueRef): Promise<Result<{ cancelled: boolean }>>;
}
```

`ActivityEvidenceSource` is the only activity/evidence ingestion boundary. Graphify does not discover registries, parse coordination files, resolve runtime identity, interpret roles, or accept provider-specific correlation objects. The engine converts each evidence DTO to an ordinary `CaptureRequestV2`; the source cannot admit a record. Activity evidence reaches recall only after canonical capture, policy admission, accepted indexing, authorization, and final revalidation. `subject_ref` remains opaque and is never promoted to an identity model.

**(2026-10-06 amendment, D-8 A) Host-driven pull of one activity page into ordinary pending captures.** The host invokes `MemoryPortV2.ingestActivity`; the engine never polls a source and trigger selection stays outside Graphify. `ActivityEvidenceV1` carries no scope, purpose, retention or consent, so the host supplies them per call and every item becomes a `CaptureRequestV2` handed to `capture` (fencing, authorization, trust classification and idempotency unchanged). `subject_ref` has no payload field and stays bound only through `evidence_digest`.

```ts
export interface ActivityIngestionRequestV1 {
  source_id: OpaqueRef;                    // names one injected activity_sources entry, else CAPABILITY_UNAVAILABLE
  after?: Cursor;                          // forwarded to ActivityEvidenceRequestV1.after
  limit: number;                           // 1..500, forwarded
  valid_window?: ValidIntervalV1;          // forwarded
  scope_ref: OpaqueRef;                    // host-supplied
  purpose_ref: OpaqueRef;                  // host-supplied
  retention: RetentionV1;                  // host-supplied
  reconciliation: ReconciliationConsentV1; // explicit consent; family_refs [] is the opt-out
  authorization: AuthorizationContextV1;   // used for each item's capture authorization
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;             // forwarded to the source read and to each capture
}

export interface ActivityIngestionItemV1 {
  evidence_id: OpaqueRef;
  sequence: Cursor;
  status: "committed_pending" | "duplicate_exact";
  candidate_id: string;
  cursor: Cursor;
}

export interface ActivityIngestionReceiptV1 {
  source_id: OpaqueRef;
  source_version: string;
  page_digest: Digest;                     // as received; its construction is source-owned
  next_after?: Cursor;
  items: ReadonlyArray<ActivityIngestionItemV1>;
  receipt_digest: Digest;
}
```

```text
idempotency_key = "activity:" + lowercase hex of SHA-256("graphify-memory/activity-idempotency/v1\0" || JCS({ source_id, sequence, evidence_id }))
receipt_digest(activity-ingestion) = SHA-256("graphify-memory/activity-ingestion/v1\0" || JCS(receipt_without_receipt_digest))
```

The key is 73 bytes, inside the 16..256-byte `IdempotencyKey` bound. It leaves out `evidence_digest` on purpose: changed content under the same `(source_id, sequence, evidence_id)` is then a `DIGEST_CONFLICT` with no write, not a second capture.

**(2026-10-15 X1 clarification.)** The built-in memory, SQLite and Postgres stores keep a lifecycle-independent capture-idempotency registry: the clock-independent content digest, original cursor and original fenced transaction-receipt digest are committed with the pending capture and survive admission, rejection, withdrawal and key destruction. SQL adapters persist and reload these entries. An exact replay returns `duplicate_exact` with no sealing or store mutation, including after reopening the store or advancing the clock; changed capture content refuses `DIGEST_CONFLICT` before any write. Sources sharing one store remain isolated by all three identity members. `subject_ref` alone still affects capture only through the source's `evidence_digest`.

A verifier may return `asserted`, but cannot elevate without a valid bound receipt. If no verifier is configured or verification is unavailable, the engine creates its own `asserted` binding with a local receipt over the payload/evidence digests. A malformed, expired, revoked, or caller-fabricated stronger-class receipt fails closed.

### 5.5 Capture and public MemoryPort

```ts
export interface CaptureRequestV2 {
  schema_version: 2;
  idempotency_key: IdempotencyKey;
  payload: CandidatePayloadV2;
  evidence: EvidenceBundleV1;
  authorization: AuthorizationContextV1;
  source_order: { source_ref: OpaqueRef; sequence: Cursor };
  deadline_at: Instant;
  cancellation_ref: OpaqueRef;
}

export interface CaptureAcknowledgementV1 {
  status: "committed_pending" | "duplicate_exact" | "refused" | "unavailable";
  candidate_id?: string;
  record_digest?: Digest;
  cursor?: Cursor;
  transaction_receipt_digest?: Digest;
}

export interface AdmissionRequestV1 {
  candidate_id: string;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdmissionOutcomeV1 {
  status: "accepted" | "rejected" | "pending_adjudication" | "duplicate_exact";
  candidate_id: string;
  record_id?: string;
  cursor: Cursor;
  decision_receipt_digest: Digest;
  transaction_receipt_digest: Digest;
}

export interface LifecycleEventAnchorV1 {
  occurred_at: Instant;                       // valid-time instant of the lifecycle occurrence
  kind_ref: OpaqueRef;                        // opaque lifecycle-reason kind; never a consumer trigger name
  provenance_ref: OpaqueRef;                  // citation/evidence justifying the transition
  provenance_digest: Digest;                  // bound into event_digest and the authorization receipt
}

export interface LifecycleCommandBaseV1 {
  event_id: IdempotencyKey;
  reason_ref: OpaqueRef;
  event_anchor: LifecycleEventAnchorV1;       // citation/evidence-bound anchor; distinct from valid_effective_at (an effect boundary, not an anchor)
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
  reconciliation?: ReconciliationCommandBindingV1; // (new in this amendment) optional proposal binding for dispute, supersede, resolve_dispute
}

export type LifecycleCommandV1 = LifecycleCommandBaseV1 & (
  | { operation: "reject" | "withdraw"; candidate_id: string }
  | { operation: "dispute" | "resolve_dispute" | "expire" |
      "mark_non_current" | "trust_invalidate" | "tombstone";
      record_id: string; valid_effective_at?: number }
  | { operation: "supersede" | "rewind";
      record_id: string; related_record_id: string; valid_effective_at?: number }
);

export interface LifecycleReceiptV1 {
  event_id: IdempotencyKey;
  operation: LifecycleCommandV1["operation"];
  from_state: MemoryState;
  to_state: MemoryState;
  cursor: Cursor;
  event_digest: Digest;
  authorization_receipt_digest: Digest;
  transaction_receipt_digest: Digest;
}

export interface CapitalisationRequestV1 {
  idempotency_key: IdempotencyKey;
  source_record_id: string;
  target_scope_ref: OpaqueRef;
  purpose_ref: OpaqueRef;
  retention: RetentionV1;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface ProjectionInvalidationRequestV1 { // (2026-10-13 amendment, D-10 B)
  through_cursor: Cursor;
  projection_ids?: ReadonlyArray<OpaqueRef>; // absent = all configured surfaces; present = named subset (was required)
  authorization: AuthorizationContextV1;     // REQUIRED credential input for projection_invalidate (new required field)
  deadline_at: Instant;
}
// Exception to the §4 evolution rule per owner decision D-10 B 2026-10-07: the V1 request name is kept although
// `authorization` is a new required field and `projection_ids` changed meaning (required → optional, absent = all
// surfaces), because no working caller exists — every call refused CAPABILITY_UNAVAILABLE.

export interface ProjectionInvalidationReceiptV1 {
  through_cursor: Cursor;
  projection_receipts: ReadonlyArray<{ projection_id: OpaqueRef; cursor: Cursor; digest: Digest }>;
  complete: boolean;
  receipt_digest: Digest;
}

export interface ReconciliationRequestV1 {
  family_id: OpaqueRef;
  family_version: string;
  left_record_id: string;                  // caller order is free; the outcome normalizes it
  right_record_id: string;
  comparison_system_as_of?: Cursor;        // default: readiness high_water_cursor
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface ReconciliationOutcomeV1 {
  registry_id: OpaqueRef;
  registry_version: string;
  family_id: OpaqueRef;
  family_version: string;
  left_record_id: string;                  // UTF-8 ascending
  right_record_id: string;
  comparison_system_as_of: Cursor;
  eligible: boolean;
  proposal?: ReconciliationProposalV1;     // present only when eligible and the comparator relates the pair
  eligibility_digest: Digest;
  receipt_digest: Digest;
}

export interface ReconciliationCommandBindingV1 {
  proposal: ReconciliationProposalV1;
  registry_id: OpaqueRef;
  registry_version: string;
}

export interface ReconciliationEventBindingV1 {
  proposal_id: Digest;
  proposal_digest: Digest;
  family_id: OpaqueRef;
  family_version: string;
  registry_id: OpaqueRef;
  registry_version: string;
}

export interface CapabilityDescriptorV1 {
  contract_version: 2;
  profiles: ReadonlyArray<"offline_lexical_v1" | "semantic_v1">;
  canonical_backends: ReadonlyArray<"sqlite" | "postgres">;
  max_candidates: 2000;
  max_results: 100;
  unfenced_memory_store_permitted: boolean;     // (new in this amendment) §5.9: true iff wired with allow_unfenced_memory_store; a true here on a sqlite/postgres descriptor is a production misconfiguration alarm
  ephemeral_filesystem_store_permitted: boolean; // (new in this amendment) §5.9: mirrors the store receipt's ephemeral-fs posture; a true here on a production descriptor is a misconfiguration alarm
  receipt_digest: Digest;
}

export interface MemoryPortV2 {
  readonly version: 2;
  capabilities(): Promise<Result<CapabilityDescriptorV1>>;
  validate(payload: CandidatePayloadV2): Result<{ payload_digest: Digest }>;
  capture(request: CaptureRequestV2): Promise<Result<CaptureAcknowledgementV1>>;
  ingestActivity(request: ActivityIngestionRequestV1): Promise<Result<ActivityIngestionReceiptV1>>; // (2026-10-06 amendment, D-8 A)
  cancelCapture(cancellation_ref: OpaqueRef): Promise<Result<{ cancelled: boolean }>>;
  requestAdmission(request: AdmissionRequestV1): Promise<Result<AdmissionOutcomeV1>>;
  transition(command: LifecycleCommandV1): Promise<Result<LifecycleReceiptV1>>;
  recall(request: RecallRequestV2): Promise<Result<RecallPacketV2>>;
  proposeCapitalisation(request: CapitalisationRequestV1): Promise<Result<CaptureAcknowledgementV1>>;
  proposeReconciliation(request: ReconciliationRequestV1): Promise<Result<ReconciliationOutcomeV1>>;
  invalidateProjections(request: ProjectionInvalidationRequestV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
  admin(request: AdminOperationRequestV1): Promise<Result<AdminEpochReceiptV1>>; // (new in this amendment) graphify-mediated admin entry point; dispatches to the injected AdminProviderPort (§5.10). AdminOperationRequestV1, AdminEpochReceiptV1 are defined in §5.10.
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
}
```

`CaptureRequestV2` has no trigger-reason field. An external caller may invoke it at any lifecycle point; trigger selection is outside Graphify. Capture can only validate and commit a pending encrypted candidate. Stable idempotency is `(source_ref, sequence, idempotency_key)`: an exact repeat returns `duplicate_exact`; any digest mismatch returns `DIGEST_CONFLICT` with no write. Deadline expiration or cancellation before commit rolls back. An acknowledgement is returned only after the pending transaction is durable.

**Activity ingestion (2026-10-06 amendment, D-8 A).** `MemoryPortV2.ingestActivity` reads one page from the named injected source and converts each item, in page order, to a `CaptureRequestV2` handed to `capture`: admit fencing for `capture`; exact-key request validation; an unknown `source_id` refuses `CAPABILITY_UNAVAILABLE` (capability before authorization); `after`, `limit`, `valid_window`, `deadline_at` and `cancellation_ref` are forwarded to the source read. Per item, `idempotency_key` and `source_order` follow the §5.4 formula; `payload` carries the host-supplied `scope_ref`, `purpose_ref`, `retention` and `reconciliation` with the evidence's `valid_time`, `components`, `primary_component_id`, `primary_event` and `citations`; `evidence` binds `evidence_id` and `evidence_digest` with the sorted citation ids. The first failing capture stops the page and its error is returned; earlier items are durable and idempotent, so the host retries from the same `after`. The source cannot admit: items stay `pending` until `requestAdmission`. Errors carry the existing `capture` operation; no `MemoryOperation` member is added.

**(2026-10-15 X1 compatibility.)** `CanonicalMemoryStorePort.version` remains `1` and `commitPending` retains its direct `CanonicalTransactionReceiptV1` result (§5.7), without an outcome wrapper or fields appended after D5 hashing. Additive optional `readCaptureIdempotency` and `recordCaptureIdempotency` methods leave existing stores usable by ordinary `capture`; `ingestActivity` requires the durable registry capability, otherwise `CAPABILITY_UNAVAILABLE`. Registry read errors fail closed before sealing. `recordCaptureIdempotency` supplements the committed entry with the engine-computed acknowledgement's optional `record_digest`; if this step is interrupted, replays still perform no writes and may omit that optional field. This supplement never replaces the original cursor, content binding or transaction receipt. The receipt and the registry's original receipt digest bind the epoch active at first capture; a reopened store's newer epoch does not rewrite the original acknowledgement. Neither page metadata nor evidence DTO extras may override the host's scope, purpose, retention, consent or admission authority.

Capitalisation never changes the source record's scope or state. The engine authorizes source read and target capture separately, asks `AuthorizationPort.redact` for a sanitized payload, creates a distinct cited derivative with canonical private lineage, and sends it through pending admission. Projection builders never create an edge between records with unequal `scope_ref`. Returned packets omit private lineage unless the authorization directive explicitly allows it.

**Projection invalidation (2026-10-13 amendment, D-10 B).** `MemoryPortV2.invalidateProjections` drives the exported `runProjectionInvalidationCascadeV1` over the engine's store and the host-owned `projection_surfaces` (§5.9 dependencies): admit fencing for `projection_invalidate`; exact-key request validation; absent or empty surfaces ⇒ `CAPABILITY_UNAVAILABLE` (capability before authorization); `through_cursor` above the readiness high-water cursor ⇒ `STALE_PAGE`; authorize `projection_invalidate` through the injected `AuthorizationPort` over the store-wide empty resource with the request's `authorization` context (a denial surfaces as `UNAUTHORIZED`; the engine performs no per-record authorization and never self-authorizes); absent `projection_ids` selects all configured surfaces while a present list selects the named subset, else `INVALID_SCHEMA` for an unknown id (checked before any cascade round); calls serialize on one chain per port — at most one cascade in flight, the rest wait (2026-10-14 amendment, D-10 B tour 4, normative §4: overlapping calls never resurrect); each call replays invisibly in two phases (2026-10-14 amendment, D-10 B tour 5, normative §6): phase 1 walks the outbox to the target without contacting any surface, phase 2 publishes the buffered batches in order with no deadline aborts mid-phase and checks the deadline once before acknowledging — an interrupted call converges every surface yet never certifies success, so an accepted record never disappears from a surface; cascade rounds advance from `after_cursor: "0"` to `max(requested through_cursor, admitted high-water cursor)` — the request is a minimum coverage, never a rollback — one outbox batch (one journal event) per round (`limit: 1`), so every surface applies the canonical journal prefix in total order and a surface's state through a cursor is a function of that ordered prefix — except records currently tombstoned, which the store re-emits as removals (`memory:tombstoned`) in every window (2026-10-13 amendment, D-10 B tour 3, normative resume §1/§6): the terminal tombstone applies retroactively, so an older `through_cursor` never resurrects a tombstoned record and is never followed by a re-added copy; a window's content depends on the current tombstoned set, so its `batch_digest` varies for the same `(from, through)` before and after a tombstone; the cascade re-settles each batch at apply time over the journal (tour 4) — a record tombstoned between the read and the apply still lands in `removals`; the deadline is rechecked before every round and in the cascade before acknowledgement (`DEADLINE_EXCEEDED`, tour 4: never after publication); a receipt acks a cursor only when every round through it was complete on every surface — an incomplete round pins `through_cursor` to the last complete cursor with `complete: false` and stops, never advancing past the gap (a first round with no batch passes `NOT_FOUND` through; a later gap returns the last complete receipt as-is, whose `through_cursor` states the covered prefix). A surface `NOT_FOUND` or untyped exception becomes `PROJECTION_STALE` (tour 3, normative resume §5): only the store's explicit exhaustion result denotes outbox exhaustion. A merged multi-batch window (direct cascade callers) folds each record to its last operation in journal order, so adds and removals stay disjoint whatever order a surface applies. The in-store accepted-lexical surface is maintained synchronously by the store itself, not through `projection_surfaces`.

**Real projection adapters (D-10 B, X2b, owner decision 2026-10-14; corrected 2026-10-15).** FileGraphStore persists the graph through its existing pushGraph; PostgresExactVectorStore uses stock Postgres double precision[] rows, exact cosine and the existing pg dependency. No new image, extension or dependency; no pgvector/ANN qualification. The host-owned factories outside the neutral package expose preparation, publication, acknowledgement and invalidation; engine wiring is exercised by thin test delegates. Canonical terminal resolution is mandatory at construction and checked at application, ingestion and current reads: opaque reason_ref never decides terminality. Physical vector deletion is restricted to the concerned record's canonical terminal tombstone; reversible exclusions remain hidden by the manifest without physically deleting their vectors. An old removal cannot purge a restored living record. Generic exact-vector operations use a disjoint namespace and cannot mutate projection rows. File writes, preparation and explicit recovery serialize under a process queue plus atomic filesystem bakery tickets with Linux process birth identities; abandoned tickets after SIGKILL do not retain the lock. FileGraphStore writes a private staged snapshot followed by atomic rename; a write-ahead manifest intent permits writer recovery. Reads never write or repair an intent and refuse PROJECTION_STALE until a writer repairs it. Materialization is injected; failure cannot substitute fixture objects or silently omit unrelated material. All live node ownership is collected before edges: undeclared endpoints are never created, so incident and dependent edges disappear from the persisted file when their owner or either endpoint loses live ownership. Shared fixture nodes declare every live owner. New coverage must be contiguous from acknowledged coverage (CURSOR_GAP otherwise); an already applied head survives older-window replay after interrupted acknowledgement. Unrelated vector ingestions reapply on the locked fresh state. Dead/zombie file tickets are removed; lock failures return STORE_UNAVAILABLE. SQL writes, preparation and utilities run in a dedicated client transaction with a namespace advisory lock and fresh manifest; rows and manifest roll back together. Schema setup occurs at construction. Preparation cannot acknowledge; single-batch invalidate certifies exactly its through cursor, so an already advanced surface cannot prevent a lagging surface from catching up. Internal diagnostics are mapped to declared surface refusal codes. The local real-file property has 1,344 sequence/order/partition/populated-resume/fault cells with restored survivors and unrelated records, two recovery replays, physical artifact checks and exact oracle contributions. Seven actual-Postgres cases are collected by memory-postgres in required mode for the unchanged pinned 16/17 images; execution is CI-only and unverified here. Boundaries not certified: GraphProjectionPort/VectorProjectionPort conformance or production injection, canonical-root/revision-bound proof semantics, atomic complete multi-surface generations, cache/aggregate/export wiring and a bounded operation ledger. File writer locking assumes one local Linux filesystem/process namespace, not multi-host storage.

**Graphify-mediated admin entry point (new in this amendment).** `MemoryPortV2.admin` is the single appellable path through which administrative bootstrap, rotation, and revocation reach the injected `AdminProviderPort` (§5.10); the host never calls `AdminProviderPort` directly for a check that must be graphify-mediated, which closes the reopening of O4 (an admin dispatch not appellable through graphify). `AdminOperationRequestV1` (§5.10) is a discriminated union over `bootstrap | rotate | revoke` carrying the corresponding sub-request. The engine's normative behavior is:

- **(a)** if no `admin_provider` is injected (§5.9 dependencies), refuse with `CAPABILITY_UNAVAILABLE` before any other check;
- **(b)** for `operation: "bootstrap"` (`admin init`), require an active storage fence and validate that the request's `storage_epoch` equals the live fence epoch reported by the canonical store's fresh capability receipt (§5.9); on mismatch or absent fence, refuse with `FENCE_LOST` before any dispatch;
- **(c)** dispatch the carried sub-request to `AdminProviderPort.bootstrap`, `AdminProviderPort.rotate`, or `AdminProviderPort.revoke` per the discriminant;
- **(d)** map a provider-declared authorization denial to `UNAUTHORIZED`: the engine maps `error.denial === true` (§5.10) to `UNAUTHORIZED`; the mapping is mechanical and total — the engine does not reclassify a decision it did not make, it only maps the provider-declared flag to the code; every other failure surfaces with its own code (e);
- **(e)** on success, return the port's `AdminEpochReceiptV1` as the operation's outcome; no pre-existing valid receipt is required for `bootstrap`, so first-store bootstrap cannot deadlock. Other typed failures surface with their own code (their `error.denial` is absent);
- **(f)** if the injected provider throws, or returns a value that is not a well-formed `Result`, instead of returning a proper `Result`, `admin` surfaces `POLICY_UNAVAILABLE` (the admin provider is the authority of the `authorization_epoch`, §5.10) — the engine keeps `admin` total on its `Result` contract, fail-closed with `retryable: false`; it never maps a throw to `UNAUTHORIZED` or sets `denial: true` (an exception declared no authorization decision, so mapping it to a denial would re-introduce the inference (d) excludes), and never surfaces the provider's raw error text (D2 minimal redaction: it could carry a credential reference, path, or DSN).

### 5.6 Lifecycle journal and closed state machine

```ts
export type MemoryState =
  | "pending" | "rejected" | "withdrawn"
  | "accepted_current" | "accepted_disputed" | "historical"
  | "expired" | "trust_invalid" | "tombstoned";

export interface LifecycleEventV2 {
  schema_version: 2;
  event_id: IdempotencyKey;
  cursor: Cursor;
  recorded_at: Instant;
  operation: LifecycleCommandV1["operation"] | "capture" | "accept";
  candidate_id?: string;
  record_id?: string;
  related_record_id?: string;
  from_state?: MemoryState;
  to_state: MemoryState;
  valid_effective_at?: number;
  record_digest?: Digest;
  authorization_receipt_digest: Digest;
  admission_decision?: AdmissionDecisionEnvelopeV1;
  reason_ref?: OpaqueRef;
  event_anchor?: LifecycleEventAnchorV1;      // required for lifecycle-command transitions; capture/accept derive their anchor from the record's event; bound into event_digest
  reconciliation?: ReconciliationEventBindingV1; // (new in this amendment) optional proposal binding; bound into event_digest
  previous_event_digest: Digest;
  event_digest: Digest;
  previous_event_hash?: Digest;
  event_hash?: Digest;
}
```

| Operation | Legal from | To | Required authorization action | Retry and visibility |
|---|---|---|---|---|
| `capture` | absent | `pending` | `capture` | exact duplicate idempotent; pending never appears in recall, FTS, projection, export, diagnostics, or portable backup |
| `accept` | `pending` | `accepted_current` | `request_admission` plus valid `accept` envelope | one atomic promotion; exact repeat idempotent |
| `reject` | `pending` | `rejected` | `reject` plus valid `reject` envelope | terminal candidate; retry requires a new candidate/idempotency key |
| `withdraw` | `pending` | `withdrawn` | `withdraw` | terminal candidate; body key is destroyed |
| `dispute` | `accepted_current` | `accepted_disputed` | `mark_non_current` | no truth mutation; visible only with `recall_disputed` |
| `resolve_dispute` | `accepted_disputed` | `accepted_current` or `historical` | `mark_non_current` | resolution is a journal fact |
| `supersede` | `accepted_current` or `accepted_disputed` | `historical` | `supersede` | binds a distinct accepted successor; older body remains reconstructible |
| `mark_non_current` | `accepted_current` or `accepted_disputed` | `historical` | `mark_non_current` | no successor required |
| `rewind` | `historical` | `accepted_current` | `rewind` | refused after expiry, trust invalidation, or tombstone; related successor is made historical atomically |
| `expire` | accepted or `historical` | `expired` | `expire` | eligibility also checks `retention.expires_at`; body follows retention policy |
| `trust_invalidate` | accepted or `historical` | `trust_invalid` | `trust_invalidate` | current recall excludes it; earlier system-as-of remains reconstructible when retained |
| `tombstone` | accepted, disputed, historical, expired, or trust-invalid | `tombstoned` | `tombstone` | terminal and dominant; rewind, accept, or later replay cannot resurrect |

Rejected and withdrawn candidates are not records. Pending inspection requires `inspect_candidate` and returns a structurally redacted packet, never a recall result. Historical results require `recall_history`; disputed results require `recall_disputed`. Expiry is sourced from immutable `retention.expires_at`: current eligibility compares it with the system instant pinned for the read. The maintenance fold appends `expire` at first observation; lack of that event cannot make an already expired record eligible. Same `event_id` and same digest is idempotent; same id and different digest is a no-write conflict. Illegal transitions fail before allocation of a cursor.

### 5.7 Public CanonicalMemoryStorePort

```ts
export interface SealedCandidateEnvelopeV1 {
  candidate_id: string;
  envelope_ref: OpaqueRef;
  envelope_digest: Digest;
  key_ref: OpaqueRef;
  ciphertext: string;
}

export interface PendingControlV1 {
  candidate_id: string;
  envelope_digest: Digest;
  state: "pending" | "rejected" | "withdrawn";
  created_cursor: Cursor;
  policy_id: OpaqueRef;
  policy_version: string;
  capture_content_digest?: Digest;
  capture_receipt_digest?: Digest;
}

export interface CanonicalTransactionReceiptV1 {
  operation: MemoryOperation;
  cursor: Cursor;
  storage_epoch: Cursor;
  record_digest?: Digest;
  event_digest: Digest;
  state_digest: Digest;
  lexical_digest?: Digest;
  outbox_digest?: Digest;
  committed_at: Instant;
  receipt_digest: Digest;
}

export interface AcceptedLexicalDocumentV1 {
  record_id: string;
  fields: {
    primary: string;
    context: string;
    decision: string;
    evidence: string;
    citations: string;
  };
  valid_time: ValidIntervalV1;
  trust_class: EvidenceClass;
  record_digest: Digest;
}

export interface AcceptedCandidateSnapshotV1 {
  snapshot_id: OpaqueRef;
  cursor: Cursor;
  valid_as_of: number;
  system_as_of: Cursor;
  documents: ReadonlyArray<AcceptedLexicalDocumentV1>; // sorted by record_id
  eligibility_digest: Digest;
  snapshot_digest: Digest;
}

export interface RevalidationRequestV1 {
  record_ids: ReadonlyArray<string>;          // unique, <=2000
  valid_as_of: number;
  system_as_of: Cursor;
  authorization_receipt_digest: Digest;
  operation: "recall_current" | "recall_history" | "recall_disputed";
}

export interface RevalidationPacketV1 {
  eligible_record_ids: ReadonlyArray<string>; // preserves request order
  removed: ReadonlyArray<{
    record_id: string;
    reason: "state" | "valid_time" | "scope" | "expired" | "trust" | "tombstone" | "redaction";
  }>;
  cursor: Cursor;
  eligibility_digest: Digest;
  authorization_receipt_digest: Digest;
  receipt_digest: Digest;
}

export interface ProjectionBatchV1 {
  from_cursor_exclusive: Cursor;
  through_cursor_inclusive: Cursor;
  records: ReadonlyArray<ProjectionRecordV1>;
  removals: ReadonlyArray<{ record_id: string; reason_ref: OpaqueRef }>;
  batch_digest: Digest;
}

export interface ProjectionRecordV1 {
  record_id: string;
  record_digest: Digest;
  scope_ref: OpaqueRef;
  valid_time: ValidIntervalV1;
  trust_class: EvidenceClass;
  component_kinds: ReadonlyArray<MemoryComponentKind>;
  citation_refs: ReadonlyArray<OpaqueRef>;
}

export interface CanonicalStoreCapabilitiesV1 {
  atomic_promotion: true;
  dense_cursor: true;
  accepted_only_lexical: true;
  fenced_single_writer: boolean;
  revocable_active_store: boolean;
  detached_snapshot: boolean;
  bounded_cancellation: boolean;
  backend: "memory" | "sqlite" | "postgres";
  ephemeral_filesystem_store_permitted?: boolean; // (new in this amendment) §5.9: OPTIONAL; true iff the fenced SQLite store was opened with allow_ephemeral_filesystem_store (a non-production tmpfs/overlayfs opt-in)
}

// MCP-L1 additive extension (SPEC-memory-mcp-v3.1 M3); legacy V2 unchanged.
export interface ScopedCanonicalReadPortV1 {
  readonly version: 1;
  acceptedSnapshot(input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0] & ScopedReadBindingV1): Promise<Result<AcceptedCandidateSnapshotV1>>;
  readRecord(input: Parameters<CanonicalMemoryStorePort["readRecord"]>[0] & ScopedReadBindingV1): Promise<Result<MemoryRecordV2>>;
}

export interface ScopedReadBindingV1 {
  scope_ref: OpaqueRef;
  authorization: AuthorizationAllowedV1;
}

export interface CanonicalMemoryStorePort {
  readonly version: 1;
  readonly scoped_reads?: ScopedCanonicalReadPortV1;
  readonly capabilities: CanonicalStoreCapabilitiesV1;
  commitPending(input: {
    control: PendingControlV1;
    sealed: SealedCandidateEnvelopeV1;
    capture_event: LifecycleEventV2;
  }): Promise<Result<CanonicalTransactionReceiptV1>>;
  readPending(input: {
    candidate_id: string;
    authorization_receipt_digest: Digest;
  }): Promise<Result<PendingCandidateSnapshotV1>>;
  // (2026-10-16 amendment) D-8 A durable idempotence reads/writes: optional
  // for compatibility with V1 stores; `ingestActivity` requires them.
  readCaptureIdempotency?(input: {
    candidate_id: string;
  }): Promise<Result<CaptureIdempotencyRecordV1>>;
  // (2026-10-16 amendment) Canonical registry prefix for logical backup;
  // never includes pending material.
  readCaptureIdempotencyEntries?(input: { through_cursor: Cursor }): Promise<Result<ReadonlyArray<PersistedCaptureIdempotencyV1>>>;
  recordCaptureIdempotency?(input: {
    candidate_id: string;
    record_digest: Digest;
  }): Promise<Result<CaptureIdempotencyRecordV1>>;
  // (MCP-L2 amendment) Durable admission replay: answers after acceptance,
  // rejection or envelope destruction, where readPending reports NOT_FOUND.
  // Optional for compatibility; registries are append-only, never replaced.
  readAdmissionOutcome?(input: {
    candidate_id: string;
  }): Promise<Result<PersistedAdmissionOutcomeV1>>;
  applyAdmission(input: AdmissionStoreInputV1): Promise<Result<CanonicalTransactionReceiptV1>>;
  applyLifecycle(input: {
    command: LifecycleCommandV1;
    event: LifecycleEventV2;
    projection_batch: ProjectionBatchV1;
  }): Promise<Result<CanonicalTransactionReceiptV1>>;
  readRecord(input: {
    record_id: string;
    system_as_of: Cursor;
    authorization_receipt_digest: Digest;
  }): Promise<Result<MemoryRecordV2>>;
  acceptedSnapshot(input: {
    valid_as_of: number;
    system_as_of: Cursor;
    authorization_receipt_digest: Digest;
    max_candidates: number;
  }): Promise<Result<AcceptedCandidateSnapshotV1>>;
  revalidate(input: RevalidationRequestV1): Promise<Result<RevalidationPacketV1>>;
  // (2026-10-16 amendment) Pure-read revalidation: same fencing and
  // eligibility as `revalidate`, without maintenance nor persistence.
  revalidateReadOnly(input: RevalidationRequestV1): Promise<Result<RevalidationPacketV1>>;
  readJournal(input: { after: Cursor; limit: number }): Promise<Result<ReadonlyArray<LifecycleEventV2>>>;
  // (2026-10-16 amendment) D-11 B durable logical-restore import, into an
  // EMPTY store only; optional for compatibility with third-party stores.
  importLogicalBackup?(input: LogicalBackupImportInputV1): Promise<Result<LogicalBackupImportReceiptV1>>;
  checkpoint(input: { through_cursor: Cursor }): Promise<Result<RecoveryCheckpointManifestV1>>;
  nextProjectionBatch(input: { after: Cursor; limit: number }): Promise<Result<ProjectionBatchV1>>;
  acknowledgeProjection(input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>>;
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
  close(): Promise<Result<{ closed: true }>>;
}

// (2026-10-16 amendment) DTOs referenced by the port above, exact shapes of
// the implemented `engram-memory/contracts` (D-8 A lot X1, D-11 B lot X4).
export interface PendingCandidateSnapshotV1 {
  control: PendingControlV1;
  sealed: SealedCandidateEnvelopeV1;
}

export interface CaptureIdempotencyRecordV1 {
  candidate_id: string;
  capture_content_digest: Digest;
  created_cursor: Cursor;
  record_digest?: Digest;
  capture_receipt_digest?: Digest;
}

export interface PersistedCaptureIdempotencyV1 {
  candidate_id: string;
  content: Digest;
  cursor: Cursor;
  record_digest?: Digest;
  receipt_digest?: Digest;
}

// (MCP-L2 amendment) Durable admission replay proof per candidate identity:
// recorded atomically with the admission effect, carrying its scope binding.
export interface PersistedAdmissionOutcomeV1 {
  candidate_id: string;
  scope_ref: OpaqueRef;
  status: "accepted" | "rejected";
  record_id?: string;
  cursor: Cursor;
  decision_receipt_digest: Digest;
  transaction_receipt_digest: Digest;
}

export interface LogicalBackupImportInputV1 {
  journal: ReadonlyArray<LifecycleEventV2>;
  records: ReadonlyArray<MemoryRecordV2>;
  capture_idempotency?: ReadonlyArray<PersistedCaptureIdempotencyV1>;
  expected_capture_idempotency_digest?: Digest;
  expected_restored_cursor?: Cursor;
  expected_canonical_state_digest?: Digest;
}

export interface LogicalBackupImportReceiptV1 {
  restored_cursor: Cursor;
  canonical_state_digest: Digest;
  capture_idempotency_digest?: Digest;
  receipt_digest: Digest;
}

export interface LogicalMemoryBackupDependenciesV1 {
  store: CanonicalMemoryStorePort;
  authorization: AuthorizationPort;
  backup_key: BackupKeyPort;
  backup_object: BackupObjectPort;
  clock: ClockPort;
}

// (new in this amendment) A production CanonicalMemoryStorePort is not constructed directly by
// the host: it is acquired through a graphify-owned factory that takes the storage fence at
// construction. The host runs the factory in-process as a library and never re-implements the
// broker. See the fenced-store lifecycle contract below.
export interface FencedStoreConstructionV1 {
  store_id: OpaqueRef;                          // canonical store identity (opaque: real path or DSN reference)
  backend: "sqlite" | "postgres";
  deadline_at: Instant;
}

export interface CanonicalMemoryStoreFactoryV1 {
  readonly version: 1;
  readonly adapter_id: OpaqueRef;               // graphify-owned adapter identity
  readonly adapter_version: string;
  // Acquires the storage fence and returns a live fenced store, or fails (FENCE_LOST /
  // STORE_UNAVAILABLE) when a live holder already exists. The factory PROPAGATES the opener's in-process fence
  // mark to the returned store (the opener stamps only after a real kernel fence), and its readiness() declares
  // this build's compiled adapter identity — informational only, never the admission basis (§5.9).
  acquire(input: FencedStoreConstructionV1): Promise<Result<CanonicalMemoryStorePort>>;
}

export type AdmissionStoreInputV1 =
  | {
      outcome: "accept";
      candidate_id: string;
      record: MemoryRecordV2;
      decision: AdmissionDecisionEnvelopeV1 & { decision: "accept" };
      event: LifecycleEventV2;
      lexical_document: AcceptedLexicalDocumentV1;
      projection_batch: ProjectionBatchV1;
    }
  | {
      outcome: "reject";
      candidate_id: string;
      scope_ref: OpaqueRef;
      decision: AdmissionDecisionEnvelopeV1 & { decision: "reject" };
      event: LifecycleEventV2;
    };
```

Promotion is one store transaction: authenticate and revalidate receipts; verify envelope, payload, and record digests; insert the immutable blob; append the journal event; update folded state; insert the accepted-only lexical document; enqueue the projection batch; destroy or retire the pending key; commit; then return the transaction receipt. An injected failpoint at any step must leave all six surfaces unchanged. Rejection atomically changes only candidate control and destroys its body key; it never creates a lexical or projection row.

The store is the final eligibility authority. Rank order is never authorization. Every ranked id is revalidated against canonical state, dual time, retention, trust receipt, tombstone ledger, and a freshly revalidated authorization receipt immediately before packet materialization.

**Fenced-store lifecycle contract (new in this amendment).** In `external-host`, the host reuses the graphify fenced broker as a library; the `flock` (D8, SQLite) or store-generation advisory lock (D9, Postgres) is held by the host process that runs the graphify broker code, never by a host re-implementation. Beyond `close()`, the port carries this normative lifecycle:

- **Acquisition at construction.** `CanonicalMemoryStoreFactoryV1.acquire` takes the storage fence when the store is constructed; it refuses if a live holder already exists. This is the two-halves acquisition acceptance in L4, and it remains graphify-owned.
- **Single-broker-instance rule.** At most one live broker instance per store per process. A second live holder — in-process or cross-process — is refused, not queued.
- **Write serialization.** The acquired instance serializes all mutating operations behind the fence; concurrent writers are refused, never interleaved.
- **Reader-lease revocation.** The acquired instance owns reader leases; detached snapshot and backup readers hold finite, revocable leases tied to the current `storage_epoch` and are revoked on fence transition.
- **`FENCE_LOST` is terminal.** On lock loss or epoch mismatch the instance returns `FENCE_LOST` and performs no further SQL. Graphify never silently re-acquires: the host MUST discard the instance and reconstruct a fresh one (host restart) to obtain a new fence.
- **No unfenced fallback.** The unfenced pure-SQL variant is forbidden (§5.9). A store that cannot present a fresh fenced capability receipt refuses every fencing-dependent operation with `CAPABILITY_UNAVAILABLE`; it never degrades to raw SQL. Host process supervision and restart are host obligations (D-B).

### 5.8 Projection ports remain data-pure

```ts
export interface GraphProjectionPort {
  readonly version: 1;
  apply(batch: ProjectionBatchV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
}

export interface VectorQueryInputV1 {
  snapshot_id: OpaqueRef;
  eligible_record_ids: ReadonlyArray<string>;
  query_text: string;
  limit: number;
}

export interface VectorQueryOutputV1 {
  matches: ReadonlyArray<{ record_id: string; score: number }>;
  model_ref: OpaqueRef;
  projection_cursor: Cursor;
  receipt_digest: Digest;
}

export interface VectorProjectionPort {
  readonly version: 1;
  query(input: VectorQueryInputV1): Promise<Result<VectorQueryOutputV1>>;
  apply(batch: ProjectionBatchV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
}

export interface SemanticAdjacencyV1 {
  record_ids: ReadonlyArray<string>;           // sorted; accepted and eligible only
  offsets: ReadonlyArray<number>;
  neighbours: ReadonlyArray<number>;
  weights: ReadonlyArray<number>;
  projection_cursor: Cursor;
  adjacency_digest: Digest;
}

export interface SemanticProjectionPort {
  readonly version: 1;
  inducedAdjacency(input: {
    eligible_record_ids: ReadonlyArray<string>;
    system_as_of: Cursor;
  }): Promise<Result<SemanticAdjacencyV1>>;
}
```

Existing graphology `GraphStore` adapters may be used behind `GraphProjectionPort`; existing pgvector behavior may be used behind `VectorProjectionPort`. Neither existing port is imported by `engram-memory`, and neither is canonical.

### 5.9 Crypto, pending quarantine, backup, and operational receipts

```ts
export interface CryptoPort {
  readonly version: 1;
  seal(input: { candidate_id: string; plaintext: string; context_digest: Digest }): Promise<Result<SealedCandidateEnvelopeV1>>;
  open(input: { sealed: SealedCandidateEnvelopeV1; context_digest: Digest }): Promise<Result<{ plaintext: string }>>;
  destroy(input: { key_ref: OpaqueRef; idempotency_key: IdempotencyKey }): Promise<Result<{ destroyed: boolean; receipt_digest: Digest }>>;
  rotate(input: { key_ref: OpaqueRef; idempotency_key: IdempotencyKey }): Promise<Result<{ key_ref: OpaqueRef; receipt_digest: Digest }>>;
}

export interface BackupKeyPort {
  readonly version: 1;
  seal(input: {
    key_ref: OpaqueRef;
    plaintext: string;
    context_digest: Digest;
  }): Promise<Result<{
    ciphertext: string;
    ciphertext_digest: Digest;
    key_receipt_digest: Digest;
  }>>;
  open(input: {
    key_ref: OpaqueRef;
    ciphertext: string;
    context_digest: Digest;
  }): Promise<Result<{ plaintext: string; key_receipt_digest: Digest }>>;
}

export interface BackupObjectPort {
  readonly version: 1;
  put(input: {
    target_ref: OpaqueRef;
    object_id: OpaqueRef;
    ciphertext: string;
    ciphertext_digest: Digest;
  }): Promise<Result<{ object_ref: OpaqueRef; object_receipt_digest: Digest }>>;
  get(input: {
    source_ref: OpaqueRef;
    object_ref: OpaqueRef;
    expected_ciphertext_digest: Digest;
  }): Promise<Result<{ ciphertext: string; object_receipt_digest: Digest }>>;
}

export interface RecoveryCheckpointManifestV1 {
  schema_version: 1;
  high_water_cursor: Cursor;
  storage_epoch: Cursor;
  state_digest: Digest;
  journal_root_digest: Digest;
  blob_root_digest: Digest;
  policy_versions: ReadonlyArray<{ id: OpaqueRef; version: string }>;
  registry_versions: ReadonlyArray<{ id: OpaqueRef; version: string }>;
  included_classes: ReadonlyArray<MemoryState | "pending_envelope" | "journal" | "blob_ref">;
  external_blob_refs: ReadonlyArray<{ ref: OpaqueRef; digest: Digest }>;
  manifest_digest: Digest;
}

export interface LogicalBackupManifestV1 {
  schema_version: 1;
  generation: Cursor;
  high_water_cursor: Cursor;
  included_classes: ReadonlyArray<"accepted_current" | "accepted_disputed" | "historical" | "terminal_ledger">;
  excluded_counts: { pending: number; rejected: number; withdrawn: number; derived_projections: number };
  records_root_digest: Digest;
  journal_root_digest: Digest;
  // (2026-10-16 amendment) The implemented manifest also binds the
  // journal-fold state, the hash-only capture registry root (absent in
  // v1/v2 payloads), and the sealed object references below.
  state_digest: Digest;
  capture_idempotency_digest?: Digest;
  terminal_ledger_digest: Digest;
  object_ref: OpaqueRef;
  ciphertext_digest: Digest;
  key_receipt_digest: Digest;
  object_receipt_digest: Digest;
  manifest_digest: Digest;
}

export interface MemoryBackupPort {
  readonly version: 1;
  exportLogical(input: {
    through_cursor: Cursor;
    authorization: AuthorizationContextV1;
    object_target_ref: OpaqueRef;
    encryption_key_ref: OpaqueRef;
    deadline_at: Instant;
  }): Promise<Result<LogicalBackupManifestV1>>;
  restoreLogical(input: {
    manifest: LogicalBackupManifestV1;
    authorization: AuthorizationContextV1;
    source_ref: OpaqueRef;
    decryption_key_ref: OpaqueRef;
    deadline_at: Instant;
    target_store?: CanonicalMemoryStorePort;
  }): Promise<Result<LogicalBackupImportReceiptV1>>;
}

export interface OperationalCapabilityReceiptV1 {
  store_id: OpaqueRef;
  backend: "memory" | "sqlite" | "postgres";
  storage_epoch: Cursor;
  high_water_cursor: Cursor;
  capabilities: CanonicalStoreCapabilitiesV1;
  // (new in this amendment) OPTIONAL declared adapter identity — INFORMATIONAL/diagnostic only. A production
  // store's readiness() declares this build's compiled adapter identity so a duplicate package or version drift
  // is legible in the receipt. It is NOT the admission basis: the engine admits on an in-process fence mark, not
  // on these fields, and never on `backend` (§5.9). There is NO signature. All three present or all absent.
  adapter_id?: OpaqueRef;                        // graphify-owned adapter identity (declared)
  adapter_version?: string;                      // adapter release version (declared)
  adapter_build_digest?: Digest;                 // digest of the adapter implementation/build (declared)
  // (2026-10-06 amendment, D-5/R2-h) OPTIONAL hard-link alarm — present iff backend === "sqlite". True iff the
  // canonical database inode carries more than one link (st_nlink > 1) at readiness() time. Informational alarm
  // only, never an operational refusal.
  multiply_linked?: boolean;
  issued_at: Instant;
  expires_at: Instant;
  receipt_digest: Digest;                        // over the receipt WITHOUT receipt_digest (no circularity)
}

export interface ClockPort {
  now(): Instant;
}

export interface MemoryEngineDependenciesV2 {
  canonical_store: CanonicalMemoryStorePort;
  authorization: AuthorizationPort;
  admission_policy: AdmissionPolicy;
  admin_provider?: AdminProviderPort;           // (new in this amendment) OPTIONAL dispatch target of MemoryPortV2.admin; absence ⇒ admin refuses with CAPABILITY_UNAVAILABLE
  allow_unfenced_memory_store?: boolean;         // (new in this amendment) §5.9: NON-production opt-in — with a module in-memory store, admits fencing-dependent ops unfenced; never inferred from receipt.backend; strict boolean
  on_unfenced_memory_store_permitted?: () => void; // (new in this amendment) §5.9: optional observability hook fired once at construction when the flag is set (the package emits no console)
  evidence_verifier?: EvidenceVerifierPort;
  crypto: CryptoPort;
  activity_sources: ReadonlyArray<ActivityEvidenceSource>;
  graph_projection?: GraphProjectionPort;
  vector_projection?: VectorProjectionPort;
  semantic_projection?: SemanticProjectionPort;
  assertion_registry?: AssertionFamilyRegistry;
  projection_surfaces?: ReadonlyArray<ProjectionInvalidationSurfaceV1>; // (2026-10-13 amendment, D-10 B) OPTIONAL host-owned derived surfaces driven by invalidateProjections; absent/empty ⇒ CAPABILITY_UNAVAILABLE
  backup_object?: BackupObjectPort;
  backup_key?: BackupKeyPort;
  clock: ClockPort;
}

export declare function createMemoryPortV2(dependencies: MemoryEngineDependenciesV2): MemoryPortV2;
export declare function createLogicalMemoryBackupV1(dependencies: LogicalMemoryBackupDependenciesV1): MemoryBackupPort;

// (2026-10-16 amendment, motivation) The three declaration blocks above are
// aligned onto the implemented `engram-memory` package, which is the tested
// reality: D-8 A (lot X1) added the optional idempotence reads/writes,
// `revalidateReadOnly`, and the capture-registry DTOs; D-11 B/X1 (lot X4)
// added `importLogicalBackup`, the `state_digest` / `capture_idempotency_digest`
// / `object_ref` / `ciphertext_digest` manifest bindings, and the
// store-scoped `createLogicalMemoryBackupV1` factory (the engine-scoped
// `createMemoryBackupPort` name was never implemented). The prose of §5.9
// already described all of these; only the declaration blocks were stale, so
// the spec is corrected and no code changes. `tests/memory-evol-declarations.test.ts`
// locks the declaration blocks to the code member-for-member, in both
// directions, so either side drifting turns CI red.
// (2026-10-16 amendment, coverage-3) Complete the stale declarations without
// changing runtime behavior: MemoryErrorV1.denial is the provider denial flag
// already required by §5.10; LifecycleEventV2.previous_event_hash/event_hash
// carry the optional persisted journal-chain hashes; PendingControlV1's two
// capture digests bind D-8 A's durable replay acknowledgement. All five remain
// optional, matching existing stores and callers. MemoryBackupPort.restoreLogical
// also declares D-11 B's optional target_store and LogicalBackupImportReceiptV1
// (including capture_idempotency_digest), so durable restore is described fully.
// The declaration test now checks every EVOL interface's members/optionality
// and the complete restore signature, rather than two selected interfaces.
```

Pending body, citations, locators, validation material, evidence, and candidate digest live inside one `CryptoPort`-sealed envelope. Outside it, the store may persist `PendingControlV1` and the canonical hash-only capture-idempotency registry (identity, content digest, original cursor and optional acknowledgement digests); no plaintext, tokens, snippets, source locator, or derived statistic is allowlisted. Pending, rejected, and withdrawn content is excluded from FTS, graph/vector projections, caches, exports, diagnostics, telemetry, crash dumps, and logical backup.

A local recovery checkpoint is a complete fold checkpoint: it includes encrypted pending-control/envelope references, all retained immutable-record references, tombstone/supersession/currentness state, policy and assertion-registry versions, journal integrity roots, and every blob reference needed by tail events. `RecoveryCheckpointManifestV1.registry_versions` is the sorted unique `(registry_id, registry_version)` over reconciliation-bound journal events with `cursor <= through_cursor`, read from the stored journal event field on every backend. `RecoveryCheckpointManifestV1.policy_versions` is likewise the sorted unique `(policy_id, policy_version)` over journal `admission_decision` envelopes at or below the cursor — never the live pending-control table — so a logical restore, which carries no pending controls by quarantine, yields the identical checkpoint manifest. Blobs may remain in an external canonical blob store only when the manifest binds their digest. Genesis replay and checkpoint-plus-tail replay must yield the same canonical RFC-8785 state digest; byte identity of database files is neither required nor claimed.

Portable logical backup is distinct. It uses a detached, cursor-pinned snapshot and an allowlist. It includes every retained accepted current, disputed, and historical record needed for the supported dual-as-of window, plus terminal ledgers required to prevent resurrection. It excludes pending/rejected/withdrawn envelopes, FTS, graph/vector projections, caches, and aggregates. `BackupKeyPort` seals each logical object before `BackupObjectPort` receives it; the object provider never receives plaintext, and Graphify never interprets the key or target reference. Restore verifies schema versions, manifest digest, every manifest part (cursors, classes, counts, roots, refs, receipts — key/object receipts are bound to the receipts returned by the key/object ports), terminal dominance, and replay equivalence before readiness. Durable export (D-11 B, lot X4) reads only the public `CanonicalMemoryStorePort` — dense journal pages via `readJournal`, referenced record reads and the hash-only registry prefix via `readCaptureIdempotencyEntries`, never pending envelopes or controls; the sealed payload is versioned (`schema_version: 3`, with mandatory `excluded_counts` and `capture_idempotency`); the derived-projection count is computed from journal operations in O(journal). Restore into a SQLite or Postgres target writes through the store `importLogicalBackup` method, atomically into an empty store only: the import rebuilds every store-owned derived surface (accepted lexical rows + FTS index, plus one coalesced projection-rebuild batch carrying the restored `accepted_current` set as records and every other folded record as a removal) in the same transaction, and compares the expected restored cursor, journal-fold state digest AND capture-idempotency root BEFORE commit (a mismatch rolls back with `RESTORE_REFUSED`, never a written target). Downstream graph/vector projections rebuild from zero on a restored target by applying that batch. Rupture documentée : le membre `store` de `LogicalMemoryBackupDependenciesV1` passe de `LogicalBackupStoreV1` (conservé `@deprecated`, inutilisé) à `CanonicalMemoryStorePort` ; un appelant qui ne fournissait que les deux anciennes méthodes doit migrer.

**(2026-10-15 X1 / Opus a1.)** Canonical logical-restore equality is the pair `(state_digest, capture_idempotency_digest)`: the former retains the existing journal-fold meaning, while the latter binds the complete sorted registry prefix, including identities whose pending/rejected/withdrawn envelope is quarantined. The manifest binds both roots; the payload v3 carries the hash-only entries, and memory, SQLite and Postgres imports validate them and compare both roots before atomic promotion. Restore receipts bind both roots too. An exact activity replay after restore returns the original acknowledgement as `duplicate_exact` without sealing or mutation; modified evidence refuses `DIGEST_CONFLICT` before either. Quarantined candidates remain unavailable for admission: restoring their hash acknowledgement does not restore their body or envelope. A store without the registry-export capability refuses v3 backup with `CAPABILITY_UNAVAILABLE`.

Payload v1 (without mandatory counts) and v2 (with counts) remain readable without a registry. Counts absent in v1 are recomputed from the journal. For these legacy payloads, the manifest has no `capture_idempotency_digest`. For these payloads and for stores persisted before X1 and opened in place, known capture identities with no verifiable registry binding refuse `DIGEST_CONFLICT` before sealing or commit, for both exact and changed evidence. They are never guessed from event hashes or recaptured. New identities can still be captured. A v3 payload missing its registry/root refuses `BACKUP_INVALID`; a root mismatch refuses `RESTORE_REFUSED`. A malformed persisted entry, invalid JSON, or a binding that disagrees with its capture/control refuses opening/readiness with typed `JOURNAL_CORRUPT`, rather than silently backfilling an acknowledgement. In-memory `storage_epoch` binds readiness and transaction receipts to the same value.

Operations that require fencing, revocable readers, detached snapshots, accepted-only lexical input, or bounded cancellation refuse with `CAPABILITY_UNAVAILABLE` when a fresh capability receipt lacks them. There is no unfenced, raw-FTS, stale-projection, or unranked fallback. In production — embedded-local production SQLite — a fresh capability receipt satisfies the fencing requirement only when the store passes the in-process provenance check defined below (§5.9); a bare `fenced_single_writer: true` is insufficient.

**Capability attestation (new in this amendment).** In production, `CanonicalStoreCapabilitiesV1.fenced_single_writer` is not a self-asserted boolean: a caller cannot claim fencing by setting a flag.

*Threat scope (stated precisely).* This attestation guards against a **misconfigured or naive store** that would falsely report fencing — an adapter/version mismatch, a stale or wrong build, or a store that never took the fence. It does **not**, and cannot, guard against a **malicious in-process host**: that host controls the process and any in-process key, and can therefore forge any in-process assertion. The trust boundary here is deployment topology, not cryptography — the host is inside the trust boundary by construction. No unproven crypto trust root is claimed; there is **no signature and no key**. Within that scope, an **in-process fence mark** — applied by graphify's own SQLite/Postgres opener **only after it takes a real kernel writer fence**, and propagated by the fenced-store factory to the wrapper it returns — proves that a store actually took this build's fence; a store that never took the fence is unmarked and **detected**, not authenticated against a hostile host. This supersedes two retired designs: the earlier factory-stamps-every-store mark (mere factory acquisition did not prove a live fence) and the compiled-identity comparison (a declared identity is a copyable string of the same forgeable family as a self-asserted boolean, and same-module membership already subsumes it).

*Single admission path (in-process fence mark).* A production store is admitted for fencing-dependent operations only when it is a member of this build's fence-mark registry — a mark graphify's SQLite/Postgres opener applies to the store **only after taking a real kernel writer fence**, and the factory propagates to the wrapper it returns. There is no second check: the retired compiled-identity comparison added nothing (a same-module store always matches; a cross-module store is already a non-member), and the self-asserted `fenced_single_writer` boolean is **not** consulted (same forgeable family as the retired `backend` string). The **engine** (`createMemoryPortV2`) checks membership before any fencing-dependent operation, never delegates to the store's own `readiness()`, and **never consults `receipt.backend`**. The kernel fence the SQLite opener takes — and the store re-proves on **every** operation via `#fence` — is: a non-blocking exclusive `flock` on the canonical database's **own inode** (no `.lock` sidecar); a **liveness** proof that `/proc/self/fdinfo/<fd>` still records that exact open-file-description's exclusive flock (per-fd, so another fd of the same process cannot spoof it, and a JS shim over the native flock module cannot forge a kernel line); a **separate anti-rename** proof that the path still resolves to the flocked `(dev, ino)` captured from the fd (a `mv other db` leaves the old inode locked but repoints the name, which fdinfo alone cannot see); a refusal, tested against the **actual open fd** (`/proc/self/fd/<fd>`, so a lenient directory probe cannot mask it), of any network/removable/FUSE filesystem and of an **ephemeral** one (tmpfs, overlayfs — a database there is lost on restart, overlayfs being the container's writable layer) unless the host sets the strict boolean `allow_ephemeral_filesystem_store` for a non-production embedded harness (a flag DISTINCT from `allow_unfenced_memory_store`, so a memory opt-in never widens a filesystem decision); and the durable `storage_epoch` check. This is **Linux-only**: the proof requires `/proc`, so macOS and Windows **fail closed at open** (deferred, not a supported production target). The Postgres opener's fence is the session advisory-lock generation (D9). A store that is not a member — a bare/fake store, or one that never took the fence — is refused exactly as an unfenced store. This binds **embedded-local production SQLite**, the sole operational mode (§12). **`external-host`** is design-reserved: an in-process mark does not cross a process boundary; no cross-process mechanism is defined here.

*Non-production exemption.* A store is admitted WITHOUT a fence mark only when BOTH hold: the host explicitly set `allow_unfenced_memory_store` (a strict boolean — a string such as `"true"` is rejected), AND the store is this build's neutral in-memory canonical store (`createInMemoryCanonicalMemoryStoreV1`, tracked in a module-private registry). The flag alone would exempt any unfenced store, including a lock-less SQLite on a real file; membership alone would let an in-memory store run in production; requiring both keeps production **fail-closed**. The decision **never consults `receipt.backend`** — the forgeable string an earlier draft used as the memory exemption (closed as F1). The declared adapter identity on the receipt is informational only, never the admission basis.

### 5.10 AdminProviderPort — neutral bootstrap, rotation, revocation

```ts
export interface AdminBootstrapRequestV1 {
  store_id: OpaqueRef;                          // canonical store this authority governs
  storage_epoch: Cursor;                        // must equal the active fence epoch
  admin_credential_ref: OpaqueRef;              // opaque host-custodied reference; never a raw secret
  deadline_at: Instant;
}

export interface AdminRotateRequestV1 {
  store_id: OpaqueRef;
  current_authorization_epoch: Cursor;
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdminRevokeRequestV1 {
  store_id: OpaqueRef;
  current_authorization_epoch: Cursor;
  credential_digest: Digest;                    // credential binding to revoke
  authorization: AuthorizationContextV1;
  deadline_at: Instant;
}

export interface AdminEpochReceiptV1 {
  store_id: OpaqueRef;
  storage_epoch: Cursor;                        // (new in this amendment) storage fence epoch under which the operation ran; for bootstrap, equals the validated active fence
  operation: "bootstrap" | "rotate" | "revoke";
  authorization_epoch: Cursor;                  // new/current epoch after the operation
  credential_digest: Digest;                    // digest of the credential binding; never the secret
  issued_at: Instant;
  expires_at: Instant;                          // at most five minutes after issued_at
  receipt_digest: Digest;
}

// (new in this amendment) The request carried by MemoryPortV2.admin (§5.5): a discriminated union
// over the three sub-requests. The engine validates fence/epoch for bootstrap, then dispatches on
// the discriminant to the matching AdminProviderPort method.
export type AdminOperationRequestV1 =
  | { operation: "bootstrap"; bootstrap: AdminBootstrapRequestV1 }
  | { operation: "rotate"; rotate: AdminRotateRequestV1 }
  | { operation: "revoke"; revoke: AdminRevokeRequestV1 };

export interface AdminProviderPort {
  readonly version: 1;
  bootstrap(request: AdminBootstrapRequestV1): Promise<Result<AdminEpochReceiptV1>>;
  rotate(request: AdminRotateRequestV1): Promise<Result<AdminEpochReceiptV1>>;
  revoke(request: AdminRevokeRequestV1): Promise<Result<AdminEpochReceiptV1>>;
}
```

`AdminProviderPort` is a neutral injected interface (new in this amendment): it is the appellable contract that `MemoryOperation."admin"` dispatches to through `MemoryPortV2.admin` (§5.1, §5.5), replacing the retired built-in local administrator. The dependency is optional (`admin_provider?`, §5.9): both `embedded-local` and `external-host` supply it by injection when administrative operations are required, and its absence means graphify refuses `admin` with `CAPABILITY_UNAVAILABLE` rather than shipping a default administrator. Graphify never interprets the credential behind `admin_credential_ref`. Every `AdminProviderPort` MUST satisfy the six normative requirements in D2 (default-deny before the first valid receipt; ≤5-minute receipts bound to the authorization epoch; atomic rotation/revocation epoch increment invalidating earlier receipts; no credential-loss bypass; the six-field admission envelope of §5.3; minimal-allowlist redaction defaults). The §10 `assertAdminProviderConformance` harness certifies a provider against these obligations, and ALL of its cases are mandatory — a `{ conformant: true }` verdict never certifies a subset (an optional case would let a caller pass without ever exercising rotation). Its stale-receipt-after-rotation case drives bootstrap → rotate → an operation authorized by the superseded epoch and requires that last attempt to fail as an authorization denial, and the default-deny-before-bootstrap half is exercised the same way. This is where the property the retired built-in administrator once held is re-covered in V2 — `tests/admin-provider.test.ts > fresh store denies until explicit AdminProviderPort bootstrap and old receipts fail after rotation` — placed where the contract puts credential/epoch semantics: on the provider, not the engine (the engine has no admin-receipt-validation entry). Every `AdminProviderPort` MUST set `denial: true` on an authorization denial, and MUST NOT set it on any failure that is not an authorization decision; the engine maps `denial: true` to `UNAUTHORIZED` (§5.5(d)) mechanically, so a provider that misflags a non-authorization failure would misreport it as a denial. Every `AdminProviderPort` MUST return a `Result` and MUST NOT throw; §5.5(f) governs a provider that violates this (a throw or a malformed `Result` surfaces as `POLICY_UNAVAILABLE`). `bootstrap` succeeds only on an empty administration state and only under an active storage fence (`storage_epoch` must equal the active fence), and confers authority solely through that explicit operation. The 256-bit credential custody and the exclusive local console remain host obligations (D2); they are never part of this port's payload.

`AdminEpochReceiptV1.authorization_epoch` is the same monotonic counter the configured `AuthorizationPort` reports for that store as `revocation_epoch` / `current_revocation_epoch` (§5.2); it is distinct from `TrustBindingV1.revocation_epoch` (a per-binding verifier epoch, §4) and from `storage_epoch` (the storage fence generation, §5.7 / D8).

### 5.11 Host-signed migration exclusion ledger (owner amendment, 2026-10-16)

The host owns signing keys, public-key trust, key identifiers and supported algorithms. The memory package holds no signing key and supplies no default signer. These additive versioned ports are injected into the standalone migration call, not into the canonical store:

```ts
export interface ExclusionLedgerSignatureV1 {
  algorithm: string;
  key_id: OpaqueRef;
  signature: string; // host-defined encoding (base64 for the Ed25519 conformance host)
}
export interface ExclusionLedgerSignerPortV1 {
  sign(ledger_digest: Digest): Promise<ExclusionLedgerSignatureV1>;
}
export interface ExclusionLedgerVerifierPortV1 {
  verify(ledger_digest: Digest, signature: ExclusionLedgerSignatureV1): Promise<boolean>;
}
export interface MigrationExclusionLedgerPortsV1 {
  exclusion_ledger_signer?: ExclusionLedgerSignerPortV1;
  exclusion_ledger_verifier?: ExclusionLedgerVerifierPortV1;
}
```

`MigrationLedgerV1` retains `generation`, the sorted `migrated` and `excluded` partitions, and `ledger_digest`. This dated amendment adds OPTIONAL `signature?: ExclusionLedgerSignatureV1`, present whenever at least one record is excluded, absent on a lossless migration. Every migrated entry preserves its source reference, record digest, valid interval and citations; every excluded entry names its source reference and deterministic exclusion reason. Their existing domain-separated receipt hashes remain bound by the root:

```text
ledger_digest = "sha256:" || hex(SHA-256("graphify-memory/migration-ledger/v1\0"
                || UTF8(JCS({ generation, migrated, excluded }))))
signature = host.sign(UTF8(ledger_digest))
```

The signature and root fields are excluded from the root preimage, avoiding recursion. The existing root domain and receipt domains are unchanged. `algorithm`, `key_id` and `signature` are non-empty strings in an exact descriptor. The host verifier MUST enforce the algorithm and trusted-key binding and MUST return false for an unknown key, unsupported algorithm or invalid signature; it must never trust a key supplied by the ledger itself.

`migrateRetainedNeutralRecordsV1(records, generation?, ports?)` now returns `Promise<Result<MigrationLedgerV1>>` (the package is private and unpublished). It validates the record array, generation, source references, canonical data, exact ledger shape and each receipt BEFORE calling a host signer. Malformed input that cannot form a valid ledger returns `INVALID_SCHEMA`, operation `migrate`, `retryable: false`, without signing or rejecting the promise. Records with a defined exclusion reason still enter the excluded partition. With exclusions, it requires both optional ports, signs the root and verifies the resulting ledger before returning success. Missing signer/verifier or a throwing host port returns `CAPABILITY_UNAVAILABLE`, operation `migrate`, `retryable: false`; a missing/malformed signature, unknown key or invalid signature returns `MIGRATION_LEDGER_INVALID`, never a partial successful migration. Without exclusions, migration succeeds without either port and emits no signature. No unsigned exclusion-producing path remains.

`verifyMigrationExclusionLedgerV1(value: unknown, verifier?)` re-reads a detached snapshot, normalizes all strings to NFC, validates the exact ledger shape, recomputes the root and each entry receipt, then verifies the host signature over that recomputed root. Successful verification returns this normalized snapshot. Unsigned, malformed or modified data returns `MIGRATION_LEDGER_INVALID`, operation `migrate`, `retryable: false`. It requires a signature even if the presented exclusions array is empty: stripping the exclusions and signature cannot downgrade a signed ledger to a lossless migration. Missing verifier or a throwing verifier returns `CAPABILITY_UNAVAILABLE`. Host exceptions never leak raw key material or messages. Root integrity alone never certifies an exclusion ledger. As with all detached signatures, the host must select the expected generation/artifact to prevent replay of a different, validly signed ledger.

A reloaded unsigned lossless ledger can be checked only by re-derivation from the complete trusted source and the expected generation: run `migrateRetainedNeutralRecordsV1(source, expectedGeneration)` again, require success with no exclusions, and compare the re-derived `ledger_digest` with the stored digest. Use the re-derived value as the accepted ledger; the stored partitions themselves are untrusted. If the source is unavailable, this unsigned path cannot establish authenticity. Never choose trust solely from the stored `signature` field or empty `excluded` array, and never re-derive from the stored partitions: removing exclusions and the signature and repairing the public root must fail the source comparison. The signed-ledger verifier deliberately continues to reject every unsigned value.

## 6. Reconciliation

### D6 — Reconciliation compares assertions; it never deduplicates identity

```ts
export interface AssertionComparisonInputV1 {
  family_id: OpaqueRef;
  family_version: string;
  left: MemoryRecordV2;
  right: MemoryRecordV2;
  comparison_system_as_of: Cursor;
}

export interface AssertionFamilyDescriptorV1 {
  family_id: OpaqueRef;
  version: string;
  applies_to_component_kinds: ReadonlyArray<MemoryComponentKind>;
  occurrence_key_version: string;
  comparator_version: string;
  descriptor_digest: Digest;
}

export type ReconciliationRelation =
  | "contradicts"
  | "left_supersedes_right"
  | "right_supersedes_left"
  | "needs_adjudication";

export interface ReconciliationProposalV1 {
  proposal_id: Digest;
  family_id: OpaqueRef;
  family_version: string;
  occurrence_key: string;
  left_record_id: string;
  right_record_id: string;
  relation: ReconciliationRelation;
  comparison_system_as_of: Cursor;
  evidence_citation_ids: ReadonlyArray<string>;
  proposal_digest: Digest;
}

export interface AssertionFamilyRegistry {
  readonly registry_id: OpaqueRef;
  readonly registry_version: string;
  descriptors(): ReadonlyArray<AssertionFamilyDescriptorV1>;
  occurrenceKey(input: AssertionComparisonInputV1): Result<string>;
  compare(input: AssertionComparisonInputV1): Result<ReconciliationProposalV1 | undefined>;
}
```

Eligibility to call a family comparator requires the family id in both records' `reconciliation.family_refs`, identical `scope_ref`, identical immutable trust class, matching family, both records eligible at `comparison_system_as_of`, and citations sufficient for the descriptor. For `binary-status`, citations are sufficient exactly when each record's primary component carries at least one citation (guaranteed by record validation); `evidence_citation_ids` is the sorted unique union of both primary components' citation ids. An empty family list is the default opt-out; purpose alone never implies consent. Identity/entity matching scores are never evidence of truth, contradiction, or supersession.

Inputs are ordered by UTF-8 ascending `record_id`; proposal identity is the digest of `(family_id, family_version, occurrence_key, left_record_id, right_record_id, relation, comparison_system_as_of)`. The directional supersession rule (with `left`/`right` in that order): equal assertion values yield no proposal; two distinct concrete values yield `contradicts`; concrete left strictly newer (`valid_time.t`) than unknown right yields `left_supersedes_right`; concrete right strictly newer than unknown left yields `right_supersedes_left`; exactly one unknown side with the concrete side older-or-equal yields `needs_adjudication`. Proposals sort by occurrence key, then left id, right id, relation. Exact duplicate proposals collapse by id. Ambiguous comparison returns `needs_adjudication`; it never chooses last-write-wins. A proposal mutates nothing. An authorized lifecycle event is required to dispute, supersede, or resolve.

Every proposal and resulting event stores the family and registry version. Replay consumes the stored proposal/event and never reruns a newer comparator. Installing a new registry version creates new proposal identities; it does not rewrite old ones. A registry stamps each family descriptor's `version` with its own `registry_version`; installing a new registry version therefore always yields new proposal identities. If a required version is unavailable, reconciliation readiness fails with `REGISTRY_VERSION_UNAVAILABLE`, while ordinary recall remains available if its own capabilities are intact. Trust elevation is a new record, so comparison always uses the immutable trust binding visible at the pinned system cursor.

## 7. Recall and ranking

### D7 — Accepted-only ranking with mandatory final revalidation

```ts
export interface RecallCapabilityPolicyV1 {
  minimum_channels: "lexical" | "lexical_and_semantic";
  network: "forbid" | "allow";
}

export interface RecallRequestV2 {
  query: string;                              // 1..8192 UTF-8 bytes
  purpose_ref: OpaqueRef;
  as_of?: { valid_time?: number; system_cursor?: Cursor };
  authorization: AuthorizationContextV1;
  capability_policy: RecallCapabilityPolicyV1;
  budgets: {
    max_candidates: number;                   // 1..2000
    max_results: number;                      // 1..100
    max_packet_bytes: number;                 // 1..1_048_576
    deadline_at: Instant;
  };
  page?: { size: number; cursor?: OpaqueRef }; // size 1..50
}

export interface RankReceiptV1 {
  request_digest: Digest;
  authorization_receipt_digest: Digest;
  profile: "offline_lexical_v1" | "semantic_v1";
  profile_version: string;
  profile_config_digest: Digest;
  valid_as_of: number;
  system_as_of: Cursor;
  snapshot_id: OpaqueRef;
  snapshot_digest: Digest;
  candidate_count: number;
  candidate_ids_digest: Digest;
  scoring_formula_ref: OpaqueRef;
  ordered_ids_digest: Digest;
  revalidation_receipt_digest: Digest;
  projection_receipt_digests: ReadonlyArray<Digest>;
  issued_at: Instant;
  receipt_digest: Digest;
}

export interface RecallRecordPacketV2 {
  record: MemoryRecordV2;                     // structurally redacted copy
  redacted_fields: ReadonlyArray<JsonPointer>;
  redaction_receipt_digest: Digest;
  score: number;
  rank: number;
}

export interface RecallPacketV2 {
  records: ReadonlyArray<RecallRecordPacketV2>;
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  packet_digest: Digest;
}

export interface RedactedMemoryRecordV2 {
  record_id: string;
  schema_version?: 2;
  scope_ref?: OpaqueRef;
  purpose_ref?: OpaqueRef;
  valid_time?: ValidIntervalV1;
  components?: ReadonlyArray<MemoryComponentV2>;
  primary_component_id?: string;
  primary_event?: PrimaryEventAnchorV1;
  citations?: ReadonlyArray<CitationV1>;
  retention?: RetentionV1;
  reconciliation?: ReconciliationConsentV1;
  derivation?: DerivationLineageV1;
  payload_digest?: Digest;
  record_digest?: Digest;
  recorded_at?: Instant;
  recorded_cursor?: Cursor;
  authorization_receipt_digest?: Digest;
  trust?: TrustBindingV1;
}

export interface RecallRecordPacketV3 {
  record: RedactedMemoryRecordV2;
  redacted_fields: ReadonlyArray<JsonPointer>;
  redaction_receipt_digest: Digest;
  score: number;
  rank: number;
}

export interface RecallPacketV3 {
  records: ReadonlyArray<RecallRecordPacketV3>;
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  packet_digest: Digest;
}

export interface MemoryRecallPortV3 {
  readonly version: 3;
  recall(request: RecallRequestV2): Promise<Result<RecallPacketV3>>;
}

export interface MemoryReadReceiptV1 {
  record_id: string;
  record_digest: Digest;
  valid_as_of: number;
  system_as_of: Cursor;
  validated_through_cursor: Cursor;
  authorization_receipt_digest: Digest;
  revalidation_receipt_digest: Digest;
  checked_at: Instant;
  receipt_digest: Digest;
}

export interface MemoryReadPacketV1 {
  record: RedactedMemoryRecordV2;
  redacted_fields: ReadonlyArray<JsonPointer>;
  redaction_receipt_digest: Digest;
  read_receipt: MemoryReadReceiptV1;
  packet_digest: Digest;
}

export interface MemoryReadPortV1 {
  readonly version: 1;
  readCurrent(request: {
    record_id: string;
    purpose_ref: OpaqueRef;
    authorization: AuthorizationContextV1;
    max_packet_bytes: number;
    deadline_at: Instant;
  }): Promise<Result<MemoryReadPacketV1>>;
}
```

The caller states minimum capabilities and network permission, not a ranking profile. Graphify selects and pins one available profile before reading candidates. `lexical_and_semantic` requires `semantic_v1`; it never falls back. `lexical` permits Graphify to choose semantic when available or `offline_lexical_v1`; the selected profile cannot change during pagination. A genuine zero-match query returns an empty packet with a complete rank receipt. Missing profile inputs return `RANKING_UNAVAILABLE`, never raw FTS order, unranked success, or a mid-call fallback.

**Versioned redacted recall and authorized point-read facets (owner amendment, 2026-10-17).** Changing `RecallRecordPacketV2.record` from `MemoryRecordV2` to a redacted type would alter the neutral V2 contract. Instead, `MemoryPortV2`, `RecallPacketV2`, and `RecallRecordPacketV2` keep their existing V2 declarations unchanged, while `RedactedMemoryRecordV2`, `RecallRecordPacketV3`, `RecallPacketV3`, `MemoryRecallPortV3`, `MemoryReadReceiptV1`, `MemoryReadPacketV1`, and `MemoryReadPortV1` are introduced as additive versioned neutral facets. `RedactedMemoryRecordV2` is a closed omission schema over `MemoryRecordV2`: `record_id` is required, retained fields keep their original types, unauthorized fields are omitted, components remain atomic with resolving citations, and derivation lineage stays absent unless explicitly authorized. `MemoryReadPortV1.readCurrent` reads one current record by `record_id` under the `recall_current` authorization operation bound to the requested record, applying the same scope isolation, current eligibility, trust, retention, redaction, pure-read revalidation (`revalidateReadOnly`), and fencing rules as recall without depending on search ranking.

#### `offline_lexical_v1`

Offline ranking consumes only `AcceptedCandidateSnapshotV1`. It has no graph, CSR, PPR, vector, embedding, projection, or network input. It may reuse only the tokenizer, BM25, and RRF pure algorithms after adapting the accepted-record lexical DTO; it does not call the existing projection-oriented query module.

Its `profile_version` is exactly `1.0.0` and its `scoring_formula_ref` is exactly `graphify-memory:offline-lexical-recency:v1`.

The fixed bounds and formula are:

```text
candidate_cap = min(request.max_candidates, 2000)
BM25 parameters = k1 1.2, b 0.75
field weights = primary 3.0, decision 2.0, evidence 1.5, context 1.0, citations 0.5
RRF k = 60; at most 8 engine-generated lexical variants
lexical_i = rrf_i / max(rrf_j)                 // 0 when no lexical hit
recency_i = formula in D4; half_life_ms = 2_592_000_000 (30 days)
score_i = 0.85 * lexical_i + 0.15 * recency_i
```

The engine-generated variants and tokenizer version are pinned in `profile_config_digest`. Final order is score descending, then valid-time recency anchor descending, then UTF-8 `record_id` ascending. Only lexical hits enter the candidate set; recency cannot manufacture a match.

#### `semantic_v1`

Semantic ranking begins from the same accepted/authorized snapshot. Its `profile_version` is exactly `1.0.0` and its `scoring_formula_ref` is exactly `graphify-memory:semantic-rrf-recency:v1`. It obtains graph adjacency **induced on exactly the eligible record ids** before CSR construction or PPR, and asks the vector port with the same id allowlist. Removed or tombstoned neighbours contribute zero mass. Lexical, induced-PPR, and vector lists are each bounded to 2000 and fused with RRF `k=60`; the fused normalized score receives the same `0.85/0.15` semantic-plus-recency weighting and the same tie-break. Profile configuration pins PPR alpha, laziness, tolerance, iteration cap, vector model reference, channel availability, and all projection cursors.

After either ranker orders ids, `CanonicalMemoryStorePort.revalidate` removes stale, expired, unauthorized, invalid-trust, out-of-valid-time, historical/disputed-without-capability, and tombstoned ids. Graphify never fills removed slots from an unvalidated list without another bounded revalidation. Packet materialization revalidates authorization, mechanically redacts each record, enforces the packet byte budget, and binds every step in `RankReceiptV1`.

## 8. Canonical backends, projection size, and recovery

### D8 — SQLite is the local canonical store

The SQLite adapter owns a direct, declared `better-sqlite3` runtime dependency and refuses an absent driver. It supports only local **Linux** filesystems — ext4, XFS, Btrfs, and (as ephemeral, see below) tmpfs and overlayfs — and refuses NFS, SMB, FUSE, removable, and unknown types. The macOS/Windows local types (APFS, HFS+, NTFS, ReFS) are intentionally dropped: the fenced store is Linux-only (§5.9), so they are unreachable. **tmpfs and overlayfs are additionally refused as EPHEMERAL** — a database on either does not survive a restart (overlayfs is the container's writable layer) — unless the host sets `allow_ephemeral_filesystem_store` for a non-production embedded harness. In `external-host`, these refusals bind the host: SQLite `external-host` is single-node, the host MUST place the `.db` on a supported **durable, block** local filesystem, and multi-node requires the Postgres backend (D-A). **Declared residual:** a durable filesystem does not by itself guarantee a single *logical* store — two nodes, or two PVCs, still diverge; that uniqueness rests on the single-node constraint (D-A) and the RWO block PVC, declared here and not closed by the filesystem check.

The writer fence is a non-blocking exclusive `flock` (`LOCK_EX|LOCK_NB`) held on the canonical database's **own inode** — graphify opens a private fd on the `.db` file and holds the flock for the store's lifetime, via the declared `fs-ext` NAN-based native addon compiled at install (bound to the Node ABI) (SQLite opens the file on a separate fd, so a second live holder in any process is refused `EAGAIN`). There is **no `.lock` sidecar** and no path-alias normalization step. Liveness is re-proven on **every** operation against `/proc/self/fdinfo/<fd>` (the kernel's per-open-file-description lock record — per-fd, so another fd of the same process cannot spoof it), and a **separate** per-operation check that the path still resolves to the flocked `(dev, ino)` covers rename/replace. **At open** — once, not per operation — the adapter refuses a canonical database whose inode carries more than one name (`st_nlink > 1`, read from the flocked fd in the same `fstat` that captures the identity), returning `CAPABILITY_UNAVAILABLE`. SQLite derives its `-wal`/`-shm`/`-journal` sidecar names from the opened path, so two hard links to one inode give the same database two independent sidecar sets: a reopen through the other name loses an uncheckpointed WAL, and a foreign SQLite client reaching the inode through the alias writes past the `-shm` lock table. A symlink (resolved to the canonical path) and a bind mount (one directory entry, one sidecar set) do not split the sidecars, so `st_nlink` is the exact and only signal. The check is deliberately open-time: while the fence is held the split is inert, and because `FENCE_LOST` is terminal a per-operation re-check would kill a live writer over a harmless `cp -al`; the hazard exists only at reopen, and the next open re-runs the check by whatever name is used. Because this proof and the network-filesystem refusal both read `/proc` (`/proc/self/fdinfo/<fd>`, `/proc/self/fd/<fd>`), the fenced SQLite store is **Linux-only** and fails closed at open on macOS and Windows: the earlier cross-platform `LockFileEx`/POSIX lock helper and the `.graphify-memory.lock` sidecar of this line are **retired**, and macOS/Windows production support is a **declared gap**, deferred to a later specification and native suite. NFS, SMB, FUSE, removable, and unknown filesystems are refused both by the directory probe and, non-bypassably, against the actual open fd; tmpfs and overlayfs are additionally refused as **ephemeral** (a database there is lost on restart) unless the host sets `allow_ephemeral_filesystem_store` for a non-production harness.

**Deployment constraint (Kubernetes).** Because the fence is a local-node kernel `flock` on the database inode, the canonical `.db` MUST live on node-local block storage: a `PersistentVolumeClaim` bound to a **block** `storageClassName` with `ReadWriteOnce` access, never a networked volume. The in-process network-filesystem refusal enforces this at open regardless of the manifest, but the deployment SHOULD also constrain provisioning — e.g. reject an `nfs.csi.k8s.io` (or other network) provisioner for this PVC — so a misconfigured pod fails to schedule rather than at first write. **NFS and CephFS remain a follow-up:** a shared-filesystem fence needs a different (lease / lock-manager) mechanism and is out of scope here. **Hard-link backups on the live PVC are incompatible:** a `cp -al` or `ln` that adds a second name to the live `.db` inode is refused at the next restart by the open-time `st_nlink` check, so it cannot serve as a backup path — take a detached copy (`VACUUM INTO`) or a logical backup instead. `rsync --link-dest` (it links its own destination tree, a distinct inode) and block-level or COW filesystem snapshots (which add no second name to the database inode) are not affected.

**Declared residuals (single-name fence).** (i) A hard link added *after* a successful open is alerted by `readiness()` via `multiply_linked: true` (R2-h, D-5): the fence itself stays sound (it holds the inode's flock, so no other writer is admitted), but a foreign SQLite client reaching the inode through the alias could write past the `-shm` lock table — a host-misconfiguration class, outside the fence's threat model, and caught at the next reopen by whatever name is used. (ii) A refused open at restart leaves the store unavailable — under Kubernetes a `CrashLoopBackOff` until a human removes the extra link; this is fail-closed and accepted. (iii) On overlayfs `st_nlink` may not represent the underlying inode; this is N-A in production (overlayfs is refused as ephemeral) and is noted only for a harness that opts into an ephemeral filesystem.

**Follow-up R2-h (executed, 2026-10-06 amendment, D-5).** The `readiness()` receipt exposes `multiply_linked?: boolean` on SQLite stores so a host can *alert* on a post-open hard link without killing the broker (addressing residual (i) above without a per-operation `FENCE_LOST`). This adds an optional field to `OperationalCapabilityReceiptV1`, bound by `receipt_digest`, governed by the §4 evolution rule. No opt-in flag that would *permit* a multiply-linked store is offered: unlike the ephemeral-filesystem flag it has no legitimate use case (it would turn a loud, remediable refusal into silent corruption), and a flag must not widen a filesystem decision.

Writer acquisition is:

1. acquire the kernel lock without waiting;
2. open the database and verify supported SQLite runtime (`>=3.51.3`, or a documented fixed backport `3.44.6`/`3.50.7`); the `better-sqlite3@12.11.1` bundle reports `3.53.2` (admitted; X3 enforces this at open, refusing with `CAPABILITY_UNAVAILABLE`);
3. begin an immediate transaction, create/read `storage_epoch`, increment it monotonically, persist and commit it durably;
4. bind every prepared mutating statement to the acquired epoch;
5. before the first mutating SQL statement, before every later mutating statement, and immediately before commit, verify both kernel-lock ownership and stored epoch equality;
6. on mismatch or lock loss, execute no further SQL, roll back, close, revoke readers, and return `FENCE_LOST`.

The flock is an open-file-description lock, so the kernel releases it when the **last fd** on that description closes — a graceful `close()` or process death — which is why a crash never strands the fence (*release-after-close*). Kernel release after process death permits a new owner, which increments the epoch before any application write. Busy timeout is only a fuse; it is not ownership. Active readers have finite revocable leases tied to the epoch. Ranking and backup use a SQLite backup-API detached copy pinned to a high-water cursor; they never hold the active WAL. WAL/checkpoint operations run only through the fenced owner.

The native two-process test uses the real driver and lock helper on every supported operating system. It is mandatory and cannot skip because a driver, helper, or filesystem probe is missing.

### D9 — Postgres parity is required for the `external-host` Postgres backend

The Postgres adapter owns a direct, declared `pg` runtime dependency and implements the same public canonical port with one database transaction for blob, journal, state, accepted lexical index, and outbox. It does **not** use a sequence for the logical cursor: the transaction locks a singleton high-water row, computes `next = current + 1`, uses `next` for the journal event, and updates the row in the same transaction; rollback therefore advances neither row nor cursor and cannot create a gap. A store-generation row and transaction-scoped advisory lock fence administrative ownership; every mutation checks generation before its first statement and before commit. Accepted-only lexical queries, dual-as-of folds, tombstone dominance, idempotency conflicts, projection outbox, checkpoint manifest, logical backup, and every receipt must match SQLite canonical state digests for the same conformance trace.

Postgres 16 and 17 are the L6 matrix. The `external-host` Postgres backend remains unavailable if parity differs or the adapter lacks a required capability receipt. pgvector remains optional behind `VectorProjectionPort` and does not affect canonical parity.

Both canonical adapters (SQLite and Postgres) persist a mutation as a `DELETE` of every canonical table followed by a full re-`INSERT` of the folded state, i.e. an `O(total-state)` write amplification per mutation (storage-lane L4 review, observation O3). This is accepted for the `embedded-local` and single-node `external-host` paths and is the declared **write-amplification ceiling** for the `external-host` Postgres backend: incremental (per-event) persistence is a later `external-host` concern and is deliberately out of scope for L6, whose gate is cross-backend canonical parity, not write throughput.

### D10 — `graph.json` is the code graph; memory uses dedicated authorized interfaces (owner amendment, 2026-10-17)

`graph.json` MUST NOT materialize canonical memory records, memory-derived vertices or edges, memory projection envelopes, bodies, identifiers, citations, receipts, or metadata copied from the canonical memory store.

Canonical memory remains in its journal and immutable record store. Agents access it through dedicated authorized MCP tools.

Optional lexical, vector, and semantic memory projections remain separate from the code graph and subject to memory authorization, lifecycle, and invalidation. Code symbols and documentation describing the memory implementation remain legitimate code-graph material; the prohibition concerns materialization from the canonical memory store.

The existing code-graph size ceiling (`52_428_800` raw bytes) applies to the code artifact and does not require copying memories into it. Separate bounded current memory projections (`BoundedCurrentProjectionV1`, `BoundedProjectionExportV1`) may contain only current accepted projection envelopes, citation references, and projection metadata — never record bodies, pending data, journal events, tombstone history, rank receipts, authorization receipts, backup material, or vectors. L6 uses a deterministic synthetic fixture that produces one separate memory projection at exactly the `52_428_800`-byte ceiling and one at ceiling plus one byte; the former is accepted and the latter refused. It does not depend on a dirty working artifact. A bounded export records high-water cursor, included record count, omitted count by reason, projection schema version, and digest. Omission must follow an explicit deterministic filter; silent top-N loss is forbidden. Any journal length may be replayed without linear growth of the separate memory projection when current eligible cardinality is fixed.

## 9. Realization lots — exactly L0 through L7

Every lot follows: add or adapt the minimal interface so the test compiles; capture the exact assertion failure against the pinned baseline; implement; make the scoped test green; run the lot matrix. A missing-module error, skipped native test, dirty-artifact dependency, or vacuous absence check is not an accepted RED.

| Lot | Scope and dependency order | Named executable RED tests and exact behavior gate |
|---|---|---|
| **L0 — baseline, package boundary, extraction** | Pin target/intakes; create `engram-memory/contracts`; physically extract legacy activity and memory compatibility surfaces; remove every organization-scoped dependency/importing bridge from the repository or relocate it to a separately owned adapter package; establish one-way package/export graph. | `tests/memory-neutrality.test.ts > memory package packed closure and emitted d.ts/schema use only neutral vocabulary` (the single scan asserts the packed closure, emitted declarations, and schemas retain neither consumer identifiers nor evaluator/topology shapes); `tests/memory-activity-boundary.test.ts > activity reaches capture only through ActivityEvidenceSource`; `tests/memory-v1-removal.test.ts > no legacy memory export, schema, source-authority header, CLI, or packed file remains`. Baseline fails on real manifest/source/emitted-shape evidence, not missing modules. |
| **L1 — closed temporal contract** | Implement D4 once across recall predicates, store queries, time slice, scene, and renderer; define active-filter untimed behavior and `sceneTimeRange`. | `tests/temporal-boundary-contract.test.ts > keeps t_end===cursor and drops t_end<cursor on recall/store/slice/renderer`; `tests/temporal-boundary-contract.test.ts > active filter drops untimed elements and scene range includes finite t_end`. The renderer at the target baseline supplies the behavioral RED. |
| **L2 — exact records, ports, digests, bi-temporal query** | Publish all §4–§5 DTOs/signatures/errors/schemas; implement exact validation, JCS/domain digests, authorization binding, verifier binding, capture seam, dual-as-of carrier, injected `AdminProviderPort` interfaces, and data-pure projection carriers. | `tests/memory-contract-schema.test.ts > exact schema rejects every additional property and binds primary component event citation payload and record digests`; `tests/memory-authz.test.ts > deny expired revoked mismatched or caller-supplied authorization and apply port-owned field omission`; `tests/memory-trust.test.ts > caller cannot self-label earned or signed and revoked receipt is ineligible`; `tests/memory-admission-envelope.test.ts > engine validates only the six bound policy fields and no evaluation shape is exported`; `tests/memory-capture.test.ts > exact duplicate acknowledges and digest conflict writes nothing`; `tests/memory-dual-as-of.test.ts > valid and system axes vary independently at inclusive boundaries`; `tests/admin-provider.test.ts > fresh store denies until explicit AdminProviderPort bootstrap and old receipts fail after rotation`; `tests/memory-admin-entry.test.ts > (a) refuses CAPABILITY_UNAVAILABLE when no admin_provider is injected, before any other check`; `tests/memory-admin-entry.test.ts > (b) asserts FENCE_LOST before any dispatch only on an epoch mismatch`; `tests/memory-admin-entry.test.ts > (e) bootstrap on empty state needs no prior receipt and returns the provider AdminEpochReceiptV1`; `tests/memory-admin-entry.test.ts > (d) normalises a provider denial (denial:true) to UNAUTHORIZED regardless of the provider's own code`. |
| **L3 — in-memory journal, quarantine, and fold** | Implement in-memory canonical store, dense hash-chained journal, encrypted pending control, lifecycle table, fold, idempotency, expiry, dispute, supersession, rewind, terminal tombstone, complete checkpoint, and projection outbox. | `tests/memory-journal-replay.test.ts > checkpoint-tail and genesis yield the same canonical state digest`; `tests/memory-journal-replay.test.ts > tombstoned record cannot be resurrected by rewind or later accept`; `tests/memory-lifecycle.test.ts > every unlisted transition fails before cursor allocation and pending/disputed/historical visibility follows authorization`; `tests/memory-quarantine.test.ts > pending plaintext is absent from every non-envelope surface and rejected key destruction is idempotent`; `tests/memory-journal-replay.test.ts > gap hash break missing blob or digest drift stops readiness`. |
| **L4 — fenced SQLite canonical store** | Add declared native driver/helper, local-filesystem probe, kernel lock, durable epoch, revocable leases, detached copies, atomic promotion transaction, accepted lexical table, outbox, capability receipts, the graphify-owned fenced-store factory (`CanonicalMemoryStoreFactoryV1`, §5.7) with acquisition-at-construction and the single-broker-instance rule, the `FENCE_LOST`-terminal lifecycle with no silent re-acquire, and engine-side store-provenance verification — an in-process fence mark the opener applies only after a real `flock` on the DB inode + a `/proc/self/fdinfo` liveness proof + a separate anti-rename check + the network- and ephemeral-filesystem refusal on the open fd (tmpfs/overlayfs refused unless `allow_ephemeral_filesystem_store`), propagated by the factory; no compiled-identity check and no self-declared `fenced_single_writer` basis, no signature (§5.9). | `tests/canonical-memory-store.test.ts > rolls back blob+journal+state+fts+outbox at every injected failpoint`; `tests/canonical-memory-store.test.ts > same id with different full digest is refused without writes`; `tests/sqlite-memory-broker.native.test.ts > second process is refused and stale epoch fails before its first SQL statement`; `tests/sqlite-memory-broker.native.test.ts > lock loss before commit rolls back and revokes active readers`; `tests/sqlite-memory-broker.native.test.ts > detached ranking and backup copies never retain the active WAL`; `tests/sqlite-memory-broker.native.test.ts > factory acquire refuses a second live holder and FENCE_LOST is terminal with no silent re-acquire, exercised through a minimal external-host harness (graceful close, host crash, restart, stale instance)`; `tests/store-provenance.test.ts > refuses a production store NOT built by this factory — even one self-declaring the correct identity`; `tests/store-provenance.test.ts > refuses a factory acquisition whose opener never took a real fence`; `tests/memory-fence-default-refusal.test.ts` (engine fails closed on an unfenced in-memory store unless the host opted in); `tests/proc-locks.test.ts` (the `/proc` decode/parse/match primitives); `tests/sqlite-filesystem-classification.test.ts` (the pure filesystem verdict — network/ephemeral/unknown refusals, non-vacuous); `tests/sqlite-fence-shim.native.test.ts` (a non-functional flock binding is refused before any write); `tests/internal-mark-encapsulation.test.ts` (the fence/memory marks stay unreachable outside their sanctioned callers). The native lane is mandatory on **Linux** and MUST NOT be skipped there: the fenced-store admit path (a real `flock` + `/proc/self/fdinfo` proof) is proven ONLY by the native SQLite tests, so a skipped Linux native lane silently removes the sole positive proof and the gate would pass on refusal coverage alone. macOS and Windows are not supported (the store fails closed at open), so the native lane does not run there. |
| **L5 — assertion reconciliation** | Implement descriptors, occurrence keys, pure comparators, eligibility preconditions, stable proposal identity/order, version drift behavior, and authorized application of proposals. | `tests/assertion-family-registry.test.ts > same-family same-scope same-trust opt-in is required before proposing`; `tests/assertion-family-registry.test.ts > identity similarity alone proposes nothing and ambiguous ties require adjudication`; `tests/assertion-family-registry.test.ts > replay uses stored registry version while a new version creates a new proposal id`. |
| **L6 — bounded projection, recovery, backup, Postgres parity** | Implement bounded current projection, deterministic size fixture, complete local checkpoints, portable logical backup/restore, projection invalidation cascade, Postgres canonical adapter, and cross-backend state/receipt parity. | `tests/memory-projection-bound.test.ts > raw projection at cap passes and cap plus one byte fails without silent omission`; `tests/memory-projection-cascade.test.ts > tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt`; `tests/memory-backup.test.ts > detached logical backup excludes pending rejected FTS and projections yet restore preserves terminal dominance and state digest`; `tests/canonical-memory-store.parity.test.ts > SQLite and Postgres produce identical canonical state digests for the lifecycle corpus`; `tests/postgres-memory-store.native.test.ts > promotion is atomic and generation mismatch fails before mutation`. NOTE (R2-g executed — T-g4, CI job `memory-postgres` green on PR #344, run 38033477180: `tests/canonical-memory-store.parity.test.ts (1 test)` and `tests/postgres-memory-store.native.test.ts (1 test)` passed, `0 skipped`, Postgres 16/17 digest-pinned harness images): executed — canonical digest parity (state, journal root, blob root, events, snapshot, eligibility, accepted ids, outbox), the dense journal, accepted-only lexical, reopen replay, atomic promotion under a failpoint, generation fencing. `not covered` on Postgres — transaction-receipt digest parity, illegal-transition no-write, logical backup (X4). |
| **L7 — accepted-only ranking, revalidation, and migration closure** | Implement accepted lexical DTO adapter, offline and semantic profiles, recency/profile receipts, induced eligibility graph, vector allowlist, final revalidation/redaction, bounded pagination, activity-source ingestion, migration of retained neutral records, and proof that no compatibility surface remains. | `tests/memory-ranking-offline.test.ts > offline profile reads only accepted FTS and revalidation removes a stale hit`; `tests/memory-ranking-offline.test.ts > formula profile version bounds receipt and tie order are deterministic`; `tests/memory-ranking-semantic.test.ts > removed neighbour has zero contribution after induced-subgraph PPR`; `tests/memory-ranking-semantic.test.ts > semantic requirement returns typed unavailable and never raw lexical fallback`; `tests/memory-ranking-pagination.test.ts > all pages pin one profile and dual-as-of pair`; `tests/memory-capitalisation.test.ts > sanitized derivative has a new scope re-enters pending and exposes no cross-scope edge or lineage without permission`; `tests/memory-migration.test.ts > retained neutral records preserve digests/time/citations or emit an explicit exclusion ledger`; `tests/memory-v1-removal.test.ts > packed artifact and repository contain no compatibility API after migration`. |

L0–L7 are serial. L2 contracts precede L3 state, L3 precedes L4 persistence, and L4 precedes L5/L6/L7 consumers. No first-slice or go-live claim exists before L7.

## 10. Conformance matrix and exit gates

| Gate | Required matrix | Exact pass predicate |
|---|---|---|
| contract/schema/neutrality | Node 20 and 22; Linux, macOS, Windows | packed dependency closure one-way; declarations and schemas exactly match §4–§5; all neutrality shape tests green; no skipped files |
| temporal | in-memory, SQLite, Postgres, time slice, scene, browser renderer | shared fixture yields identical timed ids at start, end, just-before, just-after, open-end, point, and untimed cases |
| canonical state | in-memory, SQLite, Postgres (T-g4 scope) | lifecycle corpus yields identical state, event and snapshot digests — verified for in-memory, SQLite and Postgres (CI job `memory-postgres`, PR #344 run 38033477180); transaction-receipt digest parity and illegal-transition no-write stay `not covered` on Postgres |
| SQLite ownership | real native driver/helper on **Linux** across each allowed local filesystem available in CI (macOS/Windows fail closed at open — deferred) | two-process exclusion, epoch fencing, crash takeover, lock-loss rollback, reader revocation, detached copy; factory acquisition-at-construction refuses a second live holder; `FENCE_LOST` terminal with no silent re-acquire (external-host harness: close/crash/restart/stale); engine refuses a production store whose opener never took (and stamped) a real fence — factory acquisition alone is insufficient (in-process fence mark on the flocked inode + `/proc/self/fdinfo` liveness proof + anti-rename; no declared-identity check, no self-declared boolean, no signature); zero skips in the Linux native lane |
| Postgres parity | Postgres 16 and 17 | executed (CI job `memory-postgres`, PR #344 run 38033477180: both files `1 test` passed, `0 skipped`) — canonical digest parity (state, journal root, blob root, events, snapshot, eligibility, accepted ids, outbox), the dense journal, accepted-only lexical, reopen replay, atomic promotion under a failpoint, generation fencing; `not covered` — transaction-receipt digest parity and logical backup (X4) |
| admission/trust/authz | injected `AdminProviderPort` (host-supplied) plus deterministic injected fakes | only bound receipts act; stronger trust cannot be self-labelled; expiry/revocation deny; policy object exposes only the six-field envelope; the graphify-mediated `admin` entry point dispatches to the injected provider (`CAPABILITY_UNAVAILABLE` without a provider; bootstrap `FENCE_LOST` on `storage_epoch` mismatch; first bootstrap not deadlocked; the engine maps a provider-declared `denial: true` to `UNAUTHORIZED`, every other failure keeps its own code); and the injected `AdminProviderPort` passes conformance in both directions — an authorization denial sets `error.denial === true` and a non-authorization failure leaves it absent |
| recall | both profiles; all canonical backends | accepted-only candidates, bounded inputs, pinned formulas/profile, semantic induction, final revalidation, redaction, pagination, and receipts match goldens |
| lifecycle/cascade | all canonical and projection fakes plus one live graph and vector adapter | terminal tombstone removes influence and visibility from every surface through one acknowledged cursor; no resurrection |
| recovery/backup | SQLite and Postgres | genesis equals checkpoint-tail canonical digest; logical restore equals the export-scope journal-state AND capture-idempotency roots; exclusions and external blobs verify; durable logical backup/restore (D-11 B, X4): public-port export plus atomic empty-store import on SQLite and Postgres, round-trip verified with identical canonical digests AND identical observable recall (lexical + public reads, same order) — en attente du job CI `memory-postgres` pour la voie Postgres |
| projection size | deterministic raw-byte fixtures | `52_428_800` bytes accepted; `52_428_801` refused; fixed current cardinality does not grow with journal length |
| migration/removal | target plus every pinned intake; host Ed25519 signer/verifier (§5.11, 2026-10-16 amendment) | each retained record is transformed exactly or listed in a signed exclusion ledger; verify the domain-separated canonical root and host signature after reload; altered fields (including repaired public hashes), absent/invalid signature and unknown key refuse `MIGRATION_LEDGER_INVALID`; exclusions without a configured signer/verifier refuse `CAPABILITY_UNAVAILABLE`, while lossless migration remains available; repository and tarball contain no legacy port or activity subsystem |

X2b evidence (2026-10-15), **partial / unverified**: local FileGraphStore properties re-read persisted nodes and edges after public cascades, including cross-owner incident/dependent edges; vector guards and transaction refusals have local discriminating tests. Eight local proofs and seven actual-Postgres cases are collected; the pinned Postgres 16/17 CI executions and final Opus review remain pending. The lifecycle/cascade acceptance row above remains unchanged until the real-adapter gate passes. See plan/08 X2b for evidence and contract boundaries.

The capability exits implementation-blocked status only when every row is green in mandatory CI, the package tarball and generated artifacts are archived with their digests, and the realization plan maps one-to-one to L0–L7. Publication is a separate release decision.

## 11. Acceptance-condition closure

The two independent reviews' required neutral additions are folded as follows:

| Condition | Normative closure |
|---|---|
| C1 aggregate/operations | §4 and `MemoryPortV2` exact records, validation, capture, admission, recall, lifecycle, invalidation, capitalisation, versions, errors |
| C2 normalized authorization | §5.2 opaque context, normalized deny-by-default result, expiry/revocation, scope/resource binding, redaction ownership |
| C3 admission separation | §5.3 request carries `payload_digest` + authenticated `policy_evidence_ref` bound by `policy_evidence_digest` (candidate/submission/admission authority separation derivable, never interpreted by Graphify); exact six-field decision envelope preserved; all evaluation semantics remain inside policy |
| C4 capture seam | §5.5 neutral request, ordering, idempotency, deadline, cancellation, durable acknowledgement; no trigger vocabulary |
| C5 injectable canonical store | §5.7 public data-pure port; `GraphStore` and `VectorStore` remain projection-only and separate |
| C6 lifecycle/retention/cascade | §5.5 `LifecycleEventAnchorV1` (citation/evidence-bound, provenance_digest bound into event_digest) on both command and persisted `LifecycleEventV2`; §5.6 closed state table, §5.9 retention/quarantine, L6 invalidation receipt across all surfaces |
| C7 private-to-shared derivation | §5.5 non-mutating sanitized derivative, new scope, pending re-entry, canonical lineage, omission, no cross-scope edge |
| C8 recall/rank carriers | §7 dual-as-of request, capability policy, accepted snapshot, profile pin, rank receipt, revalidation and redacted packet |
| C9 pending quarantine | §5.9 sealed envelope, exact control allowlist, key lifecycle, exclusions, typed receipts |
| C10 logical backup/restore | §5.9 detached cursor-pinned allowlist export, external key/object refs, manifest/exclusion/replay verification |
| C11 operational fencing | §5.9 capability receipt and §8 native ownership/parity; typed refusal and no unsafe fallback |

## 12. Final non-goals and owner-open state

Graphify does not define identity, persona, role, evaluator roster, authorship, authority topology, credential semantics outside its injected `AdminProviderPort`, capture trigger selection, external object/key providers, or integration mapping. It does not infer truth from identity resolution, use ranking as authorization, expose pending content through recall, mutate scope in place, or keep canonical history in `graph.json`.

This amendment (external-host backend) supersedes the prior closure that this evol carried no unresolved owner decisions: it settles decisions **D-A** (SQLite `external-host` is single-node; multi-node requires Postgres) and **D-B** (graphify makes no supervision or availability guarantee; `external-host` is a process boundary only) on their recommended defaults, which the owner may override, and it adds the external-host contract — the two neutral deployment modes of D2, the graphify-mediated admin entry point `MemoryPortV2.admin` of §5.5 (which keeps administrative dispatch appellable through graphify and closes the reopening of O4), the fenced-store factory and lifecycle of §5.7, the scoped store-provenance fence mark of §5.9, and the injected `AdminProviderPort` of §5.10. The provenance mechanism — an in-process fence mark the SQLite/Postgres opener applies only after a real kernel writer fence (SQLite: `flock` on the DB inode + a `/proc/self/fdinfo` liveness proof + a separate anti-rename check; Postgres: the advisory-lock generation), the factory propagating it, and the `allow_unfenced_memory_store` opt-in gating a module in-memory store for non-production; no declared-identity check and no signature — closes residual O5 at drafting level and remains open to owner refinement; it is scoped to detecting a misconfigured or naive store, not to defending against a malicious in-process host (§5.9), and no unproven crypto trust root is asserted. Implementation, migration evidence, dependency extraction, package publication availability, and mandatory CI execution remain unfinished engineering work, not owner-policy questions.

**Governance fallback (carried from v4).** Until the external-host operating agreement is signed and the FK gate (W-C/ARCH-06) is lifted, `embedded-local` remains the sole operational mode; `external-host` is design-reserved and does not block L0–L7. This is a deployment-governance gate, not a normative change to the contract above: the two-mode contract of D2 stands, and the gate only defers activation of the `external-host` mode. The agreement and the W-C/ARCH-06 gate are integration-owned and outside this specification's normative text; this clause only records that graphify's contract stays fully realizable (L0–L7) while activation waits on them.

## Appendix A — Evidence ledger (non-normative)

- Target `src/studio-scene.ts:31-34` documents half-open spans. That statement holds at target HEAD only; intake `70dcfb96` already carries the closed wording.
- The corresponding legacy activity builder half-open wording is at target HEAD `src/agent-stats/project-graph.ts:470` and at intake `70dcfb96` line 485, not line 476. The module is extracted in L0 rather than made part of the engine.
- The functional browser defect is `studio/src/lib/graphAdapter.js:698-712`: active filtering checks only `t <= cursor`, ignores `t_end`, and retains untimed elements.
- `src/merge-driver.ts:17-30` sets the raw `50 * 1024 * 1024 = 52_428_800` byte ceiling.
- The modified working `.graphify/graph.json` measured `54_039_561` bytes with SHA-256 `233be67215127647be4471b6c6aae8fb4dff978f6c9c6b021814e4df3990cf5c`; both target HEAD and `70dcfb96` contain a `48_931_593`-byte file. The normative gate uses synthetic fixtures, not either mutable artifact.
- Existing `src/storage/types.ts` imports graphology and defines a pushed `GraphStore` projection. `src/storage/vector/types.ts` and `src/storage/vector/registry.ts` define pgvector behind a separate `VectorStore`.
- At `70dcfb96`, `src/storage/sqlite.ts:540` opens `new Database(target)` and the file has no kernel lock, epoch, or reader lease; the adapter is not registered there and its native driver is not declared by the target manifest.
- Existing BM25 and RRF primitives are reusable after accepting `AcceptedLexicalDocumentV1`. Existing query and PPR modules consume a projection/CSR and are reserved for the semantic path. No inspected source provides an accepted-only lexical snapshot, induced eligibility graph, or canonical revalidation packet.

# SPEC_EVOL — Graphify neutral memory and knowledge engine

**Date:** 2026-08-16  
**Status:** committed design; implementation blocked until L0–L7 and every exit gate pass  
**Artifact:** design only; this document authorizes no source merge, publication, migration, or service activation

Except for Appendix A, which is an evidence ledger, every statement in this document is normative. This document is the sole normative authority for the new capability. Compatibility mappings, identity models, authority topologies, runtime trigger choices, and deployment-specific vocabulary belong in separately owned integration material and are not part of this specification.

## 1. Governing decisions

### D1 — The capability is an isolated, neutral package

The capability is published as the independent package `graphify-memory`, rooted at `packages/memory/`, with these exports:

- `graphify-memory/contracts`: data-only DTOs, port signatures, errors, and receipts; it has no runtime imports;
- `graphify-memory`: the engine and pure algorithms; it depends only on `contracts` and injected ports;
- `graphify-memory/service`: the neutral service host and local administration surface;
- `graphify-memory/sqlite` and `graphify-memory/postgres`: canonical-store adapters with their driver dependencies isolated from `contracts` and the engine.

The package has no dependency on the existing root entrypoint, graphology, a coordination library, an identity library, a design system, or a model-routing library. The root entrypoint may depend on `graphify-memory`; the reverse edge is forbidden. Projection bridges may depend on both sides but are not re-exported by `graphify-memory`.

L0 physically extracts the legacy activity subsystem from `src/agent-stats/**` into a separately owned module and removes its CLI, exports, registry parsing, identity resolution, identifier syntax, role fields, and coordination projection from Graphify. L0 also extracts the legacy `src/memory-*.ts` compatibility implementation and its external source-authority headers; no compatibility API remains published by Graphify. Every organization-scoped runtime, peer, and development dependency found in the baseline manifest, together with its importing bridge, is removed from the Graphify repository or relocated to a separately owned adapter package. None remains in the root manifest, source tree, lockfile closure, or the `graphify-memory` build, test, generated-contract, and publication closure. These are extraction lots, not descriptions of the repository's current state.

The hard boundary is accepted only when all of the following hold:

1. dependency and import closure is one-way;
2. runtime, type-only, dynamic, test, fixture, documentation-example, and generated-code edges are checked;
3. emitted `.d.ts` and JSON Schema property names are exactly the property-name set specified here, with `additionalProperties: false` on every object;
4. emitted contracts contain no consumer identifier and no evaluator, authorship, review-leg, persona, role, roster, coordination, or topology shape;
5. opaque string **values** may carry integration-owned references, but their field names and semantics remain the neutral ones defined here.

An import-only test is insufficient. L0 must scan the packed tarball, its dependency lock closure, emitted declarations, generated schemas, source maps, fixtures, and examples.

### D2 — Exactly three neutral deployment modes

| Mode | Process boundary | Canonical store | Administrative provider |
|---|---|---|---|
| `embedded-local` | engine in the caller process | SQLite adapter | injected neutral ports |
| `standalone-service` | graphify-owned local service | SQLite adapter | graphify local administrator |
| `managed-service` | independently supervised service | Postgres adapter | injected neutral ports |

No other mode name is normative. A projection backend is not a canonical-memory backend. `managed-service` is not supported until the Postgres canonical-store parity gate in L6 passes.

The graphify local administrator implements the same `AuthorizationPort`, `AdmissionPolicy`, `EvidenceVerifierPort`, `CryptoPort`, and maintenance interfaces as any injected provider:

- bootstrap is default-deny; a new store has no usable authority;
- initialization requires an exclusive local console, an empty administration state, the active storage fence, and an explicit `admin init` operation;
- a random 256-bit credential is placed in the operating-system credential store, or in a user-selected file created atomically with owner-only permissions when no credential store is available; credentials are never accepted from command-line arguments, environment variables, logs, or ordinary configuration files;
- authorization receipts live for at most five minutes and bind the current authorization epoch;
- rotation creates a new credential and atomically increments the epoch; revocation records a credential digest and increments the epoch; all earlier receipts then fail revalidation;
- loss of the credential has no bypass path. Recovery is a separate, explicitly authorized restore operation using a verified backup manifest;
- local admission may be configured by policy, but Graphify sees only the decision envelope in §5.3;
- local redaction defaults to the minimal allowlist and omits derivation lineage unless an explicit policy allows it.

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

A dual-as-of read first folds exactly the events with cursor `<= system_as_of`, then applies valid-time membership at `valid_as_of`. Defaults are captured once at the start of a recall sequence: `system_as_of` defaults to the current high-water cursor and `valid_as_of` defaults to the service clock at that cursor. The first page receipt pins both values; later pages must reuse them or fail with `STALE_PAGE`. No event recorded after `system_as_of` may affect eligibility, reconciliation, ranking, redaction, or projection inputs for that read.

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
```

The payload digest never substitutes for the record digest. Admission binds the record digest. `record_id` is `mem_` followed by unpadded lower-case base32 of the record-digest bytes. `event_id`, idempotency keys, and opaque references are identities, not alternate content digests.

## 4. Normative data model

The TypeScript below is normative. Generated JSON Schemas must be semantically identical and set `additionalProperties: false` on every object. `ReadonlyArray` is serialized as a JSON array. Optional means absent, never `null`, unless `null` is explicitly in the type.

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

```ts
export type MemoryOperation =
  | "capture" | "cancel_capture" | "request_admission"
  | "reject" | "withdraw" | "dispute" | "resolve_dispute" | "expire" | "supersede"
  | "mark_non_current" | "rewind" | "trust_invalidate" | "tombstone"
  | "recall_current" | "recall_history" | "recall_disputed"
  | "propose_capitalisation" | "inspect_candidate"
  | "projection_invalidate" | "backup" | "restore" | "admin";

export type MemoryErrorCode =
  | "INVALID_SCHEMA" | "INVALID_DIGEST" | "DIGEST_CONFLICT"
  | "UNAUTHORIZED" | "AUTHORIZATION_EXPIRED" | "AUTHORIZATION_REVOKED"
  | "POLICY_UNAVAILABLE" | "POLICY_STALE" | "ILLEGAL_TRANSITION"
  | "NOT_FOUND" | "ALREADY_TERMINAL" | "DEADLINE_EXCEEDED" | "CANCELLED"
  | "CAPABILITY_UNAVAILABLE" | "STORE_UNAVAILABLE" | "FENCE_LOST"
  | "CURSOR_GAP" | "JOURNAL_CORRUPT" | "BLOB_MISSING"
  | "PROJECTION_STALE" | "RANKING_UNAVAILABLE" | "STALE_PAGE"
  | "REGISTRY_VERSION_UNAVAILABLE" | "BACKUP_INVALID" | "RESTORE_REFUSED";

export interface MemoryErrorV1 {
  code: MemoryErrorCode;
  operation: MemoryOperation;
  message: string;
  retryable: boolean;
  error_receipt_digest?: Digest;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: MemoryErrorV1 };
```

Unknown errors are mapped to `STORE_UNAVAILABLE` or `CAPABILITY_UNAVAILABLE`, never exposed as an untyped throw across a public port. Validation may throw only for programmer misuse of the in-process interface; service and storage boundaries always return `Result`.

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

export interface ProjectionInvalidationRequestV1 {
  through_cursor: Cursor;
  projection_ids: ReadonlyArray<OpaqueRef>;
  deadline_at: Instant;
}

export interface ProjectionInvalidationReceiptV1 {
  through_cursor: Cursor;
  projection_receipts: ReadonlyArray<{ projection_id: OpaqueRef; cursor: Cursor; digest: Digest }>;
  complete: boolean;
  receipt_digest: Digest;
}

export interface CapabilityDescriptorV1 {
  contract_version: 2;
  profiles: ReadonlyArray<"offline_lexical_v1" | "semantic_v1">;
  canonical_backends: ReadonlyArray<"sqlite" | "postgres">;
  max_candidates: 2000;
  max_results: 100;
  receipt_digest: Digest;
}

export interface MemoryPortV2 {
  readonly version: 2;
  capabilities(): Promise<Result<CapabilityDescriptorV1>>;
  validate(payload: CandidatePayloadV2): Result<{ payload_digest: Digest }>;
  capture(request: CaptureRequestV2): Promise<Result<CaptureAcknowledgementV1>>;
  cancelCapture(cancellation_ref: OpaqueRef): Promise<Result<{ cancelled: boolean }>>;
  requestAdmission(request: AdmissionRequestV1): Promise<Result<AdmissionOutcomeV1>>;
  transition(command: LifecycleCommandV1): Promise<Result<LifecycleReceiptV1>>;
  recall(request: RecallRequestV2): Promise<Result<RecallPacketV2>>;
  proposeCapitalisation(request: CapitalisationRequestV1): Promise<Result<CaptureAcknowledgementV1>>;
  invalidateProjections(request: ProjectionInvalidationRequestV1): Promise<Result<ProjectionInvalidationReceiptV1>>;
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
}
```

`CaptureRequestV2` has no trigger-reason field. An external caller may invoke it at any lifecycle point; trigger selection is outside Graphify. Capture can only validate and commit a pending encrypted candidate. Stable idempotency is `(source_ref, sequence, idempotency_key)`: an exact repeat returns `duplicate_exact`; any digest mismatch returns `DIGEST_CONFLICT` with no write. Deadline expiration or cancellation before commit rolls back. An acknowledgement is returned only after the pending transaction is durable.

Capitalisation never changes the source record's scope or state. The engine authorizes source read and target capture separately, asks `AuthorizationPort.redact` for a sanitized payload, creates a distinct cited derivative with canonical private lineage, and sends it through pending admission. Projection builders never create an edge between records with unequal `scope_ref`. Returned packets omit private lineage unless the authorization directive explicitly allows it.

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
  previous_event_digest: Digest;
  event_digest: Digest;
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
}

export interface CanonicalMemoryStorePort {
  readonly version: 1;
  readonly capabilities: CanonicalStoreCapabilitiesV1;
  commitPending(input: {
    control: PendingControlV1;
    sealed: SealedCandidateEnvelopeV1;
    capture_event: LifecycleEventV2;
  }): Promise<Result<CanonicalTransactionReceiptV1>>;
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
  readJournal(input: { after: Cursor; limit: number }): Promise<Result<ReadonlyArray<LifecycleEventV2>>>;
  checkpoint(input: { through_cursor: Cursor }): Promise<Result<RecoveryCheckpointManifestV1>>;
  nextProjectionBatch(input: { after: Cursor; limit: number }): Promise<Result<ProjectionBatchV1>>;
  acknowledgeProjection(input: ProjectionInvalidationReceiptV1): Promise<Result<CanonicalTransactionReceiptV1>>;
  readiness(): Promise<Result<OperationalCapabilityReceiptV1>>;
  close(): Promise<Result<{ closed: true }>>;
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
      decision: AdmissionDecisionEnvelopeV1 & { decision: "reject" };
      event: LifecycleEventV2;
    };
```

Promotion is one store transaction: authenticate and revalidate receipts; verify envelope, payload, and record digests; insert the immutable blob; append the journal event; update folded state; insert the accepted-only lexical document; enqueue the projection batch; destroy or retire the pending key; commit; then return the transaction receipt. An injected failpoint at any step must leave all six surfaces unchanged. Rejection atomically changes only candidate control and destroys its body key; it never creates a lexical or projection row.

The store is the final eligibility authority. Rank order is never authorization. Every ranked id is revalidated against canonical state, dual time, retention, trust receipt, tombstone ledger, and a freshly revalidated authorization receipt immediately before packet materialization.

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

Existing graphology `GraphStore` adapters may be used behind `GraphProjectionPort`; existing pgvector behavior may be used behind `VectorProjectionPort`. Neither existing port is imported by `graphify-memory`, and neither is canonical.

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
  terminal_ledger_digest: Digest;
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
  }): Promise<Result<{ restored_cursor: Cursor; canonical_state_digest: Digest; receipt_digest: Digest }>>;
}

export interface OperationalCapabilityReceiptV1 {
  store_id: OpaqueRef;
  backend: "memory" | "sqlite" | "postgres";
  storage_epoch: Cursor;
  high_water_cursor: Cursor;
  capabilities: CanonicalStoreCapabilitiesV1;
  issued_at: Instant;
  expires_at: Instant;
  receipt_digest: Digest;
}

export interface ClockPort {
  now(): Instant;
}

export interface MemoryEngineDependenciesV2 {
  canonical_store: CanonicalMemoryStorePort;
  authorization: AuthorizationPort;
  admission_policy: AdmissionPolicy;
  evidence_verifier?: EvidenceVerifierPort;
  crypto: CryptoPort;
  activity_sources: ReadonlyArray<ActivityEvidenceSource>;
  graph_projection?: GraphProjectionPort;
  vector_projection?: VectorProjectionPort;
  semantic_projection?: SemanticProjectionPort;
  assertion_registry?: AssertionFamilyRegistry;
  backup_object?: BackupObjectPort;
  backup_key?: BackupKeyPort;
  clock: ClockPort;
}

export declare function createMemoryPortV2(dependencies: MemoryEngineDependenciesV2): MemoryPortV2;
export declare function createMemoryBackupPort(dependencies: MemoryEngineDependenciesV2): MemoryBackupPort;
```

Pending body, citations, locators, validation material, evidence, and candidate digest live inside one `CryptoPort`-sealed envelope. Outside it, the store may persist only `PendingControlV1`; no plaintext, tokens, snippets, source locator, or derived statistic is allowlisted. Pending, rejected, and withdrawn content is excluded from FTS, graph/vector projections, caches, exports, diagnostics, telemetry, crash dumps, and logical backup.

A local recovery checkpoint is a complete fold checkpoint: it includes encrypted pending-control/envelope references, all retained immutable-record references, tombstone/supersession/currentness state, policy and assertion-registry versions, journal integrity roots, and every blob reference needed by tail events. Blobs may remain in an external canonical blob store only when the manifest binds their digest. Genesis replay and checkpoint-plus-tail replay must yield the same canonical RFC-8785 state digest; byte identity of database files is neither required nor claimed.

Portable logical backup is distinct. It uses a detached, cursor-pinned snapshot and an allowlist. It includes every retained accepted current, disputed, and historical record needed for the supported dual-as-of window, plus terminal ledgers required to prevent resurrection. It excludes pending/rejected/withdrawn envelopes, FTS, graph/vector projections, caches, and aggregates. `BackupKeyPort` seals each logical object before `BackupObjectPort` receives it; the object provider never receives plaintext, and Graphify never interprets the key or target reference. Restore verifies schema versions, manifest digest, exclusion counts, roots, key and object receipts, terminal dominance, and replay equivalence before readiness.

Operations that require fencing, revocable readers, detached snapshots, accepted-only lexical input, or bounded cancellation refuse with `CAPABILITY_UNAVAILABLE` when a fresh capability receipt lacks them. There is no unfenced, raw-FTS, stale-projection, or unranked fallback.

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

export type ReconciliationRelation = "contradicts" | "supersedes" | "needs_adjudication";

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

Eligibility to call a family comparator requires the family id in both records' `reconciliation.family_refs`, identical `scope_ref`, identical immutable trust class, matching family, both records eligible at `comparison_system_as_of`, and citations sufficient for the descriptor. An empty family list is the default opt-out; purpose alone never implies consent. Identity/entity matching scores are never evidence of truth, contradiction, or supersession.

Inputs are ordered by UTF-8 ascending `record_id`; proposal identity is the digest of `(family_id, family_version, occurrence_key, left_record_id, right_record_id, relation, comparison_system_as_of)`. Proposals sort by occurrence key, then left id, right id, relation. Exact duplicate proposals collapse by id. Ambiguous comparison returns `needs_adjudication`; it never chooses last-write-wins. A proposal mutates nothing. An authorized lifecycle event is required to dispute, supersede, or resolve.

Every proposal and resulting event stores the family and registry version. Replay consumes the stored proposal/event and never reruns a newer comparator. Installing a new registry version creates new proposal identities; it does not rewrite old ones. If a required version is unavailable, reconciliation readiness fails with `REGISTRY_VERSION_UNAVAILABLE`, while ordinary recall remains available if its own capabilities are intact. Trust elevation is a new record, so comparison always uses the immutable trust binding visible at the pinned system cursor.

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
```

The caller states minimum capabilities and network permission, not a ranking profile. Graphify selects and pins one available profile before reading candidates. `lexical_and_semantic` requires `semantic_v1`; it never falls back. `lexical` permits Graphify to choose semantic when available or `offline_lexical_v1`; the selected profile cannot change during pagination. A genuine zero-match query returns an empty packet with a complete rank receipt. Missing profile inputs return `RANKING_UNAVAILABLE`, never raw FTS order, unranked success, or a mid-call fallback.

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

The SQLite adapter owns a direct, declared `better-sqlite3` runtime dependency and refuses an absent driver. It supports only local APFS, ext4, XFS, Btrfs, NTFS, and ReFS filesystems. NFS, SMB, FUSE, removable, and unknown filesystem types are refused unless a later specification and native conformance suite add them.

A bundled graphify-owned N-API lock helper implements non-blocking `flock(LOCK_EX|LOCK_NB)` on POSIX and `LockFileEx(LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY)` on Windows. Lock identity is the canonical real path of the database plus `.graphify-memory.lock`; symlink, case, device, and inode/file-index aliases are normalized and checked before open.

Writer acquisition is:

1. acquire the kernel lock without waiting;
2. open the database and verify supported SQLite runtime (`>=3.51.3`, or a documented fixed backport `3.44.6`/`3.50.7`);
3. begin an immediate transaction, create/read `storage_epoch`, increment it monotonically, persist and commit it durably;
4. bind every prepared mutating statement to the acquired epoch;
5. before the first mutating SQL statement, before every later mutating statement, and immediately before commit, verify both kernel-lock ownership and stored epoch equality;
6. on mismatch or lock loss, execute no further SQL, roll back, close, revoke readers, and return `FENCE_LOST`.

Kernel release after process death permits a new owner, which increments the epoch before any application write. Busy timeout is only a fuse; it is not ownership. Active readers have finite revocable leases tied to the epoch. Ranking and backup use a SQLite backup-API detached copy pinned to a high-water cursor; they never hold the active WAL. WAL/checkpoint operations run only through the fenced owner.

The native two-process test uses the real driver and lock helper on every supported operating system. It is mandatory and cannot skip because a driver, helper, or filesystem probe is missing.

### D9 — Postgres parity is required for managed service

The Postgres adapter owns a direct, declared `pg` runtime dependency and implements the same public canonical port with one database transaction for blob, journal, state, accepted lexical index, and outbox. It does **not** use a sequence for the logical cursor: the transaction locks a singleton high-water row, computes `next = current + 1`, uses `next` for the journal event, and updates the row in the same transaction; rollback therefore advances neither row nor cursor and cannot create a gap. A store-generation row and transaction-scoped advisory lock fence administrative ownership; every mutation checks generation before its first statement and before commit. Accepted-only lexical queries, dual-as-of folds, tombstone dominance, idempotency conflicts, projection outbox, checkpoint manifest, logical backup, and every receipt must match SQLite canonical state digests for the same conformance trace.

Postgres 16 and 17 are the L6 matrix. `managed-service` remains unavailable if parity differs or the adapter lacks a required capability receipt. pgvector remains optional behind `VectorProjectionPort` and does not affect canonical parity.

### D10 — Bounded current projection; history never inflates `graph.json`

`graph.json` is one bounded current graph projection, not canonical history and not “graph plus projection.” It may contain only current accepted projection envelopes, citation references, and projection metadata. It never contains record bodies, pending data, journal events, tombstone history, rank receipts, authorization receipts, backup material, or vectors.

The raw-byte merge ceiling remains `52_428_800` bytes. L6 uses a deterministic synthetic fixture that produces one projection at exactly the ceiling and one at ceiling plus one byte; the former is accepted and the latter refused. It does not depend on a dirty working artifact. A bounded export records high-water cursor, included record count, omitted count by reason, projection schema version, and digest. Omission must follow an explicit deterministic filter; silent top-N loss is forbidden. Any journal length may be replayed without linear growth of `graph.json` when current eligible cardinality is fixed.

## 9. Realization lots — exactly L0 through L7

Every lot follows: add or adapt the minimal interface so the test compiles; capture the exact assertion failure against the pinned baseline; implement; make the scoped test green; run the lot matrix. A missing-module error, skipped native test, dirty-artifact dependency, or vacuous absence check is not an accepted RED.

| Lot | Scope and dependency order | Named executable RED tests and exact behavior gate |
|---|---|---|
| **L0 — baseline, package boundary, extraction** | Pin target/intakes; create `graphify-memory/contracts`; physically extract legacy activity and memory compatibility surfaces; remove every organization-scoped dependency/importing bridge from the repository or relocate it to a separately owned adapter package; establish one-way package/export graph. | `tests/memory-neutrality.test.ts > packed dependency/import closure is one-way and emitted d.ts/schema uses only the normative vocabulary`; `tests/memory-neutrality.test.ts > evaluator and topology-shaped public objects are rejected even without forbidden imports`; `tests/memory-activity-boundary.test.ts > activity reaches capture only through ActivityEvidenceSource`; `tests/memory-v1-removal.test.ts > no legacy memory export, schema, source-authority header, CLI, or packed file remains`. Baseline fails on real manifest/source/emitted-shape evidence, not missing modules. |
| **L1 — closed temporal contract** | Implement D4 once across recall predicates, store queries, time slice, scene, and renderer; define active-filter untimed behavior and `sceneTimeRange`. | `tests/temporal-boundary-contract.test.ts > keeps t_end===cursor and drops t_end<cursor on recall/store/slice/renderer`; `tests/temporal-boundary-contract.test.ts > active filter drops untimed elements and scene range includes finite t_end`. The renderer at the target baseline supplies the behavioral RED. |
| **L2 — exact records, ports, digests, bi-temporal query** | Publish all §4–§5 DTOs/signatures/errors/schemas; implement exact validation, JCS/domain digests, authorization binding, verifier binding, capture seam, dual-as-of carrier, local administrator interfaces, and data-pure projection carriers. | `tests/memory-contract-schema.test.ts > exact schema rejects every additional property and binds primary component event citation payload and record digests`; `tests/memory-authz.test.ts > deny expired revoked mismatched or caller-supplied authorization and apply port-owned field omission`; `tests/memory-trust.test.ts > caller cannot self-label earned or signed and revoked receipt is ineligible`; `tests/memory-admission-envelope.test.ts > engine validates only the six bound policy fields and no evaluation shape is exported`; `tests/memory-capture.test.ts > exact duplicate acknowledges and digest conflict writes nothing`; `tests/memory-dual-as-of.test.ts > valid and system axes vary independently at inclusive boundaries`; `tests/local-administrator.test.ts > fresh standalone service denies until explicit credential bootstrap and old receipts fail after rotation`. |
| **L3 — in-memory journal, quarantine, and fold** | Implement in-memory canonical store, dense hash-chained journal, encrypted pending control, lifecycle table, fold, idempotency, expiry, dispute, supersession, rewind, terminal tombstone, complete checkpoint, and projection outbox. | `tests/memory-journal-replay.test.ts > checkpoint-tail and genesis yield the same canonical state digest`; `tests/memory-journal-replay.test.ts > tombstoned record cannot be resurrected by rewind or later accept`; `tests/memory-lifecycle.test.ts > every unlisted transition fails before cursor allocation and pending/disputed/historical visibility follows authorization`; `tests/memory-quarantine.test.ts > pending plaintext is absent from every non-envelope surface and rejected key destruction is idempotent`; `tests/memory-journal-replay.test.ts > gap hash break missing blob or digest drift stops readiness`. |
| **L4 — fenced SQLite canonical store** | Add declared native driver/helper, local-filesystem probe, kernel lock, durable epoch, revocable leases, detached copies, atomic promotion transaction, accepted lexical table, outbox, and capability receipts. | `tests/canonical-memory-store.test.ts > rolls back blob+journal+state+fts+outbox at every injected failpoint`; `tests/canonical-memory-store.test.ts > same id with different full digest is refused without writes`; `tests/sqlite-memory-broker.native.test.ts > second process is refused and stale epoch fails before its first SQL statement`; `tests/sqlite-memory-broker.native.test.ts > lock loss before commit rolls back and revokes active readers`; `tests/sqlite-memory-broker.native.test.ts > detached ranking and backup copies never retain the active WAL`. Native lane is mandatory on Linux, macOS, and Windows. |
| **L5 — assertion reconciliation** | Implement descriptors, occurrence keys, pure comparators, eligibility preconditions, stable proposal identity/order, version drift behavior, and authorized application of proposals. | `tests/assertion-family-registry.test.ts > same-family same-scope same-trust opt-in is required before proposing`; `tests/assertion-family-registry.test.ts > identity similarity alone proposes nothing and ambiguous ties require adjudication`; `tests/assertion-family-registry.test.ts > replay uses stored registry version while a new version creates a new proposal id`. |
| **L6 — bounded projection, recovery, backup, Postgres parity** | Implement bounded current projection, deterministic size fixture, complete local checkpoints, portable logical backup/restore, projection invalidation cascade, Postgres canonical adapter, and cross-backend state/receipt parity. | `tests/memory-projection-bound.test.ts > raw projection at cap passes and cap plus one byte fails without silent omission`; `tests/memory-projection-cascade.test.ts > tombstone invalidates FTS nodes edges vectors caches aggregates and exports through one cursor receipt`; `tests/memory-backup.test.ts > detached logical backup excludes pending rejected FTS and projections yet restore preserves terminal dominance and state digest`; `tests/canonical-memory-store.parity.test.ts > SQLite and Postgres produce identical canonical state digests for the lifecycle corpus`; `tests/postgres-memory-store.native.test.ts > promotion is atomic and generation mismatch fails before mutation`. |
| **L7 — accepted-only ranking, revalidation, and migration closure** | Implement accepted lexical DTO adapter, offline and semantic profiles, recency/profile receipts, induced eligibility graph, vector allowlist, final revalidation/redaction, bounded pagination, activity-source ingestion, migration of retained neutral records, and proof that no compatibility surface remains. | `tests/memory-ranking-offline.test.ts > offline profile reads only accepted FTS and revalidation removes a stale hit`; `tests/memory-ranking-offline.test.ts > formula profile version bounds receipt and tie order are deterministic`; `tests/memory-ranking-semantic.test.ts > removed neighbour has zero contribution after induced-subgraph PPR`; `tests/memory-ranking-semantic.test.ts > semantic requirement returns typed unavailable and never raw lexical fallback`; `tests/memory-ranking-pagination.test.ts > all pages pin one profile and dual-as-of pair`; `tests/memory-capitalisation.test.ts > sanitized derivative has a new scope re-enters pending and exposes no cross-scope edge or lineage without permission`; `tests/memory-migration.test.ts > retained neutral records preserve digests/time/citations or emit an explicit exclusion ledger`; `tests/memory-v1-removal.test.ts > packed artifact and repository contain no compatibility API after migration`. |

L0–L7 are serial. L2 contracts precede L3 state, L3 precedes L4 persistence, and L4 precedes L5/L6/L7 consumers. No first-slice or go-live claim exists before L7.

## 10. Conformance matrix and exit gates

| Gate | Required matrix | Exact pass predicate |
|---|---|---|
| contract/schema/neutrality | Node 20 and 22; Linux, macOS, Windows | packed dependency closure one-way; declarations and schemas exactly match §4–§5; all neutrality shape tests green; no skipped files |
| temporal | in-memory, SQLite, Postgres, time slice, scene, browser renderer | shared fixture yields identical timed ids at start, end, just-before, just-after, open-end, point, and untimed cases |
| canonical state | in-memory, SQLite, Postgres | lifecycle corpus yields identical state, event, snapshot, and transaction receipt digests; all illegal transitions no-write |
| SQLite ownership | real native driver/helper on Linux, macOS, Windows and each allowed local filesystem available in CI | two-process exclusion, epoch fencing, crash takeover, lock-loss rollback, reader revocation, detached copy; zero skips |
| Postgres parity | Postgres 16 and 17 | atomic failpoints, dense logical journal, accepted-only lexical, replay, backup, and canonical digest parity green |
| admission/trust/authz | local administrator plus deterministic injected fakes | only bound receipts act; stronger trust cannot be self-labelled; expiry/revocation deny; policy object exposes only the six-field envelope |
| recall | both profiles; all canonical backends | accepted-only candidates, bounded inputs, pinned formulas/profile, semantic induction, final revalidation, redaction, pagination, and receipts match goldens |
| lifecycle/cascade | all canonical and projection fakes plus one live graph and vector adapter | terminal tombstone removes influence and visibility from every surface through one acknowledged cursor; no resurrection |
| recovery/backup | SQLite and Postgres | genesis equals checkpoint-tail canonical digest; logical restore equals export-scope digest; exclusions and external blobs verify |
| projection size | deterministic raw-byte fixtures | `52_428_800` bytes accepted; `52_428_801` refused; fixed current cardinality does not grow with journal length |
| migration/removal | target plus every pinned intake | each retained record is transformed exactly or listed in a signed exclusion ledger; repository and tarball contain no legacy port or activity subsystem |

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

Graphify does not define identity, persona, role, evaluator roster, authorship, authority topology, credential semantics outside its local administrator, capture trigger selection, external object/key providers, or integration mapping. It does not infer truth from identity resolution, use ranking as authorization, expose pending content through recall, mutate scope in place, or keep canonical history in `graph.json`.

There are no unresolved owner decisions in this evol. Implementation, migration evidence, dependency extraction, package publication availability, and mandatory CI execution remain unfinished engineering work, not owner-policy questions.

## Appendix A — Evidence ledger (non-normative)

- Target `src/studio-scene.ts:31-34` documents half-open spans. That statement holds at target HEAD only; intake `70dcfb96` already carries the closed wording.
- The corresponding legacy activity builder half-open wording is at target HEAD `src/agent-stats/project-graph.ts:470` and at intake `70dcfb96` line 485, not line 476. The module is extracted in L0 rather than made part of the engine.
- The functional browser defect is `studio/src/lib/graphAdapter.js:698-712`: active filtering checks only `t <= cursor`, ignores `t_end`, and retains untimed elements.
- `src/merge-driver.ts:17-30` sets the raw `50 * 1024 * 1024 = 52_428_800` byte ceiling.
- The modified working `.graphify/graph.json` measured `54_039_561` bytes with SHA-256 `233be67215127647be4471b6c6aae8fb4dff978f6c9c6b021814e4df3990cf5c`; both target HEAD and `70dcfb96` contain a `48_931_593`-byte file. The normative gate uses synthetic fixtures, not either mutable artifact.
- Existing `src/storage/types.ts` imports graphology and defines a pushed `GraphStore` projection. `src/storage/vector/types.ts` and `src/storage/vector/registry.ts` define pgvector behind a separate `VectorStore`.
- At `70dcfb96`, `src/storage/sqlite.ts:540` opens `new Database(target)` and the file has no kernel lock, epoch, or reader lease; the adapter is not registered there and its native driver is not declared by the target manifest.
- Existing BM25 and RRF primitives are reusable after accepting `AcceptedLexicalDocumentV1`. Existing query and PPR modules consume a projection/CSR and are reserved for the semantic path. No inspected source provides an accepted-only lexical snapshot, induced eligibility graph, or canonical revalidation packet.

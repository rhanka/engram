# Engram memory exposed to agents through MCP — Specification v2

**Date:** 2026-10-17  
**Target product release:** `@sentropic/engram@0.20.0`  
**Status:** Complete specification incorporating the 16 Opus review amendments. Implementation and release qualification remain `unverified`.

The 0.20.0 delivery MUST expose engram memory through dedicated tools using the Sentropic MCP standard, re-expose those capabilities in the Sentropic registry, and support **voluntary inheritance by an agent host through cluster-mesh**. `graph.json` is a bounded current graph projection that may carry filtered memory projection envelopes alongside code under restored D3/D10; the canonical journal remains the sole memory authority.

This document implements the owner decision dated 2026-10-17. `MUST`, `MUST NOT`, and `SHOULD` express normative requirements. New interfaces and behavior described below are requirements to implement, not claims of existing functionality.

## Evidence boundary

The original specification and the complete Opus review were read. Verification used locally available committed sources. No repository files were modified, and no tests, builds, fetches, installations, deployments, or publications were performed.

| Repository | Inspected reference | Established source state |
|---|---|---|
| Engram | `545a57b8911ab108e84fa1778e0f268fe11bf1de` | Product version `0.19.1`; `engram-memory` is private; dedicated memory MCP tools are absent. |
| Sentropic | `fb5e92a6ae4928066e181716fdffbfb490b0b4f3` | Cluster-mesh `0.16.0`; mcp-platform `0.2.0`; mcp-auth `0.2.2`; mcp-broker is private at `0.0.0`. |
| h2a | `029e8138272589fb1d4e08e887fd5259cffa45ce` | h2a `0.98.6`; h2a and h2a-runtime pin cluster-mesh `0.13.3`; existing memory clients and D11 machinery are present. |

The h2a changes since the original specification’s `bd29f7b4` reference do not change the inspected memory implementation or cluster-mesh dependency manifests.

Whether these references are the latest remote revisions is `unverified`. Actual npm availability, including `@sentropic/mcp-platform@0.2.0`, is `unverified`. The existing knowledge graph describes an older revision and was not treated as authoritative evidence.

Four existing surfaces require explicit treatment:

| Existing surface | Evidence, relative to its repository | Required disposition |
|---|---|---|
| Mesh memory shadow protocol | Sentropic: `packages/cluster-mesh/src/memory.ts`, exported by `src/index.ts` | Retire the public `H2aGraphifyMemoryPort` / `createGraphifyMemoryAdapter` channel in the coordinated migration. |
| h2a memory clients, compatibility adapters, vendored contracts, and D11 | h2a: `packages/h2a/src/runtime/memory/` | Retire legacy dispatch; re-anchor D11 in host-owned `AdmissionPolicy` and `EvidenceVerifierPort` implementations. |
| Read-only canonical revalidation | Engram: `engram-memory/contracts/index.ts`, `memory-store.ts`, `sqlite.ts`, `postgres.ts` | Reuse `revalidateReadOnly`; add the missing scope enforcement and pure scoped snapshot behavior. |
| X2b memory graph projection | Engram: `src/storage/memory-projection.ts`, `src/storage/file.ts` | Preserve X2b persistence and invalidation guarantees; integrate authorized memory envelopes into the graph only through a controlled assembly that preserves foreign objects and refuses uncontrolled replacement of the assembled graph. |

Other verified prerequisites are:

- `MemoryPortV2` has no authorized point-read operation.
- `acceptedSnapshot` accepts no scope. Recall computes BM25 statistics from that snapshot.
- The current snapshot observes expiry and can cause canonical writes.
- `requestAdmission` consults its cached outcome before authorization.
- The broker can manufacture a default principal and tenant, and does not forward `idempotencyKey` or `elicitationRef`.
- The catalog execution seam selects the first handler matching a name and supplies arguments without trusted per-call context.
- The frozen mcp-platform root covers the read-only adapter contract. Mutation gating and the elicitation manifest extension are experimental.
- Cluster-mesh catalogs `memory` and relevant MCP modules as `source_unavailable`.

These are implementation gaps to close before exposure.

## M1. Agent-facing capabilities

The initial contract contains exactly six tools. Each MUST be independently discoverable and independently authorized. Enabling memory MUST NOT grant all six automatically.

| Tool | Neutral operation | Required behavior |
|---|---|---|
| `engram_memory_search` | New versioned `MemoryRecallPortV3.recall` facet | Retrieve authorized, currently eligible memories with citations and ranking receipts. |
| `engram_memory_get` | New `MemoryReadPortV1.readCurrent` | Read one known canonical record without depending on search ranking. |
| `engram_memory_capture` | `MemoryPortV2.capture` | Durably submit cited material as an encrypted pending candidate. |
| `engram_memory_request_admission` | `MemoryPortV2.requestAdmission` | Request the configured policy’s decision. The caller cannot supply the decision. |
| `engram_memory_withdraw` | `transition({ operation: "withdraw" })` | Terminate a pending candidate and report required key destruction accurately. |
| `engram_memory_forget` | `transition({ operation: "tombstone" })` | Make an admitted record terminally ineligible and report derived cleanup accurately. |

Capture does not make a memory recallable. Admission is a separate policy operation. Withdrawal and forgetting remain distinct because their targets and legal transitions differ.

The tools expose **current memory only**. They MUST NOT expose arbitrary historical cursors, pending bodies, disputed-memory browsing, or administrative candidate inspection.

The following operations remain outside the agent MCP surface:

| Operation | Ownership |
|---|---|
| `admin`, bootstrap, rotation, revocation | Host administration through `MemoryPortV2.admin` and injected `AdminProviderPort`. |
| `ingestActivity` | Host automation selecting sources, schedules, scope, purpose, retention, and consent. |
| `invalidateProjections` | Host maintenance; ordinary forgetting callers receive no store-wide invalidation authority. |
| Backup, restore, migration | Host operations with their existing authorization and integrity requirements. |
| Cross-scope capitalisation | A separately authorized workflow requiring source read, target capture, sanitization, and renewed admission. |
| Reconciliation, supersession, dispute resolution, rewind | Separate lifecycle workflows. |
| `capabilities`, `readiness` | Composition and operational diagnostics with host-controlled disclosure. |
| `validate`, `cancelCapture` | Adapter internals. Cancellation may address only the caller’s corresponding capture. |

## M2. Closed schemas and host-controlled fields

All input and output objects MUST have closed schemas with `additionalProperties: false`. Optional fields MUST be absent rather than `null`. Runtime validation MUST enforce the same restrictions as published JSON Schemas.

Imported DTO names below refer to engram’s neutral contracts. The new redacted types and read facets are introduced explicitly under M3.

```ts
type SearchInputV1 = {
  query: string;
  purpose_ref: OpaqueRef;
  limit?: number;
  max_packet_bytes?: number;
  capability_policy?: RecallCapabilityPolicyV1;
  page_cursor?: OpaqueRef;
};

type GetInputV1 = {
  record_id: string;
  purpose_ref: OpaqueRef;
  max_packet_bytes?: number;
};

type CapturePayloadInputV1 =
  Omit<
    CandidatePayloadV2,
    "scope_ref" | "derivation" | "retention" | "reconciliation"
  > & {
    retention?: RetentionV1;
    reconciliation?: ReconciliationConsentV1;
  };

type CaptureInputV1 = {
  idempotency_key: IdempotencyKey;
  payload: CapturePayloadInputV1;
  evidence: EvidenceBundleV1;
};

type RequestAdmissionInputV1 = {
  candidate_id: string;
  idempotency_key: IdempotencyKey;
};

type WithdrawInputV1 = {
  candidate_id: string;
  idempotency_key: IdempotencyKey;
  reason_ref: OpaqueRef;
};

type ForgetInputV1 = {
  record_id: string;
  idempotency_key: IdempotencyKey;
  reason_ref: OpaqueRef;
};
```

The capture payload contains the existing V2 fields `schema_version`, `purpose_ref`, `valid_time`, `components`, `primary_component_id`, `primary_event`, and `citations`, plus optional retention and reconciliation requests.

It MUST NOT accept scope selection, writer-assigned fields, a trust class, an admission verdict, derivation lineage, credentials, identity fields, or administrative authority.

### Retention and reconciliation

Agent-supplied retention and reconciliation values are requests constrained by host policy:

- The default derivative rule MUST be `make-ineligible`.
- `retain` MUST require an explicit host policy allowance. Its presence in a tool argument never establishes that allowance.
- The host MUST supply a finite expiration ceiling. An omitted expiration resolves to the host default within that ceiling; a requested expiration beyond the ceiling MUST be refused.
- Reconciliation defaults to `family_refs: []`.
- Requested reconciliation families MUST be a subset of the host-authorized consent binding. The caller cannot create consent by naming a family.
- The effective values and applicable policy version MUST be resolved before canonical capture and included in its durable mutation binding.
- Retries MUST reuse those effective values. Recomputing expiration from the current time on every retry is prohibited.

The existing neutral types permit `retain`; their presence alone does not establish enforcement of every derivative-retention behavior. Current implementation coverage is `unverified` and requires qualification.

### Host-created invocation and lifecycle data

The host supplies `authorization`, `scope_ref`, `source_order`, `deadline_at`, and `cancellation_ref`.

Neither withdrawal nor forgetting accepts `event_anchor`. The host MUST construct the required `LifecycleEventAnchorV1` from verified invocation context and the durable operation reservation:

- `occurred_at`: the recorded operation time.
- `kind_ref`: the host-defined lifecycle event kind.
- `provenance_ref`: the host-owned invocation or audit reference.
- `provenance_digest`: a digest of the corresponding trusted provenance record.

The anchor and lifecycle `event_id` MUST remain stable across retries. The host MUST NOT promote model-provided provenance into authenticated provenance.

Citations, evidence, and reasons remain assertions until verified.

### Limits

| Field | Constraint |
|---|---|
| `query` | 1–8,192 UTF-8 bytes. |
| `limit` | Integer 1–50; default 10. |
| `max_packet_bytes` | Integer 4,096–1,048,576; default 65,536. Counts the complete structured envelope, including receipts. |
| `OpaqueRef` | NFC string, 1–512 UTF-8 bytes. |
| `IdempotencyKey` | NFC string, 16–256 UTF-8 bytes. |
| `record_id` | Canonical engine-generated record identifier, validated by the neutral contract. |
| `candidate_id` | Nonempty opaque identifier, at most 512 UTF-8 bytes. |
| `Digest` | `sha256:` followed by 64 lowercase hexadecimal characters. |
| `Cursor` | Canonical unsigned-u64 decimal string without leading zeroes. |
| `Instant` | RFC 3339 UTC with millisecond precision. |
| Components and citations | Existing V2 constraints, including 1–64 components, 1–256 citations, citation resolution, and the primary event/component relationship. |
| Entire argument object | At most 1,048,576 UTF-8 bytes. |
| Execution deadline | Host supplied, at most 30 seconds for this synchronous contract. |

The default retrieval capability policy is:

```json
{
  "minimum_channels": "lexical",
  "network": "forbid"
}
```

`network: "allow"` grants no permission. The host remains authoritative. A required semantic channel that is unavailable MUST return `RANKING_UNAVAILABLE`, without silent fallback.

### Results

Results MUST conform to Sentropic’s `AppResultEnvelope`. These schemas restrict that envelope for the six synchronous tools:

```ts
type ToolSuccessV1<T> = {
  ok: true;
  output: {
    schema_version: 1;
    value: T;
  };
  auditId: string;
  redactionClass: "high";
};

type ToolFailureV1 = {
  ok: false;
  auditId: string;
  redactionClass: "high";
  error: {
    code: PublicMemoryErrorCode;
    message: string;
    retriable: boolean;
  };
};
```

`auditId` MUST originate from the trusted host invocation context.

| Tool | `output.value` |
|---|---|
| Search | `SearchPageV1`. |
| Get | `MemoryReadPacketV1`. |
| Capture | `CaptureAcknowledgementV1`, restricted to `committed_pending` or `duplicate_exact`; `candidate_id`, `cursor`, and `transaction_receipt_digest` are required. `record_digest` remains optional. |
| Request admission | `{ outcome: AdmissionOutcomeV1, replayed: boolean }`. Replay recovers the recorded decision and receipts. |
| Withdraw | `{ receipt: LifecycleReceiptV1, replayed: boolean, key_destruction: "pending" \| "complete" }`; operation `withdraw`, destination `withdrawn`. |
| Forget | `{ receipt: LifecycleReceiptV1, replayed: boolean, projection_invalidation: "pending" \| "complete", coverage_receipt_digest?: Digest }`; operation `tombstone`, destination `tombstoned`. Coverage digest is allowed only after verified completion. |

```ts
type SearchPageV1 = {
  records: RecallRecordPacketV3[];
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  response_digest: Digest;
};

type MemoryReadReceiptV1 = {
  record_id: string;
  record_digest: Digest;
  valid_as_of: number;
  system_as_of: Cursor;
  validated_through_cursor: Cursor;
  authorization_receipt_digest: Digest;
  revalidation_receipt_digest: Digest;
  checked_at: Instant;
  receipt_digest: Digest;
};

type MemoryReadPacketV1 = {
  record: RedactedMemoryRecordV2;
  redacted_fields: JsonPointer[];
  redaction_receipt_digest: Digest;
  read_receipt: MemoryReadReceiptV1;
  packet_digest: Digest;
};
```

`RedactedMemoryRecordV2` is a new closed omission schema over `MemoryRecordV2`. Retained fields keep their original types; unauthorized fields are absent. `record_id` is required, and a record whose identifier cannot be disclosed MUST NOT be returned.

Components remain atomic. Returned component citations MUST resolve without exposing omitted material. Derivation lineage remains absent unless explicitly authorized. The schema MUST describe permitted omission without accepting arbitrary properties or arbitrary partial nested values.

The search adapter MUST preserve the engine’s rank receipt. Replacing its internal cursor with a public handle changes the response bytes; therefore `response_digest` MUST cover the public page, excluding itself. An internal packet digest MUST NOT be reused for different bytes.

MCP results MUST carry the envelope in `structuredContent` and an equivalent JSON text representation. `isError` MUST equal `!ok`. Both representations MUST contain the same authorized data. A separate transport limit MUST bound their combined serialized size.

## M3. Versioned neutral reads, scope isolation, and pagination

Changing `RecallRecordPacketV2.record` from `MemoryRecordV2` to a redacted type would change the neutral V2 contract. This specification MUST NOT make that change under the existing name or version.

MCP-L1 introduces:

```ts
interface RecallRecordPacketV3 {
  record: RedactedMemoryRecordV2;
  redacted_fields: ReadonlyArray<JsonPointer>;
  redaction_receipt_digest: Digest;
  score: number;
  rank: number;
}

interface RecallPacketV3 {
  records: ReadonlyArray<RecallRecordPacketV3>;
  rank_receipt: RankReceiptV1;
  next_page_cursor?: OpaqueRef;
  packet_digest: Digest;
}

interface MemoryRecallPortV3 {
  readonly version: 3;
  recall(request: RecallRequestV2): Promise<Result<RecallPacketV3>>;
}

interface MemoryReadPortV1 {
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

These are additive, explicitly versioned neutral facets. `MemoryPortV2`, `RecallPacketV2`, and `RecallRecordPacketV2` retain their existing declarations. The MCP adapter MUST require the new facets and MUST NOT fall back to the legacy recall contract.

The existing V2 capability descriptor does not prove support for these extensions. Composition MUST verify their presence and versions explicitly. All facets MUST share the intended engine, canonical store, and fence provenance.

### Scoped canonical reads

A versioned canonical-store extension MUST provide:

- Accepted snapshots selected by an engine-derived exact `scope_ref`.
- Scope filtering before candidate limits.
- Exact record reads constrained to the same scope.
- Binding between the selected scope, authorization decision, and canonical read.
- Pure read behavior.

Absence of the extension MUST produce `CAPABILITY_UNAVAILABLE`. There is no unscoped fallback.

Scope isolation MUST precede BM25 corpus statistics, candidate caps, vector allowlists, graph expansion, counts, and ranking receipt construction. Filtering foreign hits after scoring is insufficient.

Point reads MUST apply the same authorization, current eligibility, trust, retention, redaction, and fencing rules as recall. Their neutral authorization operation is `recall_current`, bound to the requested record.

The MCP adapter MUST NOT implement point reads through direct SQL, a code-graph lookup, raw `CanonicalMemoryStorePort.readRecord`, or a top-K search followed by filtering.

### Reuse of existing read-only revalidation

`CanonicalMemoryStorePort.revalidateReadOnly` already exists and MUST be reused. Its current implementation does not by itself establish scope isolation; the new scoped read path MUST enforce that binding.

The new scoped snapshot MUST NOT invoke the existing expiry-observation mutation path. Search and get MUST NOT append expiry events, advance the canonical cursor, create outbox batches, or open canonical write transactions merely to retrieve data.

Expired records MUST still be excluded using the current clock. Recording expiry transitions belongs to authorized maintenance.

Search and get MUST revalidate authorization and canonical eligibility immediately before disclosure. Retained bodies and stale projections MUST NOT expose tombstoned, expired, superseded, disputed, or trust-invalid records.

The consistency boundary is the final validation point. Already delivered bytes cannot be recalled.

### Pagination and key custody

For 0.20.0, pagination MUST use bounded host-managed server state indexed by an unpredictable random identifier. The engram adapter may implement the mechanics, but MUST NOT generate, retain, or own a pagination signing secret.

A future stateless implementation may use signing only through an injected host-owned signing and verification port.

Each handle MUST bind:

- Verified principal namespace, tenant, store, connector instance, exact scope, and purpose.
- Query, limits, selected profile, and pinned dual-as-of values.
- Applicable authorization policy and epoch.
- Eligibility state, including time-dependent expiry.

The host MUST enforce finite lifetime, quotas, and disposal. A handle is navigation state, never authority. Every continuation MUST be reauthorized.

Cross-principal reuse, changed parameters, tampering, missing state, expiration, or relevant policy or eligibility drift MUST return `STALE_PAGE`. The caller then starts a new search. Historical rank receipts remain unchanged.

The adapter MUST NOT expose or accept the engine’s raw cursor.

## M4. Identity, authority, and confirmation propagation

The authorization chain is:

```text
host-authenticated caller
  → verified transport or in-process channel binding
  → trusted host invocation context
  → Sentropic connector context and domain binding
  → neutral AuthorizationContextV1
  → AuthorizationPort decision and revalidation
  → authorized memory operation
```

HTTP profiles MUST use `@sentropic/mcp-auth` for issuer, resource audience, validity, scopes, tenant binding, and selected DPoP requirements. Protected Resource Metadata and `WWW-Authenticate` behavior MUST follow that package.

For in-process transport or host-managed stdio, the host MUST establish caller identity out of band. Process access, filesystem location, MCP client metadata, and model-provided names do not establish authority. Unbound channels fail closed.

An h2a issuer producing tokens accepted by `mcp-auth` is `unverified`. HTTP is not required for the embedded-local reference chain.

Transport scopes remain:

- `mcp:discover`.
- `mcp:tools:invoke`.

They grant no memory permission by themselves.

| Capability | Neutral authority |
|---|---|
| Search/get | `recall_current`, constrained by scope and purpose; get also binds the record. |
| Capture | `capture`, constrained by scope and effective candidate payload. |
| Request admission | `request_admission`, bound to the candidate. |
| Withdraw | `withdraw`, bound to the candidate. |
| Forget | `tombstone`, bound to the record. |

The host MUST resolve the caller and any delegation chain. A connector service credential MUST NOT replace the caller’s authority. Tenant identity MUST come from authoritative membership, not a workspace identifier.

Each invocation selects one exact memory scope through trusted host binding. Tool arguments contain no scope selector.

Authorization MUST run on every invocation, continuation, duplicate request, and cached outcome. Capture permission implies no admission, withdrawal, or forgetting permission.

### Broker and execution context

Production dispatch MUST eliminate fabricated broker identity defaults. Missing verified context MUST refuse execution.

The complete path through catalog, execution seam, broker, and provider MUST preserve:

- Trusted principal, tenant, session, connector, and domain binding.
- `AppInvocationEnvelope.idempotencyKey`.
- `AppInvocationEnvelope.elicitationRef`, when required.
- Host audit and correlation references.

The host supplies `elicitationRef`; it is not an ordinary model argument.

A confirmation reference MUST resolve to a validated, resumed elicitation bound to the same capability, session, and principal. The host MUST additionally bind confirmation to the target and stable operation digest. A confirmation for one forgotten record MUST NOT authorize another record.

A model-provided `confirmed: true` is insufficient. Agent claims of human delegation are insufficient without the host’s trusted delegation resolver.

Valid confirmation for the same logical operation MUST be preserved across its authorized retry path. A cached result MUST never bypass fresh authorization.

### Neutral authority boundary

Engram MUST NOT mint authentication identities, retain authentication signing keys, create an authorization server, or bootstrap an administrator automatically.

`AdminProviderPort` remains host supplied. Its presence grants agents no administrative authority. Administrative calls continue through `MemoryPortV2.admin`, preserving fencing, bootstrap checks, denial normalization, epoch rotation, and provider conformance.

Authorization receipts retain their maximum five-minute lifetime and epoch binding. Authorization, storage, and trust epochs remain distinct.

## M5. Lifecycle, durable replay, and forgetting

| Tool | Legal effect |
|---|---|
| Capture | Absent candidate → durable pending candidate. |
| Request admission | Pending → accepted, rejected, or pending adjudication, according to policy. |
| Withdraw | Pending → terminal withdrawn candidate. |
| Forget | A state permitted by the lifecycle table → terminal tombstoned record. |

Admission and withdrawal MUST serialize against canonical state. A stale admission decision cannot revive a withdrawn candidate. Withdrawal MUST NOT silently become forgetting when admission wins a race.

Pending, rejected, and withdrawn bodies remain absent from search and get. A candidate ID is not a readable record ID.

### Durable operation identity

All four mutations require `idempotency_key`, mapped to `AppInvocationEnvelope.idempotencyKey`. If both forms exist internally, they MUST agree.

The durable binding MUST include the stable authenticated principal namespace, store, connector, exact scope, tool contract, target, and normalized input digest. Credentials, deadlines, and transport request identifiers may change without creating a new logical operation.

For capture, the host MUST preserve the same `(source_ref, sequence, idempotency_key)` and effective payload across retries and restarts.

Lifecycle event IDs and host-created anchors MUST remain stable. Admission outcomes MUST be recoverable from durable state, not only an in-process cache.

A host reservation may precede canonical execution, but the canonical effect and its replay evidence MUST commit atomically. Loss of the later acknowledgement MUST NOT permit a second effect.

The same key with different normalized content MUST return `DIGEST_CONFLICT`.

Every replay first reauthorizes the caller. An old admission receipt describes an outcome at its cursor; it does not establish present readability.

### Tombstone protection against recapture

A new capture identity MUST NOT bypass forgetting.

Before committing admission, the engine MUST check whether the effective candidate `payload_digest` matches a tombstoned record in the same exact scope. A match MUST prevent automatic acceptance and require adjudication. The agent-facing result is `pending_adjudication`.

This guard MUST:

- Participate in canonical admission serialization.
- Handle a concurrent tombstone.
- Survive restart, logical restore, and applicable migration.
- Operate without revealing matching tombstones to an unauthorized caller.
- Avoid allowing another scope’s records to affect the decision or disclose their existence.

This is equality of the existing digest over the complete canonical candidate payload. It does not claim text similarity or paraphrase detection.

The six-tool surface exposes no adjudication override. The engine MUST NOT convert an ordinary policy `accept` into an exception to this guard without the host’s separately authorized adjudication process.

### Cleanup and interruption

After a canonical tombstone commits:

- Search and get MUST exclude the record immediately.
- Projection failure MUST return the committed receipt with cleanup `pending`.
- Completion requires acknowledged coverage of every configured derived surface subject to invalidation.
- The host retries cleanup through maintenance authority.
- The caller receives no store-wide invalidation permission.

Withdrawal similarly distinguishes terminal canonical state from confirmed pending-body key destruction.

Forgetting provides terminal logical exclusion and controlled cleanup. It does not promise physical deletion from immutable journals, retained backups, or previously delivered outputs.

Cancellation before commit MUST prevent the canonical effect. Cancellation or transport loss after commit does not imply rollback. A retry with the same key recovers the outcome.

## M6. Total error mapping

The mapping MUST cover every member of the neutral `MemoryErrorCode` union. Public codes retain the neutral spelling, subject to the disclosure normalization below.

| Class | Public codes |
|---|---|
| Schema and digest | `INVALID_SCHEMA`, `INVALID_DIGEST` |
| Authorization | `UNAUTHORIZED`, `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_REVOKED` |
| Invisible target | `NOT_FOUND` |
| Conflict and lifecycle | `DIGEST_CONFLICT`, `ILLEGAL_TRANSITION`, `ALREADY_TERMINAL` |
| Admission infrastructure | `POLICY_UNAVAILABLE`, `POLICY_STALE` |
| Retrieval and projection | `STALE_PAGE`, `RANKING_UNAVAILABLE`, `PROJECTION_STALE`, `PROJECTION_OVERSIZED`, `REGISTRY_VERSION_UNAVAILABLE` |
| Operational safety | `CAPABILITY_UNAVAILABLE`, `STORE_UNAVAILABLE`, `FENCE_LOST`, `CURSOR_GAP`, `JOURNAL_CORRUPT`, `BLOB_MISSING` |
| Backup, restore, migration | `BACKUP_INVALID`, `RESTORE_REFUSED`, `MIGRATION_LEDGER_INVALID` |
| Established interruption | `DEADLINE_EXCEEDED`, `CANCELLED` |

Backup, restore, and migration remain outside MCP. Their error codes nevertheless have defined mappings if they propagate through a dependency or capability check.

The public error union also contains:

- `RESULT_TOO_LARGE`.
- `RATE_LIMITED`.
- `MUTATION_OUTCOME_UNKNOWN`.
- Sentropic’s existing `gate_failed` for an unsatisfied mutation gate.

The implementation MUST use an exhaustive typed mapper. Adding a neutral code without updating the public mapping MUST fail qualification.

Neutral `retryable` maps to Sentropic `error.retriable`.

Disclosure rules are:

- Unknown and inaccessible targets are publicly indistinguishable as `NOT_FOUND` after invocation-level authorization.
- Detailed lifecycle state is disclosed only after target authorization.
- Policy rejection and adjudication are successful domain outcomes, not infrastructure errors.
- `STALE_PAGE` requires a new search.
- `MUTATION_OUTCOME_UNKNOWN` requires retry with the same key and MUST NOT imply that nothing committed.
- Unexpected dependency exceptions MUST be sanitized. Reads may report `STORE_UNAVAILABLE`; mutations with an indeterminate effect MUST report `MUTATION_OUTCOME_UNKNOWN`.
- No failure may produce an empty successful search as a substitute for unavailable infrastructure.

Malformed JSON-RPC and protocol-level invalid parameters use MCP protocol errors. HTTP authentication failures retain `mcp-auth` challenge semantics before dispatch.

Messages MUST exclude credentials, memory bodies, raw backend exceptions, storage paths, and inaccessible identifiers. Authorized host audit records may retain additional diagnostic details without extending the public error object.

## M7. Sentropic standard and both registration levels

### Contract status and required mutation qualification

The provider MUST implement Sentropic’s `AppConnectorProviderAdapter` and use its manifest, context, invocation, and result contracts.

The inspected mutation helper at `packages/mcp-platform/src/experimental/mutation-gate.ts` is explicitly **not frozen**, semver-exempt, and mock-only. The elicitation manifest extension is also experimental. These facts MUST NOT be described as an already frozen production mutation contract.

For this delivery, **MCP-L5 MUST freeze and production-qualify the required mutation subset**, including its elicitation extension, gate behavior, audit obligations, and durable host integration. Consumers MUST pin the exact qualified release in the compatibility evidence.

An exact dependency pin alone does not establish production durability or authorization. The selected release version and effective publication are currently `unverified`.

### Provider identity

The manifest identity is:

```ts
const manifestBase: AppMcpProviderManifest = {
  appId: "engram",
  providerId: "engram-memory",
  version: "1.0.0",
  displayName: "Engram Memory",
  resources: [],
  tools: memoryTools,
  prompts: [],
  authz: {
    requiredClaims: ["sub", "tid"],
    scopes: ["mcp:discover", "mcp:tools:invoke"],
    tenantResolution: "custom-resolver"
  },
  audit: {
    eventKinds: ["invoke"],
    piiClass: "high"
  },
  durability: {},
  secrets: []
};
```

The adapter’s `connectorId` is `engram-memory`.

`secrets: []` declares no engram-specific connector authentication secret. Host authentication and memory encryption custody remain outside discovery.

The mutation-capable manifest MUST additionally use the qualified elicitation extension. Withdrawal and forgetting each declare a required `confirm` policy with:

- Their exact capability name.
- A maximum TTL of 300 seconds.
- Binding to the MCP client and principal.
- No secret-bearing fields.
- A closed request containing capability, authorized target reference, and operation digest.
- A closed host confirmation response containing an approval Boolean.

That response belongs to the host elicitation workflow, not the memory tool argument schema.

### Exact per-tool gates

Every descriptor publishes its exact schemas, claims, scopes, redaction class, mutability, category, idempotency requirement, and all gate Booleans.

All six require `sub` and `tid`, use redaction class `high`, and require `mcp:tools:invoke` for invocation. Discovery separately requires `mcp:discover`.

| Tool | Mutability | Category | External mutation | Idempotency |
|---|---|---|---|---|
| Search | `read-only` | `read` | `false` | `{ required: false }` |
| Get | `read-only` | `read` | `false` | `{ required: false }` |
| Capture | `append` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Request admission | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Withdraw | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |
| Forget | `state-transition` | `write` | `true` | `{ required: true, scope: "principal" }` |

| Tool | `requiresElicitation` | `requiresHumanConfirmation` | `requiresPrincipalGate` | `requiresPolicy` |
|---|---:|---:|---:|---:|
| Search | `false` | `false` | `false` | `true` |
| Get | `false` | `false` | `false` | `true` |
| Capture | `false` | `false` | `false` | `true` |
| Request admission | `false` | `false` | `false` | `true` |
| Withdraw | `false` | `true` | `false` | `true` |
| Forget | `false` | `true` | `false` | `true` |

`requiresPrincipalGate` denotes an owner decision through elicitation for an invocation. It does not mean an ordinary standing principal grant. Ordinary authorization, consent, and grants remain mandatory independently of these Booleans.

D11 admission policy may require its own ceremony. That domain policy is distinct from setting `requiresPrincipalGate` on every admission request.

### Provider registry

The provider MUST be mounted through `ConnectorRegistry.register(adapter)`. Duplicate registration preserves the typed `duplicate_connector` refusal.

Registration alone grants no access and activates no agent.

### Sentropic capability catalog

Sentropic MUST re-expose the provider through its existing `McpCatalogSource` and `registerMcpSource` pattern. A concrete search entry is:

```ts
{
  kind: "tool",
  sourceId: "mcp:engram-memory",
  metadata: {
    name: "engram_memory_search",
    description:
      "Search authorized current memory and return cited, ranked results.",
    version: "1.0.0",
    category: "mcp",
    authzRequirements: {
      permissions: ["engram_memory_search"]
    }
  },
  rawName: "engram_memory_search",
  tool: {
    name: "engram_memory_search",
    description:
      "Search authorized current memory and return cited, ranked results.",
    inputSchema: SearchInputV1Schema,
    outputSchema: SearchResultV1Schema,
    sideEffect: false,
    requiresApproval: false
  }
}
```

`SearchInputV1Schema` is the closed schema from M2. `SearchResultV1Schema` is the closed success/failure envelope for `SearchPageV1`.

For each other tool, the catalog permission slug is its exact tool name. Effective permissions MUST come from the host’s policy projection. A model cannot grant itself a permission by supplying that string.

Catalog behavior MUST preserve:

- Out-of-band `tools/list` refresh.
- Synchronous, I/O-free `snapshot()`.
- Registration of executable handlers together with discovery.
- Exact output schemas, version, side effects, and approval requirements.
- Binding between public name, raw name, source identity, connector instance, and manifest version.
- Credentials, endpoints, and private invocation bindings outside catalog entries.

Execution MUST select the handler belonging to the selected entry’s `sourceId`, with verified per-call context. A global service-principal closure is prohibited.

The six public names MUST NOT be silently renamed, shadowed, or redirected on collision. Memory activation fails on a collision; unrelated catalog precedence remains unchanged.

### Explicit Sentropic tenant opt-in

`registerMcpSource` for memory MUST require a persisted, explicit tenant choice and selected agent/tool permissions. It defaults to disabled.

The current global registration function and `requiresPolicy` metadata alone do not establish this behavior. MCP-L5 and MCP-L6 MUST implement tenant-aware registration, discovery filtering, cache isolation, and execution binding.

For disabled tenants or unauthorized agents, memory tools MUST be absent from discovery, including catalog search. Forged direct calls MUST also fail.

Installation, registry publication, workspace attachment, or a shared MCP connection MUST NOT activate memory for Sentropic chat agents.

### Version boundaries

| Boundary | Version |
|---|---|
| Product | `@sentropic/engram@0.20.0` |
| MCP provider contract | `1.0.0` |
| Structured MCP payload | `schema_version: 1` |
| Existing neutral memory port | `MemoryPortV2`, unchanged |
| New redacted recall facet and packets | V3 |
| New exact-read facet | V1 |
| Scoped store extension | Explicitly versioned under MCP-L1 |

Incompatible tool semantics or schemas require a new major provider contract and explicit migration. Package and schema digests belong in release evidence.

## M8. Voluntary cluster-mesh inheritance and existing-channel migration

The integration follows the existing mesh pattern: provider leaves, typed lazy loaders, registry metadata, and explicit namespace composition.

Required public entries are:

```text
@sentropic/cluster-mesh/memory
@sentropic/cluster-mesh/loaders/memory
@sentropic/cluster-mesh/compose/memory
```

The `memory` module becomes delivered only when its export, provider, dependencies, and version checks work. A catalog status change is insufficient.

`loadMemory(modules)` MUST preserve the typed refusal:

```text
cluster_mesh_module_unavailable:
  disabled
  not_installed
  incompatible_version
  export_unavailable
  load_failed
  source_unavailable
```

A composition factory MUST support explicit activation and a host-supplied router:

```ts
createMemoryNamespaceModule(modules, {
  enabled: boolean,
  createRouter: hostSuppliedRouterFactory
});
```

The composition uses `/memory`, the host’s verified invocation context port, and its receipt port. The existing `disabledNamespaceModule`, currently restricted to `/llm-mesh` and `/gw`, MUST be extended to `/memory`.

Required MCP auth, platform, and broker bindings MUST be delivered or explicitly composed through qualified public exports.

### Disabled behavior

When disabled or unconfigured:

- No memory provider runtime is evaluated.
- No canonical memory store opens.
- No memory endpoint or tool is registered.
- No memory identity, credential, key, or administrative authority is bootstrapped.
- No agent inherits memory tools.

Installation, probing, cluster participation, registry publication, and discovery are not activation.

Enabled composition MUST verify packages, exports, versions, caller bindings, policy, storage capabilities, and configuration before exposing an endpoint. Failure is explicit, with no unauthenticated or in-memory production fallback.

### Agent-host configuration

h2a MUST persist an explicit choice containing:

- Enabled or disabled state.
- Provider binding.
- Selected agents and allowed tool names.
- Host-resolved scope and purpose policy.
- Approved retention and reconciliation policy.
- Backend and deployment configuration.
- Host custody and administrative bindings.

These are host configuration fields, not model arguments. Existing installations default to disabled.

Disabling a binding MUST invalidate subsequent discovery and execution eligibility. It does not reverse committed mutations.

h2a MUST consume public cluster-mesh exports. Direct product imports MUST NOT bypass the mesh integration while claiming voluntary inheritance.

### Existing mesh surface

The existing `H2aGraphifyMemoryPort`, `createGraphifyMemoryAdapter`, and associated shadow-query protocol form an alternative memory channel.

The memory-delivering mesh release MUST retire that public channel and its active consumers. It MUST NOT retain a separately usable shadow protocol alongside the six-tool route.

Useful pure mapping or validation code may be reused internally. Replication and federation remain gated.

### Existing h2a surface and D11

The migration MUST explicitly cover:

```text
packages/h2a/src/runtime/memory/admit-client.ts
packages/h2a/src/runtime/memory/recall-client.ts
packages/h2a/src/runtime/memory/promote-client.ts
packages/h2a/src/runtime/memory/port-v1.ts
packages/h2a/src/runtime/memory/port-v2-adapter.ts
packages/h2a/src/runtime/memory/port-v2-compat.ts
packages/h2a/src/runtime/memory/graphify-contracts-v2.vendored.ts
packages/h2a/src/runtime/memory/d11-ceremony.ts
```

Legacy dispatch and V1/V2 compatibility routes MUST leave the supported runtime path. Vendored contracts MUST NOT remain an independent executable authority for memory integration.

D11 MUST be re-anchored as host-owned policy and evidence implementations:

- `EvidenceVerifierPort` verifies the applicable evidence and attestations.
- `AdmissionPolicy` applies the configured ceremony decision.
- Evidence binds to the canonical payload, record, policy version, and policy evidence references.
- Signature verification, confinement, freshness, nonce handling, and reviewer independence remain enforced.
- The neutral engine retains final canonical admission and transition authority.

The old D11 completion call into legacy promotion dispatch MUST be replaced. A D11 reference inside `AuthorizationContextV1` alone is not proof that the new policy path is enforced.

This re-anchoring is required work; its implementation is `unverified`.

### Mesh dependency migration

MCP-L8 MUST update both:

- `packages/h2a/package.json`.
- `packages/h2a-runtime/package.json`.

Their cluster-mesh pins, lockfiles, and compatibility evidence MUST move from `0.13.3` to the exact release delivering memory.

The inspected mesh is already `0.16.0`, three 0.x minor steps beyond that pin, and still does not deliver the module. Compatibility and migration effort are `unverified`; this is an explicit migration deliverable, not a presumed trivial dependency bump.

## M9. Ownership, packaging, and CLI exclusion

The ownership boundary is:

```text
engram-memory/
  neutral DTOs, engine, versioned reads, lifecycle,
  canonical stores and neutral host ports

src/mcp/memory/
  MCP schemas, Sentropic provider adapter,
  result mapping and registration support

@sentropic/engram/mcp-memory
  optional public product entry

Sentropic
  MCP standard, production broker, catalog,
  tenant policy enforcement and cluster-mesh integration

Agent host
  explicit activation, caller identity, grants, scopes,
  policy, custody, administration, process and transport
```

`engram-memory` MUST NOT import MCP, mcp-auth, mcp-platform, cluster-mesh, h2a, or identity frameworks. This restriction includes emitted declarations, schemas, fixtures, tests, and packed dependency closure.

The product adapter calls neutral ports; it MUST NOT implement a second canonical engine.

The published adapter MUST work without sibling repositories or source-tree aliases. Separate npm publication of the private neutral package is not required.

Bundling MUST preserve the intended engine/opener instance and module-private fence provenance registry.

### Optional native storage

`better-sqlite3` and `fs-ext` MUST be optional at the public installation boundary. Installing engram, or installing h2a with memory disabled, MUST require no memory native compilation.

The current private neutral manifest lists these as ordinary dependencies. The specification does not claim they are already optional.

The release packaging MUST use explicit backend provisioning, such as optional peers, so default installation does not attempt their native builds. Moving them to npm `optionalDependencies` alone is insufficient.

Install hooks and packed dependency closure MUST be audited for indirect native installation. The current conditional sibling-package postinstall behavior cannot be relied on for the published adapter.

Once a host explicitly selects SQLite memory, the required native modules MUST be provisioned and qualified. Missing modules fail activation explicitly.

### MCP SDK floor

The memory integration MUST require an SDK range with a minimum of **`@modelcontextprotocol/sdk@1.31.0`**, qualified for `outputSchema` and `structuredContent`.

Engram’s current optional `^1.0.0` range is insufficient as the release floor. h2a’s current `^1.30.0` floor MUST also be aligned for the supported memory path.

The SDK remains optional for engram installations that do not use MCP. Exact candidate versions and runtime compatibility remain `unverified` until qualification.

### Broker publication

`@sentropic/mcp-broker` is currently private at `0.0.0`. MCP-L5 and MCP-L10 MUST make the qualified broker installable and publish it.

Repository-relative imports into sibling package sources MUST be replaced with public package dependencies. Source availability inside the Sentropic monorepo does not satisfy installed-consumer acceptance.

### `engram serve`

`engram serve` remains the graph server. It MUST NOT acquire a memory-enabling CLI flag, environment variable, or alternate stdio activation route.

The permission in v1 for `src/serve.ts` to compose memory is removed. Memory activation belongs to the explicitly enabled host composition, with agent-host inheritance through cluster-mesh.

Dedicated memory discovery and calls MUST work without `.graphify/graph.json`.

D2/D-B’s no-wire-API boundary applies to the neutral package. The optional product adapter provides MCP bindings; the host owns listeners, authentication, supervision, and relay policy. No new neutral deployment mode or built-in administrator is introduced.

## M10. Filtered memory projection into the graph (restored D3/D10)

The restored decision is the initial D10 at validated baseline `7bc9baec`, recalled exactly:

> **D10 — Bounded current projection; history never inflates `graph.json`**
>
> `graph.json` is one bounded current graph projection, not canonical history and not “graph plus projection.” It may contain only current accepted projection envelopes, citation references, and projection metadata. It never contains record bodies, pending data, journal events, tombstone history, rank receipts, authorization receipts, backup material, or vectors.
>
> The raw-byte merge ceiling remains `52_428_800` bytes. A bounded export records high-water cursor, included record count, omitted count by reason, projection schema version, and digest. Omission must follow an explicit deterministic filter; silent top-N loss is forbidden. Any journal length may be replayed without linear growth of `graph.json` when current eligible cardinality is fixed.

The canonical journal and immutable record blobs remain the sole memory authority (EVOL D3). Graph nodes and edges, indexes, caches, exports, and UI scenes are projections. No projection path, including graph construction, export, reload, or `GraphStore.pushGraph`, may capture, admit, mutate, or resurrect a canonical memory record.

The graph may combine code with current projections of admitted, eligible, and authorized memories for the scope and audience of that view. Memory projection uses the neutral projection DTOs defined by EVOL. It carries only the envelopes, citation references, and projection metadata permitted by initial D10; it MUST NOT copy canonical record bodies, pending data, journal events, tombstone history, authorization receipts, backup material, or vectors into `graph.json`.

Projection eligibility is explicit. Only a record in `accepted_current` with `projection_eligible === true`, currently eligible and authorized for the target scope and audience, may appear in the `graph.json` projection. Any transition to `accepted_disputed` (dispute), `withdrawn`, `historical`, `expired`, `trust_invalid`, or `tombstoned` removes the record from the projection at the next regeneration or reconciliation; `pending` and `rejected` records are never projected. Memories that are private for the target audience, not admitted, or not eligible MUST be excluded before assembly and before any report, wiki, export, or cache is produced. The exclusion covers their identifiers, citations, relations, statistics, and indirect influence. Rights MUST NOT be inferred from the mere presence of an object in the graph.

Links to code rest on authorized references and evidence. No edge between records in different scopes and no private derivation lineage may bypass the capitalisation and redaction rules of EVOL.

Loss of eligibility or authorization makes a memory immediately unavailable to authorized reads. Affected projections MUST be invalidated and then rebuilt or cleaned through the acknowledged cursor. A stale projection MUST NOT be served as a current authorized view. Retries, restores, and replayed batches MUST NOT resurrect a forgotten record.

X2b keeps its persistence, staging, and invalidation guarantees. A projection adapter MUST NOT accidentally replace the whole assembled graph: integration passes through a controlled assembly that preserves foreign objects. Path, staging, and alias safeguards prevent writes outside that assembly; they do not forbid an authorized memory projection.

The `52_428_800`-byte ceiling, deterministic omissions, freshness metadata, and the EVOL invalidation-cascade criteria remain applicable. The dedicated memory tools remain usable without any code graph file.

Code symbols and documentation describing the memory implementation remain legitimate graph material. No cleanup of existing artifacts is presumed without evidence of non-conforming content. Any correction preserves the journal, canonical records, tombstones, and backup integrity.

Restoration note: M10 restores the validated baseline at `7bc9baec` (initial D3/D10). This is a restoration, not a new owner amendment.

### Established implementation state

No memory-to-`graph.json` assembly bridge was found in the inspected build/update path. The tracked graph contains `code`, `concept`, and `rationale` nodes; no materialized memory nodes were found. The filtered projection assembly is therefore missing product work assigned to MCP-L3, not an established contamination.

Existing contamination is therefore **`unverified`**. This specification MUST NOT describe contamination as an established fact.

The verified X2b implementation is `src/storage/memory-projection.ts`. It creates a private `graph-${encodeURIComponent(namespace)}.json` snapshot, writes through `FileGraphStore` to a staging target, and publishes by rename. That private snapshot is not the assembled code-plus-memory graph.

`FileGraphStore` accepts `config.target`. That target boundary requires a controlled-assembly safeguard so a projection write cannot replace foreign graph objects or write outside the intended assembly.

### Required changes

MCP-L3 MUST:

- Restore EVOL D3/D10 wording to the validated baseline and assemble authorized memory envelopes with code in `graph.json` through neutral projection DTOs.
- Project only records in `accepted_current` with `projection_eligible === true` that are currently eligible and authorized for the view; exclude every other state and every unauthorized record before assembly.
- Preserve X2b staging, path-identity, and alias safeguards as assembly safeguards; refuse any write that would replace foreign objects or escape the controlled assembly.
- Connect invalidation and freshness to build, update, query, report, wiki, export, and caches, so no derived output exposes a memory that is unauthorized, ineligible, or stale.
- Preserve the `52_428_800`-byte ceiling, deterministic omissions, and lifecycle invalidation tests for the bounded projection.
- Share the citation-resolution convention with live-git G3 (`explainLineOrigin`) without duplicating join logic, and without copying canonical memory into `/code-git` storage.

Cleanup or regeneration of active artifacts is required only when non-conforming content is established or deliberately seeded for testing.

Any cleanup MUST preserve canonical records, journals, tombstones, and backup integrity. Git-history rewriting and deletion of already distributed artifacts remain outside this amendment.

## M11. Acceptance classes

Existing mandatory memory gates remain binding. The following classes are required for this integration.

| Class | Required acceptance |
|---|---|
| Contracts and schemas | Six closed schemas; nested unknown fields rejected; identity, scope, event anchors, and confirmation cannot be injected through arguments; byte limits, defaults, citations, redaction, output bounds, and structured/text equivalence pass. |
| Neutral versioning | V2 declarations remain unchanged; V3 recall packets and V1 point reads have separate schemas and conformance coverage; missing facets fail activation. |
| Authentication | Verified per-call context; no fabricated broker identity; unbound channels refused. Any supported HTTP profile passes real signed-token issuer, audience, expiry, tenant, scope, and selected DPoP tests. |
| Scope isolation | Two principals and two scopes in the same canonical store. Foreign records cannot affect corpus statistics, candidate caps, vectors, graph expansion, counts, receipts, or disclosed errors. |
| Read purity | Scoped snapshots, exact reads, and revalidation do not append expiry events, advance cursors, create outbox work, or perform canonical write transactions. Expired records remain excluded. |
| Exact read | Get works without lexical matches or a code graph and cannot expose pending, historical, disputed, expired, or tombstoned bodies. |
| Revocation | Fresh calls, continuations, cached admission results, and mutation replays honor revocation. Unknown and inaccessible targets remain indistinguishable. |
| Policy bounds | Expiration ceilings, derivative defaults and exceptions, and reconciliation consent are enforced by the host; retries preserve effective values. |
| Lifecycle | Capture remains pending; policy owns admission; withdrawal races cannot revive candidates; tombstones dominate replay and restore; evidence cannot self-assign trust. |
| Recapture after forgetting | Admit → forget → recapture the same effective payload under a new identity → admission requires adjudication. Exercise restart, restore, concurrent tombstone, and same-store cross-scope isolation. |
| Retry and crash recovery | Lost acknowledgements and restart preserve source ordering, event identity, provenance anchor, admission outcomes, and one canonical effect. Changed content under the same key conflicts. |
| Pagination | Pinned query/profile/time, current-state checks, expiry, tampering, lost state, and cross-principal reuse. No engram-owned signing key exists. |
| Cleanup | Canonical exclusion is immediate while projections are unavailable; pending status is accurate and converges. Key-destruction failure is distinguishable from completion. |
| Mutation standard | Qualified production gate behavior; exact Booleans; idempotency and elicitation propagation; rejection of references for another capability, session, principal, target, or operation. |
| Registry and catalog | Actual SDK `tools/list` and `tools/call` traverse provider registry, `McpCatalogSource`, composite registry, and execution seam. Metadata, source identity, context, errors, and mutation fields survive. |
| Sentropic opt-in | Disabled tenant and unselected agent see no memory tools. Another tenant’s cached discovery or execution binding cannot be reused. Direct forged invocation fails. |
| Voluntary host inheritance | Disabled h2a performs zero memory initialization and exposes zero tools. Enabled h2a obtains only selected capabilities through public mesh exports. |
| Legacy cutover | No active shadow protocol or V1/V2 compatibility dispatch bypasses the six tools. D11 evidence reaches host policy and verifier ports with its existing guarantees. |
| Filtered projection (D3/D10) | An admitted, current, shareable memory fixture appears in the graph with its authorized references to code. Non-admitted, private-for-the-audience, or ineligible memories appear in no output and exert no indirect influence. Revocation, loss of eligibility, and forgetting make the stale view unservable, then remove the projection from every declared surface. Replay, rebuild, and restore resurrect nothing and never modify canonical authority. Only `accepted_current` with `projection_eligible === true` is projected; `accepted_disputed`, `withdrawn`, `historical`, `expired`, `trust_invalid`, and `tombstoned` records are removed at the next regeneration or reconciliation. |
| Packaging | Fresh consumers use exact candidate tarballs without sibling directories; SDK schemas work at the selected floor; disabled installations perform no memory native build. |
| Native storage and existing gates | Preserve Linux SQLite fencing, crash/reopen, Postgres 16/17 parity coverage, trust/admission, recall profiles, backup/restore, migration signatures, and configured projection tests. |
| Complete topology | Qualify the h2a embedded-local chain and the separate Sentropic-owned instance. Exercise success, denial, revocation, pending admission, forgetting, opt-in, and disable behavior. Verify no cross-host memory call. |

Existing Sentropic test paths to extend include:

- `api/tests/services/catalog/mcp-source.spec.ts`
- `api/tests/services/catalog/composite-registry.spec.ts`
- `api/tests/services/catalog/execution-seam.spec.ts`
- Relevant broker, mcp-platform, and mcp-auth suites.

New focused suites SHOULD cover scoped reads, point reads, MCP schemas, durable replay, authorization, filtered graph projection, mesh composition, host opt-in, and legacy cutover.

All test outcomes and release readiness remain **`unverified`** in this document.

## M12. Delivery organization

The final **Lots** section is normative.

This document uses **MCP-L0 through MCP-L10** exclusively. The substrate specification’s existing lots are referenced as **EVOL-L0 through EVOL-L7**. Their identifiers MUST NOT be conflated.

Every lot has an accountable owner, dependencies, and an observable exit criterion. Repository-local plans may divide a lot into atomic commits without weakening its exit gate.

## M13. Required 0.20.0 topology and publication boundary

### Reference topology

The 0.20.0 reference agent-host chain is **embedded-local**:

```text
selected h2a agent
  → explicitly enabled cluster-mesh memory module
  → registered Sentropic MCP provider and authorized dispatch
  → neutral engine inside the h2a process
  → host-owned fenced SQLite store
```

The supported reference storage profile is Linux SQLite with its existing filesystem and fencing requirements.

Sentropic MUST run a **separate Sentropic-owned instance**, embedding the engine in its own host process and using its own canonical store:

```text
selected agent in an opted-in Sentropic tenant
  → Sentropic capability catalog
  → actual MCP discovery and invocation
  → Sentropic-owned provider and embedded engine
  → Sentropic-owned canonical store
```

The instances share a provider contract, not identities, keys, live state, or storage.

For 0.20.0:

- Sentropic catalog calls MUST NOT target an h2a memory endpoint.
- Neither host accesses the other host’s canonical store.
- No cross-host token exchange, replication, or federation is required.
- Actual MCP discovery may use a host-bound in-process transport.
- The absence of an established h2a HTTP token issuer does not block the reference composition.

The external-host operating-agreement gate **W-C/ARCH-06** remains applicable to future external-host activation. Its satisfaction is `unverified`. It does **not** block the embedded-local 0.20.0 reference chain.

### Required delivery

The release requires:

- Six tools with exact schemas and qualified Sentropic mutation behavior.
- Versioned redacted recall, scoped pure reads, and authorized point lookup.
- Authorization-safe durable replay and lifecycle race handling.
- Host-bounded retention, consent, and lifecycle provenance.
- Same-payload tombstone adjudication protection.
- Filtered-projection (restored D3/D10) documentation and implementation.
- An installable optional adapter with qualified dependency boundaries.
- A published production broker and actual Sentropic registry execution path.
- Explicit Sentropic tenant opt-in.
- A delivered public mesh integration.
- A tested h2a consumer with migrated pins and retired legacy dispatch.
- Passing mandatory memory and cross-repository evidence.
- Versioned artifacts, integrity digests, compatibility pins, and operational instructions.

Candidate artifacts MUST be qualified together before production publication. Publication of the adapter alone does not complete the owner decision.

Federation, token exchange, replication, high availability, external-host production activation, additional platform support, advanced lifecycle tools, historical browsing, cross-scope capitalisation, candidate inspection, and agent-facing administration may follow 0.20.0.

## Disposition of review amendments

All 16 amendments are **applied**. None is contested.

| # | Disposition | Incorporated requirement and verified basis |
|---:|---|---|
| 1 | **Applied** | M7 and MCP-L5 require a frozen, production-qualified mutation subset and exact consumer pins. Sentropic’s `experimental/mutation-gate.ts` is explicitly unfrozen, semver-exempt, and mock-only. |
| 2 | **Applied** | M7 fixes every `CapabilityGates` Boolean. Capture/admission require policy without per-call principal elicitation; withdrawal/forgetting additionally require human confirmation. The meaning of `requiresPrincipalGate` follows the inspected standard and GitHub write precedent. |
| 3 | **Applied** | M4, M7, and MCP-L5 require propagation of both `idempotencyKey` and `elicitationRef`, with capability/session/principal and operation binding. `mcp-broker/src/broker.ts` currently drops both. |
| 4 | **Applied** | M8 and MCP-L7/MCP-L8 explicitly retire the mesh shadow protocol and h2a legacy dispatch. D11 is re-anchored through host policy and evidence ports. Both existing surfaces were verified in source. |
| 5 | **Applied** | M7 requires explicit, default-disabled Sentropic tenant opt-in, per-agent selection, discovery absence, and execution enforcement. Current registration is global; policy metadata alone does not enforce the requirement. |
| 6 | **Applied** | M13 fixes two independent local host instances. Sentropic owns its provider and store; it does not call h2a for 0.20.0. Current live composition is `unverified`. |
| 7 | **Applied** | M2 constrains retention and reconciliation through host policy, with `make-ineligible`, an expiration ceiling, and empty reconciliation consent by default. Existing neutral fields are permissive input contracts, not host authorization. |
| 8 | **Applied** | `event_anchor` is removed from both public mutation inputs. M2 and M5 require host-created, durably preserved provenance. Existing engine validation establishes shape, not caller provenance. |
| 9 | **Applied** | M5 and Lifecycle acceptance require same-scope, same-payload tombstone adjudication at canonical admission. Existing tombstone protection is by record ID; a new capture can receive a new record ID. |
| 10 | **Applied** | M3 selects host-managed random pagination handles and forbids engram-owned signing secrets. Any later signed variant requires a host key port. |
| 11 | **Applied** | M3 and MCP-L1 introduce V3 recall packets and a versioned facet without altering V2. They reuse existing `revalidateReadOnly` and require a pure scoped snapshot. Current `acceptedSnapshot` observes expiry through a write path. |
| 12 | **Applied** | M6 maps the complete neutral error union, explicitly including `PROJECTION_OVERSIZED`, `BACKUP_INVALID`, `RESTORE_REFUSED`, and `MIGRATION_LEDGER_INVALID`. Exhaustiveness is a qualification gate. |
| 13 | **Applied** | M10 records the restored filtered-projection boundary (initial D3/D10), marks existing contamination `unverified`, records that no assembly bridge was found in the inspected build/update path, and targets controlled assembly over X2b’s actual file publication path and `FileGraphStore.config.target`. Cleanup is conditional on evidence. |
| 14 | **Applied** | All delivery lots use MCP-prefixed identifiers. MCP-L8 includes both h2a mesh pins and compatibility migration; MCP-L7 extends `disabledNamespaceModule` to `/memory`. Current 0.13.3→0.16.0 compatibility is not assumed. |
| 15 | **Applied** | M9 requires optional native provisioning, an SDK floor of 1.31.0, and publication of the currently private broker. It distinguishes the current private package’s ordinary dependencies from the required public installation behavior. |
| 16 | **Applied** | M9 forbids memory activation through `engram serve` flags, environment variables, or alternate stdio launches. M13 fixes the embedded-local reference chain independently of W-C/ARCH-06. |

The review’s minor corrections are also incorporated: the catalog example has a complete description and concrete `authzRequirements`, and test references use repository-relative paths.

The following remain explicitly **`unverified`**:

- Effective npm publication of `@sentropic/mcp-platform@0.2.0`.
- Availability and version of the future qualified mutation contract and published broker.
- An h2a HTTP token issuer accepted by `mcp-auth`.
- Exact versions and compatibility of the eventual memory-delivering mesh and consumers.
- Existing contamination outside the inspected tracked code graph.
- Runtime enforcement and test results for the proposed changes.
- Satisfaction of W-C/ARCH-06 for future external-host activation.

## Lots

All MCP lots below are required for the complete 0.20.0 delivery. “Agent host” means h2a for the reference consumer; Sentropic owns its separate host composition.

| Lot | Accountable owner | Deliverables | Dependencies | Exit criterion |
|---|---|---|---|---|
| **MCP-L0 — Contract freeze** | Engram, with Sentropic and agent-host contract owners | Six schemas; V3 recall and V1 point-read declarations; exact gates and error mapping; host policy/provenance rules; D10 restoration (filtered projection); topology; legacy migration disposition; package and profile requirements. | First. | Reviewable contract contains no behavioral placeholders. Every review amendment has a disposition. Public/private boundaries and required schema versions are explicit. |
| **MCP-L1 — Scoped neutral reads** | Engram | Versioned scoped store extension; V3 redacted recall; `MemoryReadPortV1`; reuse of `revalidateReadOnly`; pure snapshots; final authorization and eligibility checks. | MCP-L0. | Same-store cross-scope, read-purity, exact-read, redaction, and version-compatibility acceptance pass. V2 declarations remain unchanged; missing extensions fail closed. |
| **MCP-L2 — Durable lifecycle and policy safety** | Engram; agent hosts supply trusted bindings | Authorization before cached outcomes; durable admission replay; stable capture ordering and provenance; policy-bound retention/consent; atomic same-payload tombstone guard; race, interruption, and cleanup reporting. | MCP-L0. | Restart, lost-acknowledgement, conflict, revocation, withdrawal/admission race, recapture-after-forget, and cleanup tests pass. |
| **MCP-L3 — Filtered memory projection into the graph** | Engram; policy and consumer-surface owners for their contracts | Restore EVOL D3/D10; assemble authorized memory envelopes with code; preserve provenance, scope, bounds, and foreign objects; connect invalidation and freshness to build, update, query, report, wiki, export, and caches. | Corrected L0 contracts; authorized L1 reads; canonical L2 transitions and invalidation as needed. No MCP transport is required for local assembly. | Positive presence of an admitted, shareable memory; absence of forbidden data and indirect influence; invalidation, replay, and anti-resurrection proven on real surfaces; journal unchanged by projection operations; ceiling and deterministic export preserved. Only `accepted_current` with `projection_eligible === true` is projected. |
| **MCP-L4 — Standard memory provider** | Engram | `src/mcp/memory/*`; optional product export; six tools; schemas; total result/error mapping; cancellation; host-managed page handles; native dependency isolation; SDK floor. | MCP-L1, MCP-L2, and MCP-L5’s qualified contract. | SDK discovery and invocation pass without a code graph. Packed provider works from public dependencies and performs no default native storage installation. |
| **MCP-L5 — Production Sentropic mutation and execution path** | Sentropic | Freeze and qualify the mutation subset; production broker; mandatory verified context; idempotency and elicitation forwarding; policy enforcement; catalog metadata preservation; source-bound dispatch; public broker dependencies. | MCP-L0; runs alongside MCP-L1–MCP-L3. | Production contract is versioned and pinned in candidate evidence. Concurrent-principal, tenant isolation, forged-call, confirmation-replay, and source-binding tests pass. Broker is publishable without sibling-source imports. |
| **MCP-L6 — Sentropic registry re-exposure** | Sentropic, using the Engram provider | Sentropic-owned embedded provider/store; actual MCP discovery; tenant-aware `registerMcpSource`; selected agent/tool policy; executable handlers; collision checks; disable behavior. | MCP-L4, MCP-L5. | End-to-end catalog invocation succeeds for an opted-in tenant. Disabled tenants and unauthorized agents see no tools and cannot invoke them. No call targets h2a. |
| **MCP-L7 — Public mesh delivery and legacy retirement** | Sentropic | Memory leaf, loader, composition, metadata, public MCP bindings, dependency preflight, `/memory` disabled helper; retirement of the old public shadow protocol. | MCP-L4–MCP-L6 and candidate package artifacts. | Public-export and refusal tests pass. Disabled composition loads no memory runtime or store. New composition works, and no separately usable legacy mesh memory path remains. |
| **MCP-L8 — Voluntary agent-host consumption** | Agent host: h2a | Persisted opt-in; selected agents/tools; caller, scope, policy, custody, and administration bindings; embedded-local composition; D11 re-anchoring; legacy client cutover; both mesh pin updates and lockfiles. | MCP-L7. | Fresh/default-disabled h2a exposes no memory and triggers no memory native build. Explicitly enabled workflows pass through public mesh and MCP. D11 guarantees survive cutover. Both packages use the exact qualified mesh release. |
| **MCP-L9 — Cross-repository qualification** | Engram release owner; Sentropic and agent host provide evidence | Exact candidate tarballs; both local topologies; full acceptance matrix; native-store recovery and scope tests; schema/package digests; compatibility and installation evidence. | MCP-L1–MCP-L8. | Every mandatory class has an archived passing result. The complete chain works outside the source trees. No release-critical claim remains merely `unverified`. |
| **MCP-L10 — Publication and closure** | Engram for 0.20.0; Sentropic and agent host for their artifacts | Dependency-ordered publication; tags and integrity evidence; compatibility pins; installation/activation/disable documentation; release notes and closure evidence. | MCP-L9. | Published artifacts match qualified candidates. Broker, platform contract, Engram adapter, mesh, and h2a consumer are installable together. Sentropic re-exposure is available under explicit tenant policy. |

The dependency order is:

```text
MCP-L0 → MCP-L1 + MCP-L2 + MCP-L5 → MCP-L4
MCP-L4 + MCP-L5 → MCP-L6 → MCP-L7 → MCP-L8
MCP-L0 → MCP-L3
MCP-L1 through MCP-L8 → MCP-L9 → MCP-L10
```

MCP-L5 MUST establish its qualified mutation contract before MCP-L4 can exit. MCP-L8 MUST include the actual mesh migration rather than bypassing MCP-L7 through direct provider imports.

Before publishing engram 0.20.0, MCP-L0 through MCP-L9 MUST have exited against exact candidate artifacts. MCP-L10 then publishes in dependency order:

1. Required Sentropic contract, authentication, and production broker artifacts.
2. `@sentropic/engram@0.20.0` with the optional memory adapter.
3. The cluster-mesh release delivering memory.
4. The compatible h2a/h2a-runtime releases and the corresponding Sentropic catalog integration.

Publication MUST preserve default-disabled behavior. No tenant or agent is enabled merely because an artifact is published or installed.

The 0.20.0 memory delivery is complete only when the published artifacts reproduce the qualified embedded-local chains, including actual Sentropic registry exposure and voluntary agent-host inheritance.
> Status: FROZEN v4.1 — validated by engram (gr-conductor) and sentropic (s-conductor, Opus confirmation f0adfec3…)

# Generic Cluster-Mesh Module Storage Port — Common Version 4.1

**Date:** 2026-10-12  
**Specification:** L3a  
**Requested authoring seat:** Astra max; effective routing and effort are `unverified`.  
**Status:** Frozen common specification incorporating confirmation deltas G1–G5. Implementation, installed-package compatibility and runtime qualification remain `unverified`.  
**Supersedes:** `L3a-spec-v4-common.md` in full.  
**Delivery:** stdout only. No repository, plan, tracking record, configuration or database was changed.

Cluster-mesh owns the generic storage kernel, SQLite implementation and reusable Postgres implementation. Comments and engram-live are separate registered consumers. Applications inject and operate Postgres connections. Engram remains a neutral producer.

**The frozen comments M1 contract and merged engram L6a identity contract are authoritative. The common kernel accommodates both without changing either.** Module-specific requirements are expressed through registered profiles and service composition.

Comments/Postgres qualification and delivery have their own gates. They do not depend on live qualification Q, comments/SQLite parity or a combined release freeze. An external restore witness is optional and is not a prerequisite on the Immo delivery path.

## 1. Evidence and authority

### 1.1 Inputs read in full

| Input | Recomputed SHA-256 |
|---|---|
| `L3a-spec-v3-astra.md` | `dee8e25d43477b36a4d1adae02ea15007def072003156b8ffbb7b71f71fb7968` |
| `REVIEW-L3a-opus-v2.md` | `0a7dc235cdffc828d103d8bb66a3246045b0226f9a1309dbb68efc88f4adaa7c` |
| `l3a_v3_opus_comments.md` | `30b8701b3b2a3230bdfeb2083ef1b5d58adff7839fac19903b33e35bd4931725` |
| `annotations_needs_and_contradiction.md` | `4b7f0e3ee94e612f5a273cfa1de633c2c5ca083400696d2e2f7ab835d29d6b3a` |
| `L3a-spec-v4-common.md` | `0f1eef6ecbf19eb40c12b4d7ef7fb105b9547c4cb48f6121633ac87678c7057f` |
| `l3a_v4_confirmation.md` | `f0adfec37b159fdb42db0ebcbf16bad391efdb8e826e9cd27a1261afa1c704a2` |

The first two files reside under:

```text
/home/antoinefa/src/graphify/.graphify/scratch/design/live-git-indexing/
```

The two Sentropic reviews reside under:

```text
/home/antoinefa/src/sentropic/tmp/worktrees/comments-annotations-port/.h2a/l3a/
```

The v4 base resides with the first two inputs; the Opus confirmation resides with the two Sentropic reviews. The confirmation verdict is **CONFIRMED with reservations**: 23 findings applied, three partially contested with accepted reasons, zero untreated. This v4.1 integrates exactly its remaining G1–G5 deltas; other provisions are preserved, with freeze metadata and the requested final plan amendment.

### 1.2 Verified source baselines

Git objects were inspected independently of the root working checkouts, whose local `main` branches are older.

| Alias | Verified source |
|---|---|
| **E** | Engram `main`, locally available as graphify `origin/main`, `6b57a03351d33ae02531235d48c4e4b6c8aadf73`. GitHub reported the same main SHA during this inspection. |
| **E-L6a** | [Engram PR #359](https://github.com/rhanka/engram/pull/359), merged at `3b311dfb1e325dfdb04b97d1cf6ba5250dee14e1`; contract branch head `70ebdfee9857ba381059896089e4f2d5c19363ea`. |
| **S** | Sentropic `origin/main`, `dc95f7e4f88048e9671002827537cde4cb8149b7`. |
| **C** | [Sentropic PR #663](https://github.com/rhanka/sentropic/pull/663), head `20774f3c9d3a0e73a8b7abfd0fef2a805fbbca3b`, branch `feat/comments-annotations-model`. Open and draft when inspected. |
| **C-freeze** | Frozen comments source `7b8e5daf022cc58819dfdfae43cd89a703a82f96`. Git comparison found no changes through **C** in `packages/comments/src` or `packages/comments/tests`. |
| **S-L6a** | [Sentropic PR #664](https://github.com/rhanka/sentropic/pull/664), head `a689ae0764835ee72d101b20dccef52d70f14987`, branch `feat/live-git-l6a-s`. Open and draft when inspected. |
| **CA** | Current comments specification in the documentary worktree, SHA-256 `df6bea51d7c270f7f88602924ff68de7d90f24a58307b6b52d7093abd2f08b74`. |

Additional verified artifacts:

| Artifact | SHA-256 |
|---|---|
| Comments `contract-v1.json` | `e027fdbb4a806df39809326697bf9b60ad5cb977eb1988af3be293da07161ba0` |
| Comments freeze receipt | `095e1d50f4c64ddc7254ca7e86f10582e4d1c2f153ec5173c79cb62818dc92cb` |
| Frozen command-conformance corpus | `26cdaf181afbc73c145c57974c6762230757bc101a0418f8da0654f505fb7b00` |
| Frozen in-memory conformance adapter | `0b91befcb3b67418667ccda1a36bbd40a183fd37c38eeb40ddb8a1495d42f945` |
| `revision-hash-v1.json` vectors | `26ee62b09d22f39438c344a9223564f08e696eeba95ddd0558f357407a40f0c0` |
| M2 cluster-mesh owner-decision brief | `9507232c6d1bc5718d80b167d892f82960b1b3f049058c148b888c6ba7b23300` |

The package/source artifacts listed in the manifest’s `artifacts` section passed checksum comparison against the inspected comments worktree. This is source verification, not a built-package receipt.

### 1.3 Established facts and their limits

| Observed fact | Consequence |
|---|---|
| M1 contains 24 store methods, eleven canonical kinds, a zero-argument transaction callback and a fixed router factory signature. | Preserve the interfaces and their persistence behavior. |
| The frozen corpus appends tombstone, purge intent and purge outcome separately, performs no physical disposal, and subsequently reads annotation content. | A persistence append cannot universally trigger the enforcing behavior imposed by v3. |
| M1 has a ten-field `CapacityDescriptor` and `BodyCodecDescriptor.specDigest`. | CA’s additional count fields, paging object and codec rename are not already frozen declarations. |
| M1 export requests contain `snapshotBoundary`, but no continuation cursor or limit. | Continuation and fragment transport require an explicitly declared module extension; they cannot be smuggled into the frozen DTO. |
| The comments package exports root and `/hono`; the latter is the existing staging router. | A canonical module router or public conformance leaf is not proved installed by that export map. |
| Cluster-mesh’s inspected catalogue lists comments as `source_unavailable`, owned by comments; it has no engram-live catalogue entry. | Availability and catalogue changes need implementation and installed evidence. |
| `ClusterMeshPersistencePorts` contains runtime, cutovers, backfill and rollback. | Module storage receives an independent binding. |
| `createClusterMeshRuntime` does not require these persistence ports; the Hono namespace factory receives context and receipts. | Full runtime composition can capture module storage through a closure without changing those interfaces. |
| `VerifiedInvocationContext` supplies a principal and workspace binding, but no tenant ID. | Product storage requires separate authoritative tenant resolution. |
| Alias/shadow tenancy resolution returns the workspace ID. | Those modes cannot establish canonical product scope. Equal identifier strings alone are not grounds for rejection. |
| The existing application outbox writer allocates with `MAX(seq)+1`. | It cannot be injected unchanged as the qualified durable replay implementation. |
| E retains exact-key DTO validation, `facts: unknown[]` and durable receipt separate from publication. | Typed facts and completion control remain neutral-contract work; L6a identity stays unchanged. |
| E has additional L4a source since v3’s reference. | Source presence does not establish installed end-to-end live qualification. |
| S-L6a contains mirrored canonical derivation/validation and application declaration persistence. | Preserve its established identity surface; qualify its integration with storage separately. |

S-L6a’s application implementation includes fingerprint fallback when exact identity components are omitted, and its save operation is an upsert without a predecessor-revision predicate. Its withdrawal orchestration invokes cancellation, purge request and withdrawal recording as separate calls.

These observations do not establish atomic declaration/storage revocation ordering. The v4 live binding must use the exact identity triangle and prove that ordering. Such qualification remains `unverified`.

No builds, tests, installations, migrations, benchmarks or backup/restore operations were run. PR bodies contain historical wording; they do not override the owner decisions or frozen source.

### 1.4 Authority order

1. The current owner convergence instructions.
2. Frozen comments M1 for comments representation, signatures and established persistence behavior; merged L6a for live identity.
3. Recorded host/domain decisions within their respective scope.
4. This common storage specification and its separately negotiated module profiles.
5. Plans and historical prose, amended where they conflict with the preceding authorities.

The owner answer **“Oui, la retirer”** removes backup/restore rehearsal from M2 and every prerequisite before Immo delivery. It is recorded in:

[owner-decisions.md](/home/antoinefa/src/sentropic/tmp/worktrees/comments-annotations-port/docs/comments-annotations/evidence/owner-decisions.md:50).

Software artifact recovery and reproducible locked installation remain separate obligations. Neither implies a database restoration rehearsal.

“Applied” below means incorporated into this specification. It does not mean implemented, qualified, accepted by another reviewer, merged or deployed.

## 2. Architecture and fixed boundaries

### 2.1 Ownership

| Concern | Owner |
|---|---|
| Kernel, profile negotiation, generic storage semantics and shared corpus | Cluster-mesh, with engram co-review and comments review of consumed capabilities |
| SQLite and reusable injected-driver Postgres implementations | Cluster-mesh |
| Canonical comments model, validators, hashing and frozen contract | Comments |
| Comments descriptor, store adapter, commands, queries, module API and C4 import/export services | Comments team, implemented in cluster-mesh |
| Neutral facts, extraction and neutral completion protocol | Engram |
| Cluster-mesh engram-live descriptor and storage adapter | Engram integration team, within cluster-mesh ownership |
| Authentication, authoritative scope, resource policy, connection pools, credentials and database operation | Each host |
| Sentropic application migrations, optional existing-outbox binding and cutover | Sentropic application maintainers |
| Immo deployment, retention policy and backups | Immo |

The comments team’s proposal to lead all reusable Postgres implementation is not adopted as common ownership. Named contributors may work on those lots, but the accountable owner remains cluster-mesh. Actual staffing records are `unverified`.

### 2.2 Common constraints

- One generic kernel and shared backend implementations; no comments-specific database backend.
- No cluster-mesh, database or application dependency inside engram.
- No application singleton, credentials lookup, pool construction or migration-on-import inside the reusable Postgres backend.
- No generic request-selected SQL or CRUD namespace.
- No modification of canonical comments hashes, L6a identifiers or frozen DTOs to fit storage.
- No extension of runtime persistence ports as a prerequisite for module storage.
- No live-generated versioned export or writes into observed worktrees or Git directories.
- No automatic application cutover, real-data conversion or lifecycle activation.
- No messaging-storage expansion. Existing canonical memory and engram corpus migration remain outside scope.
- Future primary graph backends may implement profiles and qualify against the same corpus. None is delivered here.

Canonical comments annotations and existing engram corpus annotations remain distinct domains.

### 2.3 Independent identities

The following are distinct and must never substitute for one another:

- Domain record identity and hash version.
- Aggregate version.
- Typed-chain creation allocation and sequence.
- Scope visibility-root version.
- Content generation and view-pointer version.
- Schema version.
- Runtime generation.
- Journal position and stream incarnation.
- Store incarnation.
- Writer epoch.
- Host authority revision.
- L6a declaration and binding revisions.
- Optional host declaration-set revision.
- Command result, fragment receipt, unit receipt, batch snapshot and publication receipt.

Counters require exact safe-integer validation or canonical decimal-string encoding. Conversions to frozen comments number fields require range checks.

## 3. Profiles and capability negotiation

The kernel does not impose every live mechanism on every module.

### 3.1 Profile catalogue

| Profile | Contract |
|---|---|
| `atomic-units-v1` | Bounded transactions, guards, rollback and effective committed changes |
| `immutable-chains-v1` | Canonical records, independent typed chains, allocation and CAS |
| `immutable-boundaries-v1` | Reopenable immutable heads/roots without time-based cursor expiry |
| `scope-outbox-v1` | Durable scope journal, checkpoints, consumer status and resync |
| `visibility-barriers-v1` | Immediate denial through registered coverage relationships |
| `staged-units-v1` | Hidden bounded fragments and atomic coherent-unit/group publication |
| `purge-jobs-v1` | Authorized disposal, holds, shared references and durable progress |
| `generations-v1` | Live view staging, sealing and conditional publication |
| `leased-snapshots-v1` | Temporary pins for mutable projections or retained generation vectors |
| `fenced-writers-v1` | Epoch/lease checks for background ownership |
| `restore-witness-v1` | Optional external rollback detection and recovery reconciliation |

Each profile has a version, semantic digest and executable corpus. A descriptor declares requirements. Backend/module combinations advertise only profiles they implement and qualify.

Unsupported profiles fail explicitly at composition or capability acquisition. Missing functionality cannot appear as empty data or successful no-op execution.

### 3.2 Consumer requirements

| Consumer claim | Required profiles |
|---|---|
| M1 persistence adapter | Atomic units, immutable chains, immutable boundaries |
| Comments operational module | M1 profiles, scope journal and visibility barriers |
| Comments C4 import/export | Comments profiles plus staged units |
| Comments physical-purge capability | Comments profiles plus purge jobs and fenced maintenance |
| Local live storage | Atomic units, journal, generations, leased snapshots, fences, private visibility/disposal capabilities |
| Product committed-live storage | Applicable live profiles and destination publication/authority qualification |
| Restore rollback detection | Explicitly selected restore-witness profile |

Comments does not require live generations. A comments deployment can support tombstones while physical purge is unconfigured and denied.

SQLite comments parity is required before advertising comments on SQLite, not before delivering comments/Postgres.

Profile selection belongs to trusted composition. Requests cannot choose a weaker profile or disable enforcement.

## 4. Scope, authority and L6a identity

### 4.1 Scope isolation

Every record, chain, aggregate, predicate, index, receipt, journal stream and relationship is bounded by:

```text
moduleId / tenantId / workspaceId
```

Compound keys use structured, unambiguous encoding.

The trusted composition root provisions module-specific handles. A request cannot obtain another module’s handle by supplying a string.

```ts
interface StorageScope {
  readonly tenantId: string;
  readonly workspaceId: string;
}

type StorageModuleId = "comments" | "engram-live";
type StorageOperation = "read" | "write" | "publish" | "maintain";

type GrantLifetime =
  | { readonly kind: "invocation"; readonly invocationId: string }
  | { readonly kind: "lease"; readonly expiresAt: string };

interface ScopeGrant<A> {
  readonly token: string;
  readonly moduleId: StorageModuleId;
  readonly scope: StorageScope;
  readonly principalId: string;
  readonly operations: readonly StorageOperation[];
  readonly issuer: string;
  readonly authorityRevision: string;
  readonly policyRevision: string;
  readonly moduleAuthority: A;
  readonly lifetime: GrantLifetime;
}
```

These are proposed interfaces. Runtime validation, not a TypeScript brand or caller-created object, establishes authenticity.

An invocation grant ends with its verified invocation context. A leased grant expires independently of any domain cursor. Neither automatically renews.

### 4.2 Host scope derivation

| Mode | Required derivation |
|---|---|
| Local host | Verified local principal, host-issued tenant and stable host-issued workspace |
| Sentropic product | Authoritative tenant resolution, current membership, verified workspace and applicable resource authority |
| Independent application | Injected application authority identifying issuer, scope and authority revision |
| Live | The preceding authority plus the current L6a declaration and applicable binding |

Comments needs no live declaration or declaration set.

Scope is not inferred from a `ws:` fingerprint, path, remote URL, missing field or equality/inequality of identifier strings. Authoritative scope is established before canonical hashing.

### 4.3 Operations and revalidation

Operations do not imply one another.

| Action | Kernel operation |
|---|---|
| Reads, boundary acquisition, replay and checkpoint inspection | `read` |
| Ordinary commands, fragment staging and coherent-unit commit | `write` |
| Live generation publication | `publish` |
| Physical purge, maintenance and checkpoint advancement | `maintain` |

A comments import commit does not acquire live-publication authority merely because it has an atomic visibility point.

Revalidation occurs:

- At bind.
- Before opening a reader and before returning each page.
- After queue/lock waits, immediately before mutation commit.
- Before live publication.
- At each purge step and before an external disposal effect.
- On every new retry attempt.

Expired, revoked or closed authority returns denial. Releasing an existing resource may remain possible when it reveals no data and creates no work.

For revocation-race claims, authority updates and commits must be ordered by a qualified host fence, transaction or critical section. Checking authority before waiting is insufficient.

### 4.4 Comments authority composition

The two authority layers have different responsibilities:

- `ScopeAuthorityPort`: module, tenant/workspace, invocation and storage-operation authority.
- Frozen `CapabilityCheckPort`, `ResourceResolverPort` and `DecisionResolutionPort`: comments capabilities, every resource target, exact decision binding and resource revocation.

Both derive from the same verified request or service context. A scope grant does not grant review, tombstone, purge or AI-submission authority.

Comments services repeat relevant domain checks at their final commit/page boundary. Background calls use the same services and explicit service authority.

### 4.5 Merged L6a remains unchanged

The live leaf consumes:

```text
@sentropic/engram-live/contracts
@sentropic/engram-live/integration
```

The integration surface exports:

- `deriveCloneIdentity`
- `deriveWorktreeIdentity`
- `deriveDeclarationIdentity`

There is no declared engram `/registration` package leaf.

Preserve:

- The exact `declarationId`, `cloneId`, `worktreeId` triangle.
- Declaration revision 1 at activation and increments of exactly one.
- The complete optional product triplet: `serverWorkspaceId`, `serverIssuer`, `bindingRevision`.
- First binding revision 1 and strictly increasing rebind/revalidation revisions.
- `missing_history` and `shallow_history`.
- Explicit live activation, separate from bind, upload, workspace creation and session lifecycle.
- Single-declaration revocation, private disposal and retained committed history.
- Host-local identity inputs remaining local.

DTO syntax validation is not identity derivation or authorization.

S-L6a’s mirrored implementation does not become a competing identity authority. Its compatibility must be checked against the merged neutral contract. The existing cluster-mesh registration leaf introduced by PR #664 is not silently removed or renamed by this specification.

### 4.6 Optional declaration sets

A host may group declarations under a stable set ID and separate `setRevision`. This grouping is outside L6a and is not mandatory for storage.

Membership changes, revision changes or revocation advance the set revision. Every targeted operation still checks the exact declaration triangle and revision.

Revoking one declaration invalidates affected work without revoking siblings. Other members may obtain fresh grants. Rebinding never redirects an existing generation or transfer to another destination.

## 5. Records, transactions and idempotency

### 5.1 Canonical representation

Storage separates:

1. Immutable canonical identity and permitted retained metadata.
2. Purgeable payload segments.
3. Derived indexes/projections.
4. Infrastructure state and receipts.

Codecs preserve canonical UTF-8 bytes, null/absence, source time, original registration values and domain discriminators. JSONB, timestamp conversion or projection reconstruction cannot become the canonical serialization algorithm.

Physical record keys identify individual revisions/events, not only their stable aggregate.

Fingerprint policy belongs to the payload class:

- Comments retains hashes required by its contract, without an anonymity claim.
- Private live content uses disposable keyed fingerprints or no retained content fingerprint.
- Private low-entropy content must not leave unkeyed confirmation digests in roots, receipts, staging, caches or logs.
- Temporary verification checksums need not be persisted.

Retained metadata is classified and schema-validated. It cannot hide bodies, reasons, evidence or private fingerprints.

### 5.2 Atomic units

An ordinary atomic unit affects one module and scope. Within its configured bounds it may include multiple aggregates.

It commits together:

- Canonical inserts and chain appends.
- Aggregate/head/allocation changes.
- Command-index writes.
- Registered relationships and projections.
- Explicit operational barriers and authorized purge intents.
- Receipts and required journal changes.

Failure of any guard, codec, authorization, projection or required journal operation rolls back the whole unit.

```ts
type ChainExpectation =
  | { readonly kind: "absent"; readonly allocation: number }
  | { readonly kind: "head"; readonly hash: string };

interface AtomicUnit {
  readonly guards: readonly RegisteredGuard[];
  readonly records: readonly RecordWrite[];
  readonly appends: readonly ChainAppend[];
  readonly updates: readonly AggregateUpdate[];
  readonly relationships: readonly RelationshipChange[];
  readonly barriers: readonly BarrierWrite[];
  readonly purgeIntents: readonly AuthorizedPurgeIntent[];
  readonly indexWrites: readonly IndexWrite[];
  readonly moduleResult?: EncodedValue;
}

interface AtomicPort {
  commit(input: {
    readonly unit: AtomicUnit;
    readonly options: CommitOptions;
  }): Promise<CommitReceipt>;

  transact<T>(
    options: CommitOptions,
    operation: (transaction: ModuleTransaction) => Promise<T>,
  ): Promise<{ readonly value: T; readonly receipt: CommitReceipt }>;
}

interface ModuleTransaction {
  readAggregate(key: AggregateKey): Promise<AggregateRead | null>;
  readRecords(keys: readonly RecordKey[], limits: PageLimits):
    Promise<readonly RecordRead[]>;
  readChain(input: ChainReadRequest): Promise<RecordPage>;
  findIdempotency(selector: IdempotencySelector):
    Promise<IdempotencyEntry | null>;
  apply(unit: AtomicUnit): Promise<void>;
}
```

The referenced records and guards are descriptor-registered types. No top-level `apply()` exists outside a transaction.

Multiple `apply()` calls form one bounded transaction with one optional commit-idempotency identity. They do not select receipt identity by call order.

### 5.3 CAS and allocation

Creation allocation is independent for each typed chain and initially zero. Creating annotation content does not allocate its review or lifecycle chain.

Raw chain appends check expected state before duplicate recognition. A stale expected head remains a CAS conflict.

Guards cover exact heads, allocation expectations, aggregate versions and registered predicate dependencies. Serializability includes absence and collection reads, not only rows found.

Disposed identities retain enough permitted allocation/lifecycle state to prevent recreation under an old creation expectation.

### 5.4 Distinct replay rules

| Operation | Required behavior |
|---|---|
| Immutable insert | Identical canonical representation is a no-op; conflicting representation under the same identity conflicts |
| Raw append | CAS first; repeated bytes do not erase a stale-head conflict |
| Comments genesis | Same canonical hash returns the stored record and original values; different hash conflicts |
| Comments command index | Scope/key lookup; equal digest permits result replacement; different digest conflicts |
| Live batch/publication identity | Immutable receipt/result binding |
| Recovery after disposal | Recover permitted status/receipt information; never reconstruct disposed payload |

Comments command lookup does not require a requested digest or operation discriminator. Its stored value remains `{ digest, resultIds, resultHash }`, including nullable result hash.

Ordinary raw appends receive no synthetic command key.

Minimal deduplication or retired-operation state survives delivery pruning. Pruning cannot reopen an old operation for execution.

### 5.5 Frozen comments transaction callback

The adapter implements:

```text
transaction().run(() => ...)
```

without changing the callback signature.

A request/service-local asynchronous context provides:

- Immediate CAS checks against read state plus pending writes.
- Read-your-writes.
- Predicate dependency tracking.
- Commit-time revalidation.
- Complete rollback.
- Isolation between concurrent contexts.
- Rejection of detached work using a closed context.
- Nested calls joining the transaction; nested failure makes it rollback-only.

Immediate and commit-time CAS failures map to `CanonicalCommandError("cas-conflict")`.

The callback result is returned only after commit. Automatic infrastructure retries operate on an immutable flush plan, never by rerunning arbitrary user callbacks.

The M1 memory fixture does not prove rollback or concurrency.

A standalone `recordCommittedCommand` remains valid. Production command services wrap append and index recording in one `run`. A raw append followed by a separate index write is not represented as one transaction.

## 6. Descriptor and backend extension contract

### 6.1 Registered descriptor

Each module descriptor declares:

- Contract version/digest and supported schema versions.
- Required and optional profiles.
- Record codecs, identity rules and payload classes.
- Aggregate/chain kinds and allocation rules.
- Idempotency-index policies.
- Relationship and barrier-coverage rules.
- Named typed queries and allowed boundaries.
- Unit and staged-unit validation.
- Effective-change notification derivation.
- Optional lifecycle/disposal finalization.
- Immutable migration assets.

The kernel treats these as trusted installed code. Requests cannot supply descriptors, SQL or weaker index policies.

### 6.2 Projection SPI

Projection deltas identify their cause:

```ts
type ProjectionCause =
  | "atomic"
  | "stage"
  | "staged-publication"
  | "generation-publication"
  | "purge";
```

They include the effective inserted/appended records, aggregate changes, relationships, barriers, membership changes and disposals, plus applicable generation or staged-unit identity.

Projection hooks execute transactionally with the corresponding canonical changes. Hidden-stage projections remain hidden. Publication and disposal update their visibility consistently.

No extension may independently commit, alter session settings or mutate kernel heads/indexes through private SQL.

### 6.3 Reachable typed queries

A provisioned storage handle exposes registered queries and only the capabilities its profiles provide.

```ts
interface ModuleStorageHandle<M, Q, A> {
  readonly moduleId: M;
  bind(grant: ScopeGrant<A>): Promise<ScopedModuleStorage<M, Q>>;
}

interface ScopedModuleStorage<M, Q> {
  readonly moduleId: M;
  readonly scope: StorageScope;
  readonly storeIncarnation: string;
  readonly profiles: readonly ProfileClaim[];
  readonly atomic: AtomicPort;
  readonly queries: Q;

  capability<P extends ProfileId>(profile: P): ProfilePort<P>;
}
```

`capability()` rejects unsupported profiles. Acquiring a capability does not grant permission to use it.

The reader SPI receives a resolved boundary containing scope, incarnation, immutable root or generation vector, chain heads and journal boundary. Membership access supports bounded iteration and indexed backend joins. It does not require loading an entire generation into JavaScript.

### 6.4 Effective changes and notifications

Notification derivation consumes **effective domain changes after duplicate classification**, aggregated across all applies in the transaction.

- Identical genesis or immutable-record replay emits no new logical creation event.
- Recovery returns existing receipt/event identities.
- Equal-digest command-result replacement is an index change, not automatically a new domain event.
- Multiple appends have deterministic transaction ordering.
- A staged group exposes its notifications only at group publication.
- A purge event reflects actual progress, not a submitted claim.

The kernel assigns event identity, cursor order and commit metadata. Module drafts do not allocate cursors.

### 6.5 Isolation claim

The initial Postgres implementation enforces supported access through provisioned handles, full-scope constraints, registered SQL and conformance tests.

It is not a database sandbox against malicious installed extensions or a privileged injected driver. Optional per-module roles or RLS may strengthen deployment isolation and require their own qualification.

SQLite additionally separates module files.

## 7. Staged coherent units and groups

### 7.1 Purpose

`staged-units-v1` supports a logically indivisible unit whose complete representable history exceeds a normal transaction buffer or HTTP request.

It is distinct from live view generation publication.

A unit or interdependent group can contain:

- Canonical records and chain appends.
- Head and allocation changes.
- Aggregate and relationship changes.
- Import bindings and command-index results.
- Canonical unit receipts and batch-progress effects.
- Audit records, operational barriers and journal changes.

No adapter-owned projection table may bypass kernel semantics to implement this protocol.

### 7.2 Proposed protocol

```ts
interface StagedUnitPort {
  begin(input: {
    readonly operationKey: string;
    readonly inputDigest: string;
    readonly contractDigest: string;
    readonly sourceBoundary: EncodedValue;
    readonly fence: WriterFence;
  }): Promise<StagedUnitHandle>;

  stageFragment(input: {
    readonly unit: StagedUnitHandle;
    readonly ordinal: DecimalCounter;
    readonly predecessorHash: string | null;
    readonly fragmentDigest: string;
    readonly effects: AtomicUnit;
    readonly fence: WriterFence;
  }): Promise<FragmentReceipt>;

  sealStep(input: {
    readonly unit: StagedUnitHandle;
    readonly root: StagedCommitRoot;
    readonly limits: WorkLimits;
    readonly fence: WriterFence;
  }): Promise<
    | { readonly state: "validating"; readonly progress: ValidationProgress }
    | { readonly state: "sealed"; readonly seal: StagedUnitSeal }
  >;

  commitStaged(input: {
    readonly seal: StagedUnitSeal;
    readonly fence: WriterFence;
  }): Promise<CommitReceipt>;

  inspect(operationKey: string): Promise<StagedUnitStatus>;

  abort(input: {
    readonly unit: StagedUnitHandle;
    readonly fence: WriterFence;
  }): Promise<void>;
}
```

All handles and seals are kernel-issued, scope-bound capabilities.

The bounded commit root binds operation identity, contract, source boundary, final fragment hash, exact fragment count and dependency/effect roots. It contains no history-sized list.

### 7.3 Fragment invariants

Fragments use an explicitly versioned, domain-separated canonical encoding. The first ordinal is zero and its predecessor is null; subsequent ordinals increase by one.

Each fragment binds:

```text
module + scope + operation/unit/group identity
contract version + source boundary
ordinal + predecessor hash + canonical effect digest
```

The kernel independently verifies the encoding and digest.

- The next ordinal is accepted.
- An identical retry returns the same fragment receipt.
- Changed bytes at an accepted ordinal conflict.
- Gaps or reordering cannot advance the accepted frontier.
- Truncated chains, wrong counts, roots or dependencies cannot seal.
- Infrastructure staging receipts are never canonical successful unit receipts.

Input and stored buffers cannot be mutated after acceptance.

### 7.4 Hidden state

Until commit, all staged effects are invisible to:

- Direct record and head lookup.
- Chain reads.
- Resource queries and scope enumeration.
- Command-result lookup.
- Canonical receipt recovery.
- Audit readers and dispatchers.

A reader cannot expose staged bytes by knowing a record ID.

Staging progress is visible only through authorized operation-status APIs and is labelled as staging.

### 7.5 Bounded atomic publication strategy

The common implementation uses a persistent, indexed **scope visibility root** for modules selecting staged units.

The root identifies immutable versions of the maps needed to resolve:

- Canonical membership.
- Chain heads and allocations.
- Aggregate state.
- Command indexes and import bindings.
- Query projections and registered relationships.
- Canonical receipt/audit membership.
- A sealed segment of effective journal changes.

Preparation builds successor structures incrementally through bounded transactions. Structural sharing avoids copying unchanged scope state.

Validation checks guards and dependency closure against the captured base root in bounded steps. Entering sealing freezes fragment input.

Final publication:

1. Acquires the scope publication/allocation gate.
2. Revalidates grant, module authority, fence and relevant policy revisions.
3. Compares the current scope root/version with the sealed base.
4. Switches the root and commits the operation receipt and journal-segment visibility in one transaction.

This is the linearization point.

Every canonical mutation of that module/scope participates in the same root/version discipline. Otherwise the base comparison would be unsound.

For comments/Postgres, the root/version discipline is active from C1a, including ordinary commands and C2 lifecycle changes. C1a and C2 depend on K4/P2u. Later C4 activation therefore does not introduce a visibility root into a previously rootless comments scope.

A changed base produces a conflict without publication. A new bounded validation/rebase pass may merge unrelated changes; a changed guarded head remains a CAS conflict. The caller cannot substitute a fresher base into an existing seal.

Journal segments may receive a committed sequence interval at publication. Their immutable entries use that interval and stored ordinals; publication cannot loop over the entire segment merely to assign cursors.

The final operation is bounded by control metadata, lock/transaction budgets and indexed root operations—not total historical records or touched-chain count. This rejects the narrower proposal to solve the problem by introducing another whole-unit chain-count ceiling.

Performance, storage amplification, conflict frequency and fairness of this strategy are `unverified`. They are explicit qualification obligations.

### 7.6 Limits, recovery and cleanup

Normal atomic limits still bound each fragment and preparation step. They do not become a maximum logical-unit history size.

No revision-count, comment-count or fragment-count limit is introduced as a substitute for the required protocol. Representability, exact counter range, configured storage quota and explicit operational contention remain distinct constraints.

A whole record must fit its declared transport representation. Rejecting an individually unrepresentable record does not authorize truncation or disposal.

Recovery behavior:

| Window | Required result |
|---|---|
| Before fragment durability | Retry identical fragment |
| After fragment durability, before response | Recover identical fragment receipt |
| During validation | Resume persisted validation state |
| Before final commit | No canonical subset visible |
| Commit before response | Recover the same committed receipt |
| Abort/abandonment | Fenced cleanup of unreferenced staged state |

Cleanup never deletes a fragment/root referenced by a committed unit, retained snapshot or another live operation.

States are:

```text
staging → sealing → sealed → committed
staging → aborted
sealing → aborted
sealed  → aborted
```

Scheduling must measure the effect of staging and publication on interactive commands. No unbounded transaction or scope-lock hold is permitted.

## 8. Read boundaries and continuation

### 8.1 Three separate lifetimes

Do not conflate:

1. **Authority lifetime:** whether the caller may act now.
2. **Continuation identity:** the exact selection and immutable boundary being traversed.
3. **Physical retention/pin lifetime:** whether the underlying bytes remain available.

Renewing authority cannot silently change a continuation boundary.

### 8.2 Immutable comments boundaries

`immutable-boundaries-v1` supports:

- One typed chain at an exact head hash, sequence and allocation.
- A retained immutable scope root.
- A selected set of heads represented by a bounded root commitment.

Comments continuations have **no clock-only expiry**.

A chain cursor binds module, full scope, store incarnation, selection, exact head, ordering, position and cursor format version. It is integrity-protected. A server-side retained recipe may replace an oversized self-contained boundary.

Ordinary chain paging creates no per-reader lease and requires no `open` or `close` call. A thousand-page traversal must not leave a thousand pins or one abandoned lease per first page.

Current authority and operational availability are rechecked on every page. No-expiry does not promise indefinite retention or access.

A genuinely unavailable root, disposed required payload or changed incarnation produces an explicit unavailable/incomplete result. It never redirects to the latest head.

### 8.3 Leased boundaries

`leased-snapshots-v1` is available for mutable projections and live generation vectors.

It supplies explicit acquisition, release, expiry and resync behavior. Tokens bind query version, normalized parameters, order, selected generations/root and incarnation.

Where a module permits reopening a retained immutable root, expiration of an internal lease does not by itself invalidate the module’s no-expiry continuation.

Long-lived database transactions across arbitrary client pagination are not the default strategy.

### 8.4 Availability and page bounds

All pages obey count and full encoded-byte limits.

For frozen comments `readChainPage`:

- `limit` retains its existing shape.
- The adapter obtains `pageEncodedBytes` from the injected frozen capacity descriptor.
- Whole records are returned.
- An indivisible record that cannot fit produces `incomplete`.
- Actual denial, including content covered by an operational barrier or physically disposed content, produces `inaccessible`.
- Successful exhaustion alone ends an ordinary traversal.

An `incomplete` or `inaccessible` result stops normal traversal; its non-null continuation, when present, identifies a recovery position rather than promising an automatically advancing next page. The implementation must not create a successful empty-page loop.

Whole-chain getters retain complete-array semantics for accessible content. Internally paging does not make the final array bounded. Large product exports use the bounded C4 surfaces instead.

After physical disposal, no getter fabricates a complete record, blanks body fields, returns a shortened complete chain or uses `null` to disguise a retained identity.

For barrier-covered or physically disposed content, M1 full getters throw `CanonicalCommandError('denied')`; `readChainPage` returns `inaccessible`. This includes tombstoned content before physical purge.

## 9. Frozen comments M1 accommodation

### 9.1 Persistence and operational services

**The `CanonicalCommandStore` remains a persistence port.** Its low-level append operation is not an authorization decision, a purge executor or proof that an external side effect occurred.

Consequently:

- `appendLifecycleEvent` continues to accept valid lifecycle records, including `purge-outcome`, under its existing persistence/CAS contract.
- A standalone tombstone record remains persistable.
- The unchanged frozen corpus can persist its synthetic lifecycle history and read its retained bytes.
- No `contract-v2` lifecycle amendment is required to use the common kernel.
- The frozen lifecycle reducer remains unchanged.

Production command orchestration belongs to the reusable comments service. HTTP and background application paths use that service. A raw persistence handle is not exposed as an application bypass.

The operational service creates barriers and authorized jobs in the same transaction as its effective domain command. It checks capabilities, resource access, lifecycle state and disposal evidence. Historical import is separately authorized and cannot turn a recorded historical outcome into evidence of current physical disposal.

These are separate interfaces and purposes, not a request-selectable enforcement switch.

### 9.2 Complete 24-method mapping

| # | Frozen method | Required implementation |
|---:|---|---|
| 1 | `transaction` | Existing handle and zero-argument callback; immediate CAS, overlay, rollback and commit revalidation |
| 2 | `appendAnnotationRevision` | Annotation-content chain |
| 3 | `appendThreadStructureRevision` | Thread structural chain and exact structural references |
| 4 | `appendCommentRevision` | Independent comment-content chain |
| 5 | `appendReviewEvent` | Independent annotation review chain; exact reviewed revision preserved |
| 6 | `appendLifecycleEvent` | Lifecycle-chain persistence; no universal adapter-only outcome restriction |
| 7 | `appendOperationAuditEvent` | Independent typed-subject audit chain |
| 8 | `appendPreparedSubmissionManifest` | Scoped idempotent genesis |
| 9 | `appendImportManifest` | Scoped idempotent genesis |
| 10 | `appendUnitReceipt` | Scoped idempotent genesis preserving stored manifest and issuance values |
| 11 | `appendBatchReceiptSnapshot` | CAS-only chain; sequence metadata stays outside its frozen DTO |
| 12 | `appendConversionReport` | CAS-only chain; no invented hashed predecessor field |
| 13 | `getAnnotationHead` | Complete accessible head; null means absent |
| 14 | `getAnnotationChain` | Complete ordered content history |
| 15 | `getThreadStructureHead` | Complete accessible structural head |
| 16 | `getThreadStructureChain` | Complete ordered structural history |
| 17 | `getReviewChain` | Complete independent review history |
| 18 | `getLifecycleChain` | Complete accessible lifecycle history |
| 19 | `getOperationAuditChain` | Complete typed audit history |
| 20 | `getCommentHead` | Complete accessible comment head |
| 21 | `getCommentChain` | Complete ordered comment history |
| 22 | `readChainPage` | Eleven selections, existing outcomes and no mandatory TTL |
| 23 | `findCommittedCommand` | Scope/key lookup without requested digest or operation |
| 24 | `recordCommittedCommand` | Equal-digest replacement; different-digest conflict; standalone calls remain valid |

For every M1 `get*Head` and `get*Chain` method, content covered by an operational barrier, whether tombstoned but unpurged or physically purged, throws `CanonicalCommandError('denied')`, using the frozen error code. `null` means absence only. `readChainPage` returns `inaccessible` for that content. A policy-controlled non-enumerating not-found response is permitted only at the service boundary. A raw tombstone append alone creates no operational barrier, so the unchanged frozen corpus remains unaffected.

### 9.3 Eleven kinds

| Family | Kinds | Storage rule |
|---|---|---|
| Linked chains | Annotation revision, thread-structure revision, comment revision, review event, lifecycle event, operation-audit event | Exact sequence/predecessor, independent typed-chain CAS |
| Genesis | Prepared-submission manifest, import manifest, unit receipt | Same-hash stored-value replay |
| CAS-only chains | Batch-receipt snapshot, conversion report | Expected hash establishes position; no added canonical link fields |

Review history remains attached to the exact reviewed annotation revision, including older revisions. Discussion resolution does not imply review approval.

### 9.4 Single-store router bridge

The frozen factory remains:

```text
CanonicalRouterFactory(ports: CanonicalHttpPorts,
                       options: CanonicalRouterOptions)
```

`ports.store` remains one `CanonicalCommandStore`.

The module composer captures storage, clocks, IDs and internal services. Namespace middleware verifies the invocation and enters an asynchronous request context containing its grant.

The store façade:

1. Requires a verified request/service context.
2. Requires the method’s scope to equal the grant scope.
3. Acquires/caches the bound module handle only for that context.
4. Enforces operation checks and transaction-context isolation.
5. Fails closed after context completion.

Explicit service binding is provided for jobs and imports. It is a module-side facility, not another argument added to M1 store methods.

Concurrent requests must not share grants, transaction state or principals.

Delivery in M2 of the surface declared `status: 'due-m3'` does not change the frozen type. M2-W proves in `comments-router.spec.ts` that no route reaches `appendLifecycleEvent` without the operational service and that forged raw tombstone or `purge-outcome` submissions through HTTP are refused without effects.

### 9.5 Comments queries and projections

The descriptor includes at least:

| Query | Purpose | Boundary |
|---|---|---|
| `by-resource` | Discussions and annotations by complete resource tuple, including primary and secondary targets | Retained scope root; optional qualified leased snapshot |
| `scope-chain-index` | Bounded enumeration of typed chain keys and heads for resync/export | Immutable scope root |
| `retained-headers` | Authorized identity/link/review/audit inspection without claiming full payload availability | Exact head/root plus current availability |

Resource projections use full tenant/workspace/namespace/kind/ID identity. Bare resource IDs are insufficient.

Postgres and SQLite require corresponding registered projection assets. Resync must use these queries rather than unrestricted SQL or a full in-memory scope scan.

Retained-header results are module query DTOs. They are never substituted for frozen full-record DTOs.

### 9.6 Current CA deltas

The frozen baseline and newer CA proposals must remain separately identified.

| CA proposal | v4 treatment |
|---|---|
| Replace `specDigest` with `specVersion`/`specSource` | Not applied to M1. Preserve existing fields and hashes. Supplemental specification metadata may live outside the canonical record. A future representation change needs separate comments contract evolution. |
| CommonMark 0.31.2 and mention interpretation | Qualify a parser/codec profile using existing M1 representation where possible. No parser qualification is established here. |
| Five new count fields and `paging` in `CapacityDescriptor` | Do not mutate the frozen descriptor. Declare module transport/admission settings separately. |
| Fragment/root/prepare and terminal-export protocol | Add a separately versioned cluster-mesh comments capability preserving canonical record kinds and frozen batch DTOs. |
| Export continuation absent from request DTO | Declare an explicit continuation operation/envelope; do not overload `exportId`, idempotency or `snapshotBoundary`. |
| Public `@sentropic/comments/conformance` | Not an existing export. Installed proof uses a packaged, digest-pinned oracle artifact. Any new comments-package export follows its change protocol separately. |
| New operational wire errors | Preserve the frozen vocabulary; transport failures use the transport boundary. |
| M1 described as still being authored | Superseded by the owner-closed freeze receipt. |

The original four reserves remain recorded: operational capacity values, CommonMark qualification, seven additional bound qualifications and thread-history sizing. They do not reopen M1.

## 10. Comments operational lifecycle and dependent visibility

### 10.1 Tombstone and purge are separate capabilities

A successful operational tombstone command atomically commits:

- Its canonical lifecycle record.
- One immediate barrier at the declared deletion boundary.
- Required projection/audit/command-result changes.
- Effective journal changes.
- A canonical purge intent and kernel job **only when effective policy requires that intent and purge authority is granted**.

Without configured purge or purge authority, tombstone succeeds without inventing a purge intention.

A later independently authorized purge intent creates/links a deterministic job. The policy/coherence rule applies to the operational service transaction, not every raw persistence append.

If policy requires an authorized intent in that transaction and it is omitted, the service transaction fails atomically.

### 10.2 Coverage relationships

A parent tombstone must not require enumerating every descendant in the final transaction.

Descriptors register typed coverage relationships, including:

- Comment payload covered by its thread.
- Thread structural payload covered by its thread.
- Annotation payload and its owned derivatives covered by its annotation.
- Additional dependent payload coverage explicitly selected by comments semantics.

The backend maintains an indexed relationship representation. A parent barrier applies through that representation to current and pinned reads. Covered M1 full getters throw `CanonicalCommandError('denied')`, including before physical purge; `readChainPage` returns `inaccessible`. The same outcomes apply after disposal.

Containment, association and reference are distinct. An annotation pin or secondary-resource link does not automatically authorize deletion of the referencing discussion or shared blob.

The corpus must include a thread with more comments than the normal atomic aggregate limit. One thread barrier must deny ordinary access to every covered comment immediately after commit.

Adding/reparenting covered records rechecks parent state and cannot escape an existing barrier. Historical roots cannot bypass current barriers.

### 10.3 Service-owned disposal completion

The purge worker—not the raw store contract—owns operational completion.

Before generating a current operational `purge-outcome`, it verifies all required dispositions under current policy/hold authority. A user-supplied completion claim is not sufficient.

The outcome is created with frozen constructors and persisted through the same M1 append operation. Its actor is the verified principal responsible for final maintenance execution; reason is null or a registered non-personal code. Actual initiating/service provenance remains accurately recorded in permitted audit metadata.

A completion identity prevents duplicate outcomes. Final local disposal/progress, lifecycle append and notification commit atomically.

A valid historical lifecycle record remains persistable under authorized historical import. It does not satisfy a current purge job.

### 10.4 Disposal progress

Progress distinguishes:

```text
pending / held / complete / failed
```

Per payload class it distinguishes:

```text
pending
erased
cryptographically-erased
reference-released
held
pending-external
failed
```

A held, pending or failed obligation does not become a completed operational purge outcome.

Disposal covers affected canonical segments, reasons/evidence, captures, staging, derivatives, caches and decryptability. Shared objects use reference accounting; releasing one reference is not proof of physical destruction.

External disposal uses a durable intent, stable operation identity, idempotent execution and evidence reconciliation. No distributed database/blob transaction is claimed.

Review/link/audit information survives only to the extent permitted by the retention policy. A retained digest proves neither availability nor recomputability of erased bytes.

## 11. Comments C4: import, export and receipts

### 11.1 Ownership and contract boundary

**C4 belongs to the comments team.** It implements comments semantics over `staged-units-v1`; it does not implement another storage engine.

C4 owns:

- Prepared fragments and coherent unit/group roots.
- Import bindings and expected mapping versions.
- Batch/unit receipt semantics and recovery.
- Frozen-boundary export and continuation.
- Linked correction/source evolution.
- Copy/move orchestration and conversion arithmetic.

Canonical M1 record kinds and wire DTOs remain unchanged.

### 11.2 Module extension

A separately versioned module capability provides operations equivalent to:

```text
prepareImportFragment(fragment)
inspectPreparedImport(operation)
commitPreparedImport(frozenImportRequest, preparedRootReference)
prepareExportBoundary(selection)
continueExport(frozenExportRequest, continuation, pageOptions)
readExportFragments(exportReference, continuation, pageOptions)
recoverBatchReceipts(batchIdentity)
```

These are proposed module operations, not additions to `CanonicalCommandStore`.

The frozen import request remains the logical manifest/unit request. Prepared data is joined to it through verified manifest, unit and payload identities.

Ordinary export continuations can return the frozen export response. Fragment pages use their own declared envelope; fragment objects are never inserted into `CanonicalChainRecord[]`.

The original export request is not interpreted as “advance to the next page” merely because it is replayed.

### 11.3 Transport limits

The current CA values are adopted as the proposed comments module transport profile, with qualification `unverified`.

| Limit | Value |
|---|---:|
| Fragment manifest or unit/group root | 64 KiB canonical bytes |
| Fragment payload | 512 KiB canonical bytes |
| Prepare/commit items per request | 50 |
| Request batch manifest | 256 KiB canonical bytes |
| Complete encoded request | 1 MiB |
| Default page count | 50 |
| Maximum page count | 100 |
| Complete encoded page | 1 MiB |
| Time-based comments cursor TTL | None |

Whole histories have no fragment-sized ceiling. A record plus required framing must fit an individual fragment.

Ordinary pages count canonical records; fragment pages count complete fragment envelopes. Both count the full response envelope and cursor toward byte limits.

The five newer count settings are module admission settings: 64 segments/body, 64 mentions/body, profile depth 8, 32 targets/annotation and 128 shapes/annotation. Their declaration does not add fields to frozen M1.

Existing M1 body/segment/profile bounds remain host-injected; CA’s proposed values are 64 KiB, 16 KiB and 16 KiB respectively. Transport qualification must include escaping and multibyte encoding.

A smaller deployment limit must be advertised as incompatibility with this profile, not silently redefine it.

### 11.4 Coherent import

One logical unit includes its mandatory representable history and relationships. Interdependent groups publish together.

C4:

1. Freezes and validates the admissible manifest and mapping version.
2. Resolves scope and domain authorization before hashing.
3. Stages bounded hash-chained fragments.
4. Validates dependencies, hashes, source binding and expected heads.
5. Seals receipts, audit, mappings and effective changes with the unit.
6. Commits through the kernel’s single visibility point.
7. Reports success only from the committed canonical receipt.

When the imported lifecycle state is tombstoned, C4b writes its current operational visibility barrier in the same published unit/group as the imported canonical state. Imported payload must never become ordinarily readable between publication and barrier application. A historical purge outcome does not establish current physical disposal.

Batch partial success is allowed only between committed units/groups.

Identical replay recovers stored IDs, hashes, original registration values and receipts. Changed input conflicts. Correction or changed source/mapping creates a linked operation, never silent replacement.

Import privilege does not manufacture review authority.

### 11.5 Export boundary

The exported `boundaryDigest` commits to a versioned canonical manifest containing:

- Full scope.
- Normalized exact selections.
- Corresponding chain/genesis heads and ordering.
- Applicable committed unit/group roots.
- Descriptor/encoding version.

`frozenAt` is informational; it grants no authority and is not a substitute for the manifest.

A server-established retained manifest/root binds the digest to real storage. On initial use, the service may compare a submitted digest to a consistently captured current boundary and register that exact boundary. An arbitrary digest with no verifiable corresponding boundary cannot open a snapshot.

Continuation reopens the same retained boundary under fresh authorization. Missing boundary evidence yields explicit incomplete/unavailable behavior, never a fresh current snapshot.

A terminal fragment binds exact count and chain/root completion. Intermediate pages are not complete-unit exports.

### 11.6 Receipts and transfer

Keep distinct:

- Durable fragment acknowledgement.
- Kernel commit receipt.
- Canonical unit receipt.
- Immutable batch-receipt snapshot.
- Conversion report.
- Destination transfer receipt.

A move verifies the durable destination receipt before source tombstoning. Failed source retirement remains an incomplete recoverable move.

Byte-identical same-scope content preserves its canonical representation. Cross-scope or transformed content receives destination-scoped identities/hashes and authorized derivation links. Active validation authority is not copied.

Conversion reconciles disjoint source-unit counts:

```text
frozen source units
  = converted source units
  + authorized disposition units
  + count-only excluded source units
```

Output records and transport fragments are not source-unit counts. Excluded rows do not acquire per-row canonical identity, payload digest or receipt through this tooling.

Unitary AI preparation remains a comments service capability using exact frozen references. It invokes no provider.

## 12. Live adapter and generations

### 12.1 Views

Live defines:

- A committed view per canonical clone within scope.
- A private view per canonical clone/worktree within scope.

An authorizing declaration accompanies committed work. Sharing a clone does not make worktree declarations interchangeable.

Multi-repository reads pin a generation vector and report each source/coverage boundary. This does not imply simultaneous external observation.

### 12.2 Generation protocol

The kernel issues generation identities. `begin` captures both current generation and pointer version. The base cannot be refreshed by the caller.

The protocol provides:

```text
begin → stage → sealStep → publish
                     ↘ abort
```

Allowed states:

```text
staging → sealing → sealed → published → superseded
staging/sealing/sealed → aborted
```

Stage writes records, generation membership and projections atomically. Sealing freezes input and validates through bounded steps. Publication atomically changes pointer, metadata, projections, receipt and journal visibility.

Required race:

1. Historical work begins at G0.
2. Hot work begins at G0 and publishes G1.
3. Historical publication against G0 fails.
4. A new validation/rebase preserves G1’s newer observations.

Hot and historical scheduling must prevent repeated displacement of admitted hot work while providing aged/weighted historical progress. Precise fairness and occupancy limits require measurement.

Logical content roots are independent of batch arrival order. Private roots obey disposable-fingerprint policy.

### 12.3 Neutral evolution

L3a-E owns versioned typed facts, batch canonical encoding, capture/source boundaries, coverage and neutral completion messages.

It does not reopen L6a identity.

Producer generation IDs remain correlation identities, mapped durably to kernel-issued generations. A producer-supplied string is not a storage capability.

`deliver` acknowledges complete durable batch receipt. A final batch receipt does not imply publication.

The live emitted-batch limit remains 4 MiB. Hidden staging may accommodate storage overhead but cannot acknowledge a prefix.

Retain algorithm-qualified OIDs, ordered parents, ref-observation identity and complete relationship endpoints/roles/versions. Committed history remains uncapped.

### 12.4 Committed-only remote publication

Remote publication transfers an authorized committed projection, not SQLite files or replication pages.

Exclude private index/working-tree text and derivatives, including private hunks, symbols, fingerprints and snapshots. Email handling remains Q6 A: omission or tenant pseudonymization.

A durable transfer binds source publication/declaration, destination issuer/scope/binding revision, policy and contract version.

The destination independently authenticates, validates, stages, seals and publishes. The source completes only after verifying destination publication receipt.

Rebind invalidates pending work; it never redirects it. Revocation stops publication. Unknown destination incarnation/availability requires reconciliation.

No distributed transaction or exactly-once network guarantee is claimed.

## 13. Journal, replay and writer ownership

### 13.1 Package-owned journal

Both backends supply the journal. A host without an application outbox can use the package directly.

Stream identity is:

```text
module / tenant / workspace / stream incarnation
```

The kernel allocates from a durable watermark under the scope gate held through commit. Delivery-row compaction does not reset allocation.

Required operations:

```text
read(after, limits)
readCheckpoint(consumer)
checkpoint(consumer, expected, next, fence)
resync(consumer)
inspectConsumer(consumer)
pauseConsumer(consumer, reason, authority)
retryConsumer(consumer, expectedFailure, authority)
```

Checkpoints are monotonic, incarnation-bound and CAS-protected. They cannot pass an undelivered poisoned event or an unverified scan boundary.

`inspectConsumer` includes lag, running/paused/stalled status, failed event identity, bounded diagnostic information and assigned operator reference where stalled.

Retry preserves the failed event’s identity/order and records authorized operator action. Other scopes continue.

### 13.2 Delivery and resync

- At-least-once delivery with stable event IDs.
- Send before acknowledgement.
- Polling after lost wake-up.
- No skip/delete to manufacture progress.
- Explicit replay expiry and resync.
- Delivery retention separate from canonical history.

Resync captures an authorized snapshot/root and journal boundary consistently. The consumer enumerates through registered bounded queries and acknowledges only after consuming the snapshot.

A replay-retention failure may require a new resync. This does not introduce clock-only expiry into comments chain cursors.

Internal replay is unfiltered. Observer transport applies current authorization and an allowlist, preserving an internal scanned boundary without exposing unauthorized references or tenant-context actor/session/run fields.

### 13.3 Optional external Postgres journal

An alternate binding must receive explicit trusted stream context:

```ts
interface JournalStream {
  readonly moduleId: StorageModuleId;
  readonly scope: StorageScope;
  readonly storeIncarnation: string;
  readonly streamIncarnation: string;
}

interface PgOutboxBinding {
  append(
    session: PgSession,
    input: {
      readonly stream: JournalStream;
      readonly changes:
        | { readonly kind: "inline"; readonly events: readonly StoredChange[] }
        | { readonly kind: "sealed-segment"; readonly segment: SealedJournalSegment };
    },
  ): Promise<void>;

  openReplay(stream: JournalStream): Promise<ScopedOutboxPort>;
}
```

The kernel supplies event identities and order. The binding stores them unchanged in the caller transaction.

A binding used with staged units must support atomic segment visibility without an unbounded final append loop. Otherwise it cannot advertise that combination.

Append and replay address the same log. The binding cannot infer scope from opaque cursor internals or ambient application state.

Sentropic’s `control.event_outbox` is an optional qualified integration. Its current writer requires adaptation. There is no dual canonical success journal.

### 13.4 Writer fences

Fences bind lane, owner, epoch, incarnation and optional lease. Background mutation verifies them after lock waits and at commit.

A successful CAS does not authorize a stale writer. Fence acquisition grants no additional module/domain authority.

Postgres lease checks use database time. SQLite uses its qualified host clock/ownership mechanism. Clock injection for domain timestamps does not itself qualify lease enforcement.

## 14. Backends, migrations, packaging and recovery

### 14.1 SQLite

Use one database file per module per local host storage instance, outside observed worktrees and Git directories.

Each file has one coordinated writer, migration state, checkpoint process and recovery identity. All mutation lanes share that writer.

h2a operates local placement, supervision, keys and any selected recovery profile.

Required configuration:

- Qualified local filesystem.
- WAL.
- `synchronous=FULL`.
- Actual engine validation before WAL at every open.
- Durable jobs, receipts and ownership state.
- Bounded queues, retries and transactions.

Accepted engine predicate:

```text
SQLite >= 3.51.3
or a specifically qualified corrected 3.44.6 backport
or a specifically qualified corrected 3.50.7 backport
```

Node major version is not proof of the linked engine.

Q7 A qualifies `node:sqlite` first. Q7 B permits a verified prebuilt `better-sqlite3` after recorded failure/disposition. No compilation/Python fallback or automatic runtime switch is introduced.

Separate module files avoid a shared WAL lock, but host-wide CPU/memory/I/O admission still matters.

### 14.2 Injected Postgres driver

```ts
interface PgSession {
  execute(statement: SqlStatement): Promise<SqlResult>;
}

interface InjectedPgDriver {
  transaction<T>(
    options: {
      readonly isolation: "serializable";
      readonly readOnly: boolean;
      readonly deadlineMs: number;
    },
    operation: (session: PgSession) => Promise<T>,
  ): Promise<T>;
}

interface PostgresStorageOptions {
  readonly driver: InjectedPgDriver;
  readonly layout: {
    readonly dataSchema: string;
    readonly projectionSchemas:
      Readonly<Partial<Record<StorageModuleId, string>>>;
    readonly outboxSchema: string;
  };
  readonly ids: IdSource;
  readonly domainClock: DomainClock;
  readonly outbox?: PgOutboxBinding;
}
```

Omitting `outbox` selects the package journal.

The backend imports neither `pg`, Drizzle nor an application. The host owns its bridge, pool and credentials.

Qualification proves one-connection execution, commit/rollback, cancellation, lossless decoding and uncertain-commit handling.

Writes use SERIALIZABLE and the applicable scope allocation/publication gate. Lock order is:

1. Migration/scheduling ownership when applicable.
2. Subordinate conversion/closure ownership.
3. Incarnation/maintenance guard.
4. Module/scope allocation/publication gate.
5. Canonically ordered aggregate/chain/index/record locks.
6. Projection/journal operations.

Normal requests do not acquire migration ownership.

Set transaction-local UTC/ISO formatting and finite timeouts. Durability is at least `synchronous_commit=on`; preserve stronger settings such as `remote_apply`.

The v3 candidate budgets—250 ms lock wait, 1,500 ms statement timeout, 1,000 ms idle timeout, 2,000 ms total flush/retry and at most three attempts—remain tuning proposals, `unverified`. They cannot be used to impose a whole-history size limit.

### 14.3 Postgres failures

| Condition | Result |
|---|---|
| `40001`, `40P01` | Roll back; bounded retry of immutable flush plan |
| Repeated deadlocks | Qualification failure and lock-order investigation |
| Lock/statement timeout | Explicit contention/timeout |
| `23505` | Map named constraint to CAS, identity or idempotency conflict |
| Constraint violation | Classified domain/reference or integrity failure |
| Known rollback/connection failure | Operational failure with known outcome where established |
| Lost commit acknowledgement | `outcome_unknown`; resolve through durable operation identity |

No operational failure becomes empty data.

### 14.4 Host-owned migration history

Kernel and module assets have immutable identity, dialect, predecessor/prerequisite list, from/to version, checksum and execution mode.

The host’s existing migration authority transactionally bootstraps an attached extension history. Execution records include:

- Host migration ID and checksum.
- Kernel/module asset ID and order.
- Packaged and applied checksums.
- Required predecessors.
- Conversion version/state where applicable.
- Completion status and receipt.

Each transactional step commits with its completion record. Operator steps persist resumable state and require reconciliation before completion.

Compare actual schema objects as well as history. Maximum timestamp/version alone is insufficient. Reject drift, skipped predecessors and unsupported versions.

No second comments migration scheduler or ledger is introduced. Physical upgrades never rehash canonical records.

P3 includes a neutral Drizzle-shaped host-history attachment proof using the injected driver. This is migration qualification, not an Immo database restore rehearsal.

### 14.5 Packaging

Proposed leaves:

```text
@sentropic/cluster-mesh/storage
@sentropic/cluster-mesh/storage/sqlite
@sentropic/cluster-mesh/storage/postgres
@sentropic/cluster-mesh/comments
@sentropic/cluster-mesh/engram-live
```

These are proposed exports, not established installed surfaces.

Comments and engram-live are optional peers reached only through their selected leaves/compositions. Root and disabled imports evaluate neither peer nor a backend driver.

Enabled modules reject absent/incompatible peers explicitly.

Preserve one comments catalogue entry, its comments ownership, compatible gated-module typing and one `/comments` namespace. Storage registration does not alter existing namespace or runtime contracts.

The comments installed proof uses:

```text
createClusterMeshRuntime(...)
createClusterMeshPlugin({
  runtime,
  namespaces: [commentsModule]
})
```

with host-injected ports and module-captured storage. P3’s storage proof and M4’s full comments runtime/API proof are complementary.

Installed evidence uses exact packed artifacts and a digest-pinned packaged conformance oracle. It does not import tests from a neighboring checkout.

### 14.6 Optional restore witness

`restore-witness-v1` is optional.

Without it:

- The store may open normally.
- Crash recovery, transaction rollback and explicit incarnation changes still work.
- Automatic detection of restoring both data and its internal incarnation is not claimed.
- No backup anti-resurrection claim is made.

With it:

- An authority outside the database backup/restore unit supplies the recovery witness.
- Mismatch closes affected protected operations until authorized reconciliation.
- Recovery advances incarnation and reconciles lifecycle, declarations, watermarks and transfer evidence.
- Stale capabilities fail.

Rolling back both store and witness defeats this detection unless another independent authority survives.

The optional witness has its own lot and corpus. It is not a dependency of P3, comments M2/M4 or pre-Immo delivery. Later Sentropic cutover and live recovery profiles retain their own separately scoped requirements.

## 15. Error compatibility

| Kernel/service condition | Frozen comments treatment |
|---|---|
| CAS conflict | `cas-conflict` |
| Command/genesis idempotency conflict | `idempotency-conflict` |
| Invalid command/reference | `invalid-command` |
| Authorization denial | `denied`, or policy-controlled non-enumerating not-found at the service boundary |
| Barrier-covered or physically disposed content, including tombstoned-but-unpurged content | M1 `get*Head`/`get*Chain` throw `CanonicalCommandError('denied')`; `readChainPage` returns `inaccessible`; non-enumerating not-found only at the service boundary |
| Page content unavailable/oversized | Existing `incomplete` or `inaccessible` result |
| Public request capacity failure | Existing wire `capacity-exceeded` |
| Replay retention gap | Explicit resync at journal/transport capability |
| Fence/base conflict | Owning service revalidation/retry or existing conflict response |
| Storage unavailable/uncertain commit/corruption | Transport/operational failure; no invented canonical error member |

A transport 5xx may carry a separate transport envelope; it must not masquerade as `CanonicalWireError` with an undeclared code.

Raw persistence acceptance of a lifecycle outcome is not operational purge authorization. No universal “caller purge-outcome is invalid-command” rule remains.

## 16. Verification and qualification

All execution obligations in this section are `unverified`.

### 16.1 Shared corpus

K2 supplies a test-only memory reference and discriminating mutations. It proves executable semantics, not durability.

The same applicable cases run against real SQLite and Postgres:

| Area | Required evidence |
|---|---|
| Scope/capabilities | Forged, wrong-module and cross-scope handles; operation escalation denied |
| Authority | Expiry/closure while queued, revocation before commit, fresh-authority continuation |
| Transactions | Immediate and commit-time CAS, rollback, predicates, nested failure and async isolation |
| Idempotency | Stored genesis replay, equal-digest replacement, raw CAS-first behavior, no duplicate logical events |
| Staged units | Gaps/reordering/corruption, changed ordinal conflict, hidden lookup paths, large dependency groups |
| Publication | No visible subset; changed base/head/authority; commit-before-response recovery |
| Read boundaries | No clock-only comments expiry, no residual per-reader pins, stable exact heads |
| Queries | Full resource tuples, secondary targets, scope enumeration and retained-header separation |
| Barriers | Parent deletion covering more descendants than atomic limits; concurrent child insertion; M1 getter `denied` and page `inaccessible` for covered content before and after physical purge |
| Journal | Commit ordering, durable watermark, checkpoint CAS, poison recovery and snapshot-bound resync |
| External journal | Interleaved scopes with colliding IDs, same-log rollback and staged-segment visibility |
| Purge | Unconfigured denial, conditional/late intent, holds, shared objects, crash-safe completion |
| L6a | Exact derivations/revisions, single-target revocation, rebind without redirection |
| Migrations | Bootstrap, upgrade, drift, missing predecessor, interruption and actual-schema reconciliation |
| Packaging | Optional-peer isolation, independent binding, installed assets and real driver bridge |

Restore-witness tests run only for deployments claiming that profile. Absence of infrastructure required for a claimed profile is a failed qualification lane, not a successful skip.

### 16.2 Comments evidence

Run the **unchanged frozen M1 corpus and hash vectors** against the persistence adapter.

Separately run operational comments service tests against the same backend implementation:

- All-target/resource/capability and decision checks.
- Atomic append plus command-index recording.
- Tombstone without purge policy/capability.
- Required authorized intent and later intent.
- Dependent barriers.
- K2b `barrier-corpus.ts`: covered M1 full getters throw `CanonicalCommandError('denied')` and `readChainPage` returns `inaccessible`, both before and after physical purge; absence remains distinct and raw tombstone persistence leaves the frozen corpus unchanged. K1 fixes this mapping, and the case must pass before C1a exits.
- Physical-disposal evidence and exactly one operational outcome.
- Protected ordinary reads and authorized retained audit.
- Request-local façade isolation.
- Complete M2 runtime/Hono composition, including `comments-router.spec.ts` proof that no route bypasses the operational service to reach `appendLifecycleEvent` and forged HTTP tombstone/`purge-outcome` submissions have no effects.

C4 tests include a representable thread exceeding 512 KiB, one 1 MiB request/page and the normal atomic-plan bound. Export/import must preserve canonical bytes and logical counts across advancing fragments.

Test hidden records/heads/indexes/receipts/events, partial batches only between groups, revoked dependencies, truncated terminal export, changed mapping and both sides of commit-before-response loss. `comments-import.spec.ts` proves that imported tombstoned state and its operational visibility barrier publish in the same unit/group.

M4-I repeats the long-history round trip through the installed comments/Postgres candidate and replays the C1a, C2 and M2-W proofs with `staged-units-v1` active in the final composition. It measures staging/publication contention on interactive commands as required by §7.6. C3 repeats applicable evidence on SQLite before that capability is advertised.

### 16.3 Live Q0

Q0 is an early indicative measurement over real storage profiles supporting live staging/publication and indexed reads.

Measure stage/seal/publication cost, queue occupancy, reader latency, memory, contention and initial recovery. Synthetic batches do not replace filesystem capture and extraction.

Q0 may trigger early D/Q7 disposition. Passing it does not satisfy Q and does not gate comments delivery.

### 16.4 Live Q

The numerical gate remains unchanged on each real backend, using the same fixture and digest-pinned installed producer prerelease.

| Measure | Requirement |
|---|---|
| History | At least 100,000 commits plus the 1,501-commit PR, without count/age/first-parent truncation |
| Resources | At most 2 CPU cores and 1 GiB aggregate resident-memory budget under the recorded protocol |
| Warm publication | p95 ≤5 s over at least 200 stabilized changes, each ≤10 text files and ≤128 KiB changed input, with history backfill active |
| Bounded reads | At most 200 facts and 1 MiB encoded response; p95 ≤200 ms over at least 200 requests including authorization and pinning |
| Recovery | ≤30 s from host/backend availability until the previous complete generation is readable and durable pending work rescheduled |
| Bootstrap | Complete the corpus and record duration; no new duration threshold |

The warm timer includes stabilization, extraction, durable storage, publication and the first readable result.

Retain LIVE §13’s other commitments: p50 warm ≤2 s, ref/PR freshness, idle CPU and Git process bounds, including at most four concurrent Git children and the stated launch formula.

Record process inventory, versions, fixture/input bytes, filesystem, sampling and crash windows.

The conductor must record shared-memory accounting and Git-child inclusion. Until then, retain the literal RSS baseline and any proposed PSS/cgroup interpretation separately; do not silently change acceptance.

### 16.5 Alternatives

Q7 A→B retains its recorded release-time process.

D→B requires a measured trigger and conductor reconciliation with the later generic-storage ownership decision. Any specialization must preserve applicable common contracts or explicitly state the affected claim.

A live failure does not move reusable Postgres into the application, impose cluster-mesh on engram, relax thresholds or reopen comments qualification.

## 17. Lot allocation

These allocations define accountable teams and dependencies. Actual branch creation, staffing, plan amendments and completion receipts are `unverified`.

### 17.1 Kernel and backend lots

All rows are **owned by cluster-mesh and co-reviewed by engram**. Comments is a required reviewer for capabilities it consumes.

| Lot | Deliverable | Dependencies |
|---|---|---|
| **K1** | Profile contracts, authority, atomic/read/staged protocols, descriptor/SPI and error mapping | Frozen M1 and merged L6a |
| **K2a** | Test-only reference; atomic, authority, chain and read corpus | K1 |
| **K2b** | Staged-unit, journal, barrier and lifecycle corpus; M1 getter denial and inaccessible pages before/after disposal; discriminating mutations | K1, K2a |
| **K3** | Runtime validation, tokens, binding, ordinary transaction machinery and exact-head immutable chain-boundary semantics | K1/K2 |
| **K4** | Shared visibility-root and staged-unit machinery | K3, K2b |
| **S1** | SQLite connection, engine guard, atomic/chains/indexes, journal and fences | K3 |
| **S2a** | SQLite immutable roots/readers and staged units | S1, K4 |
| **S2g** | SQLite live generations, leased pins and scheduling | S1 |
| **S3** | SQLite barriers, disposal and migration/crash hardening | S1; relevant S2 capabilities |
| **P1** | Structural driver bridge, serializable atomic operations, locks/fences/errors and exact-head/sequence/allocation chain reads | K3 |
| **P2a** | Postgres immutable roots and typed readers | P1 |
| **P2u** | Postgres staged units and atomic root publication | P2a, K4 |
| **P2g** | Postgres live generations and leased pins | P2a |
| **P2b-J** | Package journal, checkpoints, resync, consumer status and alternate binding | P1; P2a for snapshot resync |
| **P2b-M** | Migration assets and host-history attachment | P1 |
| **P2c** | Postgres dependent barriers and optional purge jobs | P2a, P2b |
| **P3** | Installed neutral Postgres host, package journal, driver and migration proof | Applicable P1/P2 profiles; no restore witness or live Q |
| **R** | Optional restore-witness implementations and corpus | Relevant backend core; independent opt-in |
| **L3b-P-Core** | Production hardening of claimed reusable PG profiles | Applicable P lots and P3 |
| **L3b-S** | Production hardening of claimed SQLite profiles | Applicable S lots |

P3 is a storage portability proof. The initial comments release also requires its installed module proof below.

### 17.2 Comments lots

| Lot | Accountable owner | Deliverable | Dependencies | Exit proof |
|---|---|---|---|---|
| **C0** | Comments contract/module maintainers | Compatibility and extension manifest; frozen-M1 preservation; exact transport/oracle packaging declarations | K1, M1 | Compatibility manifest and unchanged M1 source hashes |
| **C1a** | Comments | Eleven-kind codecs, exact 24-method store, request/service façade and transaction mapping | K3, K4, P1, P2u, M1 | Unchanged frozen M1 corpus and hash vectors on PG; façade isolation; K2b getter/page denial case before exit |
| **C1b** | Comments | Three named query profiles, projections and PG assets | C1a, P2a, P2b-M | Three queries, PG projection assets and resync using only registered queries |
| **C2** | Comments | Operational lifecycle, dependent coverage, conditional intent and verified completion service | C1, K4, P2u, P2c, P2b-J | Operational lifecycle checklist in §16.2 |
| **C4a** | Comments | Versioned fragment/root/continuation declarations and vectors | C0, K1/K4 | Fragment and boundary vectors |
| **C4b** | Comments | Import in chained sub-units, atomic groups, mappings and batch/unit receipt recovery | C1/C2, C4a, P2u, P2b-J | History exceeding 512 KiB, commit-before-response recovery and atomic imported-tombstone/barrier publication in `comments-import.spec.ts` |
| **C4c** | Comments | Export boundaries, terminal completeness, continuation and transfer/reconciliation services | C4a/C4b, P2a | History exceeding 512 KiB, round-trip/recovery evidence and rejected truncated terminal export |
| **M2-W** | Comments, with catalogue/runtime reviewers | Registration, lazy loading, composition and canonical Hono API | C1/C2 and applicable qualified PG profiles | Runtime/Hono composition; `comments-router.spec.ts` proves no raw lifecycle bypass and forged HTTP tombstone/`purge-outcome` refusal without effects |
| **M3-S** | Comments | Remaining correction, source-evolution and unitary preparation services | M2-W, C4 | Correction, submission and service evidence in the §17.4 test files |
| **M4-I** | Comments and release/driver maintainers | Installed full-runtime comments/Postgres candidate, oracle and long-history round trip | P3, L3b-P-Core for claimed profiles, M2-W/M3-S/C4 | Installed oracle/runtime and long-history round trip; C1a/C2/M2-W replay with `staged-units-v1` active; measured interactive-command contention |
| **C3** | Comments, with SQLite maintainers | Same module/corpus on shared SQLite | C1/C2/C4, applicable S profiles | Applicable frozen, operational and C4 corpus on real SQLite before advertising SQLite support |

For C1a `readChainPage`, K3 supplies exact-head immutable chain-boundary and token semantics; P1 supplies Postgres reads at the exact head, sequence and allocation. P2a supplies immutable scope roots and typed readers. The comments/Postgres root is active from C1a through K4/P2u, including C2 mutations.

**C4 is not orphaned under a kernel/backend lot.** Its accountable owner is the comments team. Kernel/backend maintainers supply the generic staged publication mechanism.

C0 does not authorize rewriting M1 or require a replacement M1 lifecycle contract. An independently chosen future comments contract evolution remains separate.

### 17.3 Engram and live-adapter lots

| Lot | Owner | Deliverable | Dependencies |
|---|---|---|---|
| **E** | Engram | Typed neutral facts, canonical batch encoding and completion control | Merged L6a; neutral package |
| **L1** | Engram integration team in cluster-mesh | Local committed ingestion, descriptor and generation mapping | K3, S2g, E |
| **L2** | Same, with lifecycle reviewers | Typed readers, private lifecycle/protection and transfer fixture | L1, S3 |
| **L3** | Same, with PG maintainers | Live Postgres parity and destination adapter | L2, P2g/P2b/P2c as applicable |
| **Q0** | Shared qualification team | Early real-backend indicative measurement | S2g, P2g, journal/read profiles |
| **Q** | Live qualification team across repositories | Complete unchanged numerical gate | Actual exercised producer, backend and host capabilities |
| **L3b-P-App** | Sentropic application | Driver composition, host migrations and optional existing journal | Qualified reusable PG profiles |
| **L7a/L8/L9** | Existing host/application owners | Actual authority, installed composition, publication and acceptance | Their applicable live release/qualification gates |

### 17.4 Bounded proposed execution scopes

Each source-changing cluster-mesh branch includes:

```text
BRANCH.md
packages/cluster-mesh/package.json
package-lock.json
```

The package/lock entries are included in the twelve-file budget where workflow requires a bump. Shared files have one integrating writer.

Aliases:

```text
K = packages/cluster-mesh/src/storage/
T = packages/cluster-mesh/tests/storage/
A = packages/cluster-mesh/assets/storage/
C = packages/cluster-mesh/src/comments/
L = packages/cluster-mesh/src/live/
CT = packages/cluster-mesh/tests/
```

The following are proposed literal paths, not directory permissions.

| Lot | Additional files |
|---|---|
| K1 | `spec/SPEC_EVOL_CLUSTER_MESH_MODULE_STORAGE.md`; K:`contracts.ts`, `authority.ts`, `atomic.ts`, `profiles.ts`, `descriptor.ts`, `staged-units.ts`, `readers.ts`, `errors.ts` |
| K2a | T:`reference-store.ts`, `reference-state.ts`, `atomic-corpus.ts`, `authority-corpus.ts`, `chain-corpus.ts`, `read-corpus.ts`, `reference.spec.ts`, `mutations.spec.ts` |
| K2b | T:`staged-corpus.ts`, `replay-corpus.ts`, `barrier-corpus.ts`, `lifecycle-corpus.ts`, `reference-staged.ts`, `profile-mutations.spec.ts` |
| K3 | K:`kernel.ts`, `scope-runtime.ts`, `tokens.ts`, `record-runtime.ts`, `backend.ts`, `index.ts`; T:`kernel.spec.ts`, `scope-runtime.spec.ts` |
| K4 | K:`visibility-root.ts`, `staged-runtime.ts`, `stage-validation.ts`, `projection-runtime.ts`, `manifest.ts`; T:`staged-units.spec.ts`, `visibility.spec.ts`, `manifest.spec.ts` |
| S1 | K:`sqlite/index.ts`, `sqlite/connection.ts`, `sqlite/runtime.ts`, `sqlite/atomic.ts`, `sqlite/chains.ts`, `sqlite/journal.ts`, `sqlite/fences.ts`; A:`sqlite/001-kernel.sql`; T:`sqlite-core.spec.ts` |
| S2a | K:`sqlite/roots.ts`, `sqlite/readers.ts`, `sqlite/staged.ts`; A:`sqlite/002-roots.sql`; T:`sqlite-readers.spec.ts`, `sqlite-staged.spec.ts` |
| S2g | K:`sqlite/generations.ts`, `sqlite/pins.ts`, `sqlite/scheduler.ts`; A:`sqlite/003-generations.sql`; T:`sqlite-generations.spec.ts`, `sqlite-scheduler.spec.ts` |
| S3 | K:`sqlite/barriers.ts`, `sqlite/purge.ts`, `sqlite/migrations.ts`; A:`sqlite/004-lifecycle.sql`, `sqlite/manifest.json`; T:`sqlite-lifecycle.spec.ts`, `sqlite-crashes.spec.ts` |
| P1 | K:`postgres/index.ts`, `postgres/session.ts`, `postgres/atomic.ts`, `postgres/chains.ts`, `postgres/fences.ts`, `postgres/errors.ts`; A:`postgres/001-kernel.sql`; T:`postgres-core.spec.ts`, `postgres-concurrency.spec.ts` |
| P2a | K:`postgres/roots.ts`, `postgres/readers.ts`; A:`postgres/002-roots.sql`; T:`postgres-readers.spec.ts` |
| P2u | K:`postgres/staged.ts`; A:`postgres/003-staged.sql`; T:`postgres-staged.spec.ts`, `postgres-staged-crashes.spec.ts` |
| P2g | K:`postgres/generations.ts`, `postgres/pins.ts`; A:`postgres/004-generations.sql`; T:`postgres-generations.spec.ts` |
| P2b-J | K:`postgres/journal.ts`, `postgres/checkpoints.ts`, `postgres/resync.ts`, `postgres/consumers.ts`, `postgres/external-journal.ts`; A:`postgres/005-journal.sql`; T:`postgres-replay.spec.ts`, `postgres-consumers.spec.ts`, `postgres-external-journal.spec.ts` |
| P2b-M | K:`migrations.ts`, `postgres/migrations.ts`; A:`postgres/manifest.json`; T:`postgres-migrations.spec.ts`, `host-history.spec.ts`; `docs/operations/module-storage-migrations.md` |
| P2c | K:`postgres/barriers.ts`, `postgres/purge.ts`; A:`postgres/006-lifecycle.sql`; T:`postgres-barriers.spec.ts`, `postgres-purge.spec.ts` |
| P3 | T:`fixtures/neutral-pg/package.json`, `fixtures/neutral-pg/package-lock.json`, `fixtures/neutral-pg/host.mjs`, `fixtures/neutral-pg/driver.mjs`, `postgres-install.spec.ts`, `package-boundaries.spec.ts`; `packages/cluster-mesh/tsconfig.json`; `docs/operations/module-storage-postgres.md` |
| R | K:`restore-witness.ts`, `sqlite/recovery.ts`, `postgres/recovery.ts`; T:`restore-witness-corpus.ts`, `sqlite-witness.spec.ts`, `postgres-witness.spec.ts`; `docs/operations/module-storage-recovery.md` |
| C0 | `docs/comments-annotations/contract/storage-module-v1.json`, `docs/comments-annotations/contract/storage-compatibility.md`; CT:`comments-contract-boundaries.spec.ts` |
| C1a | C:`index.ts`, `descriptor.ts`, `codecs.ts`, `storage-adapter.ts`, `transaction-context.ts`, `request-context.ts`; CT:`comments-store.spec.ts`, `comments-transactions.spec.ts`, `comments-authority.spec.ts` |
| C1b | C:`storage-schema.ts`, `queries.ts`, `projections.ts`, `postgres.ts`; A:`postgres/comments/001-projections.sql`, `postgres/comments/manifest.json`; CT:`comments-queries.spec.ts`, `comments-hashes.spec.ts` |
| C2 | C:`lifecycle.ts`, `coverage.ts`, `purge.ts`, `availability.ts`; CT:`comments-lifecycle.spec.ts`, `comments-purge.spec.ts`, `comments-coverage.spec.ts` |
| C4a | C:`transport-contracts.ts`, `fragment-codec.ts`, `boundary-codec.ts`; CT:`comments-fragment-vectors.spec.ts`; `docs/comments-annotations/contract/transport-v1.json` |
| C4b | C:`import.ts`, `receipts.ts`, `import-bindings.ts`; CT:`comments-import.spec.ts`, `comments-receipts.spec.ts`, `comments-import-crashes.spec.ts` |
| C4c | C:`export.ts`, `export-boundaries.ts`, `transfer.ts`; CT:`comments-export.spec.ts`, `comments-transfer.spec.ts`, `comments-long-history.spec.ts` |
| M2-W | `src/modules/contracts.ts`, `src/modules/catalog.ts`, `src/modules/registry.ts`, `src/compose/comments.ts`, `src/hono/comments-router.ts`, `src/loaders/comments/index.ts`, `src/integrations/comments/index.ts` under `packages/cluster-mesh/`; CT:`comments-module.spec.ts`, `comments-router.spec.ts` |
| M3-S | C:`correction.ts`, `submissions.ts`, `services.ts`; CT:`comments-correction.spec.ts`, `comments-submissions.spec.ts`, `comments-services.spec.ts` |
| M4-I | CT:`fixtures/comments-host/package.json`, `fixtures/comments-host/package-lock.json`, `fixtures/comments-host/host.mjs`, `comments-install.spec.ts`, `comments-runtime-install.spec.ts`, `comments-installed-roundtrip.spec.ts`; `docs/comments-annotations/evidence/installed-module.md` |
| C3 | C:`sqlite.ts`; A:`sqlite/comments/001-projections.sql`, `sqlite/comments/manifest.json`; CT:`comments-sqlite-parity.spec.ts`; `docs/comments-annotations/evidence/sqlite-parity.md` |
| L1 | L:`index.ts`, `adapter.ts`, `descriptor.ts`, `codecs.ts`, `declarations.ts`, `sqlite.ts`; CT:`live-batches.spec.ts`, `live-generation-race.spec.ts`, `live-authority.spec.ts` |
| L2 | L:`readers.ts`, `private-lifecycle.ts`, `protected-payload.ts`, `transfer.ts`; CT:`live-readers.spec.ts`, `live-private-lifecycle.spec.ts`, `live-transfer.spec.ts` |
| L3 | L:`postgres.ts`; CT:`live-postgres-parity.spec.ts`, `live-postgres-transfer.spec.ts`; `docs/operations/live-storage-parity.md` |
| Q0 | K:`qualification.ts`; T:`qualification-fixture.ts`, `qualification-q0.spec.ts`; `spec/QUALIFICATION_MODULE_STORAGE_Q0.md` |
| Q, Sentropic | T:`qualification-live.spec.ts`, `qualification-crashes.spec.ts`, `qualification-resources.ts`; `spec/QUALIFICATION_LIVE_GIT_INDEXING.md`; `.github/workflows/ci.yml` |

L3a-E’s proposed scope, including its own `BRANCH.md`, is:

```text
engram-live/contracts.ts
engram-live/integration.ts
engram-live/facts.ts
engram-live/generation.ts
engram-live/batch-codec.ts
engram-live/package.json
engram-live/package-lock.json
engram-live/tsconfig.json
tests/live-fact-contract.test.ts
tests/live-generation-contract.test.ts
tests/live-neutrality.test.ts
```

It does not edit L6a derivation semantics in `engram-live/registration.ts`.

Packaging the frozen oracle requires an exact additional receiving scope once its distribution form is selected. Its export location and executable packaging are `unverified`; M4-I cannot claim completion without it. This outstanding packaging choice does not justify changing M1.

Existing L3b and host lots require their plan/09 scope amendments before execution. These proposed scopes authorize no writes in this task.

### 17.5 Order and independent acceptance gates

| Stage | Work | Result |
|---|---|---|
| 1 | K1, C0/C4a design; E from merged L6a | Compatible contracts and extension boundaries |
| 2 | K2/K3/K4; applicable P and S lots in parallel | Executable shared mechanisms |
| 3, comments | C1/C2 with K4/P2u active, M2-W and PG hardening/P3 | Qualified comments/Postgres M2 profiles with visibility-root discipline |
| 4, comments | C4/M3-S and M4-I | Independent comments/Postgres candidate |
| 5, comments | Existing exact-delivery and receiving-host gates | Comments delivery/adoption path |
| Separate parity | C3 after applicable SQLite qualification | Comments/SQLite claim |
| Parallel live | S2g/P2g, E/L1–L3, Q0 and host/producer work | Live candidate |
| Live qualification | Q after every exercised capability exists | Live profile freeze |
| Live activation | Live R-S pins, L7a/L8/L9 gates | Installed live acceptance |
| Optional recovery | R when selected | Restore-witness claim |

Formal comments M2 entry is amended to require the **reviewed common contract and qualified Postgres profiles actually consumed**, not L3b-S or live generations/Q.

Preparation against agreed doubles remains preparation. A prototype is not formal M2 readiness.

Comments/Postgres release evidence identifies exact profiles, packages, fixtures and limitations. It makes no unqualified claim that every common/live profile is frozen.

L3b implementation can proceed from candidate contracts and applicable evidence without waiting for final live Q.

## 18. Impact on plan/09 and comments documents

No plan amendments were performed.

### 18.1 Engram plan/09

| Location | Required amendment |
|---|---|
| Introduction/objectives | Cluster-mesh owns both reusable backends; applications operate and compose Postgres |
| Scope exclusions | Distinguish canonical comments consumer work from global engram corpus/annotation migration |
| L3a | Replace the single prototype/qualification lot with K/S/P/E/C/L/Q0/Q allocation and profile-specific gates |
| L3a persistence binding | Replace additive runtime binding with independent `ModuleStorageBinding` |
| L3a/L3b-P prohibition | Remove prohibition on reusable Postgres implementation in cluster-mesh; retain driver/application isolation |
| L3b-P | Split reusable Core and application composition |
| L3b-S | Use shared storage paths; retain engine/filesystem/writer qualification |
| L4b, S | Map protection to the live module and shared SQLite lifecycle facilities |
| L6a, S | Preserve PR #664’s introduced registration surface and exact L6a contract; add storage authority/fencing integration separately |
| L6a control persistence | Declarations remain authoritative outside disposable projection roots |
| GitHub P1, S | Use the registered live adapter while retaining PR-specific semantics |
| L7b-C | Closed namespace/capability negotiation, independent of comments |
| L7b-R/L9-S | Registered typed queries, explicit boundaries and applicable real-backend parity |
| L7b-D/R-S | Separate comments release from the live release checkpoint; exact optional-peer closure |
| L7a | Allow qualification with pinned prereleases; final production pins follow live acceptance |
| L8 | Strict destination scope, committed-only transfer and application operations; live-specific recovery gates |
| Recommended order | Place Q0 early; Q after actual measured producer/host capabilities; remove comments from Q’s dependency chain |
| Feedback Loop | Record revised ownership/gates, D/Q7 disposition, memory/process protocol and actual RED/GUARD evidence |

Completed L0/L4a/L6a or other evidence in the current plan is preserved. Scope/path evolution must not erase completed history or claim unexecuted results.

### 18.2 Comments specification and plans

Update the current specification and:

```text
docs/comments-annotations/plan/PLAN_COMMENTS_ANNOTATIONS.md
docs/comments-annotations/plan/PLAN_HANDOFF.md
docs/comments-annotations/plan/BRANCH_P1_TEMPLATE.md
```

Required alignment:

- Replace stale M1-authoring language with the owner-closed freeze and carried reserves.
- Replace `live-storage/port.ts` and runtime-persistence extension proposals with independent shared storage.
- Preserve frozen M1 interfaces and distinguish operational services.
- Keep registration and canonical Hono API in M2; C4/import/export and remaining services in M3.
- Replace universal SQLite/live-generation M2 gates with the selected PG profile gate.
- Make comments own domain event meaning; kernel own journal allocation/replay machinery.
- Make the package journal default; Sentropic’s existing outbox an optional qualified application binding.
- Add projection assets and host-history attachment.
- Add C4 and the explicit transport-extension inventory.
- Remove mandatory restore witness/rehearsal from the Immo path.
- Preserve separate M5-S conversion/cutover obligations and exact-delivery authority.

The conductor records these changes and qualification receipts. This document does not report them as completed.

## 19. Convergence disposition

### 19.1 Engram Opus v2

| Finding | Disposition | Reason and remaining evidence |
|---|---|---|
| **MAJ-1 — L6a baseline and identity** | **Applied** | Current main and merged L6a verified; exact identity/binding consumed; optional sets have separate revision. Host race qualification remains `unverified`. |
| **MAJ-2 — Grant operations and revalidation** | **Applied** | Explicit operations and commit/page revalidation retained. Authority lifetime separated from comments continuation lifetime. |
| **MAJ-3 — Readers, pins, projections, changes** | **Applied** | Reachable queries, resolved boundaries, stage/publication/disposal deltas and effective-change derivation specified. |
| **MAJ-4 — Purge outcome ownership** | **Applied concern; contested persistence-level remedy** | Physical completion must be verified by the operational service. Rejecting all raw outcome appends would contradict frozen M1. No mandatory M1 amendment. |
| **MAJ-5 — Lot size, missing E, dependencies, Q** | **Applied** | Bounded lots, reference corpus, E and Q0 retained; C4 added; comments/live acceptance separated. Execution evidence remains `unverified`. |
| **MAJ-6 — Reusable journal** | **Applied** | Package journal default; checkpoints, resync, explicit scoped alternate append/replay and P3 without application outbox. |
| **m-a — Incomplete impact tables** | **Applied** | L4b, L6a, GitHub P1, comments spec/plans, wiring and assets explicitly covered. |
| **m-b — Generation states/scheduling** | **Applied** | Kernel-issued IDs, abort transitions and hot/history base discipline retained. |
| **m-c — Immediate CAS** | **Applied** | Append-time and flush-time conflicts use frozen CAS behavior. |
| **m-d — Top-level apply/idempotency** | **Applied** | Transaction-only apply; one commit identity; independent frozen domain-index writes. |
| **m-e — Local comments scope** | **Applied** | Generic host workspace, no live declaration requirement; SQLite initially parity evidence. |
| **m-f — Database isolation claim** | **Applied** | Supported-query isolation stated precisely; RLS/roles optional. |
| **m-g — Retained private fingerprints** | **Applied** | Payload-class fingerprint policy covers roots, receipts, staging and derivatives. |
| **m-h — Schema map, durability, peers, memory** | **Applied** | Partial schema map, durability at least on, optional comments peer; measurement interpretation remains explicitly pending. |
| **m-i — Closure overclaim** | **Applied** | Specification dispositions separated from implementation, qualification and exact-v4 confirmation. |

### 19.2 Sentropic Opus comments review

| Finding | Disposition | Reason and remaining evidence |
|---|---|---|
| **MAJ-C1 — Atomic staged imports** | **Applied; chain-count ceiling contested** | Generic staged units promote canonical effects, not only projections. Root publication avoids a new whole-unit dependency-count limit. |
| **MAJ-C2 — Leases versus comments cursors/export** | **Applied** | Immutable no-expiry boundaries; no per-reader lease; verified export manifest. A bare digest alone remains insufficient. |
| **MAJ-C3 — Single store versus scoped grants** | **Applied** | Request/service-local façade preserves the frozen factory and methods. |
| **MAJ-C4 — Mandatory restore witness** | **Applied** | Optional deployment profile, absent from P3 and Immo delivery dependencies. |
| **MAJ-C5 — Unconditional purge intent** | **Applied** | Conditional operational intent; tombstone-only and late-authorized intent supported. |
| **MAJ-C6 — Dependent aggregate masking** | **Applied** | Registered indexed coverage with one parent barrier and bounded later disposal. |
| **MAJ-C7 — Missing comments queries/assets** | **Applied** | Three named queries, projections, migration assets and explicit lots. |
| **MAJ-C8 — Comments blocked by common/live freeze** | **Applied** | Separate comments/Postgres acceptance and delivery; C3 only gates SQLite claims. |
| **MIN-C1 — Standalone command index** | **Applied** | Raw call remains valid; production commands transact append plus index; split-call crash behavior tested. |
| **MIN-C2 — Outcome actor/reason** | **Applied at service layer** | Final verified maintenance principal; null or registered non-personal reason. No raw-store author restriction. |
| **MIN-C3 — Page bytes** | **Applied** | Injected `pageEncodedBytes`; oversized indivisible record yields incomplete. |
| **MIN-C4 — Operational errors** | **Applied** | Transport failures remain outside the frozen canonical vocabulary. |
| **MIN-C5 — Migration assets/history** | **Applied** | Module assets and attached host execution records; installed migration proof. |
| **MIN-C6 — Registration/Hono wiring** | **Applied** | M2-W owns exact wiring scope; module ownership and single namespace preserved. |
| **MIN-C7 — Stale CA architecture prose** | **Applied** | Explicit comments-spec and three-plan amendment inventory. |
| **MIN-C8 — Poisoned consumer state** | **Applied** | Inspect/pause/stalled/operator/retry semantics; no skipping. |
| **MIN-C9 — Two authorization paths** | **Applied** | Coarse storage authority and frozen domain ports share verified context; neither substitutes for the other. |
| **Proposed mandatory C0 lifecycle `contract-v2`** | **Contested** | Current owner instructions require unchanged M1. C0 now documents compatibility and additive module extensions. |
| **Claim that three M1 behavioral changes are necessary** | **Contested** | Persistence and operational orchestration are separate; the kernel need not change frozen persistence behavior. |

### 19.3 Sentropic Astra review

| Finding | Disposition | Reason and remaining evidence |
|---|---|---|
| **B-01 — Adapter differs from M1** | **Applied finding; contested mandatory-amendment remedy** | Remove v3’s universal store-level enforcement changes. Preserve raw M1 and qualify operational services separately. |
| **B-02 — Large coherent unit missing** | **Applied** | Staged effect plans and indexed visibility roots cover records, heads, allocation, bindings, receipts, audit and journal atomically. Backend proof remains `unverified`. |
| **M-01 — Mandatory token expiry** | **Applied** | Domain continuation separated from grants and leases; same retained boundary reopened without clock-only invalidation. |
| **M-02 — Missing current-contract delta inventory** | **Applied** | Codec, capacity, fragment, continuation and oracle deltas listed. They are not silently folded into M1. |
| **M-03 — C/P lots do not deliver M2** | **Applied** | M2-W, module assets, C4/M3 services and distinct M4 installed-runtime evidence added. |
| **M-04 — Entry and qualification gates** | **Applied** | Explicit PG-profile formal-entry amendment; preparation/prototype/qualification/release distinguished; no live/SQLite delivery dependency. |
| **M-05 — External append loses scope** | **Applied** | Trusted stream context accompanies append and replay; colliding-scope qualification required. |
| **m-01 — No-op/multi-apply notifications** | **Applied** | Effective committed changes drive events; replay preserves existing identities. |
| **m-02 — Host-history attachment** | **Applied** | Bootstrap, host migration linkage, checksums, predecessors, conversion state and completion records specified. |
| **Comments lead for reusable P sequence** | **Contested as ownership assignment** | Cluster-mesh owns the kernel and reusable backends under the convergence mandate. Comments is a mandatory reviewer and may contribute implementation. |
| **Need: exact CAS/allocation/genesis/index mapping** | **Applied and preserved** | No revival of the already-resolved v1 B2 mapping complaint. |
| **Need: generations for comments** | **Applied as capability need; live-generation dependency contested** | Comments needs coherent publication and immutable roots, supplied by staged units and immutable boundaries. |
| **Need: current CA values already frozen** | **Contested if interpreted as established M1** | Actual frozen source has ten bounds and `specDigest`; new declarations require separate extension/evolution treatment. |

### 19.4 Carried v1 findings

| Finding | v4 disposition |
|---|---|
| B1 — Executable module extension boundary | Applied through registered descriptors, reachable queries and backend SPI |
| B2 — Exact comments store mapping | Applied; unchanged mapping retained and lifecycle separation corrected |
| M1 — Generation base race | Applied |
| M2 — Authoritative scope | Applied |
| M3 — Closed registration/isolation | Applied with precise trusted-extension claim |
| M4 — Independent storage binding | Applied |
| M5 — Payload/lifecycle separation | Applied through optional profiles and operational services |
| M6 — PG concurrency/durability | Applied |
| M7 — SQLite placement/writer/engine | Applied |
| M8 — Ownership and delivery breakdown | Applied with independent comments gates |
| m1 — Source baseline | Applied with current verified references |
| m2 — Comments versus corpus annotations | Applied |
| m3 — Domain-specific errors | Applied |
| m4 — Messaging exclusion | Applied |
| m5 — Append/replay distinction | Applied |
| m6 — Resource accounting | Applied; measurement clarification remains `unverified` |
| m7 — External witness | Applied only as optional profile; universal requirement contested |
| m8 — Durable committed-only transfer | Applied |
| m9 — D→B conductor disposition | Applied |
| m10 — Future graph backends | Applied as profile-based possibility, not delivered support |
| m11 — Bounds, counters, migrations and packaging | Applied with module-specific limits and exact-artifact qualification |

## 20. Remaining evidence and acceptance

| Outstanding evidence | Owner | Gate |
|---|---|---|
| Durable recording of frozen v4.1 and its plan/09 amendment | Specification reviewers and conductors | Specification/plan recording |
| Root/fragment encodings, vectors and discriminating reference implementation | K owners with comments/engram review | K closure |
| Constant/bounded final staged publication under real backend contention | Backend owners | Staged-unit claim |
| Frozen M1 persistence corpus and operational-service separation | Comments | C1/C2 acceptance |
| C4 extension manifest, export continuation and terminal completeness | Comments | C4/M3 acceptance |
| Packaged frozen oracle and exact optional-peer closure | Comments/release maintainers | M4-I |
| Installed neutral driver and host-history integration | Cluster-mesh/P3 | Reusable Postgres claim |
| Current domain/scope revocation ordering | Each host and module team | Relevant operational authority claim |
| S-L6a integration without fingerprint fallback or stale revision publication | Live/application owners | Live authority qualification |
| Real private disposal and transfer recovery | Live/backend/host owners | Private-live and remote-publication claims |
| Optional restore-witness evidence | Selecting operator | Restore-witness claim only |
| Process/memory protocol and full live Q | Live conductor/qualification team | Live freeze |
| Final artifact, delivery and receiving-host acceptance | Existing release/host authorities | Actual delivery/adoption |

All entries above are `unverified` unless an exact future evidence receipt establishes them. The common specification accommodates the two authoritative contracts; it does not claim that their storage implementations or delivery gates have already passed.

## 21. plan/09 amendment

Replace the complete L3a, L3b-S and L3b-P sections of `plan/09-BRANCH_LIVE_GIT_INDEXING.md` with the following text. The inspected plan source is graphify `origin/main`, blob `dc80842abe2eca9903f33b54ad47fdcb2b890d50`; that file is absent from the root working checkout. This is replacement text only; no plan was written.

```markdown
## L3a — Engram Adapter To Shared Module Storage (LIVE §§3, 9, 11, 13; L3a v4.1 §§12, 16–17) — engram integration team in cluster-mesh

- [ ] Authority: FROZEN L3a v4.1 governs this section and L3b-S/L3b-P. Cluster-mesh owns the generic kernel and both reusable backends; applications inject and operate Postgres. This supersedes older plan wording assigning reusable Postgres implementation to the app or extending runtime persistence as a prerequisite.
- [ ] Retained integration: L3a-Engram-Adapter, named `@sentropic/cluster-mesh/engram-live`, implements only the engram descriptor, codecs, storage adapter, generation mapping, readers and live lifecycle/transfer integration in §17.3 L1–L3. Its implementation is in cluster-mesh. No generic kernel, backend or comments implementation belongs to the engram repository.
- [ ] External ownership: §17.1 K1/K2a/K2b/K3/K4, S1/S2a/S2g/S3, P1/P2a/P2u/P2g/P2b-J/P2b-M/P2c/P3 and optional R execute in their owning cluster-mesh branches with §17.4 scopes and profile-specific proofs. R is required only for an advertised restore-witness profile.
- [ ] External comments delivery: §17.2 C0/C1a/C1b/C2/C4a/C4b/C4c/C3 and M2-W/M3-S/M4-I remain comments-owned. Apply every Exit proof in §17.2. Comments/Postgres delivery has no dependency on Q, comments/SQLite parity or R.
- [ ] Dependencies, L1: K3, S2g and §17.3 E/L3a-E; consume the merged L6a contracts and exact declaration/clone/worktree identities. E/L3a-E is a separate neutral-contract prerequisite, not additional implementation scope in this L3a adapter section.
- [ ] Dependencies, L2: L1 and S3, with the applicable qualified read, protection and lifecycle profiles.
- [ ] Dependencies, L3: L2 and applicable P2g/P2b-J/P2b-M/P2c profiles; consume the reusable Postgres implementation and destination authority.
- [ ] RED, L1: `packages/cluster-mesh/tests/live-batches.spec.ts`, `live-generation-race.spec.ts` and `live-authority.spec.ts` prove complete durable batch receipt, distinct publication, G0/G1 stale-base rejection and current exact L6a authority.
- [ ] RED, L2: `packages/cluster-mesh/tests/live-readers.spec.ts`, `live-private-lifecycle.spec.ts` and `live-transfer.spec.ts` prove bounded pinned reads, dependent private disposal and committed-only transfer/recovery.
- [ ] RED, L3: `packages/cluster-mesh/tests/live-postgres-parity.spec.ts` and `live-postgres-transfer.spec.ts` prove applicable real-backend parity and independently authorized destination publication.
- [ ] GUARD: preserve frozen M1 and merged L6a; keep engram neutral, runtime persistence independent, optional peers isolated and observed worktrees unchanged.
- [ ] Qualification coordination: Q0 and Q remain external §17.3 qualification lots. Q0 is indicative; Q retains all §16.4/LIVE §13 thresholds and the measured D/Q7 disposition process. Adapter implementation and L3b hardening may proceed against candidate contracts; no unexecuted result is marked passed.
- Allowed, common per implementation branch: S:`BRANCH.md`, S:`packages/cluster-mesh/package.json`, S:`package-lock.json`; one integrating writer for shared files.
- Allowed, L1: S:`packages/cluster-mesh/src/live/index.ts`, `adapter.ts`, `descriptor.ts`, `codecs.ts`, `declarations.ts`, `sqlite.ts`; S:`packages/cluster-mesh/tests/live-batches.spec.ts`, `live-generation-race.spec.ts`, `live-authority.spec.ts`, with shortened filenames relative to their preceding directory.
- Allowed, L2: S:`packages/cluster-mesh/src/live/readers.ts`, `private-lifecycle.ts`, `protected-payload.ts`, `transfer.ts`; S:`packages/cluster-mesh/tests/live-readers.spec.ts`, `live-private-lifecycle.spec.ts`, `live-transfer.spec.ts`, with shortened filenames relative to their preceding directory.
- Allowed, L3: S:`packages/cluster-mesh/src/live/postgres.ts`; S:`packages/cluster-mesh/tests/live-postgres-parity.spec.ts`, S:`packages/cluster-mesh/tests/live-postgres-transfer.spec.ts`; S:`docs/operations/live-storage-parity.md`.
- Allowed, engram coordination only: E:`plan/09-BRANCH_LIVE_GIT_INDEXING.md`. Execute L1, L2 and L3 as separate scoped branches within the twelve-file budget; external K/S/P/R/C/M scopes are references, not permissions for an adapter branch.
- Forbidden: generic storage or comments implementation in engram; application-owned reusable Postgres algorithms; driver/pool/credential dependencies in the reusable package; runtime-persistence extension as a storage prerequisite; frozen M1/L6a changes; memory or global corpus migration; private remote publication; observed-worktree writes; automatic fallback, rollout or relaxed thresholds.
- Gate: L1–L3 adapter proofs pass against their applicable qualified profiles and pinned neutral artifacts. Shared K/S/P/R/C/M completion is established only by its owning lots. Full live freeze requires Q with the unchanged ≥100000-commit plus 1501-commit-PR corpus, resource/publication/read/recovery thresholds and zero successful skips; installed activation remains behind L7a/L8/L9.

## L3b-S — Shared Durable SQLite And Local Migrations (LIVE §§9–10; L3a v4.1 §§14, 16–17) — cluster-mesh

- [ ] Dependencies: applicable §17.1 K3/K4 and S1/S2a/S2g/S3; L3b-S hardens the selected SQLite profiles. Final live Q is not a prerequisite to implementing this lot.
- [ ] RED/GUARD: execute the applicable SQLite core, readers, staged-unit, generation, scheduler, lifecycle and crash files named in §17.4 against the shared corpus, including actual-engine validation before WAL.
- [ ] Implement: shared SQLite connection/schema/assets, qualified local placement, one coordinated writer for all mutation lanes, immutable boundaries, selected staged/generation profiles, durable journal/receipts/fences, barriers and disposal.
- [ ] Driver qualification: retain Q7 A first and the admitted SQLite predicate; Q7 B requires its recorded failure/disposition and verified prebuilt installation without compilation or Python fallback.
- [ ] Optional recovery: execute §17.1 R separately only when restore-witness support is selected. C3 separately qualifies comments/SQLite and does not gate comments/Postgres delivery.
- Allowed: only the literal files in the applicable S1/S2a/S2g/S3 rows of §17.4, plus that section's three common branch files; separate branches within each lot's twelve-file budget. A selected R implementation uses its own literal R row and branch.
- Forbidden: duplicate live-specific SQLite storage engine; memory changes; database-only live declarations; partial publication; unsupported WAL; relaxed synchronous durability; addon compilation fallback; silent lane skips; mandatory restore witness for comments delivery.
- Gate: claimed profiles pass the real SQLite shared/crash/fence/migration corpus, with the actual engine checked before WAL and the selected installation lane qualified. Live uses L3a-Engram-Adapter L1/L2; comments support is advertised only after C3. No live numerical pass or deployment is inferred from storage hardening.

## L3b-P — Shared Durable Postgres And Application Composition (LIVE §9; L3a v4.1 §§14, 16–17) — cluster-mesh and Sentropic application

- [ ] L3b-P-Core, cluster-mesh: harden the applicable P1/P2a/P2u/P2g/P2b-J/P2b-M/P2c profiles after their proofs and P3. The reusable backend uses an injected driver and package-owned journal by default.
- [ ] L3b-P-App, application: consume qualified reusable profiles; provide the driver/session bridge, pool operation, credentials, host migration/history attachment and optional qualified existing-outbox binding. Reuse the shared storage algorithms.
- [ ] RED/GUARD, Core: execute the applicable §17.4 Postgres concurrency, reader, staged-crash, generation, replay/consumer, migration/history, barrier/purge, installation and package-boundary files against the shared corpus. P3 proves a neutral injected-driver host without an application outbox or restore witness.
- [ ] RED/GUARD, App: `api/tests/api/live-store-parity.test.ts` and `api/tests/api/live-store-recovery.test.ts` prove real host composition, migration/restart behavior, complete generations, durable receipts and driver/application isolation of the reusable package.
- [ ] Comments gate: C1a and C2 consume K4/P2u with visibility-root discipline active from C1a. Require K2b getter/page denial before C1a exits, M2-W forged-HTTP refusal, and M4-I replay of C1a/C2/M2-W with `staged-units-v1` active plus measured interactive-command contention. C4b publishes imported tombstoned state and its barrier in one unit/group.
- [ ] Optional integrations: existing application outbox and R require their own claimed-profile evidence. Neither is a default prerequisite for the reusable backend or pre-Immo comments delivery.
- Allowed, Core: only the literal files in the applicable P1/P2a/P2u/P2g/P2b-J/P2b-M/P2c/P3 rows of §17.4, plus its common branch files; separate scoped branches within the twelve-file budget. R remains separate.
- Allowed, App: S:`BRANCH.md`, S:`api/src/services/cluster-mesh/postgres-live-store.ts` (host bridge/composition only), S:`api/src/services/cluster-mesh-adapter.ts`, S:`api/src/db/live-git-schema.ts`, S:`api/drizzle/0042_live_git.sql`, S:`api/drizzle/meta/_journal.json`, S:`api/tests/api/live-store-parity.test.ts`, S:`api/tests/api/live-store-recovery.test.ts`, S:`docs/operations/live-git-postgres.md`. Reserve the migration number against the receiving branch and amend the exact path if occupied.
- Forbidden: app-owned reusable storage algorithms; direct `pg`/Drizzle/application imports or pool/credential construction in cluster-mesh; private local content in product tables; partial generations; canonical rehashing or memory-schema changes; missing infrastructure treated as successful skips; automatic cutover.
- Gate: L3b-P-Core and P3 establish only the qualified reusable profiles; L3b-P-App proves actual host migration/recovery/composition. Comments delivery follows §17.2 M2-W/M3-S/C4/M4-I and existing receiving-host gates independently of SQLite and live Q. Live production qualification retains Q; operational activation waits for L8 and applicable installed host gates.
```
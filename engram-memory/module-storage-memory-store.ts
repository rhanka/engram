/**
 * Canonical memory store over the injected neutral L3a module storage port.
 *
 * This adapter is the Engram-side code behind the provisional public
 * constructor `openModuleStorageCanonicalMemoryStoreV1` (amendment §1.2,
 * §12; binding §6). It consumes one host-provisioned neutral handle for
 * `moduleId: 'engram-memory'`, binds it under the authoritative scope
 * binding of binding §7, acquires the canonical-instance fence of
 * binding §9 before any operation, and implements exactly
 * `CanonicalMemoryStorePort` by translating each port call into the
 * atomic units of binding §5. The memory journal/fold semantics stay the
 * definition of the resulting state: every mutation is first computed on
 * a scratch copy of the proven in-memory core, then persisted as one
 * neutral unit, and only adopted on durable success.
 *
 * The adapter never selects a driver, resolves a DSN, credential, pool,
 * filename, or backend by name, and opens nothing at import time. It
 * imports no cluster-mesh package and no database driver.
 *
 * Provisional status: the constructor name, the descriptor digest domain,
 * and the neutral wire shapes it consumes are binding values to co-sign
 * (C2/C5/C6). Post-restart original-receipt replay requires the R-G4-7
 * scoped commit-result lookup (C4): when the port does not provide it, a
 * replay that needs stored bytes refuses instead of substituting a
 * recomputed receipt. Multiprocess exclusion and durable crash behavior
 * are backend qualifications (C3/C8, stage B) and stay `unverified` here.
 */
import { canonicalizeJcs } from "./canonical-json.js";
import {
  createInMemoryCanonicalMemoryStoreV1,
  foldMemoryJournalV1,
  type InMemoryCanonicalMemoryStoreV1,
  type InMemoryStoreStateV1,
  type MemoryJournalEventV1,
} from "./memory-store.js";
import { receiptDigest } from "./digests.js";
import { deriveAcceptedLexicalDocumentsV1 } from "./logical-backup.js";
import { markFencedStoreV1 } from "./store-factory.js";
import type {
  AcceptedCandidateSnapshotV1,
  AdmissionStoreInputV1,
  CanonicalMemoryStorePort,
  CanonicalStoreCapabilitiesV1,
  CanonicalTransactionReceiptV1,
  CaptureIdempotencyRecordV1,
  ClockPort,
  Cursor,
  Digest,
  Instant,
  LifecycleCommandV1,
  LifecycleEventV2,
  LogicalBackupImportInputV1,
  LogicalBackupImportReceiptV1,
  MemoryErrorCode,
  MemoryOperation,
  MemoryRecordV2,
  OpaqueRef,
  OperationalCapabilityReceiptV1,
  PendingCandidateSnapshotV1,
  PersistedAdmissionOutcomeV1,
  PersistedCaptureIdempotencyV1,
  ProjectionBatchV1,
  ProjectionInvalidationReceiptV1,
  RecoveryCheckpointManifestV1,
  Result,
  RevalidationPacketV1,
  RevalidationRequestV1,
} from "./contracts/index.js";
import {
  MEMORY_CONTRACT_DIGEST,
  MEMORY_REQUIRED_PROFILES,
  compareU64,
  isCanonicalU64,
  memoryCaptureKey,
  memoryControlKey,
  memoryEnvelopeKey,
  memoryJournalChain,
  memoryLexicalKey,
  memoryOutcomeKey,
  memoryOutboxKey,
  memoryRecordKey,
  memoryStateKey,
  memoryStoreMetaKey,
  memoryZeroHash,
  neutralJcs,
  nextU64,
  type NeutralAggregateUpdate,
  type NeutralAtomicUnit,
  type NeutralChainAppend,
  type NeutralEncodedValue,
  NeutralStorageError,
  type NeutralMemoryHandle,
  type NeutralModuleTransaction,
  type NeutralRecordWrite,
  type NeutralScopeGrant,
  type NeutralStorageScope,
  type NeutralWorkLimits,
  type NeutralWriterFence,
} from "./module-storage-neutral.js";

/** Authoritative scope binding for one canonical store (binding §7.2). */
export interface MemoryScopeBindingV1 {
  /** The one L3a scope this store serves. */
  readonly scope: { readonly tenantId: string; readonly workspaceId: string };
  /** Durable identity of this canonical store and its journal. */
  readonly store_id: OpaqueRef;
  /**
   * Host authority binding one opaque `scope_ref` to the tenant/workspace
   * pair it belongs to, or null when unknown. Composition-only: never
   * serialized into a memory DTO, a stored value, or a receipt.
   */
  readonly resolveScope: (scope_ref: OpaqueRef) => { readonly tenantId: string; readonly workspaceId: string } | null;
}

/** Composition contract of the provisional constructor (amendment §1.2, binding §6.2). */
export interface ModuleStorageMemoryStoreOptionsV1 {
  /** Host-provisioned neutral handle for `moduleId: 'engram-memory'`. Engram never constructs a backend. */
  readonly handle: NeutralMemoryHandle;
  /** Authoritative scope binding for this store (binding §7). */
  readonly scope_binding: MemoryScopeBindingV1;
  /** Host-issued grant: module `engram-memory`, the bound scope, exactly `['read', 'write']`. */
  readonly grant: NeutralScopeGrant;
  /** Engram clock: the single time source for `committed_at` sampling and receipts. */
  readonly clock: ClockPort;
  /** Acquisition deadline for construction. */
  readonly deadline_at: Instant;
  /** Optional composition work limits: may raise a qualified bound, never weaken a refusal. */
  readonly work_limits?: MemoryWorkLimitsV1;
}

/** Composition work limits: upper bounds only (binding §4.3). */
export interface MemoryWorkLimitsV1 {
  readonly maxRecords?: number;
  readonly maxEncodedBytes?: number;
}

const SINGLE_EVENT_LIMITS: NeutralWorkLimits = { maxAppends: 1, maxRecords: 8, maxEncodedBytes: 1048576 };
const COMPLETION_LIMITS: NeutralWorkLimits = { maxAppends: 1, maxRecords: 1, maxEncodedBytes: 65536 };

function refuse<T>(operation: MemoryOperation, code: MemoryErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, operation, message, retryable: false } };
}

function isInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function isDigest(value: unknown): value is Digest {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isOpaque(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  try {
    return value.normalize("NFC") === value;
  } catch {
    return false;
  }
}

function sameScope(left: NeutralStorageScope, right: NeutralStorageScope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function sameOperations(operations: ReadonlyArray<string>): boolean {
  return operations.length === 2 && operations.includes("read") && operations.includes("write");
}

/**
 * Storage → memory error mapping (binding §9.7). No new memory error code is created.
 * The mapping reads the neutral `code` contractually, never by class identity:
 * the reference backend and the adapter may load distinct copies of the
 * vendored declarations, and a qualified backend raises its own typed
 * failures carrying the co-signed codes.
 */
const NEUTRAL_CODES = new Set([
  "fence-lost", "fence-conflict", "unauthorized", "authorization-expired",
  "authorization-revoked", "capability-unavailable", "cas-conflict",
  "digest-conflict", "limit-exceeded", "store-unavailable", "not-found", "invalid-schema",
]);

function neutralCodeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && NEUTRAL_CODES.has(code) ? code : undefined;
}

function mapStorageError(operation: MemoryOperation, error: unknown): { code: MemoryErrorCode; message: string; latch: boolean } {
  const neutralCode = neutralCodeOf(error);
  const message = error instanceof Error ? error.message : "neutral port failed";
  if (neutralCode !== undefined) {
    switch (neutralCode) {
      case "fence-lost":
      case "fence-conflict":
        return { code: "FENCE_LOST", message: message, latch: true };
      case "unauthorized":
        return { code: "UNAUTHORIZED", message: message, latch: false };
      case "authorization-expired":
        return { code: "AUTHORIZATION_EXPIRED", message: message, latch: false };
      case "authorization-revoked":
        return { code: "AUTHORIZATION_REVOKED", message: message, latch: false };
      case "capability-unavailable":
        return { code: "CAPABILITY_UNAVAILABLE", message: message, latch: false };
      case "digest-conflict":
        return { code: "DIGEST_CONFLICT", message: message, latch: false };
      case "limit-exceeded":
        return { code: "CAPABILITY_UNAVAILABLE", message: message, latch: false };
      case "cas-conflict":
      case "store-unavailable":
        return { code: "STORE_UNAVAILABLE", message: message, latch: false };
      case "not-found":
        return { code: "NOT_FOUND", message: message, latch: false };
      case "invalid-schema":
        return { code: "INVALID_SCHEMA", message, latch: false };
    }
  }
  return { code: "STORE_UNAVAILABLE", message, latch: false };
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalizeJcs(value)) as T;
}

interface HydratedState extends InMemoryStoreStateV1 {
  k7Versions: Map<string, string>;
}

function checkOptions(options: ModuleStorageMemoryStoreOptionsV1): Result<{ scope: NeutralStorageScope; storeId: string }> {
  const operation = "admin" as const;
  const handle = (options as { handle?: unknown }).handle as NeutralMemoryHandle | undefined;
  if (handle === undefined || typeof handle !== "object"
    || typeof handle.transact !== "function" || typeof handle.query !== "function"
    || typeof handle.readAggregate !== "function"
    || typeof handle.acquireFence !== "function" || typeof handle.checkFence !== "function"
    || typeof handle.releaseFence !== "function") {
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "neutral port does not provide the required storage behaviour");
  }
  if (handle.moduleId !== "engram-memory") {
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "neutral handle is bound to another module");
  }
  if (handle.descriptor === undefined || handle.descriptor.contractDigest !== MEMORY_CONTRACT_DIGEST) {
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "neutral descriptor digest does not match the memory binding");
  }
  const advertised = new Set(handle.profiles.map((profile) => profile.name));
  for (const required of MEMORY_REQUIRED_PROFILES) {
    if (!advertised.has(required)) {
      return refuse(operation, "CAPABILITY_UNAVAILABLE", `neutral port does not advertise required profile ${required}`);
    }
  }
  const binding = (options as { scope_binding?: unknown }).scope_binding as MemoryScopeBindingV1 | undefined;
  const scope = binding?.scope;
  if (binding === undefined || scope === undefined || typeof scope.tenantId !== "string" || scope.tenantId.length === 0
    || typeof scope.workspaceId !== "string" || scope.workspaceId.length === 0) {
    return refuse(operation, "INVALID_SCHEMA", "scope binding names no tenant/workspace pair");
  }
  if (!isOpaque(binding.store_id) || typeof binding.resolveScope !== "function") {
    return refuse(operation, "INVALID_SCHEMA", "scope binding carries no store identity or resolver");
  }
  const grant = (options as { grant?: unknown }).grant as NeutralScopeGrant | undefined;
  if (grant === undefined || typeof grant !== "object" || typeof grant.token !== "string" || grant.token.length === 0) {
    return refuse(operation, "INVALID_SCHEMA", "no host grant was supplied");
  }
  if (grant.moduleId !== "engram-memory" || !sameScope(grant.scope, scope) || !sameOperations(grant.operations)) {
    return refuse(operation, "UNAUTHORIZED", "grant does not bind module engram-memory with exactly read+write on the store scope");
  }
  if (grant.lifetime.kind === "lease" && !isInstant(grant.lifetime.expiresAt)) {
    return refuse(operation, "INVALID_SCHEMA", "grant lifetime is malformed");
  }
  if (typeof options.clock?.now !== "function" || !isInstant(options.deadline_at)) {
    return refuse(operation, "INVALID_SCHEMA", "clock or construction deadline is malformed");
  }
  const checkedBinding: MemoryScopeBindingV1 = binding;
  return { ok: true, value: { scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId }, storeId: checkedBinding.store_id } };
}

function checkGrantLiveness(operation: MemoryOperation, grant: NeutralScopeGrant, now: string): Result<{ live: true }> {
  if (grant.lifetime.kind === "lease" && Date.parse(now) >= Date.parse(grant.lifetime.expiresAt)) {
    return refuse(operation, "AUTHORIZATION_EXPIRED", "grant lease expired");
  }
  return { ok: true, value: { live: true } };
}

class ModuleStorageMemoryStore implements CanonicalMemoryStorePort {
  readonly version = 1 as const;
  readonly capabilities: CanonicalStoreCapabilitiesV1;
  readonly scoped_reads: CanonicalMemoryStorePort["scoped_reads"];

  constructor(
    private readonly handle: NeutralMemoryHandle,
    private readonly binding: MemoryScopeBindingV1,
    private readonly scope: NeutralStorageScope,
    private readonly grant: NeutralScopeGrant,
    private readonly clock: ClockPort,
    private readonly fence: NeutralWriterFence,
    private core: InMemoryCanonicalMemoryStoreV1,
    private readonly k7Versions: Map<string, string>,
    private readonly singleEventLimits: NeutralWorkLimits,
    private readonly commitRecovery: boolean,
    private latched = false,
    private closed = false,
    private mutex: Promise<void> = Promise.resolve(),
  ) {
    this.capabilities = {
      atomic_promotion: true,
      dense_cursor: true,
      accepted_only_lexical: true,
      fenced_single_writer: true,
      revocable_active_store: true,
      detached_snapshot: false,
      bounded_cancellation: true,
      backend: handle.backend,
    };
    const store = this;
    this.scoped_reads = {
      version: 1,
      async acceptedSnapshot(input) {
        const proof = await store.proof("recall_current");
        if (!proof.ok) return proof;
        const resolved = store.resolve(input.scope_ref, "recall_current");
        if (!resolved.ok) return resolved;
        return store.coreAcceptedSnapshot(input);
      },
      async readRecord(input) {
        const proof = await store.proof("recall_current");
        if (!proof.ok) return proof;
        const resolved = store.resolve(input.scope_ref, "recall_current");
        if (!resolved.ok) return resolved;
        const inner = store.core.scoped_reads;
        if (inner === undefined) return refuse("recall_current", "CAPABILITY_UNAVAILABLE", "scoped reads are unavailable");
        return inner.readRecord(input);
      },
    };
  }

  private resolve(scopeRef: OpaqueRef, operation: MemoryOperation): Result<{ bound: true }> {
    let resolved: { readonly tenantId: string; readonly workspaceId: string } | null;
    try {
      resolved = this.binding.resolveScope(scopeRef);
    } catch {
      return refuse(operation, "UNAUTHORIZED", "scope authority did not resolve");
    }
    if (resolved === null || !sameScope(resolved, this.scope)) {
      return refuse(operation, "UNAUTHORIZED", "scope_ref does not belong to this store scope");
    }
    return { ok: true, value: { bound: true } };
  }

  private async proof(operation: MemoryOperation): Promise<Result<{ live: true }>> {
    if (this.closed) return { ok: true, value: { live: true } };
    if (this.latched) return refuse(operation, "FENCE_LOST", "canonical fence was lost");
    const now = this.clock.now();
    if (!isInstant(now)) return refuse(operation, "STORE_UNAVAILABLE", "clock did not supply a canonical instant");
    const liveness = checkGrantLiveness(operation, this.grant, now);
    if (!liveness.ok) return liveness;
    try {
      await this.handle.checkFence(this.grant, this.fence);
      return { ok: true, value: { live: true } };
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      if (mapped.latch) this.latched = true;
      return refuse(operation, mapped.code, mapped.message);
    }
  }

  /**
   * Serializes staging and adoption (binding §§5.1, 8.1–8.3): the
   * scratch-compute → transact → adopt sequence of one mutation never
   * interleaves with another's, so concurrent capture and registry
   * completion cannot lose a committed event.
   */
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.mutex;
    let release: (() => void) | undefined;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release!();
    }
  }

  private snapshot(): Result<InMemoryStoreStateV1> {
    return this.core.exportStateForPersistence();
  }

  private fork(state: InMemoryStoreStateV1): InMemoryCanonicalMemoryStoreV1 {
    return createInMemoryCanonicalMemoryStoreV1({
      clock: this.clock,
      store_id: this.binding.store_id,
      storage_epoch: this.fence.epoch,
      persistence: clone(state),
    });
  }

  private async coreAcceptedSnapshot(
    input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0] & { scope_ref?: OpaqueRef },
  ): Promise<Result<AcceptedCandidateSnapshotV1>> {
    const inner = this.core.scoped_reads;
    if (inner !== undefined && (input as { scope_ref?: OpaqueRef }).scope_ref !== undefined) {
      return inner.acceptedSnapshot(input as Parameters<NonNullable<CanonicalMemoryStorePort["scoped_reads"]>["acceptedSnapshot"]>[0]);
    }
    return this.observedRead("recall_current", (scratch) => scratch.acceptedSnapshot(input));
  }

  /**
   * Reads that may observe maintenance expiry run on a scratch fork: new
   * expiry events commit as single-event units before the read completes,
   * exactly as the core observes them (binding §4.3).
   */
  private async observedRead<T>(
    operation: MemoryOperation,
    run: (scratch: InMemoryCanonicalMemoryStoreV1) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    return this.exclusive(async () => {
      const before = this.snapshot();
      if (!before.ok) return before;
      const scratch = this.fork(before.value);
      const result = await run(scratch);
      if (!result.ok) return result;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      if (after.value.journal.length === before.value.journal.length) return result;
      const maintenance = await this.persistDiff(operation, before.value, after.value, {
        receipt: undefined,
        limits: this.singleEventLimits,
      });
      if (!maintenance.ok) return maintenance;
      this.core = scratch;
      return result;
    });
  }

  /**
   * Persists a scratch-computed transition as neutral units and returns the
   * memory receipt. The live core advances only on durable success (or on
   * reconciled success after an uncertain commit).
   */
  private async persistDiff(
    operation: MemoryOperation,
    before: InMemoryStoreStateV1,
    after: InMemoryStoreStateV1,
    plan: {
      receipt: CanonicalTransactionReceiptV1 | undefined;
      importReceipt?: LogicalBackupImportReceiptV1;
      idempotencyKey?: string;
      limits: NeutralWorkLimits;
      completion?: true;
    },
  ): Promise<Result<{ adopted: true }>> {
    const units = buildUnits(before, after, plan, this.k7Versions);
    if (!units.ok) return units;
    for (const unit of units.value) {
      const committed = await this.commitUnit(operation, unit.unit, unit.idempotencyKey, unit.limits);
      if (!committed.ok) return committed;
      for (const [candidate, version] of unit.k7Writes) this.k7Versions.set(candidate, version);
    }
    return { ok: true, value: { adopted: true } };
  }

  private async commitUnit(
    operation: MemoryOperation,
    unit: NeutralAtomicUnit,
    idempotencyKey: string,
    limits: NeutralWorkLimits,
  ): Promise<Result<{ committed: true }>> {
    if (this.closed) return refuse(operation, "STORE_UNAVAILABLE", "canonical store is closed");
    if (this.latched) return refuse(operation, "FENCE_LOST", "canonical fence was lost");
    // Revalidation after staging waits, before the first mutating statement (binding §9.4 rule 2).
    const beforeCommit = await this.proof(operation);
    if (!beforeCommit.ok) return beforeCommit;
    try {
      await this.handle.transact({ limits, idempotencyKey, grant: this.grant, fence: this.fence }, async (transaction) => {
        // In-transaction fence proof: loss during the unit rolls the whole unit back (binding §9.4 rule 3).
        await this.handle.checkFence(this.grant, this.fence);
        // Replay classification precedes any append, inside the transaction (binding §§5.3, 8.2 rule 2).
        const replay = await transaction.findIdempotency({ commitIdentity: idempotencyKey });
        if (replay !== null) {
          const expected = expectedIntentHash(unit);
          if (replay.intentHash !== expected) {
            throw new NeutralStorageError("digest-conflict", "commit identity is bound to a different unit");
          }
          return;
        }
        // Allocation read inside the transaction (binding §8.1 rule 1): the
        // head expectation and the dense cursor are verified against the
        // committed chain state before any write.
        await this.verifyAllocationInTx(transaction, unit, operation);
        // Aggregate guards inside the transaction (binding §§3.3, 5.1 rule 5).
        await this.verifyAggregateGuardsInTx(transaction, unit, operation);
        // Receipt sampling inside the transaction (binding §8.3 rule 2): the
        // live epoch and a fresh clock sample are bound into the moduleResult.
        const resampled: NeutralAtomicUnit = { ...unit, moduleResult: this.resampleModuleResult(unit) };
        await transaction.apply(resampled);
      });
      // Final validation sits with the backend's effective COMMIT/ROLLBACK decision (binding §9.4 rule 4):
      // the backend revalidates fence + grant at publish; a loss there surfaces as FENCE_LOST below.
      return { ok: true, value: { committed: true } };
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      if (mapped.latch) this.latched = true;
      if (mapped.code === "STORE_UNAVAILABLE" && await this.reconcile(idempotencyKey)) {
        return { ok: true, value: { committed: true } };
      }
      return refuse(operation, mapped.code, mapped.message);
    }
  }

  /**
   * Allocation read inside the transaction (binding §8.1 rule 1): the unit's
   * head expectations and dense cursors are verified against the committed
   * chain state read in-transaction, before any write of this unit.
   */
  private async verifyAllocationInTx(
    transaction: NeutralModuleTransaction,
    unit: NeutralAtomicUnit,
    operation: MemoryOperation,
  ): Promise<void> {
    void operation;
    if (unit.appends.length === 0) return;
    const chain = memoryJournalChain();
    const cursors: string[] = [];
    let head = memoryZeroHash();
    let after: string | undefined;
    for (;;) {
      const page = await transaction.readChain({ chain, afterAllocation: after, limit: 500 });
      if (page.records.length === 0) break;
      for (const record of page.records) {
        const body = parseJson<{ cursor?: unknown; event_hash?: unknown }>(record.value.data);
        if (typeof body?.cursor !== "string" || !isCanonicalU64(body.cursor)) {
          throw new NeutralStorageError("invalid-schema", "committed chain record carries no canonical cursor");
        }
        cursors.push(body.cursor);
        head = record.hash;
        after = body.cursor;
      }
    }
    const allocation = cursors.length === 0 ? "0" : cursors[cursors.length - 1]!;
    for (const [index, append] of unit.appends.entries()) {
      const body = parseJson<{ cursor?: unknown }>(append.value.data);
      if (typeof body?.cursor !== "string") {
        throw new NeutralStorageError("invalid-schema", "append carries no cursor");
      }
      const priorCursor = index === 0 ? allocation : parseJson<{ cursor?: unknown }>(unit.appends[index - 1]!.value.data)?.cursor;
      const base = index === 0 ? allocation : (typeof priorCursor === "string" ? priorCursor : undefined);
      if (base === undefined) throw new NeutralStorageError("invalid-schema", "append chain is not dense");
      if (nextU64(base) !== body.cursor) {
        throw new NeutralStorageError("cas-conflict", "append cursor does not extend the committed allocation");
      }
      const expectation = append.expectation;
      if (expectation.kind === "absent") {
        if (cursors.length !== 0 || expectation.allocation !== allocation) {
          throw new NeutralStorageError("cas-conflict", "genesis expectation does not hold");
        }
      } else if (index === 0 && expectation.hash !== head) {
        throw new NeutralStorageError("cas-conflict", "stale chain head");
      }
    }
  }

  /**
   * Aggregate guards inside the transaction (binding §§3.3, 5.1 rule 5):
   * every aggregate write presents a version strictly above the committed
   * version read in-transaction; declared aggregate-version guards are
   * enforced the same way.
   */
  private async verifyAggregateGuardsInTx(
    transaction: NeutralModuleTransaction,
    unit: NeutralAtomicUnit,
    operation: MemoryOperation,
  ): Promise<void> {
    void operation;
    for (const guard of unit.guards) {
      if (guard.kind === "chain-head" || guard.kind === "chain-absent") continue;
      if (guard.aggregateKind === undefined || guard.aggregateKey === undefined || guard.version === undefined) {
        throw new NeutralStorageError("invalid-schema", "aggregate guard names no versioned aggregate");
      }
      const current = await transaction.readAggregate(guard.aggregateKind, guard.aggregateKey);
      if (current !== null && BigInt(guard.version) <= BigInt(current.version)) {
        throw new NeutralStorageError("cas-conflict", "stale aggregate guard version");
      }
    }
    for (const update of unit.updates) {
      const current = await transaction.readAggregate(update.kind, update.key);
      if (current !== null && BigInt(update.version) <= BigInt(current.version)) {
        throw new NeutralStorageError("cas-conflict", "stale aggregate version");
      }
    }
  }

  /**
   * Receipt sampling inside the transaction (binding §8.3 rule 2): the live
   * epoch and a fresh clock sample are bound into the unit's moduleResult;
   * the digest is recomputed last. Non-receipt payloads pass through.
   */
  private resampleModuleResult(unit: NeutralAtomicUnit): NeutralEncodedValue | undefined {
    if (unit.moduleResult === undefined) return undefined;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(unit.moduleResult.data) as Record<string, unknown>;
    } catch {
      return unit.moduleResult;
    }
    if (typeof body["operation"] !== "string" || typeof body["cursor"] !== "string") return unit.moduleResult;
    const now = this.clock.now();
    if (!isInstant(now)) throw new NeutralStorageError("store-unavailable", "clock did not supply a canonical instant");
    const { receipt_digest: _stale, storage_epoch: _epoch, committed_at: _at, ...rest } = body;
    void _stale; void _epoch; void _at;
    const stamped = { ...rest, storage_epoch: this.fence.epoch, committed_at: now };
    return neutralJcs({ ...stamped, receipt_digest: receiptDigest("canonical-transaction", stamped) });
  }

  /**
   * Uncertain-outcome reconciliation (binding §8.2 rule 3): look the commit
   * identity up and retrieve the stored original before any new effect.
   * A found proof means the effect is durable; anything else stays a refusal
   * with the live core untouched.
   */
  private async reconcile(idempotencyKey: string): Promise<boolean> {
    const readCommitResult = this.handle.readCommitResult;
    if (this.commitRecovery !== true || readCommitResult === undefined) return false;
    try {
      await this.handle.checkFence(this.grant, this.fence);
      const stored = await readCommitResult.call(this.handle, idempotencyKey, this.grant);
      return stored !== null && decodeReceipt(stored) !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Stored original receipt for a replayed event (binding §8.3 rule 4):
   * decoded and returned exactly, never resampled. When the port cannot
   * recover commit results (C4 open), the replay refuses instead of
   * substituting a recomputed receipt.
   */
  private async originalReceipt(operation: MemoryOperation, eventId: string): Promise<Result<CanonicalTransactionReceiptV1>> {
    const readCommitResult = this.handle.readCommitResult;
    if (this.commitRecovery !== true || readCommitResult === undefined) {
      return refuse(operation, "STORE_UNAVAILABLE", "original commit proof is unavailable without commit-result recovery");
    }
    let stored: NeutralEncodedValue | null;
    try {
      await this.handle.checkFence(this.grant, this.fence);
      stored = await readCommitResult.call(this.handle, eventId, this.grant);
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      if (mapped.latch) this.latched = true;
      return refuse(operation, mapped.code, mapped.message);
    }
    if (stored === null) {
      return refuse(operation, "STORE_UNAVAILABLE", "original commit proof is unavailable without commit-result recovery");
    }
    const decoded = decodeReceipt(stored);
    if (decoded === undefined) return refuse(operation, "JOURNAL_CORRUPT", "stored commit proof does not verify");
    return { ok: true, value: decoded };
  }

  async commitPending(
    input: Parameters<CanonicalMemoryStorePort["commitPending"]>[0],
  ): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.exclusive(async () => {
      const proof = await this.proof("capture");
      if (!proof.ok) return proof;
      // GAP-G2-1: the three DTOs carry no scope_ref, so the store layer performs
      // no scope resolution and no cross-scope refusal inside commitPending itself.
      const before = this.snapshot();
      if (!before.ok) return before;
      const scratch = this.fork(before.value);
      const computed = await scratch.commitPending(input);
      if (!computed.ok) return computed;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      if (after.value.journal.length === before.value.journal.length) {
        const original = after.value.journal.find(
          (event) => event.operation === "capture" && event.candidate_id === input.control.candidate_id,
        );
        if (original === undefined) return refuse("capture", "JOURNAL_CORRUPT", "replayed capture binds no journal event");
        return this.originalReceipt("capture", original.event_id);
      }
      const event = after.value.journal[after.value.journal.length - 1]!;
      const persisted = await this.persistDiff("capture", before.value, after.value, {
        receipt: computed.value,
        idempotencyKey: event.event_id,
        limits: this.singleEventLimits,
      });
      if (!persisted.ok) return persisted;
      this.core = scratch;
      return computed;
    });
  }

  async readPending(
    input: Parameters<CanonicalMemoryStorePort["readPending"]>[0],
  ): Promise<Result<PendingCandidateSnapshotV1>> {
    const proof = await this.proof("request_admission");
    if (!proof.ok) return proof;
    return this.core.readPending(input);
  }

  async readCaptureIdempotency(
    input: { candidate_id: string },
  ): Promise<Result<CaptureIdempotencyRecordV1>> {
    const proof = await this.proof("capture");
    if (!proof.ok) return proof;
    return this.core.readCaptureIdempotency(input);
  }

  async readCaptureIdempotencyEntries(
    input: { through_cursor: Cursor },
  ): Promise<Result<ReadonlyArray<PersistedCaptureIdempotencyV1>>> {
    const proof = await this.proof("backup");
    if (!proof.ok) return proof;
    return this.core.readCaptureIdempotencyEntries(input);
  }

  async recordCaptureIdempotency(
    input: { candidate_id: string; record_digest: Digest },
  ): Promise<Result<CaptureIdempotencyRecordV1>> {
    return this.exclusive(async () => {
      const proof = await this.proof("capture");
      if (!proof.ok) return proof;
      const before = this.snapshot();
      if (!before.ok) return before;
      const scratch = this.fork(before.value);
      const computed = await scratch.recordCaptureIdempotency(input);
      if (!computed.ok) return computed;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      const changed = diffK7(before.value.capture_idempotency ?? [], after.value.capture_idempotency ?? []);
      if (changed === undefined) return computed;
      // Registry completion unit: admissible positive ceiling, zero appends enforced by the adapter.
      const persisted = await this.persistDiff("capture", before.value, after.value, {
        receipt: undefined,
        idempotencyKey: `capture-completion:${input.candidate_id}`,
        limits: COMPLETION_LIMITS,
        completion: true,
      });
      if (!persisted.ok) return persisted;
      this.core = scratch;
      return computed;
    });
  }

  async readAdmissionOutcome(
    input: { candidate_id: string },
  ): Promise<Result<PersistedAdmissionOutcomeV1>> {
    const proof = await this.proof("request_admission");
    if (!proof.ok) return proof;
    return this.core.readAdmissionOutcome(input);
  }

  async applyAdmission(
    input: AdmissionStoreInputV1,
  ): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.exclusive(async () => {
      const scopeRef = input.outcome === "accept" ? input.record.scope_ref : input.scope_ref;
      const bound = this.resolve(scopeRef, "request_admission");
      if (!bound.ok) return bound;
      const proof = await this.proof("request_admission");
      if (!proof.ok) return proof;
      const before = this.snapshot();
      if (!before.ok) return before;
      const scratch = this.fork(before.value);
      const computed = await scratch.applyAdmission(input);
      if (!computed.ok) return computed;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      if (after.value.journal.length === before.value.journal.length) {
        const original = after.value.journal.find(
          (event) => (event.operation === "accept" || event.operation === "reject") && event.candidate_id === input.candidate_id,
        );
        if (original === undefined) return refuse("request_admission", "JOURNAL_CORRUPT", "replayed admission binds no journal event");
        return this.originalReceipt("request_admission", original.event_id);
      }
      const event = after.value.journal[after.value.journal.length - 1]!;
      const persisted = await this.persistDiff("request_admission", before.value, after.value, {
        receipt: computed.value,
        idempotencyKey: event.event_id,
        limits: this.singleEventLimits,
      });
      if (!persisted.ok) return persisted;
      this.core = scratch;
      return computed;
    });
  }

  async applyLifecycle(
    input: Parameters<CanonicalMemoryStorePort["applyLifecycle"]>[0],
  ): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.exclusive(async () => {
      const proof = await this.proof(input.command.operation);
      if (!proof.ok) return proof;
      const before = this.snapshot();
      if (!before.ok) return before;
      const commandTargets = input.command as LifecycleCommandV1 & { record_id?: string };
      if (commandTargets.record_id !== undefined) {
        const blob = before.value.records.find((record) => record.record_id === commandTargets.record_id);
        if (blob !== undefined) {
          const bound = this.resolve(blob.scope_ref, input.command.operation);
          if (!bound.ok) return bound;
        }
      }
      // Candidate operations carry no scope_ref in their DTOs: same open gap as
      // commitPending (GAP-G2-1); the engine authorization check stays the control.
      const scratch = this.fork(before.value);
      const computed = await scratch.applyLifecycle(input);
      if (!computed.ok) return computed;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      if (after.value.journal.length === before.value.journal.length) {
        const original = after.value.journal.find((event) => event.event_id === input.event.event_id);
        if (original === undefined) return refuse(input.command.operation, "JOURNAL_CORRUPT", "replayed lifecycle binds no journal event");
        return this.originalReceipt(input.command.operation, original.event_id);
      }
      const event = after.value.journal[after.value.journal.length - 1]!;
      const persisted = await this.persistDiff(input.command.operation, before.value, after.value, {
        receipt: computed.value,
        idempotencyKey: event.event_id,
        limits: this.singleEventLimits,
      });
      if (!persisted.ok) return persisted;
      this.core = scratch;
      return computed;
    });
  }

  async readRecord(
    input: Parameters<CanonicalMemoryStorePort["readRecord"]>[0],
  ): Promise<Result<MemoryRecordV2>> {
    const proof = await this.proof("recall_current");
    if (!proof.ok) return proof;
    return this.core.readRecord(input);
  }

  async acceptedSnapshot(
    input: Parameters<CanonicalMemoryStorePort["acceptedSnapshot"]>[0],
  ): Promise<Result<AcceptedCandidateSnapshotV1>> {
    const proof = await this.proof("recall_current");
    if (!proof.ok) return proof;
    return this.observedRead("recall_current", (scratch) => scratch.acceptedSnapshot(input));
  }

  async revalidate(
    input: RevalidationRequestV1,
  ): Promise<Result<RevalidationPacketV1>> {
    const proof = await this.proof(input.operation);
    if (!proof.ok) return proof;
    return this.observedRead(input.operation, (scratch) => scratch.revalidate(input));
  }

  async revalidateReadOnly(
    input: RevalidationRequestV1,
  ): Promise<Result<RevalidationPacketV1>> {
    const proof = await this.proof(input.operation);
    if (!proof.ok) return proof;
    return this.core.revalidateReadOnly(input);
  }

  async readJournal(
    input: Parameters<CanonicalMemoryStorePort["readJournal"]>[0],
  ): Promise<Result<ReadonlyArray<LifecycleEventV2>>> {
    const proof = await this.proof("admin");
    if (!proof.ok) return proof;
    return this.core.readJournal(input);
  }

  async importLogicalBackup(
    input: LogicalBackupImportInputV1,
  ): Promise<Result<LogicalBackupImportReceiptV1>> {
    return this.exclusive(async () => {
      for (const record of input.records) {
        const bound = this.resolve(record.scope_ref, "restore");
        if (!bound.ok) return bound;
      }
      const proof = await this.proof("restore");
      if (!proof.ok) return proof;
      const before = this.snapshot();
      if (!before.ok) return before;
      const scratch = this.fork(before.value);
      const importBackup = scratch.importLogicalBackup;
      if (importBackup === undefined) return refuse("restore", "CAPABILITY_UNAVAILABLE", "logical backup import is unavailable");
      const computed = await importBackup.call(scratch, input);
      if (!computed.ok) return computed;
      const after = scratch.exportStateForPersistence();
      if (!after.ok) return after;
      const newEvents = after.value.journal.length - before.value.journal.length;
      const newBlobs = after.value.records.length - before.value.records.length;
      const persisted = await this.persistDiff("restore", before.value, after.value, {
        receipt: computed.value as unknown as CanonicalTransactionReceiptV1,
        importReceipt: computed.value,
        idempotencyKey: `logical-backup:${computed.value.restored_cursor}:${computed.value.canonical_state_digest}`,
        limits: {
          maxAppends: Math.max(1, newEvents),
          maxRecords: Math.max(1, newBlobs),
          maxEncodedBytes: Math.max(1048576, this.singleEventLimits.maxEncodedBytes),
        },
      });
      if (!persisted.ok) return persisted;
      this.core = scratch;
      return computed;
    });
  }

  async checkpoint(
    input: Parameters<CanonicalMemoryStorePort["checkpoint"]>[0],
  ): Promise<Result<RecoveryCheckpointManifestV1>> {
    const proof = await this.proof("admin");
    if (!proof.ok) return proof;
    const manifest = await this.core.checkpoint(input);
    if (!manifest.ok) return manifest;
    // The live epoch is stamped at checkpoint time; the digest is recomputed
    // over the stamped body, preserving the existing durable-adapter behaviour.
    const { manifest_digest: _stale, ...body } = manifest.value;
    void _stale;
    const stamped = { ...body, storage_epoch: this.fence.epoch };
    return { ok: true, value: { ...stamped, manifest_digest: receiptDigest("recovery-checkpoint", stamped) } };
  }

  async nextProjectionBatch(
    input: Parameters<CanonicalMemoryStorePort["nextProjectionBatch"]>[0],
  ): Promise<Result<ProjectionBatchV1>> {
    const proof = await this.proof("projection_invalidate");
    if (!proof.ok) return proof;
    return this.core.nextProjectionBatch(input);
  }

  async acknowledgeProjection(
    input: ProjectionInvalidationReceiptV1,
  ): Promise<Result<CanonicalTransactionReceiptV1>> {
    return this.exclusive(async () => {
      const proof = await this.proof("projection_invalidate");
      if (!proof.ok) return proof;
      return this.core.acknowledgeProjection(input);
    });
  }

  async readiness(): Promise<Result<OperationalCapabilityReceiptV1>> {
    if (!this.closed && this.latched) return refuse("admin", "FENCE_LOST", "canonical fence was lost");
    if (!this.closed) {
      const proof = await this.proof("admin");
      if (!proof.ok) return proof;
    }
    const ready = await this.core.readiness();
    if (!ready.ok) return ready;
    const { receipt_digest: _stale, store_id: _store, backend: _backend, storage_epoch: _epoch, capabilities: _capabilities, ...rest } = ready.value;
    void _stale; void _store; void _backend; void _epoch; void _capabilities;
    const now = this.clock.now();
    if (!isInstant(now)) return refuse("admin", "STORE_UNAVAILABLE", "clock did not supply a canonical instant");
    const body = {
      ...rest,
      store_id: this.binding.store_id,
      backend: this.capabilities.backend,
      storage_epoch: this.fence.epoch,
      capabilities: this.capabilities,
      issued_at: now,
      expires_at: new Date(Date.parse(now) + 300_000).toISOString(),
    };
    return { ok: true, value: { ...body, receipt_digest: receiptDigest("operational-capability", body) } };
  }

  async close(): Promise<Result<{ closed: true }>> {
    if (this.closed) return { ok: true, value: { closed: true } };
    // Readers first, then the fence last (§6.4); close stays available after fence loss.
    const result = await this.core.close();
    try {
      await this.handle.releaseFence(this.fence);
    } catch {
      // Release is best-effort and acquisition-bound: a stale identity never
      // clears a successor holder; the instance is closed regardless.
    }
    this.closed = true;
    return result;
  }
}

/** Intent hash of a unit, mirroring the backend commit-identity binding (binding §5.3 rule 5). */
function expectedIntentHash(unit: NeutralAtomicUnit): string {
  const appendIds = unit.appends.map((append) => append.id);
  return canonicalizeJcs({ appends: appendIds, updates: [...appendIds, ...unit.updates.map((update) => update.key)] });
}

/** Decodes stored original receipt bytes, verifying the digest (binding §8.3 rule 4). */
function decodeReceipt(stored: NeutralEncodedValue): CanonicalTransactionReceiptV1 | undefined {
  if (stored.format !== "utf8") return undefined;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(stored.data) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) return undefined;
  const { receipt_digest: digest, ...rest } = body;
  if (!isDigest(digest)) return undefined;
  if (typeof rest["operation"] !== "string" || typeof rest["cursor"] !== "string") return undefined;
  if (receiptDigest("canonical-transaction", rest) !== digest) return undefined;
  return body as unknown as CanonicalTransactionReceiptV1;
}

/** Changed K7 entry (candidate identity, before/after), if exactly one changed. */
function diffK7(
  before: ReadonlyArray<PersistedCaptureIdempotencyV1>,
  after: ReadonlyArray<PersistedCaptureIdempotencyV1>,
): { candidate_id: string; entry: PersistedCaptureIdempotencyV1 } | undefined {
  const beforeById = new Map(before.map((entry) => [entry.candidate_id, canonicalizeJcs(entry)]));
  for (const entry of after) {
    if (beforeById.get(entry.candidate_id) !== canonicalizeJcs(entry)) return { candidate_id: entry.candidate_id, entry };
  }
  return undefined;
}

interface BuiltUnit {
  readonly unit: NeutralAtomicUnit;
  readonly idempotencyKey: string;
  readonly limits: NeutralWorkLimits;
  readonly k7Writes: ReadonlyArray<readonly [string, string]>;
}

interface UnitPlan {
  readonly receipt: CanonicalTransactionReceiptV1 | undefined;
  readonly importReceipt?: LogicalBackupImportReceiptV1;
  readonly idempotencyKey?: string;
  readonly limits: NeutralWorkLimits;
  readonly completion?: true;
}

/** Last new-event cursor referencing an entity, for aggregate versioning (binding §3.3). */
function versionCursors(newEvents: ReadonlyArray<MemoryJournalEventV1>): Map<string, string> {
  const cursors = new Map<string, string>();
  for (const event of newEvents) {
    if (event.candidate_id !== undefined) cursors.set(`candidate:${event.candidate_id}`, event.cursor);
    if (event.record_id !== undefined) cursors.set(`record:${event.record_id}`, event.cursor);
    if (event.related_record_id !== undefined) cursors.set(`record:${event.related_record_id}`, event.cursor);
  }
  return cursors;
}

/**
 * Translates a core-computed transition into neutral units (binding §5).
 * Aggregate versions are cursor-derived as decimal strings (binding §3.3);
 * K7 alone carries its cursor-independent revision (1 at creation, previous
 * + 1 at completion). The completion unit declares the admissible positive
 * ceiling `maxAppends: 1` while the adapter enforces `appends.length === 0`.
 */
function buildUnits(
  before: InMemoryStoreStateV1,
  after: InMemoryStoreStateV1,
  plan: UnitPlan,
  k7Versions: ReadonlyMap<string, string>,
): Result<BuiltUnit[]> {
  if (after.journal.length < before.journal.length) {
    return refuse("admin", "JOURNAL_CORRUPT", "computed transition rewound the journal");
  }
  for (let index = 0; index < before.journal.length; index += 1) {
    if (canonicalizeJcs(before.journal[index]) !== canonicalizeJcs(after.journal[index])) {
      return refuse("admin", "JOURNAL_CORRUPT", "computed transition rewrote journal history");
    }
  }
  const newEvents = after.journal.slice(before.journal.length);
  const cursors = versionCursors(newEvents);

  const records: NeutralRecordWrite[] = [];
  const beforeBlobIds = new Set(before.records.map((record) => record.record_id));
  for (const record of after.records) {
    if (beforeBlobIds.has(record.record_id)) continue;
    records.push({
      kind: "memory-record-blobs",
      key: memoryRecordKey(record.record_id),
      value: neutralJcs(record),
      contentHash: record.record_digest,
    });
  }

  const beforeControls = new Map(before.controls.map((control) => [control.candidate_id, canonicalizeJcs(control)]));
  const beforeEnvelopes = new Map(before.envelopes.map((sealed) => [sealed.candidate_id, canonicalizeJcs(sealed)]));
  const updates: NeutralAggregateUpdate[] = [];
  const k7Writes: Array<readonly [string, string]> = [];
  for (const control of after.controls) {
    if (beforeControls.get(control.candidate_id) === canonicalizeJcs(control)) continue;
    const cursor = cursors.get(`candidate:${control.candidate_id}`) ?? after.journal[after.journal.length - 1]?.cursor;
    if (cursor === undefined) return refuse("admin", "JOURNAL_CORRUPT", "control write names no unit cursor");
    updates.push({
      kind: "memory-pending-controls",
      key: memoryControlKey(control.candidate_id),
      value: neutralJcs(control),
      version: cursor,
    });
  }
  for (const sealed of after.envelopes) {
    if (beforeEnvelopes.get(sealed.candidate_id) === canonicalizeJcs(sealed)) continue;
    const cursor = cursors.get(`candidate:${sealed.candidate_id}`) ?? after.journal[after.journal.length - 1]?.cursor;
    if (cursor === undefined) return refuse("admin", "JOURNAL_CORRUPT", "envelope write names no unit cursor");
    updates.push({
      kind: "memory-sealed-envelopes",
      key: memoryEnvelopeKey(sealed.candidate_id),
      value: neutralJcs(sealed),
      version: cursor,
    });
  }
  // K5 fold-state entries for every entity touched by the new events.
  const folded = foldMemoryJournalV1({ journal: after.journal, records: after.records });
  if (!folded.ok) return folded;
  const touched = new Set<string>();
  for (const event of newEvents) {
    if (event.candidate_id !== undefined) touched.add(`candidate:${event.candidate_id}`);
    if (event.record_id !== undefined) touched.add(`record:${event.record_id}`);
    if (event.related_record_id !== undefined) touched.add(`record:${event.related_record_id}`);
  }
  for (const candidate of folded.value.candidates) {
    if (!touched.has(`candidate:${candidate.candidate_id}`)) continue;
    const cursor = cursors.get(`candidate:${candidate.candidate_id}`);
    if (cursor === undefined) continue;
    updates.push({
      kind: "memory-fold-state",
      key: memoryStateKey("candidate", candidate.candidate_id),
      value: neutralJcs(candidate),
      version: cursor,
    });
  }
  for (const record of folded.value.records) {
    if (!touched.has(`record:${record.record_id}`)) continue;
    const cursor = cursors.get(`record:${record.record_id}`);
    if (cursor === undefined) continue;
    updates.push({
      kind: "memory-fold-state",
      key: memoryStateKey("record", record.record_id),
      value: neutralJcs(record),
      version: cursor,
    });
  }

  const beforeBatches = new Set(before.outbox.map((batch) => batch.batch_digest));
  for (const batch of after.outbox) {
    if (beforeBatches.has(batch.batch_digest)) continue;
    records.push({
      kind: "memory-projection-outbox",
      key: memoryOutboxKey(batch.through_cursor_inclusive, batch.batch_digest),
      value: neutralJcs(batch),
      contentHash: batch.batch_digest,
    });
  }

  const beforeLexical = new Map(before.lexical.map(({ record_id, document }) => [record_id, canonicalizeJcs(document)]));
  const afterById = new Map(after.records.map((record) => [record.record_id, record]));
  const indexWrites = [];
  for (const { record_id, document } of after.lexical) {
    if (beforeLexical.get(record_id) === canonicalizeJcs(document)) continue;
    const blob = afterById.get(record_id);
    if (blob === undefined) return refuse("admin", "JOURNAL_CORRUPT", "lexical row names no record blob");
    indexWrites.push({
      index: "memory-accepted-lexical",
      key: memoryLexicalKey(blob.scope_ref, record_id),
      value: neutralJcs(document),
    });
  }

  const beforeK7 = new Map((before.capture_idempotency ?? []).map((entry) => [entry.candidate_id, canonicalizeJcs(entry)]));
  for (const entry of after.capture_idempotency ?? []) {
    if (beforeK7.get(entry.candidate_id) === canonicalizeJcs(entry)) continue;
    const previous = k7Versions.get(entry.candidate_id);
    // Imported entries reconstruct their revision: completed (record digest
    // present) means the pre-backup 1 → 2 transition already happened.
    const version = previous === undefined
      ? (entry.record_digest !== undefined ? "2" : "1")
      : nextU64(previous);
    if (version === undefined) return refuse("admin", "STORE_UNAVAILABLE", "capture registry revision is exhausted");
    updates.push({
      kind: "memory-capture-idempotency",
      key: memoryCaptureKey(entry.candidate_id),
      value: neutralJcs(entry),
      version,
    });
    k7Writes.push([entry.candidate_id, version] as const);
  }
  const beforeK8 = new Set((before.admission_outcomes ?? []).map((entry) => entry.candidate_id));
  for (const entry of after.admission_outcomes ?? []) {
    if (beforeK8.has(entry.candidate_id)) continue;
    const cursor = cursors.get(`candidate:${entry.candidate_id}`) ?? after.journal[after.journal.length - 1]?.cursor;
    if (cursor === undefined) return refuse("admin", "JOURNAL_CORRUPT", "outcome write names no unit cursor");
    updates.push({
      kind: "memory-admission-outcomes",
      key: memoryOutcomeKey(entry.candidate_id),
      value: neutralJcs(entry),
      version: cursor,
    });
  }

  const head = before.journal.length === 0
    ? memoryZeroHash()
    : before.journal[before.journal.length - 1]!.event_hash;
  const genesis = before.journal.length === 0 && newEvents.length > 0 && newEvents[0]!.cursor === "1";
  const appends: NeutralChainAppend[] = newEvents.map((event, index) => ({
    chain: memoryJournalChain(),
    kind: "memory-journal-event",
    id: event.event_id,
    hash: event.event_hash,
    value: neutralJcs(event),
    expectation: index === 0
      ? genesis && event.cursor === "1"
        ? { kind: "absent" as const, allocation: "0" }
        : { kind: "head" as const, hash: head }
      : { kind: "head" as const, hash: newEvents[index - 1]!.event_hash },
  }));

  if (plan.completion === true) {
    if (appends.length !== 0 || records.length !== 0) {
      return refuse("admin", "STORE_UNAVAILABLE", "registry completion carries no journal effect");
    }
    if (plan.idempotencyKey === undefined) return refuse("admin", "INVALID_SCHEMA", "completion names no commit identity");
    return {
      ok: true,
      value: [{
        unit: {
          guards: [],
          records: [],
          appends: [],
          updates,
          relationships: [],
          barriers: [],
          purgeIntents: [],
          indexWrites,
          moduleResult: undefined,
        },
        idempotencyKey: plan.idempotencyKey,
        limits: plan.limits,
        k7Writes,
      }],
    };
  }

  if (plan.receipt === undefined) {
    // Maintenance expiry observation (§4.3): the observed batch commits as
    // one unit with its own cursor allocations; the read completes only
    // after it commits. The batch bound fits the observed batch exactly.
    if (newEvents.length === 0) return { ok: true, value: [] };
    let bytes = 0;
    for (const item of [...records, ...appends, ...updates]) {
      bytes += new TextEncoder().encode(item.value.data).byteLength;
    }
    return {
      ok: true,
      value: [{
        unit: {
          guards: [{ kind: "chain-head", chain: memoryJournalChain(), hash: head }],
          records,
          appends,
          updates,
          relationships: [],
          barriers: [],
          purgeIntents: [],
          indexWrites,
          moduleResult: undefined,
        },
        idempotencyKey: `maintenance:${newEvents[0]!.event_id}`,
        limits: {
          maxAppends: Math.max(1, appends.length),
          maxRecords: Math.max(1, records.length),
          maxEncodedBytes: Math.max(1048576, bytes),
        },
        k7Writes,
      }],
    };
  }

  return {
    ok: true,
    value: [{
      unit: {
        guards: newEvents.length === 0
          ? []
          : [{ kind: before.journal.length === 0 ? "chain-absent" as const : "chain-head" as const, chain: memoryJournalChain(), hash: head, allocation: "0" }],
        records,
        appends,
        updates,
        relationships: [],
        barriers: [],
        purgeIntents: [],
        indexWrites,
        moduleResult: neutralJcs(plan.importReceipt ?? plan.receipt),
      },
      idempotencyKey: plan.idempotencyKey ?? newEvents[newEvents.length - 1]!.event_id,
      limits: plan.limits,
      k7Writes,
    }],
  };
}

function parseJson<T>(data: string): T | undefined {
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

async function loadJournal(
  handle: NeutralMemoryHandle,
  grant: NeutralScopeGrant,
  operation: MemoryOperation,
): Promise<Result<MemoryJournalEventV1[]>> {
  const events: MemoryJournalEventV1[] = [];
  let after = "0";
  for (;;) {
    let page: NeutralEncodedValue;
    try {
      page = await handle.query("memory-journal-page", neutralJcs({ after, limit: 2000 }), grant);
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      return refuse(operation, mapped.code, mapped.message);
    }
    const records = parseJson<Array<{ id: string; hash: string; value: NeutralEncodedValue }>>(page.data);
    if (records === undefined || !Array.isArray(records)) {
      return refuse(operation, "JOURNAL_CORRUPT", "journal page does not decode");
    }
    if (records.length === 0) break;
    for (const record of records) {
      const event = parseJson<MemoryJournalEventV1>(record.value.data);
      if (event === undefined) return refuse(operation, "JOURNAL_CORRUPT", "journal event does not decode");
      events.push(event);
      after = event.cursor;
    }
    if (records.length < 2000) break;
  }
  return { ok: true, value: events };
}

async function loadOutbox(
  handle: NeutralMemoryHandle,
  grant: NeutralScopeGrant,
  operation: MemoryOperation,
): Promise<Result<ProjectionBatchV1[]>> {
  const batches: ProjectionBatchV1[] = [];
  let after = "0";
  for (;;) {
    let page: NeutralEncodedValue;
    try {
      page = await handle.query("memory-outbox-page", neutralJcs({ after, limit: 2000 }), grant);
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      return refuse(operation, mapped.code, mapped.message);
    }
    const records = parseJson<ProjectionBatchV1[]>(page.data);
    if (records === undefined || !Array.isArray(records)) return refuse(operation, "JOURNAL_CORRUPT", "outbox page does not decode");
    if (records.length === 0) break;
    batches.push(...records);
    after = records[records.length - 1]!.through_cursor_inclusive;
    if (records.length < 2000) break;
  }
  batches.sort((left, right) => compareU64(left.through_cursor_inclusive, right.through_cursor_inclusive));
  return { ok: true, value: batches };
}

/**
 * Hydrates the core from the neutral kinds and verifies the fold, the
 * registries, and the K5 agreement (binding §6.3 step 4, §8.5). A corrupt
 * store is never opened as empty, partially, or read-only-degraded.
 */
async function hydrate(
  handle: NeutralMemoryHandle,
  grant: NeutralScopeGrant,
  operation: MemoryOperation,
): Promise<Result<HydratedState>> {
  const journal = await loadJournal(handle, grant, operation);
  if (!journal.ok) return journal;
  const events = journal.value;

  const blobs = new Map<string, MemoryRecordV2>();
  for (const event of events) {
    if (event.record_id === undefined || blobs.has(event.record_id)) continue;
    let answer: NeutralEncodedValue;
    try {
      answer = await handle.query("memory-record-by-id", neutralJcs({ record_id: event.record_id }), grant);
    } catch (error) {
      const mapped = mapStorageError(operation, error);
      return refuse(operation, mapped.code, mapped.message);
    }
    const body = parseJson<{ found: boolean; value?: NeutralEncodedValue }>(answer.data);
    if (body === undefined) return refuse(operation, "JOURNAL_CORRUPT", "record answer does not decode");
    if (body.found !== true || body.value === undefined) {
      return refuse(operation, "BLOB_MISSING", "journal event references a missing immutable record blob");
    }
    const blob = parseJson<MemoryRecordV2>(body.value.data);
    if (blob === undefined) return refuse(operation, "JOURNAL_CORRUPT", "record blob does not decode");
    blobs.set(event.record_id, blob);
  }

  const candidateIds = [...new Set(events.map((event) => event.candidate_id).filter((id): id is string => id !== undefined))];
  const controls: Array<HydratedState["controls"][number]> = [];
  const envelopes: Array<HydratedState["envelopes"][number]> = [];
  for (const candidateId of candidateIds) {
    const control = await handle.readAggregate("memory-pending-controls", memoryControlKey(candidateId), grant);
    if (control !== null) {
      const parsed = parseJson<HydratedState["controls"][number]>(control.value.data);
      if (parsed === undefined) return refuse(operation, "JOURNAL_CORRUPT", "pending control does not decode");
      controls.push(parsed);
    }
    const sealed = await handle.readAggregate("memory-sealed-envelopes", memoryEnvelopeKey(candidateId), grant);
    if (sealed !== null) {
      const parsed = parseJson<HydratedState["envelopes"][number]>(sealed.value.data);
      if (parsed === undefined) return refuse(operation, "JOURNAL_CORRUPT", "sealed envelope does not decode");
      envelopes.push(parsed);
    }
  }
  const folded = foldMemoryJournalV1({ journal: events, records: [...blobs.values()] });
  if (!folded.ok) return folded;
  const pending = new Set(
    folded.value.candidates.filter((entry) => entry.state === "pending").map((entry) => entry.candidate_id),
  );
  const keptEnvelopes = envelopes.filter((sealed) => pending.has(sealed.candidate_id));
  for (const control of controls) {
    if (!events.some((event) => event.operation === "capture" && event.candidate_id === control.candidate_id)) {
      return refuse(operation, "JOURNAL_CORRUPT", "pending control binds no capture event");
    }
  }

  const k7Versions = new Map<string, string>();
  const captureIdempotency: PersistedCaptureIdempotencyV1[] = [];
  for (const candidateId of candidateIds) {
    const stored = await handle.readAggregate("memory-capture-idempotency", memoryCaptureKey(candidateId), grant);
    if (stored === null) continue;
    if (!isCanonicalU64(stored.version)) return refuse(operation, "JOURNAL_CORRUPT", "registry version is not a canonical u64");
    const entry = parseJson<PersistedCaptureIdempotencyV1>(stored.value.data);
    if (entry === undefined) return refuse(operation, "JOURNAL_CORRUPT", "capture registry entry does not decode");
    k7Versions.set(candidateId, stored.version);
    captureIdempotency.push(entry);
  }
  const admissionOutcomes: PersistedAdmissionOutcomeV1[] = [];
  for (const candidateId of candidateIds) {
    const stored = await handle.readAggregate("memory-admission-outcomes", memoryOutcomeKey(candidateId), grant);
    if (stored === null) continue;
    if (!isCanonicalU64(stored.version)) return refuse(operation, "JOURNAL_CORRUPT", "registry version is not a canonical u64");
    const entry = parseJson<PersistedAdmissionOutcomeV1>(stored.value.data);
    if (entry === undefined) return refuse(operation, "JOURNAL_CORRUPT", "admission outcome does not decode");
    admissionOutcomes.push(entry);
  }
  // K5 agreement: every folded entity carries the state the fold implies.
  for (const candidate of folded.value.candidates) {
    const stored = await handle.readAggregate("memory-fold-state", memoryStateKey("candidate", candidate.candidate_id), grant);
    if (stored === null) return refuse(operation, "JOURNAL_CORRUPT", "fold-state entry is missing");
    const entry = parseJson<{ candidate_id: string; state: string }>(stored.value.data);
    if (entry === undefined || entry.state !== candidate.state) {
      return refuse(operation, "JOURNAL_CORRUPT", "fold-state entry disagrees with the journal fold");
    }
  }
  for (const record of folded.value.records) {
    const stored = await handle.readAggregate("memory-fold-state", memoryStateKey("record", record.record_id), grant);
    if (stored === null) return refuse(operation, "JOURNAL_CORRUPT", "fold-state entry is missing");
    const entry = parseJson<{ record_id: string; state: string; record_digest?: string }>(stored.value.data);
    if (entry === undefined || entry.state !== record.state || entry.record_digest !== record.record_digest) {
      return refuse(operation, "JOURNAL_CORRUPT", "fold-state entry disagrees with the journal fold");
    }
  }

  const loadedOutbox = await loadOutbox(handle, grant, operation);
  if (!loadedOutbox.ok) return loadedOutbox;
  const outbox = loadedOutbox.value;
  const lexical = deriveAcceptedLexicalDocumentsV1(folded.value, [...blobs.values()]).map(({ record_id, document }) => ({
    record_id,
    document,
  }));
  return {
    ok: true,
    value: {
      journal: events,
      controls,
      envelopes: keptEnvelopes,
      records: [...blobs.values()],
      lexical,
      outbox,
      capture_idempotency: captureIdempotency,
      admission_outcomes: admissionOutcomes,
      k7Versions,
    },
  };
}

/**
 * Provisional public constructor: the Engram canonical-store adaptation
 * over the host-injected neutral port (amendment §1.2, binding §6).
 * The name stays provisional until the G1 binding is co-signed; the final
 * name goes into the receiving ACK (amendment §12).
 */
export async function openModuleStorageCanonicalMemoryStoreV1(
  options: ModuleStorageMemoryStoreOptionsV1,
): Promise<Result<CanonicalMemoryStorePort>> {
  const operation = "admin" as const;
  const checked = checkOptions(options);
  if (!checked.ok) return checked;
  const handle = options.handle;
  const binding = options.scope_binding;
  const grant = options.grant;

  let fence: NeutralWriterFence;
  try {
    const proof = await handle.acquireFence({ scope: checked.value.scope, store_id: checked.value.storeId, grant });
    fence = { fenceId: proof.fenceId, epoch: proof.epoch };
  } catch (error) {
    const mapped = mapStorageError(operation, error);
    return refuse(operation, mapped.code, mapped.message);
  }
  if (typeof fence.fenceId !== "string" || fence.fenceId.length === 0 || !isCanonicalU64(fence.epoch)) {
    try {
      await handle.releaseFence(fence);
    } catch {
      // Best-effort release on a malformed acquisition.
    }
    return refuse(operation, "CAPABILITY_UNAVAILABLE", "fence identity is not a canonical acquisition");
  }

  let hydrated: HydratedState;
  try {
    const loaded = await hydrate(handle, grant, operation);
    if (!loaded.ok) {
      try {
        await handle.releaseFence(fence);
      } catch {
        // Best-effort release on refused recovery.
      }
      return loaded;
    }
    hydrated = loaded.value;
  } catch (error) {
    try {
      await handle.releaseFence(fence);
    } catch {
      // Best-effort release on recovery failure.
    }
    const mapped = mapStorageError(operation, error);
    return refuse(operation, mapped.code, mapped.message);
  }

  const core = createInMemoryCanonicalMemoryStoreV1({
    clock: options.clock,
    store_id: checked.value.storeId,
    storage_epoch: fence.epoch,
    persistence: hydrated,
  });
  const ready = await core.readiness();
  if (!ready.ok) {
    try {
      await handle.releaseFence(fence);
    } catch {
      // Best-effort release on refused recovery.
    }
    return ready;
  }

  const maxRecords = options.work_limits?.maxRecords;
  const maxEncodedBytes = options.work_limits?.maxEncodedBytes;
  const singleEventLimits: NeutralWorkLimits = {
    maxAppends: SINGLE_EVENT_LIMITS.maxAppends,
    maxRecords: Math.max(SINGLE_EVENT_LIMITS.maxRecords, maxRecords ?? 0),
    maxEncodedBytes: Math.max(SINGLE_EVENT_LIMITS.maxEncodedBytes, maxEncodedBytes ?? 0),
  };
  const store = new ModuleStorageMemoryStore(
    handle,
    binding,
    checked.value.scope,
    grant,
    options.clock,
    fence,
    core,
    hydrated.k7Versions,
    singleEventLimits,
    typeof handle.readCommitResult === "function",
  );
  // The provenance mark is stamped only on the path where the §9.2
  // acquisition returned a live proof (binding §9.6 rule 3).
  markFencedStoreV1(store);
  return { ok: true, value: store };
}

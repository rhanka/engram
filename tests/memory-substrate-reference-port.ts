/**
 * Deterministic in-memory reference backend for the neutral L3a module
 * storage port (stage A conformance only).
 *
 * This file is TEST COLLATERAL, not a production driver: it is imported
 * only by the substrate test suite, never by `src/` or `engram-memory/`,
 * and never enters the published closure. It establishes adapter
 * semantics and deterministic failures; it proves no durability,
 * crash-reopen-on-disk, or multiprocess exclusion (binding §10.1: the
 * L3a in-memory kernel claims no durability; stage B on a durable
 * cluster-mesh backend stays `unverified`, sentropic #704).
 *
 * Determinism: grant tokens, epochs, and cursors derive from counters,
 * never from randomness or the wall clock. Time comes from the injected
 * clock only.
 */
import { canonicalizeJcs } from "../engram-memory/canonical-json.js";
import {
  MEMORY_CONTRACT_DIGEST,
  MEMORY_REQUIRED_PROFILES,
  NeutralStorageError,
  memoryJournalChain,
  memoryZeroHash,
  neutralJcs,
  type NeutralAggregateRead,
  type NeutralAtomicUnit,
  type NeutralChainPage,
  type NeutralChainRecord,
  type NeutralCommitOptions,
  type NeutralCommitReceipt,
  type NeutralEncodedValue,
  type NeutralIdempotencyEntry,
  type NeutralIdempotencySelector,
  type NeutralMemoryHandle,
  type NeutralModuleDescriptor,
  type NeutralModuleTransaction,
  type NeutralScopeGrant,
  type NeutralStorageScope,
} from "../engram-memory/module-storage-neutral.js";

export interface ReferenceScope {
  readonly tenantId: string;
  readonly workspaceId: string;
}

export interface ReferenceBackendOptions {
  readonly scope: ReferenceScope;
  readonly moduleId?: string;
  readonly requiredProfiles?: ReadonlyArray<string>;
  readonly descriptorDigest?: string;
  readonly clock?: () => string;
}

export type ReferenceFailStage =
  | "records"
  | "appends"
  | "updates"
  | "index"
  | "module-result"
  | "commit-decision"
  | "commit-decision-loss"
  | "after-commit-before-response";

export interface CommittedUnitSummary {
  readonly limits: { readonly maxAppends: number; readonly maxRecords: number; readonly maxEncodedBytes: number };
  readonly appends: number;
  readonly records: number;
  readonly updates: number;
  readonly idempotencyKey?: string;
}

export interface AggregateSnapshot {
  readonly kind: string;
  readonly key: string;
  readonly version: string;
  readonly value: NeutralEncodedValue;
}

interface StoredEvent {
  hash: string;
  value: NeutralEncodedValue;
  cursor: string;
}

interface DurableCore {
  allocation: string;
  head: string;
  eventsById: Map<string, StoredEvent>;
  order: string[];
  records: Map<string, { kind: string; key: string; value: NeutralEncodedValue; contentHash: string }>;
  aggregates: Map<string, { kind: string; key: string; version: string; value: NeutralEncodedValue }>;
  indexes: Map<string, NeutralEncodedValue>;
  commitResults: Map<string, { intentHash: string; moduleResult: NeutralEncodedValue; unitHash: string }>;
  bindings: Map<string, string>;
  reverseBindings: Map<string, string>;
  grants: Map<string, { grant: NeutralScopeGrant; revoked: boolean }>;
  holder: { handleId: string; storeId: string; epoch: string } | undefined;
  epochCounter: bigint;
  grantCounter: number;
  units: CommittedUnitSummary[];
}

const MAX_U64 = 18_446_744_073_709_551_615n;

function scopeKey(scope: ReferenceScope): string {
  return `${scope.tenantId}\0${scope.workspaceId}`;
}

function unitHash(unit: NeutralAtomicUnit): string {
  return canonicalizeJcs({
    records: unit.records,
    appends: unit.appends,
    updates: unit.updates,
    indexWrites: unit.indexWrites,
    moduleResult: unit.moduleResult ?? null,
  });
}

function encodedBytes(unit: NeutralAtomicUnit): number {
  let bytes = 0;
  for (const item of [...unit.records, ...unit.appends, ...unit.updates]) {
    bytes += new TextEncoder().encode(item.value.data).byteLength;
  }
  return bytes;
}

let handleSequence = 0;

export interface ReferenceBackend {
  readonly handle: NeutralMemoryHandle;
  grant: NeutralScopeGrant;
  issueGrant(overrides?: {
    scope?: ReferenceScope;
    operations?: ReadonlyArray<string>;
    lifetime?: NeutralScopeGrant["lifetime"];
    moduleId?: string;
  }): NeutralScopeGrant;
  revokeGrant(token: string): void;
  liveHolders(): number;
  armFailpoint(stage: ReferenceFailStage): void;
  disarmFailpoint(): void;
  committedUnits(): CommittedUnitSummary[];
  journalHead(): { allocation: string; hash: string };
  readAggregate(kind: string, key: string): AggregateSnapshot | undefined;
  listAggregates(): AggregateSnapshot[];
  queryJournalPage(input: { after: string; limit: number }): NeutralChainRecord[];
  tamperEvent(eventId: string, patch: Record<string, unknown>): void;
  deleteEvent(eventId: string): void;
  deleteRecord(kind: string, key: string): void;
  codecRoundTrip(value: string): string;
  testOnlyAllocateNext(allocation: string): string;
  testOnlyRevokeFence(): void;
  transactRaw(
    limits: { maxAppends: number; maxRecords: number; maxEncodedBytes: number },
    idempotencyKey: string,
    apply: (transaction: NeutralModuleTransaction) => Promise<void>,
  ): Promise<{ ok: true } | { ok: false; code: string }>;
}

export function createReferenceModuleStorageBackend(options: ReferenceBackendOptions): ReferenceBackend {
  const now = options.clock ?? (() => "2026-08-16T12:34:56.789Z");
  const core: DurableCore = {
    allocation: "0",
    head: memoryZeroHash(),
    eventsById: new Map(),
    order: [],
    records: new Map(),
    aggregates: new Map(),
    indexes: new Map(),
    commitResults: new Map(),
    bindings: new Map(),
    reverseBindings: new Map(),
    grants: new Map(),
    holder: undefined,
    epochCounter: 0n,
    grantCounter: 0,
    units: [],
  };
  const handleId = `reference-handle-${++handleSequence}`;
  let failpoint: ReferenceFailStage | undefined;

  const descriptor: NeutralModuleDescriptor = {
    contractVersion: "memory-binding-v1",
    contractDigest: options.descriptorDigest ?? MEMORY_CONTRACT_DIGEST,
    schemaVersions: ["memory-journal-1", "memory-record-2", "memory-lifecycle-event-2", "memory-checkpoint-1"],
    requiredProfiles: [...(options.requiredProfiles ?? MEMORY_REQUIRED_PROFILES)],
    optionalProfiles: ["leased-snapshots-v1"],
    chainKinds: ["memory-journal"],
    queryNames: ["memory-journal-page", "memory-record-by-id", "memory-accepted-snapshot", "memory-outbox-page", "scope-chain-index"],
    boundaries: ["scope-root", "exact-cursor"],
    pageLimits: { maxRecords: 2000, maxEncodedBytes: 1048576 },
  };

  function checkGrant(grant: NeutralScopeGrant, operation: "read" | "write"): void {
    const issued = core.grants.get(grant.token);
    if (issued === undefined || issued.grant.moduleId !== grant.moduleId || issued.grant.token !== grant.token) {
      throw new NeutralStorageError("unauthorized", "unknown grant token");
    }
    if (issued.revoked) throw new NeutralStorageError("authorization-revoked", "grant was revoked");
    const lifetime = issued.grant.lifetime;
    if (lifetime.kind === "lease" && Date.parse(now()) >= Date.parse(lifetime.expiresAt)) {
      throw new NeutralStorageError("authorization-expired", "grant lease expired");
    }
    if (issued.grant.moduleId !== (options.moduleId ?? "engram-memory")) {
      throw new NeutralStorageError("unauthorized", "grant names another module");
    }
    if (scopeKey(issued.grant.scope) !== scopeKey(options.scope)) {
      throw new NeutralStorageError("unauthorized", "grant names another scope");
    }
    if (!issued.grant.operations.includes(operation)) {
      throw new NeutralStorageError("unauthorized", `grant lacks ${operation} operation`);
    }
  }

  function checkHolder(): void {
    if (core.holder === undefined || core.holder.handleId !== handleId) {
      throw new NeutralStorageError("fence-lost", "no live canonical fence for this handle");
    }
  }

  function fire(stage: ReferenceFailStage): never {
    failpoint = undefined;
    throw new NeutralStorageError("store-unavailable", `injected failure before ${stage}`);
  }

  function maybeFire(stage: ReferenceFailStage): void {
    if (failpoint === stage) fire(stage);
  }

  function applyUnit(optionsValue: NeutralCommitOptions, unit: NeutralAtomicUnit): NeutralCommitReceipt {
    if (unit.appends.length > optionsValue.limits.maxAppends) {
      throw new NeutralStorageError("limit-exceeded", "unit exceeds declared maxAppends");
    }
    if (unit.records.length > optionsValue.limits.maxRecords) {
      throw new NeutralStorageError("limit-exceeded", "unit exceeds declared maxRecords");
    }
    if (encodedBytes(unit) > optionsValue.limits.maxEncodedBytes) {
      throw new NeutralStorageError("limit-exceeded", "unit exceeds declared maxEncodedBytes");
    }
    if (optionsValue.idempotencyKey !== undefined) {
      const prior = core.commitResults.get(optionsValue.idempotencyKey);
      if (prior !== undefined) {
        if (prior.unitHash !== unitHash(unit)) {
          throw new NeutralStorageError("digest-conflict", "commit identity is bound to a different unit");
        }
        return { commitId: optionsValue.idempotencyKey, journalCursor: core.allocation };
      }
    }
    // Fail-closed atomicity: every injected failure below refuses before any
    // mutation of this unit, except the post-commit acknowledgement loss.
    // The stage name still identifies the refused sub-step.
    maybeFire("records");
    maybeFire("appends");
    maybeFire("updates");
    maybeFire("index");
    maybeFire("module-result");
    for (const record of unit.records) {
      if (record.value.format !== "utf8") throw new NeutralStorageError("invalid-schema", "record value is not utf8");
      const mapKey = `${record.kind}\0${record.key}`;
      const prior = core.records.get(mapKey);
      if (prior !== undefined) {
        if (prior.value.data !== record.value.data || prior.contentHash !== record.contentHash) {
          throw new NeutralStorageError("digest-conflict", "immutable record identity is bound to different bytes");
        }
        continue;
      }
      core.records.set(mapKey, { kind: record.kind, key: record.key, value: record.value, contentHash: record.contentHash });
    }
    let cursor = core.allocation;
    for (const append of unit.appends) {
      if (append.chain !== memoryJournalChain()) throw new NeutralStorageError("invalid-schema", "unknown chain");
      const expected = append.expectation;
      if (expected.kind === "absent") {
        if (core.order.length !== 0 || expected.allocation !== core.allocation) {
          throw new NeutralStorageError("cas-conflict", "genesis expectation does not hold");
        }
      } else if (expected.hash !== core.head) {
        throw new NeutralStorageError("cas-conflict", "stale chain head");
      }
      const prior = core.eventsById.get(append.id);
      if (prior !== undefined) {
        if (prior.hash !== append.hash || prior.value.data !== append.value.data) {
          throw new NeutralStorageError("digest-conflict", "event identity is bound to a different hash");
        }
        continue;
      }
      const body = JSON.parse(append.value.data) as { cursor?: unknown };
      if (typeof body.cursor !== "string") throw new NeutralStorageError("invalid-schema", "event carries no cursor");
      const next = BigInt(core.allocation) + 1n;
      if (next > MAX_U64) throw new NeutralStorageError("limit-exceeded", "journal cursor is exhausted");
      if (body.cursor !== next.toString()) {
        throw new NeutralStorageError("cas-conflict", "append cursor does not extend the committed allocation");
      }
      core.allocation = next.toString();
      core.head = append.hash;
      core.eventsById.set(append.id, { hash: append.hash, value: append.value, cursor: body.cursor });
      core.order.push(append.id);
      cursor = core.allocation;
    }
    for (const update of unit.updates) {
      const mapKey = `${update.kind}\0${update.key}`;
      const prior = core.aggregates.get(mapKey);
      if (prior !== undefined && BigInt(update.version) <= BigInt(prior.version)) {
        throw new NeutralStorageError("cas-conflict", "stale aggregate version");
      }
      core.aggregates.set(mapKey, { kind: update.kind, key: update.key, version: update.version, value: update.value });
    }
    for (const write of unit.indexWrites) {
      core.indexes.set(`${write.index}\0${write.key}`, write.value);
    }
    const receipt: NeutralCommitReceipt = { commitId: optionsValue.idempotencyKey ?? `commit:${core.units.length}`, journalCursor: cursor };
    if (unit.moduleResult !== undefined && optionsValue.idempotencyKey !== undefined) {
      const intentSources = [...unit.appends.map((append) => append.id), ...unit.updates.map((update) => update.key)];
      const intentHash = canonicalizeJcs({ appends: unit.appends.map((append) => append.id), updates: intentSources });
      core.commitResults.set(optionsValue.idempotencyKey, { intentHash, moduleResult: unit.moduleResult, unitHash: unitHash(unit) });
      for (const append of unit.appends) {
        core.commitResults.set(append.id, { intentHash, moduleResult: unit.moduleResult, unitHash: unitHash(unit) });
      }
    }
    core.units.push({
      limits: { ...optionsValue.limits },
      appends: unit.appends.length,
      records: unit.records.length,
      updates: unit.updates.length,
      idempotencyKey: optionsValue.idempotencyKey,
    });
    return receipt;
  }

  async function transactInner<T>(
    commitOptions: NeutralCommitOptions,
    operation: (transaction: NeutralModuleTransaction) => Promise<T>,
  ): Promise<{ readonly value: T; readonly receipt: NeutralCommitReceipt }> {
    checkGrant(commitOptions.grant, "write");
    checkHolder();
    const staged: NeutralAtomicUnit[] = [];
    const transaction: NeutralModuleTransaction = {
      async readAggregate(kind: string, key: string): Promise<NeutralAggregateRead | null> {
        const found = core.aggregates.get(`${kind}\0${key}`);
        return found === undefined ? null : { kind, key, version: found.version, value: found.value };
      },
      async readRecords(kind: string, keys: ReadonlyArray<string>): Promise<ReadonlyArray<NeutralRecordRead>> {
        const out: NeutralRecordRead[] = [];
        for (const key of keys) {
          const found = core.records.get(`${kind}\0${key}`);
          if (found !== undefined) out.push({ kind, key, value: found.value, contentHash: found.contentHash });
        }
        return out;
      },
      async readChain(input: { chain: string; afterAllocation?: string; limit: number }): Promise<NeutralChainPage> {
        if (input.chain !== memoryJournalChain()) throw new NeutralStorageError("invalid-schema", "unknown chain");
        const records: NeutralChainRecord[] = [];
        for (const id of core.order) {
          const stored = core.eventsById.get(id);
          if (stored === undefined) continue;
          if (input.afterAllocation !== undefined && BigInt(stored.cursor) <= BigInt(input.afterAllocation)) continue;
          records.push({ id, hash: stored.hash, value: stored.value });
          if (records.length >= input.limit) break;
        }
        return { chain: input.chain, records };
      },
      async findIdempotency(selector: NeutralIdempotencySelector): Promise<NeutralIdempotencyEntry | null> {
        const found = core.commitResults.get(selector.commitIdentity);
        return found === null || found === undefined
          ? null
          : { key: selector.commitIdentity, intentHash: found.intentHash, moduleResult: found.moduleResult };
      },
      async apply(unit: NeutralAtomicUnit): Promise<void> {
        staged.push(unit);
      },
    };
    const value = await operation(transaction);
    // Commit-time revalidation: after any wait inside the operation, immediately before the decision.
    if (failpoint === "commit-decision-loss") {
      failpoint = undefined;
      core.holder = undefined;
    }
    maybeFire("commit-decision");
    checkGrant(commitOptions.grant, "write");
    checkHolder();
    let receipt: NeutralCommitReceipt = { commitId: commitOptions.idempotencyKey ?? "commit:empty", journalCursor: core.allocation };
    for (const unit of staged) receipt = applyUnit(commitOptions, unit);
    if (failpoint === "after-commit-before-response") {
      failpoint = undefined;
      throw new NeutralStorageError("store-unavailable", "commit applied but the acknowledgement was lost");
    }
    return { value, receipt };
  }

  function issueGrant(overrides?: {
    scope?: ReferenceScope;
    operations?: ReadonlyArray<string>;
    lifetime?: NeutralScopeGrant["lifetime"];
    moduleId?: string;
  }): NeutralScopeGrant {
    core.grantCounter += 1;
    const grant: NeutralScopeGrant = {
      token: `reference-grant-${handleSequence}-${core.grantCounter}`,
      moduleId: overrides?.moduleId ?? options.moduleId ?? "engram-memory",
      scope: { ...(overrides?.scope ?? options.scope) },
      principalId: "reference-principal",
      operations: [...(overrides?.operations ?? ["read", "write"])],
      issuer: "reference-composition-root",
      authorityRevision: "1",
      policyRevision: "1",
      lifetime: overrides?.lifetime ?? { kind: "lease", expiresAt: "2030-01-01T00:00:00.000Z" },
    };
    core.grants.set(grant.token, { grant, revoked: false });
    return grant;
  }

  const primaryGrant = issueGrant();

  const handle: NeutralMemoryHandle = {
    moduleId: options.moduleId ?? "engram-memory",
    descriptor,
    backend: "memory",
    profiles: descriptor.requiredProfiles.map((name) => ({ name, version: "1", digest: `sha256:${"0".repeat(64)}` })),
    async transact<T>(
      commitOptions: NeutralCommitOptions,
      operation: (transaction: NeutralModuleTransaction) => Promise<T>,
    ): Promise<{ readonly value: T; readonly receipt: NeutralCommitReceipt }> {
      return transactInner(commitOptions, operation);
    },
    async query(name: string, input: NeutralEncodedValue, grant: NeutralScopeGrant): Promise<NeutralEncodedValue> {
      checkGrant(grant, "read");
      const body = JSON.parse(input.data) as Record<string, unknown>;
      switch (name) {
        case "memory-journal-page": {
          const after = body["after"];
          const limit = body["limit"];
          if (typeof after !== "string" || typeof limit !== "number") {
            throw new NeutralStorageError("invalid-schema", "journal page input is invalid");
          }
          const records: NeutralChainRecord[] = [];
          for (const id of core.order) {
            const stored = core.eventsById.get(id);
            if (stored === undefined) continue;
            if (BigInt(stored.cursor) <= BigInt(after)) continue;
            records.push({ id, hash: stored.hash, value: stored.value });
            if (records.length >= Math.min(Math.max(1, Math.floor(limit)), 2000)) break;
          }
          return neutralJcs(records);
        }
        case "memory-record-by-id": {
          const recordId = body["record_id"];
          if (typeof recordId !== "string") throw new NeutralStorageError("invalid-schema", "record query input is invalid");
          const found = [...core.records.values()].find((record) => record.key === recordKeyOf(recordId));
          return neutralJcs(found === undefined ? { found: false } : { found: true, value: found.value });
        }
        case "memory-accepted-snapshot": {
          const maxCandidates = body["max_candidates"];
          const scopeRef = body["scope_ref"];
          if (typeof maxCandidates !== "number") throw new NeutralStorageError("invalid-schema", "snapshot query input is invalid");
          const documents: unknown[] = [];
          for (const [mapKey, value] of core.indexes) {
            if (!mapKey.startsWith("memory-accepted-lexical\0")) continue;
            if (typeof scopeRef === "string" && !mapKey.includes(JSON.stringify(scopeRef))) continue;
            documents.push(JSON.parse(value.data));
            if (documents.length >= Math.min(Math.max(1, Math.floor(maxCandidates)), 2000)) break;
          }
          documents.sort((left, right) => String((left as { record_id: string }).record_id).localeCompare(String((right as { record_id: string }).record_id)));
          return neutralJcs(documents);
        }
        case "memory-outbox-page": {
          const after = body["after"];
          const limit = body["limit"];
          if (typeof after !== "string" || typeof limit !== "number") {
            throw new NeutralStorageError("invalid-schema", "outbox page input is invalid");
          }
          const batches: unknown[] = [];
          for (const record of core.records.values()) {
            if (record.kind !== "memory-projection-outbox") continue;
            const batch = JSON.parse(record.value.data) as { through_cursor_inclusive: string };
            if (BigInt(batch.through_cursor_inclusive) <= BigInt(after)) continue;
            batches.push(batch);
            if (batches.length >= Math.min(Math.max(1, Math.floor(limit)), 2000)) break;
          }
          batches.sort((left, right) => {
            const first = (left as { through_cursor_inclusive: string }).through_cursor_inclusive;
            const second = (right as { through_cursor_inclusive: string }).through_cursor_inclusive;
            return BigInt(first) === BigInt(second) ? 0 : BigInt(first) < BigInt(second) ? -1 : 1;
          });
          return neutralJcs(batches);
        }
        case "scope-chain-index": {
          return neutralJcs({ chain: memoryJournalChain(), head: core.head, allocation: core.allocation });
        }
        default:
          throw new NeutralStorageError("capability-unavailable", `unknown query ${name}`);
      }
    },
    async readAggregate(kind: string, key: string, grant: NeutralScopeGrant): Promise<NeutralAggregateRead | null> {
      checkGrant(grant, "read");
      const found = core.aggregates.get(`${kind}\0${key}`);
      return found === undefined ? null : { kind, key, version: found.version, value: found.value };
    },
    async readCommitResult(commitIdentity: string, grant: NeutralScopeGrant): Promise<NeutralEncodedValue | null> {
      checkGrant(grant, "read");
      if (core.holder === undefined || core.holder.handleId !== handleId) {
        throw new NeutralStorageError("fence-lost", "no live canonical acquisition owns this lookup");
      }
      const found = core.commitResults.get(commitIdentity);
      return found === undefined ? null : found.moduleResult;
    },
    async acquireFence(input: { scope: NeutralStorageScope; store_id: string; grant: NeutralScopeGrant }): Promise<{ epoch: string }> {
      checkGrant(input.grant, "write");
      const presented = scopeKey({ tenantId: input.scope.tenantId, workspaceId: input.scope.workspaceId });
      if (presented !== scopeKey(options.scope)) {
        throw new NeutralStorageError("unauthorized", "fence scope is not this handle scope");
      }
      const boundStore = core.bindings.get(presented);
      if (boundStore !== undefined && boundStore !== input.store_id) {
        throw new NeutralStorageError("fence-conflict", "scope journal is bound to another store_id");
      }
      const boundScope = core.reverseBindings.get(input.store_id);
      if (boundScope !== undefined && boundScope !== presented) {
        throw new NeutralStorageError("fence-conflict", "store_id is bound to another scope journal");
      }
      if (core.holder !== undefined) {
        throw new NeutralStorageError("fence-conflict", "a live canonical holder already owns this journal");
      }
      if (boundStore === undefined) {
        core.bindings.set(presented, input.store_id);
        core.reverseBindings.set(input.store_id, presented);
        core.aggregates.set(`memory-store-meta\0${JSON.stringify(["memory-store-meta-v1", "binding"])}`, {
          kind: "memory-store-meta",
          key: JSON.stringify(["memory-store-meta-v1", "binding"]),
          version: "1",
          value: neutralJcs({ store_id: input.store_id, tenantId: input.scope.tenantId, workspaceId: input.scope.workspaceId }),
        });
      }
      core.epochCounter += 1n;
      const epoch = core.epochCounter.toString();
      core.holder = { handleId, storeId: input.store_id, epoch };
      return { epoch };
    },
    async checkFence(grant: NeutralScopeGrant): Promise<void> {
      checkGrant(grant, "read");
      checkHolder();
    },
    async releaseFence(): Promise<void> {
      if (core.holder !== undefined && core.holder.handleId === handleId) core.holder = undefined;
    },
  };

  function recordKeyOf(recordId: string): string {
    return JSON.stringify(["memory-record-v1", recordId]);
  }

  return {
    handle,
    grant: primaryGrant,
    issueGrant,
    revokeGrant(token: string): void {
      const issued = core.grants.get(token);
      if (issued !== undefined) issued.revoked = true;
    },
    liveHolders(): number {
      return core.holder === undefined ? 0 : 1;
    },
    armFailpoint(stage: ReferenceFailStage): void {
      failpoint = stage;
    },
    disarmFailpoint(): void {
      failpoint = undefined;
    },
    committedUnits(): CommittedUnitSummary[] {
      return [...core.units];
    },
    journalHead(): { allocation: string; hash: string } {
      return { allocation: core.allocation, hash: core.head };
    },
    readAggregate(kind: string, key: string): AggregateSnapshot | undefined {
      const found = core.aggregates.get(`${kind}\0${key}`);
      return found === undefined ? undefined : { kind, key, version: found.version, value: found.value };
    },
    listAggregates(): AggregateSnapshot[] {
      return [...core.aggregates.values()].map((entry) => ({ kind: entry.kind, key: entry.key, version: entry.version, value: entry.value }));
    },
    queryJournalPage(input: { after: string; limit: number }): NeutralChainRecord[] {
      const records: NeutralChainRecord[] = [];
      for (const id of core.order) {
        const stored = core.eventsById.get(id);
        if (stored === undefined) continue;
        if (BigInt(stored.cursor) <= BigInt(input.after)) continue;
        records.push({ id, hash: stored.hash, value: stored.value });
        if (records.length >= input.limit) break;
      }
      return records;
    },
    tamperEvent(eventId: string, patch: Record<string, unknown>): void {
      const stored = core.eventsById.get(eventId);
      if (stored === undefined) throw new Error(`unknown event ${eventId}`);
      const body = JSON.parse(stored.value.data) as Record<string, unknown>;
      stored.value = neutralJcs({ ...body, ...patch });
    },
    deleteEvent(eventId: string): void {
      core.eventsById.delete(eventId);
      core.order = core.order.filter((id) => id !== eventId);
    },
    deleteRecord(kind: string, key: string): void {
      core.records.delete(`${kind}\0${key}`);
    },
    codecRoundTrip(value: string): string {
      return (JSON.parse(neutralJcs(value).data) as string);
    },
    testOnlyAllocateNext(allocation: string): string {
      const next = BigInt(allocation) + 1n;
      if (next > MAX_U64) throw new NeutralStorageError("limit-exceeded", "journal cursor is exhausted");
      return next.toString();
    },
    testOnlyRevokeFence(): void {
      core.holder = undefined;
    },
    async transactRaw(
      limits: { maxAppends: number; maxRecords: number; maxEncodedBytes: number },
      idempotencyKey: string,
      apply: (transaction: NeutralModuleTransaction) => Promise<void>,
    ): Promise<{ ok: true } | { ok: false; code: string }> {
      try {
        await transactInner({ limits, idempotencyKey, grant: primaryGrant }, apply);
        return { ok: true };
      } catch (error) {
        if (error instanceof NeutralStorageError) return { ok: false, code: error.code };
        throw error;
      }
    },
  };
}

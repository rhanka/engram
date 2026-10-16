// tests/helpers/live-clock-watch — L6b shared fakes, mutable source/projection
// oracle, atomic receiving-port fencing instrumentation, and seeded trace
// generator with greedy prefix shrinking (plan/09 L6b; LIVE §§7, 12–13;
// L6b-design.md + Opus amendments 1–12).
//
// Deterministic, injected doubles only: no DB/host imports, no Python, no network.

import { createHash } from "node:crypto";
import type { LiveScope } from "../../engram-live/contracts.js";
import { COVERAGE_AXES } from "../../engram-live/contracts.js";
import { Reconciler, type CollectOptions, type ReconcileScan, type ReconcilerPorts, type ReconcileBudgets } from "../../engram-live/reconcile.js";
import { Scheduler, type SchedulerBudgets, type SchedulerPorts, type WorkItem } from "../../engram-live/scheduler.js";
import { createWatchHub } from "../../engram-live/watch.js";
import { sourceVectorsEqual } from "../../engram-live/coverage.js";

export interface FakeClock {
  now(): number;
  advance(ms: number): void;
  schedule(ms: number, callback: () => void): () => void;
}

export function createFakeClock(startAt = 1_700_000_000_000): FakeClock {
  let t = startAt;
  const timers = new Set<{ at:number; callback:()=>void }>();
  return {
    now: () => t,
    advance: (ms: number) => {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error("fake clock advances by a finite non-negative delay");
      }
      t += ms;
      for (const timer of [...timers]) if (timer.at <= t) { timers.delete(timer); timer.callback(); }
    },
    schedule: (ms,callback) => { const timer={at:t+ms,callback}; timers.add(timer); return ()=>{timers.delete(timer);}; },
  };
}

/** Deterministic PRNG (mulberry32) for generated event sequences. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export type FakeWatchSignal =
  | { readonly kind: "change"; readonly paths: readonly string[]; readonly axes?: readonly string[] }
  | { readonly kind: "delete"; readonly paths: readonly string[]; readonly axes?: readonly string[] }
  | { readonly kind: "overflow" }
  | { readonly kind: "restart" }
  | { readonly kind: "downtime"; readonly ms: number }
  | { readonly kind: "packed-refs" }
  | { readonly kind: "projection-replaced" }
  | { readonly kind: "config-change" }
  | { readonly kind: "watch-error"; readonly reason?: string };

export interface FakeWatcherStats {
  starts: number;
  stops: number;
  eventsDelivered: number;
}

/**
 * Fake native watcher. Readiness is explicit: start() resolves only when
 * releaseReady() is called, so tests can invert the order (scan before
 * ready) and prove the engine refuses it. No filesystem access.
 */
export class FakeWatcher {
  private listener: ((signal: FakeWatchSignal, at: number) => void) | undefined;
  private readyResolve: (() => void) | undefined;
  private readyPromise: Promise<void> | undefined;
  readonly stats: FakeWatcherStats = { starts: 0, stops: 0, eventsDelivered: 0 };
  readonly clock: FakeClock;

  constructor(clock: FakeClock) {
    this.clock = clock;
  }

  async start(): Promise<void> {
    this.stats.starts += 1;
    this.readyPromise ??= new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    return this.readyPromise;
  }

  releaseReady(): void {
    this.readyResolve?.();
  }

  async stop(): Promise<void> {
    this.stats.stops += 1;
  }

  onSignal(listener: (signal: FakeWatchSignal, at: number) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  emit(signal: FakeWatchSignal): void {
    const target = this.listener;
    if (target === undefined) return;
    this.stats.eventsDelivered += 1;
    target(signal, this.clock.now());
  }
}

export interface TestScopeFencingToken {
  readonly tokenId: string;
  readonly scope: LiveScope;
  readonly epoch: number;
  readonly epochId: string;
  readonly declarationRevision: number;
  readonly projectionIncarnation: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}

export type SinkOutcome =
  | { readonly ok: true; readonly receiptId?: string }
  | { readonly ok: false; readonly backpressure: true; readonly retryAfterMs: number }
  | { readonly ok: false; readonly backpressure: false; readonly retryable: boolean; readonly fenced?: boolean };

export interface FakeSinkStats {
  delivered: number;
  backpressure: number;
  failed: number;
  fencedRejections: number;
}

/**
 * Fake durable fact sink with optional atomic fencing validation and
 * programmable per-call outcomes. Never touches a database or the network.
 */
export class FakeSink {
  readonly accepted: string[] = [];
  readonly acceptedTokens: (TestScopeFencingToken | string | undefined)[] = [];
  readonly receipts = new Map<string, { readonly batchId: string; readonly digest: string; readonly receiptId: string }>();
  readonly stats: FakeSinkStats = { delivered: 0, backpressure: 0, failed: 0, fencedRejections: 0 };
  private program: (SinkOutcome | Error)[] = [];
  private authority: FakeWriterAuthority | undefined;

  constructor(authority?: FakeWriterAuthority) {
    this.authority = authority;
  }

  /** Queue exact outcomes (or thrown Errors) for the next deliver() calls. */
  script(outcomes: readonly (SinkOutcome | Error)[]): void {
    this.program.push(...outcomes);
  }

  async deliver(
    batchId: string,
    token?: TestScopeFencingToken | string,
    digest = batchId,
  ): Promise<SinkOutcome> {
    if (this.authority !== undefined) {
      const check = this.authority.validateAtomicWrite(token, "sink.deliver");
      if (!check.ok) {
        this.stats.fencedRejections += 1;
        this.stats.failed += 1;
        return { ok: false, backpressure: false, retryable: false, fenced: true };
      }
    }
    const existing = this.receipts.get(batchId);
    if (existing !== undefined) {
      if (existing.digest !== digest) {
        this.stats.failed += 1;
        return { ok: false, backpressure: false, retryable: false };
      }
      return { ok: true, receiptId: existing.receiptId };
    }
    const next = this.program.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (next === undefined) {
      this.stats.delivered += 1;
      this.accepted.push(batchId);
      this.acceptedTokens.push(token);
      const receiptId = `rcpt:${batchId}:${this.stats.delivered}`;
      this.receipts.set(batchId, { batchId, digest, receiptId });
      return { ok: true, receiptId };
    }
    if (next.ok) {
      this.stats.delivered += 1;
      this.accepted.push(batchId);
      this.acceptedTokens.push(token);
      const receiptId = next.receiptId ?? `rcpt:${batchId}:${this.stats.delivered}`;
      this.receipts.set(batchId, { batchId, digest, receiptId });
      return { ok: true, receiptId };
    }
    if (next.backpressure) {
      this.stats.backpressure += 1;
    } else {
      this.stats.failed += 1;
    }
    return next;
  }
}

export const DEFAULT_TEST_SCOPE: LiveScope = {
  tenant: "local:test-tenant",
  clone: "clone:test-clone",
  worktree: "wt:test-wt",
};

/**
 * Fake writer authority with atomic receiving-port fencing validation
 * (L6b-design §2 + Opus Amendments 2, 5, 8).
 */
export class FakeWriterAuthority {
  validate(token: TestScopeFencingToken): boolean { return this.validateAtomicWrite(token,"producer.validate").ok; }
  readonly clock: FakeClock;
  scope: LiveScope;
  declarationRevision: number;
  projectionIncarnation: string;
  currentEpoch = 1;
  ttlMs = 60_000;
  allowAcquire = true;
  allowRenew = true;
  readonly acquiredTokens: TestScopeFencingToken[] = [];
  readonly renewedTokens: TestScopeFencingToken[] = [];
  readonly releasedTokens: string[] = [];
  readonly revokedTokenIds = new Set<string>();
  readonly fencingViolations: string[] = [];
  private mintSeq = 0;
  private activeToken?: TestScopeFencingToken;
  private readonly explicitScope: boolean;

  constructor(
    clock: FakeClock,
    options?: {
      scope?: LiveScope;
      declarationRevision?: number;
      projectionIncarnation?: string;
      ttlMs?: number;
      allowAcquire?: boolean;
    },
  ) {
    this.clock = clock;
    this.explicitScope = options?.scope !== undefined;
    this.scope = options?.scope ?? DEFAULT_TEST_SCOPE;
    this.declarationRevision = options?.declarationRevision ?? 1;
    this.projectionIncarnation = options?.projectionIncarnation ?? "incarnation-1";
    if (options?.ttlMs !== undefined) this.ttlMs = options.ttlMs;
    if (options?.allowAcquire !== undefined) this.allowAcquire = options.allowAcquire;
  }

  private parseEpochNumber(epochInput: string | number | undefined): number {
    if (typeof epochInput === "number" && Number.isFinite(epochInput)) return epochInput;
    if (typeof epochInput === "string") {
      const m = /(\d+)/.exec(epochInput);
      if (m?.[1] !== undefined) return Number.parseInt(m[1], 10);
    }
    return this.currentEpoch;
  }

  async acquire(
    request?:
      | string
      | {
          readonly scope?: LiveScope;
          readonly minEpoch?: number;
          readonly epoch?: string | number;
          readonly declarationRevision?: number;
          readonly projectionIncarnation?: string;
        },
  ): Promise<TestScopeFencingToken | undefined> {
    if (!this.allowAcquire) return undefined;
    const requestedEpoch =
      typeof request === "string"
        ? this.parseEpochNumber(request)
        : this.parseEpochNumber(request?.minEpoch ?? request?.epoch);
    const reqScope = (typeof request === "object" && request !== null ? request.scope : undefined) ?? this.scope;
    if (!this.explicitScope && this.acquiredTokens.length === 0) {
      this.scope = { ...reqScope };
    }
    const reqRev =
      (typeof request === "object" && request !== null ? request.declarationRevision : undefined) ??
      this.declarationRevision;
    const reqIncarnation =
      (typeof request === "object" && request !== null ? request.projectionIncarnation : undefined) ??
      this.projectionIncarnation;

    if (
      reqScope.tenant !== this.scope.tenant ||
      reqScope.clone !== this.scope.clone ||
      reqScope.worktree !== this.scope.worktree
    ) {
      this.fencingViolations.push(`acquire wrong scope: ${JSON.stringify(reqScope)}`);
      return undefined;
    }
    if (reqRev !== this.declarationRevision) {
      this.fencingViolations.push(`acquire wrong declarationRevision: ${reqRev} !== ${this.declarationRevision}`);
      return undefined;
    }
    if (reqIncarnation !== this.projectionIncarnation) {
      this.fencingViolations.push(
        `acquire wrong projectionIncarnation: ${reqIncarnation} !== ${this.projectionIncarnation}`,
      );
      return undefined;
    }
    const active=this.activeToken;
    if(active && !this.revokedTokenIds.has(active.tokenId) && active.expiresAt>this.clock.now() && active.epoch>=this.currentEpoch && active.projectionIncarnation===this.projectionIncarnation && active.declarationRevision===this.declarationRevision){
      if(requestedEpoch<=active.epoch)return undefined;
      this.revoke(active);
    }
    const nextEpoch = Math.max(this.currentEpoch+(this.mintSeq>0?1:0), requestedEpoch);
    this.currentEpoch = nextEpoch;
    this.mintSeq += 1;
    const now = this.clock.now();
    const token: TestScopeFencingToken = {
      tokenId: `fence:${this.scope.clone}:e${nextEpoch}:m${this.mintSeq}`,
      scope: { ...this.scope },
      epoch: nextEpoch,
      epochId: typeof request === "string" ? request : `epoch-${nextEpoch}`,
      declarationRevision: this.declarationRevision,
      projectionIncarnation: this.projectionIncarnation,
      issuedAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.acquiredTokens.push(token);
    this.activeToken=token;
    return token;
  }

  async renew(token: TestScopeFencingToken): Promise<TestScopeFencingToken | undefined> {
    if (!this.allowRenew) return undefined;
    const valid = this.validateAtomicWrite(token, "writer.renew", /* allowExpiredForRenew */ true);
    if (!valid.ok) return undefined;
    this.mintSeq += 1;
    const now = this.clock.now();
    const renewed: TestScopeFencingToken = {
      ...token,
      tokenId: `fence:${this.scope.clone}:e${token.epoch}:m${this.mintSeq}`,
      issuedAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.renewedTokens.push(renewed);
    this.revoke(token);this.activeToken=renewed;
    return renewed;
  }

  revoke(token: TestScopeFencingToken): void {
    this.revokedTokenIds.add(token.tokenId);
    if(this.activeToken?.tokenId===token.tokenId)this.activeToken=undefined;
  }

  async release(token: TestScopeFencingToken | string): Promise<void> {
    const id = typeof token === "string" ? token : token.tokenId;
    if (this.releasedTokens.includes(id)) {
      this.fencingViolations.push(`double release of token ${id}`);
      throw new Error(`fencing token released more than once: ${id}`);
    }
    this.releasedTokens.push(id);
    this.revokedTokenIds.add(id);
    if(this.activeToken?.tokenId===id)this.activeToken=undefined;
  }

  revokeAllCurrentTokens(): void {
    for (const t of this.acquiredTokens) this.revokedTokenIds.add(t.tokenId);
    for (const t of this.renewedTokens) this.revokedTokenIds.add(t.tokenId);
  }

  forceCompetingEpoch(nextEpoch: number): void {
    if (nextEpoch <= this.currentEpoch) {
      throw new Error(`competing epoch must be strictly higher (${nextEpoch} <= ${this.currentEpoch})`);
    }
    this.currentEpoch = nextEpoch;
  }

  validateAtomicWrite(
    candidate: TestScopeFencingToken | string | undefined,
    portName: string,
    allowExpired = false,
  ): { readonly ok: boolean; readonly reason?: string } {
    if (candidate === undefined) {
      const reason = `${portName}: missing fencing token`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if (typeof candidate === "string") {
      const found =
        this.renewedTokens.find((t) => t.tokenId === candidate || `token-for-${t.epochId}` === candidate) ??
        this.acquiredTokens.find((t) => t.tokenId === candidate || `token-for-${t.epochId}` === candidate);
      if (found === undefined) {
        const reason = `${portName}: unknown string token "${candidate}"`;
        this.fencingViolations.push(reason);
        return { ok: false, reason };
      }
      candidate = found;
    }
    const minted=[...this.acquiredTokens,...this.renewedTokens].find(t=>t.tokenId===candidate.tokenId);
    if(!minted || minted.epoch!==candidate.epoch || minted.issuedAt!==candidate.issuedAt || minted.expiresAt!==candidate.expiresAt)return {ok:false,reason:`${portName}: unverified or altered token`};
    if (this.revokedTokenIds.has(candidate.tokenId)) {
      const reason = `${portName}: revoked token ${candidate.tokenId}`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if(this.activeToken?.tokenId!==candidate.tokenId)return {ok:false,reason:`${portName}: writer is not the exclusive holder`};
    if (
      candidate.scope.tenant !== this.scope.tenant ||
      candidate.scope.clone !== this.scope.clone ||
      candidate.scope.worktree !== this.scope.worktree
    ) {
      const reason = `${portName}: wrong scope on token ${candidate.tokenId}`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if (candidate.epoch < this.currentEpoch) {
      const reason = `${portName}: superseded token epoch ${candidate.epoch} < ${this.currentEpoch}`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if (candidate.declarationRevision !== this.declarationRevision) {
      const reason = `${portName}: stale declarationRevision ${candidate.declarationRevision} !== ${this.declarationRevision}`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if (candidate.projectionIncarnation !== this.projectionIncarnation) {
      const reason = `${portName}: stale projectionIncarnation ${candidate.projectionIncarnation} !== ${this.projectionIncarnation}`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    if (!allowExpired && this.clock.now() >= candidate.expiresAt) {
      const reason = `${portName}: expired token (${this.clock.now()} >= ${candidate.expiresAt})`;
      this.fencingViolations.push(reason);
      return { ok: false, reason };
    }
    // Closing receiver check follows the injected clock too: revocation may occur in that port.
    if(this.revokedTokenIds.has(candidate.tokenId) || this.activeToken?.tokenId!==candidate.tokenId || candidate.epoch<this.currentEpoch)return {ok:false,reason:`${portName}: lease revoked during validation`};
    return { ok: true };
  }
}

export interface SourceFileEntry {
  readonly content: string;
  readonly statSize: number;
  readonly callsSymbolIn?: string;
  readonly exportsSymbol?: string;
  readonly mutateDuringRead?: boolean;
}

export interface LiveWorldPageCall {
  readonly paths: readonly string[];
  readonly token: TestScopeFencingToken | string | undefined;
  readonly pageId: string;
  readonly pageDigest: string;
}

/**
 * Independent mutable Source and Published-Projection models (L6b-design §5).
 * Tracks files, deletions, cross-file AST/call relations, refs/HEAD, immutable
 * commit OIDs (checking they are not re-extracted when already complete),
 * storage-owned incarnation P, and atomic fencing at every write port.
 */
export class LiveTestWorld {
  readonly clock: FakeClock;
  readonly authority: FakeWriterAuthority;
  readonly sourceFiles = new Map<string, SourceFileEntry>();
  readonly sourceRefs = new Map<string, string>([["refs/heads/main", "a".repeat(40)]]);
  readonly completeImmutableOids = new Set<string>();
  sourceConfigAttributes = "*.ts text eol=lf\n";

  // Storage-owned projection state (incarnation P + staged/published data).
  projectionIncarnation = "incarnation-1";
  private incarnationCounter = 1;
  readonly projectedFiles = new Map<string, string>();
  readonly projectedRelations = new Map<string, string>();
  readonly projectedRefs = new Map<string, string>();
  readonly projectedImmutableOids = new Set<string>();
  readonly oidExtractionCount = new Map<string, number>();
  readonly publishedGenerations = new Map<string, { readonly incarnation: string; readonly sourceDigest: string }>();
  readonly pageReceipts = new Map<string, { readonly digest: string; readonly receiptId: string }>();
  readonly markerStore = new Map<string, string>();

  readonly collectCalls: LiveWorldPageCall[] = [];
  readonly discoveryCalls: { readonly cursor: string | undefined; readonly count: number; readonly bytes: number }[] = [];
  fullScans = 0;
  initialScans = 0;
  relationRepairs = 0;
  maxMaterializedDiscoveryBatch = 0;

  // Fault injection hooks for controlled async boundaries.
  onDuringDiscovery: (() => void) | undefined;
  onDuringCollectPage: ((pageIndex: number, paths: readonly string[]) => Promise<void> | void) | undefined;
  onDuringPollRefs: (() => Promise<void> | void) | undefined;
  onDuringValidateSource: (() => Promise<void> | void) | undefined;
  onDuringPublish: (() => Promise<void> | void) | undefined;
  failPollRefs = false;
  forceIncompleteCollect = false;

  constructor(clock: FakeClock, authority?: FakeWriterAuthority) {
    this.clock = clock;
    this.authority = authority ?? new FakeWriterAuthority(clock);
    this.markerStore.set("__storage_incarnation__", this.projectionIncarnation);
  }

  setFile(
    path: string,
    content: string,
    options?: { statSize?: number; callsSymbolIn?: string; exportsSymbol?: string; mutateDuringRead?: boolean },
  ): void {
    this.sourceFiles.set(path, {
      content,
      statSize: options?.statSize ?? Buffer.byteLength(content, "utf8"),
      ...(options?.callsSymbolIn !== undefined ? { callsSymbolIn: options.callsSymbolIn } : {}),
      ...(options?.exportsSymbol !== undefined ? { exportsSymbol: options.exportsSymbol } : {}),
      ...(options?.mutateDuringRead !== undefined ? { mutateDuringRead: options.mutateDuringRead } : {}),
    });
  }

  deleteFile(path: string): void {
    this.sourceFiles.delete(path);
  }

  setRef(ref: string, oid: string, markImmutableComplete = false): void {
    this.sourceRefs.set(ref, oid);
    if (markImmutableComplete) this.completeImmutableOids.add(oid);
  }

  /**
   * Silent or signaled projection replacement: changes storage-owned
   * incarnation P and wipes projected data and markers.
   */
  replaceProjectionSilently(): string {
    this.incarnationCounter += 1;
    this.projectionIncarnation = `incarnation-${this.incarnationCounter}`;
    this.authority.projectionIncarnation = this.projectionIncarnation;
    this.projectedFiles.clear();
    this.projectedRelations.clear();
    this.projectedRefs.clear();
    this.projectedImmutableOids.clear();
    this.publishedGenerations.clear();
    this.pageReceipts.clear();
    this.markerStore.clear();
    this.markerStore.set("__storage_incarnation__", this.projectionIncarnation);
    return this.projectionIncarnation;
  }

  /** Expected relations derived from current source files. */
  expectedRelations(): Map<string, string> {
    const out = new Map<string, string>();
    for (const [callerPath, entry] of [...this.sourceFiles.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (entry.callsSymbolIn !== undefined) {
        const target = this.sourceFiles.get(entry.callsSymbolIn);
        if (target !== undefined) {
          out.set(callerPath, `${entry.callsSymbolIn}#${target.exportsSymbol ?? "default"}:${ sha256Hex(target.content).slice(0, 8)}`);
        } else {
          out.set(callerPath, `unresolved:${entry.callsSymbolIn}`);
        }
      }
    }
    return out;
  }

  computeSourceVector(): {
    readonly refsFingerprint: string;
    readonly headOid: string;
    readonly indexFingerprint: string;
    readonly pathMembershipFingerprint: string;
    readonly contentFingerprint: string;
    readonly configAttributesFingerprint: string;
  } {
    const sortedRefs = [...this.sourceRefs.entries()].sort(([a], [b]) => a.localeCompare(b));
    const headOid = this.sourceRefs.get("refs/heads/main") ?? sortedRefs[0]?.[1] ?? "0".repeat(40);
    const sortedFiles = [...this.sourceFiles.entries()].sort(([a], [b]) => a.localeCompare(b));
    const pathsJoined = sortedFiles.map(([p]) => p).join("\0");
    const contentsJoined = sortedFiles.map(([p, e]) => `${p}:${sha256Hex(e.content)}`).join("\0");
    return {
      refsFingerprint: sha256Hex(JSON.stringify(sortedRefs)),
      headOid,
      indexFingerprint: sha256Hex(`idx:${contentsJoined}`),
      pathMembershipFingerprint: sha256Hex(pathsJoined),
      contentFingerprint: sha256Hex(contentsJoined),
      configAttributesFingerprint: sha256Hex(this.sourceConfigAttributes),
    };
  }

  /**
   * True iff the published projection data (files, deletions, relations,
   * refs, and published generation in the current incarnation P) exactly
   * match the authoritative source!
   */
  dataMatchesSource(): boolean {
    if (this.projectedFiles.size !== this.sourceFiles.size) return false;
    for (const [path, entry] of this.sourceFiles.entries()) {
      if (this.projectedFiles.get(path) !== entry.content) return false;
    }
    const expectedRels = this.expectedRelations();
    if (this.projectedRelations.size !== expectedRels.size) return false;
    for (const [caller, rel] of expectedRels.entries()) {
      if (this.projectedRelations.get(caller) !== rel) return false;
    }
    if (this.projectedRefs.size !== this.sourceRefs.size) return false;
    for (const [ref, oid] of this.sourceRefs.entries()) {
      if (this.projectedRefs.get(ref) !== oid) return false;
    }
    const hasCurrentIncarnationGen = [...this.publishedGenerations.values()].some(
      (gen) => gen.incarnation === this.projectionIncarnation && gen.sourceDigest === sha256Hex(JSON.stringify(this.computeSourceVector())),
    );
    return hasCurrentIncarnationGen;
  }
}

/** One generated trace step for class property tests. */
export type TraceStep =
  | { readonly kind: "edit"; readonly path: string; readonly content: string; readonly silent?: boolean }
  | { readonly kind: "delete"; readonly path: string; readonly silent?: boolean }
  | { readonly kind: "relation-edit"; readonly targetPath: string; readonly callerPath: string; readonly exportSym: string; readonly silent?: boolean }
  | { readonly kind: "duplicate-change"; readonly path: string }
  | { readonly kind: "overflow" }
  | { readonly kind: "downtime"; readonly ms: number }
  | { readonly kind: "ref-move"; readonly ref: string; readonly oid: string; readonly reuseCompleteOid?: boolean }
  | { readonly kind: "silent-replacement" }
  | { readonly kind: "signaled-replacement" }
  | { readonly kind: "restart" }
  | { readonly kind: "writer-conflict"; readonly epoch: number }
  | { readonly kind: "quiet"; readonly ms: number };

/** Legacy generated operation kept for existing tests. */
export type GeneratedOp =
  | { readonly op: "change"; readonly path: string }
  | { readonly op: "overflow" }
  | { readonly op: "downtime"; readonly ms: number }
  | { readonly op: "packed-refs" }
  | { readonly op: "projection-replaced" }
  | { readonly op: "restart" }
  | { readonly op: "writer-takeover" }
  | { readonly op: "quiet"; readonly ms: number };

const OP_POOL: readonly GeneratedOp["op"][] = [
  "change",
  "change",
  "change",
  "overflow",
  "downtime",
  "packed-refs",
  "projection-replaced",
  "restart",
  "writer-takeover",
  "quiet",
];

/** Generate a deterministic disruption sequence of the requested length. */
export function generateOpSequence(seed: number, length: number): GeneratedOp[] {
  const rand = createSeededRandom(seed);
  const out: GeneratedOp[] = [];
  for (let i = 0; i < length; i += 1) {
    const pick = OP_POOL[Math.floor(rand() * OP_POOL.length)] as GeneratedOp["op"];
    switch (pick) {
      case "change":
        out.push({ op: "change", path: `src/file-${Math.floor(rand() * 8)}.ts` });
        break;
      case "downtime":
        out.push({ op: "downtime", ms: 1000 + Math.floor(rand() * 30_000) });
        break;
      case "quiet":
        out.push({ op: "quiet", ms: 100 + Math.floor(rand() * 2000) });
        break;
      default:
        out.push({ op: pick } as GeneratedOp);
        break;
    }
  }
  return out;
}

const TRACE_KINDS: readonly TraceStep["kind"][] = [
  "edit",
  "edit",
  "delete",
  "relation-edit",
  "duplicate-change",
  "overflow",
  "downtime",
  "ref-move",
  "silent-replacement",
  "signaled-replacement",
  "restart",
  "writer-conflict",
  "quiet",
];

/** Generate a rich mixed trace for L6b defect-class acceptance properties. */
export function generateMixedTrace(seed: number, length: number): TraceStep[] {
  const rand = createSeededRandom(seed);
  const steps: TraceStep[] = [];
  let nextEpoch = 2;
  for (let i = 0; i < length; i += 1) {
    const kind = TRACE_KINDS[Math.floor(rand() * TRACE_KINDS.length)] as TraceStep["kind"];
    const fileIdx = Math.floor(rand() * 6);
    const path = `src/mod-${fileIdx}.ts`;
    switch (kind) {
      case "edit":
        steps.push({
          kind: "edit",
          path,
          content: `export const v = "${seed}-${i}";\n`,
          silent: rand() < 0.35,
        });
        break;
      case "delete":
        steps.push({
          kind: "delete",
          path,
          silent: rand() < 0.35,
        });
        break;
      case "relation-edit":
        steps.push({
          kind: "relation-edit",
          targetPath: "src/lib-target.ts",
          callerPath: "src/lib-caller.ts",
          exportSym: `fn_${seed}_${i}`,
          silent: rand() < 0.3,
        });
        break;
      case "duplicate-change":
        steps.push({ kind: "duplicate-change", path });
        break;
      case "overflow":
        steps.push({ kind: "overflow" });
        break;
      case "downtime":
        steps.push({ kind: "downtime", ms: 500 + Math.floor(rand() * 15_000) });
        break;
      case "ref-move": {
        const reuse = rand() < 0.4;
        const oid = reuse
          ? `1111111111111111111111111111111111111111`
          : `${seed.toString(16)}${i.toString(16)}`.padEnd(40, "a").slice(0, 40);
        steps.push({ kind: "ref-move", ref: "refs/heads/main", oid, reuseCompleteOid: reuse });
        break;
      }
      case "silent-replacement":
        steps.push({ kind: "silent-replacement" });
        break;
      case "signaled-replacement":
        steps.push({ kind: "signaled-replacement" });
        break;
      case "restart":
        steps.push({ kind: "restart" });
        break;
      case "writer-conflict":
        steps.push({ kind: "writer-conflict", epoch: nextEpoch++ });
        break;
      case "quiet":
        steps.push({ kind: "quiet", ms: 200 + Math.floor(rand() * 2500) });
        break;
    }
  }
  return steps;
}

/**
 * Execute a seeded trace property and greedily shrink by prefix + single-step
 * deletion on failure so the minimal failing trace and seed are reported
 * (L6b-design l.133 + Opus Amendment 10).
 */
export async function runTraceProperty<T>(
  seed: number,
  trace: readonly T[],
  runTrace: (steps: readonly T[]) => Promise<void>,
): Promise<void> {
  try {
    await runTrace(trace);
    return;
  } catch (initialError) {
    // 1. Greedy prefix reduction: find shortest failing prefix.
    let minimal: T[] = [...trace];
    for (let len = 1; len < minimal.length; len += 1) {
      const candidate = minimal.slice(0, len);
      try {
        await runTrace(candidate);
      } catch {
        minimal = candidate;
        break;
      }
    }
    // 2. Greedy step pruning within the failing prefix.
    let i = 0;
    while (i < minimal.length && minimal.length > 1) {
      const candidate = [...minimal.slice(0, i), ...minimal.slice(i + 1)];
      try {
        await runTrace(candidate);
        i += 1;
      } catch {
        minimal = candidate;
      }
    }
    const detail = initialError instanceof Error ? initialError.message : String(initialError);
    throw new Error(
      `Trace property failed (seed=${seed}, originalSteps=${trace.length}, minimizedSteps=${minimal.length}, minimizedTrace=${JSON.stringify(minimal)}): ${detail}`,
    );
  }
}

export function testBudgets(overrides: Partial<SchedulerBudgets> = {}): SchedulerBudgets {
  return {maxPendingPaths:64,maxPendingBytes:16*1024*1024,maxConcurrency:4,maxActiveOperationsPerScope:1,maxRetries:2,retryBaseMs:5,maxBackoffMs:30000,maxFailedKept:8,maxConsumers:32,maxFileSizeBytes:1024*1024,maxPathBytes:1024,readMarginBytes:64,maxDiscoveryBytes:8192,maxBatchBytes:1024*1024,maxGitChildren:4,attemptDeadlineMs:30000,cancellationDeadlineMs:10,interactiveQuantum:3,backfillQuantum:1,backfillReserveBytes:4*1024*1024,durableBacklogQuota:100000,...overrides};
}
export function testToken(clock: FakeClock, scopeId="scope"): TestScopeFencingToken {
  return {tokenId:scopeId,scope:{tenant:"t",clone:scopeId,worktree:"w"},epoch:1,epochId:"epoch-1",declarationRevision:1,projectionIncarnation:"incarnation-1",issuedAt:clock.now(),expiresAt:clock.now()+10000000};
}
export function testItem(clock: FakeClock, id:string, overrides: Partial<WorkItem> = {}): WorkItem {
  const token=overrides.fencingToken??testToken(clock,overrides.scopeId??id);
  return {id,priority:"interactive",bytes:4096,idempotencyDigest:id,...overrides,fencingToken:token,scopeId:JSON.stringify([token.scope.tenant,token.scope.clone,token.scope.worktree])};
}
export function makeScheduler(clock: FakeClock, ports: Partial<SchedulerPorts> = {}, budgets: Partial<SchedulerBudgets> = {}): Scheduler {
  const progress=new Map<string,{attempts:number;receiptId?:string;digest:string;scopeId:string}>();
  const validate=ports.validateToken??((t:TestScopeFencingToken)=>!!t&&t.expiresAt>clock.now());
  return new Scheduler({clock,validateToken:validate,sink:{deliver:async id=>({ok:true,receiptId:id})},sleep:async(ms,signal)=>{if(!signal.aborted)clock.advance(ms);},park:item=>{if(!validate(item.fencingToken))throw new Error("FENCING_REJECTED");},readProgress:item=>progress.get(item.id),backlogSize:()=>[...progress.values()].filter(p=>!p.receiptId).length,writeProgress:(item,value)=>{if(!validate(item.fencingToken))throw new Error("FENCING_REJECTED");const old=progress.get(item.id);if(old&&(old.digest!==item.idempotencyDigest||old.scopeId!==item.scopeId||old.attempts>value.attempts))throw new Error("CONFLICTING_PROGRESS");progress.set(item.id,{...value,digest:item.idempotencyDigest,scopeId:item.scopeId});},...ports},testBudgets(budgets));
}
export async function flush(): Promise<void> { for(let i=0;i<100;i++) await Promise.resolve(); }

export function bindWorldPorts(world: LiveTestWorld, budgets = testBudgets()) {
  const fence = (options: CollectOptions) => {
    options.resources.check();
    const check = world.authority.validateAtomicWrite(options.fencingToken,"receiver");
    if (!check.ok) throw new Error(`FENCING_REJECTED: ${check.reason}`);
  };
  const projectionMatches = () => {
    if(world.projectedFiles.size!==world.sourceFiles.size || world.projectedRefs.size!==world.sourceRefs.size) return false;
    for(const [p,e] of world.sourceFiles) if(world.projectedFiles.get(p)!==e.content) return false;
    for(const [r,oid] of world.sourceRefs) if(world.projectedRefs.get(r)!==oid) return false;
    const relations=world.expectedRelations();
    if(relations.size!==world.projectedRelations.size) return false;
    for(const [p,rel] of relations) if(world.projectedRelations.get(p)!==rel) return false;
    return true;
  };
  let pageIndex=0;
  const scan: ReconcileScan={
    async discoverPage(cursor,limits,options){
      fence(options); if(cursor===undefined){world.fullScans++;world.onDuringDiscovery?.();}
      // Bounded selection directly from the source/storage iterators, including deletion tombstones.
      const selected:string[]=[];
      const consider=(path:string)=>{
        if(cursor!==undefined && path<=cursor || selected.includes(path)) return;
        let lower=0,upper=selected.length;while(lower<upper){const middle=(lower+upper)>>>1;if(selected[middle]!<path)lower=middle+1;else upper=middle;}
        selected.splice(lower,0,path); if(selected.length>limits.maxCount)selected.pop();
      };
      for(const p of world.sourceFiles.keys())consider(p);
      for(const p of world.projectedFiles.keys())consider(p);
      const entries:{path:string;statSize:number;contentFingerprint:string}[]=[]; const deletedPaths:string[]=[];
      let used=128; let last:string|undefined;
      for(const p of selected){
        const file=world.sourceFiles.get(p); const n=Buffer.byteLength(p)+160;
        if(used+n>limits.maxBytes)break;
        used+=n;last=p;
        if(file)entries.push({path:p,statSize:file.statSize,contentFingerprint:sha256Hex(file.content)});else deletedPaths.push(p);
      }
      let more=false;
      for(const p of world.sourceFiles.keys())if(last!==undefined && p>last)more=true;
      for(const p of world.projectedFiles.keys())if(last!==undefined && p>last)more=true;
      const done=!more;
      world.discoveryCalls.push({cursor,count:entries.length+deletedPaths.length,bytes:used});
      world.maxMaterializedDiscoveryBatch=Math.max(world.maxMaterializedDiscoveryBatch,entries.length+deletedPaths.length);
      return {entries,deletedPaths,nextCursor:done?undefined:last,done,complete:selected.length===0||last!==undefined};
    },
    async collectPaths(paths,options){
      await world.onDuringCollectPage?.(pageIndex++,paths); fence(options);
      world.collectCalls.push({paths:[...paths],token:options.fencingToken,pageId:options.pageId,pageDigest:options.pageDigest});
      const existing=world.pageReceipts.get(options.pageId);
      if(existing){if(existing.digest!==options.pageDigest)throw new Error("CONFLICTING_PAGE_REPLAY");return {collected:paths,complete:true,receiptId:existing.receiptId};}
      if(world.forceIncompleteCollect)return {collected:[],complete:false,receiptId:""};
      const releaseOutput=options.resources.hold(budgets.maxBatchBytes);
      try{
        let output=0;
        for(const p of paths){
          const e=world.sourceFiles.get(p);
          if(!e){world.projectedFiles.delete(p);continue;}
          if(e.statSize>budgets.maxFileSizeBytes)return {collected:[],complete:false,receiptId:""};
          try{
            await options.resources.readFile(e.statSize,async allowance=>{
              if(e.mutateDuringRead){world.setFile(p,e.content+"grew",{statSize:e.statSize+allowance+1});return {bytesRead:allowance+1,value:undefined};}
              return {bytesRead:Buffer.byteLength(e.content),value:undefined};
            });
            output+=Buffer.byteLength(e.content)+Buffer.byteLength(p);
            if(output>budgets.maxBatchBytes)return {collected:[],complete:false,receiptId:""};
            fence(options);world.projectedFiles.set(p,e.content);
          }catch(error){if(/unstable|oversize/.test(String(error)))return {collected:[],complete:false,unstable:true,receiptId:""};throw error;}
        }
        for(const p of options.deletedPaths){fence(options);world.projectedFiles.delete(p);world.projectedRelations.delete(p);}
        world.projectedRefs.clear();
        for(const [ref,oid] of world.sourceRefs){
          world.projectedRefs.set(ref,oid);
          if(!world.projectedImmutableOids.has(oid) && !world.completeImmutableOids.has(oid))world.oidExtractionCount.set(oid,(world.oidExtractionCount.get(oid)??0)+1);
          world.projectedImmutableOids.add(oid);
        }
        const receiptId=`receipt:${options.pageId}`;
        world.pageReceipts.set(options.pageId,{digest:options.pageDigest,receiptId});
        return {collected:paths,complete:true,receiptId};
      }finally{releaseOutput();}
    },
    async repairRelations(_paths,_deleted,options){
      fence(options);world.relationRepairs++;
      world.projectedRelations.clear();for(const [p,r] of world.expectedRelations())world.projectedRelations.set(p,r);
      return {complete:true,receiptId:`relations:${options.pageId}`};
    },
    currentSourceVector(resources){resources.check();return world.computeSourceVector();},
    pathFingerprint(path,resources){resources.check();const entry=world.sourceFiles.get(path);return entry?sha256Hex(entry.content):"deleted";},
    async validateSource(expected,options){
      await world.onDuringValidateSource?.();fence(options);
      const actual=world.computeSourceVector();
      return {valid:sourceVectorsEqual(expected,actual),projectionMatches:projectionMatches(),sourceVector:actual,validatedAt:world.clock.now(),axes:Object.fromEntries(COVERAGE_AXES.map(a=>[a,{complete:true}]))};
    },
    async publishGeneration(request,options){
      await world.onDuringPublish?.();fence(options);
      const published=request.expectedIncarnation===world.projectionIncarnation && world.markerStore.get("live-checkpoint")===request.checkpoint && sourceVectorsEqual(request.sourceVector,world.computeSourceVector()) && projectionMatches();
      if(published)world.publishedGenerations.set(request.generationId,{incarnation:world.projectionIncarnation,sourceDigest:sha256Hex(JSON.stringify(request.sourceVector))});
      return {published,generationId:request.generationId,incarnation:world.projectionIncarnation,receiptId:published?`publication:${request.generationId}`:""};
    }
  };
  const store={get:(key:string)=>world.markerStore.get(key),set:(key:string,value:string,token:TestScopeFencingToken)=>{if(!world.authority.validateAtomicWrite(token,"store.set").ok)throw new Error("FENCING_REJECTED");world.markerStore.set(key,value);},delete:(key:string,token:TestScopeFencingToken)=>{if(!world.authority.validateAtomicWrite(token,"store.delete").ok)throw new Error("FENCING_REJECTED");world.markerStore.delete(key);},incarnation:()=>world.projectionIncarnation,hasGeneration:(incarnation:string,id:string)=>world.publishedGenerations.get(id)?.incarnation===incarnation && incarnation===world.projectionIncarnation};
  const pollRefs=async(options:CollectOptions)=>options.resources.withGit(async()=>{await world.onDuringPollRefs?.();fence(options);if(world.failPollRefs)throw new Error("ref observation failed");return [...world.sourceRefs].map(([ref,oid])=>({ref,oid}));});
  return {scan,store,pollRefs,writer:world.authority};
}
export async function createLiveRig(overrides: Partial<ReconcilerPorts> = {}, ready=true, schedulerBudgets: Partial<SchedulerBudgets> = {}, reconcileBudgets: Partial<ReconcileBudgets> = {}) {
  const clock=createFakeClock();const world=new LiveTestWorld(clock);
  const fake=new FakeWatcher(clock);
  const scheduler=makeScheduler(clock,{validateToken:t=>world.authority.validate(t)},schedulerBudgets);
  const hub=createWatchHub({start:()=>fake.start(),stop:()=>fake.stop(),onSignal:listener=>fake.onSignal((s,at)=>listener({...s,paths:"paths" in s?s.paths:[],at} as Parameters<typeof listener>[0]))},clock,{maxPendingPaths:16,debounceMs:500,scheduler});
  if(ready){const start=hub.bootstrap();fake.releaseReady();await start;}
  const ports:ReconcilerPorts={scope:DEFAULT_TEST_SCOPE,declarationRevision:1,hub,clock,scheduler,...bindWorldPorts(world),budgets:{maxRounds:64,collectPageSize:4,maxPagesPerRound:2,operationBytes:4*1024*1024,maxDeltaPaths:16,pollIntervalMs:10000,...reconcileBudgets},...overrides};
  const reconciler=new Reconciler(ports);
  return {clock,world,fake,hub,scheduler,ports,reconciler,close:async()=>{await reconciler.shutdown();await hub.dispose();}};
}

// Historical pre-a1 campaign, replayed individually with restoration in finally (plan/09 L6b).
export const L6B_MUTATIONS =
[
  {
    "id": "A1-empty-certificate",
    "file": "engram-live/coverage.ts",
    "from": "  const unknownDoubtSeq =\n",
    "to": "  return {...previous,state:\"current\"};\n  const unknownDoubtSeq =\n",
    "test": "A1 proofless"
  },
  {
    "id": "A1-proofless",
    "file": "engram-live/coverage.ts",
    "from": "  const previous = map.axes[axis];",
    "to": "  const previous = map.axes[axis]; if(!evidence.certificate)return withAxis(map,{...previous!,state:\"current\"});",
    "test": "A1 proofless"
  },
  {
    "id": "A1-blanket-axes",
    "file": "engram-live/reconcile.ts",
    "from": "complete:proof?.complete===true",
    "to": "complete:true",
    "test": "A1 proofless"
  },
  {
    "id": "A1-pending-invalidation",
    "file": "engram-live/reconcile.ts",
    "from": "this.mark(\"pending\",\"reconciliation in progress\");",
    "to": ";",
    "test": "A1 pending observation"
  },
  {
    "id": "A1-validation",
    "file": "engram-live/reconcile.ts",
    "from": "!validation.valid || !validation.projectionMatches",
    "to": "!validation.projectionMatches",
    "test": "A1 pending observation"
  },
  {
    "id": "A1-readiness",
    "file": "engram-live/watch.ts",
    "from": "if (state === \"starting\") {\n        throw new Error(\"watch not ready: the initial scan is refused before watcher readiness\");\n      }",
    "to": "",
    "test": "watcher readiness"
  },
  {
    "id": "A2-no-periodic",
    "file": "engram-live/reconcile.ts",
    "from": "if (this.cancelTimer || !this.live()) return;",
    "to": "return;",
    "test": "A2 autonomous"
  },
  {
    "id": "A2-refs-marker-only",
    "file": "engram-live/reconcile.ts",
    "from": "this.unknownDoubt(\"refs changed\")",
    "to": "void 0",
    "test": "A2 observed ref"
  },
  {
    "id": "A3-final-source",
    "file": "engram-live/coverage.ts",
    "from": "  return (\n    a.refsFingerprint",
    "to": "  return true; return (\n    a.refsFingerprint",
    "test": "A3 edits during the closing"
  },
  {
    "id": "A3-final-doubt",
    "file": "engram-live/reconcile.ts",
    "from": "const unchanged = () => this.live()",
    "to": "const unchanged = () => true || this.live()",
    "test": "A3 guards before publication"
  },
  {
    "id": "A3-generation-existence",
    "file": "engram-live/reconcile.ts",
    "from": "return this.ports.store.hasGeneration(incarnation,generation);",
    "to": "return true;",
    "test": "A3 guards before publication"
  },
  {
    "id": "B1-token-omitted",
    "file": "engram-live/reconcile.ts",
    "from": "fencingToken:this.token!,resources",
    "to": "fencingToken:undefined as unknown as ScopeFencingToken,resources",
    "test": "B1 missing proof"
  },
  {
    "id": "B2-fencing-retry",
    "file": "engram-live/scheduler.ts",
    "from": "if (outcome.fenced) {",
    "to": "if (false && outcome.fenced) {",
    "test": "C5 retry ceilings"
  },
  {
    "id": "B3-instance-gate",
    "file": "engram-live/reconcile.ts",
    "from": "this.gate = managerGates.get(this.key) ?? { refs:0,tail:Promise.resolve() };",
    "to": "this.gate = { refs:0,tail:Promise.resolve() };",
    "test": "B3 scope units"
  },
  {
    "id": "B3-ignore-shutdown",
    "file": "engram-live/reconcile.ts",
    "from": "this.state=\"stopped\";",
    "to": "this.state=\"running\";",
    "test": "B3 scope units"
  },
  {
    "id": "C1-drop-active-ownership",
    "file": "engram-live/scheduler.ts",
    "from": "this.active--; const count",
    "to": "this.active=0; const count",
    "test": "C1 rejected operations"
  },
  {
    "id": "C1-release-leaked-buffer",
    "file": "engram-live/scheduler.ts",
    "from": "if (e.used !== this.descriptorBytes(e.item)) {",
    "to": "if (false && e.used !== this.descriptorBytes(e.item)) {",
    "test": "C1/C3 reserves actual"
  },
  {
    "id": "C2-retain-results",
    "file": "engram-live/scheduler.ts",
    "from": "this.entries.delete(e.item.id); this.bytes -= e.item.bytes;",
    "to": "this.bytes -= e.item.bytes;",
    "test": "C2 endless"
  },
  {
    "id": "C2-wait-global-drain",
    "file": "engram-live/scheduler.ts",
    "from": "this.bytes -= e.item.bytes; this.notify(e,result);",
    "to": "this.bytes -= e.item.bytes; if(this.active===0)this.notify(e,result);",
    "test": "C2 endless"
  },
  {
    "id": "C2-unbounded-consumers",
    "file": "engram-live/scheduler.ts",
    "from": "this.wake(); return promise;",
    "to": "this.wake(); return promise.then(result=>result);",
    "test": "C2/B4 duplicate"
  },
  {
    "id": "C2-unbounded-diagnostics",
    "file": "engram-live/scheduler.ts",
    "from": "if (this.diagnostics.length === this.budgets.maxFailedKept) this.diagnostics.shift();",
    "to": ";",
    "test": "C2 endless"
  },
  {
    "id": "C3-discovery-materialization",
    "file": "engram-live/reconcile.ts",
    "from": "maxCount:budgets.collectPageSize,maxBytes:this.ports.scheduler.budgets.maxDiscoveryBytes",
    "to": "maxCount:10000000,maxBytes:10000000",
    "test": "C3 discovery pages"
  },
  {
    "id": "C3-reset-cursor",
    "file": "engram-live/reconcile.ts",
    "from": "pass.cursor = discovered.nextCursor;",
    "to": "pass.cursor = undefined;",
    "test": "C3 discovery pages"
  },
  {
    "id": "C3-unreserved-read",
    "file": "engram-live/scheduler.ts",
    "from": "const free=this.permit(e).hold(allowance);",
    "to": "const free=()=>{};",
    "test": "C1/C3 reserves actual"
  },
  {
    "id": "C3-unbounded-git",
    "file": "engram-live/scheduler.ts",
    "from": "this.gitChildren++; try",
    "to": "try",
    "test": "C1/C3 reserves actual"
  },
  {
    "id": "C4-no-headroom",
    "file": "engram-live/scheduler.ts",
    "from": "this.bytes + item.bytes > this.budgets.maxPendingBytes - headroom",
    "to": "this.bytes + item.bytes > this.budgets.maxPendingBytes",
    "test": "C4 admission reserves"
  },
  {
    "id": "C4-reset-rotation",
    "file": "engram-live/scheduler.ts",
    "from": "this.rotation = (this.rotation + 1) % 4;",
    "to": "this.rotation = 0;",
    "test": "C4 admission reserves"
  },
  {
    "id": "C4-no-scope-rotation",
    "file": "engram-live/scheduler.ts",
    "from": "eligible(e) && e.item.scopeId !== this.lastScope[priority]",
    "to": "false",
    "test": "C4 scopes rotate"
  },
  {
    "id": "C5-unbounded-delay",
    "file": "engram-live/scheduler.ts",
    "from": "Math.min(this.budgets.maxBackoffMs, supplied !== undefined && Number.isFinite(supplied) && supplied >= 0 ? supplied : this.budgets.retryBaseMs * 2 ** (e.attempts-1))",
    "to": "(supplied ?? this.budgets.retryBaseMs)",
    "test": "C5 retry ceilings"
  },
  {
    "id": "C5-reset-attempts",
    "file": "engram-live/scheduler.ts",
    "from": "Object.assign(e,{ controller:",
    "to": "Object.assign(e,{ attempts:0,controller:",
    "test": "C5 retry ceilings"
  },
  {
    "id": "C5-ignore-quota",
    "file": "engram-live/scheduler.ts",
    "from": "this.durableUsed >= this.budgets.durableBacklogQuota",
    "to": "false",
    "test": "C5 quota exhaustion"
  },
  {
    "id": "C-byte-admission",
    "file": "engram-live/scheduler.ts",
    "from": "this.bytes + item.bytes > this.budgets.maxPendingBytes - headroom",
    "to": "false",
    "test": "C/D generated admission"
  },
  {
    "id": "C-slot-admission",
    "file": "engram-live/scheduler.ts",
    "from": "this.entries.size + this.residents.size + 1 > this.budgets.maxPendingPaths - slotHeadroom",
    "to": "false",
    "test": "C/D generated admission"
  },
  {
    "id": "BC-conflicting-success",
    "file": "engram-live/scheduler.ts",
    "from": "? \"queued\" : \"conflict\";",
    "to": "? \"queued\" : \"queued\";",
    "test": "C2/B4 duplicate"
  },
  {
    "id": "D1-delete-callback",
    "file": "engram-live/scheduler.ts",
    "from": "e.cancelled = true; e.controller.abort();",
    "to": "e.cancelled = true; (e as {worker?:unknown}).worker=undefined; e.controller.abort();",
    "test": "D1 cancellation at dispatch"
  },
  {
    "id": "D1-release-on-abort",
    "file": "engram-live/scheduler.ts",
    "from": "e.cancelled = true; e.controller.abort();",
    "to": "e.cancelled = true; this.bytes-=e.item.bytes; e.controller.abort();",
    "test": "D1 cancellation at dispatch"
  },
  {
    "id": "D1-requeue-double-reservation",
    "file": "engram-live/scheduler.ts",
    "from": "this.queues[e.item.priority].push(e); this.wake(); return true;",
    "to": "this.bytes+=e.item.bytes; this.queues[e.item.priority].push(e); this.wake(); return true;",
    "test": "D1 cancellation at dispatch"
  },
  {
    "id": "D1-no-quarantine",
    "file": "engram-live/scheduler.ts",
    "from": "e.quarantined = true; this.notify(e,{ok:false,reason:\"quarantined\"});",
    "to": "e.quarantined = false; this.notify(e,{ok:false,reason:\"quarantined\"});",
    "test": "D1 blocked cancelled"
  },
  {
    "id": "A1-axis-binding",
    "file": "engram-live/coverage.ts",
    "from": "if(cert.axis!==previous.axis)",
    "to": "if(false && cert.axis!==previous.axis)",
    "test": "A1 certificates are bound"
  },
  {
    "id": "A1-observation-failure",
    "file": "engram-live/watch.ts",
    "from": "return !observationFailed && (state === \"ready\" || state === \"degraded\");",
    "to": "return state === \"ready\" || state === \"degraded\";",
    "test": "A1 failed observation"
  },
  {
    "id": "C5-reset-on-restart",
    "file": "engram-live/scheduler.ts",
    "from": "attempts: progress?.attempts ?? 0",
    "to": "attempts: 0",
    "test": "C5 a new manager"
  }
] as const;

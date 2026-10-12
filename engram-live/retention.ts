// @sentropic/engram-live/retention — R1 private retention of every ingested root
// (spec/SPEC_LIVE_GIT_INDEXING.md §4, A02/A04; plan/09 R1).
//
// The neutral retention engine. Engram derives one scoped retention request
// per distinct ingested root OID and requires one scoped durable receipt
// before any reconstructible-coverage claim:
//
//   1. derive the requests from the L2b selected roots (./refs.js): default
//      branch even when old, active local/remote branches, PR heads of all
//      states, detached worktree HEADs, previously ingested roots — with no
//      commit-count and no commit-age limit, and nothing ever erased here;
//   2. record every request through the INJECTED retention port (a port,
//      never a base; engram owns no database and no object store);
//   3. load the scoped durable receipts from that same port and classify
//      coverage: every request needs its tenant + clone receipt; a missing
//      receipt is an explicit object-availability gap, never a silent
//      current claim.
//
// Neutrality: this module imports ONLY ./contracts.js (data-pure DTOs and
// validators). No h2a, no cluster-mesh, no sentropic, no storage driver,
// no network, no filesystem, no clock read — the evaluation time `now` is
// injected, and durability comes from the host port alone.
//
// Host contract (H: live-object-store.ts, delegate.ts — NOT implemented
// here): h2a consumes RetentionRequestDto through RetentionPort, acquires
// the pinned committed objects into its protected private Git store under
// private refs (no writes into the observed clone, no borrowed alternates
// store, no repository-controlled programs), then records a
// RetentionReceiptDto with an opaque coordinated-backup backupRef for L8.
// If removal wins the acquisition race, H records no receipt and the engine
// reports the gap; quotas pause further work without deleting protected
// roots. P1 reuses this facility for PR roots. Uncommitted plaintext never
// enters a request or a receipt: requests carry OIDs only, by construction.

import {
  RETENTION_COVERAGE_AXIS,
  validateLiveScope,
  validateQualifiedOid,
  validateRetentionReceipt,
  validateRetentionRequest,
  type LiveScope,
  type OidAlgorithm,
  type QualifiedOid,
  type RetentionCoverageReportDto,
  type RetentionReceiptDto,
  type RetentionReceiptQuery,
  type RetentionRequestDto,
  type SelectedRootDto,
} from "./contracts.js";

export class RetentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetentionError";
  }
}

/**
 * THE injected retention port (plan/09 R1: a port, never a base). Engram
 * defines the contract only; h2a implements durable acquisition and the
 * private store behind it. Receipts are scoped by tenant + clone and
 * durable across passes; the port never carries file content.
 */
export interface RetentionPort {
  recordRequest(request: RetentionRequestDto): Promise<{ received: true }>;
  recordReceipt(receipt: RetentionReceiptDto): Promise<{ received: true }>;
  loadReceipts(query: RetentionReceiptQuery): Promise<{ receipts: readonly RetentionReceiptDto[] }>;
}

export interface RetentionPassInput {
  readonly roots: readonly SelectedRootDto[];
  readonly scope: LiveScope;
  /** Injected evaluation time for requestedAt (ms); the engine reads no clock. */
  readonly now: number;
}

export interface RetentionPassStats {
  readonly requests: number;
  readonly receipts: number;
  readonly missing: number;
}

export interface RetentionPassOutcome {
  /** "complete": every request has its scoped durable receipt. "gaps": otherwise. */
  readonly state: "complete" | "gaps";
  readonly requests: readonly RetentionRequestDto[];
  readonly coverage: readonly RetentionCoverageReportDto[];
  readonly stats: RetentionPassStats;
}

function checkScope(scope: LiveScope): void {
  const checked = validateLiveScope(scope);
  if (!checked.ok) {
    throw new RetentionError(`invalid retention scope: ${checked.errors.join("; ")}`);
  }
  if (scope.worktree !== undefined) {
    throw new RetentionError("retention scope must be clone-scoped: worktree must be absent (retention is per tenant + clone)");
  }
}

function checkNow(now: number): void {
  if (typeof now !== "number" || !Number.isSafeInteger(now) || now <= 0) {
    throw new RetentionError("retention pass requires a positive safe-integer now (milliseconds)");
  }
}

/**
 * Derive one retention request per distinct root OID, sorted by OID.
 * Pure and total over valid inputs: no count cap, no age filter, no
 * pruning — an old default branch, an expired window branch kept as a
 * previously-ingested root, a PR head of any state and a detached HEAD
 * each yield exactly one request.
 */
export function deriveRetentionRequests(
  roots: readonly SelectedRootDto[],
  scope: LiveScope,
  now: number,
): RetentionRequestDto[] {
  checkScope(scope);
  checkNow(now);
  // Immutable snapshot: the caller-owned scope object may be shared and
  // mutated while the pass awaits the port; every derived request carries
  // the pass-entry scope, never a later mutation.
  const frozen: LiveScope = { tenant: scope.tenant, clone: scope.clone };
  const seen = new Set<string>();
  const requests: RetentionRequestDto[] = [];
  for (const root of roots) {
    const checked = validateQualifiedOid(root.qualifiedOid);
    if (!checked.ok) {
      throw new RetentionError(`invalid root OID ${root.qualifiedOid.oid}: ${checked.errors.join("; ")}`);
    }
    if (seen.has(root.qualifiedOid.oid)) continue;
    seen.add(root.qualifiedOid.oid);
    if (root.sources.length === 0) {
      throw new RetentionError(`root ${root.qualifiedOid.oid} carries no provenance source`);
    }
    const first = root.sources[0]!;
    const refBacked = root.sources.find((source) => source.refName !== null);
    const request: RetentionRequestDto = {
      scope: { tenant: frozen.tenant, clone: frozen.clone },
      algorithm: root.qualifiedOid.algorithm,
      oid: root.qualifiedOid.oid,
      firstSignal: first.signal,
      refName: refBacked !== undefined ? refBacked.refName : null,
      requestedAt: now,
    };
    const valid = validateRetentionRequest(request);
    if (!valid.ok) {
      throw new RetentionError(`derived invalid retention request for ${request.oid}: ${valid.errors.join("; ")}`);
    }
    requests.push(request);
  }
  requests.sort((left, right) => left.oid.localeCompare(right.oid));
  return requests;
}

function receiptKey(receipt: RetentionReceiptDto): string {
  return `${receipt.scope.tenant}:${receipt.scope.clone}:${receipt.algorithm}:${receipt.oid}`;
}

/**
 * Run one retention pass: record every request, then require every scoped
 * durable receipt. Deterministic over the injected inputs; the port is the
 * only effect. A receipt satisfies a request only under the exact same
 * tenant, clone, algorithm and OID; cross-scope receipts never satisfy.
 */
export async function runRetentionPass(input: RetentionPassInput, port: RetentionPort): Promise<RetentionPassOutcome> {
  checkScope(input.scope);
  checkNow(input.now);
  // Immutable snapshot taken before the first await: the caller-owned
  // input.scope object may be shared and mutated while the pass awaits the
  // port. Every query, receipt check and missing-key below uses this
  // pass-entry scope; re-reading input.scope after an await would let a
  // foreign-scope receipt falsely satisfy a request (false acquittement).
  const scope: LiveScope = { tenant: input.scope.tenant, clone: input.scope.clone };
  const requests = deriveRetentionRequests(input.roots, scope, input.now);
  for (const request of requests) {
    await port.recordRequest(request);
  }
  const algorithms = new Set<OidAlgorithm>();
  for (const request of requests) algorithms.add(request.algorithm);
  const receipts: RetentionReceiptDto[] = [];
  if (algorithms.size === 0) {
    return { state: "complete", requests, coverage: [], stats: { requests: 0, receipts: 0, missing: 0 } };
  }
  for (const algorithm of algorithms) {
    const loaded = await port.loadReceipts({ scope, algorithm });
    for (const receipt of loaded.receipts) {
      const checked = validateRetentionReceipt(receipt);
      if (!checked.ok) {
        throw new RetentionError(`invalid retention receipt for ${receipt.oid}: ${checked.errors.join("; ")}`);
      }
      // The port is scoped by the query, but the engine re-checks scope:
      // a foreign receipt that slipped through never satisfies a request.
      if (receipt.scope.tenant !== scope.tenant || receipt.scope.clone !== scope.clone) continue;
      if (receipt.algorithm !== algorithm) continue;
      receipts.push(receipt);
    }
  }
  const byKey = new Map<string, RetentionReceiptDto>();
  for (const receipt of receipts) byKey.set(receiptKey(receipt), receipt);
  const missing: QualifiedOid[] = [];
  for (const request of requests) {
    const key = `${scope.tenant}:${scope.clone}:${request.algorithm}:${request.oid}`;
    if (!byKey.has(key)) missing.push({ algorithm: request.algorithm, oid: request.oid });
  }
  missing.sort((left, right) => left.oid.localeCompare(right.oid));
  if (missing.length === 0) {
    return {
      state: "complete",
      requests,
      coverage: [],
      stats: { requests: requests.length, receipts: byKey.size, missing: 0 },
    };
  }
  const preview = missing.slice(0, 3).map((entry) => entry.oid.slice(0, 12)).join(", ");
  return {
    state: "gaps",
    requests,
    coverage: [{
      axis: RETENTION_COVERAGE_AXIS,
      state: "unavailable",
      reason: `private retention incomplete: ${missing.length} of ${requests.length} ingested root(s) without a scoped durable retention receipt (${preview}…); no reconstructible coverage is claimed and nothing was pruned`,
      cause: "missing-receipt",
      missing,
    }],
    stats: { requests: requests.length, receipts: byKey.size, missing: missing.length },
  };
}

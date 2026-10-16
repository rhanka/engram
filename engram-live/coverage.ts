// @sentropic/engram-live/coverage — L6b separate coverage axes & certification model
// (spec/SPEC_LIVE_GIT_INDEXING.md §12; L6b-design.md §5-§6; design amendment 1).

import type { CoverageState as ContractCoverageState } from "./contracts.js";

/** Full L6b axis state vocabulary (spec §12.1 + design §5.1). Only "current" means certified fresh. */
export type AxisState =
  | "unknown"
  | "pending"
  | "backfill"
  | "current"
  | "stale"
  | "partial"
  | "unstable"
  | "degraded"
  | "auth_required"
  | "unavailable";

/** Complete source state vector V observed for a scope (design §5.2). */
export interface SourceVector {
  readonly refsFingerprint: string;
  readonly headOid: string;
  readonly indexFingerprint: string;
  readonly pathMembershipFingerprint: string;
  readonly contentFingerprint: string;
  readonly configAttributesFingerprint: string;
  readonly lockStateValid?: boolean;
}

/** Explicit evidence certificate required to transition an axis to "current" (design §5.2 + amendment 1). */
export interface AxisCertificate {
  readonly axis: string;
  readonly sourceVector: SourceVector;
  readonly publishedGenerationId: string;
  readonly storageIncarnation: string;
  readonly reconcileStartSeq: number;
  readonly reconcileEndSeq: number;
  readonly complete: boolean;
  readonly stableSource: boolean;
  readonly observedAt: number;
  readonly dischargedDeltas?: Readonly<Record<string, number>>;
}

/** Guard snapshot rechecked synchronously at the certification point (design §5.2 + amendments 1 & 3). */
export interface AxisGuardSnapshot {
  readonly currentSourceVector: SourceVector;
  readonly activeStorageIncarnation: string;
  readonly publishedGenerations: ReadonlySet<string>;
  readonly unknownDoubtSeq?: number;
  readonly latestDoubtSeq?: number;
  readonly pendingDeltas?: Readonly<Record<string, number>>;
  readonly maxDeltaPathsPerAxis?: number;
  readonly hasOverflow: boolean;
  readonly hasExcludedPaths: boolean;
  readonly hasFailedTasks: boolean;
  readonly hasPendingReconcile: boolean;
  readonly writerTokenValid: boolean;
}

export interface AxisReport {
  readonly axis: string;
  readonly state: AxisState;
  readonly pendingCount: number;
  readonly pendingFrontier: string | undefined;
  readonly reason?: string;
  readonly updatedAt: number;
  readonly lastValidatedAt?: number;
  readonly sourceVector?: SourceVector;
  readonly certificate?: AxisCertificate;
  readonly unknownDoubtSeq?: number;
  readonly latestDoubtSeq?: number;
  readonly pendingDeltas?: Readonly<Record<string, number>>;
  readonly dischargedDeltas?: Readonly<Record<string, number>>;
  readonly lastVerifiedGenerationId?: string;
  readonly lastStorageIncarnation?: string;
}

export interface CoverageMap {
  readonly axes: Readonly<Record<string, AxisReport>>;
}

/** Evidence required to promote one axis to current. */
export interface ReconcileEvidence {
  readonly observedAt: number;
  readonly complete: boolean;
  readonly stableSource: boolean;
  readonly certificate: AxisCertificate;
  readonly guard: AxisGuardSnapshot;
}

export const DEFAULT_MAX_DELTA_PATHS_PER_AXIS = 64;

export function sourceVectorsEqual(a: SourceVector, b: SourceVector): boolean {
  return (
    a.refsFingerprint === b.refsFingerprint &&
    a.headOid === b.headOid &&
    a.indexFingerprint === b.indexFingerprint &&
    a.pathMembershipFingerprint === b.pathMembershipFingerprint &&
    a.contentFingerprint === b.contentFingerprint &&
    a.configAttributesFingerprint === b.configAttributesFingerprint &&
    (a.lockStateValid ?? true) === (b.lockStateValid ?? true)
  );
}

/** Every axis starts pending: bootstrap has not reconciled anything yet. */
export function initialCoverage(axes: readonly string[], at: number): CoverageMap {
  const built: Record<string, AxisReport> = {};
  for (const axis of axes) {
    built[axis] = {
      axis,
      state: "pending",
      pendingCount:1,
      pendingFrontier:"bootstrap",
      reason: "bootstrap has not reconciled this axis",
      updatedAt: at,
      unknownDoubtSeq: 0,
      latestDoubtSeq: 0,
      pendingDeltas: {},
      dischargedDeltas: {},
    };
  }
  return { axes: built };
}

function withAxis(map: CoverageMap, report: AxisReport): CoverageMap {
  return { axes: { ...map.axes, [report.axis]: report } };
}

/**
 * Evaluate the certification predicate (I1, I2, I6 + amendment 1 base + delta model)
 * in a single synchronous step.
 */
export function certifyAxis(
  previous: AxisReport,
  cert: AxisCertificate,
  guard: AxisGuardSnapshot,
): AxisReport {
  const unknownDoubtSeq =
    guard.unknownDoubtSeq ??
    (guard.pendingDeltas === undefined ? guard.latestDoubtSeq : undefined) ??
    previous.unknownDoubtSeq ??
    0;
  const pendingDeltas: Readonly<Record<string, number>> =
    guard.pendingDeltas ?? previous.pendingDeltas ?? {};
  const maxDeltas = guard.maxDeltaPathsPerAxis ?? DEFAULT_MAX_DELTA_PATHS_PER_AXIS;
  const mergedDischarged: Record<string, number> = {};
  for (const path of Object.keys(pendingDeltas).slice(0,maxDeltas)) {
    mergedDischarged[path] = Math.max(previous.dischargedDeltas?.[path] ?? -1,cert.dischargedDeltas?.[path] ?? -1);
  }

  let latestDoubtSeq = Math.max(
    unknownDoubtSeq,
    previous.latestDoubtSeq ?? 0,
    guard.latestDoubtSeq ?? 0,
  );
  for (const seq of Object.values(pendingDeltas)) {
    if (seq > latestDoubtSeq) latestDoubtSeq = seq;
  }

  const baseNonCurrent = (state: Exclude<AxisState, "current">, reason: string): AxisReport => ({
    axis: previous.axis,
    state,
    pendingCount:Math.max(1,Object.keys(pendingDeltas).length),
    pendingFrontier:unknownDoubtSeq>=cert.reconcileStartSeq?"full reconciliation":"incomplete proof",
    reason,
    updatedAt: cert.observedAt,
    unknownDoubtSeq,
    latestDoubtSeq,
    pendingDeltas,
    dischargedDeltas: {},
    lastVerifiedGenerationId: previous.lastVerifiedGenerationId,
    lastStorageIncarnation: previous.lastStorageIncarnation,
  });

  if(cert.axis!==previous.axis)return baseNonCurrent("partial","certificate belongs to another axis");

  if (!guard.writerTokenValid) {
    return baseNonCurrent("degraded", "writer authority fencing token is invalid or expired");
  }
  if (
    !cert.stableSource ||
    cert.sourceVector.lockStateValid === false ||
    guard.currentSourceVector.lockStateValid === false ||
    !sourceVectorsEqual(cert.sourceVector, guard.currentSourceVector)
  ) {
    return baseNonCurrent(
      "unstable",
      "unstable source: mixed-time capture or source vector moved before certification",
    );
  }
  if (
    cert.storageIncarnation.length === 0 ||
    cert.storageIncarnation !== guard.activeStorageIncarnation
  ) {
    return baseNonCurrent("stale", "storage incarnation P mismatch or reset since reconciliation");
  }
  if (
    cert.publishedGenerationId.length === 0 ||
    !guard.publishedGenerations.has(cert.publishedGenerationId)
  ) {
    return baseNonCurrent(
      "stale",
      "published generation G does not exist in active storage incarnation P",
    );
  }
  if (guard.hasOverflow) {
    return baseNonCurrent("stale", "unacknowledged watcher overflow requires full reconciliation");
  }
  if (guard.hasPendingReconcile) {
    return baseNonCurrent("pending", "uncompleted reconciliation obligation remains");
  }
  if (!cert.complete || guard.hasExcludedPaths || guard.hasFailedTasks) {
    return baseNonCurrent(
      "partial",
      "incomplete capture: excluded or failed paths prevent current certification",
    );
  }
  if (cert.reconcileStartSeq <= unknownDoubtSeq || cert.reconcileEndSeq < cert.reconcileStartSeq) {
    return baseNonCurrent(
      "stale",
      "unknown-impact doubt occurred at or after base reconciliation start",
    );
  }

  const deltaEntries = Object.entries(pendingDeltas);
  if (deltaEntries.length > maxDeltas) {
    return baseNonCurrent(
      "stale",
      "pending delta paths exceeded per-axis cap; full reconciliation required",
    );
  }
  for (const [deltaPath, deltaDoubtSeq] of deltaEntries) {
    const coveredByBase = cert.reconcileStartSeq > deltaDoubtSeq;
    const coveredByDelta = (mergedDischarged[deltaPath] ?? -1) >= deltaDoubtSeq;
    if (!coveredByBase && !coveredByDelta) {
      return baseNonCurrent("stale", `undischarged delta doubt on path "${deltaPath}"`);
    }
  }

  return {
    axis: previous.axis,
    state: "current",
    pendingCount:0,
    pendingFrontier:undefined,
    updatedAt: cert.observedAt,
    lastValidatedAt: cert.observedAt,
    sourceVector: cert.sourceVector,
    certificate: {
      ...cert,
      dischargedDeltas: mergedDischarged,
    },
    unknownDoubtSeq,
    latestDoubtSeq,
    pendingDeltas: {},
    dischargedDeltas: mergedDischarged,
    lastVerifiedGenerationId: cert.publishedGenerationId,
    lastStorageIncarnation: cert.storageIncarnation,
  };
}

/**
 * Synchronous invalidation (I2 + design amendment 1):
 * Immediately drops targeted axes out of "current" and records either bounded
 * known-impact delta doubt or unknown-impact doubt before any debounce or async work.
 */
export function invalidateAxes(
  map: CoverageMap,
  targetAxes: readonly string[],
  doubtSeq: number,
  reason: string,
  at: number,
  options?: {
    readonly targetState?: Exclude<AxisState, "current">;
    readonly deltaPaths?: readonly string[];
    readonly maxDeltaPathsPerAxis?: number;
  },
): CoverageMap {
  const nextAxes: Record<string, AxisReport> = { ...map.axes };
  const maxDeltas = options?.maxDeltaPathsPerAxis ?? DEFAULT_MAX_DELTA_PATHS_PER_AXIS;
  const hasKnownDeltaPaths = options?.deltaPaths !== undefined && options.deltaPaths.length > 0;

  for (const axis of targetAxes) {
    const prev = nextAxes[axis];
    if (prev === undefined) continue;

    let unknownDoubtSeq = prev.unknownDoubtSeq ?? 0;
    let pendingDeltas: Record<string, number> = { ...(prev.pendingDeltas ?? {}) };
    let dischargedDeltas: Record<string, number> = { ...(prev.dischargedDeltas ?? {}) };

    if (hasKnownDeltaPaths) {
      for (const p of options!.deltaPaths!) {
        const prevSeq = pendingDeltas[p] ?? 0;
        pendingDeltas[p] = Math.max(prevSeq, doubtSeq);
        if ((dischargedDeltas[p] ?? -1) < pendingDeltas[p]) {
          delete dischargedDeltas[p];
        }
      }
      if (Object.keys(pendingDeltas).length > maxDeltas) {
        unknownDoubtSeq = Math.max(unknownDoubtSeq, doubtSeq);
        pendingDeltas = {};
        dischargedDeltas = {};
      }
    } else {
      unknownDoubtSeq = Math.max(unknownDoubtSeq, doubtSeq);
      pendingDeltas = {};
      dischargedDeltas = {};
    }

    const latestDoubtSeq = Math.max(prev.latestDoubtSeq ?? 0, unknownDoubtSeq, doubtSeq);
    const nextState: Exclude<AxisState, "current"> =
      options?.targetState ?? (prev.state === "current" ? "stale" : prev.state);

    nextAxes[axis] = {
      axis,
      state: nextState,
      pendingCount:Math.max(1,Object.keys(pendingDeltas).length),
      pendingFrontier:unknownDoubtSeq===doubtSeq?"full reconciliation":"paths",
      reason,
      updatedAt: at,
      lastValidatedAt: prev.lastValidatedAt,
      sourceVector: undefined,
      certificate: undefined,
      unknownDoubtSeq,
      latestDoubtSeq,
      pendingDeltas,
      dischargedDeltas,
      lastVerifiedGenerationId: prev.lastVerifiedGenerationId,
      lastStorageIncarnation: prev.lastStorageIncarnation,
    };
  }

  return { axes: nextAxes };
}

/**
 * Promote one axis to current ONLY when the evidence is complete and from
 * a stable source, and no undischarged doubt remains.
 */
export function markReconciled(
  map: CoverageMap,
  axis: string,
  evidence: ReconcileEvidence,
): CoverageMap {
  const previous = map.axes[axis];
  if (previous === undefined) throw new Error(`unknown coverage axis "${axis}"`);

  if (evidence.certificate !== undefined && evidence.guard !== undefined) {
    return withAxis(map, certifyAxis(previous, evidence.certificate, evidence.guard));
  }

  const reason = !evidence.complete
    ? "incomplete capture: not all required facts are reconciled"
    : !evidence.stableSource
      ? "unstable source: mixed-time capture cannot be reported current"
      : "undischarged invalidation doubt requires certified reconciliation";
  return withAxis(map, {
    ...previous,
    axis,
    state: evidence.stableSource ? (!evidence.complete ? "partial" : "stale") : "unstable",
    reason,
    updatedAt: evidence.observedAt,
    sourceVector: undefined,
    certificate: undefined,
  });
}

/** Record an explicit non-current state with its reason. Never "current". */
export function markAxis(
  map: CoverageMap,
  axis: string,
  state: Exclude<AxisState, "current">,
  reason: string,
  at: number,
): CoverageMap {
  const previous = map.axes[axis];
  if (previous === undefined) throw new Error(`unknown coverage axis "${axis}"`);
  return withAxis(map, {
    ...previous,
    axis,
    state,
    pendingCount:Math.max(1,Object.keys(previous.pendingDeltas??{}).length),
    pendingFrontier:previous.pendingFrontier??reason.slice(0,1024),
    reason,
    updatedAt: at,
    sourceVector: undefined,
    certificate: undefined,
  });
}

/** True only when every axis of a non-empty map is current. */
export function allCurrent(map: CoverageMap): boolean {
  const reports = Object.values(map.axes);
  if (reports.length === 0) return false;
  return reports.every((report) => report.state === "current");
}

/**
 * Separate local readiness from historical/remote completeness (design §6 I7).
 */
export function deriveReadiness(
  map: CoverageMap,
  localAxes: readonly string[] = ["working-tree", "index", "refs"],
  historicalAxes: readonly string[] = ["commit-history", "blame", "remote-publication"],
): {
  readonly localReady: boolean;
  readonly historicalComplete: boolean;
  readonly allCurrent: boolean;
} {
  const presentLocal = localAxes.filter((a) => map.axes[a] !== undefined);
  const presentHistorical = historicalAxes.filter((a) => map.axes[a] !== undefined);
  const localReady =
    presentLocal.length > 0 && presentLocal.every((a) => map.axes[a]?.state === "current");
  const historicalComplete =
    presentHistorical.length > 0 &&
    presentHistorical.every((a) => map.axes[a]?.state === "current");
  return {
    localReady,
    historicalComplete,
    allCurrent: allCurrent(map),
  };
}

/**
 * Map an L6b axis state onto the built contract vocabulary. Only "current"
 * maps to "current"; every degraded or incomplete state stays explicit.
 */
export function toContractState(state: AxisState): ContractCoverageState {
  switch (state) {
    case "current":
      return "current";
    case "pending":
    case "backfill":
      return "pending";
    case "stale":
    case "degraded":
      return "stale";
    case "partial":
    case "unstable":
      return "partial";
    case "unknown":
    case "auth_required":
    case "unavailable":
      return "unavailable";
  }
}

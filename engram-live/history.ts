// @sentropic/engram-live/history — L2b roots, retained DAG and OID completion
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3–4, 6; plan/09 L2b).
//
// The neutral history engine. One pass:
//   1. folds the host's raw ref observations into tracked refs (./refs.js);
//   2. loads the complete-ancestry checkpoints and previously ingested roots
//      from the INJECTED persistence port (./contracts.js) — a port, never a
//      base; engram owns no database;
//   3. selects the history roots under the dated owner decisions (default
//      branch even when old, active local/remote branches, PR heads of all
//      states, registered worktree HEADs including detached ones, previously
//      ingested roots) and records each root's selection signal and activity
//      provenance;
//   4. records every selected root as a retained root BEFORE extraction, so
//      an interrupted pass stays resumable by OID whatever happens to refs;
//   5. streams the uncapped ancestry through the L2a reader (./git-stream.js)
//      over the OBSERVED oids (ref names never select walk objects), skipping
//      only checkpointed oids outside the declared shallow boundary,
//      persisting each immutable commit fact (metadata plus per-parent
//      changed files) and only then its completion checkpoint — progress
//      advances solely after durable acknowledgement (spec §6), so an
//      interrupted replay fills gaps instead of trusting known-looking rows;
//   6. derives the ancestry frontier (closure over recorded checkpoint
//      parents): extraction checkpoints without durable parents are progress,
//      never complete ancestry; reports explicit dag coverage with a
//      structured cause (missing object vs shallow boundary) instead of a
//      fabricated complete ancestry.
//
// There is no commit-age or commit-count cap anywhere: the walk sends no
// --max-count/--since/--until/--first-parent, all ordered parents are walked,
// and the retained DAG keeps every ingested commit through expiry, deletion,
// recreation and force-push. Branch membership is DERIVED from the retained
// DAG plus current refs (deriveReachability / DerivedReachabilityCache);
// no permanent commit × branch edge is ever persisted. A known OID alone
// never means complete ancestry: only a recorded checkpoint does.
//
// A previously ingested root whose object has left the clone makes the pass
// report an explicit missing-object gap; reconstruction from the private
// store is R1's lot, and the engine never fetches a remote to hide the gap.

import {
  POLICY_VERSION,
  validateQualifiedOid,
  validateRawRefObservation,
  type HistoryCommitFactDto,
  type HistoryCompletionQuery,
  type HistoryCoverageReportDto,
  type HistoryPersistencePort,
  type QualifiedOid,
  type RawRefObservationDto,
  type RetainedRootDto,
  type RootSelectionSignal,
  type SelectedRootDto,
  type TrackedRefDto,
  type WorktreeHead,
} from "./contracts.js";
import {
  GIT_STREAM_EXTRACTOR_VERSION,
  GitStreamError,
  streamGitHistory,
  type GitProcessPort,
  type GitStreamStats,
  type StreamedCommit,
  type StreamedIdentity,
} from "./git-stream.js";
import { selectHistoryRoots, trackRef, type WorktreeHeadRef } from "./refs.js";
import type { RepositoryObservationDto } from "./repository.js";

/** Completion is per extractor version; the engine completes what L2a extracts. */
export const HISTORY_EXTRACTOR_VERSION = GIT_STREAM_EXTRACTOR_VERSION;

const SIGNALS: readonly RootSelectionSignal[] = [
  "default-branch", "active-window", "pr-head", "worktree-head", "previously-ingested",
];

const MILLISECONDS_PER_DAY = 86_400_000;

export class HistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryError";
  }
}

export interface HistoryPassInput {
  readonly repository: RepositoryObservationDto;
  /** Full ref name of the default branch; a root even when old. */
  readonly defaultBranch: string;
  /** Raw host observations of every ref, flattened; the engine tracks each ref. */
  readonly refObservations: readonly RawRefObservationDto[];
  /** Injected evaluation time for the 30-day activity window (ms). */
  readonly now: number;
  /** Worktree path the Git launches run from (host approved). */
  readonly cwd: string;
}

export interface HistoryEnginePorts {
  /** Host-injected Git process seam; the engine never spawns Git itself. */
  readonly git: GitProcessPort;
  /** Host-injected durable persistence port; engram owns no database. */
  readonly persistence: HistoryPersistencePort;
}

export interface HistoryPassStats {
  readonly rootsSelected: number;
  readonly rootsBySignal: Readonly<Record<RootSelectionSignal, number>>;
  readonly commitsExtracted: number;
  readonly commitsSkippedComplete: number;
  readonly batches: number;
  readonly gitLaunches: number;
  readonly rootsRecorded: number;
}

export interface HistoryPassOutcome {
  /** "complete": the whole selected ancestry is ingested. "gaps": an explicit coverage gap is reported. */
  readonly state: "complete" | "gaps";
  readonly trackedRefs: readonly TrackedRefDto[];
  readonly roots: readonly SelectedRootDto[];
  readonly stats: HistoryPassStats;
  readonly coverage: readonly HistoryCoverageReportDto[];
}

function trackAllRefs(observations: readonly RawRefObservationDto[]): readonly TrackedRefDto[] {
  const byRef = new Map<string, RawRefObservationDto[]>();
  for (const observation of observations) {
    const checked = validateRawRefObservation(observation);
    if (!checked.ok) {
      throw new HistoryError(`invalid ref observation: ${checked.errors.join("; ")}`);
    }
    const list = byRef.get(observation.refName) ?? [];
    list.push(observation);
    byRef.set(observation.refName, list);
  }
  const tracked: TrackedRefDto[] = [];
  for (const [refName, list] of [...byRef.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    tracked.push(trackRef(refName, list));
  }
  return tracked;
}

function worktreeHeadsOf(repository: RepositoryObservationDto): readonly WorktreeHeadRef[] {
  const heads: { worktreeId: string; head: WorktreeHead }[] = [];
  for (const worktree of repository.worktrees) {
    heads.push({ worktreeId: worktree.identity.worktreeId, head: worktree.head });
  }
  return heads;
}

function countBySignal(roots: readonly SelectedRootDto[]): Readonly<Record<RootSelectionSignal, number>> {
  const counts = Object.fromEntries(SIGNALS.map((signal) => [signal, 0])) as Record<RootSelectionSignal, number>;
  for (const root of roots) {
    for (const source of root.sources) counts[source.signal] += 1;
  }
  return counts;
}

/**
 * Classify a stream failure into an explicit dag coverage gap. A bad or
 * missing object is an explicit "unavailable" gap; a metadata/rev-list parent
 * disagreement on a DECLARED shallow boundary is the grafted-boundary "partial"
 * gap. Anything else is a protocol failure the caller must see, not a
 * coverage state.
 */
function qualifyOid(oid: string): QualifiedOid {
  return { algorithm: oid.length === 40 ? "sha1" : "sha256", oid };
}

function classifyCoverageGap(
  error: unknown,
  shallowBoundary: ReadonlySet<string>,
): HistoryCoverageReportDto | null {
  if (!(error instanceof GitStreamError)) return null;
  const badObject = /bad object ([0-9a-f]{40,64})/.exec(error.message);
  const missingObject = /object ([0-9a-f]{40,64}) is missing from the repository/.exec(error.message);
  // Rev-list traversal diagnostics name the unreadable parent explicitly.
  const unreadable = /Could not read ([0-9a-f]{40,64})/.exec(error.message);
  const untraversable = /Failed to traverse parents of commit ([0-9a-f]{40,64})/.exec(error.message);
  const missing = badObject ?? missingObject ?? unreadable ?? untraversable;
  if (missing !== null) {
    const oid = missing[1]!;
    return {
      axis: "dag",
      state: "unavailable",
      reason: `object ${oid} is missing from the observed clone: an explicit gap; the engine fetches no remote to hide it and invents no retention (private acquisition is R1)`,
      cause: "missing-object",
      missing: [qualifyOid(oid)],
    };
  }
  const grafted = /commit ([0-9a-f]{40,64}) metadata disagrees with rev-list parents/.exec(error.message);
  if (grafted !== null && shallowBoundary.has(grafted[1]!)) {
    const oid = grafted[1]!;
    return {
      axis: "dag",
      state: "partial",
      reason: `shallow boundary grafted at ${oid}: ancestry beyond the boundary is an explicit gap, never fabricated`,
      cause: "shallow-boundary",
      boundary: [qualifyOid(oid)],
    };
  }
  return null;
}

/**
 * Ancestry-frontier closure: every selected root must reach only durable
 * checkpoints through recorded parents. A referenced OID with no checkpoint
 * is missing ancestry, never complete ancestry. OIDs already complete under
 * a checkpoint-less legacy port are treated as frontier leaves (tolerated,
 * not expanded); every checkpoint this engine writes carries its parents,
 * so fresh states are fully verifiable.
 */
function findMissingAncestors(
  roots: readonly SelectedRootDto[],
  parentsByOid: ReadonlyMap<string, readonly string[]>,
  knownComplete: ReadonlySet<string>,
): string[] {
  const missing = new Set<string>();
  const visited = new Set<string>();
  const pending = roots.map((root) => root.qualifiedOid.oid);
  while (pending.length > 0) {
    const oid = pending.pop()!;
    if (visited.has(oid)) continue;
    visited.add(oid);
    const parents = parentsByOid.get(oid);
    if (parents === undefined) {
      if (!knownComplete.has(oid)) missing.add(oid);
      continue;
    }
    for (const parent of parents) pending.push(parent);
  }
  return [...missing].sort();
}

function factOf(commit: StreamedCommit, cloneId: string, algorithm: QualifiedOid["algorithm"]): HistoryCommitFactDto {
  const identity = (value: StreamedIdentity) => ({
    name: value.name,
    email: value.email,
    unixSeconds: value.unixSeconds,
    offsetMinutes: value.offsetMinutes,
  });
  return {
    cloneId,
    algorithm,
    oid: commit.oid,
    tree: commit.tree,
    parents: [...commit.parents],
    author: identity(commit.author),
    committer: identity(commit.committer),
    subject: commit.subject,
    message: commit.message,
    // The per-parent changed files (byte paths plus numstat) are part of the
    // durable fact: extraction completeness is acknowledged only with them.
    parentDiffs: commit.parentDiffs.map((diff) => ({
      parentIndex: diff.parentIndex,
      files: diff.files.map((file) => ({ ...file, path: file.path, previousPath: file.previousPath })),
    })),
    extractorVersion: HISTORY_EXTRACTOR_VERSION,
    policyVersion: POLICY_VERSION,
  };
}

/**
 * Run one history pass over the observed repository. Deterministic over the
 * injected inputs (no clock read, no random source): the evaluation time is
 * `now`, the Git seam and the persistence port are the only effects. The
 * stream is consumed manually so the pass keeps its own counters even when
 * the stream ends in an explicit gap.
 */
export async function runHistoryPass(input: HistoryPassInput, ports: HistoryEnginePorts): Promise<HistoryPassOutcome> {
  const cloneId = input.repository.clone.cloneId;
  const algorithm = input.repository.clone.oidAlgorithm;
  const trackedRefs = trackAllRefs(input.refObservations);
  const completionQuery: HistoryCompletionQuery = {
    cloneId,
    algorithm,
    extractorVersion: HISTORY_EXTRACTOR_VERSION,
    policyVersion: POLICY_VERSION,
  };
  const completion = await ports.persistence.loadCompletion(completionQuery);
  const knownComplete = new Set(completion.knownComplete);
  const retainedRoots = completion.retainedRoots;
  const roots = selectHistoryRoots({
    trackedRefs,
    worktreeHeads: worktreeHeadsOf(input.repository),
    defaultBranch: input.defaultBranch,
    retainedRoots,
    now: input.now,
    oidAlgorithm: algorithm,
  });

  // Retained roots are recorded BEFORE extraction, whatever the pass outcome:
  // a root ingested then interrupted stays resumable by OID even when its ref
  // is deleted before the next pass. Previously retained roots stay
  // untouched; a recreated or force-pushed ref pointing at an already
  // retained OID adds no duplicate record (immutable sharing).
  let rootsRecorded = 0;
  {
    const alreadyRetained = new Set(retainedRoots.map((root) => root.oid));
    for (const root of roots) {
      if (alreadyRetained.has(root.qualifiedOid.oid)) continue;
      const checked = validateQualifiedOid(root.qualifiedOid);
      if (!checked.ok) {
        throw new HistoryError(`invalid root OID ${root.qualifiedOid.oid}: ${checked.errors.join("; ")}`);
      }
      const refBacked = root.sources.find((source) => source.refName !== null && source.signal !== "previously-ingested");
      const retained: RetainedRootDto = {
        cloneId,
        algorithm,
        oid: root.qualifiedOid.oid,
        firstSeenAt: input.now,
        firstSignal: root.sources[0]!.signal,
        refName: refBacked !== undefined ? refBacked.refName : null,
      };
      await ports.persistence.recordRetainedRoot(retained);
      alreadyRetained.add(root.qualifiedOid.oid);
      rootsRecorded += 1;
    }
  }

  // Extraction checkpoints (per fact) and the ancestry frontier (closure over
  // recorded parents) are separate: a checkpointed OID whose parents are not
  // durable is extraction progress, never complete ancestry. Declared shallow
  // boundaries are never skipped, so a graft always meets its verifier.
  const parentsByOid = new Map<string, readonly string[]>();
  for (const checkpoint of completion.checkpoints ?? []) {
    if (checkpoint.algorithm === algorithm) parentsByOid.set(checkpoint.oid, [...checkpoint.parents]);
  }
  const stats: {
    commitsExtracted: number;
    commitsSkippedComplete: number;
    batches: number;
    gitLaunches: number;
  } = { commitsExtracted: 0, commitsSkippedComplete: 0, batches: 0, gitLaunches: 0 };
  let state: "complete" | "gaps" = "complete";
  const coverage: HistoryCoverageReportDto[] = [];
  const shallowBoundary = new Set(input.repository.shallowBoundary.map((qualified) => qualified.oid));
  const skipSet = new Set([...knownComplete].filter((oid) => !shallowBoundary.has(oid)));

  if (roots.length > 0) {
    // Progressive counters owned by the pass: launches are counted at the
    // seam and acknowledgements as facts land, so a gap still reports the
    // durable truth instead of zeros.
    let launched = 0;
    const countingGit: GitProcessPort = {
      start: async (launch) => {
        launched += 1;
        return ports.git.start(launch);
      },
    };
    // The walk names observed OIDs only: ref names are mobile provenance.
    const stream = streamGitHistory({
      port: countingGit,
      cwd: input.cwd,
      roots: roots.map((root) => root.qualifiedOid.oid),
      knownComplete: skipSet,
    });
    let gap: HistoryCoverageReportDto | null = null;
    let failure: unknown;
    let streamOpen = true;
    let acked = 0;
    try {
      for (;;) {
        const step = await stream.next();
        if (step.done) {
          const streamStats: GitStreamStats = step.value;
          stats.commitsExtracted = streamStats.commitsExtracted;
          stats.commitsSkippedComplete = streamStats.commitsSkippedComplete;
          stats.batches = streamStats.batches;
          stats.gitLaunches = streamStats.gitLaunches;
          streamOpen = false;
          break;
        }
        const commit = step.value;
        // Durable fact (metadata plus per-parent changed files) first, then
        // the completion checkpoint: progress advances only after both
        // acknowledgements (spec §6).
        await ports.persistence.persistCommitFact(factOf(commit, cloneId, algorithm));
        await ports.persistence.recordCompletion({
          cloneId,
          algorithm,
          oid: commit.oid,
          tree: commit.tree,
          parents: [...commit.parents],
          extractorVersion: HISTORY_EXTRACTOR_VERSION,
          policyVersion: POLICY_VERSION,
        });
        parentsByOid.set(commit.oid, [...commit.parents]);
        acked += 1;
      }
    } catch (error) {
      // A persistence failure leaves the generator suspended with its
      // rev-list child running: close it explicitly so its cleanup aborts
      // the child instead of leaking it.
      const closing: GitStreamStats = {
        commitsExtracted: acked,
        commitsSkippedComplete: 0,
        batches: 0,
        gitLaunches: launched,
      };
      if (streamOpen) await stream.return(closing).catch(() => undefined);
      gap = classifyCoverageGap(error, shallowBoundary);
      if (gap === null) {
        throw error;
      }
      // Report the durable truth on a gap: the stream attaches the counters
      // reached before the failure (skipped OIDs and batches included), so a
      // gap never zeroes them; otherwise keep the pass-owned counters.
      const partial = error instanceof GitStreamError ? error.partialStats : undefined;
      stats.commitsExtracted = partial?.commitsExtracted ?? acked;
      stats.commitsSkippedComplete = partial?.commitsSkippedComplete ?? 0;
      stats.batches = partial?.batches ?? 0;
      stats.gitLaunches = partial?.gitLaunches ?? launched;
      failure = error;
    }
    if (gap !== null) {
      state = "gaps";
      coverage.push(gap);
      void failure;
    }
  }

  // The ancestry frontier only advances over durable dependencies: when the
  // walk succeeded yet a root reaches parents with no checkpoint, the pass
  // reports an explicit missing-ancestry gap instead of complete ancestry.
  if (state === "complete" && roots.length > 0) {
    const missing = findMissingAncestors(roots, parentsByOid, knownComplete);
    if (missing.length > 0) {
      state = "gaps";
      coverage.push({
        axis: "dag",
        state: "unavailable",
        reason: `ancestry frontier incomplete: ${missing.length} ancestor(s) without a durable checkpoint (${missing[0]!.slice(0, 12)}…); an interrupted checkpoint of a child never declares its parents complete`,
        cause: "missing-object",
        missing: missing.map((oid) => qualifyOid(oid)),
      });
    }
  }

  return {
    state,
    trackedRefs,
    roots,
    stats: {
      rootsSelected: roots.length,
      rootsBySignal: countBySignal(roots),
      commitsExtracted: stats.commitsExtracted,
      commitsSkippedComplete: stats.commitsSkippedComplete,
      batches: stats.batches,
      gitLaunches: stats.gitLaunches,
      rootsRecorded,
    },
    coverage,
  };
}

// — Derived branch membership (spec §4): reachability is derived from the
// retained DAG facts plus a set of seeds (current refs or retained roots);
// it is never a persisted commit × branch edge.

export interface DagCommitRef {
  readonly oid: string;
  readonly parents: readonly string[];
}

export interface ReachabilitySeed {
  readonly name: string;
  readonly qualifiedOid: QualifiedOid;
}

/**
 * Derive, purely, which commits each seed reaches through the retained DAG.
 * Ordered parents are walked in full — no first-parent truncation. The
 * result is a snapshot of the given facts: old roots stay queryable through
 * retained-root seeds even when no current ref reaches them.
 */
export function deriveReachability(
  commits: readonly DagCommitRef[],
  seeds: readonly ReachabilitySeed[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const byOid = new Map<string, DagCommitRef>();
  for (const commit of commits) byOid.set(commit.oid, commit);
  const memberships = new Map<string, ReadonlySet<string>>();
  for (const seed of seeds) {
    const checked = validateQualifiedOid(seed.qualifiedOid);
    if (!checked.ok) {
      throw new HistoryError(`invalid reachability seed OID ${seed.qualifiedOid.oid}: ${checked.errors.join("; ")}`);
    }
    const reached = new Set<string>();
    const pending = [seed.qualifiedOid.oid];
    while (pending.length > 0) {
      const oid = pending.pop()!;
      if (reached.has(oid)) continue;
      const commit = byOid.get(oid);
      if (commit === undefined) continue;
      reached.add(oid);
      for (const parent of commit.parents) pending.push(parent);
    }
    memberships.set(seed.name, reached);
  }
  return memberships;
}

export interface ReachabilityVersion {
  readonly dagVersion: number;
  readonly refsVersion: number;
}

/**
 * Bound on memoized derived memberships per cache (spec §4). Only derived
 * views are bounded — historical facts are never limited nor dropped.
 */
export const MAX_DERIVED_MEMBERSHIPS = 64;

/**
 * A bounded, versioned, invalidatable derived-membership cache (spec §4).
 * Memberships are derived lazily per seed and memoized until invalidation;
 * the version records which dag and refs generations the derivations were
 * computed from, so a caller detects staleness by comparing versions and
 * invalidates explicitly. At most `capacity` derived sets are memoized
 * (least-recently-used eviction); the cache holds only derived sets — never
 * a permanent edge, and bounding it drops no fact.
 */
export class DerivedReachabilityCache {
  private readonly commits: readonly DagCommitRef[];
  private readonly seeds: readonly ReachabilitySeed[];
  private readonly memberships = new Map<string, ReadonlySet<string>>();
  private readonly capacity: number;
  private versionValue: ReachabilityVersion;

  constructor(
    commits: readonly DagCommitRef[],
    seeds: readonly ReachabilitySeed[],
    version: ReachabilityVersion,
    capacity: number = MAX_DERIVED_MEMBERSHIPS,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new HistoryError(`DerivedReachabilityCache capacity must be a positive integer, got ${String(capacity)}`);
    }
    this.commits = commits;
    this.seeds = seeds;
    this.capacity = capacity;
    this.versionValue = version;
  }

  get version(): ReachabilityVersion {
    return this.versionValue;
  }

  /** Number of memoized derived memberships (at most the capacity). */
  get size(): number {
    return this.memberships.size;
  }

  /** Derived membership of one seed; recomputed after invalidate(). */
  membership(name: string): ReadonlySet<string> {
    const cached = this.memberships.get(name);
    if (cached !== undefined) {
      // Refresh recency without recomputing.
      this.memberships.delete(name);
      this.memberships.set(name, cached);
      return cached;
    }
    const derived = deriveReachability(this.commits, this.seeds.filter((seed) => seed.name === name));
    const membership = derived.get(name);
    if (membership === undefined) {
      throw new HistoryError(`reachability seed ${name} was not given to this cache`);
    }
    if (this.memberships.size >= this.capacity) {
      // Evict the least recently used derived view; facts are untouched.
      const oldest = this.memberships.keys().next();
      if (!oldest.done) this.memberships.delete(oldest.value);
    }
    this.memberships.set(name, membership);
    return membership;
  }

  /** Explicit invalidation: every derived set is dropped. */
  invalidate(): void {
    this.memberships.clear();
  }
}

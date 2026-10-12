// @sentropic/engram-live/refs — L2b neutral ref observation and root selection
// (spec/SPEC_LIVE_GIT_INDEXING.md §4; plan/09 L2b).
//
// Pure functions over ./contracts.js DTOs: ref-name classification, ref
// tracking (creation, deletion and recreation as separate observations) and
// history-root selection under the dated owner decisions:
//   - the default branch is a root even when old;
//   - local and known remote branches active within ACTIVITY_WINDOW_DAYS are
//     roots (the window only selects followed branches; it never prunes);
//   - PR heads are roots in all states and regardless of age;
//   - HEADs of registered worktrees, including detached ones, are roots;
//   - previously ingested roots remain roots for investigation;
//   - tags are inventoried but never traversal roots.
// Merely observing the same ref again never refreshes its activity date
// (spec §4); only the bootstrap tip committer time and later observed target
// changes are activity signals, and the tracked ref records which one.
// No commit-age or commit-count limit exists anywhere in this module.

import {
  ACTIVITY_WINDOW_DAYS,
  isValidQualifiedOid,
  validateQualifiedOid,
  validateRawRefObservation,
  type ActivitySignalKind,
  type OidAlgorithm,
  type QualifiedOid,
  type RawRefObservationDto,
  type RefActivityDto,
  type RefKind,
  type RetainedRootDto,
  type RootSelectionSignal,
  type RootSourceDto,
  type SelectedRootDto,
  type TrackedRefDto,
  type WorktreeHead,
} from "./contracts.js";

/** Classify a full ref name. Returns null for a malformed name (not starting with "refs/"). */
export function classifyRefName(refName: string): RefKind | null {
  if (typeof refName !== "string" || !refName.startsWith("refs/")) return null;
  if (refName.startsWith("refs/heads/")) return "local-branch";
  if (refName.startsWith("refs/remotes/")) return "remote-branch";
  if (/^refs\/pull\/[0-9]+\/head$/.test(refName)) return "pr-head";
  if (refName.startsWith("refs/tags/")) return "tag";
  return "other";
}

/**
 * Track one ref over its observation sequence. Observations are sorted by
 * `observedAt` (stable) and folded:
 *   - an absent observation after a present one is a DELETION: the ref keeps
 *     its generation, gains `deletedAt`, and its OID becomes null;
 *   - a present observation after a deletion is a RECREATION: the generation
 *     bumps and the reappearance is itself an observed target change;
 *   - a target change of a live ref sets activity to the change observation
 *     time (signal "observed-target-change");
 *   - the FIRST creation bootstraps activity from the tip committer time
 *     when the host supplies it (signal "bootstrap-committer-time");
 *   - repeating the same target refreshes NOTHING: polling is not activity.
 */
export function trackRef(refName: string, observations: readonly RawRefObservationDto[]): TrackedRefDto {
  const kind = classifyRefName(refName);
  if (kind === null) {
    throw new Error(`trackRef requires a full ref name starting with "refs/", got: ${refName}`);
  }
  const sorted = [...observations].sort((left, right) => left.observedAt - right.observedAt);
  for (const observation of sorted) {
    const checked = validateRawRefObservation(observation);
    if (!checked.ok) {
      throw new Error(`invalid observation of ${refName}: ${checked.errors.join("; ")}`);
    }
    if (observation.refName !== refName) {
      throw new Error(`trackRef observations must all name ${refName}, got ${observation.refName}`);
    }
  }
  let oid: string | null = null;
  let generation = 0;
  let deletedAt: number | null = null;
  let activity: RefActivityDto | null = null;
  let lastObservedAt = 0;
  for (const observation of sorted) {
    lastObservedAt = observation.observedAt;
    if (observation.absent === true) {
      if (oid !== null) {
        // Deletion observation: a separate observation; no activity refresh.
        deletedAt = observation.observedAt;
        oid = null;
      }
      continue;
    }
    if (oid === null) {
      // First creation, or recreation after a deletion: a new generation.
      generation += 1;
      deletedAt = null;
      oid = observation.oid;
      if (generation === 1 && observation.tipCommitterUnixSeconds !== undefined) {
        activity = {
          activityAt: observation.tipCommitterUnixSeconds * 1000,
          signal: "bootstrap-committer-time",
        };
      } else {
        // A reappearance is an observed target change: the target went from
        // absent to this OID, whatever the tip's committer time is.
        activity = { activityAt: observation.observedAt, signal: "observed-target-change" };
      }
      continue;
    }
    if (observation.oid !== oid) {
      // Observed target change: activity, unlike a repeated observation.
      oid = observation.oid;
      activity = { activityAt: observation.observedAt, signal: "observed-target-change" };
    }
    // Same target observed again: not activity (spec §4). Nothing is refreshed.
  }
  return {
    refName,
    kind,
    oid,
    generation,
    activity,
    deletedAt,
    lastObservedAt,
  };
}

/** Deterministic source ordering: default, worktree, PR, window, retained; then by name. */
const SIGNAL_PRECEDENCE: readonly RootSelectionSignal[] = [
  "default-branch", "worktree-head", "pr-head", "active-window", "previously-ingested",
];

function sourceSortKey(source: RootSourceDto): string {
  return `${SIGNAL_PRECEDENCE.indexOf(source.signal)}|${source.refName ?? ""}|${source.worktreeId ?? ""}`;
}

/** A registered worktree HEAD as consumed by root selection. */
export interface WorktreeHeadRef {
  readonly worktreeId: string;
  readonly head: WorktreeHead;
}

export interface SelectHistoryRootsInput {
  readonly trackedRefs: readonly TrackedRefDto[];
  readonly worktreeHeads: readonly WorktreeHeadRef[];
  /** Full ref name of the default branch; selected even when old. */
  readonly defaultBranch: string;
  readonly retainedRoots: readonly RetainedRootDto[];
  /** Evaluation time (injected) for the ACTIVITY_WINDOW_DAYS follow-up window. */
  readonly now: number;
  readonly oidAlgorithm: OidAlgorithm;
}

/**
 * Select the history roots under the owner decisions. Pure and deterministic:
 * roots are deduplicated by algorithm-qualified OID while keeping EVERY
 * provenance source, so the same commit reached from a branch, a PR head and
 * a detached worktree head is one root with merged, sorted provenance. The
 * activity window only decides which branches are followed; a ref outside the
 * window, a deleted ref and a tag select nothing — and nothing is ever
 * pruned here, because retention is the persistence port's retained roots.
 */
export function selectHistoryRoots(input: SelectHistoryRootsInput): readonly SelectedRootDto[] {
  const byOid = new Map<string, { sources: RootSourceDto[] }>();
  const admit = (qualifiedOid: QualifiedOid, source: RootSourceDto): void => {
    if (!isValidQualifiedOid(qualifiedOid)) {
      const checked = validateQualifiedOid(qualifiedOid);
      throw new Error(`invalid root OID ${qualifiedOid.oid}: ${checked.errors.join("; ")}`);
    }
    const entry = byOid.get(qualifiedOid.oid) ?? { sources: [] };
    entry.sources.push(source);
    byOid.set(qualifiedOid.oid, entry);
  };
  const active = (ref: TrackedRefDto): boolean =>
    ref.activity !== null && input.now <= ref.activity.activityAt + ACTIVITY_WINDOW_DAYS * 86_400_000;

  for (const ref of [...input.trackedRefs].sort((left, right) => left.refName.localeCompare(right.refName))) {
    if (ref.oid === null || ref.deletedAt !== null) continue;
    const qualifiedOid = { algorithm: input.oidAlgorithm, oid: ref.oid };
    if (ref.refName === input.defaultBranch) {
      // The default branch is a root even when old (spec §4).
      admit(qualifiedOid, {
        signal: "default-branch",
        refName: ref.refName,
        worktreeId: null,
        activityAt: ref.activity?.activityAt ?? null,
        generation: ref.generation,
      });
      continue;
    }
    if (ref.kind === "pr-head") {
      // PR heads in all states, regardless of age (spec §4).
      admit(qualifiedOid, {
        signal: "pr-head",
        refName: ref.refName,
        worktreeId: null,
        activityAt: ref.activity?.activityAt ?? null,
        generation: ref.generation,
      });
      continue;
    }
    if ((ref.kind === "local-branch" || ref.kind === "remote-branch") && active(ref)) {
      admit(qualifiedOid, {
        signal: "active-window",
        refName: ref.refName,
        worktreeId: null,
        activityAt: ref.activity!.activityAt,
        generation: ref.generation,
      });
    }
    // Tags and "other" refs are inventoried, never traversal roots (spec §4).
  }

  for (const worktree of input.worktreeHeads) {
    if (worktree.head.kind === "unborn") continue;
    let qualifiedOid: QualifiedOid;
    let refName: string | null;
    if (worktree.head.kind === "detached") {
      // A detached worktree head roots by its raw OID; it is not a ref.
      qualifiedOid = { algorithm: input.oidAlgorithm, oid: worktree.head.oid };
      refName = null;
    } else {
      // After the detached/unborn branches above, this is a branch head.
      const branchName = worktree.head.kind === "branch" ? worktree.head.refName : "";
      const ref = input.trackedRefs.find((tracked) => tracked.refName === branchName);
      if (ref === undefined) {
        throw new Error(
          `worktree head ${worktree.worktreeId} is on branch ${branchName} which was not observed among the tracked refs`,
        );
      }
      if (ref.oid === null || ref.deletedAt !== null) {
        throw new Error(`worktree head ${worktree.worktreeId} is on deleted branch ${ref.refName}`);
      }
      qualifiedOid = { algorithm: input.oidAlgorithm, oid: ref.oid };
      refName = ref.refName;
    }
    // A registered worktree HEAD is a root even when its named branch is old.
    admit(qualifiedOid, {
      signal: "worktree-head",
      refName,
      worktreeId: worktree.worktreeId,
      activityAt: null,
      generation: null,
    });
  }

  for (const root of [...input.retainedRoots].sort((left, right) => left.oid.localeCompare(right.oid))) {
    // Previously ingested roots stay roots for investigation, whatever the
    // current refs say (spec §4): expiry, deletion, recreation and force-push
    // cannot erase an ingested root.
    admit({ algorithm: input.oidAlgorithm, oid: root.oid }, {
      signal: "previously-ingested",
      refName: null,
      worktreeId: null,
      activityAt: null,
      generation: null,
    });
  }

  const roots: SelectedRootDto[] = [];
  for (const [oid, entry] of [...byOid.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const sources = [...entry.sources].sort((left, right) => sourceSortKey(left).localeCompare(sourceSortKey(right)));
    roots.push({
      qualifiedOid: { algorithm: input.oidAlgorithm, oid },
      // The walk always names the OBSERVED oid: a ref name is mobile (it may
      // have moved between observation and the Git launches) and must never
      // select the walked objects. Live ref names stay as provenance in
      // `sources` only.
      rev: oid,
      sources,
    });
  }
  return roots;
}

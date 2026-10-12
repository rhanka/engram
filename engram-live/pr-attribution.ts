// @sentropic/engram-live/pr-attribution — P1 pinned PR attribution
// (spec/SPEC_LIVE_GIT_INDEXING.md §5; plan/09 P1).
//
// Pure functions over ./contracts.js DTOs: attribution is pinned history,
// never ancestry. A "complete" attribution needs the historically observed
// head/base bounds plus at least one merge-base OID; anything else is
// "partial" while the acquired ancestry remains available. Merge, squash
// and rebase stay distinguished; a force-push is another observation that
// retains the previous head (nothing erased). No commit array proves
// exhaustiveness; the DAG stays the history engine's fact.

import {
  validatePrAttribution,
  validateQualifiedOid,
  type PrAttributionDto,
  type PullRequestMergeStrategy,
  type QualifiedOid,
} from "./contracts.js";

export interface PinPrAttributionInput {
  readonly repositoryOwner: string;
  readonly repositoryRepo: string;
  readonly prNumber: number;
  readonly baseOid: QualifiedOid | null;
  readonly headOid: QualifiedOid;
  readonly mergeBaseOids: readonly QualifiedOid[];
  readonly mergeOid?: QualifiedOid | null;
  readonly mergeStrategy?: PullRequestMergeStrategy;
}

export interface PrHeadUpdate {
  readonly previousHead: QualifiedOid;
  readonly nextHead: QualifiedOid;
  readonly observedAt: number;
}

/**
 * Pin one PR attribution. Unknown or missing bounds stay partial with an
 * explicit reason; only observed head/base plus merge-base evidence is
 * complete. Today's base is never subtracted and ancestors are never
 * labelled PR-specific here.
 */
export function pinPrAttribution(input: PinPrAttributionInput): PrAttributionDto {
  const headChecked = validateQualifiedOid(input.headOid);
  if (!headChecked.ok) {
    throw new Error(`invalid PR head OID: ${headChecked.errors.join("; ")}`);
  }
  if (input.baseOid === null) {
    // An unknown base stays an explicit null: substituting the head OID
    // would fabricate a bound that was never observed.
    const unknown: PrAttributionDto = {
      repositoryOwner: input.repositoryOwner,
      repositoryRepo: input.repositoryRepo,
      prNumber: input.prNumber,
      baseOid: null,
      headOid: input.headOid,
      mergeBaseOids: [...input.mergeBaseOids],
      mergeOid: input.mergeOid ?? null,
      mergeStrategy: input.mergeStrategy ?? "unknown",
      status: "partial",
      reason: "historical base bound is unknown: attribution stays partial while the acquired ancestry remains available",
    };
    const checkedUnknown = validatePrAttribution(unknown);
    if (!checkedUnknown.ok) {
      throw new Error(`pinned PR attribution is invalid: ${checkedUnknown.errors.join("; ")}`);
    }
    return unknown;
  }
  const baseChecked = validateQualifiedOid(input.baseOid);
  if (!baseChecked.ok) {
    throw new Error(`invalid PR base OID: ${baseChecked.errors.join("; ")}`);
  }
  for (const [index, oid] of input.mergeBaseOids.entries()) {
    const checked = validateQualifiedOid(oid);
    if (!checked.ok) {
      throw new Error(`invalid merge-base OID at ${index}: ${checked.errors.join("; ")}`);
    }
  }
  if (input.mergeBaseOids.length === 0) {
    return {
      repositoryOwner: input.repositoryOwner,
      repositoryRepo: input.repositoryRepo,
      prNumber: input.prNumber,
      baseOid: input.baseOid,
      headOid: input.headOid,
      mergeBaseOids: [],
      mergeOid: input.mergeOid ?? null,
      mergeStrategy: input.mergeStrategy ?? "unknown",
      status: "partial",
      reason: "merge-base evidence is missing: attribution stays partial while the acquired ancestry remains available",
    };
  }
  const outcome: PrAttributionDto = {
    repositoryOwner: input.repositoryOwner,
    repositoryRepo: input.repositoryRepo,
    prNumber: input.prNumber,
    baseOid: input.baseOid,
    headOid: input.headOid,
    mergeBaseOids: [...input.mergeBaseOids],
    mergeOid: input.mergeOid ?? null,
    mergeStrategy: input.mergeStrategy ?? "unknown",
    status: "complete",
    reason: `pinned head/base bounds with ${input.mergeBaseOids.length} merge-base OID(s), strategy ${input.mergeStrategy ?? "unknown"}`,
  };
  const checked = validatePrAttribution(outcome);
  if (!checked.ok) {
    throw new Error(`pinned PR attribution is invalid: ${checked.errors.join("; ")}`);
  }
  return outcome;
}

/**
 * Apply a force-push head update to the retained head history: the previous
 * head stays retained (nothing erased) and the next head is appended unless
 * already present. Pure over OID histories.
 */
export function applyPrHeadUpdate(
  history: readonly QualifiedOid[],
  update: PrHeadUpdate,
): readonly QualifiedOid[] {
  const previousChecked = validateQualifiedOid(update.previousHead);
  if (!previousChecked.ok) {
    throw new Error(`invalid previous PR head: ${previousChecked.errors.join("; ")}`);
  }
  const nextChecked = validateQualifiedOid(update.nextHead);
  if (!nextChecked.ok) {
    throw new Error(`invalid next PR head: ${nextChecked.errors.join("; ")}`);
  }
  if (typeof update.observedAt !== "number" || !Number.isSafeInteger(update.observedAt) || update.observedAt <= 0) {
    throw new Error("PR head update observedAt must be a positive safe integer");
  }
  const oids = history.map((oid) => oid.oid);
  const next: QualifiedOid[] = [...history];
  if (!oids.includes(update.previousHead.oid)) {
    next.push(update.previousHead);
  }
  if (!next.map((oid) => oid.oid).includes(update.nextHead.oid)) {
    next.push(update.nextHead);
  }
  return next;
}

/**
 * Classify the merge evidence without collapsing strategies: only an
 * explicit caller-supplied strategy decides. A lone merge OID never proves
 * "merge" — the same commit shape follows a squash — so without an explicit
 * strategy the answer stays "unknown" (never inferred).
 */
export function classifyMergeStrategy(input: {
  readonly strategy?: PullRequestMergeStrategy;
  readonly mergeOid?: QualifiedOid | null;
}): PullRequestMergeStrategy {
  if (input.strategy !== undefined) return input.strategy;
  return "unknown";
}

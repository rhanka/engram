/**
 * Milestone evaluator (spec sections 6.9, 6.11, 7).
 *
 * Given an explicitly identified context injected by the caller (lotRef /
 * lot occurrence, forecastRevision), a forecast endpoint, a mergedAt and
 * per-target receipts, produce a DeliveryMilestonesV1 or refusal reasons.
 * Without that identified context no record is constructed and the export
 * carries `milestones: []` — bootstrap or pull-request data alone never
 * constructs a record and never supplies the missing identification.
 *
 * Pure: Git ancestry results arrive as the explicit `ancestryProven`
 * parameter. No I/O.
 */

import type {
  DeliveryMilestonesV1,
  InstallationReceiptV1,
  InstallMilestoneEntry,
  MergeVerdict,
  ReviewRoundsActualV1,
  ReviewWaveManifestV1,
} from "./types.js";
import { SCHEMA_DELIVERY_MILESTONES, SCHEMA_REVIEW_ROUNDS_ACTUAL } from "./types.js";
import { durationSeconds, isInstant } from "./format.js";

export const MERGE_VERDICTS = ["held", "missed", "pending", "not-claimed"] as const;
export const INSTALL_VERDICTS = ["held", "missed", "unknown"] as const;

/** Merge verdict computed from the two instants (section 6.9). */
export function parseMergeVerdict(forecastAt: string | null, mergedAt: string | null): MergeVerdict {
  if (forecastAt === null) return "not-claimed";
  if (mergedAt === null) return "pending";
  return Date.parse(mergedAt) <= Date.parse(forecastAt) ? "held" : "missed";
}

export interface IdentifiedContext {
  repo: string;
  lotRef: string;
  lotOccurrence: string;
  forecastRevision: string;
  forecastMergeAt: string | null;
  mergedAt: string | null;
  mergeSha: string | null;
}

export interface InstallationTargetInput {
  targetId: string;
  forecastAt: string | null;
  receipt: InstallationReceiptV1 | null;
  receiptRef?: string;
}

export interface TargetQualification {
  /** Expected values frozen for the target (section 7.2). */
  expectedVersion: string;
  expectedTuple: string;
  expectedIntegrity: string;
  expectedMergeSha: string;
  /** Caller-verified merge linkage: the installed release contains mergeSha. */
  ancestryProven: boolean;
}

/**
 * Qualify one installation target (section 7.2). `installedAt` leaves
 * `"unknown"` unless every condition holds; every refusal carries a reason
 * and produces no duration sample.
 */
export function qualifyInstallation(
  target: InstallationTargetInput,
  qual: TargetQualification,
): { installedAt: string; reason?: string } {
  const r = target.receipt;
  if (r === null) return { installedAt: "unknown", reason: "no-target-receipt" };
  if (r.targetId !== target.targetId) return { installedAt: "unknown", reason: "wrong-target" };
  if (r.installOutcome !== "success") return { installedAt: "unknown", reason: "install-not-success" };
  if (r.smokeOutcome !== "success") return { installedAt: "unknown", reason: "smoke-not-success" };
  if (r.observedVersion !== qual.expectedVersion) return { installedAt: "unknown", reason: "wrong-version" };
  if (r.observedTuple !== qual.expectedTuple) return { installedAt: "unknown", reason: "wrong-tuple" };
  if (r.artifactIntegrity !== qual.expectedIntegrity) return { installedAt: "unknown", reason: "wrong-integrity" };
  if (r.mergeSha !== qual.expectedMergeSha) return { installedAt: "unknown", reason: "wrong-merge-sha" };
  if (!qual.ancestryProven) return { installedAt: "unknown", reason: "unproven-merge-linkage" };
  if (!isInstant(r.installStartedAt) || !isInstant(r.installCompletedAt) || !isInstant(r.smokeCompletedAt)) {
    return { installedAt: "unknown", reason: "incoherent-timestamps" };
  }
  const a = Date.parse(r.installStartedAt);
  const b = Date.parse(r.installCompletedAt);
  const d = Date.parse(r.smokeCompletedAt);
  if (!(a <= b && b <= d)) return { installedAt: "unknown", reason: "incoherent-timestamps" };
  // installedAt is smokeCompletedAt after a successful install and a
  // successful required smoke on that declared target (section 6.10).
  return { installedAt: r.smokeCompletedAt };
}

export interface EvaluatedTarget {
  entry: InstallMilestoneEntry;
  /** Present whenever the verdict is `unknown`. */
  reason?: string;
}

export function evaluateInstallationTarget(
  target: InstallationTargetInput,
  qual: TargetQualification,
): EvaluatedTarget {
  const q = qualifyInstallation(target, qual);
  if (q.installedAt === "unknown") {
    const entry: InstallMilestoneEntry = {
      targetId: target.targetId,
      forecastAt: target.forecastAt,
      installedAt: "unknown",
      verdict: "unknown",
    };
    if (target.receiptRef !== undefined) entry.receiptRef = target.receiptRef;
    return { entry, reason: q.reason ?? "unknown" };
  }
  if (target.forecastAt === null || !isInstant(target.forecastAt)) {
    const entry: InstallMilestoneEntry = {
      targetId: target.targetId,
      forecastAt: target.forecastAt,
      installedAt: "unknown",
      verdict: "unknown",
    };
    if (target.receiptRef !== undefined) entry.receiptRef = target.receiptRef;
    return { entry, reason: "no-dated-installation-claim" };
  }
  const verdict = Date.parse(q.installedAt) <= Date.parse(target.forecastAt) ? "held" : "missed";
  const entry: InstallMilestoneEntry = {
    targetId: target.targetId,
    forecastAt: target.forecastAt,
    installedAt: q.installedAt,
    verdict,
  };
  if (target.receiptRef !== undefined) entry.receiptRef = target.receiptRef;
  return { entry };
}

/**
 * Build one DeliveryMilestonesV1 from an explicitly identified context.
 * Returns null without such a context (the export carries `milestones: []`).
 * Never invents a lot, target, receipt or lot association from history.
 */
export function buildDeliveryMilestones(
  ctx: IdentifiedContext | null | undefined,
  targets: Array<{ input: InstallationTargetInput; qual: TargetQualification }>,
): { record: DeliveryMilestonesV1; targetReasons: Array<{ targetId: string; reason: string }> } | null {
  if (ctx === null || ctx === undefined) return null;
  if (typeof ctx.lotRef !== "string" || ctx.lotRef.length === 0) return null;
  if (typeof ctx.forecastRevision !== "string" || ctx.forecastRevision.length === 0) return null;
  const installMilestones: InstallMilestoneEntry[] = [];
  const targetReasons: Array<{ targetId: string; reason: string }> = [];
  for (const t of targets) {
    const ev = evaluateInstallationTarget(t.input, t.qual);
    installMilestones.push(ev.entry);
    if (ev.reason !== undefined) targetReasons.push({ targetId: t.input.targetId, reason: ev.reason });
  }
  return {
    record: {
      schema: SCHEMA_DELIVERY_MILESTONES,
      repo: ctx.repo,
      lotRef: ctx.lotRef,
      forecastRevision: ctx.forecastRevision,
      mergeSha: ctx.mergeSha,
      mergeMilestone: {
        forecastAt: ctx.forecastMergeAt,
        mergedAt: ctx.mergedAt,
        verdict: parseMergeVerdict(ctx.forecastMergeAt, ctx.mergedAt),
      },
      installMilestones,
    },
    targetReasons,
  };
}

/** `merge_to_installed` sample for one target, or null (no sample). */
export function mergeToInstalledSample(mergedAt: string | null, installedAt: string): number | null {
  if (mergedAt === null || installedAt === "unknown") return null;
  return durationSeconds(mergedAt, installedAt).seconds;
}

/**
 * Lot round totals from wave manifests (section 6.11). One manifest is one
 * round; parallel reviewers of one submission are multiple reviewer runs
 * inside one manifest and one round. Without a coverageManifestRef, totals
 * stay null with an explicit reason — never zero.
 */
export function summarizeReviewRounds(
  repo: string,
  lotOccurrence: string,
  waves: ReviewWaveManifestV1[],
  coverageManifestRef: string | null,
): ReviewRoundsActualV1 {
  const roundIds = waves.map((w) => w.roundId);
  const openRoundIds = waves.filter((w) => w.closedAt === null).map((w) => w.roundId);
  const reviewerRunCount = waves.reduce((s, w) => s + w.reviewerRuns.length, 0);
  if (coverageManifestRef === null) {
    return {
      schema: SCHEMA_REVIEW_ROUNDS_ACTUAL,
      repo,
      lotOccurrence,
      convention: "review-round/1",
      status: waves.length === 0 ? "unknown" : "partial",
      completedCount: null,
      openRoundIds,
      reviewerRunCount: null,
      roundIds,
      coverageManifestRef: null,
      evidenceRefs: waves.flatMap((w) => w.submissionEvidenceRefs),
      missingReason: "coverage-of-required-review-channels-unattested",
    };
  }
  return {
    schema: SCHEMA_REVIEW_ROUNDS_ACTUAL,
    repo,
    lotOccurrence,
    convention: "review-round/1",
    status: openRoundIds.length === 0 ? "complete" : "partial",
    completedCount: waves.filter((w) => w.closedAt !== null).length,
    openRoundIds,
    reviewerRunCount,
    roundIds,
    coverageManifestRef,
    evidenceRefs: waves.flatMap((w) => w.submissionEvidenceRefs),
  };
}

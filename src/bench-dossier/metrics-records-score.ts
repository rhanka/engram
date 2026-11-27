import type { Verdict } from "../scrap/converge.js";
import type { ArmManifestFile, MetricsImportRecord } from "./companion-contracts.js";
import type { BenchResultRecord, BenchResultsFile, CurrencyCode, EstimatorKind } from "./results-contract.js";
import { computeIndeterminate, ensure, isPlainObject, parseGoldenUnit } from "./metrics-unweighted.js";
import * as align from "./metrics-records-align.js";

const VALID_VERDICTS = new Set<Verdict>(["unanimous", "majority", "split", "absent", "insufficient"]);

function parseCluster(raw: unknown, subField: string, recNAns: number | undefined, tag: string) {
  ensure(isPlainObject(raw) && isPlainObject(raw.fields), "NOT_OBJECT", `${tag}.fields must be plain object`);
  const subRaw = raw.fields[subField];
  ensure(isPlainObject(subRaw), "MISSING_VOTE", `${tag}: missing ${subField}`);
  const kAns = recNAns ?? align.optionalCountInt(subRaw.n_answered, "n_answered");
  ensure(kAns !== undefined && kAns >= 2, kAns === undefined ? "MISSING_N_ANSWERED" : "N_ANSWERED_MISMATCH", tag);
  const presentRuns = new Set<string>();
  const values = new Map<string, string | null>();
  const fallback = new Map<string, string>();
  let splitVariants: Set<string> | null = null;
  for (const [subName, subVote] of Object.entries(raw.fields as Record<string, Record<string, unknown>>)) {
    const { unit } = parseGoldenUnit({ id: tag, fields: raw.fields }, subName, 1);
    ensure(unit.kind !== "insufficient" && (align.optionalCountInt(subVote.n_answered, "n_answered") ?? kAns) === kAns,
      "N_ANSWERED_MISMATCH", `${tag}.${subName}`);
    values.set(subName, unit.kind === "present" ? [...unit.goldSet][0]! : null);
    if (subName === subField && unit.kind === "split")
      splitVariants = new Set(unit.variants.map((set) => [...set][0]!));
    if (kAns < 4 && subVote.runs === undefined) continue;
    ensure(isPlainObject(subVote.runs), "MISSING_RUNS", `${tag}.${subName}: runs must be plain object`);
    for (const [runId, entry] of Object.entries(subVote.runs)) {
      const ok = isPlainObject(entry) && (entry.status === "failed" || entry.status === "missing" || "value" in entry);
      ensure(ok, "BAD_SPLIT_RUN", `${tag}.${subName}: bad run ${runId}`);
      const runVal = entry.status !== "failed" && entry.status !== "missing"
        ? align.normalizeSingleValue(entry.value, `${tag}.${subName}.${runId}`) : null;
      if (runVal === null) continue;
      presentRuns.add(runId);
      if (!fallback.has(subName)) fallback.set(subName, runVal);
    }
  }
  if (kAns < 4 || presentRuns.size > kAns / 2) return { maj: true as const,
    cluster: { ...align.keyOfRecordMap(values), goldVal: values.get(subField) ?? null, splitVariants } };
  for (const [key, val] of fallback) values.set(key, values.get(key) ?? val);
  return { maj: false as const, key: align.keyOfRecordMap(values) };
}

/** Parse a converged record field row into majority-gated aligned clusters and unmatched records. */
export function parseGoldenRecordUnit(row: unknown, recField: string, subField: string) {
  ensure(isPlainObject(row) && typeof row.id === "string" && !!row.id.trim(),
    isPlainObject(row) ? "MISSING_ID" : "NOT_OBJECT", "golden row must have non-empty string id");
  const tag = `${row.id}.${recField}`;
  ensure(isPlainObject(row.fields) && isPlainObject(row.fields[recField]),
    isPlainObject(row.fields) ? "MISSING_VOTE" : "NOT_OBJECT", `missing vote ${tag}`);
  const vote = row.fields[recField] as Record<string, unknown>;
  const verdict = vote.verdict as Verdict;
  ensure(VALID_VERDICTS.has(verdict), "BAD_VERDICT", `${tag}: invalid verdict`);
  const recNAns = align.optionalCountInt(vote.n_answered, "n_answered");
  ensure(recNAns === undefined || (verdict === "insufficient") === (recNAns < 2), "N_ANSWERED_MISMATCH", tag);
  const rawAligned = vote.aligned === undefined ? [] : vote.aligned;
  const rawUnmatched = vote.unmatched === undefined ? [] : vote.unmatched;
  ensure(Array.isArray(rawAligned) && Array.isArray(rawUnmatched), "NOT_ARRAY", `${tag}: bad arrays`);
  if (verdict === "insufficient" || verdict === "absent") {
    ensure(!rawAligned.length && !rawUnmatched.length,
      verdict === "insufficient" ? "INSUFFICIENT_NON_EMPTY" : "ABSENT_NON_EMPTY", tag);
    return { id: row.id, unit: { kind: verdict } as align.RecordGoldUnit };
  }
  ensure(!(verdict === "unanimous" && !rawAligned.length), "UNANIMOUS_NULL", `${tag}: unanimous empty`);
  ensure(!(verdict === "split" && !rawAligned.length && !rawUnmatched.length), "SPLIT_NO_RUN", `${tag}: split empty`);
  const parsed = rawAligned.map((cluster, idx) => parseCluster(cluster, subField, recNAns, `${tag}.aligned[${idx}]`));
  const unmatched = rawUnmatched.map((item, idx) => {
    ensure(isPlainObject(item) && isPlainObject(item.fields), "NOT_OBJECT", `${tag}.unmatched[${idx}]`);
    return align.readRecFields(item.fields, false, subField, `${tag}.unmatched[${idx}]`).key;
  });
  return { id: row.id, unit: { kind: "resolved", recordSplit: verdict === "split", unmatched,
    majClusters: parsed.flatMap((entry) => (entry.maj ? [entry.cluster] : [])),
    nonMajClusters: parsed.flatMap((entry) => (entry.maj ? [] : [entry.key])) } as align.RecordGoldUnit };
}

/** Build fallback usage and BenchCostBlock when no explicit armCost entry is supplied. */
export function buildFallbackUsage(
  rec: MetricsImportRecord, arm: ArmManifestFile, currency: CurrencyCode, armMissionSha256: string,
): Pick<BenchResultRecord, "armMissionSha256" | "calls" | "callsPerItem" | "tokens" | "cost"> {
  const { calls = "unknown", tokens = "unknown", apiEquivalentTotal: apiTotal = "unknown", costBasisItems } = rec;
  const apiNum = typeof apiTotal === "number";
  ensure((calls === "unknown" && !apiNum) || costBasisItems !== undefined, "COST_BASIS", `${rec.armId}: basis`);
  const basis = costBasisItems ?? 0;
  ensure(basis > 0 || calls === "unknown" || calls === 0, "COST_BASIS", `${rec.armId}: 0 basis calls`);
  ensure(basis > 0 || !apiNum || apiTotal === 0, "COST_CONSISTENCY", `${rec.armId}: 0 basis positive apiTotal`);
  const override = arm.tariffOverride;
  ensure(!arm.fx ? (!override?.currency || override.currency === currency) : arm.fx.to === currency
    && (!override?.currency || override.currency === arm.fx.from), "CURRENCY_MISMATCH", `${rec.armId}: currency`);
  ensure(!arm.seat || arm.seat.status === "unknown", "SEAT_BLOCK_REQUIRED", `${rec.armId}: resolved seat needed`);
  ensure(apiNum || !override?.perMillion || tokens === "unknown", "COST_BLOCK_REQUIRED", `${rec.armId}: cost`);
  return { armMissionSha256, calls, tokens,
    callsPerItem: calls === "unknown" ? "unknown" : basis === 0 ? 0 : calls / basis,
    cost: { currency, costBasisItems: basis, apiEquivalentTotal: apiTotal,
      costUnknownReason: apiNum ? null : tokens === "unknown" ? "missing-usage" : "unpriced-mission",
      apiEquivalentPerItem: apiNum ? (basis === 0 ? 0 : apiTotal / basis) : "unknown",
      tariffStatus: override?.status ?? arm.tariffStatus ?? "unknown", tariffSource: override?.source ?? null,
      tariffAsOf: override?.asOf ?? null, fxApplied: arm.fx ?? null, seatStatus: "unknown", seatMethod: "unknown",
      seatUnknownReason: arm.seat?.status === "unknown" ? arm.seat.reason : "missing-observation", seatPlan: null,
      seatSharePerItem: "unknown", seatCostPerItem: "unknown", seatMonthlyPrice: null, seatLimitScale: null,
      seatPlanSource: null, seatPlanAsOf: null } };
}

/** Project one imported metrics record, arm manifest, and usage block into a BenchResultRecord. */
export function projectImportedRecord(rec: MetricsImportRecord, arm: ArmManifestFile, estimator: EstimatorKind,
  floors: BenchResultsFile["supportFloors"], usage: ReturnType<typeof buildFallbackUsage>): BenchResultRecord {
  const primary = estimator === "weighted" ? rec.weighted! : rec.unweighted;
  const { armMissionSha256: _s, calls: _c, tokens: _t, costBasisItems: _b, apiEquivalentTotal: _a, ...rest } = rec;
  return { ...rest, ...usage, missingDigestAllowed: arm.allowLegacyMissingMissionDigest ?? false,
    provider: arm.provider, model: arm.model, modelLabel: arm.modelLabel, proseName: arm.proseName,
    effort: arm.effort, isCascade: arm.isCascade, isHighlighted: arm.isHighlighted ?? false,
    precision: primary.precision, incomplete: arm.incomplete ?? false, recall: primary.recall, f1: primary.f1,
    precisionInterval: primary.precisionInterval, recallInterval: primary.recallInterval,
    abstentionSpecificity: rec.tn + rec.fpOnAbsent > 0 ? rec.tn / (rec.tn + rec.fpOnAbsent) : null,
    indeterminate: computeIndeterminate(rec.tp, rec.fp, rec.fn, floors, rec.independentGroupSupport) };
}

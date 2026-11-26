import type { BenchResultRecord } from "./results-types.js";
import {
  bestBroadSplit, buildSitePresenceMatrix, computeIndeterminate, computePointMetrics,
  computeUnweightedBlock, ensure, isPlainObject, type SupportFloorThresholds,
} from "./metrics-intervals.js";
import {
  classifyCandidateRow, extractCandidateField, indexCandidateRows, parseGoldenUnit,
  resolveSupportFloors, type GoldenScalarRow,
} from "./metrics-parsers.js";

export * from "./metrics-intervals.js";
export * from "./metrics-parsers.js";

export interface ScoreUnweightedScalarInput {
  readonly field: string;
  readonly maxValues?: number;
  readonly supportFloors?: Partial<SupportFloorThresholds>;
  readonly goldenRows: readonly GoldenScalarRow[];
  readonly candidateRows: readonly Record<string, unknown>[];
  readonly independentGroupSupport?: BenchResultRecord["independentGroupSupport"];
}

export type UnweightedScalarScore = Omit<BenchResultRecord,
  | "armId" | "armMissionSha256" | "missingDigestAllowed" | "provider" | "model" | "modelLabel" | "proseName"
  | "effort" | "isCascade" | "isHighlighted" | "incomplete" | "comparator" | "isPrimaryComparator"
  | "weighted" | "independentGroupSupport" | "calls" | "callsPerItem" | "tokens" | "cost" | "diagnostics"
> & {
  readonly diagnostics: { readonly broad: NonNullable<NonNullable<BenchResultRecord["diagnostics"]>["broad"]> };
};

/** Score a generic unweighted scalar field (single- or multi-value) against converged golden rows. */
export function scoreUnweightedScalar(input: ScoreUnweightedScalarInput): UnweightedScalarScore {
  ensure(isPlainObject(input), "NOT_OBJECT", "input must be a plain object");
  const { field, maxValues = 1, goldenRows, candidateRows, supportFloors, independentGroupSupport } = input;
  ensure(typeof field === "string" && !!field && field === field.trim() && !field.includes("."),
    "BAD_FIELD", `bad scalar field: ${String(field)}`);
  ensure(typeof maxValues === "number" && Number.isSafeInteger(maxValues) && maxValues >= 1,
    "BAD_MAX_VALUES", `bad maxValues: ${String(maxValues)}`, true);
  ensure(Array.isArray(goldenRows), "NOT_ARRAY", "goldenRows must be an array");
  const floors = resolveSupportFloors(supportFloors);
  const candById = indexCandidateRows(candidateRows);
  const seenIds = new Set<string>();
  const failByCode: Record<string, number> = {};
  const acc = {
    accepted: 0, failed: 0, unverifiedQuotesNulled: 0, goldPositive: 0, goldAbsent: 0, tp: 0, fpOnPresent: 0,
    fpOnAbsent: 0, fpElementsOnAbsent: 0, fn: 0, tn: 0, failedOnAbsent: 0, unresolved: 0, insufficient: 0,
  };
  const splitBroad = { tp: 0, fp: 0, fn: 0 };
  const sites = { tp: 0, fn: 0, wrong: 0 };
  for (const rawGold of goldenRows) {
    const { id, unit } = parseGoldenUnit(rawGold, field, maxValues);
    ensure(!seenIds.has(id), "DUPLICATE_ID", `duplicate golden id: ${id}`);
    seenIds.add(id);
    const state = classifyCandidateRow(candById.get(id));
    let candSet: Set<string> | null = null;
    if (!state.ok) {
      acc.failed++;
      failByCode[state.code] = (failByCode[state.code] ?? 0) + 1;
    } else {
      acc.accepted++;
      const ext = extractCandidateField(state.fields[field], maxValues);
      candSet = ext.set;
      acc.unverifiedQuotesNulled += ext.nulled;
    }
    if (unit.kind === "insufficient") acc.insufficient++;
    else if (unit.kind === "split") {
      const match = bestBroadSplit(candSet, unit.variants);
      acc.unresolved++;
      splitBroad.tp += match.tp;
      splitBroad.fp += match.fp;
      splitBroad.fn += match.fn;
    } else if (unit.kind === "absent") {
      acc.goldAbsent++;
      if (candSet === null) acc.failedOnAbsent++;
      else if (candSet.size === 0) acc.tn++;
      else {
        acc.fpOnAbsent++;
        acc.fpElementsOnAbsent += candSet.size;
      }
    } else {
      const goldSize = unit.goldSet.size;
      acc.goldPositive += goldSize;
      if (candSet === null) {
        acc.fn += goldSize;
        sites.fn++;
      } else {
        let tpHere = 0;
        for (const v of unit.goldSet) if (candSet.has(v)) tpHere++;
        acc.tp += tpHere;
        acc.fn += goldSize - tpHere;
        acc.fpOnPresent += candSet.size - tpHere;
        if (tpHere >= 1) sites.tp++;
        else {
          sites.fn++;
          if (candSet.size > 0) sites.wrong++;
        }
      }
    }
  }
  const fp = acc.fpOnPresent + acc.fpElementsOnAbsent;
  const sitePresence = buildSitePresenceMatrix({
    goldAbsentSites: acc.goldAbsent, unresolvedSites: acc.unresolved, insufficientSites: acc.insufficient,
    tpSites: sites.tp, fnSites: sites.fn, wrongValueOnPresentSites: sites.wrong,
    fpOnAbsentSites: acc.fpOnAbsent, tnSites: acc.tn, failedOnAbsentSites: acc.failedOnAbsent,
  });
  const unweighted = computeUnweightedBlock(acc.tp, fp, acc.fn, maxValues === 1);
  const broad = { tp: acc.tp + splitBroad.tp, fp: fp + splitBroad.fp, fn: acc.fn + splitBroad.fn };
  const failuresByCode = Object.fromEntries(Object.keys(failByCode).sort().map((k) => [k, failByCode[k]!]));
  return {
    field, attempted: seenIds.size, ...acc, fp, failuresByCode, unverifiedWholeRecordsDropped: null,
    abstentionSpecificity: sitePresence.siteAbstentionSpecificity, sitePresence, unweighted, ...unweighted,
    indeterminate: computeIndeterminate(acc.tp, fp, acc.fn, floors, independentGroupSupport),
    diagnostics: { broad: { ...broad, ...computePointMetrics(broad.tp, broad.fp, broad.fn) } },
  };
}

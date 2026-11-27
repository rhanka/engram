import { buildSitePresenceMatrix, classifyCandidateRow, computeIndeterminate, computePointMetrics,
  computeUnweightedBlock, ensure, indexCandidateRows, isPlainObject, resolveSupportFloors,
  type ScoreUnweightedScalarInput, type UnweightedScalarScore } from "./metrics-unweighted.js";
import { alignRecordsOneToOne, extractCandidateRecords, type CandidateRecordItem,
  type RecordGoldUnit } from "./metrics-records-align.js";
import { parseGoldenRecordUnit } from "./metrics-records-score.js";

export * from "./metrics-records-align.js";
export * from "./metrics-records-score.js";
export type { UnweightedScalarScore as UnweightedRecordScore,
  ScoreUnweightedScalarInput as ScoreUnweightedRecordInput };

/** Score one resolved or absent golden record site against extracted candidate items. */
export function scoreClusterSite(
  unit: Extract<RecordGoldUnit, { kind: "absent" | "resolved" }>, cand: readonly CandidateRecordItem[] | null,
  acc: Record<string, number>, broad: Record<string, number>, sites: Record<string, number>,
) {
  const resolved = unit.kind === "absent"
    ? { recordSplit: false, majClusters: [], nonMajClusters: [], unmatched: [] } : unit;
  acc.unresolved! += resolved.nonMajClusters.length;
  const aligned = cand ? alignRecordsOneToOne(resolved.majClusters, cand) : null;
  const byGold = new Map(aligned?.matched.map(([gIdx, cIdx]) => [gIdx, cand![cIdx]!.subVal] as const));
  let goldPos = 0;
  let fpNonPos = 0;
  let anySplit = resolved.recordSplit || resolved.nonMajClusters.length > 0 || resolved.unmatched.length > 0;
  const goldSet = new Set<string>();
  for (const [goldIdx, cluster] of resolved.majClusters.entries()) {
    const candVal = byGold.get(goldIdx) ?? null;
    if (cluster.splitVariants) {
      anySplit = true;
      acc.unresolved!++;
      const hit = candVal !== null && cluster.splitVariants.has(candVal);
      if (!hit) broad.fn!++;
      if (candVal !== null) hit ? broad.tp!++ : broad.fp!++;
      continue;
    }
    if (cluster.goldVal !== null) {
      goldPos++;
      goldSet.add(cluster.goldVal);
      candVal === cluster.goldVal ? acc.tp!++ : acc.fn!++;
    }
    if (candVal !== null && candVal !== cluster.goldVal) fpNonPos++;
  }
  acc.goldPositive! += goldPos;
  if (cand && aligned) {
    const rem1 = aligned.unalignedCand.map((idx) => cand[idx]!);
    const unmatchedAligned = alignRecordsOneToOne(resolved.unmatched, rem1);
    for (const [, candIdx] of unmatchedAligned.matched) if (rem1[candIdx]!.subVal !== null) acc.unresolved!++;
    const rem2 = unmatchedAligned.unalignedCand.map((idx) => rem1[idx]!);
    fpNonPos += alignRecordsOneToOne(resolved.nonMajClusters, rem2).unalignedCand
      .filter((idx) => rem2[idx]!.subVal !== null).length;
    if (goldPos === 0 && !anySplit) {
      acc.fpElementsOnAbsent! += fpNonPos;
      if (fpNonPos > 0) acc.fpOnAbsent!++;
    } else acc.fpOnPresent! += fpNonPos;
  }
  const candVals = new Set((cand ?? []).map((item) => item.subVal).filter((val): val is string => val !== null));
  if (goldPos === 0 && anySplit) sites.unresolvedSites!++;
  else if (goldPos > 0) {
    const hit = [...candVals].some((val) => goldSet.has(val));
    hit ? sites.tpSites!++ : sites.fnSites!++;
    if (!hit && candVals.size > 0) sites.wrongValueOnPresentSites!++;
  } else {
    acc.goldAbsent!++;
    if (!cand) acc.failedOnAbsent!++;
    else candVals.size === 0 ? acc.tn!++ : sites.fpOnAbsentSites!++;
  }
}

/** Score a generic unweighted record sub-field with 1-to-1 alignment, majority gate and sitePresence. */
export function scoreUnweightedRecord(input: ScoreUnweightedScalarInput): UnweightedScalarScore {
  ensure(isPlainObject(input), "NOT_OBJECT", "input must be a plain object");
  const { field, maxValues = 3, goldenRows, candidateRows, supportFloors, independentGroupSupport } = input;
  const [recField, subField, extra] = typeof field === "string" && field === field.trim() ? field.split(".") : [];
  ensure(extra === undefined && !!recField && recField === recField.trim() && !!subField
    && subField === subField.trim(), "BAD_FIELD", `bad record field: ${String(field)}`);
  ensure(typeof maxValues === "number" && Number.isSafeInteger(maxValues) && maxValues >= 1,
    "BAD_MAX_VALUES", `bad maxValues: ${String(maxValues)}`, true);
  ensure(Array.isArray(goldenRows), "NOT_ARRAY", "goldenRows must be an array");
  const floors = resolveSupportFloors(supportFloors);
  const candById = indexCandidateRows(candidateRows);
  const seenIds = new Set<string>();
  const failByCode: Record<string, number> = Object.create(null);
  const broad = { tp: 0, fp: 0, fn: 0 };
  const acc = { accepted: 0, failed: 0, unverifiedQuotesNulled: 0, unverifiedWholeRecordsDropped: 0, goldPositive: 0,
    goldAbsent: 0, tp: 0, fpOnPresent: 0, fpOnAbsent: 0, fpElementsOnAbsent: 0, fn: 0, tn: 0, failedOnAbsent: 0,
    unresolved: 0, insufficient: 0 };
  const sites = { tpSites: 0, fnSites: 0, wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, unresolvedSites: 0 };
  for (const rawGold of goldenRows) {
    const { id, unit } = parseGoldenRecordUnit(rawGold, recField, subField);
    ensure(!seenIds.has(id), "DUPLICATE_ID", `duplicate golden id: ${id}`);
    seenIds.add(id);
    const candState = classifyCandidateRow(candById.get(id));
    if (!candState.ok) failByCode[candState.code] = (failByCode[candState.code] ?? 0) + 1;
    candState.ok ? acc.accepted++ : acc.failed++;
    const cand = candState.ok ? extractCandidateRecords(candState.fields[recField], subField) : null;
    acc.unverifiedWholeRecordsDropped += cand?.dropped ?? 0;
    acc.unverifiedQuotesNulled += cand?.nulled ?? 0;
    if (unit.kind === "insufficient") acc.insufficient++;
    else scoreClusterSite(unit, cand?.items ?? null, acc, broad, sites);
  }
  const fp = acc.fpOnPresent + acc.fpElementsOnAbsent;
  const mergedBroad = { tp: acc.tp + broad.tp, fp: fp + broad.fp, fn: acc.fn + broad.fn };
  const sitePresence = buildSitePresenceMatrix({ ...sites, goldAbsentSites: acc.goldAbsent,
    insufficientSites: acc.insufficient, tnSites: acc.tn, failedOnAbsentSites: acc.failedOnAbsent });
  const unweighted = computeUnweightedBlock(acc.tp, fp, acc.fn, maxValues === 1);
  return { field, attempted: seenIds.size, ...acc, fp, sitePresence, unweighted, ...unweighted,
    failuresByCode: Object.fromEntries(Object.keys(failByCode).sort().map((key) => [key, failByCode[key]!])),
    abstentionSpecificity: sitePresence.siteAbstentionSpecificity,
    indeterminate: computeIndeterminate(acc.tp, fp, acc.fn, floors, independentGroupSupport),
    diagnostics: { broad: { ...mergedBroad,
      ...computePointMetrics(mergedBroad.tp, mergedBroad.fp, mergedBroad.fn) } } };
}

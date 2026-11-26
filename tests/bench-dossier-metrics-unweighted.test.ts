import { describe, expect, it } from "vitest";
import {
  assertCountInt, bestBroadSplit, buildSitePresenceMatrix, clusteredInvalidInterval, computeIndeterminate,
  computePointMetrics, computeUnweightedBlock, isPlainObject, wilson95,
} from "../src/bench-dossier/metrics-intervals.js";
import {
  classifyCandidateRow, extractCandidateField, indexCandidateRows, normalizeItemsToSet, parseGoldenUnit,
  resolveSupportFloors, toGoldSet, type GoldenScalarRow,
} from "../src/bench-dossier/metrics-parsers.js";
import { scoreUnweightedScalar } from "../src/bench-dossier/metrics-unweighted.js";

const val = (value: unknown, quote: string | null = typeof value === "string" ? value : null) =>
  ({ value, quote, sha256: quote ? "a".repeat(64) : null });
const gRow = (id: string, field: string, vote: Record<string, unknown>): GoldenScalarRow =>
  ({ id, fields: { [field]: vote } });

function expectClose(actual: number | null, expected: number, eps = 1e-12): void {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThan(eps);
}

function refuse(fn: () => unknown, code: string, Err: ErrorConstructor = Error, msg?: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Err);
  const typed = caught as Error & { code?: string };
  expect(typed.code).toBe(code);
  if (msg) expect(typed.message).toMatch(msg);
}

describe("wilson95, clusteredInvalidInterval & input guards", () => {
  it("checks plain objects and safe non-negative integer counts", () => {
    expect([isPlainObject({}), isPlainObject(Object.create(null))]).toEqual([true, true]);
    for (const bad of [null, undefined, "x", 1, [], new Date(), Object.setPrototypeOf([], null)]) {
      expect(isPlainObject(bad)).toBe(false);
    }
    expect(assertCountInt(0, "c")).toBe(0);
    expect(assertCountInt(Number.MAX_SAFE_INTEGER, "c")).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "1", null]) {
      refuse(() => assertCountInt(bad, "c"), "BAD_COUNT", RangeError, /^BAD_COUNT: c /);
    }
  });

  it("matches independently derived Wilson 95% bounds for 95/95, 7/10, 1/3, 0/7 and handles n=0", () => {
    // z = 1.959963984540054, z^2 = 3.8414588206941254, d = 1 + z^2/n,
    // center = (k/n + z^2/(2n))/d, half = z*sqrt((k/n)(1-k/n)/n + z^2/(4n^2))/d.
    const w95 = wilson95(95, 95); // 95/(95+z^2) = 0.9611351464605271, high = 1.
    expect([w95.estimator, w95.method, w95.clustering, w95.valid]).toEqual([
      "unweighted", "wilson_95_unweighted", "independent_site", true,
    ]);
    expectClose(w95.low, 0.9611351464605271);
    expect(w95.high).toBe(1);
    expect(wilson95(10, 10).high).toBe(1);
    expect(wilson95(30, 30).high).toBe(1);

    const w7 = wilson95(7, 10); // center=0.6444934400274221, half=0.24771529256627676
    expectClose(w7.low, 0.39677814746114537);
    expectClose(w7.high, 0.8922087325936989);
    const w1 = wilson95(1, 3); // center=0.42691617195917425, half=0.365424227238778
    expectClose(w1.low, 0.06149194472039621);
    expectClose(w1.high, 0.7923403991979522);
    const w0 = wilson95(0, 7); // high = z^2/(7+z^2) = 0.35433043506668743
    expect(w0.low).toBe(0);
    expectClose(w0.high, 0.35433043506668743);
    expect(wilson95(0, 0)).toEqual({
      estimator: "unweighted", method: "none", clustering: "independent_site", valid: false, low: null, high: null,
    });
    expect(clusteredInvalidInterval()).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    for (const [k, n] of [[0, -1], [-1, 5], [1.5, 5], [1, 5.5], [Number.NaN, 5], [1, Infinity]]) {
      refuse(() => wilson95(k, n), "BAD_COUNT", RangeError);
    }
    refuse(() => wilson95(6, 5), "K_EXCEEDS_N", RangeError, /cannot exceed/);
  });

  it("computes point metrics, support floors at 30/29, unweighted block, sitePresence & broad split", () => {
    expect(computePointMetrics(0, 0, 0)).toEqual({ precision: null, recall: null, f1: null });
    expect(computePointMetrics(0, 2, 0)).toEqual({ precision: 0, recall: null, f1: 0 });
    expect(computePointMetrics(0, 0, 3)).toEqual({ precision: null, recall: 0, f1: 0 });
    const pm = computePointMetrics(7, 3, 2);
    expectClose(pm.precision, 0.7);
    expectClose(pm.recall, 7 / 9);
    expectClose(pm.f1, 14 / 19);
    const floors = { precisionMinPredictions: 30, recallMinPositives: 30 };
    expect(computeIndeterminate(20, 10, 10, floors)).toEqual({ precision: false, recall: false, f1: false });
    expect(computeIndeterminate(19, 10, 11, floors)).toEqual({ precision: true, recall: false, f1: true });
    expect(computeIndeterminate(20, 10, 9, floors)).toEqual({ precision: false, recall: true, f1: true });
    expect(computeIndeterminate(25, 15, 15, floors, { predictions: 29, positives: 30 }))
      .toEqual({ precision: true, recall: false, f1: true });
    expect(computeIndeterminate(25, 15, 15, floors, { predictions: 30, positives: 29 }))
      .toEqual({ precision: false, recall: true, f1: true });
    expect(computeIndeterminate(0, 0, 0, { precisionMinPredictions: 0, recallMinPositives: 0 }))
      .toEqual({ precision: false, recall: false, f1: false });
    const badCounts: [() => unknown, RegExp][] = [
      [() => computePointMetrics(-1, 0, 0), /\btp\b/], [() => computePointMetrics(0, 1.5, 0), /\bfp\b/],
      [() => computePointMetrics(0, 0, Number.NaN), /\bfn\b/],
      [() => computeIndeterminate(1, 1, 1, { precisionMinPredictions: -1, recallMinPositives: 30 }), /precisionMin/],
      [() => computeIndeterminate(1, 1, 1, { precisionMinPredictions: 30, recallMinPositives: 1.5 }), /recallMin/],
      [() => computeIndeterminate(1, 1, 1, floors, { predictions: -1, positives: 30 }), /predictions/],
      [() => computeIndeterminate(1, 1, 1, floors, { predictions: 30, positives: -1 }), /positives/],
    ];
    for (const [fn, pattern] of badCounts) refuse(fn, "BAD_COUNT", RangeError, pattern);
    for (const bad of [[], new Date(), null]) refuse(() => computeIndeterminate(1, 1, 1, bad as any), "NOT_OBJECT");
    for (const bad of [[], new Date(), null]) {
      refuse(() => computeIndeterminate(1, 1, 1, floors, bad as any), "NOT_OBJECT");
    }
    const ind = computeUnweightedBlock(7, 3, 2, true);
    expectClose(ind.precisionInterval.low, 0.39677814746114537);
    expectClose(ind.recallInterval.high, 0.9367748928821533);
    expect(computeUnweightedBlock(7, 3, 2, false).precisionInterval).toEqual(clusteredInvalidInterval());
    const zeroSites = buildSitePresenceMatrix({
      goldAbsentSites: 0, unresolvedSites: 0, insufficientSites: 0, tpSites: 0, fnSites: 0,
      wrongValueOnPresentSites: 0, fpOnAbsentSites: 0, tnSites: 0, failedOnAbsentSites: 0,
    });
    expect([zeroSites.goldPresentSites, zeroSites.siteRecall, zeroSites.siteAbstentionSpecificity])
      .toEqual([0, null, null]);
    expect([zeroSites.siteRecallInterval.valid, zeroSites.siteAbstentionInterval.valid]).toEqual([false, false]);
    const nonEmpty = buildSitePresenceMatrix({
      goldAbsentSites: 4, unresolvedSites: 1, insufficientSites: 1, tpSites: 7, fnSites: 3,
      wrongValueOnPresentSites: 2, fpOnAbsentSites: 1, tnSites: 2, failedOnAbsentSites: 1,
    });
    expect(nonEmpty.goldPresentSites).toBe(10);
    expectClose(nonEmpty.siteRecall, 0.7);
    expectClose(nonEmpty.siteAbstentionSpecificity, 2 / 3);
    expectClose(nonEmpty.siteRecallInterval.low, 0.39677814746114537);
    expectClose(nonEmpty.siteRecallInterval.high, 0.8922087325936989);
    expectClose(nonEmpty.siteAbstentionInterval.low, 0.2076596008020477);
    expectClose(nonEmpty.siteAbstentionInterval.high, 0.9385080552796037);
    const v1 = new Set(["a", "b", "c"]), v2 = new Set(["a", "b"]), v3 = new Set(["d"]);
    expect(bestBroadSplit(null, [v1, v2])).toEqual({ tp: 0, fp: 0, fn: 2 });
    expect(bestBroadSplit(new Set(), [v1, v3])).toEqual({ tp: 0, fp: 0, fn: 1 });
    expect(bestBroadSplit(new Set(["a", "d"]), [v1, v3])).toEqual({ tp: 1, fp: 1, fn: 0 });
    expect(bestBroadSplit(new Set(["a", "x"]), [v1, v2])).toEqual({ tp: 1, fp: 1, fn: 1 });
  });

  it("resolves support floors, indexes/classifies candidate rows and normalizes sets", () => {
    expect(resolveSupportFloors(undefined)).toEqual({ precisionMinPredictions: 30, recallMinPositives: 30 });
    expect(resolveSupportFloors({ precisionMinPredictions: 0, recallMinPositives: 0 }))
      .toEqual({ precisionMinPredictions: 0, recallMinPositives: 0 });
    expect(resolveSupportFloors({ recallMinPositives: 1 }))
      .toEqual({ precisionMinPredictions: 30, recallMinPositives: 1 });
    expect(resolveSupportFloors({ precisionMinPredictions: 1 }))
      .toEqual({ precisionMinPredictions: 1, recallMinPositives: 30 });
    for (const bad of [null, [], new Date()]) refuse(() => resolveSupportFloors(bad as any), "NOT_OBJECT", Error);
    expect(resolveSupportFloors({})).toEqual({ precisionMinPredictions: 30, recallMinPositives: 30 });
    expect(resolveSupportFloors({ precisionMinPredictions: 12, recallMinPositives: 8 }))
      .toEqual({ precisionMinPredictions: 12, recallMinPositives: 8 });
    refuse(() => resolveSupportFloors({ precisionMinPredictions: null } as any), "BAD_COUNT", RangeError);
    refuse(() => resolveSupportFloors({ recallMinPositives: null } as any), "BAD_COUNT", RangeError);
    refuse(() => resolveSupportFloors({ precisionMinPredictions: -1 }), "BAD_COUNT", RangeError);
    refuse(() => resolveSupportFloors({ recallMinPositives: 1.5 }), "BAD_COUNT", RangeError);

    const nullProto = Object.assign(Object.create(null), { id: "g2", fields: Object.create(null) });
    const byId = indexCandidateRows([
      { type: "summary", ok: 2 },
      { id: "g1", error: "llm_error" },
      { id: "g1", error: null, fields: { city: "Toronto" } },
      nullProto,
    ]);
    expect(byId.size).toBe(2);
    expect(classifyCandidateRow(undefined)).toEqual({ ok: false, code: "missing" });
    expect(classifyCandidateRow({ id: "g1", error: "   " })).toEqual({ ok: false, code: "unknown_error" });
    expect(classifyCandidateRow({ id: "g1", fields: [] })).toEqual({ ok: false, code: "invalid_row" });
    expect(classifyCandidateRow({ id: "g1", fields: new Date() })).toEqual({ ok: false, code: "invalid_row" });
    expect(classifyCandidateRow(byId.get("g1"))).toEqual({ ok: true, fields: { city: "Toronto" } });
    expect(classifyCandidateRow(byId.get("g2"))).toEqual({ ok: true, fields: Object.create(null) });

    refuse(() => indexCandidateRows("bad" as any), "NOT_ARRAY", Error);
    for (const badRow of [null, [], new Date()]) refuse(() => indexCandidateRows([badRow as any]), "NOT_OBJECT", Error);
    for (const badId of [123, "", "   "]) refuse(() => indexCandidateRows([{ id: badId }]), "MISSING_ID", Error);

    const items = [{ value: "H2Y-1S1" }, { value: "X", reason: "unverified_quote" }, "  h2y 1s1 ", null];
    expect([...normalizeItemsToSet(items, true)]).toEqual(["H2Y 1S1"]);
    expect([...normalizeItemsToSet(items, false)]).toEqual(["H2Y 1S1", "x"]);
  });

  it("parses golden units (incl. split & insufficient checks) and extracts candidate fields", () => {
    expect([...toGoldSet("  h2y-1s1 ", 1, "g.f")]).toEqual(["H2Y 1S1"]);
    expect([...toGoldSet(null, 1, "g.f")]).toEqual([]);
    expect([...toGoldSet(undefined, 1, "g.f")]).toEqual([]);
    expect([...toGoldSet(null, 2, "g.f")]).toEqual([]);
    expect([...toGoldSet(undefined, 2, "g.f")]).toEqual([]);
    refuse(() => toGoldSet(["A"], 1, "g.f"), "BAD_GOLD_VALUE", Error);
    refuse(() => toGoldSet("A", 2, "g.f"), "NOT_ARRAY", Error);

    expect(parseGoldenUnit({ id: "u1", fields: { c: { verdict: "insufficient", value: null, n_answered: 0 } } },
      "c", 1)).toEqual({ id: "u1", unit: { kind: "insufficient" } });
    expect(parseGoldenUnit({ id: "u1", fields: { c: { verdict: "insufficient", n_answered: 0 } } },
      "c", 1)).toEqual({ id: "u1", unit: { kind: "insufficient" } });
    expect(parseGoldenUnit({ id: "u1", fields: { c: { verdict: "absent", n_answered: 2 } } },
      "c", 1)).toEqual({ id: "u1", unit: { kind: "absent" } });
    refuse(() => parseGoldenUnit(null, "c", 1), "NOT_OBJECT", Error);
    refuse(() => parseGoldenUnit({ id: "u1", fields: { c: { verdict: "insufficient", value: "X", n_answered: 1 } } },
      "c", 1), "INSUFFICIENT_NON_NULL", Error);
    refuse(() => parseGoldenUnit({
      id: "u1", fields: { c: { verdict: "split", value: "Toronto", runs: { r1: { value: "A" } } } },
    }, "c", 1), "SPLIT_NON_NULL", Error);
    const sp = parseGoldenUnit({
      id: "u2", fields: { c: { verdict: "split", n_answered: 3, runs: {
        r1: { status: "missing", value: "Stale" }, r2: { status: "failed", error: "e", value: "Err" },
        r3: { value: "Toronto" },
      } } },
    }, "c", 1);
    expect(sp.unit.kind).toBe("split");
    if (sp.unit.kind === "split") expect(sp.unit.variants.map((v) => [...v])).toEqual([["toronto"]]);

    expect(extractCandidateField(undefined, 1)).toEqual({ set: new Set(), nulled: 0 });
    expect(extractCandidateField(null, 1)).toEqual({ set: new Set(), nulled: 0 });
    expect(extractCandidateField(null, 2)).toEqual({ set: new Set(), nulled: 0 });
    expect(extractCandidateField({}, 1)).toEqual({ set: new Set(), nulled: 0 });
    expect(extractCandidateField({ value: "X", reason: "unverified_quote" }, 1)).toEqual({ set: new Set(), nulled: 1 });
    refuse(() => extractCandidateField({ value: ["X"] }, 1), "BAD_CANDIDATE_VALUE", Error);
    refuse(() => extractCandidateField({ value: ["X"], reason: "unverified_quote" }, 1),
      "BAD_CANDIDATE_VALUE", Error);
    const mv = extractCandidateField({
      values: [{ value: "A" }, { value: "B", reason: "unverified_quote" }], unverified_dropped: 2,
    }, 2);
    expect([[...mv.set], mv.nulled]).toEqual([["a"], 3]);
    const mvNoDrop = extractCandidateField({ values: [{ value: "A" }] }, 2);
    expect([[...mvNoDrop.set], mvNoDrop.nulled]).toEqual([["a"], 0]);
    expect(extractCandidateField({ unverified_dropped: 1 }, 2)).toEqual({ set: new Set(), nulled: 1 });
    refuse(() => extractCandidateField({ values: "A" }, 2), "NOT_ARRAY", Error);
    refuse(() => extractCandidateField({ values: null }, 2), "NOT_ARRAY", Error);
    refuse(() => extractCandidateField({ values: [], unverified_dropped: -1 }, 2), "BAD_COUNT", RangeError);
  });

  it("handles empty goldenRows and scores core single-value cases end to end", () => {
    const empty = scoreUnweightedScalar({
      field: "city", goldenRows: [], candidateRows: [{ id: "extra", fields: { city: val("Toronto") } }],
    });
    expect([empty.attempted, empty.accepted, empty.failed]).toEqual([0, 0, 0]);
    expect([empty.unweighted.precision, empty.unweighted.recall, empty.unweighted.f1]).toEqual([null, null, null]);
    expect([empty.abstentionSpecificity, empty.sitePresence.siteRecall,
      empty.sitePresence.siteAbstentionSpecificity]).toEqual([null, null, null]);
    expect([empty.unweighted.precisionInterval.valid, empty.sitePresence.siteRecallInterval.valid,
      empty.sitePresence.siteAbstentionInterval.valid]).toEqual([false, false, false]);
    expect(empty.indeterminate).toEqual({ precision: true, recall: true, f1: true });
    expect(empty.diagnostics.broad).toEqual({ tp: 0, fp: 0, fn: 0, precision: null, recall: null, f1: null });

    const smoke = scoreUnweightedScalar({
      field: "city",
      goldenRows: [
        gRow("u1", "city", { verdict: "unanimous", value: "Toronto", n_answered: 2 }),
        gRow("u2", "city", { verdict: "absent", value: null, n_answered: 2 }),
        gRow("u3", "city", { verdict: "insufficient", value: null, n_answered: 1 }),
      ],
      candidateRows: [
        { id: "u1", fields: { city: val("toronto") } }, { id: "u2", fields: { city: val(null) } },
        { id: "u3", fields: { city: val("Montreal") } },
      ],
    });
    expect([smoke.attempted, smoke.tp, smoke.fp, smoke.fn, smoke.tn, smoke.insufficient]).toEqual([3, 1, 0, 0, 1, 1]);
    expect([smoke.precision, smoke.recall, smoke.f1, smoke.abstentionSpecificity]).toEqual([1, 1, 1, 1]);
  });
});

describe("scoreUnweightedScalar — single-value scalar (maxValues = 1)", () => {
  it("scores normalizeValue, retries, failuresByCode sort, #509, split (missing/failed), wilson95 & broad", () => {
    const field = "postal_code";
    const goldenRows: GoldenScalarRow[] = [
      gRow("g1", field, { verdict: "unanimous", value: "H2Y 1S1", n_answered: 3 }),
      gRow("g2", field, { verdict: "majority", value: "M5X 1A9", n_answered: 3 }),
      gRow("g3", field, { verdict: "unanimous", value: "K1P 6L2", n_answered: 2 }),
      gRow("g4", field, { verdict: "majority", value: "B3J 3N4", n_answered: 3 }),
      gRow("g5", field, { verdict: "unanimous", value: "T2P 1N2", n_answered: 3 }),
      gRow("g6", field, { verdict: "absent", value: null, n_answered: 3 }),
      gRow("g7", field, { verdict: "majority", value: null, n_answered: 2 }),
      gRow("g8", field, { verdict: "absent", value: null, n_answered: 3 }),
      gRow("g9", field, { verdict: "absent", value: null, n_answered: 2 }),
      gRow("g15", field, { verdict: "absent", value: null, n_answered: 3 }),
      gRow("g10", field, { verdict: "insufficient", value: null, n_answered: 1 }),
      gRow("g11", field, { verdict: "insufficient", value: null, n_answered: 0 }),
      gRow("g12", field, {
        verdict: "split", value: null, n_answered: 3,
        runs: {
          r1: { value: "V6B 1A1", quote: "V6B 1A1" }, r2: { value: null, quote: null },
          r3: { status: "failed", error: "llm_error" }, r4: { status: "missing" },
        },
      }),
      gRow("g13", field, {
        verdict: "split", value: null, n_answered: 2,
        runs: { r1: { value: "H3B 2Y5", quote: "H3B 2Y5" }, r2: { value: "G1R 4P5", quote: "G1R 4P5" } },
      }),
      gRow("g14", field, {
        verdict: "split", value: null, n_answered: 2,
        runs: { r1: { value: "R3C 0V8", quote: "R3C 0V8" }, r2: { value: "S7K 1J5", quote: "S7K 1J5" } },
      }),
    ];
    const candidateRows: Record<string, unknown>[] = [
      { id: "g1", fields: { [field]: val("h2y-1s1") } },
      { id: "g2", error: "llm_error", fields: null },
      { id: "g2", fields: { [field]: val("m5x1a9") } },
      { id: "g3", fields: { [field]: { value: "K1P 6L2", quote: null, sha256: null, reason: "unverified_quote" } } },
      { id: "g4", fields: { [field]: val("E1C 1G2") } },
      { id: "g5", fields: { [field]: val("T2P 1N2") } },
      { id: "g5", error: "parse_error", fields: null },
      { id: "g6", fields: { [field]: val("   ") } },
      { id: "g7", fields: { [field]: val("A1A 1A1") } },
      { id: "g9", fields: [] },
      { id: "g15", error: "   ", fields: null },
      { id: "g10", fields: { [field]: val("N2L 3G1") } },
      { id: "g11", error: "empty_response", fields: null },
      { id: "g12", fields: { [field]: val("v6b1a1") } },
      { id: "g13", fields: { [field]: val(null) } },
      { id: "g14", fields: { [field]: val("L4Z 1X9") } },
      { id: "census_extra_1", fields: { [field]: val("J8X 3N5") } },
      { type: "summary", ok: 10, failed: 5 },
    ];
    const res = scoreUnweightedScalar({ field, maxValues: 1, goldenRows, candidateRows });
    expect([res.field, res.attempted, res.accepted, res.failed]).toEqual(["postal_code", 15, 10, 5]);
    expect(Object.keys(res.failuresByCode)).toEqual([
      "empty_response", "invalid_row", "missing", "parse_error", "unknown_error",
    ]);
    expect(res.failuresByCode).toEqual({
      empty_response: 1, invalid_row: 1, missing: 1, parse_error: 1, unknown_error: 1,
    });
    expect([res.unverifiedQuotesNulled, res.unverifiedWholeRecordsDropped]).toEqual([1, null]);
    expect([res.goldPositive, res.goldAbsent, res.unresolved, res.insufficient]).toEqual([5, 5, 3, 2]);
    expect([res.tp, res.fp, res.fpOnPresent, res.fpOnAbsent, res.fpElementsOnAbsent, res.fn, res.tn,
      res.failedOnAbsent]).toEqual([2, 2, 1, 1, 1, 3, 1, 3]);
    expectClose(res.abstentionSpecificity, 0.5);
    expectClose(res.unweighted.precision, 0.5);
    expectClose(res.unweighted.recall, 0.4);
    expectClose(res.unweighted.f1, 4 / 9);
    expect([res.precision, res.recall, res.f1]).toEqual([
      res.unweighted.precision, res.unweighted.recall, res.unweighted.f1,
    ]);
    expect(res.precisionInterval).toEqual(res.unweighted.precisionInterval);
    expect(res.recallInterval).toEqual(res.unweighted.recallInterval);
    // Wilson 2/4: d=1+z^2/4=1.9603647051735313, center=0.5, half=0.34996101084785053
    expectClose(res.unweighted.precisionInterval.low, 0.15003898915214947);
    expectClose(res.unweighted.precisionInterval.high, 0.8499610108478506);
    // Wilson 2/5: d=1+z^2/5=1.7682917641388252, center=0.44344824647831743, half=0.3258274722456696
    expectClose(res.unweighted.recallInterval.low, 0.11762077423264783);
    expectClose(res.unweighted.recallInterval.high, 0.769275718723987);
    expect(res.sitePresence).toEqual({
      goldPresentSites: 5, goldAbsentSites: 5, unresolvedSites: 3, insufficientSites: 2,
      tpSites: 2, fnSites: 3, wrongValueOnPresentSites: 1, fpOnAbsentSites: 1, tnSites: 1, failedOnAbsentSites: 3,
      siteRecall: 0.4,
      siteRecallInterval: {
        estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
        // Independent literal for Wilson 2/5: [0.11762077423264783, 0.769275718723987]
        low: expect.closeTo(0.11762077423264783, 12), high: expect.closeTo(0.769275718723987, 12),
      },
      siteAbstentionSpecificity: 0.5,
      siteAbstentionInterval: {
        estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site", valid: true,
        // Independent literal for Wilson 1/2: d=2.9207294103470627, center=0.5, half=0.40546879426576926
        low: expect.closeTo(0.09453120573423074, 12), high: expect.closeTo(0.9054687942657693, 12),
      },
    });
    expect(res.indeterminate).toEqual({ precision: true, recall: true, f1: true });
    expect([res.diagnostics.broad.tp, res.diagnostics.broad.fp, res.diagnostics.broad.fn]).toEqual([3, 3, 5]);
    expectClose(res.diagnostics.broad.precision, 0.5);
    expectClose(res.diagnostics.broad.recall, 3 / 8);
    expectClose(res.diagnostics.broad.f1, 6 / 14);
  });

  it("accepts null-prototype rows, omitted candidate field, and explicit null candidate field", () => {
    const nullGold = Object.assign(Object.create(null), {
      id: "n1",
      fields: Object.assign(Object.create(null), { city: { verdict: "unanimous", value: "Toronto", n_answered: 2 } }),
    });
    const nullCand = Object.assign(Object.create(null), {
      id: "n1", fields: Object.assign(Object.create(null), { city: val("Toronto") }),
    });
    const nullProtoRes = scoreUnweightedScalar({ field: "city", goldenRows: [nullGold], candidateRows: [nullCand] });
    expect([nullProtoRes.accepted, nullProtoRes.tp, nullProtoRes.fn]).toEqual([1, 1, 0]);

    const absentGold = [gRow("n2", "city", { verdict: "absent", value: null, n_answered: 2 })];
    const omittedRes = scoreUnweightedScalar({
      field: "city", goldenRows: absentGold, candidateRows: [{ id: "n2", fields: { other: val("Montreal") } }],
    });
    expect([omittedRes.accepted, omittedRes.tn, omittedRes.fp]).toEqual([1, 1, 0]);

    const nullFieldRes = scoreUnweightedScalar({
      field: "city", goldenRows: absentGold, candidateRows: [{ id: "n2", fields: { city: null } }],
    });
    expect([nullFieldRes.accepted, nullFieldRes.tn, nullFieldRes.fp]).toEqual([1, 1, 0]);
  });
});

describe("scoreUnweightedScalar — multi-value scalar (maxValues > 1)", () => {
  it("scores sets, inline unverified_quote, site fpOnAbsent vs fpElementsOnAbsent & literal clustered CIs", () => {
    const field = "aliases";
    const mv = (
      items: { value: unknown; quote?: string | null; reason?: string }[], unverified_dropped = 0,
    ) => ({
      values: items.map((x) => ({
        value: x.value, quote: x.reason ? null : (x.quote ?? String(x.value)),
        sha256: x.reason ? null : "b".repeat(64), ...(x.reason ? { reason: x.reason } : {}),
      })),
      unverified_dropped,
    });
    const goldenRows: GoldenScalarRow[] = [
      gRow("g1", field, { verdict: "unanimous", value: ["  Toronto ", "toronto", "Montre\u0301al", "   ", null],
        n_answered: 3 }),
      gRow("g1b", field, { verdict: "unanimous", value: ["Saskatoon", "Moncton"], n_answered: 3 }),
      gRow("g2", field, { verdict: "majority", value: ["Ottawa", "Halifax"], n_answered: 3 }),
      gRow("g3", field, { verdict: "unanimous", value: ["Vancouver"], n_answered: 2 }),
      gRow("g4", field, { verdict: "absent", value: null, n_answered: 3 }),
      gRow("g5", field, { verdict: "majority", value: null, n_answered: 2 }),
      gRow("g6", field, { verdict: "absent", value: null, n_answered: 3 }),
      gRow("g7", field, { verdict: "insufficient", value: null, n_answered: 1 }),
      gRow("g8", field, {
        verdict: "split", value: null, n_answered: 3,
        runs: { r1: { value: ["Winnipeg", "Regina"] }, r2: { value: ["Winnipeg"] }, r3: { value: null } },
      }),
    ];
    const candidateRows: Record<string, unknown>[] = [
      { id: "g1", fields: { [field]: mv(
        [{ value: "MONTRÉAL" }, { value: "montreal-extra" }, { value: "Toronto" }], 2,
      ) } },
      { id: "g1b", fields: { [field]: mv(
        [{ value: "saskatoon" }, { value: "Moncton", reason: "unverified_quote" }],
      ) } },
      { id: "g2", fields: { [field]: mv([{ value: "Calgary" }, { value: "calgary" }], 1) } },
      { id: "g3", error: "llm_error", fields: null },
      { id: "g4", fields: { [field]: mv([{ value: "A1" }, { value: "A2" }, { value: "A3" }], 0) } },
      { id: "g5", fields: { [field]: mv([], 0) } },
      { id: "g6", fields: { [field]: mv([], 1) } },
      { id: "g7", fields: { [field]: mv([{ value: "Ignored" }], 3) } },
      { id: "g8", fields: { [field]: mv([{ value: "winnipeg" }], 0) } },
    ];
    // maxValues=2 switches unweighted element intervals to clustered_record_invalid (elements within a site cluster).
    const res = scoreUnweightedScalar({
      field, maxValues: 2, goldenRows, candidateRows,
      supportFloors: { precisionMinPredictions: 5, recallMinPositives: 5 },
    });
    expect([res.attempted, res.accepted, res.failed, res.unverifiedQuotesNulled,
      res.unverifiedWholeRecordsDropped]).toEqual([9, 8, 1, 8, null]);
    expect([res.goldPositive, res.goldAbsent, res.unresolved, res.insufficient]).toEqual([7, 3, 1, 1]);
    expect([res.tp, res.fp, res.fpOnPresent, res.fpOnAbsent, res.fpElementsOnAbsent, res.fn, res.tn,
      res.failedOnAbsent]).toEqual([3, 5, 2, 1, 3, 4, 2, 0]);
    expectClose(res.abstentionSpecificity, 2 / 3);
    expectClose(res.unweighted.precision, 3 / 8);
    expectClose(res.unweighted.recall, 3 / 7);
    expectClose(res.unweighted.f1, 6 / 15);
    // Element metrics cluster multiple items per site: interval endpoints are null with method="none", valid=false.
    expect(res.unweighted.precisionInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    expect(res.unweighted.recallInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    expect(res.precisionInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    expect(res.recallInterval).toEqual({
      estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null,
    });
    expect([res.sitePresence.tpSites, res.sitePresence.fnSites, res.sitePresence.wrongValueOnPresentSites,
      res.sitePresence.goldPresentSites, res.sitePresence.goldAbsentSites, res.sitePresence.tnSites,
      res.sitePresence.fpOnAbsentSites]).toEqual([2, 2, 1, 4, 3, 2, 1]);
    expectClose(res.sitePresence.siteRecall, 0.5);
    // Site Wilson 2/4: d=1+z^2/4=1.9603647051735313, center=0.5, half=0.34996101084785053
    expectClose(res.sitePresence.siteRecallInterval.low, 0.15003898915214947);
    expectClose(res.sitePresence.siteRecallInterval.high, 0.8499610108478506);
    expectClose(res.sitePresence.siteAbstentionSpecificity, 2 / 3);
    // Site Wilson 2/3 (symmetric with 1/3): d=2.2804862735647085, center=0.5730838280408258, half=0.365424227238778
    expectClose(res.sitePresence.siteAbstentionInterval.low, 0.2076596008020477);
    expectClose(res.sitePresence.siteAbstentionInterval.high, 0.9385080552796037);
    expect(res.indeterminate).toEqual({ precision: false, recall: false, f1: false });
    expect([res.diagnostics.broad.tp, res.diagnostics.broad.fp, res.diagnostics.broad.fn]).toEqual([4, 5, 4]);
  });

  it("applies supportFloors at 30/29, independentGroupSupport, and multi-value broad split edge cases", () => {
    const field = "city";
    const mkGold = (n: number) => Array.from({ length: n }, (_, i) =>
      gRow(`g${i}`, field, { verdict: "unanimous", value: "Toronto", n_answered: 2 }));
    const mkCand = (n: number) => Array.from({ length: n }, (_, i) =>
      ({ id: `g${i}`, fields: { [field]: val("Toronto") } }));
    expect(scoreUnweightedScalar({ field, goldenRows: mkGold(30), candidateRows: mkCand(30) }).indeterminate)
      .toEqual({ precision: false, recall: false, f1: false });
    expect(scoreUnweightedScalar({ field, goldenRows: mkGold(29), candidateRows: mkCand(29) }).indeterminate)
      .toEqual({ precision: true, recall: true, f1: true });
    expect(scoreUnweightedScalar({
      field, goldenRows: mkGold(35), candidateRows: mkCand(35),
      independentGroupSupport: { predictions: 29, positives: 30 },
    }).indeterminate).toEqual({ precision: true, recall: false, f1: true });

    const splitGold: GoldenScalarRow[] = [gRow("s1", "tags", {
      verdict: "split", value: null, n_answered: 2, runs: { r1: { value: ["A", "B"] }, r2: { value: ["C"] } },
    })];
    const emptyRes = scoreUnweightedScalar({
      field: "tags", maxValues: 2, goldenRows: splitGold,
      candidateRows: [{ id: "s1", fields: { tags: { values: [], unverified_dropped: 0 } } }],
    });
    expect(emptyRes.diagnostics.broad).toEqual({ tp: 0, fp: 0, fn: 1, precision: null, recall: 0, f1: 0 });
    const wrongRes = scoreUnweightedScalar({
      field: "tags", maxValues: 2, goldenRows: splitGold,
      candidateRows: [{ id: "s1", fields: { tags: { values: [{ value: "Z" }], unverified_dropped: 0 } } }],
    });
    expect(wrongRes.diagnostics.broad).toEqual({ tp: 0, fp: 1, fn: 1, precision: 0, recall: 0, f1: 0 });
  });
});

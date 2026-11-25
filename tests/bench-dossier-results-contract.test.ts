import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION, COST_BASIS_KINDS, COST_UNKNOWN_REASONS,
  CURRENCY_CODES, EFFORT_LEVELS, ESTIMATOR_KINDS, INTERVAL_CLUSTERINGS, INTERVAL_METHODS,
  PARTITION_KINDS, SEAT_METHODS, SEAT_STATUSES, SEAT_UNKNOWN_REASONS, TARIFF_STATUSES,
  parseBenchResultsFile, readBenchResultsFile, type BenchInterval, type BenchResultsFile,
} from "../src/bench-dossier/results-contract.js";
import {
  arrayOf, BenchResultsValidationError, booleanValue, countInt, enumValue, fieldsOf, finiteNumber,
  literalValue, nonEmptyString, nonNegativeNumber, nullable, objectSchema, positiveNumber,
  requireString, stringMapOf, unitInterval, unknownOr, validateBenchInterval,
  validateClosedObject, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";

function refuse(fn: () => void, code: BenchResultsErrorCode, expectedPath: string): void {
  let caught: unknown;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(BenchResultsValidationError);
  const err = caught as BenchResultsValidationError;
  expect(err.name).toBe("BenchResultsValidationError");
  expect([err.code, err.path]).toEqual([code, expectedPath]);
}

describe("BenchResults guards", () => {
  it("validates closed objects, fieldsOf, and scalar numeric/string/boolean guards", () => {
    const schema = objectSchema<{ name: string; count: number; opt?: number }>(
      { ...fieldsOf(["name"], nonEmptyString), count: countInt },
      { opt: positiveNumber },
    );
    schema({ name: "arm-1", count: 0 }, "$");
    schema(Object.assign(Object.create(null), { name: "arm-2", count: 3, opt: 0.5 }), "$");
    for (const bad of [null, [], "x", 42, new Date()]) refuse(() => schema(bad, "$"), "NOT_OBJECT", "$");
    refuse(() => schema({ name: "arm-1", count: 0, extra: 1 }, "$"), "UNKNOWN_KEY", "$.extra");
    refuse(() => schema({ name: "arm-1" }, "$"), "MISSING_KEY", "$.count");
    refuse(() => validateClosedObject({ count: 0 }, "$", { toString: nonEmptyString, count: countInt }),
      "MISSING_KEY", "$.toString");
    refuse(() => schema({ name: 1, count: 0 }, "$"), "WRONG_TYPE", "$.name");
    refuse(() => schema({ name: "   ", count: 0 }, "$"), "EMPTY_STRING", "$.name");
    refuse(() => schema({ name: "ok", count: -1 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: 1.5 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: Number.MAX_SAFE_INTEGER + 1 }, "$"), "BAD_COUNT", "$.count");
    refuse(() => schema({ name: "ok", count: 0, opt: 0 }, "$"), "NON_POSITIVE", "$.opt");
    refuse(() => requireString(1, "$.s"), "WRONG_TYPE", "$.s");
    refuse(() => booleanValue("true", "$.b"), "WRONG_TYPE", "$.b");
    for (const badNum of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      refuse(() => finiteNumber(badNum, "$.f"), "NON_FINITE", "$.f");
    }
    nonNegativeNumber(0, "$.nn");
    refuse(() => nonNegativeNumber(-0.001, "$.nn"), "NEGATIVE", "$.nn");
    unitInterval(0, "$.u");
    unitInterval(1, "$.u");
    refuse(() => unitInterval(-0.001, "$.u"), "UNIT_RANGE", "$.u");
    refuse(() => unitInterval(1.001, "$.u"), "UNIT_RANGE", "$.u");
    const ioErr = new BenchResultsValidationError("IO_ERROR", "/missing.json", { errno: "ENOENT" });
    expect([ioErr.name, ioErr.code, ioErr.errno, ioErr.message]).toEqual([
      "BenchResultsValidationError", "IO_ERROR", "ENOENT", "IO_ERROR at /missing.json (ENOENT)",
    ]);
  });

  it("validates literal, enum, nullable, unknownOr, array, map and BenchInterval guards", () => {
    literalValue(1, "BAD_VERSION", finiteNumber)(1, "$.v");
    refuse(() => literalValue(1, "BAD_VERSION", finiteNumber)(2, "$.v"), "BAD_VERSION", "$.v");
    const cur = enumValue(["USD", "CAD"]);
    cur("USD", "$.c");
    refuse(() => cur(123, "$.c"), "WRONG_TYPE", "$.c");
    refuse(() => cur("EUR", "$.c"), "BAD_ENUM", "$.c");
    nullable(countInt)(null, "$.n");
    refuse(() => nullable(countInt)(undefined, "$.n"), "WRONG_TYPE", "$.n");
    unknownOr(countInt)("unknown", "$.u");
    refuse(() => unknownOr(countInt)(1.5, "$.u"), "BAD_COUNT", "$.u");
    arrayOf(nonEmptyString)(["a"], "$.a");
    refuse(() => arrayOf(nonEmptyString)("a", "$.a"), "NOT_ARRAY", "$.a");
    refuse(() => arrayOf(nonEmptyString)(["a", ""], "$.a"), "EMPTY_STRING", "$.a[1]");
    const sparse: string[] = []; sparse[1] = "a";
    refuse(() => arrayOf(nonEmptyString)(sparse, "$.a"), "WRONG_TYPE", "$.a[0]");
    refuse(() => stringMapOf(countInt)([], "$.m"), "NOT_OBJECT", "$.m");
    for (const k of ["", "  ", "__proto__", "constructor", "prototype"]) {
      const m: Record<string, number> = {};
      Object.defineProperty(m, k, { value: 1, enumerable: true, configurable: true });
      refuse(() => stringMapOf(countInt)(m, "$.m"), "BAD_MAP_KEY", `$.m.${k}`);
    }
    const base = { estimator: "unweighted", method: "wilson_95_unweighted",
      clustering: "independent_site", valid: true, low: 0.4, high: 0.8 };
    validateBenchInterval(base, "$.iv");
    validateBenchInterval({ ...base, method: "clopper_pearson_95_one_sided", high: null }, "$.iv");
    validateBenchInterval({ ...base, method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null }, "$.iv");
    refuse(() => validateBenchInterval({ ...base, low: -0.01 }, "$.iv"), "INTERVAL_RANGE", "$.iv.low");
    refuse(() => validateBenchInterval({ ...base, high: 1.01 }, "$.iv"), "INTERVAL_RANGE", "$.iv.high");
    refuse(() => validateBenchInterval({ ...base, low: 0.9 }, "$.iv"), "INTERVAL_ORDER", "$.iv");
    refuse(() => validateBenchInterval({ ...base, clustering: "clustered_record_invalid" }, "$.iv"),
      "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, method: "none" }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, low: null }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, high: null }, "$.iv"), "BAD_INTERVAL", "$.iv");
    refuse(() => validateBenchInterval({ ...base, valid: false }, "$.iv"), "BAD_INTERVAL", "$.iv");
  });
});

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

function makeValidEnvelope(): BenchResultsFile {
  return {
    schemaId: "urn:engram:bench-results:1.0.0", schemaVersion: 1,
    generatedAt: "2026-11-25T10:15:30Z", campaignId: "lotb-eval-2026",
    corpus: {
      partition: "eval", goldenLabel: "pass1", primaryEstimator: "weighted",
      costBasisLabel: "extracted_packet", currency: "CAD",
      goldenMissionSha256: "a".repeat(64), candidateMissionSha256: "b".repeat(64),
      fieldShapeVerified: true, maxValuesChanged: true, goldenSha256: "c".repeat(64),
      captureSuppliedIds: 1705, captureAttemptedIds: 1705, captureOkIds: 1689,
      goldenIds: 30, fields: ["office.city", "office.full_address"],
      fieldLabels: { "office.city": { en: "office municipality", fr: "municipalité du bureau" } },
      annotatorCount: 3, annotatorRunStats: { r1: { answered: 29, failed: 1, missing: 0 } },
      missingDigestRuns: ["r1"],
      krippendorffAlphaByField: { "office.city": 0.842105, "office.full_address": -0.125, extra: null },
    },
    supportFloors: { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
    records: [],
  };
}

describe("BenchResultsFile envelope and file reader", () => {
  it("reads valid files and separates IO_ERROR from BAD_JSON and schema errors", () => {
    expect([BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION]).toEqual([
      "urn:engram:bench-results:1.0.0", 1,
    ]);
    const valid = makeValidEnvelope();
    expect(parseBenchResultsFile(valid)).toEqual(valid);
    const dir = mkdtempSync(join(tmpdir(), "bd1a-"));
    try {
      const okPath = join(dir, "ok.json");
      writeFileSync(okPath, JSON.stringify(valid), "utf8");
      expect(readBenchResultsFile(okPath)).toEqual(valid);
      const missingPath = join(dir, "missing.json");
      refuse(() => readBenchResultsFile(missingPath), "IO_ERROR", missingPath);
      try { readBenchResultsFile(missingPath); } catch (e) {
        expect((e as BenchResultsValidationError).errno).toBe("ENOENT");
      }
      refuse(() => readBenchResultsFile(dir), "IO_ERROR", dir);
      const badJson = join(dir, "bad.json"), emptyObj = join(dir, "empty.json");
      writeFileSync(badJson, "{not-json", "utf8");
      writeFileSync(emptyObj, "{}", "utf8");
      refuse(() => readBenchResultsFile(badJson), "BAD_JSON", "$");
      refuse(() => readBenchResultsFile(emptyObj), "MISSING_KEY", "$.schemaId");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("refuses invalid envelope schemaId, schemaVersion, corpus and supportFloors", () => {
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "urn:engram:bench-results:2.0.0"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.schemaVersion = 2; }, "BAD_VERSION", "$.schemaVersion"],
      [(d) => { d.corpus.fieldShapeVerified = false; }, "BAD_SHAPE", "$.corpus.fieldShapeVerified"],
      [(d) => { d.corpus.partition = 123; }, "WRONG_TYPE", "$.corpus.partition"],
      [(d) => { d.corpus.goldenIds = 30.5; }, "BAD_COUNT", "$.corpus.goldenIds"],
      [(d) => { d.corpus.fieldLabels["office.city"].en = " "; }, "EMPTY_STRING", "$.corpus.fieldLabels.office.city.en"],
      [(d) => { d.corpus.annotatorRunStats.r1.answered = 1.5; }, "BAD_COUNT", "$.corpus.annotatorRunStats.r1.answered"],
      [(d) => { d.corpus.krippendorffAlphaByField["office.city"] = Number.NEGATIVE_INFINITY; }, "NON_FINITE",
        "$.corpus.krippendorffAlphaByField.office.city"],
      [(d) => { d.supportFloors.failureCeiling = 1.01; }, "UNIT_RANGE", "$.supportFloors.failureCeiling"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeValidEnvelope());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), code, path);
    }
  });
});

const Z95 = 1.959963984540054;
function wilson(k: number, n: number): BenchInterval {
  const p = k / n, z2 = Z95 * Z95, d = 1 + z2 / n, c = (p + z2 / (2 * n)) / d;
  const h = (Z95 * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / d;
  return {
    estimator: "unweighted", method: "wilson_95_unweighted", clustering: "independent_site",
    valid: true, low: Math.max(0, c - h), high: Math.min(1, c + h),
  };
}

function makePrimaryRecord(): BenchResultsFile["records"][number] {
  const wTwoThirds = wilson(20, 30), wHalf = wilson(9, 18);
  const wBoot = (low: number, high: number): BenchInterval => ({
    estimator: "weighted", method: "design_bootstrap_95", clustering: "group_resampled", valid: true, low, high,
  });
  return {
    armId: "arm-gpt-6-low", armMissionSha256: "d".repeat(64), missingDigestAllowed: false,
    provider: "OpenAI", model: "gpt-6-astra-low", modelLabel: "Astra low", proseName: "OpenAI Astra low",
    effort: "low", isCascade: false, isHighlighted: true, incomplete: false, field: "office.city",
    comparator: "lotb_ca_post_v1", isPrimaryComparator: true, attempted: 30, accepted: 28, failed: 2,
    failuresByCode: { llm_error: 2 }, unverifiedQuotesNulled: 3, unverifiedWholeRecordsDropped: 1,
    goldPositive: 30, goldAbsent: 12, tp: 20, fp: 10, fpOnPresent: 5, fpOnAbsent: 2, fpElementsOnAbsent: 5,
    fn: 10, tn: 9, failedOnAbsent: 1, unresolved: 2, insufficient: 3, abstentionSpecificity: 9 / 11,
    sitePresence: { goldPresentSites: 30, goldAbsentSites: 12, unresolvedSites: 2, insufficientSites: 3,
      tpSites: 20, fnSites: 10, wrongValueOnPresentSites: 4, fpOnAbsentSites: 2, tnSites: 9,
      failedOnAbsentSites: 1, siteRecall: 2 / 3, siteRecallInterval: wTwoThirds,
      siteAbstentionSpecificity: 9 / 11, siteAbstentionInterval: wHalf },
    unweighted: { precision: 2 / 3, recall: 2 / 3, f1: 2 / 3,
      precisionInterval: wTwoThirds, recallInterval: wTwoThirds },
    weighted: { scheme: "horvitz_thompson_s1_s2_v1", deff: 1.14, nEff: 26.315789, precision: 0.681,
      recall: 0.654, f1: 0.667227, precisionInterval: wBoot(0.51, 0.82), recallInterval: wBoot(0.49, 0.79),
      f1Interval: wBoot(0.52, 0.78) },
    precision: 0.681, recall: 0.654, f1: 0.667227,
    precisionInterval: wBoot(0.51, 0.82), recallInterval: wBoot(0.49, 0.79),
    independentGroupSupport: { predictions: 27, positives: 28 },
    indeterminate: { precision: true, recall: true, f1: true }, calls: 37, callsPerItem: 37 / 1705,
    tokens: { input: 12000, output: 1800, reasoning: 300, cached: "unknown", total: 14100 },
    cost: { currency: "CAD", costBasisItems: 1705, costUnknownReason: null, apiEquivalentTotal: 1.2345,
      apiEquivalentPerItem: 1.2345 / 1705, tariffStatus: "primary", tariffSource: "openai-pricing",
      tariffAsOf: "2026-11-01",
      fxApplied: { from: "USD", to: "CAD", rate: 1.385, source: "boc-daily", asOf: "2026-11-22" },
      seatStatus: "measured", seatMethod: "weekly_burn_delta", seatUnknownReason: null,
      seatSharePerItem: 0.003, seatCostPerItem: 0.087, seatPlan: "Pro", seatMonthlyPrice: 280,
      seatLimitScale: 1.5, seatPlanSource: "manual", seatPlanAsOf: "2026-11-20" },
    diagnostics: { broad: { tp: 21, fp: 9, fn: 9, precision: 21 / 30, recall: 21 / 30, f1: 21 / 30 },
      conditionalRetainedRecall: 0.71 },
  };
}

describe("BenchResultRecord schema validation", () => {
  it("accepts non-degenerate record and enforces deff, clustered interval and sub-block bounds", () => {
    const file = { ...makeValidEnvelope(), records: [makePrimaryRecord()] };
    expect(parseBenchResultsFile(file)).toEqual(file);
    const bad: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.records[0].precisionInterval.clustering = "clustered_record_invalid"; },
        "BAD_INTERVAL", "$.records[0].precisionInterval"],
      [(d) => { d.records[0].weighted.deff = 0; }, "NON_POSITIVE", "$.records[0].weighted.deff"],
      [(d) => { d.records[0].cost.seatMonthlyPrice = -10; }, "NEGATIVE", "$.records[0].cost.seatMonthlyPrice"],
      [(d) => { d.records[0].diagnostics.broad.precision = 1.01; },
        "UNIT_RANGE", "$.records[0].diagnostics.broad.precision"],
    ];
    for (const [mutate, code, path] of bad) {
      const doc = clone(file);
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), code, path);
    }
  });
});

function makeCascadeRecord(): BenchResultsFile["records"][number] {
  const invalidIv: BenchInterval = {
    estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
    valid: false, low: null, high: null,
  };
  return {
    armId: "arm-cascade", armMissionSha256: "e".repeat(64), missingDigestAllowed: true,
    provider: "Cascades", model: "cascade-v1", modelLabel: "Cascade", proseName: "Cascade one",
    effort: "cascade", isCascade: true, isHighlighted: false, incomplete: true,
    field: "office.full_address", comparator: "generic", isPrimaryComparator: false,
    attempted: 30, accepted: 18, failed: 12, failuresByCode: {}, unverifiedQuotesNulled: 0,
    unverifiedWholeRecordsDropped: null, goldPositive: 18, goldAbsent: 6, tp: 9, fp: 9,
    fpOnPresent: 6, fpOnAbsent: 3, fpElementsOnAbsent: 3, fn: 9, tn: 3, failedOnAbsent: 0,
    unresolved: 1, insufficient: 2, abstentionSpecificity: null,
    sitePresence: { goldPresentSites: 18, goldAbsentSites: 6, unresolvedSites: 1, insufficientSites: 2,
      tpSites: 9, fnSites: 9, wrongValueOnPresentSites: 5, fpOnAbsentSites: 3, tnSites: 3,
      failedOnAbsentSites: 0, siteRecall: 0.5, siteRecallInterval: {
        estimator: "unweighted", method: "clopper_pearson_95_one_sided",
        clustering: "independent_site", valid: true, low: 0.31, high: null,
      }, siteAbstentionSpecificity: null, siteAbstentionInterval: invalidIv },
    unweighted: { precision: 0.5, recall: 0.5, f1: 0.5,
      precisionInterval: invalidIv, recallInterval: invalidIv },
    weighted: null, precision: null, recall: null, f1: null,
    precisionInterval: invalidIv, recallInterval: invalidIv,
    indeterminate: { precision: false, recall: false, f1: false },
    calls: "unknown", callsPerItem: "unknown", tokens: "unknown",
    cost: { currency: "CAD", costBasisItems: 1705, costUnknownReason: "incomplete-invocation-summary",
      apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown", tariffStatus: "unknown",
      tariffSource: null, tariffAsOf: null, fxApplied: null, seatStatus: "unknown",
      seatMethod: "unknown", seatUnknownReason: "shared-seat-concurrent",
      seatSharePerItem: "unknown", seatCostPerItem: "unknown", seatPlan: null,
      seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null },
  };
}

function makeValidFile(): BenchResultsFile {
  return { ...makeValidEnvelope(), records: [makePrimaryRecord(), makeCascadeRecord()] };
}

describe("BenchResultsFile cascade, single-field variations and enum coverage", () => {
  it("accepts cascade unknown-cost records and single-field optional or boundary variations", () => {
    expect(parseBenchResultsFile(makeValidFile()).records).toHaveLength(2);
    const optCorpus = ["goldenLabel", "maxValuesChanged", "captureSuppliedIds", "captureAttemptedIds",
      "captureOkIds", "fieldLabels", "annotatorRunStats", "missingDigestRuns"] as const;
    for (const k of optCorpus) {
      const doc = clone(makeValidFile()) as any;
      delete doc.corpus[k];
      expect(parseBenchResultsFile(doc).corpus[k]).toBeUndefined();
    }
    const singleVariations: ((d: any) => void)[] = [
      (d) => { delete d.records[0].weighted.f1Interval; },
      (d) => { delete d.records[0].independentGroupSupport; },
      (d) => { delete d.records[0].diagnostics; },
      (d) => { delete d.records[0].diagnostics.broad; },
      (d) => { delete d.records[0].diagnostics.conditionalRetainedRecall; },
      (d) => { d.supportFloors = Object.assign(Object.create(null), d.supportFloors); },
      (d) => { d.supportFloors.failureCeiling = 0; },
      (d) => { d.records[0].sitePresence.siteRecall = 1; },
      (d) => { d.records[0].calls = 0; },
      (d) => { d.records[0].callsPerItem = 0; },
      (d) => { d.records[0].tokens.cached = 123; },
      (d) => { d.records[0].cost.apiEquivalentTotal = 0; },
      (d) => { d.records[0].weighted.deff = null; },
      (d) => { d.records[0].weighted.nEff = null; },
      (d) => { d.records[0].weighted.f1 = null; },
      (d) => { d.records[0].unweighted.precisionInterval = { estimator: "unweighted",
        method: "wilson_95_unweighted", clustering: "independent_site", valid: true, low: 0, high: 1 }; },
      (d) => { d.records[0].weighted.precisionInterval = { estimator: "weighted",
        method: "design_bootstrap_95", clustering: "group_resampled", valid: true, low: 0.5, high: 0.5 }; },
    ];
    for (const mutate of singleVariations) {
      const doc = clone(makeValidFile());
      mutate(doc);
      expect(parseBenchResultsFile(doc).schemaVersion).toBe(1);
    }
  });

  it("exercises every valid enum literal one field at a time (N34-N39)", () => {
    const check = (mutate: (d: any) => void) => {
      const doc = clone(makeValidFile());
      mutate(doc);
      expect(parseBenchResultsFile(doc).schemaId).toBe(BENCH_RESULTS_SCHEMA_ID);
    };
    for (const v of PARTITION_KINDS) check((d) => { d.corpus.partition = v; });
    for (const v of ESTIMATOR_KINDS) check((d) => { d.corpus.primaryEstimator = v; });
    for (const v of COST_BASIS_KINDS) check((d) => { d.corpus.costBasisLabel = v; });
    for (const v of CURRENCY_CODES) {
      check((d) => { d.corpus.currency = v; });
      check((d) => { d.records[0].cost.currency = v; });
      check((d) => { d.records[0].cost.fxApplied.from = v; });
      check((d) => { d.records[0].cost.fxApplied.to = v; });
    }
    for (const v of EFFORT_LEVELS) check((d) => { d.records[0].effort = v; });
    for (const v of [...COST_UNKNOWN_REASONS, null]) check((d) => { d.records[0].cost.costUnknownReason = v; });
    for (const v of TARIFF_STATUSES) check((d) => { d.records[0].cost.tariffStatus = v; });
    for (const v of SEAT_STATUSES) check((d) => { d.records[0].cost.seatStatus = v; });
    for (const v of SEAT_METHODS) check((d) => { d.records[0].cost.seatMethod = v; });
    for (const v of [...SEAT_UNKNOWN_REASONS, null]) check((d) => { d.records[0].cost.seatUnknownReason = v; });
    for (const v of INTERVAL_METHODS) {
      check((d) => {
        d.records[0].precisionInterval = v === "none"
          ? { estimator: "weighted", method: "none", clustering: "group_resampled",
            valid: false, low: null, high: null }
          : { estimator: "weighted", method: v, clustering: "group_resampled",
            valid: true, low: 0.4, high: v === "clopper_pearson_95_one_sided" ? null : 0.8 };
      });
    }
    for (const v of INTERVAL_CLUSTERINGS) {
      check((d) => {
        d.records[0].precisionInterval = v === "clustered_record_invalid"
          ? { estimator: "weighted", method: "none", clustering: v, valid: false, low: null, high: null }
          : { estimator: "weighted", method: "design_bootstrap_95", clustering: v, valid: true, low: 0.4, high: 0.8 };
      });
    }
  });
});

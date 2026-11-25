import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION, parseBenchResultsFile,
  readBenchResultsFile, type BenchInterval, type BenchResultsFile,
} from "../src/bench-dossier/results-contract.js";
import {
  arrayOf, BenchResultsValidationError, booleanValue, countInt, enumValue, fieldsOf, finiteNumber,
  literalValue, nonEmptyString, nonNegativeNumber, nullable, objectSchema, positiveNumber,
  requireString, stringMapOf, unitInterval, unknownOr, validateBenchInterval,
  validateClosedObject, type BenchResultsErrorCode,
} from "../src/bench-dossier/results-guards.js";

function refuse(fn: () => void, code: BenchResultsErrorCode, expectedPath: string): BenchResultsValidationError {
  let caught: unknown;
  try { fn(); } catch (err) { caught = err; }
  expect(caught).toBeInstanceOf(BenchResultsValidationError);
  const err = caught as BenchResultsValidationError;
  expect(err.name).toBe("BenchResultsValidationError");
  expect([err.code, err.path]).toEqual([code, expectedPath]);
  return err;
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
    const cause = new SyntaxError("bad");
    const plainErr = new BenchResultsValidationError("BAD_JSON", "$", { cause });
    expect([plainErr.errno, plainErr.cause, plainErr.message]).toEqual([undefined, cause, "BAD_JSON at $"]);
    const bareErr = new BenchResultsValidationError("BAD_COUNT", "$.tp");
    expect([bareErr.errno, bareErr.cause, bareErr.message]).toEqual([undefined, undefined, "BAD_COUNT at $.tp"]);
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
      const missingErr = refuse(() => readBenchResultsFile(missingPath), "IO_ERROR", missingPath);
      expect([missingErr.errno, missingErr.cause instanceof Error,
        (missingErr.cause as NodeJS.ErrnoException).code]).toEqual(["ENOENT", true, "ENOENT"]);
      const dirErr = refuse(() => readBenchResultsFile(dir), "IO_ERROR", dir);
      expect([dirErr.errno, dirErr.cause instanceof Error,
        (dirErr.cause as NodeJS.ErrnoException).code]).toEqual(["EISDIR", true, "EISDIR"]);
      const badJson = join(dir, "bad.json"), emptyObj = join(dir, "empty.json");
      writeFileSync(badJson, "{not-json", "utf8");
      writeFileSync(emptyObj, "{}", "utf8");
      const jsonErr = refuse(() => readBenchResultsFile(badJson), "BAD_JSON", "$");
      expect([jsonErr.errno, jsonErr.cause instanceof SyntaxError]).toEqual([undefined, true]);
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
      expect(parseBenchResultsFile(doc).schemaId).toBe("urn:engram:bench-results:1.0.0");
    };
    for (const v of ["pilot", "eval", "sealed", "blind", "full"]) check((d) => { d.corpus.partition = v; });
    for (const v of ["unweighted", "weighted"]) check((d) => { d.corpus.primaryEstimator = v; });
    for (const v of ["extracted_packet", "attempted_id", "supplied_id"]) {
      check((d) => { d.corpus.costBasisLabel = v; });
    }
    for (const v of ["USD", "CAD"]) {
      check((d) => { d.corpus.currency = v; });
      check((d) => { d.records[0].cost.currency = v; });
      check((d) => { d.records[0].cost.fxApplied.from = v; });
      check((d) => { d.records[0].cost.fxApplied.to = v; });
    }
    for (const v of ["off", "minimal", "low", "medium", "high", "xhigh", "max", "cascade"]) {
      check((d) => { d.records[0].effort = v; });
    }
    for (const v of [
      "unpriced-mission", "reasoning-rate-missing", "incomplete-invocation-summary", "missing-usage", null,
    ]) check((d) => { d.records[0].cost.costUnknownReason = v; });
    for (const v of ["primary", "secondary_unverified", "unknown"]) {
      check((d) => { d.records[0].cost.tariffStatus = v; });
    }
    for (const v of ["measured", "estimated", "unknown"]) check((d) => { d.records[0].cost.seatStatus = v; });
    for (const v of ["weekly_burn_delta", "api_cost_proportional", "unknown"]) {
      check((d) => { d.records[0].cost.seatMethod = v; });
    }
    for (const v of [
      "missing-observation", "weekly-window-source-gap", "non-weekly-window", "shared-seat-concurrent",
      "no-quota-delta", "plan-source-gap", "transport-mismatch", "missing-usage", "api-equivalent-source-gap", null,
    ]) check((d) => { d.records[0].cost.seatUnknownReason = v; });
    for (const v of ["wilson_95_unweighted", "design_bootstrap_95", "clopper_pearson_95_one_sided", "none"] as const) {
      check((d) => {
        d.records[0].precisionInterval = v === "none"
          ? { estimator: "weighted", method: "none", clustering: "group_resampled",
            valid: false, low: null, high: null }
          : { estimator: "weighted", method: v, clustering: "group_resampled",
            valid: true, low: 0.4, high: v === "clopper_pearson_95_one_sided" ? null : 0.8 };
      });
    }
    for (const v of ["independent_site", "clustered_record_invalid", "group_resampled"] as const) {
      check((d) => {
        d.records[0].precisionInterval = v === "clustered_record_invalid"
          ? { estimator: "weighted", method: "none", clustering: v, valid: false, low: null, high: null }
          : { estimator: "weighted", method: "design_bootstrap_95", clustering: v, valid: true, low: 0.4, high: 0.8 };
      });
    }
  });
});

describe("BenchResultsFile closed keys, map keys and required fields", () => {
  it("refuses unknown keys at all 25 closed object levels and unsafe or non-plain map containers (N03)", () => {
    const targets: [(d: any) => void, string][] = [
      [(d) => { d.extra = 1; }, "$.extra"],
      [(d) => { d.corpus.extra = 1; }, "$.corpus.extra"],
      [(d) => { d.corpus.fieldLabels["office.city"].de = "x"; }, "$.corpus.fieldLabels.office.city.de"],
      [(d) => { d.corpus.annotatorRunStats.r1.extra = 0; }, "$.corpus.annotatorRunStats.r1.extra"],
      [(d) => { d.supportFloors.extra = 1; }, "$.supportFloors.extra"],
      [(d) => { d.records[0].extra = 1; }, "$.records[0].extra"],
      [(d) => { d.records[0].sitePresence.extra = 1; }, "$.records[0].sitePresence.extra"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.extra = 1; },
        "$.records[0].sitePresence.siteRecallInterval.extra"],
      [(d) => { d.records[0].sitePresence.siteAbstentionInterval.extra = 1; },
        "$.records[0].sitePresence.siteAbstentionInterval.extra"],
      [(d) => { d.records[0].unweighted.f1Interval = null; }, "$.records[0].unweighted.f1Interval"],
      [(d) => { d.records[0].unweighted.precisionInterval.extra = 1; },
        "$.records[0].unweighted.precisionInterval.extra"],
      [(d) => { d.records[0].unweighted.recallInterval.extra = 1; },
        "$.records[0].unweighted.recallInterval.extra"],
      [(d) => { d.records[0].weighted.extra = 1; }, "$.records[0].weighted.extra"],
      [(d) => { d.records[0].weighted.precisionInterval.extra = 1; },
        "$.records[0].weighted.precisionInterval.extra"],
      [(d) => { d.records[0].weighted.recallInterval.extra = 1; },
        "$.records[0].weighted.recallInterval.extra"],
      [(d) => { d.records[0].weighted.f1Interval.extra = 1; }, "$.records[0].weighted.f1Interval.extra"],
      [(d) => { d.records[0].precisionInterval.extra = 1; }, "$.records[0].precisionInterval.extra"],
      [(d) => { d.records[0].recallInterval.extra = 1; }, "$.records[0].recallInterval.extra"],
      [(d) => { d.records[0].independentGroupSupport.extra = 1; }, "$.records[0].independentGroupSupport.extra"],
      [(d) => { d.records[0].indeterminate.extra = false; }, "$.records[0].indeterminate.extra"],
      [(d) => { d.records[0].tokens.extra = 0; }, "$.records[0].tokens.extra"],
      [(d) => { d.records[0].cost.cacheRead = 0; }, "$.records[0].cost.cacheRead"],
      [(d) => { d.records[0].cost.fxApplied.extra = "x"; }, "$.records[0].cost.fxApplied.extra"],
      [(d) => { d.records[0].diagnostics.extra = 1; }, "$.records[0].diagnostics.extra"],
      [(d) => { d.records[0].diagnostics.broad.extra = 1; }, "$.records[0].diagnostics.broad.extra"],
    ];
    for (const [mutate, path] of targets) {
      const doc = clone(makeValidFile());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), "UNKNOWN_KEY", path);
    }
    const protoRoot = JSON.parse(JSON.stringify(makeValidFile()).replace("{", "{\"__proto__\":1,"));
    refuse(() => parseBenchResultsFile(protoRoot), "UNKNOWN_KEY", "$.__proto__");

    const mapMutators: [(d: any, v: any) => void, string][] = [
      [(d, v) => { d.records[0].failuresByCode = v; }, "$.records[0].failuresByCode"],
      [(d, v) => { d.corpus.fieldLabels = v; }, "$.corpus.fieldLabels"],
      [(d, v) => { d.corpus.annotatorRunStats = v; }, "$.corpus.annotatorRunStats"],
      [(d, v) => { d.corpus.krippendorffAlphaByField = v; }, "$.corpus.krippendorffAlphaByField"],
    ];
    for (const [setMap, mapPath] of mapMutators) {
      for (const badContainer of [[], null, new Date()]) {
        const doc = clone(makeValidFile());
        setMap(doc, badContainer);
        refuse(() => parseBenchResultsFile(doc), "NOT_OBJECT", mapPath);
      }
      for (const badKey of ["", "   ", "__proto__", "constructor", "prototype"]) {
        const doc = clone(makeValidFile());
        const m: Record<string, unknown> = {};
        Object.defineProperty(m, badKey, { value: 1, enumerable: true, configurable: true });
        setMap(doc, m);
        refuse(() => parseBenchResultsFile(doc), "BAD_MAP_KEY", `${mapPath}.${badKey}`);
      }
    }
  });

  it("refuses missing required fields across all object levels", () => {
    const missing: [(d: any) => void, string][] = [
      [(d) => delete d.schemaId, "$.schemaId"],
      [(d) => delete d.schemaVersion, "$.schemaVersion"],
      [(d) => delete d.generatedAt, "$.generatedAt"],
      [(d) => delete d.campaignId, "$.campaignId"],
      [(d) => delete d.corpus, "$.corpus"],
      [(d) => delete d.supportFloors, "$.supportFloors"],
      [(d) => delete d.records, "$.records"],
      [(d) => delete d.corpus.goldenMissionSha256, "$.corpus.goldenMissionSha256"],
      [(d) => delete d.corpus.candidateMissionSha256, "$.corpus.candidateMissionSha256"],
      [(d) => delete d.corpus.costBasisLabel, "$.corpus.costBasisLabel"],
      [(d) => delete d.corpus.fieldShapeVerified, "$.corpus.fieldShapeVerified"],
      [(d) => delete d.corpus.fieldLabels["office.city"].fr, "$.corpus.fieldLabels.office.city.fr"],
      [(d) => delete d.corpus.annotatorRunStats.r1.missing, "$.corpus.annotatorRunStats.r1.missing"],
      [(d) => delete d.supportFloors.failureCeiling, "$.supportFloors.failureCeiling"],
      [(d) => delete d.records[0].insufficient, "$.records[0].insufficient"],
      [(d) => delete d.records[0].fpElementsOnAbsent, "$.records[0].fpElementsOnAbsent"],
      [(d) => delete d.records[0].sitePresence.insufficientSites, "$.records[0].sitePresence.insufficientSites"],
      [(d) => delete d.records[0].sitePresence.siteRecallInterval.low,
        "$.records[0].sitePresence.siteRecallInterval.low"],
      [(d) => delete d.records[0].unweighted.recallInterval, "$.records[0].unweighted.recallInterval"],
      [(d) => delete d.records[0].weighted.scheme, "$.records[0].weighted.scheme"],
      [(d) => delete d.records[0].independentGroupSupport.positives, "$.records[0].independentGroupSupport.positives"],
      [(d) => delete d.records[0].indeterminate.f1, "$.records[0].indeterminate.f1"],
      [(d) => delete d.records[0].tokens.cached, "$.records[0].tokens.cached"],
      [(d) => delete d.records[0].cost.costBasisItems, "$.records[0].cost.costBasisItems"],
      [(d) => delete d.records[0].cost.fxApplied.rate, "$.records[0].cost.fxApplied.rate"],
      [(d) => delete d.records[0].diagnostics.broad.tp, "$.records[0].diagnostics.broad.tp"],
    ];
    for (const [mutate, path] of missing) {
      const doc = clone(makeValidFile());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), "MISSING_KEY", path);
    }
  });
});

describe("BenchResultsFile negative helper, sub-block and interval matrices", () => {
  it("refuses wrong container, type, string, undefined nullable (N12) and enum (N01, N30-N31) inputs", () => {
    for (const bad of [null, [], "x", 42, new Date()]) refuse(() => parseBenchResultsFile(bad), "NOT_OBJECT", "$");
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = 1; }, "WRONG_TYPE", "$.schemaId"],
      [(d) => { d.schemaVersion = "1"; }, "WRONG_TYPE", "$.schemaVersion"],
      [(d) => { d.corpus.fieldShapeVerified = "true"; }, "WRONG_TYPE", "$.corpus.fieldShapeVerified"],
      [(d) => { d.corpus = []; }, "NOT_OBJECT", "$.corpus"],
      [(d) => { d.records[0].diagnostics = []; }, "NOT_OBJECT", "$.records[0].diagnostics"],
      [(d) => { d.records = {}; }, "NOT_ARRAY", "$.records"],
      [(d) => { d.corpus.fields = "office.city"; }, "NOT_ARRAY", "$.corpus.fields"],
      [(d) => { d.corpus.fields = ["office.city", ""]; }, "EMPTY_STRING", "$.corpus.fields[1]"],
      [(d) => { d.records[0].tokens = "bogus"; }, "NOT_OBJECT", "$.records[0].tokens"],
      [(d) => { d.records[0].isCascade = "no"; }, "WRONG_TYPE", "$.records[0].isCascade"],
      [(d) => { d.campaignId = "   "; }, "EMPTY_STRING", "$.campaignId"],
      [(d) => { d.corpus.fieldLabels["office.city"].en = "  "; }, "EMPTY_STRING",
        "$.corpus.fieldLabels.office.city.en"],
      [(d) => { d.corpus.fieldLabels["office.city"].fr = ""; }, "EMPTY_STRING",
        "$.corpus.fieldLabels.office.city.fr"],
      [(d) => { d.corpus.goldenLabel = undefined; }, "WRONG_TYPE", "$.corpus.goldenLabel"],
      [(d) => { d.records[0].precision = undefined; }, "WRONG_TYPE", "$.records[0].precision"],
      [(d) => { d.records[0].weighted = undefined; }, "NOT_OBJECT", "$.records[0].weighted"],
      [(d) => { d.records[0].diagnostics.conditionalRetainedRecall = undefined; }, "WRONG_TYPE",
        "$.records[0].diagnostics.conditionalRetainedRecall"],
      [(d) => { d.corpus.partition = 123; }, "WRONG_TYPE", "$.corpus.partition"],
      [(d) => { d.records[0].effort = 1; }, "WRONG_TYPE", "$.records[0].effort"],
      [(d) => { d.records[0].cost.currency = true; }, "WRONG_TYPE", "$.records[0].cost.currency"],
      [(d) => { d.corpus.partition = "train"; }, "BAD_ENUM", "$.corpus.partition"],
      [(d) => { d.corpus.primaryEstimator = "bayes"; }, "BAD_ENUM", "$.corpus.primaryEstimator"],
      [(d) => { d.corpus.costBasisLabel = "raw_id"; }, "BAD_ENUM", "$.corpus.costBasisLabel"],
      [(d) => { d.corpus.currency = "EUR"; }, "BAD_ENUM", "$.corpus.currency"],
      [(d) => { d.records[0].effort = "ultra"; }, "BAD_ENUM", "$.records[0].effort"],
      [(d) => { d.records[0].precisionInterval.method = "bootstrap"; }, "BAD_ENUM",
        "$.records[0].precisionInterval.method"],
      [(d) => { d.records[0].precisionInterval.clustering = "none"; }, "BAD_ENUM",
        "$.records[0].precisionInterval.clustering"],
      [(d) => { d.records[0].cost.currency = "EUR"; }, "BAD_ENUM", "$.records[0].cost.currency"],
      [(d) => { d.records[0].cost.fxApplied.from = "GBP"; }, "BAD_ENUM", "$.records[0].cost.fxApplied.from"],
      [(d) => { d.records[0].cost.fxApplied.to = "JPY"; }, "BAD_ENUM", "$.records[0].cost.fxApplied.to"],
      [(d) => { d.records[0].cost.costUnknownReason = "other"; }, "BAD_ENUM",
        "$.records[0].cost.costUnknownReason"],
      [(d) => { d.records[0].cost.tariffStatus = "verified"; }, "BAD_ENUM", "$.records[0].cost.tariffStatus"],
      [(d) => { d.records[0].cost.seatStatus = "approx"; }, "BAD_ENUM", "$.records[0].cost.seatStatus"],
      [(d) => { d.records[0].cost.seatMethod = "guess"; }, "BAD_ENUM", "$.records[0].cost.seatMethod"],
      [(d) => { d.records[0].cost.seatUnknownReason = "busy"; }, "BAD_ENUM",
        "$.records[0].cost.seatUnknownReason"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeValidFile());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), code, path);
    }
  });

  it("refuses nested sub-block numeric bounds (N10, N20-N21, N24-N29, N40-N45) and interval defects", () => {
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.records[0].precision = Number.NaN; }, "NON_FINITE", "$.records[0].precision"],
      [(d) => { d.corpus.krippendorffAlphaByField["office.city"] = Number.POSITIVE_INFINITY; },
        "NON_FINITE", "$.corpus.krippendorffAlphaByField.office.city"],
      [(d) => { d.corpus.krippendorffAlphaByField["office.city"] = Number.NEGATIVE_INFINITY; },
        "NON_FINITE", "$.corpus.krippendorffAlphaByField.office.city"],
      [(d) => { d.records[0].tp = -1; }, "BAD_COUNT", "$.records[0].tp"],
      [(d) => { d.records[0].tp = Number.MAX_SAFE_INTEGER + 1; }, "BAD_COUNT", "$.records[0].tp"],
      [(d) => { d.records[0].insufficient = 1.5; }, "BAD_COUNT", "$.records[0].insufficient"],
      [(d) => { d.records[0].fpElementsOnAbsent = -2; }, "BAD_COUNT", "$.records[0].fpElementsOnAbsent"],
      [(d) => { d.records[0].calls = 2.5; }, "BAD_COUNT", "$.records[0].calls"],
      [(d) => { d.corpus.goldenIds = 30.5; }, "BAD_COUNT", "$.corpus.goldenIds"],
      [(d) => { d.corpus.annotatorCount = 2.5; }, "BAD_COUNT", "$.corpus.annotatorCount"],
      [(d) => { d.corpus.captureOkIds = 1.5; }, "BAD_COUNT", "$.corpus.captureOkIds"],
      [(d) => { d.records[0].unverifiedWholeRecordsDropped = 1.5; }, "BAD_COUNT",
        "$.records[0].unverifiedWholeRecordsDropped"],
      [(d) => { d.records[0].cost.costBasisItems = 1.5; }, "BAD_COUNT", "$.records[0].cost.costBasisItems"],
      [(d) => { d.records[0].failuresByCode.llm_error = 1.5; }, "BAD_COUNT", "$.records[0].failuresByCode.llm_error"],
      [(d) => { d.corpus.annotatorRunStats.r1.answered = 28.5; }, "BAD_COUNT",
        "$.corpus.annotatorRunStats.r1.answered"],
      [(d) => { d.records[0].tokens.cached = 12.5; }, "BAD_COUNT", "$.records[0].tokens.cached"],
      [(d) => { d.records[0].tokens.input = -1; }, "BAD_COUNT", "$.records[0].tokens.input"],
      [(d) => { d.records[0].independentGroupSupport.predictions = 27.5; }, "BAD_COUNT",
        "$.records[0].independentGroupSupport.predictions"],
      [(d) => { d.records[0].diagnostics.broad.tp = 1.5; }, "BAD_COUNT", "$.records[0].diagnostics.broad.tp"],
      [(d) => { d.records[0].callsPerItem = -0.001; }, "NEGATIVE", "$.records[0].callsPerItem"],
      [(d) => { d.records[0].cost.apiEquivalentTotal = -0.5; }, "NEGATIVE", "$.records[0].cost.apiEquivalentTotal"],
      [(d) => { d.records[0].cost.seatMonthlyPrice = -10; }, "NEGATIVE", "$.records[0].cost.seatMonthlyPrice"],
      [(d) => { d.records[0].cost.seatSharePerItem = -0.01; }, "NEGATIVE", "$.records[0].cost.seatSharePerItem"],
      [(d) => { d.records[0].cost.seatCostPerItem = -0.01; }, "NEGATIVE", "$.records[0].cost.seatCostPerItem"],
      [(d) => { d.records[0].weighted.nEff = -1; }, "NEGATIVE", "$.records[0].weighted.nEff"],
      [(d) => { d.records[0].weighted.deff = 0; }, "NON_POSITIVE", "$.records[0].weighted.deff"],
      [(d) => { d.records[0].weighted.deff = -0.5; }, "NON_POSITIVE", "$.records[0].weighted.deff"],
      [(d) => { d.records[0].cost.fxApplied.rate = 0; }, "NON_POSITIVE", "$.records[0].cost.fxApplied.rate"],
      [(d) => { d.records[0].cost.seatLimitScale = -1; }, "NON_POSITIVE", "$.records[0].cost.seatLimitScale"],
      [(d) => { d.supportFloors.failureCeiling = 1.01; }, "UNIT_RANGE", "$.supportFloors.failureCeiling"],
      [(d) => { d.records[0].abstentionSpecificity = 1.01; }, "UNIT_RANGE", "$.records[0].abstentionSpecificity"],
      [(d) => { d.records[0].sitePresence.siteRecall = -0.0001; }, "UNIT_RANGE",
        "$.records[0].sitePresence.siteRecall"],
      [(d) => { d.records[0].sitePresence.siteAbstentionSpecificity = 1.01; }, "UNIT_RANGE",
        "$.records[0].sitePresence.siteAbstentionSpecificity"],
      [(d) => { d.records[0].unweighted.f1 = 1.0001; }, "UNIT_RANGE", "$.records[0].unweighted.f1"],
      [(d) => { d.records[0].diagnostics.broad.precision = 1.01; }, "UNIT_RANGE",
        "$.records[0].diagnostics.broad.precision"],
      [(d) => { d.records[0].diagnostics.conditionalRetainedRecall = -0.1; }, "UNIT_RANGE",
        "$.records[0].diagnostics.conditionalRetainedRecall"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = -1e-9; }, "INTERVAL_RANGE",
        "$.records[0].sitePresence.siteRecallInterval.low"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = 1.001; }, "INTERVAL_RANGE",
        "$.records[0].sitePresence.siteRecallInterval.low"],
      [(d) => { d.records[0].sitePresence.siteAbstentionInterval.high = -0.01; }, "INTERVAL_RANGE",
        "$.records[0].sitePresence.siteAbstentionInterval.high"],
      [(d) => { d.records[0].unweighted.precisionInterval.high = 1.0001; }, "INTERVAL_RANGE",
        "$.records[0].unweighted.precisionInterval.high"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = 0.85; }, "INTERVAL_ORDER",
        "$.records[0].sitePresence.siteRecallInterval"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.high = 0.4; }, "INTERVAL_ORDER",
        "$.records[0].sitePresence.siteRecallInterval"],
      [(d) => { d.records[0].weighted.f1Interval.low = 0.8; }, "INTERVAL_ORDER",
        "$.records[0].weighted.f1Interval"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = Number.NaN; }, "NON_FINITE",
        "$.records[0].sitePresence.siteRecallInterval.low"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = null; }, "BAD_INTERVAL",
        "$.records[0].sitePresence.siteRecallInterval"],
      [(d) => { d.records[0].unweighted.recallInterval.high = null; }, "BAD_INTERVAL",
        "$.records[0].unweighted.recallInterval"],
      [(d) => { d.records[0].unweighted.recallInterval.method = "none"; }, "BAD_INTERVAL",
        "$.records[0].unweighted.recallInterval"],
      [(d) => { d.records[0].unweighted.recallInterval.clustering = "clustered_record_invalid"; },
        "BAD_INTERVAL", "$.records[0].unweighted.recallInterval"],
      [(d) => { d.records[0].precisionInterval.clustering = "clustered_record_invalid"; },
        "BAD_INTERVAL", "$.records[0].precisionInterval"],
      [(d) => { d.records[1].precisionInterval.low = 0.2; }, "BAD_INTERVAL", "$.records[1].precisionInterval"],
      [(d) => { d.records[1].precisionInterval.high = 0.7; }, "BAD_INTERVAL", "$.records[1].precisionInterval"],
      [(d) => { d.records[1].sitePresence.siteRecallInterval.low = null; }, "BAD_INTERVAL",
        "$.records[1].sitePresence.siteRecallInterval"],
      [(d) => { d.records[1].sitePresence.siteRecallInterval.clustering = "clustered_record_invalid"; },
        "BAD_INTERVAL", "$.records[1].sitePresence.siteRecallInterval"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeValidFile());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), code, path);
    }
    for (const siteCount of ["goldPresentSites", "goldAbsentSites", "unresolvedSites", "insufficientSites",
      "tpSites", "fnSites", "wrongValueOnPresentSites", "fpOnAbsentSites", "tnSites", "failedOnAbsentSites"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0].sitePresence[siteCount] = 1.5;
      refuse(() => parseBenchResultsFile(doc), "BAD_COUNT", `$.records[0].sitePresence.${siteCount}`);
    }
  });

  it("refuses R2 sub-fields, shared sibling bindings and sparse schema arrays", () => {
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.records[0].weighted.precision = 1.01; }, "UNIT_RANGE", "$.records[0].weighted.precision"],
      [(d) => { d.records[0].weighted.recall = -0.01; }, "UNIT_RANGE", "$.records[0].weighted.recall"],
      [(d) => { d.records[0].weighted.f1 = 1.01; }, "UNIT_RANGE", "$.records[0].weighted.f1"],
      [(d) => { d.records[0].weighted.scheme = " "; }, "EMPTY_STRING", "$.records[0].weighted.scheme"],
      [(d) => { d.records[0].weighted.precisionInterval.low = -0.1; }, "INTERVAL_RANGE",
        "$.records[0].weighted.precisionInterval.low"],
      [(d) => { d.records[0].weighted.recallInterval.high = 1.1; }, "INTERVAL_RANGE",
        "$.records[0].weighted.recallInterval.high"],
      [(d) => { d.records[0].cost.fxApplied.source = " "; }, "EMPTY_STRING", "$.records[0].cost.fxApplied.source"],
      [(d) => { d.records[0].cost.fxApplied.asOf = ""; }, "EMPTY_STRING", "$.records[0].cost.fxApplied.asOf"],
      [(d) => { d.records[0].cost.tariffSource = " "; }, "EMPTY_STRING", "$.records[0].cost.tariffSource"],
      [(d) => { d.records[0].cost.apiEquivalentPerItem = -0.01; }, "NEGATIVE",
        "$.records[0].cost.apiEquivalentPerItem"],
      [(d) => { d.corpus.missingDigestRuns = [""]; }, "EMPTY_STRING", "$.corpus.missingDigestRuns[0]"],
      [(d) => { d.corpus.missingDigestRuns = "r1"; }, "NOT_ARRAY", "$.corpus.missingDigestRuns"],
      [(d) => { d.supportFloors.recallMinPositives = 1.5; }, "BAD_COUNT", "$.supportFloors.recallMinPositives"],
      [(d) => { d.supportFloors.precisionMinPredictions = -1; }, "BAD_COUNT",
        "$.supportFloors.precisionMinPredictions"],
      [(d) => { d.generatedAt = " "; }, "EMPTY_STRING", "$.generatedAt"],
      [(d) => { d.corpus.goldenLabel = " "; }, "EMPTY_STRING", "$.corpus.goldenLabel"],
      [(d) => { d.corpus.maxValuesChanged = "yes"; }, "WRONG_TYPE", "$.corpus.maxValuesChanged"],
      [(d) => { d.corpus.captureSuppliedIds = -1; }, "BAD_COUNT", "$.corpus.captureSuppliedIds"],
      [(d) => { d.corpus.captureAttemptedIds = 1.5; }, "BAD_COUNT", "$.corpus.captureAttemptedIds"],
      [(d) => { d.corpus.annotatorRunStats.r1.failed = -1; }, "BAD_COUNT", "$.corpus.annotatorRunStats.r1.failed"],
      [(d) => { d.corpus.annotatorRunStats.r1.missing = 1.5; }, "BAD_COUNT",
        "$.corpus.annotatorRunStats.r1.missing"],
      [(d) => { d.records[0].unweighted.precision = -0.01; }, "UNIT_RANGE", "$.records[0].unweighted.precision"],
      [(d) => { d.records[0].unweighted.recall = 1.01; }, "UNIT_RANGE", "$.records[0].unweighted.recall"],
      [(d) => { d.records[0].precision = 1.01; }, "UNIT_RANGE", "$.records[0].precision"],
      [(d) => { d.records[0].recall = -0.01; }, "UNIT_RANGE", "$.records[0].recall"],
      [(d) => { d.records[0].f1 = 1.01; }, "UNIT_RANGE", "$.records[0].f1"],
      [(d) => { d.records[0].recallInterval.clustering = "clustered_record_invalid"; }, "BAD_INTERVAL",
        "$.records[0].recallInterval"],
      [(d) => { d.records[0].independentGroupSupport.positives = 1.5; }, "BAD_COUNT",
        "$.records[0].independentGroupSupport.positives"],
      [(d) => { d.records[0].diagnostics.broad.fp = 1.5; }, "BAD_COUNT", "$.records[0].diagnostics.broad.fp"],
      [(d) => { d.records[0].diagnostics.broad.fn = -1; }, "BAD_COUNT", "$.records[0].diagnostics.broad.fn"],
      [(d) => { d.records[0].diagnostics.broad.recall = -0.01; }, "UNIT_RANGE",
        "$.records[0].diagnostics.broad.recall"],
      [(d) => { d.records[0].diagnostics.broad.f1 = 1.01; }, "UNIT_RANGE", "$.records[0].diagnostics.broad.f1"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeValidFile());
      mutate(doc);
      refuse(() => parseBenchResultsFile(doc), code, path);
    }
    for (const k of ["tariffAsOf", "seatPlan", "seatPlanSource", "seatPlanAsOf"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0].cost[k] = " ";
      refuse(() => parseBenchResultsFile(doc), "EMPTY_STRING", `$.records[0].cost.${k}`);
    }
    for (const k of ["goldenMissionSha256", "candidateMissionSha256", "goldenSha256"]) {
      const doc = clone(makeValidFile()) as any;
      doc.corpus[k] = " ";
      refuse(() => parseBenchResultsFile(doc), "EMPTY_STRING", `$.corpus.${k}`);
    }
    for (const k of ["armId", "armMissionSha256", "provider", "model", "modelLabel", "proseName",
      "field", "comparator"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0][k] = " ";
      refuse(() => parseBenchResultsFile(doc), "EMPTY_STRING", `$.records[0].${k}`);
    }
    for (const k of ["missingDigestAllowed", "isHighlighted", "incomplete", "isPrimaryComparator"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0][k] = "yes";
      refuse(() => parseBenchResultsFile(doc), "WRONG_TYPE", `$.records[0].${k}`);
    }
    for (const k of ["attempted", "accepted", "failed", "unverifiedQuotesNulled", "goldPositive", "goldAbsent",
      "fp", "fpOnPresent", "fpOnAbsent", "fn", "tn", "failedOnAbsent", "unresolved"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0][k] = 1.5;
      refuse(() => parseBenchResultsFile(doc), "BAD_COUNT", `$.records[0].${k}`);
    }
    for (const k of ["precision", "recall", "f1"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0].indeterminate[k] = 1;
      refuse(() => parseBenchResultsFile(doc), "WRONG_TYPE", `$.records[0].indeterminate.${k}`);
    }
    for (const k of ["output", "reasoning", "total"]) {
      const doc = clone(makeValidFile()) as any;
      doc.records[0].tokens[k] = 1.5;
      refuse(() => parseBenchResultsFile(doc), "BAD_COUNT", `$.records[0].tokens.${k}`);
    }
    const sfDoc = clone(makeValidFile()) as any;
    const sf: string[] = []; sf[1] = "office.city"; sfDoc.corpus.fields = sf;
    refuse(() => parseBenchResultsFile(sfDoc), "WRONG_TYPE", "$.corpus.fields[0]");
    const srDoc = clone(makeValidFile()) as any;
    const sr: unknown[] = []; sr[1] = srDoc.records[0]; srDoc.records = sr;
    refuse(() => parseBenchResultsFile(srDoc), "NOT_OBJECT", "$.records[0]");
  });
});

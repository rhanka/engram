import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ARM_MANIFEST_SCHEMA_ID, ARM_TARIFF_STATUSES, DECISIONS_SCHEMA_ID, DOSSIER_LANGUAGES,
  DOSSIER_META_SCHEMA_ID, METRICS_IMPORT_SCHEMA_ID, SEAT_OBSERVATION_SCHEMA_ID, SEAT_OBSERVATION_WINDOW_MINUTES,
  STAKES_LEVELS, parseArmManifest, parseDecisionsFile, parseDossierMetaFile, parseMetricsImportFile,
  parseSeatObservationInput, parseSeatObservationsFile, readArmManifest, readDecisionsFile, readDossierMetaFile,
  readMetricsImportFile, readSeatObservationInput, readSeatObservationsFile, type ArmManifestFile,
  type ArmTariffStatus, type BenchDecisionsFile, type BenchMetricsImportFile, type DossierLanguage,
  type DossierMetaFile, type SeatObservationInput, type SeatObservationsFile,
  type StakesLevel } from "../src/bench-dossier/companion-contracts.js";
import { BenchResultsValidationError, type BenchResultsErrorCode } from "../src/bench-dossier/results-guards.js";
import type { BenchInterval } from "../src/bench-dossier/results-types.js";

describe("Companion contract types and constants", () => {
  it("exports literal URNs, closed enum tuples, and all 5 companion contract types", () => {
    expect([ARM_MANIFEST_SCHEMA_ID, SEAT_OBSERVATION_SCHEMA_ID, METRICS_IMPORT_SCHEMA_ID,
      DOSSIER_META_SCHEMA_ID, DECISIONS_SCHEMA_ID, SEAT_OBSERVATION_WINDOW_MINUTES,
      ARM_TARIFF_STATUSES, DOSSIER_LANGUAGES, STAKES_LEVELS]).toEqual([
      "urn:engram:bench-arm-manifest:1.0.0", "urn:engram:seat-observation:1.0.0",
      "urn:engram:bench-metrics-import:1.0.0", "urn:engram:bench-dossier-meta:1.0.0",
      "urn:engram:bench-decisions:1.0.0", 10080, ["primary", "secondary_unverified"],
      ["en", "fr"], ["low", "medium", "high"]]);
    expectTypeOf<(typeof ARM_TARIFF_STATUSES)[number]>().toEqualTypeOf<ArmTariffStatus>();
    expectTypeOf<(typeof DOSSIER_LANGUAGES)[number]>().toEqualTypeOf<DossierLanguage>();
    expectTypeOf<(typeof STAKES_LEVELS)[number]>().toEqualTypeOf<StakesLevel>();
    expectTypeOf<ArmManifestFile["schemaId"]>().toEqualTypeOf<typeof ARM_MANIFEST_SCHEMA_ID>();
    expectTypeOf<SeatObservationInput["status"]>().toEqualTypeOf<"unknown" | "measured" | "estimated">();
    expectTypeOf<SeatObservationsFile["schemaId"]>().toEqualTypeOf<typeof SEAT_OBSERVATION_SCHEMA_ID>();
    expectTypeOf<BenchMetricsImportFile["schemaId"]>().toEqualTypeOf<typeof METRICS_IMPORT_SCHEMA_ID>();
    expectTypeOf<DossierMetaFile["schemaId"]>().toEqualTypeOf<typeof DOSSIER_META_SCHEMA_ID>();
    expectTypeOf<BenchDecisionsFile["schemaId"]>().toEqualTypeOf<typeof DECISIONS_SCHEMA_ID>();
  });
});

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) as T; }

function refuse(fn: () => void, code: BenchResultsErrorCode, expectedPath: string): BenchResultsValidationError {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(BenchResultsValidationError);
  const err = caught as BenchResultsValidationError;
  expect(err.name).toBe("BenchResultsValidationError");
  expect([err.code, err.path]).toEqual([code, expectedPath]);
  return err;
}

function makeMeasuredSeat(): SeatObservationInput {
  return { schemaId: "urn:engram:seat-observation:1.0.0", status: "measured", method: "weekly_burn_delta",
    windowMinutes: 10080, isolatedSeat: true, remainingBefore: 0.92, remainingAfter: 0.72, observedItems: 40,
    plan: "Pro", planMonthlyPrice: 280, planCurrency: "CAD", planSource: "invoice", planAsOf: "2026-11-20" };
}

function makeEstimatedSeat(): SeatObservationInput {
  return { status: "estimated", method: "api_cost_proportional", windowMinutes: 10080, isolatedSeat: false,
    observedApiEquivalent: 12.5, observedCurrency: "USD", quotaDeltaFraction: 0.25, basePlanMultiplier: 1,
    targetPlanMultiplier: 5, plan: "Max Five", planMonthlyPrice: 140, planCurrency: "USD",
    planSource: "pricing-page", planAsOf: "2026-11-21" };
}

function makeArmManifest(): ArmManifestFile {
  return { schemaId: "urn:engram:bench-arm-manifest:1.0.0", armId: "arm-openai-astra-low", provider: "OpenAI",
    model: "gpt-6-astra-low", modelLabel: "Astra low", proseName: "OpenAI Astra low", effort: "low",
    isCascade: false, missionPath: "missions/candidate.json", missionSha256: "a".repeat(64),
    allowLegacyMissingMissionDigest: false, isHighlighted: true, incomplete: false, tariffStatus: "primary",
    tariffOverride: { status: "secondary_unverified", currency: "USD", source: "provider-card", asOf: "2026-11-18",
      perMillion: { input: 1.5, output: 6.0, reasoning: 12.0 } },
    fx: { from: "USD", to: "CAD", rate: 1.385, source: "boc-daily", asOf: "2026-11-22" }, seat: makeMeasuredSeat() };
}

describe("arm.json and seat observation core contracts and reader", () => {
  it("validates arm and seat fixtures in memory and handles ENOENT, EISDIR, BAD_JSON on disk", () => {
    const arm = makeArmManifest();
    const estSeat = makeEstimatedSeat();
    const unknownSeat: SeatObservationInput = { status: "unknown", reason: "shared-seat-concurrent" };
    const seatsFile: SeatObservationsFile = { schemaId: "urn:engram:seat-observation:1.0.0",
      observations: { "arm-a": makeMeasuredSeat(), "arm-b": estSeat, "arm-c": unknownSeat } };
    expect(parseArmManifest(arm)).toEqual(arm);
    expect(parseSeatObservationInput(unknownSeat)).toEqual(unknownSeat);
    expect(parseSeatObservationInput(estSeat)).toEqual(estSeat);
    expect(parseSeatObservationsFile(seatsFile)).toEqual(seatsFile);
    const dir = mkdtempSync(join(tmpdir(), "bd1b-"));
    try {
      const write = (name: string, data: unknown) => {
        const p = join(dir, name);
        writeFileSync(p, JSON.stringify(data), "utf8");
        return p;
      };
      expect(readArmManifest(write("arm.json", arm))).toEqual(arm);
      expect(readSeatObservationInput(write("seat.json", estSeat))).toEqual(estSeat);
      expect(readSeatObservationsFile(write("seats.json", seatsFile))).toEqual(seatsFile);
      const missing = join(dir, "missing.json");
      const ioErr = refuse(() => readArmManifest(missing), "IO_ERROR", missing);
      expect([ioErr.errno, ioErr.cause instanceof Error]).toEqual(["ENOENT", true]);
      const dirErr = refuse(() => readArmManifest(dir), "IO_ERROR", dir);
      expect([dirErr.errno, dirErr.cause instanceof Error,
        (dirErr.cause as NodeJS.ErrnoException).code]).toEqual(["EISDIR", true, "EISDIR"]);
      const badJson = join(dir, "bad.json");
      const emptyObj = join(dir, "empty.json");
      writeFileSync(badJson, "{bad", "utf8");
      writeFileSync(emptyObj, "{}", "utf8");
      const jsonErr = refuse(() => readSeatObservationsFile(badJson), "BAD_JSON", "$");
      expect([jsonErr.errno, jsonErr.cause instanceof SyntaxError]).toEqual([undefined, true]);
      refuse(() => readArmManifest(emptyObj), "MISSING_KEY", "$.schemaId");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const makeIv = (estimator: "unweighted" | "weighted", valid = true): BenchInterval =>
  valid
    ? {
      estimator,
      method: estimator === "weighted" ? "design_bootstrap_95" : "wilson_95_unweighted",
      clustering: estimator === "weighted" ? "group_resampled" : "independent_site",
      valid: true, low: 0.45, high: 0.85,
    }
    : { estimator, method: "none", clustering: "clustered_record_invalid", valid: false, low: null, high: null };

function makeMetricsImport(): BenchMetricsImportFile {
  const wIv = makeIv("weighted");
  const uIv = makeIv("unweighted");
  const badIv = makeIv("unweighted", false);
  return {
    schemaId: "urn:engram:bench-metrics-import:1.0.0",
    campaignId: "lotb-eval-2026", partition: "sealed", goldenLabel: "pass2",
    primaryEstimator: "weighted", costBasisLabel: "extracted_packet", currency: "CAD",
    goldenSha256: "b".repeat(64), goldenMissionSha256: "c".repeat(64), candidateMissionSha256: "d".repeat(64),
    fieldShapeVerified: true, goldenIds: 30, fields: ["office.city", "office.full_address"],
    annotatorCount: 3, annotatorRunStats: { r1: { answered: 29, failed: 1, missing: 0 } },
    missingDigestRuns: ["r1"],
    krippendorffAlphaByField: { "office.city": 0.84, "office.full_address": null },
    supportFloors: { recallMinPositives: 30, precisionMinPredictions: 30, failureCeiling: 0.05 },
    records: [
      {
        armId: "arm-openai-astra-low", field: "office.city", comparator: "lotb_ca_post_v1",
        isPrimaryComparator: true, attempted: 30, accepted: 28, failed: 2, failuresByCode: { llm_error: 2 },
        unverifiedQuotesNulled: 1, unverifiedWholeRecordsDropped: 0,
        goldPositive: 30, goldAbsent: 10, tp: 21, fp: 7, fpOnPresent: 5, fpOnAbsent: 2,
        fpElementsOnAbsent: 2, fn: 9, tn: 8, failedOnAbsent: 0, unresolved: 1, insufficient: 2,
        sitePresence: {
          goldPresentSites: 30, goldAbsentSites: 10, unresolvedSites: 1, insufficientSites: 2,
          tpSites: 21, fnSites: 9, wrongValueOnPresentSites: 3, fpOnAbsentSites: 2, tnSites: 8,
          failedOnAbsentSites: 0, siteRecall: 0.7, siteRecallInterval: uIv,
          siteAbstentionSpecificity: 0.8, siteAbstentionInterval: uIv,
        },
        unweighted: { precision: 0.75, recall: 0.7, f1: 0.724, precisionInterval: uIv, recallInterval: uIv },
        weighted: {
          scheme: "horvitz_thompson_s1_s2_v1", deff: 1.14, nEff: 26.3,
          precision: 0.76, recall: 0.69, f1: 0.723, precisionInterval: wIv, recallInterval: wIv, f1Interval: wIv,
        },
        independentGroupSupport: { predictions: 28, positives: 29 },
        diagnostics: {
          broad: { tp: 22, fp: 6, fn: 8, precision: 0.78, recall: 0.73, f1: 0.75 },
          conditionalRetainedRecall: 0.81,
        },
        armMissionSha256: "e".repeat(64), calls: 35,
        tokens: { input: 10000, output: 1500, reasoning: 200, cached: "unknown", total: 11700 },
        costBasisItems: 1705, apiEquivalentTotal: 1.45,
      },
      {
        armId: "arm-cascade", field: "office.full_address", comparator: "generic",
        isPrimaryComparator: false, attempted: 30, accepted: 20, failed: 10, failuresByCode: {},
        unverifiedQuotesNulled: 0, unverifiedWholeRecordsDropped: null,
        goldPositive: 20, goldAbsent: 5, tp: 10, fp: 5, fpOnPresent: 4, fpOnAbsent: 1,
        fpElementsOnAbsent: 1, fn: 10, tn: 4, failedOnAbsent: 0, unresolved: 0, insufficient: 1,
        sitePresence: {
          goldPresentSites: 20, goldAbsentSites: 5, unresolvedSites: 0, insufficientSites: 1,
          tpSites: 10, fnSites: 10, wrongValueOnPresentSites: 2, fpOnAbsentSites: 1, tnSites: 4,
          failedOnAbsentSites: 0, siteRecall: 0.5, siteRecallInterval: badIv,
          siteAbstentionSpecificity: 0.8, siteAbstentionInterval: badIv,
        },
        unweighted: { precision: 0.66, recall: 0.5, f1: 0.569, precisionInterval: badIv, recallInterval: badIv },
        weighted: null, calls: "unknown", tokens: "unknown", apiEquivalentTotal: "unknown",
      },
    ],
  };
}

describe("metrics.json (urn:engram:bench-metrics-import:1.0.0) core contract", () => {
  it("validates metrics.json in memory and on disk", () => {
    const metrics = makeMetricsImport();
    expect(parseMetricsImportFile(metrics)).toEqual(metrics);
    const dir = mkdtempSync(join(tmpdir(), "bd1b-metrics-"));
    try {
      const p = join(dir, "metrics.json");
      writeFileSync(p, JSON.stringify(metrics), "utf8");
      expect(readMetricsImportFile(p)).toEqual(metrics);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function makeDossierMeta(): DossierMetaFile {
  return { schemaId: "urn:engram:bench-dossier-meta:1.0.0", ref: "report:lotb-eval-pass-one", language: "en",
    title: "Lot B Benchmark Evaluation", subject: "Canadian startup office extraction quality",
    ownerRequestQuote: "Provide a benchmark dossier with recall precision and cost charts.",
    stakes: "Determines which low-effort model family enters production scraping.", stakesLevel: "medium",
    provenance: { source: "owner-brief-r15", readAt: "2026-11-22T10:00:00Z" },
    reviewStatus: { complete: false,
      summaryProse: "Co-author review by Astra Six Two remains pending until twenty-seven November." },
    origins: { defaultRepo: "rhanka/engram", defaultRevision: "282201a9d", sourcePaths: {
      results: { repo: "rhanka/tkm", revision: "main", path: "docs/spec/reports/lotb/golden/metrics.json" },
      brief: { uri: "https://example.invalid/brief" } } },
    cursor: "draft:1", readingBudgetMinutes: 6,
    amendmentTrace: [{ at: "2026-11-22T10:30:00Z", author: "Hydrogen", summary: "Initial evaluation setup" }],
    fieldLabels: { "office.city": { en: "office municipality", fr: "municipalite du bureau" } },
    glossaryExtra: [{ term: "FSA", definition: "Forward Sortation Area prefix of a postal code" }] };
}

function makeDecisionsFile(): BenchDecisionsFile {
  return { schemaId: "urn:engram:bench-decisions:1.0.0", questions: [{
    id: "q-packaging", title: "Multi-field sheet packaging",
    question: "Which sheet packaging format should ship as the default for multi-field dossiers?",
    context: "Four full-resolution lossless sheets exceed the one mebibyte document ceiling.",
    recommendedOptionId: "opt-per-field",
    recommendedAnswer: "In short: emit one lossless portable file per field so phone zoom stays crisp.",
    strongestObjectionProse: "Splitting into four files asks the reviewer to open four separate tabs.",
    overturnConditionProse: "Switch back to a single file once vector images are accepted upstream.",
    failureScenarioProse: "Lossy compression blurs thin dashed progression lines under zoom.",
    presenterConvenienceProse: "A single file saves clicks at the cost of reading clarity.",
    completionCriterion: "Default packaging passes the artifact size limit without losing legibility.",
    readingTimeMinutes: 1.5, options: [
      { id: "opt-per-field", label: "One lossless dossier per field",
        consequence: "Keeps sharp lossless charts on phone under the size cap across four files.",
        body: "Each field dossier stays well below the size limit with light and dark sheets." },
      { id: "opt-jpeg", label: "Single dossier with compressed sheets",
        consequence: "Keeps one file while trading fine dashed line sharpness under zoom.",
        body: "Uses light-only compressed sheets so four fields fit inside one artifact." } ] }],
  ownerCriteria: [{ criterion: "charts readable on phone with zoom and a see all view",
    requestSource: "2026-11-22 owner request", addressedBy: "q-packaging / opt-per-field", gapOrDeparture: "" }] };
}

describe("dossier-meta.json and decisions.json core contracts and Focus alignment", () => {
  it("validates meta and decisions fixtures in memory, on disk, and enforces Focus readability budgets", () => {
    const meta = makeDossierMeta();
    const decisions = makeDecisionsFile();
    expect(parseDossierMetaFile(meta)).toEqual(meta);
    expect(parseDecisionsFile(decisions)).toEqual(decisions);
    const dir = mkdtempSync(join(tmpdir(), "bd1b-focus-"));
    try {
      const mp = join(dir, "meta.json");
      const dp = join(dir, "decisions.json");
      writeFileSync(mp, JSON.stringify(meta), "utf8");
      writeFileSync(dp, JSON.stringify(decisions), "utf8");
      expect(readDossierMetaFile(mp)).toEqual(meta);
      expect(readDecisionsFile(dp)).toEqual(decisions);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const budgetTwo = { ...meta, readingBudgetMinutes: 2 };
    expect(parseDossierMetaFile(budgetTwo).readingBudgetMinutes).toBe(2);
    const lowBudgetOk = { ...budgetTwo, stakesLevel: "low" as const };
    expect(parseDossierMetaFile(lowBudgetOk).readingBudgetMinutes).toBe(2);

    const lowBudgetBad = { ...lowBudgetOk, readingBudgetMinutes: 2.01 };
    refuse(() => parseDossierMetaFile(lowBudgetBad), "BAD_SHAPE", "$.readingBudgetMinutes");

    const halfMinOk = clone(decisions) as any;
    const q = halfMinOk.questions[0];
    q.readingTimeMinutes = 0.5;
    q.title = "w";
    q.question = "w";
    q.recommendedAnswer = "w";
    q.completionCriterion = "w";
    q.options = [
      { id: "opt-per-field", label: "w", consequence: "w", body: "w" },
      { id: "opt-2", label: "w", consequence: "w", body: "w" },
    ];
    q.context = Array.from({ length: 80 }, () => "w").join(" ");
    expect(parseDecisionsFile(halfMinOk).questions[0]?.readingTimeMinutes).toBe(0.5);
    q.context = Array.from({ length: 81 }, () => "w").join(" ");
    refuse(() => parseDecisionsFile(halfMinOk), "BAD_SHAPE", "$.questions[0]");
  });
});

describe("arm.json optional variations, enum literals and nested refusal matrix", () => {
  it("accepts single-field optional variations, zero perMillion prices and all ArmManifest enums", () => {
    for (const k of [
      "missionPath", "missionSha256", "allowLegacyMissingMissionDigest",
      "isHighlighted", "incomplete", "tariffStatus", "tariffOverride", "fx", "seat",
    ]) {
      const doc = clone(makeArmManifest()) as any;
      delete doc[k];
      expect(parseArmManifest(doc).armId).toBe("arm-openai-astra-low");
    }
    const singleVars: ((d: any) => void)[] = [
      (d) => { delete d.tariffOverride.perMillion.reasoning; },
      (d) => { delete d.tariffOverride.perMillion; },
      (d) => { delete d.tariffOverride.currency; },
      (d) => { d.tariffOverride.source = null; },
      (d) => { d.tariffOverride.asOf = null; },
      (d) => { d.tariffOverride.perMillion.input = 0; },
      (d) => { d.tariffOverride.perMillion.output = 0; },
      (d) => { d.tariffOverride.perMillion.reasoning = 0; },
    ];
    for (const mutate of singleVars) {
      const doc = clone(makeArmManifest()) as any;
      mutate(doc);
      expect(parseArmManifest(doc).armId).toBe("arm-openai-astra-low");
    }
    for (const effort of ["off", "minimal", "low", "medium", "high", "xhigh", "max", "cascade"]) {
      const doc = clone(makeArmManifest()) as any;
      doc.effort = effort;
      expect(parseArmManifest(doc).effort).toBe(effort);
    }
    for (const ts of ["primary", "secondary_unverified"]) {
      const doc = clone(makeArmManifest()) as any;
      doc.tariffStatus = ts;
      expect(parseArmManifest(doc).tariffStatus).toBe(ts);
    }
    for (const ts of ["primary", "secondary_unverified", "unknown"]) {
      const doc = clone(makeArmManifest()) as any;
      doc.tariffOverride.status = ts;
      expect(parseArmManifest(doc).tariffOverride?.status).toBe(ts);
    }
    for (const c of ["USD", "CAD"]) {
      const doc = clone(makeArmManifest()) as any;
      doc.tariffOverride.currency = c;
      expect(parseArmManifest(doc).tariffOverride?.currency).toBe(c);
      const fxFromDoc = clone(makeArmManifest()) as any;
      fxFromDoc.fx.from = c;
      expect(parseArmManifest(fxFromDoc).fx?.from).toBe(c);
      const fxToDoc = clone(makeArmManifest()) as any;
      fxToDoc.fx.to = c;
      expect(parseArmManifest(fxToDoc).fx?.to).toBe(c);
    }
  });

  it("refuses cacheRead, closed keys, missing keys and every nested arm.json binding", () => {
    for (const bad of [null, [], "x", 1, new Date()]) {
      refuse(() => parseArmManifest(bad), "NOT_OBJECT", "$");
    }
    for (const k of ["armId", "provider", "model", "modelLabel", "proseName"]) {
      const emptyDoc = clone(makeArmManifest()) as any;
      emptyDoc[k] = " ";
      refuse(() => parseArmManifest(emptyDoc), "EMPTY_STRING", `$.${k}`);
      const missDoc = clone(makeArmManifest()) as any;
      delete missDoc[k];
      refuse(() => parseArmManifest(missDoc), "MISSING_KEY", `$.${k}`);
    }
    for (const k of ["allowLegacyMissingMissionDigest", "isHighlighted", "incomplete"]) {
      const doc = clone(makeArmManifest()) as any;
      doc[k] = "yes";
      refuse(() => parseArmManifest(doc), "WRONG_TYPE", `$.${k}`);
    }
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "urn:engram:bench-results:1.0.0"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.schemaId = 1; }, "WRONG_TYPE", "$.schemaId"],
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.missionPath = " "; }, "EMPTY_STRING", "$.missionPath"],
      [(d) => { d.missionSha256 = ""; }, "EMPTY_STRING", "$.missionSha256"],
      [(d) => { d.isCascade = "no"; }, "WRONG_TYPE", "$.isCascade"],
      [(d) => { d.effort = "turbo"; }, "BAD_ENUM", "$.effort"],
      [(d) => { d.tariffStatus = "unknown"; }, "BAD_ENUM", "$.tariffStatus"],
      [(d) => { d.tariffOverride.cacheRead = 0.5; }, "UNKNOWN_KEY", "$.tariffOverride.cacheRead"],
      [(d) => { d.tariffOverride.perMillion.cacheRead = 0.5; }, "UNKNOWN_KEY", "$.tariffOverride.perMillion.cacheRead"],
      [(d) => { d.tariffOverride.extra = 1; }, "UNKNOWN_KEY", "$.tariffOverride.extra"],
      [(d) => { d.tariffOverride.perMillion.extra = 1; }, "UNKNOWN_KEY", "$.tariffOverride.perMillion.extra"],
      [(d) => { delete d.tariffOverride.status; }, "MISSING_KEY", "$.tariffOverride.status"],
      [(d) => { delete d.tariffOverride.source; }, "MISSING_KEY", "$.tariffOverride.source"],
      [(d) => { delete d.tariffOverride.asOf; }, "MISSING_KEY", "$.tariffOverride.asOf"],
      [(d) => { delete d.tariffOverride.perMillion.input; }, "MISSING_KEY", "$.tariffOverride.perMillion.input"],
      [(d) => { delete d.tariffOverride.perMillion.output; }, "MISSING_KEY", "$.tariffOverride.perMillion.output"],
      [(d) => { d.tariffOverride.status = "invalid"; }, "BAD_ENUM", "$.tariffOverride.status"],
      [(d) => { d.tariffOverride.currency = "EUR"; }, "BAD_ENUM", "$.tariffOverride.currency"],
      [(d) => { d.tariffOverride.source = undefined; }, "WRONG_TYPE", "$.tariffOverride.source"],
      [(d) => { d.tariffOverride.source = " "; }, "EMPTY_STRING", "$.tariffOverride.source"],
      [(d) => { d.tariffOverride.asOf = ""; }, "EMPTY_STRING", "$.tariffOverride.asOf"],
      [(d) => { d.tariffOverride.perMillion.input = -0.01; }, "NEGATIVE", "$.tariffOverride.perMillion.input"],
      [(d) => { d.tariffOverride.perMillion.output = Number.NaN; }, "NON_FINITE", "$.tariffOverride.perMillion.output"],
      [(d) => { d.tariffOverride.perMillion.reasoning = -1; }, "NEGATIVE", "$.tariffOverride.perMillion.reasoning"],
      [(d) => { d.fx.extra = 1; }, "UNKNOWN_KEY", "$.fx.extra"],
      [(d) => { delete d.fx.from; }, "MISSING_KEY", "$.fx.from"],
      [(d) => { delete d.fx.to; }, "MISSING_KEY", "$.fx.to"],
      [(d) => { delete d.fx.rate; }, "MISSING_KEY", "$.fx.rate"],
      [(d) => { delete d.fx.source; }, "MISSING_KEY", "$.fx.source"],
      [(d) => { delete d.fx.asOf; }, "MISSING_KEY", "$.fx.asOf"],
      [(d) => { d.fx.from = "GBP"; }, "BAD_ENUM", "$.fx.from"],
      [(d) => { d.fx.to = "EUR"; }, "BAD_ENUM", "$.fx.to"],
      [(d) => { d.fx.rate = 0; }, "NON_POSITIVE", "$.fx.rate"],
      [(d) => { d.fx.source = ""; }, "EMPTY_STRING", "$.fx.source"],
      [(d) => { d.fx.asOf = " "; }, "EMPTY_STRING", "$.fx.asOf"],
      [(d) => { d.seat.status = "bogus"; }, "BAD_ENUM", "$.seat.status"],
      [(d) => { d.seat.windowMinutes = 300; }, "BAD_SHAPE", "$.seat.windowMinutes"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeArmManifest());
      mutate(doc);
      refuse(() => parseArmManifest(doc), code, path);
    }
  });
});

describe("SeatObservationInput and SeatObservationsFile refusal and boundary matrices", () => {
  it("exercises all SeatUnknownReason literals and valid measured/estimated boundary values", () => {
    const reasons = [
      "missing-observation", "weekly-window-source-gap", "non-weekly-window", "shared-seat-concurrent",
      "no-quota-delta", "plan-source-gap", "transport-mismatch", "missing-usage", "api-equivalent-source-gap",
    ] as const;
    for (const reason of reasons) {
      expect(parseSeatObservationInput({ status: "unknown", reason })).toEqual({ status: "unknown", reason });
    }
    expect(parseSeatObservationInput({
      schemaId: "urn:engram:seat-observation:1.0.0", status: "unknown", method: "unknown", reason: "no-quota-delta",
    }).status).toBe("unknown");
    const zeroBurn = { ...makeMeasuredSeat(), remainingBefore: 0.72 };
    expect(parseSeatObservationInput(zeroBurn)).toMatchObject({ status: "measured", remainingBefore: 0.72 });
    const fullBefore = { ...makeMeasuredSeat(), remainingBefore: 1 };
    expect(parseSeatObservationInput(fullBefore)).toMatchObject({ status: "measured", remainingBefore: 1 });
    const zeroAfter = { ...makeMeasuredSeat(), remainingAfter: 0 };
    expect(parseSeatObservationInput(zeroAfter)).toMatchObject({ status: "measured", remainingAfter: 0 });
    const minItems = { ...makeMeasuredSeat(), observedItems: 1 };
    expect(parseSeatObservationInput(minItems)).toMatchObject({ status: "measured", observedItems: 1 });
    const freePlan = { ...makeMeasuredSeat(), planMonthlyPrice: 0 };
    expect(parseSeatObservationInput(freePlan)).toMatchObject({ status: "measured", planMonthlyPrice: 0 });
    const fullDelta = { ...makeEstimatedSeat(), quotaDeltaFraction: 1 };
    expect(parseSeatObservationInput(fullDelta)).toMatchObject({ status: "estimated", quotaDeltaFraction: 1 });
    const isolatedEst = { ...makeEstimatedSeat(), isolatedSeat: true };
    expect(parseSeatObservationInput(isolatedEst)).toMatchObject({ status: "estimated", isolatedSeat: true });
  });

  it("refuses discriminators, non-weekly windows, inverted burns, and all nested seat bindings", () => {
    for (const bad of [null, [], "unknown", 5]) {
      refuse(() => parseSeatObservationInput(bad), "NOT_OBJECT", "$");
    }
    refuse(() => parseSeatObservationInput({ reason: "missing-observation" }), "MISSING_KEY", "$.status");
    refuse(() => parseSeatObservationInput({ status: 1 }), "WRONG_TYPE", "$.status");
    refuse(() => parseSeatObservationInput({ status: "pending" }), "BAD_ENUM", "$.status");
    refuse(() => parseSeatObservationInput({ status: "toString" }), "BAD_ENUM", "$.status");
    const unknownCases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "bad"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.method = "weekly_burn_delta"; }, "BAD_SHAPE", "$.method"],
      [(d) => { d.method = "bogus"; }, "BAD_ENUM", "$.method"],
      [(d) => { delete d.reason; }, "MISSING_KEY", "$.reason"],
      [(d) => { d.reason = "other"; }, "BAD_ENUM", "$.reason"],
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
    ];
    for (const [mutate, code, path] of unknownCases) {
      const doc: any = { status: "unknown", reason: "missing-observation" };
      mutate(doc);
      refuse(() => parseSeatObservationInput(doc), code, path);
    }
    const measuredCases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.schemaId = "bad"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { delete d.isolatedSeat; }, "MISSING_KEY", "$.isolatedSeat"],
      [(d) => { d.method = "api_cost_proportional"; }, "BAD_SHAPE", "$.method"],
      [(d) => { d.method = "guess"; }, "BAD_ENUM", "$.method"],
      [(d) => { d.windowMinutes = 10079; }, "BAD_SHAPE", "$.windowMinutes"],
      [(d) => { d.windowMinutes = 10080.5; }, "BAD_COUNT", "$.windowMinutes"],
      [(d) => { d.isolatedSeat = false; }, "BAD_SHAPE", "$.isolatedSeat"],
      [(d) => { d.isolatedSeat = "true"; }, "WRONG_TYPE", "$.isolatedSeat"],
      [(d) => { d.remainingBefore = 1.01; }, "UNIT_RANGE", "$.remainingBefore"],
      [(d) => { d.remainingAfter = -0.01; }, "UNIT_RANGE", "$.remainingAfter"],
      [(d) => { d.remainingBefore = 0.5; }, "BAD_SHAPE", "$"],
      [(d) => { d.observedItems = 0; }, "NON_POSITIVE", "$.observedItems"],
      [(d) => { d.observedItems = 1.5; }, "BAD_COUNT", "$.observedItems"],
      [(d) => { d.planMonthlyPrice = -1; }, "NEGATIVE", "$.planMonthlyPrice"],
      [(d) => { d.planCurrency = "EUR"; }, "BAD_ENUM", "$.planCurrency"],
      [(d) => { d.plan = " "; }, "EMPTY_STRING", "$.plan"],
      [(d) => { d.planSource = " "; }, "EMPTY_STRING", "$.planSource"],
      [(d) => { d.planAsOf = ""; }, "EMPTY_STRING", "$.planAsOf"],
    ];
    for (const [mutate, code, path] of measuredCases) {
      const doc = clone(makeMeasuredSeat());
      mutate(doc);
      refuse(() => parseSeatObservationInput(doc), code, path);
    }
    const estimatedCases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.schemaId = "bad"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { delete d.basePlanMultiplier; }, "MISSING_KEY", "$.basePlanMultiplier"],
      [(d) => { delete d.targetPlanMultiplier; }, "MISSING_KEY", "$.targetPlanMultiplier"],
      [(d) => { d.method = "weekly_burn_delta"; }, "BAD_SHAPE", "$.method"],
      [(d) => { d.method = "guess"; }, "BAD_ENUM", "$.method"],
      [(d) => { d.windowMinutes = 10081; }, "BAD_SHAPE", "$.windowMinutes"],
      [(d) => { d.observedApiEquivalent = 0; }, "NON_POSITIVE", "$.observedApiEquivalent"],
      [(d) => { d.quotaDeltaFraction = 0; }, "NON_POSITIVE", "$.quotaDeltaFraction"],
      [(d) => { d.quotaDeltaFraction = -0.1; }, "NON_POSITIVE", "$.quotaDeltaFraction"],
      [(d) => { d.quotaDeltaFraction = 1.001; }, "UNIT_RANGE", "$.quotaDeltaFraction"],
      [(d) => { d.basePlanMultiplier = 0; }, "NON_POSITIVE", "$.basePlanMultiplier"],
      [(d) => { d.targetPlanMultiplier = -1; }, "NON_POSITIVE", "$.targetPlanMultiplier"],
      [(d) => { d.observedCurrency = "GBP"; }, "BAD_ENUM", "$.observedCurrency"],
      [(d) => { d.isolatedSeat = "no"; }, "WRONG_TYPE", "$.isolatedSeat"],
      [(d) => { d.plan = ""; }, "EMPTY_STRING", "$.plan"],
      [(d) => { d.planSource = " "; }, "EMPTY_STRING", "$.planSource"],
      [(d) => { d.planAsOf = " "; }, "EMPTY_STRING", "$.planAsOf"],
      [(d) => { d.planMonthlyPrice = -0.5; }, "NEGATIVE", "$.planMonthlyPrice"],
      [(d) => { d.planCurrency = "GBP"; }, "BAD_ENUM", "$.planCurrency"],
    ];
    for (const [mutate, code, path] of estimatedCases) {
      const doc = clone(makeEstimatedSeat());
      mutate(doc);
      refuse(() => parseSeatObservationInput(doc), code, path);
    }
    for (const badKey of ["", "  ", "__proto__", "constructor", "prototype"]) {
      const badMap: Record<string, unknown> = {};
      Object.defineProperty(badMap, badKey, {
        value: { status: "unknown", reason: "missing-observation" }, enumerable: true,
      });
      refuse(() => parseSeatObservationsFile({ schemaId: "urn:engram:seat-observation:1.0.0", observations: badMap }),
        "BAD_MAP_KEY", `$.observations.${badKey}`);
    }
    refuse(() => parseSeatObservationsFile({ schemaId: "wrong", observations: {} }), "BAD_SCHEMA", "$.schemaId");
    refuse(() => parseSeatObservationsFile({
      schemaId: "urn:engram:seat-observation:1.0.0", observations: {}, extra: 1,
    }), "UNKNOWN_KEY", "$.extra");
    const badNest = clone(makeMeasuredSeat()) as any;
    badNest.planSource = " ";
    refuse(() => parseSeatObservationsFile({
      schemaId: "urn:engram:seat-observation:1.0.0", observations: { a: badNest },
    }), "EMPTY_STRING", "$.observations.a.planSource");
  });
});

describe("metrics.json top-level, optional, enum, count and string-map matrix", () => {
  it("accepts optional deletions, all enums, and refuses top-level closed keys, strings and counts", () => {
    for (const k of [
      "goldenLabel", "costBasisLabel", "currency", "annotatorRunStats", "missingDigestRuns", "supportFloors",
    ] as const) {
      const doc = clone(makeMetricsImport()) as any;
      delete doc[k];
      expect(parseMetricsImportFile(doc).campaignId).toBe("lotb-eval-2026");
    }
    for (const k of [
      "independentGroupSupport", "diagnostics", "armMissionSha256", "calls",
      "tokens", "costBasisItems", "apiEquivalentTotal",
    ] as const) {
      const doc = clone(makeMetricsImport()) as any;
      delete doc.records[0][k];
      expect(parseMetricsImportFile(doc).records[0]?.armId).toBe("arm-openai-astra-low");
    }
    for (const v of ["pilot", "eval", "sealed", "blind", "full"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.partition = v;
      expect(parseMetricsImportFile(doc).partition).toBe(v);
    }
    for (const v of ["unweighted", "weighted"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.primaryEstimator = v;
      expect(parseMetricsImportFile(doc).primaryEstimator).toBe(v);
    }
    for (const v of ["extracted_packet", "attempted_id", "supplied_id"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.costBasisLabel = v;
      expect(parseMetricsImportFile(doc).costBasisLabel).toBe(v);
    }
    for (const v of ["USD", "CAD"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.currency = v;
      expect(parseMetricsImportFile(doc).currency).toBe(v);
    }
    for (const bad of [null, [], 42]) {
      refuse(() => parseMetricsImportFile(bad), "NOT_OBJECT", "$");
    }
    for (const k of [
      "campaignId", "goldenSha256", "goldenMissionSha256", "candidateMissionSha256", "goldenLabel",
    ]) {
      const doc = clone(makeMetricsImport()) as any;
      doc[k] = " ";
      refuse(() => parseMetricsImportFile(doc), "EMPTY_STRING", `$.${k}`);
    }
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "urn:engram:bench-results:1.0.0"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.fieldShapeVerified = false; }, "BAD_SHAPE", "$.fieldShapeVerified"],
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.supportFloors.extra = 1; }, "UNKNOWN_KEY", "$.supportFloors.extra"],
      [(d) => { d.annotatorRunStats.r1.extra = 1; }, "UNKNOWN_KEY", "$.annotatorRunStats.r1.extra"],
      [(d) => { delete d.goldenMissionSha256; }, "MISSING_KEY", "$.goldenMissionSha256"],
      [(d) => { delete d.candidateMissionSha256; }, "MISSING_KEY", "$.candidateMissionSha256"],
      [(d) => { d.partition = "train"; }, "BAD_ENUM", "$.partition"],
      [(d) => { d.primaryEstimator = "ols"; }, "BAD_ENUM", "$.primaryEstimator"],
      [(d) => { d.costBasisLabel = "raw"; }, "BAD_ENUM", "$.costBasisLabel"],
      [(d) => { d.currency = "EUR"; }, "BAD_ENUM", "$.currency"],
      [(d) => { d.goldenIds = 1.5; }, "BAD_COUNT", "$.goldenIds"],
      [(d) => { d.annotatorCount = 2.5; }, "BAD_COUNT", "$.annotatorCount"],
      [(d) => { d.fields = "office.city"; }, "NOT_ARRAY", "$.fields"],
      [(d) => { d.fields = ["office.city", " "]; }, "EMPTY_STRING", "$.fields[1]"],
      [(d) => { d.missingDigestRuns = "r1"; }, "NOT_ARRAY", "$.missingDigestRuns"],
      [(d) => { d.missingDigestRuns = [""]; }, "EMPTY_STRING", "$.missingDigestRuns[0]"],
      [(d) => { d.annotatorRunStats.r1.answered = 28.5; }, "BAD_COUNT", "$.annotatorRunStats.r1.answered"],
      [(d) => { d.annotatorRunStats.r1.failed = 0.5; }, "BAD_COUNT", "$.annotatorRunStats.r1.failed"],
      [(d) => { d.annotatorRunStats.r1.missing = -1; }, "BAD_COUNT", "$.annotatorRunStats.r1.missing"],
      [(d) => { d.supportFloors.recallMinPositives = 1.5; }, "BAD_COUNT", "$.supportFloors.recallMinPositives"],
      [(d) => { d.supportFloors.precisionMinPredictions = 1.5; },
        "BAD_COUNT", "$.supportFloors.precisionMinPredictions"],
      [(d) => { d.supportFloors.failureCeiling = 1.1; }, "UNIT_RANGE", "$.supportFloors.failureCeiling"],
      [(d) => { d.krippendorffAlphaByField["office.city"] = Number.POSITIVE_INFINITY; },
        "NON_FINITE", "$.krippendorffAlphaByField.office.city"],
      [(d) => { d.records = {}; }, "NOT_ARRAY", "$.records"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeMetricsImport());
      mutate(doc);
      refuse(() => parseMetricsImportFile(doc), code, path);
    }
    for (const badKey of ["", "__proto__", "constructor", "prototype"]) {
      const doc = clone(makeMetricsImport()) as any;
      const m: Record<string, any> = {};
      Object.defineProperty(m, badKey, { value: 0.5, enumerable: true });
      doc.krippendorffAlphaByField = m;
      refuse(() => parseMetricsImportFile(doc), "BAD_MAP_KEY", `$.krippendorffAlphaByField.${badKey}`);
      const rm = clone(makeMetricsImport()) as any;
      const fm: Record<string, number> = {};
      Object.defineProperty(fm, badKey, { value: 1, enumerable: true });
      rm.records[0].failuresByCode = fm;
      refuse(() => parseMetricsImportFile(rm), "BAD_MAP_KEY", `$.records[0].failuresByCode.${badKey}`);
      const am = clone(makeMetricsImport()) as any;
      const sm: Record<string, unknown> = {};
      Object.defineProperty(sm, badKey, { value: { answered: 1, failed: 0, missing: 0 }, enumerable: true });
      am.annotatorRunStats = sm;
      refuse(() => parseMetricsImportFile(am), "BAD_MAP_KEY", `$.annotatorRunStats.${badKey}`);
    }
  });
});

describe("metrics.json record, sitePresence, weighted, diagnostics and tokens refusal matrix", () => {
  it("refuses every record-level count, string, interval, unit-range and optional sub-block defect", () => {
    for (const k of ["armId", "field", "comparator", "armMissionSha256"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.records[0][k] = " ";
      refuse(() => parseMetricsImportFile(doc), "EMPTY_STRING", `$.records[0].${k}`);
    }
    for (const k of [
      "attempted", "accepted", "failed", "unverifiedQuotesNulled", "goldPositive", "goldAbsent",
      "tp", "fp", "fpOnPresent", "fpOnAbsent", "fpElementsOnAbsent", "fn", "tn", "failedOnAbsent",
      "unresolved", "insufficient", "unverifiedWholeRecordsDropped", "costBasisItems",
    ]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.records[0][k] = 1.5;
      refuse(() => parseMetricsImportFile(doc), "BAD_COUNT", `$.records[0].${k}`);
    }
    for (const k of [
      "goldPresentSites", "goldAbsentSites", "unresolvedSites", "insufficientSites", "tpSites",
      "fnSites", "wrongValueOnPresentSites", "fpOnAbsentSites", "tnSites", "failedOnAbsentSites",
    ]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.records[0].sitePresence[k] = 1.5;
      refuse(() => parseMetricsImportFile(doc), "BAD_COUNT", `$.records[0].sitePresence.${k}`);
    }
    for (const k of ["input", "output", "reasoning", "total", "cached"]) {
      const doc = clone(makeMetricsImport()) as any;
      doc.records[0].tokens[k] = 1.5;
      refuse(() => parseMetricsImportFile(doc), "BAD_COUNT", `$.records[0].tokens.${k}`);
    }
    const zeroCalls = clone(makeMetricsImport()) as any;
    zeroCalls.records[0].calls = 0;
    expect(parseMetricsImportFile(zeroCalls).records[0]?.calls).toBe(0);
    const zeroCached = clone(makeMetricsImport()) as any;
    zeroCached.records[0].tokens.cached = 0;
    expect(parseMetricsImportFile(zeroCached).records[0]?.tokens).toEqual({
      input: 10000, output: 1500, reasoning: 200, cached: 0, total: 11700,
    });
    const zeroApiEq = clone(makeMetricsImport()) as any;
    zeroApiEq.records[0].apiEquivalentTotal = 0;
    expect(parseMetricsImportFile(zeroApiEq).records[0]?.apiEquivalentTotal).toBe(0);
    const noF1Iv = clone(makeMetricsImport()) as any;
    delete noF1Iv.records[0].weighted.f1Interval;
    expect(parseMetricsImportFile(noF1Iv).records[0]?.weighted?.f1Interval).toBeUndefined();

    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.records[0].extra = 1; }, "UNKNOWN_KEY", "$.records[0].extra"],
      [(d) => { d.records[0].sitePresence.extra = 1; }, "UNKNOWN_KEY", "$.records[0].sitePresence.extra"],
      [(d) => { d.records[0].unweighted.extra = 1; }, "UNKNOWN_KEY", "$.records[0].unweighted.extra"],
      [(d) => { d.records[0].weighted.extra = 1; }, "UNKNOWN_KEY", "$.records[0].weighted.extra"],
      [(d) => { d.records[0].independentGroupSupport.extra = 1; },
        "UNKNOWN_KEY", "$.records[0].independentGroupSupport.extra"],
      [(d) => { d.records[0].diagnostics.extra = 1; }, "UNKNOWN_KEY", "$.records[0].diagnostics.extra"],
      [(d) => { d.records[0].diagnostics.broad.extra = 1; }, "UNKNOWN_KEY", "$.records[0].diagnostics.broad.extra"],
      [(d) => { d.records[0].tokens.extra = 1; }, "UNKNOWN_KEY", "$.records[0].tokens.extra"],
      [(d) => { delete d.records[0].insufficient; }, "MISSING_KEY", "$.records[0].insufficient"],
      [(d) => { delete d.records[0].fpElementsOnAbsent; }, "MISSING_KEY", "$.records[0].fpElementsOnAbsent"],
      [(d) => { d.records[0].isPrimaryComparator = "yes"; }, "WRONG_TYPE", "$.records[0].isPrimaryComparator"],
      [(d) => { d.records[0].failuresByCode.llm_error = 1.5; }, "BAD_COUNT", "$.records[0].failuresByCode.llm_error"],
      [(d) => { d.records[0].sitePresence.siteRecall = 1.01; },
        "UNIT_RANGE", "$.records[0].sitePresence.siteRecall"],
      [(d) => { d.records[0].sitePresence.siteRecall = -0.01; },
        "UNIT_RANGE", "$.records[0].sitePresence.siteRecall"],
      [(d) => { d.records[0].sitePresence.siteAbstentionSpecificity = 1.01; },
        "UNIT_RANGE", "$.records[0].sitePresence.siteAbstentionSpecificity"],
      [(d) => { d.records[0].sitePresence.siteAbstentionSpecificity = -0.01; },
        "UNIT_RANGE", "$.records[0].sitePresence.siteAbstentionSpecificity"],
      [(d) => { d.records[0].sitePresence.siteRecallInterval.low = 0.9; },
        "INTERVAL_ORDER", "$.records[0].sitePresence.siteRecallInterval"],
      [(d) => { d.records[0].sitePresence.siteAbstentionInterval.high = 1.1; },
        "INTERVAL_RANGE", "$.records[0].sitePresence.siteAbstentionInterval.high"],
      [(d) => { d.records[0].unweighted.precision = 1.01; }, "UNIT_RANGE", "$.records[0].unweighted.precision"],
      [(d) => { d.records[0].unweighted.recall = -0.01; }, "UNIT_RANGE", "$.records[0].unweighted.recall"],
      [(d) => { d.records[0].unweighted.f1 = 1.01; }, "UNIT_RANGE", "$.records[0].unweighted.f1"],
      [(d) => { d.records[0].unweighted.precisionInterval.low = 0.9; },
        "INTERVAL_ORDER", "$.records[0].unweighted.precisionInterval"],
      [(d) => { d.records[0].unweighted.recallInterval.clustering = "clustered_record_invalid"; },
        "BAD_INTERVAL", "$.records[0].unweighted.recallInterval"],
      [(d) => { d.records[0].weighted.scheme = " "; }, "EMPTY_STRING", "$.records[0].weighted.scheme"],
      [(d) => { d.records[0].weighted.deff = 0; }, "NON_POSITIVE", "$.records[0].weighted.deff"],
      [(d) => { d.records[0].weighted.nEff = -0.01; }, "NEGATIVE", "$.records[0].weighted.nEff"],
      [(d) => { d.records[0].weighted.precision = 1.01; }, "UNIT_RANGE", "$.records[0].weighted.precision"],
      [(d) => { d.records[0].weighted.recall = -0.01; }, "UNIT_RANGE", "$.records[0].weighted.recall"],
      [(d) => { d.records[0].weighted.f1 = 1.01; }, "UNIT_RANGE", "$.records[0].weighted.f1"],
      [(d) => { d.records[0].weighted.precisionInterval.low = 0.9; },
        "INTERVAL_ORDER", "$.records[0].weighted.precisionInterval"],
      [(d) => { d.records[0].weighted.recallInterval.low = 0.9; },
        "INTERVAL_ORDER", "$.records[0].weighted.recallInterval"],
      [(d) => { d.records[0].weighted.f1Interval.low = 0.9; },
        "INTERVAL_ORDER", "$.records[0].weighted.f1Interval"],
      [(d) => { d.records[0].independentGroupSupport.predictions = 1.5; },
        "BAD_COUNT", "$.records[0].independentGroupSupport.predictions"],
      [(d) => { d.records[0].independentGroupSupport.positives = 1.5; },
        "BAD_COUNT", "$.records[0].independentGroupSupport.positives"],
      [(d) => { d.records[0].diagnostics.broad.tp = 1.5; }, "BAD_COUNT", "$.records[0].diagnostics.broad.tp"],
      [(d) => { d.records[0].diagnostics.broad.fp = 1.5; }, "BAD_COUNT", "$.records[0].diagnostics.broad.fp"],
      [(d) => { d.records[0].diagnostics.broad.fn = -1; }, "BAD_COUNT", "$.records[0].diagnostics.broad.fn"],
      [(d) => { d.records[0].diagnostics.broad.precision = 1.01; },
        "UNIT_RANGE", "$.records[0].diagnostics.broad.precision"],
      [(d) => { d.records[0].diagnostics.broad.recall = -0.01; },
        "UNIT_RANGE", "$.records[0].diagnostics.broad.recall"],
      [(d) => { d.records[0].diagnostics.broad.f1 = 1.01; },
        "UNIT_RANGE", "$.records[0].diagnostics.broad.f1"],
      [(d) => { d.records[0].diagnostics.conditionalRetainedRecall = 1.01; },
        "UNIT_RANGE", "$.records[0].diagnostics.conditionalRetainedRecall"],
      [(d) => { d.records[0].calls = 1.5; }, "BAD_COUNT", "$.records[0].calls"],
      [(d) => { d.records[0].calls = -1; }, "BAD_COUNT", "$.records[0].calls"],
      [(d) => { d.records[0].tokens.cached = -1; }, "BAD_COUNT", "$.records[0].tokens.cached"],
      [(d) => { d.records[0].costBasisItems = -1; }, "BAD_COUNT", "$.records[0].costBasisItems"],
      [(d) => { d.records[0].apiEquivalentTotal = -0.01; }, "NEGATIVE", "$.records[0].apiEquivalentTotal"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeMetricsImport());
      mutate(doc);
      refuse(() => parseMetricsImportFile(doc), code, path);
    }
  });
});

describe("dossier-meta.json boundaries, digit-free and Focus budget refusals", () => {
  it("accepts optional deletions, boundaries, lowercase utf-8 and non-parenthetical summaryProse", () => {
    for (const k of ["cursor", "readingBudgetMinutes", "amendmentTrace", "fieldLabels", "glossaryExtra"]) {
      const doc = clone(makeDossierMeta()) as any;
      delete doc[k];
      expect(parseDossierMetaFile(doc).language).toBe("en");
    }
    for (const lang of ["en", "fr"]) {
      const doc = clone(makeDossierMeta()) as any;
      doc.language = lang;
      expect(parseDossierMetaFile(doc).language).toBe(lang);
    }
    const noBudget = clone(makeDossierMeta()) as any;
    delete noBudget.readingBudgetMinutes;
    for (const lvl of ["low", "medium", "high"]) {
      const doc = clone(noBudget) as any;
      doc.stakesLevel = lvl;
      expect(parseDossierMetaFile(doc).stakesLevel).toBe(lvl);
    }
    const metaSingles: [(d: any) => void, (r: DossierMetaFile) => unknown, unknown][] = [
      [(d) => { d.ref = `report:${"x".repeat(115)}`; }, (r) => r.ref.length, 122],
      [(d) => { d.ref = `decision:${"y".repeat(113)}`; }, (r) => r.ref.length, 122],
      [(d) => { d.ownerRequestQuote = "12345678"; }, (r) => r.ownerRequestQuote, "12345678"],
      [(d) => { d.stakes = "a".repeat(20); }, (r) => r.stakes.length, 20],
      [(d) => { d.readingBudgetMinutes = 1; }, (r) => r.readingBudgetMinutes, 1],
      [(d) => { d.reviewStatus.summaryProse = "Awaiting h2a, and utf-8 check."; },
        (r) => r.reviewStatus.summaryProse, "Awaiting h2a, and utf-8 check."],
      [(d) => { d.reviewStatus.summaryProse = "Awaiting H2A and UTF-8 check."; },
        (r) => r.reviewStatus.summaryProse, "Awaiting H2A and UTF-8 check."],
    ];
    for (const [mutate, pick, expected] of metaSingles) {
      const doc = clone(makeDossierMeta()) as any;
      mutate(doc);
      expect(pick(parseDossierMetaFile(doc))).toEqual(expected);
    }
    const highDoc = { ...makeDossierMeta(), stakesLevel: "high" as const };
    expect(parseDossierMetaFile(highDoc).stakesLevel).toBe("high");
    const highBudgetOk = { ...highDoc, readingBudgetMinutes: 30 };
    expect(parseDossierMetaFile(highBudgetOk).readingBudgetMinutes).toBe(30);
    const medBudgetOk = { ...makeDossierMeta(), readingBudgetMinutes: 8 };
    expect(parseDossierMetaFile(medBudgetOk).readingBudgetMinutes).toBe(8);
    refuse(() => parseDossierMetaFile({ ...medBudgetOk, readingBudgetMinutes: 8.01 }),
      "BAD_SHAPE", "$.readingBudgetMinutes");
  });

  it("refuses empty/control ref, sub-block strings, digit rules and disproportionate budgets", () => {
    for (const bad of [null, [], "meta"]) {
      refuse(() => parseDossierMetaFile(bad), "NOT_OBJECT", "$");
    }
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "bad"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.provenance.extra = 1; }, "UNKNOWN_KEY", "$.provenance.extra"],
      [(d) => { d.reviewStatus.extra = 1; }, "UNKNOWN_KEY", "$.reviewStatus.extra"],
      [(d) => { d.origins.extra = 1; }, "UNKNOWN_KEY", "$.origins.extra"],
      [(d) => { d.origins.sourcePaths.results.extra = 1; }, "UNKNOWN_KEY", "$.origins.sourcePaths.results.extra"],
      [(d) => { d.origins.sourcePaths.brief.extra = 1; }, "UNKNOWN_KEY", "$.origins.sourcePaths.brief.extra"],
      [(d) => { d.origins.sourcePaths.brief.repo = "r"; }, "UNKNOWN_KEY", "$.origins.sourcePaths.brief.repo"],
      [(d) => { d.amendmentTrace[0].extra = "x"; }, "UNKNOWN_KEY", "$.amendmentTrace[0].extra"],
      [(d) => { d.fieldLabels["office.city"].de = "Stadt"; }, "UNKNOWN_KEY", "$.fieldLabels.office.city.de"],
      [(d) => { d.glossaryExtra[0].extra = "x"; }, "UNKNOWN_KEY", "$.glossaryExtra[0].extra"],
      [(d) => { delete d.provenance; }, "MISSING_KEY", "$.provenance"],
      [(d) => { delete d.provenance.readAt; }, "MISSING_KEY", "$.provenance.readAt"],
      [(d) => { delete d.amendmentTrace[0].summary; }, "MISSING_KEY", "$.amendmentTrace[0].summary"],
      [(d) => { delete d.origins.sourcePaths.results.path; }, "MISSING_KEY", "$.origins.sourcePaths.results.path"],
      [(d) => { d.ref = ""; }, "EMPTY_STRING", "$.ref"],
      [(d) => { d.ref = "   "; }, "EMPTY_STRING", "$.ref"],
      [(d) => { d.ref = "report:"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "decision:"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "other:slug"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "report:has space"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = " report:slug"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "report:slug "; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "report:has\nnewline"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "report:bad\x07char"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = "decision:bad\x7fchar"; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = `report:${"x".repeat(116)}`; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.ref = `decision:${"y".repeat(114)}`; }, "BAD_SHAPE", "$.ref"],
      [(d) => { d.language = "es"; }, "BAD_ENUM", "$.language"],
      [(d) => { d.stakesLevel = "critical"; }, "BAD_ENUM", "$.stakesLevel"],
      [(d) => { d.title = " "; }, "EMPTY_STRING", "$.title"],
      [(d) => { d.subject = ""; }, "EMPTY_STRING", "$.subject"],
      [(d) => { d.ownerRequestQuote = "       "; }, "EMPTY_STRING", "$.ownerRequestQuote"],
      [(d) => { d.ownerRequestQuote = "1234567"; }, "BAD_SHAPE", "$.ownerRequestQuote"],
      [(d) => { d.ownerRequestQuote = "  1234567  "; }, "BAD_SHAPE", "$.ownerRequestQuote"],
      [(d) => { d.stakes = "   "; }, "EMPTY_STRING", "$.stakes"],
      [(d) => { d.stakes = "a".repeat(19); }, "BAD_SHAPE", "$.stakes"],
      [(d) => { d.stakes = `  ${"a".repeat(19)}  `; }, "BAD_SHAPE", "$.stakes"],
      [(d) => { d.provenance.source = " "; }, "EMPTY_STRING", "$.provenance.source"],
      [(d) => { d.provenance.readAt = ""; }, "EMPTY_STRING", "$.provenance.readAt"],
      [(d) => { d.origins.defaultRepo = " "; }, "EMPTY_STRING", "$.origins.defaultRepo"],
      [(d) => { d.origins.defaultRevision = ""; }, "EMPTY_STRING", "$.origins.defaultRevision"],
      [(d) => { d.origins.sourcePaths.brief.uri = " "; }, "EMPTY_STRING", "$.origins.sourcePaths.brief.uri"],
      [(d) => { d.origins.sourcePaths.results.repo = " "; }, "EMPTY_STRING", "$.origins.sourcePaths.results.repo"],
      [(d) => { d.origins.sourcePaths.results.revision = ""; },
        "EMPTY_STRING", "$.origins.sourcePaths.results.revision"],
      [(d) => { d.origins.sourcePaths.results.path = " "; }, "EMPTY_STRING", "$.origins.sourcePaths.results.path"],
      [(d) => { d.cursor = " "; }, "EMPTY_STRING", "$.cursor"],
      [(d) => { d.readingBudgetMinutes = 0; }, "NON_POSITIVE", "$.readingBudgetMinutes"],
      [(d) => { d.readingBudgetMinutes = 0.99; }, "BAD_SHAPE", "$.readingBudgetMinutes"],
      [(d) => {
        d.stakesLevel = "high";
        d.readingBudgetMinutes = 30.01;
      }, "BAD_SHAPE", "$.readingBudgetMinutes"],
      [(d) => { d.reviewStatus.complete = "no"; }, "WRONG_TYPE", "$.reviewStatus.complete"],
      [(d) => { d.reviewStatus.summaryProse = " "; }, "EMPTY_STRING", "$.reviewStatus.summaryProse"],
      [(d) => { d.reviewStatus.summaryProse = "Pending until 2026-11-27."; },
        "BAD_SHAPE", "$.reviewStatus.summaryProse"],
      [(d) => { d.reviewStatus.summaryProse = "Astra 6.2 review pending."; },
        "BAD_SHAPE", "$.reviewStatus.summaryProse"],
      [(d) => { d.reviewStatus.summaryProse = "Round 2 open."; }, "BAD_SHAPE", "$.reviewStatus.summaryProse"],
      [(d) => { d.reviewStatus.summaryProse = "h2a2 check pending."; }, "BAD_SHAPE", "$.reviewStatus.summaryProse"],
      [(d) => { d.fieldLabels["office.city"].en = " "; }, "EMPTY_STRING", "$.fieldLabels.office.city.en"],
      [(d) => { d.fieldLabels["office.city"].fr = " "; }, "EMPTY_STRING", "$.fieldLabels.office.city.fr"],
      [(d) => { d.amendmentTrace[0].at = ""; }, "EMPTY_STRING", "$.amendmentTrace[0].at"],
      [(d) => { d.amendmentTrace[0].author = " "; }, "EMPTY_STRING", "$.amendmentTrace[0].author"],
      [(d) => { d.amendmentTrace[0].summary = ""; }, "EMPTY_STRING", "$.amendmentTrace[0].summary"],
      [(d) => { d.glossaryExtra[0].term = " "; }, "EMPTY_STRING", "$.glossaryExtra[0].term"],
      [(d) => { d.glossaryExtra[0].definition = ""; }, "EMPTY_STRING", "$.glossaryExtra[0].definition"],
      [(d) => { d.amendmentTrace = {}; }, "NOT_ARRAY", "$.amendmentTrace"],
      [(d) => { d.glossaryExtra = {}; }, "NOT_ARRAY", "$.glossaryExtra"],
      [(d) => { delete d.glossaryExtra[0].term; }, "MISSING_KEY", "$.glossaryExtra[0].term"],
      [(d) => { delete d.origins.sourcePaths.results.repo; }, "MISSING_KEY", "$.origins.sourcePaths.results.repo"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeDossierMeta());
      mutate(doc);
      refuse(() => parseDossierMetaFile(doc), code, path);
    }
    for (const badKey of ["", "__proto__", "constructor", "prototype"]) {
      const sp = clone(makeDossierMeta()) as any;
      const m1: Record<string, unknown> = {};
      Object.defineProperty(m1, badKey, { value: { uri: "https://example.invalid/x" }, enumerable: true });
      sp.origins.sourcePaths = m1;
      refuse(() => parseDossierMetaFile(sp), "BAD_MAP_KEY", `$.origins.sourcePaths.${badKey}`);
      const fl = clone(makeDossierMeta()) as any;
      const m2: Record<string, unknown> = {};
      Object.defineProperty(m2, badKey, { value: { en: "a", fr: "b" }, enumerable: true });
      fl.fieldLabels = m2;
      refuse(() => parseDossierMetaFile(fl), "BAD_MAP_KEY", `$.fieldLabels.${badKey}`);
    }
  });
});

describe("decisions.json word budget, options and ownerCriteria refusal matrix", () => {
  it("accepts 2..4 options, 160-char consequence, 360-word default budget and optional deletions", () => {
    const noCriterion = clone(makeDecisionsFile()) as any;
    delete noCriterion.questions[0].completionCriterion;
    expect(parseDecisionsFile(noCriterion).questions[0]?.completionCriterion).toBeUndefined();
    const noReadingTime = clone(makeDecisionsFile()) as any;
    delete noReadingTime.questions[0].readingTimeMinutes;
    expect(parseDecisionsFile(noReadingTime).questions[0]?.readingTimeMinutes).toBeUndefined();
    const maxCons = clone(makeDecisionsFile()) as any;
    maxCons.questions[0].options[0].consequence = "c".repeat(160);
    expect(parseDecisionsFile(maxCons).questions[0]?.options[0]?.consequence).toHaveLength(160);
    const maxRt = clone(makeDecisionsFile()) as any;
    maxRt.questions[0].readingTimeMinutes = 2.0;
    expect(parseDecisionsFile(maxRt).questions[0]?.readingTimeMinutes).toBe(2);
    const fourOpts = clone(makeDecisionsFile()) as any;
    fourOpts.questions[0].options.push(
      { id: "opt-3", label: "Option three", consequence: "Adds one overview chart.", body: "Body three." },
      { id: "opt-4", label: "Option four", consequence: "Waits for upstream change.", body: "Body four." },
    );
    expect(parseDecisionsFile(fourOpts).questions[0]?.options).toHaveLength(4);
    const nonEmptyGap = clone(makeDecisionsFile()) as any;
    nonEmptyGap.ownerCriteria[0].gapOrDeparture = "None";
    expect(parseDecisionsFile(nonEmptyGap).ownerCriteria[0]?.gapOrDeparture).toBe("None");

    const exact360 = clone(makeDecisionsFile()) as any;
    const q = exact360.questions[0];
    delete q.readingTimeMinutes;
    q.title = "w";
    q.question = "w";
    q.recommendedAnswer = "w";
    q.completionCriterion = "w";
    q.options = [
      { id: "opt-per-field", label: "w", consequence: "w", body: "w" },
      { id: "opt-2", label: "w", consequence: "w", body: "w" },
    ];
    q.context = Array.from({ length: 350 }, () => "w").join(" ");
    expect(parseDecisionsFile(exact360).questions).toHaveLength(1);
    q.context = Array.from({ length: 351 }, () => "w").join(" ");
    refuse(() => parseDecisionsFile(exact360), "BAD_SHAPE", "$.questions[0]");
  });

  it("refuses option bounds, empty question/option fields, word overflow and non-4-col ownerCriteria", () => {
    for (const bad of [null, [], "decisions"]) {
      refuse(() => parseDecisionsFile(bad), "NOT_OBJECT", "$");
    }
    for (const k of [
      "id", "title", "question", "context", "recommendedOptionId", "recommendedAnswer",
      "strongestObjectionProse", "overturnConditionProse", "failureScenarioProse", "presenterConvenienceProse",
    ]) {
      const emptyDoc = clone(makeDecisionsFile()) as any;
      emptyDoc.questions[0][k] = " ";
      refuse(() => parseDecisionsFile(emptyDoc), "EMPTY_STRING", `$.questions[0].${k}`);
      const missDoc = clone(makeDecisionsFile()) as any;
      delete missDoc.questions[0][k];
      refuse(() => parseDecisionsFile(missDoc), "MISSING_KEY", `$.questions[0].${k}`);
    }
    const cases: [(d: any) => void, BenchResultsErrorCode, string][] = [
      [(d) => { d.schemaId = "bad"; }, "BAD_SCHEMA", "$.schemaId"],
      [(d) => { d.extra = 1; }, "UNKNOWN_KEY", "$.extra"],
      [(d) => { d.questions = {}; }, "NOT_ARRAY", "$.questions"],
      [(d) => { d.questions = []; }, "BAD_SHAPE", "$.questions"],
      [(d) => { d.questions[0].options = {}; }, "NOT_ARRAY", "$.questions[0].options"],
      [(d) => { d.ownerCriteria = {}; }, "NOT_ARRAY", "$.ownerCriteria"],
      [(d) => { delete d.questions[0].options[0].id; }, "MISSING_KEY", "$.questions[0].options[0].id"],
      [(d) => { delete d.questions[0].options[0].label; }, "MISSING_KEY", "$.questions[0].options[0].label"],
      [(d) => { delete d.questions[0].options[0].consequence; },
        "MISSING_KEY", "$.questions[0].options[0].consequence"],
      [(d) => { delete d.ownerCriteria[0].criterion; }, "MISSING_KEY", "$.ownerCriteria[0].criterion"],
      [(d) => { delete d.ownerCriteria[0].requestSource; }, "MISSING_KEY", "$.ownerCriteria[0].requestSource"],
      [(d) => { delete d.ownerCriteria[0].addressedBy; }, "MISSING_KEY", "$.ownerCriteria[0].addressedBy"],
      [(d) => { d.questions.push(clone(d.questions[0])); }, "BAD_SHAPE", "$.questions[1].id"],
      [(d) => { d.questions[0].extra = 1; }, "UNKNOWN_KEY", "$.questions[0].extra"],
      [(d) => { d.questions[0].completionCriterion = " "; }, "EMPTY_STRING", "$.questions[0].completionCriterion"],
      [(d) => { d.questions[0].options[0].extra = 1; }, "UNKNOWN_KEY", "$.questions[0].options[0].extra"],
      [(d) => { delete d.questions[0].options[0].body; }, "MISSING_KEY", "$.questions[0].options[0].body"],
      [(d) => { d.questions[0].options[0].id = " "; }, "EMPTY_STRING", "$.questions[0].options[0].id"],
      [(d) => { d.questions[0].options[0].label = ""; }, "EMPTY_STRING", "$.questions[0].options[0].label"],
      [(d) => { d.questions[0].options[0].body = " "; }, "EMPTY_STRING", "$.questions[0].options[0].body"],
      [(d) => { d.questions[0].options[0].consequence = " "; },
        "EMPTY_STRING", "$.questions[0].options[0].consequence"],
      [(d) => { d.questions[0].options.pop(); }, "BAD_SHAPE", "$.questions[0].options"],
      [(d) => {
        d.questions[0].options.push(
          { id: "o3", label: "Three", consequence: "C3.", body: "B3." },
          { id: "o4", label: "Four", consequence: "C4.", body: "B4." },
          { id: "o5", label: "Five", consequence: "C5.", body: "B5." },
        );
      }, "BAD_SHAPE", "$.questions[0].options"],
      [(d) => { d.questions[0].options[1].id = "opt-per-field"; }, "BAD_SHAPE", "$.questions[0].options[1].id"],
      [(d) => { d.questions[0].recommendedOptionId = "opt-missing"; },
        "BAD_SHAPE", "$.questions[0].recommendedOptionId"],
      [(d) => { d.questions[0].options[0].consequence = "c".repeat(161); },
        "BAD_SHAPE", "$.questions[0].options[0].consequence"],
      [(d) => { d.questions[0].readingTimeMinutes = 0; }, "NON_POSITIVE", "$.questions[0].readingTimeMinutes"],
      [(d) => { d.questions[0].readingTimeMinutes = 2.01; }, "BAD_SHAPE", "$.questions[0].readingTimeMinutes"],
      [(d) => { d.questions[0].readingTimeMinutes = Number.NaN; }, "NON_FINITE", "$.questions[0].readingTimeMinutes"],
      [(d) => {
        delete d.questions[0].readingTimeMinutes;
        d.questions[0].context = `${"word ".repeat(361)}end`;
      }, "BAD_SHAPE", "$.questions[0]"],
      [(d) => { d.ownerCriteria = [["crit", "src", "addr", "gap"]]; }, "NOT_OBJECT", "$.ownerCriteria[0]"],
      [(d) => { d.ownerCriteria[0].extra = "x"; }, "UNKNOWN_KEY", "$.ownerCriteria[0].extra"],
      [(d) => { delete d.ownerCriteria[0].gapOrDeparture; }, "MISSING_KEY", "$.ownerCriteria[0].gapOrDeparture"],
      [(d) => { d.ownerCriteria[0].criterion = " "; }, "EMPTY_STRING", "$.ownerCriteria[0].criterion"],
      [(d) => { d.ownerCriteria[0].requestSource = ""; }, "EMPTY_STRING", "$.ownerCriteria[0].requestSource"],
      [(d) => { d.ownerCriteria[0].addressedBy = " "; }, "EMPTY_STRING", "$.ownerCriteria[0].addressedBy"],
      [(d) => { d.ownerCriteria[0].gapOrDeparture = 123; }, "WRONG_TYPE", "$.ownerCriteria[0].gapOrDeparture"],
    ];
    for (const [mutate, code, path] of cases) {
      const doc = clone(makeDecisionsFile());
      mutate(doc);
      refuse(() => parseDecisionsFile(doc), code, path);
    }
  });
});

describe("arm, seat and dossier-meta single-field optionality and perMillion.output sign", () => {
  it("refuses negative perMillion.output and accepts each nested optional field omitted on its own", () => {
    const negOut = clone(makeArmManifest()) as any;
    negOut.tariffOverride.perMillion.output = -0.01;
    refuse(() => parseArmManifest(negOut), "NEGATIVE", "$.tariffOverride.perMillion.output");

    const unknownFull = {
      schemaId: "urn:engram:seat-observation:1.0.0",
      status: "unknown",
      method: "unknown",
      reason: "missing-usage",
    };
    for (const k of ["schemaId", "method"] as const) {
      const doc = clone(unknownFull) as any;
      delete doc[k];
      const parsed = parseSeatObservationInput(doc);
      expect([parsed.status, Object.hasOwn(parsed, k)]).toEqual(["unknown", false]);
    }

    for (const k of ["schemaId", "planCurrency"] as const) {
      const doc = clone(makeMeasuredSeat()) as any;
      delete doc[k];
      const parsed = parseSeatObservationInput(doc);
      expect([parsed.status, Object.hasOwn(parsed, k)]).toEqual(["measured", false]);
    }

    const estWithSchema = { ...makeEstimatedSeat(), schemaId: "urn:engram:seat-observation:1.0.0" };
    expect(parseSeatObservationInput(estWithSchema).schemaId).toBe("urn:engram:seat-observation:1.0.0");
    for (const k of ["schemaId", "planCurrency", "isolatedSeat", "observedCurrency"] as const) {
      const doc = clone(estWithSchema) as any;
      delete doc[k];
      const parsed = parseSeatObservationInput(doc);
      expect([parsed.status, Object.hasOwn(parsed, k)]).toEqual(["estimated", false]);
    }
    const zeroEstPrice = { ...makeEstimatedSeat(), planMonthlyPrice: 0 };
    expect(parseSeatObservationInput(zeroEstPrice)).toMatchObject({ status: "estimated", planMonthlyPrice: 0 });

    const noSourcePaths = clone(makeDossierMeta()) as any;
    delete noSourcePaths.origins.sourcePaths;
    const parsedMeta = parseDossierMetaFile(noSourcePaths);
    expect([parsedMeta.origins.defaultRepo, parsedMeta.origins.sourcePaths]).toEqual(["rhanka/engram", undefined]);

    const missRev = clone(makeDossierMeta()) as any;
    delete missRev.origins.sourcePaths.results.revision;
    refuse(() => parseDossierMetaFile(missRev), "MISSING_KEY", "$.origins.sourcePaths.results.revision");

    const twoQuestions = clone(makeDecisionsFile()) as any;
    const secondQ = clone(twoQuestions.questions[0]);
    secondQ.id = "q-charts";
    twoQuestions.questions.push(secondQ);
    expect(parseDecisionsFile(twoQuestions).questions).toHaveLength(2);
  });
});

describe("metrics.json field-by-field nullability, diagnostics optionality and negative alpha", () => {
  it("accepts null on every nullable field, individual diagnostics omissions and negative alpha", () => {
    const nullMutations: [(d: any) => void, (r: BenchMetricsImportFile) => unknown][] = [
      [(d) => { d.krippendorffAlphaByField["office.city"] = null; },
        (r) => r.krippendorffAlphaByField["office.city"]],
      [(d) => { d.records[0].unverifiedWholeRecordsDropped = null; },
        (r) => r.records[0]?.unverifiedWholeRecordsDropped],
      [(d) => { d.records[0].weighted = null; },
        (r) => r.records[0]?.weighted],
      [(d) => { d.records[0].sitePresence.siteRecall = null; },
        (r) => r.records[0]?.sitePresence.siteRecall],
      [(d) => { d.records[0].sitePresence.siteAbstentionSpecificity = null; },
        (r) => r.records[0]?.sitePresence.siteAbstentionSpecificity],
      [(d) => { d.records[0].unweighted.precision = null; },
        (r) => r.records[0]?.unweighted.precision],
      [(d) => { d.records[0].unweighted.recall = null; },
        (r) => r.records[0]?.unweighted.recall],
      [(d) => { d.records[0].unweighted.f1 = null; },
        (r) => r.records[0]?.unweighted.f1],
      [(d) => { d.records[0].weighted.deff = null; },
        (r) => r.records[0]?.weighted?.deff],
      [(d) => { d.records[0].weighted.nEff = null; },
        (r) => r.records[0]?.weighted?.nEff],
      [(d) => { d.records[0].weighted.precision = null; },
        (r) => r.records[0]?.weighted?.precision],
      [(d) => { d.records[0].weighted.recall = null; },
        (r) => r.records[0]?.weighted?.recall],
      [(d) => { d.records[0].weighted.f1 = null; },
        (r) => r.records[0]?.weighted?.f1],
      [(d) => { d.records[0].diagnostics.broad.precision = null; },
        (r) => r.records[0]?.diagnostics?.broad?.precision],
      [(d) => { d.records[0].diagnostics.broad.recall = null; },
        (r) => r.records[0]?.diagnostics?.broad?.recall],
      [(d) => { d.records[0].diagnostics.broad.f1 = null; },
        (r) => r.records[0]?.diagnostics?.broad?.f1],
      [(d) => { d.records[0].diagnostics.conditionalRetainedRecall = null; },
        (r) => r.records[0]?.diagnostics?.conditionalRetainedRecall],
    ];
    for (const [mutate, pick] of nullMutations) {
      const doc = clone(makeMetricsImport()) as any;
      mutate(doc);
      expect(pick(parseMetricsImportFile(doc))).toBeNull();
    }

    const noBroad = clone(makeMetricsImport()) as any;
    delete noBroad.records[0].diagnostics.broad;
    expect(parseMetricsImportFile(noBroad).records[0]?.diagnostics).toEqual({ conditionalRetainedRecall: 0.81 });

    const noCondRecall = clone(makeMetricsImport()) as any;
    delete noCondRecall.records[0].diagnostics.conditionalRetainedRecall;
    expect(parseMetricsImportFile(noCondRecall).records[0]?.diagnostics?.conditionalRetainedRecall).toBeUndefined();

    const emptyDiag = clone(makeMetricsImport()) as any;
    emptyDiag.records[0].diagnostics = {};
    expect(parseMetricsImportFile(emptyDiag).records[0]?.diagnostics).toEqual({});

    const negAlpha = clone(makeMetricsImport()) as any;
    negAlpha.krippendorffAlphaByField["office.city"] = -0.12;
    expect(parseMetricsImportFile(negAlpha).krippendorffAlphaByField["office.city"]).toBe(-0.12);

    const zeroAlpha = clone(makeMetricsImport()) as any;
    zeroAlpha.krippendorffAlphaByField["office.city"] = 0;
    expect(parseMetricsImportFile(zeroAlpha).krippendorffAlphaByField["office.city"]).toBe(0);

    const zeroNeff = clone(makeMetricsImport()) as any;
    zeroNeff.records[0].weighted.nEff = 0;
    expect(parseMetricsImportFile(zeroNeff).records[0]?.weighted?.nEff).toBe(0);

    const intCached = clone(makeMetricsImport()) as any;
    intCached.records[0].tokens.cached = 12;
    expect(parseMetricsImportFile(intCached).records[0]?.tokens).toEqual({
      input: 10000, output: 1500, reasoning: 200, cached: 12, total: 11700,
    });

    for (const k of ["calls", "tokens", "apiEquivalentTotal"] as const) {
      const doc = clone(makeMetricsImport()) as any;
      doc.records[0][k] = "unknown";
      expect(parseMetricsImportFile(doc).records[0]?.[k]).toBe("unknown");
    }
  });
});

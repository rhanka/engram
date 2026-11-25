import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ARM_MANIFEST_SCHEMA_ID, ARM_TARIFF_STATUSES, DECISIONS_SCHEMA_ID, DOSSIER_LANGUAGES,
  DOSSIER_META_SCHEMA_ID, METRICS_IMPORT_SCHEMA_ID, SEAT_OBSERVATION_SCHEMA_ID, SEAT_OBSERVATION_WINDOW_MINUTES,
  STAKES_LEVELS, parseArmManifest, parseMetricsImportFile, parseSeatObservationInput, parseSeatObservationsFile,
  readArmManifest, readMetricsImportFile, readSeatObservationInput, readSeatObservationsFile, type ArmManifestFile,
  type ArmTariffStatus, type BenchDecisionsFile, type BenchMetricsImportFile, type DossierLanguage,
  type DossierMetaFile, type SeatObservationInput, type SeatObservationsFile, type StakesLevel
} from "../src/bench-dossier/companion-contracts.js";
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

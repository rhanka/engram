import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { ARM_MANIFEST_SCHEMA_ID, ARM_TARIFF_STATUSES, DECISIONS_SCHEMA_ID, DOSSIER_LANGUAGES,
  DOSSIER_META_SCHEMA_ID, METRICS_IMPORT_SCHEMA_ID, SEAT_OBSERVATION_SCHEMA_ID, SEAT_OBSERVATION_WINDOW_MINUTES,
  STAKES_LEVELS, parseArmManifest, parseSeatObservationInput, parseSeatObservationsFile, readArmManifest,
  readSeatObservationInput, readSeatObservationsFile, type ArmManifestFile, type ArmTariffStatus,
  type BenchDecisionsFile, type BenchMetricsImportFile, type DossierLanguage, type DossierMetaFile,
  type SeatObservationInput, type SeatObservationsFile, type StakesLevel
} from "../src/bench-dossier/companion-contracts.js";
import { BenchResultsValidationError, type BenchResultsErrorCode } from "../src/bench-dossier/results-guards.js";

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

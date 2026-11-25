import { describe, expect, expectTypeOf, it } from "vitest";
import { ARM_MANIFEST_SCHEMA_ID, ARM_TARIFF_STATUSES, DECISIONS_SCHEMA_ID, DOSSIER_LANGUAGES,
  DOSSIER_META_SCHEMA_ID, METRICS_IMPORT_SCHEMA_ID, SEAT_OBSERVATION_SCHEMA_ID, SEAT_OBSERVATION_WINDOW_MINUTES,
  STAKES_LEVELS, type ArmManifestFile, type ArmTariffStatus, type BenchDecisionsFile,
  type BenchMetricsImportFile, type DossierLanguage, type DossierMetaFile, type SeatObservationInput,
  type SeatObservationsFile, type StakesLevel } from "../src/bench-dossier/companion-types.js";

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

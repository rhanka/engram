import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COST_BASIS_KINDS, COST_UNKNOWN_REASONS, CURRENCY_CODES, EFFORT_LEVELS, ESTIMATOR_KINDS,
  INTERVAL_CLUSTERINGS, INTERVAL_METHODS, PARTITION_KINDS, SEAT_METHODS, SEAT_STATUSES,
  SEAT_UNKNOWN_REASONS, TARIFF_STATUSES, type BenchCostBlock, type BenchInterval, type CostBasisKind,
  type CostUnknownReason, type CurrencyCode, type EffortLevel, type EstimatorKind, type PartitionKind,
  type SeatUnknownReason, type SitePresenceMatrix, type UnknownOrNumber, type WeightedEstimateBlock,
} from "../src/bench-dossier/results-types-blocks.js";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION,
  type BenchResultRecord, type BenchResultsFile,
} from "../src/bench-dossier/results-types.js";

describe("BenchResultsFile block types", () => {
  it("covers all leaf union literals and block interfaces", () => {
    const enumCases: [readonly string[], readonly string[]][] = [
      [EFFORT_LEVELS, ["off", "minimal", "low", "medium", "high", "xhigh", "max", "cascade"]],
      [CURRENCY_CODES, ["USD", "CAD"]],
      [ESTIMATOR_KINDS, ["unweighted", "weighted"]],
      [PARTITION_KINDS, ["pilot", "eval", "sealed", "blind", "full"]],
      [COST_BASIS_KINDS, ["extracted_packet", "attempted_id", "supplied_id"]],
      [COST_UNKNOWN_REASONS, [
        "unpriced-mission", "reasoning-rate-missing", "incomplete-invocation-summary", "missing-usage",
      ]],
      [SEAT_UNKNOWN_REASONS, [
        "missing-observation", "weekly-window-source-gap", "non-weekly-window", "shared-seat-concurrent",
        "no-quota-delta", "plan-source-gap", "transport-mismatch", "missing-usage", "api-equivalent-source-gap",
      ]],
      [INTERVAL_METHODS, ["wilson_95_unweighted", "design_bootstrap_95", "clopper_pearson_95_one_sided", "none"]],
      [INTERVAL_CLUSTERINGS, ["independent_site", "clustered_record_invalid", "group_resampled"]],
      [TARIFF_STATUSES, ["primary", "secondary_unverified", "unknown"]],
      [SEAT_STATUSES, ["measured", "estimated", "unknown"]],
      [SEAT_METHODS, ["weekly_burn_delta", "api_cost_proportional", "unknown"]],
    ];
    for (const [actual, expected] of enumCases) {
      expect(actual).toEqual(expected);
      expect(new Set(actual).size).toBe(expected.length);
    }
    expectTypeOf<(typeof EFFORT_LEVELS)[number]>().toEqualTypeOf<EffortLevel>();
    expectTypeOf<(typeof CURRENCY_CODES)[number]>().toEqualTypeOf<CurrencyCode>();
    expectTypeOf<(typeof ESTIMATOR_KINDS)[number]>().toEqualTypeOf<EstimatorKind>();
    expectTypeOf<(typeof PARTITION_KINDS)[number]>().toEqualTypeOf<PartitionKind>();
    expectTypeOf<(typeof COST_BASIS_KINDS)[number]>().toEqualTypeOf<CostBasisKind>();
    expectTypeOf<(typeof COST_UNKNOWN_REASONS)[number]>().toEqualTypeOf<CostUnknownReason>();
    expectTypeOf<(typeof SEAT_UNKNOWN_REASONS)[number]>().toEqualTypeOf<SeatUnknownReason>();
    expectTypeOf<(typeof INTERVAL_METHODS)[number]>().toEqualTypeOf<BenchInterval["method"]>();
    expectTypeOf<(typeof INTERVAL_CLUSTERINGS)[number]>().toEqualTypeOf<BenchInterval["clustering"]>();
    expectTypeOf<(typeof TARIFF_STATUSES)[number]>().toEqualTypeOf<BenchCostBlock["tariffStatus"]>();
    expectTypeOf<(typeof SEAT_STATUSES)[number]>().toEqualTypeOf<BenchCostBlock["seatStatus"]>();
    expectTypeOf<(typeof SEAT_METHODS)[number]>().toEqualTypeOf<BenchCostBlock["seatMethod"]>();
    expectTypeOf<UnknownOrNumber>().toEqualTypeOf<number | "unknown">();
    const iv: BenchInterval = { estimator: "unweighted", method: "wilson_95_unweighted",
      clustering: "independent_site", valid: true, low: 0.48, high: 0.81 };
    const site: SitePresenceMatrix = { goldPresentSites: 30, goldAbsentSites: 12, unresolvedSites: 2,
      insufficientSites: 3, tpSites: 20, fnSites: 10, wrongValueOnPresentSites: 4, fpOnAbsentSites: 2,
      tnSites: 9, failedOnAbsentSites: 1, siteRecall: 2 / 3, siteRecallInterval: iv,
      siteAbstentionSpecificity: 9 / 11, siteAbstentionInterval: iv };
    const weighted: WeightedEstimateBlock = { scheme: "ht_v1", deff: 1.14, nEff: 26.3,
      precision: 0.68, recall: 0.65, f1: 0.665, precisionInterval: iv, recallInterval: iv };
    const cost: BenchCostBlock = { currency: "CAD", costBasisItems: 1705, costUnknownReason: null,
      apiEquivalentTotal: 1.23, apiEquivalentPerItem: 0.0007, tariffStatus: "primary",
      tariffSource: "openai", tariffAsOf: "2026-11-01",
      fxApplied: { from: "USD", to: "CAD", rate: 1.385, source: "boc", asOf: "2026-11-22" },
      seatStatus: "measured", seatMethod: "weekly_burn_delta", seatUnknownReason: null,
      seatSharePerItem: 0.003, seatCostPerItem: 0.087, seatPlan: "Pro", seatMonthlyPrice: 280,
      seatLimitScale: 1.5, seatPlanSource: "manual", seatPlanAsOf: "2026-11-20" };
    expect([site.tpSites, weighted.deff, cost.fxApplied?.rate]).toEqual([20, 1.14, 1.385]);
  });

  it("models BenchResultRecord and BenchResultsFile envelope", () => {
    const iv = { estimator: "unweighted", method: "none", clustering: "clustered_record_invalid",
      valid: false, low: null, high: null } satisfies BenchInterval;
    const site = { goldPresentSites: 10, goldAbsentSites: 5, unresolvedSites: 1, insufficientSites: 1,
      tpSites: 7, fnSites: 3, wrongValueOnPresentSites: 1, fpOnAbsentSites: 1, tnSites: 3,
      failedOnAbsentSites: 0, siteRecall: 0.7, siteRecallInterval: iv,
      siteAbstentionSpecificity: 0.75, siteAbstentionInterval: iv } satisfies SitePresenceMatrix;
    const cost = { currency: "USD", costBasisItems: 10, costUnknownReason: "unpriced-mission",
      apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown", tariffStatus: "unknown",
      tariffSource: null, tariffAsOf: null, fxApplied: null, seatStatus: "unknown", seatMethod: "unknown",
      seatUnknownReason: "missing-observation", seatSharePerItem: "unknown", seatCostPerItem: "unknown",
      seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null,
      seatPlanAsOf: null } satisfies BenchCostBlock;
    const rec = { armId: "c1", armMissionSha256: "a".repeat(64), missingDigestAllowed: true,
      provider: "Cascades", model: "c1", modelLabel: "C1", proseName: "C1", effort: "cascade",
      isCascade: true, isHighlighted: false, incomplete: false, field: "office.city", comparator: "v1",
      isPrimaryComparator: true, attempted: 10, accepted: 9, failed: 1, failuresByCode: { err: 1 },
      unverifiedQuotesNulled: 0, unverifiedWholeRecordsDropped: null, goldPositive: 10, goldAbsent: 5,
      tp: 7, fp: 2, fpOnPresent: 1, fpOnAbsent: 1, fpElementsOnAbsent: 1, fn: 3, tn: 3,
      failedOnAbsent: 0, unresolved: 1, insufficient: 1, abstentionSpecificity: 0.75, sitePresence: site,
      unweighted: { precision: 7 / 9, recall: 0.7, f1: 0.737, precisionInterval: iv, recallInterval: iv },
      weighted: null, precision: null, recall: null, f1: null, precisionInterval: iv, recallInterval: iv,
      indeterminate: { precision: false, recall: false, f1: false }, calls: "unknown",
      callsPerItem: "unknown", tokens: "unknown", cost } satisfies BenchResultRecord;
    const file: BenchResultsFile = { schemaId: BENCH_RESULTS_SCHEMA_ID,
      schemaVersion: BENCH_RESULTS_SCHEMA_VERSION, generatedAt: "2026-11-25T10:00:00Z", campaignId: "lotb",
      corpus: { partition: "eval", primaryEstimator: "unweighted", costBasisLabel: "extracted_packet",
        currency: "USD", goldenMissionSha256: "b".repeat(64), candidateMissionSha256: "c".repeat(64),
        fieldShapeVerified: true, goldenSha256: "d".repeat(64), goldenIds: 10, fields: ["office.city"],
        annotatorCount: 1, krippendorffAlphaByField: { "office.city": 0.8 } },
      supportFloors: { recallMinPositives: 10, precisionMinPredictions: 10, failureCeiling: 0.1 },
      records: [rec] };
    expect([file.schemaId, file.schemaVersion, file.records[0]?.tokens]).toEqual([
      "urn:engram:bench-results:1.0.0", 1, "unknown",
    ]);
  });
});

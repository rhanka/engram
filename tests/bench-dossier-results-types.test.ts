import { describe, expect, expectTypeOf, it } from "vitest";
import {
  COST_BASIS_KINDS, COST_UNKNOWN_REASONS, CURRENCY_CODES, EFFORT_LEVELS, ESTIMATOR_KINDS,
  INTERVAL_CLUSTERINGS, INTERVAL_METHODS, PARTITION_KINDS, SEAT_METHODS, SEAT_STATUSES,
  SEAT_UNKNOWN_REASONS, TARIFF_STATUSES, type BenchCostBlock, type BenchInterval,
  type SitePresenceMatrix, type UnknownOrNumber, type WeightedEstimateBlock,
} from "../src/bench-dossier/results-types-blocks.js";

describe("BenchResultsFile block types", () => {
  it("covers all leaf union literals and block interfaces", () => {
    expect(EFFORT_LEVELS.length + CURRENCY_CODES.length + ESTIMATOR_KINDS.length).toBe(12);
    expect(PARTITION_KINDS.length + COST_BASIS_KINDS.length + COST_UNKNOWN_REASONS.length).toBe(12);
    expect(SEAT_UNKNOWN_REASONS.length + INTERVAL_METHODS.length + INTERVAL_CLUSTERINGS.length).toBe(16);
    expect(TARIFF_STATUSES.length + SEAT_STATUSES.length + SEAT_METHODS.length).toBe(9);
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
});

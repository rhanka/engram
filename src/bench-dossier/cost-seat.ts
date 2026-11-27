import { validPriceTable, type NormalizedPriceTable } from "../scrap/extract.js";
import * as companion from "./companion-contracts.js";
import * as contract from "./results-contract.js";
import * as guards from "./results-guards.js";
import { BenchCostSeatError } from "./cost-seat-parse.js";
import { convertCurrency, type ApiResult } from "./cost-seat-math.js";

export * from "./cost-seat-parse.js";
export { computeFromRates, convertCurrency, resolveApiCost, roundCostNano, type ApiResult } from "./cost-seat-math.js";

const DAYS_PER_MONTH = 365.25 / 12;
const WEEKS_PER_MONTH = DAYS_PER_MONTH / 7;

function unknownSeatResult(seatUnknownReason: contract.SeatUnknownReason) {
  return {
    seatStatus: "unknown" as const, seatMethod: "unknown" as const, seatUnknownReason,
    seatSharePerItem: "unknown" as const, seatCostPerItem: "unknown" as const,
    seatPlan: null, seatMonthlyPrice: null, seatLimitScale: null, seatPlanSource: null, seatPlanAsOf: null,
  };
}

/** Parse raw results.ndjson text into validated plain row objects. */
export function parseResultsNdjson(raw: string): Record<string, unknown>[] {
  if (typeof raw !== "string") guards.fail("WRONG_TYPE", "$");
  const rows: Record<string, unknown>[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (cause) {
      throw new guards.BenchResultsValidationError("BAD_JSON", "$", { cause });
    }
    rows.push(guards.assertPlainObject(parsed, `$.lines[${rows.length}]`));
  }
  return rows;
}

/** Validate and normalize a mission price_table via BD-0 validPriceTable, tagging structural errors. */
export function parseValidatedPriceTable(raw: unknown): NormalizedPriceTable | null {
  if (raw === undefined) return null;
  guards.assertPlainObject(raw, "$.priceTable");
  try {
    return validPriceTable(raw);
  } catch (cause) {
    const field = String(cause).includes("price_table.currency") ? "currency" : "status";
    throw new BenchCostSeatError("BAD_ENUM", `$.priceTable.${field}`, { cause });
  }
}

/** Derive measured, estimated, or unknown seat cost block in the target currency. */
export function resolveSeat(
  seat: companion.SeatObservationInput | undefined, api: ApiResult,
  arm: companion.ArmManifestFile, targetCurrency: contract.CurrencyCode,
) {
  if (!seat) return unknownSeatResult("missing-observation");
  if (seat.status === "unknown") return unknownSeatResult(seat.reason);
  const monthlyPrice = convertCurrency(seat.planMonthlyPrice, seat.planCurrency ?? targetCurrency,
    targetCurrency, arm.fx, "$.seat.planCurrency");
  const metadata = {
    seatUnknownReason: null, seatPlan: seat.plan, seatMonthlyPrice: monthlyPrice,
    seatPlanSource: seat.planSource, seatPlanAsOf: seat.planAsOf,
  };
  if (seat.status === "measured") {
    const delta = seat.remainingBefore - seat.remainingAfter;
    if (delta <= 0) return unknownSeatResult("no-quota-delta");
    const sharePerItem = delta / seat.observedItems;
    return {
      ...metadata, seatStatus: "measured" as const, seatMethod: "weekly_burn_delta" as const,
      seatSharePerItem: sharePerItem, seatCostPerItem: sharePerItem * ((monthlyPrice * 7) / DAYS_PER_MONTH),
      seatLimitScale: null,
    };
  }
  const observedApi = convertCurrency(seat.observedApiEquivalent, seat.observedCurrency ?? targetCurrency,
    targetCurrency, arm.fx, "$.seat.observedCurrency");
  if (typeof api.apiEquivalentPerItem !== "number") {
    return unknownSeatResult(api.costUnknownReason === "missing-usage"
      || api.costUnknownReason === "incomplete-invocation-summary" ? "missing-usage" : "api-equivalent-source-gap");
  }
  const scale = seat.targetPlanMultiplier / seat.basePlanMultiplier;
  return {
    ...metadata, seatStatus: "estimated" as const, seatMethod: "api_cost_proportional" as const,
    seatSharePerItem: "unknown" as const, seatLimitScale: scale,
    seatCostPerItem: api.apiEquivalentPerItem
      * (monthlyPrice / ((observedApi / seat.quotaDeltaFraction) * WEEKS_PER_MONTH * scale)),
  };
}

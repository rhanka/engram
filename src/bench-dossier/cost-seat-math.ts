import type { NormalizedPriceTable } from "../scrap/extract.js";
import type { ArmManifestFile } from "./companion-contracts.js";
import type { BenchCostBlock, BenchResultRecord, CostUnknownReason, CurrencyCode } from "./results-contract.js";
import { BenchCostSeatError, type InvocationUsageSummary } from "./cost-seat-parse.js";

const NANO_SCALE = 1_000_000_000;
export type ApiResult = Pick<BenchCostBlock, "costUnknownReason" | "apiEquivalentTotal" | "apiEquivalentPerItem">;

const unknownApiResult = (costUnknownReason: CostUnknownReason): ApiResult => ({
  costUnknownReason, apiEquivalentTotal: "unknown", apiEquivalentPerItem: "unknown",
});

function assertCurrencySupported(
  sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode, fx: ArmManifestFile["fx"], path: string,
): void {
  if (sourceCurrency !== targetCurrency && (!fx || fx.from !== sourceCurrency || fx.to !== targetCurrency)) {
    throw new BenchCostSeatError("CURRENCY_MISMATCH", path);
  }
}

function finalizeApiCost(
  raw: number, sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode, basis: number, fx: ArmManifestFile["fx"],
): ApiResult {
  const total = roundCostNano(convertCurrency(raw, sourceCurrency, targetCurrency, fx, "$.arm.fx"));
  if (basis === 0 && total > 0) throw new BenchCostSeatError("BAD_SHAPE", "$.cost.apiEquivalentTotal");
  return { costUnknownReason: null, apiEquivalentTotal: total, apiEquivalentPerItem: basis === 0 ? 0 : total / basis };
}

/** Round monetary totals half-up to 9 decimal places (nanodollar precision). */
export const roundCostNano = (value: number): number => Math.round(value * NANO_SCALE) / NANO_SCALE;

/** Apply FX rate once when source and target currencies differ; fail on missing or mismatched FX. */
export function convertCurrency(
  amount: number, from: CurrencyCode, to: CurrencyCode, fx: ArmManifestFile["fx"], path: string,
): number {
  assertCurrencySupported(from, to, fx, path);
  return from === to ? amount : amount * fx!.rate;
}

/** Compute rounded API cost and per-item basis quotient from summed tokens and per-million rates. */
export function computeFromRates(
  tokens: Exclude<BenchResultRecord["tokens"], "unknown">,
  rates: { readonly input: number; readonly output: number; readonly reasoning?: number },
  sourceCurrency: CurrencyCode, targetCurrency: CurrencyCode, basis: number, fx: ArmManifestFile["fx"],
): ApiResult {
  if (tokens.reasoning > 0 && rates.reasoning === undefined) return unknownApiResult("reasoning-rate-missing");
  const raw = (tokens.input * rates.input + tokens.output * rates.output
    + tokens.reasoning * (rates.reasoning ?? 0)) / 1_000_000;
  return finalizeApiCost(raw, sourceCurrency, targetCurrency, basis, fx);
}

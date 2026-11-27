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

/** Resolve population-exact API equivalent total and per-item cost with FX and tariff rules. */
export function resolveApiCost(
  usage: InvocationUsageSummary, arm: ArmManifestFile,
  priceTable: NormalizedPriceTable | null, targetCurrency: CurrencyCode,
): ApiResult {
  const override = arm.tariffOverride;
  const summaryCurrency = usage.summaryCurrencies[0];
  if (arm.fx && arm.fx.to !== targetCurrency) throw new BenchCostSeatError("CURRENCY_MISMATCH", "$.arm.fx.to");
  if (arm.fx && arm.fx.from === arm.fx.to && arm.fx.rate !== 1) {
    throw new BenchCostSeatError("CURRENCY_MISMATCH", "$.arm.fx.rate");
  }
  if (override?.currency !== undefined) {
    assertCurrencySupported(override.currency, targetCurrency, arm.fx, "$.arm.tariffOverride.currency");
  }
  if (usage.summaryCurrencies.length > 1) throw new BenchCostSeatError("CURRENCY_MISMATCH", "$.resultRows");
  if (priceTable && summaryCurrency !== undefined && priceTable.currency !== summaryCurrency && !override?.perMillion) {
    throw new BenchCostSeatError("CURRENCY_MISMATCH", "$.priceTable.currency");
  }
  const referenceCurrency = summaryCurrency ?? priceTable?.currency;
  if (!override?.perMillion && override?.currency !== undefined && referenceCurrency !== undefined
    && override.currency !== referenceCurrency) {
    throw new BenchCostSeatError("CURRENCY_MISMATCH", "$.arm.tariffOverride.currency");
  }
  if (usage.interrupted) return unknownApiResult("incomplete-invocation-summary");
  if (override?.perMillion) {
    if (usage.tokens === "unknown") return unknownApiResult("missing-usage");
    const sourceCurrency = override.currency ?? priceTable?.currency ?? (arm.fx ? arm.fx.from : targetCurrency);
    return computeFromRates(usage.tokens, override.perMillion, sourceCurrency, targetCurrency,
      usage.costBasisItems, arm.fx);
  }
  if (priceTable && (usage.summaryApiTotal === "unknown"
    || (usage.tokens !== "unknown" && usage.tokens.reasoning > 0 && priceTable.per_million.reasoning === undefined))) {
    if (usage.tokens === "unknown") return unknownApiResult("missing-usage");
    return computeFromRates(usage.tokens, priceTable.per_million, priceTable.currency, targetCurrency,
      usage.costBasisItems, arm.fx);
  }
  if (usage.summaryApiTotal !== "unknown") {
    const sourceCurrency = summaryCurrency ?? priceTable?.currency ?? override?.currency
      ?? (arm.fx ? arm.fx.from : targetCurrency);
    return finalizeApiCost(usage.summaryApiTotal, sourceCurrency, targetCurrency, usage.costBasisItems, arm.fx);
  }
  return unknownApiResult(usage.tokens === "unknown" ? "missing-usage" : "unpriced-mission");
}

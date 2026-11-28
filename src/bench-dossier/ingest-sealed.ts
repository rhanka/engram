import type { Mission, NormalizedPriceTable } from "../scrap/extract.js";
import type { ArmManifestFile, MetricsImportRecord, SeatObservationInput } from "./companion-contracts.js";
import {
  convertCurrency, parseValidatedPriceTable, resolveApiCost, resolveSeat, summarizeInvocationUsage,
  type ApiResult,
} from "./cost-seat.js";
import { BenchIngestError, normalizeDigest } from "./ingest-golden.js";
import { tokensEqual, type ImportedArmCostInput } from "./metrics-records.js";
import { ensure } from "./metrics-unweighted.js";
import {
  COST_SCHEMA, type BenchCostBlock, type BenchResultRecord, type CurrencyCode, type UnknownOrNumber,
} from "./results-contract.js";

function resolveSealedApi(
  apiTotal: UnknownOrNumber, basis: number, tokens: BenchResultRecord["tokens"],
  arm: ArmManifestFile, priceTable: NormalizedPriceTable | null, currency: CurrencyCode,
): ApiResult {
  const baseUsage = summarizeInvocationUsage([]);
  const usage = { ...baseUsage, costBasisItems: basis, tokens, summaryApiTotal: apiTotal };
  if (typeof apiTotal !== "number") return resolveApiCost(usage, arm, priceTable, currency);
  // Validate arm.fx, tariffOverride.currency, and priceTable.currency without double-converting numeric apiTotal.
  resolveApiCost({ ...usage, tokens: "unknown", summaryApiTotal: "unknown" }, arm, priceTable, currency);
  if (priceTable && (!arm.tariffOverride?.perMillion || arm.tariffOverride.currency === undefined)) {
    convertCurrency(0, priceTable.currency, currency, arm.fx, "$.priceTable.currency");
  }
  const localArm: ArmManifestFile = { ...arm, fx: undefined, tariffOverride: undefined };
  return resolveApiCost({ ...usage, summaryCurrencies: [currency] }, localArm, null, currency);
}

function assertConsistentSealedRecords(records: readonly MetricsImportRecord[], armId: string): string | undefined {
  const first = records[0]!;
  const firstSha = first.armMissionSha256 === undefined ? undefined : normalizeDigest(first.armMissionSha256);
  for (const rec of records.slice(1)) {
    const recSha = rec.armMissionSha256 === undefined ? undefined : normalizeDigest(rec.armMissionSha256);
    const sameTokens = rec.tokens === first.tokens
      || (rec.tokens !== undefined && first.tokens !== undefined && tokensEqual(rec.tokens, first.tokens));
    if (
      rec.calls !== first.calls || rec.costBasisItems !== first.costBasisItems || recSha !== firstSha
      || rec.apiEquivalentTotal !== first.apiEquivalentTotal || !sameTokens
    ) {
      throw new BenchIngestError("COST_CONFLICT", armId);
    }
  }
  return firstSha;
}

/** Derive sealed-custody ImportedArmCostInput delegating API pricing, FX, and seats to BD-4. */
export function resolveSealedArmCost(
  records: readonly MetricsImportRecord[], arm: ArmManifestFile, currency: CurrencyCode,
  digest: string, externalSeat: SeatObservationInput | undefined, rawPriceTable: Mission["price_table"],
): ImportedArmCostInput | undefined {
  const priceTable = parseValidatedPriceTable(rawPriceTable);
  if (records.length === 0) return undefined;
  const first = records[0]!;
  const firstSha = assertConsistentSealedRecords(records, arm.armId);
  const pinned = arm.missionPath !== undefined || arm.missionSha256 !== undefined;
  if (pinned && firstSha !== undefined && firstSha !== digest) {
    throw new BenchIngestError("MISSION_DIGEST_MISMATCH", arm.armId);
  }
  const effectivePriceTable = pinned || firstSha === undefined || firstSha === digest ? priceTable : null;
  const seat = externalSeat ?? arm.seat;
  const override = arm.tariffOverride;
  if (
    !externalSeat && (!seat || seat.status === "unknown") && !override?.perMillion
    && !effectivePriceTable && !arm.fx && override?.currency === undefined
  ) {
    return undefined;
  }
  const calls = first.calls ?? "unknown";
  const tokens = first.tokens ?? "unknown";
  const apiTotal = first.apiEquivalentTotal ?? "unknown";
  ensure((calls === "unknown" && typeof apiTotal !== "number") || first.costBasisItems !== undefined,
    "COST_BASIS", arm.armId);
  const basis = first.costBasisItems ?? 0;
  ensure(basis > 0 || calls === "unknown" || calls === 0, "COST_BASIS", arm.armId);
  const api = resolveSealedApi(apiTotal, basis, tokens, arm, effectivePriceTable, currency);
  const cost: BenchCostBlock = {
    currency, costBasisItems: basis, ...api,
    tariffStatus: override ? override.status : (arm.tariffStatus ?? effectivePriceTable?.status ?? "unknown"),
    tariffSource: override ? override.source : (effectivePriceTable?.source ?? null),
    tariffAsOf: override ? override.asOf : (effectivePriceTable?.as_of ?? null),
    fxApplied: arm.fx ? { ...arm.fx } : null, ...resolveSeat(seat, api, arm, currency),
  };
  COST_SCHEMA(cost, "$.cost");
  return {
    armMissionSha256: pinned ? digest : (firstSha ?? digest),
    calls, callsPerItem: calls === "unknown" ? "unknown" : basis === 0 ? 0 : calls / basis, tokens, cost,
  };
}

import { CURRENCY_CODES, type BenchResultRecord, type CurrencyCode, type UnknownOrNumber } from "./results-contract.js";
import {
  assertPlainObject, countInt, enumValue, fail, nonEmptyString, nonNegativeNumber, unknownOr,
  type BenchResultsErrorCode, type Validator,
} from "./results-guards.js";

export type CostSeatErrorCode = BenchResultsErrorCode | "CURRENCY_MISMATCH";
export type InvocationUsageSummary = ReturnType<typeof summarizeInvocationUsage>;

/** Typed cost/seat computation refusal carrying stable code, path, and optional cause. */
export class BenchCostSeatError extends Error {
  constructor(readonly code: CostSeatErrorCode, readonly path: string, detail?: { readonly cause?: unknown }) {
    super(`${code} at ${path}`, detail?.cause !== undefined ? { cause: detail.cause } : undefined);
    this.name = "BenchCostSeatError";
  }
}

const TOKEN_KEYS = ["input", "output", "reasoning", "total"] as const;
const CURRENCY = enumValue(CURRENCY_CODES);
const SUMMARY_TYPE = enumValue(["summary"]);
const OPTIONAL_COUNT = unknownOr(countInt);
const OPTIONAL_NONNEG = unknownOr(nonNegativeNumber);
const hasOwnDefined = (obj: Record<string, unknown>, key: string): boolean =>
  Object.hasOwn(obj, key) && obj[key] !== undefined;

function readInt(obj: Record<string, unknown>, key: string, path: string): number {
  if (!Object.hasOwn(obj, key)) fail("MISSING_KEY", `${path}.${key}`);
  countInt(obj[key], `${path}.${key}`);
  return obj[key] as number;
}

function readOptionalNumber(
  obj: Record<string, unknown>, key: string, path: string, check: Validator<number | "unknown">,
): number | null {
  if (!hasOwnDefined(obj, key)) return null;
  check(obj[key], `${path}.${key}`);
  return obj[key] === "unknown" ? null : (obj[key] as number);
}

/** Reconcile non-summary IDs against invocation summary rows and detect interrupted runs. */
export function summarizeInvocationUsage(resultRows: readonly unknown[]) {
  if (!Array.isArray(resultRows)) fail("NOT_ARRAY", "$.resultRows");
  const distinctIds = new Set<string>();
  const summaryCurrencies = new Set<CurrencyCode>();
  const missionDigests: string[] = [];
  const tokenTotals = { input: 0, output: 0, reasoning: 0, cached: 0, total: 0 };
  let nonSummaryRows = 0;
  let summaryRows = 0;
  let summaryItemCount = 0;
  let callsSum = 0;
  let apiSum = 0;
  let hasAllCalls = true;
  let hasAllTokens = true;
  let hasAllCached = true;
  let hasAllApi = true;
  let hasMissingDigest = false;

  for (let index = 0; index < resultRows.length; index++) {
    const rowPath = `$.resultRows[${index}]`;
    const row = assertPlainObject(resultRows[index], rowPath);
    if (row.type !== "summary") {
      if (hasOwnDefined(row, "type")) SUMMARY_TYPE(row.type, `${rowPath}.type`);
      if (!Object.hasOwn(row, "id")) fail("MISSING_KEY", `${rowPath}.id`);
      nonEmptyString(row.id, `${rowPath}.id`);
      distinctIds.add(row.id as string);
      nonSummaryRows++;
      continue;
    }
    summaryRows++;
    summaryItemCount += readInt(row, "ok", rowPath) + readInt(row, "failed", rowPath);
    if (hasOwnDefined(row, "mission_digest") && row.mission_digest !== null) {
      nonEmptyString(row.mission_digest, `${rowPath}.mission_digest`);
      missionDigests.push((row.mission_digest as string).trim());
    } else hasMissingDigest = true;
    const callsValue = readOptionalNumber(row, "calls_total", rowPath, OPTIONAL_COUNT);
    if (callsValue === null) hasAllCalls = false;
    else callsSum += callsValue;
    if (!hasOwnDefined(row, "tokens") || row.tokens === "unknown") hasAllTokens = false;
    else {
      const tokenBlock = assertPlainObject(row.tokens, `${rowPath}.tokens`);
      for (const tokenKey of TOKEN_KEYS) tokenTotals[tokenKey] += readInt(tokenBlock, tokenKey, `${rowPath}.tokens`);
      const cachedValue = readOptionalNumber(tokenBlock, "cached", `${rowPath}.tokens`, OPTIONAL_COUNT);
      if (cachedValue === null) hasAllCached = false;
      else tokenTotals.cached += cachedValue;
    }
    if (!hasOwnDefined(row, "cost")) hasAllApi = false;
    else {
      const costBlock = assertPlainObject(row.cost, `${rowPath}.cost`);
      if (hasOwnDefined(costBlock, "currency")) {
        CURRENCY(costBlock.currency, `${rowPath}.cost.currency`);
        summaryCurrencies.add(costBlock.currency as CurrencyCode);
      }
      const apiValue = readOptionalNumber(costBlock, "api_equivalent", `${rowPath}.cost`, OPTIONAL_NONNEG);
      if (apiValue === null) hasAllApi = false;
      else apiSum += apiValue;
    }
  }
  const interrupted = summaryItemCount !== nonSummaryRows;
  const costBasisItems = distinctIds.size;
  const complete = summaryRows > 0 && !interrupted;
  const calls: UnknownOrNumber = complete && hasAllCalls ? callsSum : "unknown";
  if (costBasisItems === 0 && typeof calls === "number" && calls > 0) {
    throw new BenchCostSeatError("BAD_SHAPE", "$.calls");
  }
  const callsPerItem: UnknownOrNumber = calls === "unknown"
    ? "unknown" : costBasisItems === 0 ? 0 : calls / costBasisItems;
  const tokens: BenchResultRecord["tokens"] = complete && hasAllTokens
    ? { ...tokenTotals, cached: hasAllCached ? tokenTotals.cached : "unknown" } : "unknown";
  const summaryApiTotal: UnknownOrNumber = complete && hasAllApi ? apiSum : "unknown";
  return {
    nonSummaryRows, summaryRows, summaryItemCount, interrupted, costBasisItems, calls, callsPerItem,
    tokens, summaryApiTotal, summaryCurrencies: [...summaryCurrencies], missionDigests, hasMissingDigest,
  };
}

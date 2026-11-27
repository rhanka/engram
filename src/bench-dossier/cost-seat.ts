import { validPriceTable, type NormalizedPriceTable } from "../scrap/extract.js";
import * as guards from "./results-guards.js";
import { BenchCostSeatError, type CostSeatErrorCode } from "./cost-seat-parse.js";

export { BenchCostSeatError, type CostSeatErrorCode };

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

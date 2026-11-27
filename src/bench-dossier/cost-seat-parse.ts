import { type BenchResultsErrorCode } from "./results-guards.js";

export type CostSeatErrorCode = BenchResultsErrorCode | "CURRENCY_MISMATCH";

/** Typed cost/seat computation refusal carrying stable code, path, and optional cause. */
export class BenchCostSeatError extends Error {
  constructor(readonly code: CostSeatErrorCode, readonly path: string, detail?: { readonly cause?: unknown }) {
    super(`${code} at ${path}`, detail?.cause !== undefined ? { cause: detail.cause } : undefined);
    this.name = "BenchCostSeatError";
  }
}

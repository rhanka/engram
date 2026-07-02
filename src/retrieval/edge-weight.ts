/**
 * Edge-weight numeric rule (C7a — BLOCKING).
 *
 * `confidence` on a graph edge is a STRING enum ("EXTRACTED" | "INFERRED" |
 * "AMBIGUOUS", `src/types.ts:11,82`) — it cannot be a multiplier. The numeric
 * fields are `weight?` and `confidence_score?` (`src/types.ts:85-86`). The
 * resolved PPR edge weight is, in priority order:
 *
 *   edgeWeight(e) = e.weight ?? e.confidence_score ?? mappedConfidence(e.confidence) ?? 1
 *
 * `mappedConfidence` is FROZEN as the Phase A default (Open Decision 8 = CLOSED)
 * and is serialized into the index `indexParams` block so it is covered by
 * `computeSearchIndexSignature` (C10a) — a future Phase-B retune flips
 * `graph_signature` rather than silently diverging offline vs Node.
 */

/** FROZEN — Phase A default. EXTRACTED >= INFERRED >= AMBIGUOUS. */
export const MAPPED_CONFIDENCE: Readonly<Record<string, number>> = Object.freeze({
  EXTRACTED: 1.0,
  INFERRED: 0.6,
  AMBIGUOUS: 0.3,
});

/**
 * Enum → numeric, returning `undefined` for any value outside the frozen enum
 * (so the final `?? 1` floors unknown edges to a uniform weight rather than
 * dropping them).
 */
export function mappedConfidence(confidence: unknown): number | undefined {
  if (typeof confidence !== "string") return undefined;
  const value = MAPPED_CONFIDENCE[confidence];
  return value;
}

export interface EdgeWeightFields {
  weight?: unknown;
  confidence_score?: unknown;
  confidence?: unknown;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve the numeric edge weight per the frozen rule:
 * `weight ?? confidence_score ?? mappedConfidence(confidence) ?? 1`.
 */
export function edgeWeight(edge: EdgeWeightFields): number {
  return (
    asFiniteNumber(edge.weight) ??
    asFiniteNumber(edge.confidence_score) ??
    mappedConfidence(edge.confidence) ??
    1
  );
}

import { describe, expect, it } from "vitest";

import {
  edgeWeight,
  MAPPED_CONFIDENCE,
  mappedConfidence,
} from "../src/retrieval/edge-weight.js";

describe("edge-weight rule + frozen mapping (T11 / C7a)", () => {
  it("resolves weight ?? confidence_score ?? mappedConfidence ?? 1 in priority order", () => {
    // numeric `weight` wins.
    expect(edgeWeight({ weight: 2.5, confidence_score: 0.1, confidence: "INFERRED" })).toBe(2.5);
    // falls through to confidence_score.
    expect(edgeWeight({ confidence_score: 0.4, confidence: "EXTRACTED" })).toBe(0.4);
    // falls through to mappedConfidence(confidence).
    expect(edgeWeight({ confidence: "EXTRACTED" })).toBe(1.0);
    expect(edgeWeight({ confidence: "INFERRED" })).toBe(0.6);
    expect(edgeWeight({ confidence: "AMBIGUOUS" })).toBe(0.3);
  });

  it("an edge with ONLY confidence:EXTRACTED (no numeric field) gets mappedConfidence", () => {
    expect(edgeWeight({ confidence: "EXTRACTED" })).toBe(MAPPED_CONFIDENCE.EXTRACTED);
  });

  it("floors an unknown enum value to a uniform 1 (does not drop the edge)", () => {
    expect(edgeWeight({ confidence: "WHATEVER" })).toBe(1);
    expect(edgeWeight({})).toBe(1);
    expect(mappedConfidence("WHATEVER")).toBeUndefined();
    expect(mappedConfidence(undefined)).toBeUndefined();
  });

  it("ignores non-finite numeric fields and falls through", () => {
    expect(edgeWeight({ weight: Number.NaN, confidence: "INFERRED" })).toBe(0.6);
    expect(edgeWeight({ weight: Infinity, confidence_score: 0.5 })).toBe(0.5);
  });

  it("FROZEN mapping equals the Phase A default {EXTRACTED:1.0, INFERRED:0.6, AMBIGUOUS:0.3}", () => {
    expect({ ...MAPPED_CONFIDENCE }).toEqual({ EXTRACTED: 1.0, INFERRED: 0.6, AMBIGUOUS: 0.3 });
    // ordering EXTRACTED >= INFERRED >= AMBIGUOUS is part of the freeze.
    expect(MAPPED_CONFIDENCE.EXTRACTED).toBeGreaterThanOrEqual(MAPPED_CONFIDENCE.INFERRED!);
    expect(MAPPED_CONFIDENCE.INFERRED).toBeGreaterThanOrEqual(MAPPED_CONFIDENCE.AMBIGUOUS!);
  });

  it("the mapping object is frozen (cannot be mutated at runtime)", () => {
    expect(Object.isFrozen(MAPPED_CONFIDENCE)).toBe(true);
  });
});

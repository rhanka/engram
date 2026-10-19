/** Sol R1 F09 (§6.11) + F10 (TR-06) + F11 (§6.4) + F12 (§6.1) — Identity, fingerprints, revisions. */
import { describe, expect, it } from "vitest";
import {
  summarizeReviewRounds,
  validateCohort,
  validateCollectionManifest,
  validateReviewWavesForLot,
  type ReviewWaveManifestV1,
} from "../../src/time-reference/index.js";
import { drivenCases, BASE_BUILDERS, codesOf, solRule, withPath } from "./sol-r1-helpers.js";

function wave(roundId: string, repo = "rhanka/h2a", lotOccurrence = "occ-1"): ReviewWaveManifestV1 {
  return {
    ...(BASE_BUILDERS["wave"]!() as unknown as ReviewWaveManifestV1),
    repo,
    lotOccurrence,
    roundId,
  };
}

function throwingCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? "thrown-without-code";
  }
  return "did-not-throw";
}

describe("Sol R1 F09/F10/F11/F12 identity and regime", () => {
  it("F09: duplicate identities and foreign-lot waves are rejected", () => {
    const rule = solRule("F09") as { cases: { mutation: string; code: string }[] };
    for (const c of drivenCases("F09", rule.cases)) {
      let waves: ReviewWaveManifestV1[];
      if (c.mutation === "duplicate-roundId") waves = [wave("r1"), wave("r1")];
      else if (c.mutation === "foreign-wave-repo") waves = [wave("r1", "evil/other")];
      else waves = [wave("r1", "rhanka/h2a", "occ-9")];
      expect(validateReviewWavesForLot(waves, "rhanka/h2a", "occ-1").map((d) => d.code)).toContain(c.code);
      expect(throwingCode(() => summarizeReviewRounds("rhanka/h2a", "occ-1", waves, "coverage-1"))).toBe(c.code);
    }
    // Distinct rounds of the same lot still summarize.
    const summary = summarizeReviewRounds("rhanka/h2a", "occ-1", [wave("r1"), wave("r2")], "coverage-1");
    expect(summary.completedCount).toBe(0);
  });

  it("F10: every fixture case rejects through the public cohort validation", () => {
    const rule = solRule("F10") as { cases: { mutation: string; code: string }[] };
    for (const c of drivenCases("F10", rule.cases)) {
      if (c.mutation !== "duplicate-memberIds") throw new Error(`unknown F10 mutation ${c.mutation}`);
      const dup = withPath<Record<string, unknown>>(BASE_BUILDERS["cohort"]!(), "memberIds", [327, 327]);
      (dup as Record<string, unknown>)["n"] = 2;
      expect(codesOf(validateCohort(dup)), c.mutation).toContain(c.code);
    }
  });

  it("F11: fingerprints carry every specified regime component", () => {
    const rule = solRule("F11") as { cases: { mutation: string; code: string }[] };
    for (const c of drivenCases("F11", rule.cases)) {
      const cohort = BASE_BUILDERS["cohort"]!();
      const fp = (cohort as Record<string, unknown>)["fingerprint"] as Record<string, unknown>;
      if (c.mutation === "empty-fingerprint") (cohort as Record<string, unknown>)["fingerprint"] = {};
      else if (c.mutation === "dropped-jobSet") delete fp["jobSet"];
      else fp["runner"] = "";
      expect(codesOf(validateCohort(cohort)), c.mutation).toContain(c.code);
    }
    expect(validateCohort(BASE_BUILDERS["cohort"]!()).ok).toBe(true);
  });

  it("F12: sourceRevision is a full immutable commit SHA", () => {
    const rule = solRule("F12") as { cases: { mutation: string; value: string; code: string }[] };
    for (const c of drivenCases("F12", rule.cases)) {
      const manifest = withPath<Record<string, unknown>>(BASE_BUILDERS["manifest"]!(), "sourceRevision", c.value);
      expect(codesOf(validateCollectionManifest(manifest)), c.mutation).toContain(c.code);
    }
    expect(validateCollectionManifest(BASE_BUILDERS["manifest"]!()).ok).toBe(true);
  });
});

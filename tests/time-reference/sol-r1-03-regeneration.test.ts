/** Sol R1 F03 (§8.1) + F04 (§6.1) — Regeneration recomputes every figure/maximum and authenticates samples. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  canonicalDigest,
  exportDigestOf,
  regenerateCheck,
  validateCommittedExport,
  type CommittedExportV1,
} from "../../src/time-reference/index.js";
import { SOL_SHARED, solRule, withPath } from "./sol-r1-helpers.js";

const REPO = SOL_SHARED["repo"] as string;
const DIGEST0 = SOL_SHARED["digest0"] as string;
const FP = () => JSON.parse(JSON.stringify(SOL_SHARED["fingerprint"]));
const FPD = SOL_SHARED["fingerprintDigest"] as string;
const WIN = () => JSON.parse(JSON.stringify(SOL_SHARED["window"]));

function samples(): { id: string; value: number }[] {
  return [
    { id: "s#A", value: 100 },
    { id: "s#B", value: 200 },
    { id: "s#C", value: 300 },
  ];
}

/** Pinned snapshot digest authenticates the canonical sample bytes (spec §6.1). */
function pin(): string {
  return canonicalDigest(samples());
}

function sealedExport(): CommittedExportV1 {
  const quantiles = {
    ...buildQuantileSet(samples(), { method: "nearest-rank/1", support: "descriptive" }),
    tailQualification: "nEff 3/1: descriptive tail over 3 samples, 1 campaign",
  };
  const series = {
    schema: "engram.time-reference/timing-series/1",
    seriesId: "s1",
    subject: REPO,
    metric: "pr_open_to_merge",
    cohortRef: { cohortKey: "astra-merged-desc/1", snapshotDigest: pin() },
    quantiles,
    unit: "second",
    window: WIN(),
    estimatorVersion: "e1",
    policyVersion: "p1",
    missingCount: 0,
    censoredCount: 0,
    exclusions: [],
    fingerprint: FP(),
    measured: true,
  };
  const estimate = {
    schema: "engram.time-reference/timing-estimate/1",
    estimateId: "e1",
    seriesRef: { seriesId: "s1", snapshotDigest: pin() },
    quantiles,
    applicability: "applicable",
    freshness: {
      window: WIN(),
      collectedAt: "2026-10-18T07:48:57Z",
      referencePublishedAt: "2026-10-18T21:00:00Z",
    },
    support: "descriptive",
    limitations: [],
  };
  const provenanceFor = (figureRef: string) => ({
    schema: "engram.time-reference/figure-provenance/1",
    figureRef,
    cohortKey: "astra-merged-desc/1",
    ruleId: "astra-merged-desc/1",
    snapshotDigest: pin(),
    referenceDigest: DIGEST0,
    referencePublishedAt: "2026-10-18T21:00:00Z",
    referencePublicationRevision: "rev-1",
    collectedAt: "2026-10-18T07:48:57Z",
    firstAvailableAt: null,
    appliesToRevision: "46b82b42781709f2a2ab1bec6707ba58131248f0",
    fingerprintDigest: FPD,
    estimatorVersion: "e1",
    policyVersion: "p1",
    quantileMethod: "nearest-rank/1",
  });
  const exp = {
    schema: "engram.time-reference/committed-export/1",
    repo: REPO,
    serviceRevision: "0.21.0",
    profileRef: { id: "repo-knowledge", version: "1", contentDigest: DIGEST0 },
    window: WIN(),
    generatedAt: "2026-10-18T21:00:00Z",
    generator: { name: "engram-time-reference", version: "0.21.0" },
    series: [series],
    estimates: [estimate],
    budgets: [],
    milestones: [],
    provenance: [provenanceFor("s1"), provenanceFor("e1")],
    exportDigest: DIGEST0,
  };
  return { ...exp, exportDigest: exportDigestOf(exp) } as unknown as CommittedExportV1;
}

function codesOfRegen(exp: CommittedExportV1, s: { id: string; value: number }[]): string[] {
  return regenerateCheck(exp, { s1: s }).map((d) => d.code);
}

describe("Sol R1 F03/F04 export regeneration", () => {
  it("a sealed export validates and regenerates cleanly", () => {
    const exp = sealedExport();
    expect(validateCommittedExport(exp).ok).toBe(true);
    expect(regenerateCheck(exp, { s1: samples() })).toEqual([]);
  });

  it("F03: every published figure and maximum is recomputed, in series and in estimates", () => {
    const rule = solRule("F03") as { cases: { mutation: string; code: string }[] };
    for (const c of rule.cases) {
      const bumped = withPath<CommittedExportV1>(sealedExport(), c.mutation, 999999);
      expect(codesOfRegen(bumped, samples()), c.mutation).toContain(c.code);
    }
  });

  it("F04: every fixture case authenticates through the public regeneration path", () => {
    const rule = solRule("F04") as { cases: { mutation: string; code: string }[] };
    for (const c of rule.cases) {
      const exp = sealedExport();
      const mutated =
        c.mutation === "renamed-sample-ids"
          ? samples().map((s, i) => ({ ...s, id: `other-${i}` }))
          : samples().map((s) => (s.id === "s#B" ? { ...s, value: 250 } : s));
      if (c.mutation === "renamed-sample-ids") {
        // Same values, renamed ids: quantiles identical, collected bytes differ.
        expect(
          buildQuantileSet(mutated, { method: "nearest-rank/1", support: "descriptive" }),
        ).toEqual(buildQuantileSet(samples(), { method: "nearest-rank/1", support: "descriptive" }));
      }
      expect(codesOfRegen(exp, mutated), c.mutation).toContain(c.code);
    }
  });

  it("F04: a derived weight change moves the figure, never the snapshot digest", () => {
    const exp = sealedExport();
    const reweighted = samples().map((s) => ({ ...s, weight: "2" }));
    // Collected {id, value} bytes are unchanged: authentication passes…
    expect(codesOfRegen(exp, reweighted)).not.toContain("sample-auth-mismatch");
  });

  it("an export omitting the optional maxSeconds regenerates cleanly", () => {
    const exp = sealedExport();
    const { maxSeconds: _m, ...quantilesWithoutMax } = exp.series[0]!.quantiles as Record<
      string,
      unknown
    >;
    const seriesWithoutMax = { ...exp.series[0], quantiles: quantilesWithoutMax };
    const withoutMax = {
      ...exp,
      series: [seriesWithoutMax],
      exportDigest: exportDigestOf({ ...exp, series: [seriesWithoutMax] }),
    } as unknown as CommittedExportV1;
    expect(validateCommittedExport(withoutMax).ok).toBe(true);
    expect(regenerateCheck(withoutMax, { s1: samples() })).toEqual([]);
  });

  it("authentic samples with a hand-edited figure still report quantile-mismatch", () => {
    const edited = withPath<CommittedExportV1>(sealedExport(), "series.0.quantiles.p50Seconds", 999999);
    expect(codesOfRegen(edited, samples())).toContain("quantile-mismatch");
  });
});

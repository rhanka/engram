/** Sol R1 F03 (§8.1) + F04 (§6.1) — Regeneration recomputes every figure/maximum and authenticates samples. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  canonicalJson,
  sampleSnapshotDigest,
  sha256Digest,
  openToMergeSample,
  type TimingSeriesV1,
  exportDigestOf,
  regenerateCheck,
  validateCommittedExport,
  type CommittedExportV1,
} from "../../src/time-reference/index.js";
import { drivenCases, SOL_SHARED, solRule, withPath } from "./sol-r1-helpers.js";

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

function snapshotBytes(): string {
  return canonicalJson({
    sourceRevision: "46b82b42781709f2a2ab1bec6707ba58131248f0",
    collectedAt: "2026-10-18T07:48:57Z",
    pullRequests: samples().map((s) => ({
      number: s.id,
      createdAt: "2026-10-18T07:00:00Z",
      mergedAt: new Date(Date.parse("2026-10-18T07:00:00Z") + s.value * 1000).toISOString(),
    })),
  });
}

function deriveSamples(snapshot: unknown, _series: TimingSeriesV1) {
  return (snapshot as { pullRequests: { number: string; createdAt: string; mergedAt: string }[] })
    .pullRequests.map((pr) => ({ id: pr.number, value: openToMergeSample(pr)! }));
}

function pin(): string {
  return sha256Digest(snapshotBytes());
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

function codesOfRegen(exp: CommittedExportV1, bytes = snapshotBytes()): string[] {
  return regenerateCheck(exp, { s1: bytes }, deriveSamples).map((d) => d.code);
}

describe("Sol R1 F03/F04 export regeneration", () => {
  it("a sealed export validates and regenerates cleanly", () => {
    const exp = sealedExport();
    expect(validateCommittedExport(exp).ok).toBe(true);
    expect(regenerateCheck(exp, { s1: snapshotBytes() }, deriveSamples)).toEqual([]);
  });

  it("F03: every published figure and maximum is recomputed, in series and in estimates", () => {
    const rule = solRule("F03") as { cases: { mutation: string; code: string }[] };
    for (const c of drivenCases("F03", rule.cases)) {
      const bumped = withPath<CommittedExportV1>(sealedExport(), c.mutation, 999999);
      expect(codesOfRegen(bumped), c.mutation).toContain(c.code);
    }
  });

  it("F04: every fixture case authenticates through the public regeneration path", () => {
    const rule = solRule("F04") as { cases: { mutation: string; code: string }[] };
    for (const c of drivenCases("F04", rule.cases)) {
      const exp = sealedExport();
      const snapshot = JSON.parse(snapshotBytes());
      let bytes: string;
      if (c.mutation === "derived-rows-digest") {
        bytes = snapshotBytes();
        const derivedPin = sha256Digest(canonicalJson(samples()));
        for (const series of exp.series) series.cohortRef.snapshotDigest = derivedPin;
        for (const estimate of exp.estimates) estimate.seriesRef.snapshotDigest = derivedPin;
        for (const provenance of exp.provenance) provenance.snapshotDigest = derivedPin;
        exp.exportDigest = exportDigestOf(exp as unknown as Record<string, unknown>);
      } else {
        if (c.mutation === "renamed-sample-ids") snapshot.pullRequests[1].number = "other-id";
        else if (c.mutation === "moved-sample-value") snapshot.pullRequests[1].mergedAt = "2026-10-18T07:04:10Z";
        else if (c.mutation === "collected-metadata") snapshot.collectedAt = "2026-10-18T08:00:00Z";
        else if (c.mutation === "unchanged-duration-new-instants") {
          for (const pr of snapshot.pullRequests) {
            pr.createdAt = new Date(Date.parse(pr.createdAt) + 1000).toISOString();
            pr.mergedAt = new Date(Date.parse(pr.mergedAt) + 1000).toISOString();
          }
          expect(deriveSamples(snapshot, exp.series[0]!)).toEqual(samples());
        } else throw new Error(`unknown F04 mutation ${c.mutation}`);
        bytes = canonicalJson(snapshot);
      }
      let derivations = 0;
      const errors = regenerateCheck(exp, { s1: bytes }, (snapshot, series) => {
        derivations++;
        return deriveSamples(snapshot, series);
      });
      expect(errors.map((e) => e.code), c.mutation).toContain(c.code);
      expect(derivations, "unauthenticated bytes never reach the sample adapter").toBe(0);
    }
  });

  it("F04: the sample adapter receives the authenticated collected snapshot", () => {
    const exp = sealedExport();
    let received: unknown;
    expect(sampleSnapshotDigest(snapshotBytes())).toBe(pin());
    expect(regenerateCheck(exp, { s1: Buffer.from(snapshotBytes()) }, (snapshot, series) => {
      received = snapshot;
      return deriveSamples(snapshot, series);
    })).toEqual([]);
    expect(received).toEqual(JSON.parse(snapshotBytes()));
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
    expect(regenerateCheck(withoutMax, { s1: snapshotBytes() }, deriveSamples)).toEqual([]);
  });

  it("authentic samples with a hand-edited figure still report quantile-mismatch", () => {
    const edited = withPath<CommittedExportV1>(sealedExport(), "series.0.quantiles.p50Seconds", 999999);
    expect(codesOfRegen(edited)).toContain("quantile-mismatch");
  });
});

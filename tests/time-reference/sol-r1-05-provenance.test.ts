/** Sol R1 F06 (§6.7) — Exactly one matching provenance record per published figure. */
import { describe, expect, it } from "vitest";
import {
  buildQuantileSet,
  exportDigestOf,
  sampleSnapshotDigest,
  validateCommittedExport,
  type CommittedExportV1,
} from "../../src/time-reference/index.js";
import { SOL_SHARED, solRule, withPath } from "./sol-r1-helpers.js";

const REPO = SOL_SHARED["repo"] as string;
const DIGEST0 = SOL_SHARED["digest0"] as string;
const FP = () => JSON.parse(JSON.stringify(SOL_SHARED["fingerprint"]));
const FPD = SOL_SHARED["fingerprintDigest"] as string;
const WIN = () => JSON.parse(JSON.stringify(SOL_SHARED["window"]));
const QS = () => ({
  ...JSON.parse(JSON.stringify(SOL_SHARED["validQuantileSet"])),
  ...buildQuantileSet(
    [
      { id: "s#A", value: 100 },
      { id: "s#B", value: 200 },
      { id: "s#C", value: 300 },
    ],
    { method: "nearest-rank/1" as const, support: "descriptive" as const },
  ),
  tailQualification: "nEff 3/1: descriptive tail over 3 samples, 1 campaign",
});

function pin(): string {
  return sampleSnapshotDigest([
    { id: "s#A", value: 100 },
    { id: "s#B", value: 200 },
    { id: "s#C", value: 300 },
  ]);
}

function sealedExport(): CommittedExportV1 {
  const quantiles = QS();
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
    estimates: [],
    budgets: [],
    milestones: [],
    provenance: [provenanceFor("s1")],
    exportDigest: DIGEST0,
  };
  return { ...exp, exportDigest: exportDigestOf(exp) } as unknown as CommittedExportV1;
}

describe("Sol R1 F06 provenance matching", () => {
  it("a sealed export validates", () => {
    expect(validateCommittedExport(sealedExport()).ok).toBe(true);
  });

  it("contradictory or duplicated provenance fails with its typed code", () => {
    const rule = solRule("F06") as { cases: { mutation: string; value?: unknown; code: string }[] };
    for (const c of rule.cases) {
      let mutated: CommittedExportV1;
      if (c.mutation === "duplicate-provenance-s1") {
        mutated = JSON.parse(JSON.stringify(sealedExport())) as CommittedExportV1;
        mutated.provenance = [...mutated.provenance, ...mutated.provenance];
      } else {
        mutated = withPath<CommittedExportV1>(sealedExport(), c.mutation, c.value);
      }
      const r = validateCommittedExport(mutated);
      expect(r.ok, c.mutation).toBe(false);
      if (!r.ok) expect(r.errors.map((e) => e.code), c.mutation).toContain(c.code);
    }
  });
});

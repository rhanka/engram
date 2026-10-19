/** Shared helpers for the Sol tour-1 correction tests: read the normative fixture once. */
import { readFileSync } from "node:fs";

export interface SolRule {
  id: string;
  spec: string;
  title: string;
  [k: string]: unknown;
}

const DOC = JSON.parse(
  readFileSync(new URL("./fixtures/sol-r1-rules.json", import.meta.url), "utf8"),
) as { shared: Record<string, unknown>; rules: SolRule[] };

export const SOL_SHARED = DOC.shared;

export function solRule(id: string): SolRule {
  const r = DOC.rules.find((x) => x.id === id);
  if (!r) throw new Error(`normative rule ${id} missing from sol-r1-rules.json`);
  return r;
}

/** Set a dotted path (numeric segments index arrays) on a deep clone. */
export function withPath<T>(base: T, path: string, value: unknown): T {
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  const segs = path.split(".");
  let cur: unknown = out;
  for (let i = 0; i < segs.length - 1; i++) {
    cur = (cur as Record<string, unknown>)[segs[i]];
  }
  (cur as Record<string, unknown>)[segs[segs.length - 1] as string] = value;
  return out as T;
}

export function codesOf(result: { ok: boolean; errors?: { code: string }[] }): string[] {
  return result.ok ? [] : ((result.errors ?? []).map((e) => e.code));
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const REPO = SOL_SHARED["repo"] as string;
const DIGEST0 = SOL_SHARED["digest0"] as string;
const FP = () => clone(SOL_SHARED["fingerprint"]);
const WIN = () => clone(SOL_SHARED["window"]);
const QS = () => clone(SOL_SHARED["validQuantileSet"]);
const SHA40 = SOL_SHARED["sourceRevision"] as string;

/** Minimal objects valid under the full contract; tests mutate them per fixture case. */
export function baseCohort(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/cohort/1",
    cohortKey: "astra-merged-desc/1",
    repo: REPO,
    metric: "pr_open_to_merge",
    manifestRef: clone(SOL_SHARED["validManifestRef"]),
    memberIds: [327],
    n: 1,
    window: WIN(),
    fingerprint: FP(),
    purpose: "retrospective-frozen-evidence",
  };
}

export function baseSeries(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/timing-series/1",
    seriesId: "s1",
    subject: REPO,
    metric: "pr_open_to_merge",
    cohortRef: clone(SOL_SHARED["validCohortRef"]),
    quantiles: QS(),
    unit: "second",
    window: WIN(),
    estimatorVersion: "e1",
    policyVersion: "p1",
    missingCount: 0,
    censoredCount: 0,
    exclusions: [{ id: 999, reason: "sample outside the observed window" }],
    fingerprint: FP(),
    measured: true,
  };
}

export function baseEstimate(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/timing-estimate/1",
    estimateId: "e1",
    seriesRef: clone(SOL_SHARED["validSeriesRef"]),
    quantiles: QS(),
    applicability: "applicable",
    freshness: {
      window: WIN(),
      collectedAt: "2026-10-18T07:48:57Z",
      referencePublishedAt: "2026-10-18T21:00:00Z",
    },
    support: "descriptive",
    limitations: [],
  };
}

export function baseExport(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/committed-export/1",
    repo: REPO,
    serviceRevision: "0.21.0",
    profileRef: { id: "repo-knowledge", version: "1", contentDigest: DIGEST0 },
    window: WIN(),
    generatedAt: "2026-10-18T21:00:00Z",
    generator: { name: "engram-time-reference", version: "0.21.0" },
    series: [],
    estimates: [],
    budgets: [],
    milestones: [],
    provenance: [],
    exportDigest: DIGEST0,
  };
}

export function baseBatch(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/ci-check-batch/1",
    repo: REPO,
    number: 327,
    headSha: "abc",
    source: "https://api.example/x",
    collectedAt: "2026-10-18T07:48:57Z",
    totalCount: 1,
    checks: [
      {
        id: 1,
        name: "ci",
        status: "completed",
        conclusion: "success",
        startedAt: "2026-10-18T07:00:00Z",
        completedAt: "2026-10-18T07:19:11Z",
      },
    ],
  };
}

export function basePr(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/pull-request-timing/1",
    repo: REPO,
    number: 327,
    createdAt: "2026-10-17T04:53:00Z",
    mergedAt: "2026-10-17T07:38:18Z",
    firstCommitAt: null,
    firstCommitPolicy: "proxy-only-excluded-from-forecasts",
    openToMergeSeconds: 9918,
    commits: [{ sha: "abc", authoredAt: "2026-10-17T04:00:00Z", committedAt: "2026-10-17T04:00:00Z" }],
    commitsCollectionState: "collected",
  };
}

export function baseWave(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/review-wave-manifest/1",
    repo: REPO,
    lotOccurrence: "occ-1",
    roundId: "r1",
    candidateRevision: "rev-1",
    submittedAt: "2026-10-18T10:00:00Z",
    submissionEvidenceRefs: ["ev1"],
    requestEvidenceRefs: [],
    reviewerRuns: [{ runId: "run-a", evidenceRefs: ["ev1"] }],
    resultEvidenceRefs: [],
    closureEvidenceRefs: [],
    closedAt: null,
  };
}

export function baseManifest(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/collection-manifest/1",
    ruleId: "astra-merged-desc/1",
    ruleVersion: "1",
    repo: REPO,
    query: "merged:>=2026-10-01",
    cutoff: "2026-10-18T07:48:57Z",
    collectedAt: "2026-10-18T07:48:57Z",
    firstAvailableAt: null,
    historicalAvailability: "unattested",
    pageSize: 100,
    totalCount: 1,
    hasNextPage: false,
    inclusionIds: [327],
    exclusionIds: [],
    quarantine: [{ id: 999, reason: "reused attempt" }],
    sourceRevision: SHA40,
    sourceUrls: ["https://api.example/x"],
    snapshotDigest: DIGEST0,
  };
}

export function baseReceipt(): Record<string, unknown> {
  return {
    schema: "engram.time-reference/installation-receipt/1",
    repo: REPO,
    lotOccurrence: "occ-1",
    mergeSha: "m",
    releaseSourceSha: "r",
    ancestryEvidence: "a",
    targetId: "t",
    targetKind: "ci-runner",
    platform: "linux-x64",
    installationScope: "repo",
    expectedVersion: "0.21.0",
    observedVersion: "0.21.0",
    expectedTuple: "0.21.0+r",
    observedTuple: "0.21.0+r",
    artifactIntegrity: "sha256:x",
    resolvedExecutable: "/tmp/p/bin/engram",
    installStartedAt: "2026-10-18T10:00:00Z",
    installCompletedAt: "2026-10-18T10:05:00Z",
    smokeCompletedAt: "2026-10-18T10:06:00Z",
    installOutcome: "success",
    smokeOutcome: "success",
    clockSource: "c",
    producerIdentity: "p",
    evidenceDigests: [DIGEST0],
  };
}

export const BASE_BUILDERS: Record<string, () => Record<string, unknown>> = {
  cohort: baseCohort,
  series: baseSeries,
  estimate: baseEstimate,
  export: baseExport,
  batch: baseBatch,
  pr: basePr,
  wave: baseWave,
  manifest: baseManifest,
  receipt: baseReceipt,
};

/**
 * Shared L0-D helpers for the time-reference acceptance tests.
 *
 * Reads the vendored byte-identical archives (see fixtures/PROVENANCE.md)
 * and normalizes them into the single shared canonical form (spec section
 * 15): canonical instants `createdAt`/`mergedAt`/`firstCommitAt`, canonical
 * identifier `number`, no reported-hours fields, no pull-request-level
 * `installedAt`/`reviewRoundsActual`, `commitsCollectionState` posture
 * (20 `not-collected`, PR 347/349/351 `collected`).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  openToMergeSample,
  validatePullRequestTiming,
  type PullRequestTimingV1,
  type CiCheckBatchV1,
} from "../../src/time-reference/index.js";

const FIXTURES = new URL("./fixtures/", import.meta.url);

export function fixtureBytes(name: string): Buffer {
  return readFileSync(new URL(name, FIXTURES));
}

export function fixtureJson(name: string): unknown {
  return JSON.parse(fixtureBytes(name).toString("utf8"));
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ArchivedPr = Record<string, any>;

export interface GithubSample {
  sourceRevision: string;
  purpose: string;
  historicalAvailability: string;
  cutoff: string;
  cohorts: Record<string, number[]>;
  pullRequests: ArchivedPr[];
  finalHeadChecks: ArchivedPr[];
}

/** Document import mapping (spec A1/A2): archived keys to canonical names. */
export function normalizePr(repo: string, row: ArchivedPr): PullRequestTimingV1 {
  const createdAt: string = row.createdAt ?? row.opened;
  const mergedAt: string | null = (row.mergedAt ?? row.merged ?? null) as string | null;
  const firstCommitAt: string | null = (row.firstCommitAt ?? row.first_commit ?? null) as string | null;
  const pr = {
    schema: "engram.time-reference/pull-request-timing/1",
    repo,
    number: row.number,
    ...(row.url === undefined ? {} : { url: row.url }),
    createdAt,
    mergedAt,
    ...(row.headSha === undefined ? {} : { headSha: row.headSha }),
    ...(row.mergeSha === undefined ? {} : { mergeSha: row.mergeSha }),
    firstCommitAt,
    firstCommitPolicy: "proxy-only-excluded-from-forecasts",
    openToMergeSeconds: mergedAt === null ? null : openToMergeSample({ createdAt, mergedAt }),
    commits: row.commits ?? null,
    commitsCollectionState: row.commits == null ? "not-collected" : "collected",
  };
  const checked = validatePullRequestTiming(pr);
  if (!checked.ok) {
    throw new Error(`L0-D normalization failed for PR ${String(row.number)}: ${JSON.stringify(checked.errors)}`);
  }
  return checked.value;
}

export function normalizeBatch(repo: string, batch: ArchivedPr): CiCheckBatchV1 {
  return {
    schema: "engram.time-reference/ci-check-batch/1",
    repo,
    number: batch.number ?? batch.pr,
    headSha: batch.headSha,
    source: batch.source,
    collectedAt: batch.collectedAt,
    totalCount: batch.totalCount,
    ...(batch.pageSize === undefined ? {} : { pageSize: batch.pageSize }),
    ...(batch.page === undefined ? {} : { page: batch.page }),
    ...(batch.hasNextPage === undefined ? {} : { hasNextPage: batch.hasNextPage }),
    checks: batch.checks,
  };
}

/** Canonical open-to-merge samples (seconds) for one cohort, manifest order. */
export function cohortSamples(sample: GithubSample, repo: string, cohortKey: string): number[] {
  const byNumber = new Map<number, ArchivedPr>();
  for (const p of sample.pullRequests) byNumber.set(p.number, p);
  const out: number[] = [];
  for (const n of sample.cohorts[cohortKey] ?? []) {
    const pr = normalizePr(repo, byNumber.get(n) as ArchivedPr);
    if (pr.openToMergeSeconds !== null) out.push(pr.openToMergeSeconds);
  }
  return out;
}

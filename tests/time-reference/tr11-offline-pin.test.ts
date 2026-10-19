/** TR-11 — Offline consumer pin: locked bytes validate offline, archives stay archives. */
import { describe, expect, it } from "vitest";
import {
  sha256Hex,
  validateCiCheckBatch,
  validateInstallationReceipt,
  validatePullRequestTiming,
  verifyContractPin,
} from "../../src/time-reference/index.js";
import { fixtureBytes } from "./l0d.js";

const PR_FIELDS = {
  schema: "engram.time-reference/pull-request-timing/1",
  repo: "rhanka/h2a",
  number: 327,
  createdAt: "2026-10-17T04:53:00Z",
  mergedAt: "2026-10-17T07:38:18Z",
  firstCommitAt: null,
  firstCommitPolicy: "proxy-only-excluded-from-forecasts",
  openToMergeSeconds: 9918,
  commits: null,
  commitsCollectionState: "not-collected",
};

describe("TR-11 offline consumer pin", () => {
  it("locked artifact bytes validate offline with no network: digests match", () => {
    const names = ["github-sample.json", "engram-enriched.json", "engram-older.json", "skipped-check-anomalies.json"];
    const files: Record<string, string> = {};
    const pin = names.map((name) => {
      const bytes = fixtureBytes(name);
      files[`contracts/repo-knowledge/1/${name}`] = bytes.toString("utf8");
      return { path: `contracts/repo-knowledge/1/${name}`, sha256: sha256Hex(bytes.toString("utf8")) };
    });
    expect(verifyContractPin(files, pin)).toEqual([]);
  });

  it("a locally re-created schema substituted for the locked bytes fails the digest check", () => {
    const bytes = fixtureBytes("github-sample.json").toString("utf8");
    const recanonical = JSON.stringify(JSON.parse(bytes));
    const pin = [{ path: "contracts/repo-knowledge/1/github-sample.json", sha256: sha256Hex(bytes) }];
    const errors = verifyContractPin(
      { "contracts/repo-knowledge/1/github-sample.json": recanonical },
      pin,
    );
    expect(errors.map((d) => d.code)).toContain("pin-digest-mismatch");
    expect(
      verifyContractPin({}, pin).map((d) => d.code),
    ).toContain("pin-missing-file");
  });

  it("archived spellings validate only as Git-replayed archives and are refused as current DTO input", () => {
    // `pr` instead of `number` in a check batch.
    expect(
      validateCiCheckBatch({
        schema: "engram.time-reference/ci-check-batch/1",
        repo: "rhanka/h2a",
        pr: 327,
        headSha: "abc",
        source: "https://api.example/x",
        collectedAt: "2026-10-18T07:48:57Z",
        totalCount: 1,
        checks: [],
      }).ok,
    ).toBe(false);
    // Pull-request-level installedAt / reviewRoundsActual.
    for (const extra of [{ installedAt: "unknown" }, { reviewRoundsActual: null }]) {
      expect(validatePullRequestTiming({ ...PR_FIELDS, ...extra }).ok).toBe(false);
    }
    // Reported-hours fields.
    for (const extra of [{ reportedOpenToMergeHours: 2.75 }, { reportedFirstCommitToMergeHours: 1.5 }]) {
      expect(validatePullRequestTiming({ ...PR_FIELDS, ...extra }).ok).toBe(false);
    }
    // Snake_case instants.
    const { createdAt: _c, ...rest } = PR_FIELDS as Record<string, unknown>;
    expect(
      validatePullRequestTiming({ ...rest, opened: "2026-10-17T04:53:00Z" }).ok,
    ).toBe(false);
  });

  it("upstream valid/invalid verdicts reproduce exactly from the locked bytes", () => {
    expect(validatePullRequestTiming(PR_FIELDS).ok).toBe(true);
    // An undeclared cross-domain target type on a receipt is refused.
    expect(
      validateInstallationReceipt({
        schema: "engram.time-reference/installation-receipt/1",
        repo: "rhanka/h2a",
        lotOccurrence: "occ-1",
        mergeSha: "m",
        releaseSourceSha: "r",
        ancestryEvidence: "a",
        targetId: "t",
        targetKind: "cdn-edge",
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
        evidenceDigests: [],
      }).ok,
    ).toBe(false);
  });
});

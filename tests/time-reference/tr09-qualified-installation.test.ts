/** TR-09 — Qualified installation is target-bound; every refusal stays unknown. */
import { describe, expect, it } from "vitest";
import {
  evaluateInstallationTarget,
  mergeToInstalledSample,
  qualifyInstallation,
  type InstallationReceiptV1,
  type InstallationTargetInput,
  type TargetQualification,
} from "../../src/time-reference/index.js";

function receipt(over: Partial<InstallationReceiptV1> = {}): InstallationReceiptV1 {
  return {
    schema: "engram.time-reference/installation-receipt/1",
    repo: "rhanka/h2a",
    lotOccurrence: "occ-1",
    mergeSha: "merge-sha",
    releaseSourceSha: "release-sha",
    ancestryEvidence: "ancestry-proof",
    targetId: "ci-runner",
    targetKind: "ci-runner",
    platform: "linux-x64",
    installationScope: "repo",
    expectedVersion: "0.21.0",
    observedVersion: "0.21.0",
    expectedTuple: "0.21.0+release-sha",
    observedTuple: "0.21.0+release-sha",
    artifactIntegrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    resolvedExecutable: "/tmp/p/bin/engram",
    installStartedAt: "2026-10-18T10:00:00Z",
    installCompletedAt: "2026-10-18T10:05:00Z",
    smokeCompletedAt: "2026-10-18T10:06:00Z",
    installOutcome: "success",
    smokeOutcome: "success",
    clockSource: "runner-clock",
    producerIdentity: "run-1/attempt-1",
    evidenceDigests: [],
    ...over,
  };
}

const QUAL: TargetQualification = {
  expectedTargetKind: "ci-runner",
  expectedPlatform: "linux-x64",
  expectedInstallationScope: "repo",
  expectedVersion: "0.21.0",
  expectedTuple: "0.21.0+release-sha",
  expectedIntegrity: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  expectedMergeSha: "merge-sha",
  expectedReleaseSourceSha: "release-sha",
  ancestryProven: true,
};

function target(receiptValue: InstallationReceiptV1 | null, targetId = "ci-runner"): InstallationTargetInput {
  return { targetId, forecastAt: "2026-10-18T12:00:00Z", receipt: receiptValue };
}

describe("TR-09 qualified installation (target-bound)", () => {
  it("merge 10:00, install 10:05, smoke 10:06 yields installedAt 10:06 and merge_to_installed 360 s", () => {
    const q = qualifyInstallation(target(receipt()), QUAL);
    expect(q.installedAt).toBe("2026-10-18T10:06:00Z");
    expect(mergeToInstalledSample("2026-10-18T10:00:00Z", q.installedAt)).toBe(360);
    const ev = evaluateInstallationTarget(target(receipt()), QUAL);
    expect(ev.entry).toMatchObject({ targetId: "ci-runner", installedAt: "2026-10-18T10:06:00Z", verdict: "held" });
    expect(ev.reason).toBe(undefined);
  });

  it("every refusal keeps installedAt unknown with a reason and produces no sample", () => {
    const cases: [string, InstallationTargetInput, TargetQualification][] = [
      ["publication alone (no receipt)", target(null), QUAL],
      ["failed install", target(receipt({ installOutcome: "failure" })), QUAL],
      ["absent smoke", target(receipt({ smokeOutcome: "failure" })), QUAL],
      ["wrong version", target(receipt({ observedVersion: "0.20.0" })), QUAL],
      ["wrong tuple", target(receipt({ observedTuple: "0.20.0+release-sha" })), QUAL],
      ["wrong integrity", target(receipt({ artifactIntegrity: "sha256:1111111111111111111111111111111111111111111111111111111111111111" })), QUAL],
      ["wrong target", target(receipt(), "workstation"), QUAL],
      ["wrong target kind", target(receipt({ targetKind: "delivery-environment" })), QUAL],
      ["wrong platform", target(receipt({ platform: "darwin-arm64" })), QUAL],
      ["wrong scope", target(receipt({ installationScope: "other-scope" })), QUAL],
      ["wrong release source", target(receipt({ releaseSourceSha: "other-release" })), QUAL],
      ["missing ancestry", target(receipt()), { ...QUAL, ancestryProven: false }],
      [
        "incoherent timestamps",
        target(receipt({ installStartedAt: "2026-10-18T10:07:00Z" })),
        QUAL,
      ],
    ];
    for (const [name, input, qual] of cases) {
      const ev = evaluateInstallationTarget(input, qual);
      expect(ev.entry.installedAt, name).toBe("unknown");
      expect(ev.entry.verdict, name).toBe("unknown");
      expect(typeof ev.reason, name).toBe("string");
      expect(mergeToInstalledSample("2026-10-18T10:00:00Z", ev.entry.installedAt)).toBe(null);
    }
  });

  it("a valid ci-runner receipt leaves a workstation target unknown", () => {
    const ev = evaluateInstallationTarget(
      { targetId: "workstation", forecastAt: "2026-10-18T12:00:00Z", receipt: receipt() },
      QUAL,
    );
    expect(ev.entry.installedAt).toBe("unknown");
    expect(ev.reason).toBe("wrong-target");
  });
});

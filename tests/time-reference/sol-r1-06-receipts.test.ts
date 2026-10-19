/** Sol R1 F07 (§7.2) + F08 (§6.9) — Receipts bind to the identified context; actuals resolve to receipts. */
import { describe, expect, it } from "vitest";
import {
  buildDeliveryMilestones,
  validateDeliveryMilestones,
  validateDeliveryMilestonesWithReceipts,
  validateCommittedExport,
  regenerateCheck,
  exportDigestOf,
  validateInstallationReceipt,
  type CommittedExportV1,
  type InstallationReceiptV1,
  type TargetQualification,
} from "../../src/time-reference/index.js";
import { BASE_BUILDERS, SOL_SHARED, solRule } from "./sol-r1-helpers.js";

const REPO = SOL_SHARED["repo"] as string;

function ctx() {
  return {
    repo: REPO,
    lotRef: "01KABCD",
    lotOccurrence: "occ-1",
    forecastRevision: "r1",
    forecastMergeAt: "2026-10-20T00:00:00Z",
    mergedAt: "2026-10-18T07:38:18Z",
    mergeSha: "m",
  };
}

function receipt(): InstallationReceiptV1 {
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
    evidenceDigests: [],
  };
}

function qual(): TargetQualification {
  return {
    expectedTargetKind: "ci-runner",
    expectedPlatform: "linux-x64",
    expectedInstallationScope: "repo",
    expectedVersion: "0.21.0",
    expectedTuple: "0.21.0+r",
    expectedIntegrity: "sha256:x",
    expectedMergeSha: "m",
    expectedReleaseSourceSha: "r",
    ancestryProven: true,
  };
}

const SCOPE = { repo: REPO, lotOccurrence: "occ-1" };

function targetInput(r: InstallationReceiptV1) {
  return { input: { targetId: "t", forecastAt: "2026-10-18T10:06:00Z", receipt: r, receiptRef: "rec-1" }, qual: qual() };
}

describe("Sol R1 F07/F08 receipt binding and resolution", () => {
  it("a bound receipt yields installedAt with a held verdict", () => {
    expect(validateInstallationReceipt(receipt()).ok).toBe(true);
    const built = buildDeliveryMilestones(ctx(), [targetInput(receipt())]);
    expect(built?.record.installMilestones[0]?.verdict).toBe("held");
    expect(built?.record.installMilestones[0]?.installedAt).toBe("2026-10-18T10:06:00Z");
  });

  it("F07: a foreign receipt or declaration never produces held", () => {
    const rule = solRule("F07") as { cases: { mutation: string; value: string; reason: string }[] };
    for (const c of rule.cases) {
      const r = receipt();
      const q = qual();
      if (c.mutation === "qual.expectedMergeSha") q.expectedMergeSha = c.value;
      else (r as unknown as Record<string, unknown>)[c.mutation.split(".")[1] as string] = c.value;
      const built = buildDeliveryMilestones(ctx(), [{ input: { targetId: "t", forecastAt: "2026-10-18T10:06:00Z", receipt: r, receiptRef: "rec-1" }, qual: q }]);
      expect(built?.record.installMilestones[0]?.verdict, c.mutation).toBe("unknown");
      expect(built?.targetReasons.map((t) => t.reason), c.mutation).toContain(c.reason);
    }
  });

  it("F08: every fixture case resolves through the primary validation path", () => {
    const rule = solRule("F08") as { cases: { path: string; mutation: string; code?: string; expectOk?: boolean }[] };
    for (const c of rule.cases) {
      const built = buildDeliveryMilestones(ctx(), [targetInput(receipt())])!.record;
      const evidence = { receipts: { "rec-1": receipt() }, quals: { t: qual() }, scope: SCOPE };
      if (c.mutation === "drop-receiptRef") {
        delete built.installMilestones[0]!.receiptRef;
      } else if (c.mutation === "no-receipt-supplied") evidence.receipts = {};
      else if (c.mutation === "arbitrary-ref") built.installMilestones[0]!.receiptRef = "attacker-ref";
      else if (c.mutation === "foreign-repo") evidence.receipts["rec-1"].repo = "evil/other";
      else if (c.mutation === "foreign-lot") evidence.receipts["rec-1"].lotOccurrence = "occ-9";
      else if (c.mutation === "missing-declaration") evidence.quals = {};
      else if (c.mutation === "receipt-and-declaration-sha") {
        evidence.receipts["rec-1"].mergeSha = "other-merge";
        evidence.quals.t.expectedMergeSha = "other-merge";
      } else if (c.mutation === "receipt-sha-only") evidence.receipts["rec-1"].mergeSha = "other-merge";
      else if (c.mutation === "declaration-sha-only") evidence.quals.t.expectedMergeSha = "other-merge";
      else if (c.mutation === "null-record-sha") built.mergeSha = null;
      else if (c.mutation !== "matching-receipt" && c.mutation !== "no-evidence") {
        throw new Error(`unknown F08 mutation ${c.mutation}`);
      }
      const supplied = c.mutation === "no-evidence" ? undefined : evidence;
      let codes: string[];
      if (c.path === "milestone") {
        const result = validateDeliveryMilestones(built, supplied);
        codes = result.ok ? [] : result.errors.map((e) => e.code);
      } else if (c.path === "wrapper") {
        const result = validateDeliveryMilestonesWithReceipts(built, evidence.receipts, evidence.quals, evidence.scope);
        codes = result.ok ? [] : result.errors.map((e) => e.code);
      } else {
        const exp = { ...BASE_BUILDERS["export"]!(), milestones: [built] } as unknown as CommittedExportV1;
        exp.exportDigest = exportDigestOf(exp as unknown as Record<string, unknown>);
        if (c.path === "export") {
          const result = validateCommittedExport(exp, [supplied]);
          codes = result.ok ? [] : result.errors.map((e) => e.code);
        } else if (c.path === "regeneration") {
          codes = regenerateCheck(exp, {}, () => [], [supplied]).map((e) => e.code);
        } else throw new Error(`unknown F08 path ${c.path}`);
      }
      if (c.expectOk) expect(codes, `${c.path}/${c.mutation}`).toEqual([]);
      else expect(codes, `${c.path}/${c.mutation}`).toContain(c.code);
    }
  });

  it("F08: a known installedAt resolves to exactly one matching qualified receipt", () => {
    const built = buildDeliveryMilestones(ctx(), [targetInput(receipt())])!.record;
    expect(
      validateDeliveryMilestonesWithReceipts(built, { "rec-1": receipt() }, { t: qual() }, SCOPE).ok,
    ).toBe(true);
    // An arbitrary receiptRef naming no supplied receipt fails.
    const forged = JSON.parse(JSON.stringify(built)) as typeof built;
    forged.installMilestones[0]!.receiptRef = "attacker-ref";
    expect(
      validateDeliveryMilestonesWithReceipts(forged, { "rec-1": receipt() }, { t: qual() }, SCOPE).ok,
    ).toBe(false);
    // A receipt from another repository or lot occurrence never backs the actual.
    const foreign = receipt();
    foreign.repo = "evil/other";
    expect(
      validateDeliveryMilestonesWithReceipts(built, { "rec-1": foreign }, { t: qual() }, SCOPE)
        .ok,
    ).toBe(false);
  });
});

/** TR-11 + Sol R1 F16 (§13) — Offline consumer pin over the locked contract files, plus an independent invalid corpus. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validateCiCheckBatch,
  validateCohort,
  validateCommittedExport,
  validateInstallationReceipt,
  validatePullRequestTiming,
  validateTimingSeries,
  verifyContractPin,
} from "../../src/time-reference/index.js";
import {
  validateEngramMapping,
  validateRepoKnowledgeProfile,
  validateTimingSchemas,
} from "../../src/repo-knowledge-contract.js";
import { drivenCases, codesOf, solRule } from "./sol-r1-helpers.js";

const VALIDATORS: Record<string, (v: unknown) => { ok: boolean; errors?: { code: string }[] }> = {
  validateCohort,
  validateTimingSeries,
  validateInstallationReceipt,
  validatePullRequestTiming,
  validateCiCheckBatch,
};

function lockedFile(name: string): string {
  return readFileSync(new URL(`../../profiles/repo-knowledge/1/${name}`, import.meta.url), "utf8");
}

describe("TR-11 offline consumer pin", () => {
  const rule = solRule("F16") as {
    lockedDir: string;
    lockedFiles: string[];
    expectedMappingVersion: string;
    expectedValidatorPin: { source: string; contract: string };
    cases: { name: string; validator: string; object: unknown; code: string }[];
  };

  it("every locked contract file hashes to its manifest digest", () => {
    const manifest = JSON.parse(lockedFile("manifest.json")) as {
      mappingVersion: string;
      validatorPin: { source: string; contract: string };
      files: { path: string; sha256: string }[];
    };
    expect(manifest.mappingVersion).toBe(rule.expectedMappingVersion);
    expect(manifest.validatorPin).toEqual(rule.expectedValidatorPin);
    for (const name of rule.lockedFiles) {
      if (name === "manifest.json") continue;
      const entry = manifest.files.find((f) => f.path === name);
      expect(entry, name).toBeDefined();
      expect(createHash("sha256").update(lockedFile(name)).digest("hex"), name).toBe(entry?.sha256);
    }
  });

  it("the locked profile, schemas and mapping validate offline with no network", () => {
    expect(validateRepoKnowledgeProfile(JSON.parse(lockedFile("profile.json"))).ok).toBe(true);
    expect(validateTimingSchemas(JSON.parse(lockedFile("timing.schema.json"))).ok).toBe(true);
    expect(validateEngramMapping(JSON.parse(lockedFile("engram-mapping.json"))).ok).toBe(true);
  });

  it("the independent invalid corpus is refused with its typed code", () => {
    for (const c of drivenCases("F16", rule.cases)) {
      expect(codesOf(VALIDATORS[c.validator]!(c.object)), c.name).toContain(c.code);
    }
    // Mapping and export version mismatches refuse without fallback.
    const mapping = JSON.parse(lockedFile("engram-mapping.json")) as Record<string, unknown>;
    expect(
      validateEngramMapping({ ...mapping, profile: { id: "repo-knowledge", version: "2" } }).ok,
    ).toBe(false);
    const exp = {
      schema: "engram.time-reference/committed-export/1",
      repo: "rhanka/h2a",
      serviceRevision: "0.21.0",
      profileRef: { id: "repo-knowledge", version: "2", contentDigest: `sha256:${"0".repeat(64)}` },
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      generatedAt: "2026-10-18T21:00:00Z",
      generator: { name: "engram", version: "0.21.0" },
      series: [],
      estimates: [],
      budgets: [],
      milestones: [],
      provenance: [],
      exportDigest: `sha256:${"0".repeat(64)}`,
    };
    expect(codesOf(validateCommittedExport(exp))).toContain("unsupported-profile-version");
  });

  it("a locally re-created file substituted for the locked bytes fails the digest check", () => {
    const bytes = '{"id":"repo-knowledge","version":"1"}';
    const pin = [{ path: "contracts/repo-knowledge/1/profile.json", sha256: createHash("sha256").update(bytes).digest("hex") }];
    const recanonical = JSON.stringify(JSON.parse(bytes));
    expect(
      verifyContractPin({ "contracts/repo-knowledge/1/profile.json": `${recanonical} ` }, pin).map((d) => d.code),
    ).toContain("pin-digest-mismatch");
    expect(verifyContractPin({}, pin).map((d) => d.code)).toContain("pin-missing-file");
  });
});

/** Sol R1 F02 (§6.0, §11) — Validators enforce closure, required fields and element types recursively. */
import { describe, expect, it } from "vitest";
import {
  validateCiCheckBatch,
  validateCohort,
  validateCollectionManifest,
  validateCommittedExport,
  validateInstallationReceipt,
  validatePullRequestTiming,
  validateReviewWaveManifest,
  validateTimingEstimate,
  validateTimingSeries,
} from "../../src/time-reference/index.js";
import { BASE_BUILDERS, codesOf, solRule, withPath } from "./sol-r1-helpers.js";

const VALIDATORS: Record<string, (v: unknown) => { ok: boolean; errors?: { code: string }[] }> = {
  cohort: validateCohort,
  series: validateTimingSeries,
  estimate: validateTimingEstimate,
  export: validateCommittedExport,
  batch: validateCiCheckBatch,
  pr: validatePullRequestTiming,
  wave: validateReviewWaveManifest,
  manifest: validateCollectionManifest,
  receipt: validateInstallationReceipt,
};

describe("Sol R1 F02 recursive validator closure", () => {
  const rule = solRule("F02") as {
    nestedCases: { base: string; path: string; value: unknown; code: string }[];
  };

  it("every base object validates before mutation", () => {
    for (const [name, build] of Object.entries(BASE_BUILDERS)) {
      if (!(name in VALIDATORS)) continue;
      const r = VALIDATORS[name]!(build());
      expect(r.ok, `${name}: ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it("nested undeclared fields, missing required fields and mistyped elements fail", () => {
    for (const c of rule.nestedCases) {
      const mutated = withPath(BASE_BUILDERS[c.base]!(), c.path, c.value);
      expect(codesOf(VALIDATORS[c.base]!(mutated)), `${c.base}.${c.path}`).toContain(c.code);
    }
  });
});

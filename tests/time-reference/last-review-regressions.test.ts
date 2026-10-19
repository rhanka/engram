import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as api from "../../src/time-reference/index.js";
import { baseDto, evidence, mutate, qualification, receipt, regeneration, samples, sealedExport, validators } from "./dto-matrix-helpers.js";

interface Case {
  finding: string;
  dto?: string;
  path?: string;
  value?: unknown;
  collision?: string;
}
const cases = JSON.parse(readFileSync(new URL("./fixtures/last-review-cases.json", import.meta.url), "utf8")) as Case[];
const executed = new Set<number>();
describe("last Astra review: fixture-driven public regressions", () => {
  cases.forEach((c, index) => {
    it(`${c.finding} case ${index}: ${c.path ?? c.collision}`, () => {
      if (c.dto && c.path) {
        const changed = mutate(baseDto(c.dto), c.path, c.value);
        expect(validators[c.dto]!(changed).ok).toBe(false);
        expect(regeneration(c.dto, changed, c.path).length).toBeGreaterThan(0);
        if (c.finding === "receipt") {
          const r = changed as unknown as api.InstallationReceiptV1;
          // Matching a malformed frozen digest must never produce held.
          const input = { targetId: "t", forecastAt: "2026-10-18T11:00:00Z", receipt: r };
          const qual = { ...qualification(), expectedIntegrity: c.value as string };
          expect(api.qualifyInstallation(input, qual).installedAt).toBe("unknown");
          expect(api.evaluateInstallationTarget(input, qual).entry.verdict).toBe("unknown");
          expect(api.INSTALLATION_RECEIPT_SCHEMA.properties.artifactIntegrity).toEqual({ type: "string", pattern: "^sha256:[0-9a-f]{64}$" });
        }
      } else if (c.finding === "F06") {
        const exp = sealedExport();
        if (c.collision === "series") {
          exp.series.push(structuredClone(exp.series[0]!));
          exp.series[0]!.policyVersion = "conflicting-policy";
        } else if (c.collision === "estimates") {
          exp.estimates.push(structuredClone(exp.estimates[0]!));
          exp.estimates[0]!.quantiles.quantileMethod = "weighted-ecdf/1";
        } else if (c.collision === "series-estimate") {
          exp.estimates[0]!.estimateId = "s1";
          exp.estimates[0]!.quantiles.quantileMethod = "weighted-ecdf/1";
          exp.provenance = [exp.provenance[0]!];
        } else throw new Error(`unhandled collision ${c.collision}`);
        exp.exportDigest = api.exportDigestOf(exp as unknown as Record<string, unknown>);
        const result = api.validateCommittedExport(exp, [evidence()]);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.map(e => e.code)).toContain("duplicate-figure-id");
        expect(api.regenerateCheck(exp, { s1: api.canonicalJson(samples) }, () => samples, [evidence()]).map(e => e.code)).toContain("duplicate-figure-id");
      } else throw new Error(`unhandled finding ${c.finding}`);
      executed.add(index);
    });
  });
  it("executes every fixture case and covers every remaining finding", () => {
    expect([...executed].sort((a, b) => a - b)).toEqual(cases.map((_, i) => i));
    expect([...new Set(cases.map(c => c.finding))].sort()).toEqual(["F02", "F06", "closure", "receipt"]);
    expect(api.validateInstallationReceipt(receipt()).ok).toBe(true);
  });
});

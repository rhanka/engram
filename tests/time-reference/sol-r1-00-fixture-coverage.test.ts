/** Execute the real drivers and compare completed case identities with the fixture. */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalJson } from "../../src/time-reference/index.js";
import { executedSolCases } from "./sol-r1-helpers.js";
import "./sol-r1-01-recursive-schemas.test.js";
import "./sol-r1-02-recursive-closure.test.js";
import "./sol-r1-03-regeneration.test.js";
import "./sol-r1-04-tail-support.test.js";
import "./sol-r1-05-provenance.test.js";
import "./sol-r1-06-receipts.test.js";
import "./sol-r1-07-identity.test.js";
import "./sol-r1-08-pins-evidence-ci.test.js";
import "./sol-r1-09-weights-probabilities.test.js";
import "./tr11-offline-pin.test.js";
import "./tr14-version-separation.test.js";

const { rules } = JSON.parse(readFileSync(
  new URL("./fixtures/sol-r1-rules.json", import.meta.url), "utf8",
)) as { rules: { id: string; cases: unknown[] }[] };

describe("Sol R1 fixture coverage meta-test", () => {
  it("every rule carries a nonempty case list and a unique identity", () => {
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    for (const rule of rules) {
      const cases = rule.cases;
      expect(cases?.length, rule.id).toBeGreaterThan(0);
    }
  });
});

afterAll(() => {
  const expected = rules.flatMap((rule) =>
    (rule.cases ?? [])
      .map((c, index) => `${rule.id}:${index}:${canonicalJson(c)}`),
  ).sort();
  expect([...executedSolCases].sort(), "executed fixture case identities").toEqual(expected);
});

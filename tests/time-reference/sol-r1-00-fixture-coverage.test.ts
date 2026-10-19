/** Sol R1 meta-test — every fixture rule is consumed by a generic driver test.
 *
 * A rule with no case, or a case never consumed by a test, fails here.
 * Drivers call `solRule("<id>")` and iterate its case list through the
 * public validators/evaluators exported from `@sentropic/engram/time-reference`.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const FIXTURE = new URL("./fixtures/sol-r1-rules.json", import.meta.url);

interface FixtureRule {
  id: string;
  spec: string;
  title: string;
  cases?: unknown[];
  nestedCases?: unknown[];
  closedSchemaPaths?: unknown[];
  invalidCorpus?: unknown[];
  lockedFiles?: unknown[];
}

function fixtureRules(): FixtureRule[] {
  const doc = JSON.parse(readFileSync(FIXTURE, "utf8")) as { rules: FixtureRule[] };
  return doc.rules;
}

function testSources(): { name: string; text: string }[] {
  const dir = new URL("./", import.meta.url);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".test.ts"))
    .map((name) => ({
      name,
      text: readFileSync(new URL(name, dir), "utf8"),
    }));
}

describe("Sol R1 fixture coverage meta-test", () => {
  it("every rule carries at least one case list", () => {
    for (const r of fixtureRules()) {
      const lists = [r.cases, r.nestedCases, r.closedSchemaPaths, r.invalidCorpus, r.lockedFiles];
      const sizes = lists.filter((l) => Array.isArray(l)).map((l) => (l as unknown[]).length);
      expect(sizes.length > 0, `${r.id} has no case list`).toBe(true);
      for (const n of sizes) expect(n, `${r.id} has an empty case list`).toBeGreaterThan(0);
    }
  });

  it("every rule is consumed by at least one driver test", () => {
    const sources = testSources();
    const missing: string[] = [];
    for (const r of fixtureRules()) {
      const consumed = sources.some((s) => s.text.includes(`solRule("${r.id}")`));
      if (!consumed) missing.push(r.id);
    }
    expect(missing, `fixture rules never consumed: ${missing.join(", ")}`).toEqual([]);
  });

  it("every consumption iterates the rule case list (no discarded fixture)", () => {
    const sources = testSources();
    const nondriven: string[] = [];
    for (const r of fixtureRules()) {
      const users = sources.filter((s) => s.text.includes(`solRule("${r.id}")`));
      const iterates = users.some(
        (s) =>
          s.text.includes("for (const c of rule.cases)") ||
          s.text.includes("for (const c of rule.nestedCases)") ||
          s.text.includes("for (const p of rule.closedSchemaPaths)") ||
          s.text.includes("for (const c of rule.invalidCorpus)") ||
          s.text.includes("rule.lockedFiles"),
      );
      if (!iterates) nondriven.push(r.id);
    }
    expect(nondriven, `fixture rules loaded but never iterated: ${nondriven.join(", ")}`).toEqual(
      [],
    );
  });
});

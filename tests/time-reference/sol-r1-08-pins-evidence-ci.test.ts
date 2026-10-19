/** Sol R1 F13 (§12.2) + F14 (§6.2 A6) + F15 (§3.3) — Pins, attempt evidence, integer CI durations. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ciEnvelopeSeconds,
  ciJobServiceSeconds,
  lastCheckEndToMergeSeconds,
  validateCiCheckBatch,
  validateCommittedExport,
  validatePullRequestTiming,
} from "../../src/time-reference/index.js";
import { validateEngramMapping } from "../../src/repo-knowledge-contract.js";
import { BASE_BUILDERS, codesOf, solRule, withPath } from "./sol-r1-helpers.js";

function lockedJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../profiles/repo-knowledge/1/${name}`, import.meta.url), "utf8"));
}

describe("Sol R1 F13/F14/F15 pins, evidence and CI discipline", () => {
  it("F13: unsupported profile pins and mismatched mapping versions are refused", () => {
    const rule = solRule("F13") as { cases: { mutation: string; value: string; code: string }[] };
    for (const c of rule.cases) {
      if (c.mutation === "export-profile-version-2") {
        const exp = withPath<Record<string, unknown>>(BASE_BUILDERS["export"]!(), "profileRef.version", c.value);
        expect(codesOf(validateCommittedExport(exp)), c.mutation).toContain(c.code);
      } else {
        const mapping = lockedJson("engram-mapping.json") as Record<string, unknown>;
        const mutated =
          c.mutation === "mapping-version-9"
            ? { ...mapping, mappingVersion: c.value }
            : { ...mapping, profile: { id: "repo-knowledge", version: c.value } };
        const r = validateEngramMapping(mutated);
        expect(r.ok, c.mutation).toBe(false);
        expect(r.errors.map((e) => e.code), c.mutation).toContain(c.code);
      }
    }
    expect(validateEngramMapping(lockedJson("engram-mapping.json")).ok).toBe(true);
  });

  it("F14: every fixture case fails on the main PR validation path", () => {
    const rule = solRule("F14") as { cases: { mutation: string; code: string }[] };
    const unavailablePr = () => ({
      ...BASE_BUILDERS["pr"]!(),
      commits: null,
      commitsCollectionState: "unavailable",
    });
    const attempt = {
      repo: "rhanka/h2a",
      number: 327,
      attemptedAt: "2026-10-18T07:48:57Z",
      cause: "provider timeout on commits page 2",
    };
    for (const c of rule.cases) {
      const attempts = c.mutation === "no-attempt" ? [] : [{ ...attempt, cause: "" }];
      expect(codesOf(validatePullRequestTiming(unavailablePr(), attempts)), c.mutation).toContain(
        c.code,
      );
    }
    // An attested attempt with a documented cause passes the main path…
    expect(validatePullRequestTiming(unavailablePr(), [attempt]).ok).toBe(true);
    // …and any other state needs no evidence.
    expect(
      validatePullRequestTiming({ ...unavailablePr(), commitsCollectionState: "not-collected" }, [])
        .ok,
    ).toBe(true);
  });

  it("F15: every fixture case quarantines through the public CI helpers", () => {
    const rule = solRule("F15") as { cases: { mutation: string; code: null }[] };
    const coherentCheck = {
      id: 1,
      name: "a",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-10-18T07:00:00Z",
      completedAt: "2026-10-18T07:19:11Z",
    };
    for (const c of rule.cases) {
      if (c.mutation === "negative-gap-service") {
        // End one second before start (frozen anomaly shape): no service sample.
        expect(
          ciJobServiceSeconds({
            ...coherentCheck,
            startedAt: "2026-10-18T07:00:01Z",
            completedAt: "2026-10-18T07:00:00Z",
          }),
          c.mutation,
        ).toBe(null);
      } else if (c.mutation === "fractional-envelope") {
        // Millisecond-precision envelope: sub-second storage is refused, never fractional.
        const fractional = ciEnvelopeSeconds({
          checks: [{ ...coherentCheck, startedAt: "2026-10-18T07:00:00.500Z" }],
        });
        expect(fractional === null || Number.isInteger(fractional), c.mutation).toBe(true);
        expect(fractional, c.mutation).toBe(null);
      } else if (c.mutation === "zero-gap-last-check") {
        // Zero gap to merge: quarantined, never a zero sample.
        expect(
          lastCheckEndToMergeSeconds({ checks: [coherentCheck] }, "2026-10-18T07:19:11Z"),
          c.mutation,
        ).toBe(null);
      } else {
        throw new Error(`unknown F15 mutation ${c.mutation}`);
      }
    }
    // A coherent batch still yields integer seconds.
    expect(
      ciEnvelopeSeconds({
        checks: [
          {
            id: 1,
            name: "a",
            status: "completed",
            conclusion: "success",
            startedAt: "2026-10-18T07:00:00Z",
            completedAt: "2026-10-18T07:19:11Z",
          },
        ],
      }),
    ).toBe(1151);
    expect(validateCiCheckBatch(BASE_BUILDERS["batch"]!()).ok).toBe(true);
  });
});

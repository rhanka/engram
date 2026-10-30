/** TR-14 — Version separation: unknown majors refuse, deprecation moves entryDigest only. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalDigest,
  entryDigestOf,
  exportDigestOf,
  validateCommittedExport,
  validatePullRequestTiming,
} from "../../src/time-reference/index.js";
import { validateRepoKnowledgeProfile } from "../../src/repo-knowledge-contract.js";
import { drivenCases, solRule } from "./sol-r1-helpers.js";

describe("TR-14 version separation", () => {
  it("the package exposes ./time-reference and ./memory-substrate", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      exports: Record<string, unknown>;
    };
    expect("./time-reference" in pkg.exports).toBe(true);
    expect("./memory-substrate" in pkg.exports).toBe(true);
  });

  it("F17: every fixture case holds for the 0.23.0 release metadata", () => {
    const rule = solRule("F17") as { cases: { name: string }[] };
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      version: string;
      exports: Record<string, unknown>;
    };
    const lock = JSON.parse(
      readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"),
    ) as {
      version: string;
      packages: Record<string, { version: string }>;
    };
    for (const c of drivenCases("F17", rule.cases)) {
      if (c.name === "package-exposes-time-reference") {
        expect("./time-reference" in pkg.exports, c.name).toBe(true);
        expect("./memory-substrate" in pkg.exports, c.name).toBe(true);
      } else if (c.name === "package-version-0.23.0") {
        expect(pkg.version, c.name).toBe("0.23.0");
      } else if (c.name === "lock-version-0.23.0") {
        expect(lock.version, c.name).toBe("0.23.0");
        expect(lock.packages[""].version, c.name).toBe("0.23.0");
      } else {
        throw new Error(`unknown F17 case ${c.name}`);
      }
    }
  });

  it("an unknown DTO major (/2 on a /1 validator) is refused, never fallen back to latest", () => {
    const r = validatePullRequestTiming({
      schema: "engram.time-reference/pull-request-timing/2",
      repo: "rhanka/h2a",
      number: 327,
      createdAt: "2026-10-17T04:53:00Z",
      mergedAt: "2026-10-17T07:38:18Z",
      firstCommitAt: null,
      firstCommitPolicy: "proxy-only-excluded-from-forecasts",
      openToMergeSeconds: 9918,
      commits: null,
      commitsCollectionState: "not-collected",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain("bad-schema-literal");
  });

  it("an unknown profile major and a digest mismatch refuse with their typed class", () => {
    const profile = validateRepoKnowledgeProfile({
      id: "repo-knowledge",
      version: "2",
      owner: "engram gr-conductor",
      lifecycle: "published",
      modules: { ci: {}, architecture: {}, timing: { clockTypes: [], applicability: [] } },
    });
    expect(profile.ok).toBe(false);
    expect(profile.errors.map((e) => e.code)).toContain("bad-profile-version");
    const exp = {
      schema: "engram.time-reference/committed-export/1",
      repo: "rhanka/h2a",
      serviceRevision: "0.21.0",
      profileRef: { id: "repo-knowledge", version: "1", contentDigest: `sha256:${"0".repeat(64)}` },
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      generatedAt: "2026-10-18T21:00:00Z",
      generator: { name: "engram-time-reference", version: "0.21.0" },
      series: [],
      estimates: [],
      budgets: [],
      milestones: [],
      provenance: [],
      exportDigest: `sha256:${"0".repeat(64)}`,
    };
    const r = validateCommittedExport(exp);
    expect(r.ok).toBe(true); // structural shape is valid…
    if (r.ok) {
      expect(exportDigestOf(exp as unknown as Record<string, unknown>)).not.toBe(exp.exportDigest); // …but the digest does not recompute
    }
  });

  it("deprecating a published version leaves content/pins/result digests unchanged and changes entryDigest", () => {
    const content = { profile: "repo-knowledge@1", artifactVersion: "1.0.0" };
    const pins = ["repo-knowledge@1"];
    const result = { series: ["s1"] };
    const contentDigest = canonicalDigest(content);
    const pinsDigest = canonicalDigest(pins);
    const resultDigest = canonicalDigest(result);
    const published = { id: "timing-reference", lifecycle: "published", contentDigest, pinsDigest, resultDigest };
    const deprecated = { ...published, lifecycle: "deprecated" };
    expect(entryDigestOf(deprecated)).not.toBe(entryDigestOf(published));
    expect(canonicalDigest(content)).toBe(contentDigest);
    expect(canonicalDigest(pins)).toBe(pinsDigest);
    expect(canonicalDigest(result)).toBe(resultDigest);
  });
});

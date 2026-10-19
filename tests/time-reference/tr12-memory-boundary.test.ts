/** TR-12 — Memory boundary: exports carry no memory signals and touch no memory. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDeliveryMilestones,
  buildQuantileSet,
  canonicalJson,
  nearestRank,
  validatePullRequestTiming,
  validateTimingSeries,
} from "../../src/time-reference/index.js";

const SOURCES = [
  "canonical.ts",
  "export.ts",
  "format.ts",
  "index.ts",
  "milestones.ts",
  "quantiles.ts",
  "schemas.ts",
  "types.ts",
  "validators.ts",
];

function sourceOf(name: string): string {
  return readFileSync(new URL(`../../src/time-reference/${name}`, import.meta.url), "utf8");
}

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) keysOf(v, out);
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

describe("TR-12 memory boundary", () => {
  it("a committed export carries no memory body, identifier, digest, citation or existence signal", () => {
    const quantiles = {
      ...buildQuantileSet(
        [{ id: "a", value: 100 }],
        { method: "nearest-rank/1", support: "descriptive" },
      ),
      tailQualification: "nEff 1/1: descriptive tail over 1 sample, 1 campaign",
    };
    const series = {
      schema: "engram.time-reference/timing-series/1",
      seriesId: "s1",
      subject: "rhanka/h2a",
      metric: "pr_open_to_merge",
      cohortRef: { cohortKey: "k", snapshotDigest: `sha256:${"0".repeat(64)}` },
      quantiles,
      unit: "second",
      window: { from: "2026-10-17T04:53:00Z", to: "2026-10-18T07:48:00Z" },
      estimatorVersion: "e1",
      policyVersion: "p1",
      missingCount: 0,
      censoredCount: 0,
      exclusions: [],
      fingerprint: {
        model: "unknown",
        effort: "unknown",
        reviewPolicy: "unknown",
        workflowPath: "unknown",
        configDigest: "unknown",
        runner: "unknown",
        toolchain: "unknown",
        suiteShardSet: "unknown",
        jobSet: "unknown",
      },
      measured: true,
    };
    expect(validateTimingSeries(series).ok).toBe(true);
    const keys = keysOf(series);
    for (const k of keys) expect(k.toLowerCase()).not.toContain("memory");
    const bytes = canonicalJson(series);
    for (const signal of ["engram_memory", "memoryId", "memory-body", "citation", "memoryDigest"]) {
      expect(bytes.includes(signal)).toBe(false);
    }
  });

  it("validators and the milestone evaluator perform no memory capture/admission/mutation", () => {
    // A test journal passed beside the calls is byte-identical afterwards:
    // the entry takes no journal and emits no memory record.
    const journal = { head: "abc123", hash: "sha256:deadbeef", events: [] as unknown[] };
    const before = JSON.stringify(journal);
    validatePullRequestTiming({
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
    });
    buildDeliveryMilestones(null, []);
    nearestRank([1, 2, 3], 0.5);
    expect(JSON.stringify(journal)).toBe(before);
    for (const name of SOURCES) {
      const src = sourceOf(name);
      for (const token of ["memory_capture", "memory_get", "memory_search", "request_admission", "memory_forget", "memory_withdraw"]) {
        expect(src.includes(token), `${name} must not reference ${token}`).toBe(false);
      }
    }
  });

  it("loading ./time-reference pulls no memory module", () => {
    for (const name of SOURCES) {
      const src = sourceOf(name);
      for (const line of src.split("\n")) {
        if (/^\s*import\s/.test(line) || line.includes("from \"")) {
          expect(line.includes("memory"), `${name}: ${line.trim()}`).toBe(false);
        }
      }
    }
  });
});

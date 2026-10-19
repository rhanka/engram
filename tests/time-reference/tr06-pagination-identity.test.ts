/** TR-06 — Pagination and identity: complete claims are fenced, identity is (repo, number). */
import { describe, expect, it } from "vitest";
import {
  assertSnapshotComplete,
  dedupeIds,
  validateSeriesAgainstManifest,
} from "../../src/time-reference/index.js";

function manifest(over: Record<string, unknown> = {}) {
  return {
    hasNextPage: false,
    totalCount: 3,
    inclusionIds: [1, 2, 3],
    ...over,
  };
}

describe("TR-06 pagination and identity", () => {
  it("a remaining page forbids a complete claim", () => {
    expect(assertSnapshotComplete(manifest({ hasNextPage: true })).map((d) => d.code)).toContain("remaining-page");
  });

  it("a totalCount mismatch forbids a complete claim", () => {
    expect(assertSnapshotComplete(manifest({ totalCount: 5 })).map((d) => d.code)).toContain("count-mismatch");
  });

  it("a consistent snapshot may claim complete", () => {
    expect(assertSnapshotComplete(manifest())).toEqual([]);
  });

  it("duplicate pages never double n", () => {
    expect(dedupeIds([373, 348, 373, "373", 348])).toEqual([373, 348, "373"]);
  });

  it("equal pull-request numbers in different repositories never collide", () => {
    const a = "rhanka/h2a#399";
    const b = "rhanka/engram#399";
    expect(a).not.toBe(b);
    expect(dedupeIds([a, b])).toHaveLength(2);
  });

  it("a manifest exclusionId without exactly one reasoned series record forbids complete", () => {
    const series = {
      exclusions: [{ id: 1, reason: "r" }],
      cohortRef: { cohortKey: "k", snapshotDigest: `sha256:${"0".repeat(64)}` },
    };
    const man = {
      exclusionIds: [1, 2],
      inclusionIds: [3],
      snapshotDigest: `sha256:${"0".repeat(64)}`,
    };
    expect(validateSeriesAgainstManifest(series, man).map((d) => d.code)).toContain("exclusion-manifest-mismatch");
  });

  it("a series record without a manifest identifier, or a member overlap, forbids complete", () => {
    const base = {
      cohortRef: { cohortKey: "k", snapshotDigest: `sha256:${"0".repeat(64)}` },
    };
    const man = {
      exclusionIds: [1],
      inclusionIds: [1, 3],
      snapshotDigest: `sha256:${"0".repeat(64)}`,
    };
    expect(
      validateSeriesAgainstManifest({ ...base, exclusions: [{ id: 2, reason: "r" }] }, man).map((d) => d.code),
    ).toContain("exclusion-manifest-mismatch");
    expect(
      validateSeriesAgainstManifest({ ...base, exclusions: [{ id: 1, reason: "r" }] }, man).map((d) => d.code),
    ).toContain("exclusion-member-overlap");
  });

  it("one pull request serving two lots never duplicates its full elapsed time onto both", () => {
    // Two series built from the same observation hold independent quantile
    // objects: repricing one candidate prefix never mutates the other.
    const samples = [{ id: "x#1", value: 100 }];
    const { buildQuantileSet } = require_build();
    const a = buildQuantileSet(samples, { method: "nearest-rank/1", support: "descriptive" });
    const b = buildQuantileSet(samples, { method: "nearest-rank/1", support: "descriptive" });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    (a as { p50Seconds: number | null }).p50Seconds = 999;
    expect(b.p50Seconds).toBe(100);
  });

  function require_build(): typeof import("../../src/time-reference/index.js") {
    // Static import hoisting keeps this deterministic; the indirection only
    // names the behaviour under test.
    return buildModule;
  }
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as buildModule from "../../src/time-reference/index.js";

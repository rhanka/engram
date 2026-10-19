/** TR-13 — Neutrality and determinism: no host imports, no I/O, stable bytes. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildQuantileSet,
  canonicalDigest,
  nearestRank,
  validateCommittedExport,
  validatePullRequestTiming,
  weightedEcdf,
} from "../../src/time-reference/index.js";

const SOURCES = [
  "src/time-reference/canonical.ts",
  "src/time-reference/export.ts",
  "src/time-reference/format.ts",
  "src/time-reference/index.ts",
  "src/time-reference/milestones.ts",
  "src/time-reference/quantiles.ts",
  "src/time-reference/schemas.ts",
  "src/time-reference/types.ts",
  "src/time-reference/validators.ts",
  "src/repo-knowledge-contract.ts",
];

const FORBIDDEN_HOSTS = [
  "h2a",
  "track",
  "sentropic-service",
  "sentropic/service",
  "design-system",
  "focus",
  "cluster-mesh",
  "identity",
  "session",
  "model-routing",
  "memory",
  "graph",
  "journal",
  "serving",
  "extract",
];

function readSource(name: string): string {
  return readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
}

function importSpecifiers(src: string): string[] {
  // Static module specifiers only: `from "…"` covers single-line and
  // multi-line statements, plus side-effect imports. A bare `export`
  // keyword in code or comments can never capture a later string literal.
  const out: string[] = [];
  for (const m of src.matchAll(/\bfrom\s+["']([^"']+)["']/g)) out.push(m[1] as string);
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1] as string);
  return out;
}

describe("TR-13 neutrality and determinism", () => {
  it("the import graph contains no host, graph, journal or serving module", () => {
    for (const name of SOURCES) {
      const specs = importSpecifiers(readSource(name));
      for (const spec of specs) {
        if (spec === "node:crypto") continue;
        expect(spec.startsWith("./") || spec.startsWith("../time-reference/"), `${name}: ${spec}`).toBe(true);
        const lower = spec.toLowerCase();
        for (const host of FORBIDDEN_HOSTS) {
          expect(lower.includes(host), `${name} imports forbidden host ${spec}`).toBe(false);
        }
      }
    }
  });

  it("validators make no network/filesystem/process calls", () => {
    for (const name of SOURCES) {
      const src = readSource(name);
      for (const token of [
        "node:fs",
        "node:net",
        "node:child_process",
        "node:worker_threads",
        "fetch(",
        "process.spawn",
        "execSync",
      ]) {
        expect(src.includes(token), `${name} must not contain ${token}`).toBe(false);
      }
    }
  });

  it("same input bytes give same verdicts, quantiles and digests across repeated runs", () => {
    const pr = {
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
    };
    const entries = [
      { id: "a", value: 10 },
      { id: "b", value: 20 },
      { id: "c", value: 100, weight: "98" },
    ];
    const first = {
      verdict: JSON.stringify(validatePullRequestTiming(pr)),
      exportVerdict: JSON.stringify(validateCommittedExport({})),
      nearest: [nearestRank([10, 20, 100], 0.5), nearestRank([10, 20, 100], 0.95)],
      weighted: [weightedEcdf(entries, 0.5), weightedEcdf(entries, 0.95)],
      built: JSON.stringify(buildQuantileSet(entries, { method: "weighted-ecdf/1", support: "descriptive" })),
      digest: canonicalDigest(pr),
    };
    const second = {
      verdict: JSON.stringify(validatePullRequestTiming(pr)),
      exportVerdict: JSON.stringify(validateCommittedExport({})),
      nearest: [nearestRank([10, 20, 100], 0.5), nearestRank([10, 20, 100], 0.95)],
      weighted: [weightedEcdf(entries, 0.5), weightedEcdf(entries, 0.95)],
      built: JSON.stringify(buildQuantileSet(entries, { method: "weighted-ecdf/1", support: "descriptive" })),
      digest: canonicalDigest(pr),
    };
    expect(second).toEqual(first);
  });
});

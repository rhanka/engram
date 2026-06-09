/**
 * Track F-0820-0827 M2 — cluster-only must call remapCommunitiesToPrevious after
 * re-clustering so the existing .graphify_labels.json keeps attaching to the
 * same conceptual community (upstream 9abaa77, #1028).
 *
 * Without the remap, cluster-only re-runs Leiden and then re-applies labels by
 * raw cid index. Because cid assignment is not stable across Leiden runs, labels
 * silently misalign with cluster contents whenever the graph has changed between
 * labeling and re-clustering (#1027).
 *
 * Two sub-tests:
 *   1. Unit: remapCommunitiesToPrevious() function correctness.
 *   2. Integration: the cluster-only CLI path calls remap when a prior node-community
 *      assignment exists in graph.json.
 */
import { describe, it, expect } from "vitest";
import { remapCommunitiesToPrevious } from "../src/cluster.js";

describe("remapCommunitiesToPrevious — unit (9abaa77, #1028)", () => {
  it("maps new cids to previous ones by node overlap (greedy max-overlap)", () => {
    // New clustering: cid 0={a,b,c}, cid 1={d,e}
    const communities = new Map<number, string[]>([
      [0, ["a", "b", "c"]],
      [1, ["d", "e"]],
    ]);
    // Previous assignment: a,b,c,x were in old cid 7; d,e,y were in old cid 3
    const previousNodeCommunity: Record<string, number> = {
      a: 7, b: 7, c: 7, x: 7,
      d: 3, e: 3, y: 3,
    };

    const remapped = remapCommunitiesToPrevious(communities, previousNodeCommunity);

    // New cid 0 had the most overlap with old cid 7 (nodes a,b,c) → gets old id 7
    expect(remapped.get(7)).toEqual(["a", "b", "c"]);
    // New cid 1 had the most overlap with old cid 3 (nodes d,e) → gets old id 3
    expect(remapped.get(3)).toEqual(["d", "e"]);
    // No other cids
    expect(remapped.size).toBe(2);
  });

  it("assigns fresh IDs to unmatched communities in deterministic order", () => {
    // New clustering: 3 communities; old only had 1 community (cid 42 covering a,b)
    const communities = new Map<number, string[]>([
      [0, ["a", "b"]],
      [1, ["c", "d"]],
      [2, ["e", "f"]],
    ]);
    const previousNodeCommunity: Record<string, number> = { a: 42, b: 42 };

    const remapped = remapCommunitiesToPrevious(communities, previousNodeCommunity);

    // Community 0 maps to old cid 42
    expect(remapped.get(42)).toEqual(["a", "b"]);
    // Two unmatched communities get fresh IDs not in used set
    expect(remapped.size).toBe(3);
    const allCids = [...remapped.keys()];
    expect(allCids).toContain(42);
    // Fresh IDs must not reuse 42
    const freshIds = allCids.filter((id) => id !== 42);
    expect(freshIds).toHaveLength(2);
    for (const id of freshIds) {
      expect(id).not.toBe(42);
    }
  });

  it("returns empty map for empty input", () => {
    const result = remapCommunitiesToPrevious(new Map(), {});
    expect(result.size).toBe(0);
  });

  it("returns communities unchanged when no previous assignment exists", () => {
    const communities = new Map<number, string[]>([
      [0, ["a", "b"]],
      [1, ["c", "d"]],
    ]);
    const result = remapCommunitiesToPrevious(communities, {});
    // Should still return 2 communities with the same node sets
    expect(result.size).toBe(2);
    const allNodes = [...result.values()].flat().sort();
    expect(allNodes).toEqual(["a", "b", "c", "d"]);
  });

  it("nodes within each remapped community are sorted", () => {
    const communities = new Map<number, string[]>([
      [0, ["z", "a", "m"]],
    ]);
    const result = remapCommunitiesToPrevious(communities, {});
    const [nodes] = [...result.values()];
    expect(nodes).toEqual(["a", "m", "z"]);
  });
});

/**
 * Integration test: the public CLI cluster-only path must invoke
 * remapCommunitiesToPrevious when a prior node-community assignment
 * exists in graph.json, so the existing labels.json stays aligned (#1027).
 */
import { describe as describeIntegration, it as itIntegration, expect as expectIntegration, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describeIntegration("cluster-only CLI — remapCommunitiesToPrevious integration (9abaa77, #1028)", () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), "graphify-cluster-remap-")); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  itIntegration("cluster-only preserves aligned label keys after re-clustering when prior community assignment exists", async () => {
    // Build a minimal graph.json with nodes that have a community attribute
    // and a matching .graphify_labels.json keyed on those cids.
    const stateDir = join(tmpDir, ".graphify");
    mkdirSync(stateDir, { recursive: true });

    const sentinelA = 4242;
    const sentinelB = 9999;

    const graphData = {
      directed: false,
      graph: {},
      nodes: [
        { id: "alpha", label: "Alpha", source_file: "a.ts", file_type: "code", community: sentinelA },
        { id: "beta", label: "Beta", source_file: "a.ts", file_type: "code", community: sentinelA },
        { id: "gamma", label: "Gamma", source_file: "b.ts", file_type: "code", community: sentinelB },
        { id: "delta", label: "Delta", source_file: "b.ts", file_type: "code", community: sentinelB },
      ],
      links: [
        { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED", source_file: "a.ts" },
        { source: "gamma", target: "delta", relation: "uses", confidence: "EXTRACTED", source_file: "b.ts" },
      ],
    };
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify(graphData), "utf-8");
    writeFileSync(
      join(stateDir, ".graphify_labels.json"),
      JSON.stringify({ [sentinelA]: "First Group", [sentinelB]: "Second Group" }),
      "utf-8",
    );

    // Run cluster-only via the CLI
    const { main } = await import("../src/cli.js");
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const originalLog = console.log;
    const originalErr = console.error;
    const originalWarn = console.warn;
    const originalExit = process.exit;
    const errors: string[] = [];
    let exitCode = 0;
    console.log = () => undefined;
    console.error = (...m: unknown[]) => { errors.push(m.join(" ")); };
    console.warn = () => undefined;
    process.exit = ((code?: string | number | null) => {
      exitCode = Number(code ?? 0);
      throw new Error("__exit__");
    }) as typeof process.exit;

    process.argv = ["node", "graphify", "cluster-only", tmpDir];
    process.chdir(tmpDir);
    try {
      await main();
    } catch (err) {
      if ((err as Error).message !== "__exit__") {
        errors.push((err as Error).message);
        exitCode = 1;
      }
    } finally {
      process.argv = originalArgv;
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalErr;
      console.warn = originalWarn;
      process.exit = originalExit;
    }

    expectIntegration(exitCode, `cluster-only errors: ${errors.join("; ")}`).toBe(0);

    // Key signal: the community IDs actually written to graph.json must align
    // with the keys in .graphify_labels.json. Without remapCommunitiesToPrevious,
    // Leiden returns small cids (0, 1, ...) and the prior sentinel labels become
    // orphaned — the intersection is empty.
    const finalGraph = JSON.parse(readFileSync(join(stateDir, "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; community?: number }>;
    };
    const finalLabels = JSON.parse(readFileSync(join(stateDir, ".graphify_labels.json"), "utf-8")) as Record<string, string>;

    const actualCids = new Set(finalGraph.nodes.map((n) => n.community).filter((c) => c !== undefined));
    const labelCids = new Set(Object.keys(finalLabels).map(Number));

    // The key invariant: the SENTINEL cids from the original labels must still
    // appear as community IDs in graph.json after cluster-only. Without
    // remapCommunitiesToPrevious, Leiden returns fresh small cids (0, 1, ...)
    // and persistCommunityLabels overwrites labels.json with {"0":"Community 0",...},
    // so the sentinel cids (4242, 9999) disappear entirely.
    const sentinelSurvived = actualCids.has(sentinelA) || actualCids.has(sentinelB);
    expectIntegration(
      sentinelSurvived,
      `After cluster-only, at least one sentinel cid (${sentinelA} or ${sentinelB}) must ` +
      `appear in graph.json community attributes (${[...actualCids]}). ` +
      `Without remapCommunitiesToPrevious (#1027) Leiden renumbers to 0,1,... and ` +
      `the prior labels (cids: ${[...labelCids]}) become orphaned.`,
    ).toBe(true);
  }, 60_000);
});

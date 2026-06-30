/**
 * `graphify store push` / `store status` CLI tests.
 *
 * These drive the extracted `runStorePush` / `runStoreStatus` against the REAL
 * postgres adapter wired through the production `resolveStoreConfig` +
 * `resolveGraphStore` chain — the driver is the storage fake-driver harness (an
 * in-memory `pg` module that records SQL), so no live DB and no `pg` package are
 * required (mirroring tests/storage-postgres*.test.ts). The push artifact dir is
 * redirected to a tmp dir so nothing is written into the repo tree.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runStorePush, runStoreStatus, type StoreCliDeps } from "../src/store-cli.js";
import type { GraphStore, GraphStoreConfig } from "../src/storage/types.js";

// ---------------------------------------------------------------------------
// Fake `pg` driver (records every statement) — same shape as storage-postgres.
// ---------------------------------------------------------------------------

interface RecordedSql {
  text: string;
  params?: unknown[];
}
interface FakePgState {
  queries: RecordedSql[];
  metaRows: Array<Record<string, unknown>>;
  groupRows: Array<Record<string, unknown>>;
  poolEnded: boolean;
}

function freshState(): FakePgState {
  return { queries: [], metaRows: [], groupRows: [], poolEnded: false };
}

function answer(state: FakePgState, text: string) {
  const upper = text.toUpperCase();
  if (text.includes("graph_meta") && upper.includes("SELECT")) {
    return { rows: state.metaRows, rowCount: state.metaRows.length };
  }
  if (text.includes("graph_group_counts") && upper.includes("SELECT")) {
    return { rows: state.groupRows, rowCount: state.groupRows.length };
  }
  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: FakePgState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ text, params });
      return Promise.resolve(answer(state, text));
    }
    connect() {
      const client = {
        query: (text: string, params?: unknown[]) => {
          state.queries.push({ text, params });
          return Promise.resolve(answer(state, text));
        },
        release() {
          /* no-op */
        },
      };
      return Promise.resolve(client);
    }
    end() {
      state.poolEnded = true;
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

// ---------------------------------------------------------------------------
// Test scaffolding: a graph.json fixture + a redirected artifact dir.
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];
function freshTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Write a tiny graph.json (3 nodes / 2 edges / 2 communities) and return its path. */
function writeGraphFixture(): string {
  const dir = freshTmp("graphify-storecli-graph-");
  const graphPath = join(dir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      directed: false,
      nodes: [
        // Baked layout coords (x/y) so the windowed-loader positions get built.
        { id: "a", label: "Alpha", node_type: "Character", community: 0, x: 0.1, y: 0.2 },
        { id: "b", label: "Beta", node_type: "Character", community: 0, x: 0.3, y: 0.4 },
        { id: "c", label: "Gamma", node_type: "Place", community: 1, x: 0.5, y: 0.6 },
      ],
      links: [
        { source: "a", target: "b", relation: "knows" },
        { source: "b", target: "c", relation: "at" },
      ],
    }),
  );
  return graphPath;
}

/**
 * Build StoreCliDeps that route store resolution through the REAL production
 * chain (resolveStoreConfig already ran to produce `cfg`); we only inject the
 * fake `pg` driver and redirect the artifact `target` to a tmp dir.
 */
function deps(state: FakePgState, lines: string[]): StoreCliDeps {
  return {
    env: {
      GRAPHIFY_STORE: "postgres",
      GRAPHIFY_POSTGRES_URL: "postgres://user:pass@localhost:5432/testdb",
    } as NodeJS.ProcessEnv,
    log: (line) => lines.push(line),
    resolveStore: async (id: string, cfg: GraphStoreConfig): Promise<GraphStore> => {
      // Assert the production resolveStoreConfig fed the DSN from the env map.
      expect(id).toBe("postgres");
      expect(cfg.connectionString).toBe("postgres://user:pass@localhost:5432/testdb");
      const { resolveGraphStore } = await import("../src/storage/registry.js");
      return resolveGraphStore(
        id,
        { ...cfg, citySlug: "storecli_test", target: freshTmp("graphify-storecli-art-") },
        { driverModule: makeFakePgModule(state) },
      );
    },
  };
}

const allSql = (state: FakePgState) => state.queries.map((q) => q.text);

// ---------------------------------------------------------------------------
// store push — replace mode rebuilds the aggregate + positions.
// ---------------------------------------------------------------------------

describe("graphify store push (replace mode)", () => {
  it("pushes in replace mode and rebuilds group_counts + positions, reporting a summary", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixture();

    const summary = await runStorePush({ graph, mode: "replace" }, deps(state, lines));

    // Summary reflects the pushed snapshot.
    expect(summary.storeId).toBe("postgres");
    expect(summary.mode).toBe("replace");
    expect(summary.nodes).toBe(3);
    expect(summary.edges).toBe(2);
    expect(summary.communities).toBe(2);
    expect(summary.axes).toContain("node_type");
    expect(summary.axes).toContain("community");
    expect(summary.layouts).toContain("force");
    expect(typeof summary.durationMs).toBe("number");
    expect(summary.dryRun).toBe(false);

    // Replace pushed through pushGraph: delete-then-load + aggregate + positions.
    const sql = allSql(state);
    expect(sql.some((s) => s.includes("DELETE FROM graph_nodes"))).toBe(true);
    expect(sql.some((s) => s.includes("INSERT INTO graph_group_counts"))).toBe(true);
    expect(sql.some((s) => s.includes("INSERT INTO graph_positions"))).toBe(true);

    // Human summary was printed.
    expect(lines.join("\n")).toMatch(/Pushed 3 nodes, 2 edges .*replace mode/);
    expect(lines.join("\n")).toMatch(/Group-by aggregate rebuilt for axes: node_type, community/);
  });
});

// ---------------------------------------------------------------------------
// store push — merge mode does NOT rebuild the aggregate.
// ---------------------------------------------------------------------------

describe("graphify store push (merge mode)", () => {
  it("merges without DELETE and without rebuilding the aggregate", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixture();

    const summary = await runStorePush({ graph, mode: "merge" }, deps(state, lines));

    expect(summary.mode).toBe("merge");
    expect(summary.axes).toEqual([]);
    expect(summary.layouts).toEqual([]);

    const sql = allSql(state);
    expect(sql.some((s) => s.includes("DELETE FROM"))).toBe(false);
    expect(sql.some((s) => s.includes("INSERT INTO graph_group_counts"))).toBe(false);
    expect(lines.join("\n")).toMatch(/Merge mode: the group-by aggregate .* NOT rebuilt/);
  });
});

// ---------------------------------------------------------------------------
// store push — dry-run reports counts without writing.
// ---------------------------------------------------------------------------

describe("graphify store push (dry-run)", () => {
  it("reports counts but performs no INSERTs", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixture();

    const summary = await runStorePush({ graph, mode: "replace", dryRun: true }, deps(state, lines));

    expect(summary.dryRun).toBe(true);
    expect(summary.nodes).toBe(3);
    // Dry-run rebuilds nothing and writes nothing.
    expect(summary.axes).toEqual([]);
    expect(allSql(state).some((s) => s.includes("INSERT INTO graph_nodes"))).toBe(false);
    expect(lines.join("\n")).toMatch(/DRY-RUN/);
  });
});

// ---------------------------------------------------------------------------
// store push — clean error when no store is configured.
// ---------------------------------------------------------------------------

describe("graphify store push (no store configured)", () => {
  it("throws an actionable error when nothing names a backend", async () => {
    const graph = writeGraphFixture();
    await expect(
      runStorePush({ graph }, { env: {} as NodeJS.ProcessEnv, log: () => {} }),
    ).rejects.toThrow(/no GraphStore configured/i);
  });

  it("errors before touching the graph when --store/env/config are all absent", async () => {
    // No --graph either: resolution must fail on the store, not the graph.
    await expect(
      runStorePush({}, { env: {} as NodeJS.ProcessEnv, log: () => {} }),
    ).rejects.toThrow(/GRAPHIFY_STORE|storage\.mirrors|--store/);
  });
});

// ---------------------------------------------------------------------------
// store status — reports capabilities + cheap aggregate totals.
// ---------------------------------------------------------------------------

describe("graphify store status", () => {
  it("reports the store's capabilities and aggregate totals", async () => {
    const state = freshState();
    state.metaRows = [
      { topology_signature: "n=3;e=2;x|", pushed_at: "2026-06-30T00:00:00.000Z", tool_version: "9.9.9" },
    ];
    state.groupRows = [
      { key: "Character", label: "Character", count: 2, parent_key: null },
      { key: "Place", label: "Place", count: 1, parent_key: null },
    ];
    const lines: string[] = [];

    const summary = await runStoreStatus({}, deps(state, lines));

    expect(summary.storeId).toBe("postgres");
    expect(summary.reachable).toBe(true);
    expect(summary.capabilities.aggregate?.axes).toContain("node_type");
    expect(summary.snapshot?.toolVersion).toBe("9.9.9");
    // groupCounts summed across buckets = 3 nodes for each aggregate axis.
    expect(summary.axisTotals["node_type"]).toBe(3);
    expect(lines.join("\n")).toMatch(/group-by aggregate: v1 axes \[node_type, community\]/);
  });

  it("throws an actionable error when no store is configured", async () => {
    await expect(
      runStoreStatus({}, { env: {} as NodeJS.ProcessEnv, log: () => {} }),
    ).rejects.toThrow(/no GraphStore configured/i);
  });
});

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
 * Same nodes/edges as {@link writeGraphFixture} but with NO baked layout — no
 * finite x/y on any node. A replace push then writes ZERO windowed-loader
 * positions even though postgres advertises the window capability, so reporting
 * "Pushed 3 nodes … force" at exit 0 is a success without an effect: the
 * studio's windowed first paint would be empty. Fixture for the fail-loud guard.
 */
function writeGraphFixtureNoPositions(): string {
  const dir = freshTmp("graphify-storecli-noposgraph-");
  const graphPath = join(dir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      directed: false,
      nodes: [
        { id: "a", label: "Alpha", node_type: "Character", community: 0 },
        { id: "b", label: "Beta", node_type: "Character", community: 0 },
        { id: "c", label: "Gamma", node_type: "Place", community: 1 },
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
 * Write a Studio scene.json. With positions: node `a` carries x/y, `b` carries
 * ONLY pinned fx/fy (exercises the fx/fy fallback), `c` carries x/y. Without:
 * the same ids but no finite coordinate anywhere — the positionless scene the
 * `--scene` fail-loud must reject.
 */
function writeSceneFixture(withPositions: boolean): string {
  const dir = freshTmp("graphify-storecli-scene-");
  const scenePath = join(dir, "scene.json");
  const nodes = withPositions
    ? [
        { id: "a", label: "Alpha", x: 1.5, y: 2.5 },
        { id: "b", label: "Beta", fx: 3.5, fy: 4.5 },
        { id: "c", label: "Gamma", x: 5.5, y: 6.5 },
      ]
    : [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
        { id: "c", label: "Gamma" },
      ];
  writeFileSync(scenePath, JSON.stringify({ nodes, edges: [] }));
  return scenePath;
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

/**
 * A store whose DECLARED capabilities and ACTUAL rebuild disagree: it advertises
 * the aggregate + window capabilities (both methods are implemented) but this
 * particular replace push rebuilt nothing. Legitimate — a capability declares an
 * implemented method, not that any given push touched the derived tables.
 *
 * It exists to pin the summary on what the push REPORTS rather than on what the
 * CLI can infer from `mode` + the capability list.
 */
function storeWithNoRebuild(): GraphStore {
  return {
    id: "postgres",
    capabilities: {
      push: true,
      query: true,
      clear: true,
      snapshotMeta: true,
      aggregate: { version: 1, axes: ["node_type", "community"] },
      window: { version: 1, layouts: ["force"], strategies: ["degree-top-n"] },
    },
    verifyConnection: async () => {},
    pushGraph: async () => ({
      nodes: 3,
      edges: 1,
      warnings: [],
      durationMs: 1,
      rebuilt: { axes: [], layouts: [] },
    }),
    readSnapshotMeta: async () => undefined,
    close: async () => {},
  } as unknown as GraphStore;
}

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
// store push — FAIL LOUD: a replace push to a window-capable store that writes
// zero positions for a non-empty graph is a success without an effect, and the
// windowed first paint it claims would be empty — reject it loudly. This is
// independent of where positions come from (the --scene source is a separate
// decision): whatever feeds the layout, a rebuild that produced nothing is a lie.
// ---------------------------------------------------------------------------

describe("graphify store push (fail loud on zero positions)", () => {
  it("throws when a replace push to a window-capable store writes 0 positions for a non-empty graph", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixtureNoPositions();

    // postgres advertises window.layouts = [force]; without the guard this
    // resolves and prints "Pushed 3 nodes … force" at exit 0 while
    // graph_positions got zero rows — a reported success that produced no
    // windowed first paint.
    await expect(
      runStorePush({ graph, mode: "replace" }, deps(state, lines)),
    ).rejects.toThrow(/0 .*position|windowed|no baked layout/i);
  });

  it("does NOT throw on a merge push with 0 positions (merge never claims to rebuild positions)", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixtureNoPositions();

    const summary = await runStorePush({ graph, mode: "merge" }, deps(state, lines));
    expect(summary.mode).toBe("merge");
    expect(summary.nodes).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// store push --scene — consume the pinned positions from a Studio scene.json
// and apply them before the push (D3 contract), and fail loud on a scene that
// carries no finite position. Additive + opt-in: no --scene ⇒ behaviour above.
// ---------------------------------------------------------------------------

describe("graphify store push (--scene consume)", () => {
  it("applies pinned positions from scene.json so a positionless graph pushes real windowed positions", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixtureNoPositions(); // graph.json has NO baked layout
    const scene = writeSceneFixture(true); // scene supplies x/y (+ fx/fy pins)

    const summary = await runStorePush({ graph, scene, mode: "replace" }, deps(state, lines));

    expect(summary.nodes).toBe(3);
    // The scene's coordinates were persisted to graph_positions (the graph itself
    // had none, so without the consume the fail-loud guard would have thrown).
    const posParams = state.queries
      .filter((qy) => qy.text.includes("INSERT INTO graph_positions"))
      .flatMap((qy) => qy.params ?? []);
    expect(posParams).toContain(1.5); // a.x, straight from the scene
    expect(posParams).toContain(4.5); // b.y resolved from the fy pin (fx/fy fallback)
  });

  it("fails loud when --scene yields no finite position (the empty-window republish)", async () => {
    const state = freshState();
    const lines: string[] = [];
    const graph = writeGraphFixtureNoPositions();
    const scene = writeSceneFixture(false); // scene has NO finite coordinate

    await expect(
      runStorePush({ graph, scene, mode: "replace" }, deps(state, lines)),
    ).rejects.toThrow(/scene/i);
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

// ---------------------------------------------------------------------------
// The summary reports what the PUSH rebuilt, never what the CLI can infer.
// ---------------------------------------------------------------------------

describe("graphify store push (rebuild reporting)", () => {
  it("believes a replace push that reports rebuilding nothing, despite the declared capabilities", async () => {
    const lines: string[] = [];
    const graph = writeGraphFixture();

    const summary = await runStorePush(
      { graph, mode: "replace" },
      {
        env: {
          GRAPHIFY_STORE: "postgres",
          GRAPHIFY_POSTGRES_URL: "postgres://user:pass@localhost:5432/testdb",
        } as NodeJS.ProcessEnv,
        log: (line) => lines.push(line),
        resolveStore: async () => storeWithNoRebuild(),
      },
    );

    // Inferring from `mode === "replace"` + the capability list would print
    // "node_type, community" and "force" here — a rebuild that never happened.
    expect(summary.axes).toEqual([]);
    expect(summary.layouts).toEqual([]);
    expect(lines.join("\n")).not.toMatch(/aggregate rebuilt/i);
    expect(lines.join("\n")).not.toMatch(/node_type/);
  });
});

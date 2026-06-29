/**
 * Postgres windowed-loader tests (storage LOT 3).
 *
 * Mirrors tests/storage-postgres-group-counts.test.ts: an in-memory fake `pg`
 * module injected via StoreTestDeps — no real Postgres connection. The fake
 * maintains tiny in-memory `graph_positions`, `graph_nodes` and `graph_edges`
 * tables (reconstructed from INSERT params, cleared on DELETE, filtered on
 * SELECT) so the replace push → layoutPositions / graphWindow round-trip is
 * exercised end-to-end.
 *
 * Coverage:
 *   - the capability is a versioned `window` over the `force` layout +
 *     `degree-top-n` strategy;
 *   - after a REPLACE push, layoutPositions('force') returns exactly the baked
 *     positions (nodes WITHOUT x/y are skipped);
 *   - graphWindow returns the top-N nodes by precomputed degree + ONLY the edges
 *     induced among them, annotated with layout x/y + degree + label/type;
 *   - the limit is clamped (bounded slice — never the full scene);
 *   - the positions rebuild happens INSIDE the replace transaction;
 *   - a MERGE push leaves graph_positions untouched (the staleness guard), so the
 *     window stays scoped to the last REPLACE snapshot;
 *   - FileGraphStore neither declares `window` nor exposes the readers.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";
import type { PostgresGraphStore } from "../src/storage/postgres.js";

// ---------------------------------------------------------------------------
// Fake driver with real graph_positions / graph_nodes / graph_edges round-trips
// ---------------------------------------------------------------------------

interface RecordedSql {
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}

interface PositionRow {
  city_slug: string;
  snapshot_id: string;
  layout_id: string;
  node_id: string;
  x: number;
  y: number;
  degree: number;
}
interface NodeRow {
  city_slug: string;
  id: string;
  label: string | null;
  type: string | null;
}
interface EdgeRow {
  city_slug: string;
  source_id: string;
  target_id: string;
  relation: string;
}

interface InMemoryPgState {
  queries: RecordedSql[];
  positions: PositionRow[];
  nodes: NodeRow[];
  edges: EdgeRow[];
}

function freshState(): InMemoryPgState {
  return { queries: [], positions: [], nodes: [], edges: [] };
}

const POSITION_COLS = 7; // city_slug, snapshot_id, layout_id, node_id, x, y, degree
const NODE_COLS = 6; // city_slug, id, label, type, community, props
const EDGE_COLS = 6; // city_slug, source_id, target_id, relation, confidence, props

function ingestPositions(state: InMemoryPgState, params: unknown[] | undefined) {
  if (!params) return;
  for (let i = 0; i + POSITION_COLS <= params.length; i += POSITION_COLS) {
    const row: PositionRow = {
      city_slug: String(params[i]),
      snapshot_id: String(params[i + 1]),
      layout_id: String(params[i + 2]),
      node_id: String(params[i + 3]),
      x: Number(params[i + 4]),
      y: Number(params[i + 5]),
      degree: Number(params[i + 6]),
    };
    const idx = state.positions.findIndex(
      (r) => r.city_slug === row.city_slug && r.layout_id === row.layout_id && r.node_id === row.node_id,
    );
    if (idx >= 0) state.positions[idx] = row;
    else state.positions.push(row);
  }
}

function ingestNodes(state: InMemoryPgState, params: unknown[] | undefined) {
  if (!params) return;
  for (let i = 0; i + NODE_COLS <= params.length; i += NODE_COLS) {
    const row: NodeRow = {
      city_slug: String(params[i]),
      id: String(params[i + 1]),
      label: params[i + 2] == null ? null : String(params[i + 2]),
      type: params[i + 3] == null ? null : String(params[i + 3]),
    };
    const idx = state.nodes.findIndex((r) => r.city_slug === row.city_slug && r.id === row.id);
    if (idx >= 0) state.nodes[idx] = row;
    else state.nodes.push(row);
  }
}

function ingestEdges(state: InMemoryPgState, params: unknown[] | undefined) {
  if (!params) return;
  for (let i = 0; i + EDGE_COLS <= params.length; i += EDGE_COLS) {
    const row: EdgeRow = {
      city_slug: String(params[i]),
      source_id: String(params[i + 1]),
      target_id: String(params[i + 2]),
      relation: String(params[i + 3]),
    };
    state.edges.push(row);
  }
}

function answer(state: InMemoryPgState, text: string, params?: unknown[]) {
  const upper = text.toUpperCase();

  // ---- DELETEs (replace rebuild / clear) ------------------------------------
  if (text.includes("DELETE FROM graph_positions")) {
    const slug = String(params?.[0]);
    state.positions = state.positions.filter((r) => r.city_slug !== slug);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("DELETE FROM graph_nodes")) {
    const slug = String(params?.[0]);
    state.nodes = state.nodes.filter((r) => r.city_slug !== slug);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("DELETE FROM graph_edges")) {
    const slug = String(params?.[0]);
    state.edges = state.edges.filter((r) => r.city_slug !== slug);
    return { rows: [], rowCount: 0 };
  }

  // ---- INSERTs --------------------------------------------------------------
  if (text.includes("INSERT INTO graph_positions")) {
    ingestPositions(state, params);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("INSERT INTO graph_nodes")) {
    ingestNodes(state, params);
    return { rows: [], rowCount: 0 };
  }
  if (text.includes("INSERT INTO graph_edges")) {
    ingestEdges(state, params);
    return { rows: [], rowCount: 0 };
  }

  // ---- SELECTs --------------------------------------------------------------
  // graphWindow top-N by degree: ORDER BY degree DESC, node_id ASC LIMIT $3.
  if (text.includes("FROM graph_positions") && upper.includes("DEGREE") && upper.includes("LIMIT")) {
    const slug = String(params?.[0]);
    const layout = String(params?.[1]);
    const limit = Number(params?.[2]);
    const rows = state.positions
      .filter((r) => r.city_slug === slug && r.layout_id === layout)
      .sort((a, b) => b.degree - a.degree || a.node_id.localeCompare(b.node_id))
      .slice(0, limit)
      .map((r) => ({ node_id: r.node_id, x: r.x, y: r.y, degree: r.degree }));
    return { rows, rowCount: rows.length };
  }
  // layoutPositions: ORDER BY node_id ASC (no degree column projected).
  if (text.includes("FROM graph_positions") && upper.includes("SELECT")) {
    const slug = String(params?.[0]);
    const layout = String(params?.[1]);
    const rows = state.positions
      .filter((r) => r.city_slug === slug && r.layout_id === layout)
      .sort((a, b) => a.node_id.localeCompare(b.node_id))
      .map((r) => ({ node_id: r.node_id, x: r.x, y: r.y }));
    return { rows, rowCount: rows.length };
  }
  // graphWindow node attrs: SELECT id, label, type ... WHERE id = ANY($2).
  if (text.includes("FROM graph_nodes") && upper.includes("ANY")) {
    const slug = String(params?.[0]);
    const ids = new Set((params?.[1] as string[]).map(String));
    const rows = state.nodes
      .filter((r) => r.city_slug === slug && ids.has(r.id))
      .map((r) => ({ id: r.id, label: r.label, type: r.type }));
    return { rows, rowCount: rows.length };
  }
  // graphWindow induced edges: source_id = ANY($2) AND target_id = ANY($2).
  if (text.includes("FROM graph_edges") && upper.includes("ANY")) {
    const slug = String(params?.[0]);
    const ids = new Set((params?.[1] as string[]).map(String));
    const rows = state.edges
      .filter((r) => r.city_slug === slug && ids.has(r.source_id) && ids.has(r.target_id))
      .map((r) => ({ source_id: r.source_id, target_id: r.target_id, relation: r.relation }));
    return { rows, rowCount: rows.length };
  }

  // graph_group_counts / graph_meta writes + anything else: accepted, no rows.
  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: InMemoryPgState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ via: "pool", text, params });
      return Promise.resolve(answer(state, text, params));
    }
    connect() {
      const client = {
        query(text: string, params?: unknown[]) {
          state.queries.push({ via: "client", text, params });
          return Promise.resolve(answer(state, text, params));
        },
        release() {
          /* no-op */
        },
      };
      return Promise.resolve(client);
    }
    end() {
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

// ---------------------------------------------------------------------------
// Sandbox for the S3-replayable latest.json writes
// ---------------------------------------------------------------------------

const tempDirs: string[] = [];
function freshArtifactBase(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-pgwindow-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function makePostgresStore(
  state: InMemoryPgState,
  citySlug: string,
): Promise<PostgresGraphStore> {
  const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
  const deps: StoreTestDeps = { driverModule: makeFakePgModule(state) };
  return createPostgresGraphStore(
    {
      connectionString: "postgres://user:pass@localhost:5432/testdb",
      citySlug,
      target: freshArtifactBase(),
    },
    deps,
  );
}

/**
 * A small positioned graph. Degrees: hub=3, a=2, b=2, c=1, lonely=0. `lonely`
 * has NO x/y (no baked layout) so it must be skipped from graph_positions.
 */
function positionedGraph(): { G: Graph; communities: Map<number, string[]> } {
  const G = new Graph();
  G.addNode("hub", { label: "Hub", node_type: "code", x: 10, y: 20 });
  G.addNode("a", { label: "Node A", node_type: "doc", x: 1, y: 1 });
  G.addNode("b", { label: "Node B", node_type: "doc", x: 2, y: 2 });
  G.addNode("c", { label: "Node C", node_type: "code", x: 3, y: 3 });
  G.addNode("lonely", { label: "Lonely", node_type: "code" }); // no x/y
  G.addEdge("hub", "a", { relation: "links" });
  G.addEdge("hub", "b", { relation: "links" });
  G.addEdge("hub", "c", { relation: "links" });
  G.addEdge("a", "b", { relation: "links" });
  return { G, communities: new Map([[0, ["hub", "a", "b", "c", "lonely"]]]) };
}

// ---------------------------------------------------------------------------
// Capability surface
// ---------------------------------------------------------------------------

describe("Postgres windowed loader: capability", () => {
  it("declares a versioned window capability over the force layout + degree-top-n", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "caps_win");
    expect(store.capabilities.window).toBeDefined();
    expect(store.capabilities.window!.version).toBe(1);
    expect(store.capabilities.window!.layouts).toContain("force");
    expect(store.capabilities.window!.strategies).toContain("degree-top-n");
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// REPLACE push → layoutPositions
// ---------------------------------------------------------------------------

describe("Postgres windowed loader: per-layout positions", () => {
  it("layoutPositions('force') returns the baked positions; un-positioned nodes are skipped", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_positions");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const positions = await store.layoutPositions("force");
    await store.close();

    // 4 positioned nodes (lonely skipped — no x/y), ordered by node_id ASC.
    expect(positions).toEqual([
      { node_id: "a", x: 1, y: 1 },
      { node_id: "b", x: 2, y: 2 },
      { node_id: "c", x: 3, y: 3 },
      { node_id: "hub", x: 10, y: 20 },
    ]);
  });

  it("layoutPositions returns [] for an unknown layout", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_unknown_layout");
    const { G, communities } = positionedGraph();
    await store.pushGraph(G, communities, { mode: "replace" });
    const positions = await store.layoutPositions("dag");
    await store.close();
    expect(positions).toEqual([]);
  });

  it("rebuilds graph_positions INSIDE the replace transaction (on the txn client)", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_in_txn");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    await store.close();

    const posWrites = state.queries.filter((q) => q.text.includes("INSERT INTO graph_positions"));
    expect(posWrites).toHaveLength(1);
    // The position rebuild commits/rolls back WITH the snapshot: on the client.
    expect(posWrites[0]!.via).toBe("client");
    const clientSql = state.queries.filter((q) => q.via === "client").map((q) => q.text);
    expect(clientSql).toContain("BEGIN");
    expect(clientSql).toContain("COMMIT");
  });
});

// ---------------------------------------------------------------------------
// REPLACE push → graphWindow (degree-top-n)
// ---------------------------------------------------------------------------

describe("Postgres windowed loader: degree-top-n window", () => {
  it("returns the top-N nodes by degree + ONLY the induced edges", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_window_topn");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const window = await store.graphWindow({ layout: "force", limit: 2 });
    await store.close();

    expect(window.strategy).toBe("degree-top-n");
    expect(window.layout).toBe("force");
    expect(window.limit).toBe(2);
    // Top-2 by degree: hub (3), then a/b tie → node_id ASC → 'a'.
    expect(window.nodes.map((n) => n.id)).toEqual(["hub", "a"]);
    // hub carries its layout position + label + type + degree.
    expect(window.nodes[0]).toEqual({
      id: "hub",
      label: "Hub",
      node_type: "code",
      x: 10,
      y: 20,
      degree: 3,
    });
    // Induced edges among {hub, a}: only hub→a (hub→b, hub→c, a→b excluded).
    expect(window.edges).toEqual([{ source: "hub", target: "a", relation: "links" }]);
  });

  it("a larger window returns every positioned node + every induced edge", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_window_full");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const window = await store.graphWindow({ layout: "force", limit: 100 });
    await store.close();

    // 4 positioned nodes by degree desc, node_id asc (lonely excluded).
    expect(window.nodes.map((n) => n.id)).toEqual(["hub", "a", "b", "c"]);
    // All 4 edges are induced (every endpoint is in the window).
    expect(window.edges).toHaveLength(4);
    expect(window.edges.map((e) => `${e.source}->${e.target}`).sort()).toEqual([
      "a->b",
      "hub->a",
      "hub->b",
      "hub->c",
    ]);
  });

  it("clamps the node cap so a window can never ship the full scene", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_window_clamp");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const window = await store.graphWindow({ limit: 10_000_000 });
    await store.close();

    // The effective limit is clamped to the adapter's hard ceiling (20000).
    expect(window.limit).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// Staleness guard: a MERGE push never rebuilds the positions
// ---------------------------------------------------------------------------

describe("Postgres windowed loader: merge staleness guard", () => {
  it("a MERGE push leaves graph_positions untouched, so the window stays on the last REPLACE snapshot", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "wl_merge_guard");
    const { G, communities } = positionedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const afterReplace = await store.graphWindow({ layout: "force", limit: 100 });
    expect(afterReplace.nodes.map((n) => n.id)).toEqual(["hub", "a", "b", "c"]);

    const writesBeforeMerge = state.queries.length;

    // MERGE push that introduces a NEW high-degree positioned node. A merge is
    // upsert-only — it lands the node row but, by design, does NOT rebuild
    // graph_positions; the guard keeps the stale position out of the window.
    const merged = new Graph();
    merged.addNode("zeta", { label: "Zeta", node_type: "code", x: 9, y: 9 });
    merged.addNode("hub", { label: "Hub", node_type: "code", x: 10, y: 20 });
    merged.addEdge("zeta", "hub", { relation: "links" });
    await store.pushGraph(merged, new Map(), { mode: "merge" });

    const mergeQueries = state.queries.slice(writesBeforeMerge);
    expect(
      mergeQueries.filter((q) => q.text.includes("INSERT INTO graph_positions")),
    ).toHaveLength(0);
    expect(
      mergeQueries.filter((q) => q.text.includes("DELETE FROM graph_positions")),
    ).toHaveLength(0);

    // The window still reflects the REPLACE snapshot — 'zeta' is absent.
    const afterMerge = await store.graphWindow({ layout: "force", limit: 100 });
    await store.close();
    expect(afterMerge.nodes.map((n) => n.id)).toEqual(["hub", "a", "b", "c"]);
    expect(afterMerge.nodes.some((n) => n.id === "zeta")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Capability absent / no-op on a backend that doesn't implement it
// ---------------------------------------------------------------------------

describe("Postgres windowed loader: capability gating on other backends", () => {
  it("FileGraphStore neither declares window nor exposes the readers", async () => {
    const { createFileGraphStore } = await import("../src/storage/file.js");
    const base = freshArtifactBase();
    const store: GraphStore = createFileGraphStore({ target: join(base, "graph.json") });

    expect(store.capabilities.window).toBeUndefined();
    expect(store.layoutPositions).toBeUndefined();
    expect(store.graphWindow).toBeUndefined();
    await store.close();
  });
});

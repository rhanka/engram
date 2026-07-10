/**
 * Postgres group-by counts aggregate tests (storage LOT 1).
 *
 * Mirrors the tests/storage-postgres.test.ts harness: an in-memory fake `pg`
 * module injected via StoreTestDeps — no real Postgres connection is required.
 * This fake additionally maintains a tiny in-memory `graph_group_counts` table
 * (reconstructed from INSERT params, cleared on DELETE, filtered on SELECT) so
 * the replace push → groupCounts read round-trip is exercised end-to-end.
 *
 * Coverage:
 *   - after a REPLACE push, groupCounts('node_type') returns correct per-type
 *     counts (and 'community' as the second LOT 1 axis);
 *   - after a MERGE push that changes the node population, the counts do NOT
 *     include the stale row — the merge leaves graph_group_counts untouched
 *     (the staleness guard), so the aggregate stays scoped to the last REPLACE
 *     snapshot;
 *   - the capability is absent and groupCounts is a no-op/undefined on a backend
 *     that does not implement it (FileGraphStore).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";
import type { PostgresGraphStore } from "../src/storage/postgres.js";

// ---------------------------------------------------------------------------
// Fake driver with a real graph_group_counts round-trip
// ---------------------------------------------------------------------------

interface RecordedSql {
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}

/** A reconstructed graph_group_counts row (column order = COUNT_COLUMNS). */
interface CountRow {
  city_slug: string;
  snapshot_id: string;
  axis: string;
  key: string;
  label: string | null;
  count: number;
  parent_key: string | null;
}

interface InMemoryPgState {
  queries: RecordedSql[];
  connects: number;
  /** The emulated graph_group_counts table contents. */
  countRows: CountRow[];
}

function freshState(): InMemoryPgState {
  return { queries: [], connects: 0, countRows: [] };
}

const COUNT_COLS = 7; // city_slug, snapshot_id, axis, key, label, count, parent_key

function chunkParams(params: unknown[] | undefined): CountRow[] {
  const rows: CountRow[] = [];
  if (!params) return rows;
  for (let i = 0; i + COUNT_COLS <= params.length; i += COUNT_COLS) {
    rows.push({
      city_slug: String(params[i]),
      snapshot_id: String(params[i + 1]),
      axis: String(params[i + 2]),
      key: String(params[i + 3]),
      label: params[i + 4] == null ? null : String(params[i + 4]),
      count: Number(params[i + 5]),
      parent_key: params[i + 6] == null ? null : String(params[i + 6]),
    });
  }
  return rows;
}

function answer(state: InMemoryPgState, text: string, params?: unknown[]) {
  const upper = text.toUpperCase();

  // graph_group_counts DELETE (replace rebuild / clear): drop the city's rows.
  if (text.includes("DELETE FROM graph_group_counts")) {
    const slug = String(params?.[0]);
    state.countRows = state.countRows.filter((r) => r.city_slug !== slug);
    return { rows: [], rowCount: 0 };
  }
  // graph_group_counts INSERT (upsert): reconstruct rows from params, upsert by
  // the (city_slug, axis, key) primary key.
  if (text.includes("INSERT INTO graph_group_counts")) {
    for (const row of chunkParams(params)) {
      const idx = state.countRows.findIndex(
        (r) => r.city_slug === row.city_slug && r.axis === row.axis && r.key === row.key,
      );
      if (idx >= 0) state.countRows[idx] = row;
      else state.countRows.push(row);
    }
    return { rows: [], rowCount: 0 };
  }
  // graph_group_counts SELECT (groupCounts read): filter by city_slug + axis,
  // ORDER BY count DESC, key ASC (mirrors the adapter's query).
  if (text.includes("graph_group_counts") && upper.includes("SELECT")) {
    const slug = String(params?.[0]);
    const axis = String(params?.[1]);
    const rows = state.countRows
      .filter((r) => r.city_slug === slug && r.axis === axis)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .map((r) => ({ key: r.key, label: r.label, count: r.count, parent_key: r.parent_key }));
    return { rows, rowCount: rows.length };
  }
  // graph_meta SELECT: no preseeded rows here (local cache covers reads).
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
      state.connects += 1;
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
  const dir = mkdtempSync(join(tmpdir(), "graphify-pgcounts-"));
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

/** code×2 + doc×1, 2 communities (0 → alpha,beta ; 1 → gamma). */
function typedGraph(): { G: Graph; communities: Map<number, string[]> } {
  const G = new Graph();
  G.addNode("alpha", { label: "Alpha", node_type: "code" });
  G.addNode("beta", { label: "Beta", node_type: "code" });
  G.addNode("gamma", { label: "Gamma", node_type: "doc" });
  G.addEdge("alpha", "beta", { relation: "imports" });
  return { G, communities: new Map([[0, ["alpha", "beta"]], [1, ["gamma"]]]) };
}

function countOf(groups: { key: string; count: number }[], key: string): number | undefined {
  return groups.find((g) => g.key === key)?.count;
}

// ---------------------------------------------------------------------------
// Capability surface
// ---------------------------------------------------------------------------

describe("Postgres group counts: capability", () => {
  it("declares a versioned aggregate capability over node_type + community", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "caps_agg");
    expect(store.capabilities.aggregate).toBeDefined();
    expect(store.capabilities.aggregate!.version).toBe(1);
    expect(store.capabilities.aggregate!.axes).toContain("node_type");
    expect(store.capabilities.aggregate!.axes).toContain("community");
    await store.close();
  });
});

// ---------------------------------------------------------------------------
// REPLACE push → groupCounts
// ---------------------------------------------------------------------------

describe("Postgres group counts: replace push aggregate", () => {
  it("groupCounts('node_type') returns correct per-type counts after a REPLACE push", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_replace");
    const { G, communities } = typedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const result = await store.groupCounts!("node_type");
    await store.close();

    expect(result.axis).toBe("node_type");
    expect(countOf(result.groups, "code")).toBe(2);
    expect(countOf(result.groups, "doc")).toBe(1);
    // Ordered by count desc: code (2) before doc (1).
    expect(result.groups.map((g) => g.key)).toEqual(["code", "doc"]);
    // Flat axis: no parent_key.
    expect(result.groups.every((g) => g.parent_key === undefined)).toBe(true);
  });

  it("rebuilds the counts INSIDE the replace push transaction (on the txn client)", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_in_txn");
    const { G, communities } = typedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    await store.close();

    const countWrites = state.queries.filter(
      (q) => q.text.includes("INSERT INTO graph_group_counts"),
    );
    expect(countWrites).toHaveLength(1);
    // The aggregate write happens on the checked-out transaction client, not the
    // pool — so it commits/rolls back with the snapshot.
    expect(countWrites[0]!.via).toBe("client");
    const clientSql = state.queries.filter((q) => q.via === "client").map((q) => q.text);
    expect(clientSql).toContain("BEGIN");
    expect(clientSql).toContain("COMMIT");
  });

  it("groupCounts('community') returns correct per-community counts", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_comm");
    const { G, communities } = typedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const result = await store.groupCounts!("community");
    await store.close();

    expect(countOf(result.groups, "0")).toBe(2);
    expect(countOf(result.groups, "1")).toBe(1);
    expect(result.groups.find((g) => g.key === "0")!.label).toBe("Community 0");
  });

  it("groupCounts('community') labels a community by its node community_name when present", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_comm_named");

    // Community 0's members carry a human `community_name`; community 1 does not.
    const G = new Graph();
    G.addNode("alpha", { label: "Alpha", node_type: "code", community_name: "Detectives" });
    G.addNode("beta", { label: "Beta", node_type: "code", community_name: "Detectives" });
    G.addNode("gamma", { label: "Gamma", node_type: "doc" });
    G.addEdge("alpha", "beta", { relation: "imports" });
    const communities = new Map([[0, ["alpha", "beta"]], [1, ["gamma"]]]);

    await store.pushGraph(G, communities, { mode: "replace" });
    const result = await store.groupCounts!("community");
    await store.close();

    // The named community surfaces its community_name as the group label…
    expect(result.groups.find((g) => g.key === "0")!.label).toBe("Detectives");
    // …while an unnamed community keeps the synthetic fallback.
    expect(result.groups.find((g) => g.key === "1")!.label).toBe("Community 1");
  });

  it("returns an empty group list for an unknown / deferred axis (class_id)", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_unknown");
    const { G, communities } = typedGraph();

    await store.pushGraph(G, communities, { mode: "replace" });
    const result = await store.groupCounts!("class_id");
    await store.close();

    expect(result).toEqual({ axis: "class_id", groups: [] });
  });
});

// ---------------------------------------------------------------------------
// Staleness guard: a MERGE push never rebuilds the aggregate
// ---------------------------------------------------------------------------

describe("Postgres group counts: merge staleness guard", () => {
  it("a MERGE push leaves graph_group_counts untouched, so the counts exclude the stale row", async () => {
    const state = freshState();
    const store = await makePostgresStore(state, "gc_merge_guard");

    // Baseline REPLACE snapshot: 2 code nodes only → { code: 2 }.
    const base = new Graph();
    base.addNode("alpha", { label: "Alpha", node_type: "code" });
    base.addNode("beta", { label: "Beta", node_type: "code" });
    await store.pushGraph(base, new Map([[0, ["alpha", "beta"]]]), { mode: "replace" });

    const afterReplace = await store.groupCounts!("node_type");
    expect(countOf(afterReplace.groups, "code")).toBe(2);
    expect(countOf(afterReplace.groups, "doc")).toBeUndefined();

    // Drop the writes recorded so far so the next assertion is about the merge.
    const writesBeforeMerge = state.queries.length;

    // MERGE push that mutates the node population: it upserts a NEW doc node
    // (gamma). A merge is upsert-only — it physically lands gamma in graph_nodes
    // but, by design, does NOT rebuild the aggregate. A naive rebuild-on-merge
    // would surface a stale "doc: 1" bucket; the guard keeps it out.
    const merged = new Graph();
    merged.addNode("gamma", { label: "Gamma", node_type: "doc" });
    await store.pushGraph(merged, new Map(), { mode: "merge" });

    const mergeQueries = state.queries.slice(writesBeforeMerge);
    // The guard: the merge issued NO write against graph_group_counts.
    expect(
      mergeQueries.filter((q) => q.text.includes("INSERT INTO graph_group_counts")),
    ).toHaveLength(0);
    expect(
      mergeQueries.filter((q) => q.text.includes("DELETE FROM graph_group_counts")),
    ).toHaveLength(0);

    // The outcome: the aggregate still reflects the last REPLACE snapshot and
    // does NOT include the stale doc row introduced by the merge.
    const afterMerge = await store.groupCounts!("node_type");
    await store.close();
    expect(countOf(afterMerge.groups, "code")).toBe(2);
    expect(countOf(afterMerge.groups, "doc")).toBeUndefined();
    expect(afterMerge.groups).toEqual(afterReplace.groups);
  });
});

// ---------------------------------------------------------------------------
// Capability absent / no-op on a backend that doesn't implement it
// ---------------------------------------------------------------------------

describe("Postgres group counts: capability gating on other backends", () => {
  it("FileGraphStore neither declares aggregate nor exposes groupCounts", async () => {
    const { createFileGraphStore } = await import("../src/storage/file.js");
    const base = freshArtifactBase();
    const store: GraphStore = createFileGraphStore({ target: join(base, "graph.json") });

    expect(store.capabilities.aggregate).toBeUndefined();
    expect(store.groupCounts).toBeUndefined();
    await store.close();
  });
});

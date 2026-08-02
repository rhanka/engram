/**
 * Postgres GraphStore — incremental append + append-only tombstone erasure (D5,
 * §5 / §3.5). Fake-driver unit tests: they assert the CONTRACT SQL shape (the
 * upserts, the tombstone insert, and — critically — that every structured read
 * folds tombstones out) plus the strict-endpoint fail-loud. The fake does not
 * execute SQL, so end-to-end exclusion is covered by the gated live suite; here
 * we prove the exclusion clause is WIRED into each read and the writes are upserts.
 */
import { describe, expect, it } from "vitest";

import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";

interface RecordedSql {
  via: "pool" | "client";
  text: string;
  params?: unknown[];
}
interface FakeState {
  queries: RecordedSql[];
  /** {created} the appendNode/appendEdge RETURNING should report. */
  nodeCreated: boolean;
  edgeCreated: boolean;
  /** ids the endpoint-existence check should report as present. */
  endpointIds: string[];
  /** rows the tombstone INSERT ... RETURNING should report (1 row = applied). */
  tombstoneRows: Array<Record<string, unknown>>;
}

function freshState(): FakeState {
  return { queries: [], nodeCreated: true, edgeCreated: true, endpointIds: [], tombstoneRows: [{ applied: true }] };
}

function answer(state: FakeState, text: string, params?: unknown[]) {
  const upper = text.toUpperCase();
  if (text.includes("INSERT INTO graph_nodes") && upper.includes("RETURNING")) {
    return { rows: [{ created: state.nodeCreated }], rowCount: 1 };
  }
  if (text.includes("INSERT INTO graph_edges") && upper.includes("RETURNING")) {
    return { rows: [{ created: state.edgeCreated }], rowCount: 1 };
  }
  if (text.includes("INSERT INTO graph_tombstones")) {
    return { rows: state.tombstoneRows, rowCount: state.tombstoneRows.length };
  }
  // Endpoint-existence probe for appendEdge: SELECT id FROM graph_nodes ... = ANY($2)
  if (upper.includes("SELECT") && text.includes("graph_nodes") && text.includes("ANY(")) {
    const wanted = new Set((params?.[1] as string[]) ?? []);
    const rows = state.endpointIds.filter((id) => wanted.has(id)).map((id) => ({ id }));
    return { rows, rowCount: rows.length };
  }
  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: FakeState) {
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
        release() {},
      };
      return Promise.resolve(client);
    }
    end() {
      return Promise.resolve();
    }
  }
  return { Pool: FakePool };
}

async function makeStore(state: FakeState): Promise<GraphStore> {
  const { createPostgresGraphStore } = await import("../src/storage/postgres.js");
  const deps: StoreTestDeps = { driverModule: makeFakePgModule(state) };
  return createPostgresGraphStore(
    { connectionString: "postgres://user:pass@localhost:5432/testdb", citySlug: "test_city" },
    deps,
  );
}

const allSql = (state: FakeState) => state.queries.map((q) => q.text);

describe("postgres append/tombstone — capability (M4)", () => {
  it("declares a VERSIONED append capability (upsert + strict endpoints + tombstone)", async () => {
    const store = await makeStore(freshState());
    expect(store.capabilities.append).toEqual({
      version: 1,
      upsert: true,
      requiresExistingEndpoints: true,
      tombstone: true,
    });
    // M4: the three methods travel with the capability, never a silent no-op.
    expect(typeof store.appendNode).toBe("function");
    expect(typeof store.appendEdge).toBe("function");
    expect(typeof store.appendTombstone).toBe("function");
  });
});

describe("postgres append — appendNode/appendEdge", () => {
  it("appendNode upserts one node and reports created", async () => {
    const state = freshState();
    state.nodeCreated = true;
    const store = await makeStore(state);

    const out = await store.appendNode!({ id: "m1", label: "Memo", node_type: "Fact", t: 1710000000000 });

    expect(out).toEqual({ created: true });
    const sql = allSql(state);
    expect(sql.some((s) => s.includes("INSERT INTO graph_nodes") && s.toUpperCase().includes("ON CONFLICT"))).toBe(true);
  });

  it("appendEdge upserts one edge when BOTH endpoints exist", async () => {
    const state = freshState();
    state.endpointIds = ["a", "b"]; // both present
    const store = await makeStore(state);

    const out = await store.appendEdge!({ source: "a", target: "b", relation: "cites" });

    expect(out).toEqual({ created: true });
    expect(allSql(state).some((s) => s.includes("INSERT INTO graph_edges"))).toBe(true);
  });

  it("appendEdge FAILS LOUD when an endpoint is absent (requiresExistingEndpoints)", async () => {
    const state = freshState();
    state.endpointIds = ["a"]; // target 'b' missing
    const store = await makeStore(state);

    await expect(store.appendEdge!({ source: "a", target: "b", relation: "cites" })).rejects.toThrow(
      /endpoint|exist/i,
    );
    // The dangling edge must NOT have been written.
    expect(allSql(state).some((s) => s.includes("INSERT INTO graph_edges"))).toBe(false);
  });
});

describe("postgres tombstone — append-only erasure (§3.5)", () => {
  it("appendTombstone appends a tombstone row and reports applied", async () => {
    const state = freshState();
    const store = await makeStore(state);

    const out = await store.appendTombstone!({ target: { kind: "node", id: "m1" }, reason: "A2 erasure" });

    expect(out).toEqual({ applied: true });
    expect(allSql(state).some((s) => s.includes("INSERT INTO graph_tombstones"))).toBe(true);
  });
});

describe("postgres tombstone — fold-out is wired into EVERY structured read", () => {
  it("groupCounts (aggregate) subtracts tombstoned nodes", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await store.groupCounts!("node_type");
    // The aggregate READ itself joins graph_tombstones to subtract erased nodes
    // (not merely the CREATE TABLE from ensureSchema — both tables in one stmt).
    expect(
      allSql(state).some((s) => s.includes("graph_group_counts") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("layoutPositions excludes tombstoned nodes", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await store.layoutPositions!("force");
    expect(
      allSql(state).some((s) => s.includes("graph_positions") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("graphWindow excludes tombstoned nodes/edges", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await store.graphWindow!({ layout: "force", limit: 10 });
    expect(
      allSql(state).some((s) => s.includes("graph_positions") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("queryWindow excludes tombstoned nodes/edges", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await store.queryWindow!(0, 9_999_999_999_999);
    expect(
      allSql(state).some((s) => s.includes("FROM graph_nodes") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("queryNeighbors excludes tombstoned nodes/edges", async () => {
    const state = freshState();
    const store = await makeStore(state);
    // queryNeighbors is the adapter's neighbour read (present on the postgres store).
    await (store as unknown as { queryNeighbors(id: string): Promise<unknown> }).queryNeighbors("m1");
    expect(
      allSql(state).some((s) => s.includes("graph_edges") && s.includes("graph_tombstones")),
    ).toBe(true);
  });
});

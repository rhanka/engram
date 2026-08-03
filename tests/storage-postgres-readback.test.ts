/**
 * Postgres GraphStore — agent-memory READ-BACK (SPEC_AGENT_MEMORY_SUBSTRATE §9.5,
 * Postgres-only). The mirror of the append path: loadNode / listMemoryNotes /
 * loadTombstones let the memory factory's injected deps read what the append path
 * wrote. Fake-driver tests — the fake returns CANNED rows, so they assert (a) the
 * read-back capability + methods travel together (M4-shaped), (b) every node
 * read-back folds tombstones out (joins graph_tombstones), (c) listMemoryNotes
 * filters `type = 'MemoryNote'` and pushes a tenancy VISIBILITY superset, and
 * (d) the row→record reconstruction lifts the canonical `node_type` from the typed
 * column and carries the persisted props. End-to-end SQL execution is the gated
 * live suite's job; here we prove the read-back is WIRED with fold-out.
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
  /** row(s) the single-node read (loadNode) should return. */
  nodeRows: Array<Record<string, unknown>>;
  /** rows the listMemoryNotes read should return. */
  memoryRows: Array<Record<string, unknown>>;
  /** rows the loadTombstones read should return. */
  tombstoneRows: Array<Record<string, unknown>>;
}

function freshState(over: Partial<FakeState> = {}): FakeState {
  return { queries: [], nodeRows: [], memoryRows: [], tombstoneRows: [], ...over };
}

function answer(state: FakeState, text: string) {
  const t = text;
  if (t.includes("FROM graph_tombstones") && t.includes("SELECT") && !t.includes("NOT EXISTS")) {
    // The top-level loadTombstones read (the fold-out subqueries also say
    // "FROM graph_tombstones" but are wrapped in NOT EXISTS).
    return { rows: state.tombstoneRows, rowCount: state.tombstoneRows.length };
  }
  if (t.includes("FROM graph_nodes") && t.includes("'MemoryNote'")) {
    return { rows: state.memoryRows, rowCount: state.memoryRows.length };
  }
  if (t.includes("FROM graph_nodes") && t.includes("LIMIT 1")) {
    return { rows: state.nodeRows, rowCount: state.nodeRows.length };
  }
  return { rows: [], rowCount: 0 };
}

function makeFakePgModule(state: FakeState) {
  class FakePool {
    constructor(_config?: Record<string, unknown>) {}
    query(text: string, params?: unknown[]) {
      state.queries.push({ via: "pool", text, params });
      return Promise.resolve(answer(state, text));
    }
    connect() {
      const client = {
        query(text: string, params?: unknown[]) {
          state.queries.push({ via: "client", text, params });
          return Promise.resolve(answer(state, text));
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

/** A graph_nodes row as the append path persists a MemoryNote: node_type in the
 *  typed `type` column, everything else in the props jsonb. `over` overrides the
 *  typed columns (id/label/type/community). */
function memoryRow(over: Record<string, unknown> = {}) {
  const props = {
    memory_kind: "decision",
    subject: "agent-work",
    t: 1_750_000_000_000,
    t_src: "authored-at",
    scope: "private",
    principal_owner: "human:antoinefa",
    provenance: { cited: "correction Y", source: "ref:A" },
    event: { at: 1_750_000_000_000, kind: "decision-taken", ref: "ref:A" },
    trust: "asserted",
    review_status: "pending",
    reconcilable: false,
  };
  return {
    id: "mem:1",
    label: "mem:1",
    type: "MemoryNote",
    community: null,
    props: JSON.stringify(props),
    ...over,
  };
}

describe("postgres read-back — capability (M4-shaped)", () => {
  it("declares a VERSIONED readback capability that travels with all three methods", async () => {
    const store = await makeStore(freshState());
    expect(store.capabilities.readback).toEqual({ version: 1, tombstoneFolded: true });
    expect(typeof store.loadNode).toBe("function");
    expect(typeof store.listMemoryNotes).toBe("function");
    expect(typeof store.loadTombstones).toBe("function");
  });
});

describe("postgres read-back — loadNode", () => {
  it("reads one node by id, folds tombstones out, and lifts node_type from the typed column", async () => {
    const state = freshState({ nodeRows: [memoryRow()] });
    const store = await makeStore(state);

    const rec = await store.loadNode!("mem:1");

    expect(rec).not.toBeNull();
    expect(rec!.id).toBe("mem:1");
    // canonical node_type from the `type` column, not a spoofable prop
    expect(rec!.node_type).toBe("MemoryNote");
    // persisted props are carried back
    expect(rec!.principal_owner).toBe("human:antoinefa");
    expect(rec!.review_status).toBe("pending");
    expect((rec!.provenance as { source: string }).source).toBe("ref:A");
    // the read folds tombstones out (joins graph_tombstones)
    expect(
      allSql(state).some((s) => s.includes("FROM graph_nodes") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("returns null when the id has no live row", async () => {
    const state = freshState({ nodeRows: [] });
    const store = await makeStore(state);
    expect(await store.loadNode!("mem:absent")).toBeNull();
  });
});

describe("postgres read-back — listMemoryNotes", () => {
  it("filters type='MemoryNote', folds tombstones out, and reconstructs records", async () => {
    const state = freshState({ memoryRows: [memoryRow(), memoryRow({ id: "mem:2" })] });
    const store = await makeStore(state);

    const notes = await store.listMemoryNotes!();

    expect(notes.map((n) => n.id)).toEqual(["mem:1", "mem:2"]);
    expect(notes.every((n) => n.node_type === "MemoryNote")).toBe(true);
    const sql = allSql(state);
    expect(sql.some((s) => s.includes("'MemoryNote'"))).toBe(true);
    expect(sql.some((s) => s.includes("graph_nodes") && s.includes("graph_tombstones"))).toBe(true);
  });

  it("pushes a tenancy VISIBILITY superset when principalOwner is given (capitalised OR owner)", async () => {
    const state = freshState({ memoryRows: [] });
    const store = await makeStore(state);
    await store.listMemoryNotes!({ principalOwner: "human:antoinefa" });
    const listSql = allSql(state).find((s) => s.includes("'MemoryNote'"))!;
    expect(listSql).toContain("capitalised");
    expect(listSql).toContain("principal_owner");
  });
});

describe("postgres read-back — loadTombstones", () => {
  it("reads the append-only journal and maps node + edge rows to records", async () => {
    const state = freshState({
      tombstoneRows: [
        { target_kind: "node", node_id: "mem:erased", edge_source: "", edge_target: "", edge_relation: "", t: "1750000000001", reason: "human:antoinefa" },
        { target_kind: "edge", node_id: "", edge_source: "a", edge_target: "b", edge_relation: "cites", t: null, reason: null },
      ],
    });
    const store = await makeStore(state);

    const tombs = await store.loadTombstones!();

    expect(tombs).toHaveLength(2);
    expect(tombs[0].target).toEqual({ kind: "node", id: "mem:erased" });
    expect(tombs[0].reason).toBe("human:antoinefa");
    expect(tombs[0].t).toBe(1_750_000_000_001);
    expect(tombs[1].target).toEqual({ kind: "edge", source: "a", target: "b", relation: "cites" });
    expect(allSql(state).some((s) => s.includes("FROM graph_tombstones"))).toBe(true);
  });
});

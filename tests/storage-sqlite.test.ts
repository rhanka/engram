// NATIVE VERIFICATION PENDING — install better-sqlite3 + exécution différés (pression mémoire)
/**
 * SQLite GraphStore — narrow v1 surface: incremental append + append-only
 * tombstone erasure (D5, §5 / §3.5) AND the agent-memory read-back (loadNode /
 * listMemoryNotes / loadTombstones). Fake-driver unit tests, mirror of the
 * postgres append + read-back suites: they assert the CONTRACT SQL shape (the
 * upserts, the tombstone DO NOTHING insert, and — critically — that every
 * structured read folds tombstones out) plus the strict-endpoint fail-loud and
 * the row→record reconstruction that lifts the canonical `node_type` from the
 * typed column. The fake does not execute SQL, so end-to-end exclusion is the
 * gated live suite's job; here we prove the fold-out is WIRED into each read and
 * the writes are upserts.
 *
 * NOTE: better-sqlite3 is synchronous (prepare().run/get/all), so the fake mirrors
 * that surface rather than the async pg pool. NATIVE VERIFICATION (install + run)
 * is deferred under memory pressure — see the file header.
 */
import { describe, expect, it } from "vitest";

import type { GraphStore, StoreTestDeps } from "../src/storage/types.js";

interface RecordedSql {
  kind: "run" | "get" | "all" | "exec";
  text: string;
  params: unknown[];
}
interface FakeState {
  statements: RecordedSql[];
  /** ids the node existence-probe (SELECT 1 AS x FROM graph_nodes) reports present. */
  presentNodeIds: string[];
  /** whether the edge existence-probe reports the edge already present. */
  edgePresent: boolean;
  /** changes the tombstone INSERT ... DO NOTHING reports (1 = applied, 0 = duplicate). */
  tombstoneChanges: number;
  /** row(s) the single-node read (loadNode) returns. */
  nodeRows: Array<Record<string, unknown>>;
  /** rows the listMemoryNotes read returns. */
  memoryRows: Array<Record<string, unknown>>;
  /** rows the loadTombstones read returns. */
  tombstoneRows: Array<Record<string, unknown>>;
}

function freshState(over: Partial<FakeState> = {}): FakeState {
  return {
    statements: [],
    presentNodeIds: [],
    edgePresent: false,
    tombstoneChanges: 1,
    nodeRows: [],
    memoryRows: [],
    tombstoneRows: [],
    ...over,
  };
}

function answerGet(state: FakeState, text: string, params: unknown[]): Record<string, unknown> | undefined {
  if (text.includes("SELECT 1 AS ok")) return { ok: 1 };
  if (text.includes("1 AS x") && text.includes("FROM graph_nodes")) {
    // node existence probe: params = [slug, id]
    return state.presentNodeIds.includes(String(params[1])) ? { x: 1 } : undefined;
  }
  if (text.includes("1 AS x") && text.includes("FROM graph_edges")) {
    return state.edgePresent ? { x: 1 } : undefined;
  }
  if (text.includes("FROM graph_meta")) return undefined;
  if (text.includes("FROM graph_nodes") && text.includes("LIMIT 1")) {
    return state.nodeRows[0];
  }
  return undefined;
}

function answerAll(state: FakeState, text: string): Array<Record<string, unknown>> {
  if (text.includes("'MemoryNote'")) return state.memoryRows;
  // The top-level loadTombstones read (the fold-out subqueries also say
  // "FROM graph_tombstones" but are wrapped in NOT EXISTS inside other statements).
  if (text.includes("FROM graph_tombstones") && !text.includes("NOT EXISTS")) {
    return state.tombstoneRows;
  }
  if (text.includes("FROM graph_nodes")) return [];
  if (text.includes("FROM graph_edges")) return [];
  return [];
}

function answerRun(state: FakeState, text: string): { changes: number; lastInsertRowid: number } {
  if (text.includes("INSERT INTO graph_tombstones")) {
    return { changes: state.tombstoneChanges, lastInsertRowid: 0 };
  }
  if (text.includes("INSERT INTO graph_nodes")) return { changes: 1, lastInsertRowid: 0 };
  if (text.includes("INSERT INTO graph_edges")) return { changes: 1, lastInsertRowid: 0 };
  if (text.includes("INSERT INTO graph_meta")) return { changes: 1, lastInsertRowid: 0 };
  return { changes: 0, lastInsertRowid: 0 };
}

function makeFakeSqliteModule(state: FakeState) {
  class FakeStatement {
    constructor(private readonly text: string) {}
    run(...params: unknown[]) {
      state.statements.push({ kind: "run", text: this.text, params });
      return answerRun(state, this.text);
    }
    get(...params: unknown[]) {
      state.statements.push({ kind: "get", text: this.text, params });
      return answerGet(state, this.text, params);
    }
    all(...params: unknown[]) {
      state.statements.push({ kind: "all", text: this.text, params });
      return answerAll(state, this.text);
    }
  }
  class FakeDatabase {
    constructor(_filename: string, _options?: Record<string, unknown>) {}
    prepare(text: string) {
      return new FakeStatement(text);
    }
    exec(text: string) {
      state.statements.push({ kind: "exec", text, params: [] });
      return this;
    }
    pragma(_source: string) {
      return undefined;
    }
    transaction<A extends unknown[], R>(fn: (...args: A) => R) {
      return (...args: A): R => fn(...args);
    }
    close() {}
  }
  return { default: FakeDatabase };
}

async function makeStore(state: FakeState): Promise<GraphStore> {
  const { createSqliteGraphStore } = await import("../src/storage/sqlite.js");
  const deps: StoreTestDeps = { driverModule: makeFakeSqliteModule(state) };
  return createSqliteGraphStore({ target: ":memory:", citySlug: "test_city" }, deps);
}

const allSql = (state: FakeState) =>
  state.statements.filter((s) => s.kind !== "exec").map((s) => s.text);
const runSql = (state: FakeState) =>
  state.statements.filter((s) => s.kind === "run").map((s) => s.text);

/** A graph_nodes row as the append path persists a MemoryNote: node_type in the
 *  typed `type` column, principal_owner / scope / t lifted to typed columns, the
 *  extensible pass-through in the props JSON text. `over` overrides the columns. */
function memoryRow(over: Record<string, unknown> = {}) {
  const props = {
    memory_kind: "decision",
    subject: "agent-work",
    t_src: "authored-at",
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
    principal_owner: "human:antoinefa",
    scope: "private",
    t: 1_750_000_000_000,
    t_end: null,
    props: JSON.stringify(props),
    ...over,
  };
}

describe("sqlite — narrow capability matrix (dossier §1.4)", () => {
  it("declares push/clear/snapshotMeta + queryWindow, but NOT query/aggregate/window", async () => {
    const store = await makeStore(freshState());
    expect(store.capabilities.push).toBe(true);
    expect(store.capabilities.clear).toBe(true);
    expect(store.capabilities.snapshotMeta).toBe(true);
    expect(store.capabilities.queryWindow).toBe(true);
    // query is false — no raw SQL on the memory path.
    expect(store.capabilities.query).toBe(false);
    expect(typeof store.query).toBe("undefined");
    // aggregate / window are ABSENT (never a present-but-no-op method).
    expect(store.capabilities.aggregate).toBeUndefined();
    expect(store.capabilities.window).toBeUndefined();
    expect(typeof store.groupCounts).toBe("undefined");
    expect(typeof store.graphWindow).toBe("undefined");
    expect(typeof store.layoutPositions).toBe("undefined");
  });

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

  it("declares a VERSIONED readback capability that travels with all three methods", async () => {
    const store = await makeStore(freshState());
    expect(store.capabilities.readback).toEqual({ version: 1, tombstoneFolded: true });
    expect(typeof store.loadNode).toBe("function");
    expect(typeof store.listMemoryNotes).toBe("function");
    expect(typeof store.loadTombstones).toBe("function");
  });
});

describe("sqlite append — appendNode/appendEdge", () => {
  it("appendNode upserts one node and reports created (key absent)", async () => {
    const state = freshState({ presentNodeIds: [] });
    const store = await makeStore(state);

    const out = await store.appendNode!({ id: "m1", label: "Memo", node_type: "Fact", t: 1710000000000 });

    expect(out).toEqual({ created: true });
    expect(
      runSql(state).some((s) => s.includes("INSERT INTO graph_nodes") && s.includes("ON CONFLICT")),
    ).toBe(true);
  });

  it("appendNode reports created:false when the key already exists (upsert in place)", async () => {
    const state = freshState({ presentNodeIds: ["m1"] });
    const store = await makeStore(state);
    const out = await store.appendNode!({ id: "m1", label: "Memo" });
    expect(out).toEqual({ created: false });
  });

  it("appendEdge upserts one edge when BOTH endpoints exist", async () => {
    const state = freshState({ presentNodeIds: ["a", "b"] });
    const store = await makeStore(state);

    const out = await store.appendEdge!({ source: "a", target: "b", relation: "cites" });

    expect(out).toEqual({ created: true });
    expect(runSql(state).some((s) => s.includes("INSERT INTO graph_edges"))).toBe(true);
  });

  it("appendEdge FAILS LOUD when an endpoint is absent (requiresExistingEndpoints)", async () => {
    const state = freshState({ presentNodeIds: ["a"] }); // target 'b' missing
    const store = await makeStore(state);

    await expect(store.appendEdge!({ source: "a", target: "b", relation: "cites" })).rejects.toThrow(
      /endpoint|exist/i,
    );
    // The dangling edge must NOT have been written.
    expect(runSql(state).some((s) => s.includes("INSERT INTO graph_edges"))).toBe(false);
  });
});

describe("sqlite tombstone — append-only erasure (§3.5)", () => {
  it("appendTombstone appends a tombstone row and reports applied (fresh key)", async () => {
    const state = freshState({ tombstoneChanges: 1 });
    const store = await makeStore(state);

    const out = await store.appendTombstone!({ target: { kind: "node", id: "m1" }, reason: "A2 erasure" });

    expect(out).toEqual({ applied: true });
    expect(
      runSql(state).some((s) => s.includes("INSERT INTO graph_tombstones") && s.includes("DO NOTHING")),
    ).toBe(true);
  });

  it("appendTombstone reports applied:false when the same key was already present", async () => {
    const state = freshState({ tombstoneChanges: 0 });
    const store = await makeStore(state);
    const out = await store.appendTombstone!({ target: { kind: "node", id: "m1" } });
    expect(out).toEqual({ applied: false });
  });
});

describe("sqlite fold-out — wired into EVERY structured read", () => {
  it("loadNode folds tombstones out (references graph_tombstones)", async () => {
    const state = freshState({ nodeRows: [memoryRow()] });
    const store = await makeStore(state);
    await store.loadNode!("mem:1");
    expect(
      allSql(state).some((s) => s.includes("FROM graph_nodes") && s.includes("graph_tombstones")),
    ).toBe(true);
  });

  it("listMemoryNotes folds tombstones out and filters type='MemoryNote'", async () => {
    const state = freshState({ memoryRows: [] });
    const store = await makeStore(state);
    await store.listMemoryNotes!();
    const sql = allSql(state);
    expect(sql.some((s) => s.includes("'MemoryNote'"))).toBe(true);
    expect(sql.some((s) => s.includes("graph_nodes") && s.includes("graph_tombstones"))).toBe(true);
  });

  it("queryWindow folds tombstones out of nodes and edges", async () => {
    const state = freshState();
    const store = await makeStore(state);
    await store.queryWindow!(0, 9_999_999_999_999);
    const sql = allSql(state);
    expect(sql.some((s) => s.includes("FROM graph_nodes") && s.includes("graph_tombstones"))).toBe(true);
    expect(sql.some((s) => s.includes("FROM graph_edges") && s.includes("graph_tombstones"))).toBe(true);
  });
});

describe("sqlite read-back — loadNode", () => {
  it("reads one node by id and lifts the canonical node_type from the typed column", async () => {
    const state = freshState({ nodeRows: [memoryRow()] });
    const store = await makeStore(state);

    const rec = await store.loadNode!("mem:1");

    expect(rec).not.toBeNull();
    expect(rec!.id).toBe("mem:1");
    // canonical node_type from the `type` column, not a spoofable prop
    expect(rec!.node_type).toBe("MemoryNote");
    // principal_owner / scope / t are lifted from the typed columns
    expect(rec!.principal_owner).toBe("human:antoinefa");
    expect(rec!.scope).toBe("private");
    expect(rec!.t).toBe(1_750_000_000_000);
    // persisted pass-through props are carried back
    expect(rec!.review_status).toBe("pending");
    expect((rec!.provenance as { source: string }).source).toBe("ref:A");
  });

  it("returns null when the id has no live row", async () => {
    const state = freshState({ nodeRows: [] });
    const store = await makeStore(state);
    expect(await store.loadNode!("mem:absent")).toBeNull();
  });
});

describe("sqlite read-back — listMemoryNotes", () => {
  it("reconstructs records and lifts node_type from the typed column", async () => {
    const state = freshState({ memoryRows: [memoryRow(), memoryRow({ id: "mem:2" })] });
    const store = await makeStore(state);

    const notes = await store.listMemoryNotes!();

    expect(notes.map((n) => n.id)).toEqual(["mem:1", "mem:2"]);
    expect(notes.every((n) => n.node_type === "MemoryNote")).toBe(true);
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

describe("sqlite read-back — loadTombstones", () => {
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

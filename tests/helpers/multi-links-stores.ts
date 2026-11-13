import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createSqliteGraphStore, sqliteDdlStatements } from "../../src/storage/sqlite.js";
import { createPostgresGraphStore } from "../../src/storage/postgres.js";
import type { GraphStore } from "../../src/storage/types.js";
import { edge, node, multiGraph, observation, expectObservations, tempDir, type Row } from "./multi-links.js";
import { loadSqliteEngine } from "./multi-links-sqlite.js";

// Real SQL engine behind the existing synchronous driver injection seam.
export async function sqliteDriver(onStatement: (sql: string) => void = () => {}) {
  const Database = await loadSqliteEngine();
  return { default: class {
    db: any;
    constructor(path: string) { this.db = new Database(path); }
    pragma(sql: string) { this.db.exec(`PRAGMA ${sql}`); }
    exec(sql: string) { onStatement(sql); this.db.exec(sql); }
    prepare(sql: string) {
      onStatement(sql);
      const stmt = this.db.prepare(sql);
      return { run: (...args: any[]) => stmt.run(...args), get: (...args: any[]) => stmt.get(...args), all: (...args: any[]) => stmt.all(...args) };
    }
    transaction(fn: (...args: any[]) => any) {
      return (...args: any[]) => {
        this.db.exec("BEGIN IMMEDIATE");
        try { const result = fn(...args); this.db.exec("COMMIT"); return result; }
        catch (error) { this.db.exec("ROLLBACK"); throw error; }
      };
    }
    close() { this.db.close(); }
  } };
}

// Stateful PostgreSQL port double: executes row replacement/DO NOTHING, exact
// predicates and tombstone fold-out. It never merges evidence on the adapter's
// behalf. Unknown data statements fail loudly instead of returning canned rows.
export function postgresHarness() {
  const tables = new Map<string, Row[]>(["graph_nodes", "graph_edges", "graph_tombstones", "graph_meta"].map(t => [t, []]));
  const statements: string[] = [];
  const locks = new Map<string, Promise<void>>();
  let interleaving: { arrivals: number; ready: Promise<void>; release: () => void } | undefined;
  const pk: Row = { graph_nodes: ["city_slug", "id"], graph_edges: ["city_slug", "source_id", "target_id", "relation"], graph_tombstones: ["city_slug", "target_kind", "node_id", "edge_source", "edge_target", "edge_relation"], graph_meta: ["city_slug"] };
  function execute(sql: string, params: any[] = [], view = tables) {
    statements.push(sql);
    const result = (rows: Row[], rowCount = rows.length) => ({ rows: structuredClone(rows), rowCount });
    if (/^(BEGIN|COMMIT|ROLLBACK|CREATE |ALTER |DROP |SET )/i.test(sql.trim())) return result([]);
    if (/^SELECT 1\b/i.test(sql.trim()) && !/FROM/i.test(sql)) return result([{ ok: 1 }]);
    const insert = /INSERT INTO\s+["\w.]*?(graph_\w+)"?\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?)\s*ON CONFLICT/i.exec(sql);
    if (insert) {
      const [, table, rawCols, tuples] = insert;
      if (!view.has(table)) throw new Error(`L0 PostgreSQL harness: unsupported table ${table}`);
      const cols = rawCols.split(",").map(c => c.trim().replaceAll('"', ''));
      const rows: Row[] = [];
      let affected = 0;
      for (const tuple of tuples.matchAll(/\(([^)]+)\)/g)) {
        const values = [...tuple[1].matchAll(/\$(\d+)/g)].map(m => params[Number(m[1]) - 1]);
        if (values.length !== cols.length) throw new Error("L0 PostgreSQL harness: unsupported values");
        const row = Object.fromEntries(cols.map((c, i) => [c, c === "props" && typeof values[i] === "string" ? JSON.parse(values[i]) : values[i]]));
        const stored = view.get(table)!;
        const index = stored.findIndex(r => pk[table].every((c: string) => r[c] === row[c]));
        if (index >= 0 && /DO NOTHING/i.test(sql)) continue;
        if (index >= 0) stored[index] = row; else stored.push(row);
        affected++;
        rows.push(/AS created/i.test(sql) ? { created: index < 0 } : /AS applied/i.test(sql) ? { applied: 1 } : row);
      }
      return result(rows, affected);
    }
    const select = /FROM\s+["\w.]*?(graph_\w+)"?(?:\s+(\w+))?/i.exec(sql);
    if (/^SELECT/i.test(sql.trim()) && select) {
      const table = select[1];
      if (!view.has(table)) throw new Error(`L0 PostgreSQL harness: unsupported read ${table}`);
      let found = view.get(table)!.filter(row => row.city_slug === params[0]);
      // Apply parameterized equalities on the primary table (not correlated tombstones).
      const mainWhere = sql.split(/NOT EXISTS/i)[0];
      for (const m of mainWhere.matchAll(/\b(?:[ne]\.)?(id|source_id|target_id|relation)\s*=\s*\$(\d+)/g)) found = found.filter(r => r[m[1]] === params[Number(m[2]) - 1]);
      for (const m of mainWhere.matchAll(/\b(?:[ne]\.)?(id|source_id|target_id)\s*=\s*ANY\(\$(\d+)\)/g)) found = found.filter(r => params[Number(m[2]) - 1].includes(r[m[1]]));
      const tombs = view.get("graph_tombstones")!.filter(t => t.city_slug === params[0]);
      if (/NOT EXISTS/.test(sql)) found = found.filter(row => !tombs.some(t =>
        t.target_kind === "node" ? (table === "graph_nodes" ? t.node_id === row.id : t.node_id === row.source_id || t.node_id === row.target_id) :
        table === "graph_edges" && t.edge_source === row.source_id && t.edge_target === row.target_id && t.edge_relation === row.relation));
      if (/jsonb_typeof/.test(sql)) found = found.filter(row => {
        const p = row.props;
        return typeof p?.t === "number" && Number.isFinite(p.t) && p.t <= params[2] && (!Object.hasOwn(p, "t_end") || typeof p.t_end === "number" && p.t_end >= p.t && p.t_end >= params[1]);
      });
      if (/LIMIT 1\b/.test(sql)) found = found.slice(0, 1);
      return result(found);
    }
    if (/^DELETE FROM/i.test(sql.trim()) && select) { view.set(select[1], view.get(select[1])!.filter(r => r.city_slug !== params[0])); return result([]); }
    throw new Error(`L0 PostgreSQL harness: unsupported statement ${sql}`);
  }
  const rowKey = (table: string, row: Row) => JSON.stringify(pk[table].map((column: string) => row[column]));
  async function edgeReadBarrier(sql: string, held: Set<string>) {
    // Only unlocked exact-key reads rendezvous. A lock holder must be allowed
    // to finish while the competing client waits on the requested SQL lock.
    if (!interleaving || held.size || !/^SELECT\b/i.test(sql.trim()) || !/FROM\s+graph_edges\b/i.test(sql) || !/relation\s*=\s*\$\d+/i.test(sql)) return;
    const barrier = interleaving;
    if (++barrier.arrivals === 2) { interleaving = undefined; barrier.release(); }
    await barrier.ready;
  }
  class Pool {
    async query(sql: string, params?: any[]) {
      const client = await this.connect();
      try { return await client.query(sql, params); } finally { client.release(); }
    }
    async connect() {
      const held = new Set<string>(), unlockers: Array<() => void> = [];
      const pending = new Map<string, Map<string, Row | null>>();
      let inTransaction = false;
      const release = () => { for (const unlock of unlockers.splice(0)) unlock(); held.clear(); };
      async function lock(key: string) {
        if (held.has(key)) return;
        const prior = locks.get(key) ?? Promise.resolve();
        let unlock!: () => void;
        const next = new Promise<void>(resolve => { unlock = resolve; });
        locks.set(key, next);
        await prior;
        held.add(key);
        unlockers.push(() => { unlock(); if (locks.get(key) === next) locks.delete(key); });
      }
      return { query: async (sql: string, params: any[] = []) => {
        if (/^BEGIN\b/i.test(sql.trim())) { inTransaction = true; return execute(sql, params); }
        if (/^(COMMIT|ROLLBACK)\b/i.test(sql.trim())) {
          if (/^COMMIT/i.test(sql.trim())) for (const [table, changes] of pending) {
            const stored = tables.get(table)!;
            for (const [key, row] of changes) {
              const index = stored.findIndex(r => rowKey(table, r) === key);
              if (index >= 0) stored.splice(index, 1);
              if (row) stored.push(row);
            }
          }
          pending.clear(); inTransaction = false; release();
          return execute(sql, params);
        }
        if (/pg_advisory_xact_lock\s*\(/i.test(sql)) {
          if (!inTransaction) throw new Error("transaction advisory lock requires BEGIN");
          statements.push(sql); await lock("advisory:" + JSON.stringify(params));
          return { rows: [], rowCount: 1 };
        }
        if (/FOR\s+(?:NO KEY\s+)?UPDATE\b/i.test(sql)) {
          if (!inTransaction) throw new Error("row lock requires BEGIN");
          await lock("edge:" + JSON.stringify(params));
        }
        // READ COMMITTED: each statement sees committed rows plus its own
        // writes. Transactions do not reserve the pool or snapshot other clients.
        const view = structuredClone(tables);
        for (const [table, changes] of pending) {
          const stored = view.get(table)!;
          for (const [key, row] of changes) {
            const index = stored.findIndex(r => rowKey(table, r) === key);
            if (index >= 0) stored.splice(index, 1);
            if (row) stored.push(structuredClone(row));
          }
        }
        const before = structuredClone(view), result = execute(sql, params, inTransaction ? view : tables);
        if (inTransaction) for (const [table, after] of view) {
          const old = new Map(before.get(table)!.map(row => [rowKey(table, row), row]));
          const now = new Map(after.map(row => [rowKey(table, row), row]));
          for (const key of new Set([...old.keys(), ...now.keys()])) if (JSON.stringify(old.get(key)) !== JSON.stringify(now.get(key))) {
            if (!pending.has(table)) pending.set(table, new Map());
            pending.get(table)!.set(key, now.get(key) ?? null);
          }
        }
        await edgeReadBarrier(sql, held);
        if (!inTransaction) release();
        return result;
      }, release };
    }
    async end() {}
  }
  return { driverModule: { Pool }, tables, statements, interleaveNextEdgeReads() {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    interleaving = { arrivals: 0, ready, release };
  } };
}

export async function losslessHarness(backend: "sqlite" | "postgres", seeded = false) {
  const config = { citySlug: "multi_links" };
  if (backend === "sqlite") {
    const target = join(tempDir(), "graph.db");
    const statements: string[] = [];
    const driverModule = await sqliteDriver(sql => statements.push(sql));
    if (seeded) {
      const db = new driverModule.default(target);
      for (const ddl of sqliteDdlStatements()) db.exec(ddl);
      for (const id of ["a", "b"]) db.prepare("INSERT INTO graph_nodes (city_slug,id,label,t,props) VALUES (?,?,?,?,?)").run("multi_links", id, id, 1, "{}");
      db.prepare("INSERT INTO graph_edges (city_slug,source_id,target_id,relation,confidence,t,props) VALUES (?,?,?,?,?,?,?)").run("multi_links", "a", "b", "RELATES_TO", "EXTRACTED", 1, JSON.stringify({ source_file: "v1.ts", evidence_refs: ["v1"] }));
      db.prepare("INSERT INTO graph_tombstones (city_slug,target_kind,node_id,edge_source,edge_target,edge_relation) VALUES (?,?,?,?,?,?)").run("multi_links", "edge", "", "a", "b", "RELATES_TO");
      db.close(); // reopen the existing v1 rows and journal through the real adapter
    }
    statements.length = 0;
    const store = await createSqliteGraphStore({ ...config, target }, { driverModule });
    return { store, statements };
  }
  const h = postgresHarness();
  if (seeded) {
    for (const id of ["a", "b"]) h.tables.get("graph_nodes")!.push({ city_slug: "multi_links", id, label: id, props: { t: 1 } });
    h.tables.get("graph_edges")!.push({ city_slug: "multi_links", source_id: "a", target_id: "b", relation: "RELATES_TO", confidence: "EXTRACTED", props: { t: 1, source_file: "v1.ts", evidence_refs: ["v1"] } });
    h.tables.get("graph_tombstones")!.push({ city_slug: "multi_links", target_kind: "edge", node_id: "", edge_source: "a", edge_target: "b", edge_relation: "RELATES_TO" });
  }
  const target = tempDir();
  const artifactPath = join(target, "graph", config.citySlug, "latest.json");
  const store = await createPostgresGraphStore({ ...config, target, connectionString: "postgres://fixture/unused" }, { driverModule: h.driverModule });
  return { store, statements: h.statements, artifactPath, postgres: h };
}

async function endpoints(store: GraphStore) {
  for (const id of ["a", "b"]) await store.appendNode!({ id, label: id, t: 1 });
  const actual = await store.queryWindow!(0, 10);
  expect(actual.nodes.map(n => n.id).sort()).toEqual(["a", "b"]);
  for (const id of ["a", "b"]) expect((await store.loadNode!(id))?.id).toBe(id);
}
const live = async (store: GraphStore) => (await store.queryWindow!(0, 10)).edges;
const contribution = (ref: string, attrs: Row = {}) => edge({ t: 1, source_location: ref, evidence_refs: [ref], ...attrs });

export function losslessStoreCases(backend: "sqlite" | "postgres") {
  describe(`L0-S ${backend} real writes and readback`, () => {
    beforeAll(async () => {
      if (backend !== "sqlite") return;
      // Engine availability is a prerequisite outside it.fails. A missing
      // engine must fail the suite, never masquerade as a missing L0 feature.
      const driver = await sqliteDriver(), db = new driver.default(join(tempDir(), "engine-probe.db"));
      try { expect(db.prepare("SELECT sqlite_version() AS version").get().version).toMatch(/^3\./); }
      finally { db.close(); }
    });
    for (const mode of ["append", "merge-push", "replay", "concurrent"] as const) describe(mode, () => {
      it.fails("store-same-key-append-union-readback", async () => {
        const { store, postgres } = await losslessHarness(backend);
        try {
          await endpoints(store);
          const expected = [contribution("r1"), contribution("r2")];
          await store.appendEdge!(expected[0]);
          await store.appendEdge!(expected[1]);
          if (mode === "merge-push") for (const ref of ["p1", "p2"]) {
            const e = contribution(ref);
            expected.push(e);
            // An already captured graph is the real merge-push input boundary.
            await store.pushGraph(multiGraph([{ ...e, evidence_observations: [observation(e)] }], [node("a", { t: 1 }), node("b", { t: 1 })]), new Map(), { mode: "merge" });
          }
          if (mode === "replay") for (const e of expected) await store.appendEdge!(e);
          if (mode === "concurrent") {
            const concurrent = [contribution("c1"), contribution("c2")];
            expected.push(...concurrent);
            postgres?.interleaveNextEdgeReads();
            await Promise.all(concurrent.map(e => store.appendEdge!(e)));
          }
          const controls = [contribution("reverse", { source: "b", target: "a" }), contribution("reads", { relation: "reads" }), contribution("writes", { relation: "writes" })];
          for (const e of controls) await store.appendEdge!(e);
          const readback = await live(store);
          expect(readback).toHaveLength(4);
          const byKey = new Map(readback.map(e => [JSON.stringify([e.source, e.target, e.relation]), e]));
          expect([...byKey.keys()].sort()).toEqual([["a", "b", "calls"], ["b", "a", "calls"], ["a", "b", "reads"], ["a", "b", "writes"]].map(JSON.stringify).sort());
          expect(byKey.get(JSON.stringify(["a", "b", "calls"]))!.evidence_refs).toEqual(expected.flatMap(e => e.evidence_refs).sort());
          expectObservations(byKey.get(JSON.stringify(["a", "b", "calls"]))!, expected.map(observation));
          for (const e of controls) expectObservations(byKey.get(JSON.stringify([e.source, e.target, e.relation]))!, [observation(e)]);
        } finally { await store.close(); }
      });
    });

    it.fails("append capability advertises evidence union version 2", async () => {
      const { store } = await losslessHarness(backend);
      try { expect(store.capabilities.append).toMatchObject({ version: 2, evidenceUnion: true }); }
      finally { await store.close(); }
    });

    for (const [label, attrs] of [["Infinity", { confidence_score: Infinity }], ["NaN", { confidence_score: NaN }], ["negative Infinity", { confidence_score: -Infinity }], ["nested", { citations: [{ quote: "x", region: [0, Infinity, 1, 1] }] }]] as Array<[string, Row]>) describe(label, () => {
      it.fails("non-finite store contribution refuses before mutating a populated row", async () => {
        const { store } = await losslessHarness(backend);
        try {
          await endpoints(store);
          await store.appendEdge!(contribution("accepted", { confidence_score: null }));
          const before = JSON.stringify(await live(store));
          await expect(store.appendEdge!(contribution("invalid", attrs))).rejects.toThrow(/non.finite/i);
          expect(JSON.stringify(await live(store))).toBe(before);
        } finally { await store.close(); }
      });
    });

    it("finite and legacy null payloads are accepted by the direct store port", async () => {
      const { store } = await losslessHarness(backend);
      try {
        await endpoints(store);
        for (const confidence_score of [0.5, null]) {
          await store.appendEdge!(contribution("control", { relation: String(confidence_score), confidence_score }));
          const readback = (await live(store)).find(e => e.relation === String(confidence_score));
          expect(readback).toBeDefined();
          expect(readback!.evidence_refs).toEqual(["control"]);
          if (confidence_score !== null) expect(readback!.confidence_score).toBe(0.5);
        }
      } finally { await store.close(); }
    });

    it.fails("legacy null score derives the confidence fallback while its observation retains null", async () => {
      const { store } = await losslessHarness(backend);
      try {
        await endpoints(store);
        await store.appendEdge!(contribution("null", { confidence_score: null }));
        const [readback] = await live(store);
        expect(readback.confidence_score).toBe(1);
        expect(readback.evidence_observations).toHaveLength(1);
        expect(readback.evidence_observations[0].confidence_score).toBeNull();
      } finally { await store.close(); }
    });

    it("B2-omitted-relation-append-then-tombstone-hidden", async () => {
      const { store } = await losslessHarness(backend);
      try {
        await endpoints(store);
        const e = contribution("r1"); delete e.relation;
        await store.appendEdge!(e);
        expect((await live(store)).map(e => e.relation)).toEqual(["RELATES_TO"]);
        await store.appendTombstone!({ target: { kind: "edge", source: "a", target: "b" } });
        expect(await live(store)).toEqual([]);
        await store.appendEdge!(e);
        expect(await live(store)).toEqual([]);
        expect((await store.loadTombstones!())[0].target).toEqual({ kind: "edge", source: "a", target: "b", relation: "RELATES_TO" });
      } finally { await store.close(); }
    });

    it("B2-v1-rows-journal-then-v2-append-no-resurrection", async () => {
      const { store } = await losslessHarness(backend, true);
      try {
        expect((await store.loadNode!("a"))?.id).toBe("a");
        expect((await store.loadNode!("b"))?.id).toBe("b");
        expect(await live(store)).toEqual([]);
        const e = contribution("v1", { source_file: "v1.ts" }); delete e.relation;
        await store.appendEdge!(e);
        await store.appendEdge!(e);
        expect(await live(store)).toEqual([]);
        expect((await store.loadTombstones!()).map(t => t.target)).toEqual([{ kind: "edge", source: "a", target: "b", relation: "RELATES_TO" }]);
      } finally { await store.close(); }
    });

    it("B2-explicit-variants-never-move", async () => {
      for (const erased of ["RELATES_TO", "related_to", ""]) {
        const { store } = await losslessHarness(backend);
        try {
          await endpoints(store);
          const variants = ["RELATES_TO", "related_to", ""];
          for (const relation of variants) await store.appendEdge!(contribution(relation, { relation }));
          expect((await live(store)).map(e => e.relation).sort()).toEqual([...variants].sort());
          await store.appendTombstone!({ target: { kind: "edge", source: "a", target: "b", relation: erased } });
          await store.appendEdge!(contribution(erased, { relation: erased }));
          const remaining = await live(store);
          expect(remaining.map(e => e.relation).sort()).toEqual(variants.filter(r => r !== erased).sort());
          for (const e of remaining) expect(e.evidence_refs).toEqual([e.relation]);
        } finally { await store.close(); }
      }
    });
  });
}

import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";
import * as sqlite from "../src/storage/sqlite.js";
import * as postgres from "../src/storage/postgres.js";
import { insertBuildEdgesPrepared } from "../src/build.js";
import { mergeEdgeEvidence } from "../src/graph.js";
import { postgresHarness, sqliteDriver } from "./helpers/multi-links-stores.js";
import { edge, extraction, multiGraph, node, observation, tempDir, type Row } from "./helpers/multi-links.js";

async function harness(backend: string, insertRace = false) {
  const dir = tempDir();
  let seed: (attrs?: Row, erased?: boolean) => void;
  let statements: string[];
  let pg: ReturnType<typeof postgresHarness> | undefined;
  let store: any;
  if (backend === "sqlite") {
    statements = [];
    const driverModule = await sqliteDriver(sql => statements.push(sql));
    const target = join(dir, "graph.db");
    store = await (sqlite as Row).createSqliteGraphStorePrepared({ citySlug: "p2", target }, { driverModule });
    seed = (attrs = {}, erased = false) => {
      const db = new driverModule.default(target);
      try {
        db.prepare("INSERT INTO graph_edges (city_slug,source_id,target_id,relation,confidence,t,props) VALUES (?,?,?,?,?,?,?)").run("p2", "a", "b", "RELATES_TO", null, 1, JSON.stringify({ source_file: "/repo/v1.ts", ...attrs }));
        if (erased) db.prepare("INSERT INTO graph_tombstones (city_slug,target_kind,node_id,edge_source,edge_target,edge_relation) VALUES (?,?,?,?,?,?)").run("p2", "edge", "", "a", "b", "RELATES_TO");
      } finally { db.close(); }
    };
  } else {
    pg = postgresHarness();
    statements = pg.statements;
    const driverModule = { Pool: class extends pg.driverModule.Pool {
      async connect() {
        const client = await super.connect();
        return { ...client, query: async (sql: string, params?: any[]) => {
          if (insertRace && /INSERT INTO graph_edges/.test(sql)) {
            insertRace = false;
            const e = contribution("racing");
            pg!.tables.get("graph_edges")!.push({ city_slug: "p2", source_id: "a", target_id: "b", relation: "calls", confidence: "EXTRACTED", props: { ...e } });
          }
          return client.query(sql, params);
        } };
      }
    } };
    store = await (postgres as Row).createPostgresGraphStorePrepared({ citySlug: "p2", target: dir, connectionString: "postgres://fixture/unused" }, { driverModule });
    seed = (attrs = {}, erased = false) => {
      pg!.tables.get("graph_edges")!.push({ city_slug: "p2", source_id: "a", target_id: "b", relation: "RELATES_TO", confidence: null, props: { t: 1, source_file: "/repo/v1.ts", ...attrs } });
      if (erased) pg!.tables.get("graph_tombstones")!.push({ city_slug: "p2", target_kind: "edge", node_id: "", edge_source: "a", edge_target: "b", edge_relation: "RELATES_TO" });
    };
  }
  for (const id of ["a", "b"]) await store.appendNode({ id, label: id, t: 1 });
  return { store, seed, statements, pg };
}
const contribution = (source_location: string, attrs: Row = {}) => edge({ t: 1, source_location, evidence_refs: [source_location], ...attrs });
const live = async (store: any) => (await store.queryWindow(0, 10)).edges as Row[];

it("chunks public PostgreSQL replace pushes below 65,535 bind parameters even with an oversized batchSize", async () => {
  const calls: { text: string; params: unknown[] }[] = [];
  // Driver port for the bind protocol boundary; row/evidence persistence is
  // exercised by the stateful contribution tests below.
  class Pool {
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      return { rows: [], rowCount: 0 };
    }
    async connect() { return { query: this.query.bind(this), release() {} }; }
    async end() {}
  }
  const count = 10_923; // Six columns per row: one row beyond the driver limit.
  const G = multiGraph([]);
  for (let i = 0; i < count; i++) G.addNode("n" + i);
  for (let i = 0; i < count; i++) {
    const attrs = contribution("L" + i, { relation: "r" + i });
    G.addEdgeWithKey("e" + i, "a", "b", { ...attrs, _src: "a", _tgt: "b" });
  }
  const store = await postgres.createPostgresGraphStorePrepared(
    { citySlug: "p2", target: tempDir(), connectionString: "postgres://fixture/unused" },
    { driverModule: { Pool } },
  );
  try {
    const result = await store.pushGraph(G, new Map(), { mode: "replace", batchSize: 150_000 });
    expect(result).toMatchObject({ nodes: count + 2, edges: count });
    for (const call of calls) expect(call.params.length).toBeLessThanOrEqual(65_535);
    for (const [table, expected] of [["graph_nodes", count + 2], ["graph_edges", count]] as const) {
      const batches = calls.filter(call => call.text.startsWith("INSERT INTO " + table + " "));
      expect(batches).toHaveLength(2);
      expect(batches.reduce((total, call) => total + call.params.length / 6, 0)).toBe(expected);
      const ids = batches.flatMap(call => call.params.filter((_, i) => i % 6 === (table === "graph_nodes" ? 1 : 3)));
      expect(new Set(ids).size).toBe(expected);
      for (const batch of batches) {
        expect((batch.text.match(/\$\d+/g) ?? []).length).toBe(batch.params.length);
        if (table === "graph_edges") for (let i = 5; i < batch.params.length; i += 6) {
          expect(JSON.parse(batch.params[i] as string).evidence_observations).toHaveLength(1);
        }
      }
    }
  } finally { await store.close(); }
});

for (const existing of [false, true]) it(`serializes overlapping SQLite workers on an ${existing ? "existing" : "absent"} key`, async () => {
  const target = join(tempDir(), "overlap.db");
  const driverModule = await sqliteDriver();
  const store = await sqlite.createSqliteGraphStorePrepared({ citySlug: "p2", target }, { driverModule });
  const gate = new SharedArrayBuffer(4);
  const workers: Worker[] = [];
  const start = (role: string) => {
    const worker = new Worker(new URL("./fixtures/multi-links-sqlite-append-worker.mjs", import.meta.url), {
      workerData: { role, target, gate, edge: contribution(role) },
    });
    workers.push(worker);
    const messages: Row[] = [], waiters = new Map<string, { resolve: (value: Row) => void; reject: (error: Error) => void }>();
    worker.on("message", message => { messages.push(message); waiters.get(message.type)?.resolve(message); });
    worker.on("error", error => { for (const waiter of waiters.values()) waiter.reject(error); });
    return { worker, wait: (type: string): Promise<Row> => {
      const received = messages.find(message => message.type === type);
      return received ? Promise.resolve(received) : new Promise((resolve, reject) => waiters.set(type, { resolve, reject }));
    } };
  };
  try {
    for (const id of ["a", "b"]) await store.appendNode!({ id, t: 1 });
    if (existing) await store.appendEdge!(contribution("seed"));
    const first = start("first"), second = start("second");
    await Promise.all([first.wait("ready"), second.wait("ready")]);
    first.worker.postMessage("append");
    const read = await first.wait("read");
    second.worker.postMessage("append");
    // For deferred transactions, let the competing commit invalidate A's read
    // snapshot. With a reservation, B reaches BEGIN but waits for A to finish.
    if (read.mode === "BEGIN IMMEDIATE") await second.wait("attempting");
    else await second.wait("result");
    Atomics.store(new Int32Array(gate), 0, 1);
    Atomics.notify(new Int32Array(gate), 0);
    const results = await Promise.all([first.wait("result"), second.wait("result")]);
    expect(results.map(result => result.error)).toEqual([undefined, undefined]);
    expect(results.filter(result => result.outcome.created)).toHaveLength(existing ? 0 : 1);
    expect((await live(store))[0].evidence_observations).toEqual(expect.arrayContaining([observation(contribution("first")), observation(contribution("second"))]));
    expect((await live(store))[0].evidence_observations).toHaveLength(existing ? 3 : 2);
  } finally {
    Atomics.store(new Int32Array(gate), 0, 1);
    Atomics.notify(new Int32Array(gate), 0);
    await Promise.all(workers.map(worker => worker.terminate()));
    await store.close();
  }
});

for (const backend of ["sqlite", "postgres"]) describe(`P2 ${backend} contribution transactions`, () => {
  for (const captured of [undefined, []]) it(`prepares fresh append before capture and matches build/merge-push with ${captured ? "empty" : "absent"} captured set`, async () => {
    const { store } = await harness(backend);
    try {
      const emission = contribution("same", { source_file: "src\\f.ts", evidence_observations: captured });
      await store.appendEdge(emission);
      const G = multiGraph([], [node("a", { t: 1 }), node("b", { t: 1 })]);
      insertBuildEdgesPrepared(G, extraction([emission]));
      await store.pushGraph(G, new Map(), { mode: "merge" });
      const row = (await live(store))[0];
      expect(row.evidence_observations).toEqual([observation({ ...emission, source_file: "src/f.ts" })]);
      expect(emission.source_file).toBe("src\\f.ts");
    } finally { await store.close(); }
  });
  it("preserves captured backslashes and absolute legacy locators verbatim", async () => {
    const { store, seed } = await harness(backend);
    try {
      seed({ source_file: "/repo\\legacy.ts" });
      const emission = contribution("captured", { source_file: "src\\captured.ts", relation: undefined });
      const captured = observation(emission);
      await store.appendEdge({ ...emission, evidence_observations: [captured] });
      const G = multiGraph([], [node("a", { t: 1 }), node("b", { t: 1 })]);
      insertBuildEdgesPrepared(G, extraction([edge({ ...emission, relation: "RELATES_TO", evidence_observations: [captured] })]));
      await store.pushGraph(G, new Map(), { mode: "merge" });
      expect((await live(store))[0].evidence_observations).toEqual(expect.arrayContaining([captured, { source_file: "/repo\\legacy.ts", t: 1 }]));
      expect((await live(store))[0].evidence_observations).toHaveLength(2);
    } finally { await store.close(); }
  });
  it("refuses an invalid push before schema or row mutations", async () => {
    const pg = backend === "postgres" ? postgresHarness() : undefined;
    const statements: string[] = pg?.statements ?? [];
    const driverModule = pg?.driverModule ?? await sqliteDriver(sql => statements.push(sql));
    const target = backend === "sqlite" ? join(tempDir(), "invalid.db") : tempDir();
    const factory = backend === "sqlite" ? (sqlite as Row).createSqliteGraphStorePrepared : (postgres as Row).createPostgresGraphStorePrepared;
    const store = await factory({ citySlug: "p2", target, connectionString: "postgres://fixture/unused" }, { driverModule });
    try {
      const G = multiGraph([contribution("invalid", { confidence_score: Infinity })]);
      await expect(store.pushGraph(G, new Map(), { mode: "merge" })).rejects.toThrow(/non.finite/i);
      expect(statements).toEqual([]);
    } finally { await store.close(); }
  });
  it("store-same-key-append-union-readback with replay, exact identity and concurrency", async () => {
    const { store, pg } = await harness(backend);
    try {
      const emissions = ["r1", "r2"].map(ref => contribution(ref));
      expect(await store.appendEdge(emissions[0])).toEqual({ created: true });
      expect(await store.appendEdge(emissions[1])).toEqual({ created: false });
      for (const e of emissions) await store.appendEdge(e);
      pg?.interleaveNextEdgeReads();
      const concurrent = ["c1", "c2"].map(ref => contribution(ref));
      expect(await Promise.all(concurrent.map(e => store.appendEdge(e)))).toEqual([{ created: false }, { created: false }]);
      emissions.push(...concurrent);
      const controls = [contribution("reverse", { source: "b", target: "a" }), contribution("reads", { relation: "reads" })];
      for (const e of controls) await store.appendEdge(e);
      const rows = await live(store);
      expect(rows).toHaveLength(3);
      expect(rows.find(e => e.relation === "calls" && e.source === "a")).toMatchObject(mergeEdgeEvidence(null, ...emissions));
      expect(rows.find(e => e.relation === "reads")!.evidence_observations).toEqual([observation(controls[1])]);
      // Literal port endpoints win over presentation attrs.
      await store.appendEdge(contribution("literal", { relation: "literal", _src: "b", _tgt: "a" }));
      expect((await live(store)).find(e => e.relation === "literal")).toMatchObject({ source: "a", target: "b", _src: "a", _tgt: "b" });
    } finally { await store.close(); }
  });
  it("serializes concurrent first contributions to an absent key", async () => {
    const { store, pg } = await harness(backend);
    try {
      pg?.interleaveNextEdgeReads();
      const results = await Promise.all(["first", "second"].map(ref => store.appendEdge(contribution(ref))));
      expect(results.filter(r => r.created)).toHaveLength(1);
      expect((await live(store))[0].evidence_observations).toHaveLength(2);
    } finally { await store.close(); }
  });
  it("unions merge-mode pushes with append contributions and keeps captured locators verbatim", async () => {
    const { store } = await harness(backend);
    try {
      await store.appendEdge(contribution("append"));
      for (const ref of ["push1", "push2", "push1"]) {
        const e = contribution(ref, { source_file: "/repo/f.ts", evidence_observations: [{ source_file: "/repo/f.ts", confidence: "INFERRED", source_location: ref, t: 1 }] });
        await store.pushGraph(multiGraph([e], [node("a", { t: 1 }), node("b", { t: 1 })]), new Map(), { mode: "merge" });
      }
      const row = (await live(store))[0];
      expect(row.evidence_observations).toHaveLength(3);
      expect(row.evidence_observations.filter((r: Row) => r.source_location.startsWith("push")).every((r: Row) => r.source_file === "/repo/f.ts")).toBe(true);
    } finally { await store.close(); }
  });
  it("B2-omitted-relation-append-then-tombstone-hidden with exact explicit variants", async () => {
    const { store } = await harness(backend);
    try {
      for (const relation of [undefined, "RELATES_TO", "related_to", ""]) await store.appendEdge(contribution(String(relation), { relation }));
      expect((await live(store)).map(e => e.relation).sort()).toEqual(["", "RELATES_TO", "related_to"]);
      await store.appendTombstone({ target: { kind: "edge", source: "a", target: "b" } });
      await store.appendEdge(contribution("replay", { relation: undefined }));
      expect((await live(store)).map(e => e.relation).sort()).toEqual(["", "related_to"]);
    } finally { await store.close(); }
  });
  it("reconstructs raw legacy columns without inventing confidence", async () => {
    const { store, seed } = await harness(backend);
    try {
      seed({ derivation_methods: ["ast", "peer"] });
      await store.appendEdge(contribution("new", { relation: undefined, confidence: "INFERRED" }));
      const recs = (await live(store))[0].evidence_observations;
      expect(recs).toHaveLength(3);
      expect(recs.filter((r: Row) => r.source_file === "/repo/v1.ts").every((r: Row) => !Object.hasOwn(r, "confidence"))).toBe(true);
      await store.appendTombstone({ target: { kind: "edge", source: "a", target: "b" } });
      await store.appendEdge(contribution("after", { relation: undefined }));
      expect(await live(store)).toEqual([]);
    } finally { await store.close(); }
  });
  it("B2-v1-rows-journal-then-v2-append-no-resurrection", async () => {
    const { store, seed } = await harness(backend);
    try {
      seed({}, true);
      expect(await store.appendEdge(contribution("new", { relation: undefined }))).toEqual({ created: false });
      expect(await live(store)).toEqual([]);
      await store.appendEdge(contribution("control", { relation: "related_to" }));
      expect((await live(store)).map(e => e.relation)).toEqual(["related_to"]);
    } finally { await store.close(); }
  });
  if (backend === "postgres") it("re-reads and unions after a first-insert uniqueness conflict", async () => {
    const { store, statements } = await harness(backend, true);
    try {
      expect(await store.appendEdge(contribution("incoming"))).toEqual({ created: false });
      expect((await live(store))[0].evidence_refs).toEqual(["incoming", "racing"]);
      expect(statements.filter(sql => /SELECT \* FROM graph_edges.*FOR UPDATE/.test(sql))).toHaveLength(2);
      expect(statements.some(sql => /ON CONFLICT .* DO NOTHING RETURNING source_id/.test(sql))).toBe(true);
    } finally { await store.close(); }
  });
  it("refuses non-finite observations without changing the row and removes a stale closed end", async () => {
    const { store } = await harness(backend);
    try {
      await store.appendEdge(contribution("closed", { t: 1, t_end: 2 }));
      const before = JSON.stringify(await live(store));
      await expect(store.appendEdge(contribution("invalid", { citations: [{ nested: Infinity }] }))).rejects.toThrow(/non.finite/i);
      expect(JSON.stringify(await live(store))).toBe(before);
      await store.appendEdge(contribution("open", { t: 3 }));
      expect((await live(store))[0]).not.toHaveProperty("t_end");
    } finally { await store.close(); }
  });
});

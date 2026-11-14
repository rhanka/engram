import Graph from "graphology";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as neo4j from "../src/storage/neo4j.js";
import * as spanner from "../src/storage/spanner.js";
import * as exports from "../src/export.js";
import { upsertRelationEdge } from "../src/graph.js";
import { edge, type Row } from "./helpers/multi-links.js";

afterEach(() => vi.restoreAllMocks());
function graph(ref = "r1") {
  const G = new Graph({ multi: true, type: "undirected" });
  for (const id of ["a", "b"]) G.addNode(id);
  upsertRelationEdge(G, "a", "b", edge({ relation: "calls", source_location: ref }));
  return G;
}
function fake(backend: string) {
  const writes: Row[] = [];
  if (backend === "neo4j") return { writes, driverModule: { default: { auth: { basic: () => ({}) }, driver: () => ({ session: () => ({ run: async (sql: string, params: Row) => { writes.push({ sql, params }); return { records: [] }; }, close: async () => {} }), close: async () => {} }) } } };
  const database = { run: async () => [[]], updateSchema: async () => [{ promise: async () => {} }], table: (table: string) => ({ upsert: async (rows: Row[]) => { writes.push({ table, rows }); } }), close: async () => {} };
  return { writes, driverModule: { Spanner: class { instance() { return { database: () => database }; } async close() {} } } };
}

for (const backend of ["neo4j", "spanner"]) describe(`P2 ${backend} mirror diagnostics`, () => {
  it("M3-two-singleton-pushes-each-warn", async () => {
    const h = fake(backend);
    const factory = backend === "neo4j" ? (neo4j as Row).createNeo4jGraphStorePrepared : (spanner as Row).createSpannerGraphStorePrepared;
    const store = await factory(backend === "neo4j" ? { target: "bolt://fixture" } : { project: "test", instance: "test", database: "test" }, { driverModule: h.driverModule });
    try {
      for (const ref of ["r1", "r2"]) {
        const result = await store.pushGraph(graph(ref), new Map(), { mode: "merge" });
        expect(result.warnings.some((w: string) => w.includes(backend) && /1 edge/.test(w) && w.includes("observations not persisted"))).toBe(true);
        if (backend === "neo4j") expect(result.warnings.some((w: string) => /relation.*calls/.test(w))).toBe(true);
      }
      expect(h.writes.length).toBeGreaterThan(0);
      expect(JSON.stringify(h.writes)).not.toContain("evidence_observations");
      expect((await store.pushGraph(graph(), new Map(), { dryRun: true })).warnings).toEqual([]);
    } finally { await store.close(); }
  });
  it("counts discarded sets including singletons, not only multi-observation edges", () => {
    const G = graph();
    upsertRelationEdge(G, "a", "b", edge({ source_location: "r2" }));
    upsertRelationEdge(G, "b", "a", edge({ source: "b", target: "a" }));
    const warnings = backend === "neo4j" ? (neo4j as Row).neo4jPushWarningsPrepared(G) : (spanner as Row).spannerPushWarningsPrepared(G);
    expect(warnings.some((w: string) => /2 edges/.test(w) && w.includes("observations not persisted"))).toBe(true);
    expect(backend === "neo4j" ? (neo4j as Row).neo4jPushWarningsPrepared(new Graph()) : (spanner as Row).spannerPushWarningsPrepared(new Graph())).toEqual([]);
  });
});

describe("P2 public Neo4j wrapper body", () => {
  it("M3-public-neo4j-wrapper-propagates-warning and closes the fake store", async () => {
    const warnings = ["neo4j: 1 edge: observations not persisted"];
    const pushGraph = vi.fn(async () => ({ nodes: 2, edges: 1, warnings, durationMs: 0 }));
    const close = vi.fn(async () => {});
    vi.spyOn(neo4j as Row, "createNeo4jGraphStorePrepared").mockResolvedValue({ pushGraph, close });
    expect(await (exports as Row).pushToNeo4jPrepared(graph(), { uri: "bolt://fixture", user: "test", password: "", communities: new Map([[0, ["a", "b"]]]) })).toEqual({ nodes: 2, edges: 1, warnings });
    expect(pushGraph).toHaveBeenCalledWith(expect.anything(), new Map([[0, ["a", "b"]]]), { mode: "merge" });
    expect(close).toHaveBeenCalledOnce();
  });
});

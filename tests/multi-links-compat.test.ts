import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildFromJson } from "../src/build.js";
import * as core from "../src/graph.js";
import { mergeExtractionsWithCitations } from "../src/extract-git.js";
import * as exports from "../src/export.js";
import { rebuildCode } from "../src/watch.js";
import { createFileGraphProjectionAdapter } from "../src/storage/memory-projection.js";
import * as files from "../src/storage/file.js";
import { mergeGraphJsonFiles } from "../src/merge-driver.js";
import { runGraphTimeSlice } from "../src/graph-time-slice.js";
import { createSpannerGraphStore } from "../src/storage/spanner.js";
import { createNeo4jGraphStore } from "../src/storage/neo4j.js";
import { batchFixture, batchIntake } from "./helpers/multi-links-batch.js";
import { losslessHarness } from "./helpers/multi-links-stores.js";
import { edge, node, extraction, rows, writers, writeGraph, fromRows, expectFixedPoint, expectObservations, observation, tempDir, type Row } from "./helpers/multi-links.js";

const future = { graph_format: "engram-graph/3", nodes: [node("a", { t: 1 }), node("b", { t: 1 })], links: [edge({ t: 1 })] };
async function captureError(work: () => unknown) { try { await work(); } catch (error) { return error; } return undefined; }
const typed = (error: unknown) => expect(error, "write must refuse the unsupported format before touching its destination").toMatchObject({ name: "UnsupportedGraphFormatError", code: "unsupported-graph-format" });

describe("L0-C compat", () => {
  it("batch intake fixture reaches the accepted chunk merger", async () => {
    expect((await batchIntake(batchFixture(), "/repo")).edges).toHaveLength(1);
  });
  it("M1-overflow-literal-1e400-refused-on-load", () => {
    const text = '{"nodes":[{"id":"a"},{"id":"b"}],"links":[{"source":"a","target":"b","relation":"calls","source_file":"f.ts","confidence_score":1e400}]}';
    const path = join(tempDir(), "graph.json"); writeFileSync(path, text);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.links[0].confidence_score).toBe(Infinity);
    expect(() => core.loadGraphFromData(raw)).toThrow(/non.finite/i);
    expect(readFileSync(path, "utf8")).toBe(text);
  });
  it.fails("M2-direct-vs-singleton-batch-with-root-equal", async () => {
    const fresh = batchFixture();
    const direct = buildFromJson(fresh, { root: "/repo" });
    const captured = await batchIntake(fresh, "/repo"); // actual production caller at extraction-batch.ts
    const batch = buildFromJson(captured, { root: "/repo" });
    for (const writer of writers) {
      const left = rows(direct, writer)[0], right = rows(batch, writer)[0];
      expectObservations(left, [{ ...observation(fresh.edges[0]), source_file: "f.ts" }]);
      expect(right.evidence_observations).toEqual(left.evidence_observations);
      expect([left.source_file, right.source_file]).toEqual(["f.ts", "f.ts"]);
      for (const pair of [[left, right], [right, left]]) {
        const replay = fromRows(pair, { root: "/repo" }, fresh.nodes);
        expectObservations(rows(replay, writer)[0], left.evidence_observations);
        expect(rows(replay, writer)[0].evidence_observations).toHaveLength(1);
        expectFixedPoint(replay, pair);
      }
    }
  });
  it.fails("R4-captured-absolute-observation-never-repaired", () => {
    const rec = { source_file: "/repo/f.ts", confidence: "EXTRACTED", source_location: "L1" };
    const captured = extraction([edge({ source_file: "/repo/f.ts", source_location: "L1", evidence_observations: [rec] })]);
    const batch = mergeExtractionsWithCitations([captured], { root: "/repo" } as never).extraction;
    for (const input of [captured, batch]) {
      const G = buildFromJson(input, { root: "/repo" });
      for (const writer of writers) {
        expectObservations(rows(G, writer)[0], [rec]);
        expect(rows(G, writer)[0].source_file).toBe("/repo/f.ts");
      }
      expectFixedPoint(G, input.edges);
    }
  });
  it.fails("legacy-plural-derivation-recovery-raw-first", () => {
    const raw = { source: "a", target: "b", relation: "calls", source_file: "f.ts", derivation_methods: ["ast", "deorphan:co-provenance-peer"] };
    const G = core.loadGraphFromData({ nodes: [node("a"), node("b")], links: [raw] });
    expectObservations(rows(G)[0], raw.derivation_methods.map(derivation_method => ({ source_file: "f.ts", derivation_method })));
    for (const rec of rows(G)[0].evidence_observations) expect(Object.hasOwn(rec, "confidence")).toBe(false);
    expect(rows(G)[0].derivation_methods).toEqual(raw.derivation_methods);
    expectFixedPoint(G);
  });
  it.fails("legacy-reversed-row-effective-preserved", () => {
    for (const link of [{ source: "a", target: "b", _src: "b", _tgt: "a", relation: "calls", source_file: "f.ts", custom: { preserve: true } }, { source: "a", target: "b", source_file: "f.ts" }]) {
      const G = core.loadGraphFromData({ nodes: [node("a"), node("b")], links: [link] });
      for (const writer of writers) {
        const row = rows(G, writer)[0];
        expect([row.source, row.target, row._src, row._tgt]).toEqual([link._src ?? "a", link._tgt ?? "b", link._src ?? "a", link._tgt ?? "b"]);
        expect(row.relation).toBe(link.relation ?? "related_to");
        expectObservations(row, [observation(link)]);
        if (link.custom) expect(row.custom).toEqual(link.custom);
      }
      expectFixedPoint(G);
    }
  });
  it.fails("x2b-roundtrip-stays-simple", async () => {
    const dir = tempDir();
    const original = files.createFileGraphStore;
    const scratch: boolean[] = [];
    const factory = vi.spyOn(files, "createFileGraphStore").mockImplementation(config => {
      const store = original(config), push = store.pushGraph.bind(store);
      store.pushGraph = async (G, communities, options) => { scratch.push(G.multi); expect(G.size).toBe(1); return push(G, communities, options); };
      return store;
    });
    try {
      const adapter = createFileGraphProjectionAdapter({ dir, resolveTerminal: () => new Set(), materialize: () => ({ nodes: ["a", "b"], edges: [["a", "b"], ["a", "b"]], contribution: 1 }) });
      expect(await adapter.ingest("r1")).toMatchObject({ ok: true });
      expect(scratch.length).toBeGreaterThan(0);
      expect(scratch.every(multi => multi === false)).toBe(true);
      const snapshot = JSON.parse(readFileSync(join(dir, "graph-x2b.json"), "utf8"));
      expect(snapshot.graph_format).toBe("engram-graph/2");
      expect(snapshot.multigraph).toBe(true);
      const loaded = core.loadGraphFromData(snapshot);
      expect(loaded.multi).toBe(true);
      expect(rows(loaded).map(r => [r.source, r.target, r.relation])).toEqual([["a", "b", "related_to"]]);
      expectFixedPoint(loaded);
    } finally { factory.mockRestore(); }
  });

  it("watcher-v3-rejects-zero-writes", async () => {
    const root = tempDir(), state = join(root, ".engram"); mkdirSync(state);
    const destination = join(state, "graph.json"), text = JSON.stringify(future); writeFileSync(destination, text);
    const persist = vi.spyOn(exports, "persistGraphWithCitations");
    const mirror = vi.spyOn(files, "createFileGraphStore");
    try {
      typed(await captureError(() => rebuildCode(root, false, { force: true, noCluster: true, clearStale: false })));
      expect(readFileSync(destination, "utf8")).toBe(text);
      expect(persist).not.toHaveBeenCalled();
      expect(mirror).not.toHaveBeenCalled();
    } finally { persist.mockRestore(); mirror.mockRestore(); }
  });
  it("watcher recovers an ordinary unreadable snapshot", async () => {
    const root = tempDir(), state = join(root, ".engram"); mkdirSync(state);
    const destination = join(state, "graph.json"); writeFileSync(destination, "{");
    const persist = vi.spyOn(exports, "persistGraphWithCitations");
    try {
      expect(await rebuildCode(root, false, { force: true, noCluster: true, clearStale: false })).toBe(true);
      expect(persist).toHaveBeenCalledTimes(1);
      expect(JSON.parse(readFileSync(destination, "utf8")).nodes).toEqual([]);
    } finally { persist.mockRestore(); }
  });
  it("inspection graph carries its unsupported marker and read_only attribute", () => {
    const inspected = core.loadGraphFromData(future, { allowUnknownFormatReadOnly: true } as never);
    expect(inspected.getAttribute("read_only")).toBe(true);
    expect(inspected.getAttribute("graph_format")).toBe("engram-graph/3");
  });
  for (const writer of ["serializeGraph", "toJson", "persistGraphWithCitations", "file", "sqlite", "postgres", "neo4j", "spanner", "merge-driver", "time-slice"]) describe(writer, () => {
    it("read-only-inspection-refused-by-every-writer", async () => {
      const G = core.loadGraphFromData(future, { allowUnknownFormatReadOnly: true } as never);
      const dir = tempDir(), destination = join(dir, "graph.json"), sidecar = join(dir, "ontology/citations.json");
      mkdirSync(join(dir, "ontology")); writeFileSync(destination, "graph sentinel"); writeFileSync(sidecar, "sidecar sentinel");
      const io = vi.fn(async () => ({ records: [] }));
      let statementCount: (() => number) | undefined;
      let store: any;
      let artifactPath: string | undefined;
      let work: () => unknown;
      if (writer === "serializeGraph") work = () => core.serializeGraph(G);
      else if (writer === "toJson" || writer === "persistGraphWithCitations") work = () => exports[writer](G, new Map(), destination, { force: true });
      else if (writer === "merge-driver") {
        const ancestor = join(dir, "ancestor.json"), other = join(dir, "other.json");
        writeFileSync(ancestor, JSON.stringify({ nodes: future.nodes, links: [] })); writeFileSync(other, JSON.stringify(future));
        work = () => mergeGraphJsonFiles(ancestor, destination, other);
        // Current is also a valid source and the actual destination.
        writeFileSync(destination, JSON.stringify({ nodes: future.nodes, links: [] }));
      } else if (writer === "time-slice") work = () => runGraphTimeSlice({ graph: join(tempDir(), "input.json"), out: destination, since: 0, until: 10, force: true }, { readGraph: () => future, writeGraph: io, log: () => {} });
      else {
        if (writer === "file") store = files.createFileGraphStore({ target: destination });
        if (writer === "sqlite" || writer === "postgres") {
          const harness = await losslessHarness(writer); store = harness.store; statementCount = () => harness.statements.length;
          artifactPath = harness.artifactPath;
          if (artifactPath) { mkdirSync(dirname(artifactPath), { recursive: true }); writeFileSync(artifactPath, "actual PostgreSQL artifact sentinel"); }
        }
        if (writer === "neo4j") store = await createNeo4jGraphStore({ target: "bolt://fixture" }, { driverModule: { default: { auth: { basic: () => ({}) }, driver: () => ({ session: () => ({ run: io, close: async () => {} }), close: async () => {} }) } } });
        if (writer === "spanner") store = await createSpannerGraphStore({ project: "test", instance: "test", database: "test" }, { driverModule: { Spanner: class { instance() { return { database: () => ({ run: async (...args: any[]) => { await io(...args); return [[]]; }, updateSchema: async (...args: any[]) => { await io(...args); return [{ promise: async () => {} }]; }, table: () => ({ upsert: io }), close: async () => {} }) }; } async close() {} } } });
        work = () => store.pushGraph(G, new Map(), { mode: "merge" });
      }
      const before = readFileSync(destination, "utf8");
      try {
        typed(await captureError(work!));
        expect(readFileSync(destination, "utf8")).toBe(before);
        expect(readFileSync(sidecar, "utf8")).toBe("sidecar sentinel");
        expect(io).not.toHaveBeenCalled();
        if (statementCount) expect(statementCount()).toBe(0);
        if (artifactPath) expect(readFileSync(artifactPath, "utf8")).toBe("actual PostgreSQL artifact sentinel");
      } finally { if (store) await store.close(); }
    });
  });
});

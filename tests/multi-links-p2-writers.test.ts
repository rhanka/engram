import Graph from "graphology";
import { describe, expect, it } from "vitest";
import * as driver from "../src/merge-driver.js";
import * as graphs from "../src/merge-graphs.js";
import * as watch from "../src/watch.js";
import * as runtime from "../src/skill-runtime.js";
import * as memory from "../src/graph-memory-projection.js";
import { upsertRelationEdge } from "../src/graph.js";
import { edge, extraction, node, type Row } from "./helpers/multi-links.js";

function graph(multi = true) {
  const G = new Graph({ multi, type: "undirected" });
  for (const id of ["a", "b", "c"]) G.addNode(id, { label: id });
  return G;
}
const input = () => [edge({ source_location: "L10" }), edge({ source_location: "L44" }), edge({ relation: "reads" }), edge({ source: "b", target: "a" })];
const copies: Array<[string, (target: Graph, source: Graph, links: Row[]) => void]> = [
  ["merge-driver", (target, source, links) => (driver as Row).mergeDriverEdgesPrepared(target, [{ ...source.getAttributes(), links }])],
  ["merge-graphs", (target, source) => (graphs as Row).mergeGraphEdgesPrepared(target, source)],
  ["watch", (target, source) => (watch as Row).replayWatchEdgesPrepared(target, source)],
  ["skill-runtime", (target, source) => (runtime as Row).mergeGraphsPrepared(target, source)],
];
for (const [name, copy] of copies) describe(`P2 ${name} writer body`, () => {
  for (const replacement of [false, true]) for (const invalidExisting of [false, true]) it(`refuses invalid ${invalidExisting ? "existing" : "incoming"} evidence atomically on ${replacement ? "replacement" : "insertion"}`, () => {
    const source = graph(), target = graph();
    source.addNode("new-node");
    source.setNodeAttribute("a", "label", "changed");
    target.setAttribute("memory_projection_cursor", "before");
    const links = [edge({ relation: "a-valid" }), edge({ relation: "z-invalid", ...(invalidExisting ? {} : { confidence_score: Infinity }) })];
    for (const [i, e] of links.entries()) source.addEdgeWithKey(String(i), e.source, e.target, e);
    if (replacement) upsertRelationEdge(target, "a", "b", edge({ relation: "a-valid", source_location: "existing" }));
    if (invalidExisting) target.addEdgeWithKey(JSON.stringify(["a", "b", "z-invalid"]), "a", "b", edge({ relation: "z-invalid", citations: [{ nested: Infinity }] }));
    const before = JSON.stringify(target.export());
    expect(() => copy(target, source, links)).toThrow(/non.finite/i);
    expect(JSON.stringify(target.export())).toBe(before);
  });
  it("keeps relations and reciprocals, unions observations and replays without duplicates", () => {
    const source = graph(), target = graph();
    for (const e of input()) upsertRelationEdge(source, e.source, e.target, e);
    upsertRelationEdge(target, "a", "b", edge({ source_location: "L99" }));
    copy(target, source, input());
    expect(target.size).toBe(3);
    const key = JSON.stringify(["a", "b", "calls"]);
    expect(target.getEdgeAttribute(key, "evidence_observations")).toHaveLength(3);
    const before = JSON.stringify(target.export());
    copy(target, source, input());
    expect(JSON.stringify(target.export())).toBe(before);
  });
  it("admits effective endpoints and skips dangling effective assertions", () => {
    const source = graph(), target = graph();
    const links = [edge({ source: "a", target: "b", _src: "b", _tgt: "c" }), edge({ _src: "missing", _tgt: "c" })];
    for (let i = 0; i < links.length; i++) source.addEdgeWithKey(String(i), "a", "b", links[i]);
    copy(target, source, links);
    expect(target.size).toBe(1);
    expect(target.extremities(target.edges()[0])).toEqual(["b", "c"]);
  });
  it("never swallows keyed-writer invariants", () => {
    const source = graph(), target = graph(false);
    upsertRelationEdge(source, "a", "b", edge());
    expect(() => copy(target, source, [edge()])).toThrow(/requires a multigraph/);
  });
  it("refuses read-only source graphs before changing the target", () => {
    const source = graph(), target = graph();
    upsertRelationEdge(source, "a", "b", edge());
    source.addNode("new-node");
    source.setAttribute("read_only", true);
    const before = JSON.stringify(target.export());
    expect(() => copy(target, source, [edge()])).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
    expect(JSON.stringify(target.export())).toBe(before);
  });
});

describe("P2 memory-projection writer body", () => {
  for (const replacement of [false, true]) for (const invalidExisting of [false, true]) it(`refuses invalid ${invalidExisting ? "existing" : "incoming"} evidence before nodes and cursors on ${replacement ? "replacement" : "insertion"}`, () => {
    const G = graph();
    G.addNode("memory:existing", { file_type: "memory", label: "before" });
    G.setAttribute("memory_projection_cursor", "before");
    G.setAttribute("memory_high_water_cursor", "before");
    if (replacement) upsertRelationEdge(G, "a", "b", edge({ relation: "a-valid", source_location: "existing" }));
    if (invalidExisting) G.addEdgeWithKey(JSON.stringify(["a", "b", "z-invalid"]), "a", "b", edge({ relation: "z-invalid", confidence_score: Infinity }));
    const assembled = {
      extraction: extraction([edge({ relation: "a-valid" }), edge({ relation: "z-invalid", ...(invalidExisting ? {} : { confidence_score: Infinity }) })], [node("memory:existing", { file_type: "memory", label: "changed" }), node("memory:new", { file_type: "memory" })]),
      projection_cursor: "10", high_water_cursor: "10",
    };
    const before = JSON.stringify(G.export());
    expect(() => memory.attachMemoryProjectionToGraphPrepared(G, assembled)).toThrow(/non.finite/i);
    expect(JSON.stringify(G.export())).toBe(before);
  });
  it("refuses read-only targets before attaching nodes or cursors", () => {
    const G = graph();
    G.setAttribute("read_only", true);
    const before = JSON.stringify(G.export());
    const assembled = { extraction: extraction([], [node("new-memory-node", { file_type: "memory" })]), projection_cursor: "10", high_water_cursor: "10" };
    expect(() => (memory as Row).attachMemoryProjectionToGraphPrepared(G, assembled)).toThrowError(expect.objectContaining({ code: "unsupported-graph-format" }));
    expect(JSON.stringify(G.export())).toBe(before);
  });
  it("memory-about-coexists-with-code-link and replay is idempotent", () => {
    const G = graph();
    upsertRelationEdge(G, "a", "b", edge());
    const assembled = { extraction: extraction([edge({ relation: "memory_about" })], []), projection_cursor: "10", high_water_cursor: "10" };
    for (let i = 0; i < 2; i++) {
      expect((memory as Row).attachMemoryProjectionToGraphPrepared(G, assembled)).toMatchObject({ added_nodes: 0, added_edges: 1, skipped_dangling_edges: 0 });
    }
    expect(G.size).toBe(2);
    expect(G.getEdgeAttributes(JSON.stringify(["a", "b", "memory_about"]))).not.toHaveProperty("source");
  });
  it("uses effective endpoints and rejects writer invariants", () => {
    const assembled = { extraction: extraction([edge({ _src: "b", _tgt: "c" }), edge({ _src: "missing", _tgt: "b" })], []), projection_cursor: "10", high_water_cursor: "10" };
    const G = graph();
    expect((memory as Row).attachMemoryProjectionToGraphPrepared(G, assembled)).toMatchObject({ added_edges: 1, skipped_dangling_edges: 1 });
    expect(G.extremities(G.edges()[0])).toEqual(["b", "c"]);
    expect(() => (memory as Row).attachMemoryProjectionToGraphPrepared(graph(false), assembled)).toThrow(/requires a multigraph/);
  });
});

it("preflights every merge-driver input before writing the first graph", () => {
  const G = graph();
  const before = JSON.stringify(G.export());
  expect(() => driver.mergeDriverEdgesPrepared(G, [
    { nodes: [], links: [edge({ relation: "a-valid" })] },
    { nodes: [], links: [edge({ relation: "z-invalid", confidence_score: Infinity })] },
  ])).toThrow(/non.finite/i);
  expect(JSON.stringify(G.export())).toBe(before);
});

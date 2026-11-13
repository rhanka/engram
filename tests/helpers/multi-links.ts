import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Graph from "graphology";
import { afterEach, expect } from "vitest";
import { buildFromJson } from "../../src/build.js";
import { toJson } from "../../src/export.js";
import { loadGraphFromData, serializeGraph } from "../../src/graph.js";
import type { Extraction, GraphEdge, GraphNode } from "../../src/types.js";

export type Row = Record<string, any>;
const directories: string[] = [];
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "multi-links-L0-"));
  directories.push(dir);
  return dir;
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
export function node(id: string, attrs: Row = {}): GraphNode {
  return { id, label: id, file_type: "code", source_file: "f.ts", ...attrs } as GraphNode;
}
export function edge(attrs: Row = {}): GraphEdge {
  return { source: "a", target: "b", relation: "calls", source_file: "f.ts", confidence: "EXTRACTED", ...attrs } as GraphEdge;
}
export function extraction(edges: GraphEdge[] = [], nodes = [node("a"), node("b")]): Extraction {
  return { nodes, edges, hyperedges: [], input_tokens: 0, output_tokens: 0 };
}
export function permutations<T>(values: T[]): T[][] {
  return values.length ? values.flatMap((v, i) => permutations(values.filter((_, j) => i !== j)).map(tail => [v, ...tail])) : [[]];
}
export const writers = ["serializeGraph", "toJson"] as const;
export function writeGraph(G: Graph, writer: typeof writers[number]): Row {
  if (writer === "serializeGraph") return JSON.parse(JSON.stringify(serializeGraph(G)));
  const path = join(tempDir(), "graph.json");
  toJson(G, new Map(), path);
  return JSON.parse(readFileSync(path, "utf8"));
}
export function rows(G: Graph, writer: typeof writers[number] = "serializeGraph"): Row[] { return writeGraph(G, writer).links; }
export function fromRows(links: Row[], options: Row = {}, nodes = [node("a"), node("b")]): Graph {
  return buildFromJson(extraction(links as GraphEdge[], nodes), options);
}
// Explicit multigraphs isolate readers before the factory activation.
export function multiGraph(links: Row[], nodes = [node("a"), node("b")], directed = false): Graph {
  const G = new Graph({ multi: true, type: directed ? "directed" : "undirected" });
  for (const { id, ...attrs } of nodes) G.addNode(id, attrs);
  for (const { source, target, ...attrs } of links) G.addEdgeWithKey(JSON.stringify([source, target, attrs.relation]), source, target, { ...attrs, _src: source, _tgt: target });
  return G;
}
export function expectFixedPoint(G: Graph, replay: Row[] = []): void {
  const byWriter = writers.map(writer => {
    const data = writeGraph(G, writer);
    const reloaded = loadGraphFromData(data);
    expect(JSON.stringify(rows(reloaded, writer))).toBe(JSON.stringify(data.links));
    if (replay.length) {
      const rebuilt = fromRows([...data.links, ...replay], {}, (data.nodes as Row[]).map(n => node(n.id, n)));
      expect(JSON.stringify(rows(rebuilt, writer))).toBe(JSON.stringify(data.links));
    }
    return data.links;
  });
  expect(JSON.stringify(byWriter[0])).toBe(JSON.stringify(byWriter[1]));
}
export function observation(attrs: Row): Row {
  const keys = ["source_file", "source_location", "citations", "confidence", "confidence_score", "derivation_method", "evidence_refs", "extractor", "t", "t_end"];
  return JSON.parse(JSON.stringify(Object.fromEntries(keys.filter(k => Object.hasOwn(attrs, k) && attrs[k] !== undefined).map(k => [k, attrs[k]]))));
}
export function expectObservations(row: Row, expected: Row[]): void {
  expect(row.evidence_observations, "captured observation set").toBeDefined();
  expect(row.evidence_observations).toHaveLength(expected.length);
  expect(row.evidence_observations).toEqual(expect.arrayContaining(expected));
}

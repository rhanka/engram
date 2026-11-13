import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as core from "../src/graph.js";
import { isFileNode, suggestQuestions, surprisingConnections, godNodes } from "../src/analyze.js";
import { buildReviewDelta } from "../src/review.js";
import { buildFirstHopSummary } from "../src/summary.js";
import { edge, node, multiGraph, writeGraph, tempDir, type Row } from "./helpers/multi-links.js";
import { withMcp } from "./helpers/multi-links-mcp.js";

const pairNodes = [node("a", { label: "Caller", source_file: "src/a.ts" }), node("b", { label: "Callee", source_file: "src/b.ts" })];
const relations = ["calls", "r1", "r2", "r3", "r4"].map(relation => edge({ relation }));
describe("L0-T metrics", () => {
  it("Graphology incidence remains native while neighbors count topology", () => {
    const G = multiGraph(relations.slice(0, 3));
    expect(G.degree("a")).toBe(3);
    expect(G.neighbors("a")).toEqual(["b"]);
  });
  it.fails("neighborDegree-and-edgeCount-public-API", () => {
    const G = multiGraph([edge({ source: "a", target: "a" })], [node("a")]);
    expect((core as Row).neighborDegree, "src/graph.ts neighborDegree export").toBeTypeOf("function");
    expect((core as Row).edgeCount, "src/graph.ts edgeCount export").toBeTypeOf("function");
    expect((core as Row).neighborDegree(G, "a")).toBe(1);
    expect((core as Row).edgeCount(G, "a")).toBe(1);
    expect(G.degree("a")).toBe(2);
  });
  for (const surface of ["file", "leaf", "periphery"]) describe(surface, () => {
    it.fails("leaf-file-classification-unchanged-by-parallel", () => {
      const ns = [node("hub", { label: "Hub", source_file: "src/hub.ts" }), node("leaf", { label: surface === "file" ? "visit()" : "Leaf", source_file: "src/leaf.ts" }), ...Array.from({ length: 6 }, (_, i) => node("peer" + i, { label: "Peer" + i, source_file: "src/peer.ts" }))];
      const base = [edge({ source: "hub", target: "leaf" }), ...ns.slice(2).map(n => edge({ source: "hub", target: n.id }))];
      const G = multiGraph(base, ns), P = multiGraph([...base, ...["r1", "r2", "r3"].map(relation => edge({ source: "hub", target: "leaf", relation }))], ns);
      if (surface === "file") { expect(isFileNode(G, "leaf")).toBe(true); expect(isFileNode(P, "leaf")).toBe(true); }
      if (surface === "leaf") {
        const isolated = (g: typeof G) => suggestQuestions(g, new Map(), undefined, 100).filter(q => q.type === "isolated_nodes");
        expect(isolated(P)).toEqual(isolated(G));
      }
      if (surface === "periphery") {
        const reason = (g: typeof G) => surprisingConnections(g, new Map(), 100).find(e => e.source === "Hub" && e.target === "Leaf" && e.relation === "calls")!.why;
        expect(reason(G)).toContain("peripheral node"); expect(reason(P)).toBe(reason(G));
      }
    });
  });
  for (const surface of ["summary", "review", "MCP", "CLI"]) describe(surface, () => {
    it.fails("four-relations-one-neighbour-degree-risk-unchanged", async () => {
      const G = multiGraph(relations, pairNodes);
      expect(G.size).toBe(5);
      if (surface === "summary") {
        const summary = buildFirstHopSummary(G);
        expect(summary.graph.average_degree).toBe(1);
        expect(summary.top_hubs.map(n => n.degree)).toEqual([1, 1]);
        expect(summary.graph.edges).toBe(5);
        expect(godNodes(G).map(n => n.degree)).toEqual([1, 1]);
      }
      if (surface === "review") {
        const review = buildReviewDelta(G, ["src/a.ts"], { depth: 1 });
        expect(review.changed_nodes[0].degree).toBe(1);
        expect(review.impacted_nodes.every(n => n.degree === 1)).toBe(true);
        expect(review.high_risk_chains.filter(c => c.risk.includes("high-degree"))).toEqual([]);
      }
      if (surface === "MCP") await withMcp(writeGraph(G, "serializeGraph"), async call => {
        expect(await call("get_node", { label: "Caller" })).toContain("Degree: 1");
        const summary = await call("first_hop_summary");
        expect(summary).toMatch(/5 edges/); expect(summary).toMatch(/average degree 1/);
        expect(await call("graph_stats")).toMatch(/Edges: 5/);
      });
      if (surface === "CLI") {
        const path = join(tempDir(), "graph.json"); writeFileSync(path, JSON.stringify(writeGraph(G, "serializeGraph")));
        const { main } = await import("../src/cli.js"), argv = process.argv;
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        try {
          process.argv = [process.execPath, "engram", "summary", "--graph", path];
          await main();
          const text = log.mock.calls.flat().join("\n");
          expect(text).toMatch(/5 edges/); expect(text).toMatch(/average degree 1/); expect(text).toMatch(/Caller \(degree 1/);
        } finally { process.argv = argv; log.mockRestore(); }
      }
    });
  });
});

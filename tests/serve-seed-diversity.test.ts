/**
 * Per-term BFS seed diversity — port of upstream safishamsi d56ee83 (#1445).
 *
 * Taking only the global top-K scored candidates as BFS seeds has a failure
 * mode on multi-term queries: one term's matches can occupy every top slot,
 * so the traversal never explores the neighborhood of the other, actually
 * relevant terms and `query_graph` returns confidently-wrong results.
 * `pickSeeds` guarantees at least one seed per distinct term that has any
 * match at all; ties within a term break by node degree.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { pickSeeds, serve } from "../src/serve.js";
import { scoreSearchText } from "../src/search.js";

function scoreAll(G: Graph, terms: string[]): Array<[number, string]> {
  const scored: Array<[number, string]> = [];
  G.forEachNode((nid, data) => {
    const score = scoreSearchText(
      (data.label as string) ?? "",
      (data.source_file as string) ?? "",
      terms,
    );
    if (score > 0) scored.push([score, nid]);
  });
  scored.sort((a, b) => b[0] - a[0]);
  return scored;
}

/** #1445 reproduction shape: three "alpha" nodes (label + source_file match,
 * 1.5 each) occupy the whole top-3; the only "widget" node scores 1.0. */
function starvationGraph(): Graph {
  const G = new Graph();
  G.addNode("a1", { label: "alpha core", source_file: "src/alpha/core.ts" });
  G.addNode("a2", { label: "alpha util", source_file: "src/alpha/util.ts" });
  G.addNode("a3", { label: "alpha extra", source_file: "src/alpha/extra.ts" });
  G.addNode("w1", { label: "WidgetHelper", source_file: "src/ui/helper.ts" });
  G.addNode("w2", { label: "widget renderer detail", source_file: "src/ui/render.ts" });
  G.addEdge("a1", "a2");
  G.addEdge("w1", "w2");
  return G;
}

describe("pickSeeds per-term diversity (upstream d56ee83 / #1445)", () => {
  it("without terms behaves exactly like the legacy top-K slice", () => {
    const G = starvationGraph();
    const scored = scoreAll(G, ["alpha", "widget"]);
    expect(pickSeeds(G, scored, [])).toEqual(scored.slice(0, 3).map(([, nid]) => nid));
    expect(pickSeeds(G, [], ["alpha"])).toEqual([]);
  });

  it("guarantees a seed for a term starved out of the global top-K", () => {
    const G = starvationGraph();
    const terms = ["alpha", "widget"];
    const scored = scoreAll(G, terms);

    // Pre-condition: the legacy top-3 slice is all alpha nodes (the bug).
    const legacy = scored.slice(0, 3).map(([, nid]) => nid);
    expect(legacy.sort()).toEqual(["a1", "a2", "a3"]);

    // pickSeeds recovers the widget cluster's best node as a seed.
    const seeds = pickSeeds(G, scored, terms);
    expect(seeds.slice(0, 3).sort()).toEqual(["a1", "a2", "a3"]);
    expect(seeds.some((nid) => nid.startsWith("w"))).toBe(true);
  });

  it("breaks per-term score ties by node degree", () => {
    const G = new Graph();
    // Three "orange" nodes (label + source match, 1.5 each) fill the top-3;
    // the two "cache" nodes tie at 1.0 (label substring only), but hub has
    // degree 2 and loner degree 0 — the diversity pass must pick hub.
    G.addNode("o1", { label: "orange core", source_file: "src/orange/core.ts" });
    G.addNode("o2", { label: "orange util", source_file: "src/orange/util.ts" });
    G.addNode("o3", { label: "orange extra", source_file: "src/orange/extra.ts" });
    G.addNode("loner", { label: "CacheReader", source_file: "" });
    G.addNode("hub", { label: "CacheWriter", source_file: "" });
    G.addNode("n1", { label: "other one", source_file: "" });
    G.addNode("n2", { label: "other two", source_file: "" });
    G.addEdge("hub", "n1");
    G.addEdge("hub", "n2");

    const terms = ["orange", "cache"];
    const scored = scoreAll(G, terms);
    expect(scored.slice(0, 3).map(([, nid]) => nid).sort()).toEqual(["o1", "o2", "o3"]);

    const seeds = pickSeeds(G, scored, terms);
    expect(seeds).toContain("hub");
    expect(seeds).not.toContain("loner");
  });
});

describe("query_graph end-to-end seed diversity", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("reaches the second term's cluster despite a dominant first term", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-seed-diversity-"));
    tempDirs.push(dir);
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "a1", label: "alpha core", source_file: "src/alpha/core.ts", file_type: "code", community: 0 },
          { id: "a2", label: "alpha util", source_file: "src/alpha/util.ts", file_type: "code", community: 0 },
          { id: "a3", label: "alpha extra", source_file: "src/alpha/extra.ts", file_type: "code", community: 0 },
          { id: "w1", label: "WidgetHelper", source_file: "src/ui/helper.ts", file_type: "code", community: 1 },
          { id: "w2", label: "widget renderer detail", source_file: "src/ui/render.ts", file_type: "code", community: 1 },
        ],
        links: [
          { source: "a1", target: "a2", relation: "calls", confidence: "EXTRACTED" },
          { source: "w1", target: "w2", relation: "calls", confidence: "EXTRACTED" },
        ],
      }),
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-seed-test", version: "0.0.0" });
    try {
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: "query_graph",
        arguments: { question: "alpha widget", depth: 1 },
      });
      const text = (result.content as Array<{ type: string; text: string }>)
        .map((c) => c.text)
        .join("\n");
      // The widget cluster is disconnected from the alpha cluster: without
      // per-term seeding it could only appear if seeded directly.
      expect(text).toContain("WidgetHelper");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });
});

/**
 * Regression tests for F-0816-P4 / S4.1.
 *
 * Port of upstream safishamsi/graphify commit `9e6192a` (PR #936):
 * `wiki.py` would crash with `TypeError` on `sorted(G.degree(stale_id))`
 * when the communities dict carried node IDs that no longer existed in `G`
 * (drift introduced by dedup / re-extract / update). The fix filters stale
 * IDs before iteration and emits a single stderr warning showing the drop
 * count. If *every* community node is stale the call raises `ValueError`
 * with a helpful message instead of silently writing an empty wiki.
 *
 * The TS port mirrors the same contract: stale node IDs are dropped from
 * communities before article rendering, a single stderr warning is emitted,
 * and an empty-after-filter situation raises an Error.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";
import { toWiki } from "../src/wiki.js";

function makeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.mergeNode("n1", { label: "parse", source_file: "parser.ts", community: 0 });
  G.mergeNode("n2", { label: "lex", source_file: "lexer.ts", community: 0 });
  G.mergeNode("n3", { label: "render", source_file: "render.ts", community: 1 });
  G.mergeNode("n4", { label: "draw", source_file: "render.ts", community: 1 });
  G.mergeEdge("n1", "n2", { relation: "calls", confidence: "EXTRACTED" });
  G.mergeEdge("n3", "n4", { relation: "calls", confidence: "EXTRACTED" });
  return G;
}

const LABELS = new Map([
  [0, "Parsing Layer"],
  [1, "Rendering Layer"],
]);

describe("toWiki stale community node filter (F-0816-P4 / S4.1, upstream #936)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-wiki-stale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("silently drops stale node IDs and still writes the community article", () => {
    const G = makeGraph();
    // "ghost" is in the communities dict but no longer in the graph
    const communities = new Map([
      [0, ["n1", "n2", "ghost"]],
      [1, ["n3", "n4"]],
    ]);

    const count = toWiki(G, communities, tmpDir, { communityLabels: LABELS });

    expect(count).toBe(2);
    expect(existsSync(join(tmpDir, "Parsing_Layer.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "Rendering_Layer.md"))).toBe(true);
    const article = readFileSync(join(tmpDir, "Parsing_Layer.md"), "utf-8");
    expect(article).toContain("parse");
    expect(article).not.toContain("ghost");
  });

  it("drops a community entirely when every one of its nodes is stale", () => {
    const G = makeGraph();
    const communities = new Map([
      [0, ["n1", "n2"]],
      [1, ["only_stale_a", "only_stale_b"]],
    ]);

    const count = toWiki(G, communities, tmpDir, { communityLabels: LABELS });

    expect(count).toBe(1);
    expect(existsSync(join(tmpDir, "Parsing_Layer.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "Rendering_Layer.md"))).toBe(false);
  });

  it("raises when every community node is stale (upstream raises ValueError)", () => {
    const G = makeGraph();
    const allStale = new Map([
      [0, ["ghost1", "ghost2"]],
      [1, ["ghost3"]],
    ]);

    expect(() => toWiki(G, allStale, tmpDir, { communityLabels: LABELS })).toThrow(/stale/i);
  });

  it("emits a single stderr warning showing the drop count", () => {
    const G = makeGraph();
    const communities = new Map([
      [0, ["n1", "stale1", "stale2"]],
      [1, ["n3", "n4"]],
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    toWiki(G, communities, tmpDir, { communityLabels: LABELS });

    expect(warn).toHaveBeenCalled();
    const formatted = warn.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(formatted).toMatch(/stale/i);
    expect(formatted).toContain("2");
  });

  it("is silent when no nodes are stale", () => {
    const G = makeGraph();
    const communities = new Map([
      [0, ["n1", "n2"]],
      [1, ["n3", "n4"]],
    ]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    toWiki(G, communities, tmpDir, { communityLabels: LABELS });

    const stale = warn.mock.calls.filter((args) => /stale/i.test(args.join(" ")));
    expect(stale).toHaveLength(0);
  });
});

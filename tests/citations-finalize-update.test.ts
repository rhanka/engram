import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import {
  aggregateCitations,
  CITATIONS_INLINE_TOP_K,
  readCitationsSidecar,
  writeCitationsSidecar,
  type CitationAggregateMap,
} from "../src/citations.js";
import { persistGraphWithCitations } from "../src/export.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-finalize-update-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function cite(i: number): OntologyCitation {
  return { source_file: `work${i % 25}.txt`, page: i, section: `ch${i % 7}` };
}

/**
 * F1 regression. The live `/graphify update` -> finalize-update path loads the
 * prior exhaustive graph (full union in citations.json, K-trimmed inline in
 * graph.json) and a fresh re-extraction of a hub that brings ONE new/overlapping
 * citation. The prior FULL union must be recovered (not the trimmed inline
 * K-set), so the node ends count == |prior_full ∪ fresh|, inline == K, and
 * citations.json holds the full union — never count:N / list:1.
 */
describe("F1: aggregateCitations(priorSidecar) recovers the exhaustive tail", () => {
  it("unions the prior FULL per-node set (from the sidecar) with the fresh extraction", () => {
    // Prior FULL union: 214 distinct citations (lives in citations.json).
    const priorFull: OntologyCitation[] = [];
    for (let i = 0; i < 214; i += 1) priorFull.push(cite(i));
    const priorSidecar: CitationAggregateMap = {
      hub: { count: 214, citations: priorFull },
    };

    // Fresh re-extraction: the hub re-appears but the chunk only carries ONE
    // overlapping citation (the K-trim + last-write-wins lost the tail). This is
    // exactly the inconsistent count:214 / inline:1 case from the finding.
    const G = new Graph();
    G.addNode("hub", {
      label: "Hub",
      source_file: "work0.txt",
      file_type: "document",
      // A stale count survives mergeNode (fresh node had none); the fresh inline
      // is a single citation.
      citation_count: 214,
      citations: [cite(0)],
    });

    const map = aggregateCitations(G, { priorSidecar });

    // The node ends with the TRUE union size (prior 214 ∪ fresh {0} = 214).
    expect(G.getNodeAttribute("hub", "citation_count")).toBe(214);
    const inline = G.getNodeAttribute("hub", "citations") as OntologyCitation[];
    expect(inline).toHaveLength(CITATIONS_INLINE_TOP_K);
    // Inline ⊆ union.
    const unionKeys = new Set(map.hub.citations.map((c) => `${c.source_file}|${c.page}|${c.section}`));
    for (const c of inline) {
      expect(unionKeys.has(`${c.source_file}|${c.page}|${c.section}`)).toBe(true);
    }
    // citations.json carries the FULL union, NOT the trimmed inline.
    expect(map.hub.count).toBe(214);
    expect(map.hub.citations).toHaveLength(214);
  });

  it("adds a genuinely new fresh citation to the prior union (count grows)", () => {
    const priorFull: OntologyCitation[] = [];
    for (let i = 0; i < 10; i += 1) priorFull.push(cite(i));
    const priorSidecar: CitationAggregateMap = {
      hub: { count: 10, citations: priorFull },
    };

    const G = new Graph();
    G.addNode("hub", {
      label: "Hub",
      source_file: "work0.txt",
      file_type: "document",
      citation_count: 10,
      // Fresh chunk introduces a brand-new citation (page 999) plus an overlap.
      citations: [cite(0), { source_file: "newwork.txt", page: 999, section: "ch0" }],
    });

    const map = aggregateCitations(G, { priorSidecar });
    expect(map.hub.count).toBe(11);
    expect(G.getNodeAttribute("hub", "citation_count")).toBe(11);
    expect(map.hub.citations).toHaveLength(11);
  });

  it("persistGraphWithCitations(priorSidecar) writes the full union to citations.json", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");

    const priorFull: OntologyCitation[] = [];
    for (let i = 0; i < 214; i += 1) priorFull.push(cite(i));
    const priorSidecar: CitationAggregateMap = {
      hub: { count: 214, citations: priorFull },
    };

    const G = new Graph();
    G.addNode("hub", {
      label: "Hub",
      source_file: "work0.txt",
      file_type: "document",
      citation_count: 214,
      citations: [cite(0)],
    });

    const written = persistGraphWithCitations(G, new Map([[0, ["hub"]]]), graphPath, {
      force: true,
      citations: { priorSidecar },
    });
    expect(written).toBe(true);

    const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; citations?: unknown[]; citation_count?: number }>;
    };
    const hub = graph.nodes.find((n) => n.id === "hub")!;
    expect(hub.citation_count).toBe(214);
    expect(hub.citations).toHaveLength(CITATIONS_INLINE_TOP_K);

    const sidecarPath = join(dir, "ontology", "citations.json");
    expect(existsSync(sidecarPath)).toBe(true);
    const sidecar = readCitationsSidecar(dir)!;
    // The full union (214), NOT count:214 / list:1.
    expect(sidecar.hub.count).toBe(214);
    expect(sidecar.hub.citations).toHaveLength(214);
  });
});

/**
 * End-to-end F1: the actual `merge-update` runtime subcommand. Mirrors the live
 * `/graphify update` flow — load an existing exhaustive graph (K-trimmed inline,
 * full tail in citations.json), merge a fresh re-extraction of the hub that
 * brings one overlapping citation, and confirm mergeGraphs unions inline +
 * persist recovers the FULL prior tail from the snapshot (never count:N/list:1).
 */
describe("F1 e2e: merge-update recovers the exhaustive tail via the prior sidecar", () => {
  async function runRuntime(args: string[]): Promise<void> {
    const { main } = await import("../src/skill-runtime.js");
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
      await main(["node", "skill-runtime", ...args]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
  }

  it("does not lock a stale count and writes the full union to citations.json", async () => {
    const root = tempDir();
    const stateDir = join(root, ".graphify");
    mkdirSync(stateDir, { recursive: true });
    const graphPath = join(stateDir, "graph.json");

    // Prior exhaustive graph: hub with K-trimmed inline + stale-but-true count.
    const priorFull: OntologyCitation[] = [];
    for (let i = 0; i < 214; i += 1) priorFull.push(cite(i));
    const inline = priorFull.slice(0, CITATIONS_INLINE_TOP_K);
    const priorGraph = {
      directed: false,
      multigraph: false,
      graph: {},
      nodes: [
        {
          id: "hub",
          label: "Hub",
          source_file: "work0.txt",
          file_type: "document",
          citation_count: 214,
          citations: inline,
        },
        { id: "spoke", label: "Spoke", source_file: "work1.txt", file_type: "document" },
      ],
      links: [{ source: "hub", target: "spoke", relation: "mentions" }],
    };
    writeFileSync(graphPath, JSON.stringify(priorGraph, null, 2), "utf-8");

    // The FULL tail lives in the co-derived citations.json.
    const G = new Graph();
    G.addNode("hub", { citations: inline });
    writeCitationsSidecar(stateDir, { hub: { count: 214, citations: priorFull } }, G);

    // Fresh re-extraction: hub re-appears carrying only ONE overlapping citation.
    const extractPath = join(stateDir, "extract.json");
    writeFileSync(
      extractPath,
      JSON.stringify({
        nodes: [
          {
            id: "hub",
            label: "Hub",
            source_file: "work0.txt",
            file_type: "document",
            citations: [cite(0)],
          },
          { id: "spoke", label: "Spoke", source_file: "work1.txt", file_type: "document" },
        ],
        edges: [{ source: "hub", target: "spoke", relation: "mentions" }],
        input_tokens: 0,
        output_tokens: 0,
      }),
      "utf-8",
    );

    const detectPath = join(stateDir, "detect.json");
    writeFileSync(
      detectPath,
      JSON.stringify({
        files: { code: [], document: ["work0.txt", "work1.txt"], paper: [], image: [], video: [] },
        total_files: 2,
        total_words: 1000,
        needs_graph: false,
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      }),
      "utf-8",
    );

    await runRuntime([
      "merge-update",
      "--existing-graph", graphPath,
      "--extract", extractPath,
      "--detect", detectPath,
      "--root", root,
      "--graph-out", graphPath,
      "--report-out", join(stateDir, "report.md"),
      "--analysis-out", join(stateDir, "analysis.json"),
    ]);

    const out = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; citations?: unknown[]; citation_count?: number }>;
    };
    const hub = out.nodes.find((n) => n.id === "hub")!;
    // The stale count is NOT locked; the inline is K-bounded.
    expect(hub.citation_count).toBe(214);
    expect(hub.citations).toHaveLength(CITATIONS_INLINE_TOP_K);

    // citations.json holds the FULL union (214), NOT count:214 / list:1.
    const sidecar = readCitationsSidecar(stateDir)!;
    expect(sidecar.hub.count).toBe(214);
    expect(sidecar.hub.citations).toHaveLength(214);
  });
});

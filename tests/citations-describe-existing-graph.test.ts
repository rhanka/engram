/**
 * F4: `describe --citation-cap all` on an EXISTING graph must not be clamped by
 * the K-trimmed inline `citations`. On the describe-on-existing-graph path the
 * node's in-memory `citations` is already trimmed to <= K, so a cap of all/50 on
 * a long-doc hub would inject at most K snippets — defeating "ground on many
 * distinct sources". The fix loads citations.json and feeds the fuller per-node
 * set into the node context.
 */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { collectNodeContext } from "../src/node-descriptions.js";
import { writeCitationsSidecar } from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-describe-existing-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function cites(n: number): OntologyCitation[] {
  const out: OntologyCitation[] = [];
  for (let i = 0; i < n; i += 1) out.push({ source_file: `work${i}.txt`, page: i + 1, section: `ch${i}` });
  return out;
}

describe("F4 unit: collectNodeContext citationsByNode override", () => {
  function hub(inlineK: number): Graph {
    const G = new Graph({ type: "undirected" });
    G.addNode("ent_hub", { label: "Hub", node_type: "Person", citations: cites(inlineK) });
    G.addNode("ent_other", { label: "Other", node_type: "Place" });
    G.addUndirectedEdge("ent_hub", "ent_other", { relation: "knows" });
    return G;
  }

  it("injects up to 20 snippets from the override when cap=all (inline trimmed to 8)", () => {
    const G = hub(8);
    const ctx = collectNodeContext(G, "ent_hub", {
      citationCap: "all",
      citationsByNode: { ent_hub: cites(20) },
    });
    expect(ctx.citations).toHaveLength(20);
  });

  it("still respects a low cap (3) even with a fuller override", () => {
    const G = hub(8);
    const ctx = collectNodeContext(G, "ent_hub", {
      citationCap: 3,
      citationsByNode: { ent_hub: cites(20) },
    });
    expect(ctx.citations).toHaveLength(3);
  });

  it("falls back to inline when no override entry for the node", () => {
    const G = hub(8);
    const ctx = collectNodeContext(G, "ent_hub", {
      citationCap: "all",
      citationsByNode: { someOtherId: cites(20) },
    });
    expect(ctx.citations).toHaveLength(8);
  });

  it("keeps inline when the override is SMALLER than inline (never shrinks)", () => {
    const G = hub(8);
    const ctx = collectNodeContext(G, "ent_hub", {
      citationCap: "all",
      citationsByNode: { ent_hub: cites(2) },
    });
    expect(ctx.citations).toHaveLength(8);
  });
});

describe("F4 e2e: describe --citation-cap all reads citations.json on the existing-graph path", () => {
  async function runDescribe(root: string, citationCap: string | undefined): Promise<void> {
    const { main } = await import("../src/cli.js");
    const argv = ["node", "graphify", "describe", root, "--description-mode", "assistant"];
    if (citationCap !== undefined) argv.push("--citation-cap", citationCap);
    const originalArgv = process.argv;
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalWrite = process.stderr.write.bind(process.stderr);
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.argv = argv;
    try {
      await main();
    } finally {
      process.argv = originalArgv;
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      process.stderr.write = originalWrite;
    }
  }

  function setupProject(inlineK: number, fullCount: number): string {
    const root = tempDir();
    const stateDir = join(root, ".graphify");
    mkdirSync(stateDir, { recursive: true });

    const inline = cites(inlineK);
    const graph = {
      directed: false,
      multigraph: false,
      graph: { topology_signature: "sig", freshness: {} },
      nodes: [
        {
          id: "ent_hub",
          label: "Hub",
          node_type: "Person",
          file_type: "document",
          source_file: "work0.txt",
          community: 0,
          community_name: "Community 0",
          citation_count: fullCount,
          citations: inline,
        },
        {
          id: "ent_other",
          label: "Other",
          node_type: "Place",
          file_type: "document",
          source_file: "work1.txt",
          community: 0,
          community_name: "Community 0",
        },
      ],
      links: [{ source: "ent_hub", target: "ent_other", relation: "knows", confidence: "EXTRACTED", confidence_score: 1.0 }],
      community_labels: { "0": "Community 0" },
      hyperedges: [],
    };
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify(graph, null, 2), "utf-8");

    // The full per-node citation set lives in citations.json.
    const G = new Graph();
    G.addNode("ent_hub", { citations: inline });
    writeCitationsSidecar(stateDir, { ent_hub: { count: fullCount, citations: cites(fullCount) } }, G);
    return root;
  }

  function countSnippets(prompt: string): number {
    const m = prompt.match(/citations=\[([^\]]*)\]/);
    if (!m || !m[1].trim()) return 0;
    return m[1].split(/",\s*"/).length;
  }

  function emittedPrompt(root: string): string {
    const dir = join(root, ".graphify", "description-instructions");
    const md = readdirSync(dir).find((f) => f.endsWith(".md"));
    if (!md) return "";
    return readFileSync(join(dir, md), "utf-8");
  }

  it("injects >K (up to 20) snippets when citations.json holds 20 and cap=all", async () => {
    const root = setupProject(8, 20);
    await runDescribe(root, "all");
    expect(countSnippets(emittedPrompt(root))).toBe(20);
  });

  it("still caps at 3 when cap=3 even with a 20-citation sidecar", async () => {
    const root = setupProject(8, 20);
    await runDescribe(root, "3");
    expect(countSnippets(emittedPrompt(root))).toBe(3);
  });

  it("falls back to inline (8) when no sidecar is present", async () => {
    const root = setupProject(8, 20);
    // Remove the sidecar so only the inline K-set is available.
    rmSync(join(root, ".graphify", "ontology", "citations.json"), { force: true });
    await runDescribe(root, "all");
    expect(countSnippets(emittedPrompt(root))).toBe(8);
  });
});

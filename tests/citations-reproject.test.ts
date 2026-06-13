/**
 * hook-rebuild re-projection (LLM-free). Two contracts:
 *   1. With extraction output present, re-derive the FULL sidecar from it.
 *   2. With only a K-trimmed graph.json, NEVER clobber a fuller existing
 *      citations.json (the pass-1 idempotency / no-shrink guard).
 *
 * No LLM, no network.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import {
  CITATIONS_INLINE_TOP_K,
  reprojectCitationsLLMFree,
  writeCitationsSidecar,
  aggregateCitations,
} from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-reproject-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function trimmedGraph(): { G: Graph; trueCount: number } {
  // Mimics a graph.json AFTER a full build: node.citations is the K-trimmed
  // inline set, citation_count carries the TRUE union size.
  const G = new Graph();
  const inline: OntologyCitation[] = [];
  for (let i = 0; i < CITATIONS_INLINE_TOP_K; i += 1) {
    inline.push({ source_file: `work${i}.txt`, page: i });
  }
  G.addNode("sherlock", { label: "Sherlock", citation_count: 214, citations: inline });
  return { G, trueCount: 214 };
}

function fullSidecar(dir: string, count: number): void {
  // A rich existing citations.json (the full tail beyond K).
  const citations: OntologyCitation[] = [];
  for (let i = 0; i < count; i += 1) {
    citations.push({ source_file: `work${i % 25}.txt`, page: i, section: `ch${i % 7}` });
  }
  mkdirSync(join(dir, "ontology"), { recursive: true });
  writeFileSync(
    join(dir, "ontology", "citations.json"),
    JSON.stringify({
      schema: "graphify_ontology_citations_v1",
      graph_signature: "stale",
      nodes: { sherlock: { count, citations } },
    }),
    "utf-8",
  );
}

describe("reprojectCitationsLLMFree — no-shrink guard (trimmed graph only)", () => {
  it("preserves a fuller existing citations.json (never shrinks to the K-set)", () => {
    const dir = tempDir();
    fullSidecar(dir, 214);
    const { G } = trimmedGraph();

    const result = reprojectCitationsLLMFree(G, dir, {});

    const sidecar = JSON.parse(readFileSync(join(dir, "ontology", "citations.json"), "utf-8")) as {
      nodes: Record<string, { count: number; citations: OntologyCitation[] }>;
    };
    // The full 214-citation tail SURVIVES — not clobbered down to K.
    expect(sidecar.nodes.sherlock.count).toBe(214);
    expect(sidecar.nodes.sherlock.citations.length).toBe(214);
    expect(result.rebuiltFromExtraction).toBe(false);
    // Level-1 stays intact: count preserved, inline still K.
    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(214);
    expect((G.getNodeAttribute("sherlock", "citations") as OntologyCitation[]).length).toBe(
      CITATIONS_INLINE_TOP_K,
    );
  });

  it("re-derives the signature so the preserved sidecar matches the current graph", () => {
    const dir = tempDir();
    fullSidecar(dir, 214);
    const { G } = trimmedGraph();
    reprojectCitationsLLMFree(G, dir, {});
    const sidecar = JSON.parse(readFileSync(join(dir, "ontology", "citations.json"), "utf-8")) as {
      graph_signature: string;
    };
    expect(sidecar.graph_signature).not.toBe("stale");
    expect(sidecar.graph_signature).toHaveLength(64);
  });
});

describe("reprojectCitationsLLMFree — full rebuild from extraction output", () => {
  it("rebuilds the FULL sidecar from the extraction output when present", () => {
    const dir = tempDir();
    const { G } = trimmedGraph(); // inline is K-trimmed only

    // Extraction output holds the full per-node citations (the durable upstream).
    const fullCitations: OntologyCitation[] = [];
    for (let i = 0; i < 214; i += 1) {
      fullCitations.push({ source_file: `work${i % 25}.txt`, page: i, section: `ch${i % 7}` });
    }
    const extractionPath = join(dir, ".graphify_extract.json");
    writeFileSync(
      extractionPath,
      JSON.stringify({ nodes: [{ id: "sherlock", citations: fullCitations }], edges: [] }),
      "utf-8",
    );

    const result = reprojectCitationsLLMFree(G, dir, { extractionPath });
    expect(result.rebuiltFromExtraction).toBe(true);

    const sidecar = JSON.parse(readFileSync(join(dir, "ontology", "citations.json"), "utf-8")) as {
      nodes: Record<string, { count: number; citations: OntologyCitation[] }>;
    };
    expect(sidecar.nodes.sherlock.count).toBe(214);
    expect(sidecar.nodes.sherlock.citations).toHaveLength(214);
    // Level-1 re-projected from the FULL extraction set → true count + K inline.
    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(214);
    expect((G.getNodeAttribute("sherlock", "citations") as OntologyCitation[]).length).toBe(
      CITATIONS_INLINE_TOP_K,
    );
  });

  it("never invents citations: a smaller extraction does not inflate the count", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("x", { citations: [{ source_file: "a.txt", page: 1 }] });
    const extractionPath = join(dir, ".graphify_extract.json");
    writeFileSync(
      extractionPath,
      JSON.stringify({ nodes: [{ id: "x", citations: [{ source_file: "a.txt", page: 1 }] }] }),
      "utf-8",
    );
    reprojectCitationsLLMFree(G, dir, { extractionPath });
    expect(G.getNodeAttribute("x", "citation_count")).toBe(1);
  });

  it("does no harm and writes no sidecar when nothing carries citations", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("plain", { label: "Plain" });
    const result = reprojectCitationsLLMFree(G, dir, {});
    expect(result.rebuiltFromExtraction).toBe(false);
    expect(result.sidecarPath).toBeNull();
  });
});

describe("aggregateCitations idempotency guard (regression — count not undercounted)", () => {
  it("keeps the larger prior citation_count when re-aggregating a trimmed graph", () => {
    const { G } = trimmedGraph();
    // Re-aggregating the trimmed graph must NOT drop the count to K.
    aggregateCitations(G);
    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(214);
    // And the freshly written sidecar from this trimmed graph would only hold K
    // — which is exactly why the reproject guard exists (covered above).
    const dir = tempDir();
    const map = aggregateCitations(G);
    const path = writeCitationsSidecar(dir, map, G);
    expect(path).not.toBeNull();
  });
});

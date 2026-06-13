/**
 * `backfill-citations`: project legacy `citations[]` into the new schema
 * (`citation_count` + K-trimmed inline + co-derived `citations.json`) WITHOUT a
 * re-extract. Counts are a LOWER BOUND (the bounded graph never held the full
 * union). Idempotent on a second run.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { backfillCitations, CITATIONS_INLINE_TOP_K } from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-backfill-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function legacyGraph(citationCount: number): Graph {
  const G = new Graph();
  const citations: OntologyCitation[] = [];
  for (let i = 0; i < citationCount; i += 1) {
    citations.push({ source_file: `work${i % 10}.txt`, page: i, section: `ch${i % 3}` });
  }
  // legacy node: has `citations[]` but NO `citation_count`.
  G.addNode("sherlock", { label: "Sherlock", citations });
  G.addNode("bare", { label: "Bare" });
  return G;
}

describe("backfillCitations", () => {
  it("populates citation_count, trims inline to K, and writes citations.json", () => {
    const dir = tempDir();
    const G = legacyGraph(20);
    const result = backfillCitations(G, dir, { topK: CITATIONS_INLINE_TOP_K });

    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(20);
    expect((G.getNodeAttribute("sherlock", "citations") as OntologyCitation[]).length).toBe(
      CITATIONS_INLINE_TOP_K,
    );
    expect(result.backfilledNodes).toBe(1);
    expect(result.sidecarPath).not.toBeNull();
    expect(result.lowerBound).toBe(true);

    const sidecar = JSON.parse(readFileSync(join(dir, "ontology", "citations.json"), "utf-8")) as {
      nodes: Record<string, { count: number; citations: OntologyCitation[] }>;
    };
    expect(sidecar.nodes.sherlock.count).toBe(20);
    expect(sidecar.nodes.sherlock.citations).toHaveLength(20);
    // bare node never gains a count or a sidecar entry.
    expect(G.getNodeAttribute("bare", "citation_count")).toBeUndefined();
    expect(sidecar.nodes.bare).toBeUndefined();
  });

  it("count = size of the deduped union, not the raw legacy list length", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("dupy", {
      citations: [
        { source_file: "a.txt", page: 1 },
        { source_file: "a.txt", page: 1 }, // exact dup
        { source_file: "b.txt", page: 2 },
      ],
    });
    backfillCitations(G, dir, {});
    expect(G.getNodeAttribute("dupy", "citation_count")).toBe(2);
  });

  it("is a no-op on a second run (idempotent — already has citation_count)", () => {
    const dir = tempDir();
    const G = legacyGraph(20);
    const first = backfillCitations(G, dir, {});
    expect(first.backfilledNodes).toBe(1);

    const inlineAfterFirst = JSON.stringify(G.getNodeAttribute("sherlock", "citations"));
    const countAfterFirst = G.getNodeAttribute("sherlock", "citation_count");

    const second = backfillCitations(G, dir, {});
    // Nothing left to backfill: every legacy node already has a citation_count.
    expect(second.backfilledNodes).toBe(0);
    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(countAfterFirst);
    expect(JSON.stringify(G.getNodeAttribute("sherlock", "citations"))).toBe(inlineAfterFirst);
  });

  it("skips nodes that already carry a citation_count (exhaustive nodes untouched)", () => {
    const dir = tempDir();
    const G = new Graph();
    // already-projected node: has citation_count + a trimmed inline set.
    G.addNode("hub", {
      citation_count: 500,
      citations: [{ source_file: "x.txt", page: 1 }],
    });
    const result = backfillCitations(G, dir, {});
    expect(result.backfilledNodes).toBe(0);
    // The true count is preserved (NOT downgraded to the trimmed inline length).
    expect(G.getNodeAttribute("hub", "citation_count")).toBe(500);
  });

  it("writes no sidecar when there is nothing to backfill", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("x", { label: "X" }); // no citations at all
    const result = backfillCitations(G, dir, {});
    expect(result.backfilledNodes).toBe(0);
    expect(result.sidecarPath).toBeNull();
    expect(existsSync(join(dir, "ontology", "citations.json"))).toBe(false);
  });
});

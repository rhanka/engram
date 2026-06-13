/**
 * Integration: the hook-rebuild path (`rebuildCode` with citationsReproject)
 * re-derives citations.json LLM-free WITHOUT clobbering a fuller existing
 * sidecar. Proves the wiring from rebuildCode → reprojectCitationsLLMFree.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rebuildCode } from "../src/watch.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-hook-cit-"));
  tempDirs.push(dir);
  // A code file so the AST rebuild proceeds (non-empty graph).
  writeFileSync(join(dir, "mod.ts"), "export function alpha() { return beta(); }\nfunction beta() { return 1; }\n", "utf-8");
  return dir;
}

describe("hook-rebuild citations re-projection", () => {
  it("preserves a fuller existing citations.json after an LLM-free rebuild", async () => {
    const dir = project();
    const stateDir = join(dir, ".graphify");
    mkdirSync(join(stateDir, "ontology"), { recursive: true });

    // Seed a graph.json carrying a HUB with a K-trimmed inline set + true count.
    const inline = Array.from({ length: 8 }, (_v, i) => ({ source_file: `w${i}.txt`, page: i }));
    writeFileSync(
      join(stateDir, "graph.json"),
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [{ id: "sherlock", label: "Sherlock", file_type: "document", source_file: "w0.txt", community: 0, citation_count: 214, citations: inline }],
        links: [],
      }),
      "utf-8",
    );

    // Seed a RICH citations.json (the full 214-citation tail).
    const full = Array.from({ length: 214 }, (_v, i) => ({ source_file: `w${i % 25}.txt`, page: i, section: `c${i % 7}` }));
    writeFileSync(
      join(stateDir, "ontology", "citations.json"),
      JSON.stringify({ schema: "graphify_ontology_citations_v1", graph_signature: "stale", nodes: { sherlock: { count: 214, citations: full } } }),
      "utf-8",
    );

    // Run the hook-rebuild path (LLM-free) with the reproject guard.
    const ok = await rebuildCode(dir, false, {
      describe: false,
      label: false,
      markDescribePending: true,
      citationsReproject: true,
      force: true,
    });
    expect(ok).toBe(true);

    // The fuller sidecar tail SURVIVES (the hub merged from the prior graph.json
    // is re-projected, but its 214-tail is not shrunk to the K-set).
    const sidecar = JSON.parse(readFileSync(join(stateDir, "ontology", "citations.json"), "utf-8")) as {
      nodes: Record<string, { count: number; citations: unknown[] }>;
    };
    expect(sidecar.nodes.sherlock.count).toBe(214);
    expect(sidecar.nodes.sherlock.citations).toHaveLength(214);
  });
});

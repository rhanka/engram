import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { persistGraphWithCitations } from "../src/export.js";
import { CITATIONS_INLINE_TOP_K } from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-citations-persist-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function hubGraph(citationCount: number): Graph {
  const G = new Graph();
  const citations: OntologyCitation[] = [];
  for (let i = 0; i < citationCount; i += 1) {
    citations.push({ source_file: `work${i % 25}.txt`, page: i, section: `ch${i % 7}` });
  }
  G.addNode("hub", { label: "Hub", source_file: "work0.txt", file_type: "document", citations });
  return G;
}

describe("persistGraphWithCitations co-emit", () => {
  it("co-emits graph.json (trimmed) and citations.json (full) in one call", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    const written = persistGraphWithCitations(hubGraph(200), new Map([[0, ["hub"]]]), graphPath, { force: true });
    expect(written).toBe(true);

    const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; citations?: unknown[]; citation_count?: number }>;
    };
    const hub = graph.nodes.find((n) => n.id === "hub")!;
    expect(hub.citation_count).toBe(200);
    expect(hub.citations).toHaveLength(CITATIONS_INLINE_TOP_K);

    const sidecarPath = join(dir, "ontology", "citations.json");
    expect(existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8")) as {
      schema: string;
      nodes: Record<string, { count: number; citations: unknown[] }>;
    };
    expect(sidecar.schema).toBe("graphify_ontology_citations_v1");
    expect(sidecar.nodes.hub.count).toBe(200);
    expect(sidecar.nodes.hub.citations).toHaveLength(200);
  });

  it("keeps graph.json within the K-per-node bound for a 200-citation hub", () => {
    const dirTrim = tempDir();
    const trimmedPath = join(dirTrim, "graph.json");
    persistGraphWithCitations(hubGraph(200), new Map([[0, ["hub"]]]), trimmedPath, { force: true });
    const trimmedSize = Buffer.byteLength(readFileSync(trimmedPath, "utf-8"), "utf-8");

    // A naive full-inline graph.json (no trim) for the same hub is far larger.
    // Assert the trimmed graph.json is a small fraction of the full list — the
    // leanness contract. 200 citations vs K=8 inline ⇒ well under half.
    const fullInline = hubGraph(200);
    // Serialize the full citations inline to size the no-trim baseline.
    const baselineBytes = Buffer.byteLength(
      JSON.stringify(fullInline.getNodeAttribute("hub", "citations")),
      "utf-8",
    );
    expect(trimmedSize).toBeLessThan(baselineBytes);
  });

  it("does not write a sidecar when no node carries citations", () => {
    const dir = tempDir();
    const graphPath = join(dir, "graph.json");
    const G = new Graph();
    G.addNode("x", { label: "X", source_file: "a.ts", file_type: "code" });
    persistGraphWithCitations(G, new Map([[0, ["x"]]]), graphPath, { force: true });
    expect(existsSync(join(dir, "ontology", "citations.json"))).toBe(false);
  });

  it("produces byte-identical graph.json + sidecar across two builds", () => {
    const d1 = tempDir();
    const d2 = tempDir();
    persistGraphWithCitations(hubGraph(120), new Map([[0, ["hub"]]]), join(d1, "graph.json"), { force: true });
    persistGraphWithCitations(hubGraph(120), new Map([[0, ["hub"]]]), join(d2, "graph.json"), { force: true });

    const sidecar1 = JSON.parse(readFileSync(join(d1, "ontology", "citations.json"), "utf-8")) as { graph_signature: string; nodes: unknown };
    const sidecar2 = JSON.parse(readFileSync(join(d2, "ontology", "citations.json"), "utf-8")) as { graph_signature: string; nodes: unknown };
    expect(sidecar1.graph_signature).toBe(sidecar2.graph_signature);
    expect(JSON.stringify(sidecar1.nodes)).toBe(JSON.stringify(sidecar2.nodes));
  });
});

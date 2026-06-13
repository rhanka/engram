import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import {
  buildNodeDescriptionPrompt,
  collectNodeContext,
  generateNodeDescriptions,
} from "../src/node-descriptions.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-citation-cap-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

function entityWith(nCitations: number): Graph {
  const G = new Graph({ type: "undirected" });
  const citations = [];
  for (let i = 0; i < nCitations; i += 1) {
    citations.push({ source_file: `work${i}.txt`, page: i + 1, section: `ch${i}` });
  }
  G.addNode("ent_hub", { label: "Hub", node_type: "Person", citations });
  // A neighbor so the node is well-formed.
  G.addNode("ent_other", { label: "Other", node_type: "Place" });
  G.addUndirectedEdge("ent_hub", "ent_other", { relation: "knows" });
  return G;
}

describe("collectNodeContext citation cap", () => {
  it("caps at 3 when citationCap=3", () => {
    const G = entityWith(20);
    const ctx = collectNodeContext(G, "ent_hub", { citationCap: 3 });
    expect(ctx.citations).toHaveLength(3);
  });

  it("caps at 10 when citationCap=10 (the resolved default for this pass)", () => {
    const G = entityWith(20);
    const ctx = collectNodeContext(G, "ent_hub", { citationCap: 10 });
    expect(ctx.citations).toHaveLength(10);
  });

  it("includes all citations when citationCap='all'", () => {
    const G = entityWith(20);
    const ctx = collectNodeContext(G, "ent_hub", { citationCap: "all" });
    expect(ctx.citations).toHaveLength(20);
  });

  it("defaults to the resolved cap (10) when unspecified", () => {
    const G = entityWith(20);
    const ctx = collectNodeContext(G, "ent_hub");
    expect(ctx.citations).toHaveLength(10);
  });
});

describe("citation cap flows to the no-key assistant instruction file", () => {
  function countCitationSnippets(prompt: string): number {
    const m = prompt.match(/citations=\[([^\]]*)\]/);
    if (!m || !m[1].trim()) return 0;
    // snippets are JSON-stringified strings joined by ", "
    return m[1].split(/",\s*"/).length;
  }

  it("emitted prompt honors a low cap (3)", async () => {
    const G = entityWith(20);
    const dir = tempDir();
    const result = await generateNodeDescriptions(G, {
      mode: "assistant",
      instructionDir: dir,
      quiet: true,
      citationCap: 3,
    });
    expect(result.source).toBe("assistant");
    const md = readdirSync(dir).find((f) => f.endsWith(".md"))!;
    const text = readFileSync(join(dir, md), "utf-8");
    expect(countCitationSnippets(text)).toBeLessThanOrEqual(3);
    expect(countCitationSnippets(text)).toBeGreaterThan(0);
  });

  it("emitted prompt honors a high cap (all)", async () => {
    const G = entityWith(20);
    const dir = tempDir();
    await generateNodeDescriptions(G, {
      mode: "assistant",
      instructionDir: dir,
      quiet: true,
      citationCap: "all",
    });
    const md = readdirSync(dir).find((f) => f.endsWith(".md"))!;
    const text = readFileSync(join(dir, md), "utf-8");
    expect(countCitationSnippets(text)).toBe(20);
  });

  it("default (unspecified) caps the emitted prompt at 10", async () => {
    const G = entityWith(20);
    const dir = tempDir();
    await generateNodeDescriptions(G, { mode: "assistant", instructionDir: dir, quiet: true });
    const md = readdirSync(dir).find((f) => f.endsWith(".md"))!;
    const text = readFileSync(join(dir, md), "utf-8");
    expect(countCitationSnippets(text)).toBe(10);
  });
});

describe("citation cap flows to the direct (API) path", () => {
  it("collectNodeContext cap governs the prompt the direct caller sends", async () => {
    const G = entityWith(20);
    let capturedPrompt = "";
    await generateNodeDescriptions(G, {
      provider: "anthropic",
      citationCap: 3,
      callLlm: async (prompt: string) => {
        capturedPrompt = prompt;
        return JSON.stringify({ ent_hub: "A hub." });
      },
      quiet: true,
    });
    const m = capturedPrompt.match(/citations=\[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const count = m![1].trim() ? m![1].split(/",\s*"/).length : 0;
    expect(count).toBeLessThanOrEqual(3);
    expect(count).toBeGreaterThan(0);
  });
});

describe("buildNodeDescriptionPrompt still works with explicit contexts", () => {
  it("renders the citations array verbatim from NodeContext", () => {
    const prompt = buildNodeDescriptionPrompt([
      {
        id: "x",
        label: "X",
        isCode: false,
        sourceFile: "a.txt",
        sourceLocation: null,
        nodeType: "Person",
        degree: 1,
        neighbors: ["Y"],
        citations: ["c1 (p.1)", "c2 (p.2)"],
      },
    ]);
    expect(prompt).toContain("c1 (p.1)");
    expect(prompt).toContain("c2 (p.2)");
  });
});

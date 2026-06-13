import { afterEach, describe, expect, it, vi } from "vitest";
import Graph from "graphology";

import {
  buildNodeDescriptionPrompt,
  describeNodes,
  detectDescriptionBackend,
  generateNodeDescriptions,
  type CallLlmFn,
} from "../src/node-descriptions.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

function clearProviderKeys(): void {
  for (const key of [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "MISTRAL_API_KEY",
    "COHERE_API_KEY",
  ]) {
    delete process.env[key];
  }
}

function mkCodeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  // CODE nodes: file_type === "code", function label has a () suffix.
  G.addNode("src_a_resolveconfig", {
    label: "resolveConfig()",
    file_type: "code",
    source_file: "src/a.ts",
    source_location: "L42",
  });
  G.addNode("src_a_buildgraph", {
    label: "buildGraph()",
    file_type: "code",
    source_file: "src/a.ts",
    source_location: "L60",
  });
  G.addNode("src_b_const", {
    label: "MAX_NODES",
    file_type: "code",
    source_file: "src/b.ts",
    source_location: "L3",
  });
  G.addUndirectedEdge("src_a_resolveconfig", "src_a_buildgraph", { relation: "calls" });
  G.addUndirectedEdge("src_a_buildgraph", "src_b_const", { relation: "references" });
  return G;
}

/** Mock backend: returns a one-sentence description per requested node id. */
function mockCallLlm(describe: (id: string) => string): CallLlmFn {
  return async (prompt: string) => {
    // Extract node ids from the prompt lines ("\"<id>\": ...").
    const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
    const map: Record<string, string> = {};
    for (const id of ids) map[id] = describe(id);
    return JSON.stringify(map);
  };
}

describe("node description prompt", () => {
  it("marks code symbols so the model describes what the function does", () => {
    const G = mkCodeGraph();
    const prompt = buildNodeDescriptionPrompt([
      {
        id: "src_a_resolveconfig",
        label: "resolveConfig()",
        isCode: true,
        sourceFile: "src/a.ts",
        sourceLocation: "L42",
        nodeType: null,
        degree: G.degree("src_a_resolveconfig"),
        neighbors: ["buildGraph()"],
      },
    ]);
    expect(prompt).toContain("code symbol");
    expect(prompt).toContain('"src_a_resolveconfig": "resolveConfig()"');
    expect(prompt).toContain("kind=code-symbol");
    expect(prompt).toContain("source=src/a.ts:L42");
    expect(prompt).toContain("neighbors=[buildGraph()]");
  });
});

describe("describeNodes (CODE nodes get descriptions)", () => {
  it("returns a one-sentence description for each code symbol", async () => {
    const G = mkCodeGraph();
    const result = await describeNodes(G, {
      provider: "anthropic",
      callLlm: mockCallLlm((id) => `Describes ${id}.`),
    });
    expect(result.get("src_a_resolveconfig")).toBe("Describes src_a_resolveconfig.");
    expect(result.get("src_a_buildgraph")).toBe("Describes src_a_buildgraph.");
    expect(result.get("src_b_const")).toBe("Describes src_b_const.");
  });

  it("batches the call so a large graph stays a bounded number of LLM calls", async () => {
    const G = new Graph({ type: "undirected" });
    for (let i = 0; i < 95; i += 1) {
      G.addNode(`n${i}`, { label: `fn${i}()`, file_type: "code" });
    }
    let calls = 0;
    await describeNodes(G, {
      provider: "anthropic",
      batchSize: 40,
      callLlm: async (prompt) => {
        calls += 1;
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `desc ${id}`])));
      },
    });
    // 95 nodes / 40 per batch = 3 calls.
    expect(calls).toBe(3);
  });
});

describe("generateNodeDescriptions (default-on entry point)", () => {
  it("stamps descriptions onto graph nodes so toJson persists them", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, {
      callLlm: mockCallLlm((id) => `One sentence about ${id}.`),
      quiet: true,
    });
    expect(result.describedCount).toBe(3);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe(
      "One sentence about src_a_resolveconfig.",
    );
    expect(G.getNodeAttribute("src_b_const", "description")).toBe(
      "One sentence about src_b_const.",
    );
  });

  it("only fills missing descriptions and stamps inline metadata", async () => {
    const G = mkCodeGraph();
    G.setNodeAttribute("src_a_resolveconfig", "description", "Existing human description.");

    const result = await generateNodeDescriptions(G, {
      onlyMissing: true,
      callLlm: mockCallLlm((id) => `Generated description for ${id}.`),
      quiet: true,
    });

    expect(result.describedCount).toBe(2);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe("Existing human description.");
    expect(G.getNodeAttribute("src_a_buildgraph", "description")).toBe(
      "Generated description for src_a_buildgraph.",
    );
    expect(G.getNodeAttribute("src_a_buildgraph", "description_status")).toBe("generated");
    expect(G.getNodeAttribute("src_a_buildgraph", "description_meta")).toMatchObject({
      source: "assistant",
      prompt_version: "node-description-v1",
    });
  });

  it("skips gracefully (no throw, no descriptions) when no backend is configured", async () => {
    clearProviderKeys();
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G);
    expect(result.source).toBe("skipped");
    expect(result.describedCount).toBe(0);
    expect(G.hasNodeAttribute("src_a_resolveconfig", "description")).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no LLM backend configured"));
  });

  it("never throws when the backend errors; degrades to skipped", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, {
      callLlm: async () => {
        throw new Error("boom");
      },
      quiet: true,
    });
    expect(result.source).toBe("skipped");
    expect(result.describedCount).toBe(0);
  });

  it("rejects an unknown explicit provider without throwing", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, { provider: "not-a-provider", quiet: true });
    expect(result.source).toBe("skipped");
    expect(result.describedCount).toBe(0);
  });
});

describe("detectDescriptionBackend", () => {
  it("returns the first provider whose env key is present", () => {
    clearProviderKeys();
    process.env.OPENAI_API_KEY = "sk-test";
    expect(detectDescriptionBackend()).toBe("openai");
  });

  it("returns null when no provider key is present", () => {
    clearProviderKeys();
    expect(detectDescriptionBackend()).toBeNull();
  });
});

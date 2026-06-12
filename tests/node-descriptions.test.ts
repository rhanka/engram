import { afterEach, describe, expect, it, vi } from "vitest";
import Graph from "graphology";

import {
  buildNodeDescriptionPrompt,
  collectNodeContext,
  describeNodes,
  detectDescriptionBackend,
  generateNodeDescriptions,
  isTransientBackendError,
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
        citations: [],
      },
    ]);
    expect(prompt).toContain("code symbol");
    expect(prompt).toContain('"src_a_resolveconfig": "resolveConfig()"');
    expect(prompt).toContain("kind=code-symbol");
    expect(prompt).toContain("source=src/a.ts:L42");
    expect(prompt).toContain("neighbors=[buildGraph()]");
  });

  it("uses an entity-aware prompt branch for non-code nodes", () => {
    const prompt = buildNodeDescriptionPrompt([
      {
        id: "ent_lady_carfax",
        label: "Lady Frances Carfax",
        isCode: false,
        sourceFile: null,
        sourceLocation: null,
        nodeType: "Person",
        degree: 3,
        neighbors: ["Lausanne", "Hôtel National"],
        citations: ["a wealthy spinster who travels the continent (p.1)"],
      },
    ]);
    // Entity guidance only appears when a non-code node is present.
    expect(prompt).toContain("entity");
    expect(prompt).toContain("citations/evidence");
    // The entity node carries its declared type, not the code-symbol marker.
    expect(prompt).toContain("kind=Person");
    expect(prompt).not.toContain("kind=code-symbol");
  });

  it("injects citations/evidence grounding into the entity prompt line", () => {
    const prompt = buildNodeDescriptionPrompt([
      {
        id: "ent_lady_carfax",
        label: "Lady Frances Carfax",
        isCode: false,
        sourceFile: null,
        sourceLocation: null,
        nodeType: "Person",
        degree: 2,
        neighbors: ["Lausanne"],
        citations: ["a wealthy spinster (p.1)", "src/story.md"],
      },
    ]);
    expect(prompt).toContain("citations=[");
    expect(prompt).toContain("a wealthy spinster (p.1)");
    expect(prompt).toContain("src/story.md");
  });

  it("omits entity guidance for an all-code batch", () => {
    const prompt = buildNodeDescriptionPrompt([
      {
        id: "src_a_resolveconfig",
        label: "resolveConfig()",
        isCode: true,
        sourceFile: "src/a.ts",
        sourceLocation: "L42",
        nodeType: null,
        degree: 1,
        neighbors: [],
        citations: [],
      },
    ]);
    expect(prompt).not.toContain("a person, place, event");
  });
});

describe("collectNodeContext (citation grounding)", () => {
  it("pulls citations and evidence_refs from entity node attributes", () => {
    const G = new Graph({ type: "undirected" });
    G.addNode("ent_carfax", {
      label: "Lady Frances Carfax",
      node_type: "Person",
      citations: [
        { source_file: "story.md", quote: "a wealthy spinster", page: 1 },
      ],
      evidence_refs: ["registry://characters/carfax"],
    });
    G.addNode("ent_lausanne", { label: "Lausanne", node_type: "Place" });
    G.addUndirectedEdge("ent_carfax", "ent_lausanne", { relation: "travels_to" });

    const prompt = buildNodeDescriptionPrompt([collectNodeContext(G, "ent_carfax")]);
    expect(prompt).toContain("kind=Person");
    expect(prompt).toContain("a wealthy spinster");
    expect(prompt).toContain("registry://characters/carfax");
  });

  it("leaves code nodes free of citation context", () => {
    const G = mkCodeGraph();
    const ctx = collectNodeContext(G, "src_a_resolveconfig");
    expect(ctx.isCode).toBe(true);
    expect(ctx.citations).toEqual([]);
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

  it("emits assistant instructions (no throw, no descriptions) when no backend is configured", async () => {
    clearProviderKeys();
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const G = mkCodeGraph();
    // Use a temp instructionDir so we don't pollute the working directory.
    const { mkdtempSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const instructionDir = mkdtempSync(pathJoin(tmpdir(), "graphify-desc-test-"));
    const result = await generateNodeDescriptions(G, { instructionDir, quiet: false });
    // New behavior: assistant mode — emits instructions, source="assistant", 0 descriptions.
    expect(result.source).toBe("assistant");
    expect(result.describedCount).toBe(0);
    expect(G.hasNodeAttribute("src_a_resolveconfig", "description")).toBe(false);
    // Verify instruction files were written.
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(instructionDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
    // Warning mentions assistant mode.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("assistant"));
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

  it("assistant mode: ingest picks up completed answer files on second run", async () => {
    clearProviderKeys();
    const { mkdtempSync, writeFileSync: writeFs } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const instructionDir = mkdtempSync(pathJoin(tmpdir(), "graphify-desc-ingest-"));

    const G = mkCodeGraph();
    // Write a pre-filled answer file simulating the assistant's response.
    writeFs(
      pathJoin(instructionDir, "batch-000.json"),
      JSON.stringify({
        src_a_resolveconfig: "Resolves the configuration for the code graph.",
        src_a_buildgraph: "Builds the code knowledge graph from extracted nodes.",
        src_b_const: "Maximum node count constant used by the graph builder.",
      }),
      "utf-8",
    );

    const result = await generateNodeDescriptions(G, { instructionDir, quiet: true });
    expect(result.source).toBe("assistant");
    expect(result.describedCount).toBe(3);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe(
      "Resolves the configuration for the code graph.",
    );
    expect(G.getNodeAttribute("src_a_buildgraph", "description")).toBe(
      "Builds the code knowledge graph from extracted nodes.",
    );
  });

  it("assistant mode: --description-mode direct with key uses LLM directly", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const callLlm = mockCallLlm((id) => `Direct description for ${id}.`);
    const result = await generateNodeDescriptions(G, {
      mode: "direct",
      callLlm,
      quiet: true,
    });
    expect(result.source).toBe("assistant"); // callLlm with no provider → assistant source fallback
    expect(result.describedCount).toBeGreaterThan(0);
  });

  it("no-key, --description-mode assistant: emits instructions even without instructionDir set", async () => {
    // When mode is explicitly "assistant" and no instructionDir, defaults to CWD-based path.
    // This just checks no exception is thrown (the dir may or may not be writable in CI).
    clearProviderKeys();
    const G = mkCodeGraph();
    const { mkdtempSync } = await import("node:fs");
    const { join: pathJoin } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const instructionDir = mkdtempSync(pathJoin(tmpdir(), "graphify-desc-explicit-"));
    const result = await generateNodeDescriptions(G, { mode: "assistant", instructionDir, quiet: true });
    expect(result.source).toBe("assistant");
    expect(result.describedCount).toBe(0);
  });

  it("no-key, --description-mode direct: reports skip (no key for direct mode)", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, { mode: "direct", quiet: true });
    expect(result.source).toBe("skipped");
    expect(result.describedCount).toBe(0);
  });
});

describe("isTransientBackendError", () => {
  it("matches HTTP 5xx, rate limits, 429, network resets and overload phrases", () => {
    for (const msg of [
      "Internal Server Error (status 500)",
      "503 service unavailable",
      "rate limit exceeded",
      "Too many requests: 429",
      "read ECONNRESET",
      "connect ETIMEDOUT 1.2.3.4:443",
      "getaddrinfo ENOTFOUND api.example.com",
      "getaddrinfo EAI_AGAIN api.example.com",
      "fetch failed",
      "the model is overloaded",
      "Service Unavailable",
    ]) {
      expect(isTransientBackendError(new Error(msg))).toBe(true);
    }
  });

  it("does not match deterministic/client errors", () => {
    for (const msg of [
      "invalid api key",
      "400 bad request",
      "model not found",
      "malformed JSON response",
      "unexpected token in JSON",
    ]) {
      expect(isTransientBackendError(new Error(msg))).toBe(false);
    }
  });

  it("inspects error.cause for the transient signal", () => {
    const err = new Error("request failed");
    (err as { cause?: unknown }).cause = new Error("ECONNRESET");
    expect(isTransientBackendError(err)).toBe(true);
  });
});

describe("describeNodes retry (transient backend errors)", () => {
  it("retries a transient failure then succeeds (bounded ≤ 3 attempts)", async () => {
    const G = mkCodeGraph();
    let calls = 0;
    const result = await describeNodes(G, {
      provider: "anthropic",
      callLlm: async (prompt) => {
        calls += 1;
        if (calls < 3) throw new Error("503 service unavailable");
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `desc ${id}`])));
      },
    });
    expect(calls).toBe(3);
    expect(result.get("src_a_resolveconfig")).toBe("desc src_a_resolveconfig");
  });

  it("gives up after MAX attempts on a persistent transient error", async () => {
    const G = mkCodeGraph();
    let calls = 0;
    await expect(
      describeNodes(G, {
        provider: "anthropic",
        callLlm: async () => {
          calls += 1;
          throw new Error("overloaded");
        },
      }),
    ).rejects.toThrow("overloaded");
    expect(calls).toBe(3);
  });

  it("does NOT retry a non-transient error", async () => {
    const G = mkCodeGraph();
    let calls = 0;
    await expect(
      describeNodes(G, {
        provider: "anthropic",
        callLlm: async () => {
          calls += 1;
          throw new Error("invalid api key");
        },
      }),
    ).rejects.toThrow("invalid api key");
    expect(calls).toBe(1);
  });
});

describe("generateNodeDescriptions coverage report", () => {
  it("returns a coverage report counting describable/described and reasons", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, {
      callLlm: mockCallLlm((id) => `One sentence about ${id}.`),
      quiet: true,
    });
    expect(result.coverage).toEqual({
      describable: 3,
      described: 3,
      skipped: 0,
      reasons: { noBackend: 0, emptyReply: 0, error: 0, optedOut: 0 },
    });
  });

  it("counts noBackend reason and never silently ships 0/N", async () => {
    clearProviderKeys();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G);
    expect(result.coverage.describable).toBe(3);
    expect(result.coverage.described).toBe(0);
    expect(result.coverage.skipped).toBe(3);
    expect(result.coverage.reasons.noBackend).toBe(3);
  });

  it("emits a LOUD low-coverage warning when a backend ran but covered < 50%", async () => {
    const G = mkCodeGraph(); // 3 describable code nodes
    const warn = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    // Only describe one of the three -> 1/3 < 50% -> loud warning.
    await generateNodeDescriptions(G, {
      callLlm: async (prompt) => {
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        const first = ids[0]!;
        return JSON.stringify({ [first]: "only this one" });
      },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("WARNING low coverage"));
  });

  it("counts emptyReply when the backend returns nothing usable", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, {
      callLlm: async () => "{}",
      quiet: true,
    });
    expect(result.coverage.described).toBe(0);
    expect(result.coverage.reasons.emptyReply).toBe(3);
  });

  it("counts error reason when the backend throws non-transiently", async () => {
    const G = mkCodeGraph();
    const result = await generateNodeDescriptions(G, {
      callLlm: async () => {
        throw new Error("boom");
      },
      quiet: true,
    });
    expect(result.coverage.reasons.error).toBe(3);
  });
});

describe("generateNodeDescriptions --fill-missing (onlyMissing)", () => {
  it("only describes nodes whose description is empty/absent", async () => {
    const G = mkCodeGraph();
    // Pre-seed one node with an existing description.
    G.setNodeAttribute("src_a_resolveconfig", "description", "pre-existing");
    const described: string[] = [];
    const result = await generateNodeDescriptions(G, {
      onlyMissing: true,
      quiet: true,
      callLlm: async (prompt) => {
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        described.push(...ids);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `desc ${id}`])));
      },
    });
    // The pre-described node was not sent to the backend.
    expect(described).not.toContain("src_a_resolveconfig");
    expect(described).toContain("src_a_buildgraph");
    expect(described).toContain("src_b_const");
    // Existing description preserved; the other two filled.
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe("pre-existing");
    expect(result.describedCount).toBe(2);
  });

  it("is a no-op when every node already has a description", async () => {
    const G = mkCodeGraph();
    for (const id of G.nodes()) G.setNodeAttribute(id, "description", "already there");
    let calls = 0;
    const result = await generateNodeDescriptions(G, {
      onlyMissing: true,
      quiet: true,
      callLlm: async () => {
        calls += 1;
        return "{}";
      },
    });
    expect(calls).toBe(0);
    expect(result.describedCount).toBe(0);
    expect(result.coverage.described).toBe(3);
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

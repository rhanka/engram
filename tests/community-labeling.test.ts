/**
 * Tests for src/community-labeling.ts (upstream c8b329d port).
 *
 * All tests use an injectable `callLlm` mock — no network calls.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Graph from "graphology";

import {
  applySalientCommunityLabels,
  buildLabelingPromptLines,
  detectLabelingBackend,
  generateCommunityLabels,
  labelCommunities,
  parseLabelResponse,
  type CallLlmFn,
} from "../src/community-labeling.js";
import type { GodNodeEntry } from "../src/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkGraph(): Graph {
  const G = new Graph({ type: "undirected" });
  G.addNode("auth_login", { label: "AuthLogin" });
  G.addNode("auth_logout", { label: "AuthLogout" });
  G.addNode("auth_session", { label: "AuthSession" });
  G.addNode("order_create", { label: "OrderCreate" });
  G.addNode("order_cancel", { label: "OrderCancel" });
  G.addNode("payment_charge", { label: "PaymentCharge" });
  G.addUndirectedEdge("auth_login", "auth_logout");
  G.addUndirectedEdge("auth_login", "auth_session");
  G.addUndirectedEdge("order_create", "order_cancel");
  G.addUndirectedEdge("order_create", "payment_charge");
  return G;
}

const communities: Map<number, string[]> = new Map([
  [0, ["auth_login", "auth_logout", "auth_session"]],
  [1, ["order_create", "order_cancel", "payment_charge"]],
]);

const gods: GodNodeEntry[] = [
  { id: "auth_login", label: "AuthLogin", edges: 2, degree: 2 },
  { id: "order_create", label: "OrderCreate", edges: 2, degree: 2 },
];

function happyPathLlm(expected0: string, expected1: string): CallLlmFn {
  return async (_prompt, _maxTokens) =>
    JSON.stringify({ "0": expected0, "1": expected1 });
}

// ---------------------------------------------------------------------------
// parseLabelResponse
// ---------------------------------------------------------------------------

describe("parseLabelResponse", () => {
  it("parses a clean JSON object", () => {
    const result = parseLabelResponse('{"0": "Auth Layer", "1": "Order Flow"}', [0, 1]);
    expect(result.get(0)).toBe("Auth Layer");
    expect(result.get(1)).toBe("Order Flow");
  });

  it("strips markdown fences", () => {
    const result = parseLabelResponse("```json\n{\"0\": \"Auth Layer\"}\n```", [0]);
    expect(result.get(0)).toBe("Auth Layer");
  });

  it("extracts JSON from prose wrapper", () => {
    const result = parseLabelResponse(
      'Here are the names:\n{"0": "Auth Layer", "1": "Order Flow"}',
      [0, 1],
    );
    expect(result.get(0)).toBe("Auth Layer");
    expect(result.get(1)).toBe("Order Flow");
  });

  it("ignores cids not requested", () => {
    const result = parseLabelResponse('{"0": "Auth Layer", "99": "Unknown"}', [0]);
    expect(result.get(0)).toBe("Auth Layer");
    expect(result.has(99)).toBe(false);
  });

  it("throws on non-JSON", () => {
    expect(() => parseLabelResponse("not json at all", [0])).toThrow();
  });

  it("throws when top-level is not an object", () => {
    expect(() => parseLabelResponse("[1, 2, 3]", [0])).toThrow("JSON object");
  });

  it("ignores empty or whitespace-only names", () => {
    const result = parseLabelResponse('{"0": "  ", "1": "Order Flow"}', [0, 1]);
    expect(result.has(0)).toBe(false);
    expect(result.get(1)).toBe("Order Flow");
  });
});

// ---------------------------------------------------------------------------
// buildLabelingPromptLines
// ---------------------------------------------------------------------------

describe("buildLabelingPromptLines", () => {
  it("produces one line per non-empty community", () => {
    const G = mkGraph();
    const { lines, labeledCids } = buildLabelingPromptLines(G, communities, gods);
    expect(lines).toHaveLength(2);
    expect(labeledCids).toEqual(expect.arrayContaining([0, 1]));
  });

  it("puts god nodes first in each line", () => {
    const G = mkGraph();
    const { lines } = buildLabelingPromptLines(G, communities, gods);
    const authLine = lines.find((l) => l.startsWith("Community 0:"))!;
    expect(authLine).toBeTruthy();
    // AuthLogin is the god node for community 0 — must appear first
    const afterColon = authLine.split(": ")[1]!;
    expect(afterColon.split(", ")[0]).toBe("AuthLogin");
  });

  it("orders communities largest-first", () => {
    const largeComm: Map<number, string[]> = new Map([
      [0, ["a"]],
      [1, ["b", "c", "d"]],
    ]);
    const G = new Graph({ type: "undirected" });
    G.addNode("a", { label: "A" });
    G.addNode("b", { label: "B" });
    G.addNode("c", { label: "C" });
    G.addNode("d", { label: "D" });
    const { lines } = buildLabelingPromptLines(G, largeComm, []);
    // Community 1 has 3 members — should appear first
    expect(lines[0]).toMatch(/^Community 1:/);
  });

  it("skips empty communities", () => {
    const comm: Map<number, string[]> = new Map([
      [0, []],
      [1, ["order_create"]],
    ]);
    const G = mkGraph();
    const { lines, labeledCids } = buildLabelingPromptLines(G, comm, []);
    expect(lines).toHaveLength(1);
    expect(labeledCids).toEqual([1]);
  });

  it("respects maxCommunities cap", () => {
    const comm: Map<number, string[]> = new Map([
      [0, ["auth_login", "auth_logout", "auth_session"]],
      [1, ["order_create", "order_cancel"]],
    ]);
    const G = mkGraph();
    const { lines } = buildLabelingPromptLines(G, comm, [], 1);
    expect(lines).toHaveLength(1);
  });

  it("respects topK cap", () => {
    const G = new Graph({ type: "undirected" });
    const members: string[] = [];
    for (let i = 0; i < 20; i++) {
      G.addNode(`n${i}`, { label: `Node${i}` });
      members.push(`n${i}`);
    }
    const comm: Map<number, string[]> = new Map([[0, members]]);
    const { lines } = buildLabelingPromptLines(G, comm, [], 200, 3);
    const afterColon = lines[0]!.split(": ")[1]!;
    expect(afterColon.split(", ")).toHaveLength(3);
  });

  it("returns empty lines and cids for a graph with no communities", () => {
    const G = new Graph({ type: "undirected" });
    const { lines, labeledCids } = buildLabelingPromptLines(G, new Map(), []);
    expect(lines).toHaveLength(0);
    expect(labeledCids).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectLabelingBackend
// ---------------------------------------------------------------------------

describe("detectLabelingBackend", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Clear all known credential env vars before each test.
    for (const key of [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "MISTRAL_API_KEY",
      "COHERE_API_KEY",
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns null when no API key is set", () => {
    expect(detectLabelingBackend()).toBeNull();
  });

  it("detects anthropic when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
    expect(detectLabelingBackend()).toBe("anthropic");
  });

  it("detects gemini via GEMINI_API_KEY", () => {
    process.env.GEMINI_API_KEY = "AIza-test";
    expect(detectLabelingBackend()).toBe("gemini");
  });
});

// ---------------------------------------------------------------------------
// labelCommunities (with mocked callLlm)
// ---------------------------------------------------------------------------

describe("labelCommunities", () => {
  it("happy path: returns LLM labels for all communities", async () => {
    const G = mkGraph();
    const callLlm = happyPathLlm("Auth Services", "Order Management");
    const labels = await labelCommunities(G, communities, {
      provider: "anthropic",
      gods,
      callLlm,
    });
    expect(labels.get(0)).toBe("Auth Services");
    expect(labels.get(1)).toBe("Order Management");
  });

  it("fills missing cids with placeholders", async () => {
    const G = mkGraph();
    // LLM only names community 0
    const callLlm: CallLlmFn = async () => JSON.stringify({ "0": "Auth Services" });
    const labels = await labelCommunities(G, communities, {
      provider: "anthropic",
      gods,
      callLlm,
    });
    expect(labels.get(0)).toBe("Auth Services");
    expect(labels.get(1)).toBe("Community 1"); // placeholder
  });

  it("throws when callLlm throws (caller must handle)", async () => {
    const G = mkGraph();
    const callLlm: CallLlmFn = async () => {
      throw new Error("API timeout");
    };
    await expect(
      labelCommunities(G, communities, { provider: "openai", callLlm }),
    ).rejects.toThrow("API timeout");
  });

  it("throws when LLM returns malformed JSON", async () => {
    const G = mkGraph();
    const callLlm: CallLlmFn = async () => "not valid json";
    await expect(
      labelCommunities(G, communities, { provider: "openai", callLlm }),
    ).rejects.toThrow();
  });

  it("returns only placeholders when communities is empty", async () => {
    const G = new Graph({ type: "undirected" });
    const callLlm: CallLlmFn = async () => {
      throw new Error("should not be called");
    };
    const labels = await labelCommunities(G, new Map(), {
      provider: "anthropic",
      callLlm,
    });
    expect(labels.size).toBe(0);
  });

  it("god_nodes dict shape: works when gods have id+label+edges (no degree)", async () => {
    const G = mkGraph();
    const godsAlt: GodNodeEntry[] = [
      { id: "auth_login", label: "AuthLogin", edges: 5 },
    ];
    const callLlm = happyPathLlm("Auth Layer", "Orders");
    const labels = await labelCommunities(G, communities, {
      provider: "anthropic",
      gods: godsAlt,
      callLlm,
    });
    expect(labels.get(0)).toBe("Auth Layer");
  });
});

// ---------------------------------------------------------------------------
// generateCommunityLabels (public entry point — graceful degradation)
// ---------------------------------------------------------------------------

describe("generateCommunityLabels", () => {
  it("no-backend: returns placeholders + source='placeholder'", async () => {
    const G = mkGraph();
    const result = await generateCommunityLabels(G, communities, {
      provider: null,
      quiet: true,
    });
    expect(result.source).toBe("placeholder");
    expect(result.labels.get(0)).toBe("Community 0");
    expect(result.labels.get(1)).toBe("Community 1");
  });

  it("unknown provider: returns placeholders + source='placeholder'", async () => {
    const G = mkGraph();
    const result = await generateCommunityLabels(G, communities, {
      provider: "unknown-provider",
      quiet: true,
    });
    expect(result.source).toBe("placeholder");
  });

  it("happy path: returns LLM labels + source='llm'", async () => {
    const G = mkGraph();
    const callLlm = happyPathLlm("Auth Services", "Order Flow");
    const result = await generateCommunityLabels(G, communities, {
      provider: "anthropic",
      gods,
      callLlm,
    });
    expect(result.source).toBe("llm");
    expect(result.labels.get(0)).toBe("Auth Services");
    expect(result.labels.get(1)).toBe("Order Flow");
  });

  it("API error: degrades to placeholders + source='placeholder'", async () => {
    const G = mkGraph();
    const callLlm: CallLlmFn = async () => {
      throw new Error("network error");
    };
    const result = await generateCommunityLabels(G, communities, {
      provider: "openai",
      callLlm,
      quiet: true,
    });
    expect(result.source).toBe("placeholder");
    expect(result.labels.get(0)).toBe("Community 0");
  });

  it("malformed reply: degrades to placeholders + source='placeholder'", async () => {
    const G = mkGraph();
    const callLlm: CallLlmFn = async () => "this is not JSON";
    const result = await generateCommunityLabels(G, communities, {
      provider: "gemini",
      callLlm,
      quiet: true,
    });
    expect(result.source).toBe("placeholder");
  });

  it("does not call LLM when provider is null (no network call)", async () => {
    const G = mkGraph();
    let called = false;
    const callLlm: CallLlmFn = async () => {
      called = true;
      return "{}";
    };
    await generateCommunityLabels(G, communities, {
      provider: null,
      callLlm,
      quiet: true,
    });
    expect(called).toBe(false);
  });

  it("fenced JSON reply: parses correctly", async () => {
    const G = mkGraph();
    const callLlm: CallLlmFn = async () =>
      "```json\n{\"0\": \"Auth Services\", \"1\": \"Order Management\"}\n```";
    const result = await generateCommunityLabels(G, communities, {
      provider: "mistral",
      callLlm,
      quiet: true,
    });
    expect(result.source).toBe("llm");
    expect(result.labels.get(0)).toBe("Auth Services");
  });

  it("partial reply: names some, placeholders for rest", async () => {
    const G = mkGraph();
    // LLM only names community 1
    const callLlm: CallLlmFn = async () => JSON.stringify({ "1": "Order Management" });
    const result = await generateCommunityLabels(G, communities, {
      provider: "anthropic",
      callLlm,
      quiet: true,
    });
    expect(result.source).toBe("llm");
    expect(result.labels.get(0)).toBe("Community 0"); // placeholder
    expect(result.labels.get(1)).toBe("Order Management");
  });
});

// ---------------------------------------------------------------------------
// applySalientCommunityLabels (shared update/label helper)
// ---------------------------------------------------------------------------

describe("applySalientCommunityLabels", () => {
  it("replaces generic placeholders with salient LLM names", async () => {
    const G = mkGraph();
    const labels = new Map<number, string>([
      [0, "Community 0"],
      [1, "Community 1"],
    ]);
    const { source } = await applySalientCommunityLabels(G, communities, labels, {
      provider: "anthropic",
      gods,
      callLlm: happyPathLlm("Auth Services", "Order Management"),
      quiet: true,
    });
    expect(source).toBe("llm");
    expect(labels.get(0)).toBe("Auth Services");
    expect(labels.get(1)).toBe("Order Management");
  });

  it("preserves a user-curated label and only fills generic ones", async () => {
    const G = mkGraph();
    const labels = new Map<number, string>([
      [0, "My Curated Auth Name"], // not generic -> must survive
      [1, "Community 1"], // generic -> replaced
    ]);
    await applySalientCommunityLabels(G, communities, labels, {
      provider: "anthropic",
      gods,
      callLlm: happyPathLlm("Auth Services", "Order Management"),
      quiet: true,
    });
    expect(labels.get(0)).toBe("My Curated Auth Name");
    expect(labels.get(1)).toBe("Order Management");
  });

  it("leaves labels unchanged and reports placeholder when no backend", async () => {
    const G = mkGraph();
    const labels = new Map<number, string>([
      [0, "Community 0"],
      [1, "Community 1"],
    ]);
    const { source } = await applySalientCommunityLabels(G, communities, labels, {
      provider: "not-a-provider",
      quiet: true,
    });
    expect(source).toBe("placeholder");
    expect(labels.get(0)).toBe("Community 0");
    expect(labels.get(1)).toBe("Community 1");
  });
});

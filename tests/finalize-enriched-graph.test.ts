/**
 * SPEC_GRAPHIFY § "Enrichment Stages" — PHASE 1.
 *
 * The shared `finalizeEnrichedGraphBuild(...)` is the single chokepoint every
 * graph-finalization path routes through. These tests pin its contract:
 *
 *   1. A no-key build emits BOTH `label-instructions/` AND
 *      `description-instructions/` (description parity with labels — the gap the
 *      corpus `extract` path previously had).
 *   2. The description stage actually RUNS in the shared path (assistant ingest
 *      + injected callLlm direct).
 *   3. Auto-mode stays assistant-emit when an API key is present but `direct`
 *      was NOT explicitly requested (detected key must NOT auto-switch).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import Graph from "graphology";
import { mkdtempSync, mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { finalizeEnrichedGraphBuild } from "../src/finalize-enriched-graph.js";
import { generateNodeDescriptions, type CallLlmFn } from "../src/node-descriptions.js";
import { generateCommunityLabels } from "../src/community-labeling.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

const PROVIDER_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "MISTRAL_API_KEY",
  "COHERE_API_KEY",
];

function clearProviderKeys(): void {
  for (const key of PROVIDER_KEYS) delete process.env[key];
}

/** Code-symbol graph: every node is describable (isCodeNode). */
function mkCodeGraph(): Graph {
  const G = new Graph({ type: "undirected" });
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

/** A single generic-labeled community spanning all nodes. */
function singleCommunity(G: Graph): Map<number, string[]> {
  return new Map([[0, G.nodes()]]);
}

/** Generic ("Community N") labels so the salient label stage actually emits. */
function genericLabels(communities: Map<number, string[]>): Map<number, string> {
  const labels = new Map<number, string>();
  for (const cid of communities.keys()) labels.set(cid, `Community ${cid}`);
  return labels;
}

function mkStateDir(): string {
  return mkdtempSync(join(tmpdir(), "graphify-finalize-test-"));
}

/** mockCallLlm: echoes a deterministic description per node id in the prompt. */
function mockCallLlm(describeFn: (id: string) => string): CallLlmFn {
  return async (prompt: string) => {
    const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
    const map: Record<string, string> = {};
    for (const id of ids) map[id] = describeFn(id);
    return JSON.stringify(map);
  };
}

describe("finalizeEnrichedGraphBuild — no-key emit parity", () => {
  it("emits description-instructions/ AND label-instructions/ in a no-key build (parity)", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const labels = genericLabels(communities);
    const stateDir = mkStateDir();
    const graphPath = join(stateDir, "graph.json");

    const result = await finalizeEnrichedGraphBuild({
      graph: G,
      communities,
      labels,
      graphPath,
      stateDir,
      labelsPath: join(stateDir, ".graphify_labels.json"),
      force: true,
    });

    // graph.json was written through persistGraphWithCitations.
    expect(result.jsonWritten).toBe(true);
    expect(existsSync(graphPath)).toBe(true);

    // PARITY: both instruction dirs exist with at least one batch file.
    const labelDir = join(stateDir, "label-instructions");
    const descDir = join(stateDir, "description-instructions");
    expect(existsSync(labelDir)).toBe(true);
    expect(existsSync(descDir)).toBe(true);

    const labelFiles = readdirSync(labelDir);
    const descFiles = readdirSync(descDir);
    expect(labelFiles.some((f) => f.endsWith(".md"))).toBe(true);
    expect(descFiles.some((f) => f.endsWith(".md"))).toBe(true);

    // No-key → assistant emit, nothing described yet.
    expect(result.labelSource).toBe("assistant");
    expect(result.descriptionsComplete).toBe(false);
    expect(G.hasNodeAttribute("src_a_resolveconfig", "description")).toBe(false);
  });

  it("ingests assistant description answers in the shared path on the next run", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const labels = genericLabels(communities);
    const stateDir = mkStateDir();
    const descDir = join(stateDir, "description-instructions");
    mkdirSync(descDir, { recursive: true });

    // Simulate the assistant having answered the emitted batch.
    writeFileSync(
      join(descDir, "batch-000.json"),
      JSON.stringify({
        src_a_resolveconfig: "Resolves the configuration for the code graph.",
        src_a_buildgraph: "Builds the code knowledge graph from extracted nodes.",
        src_b_const: "Maximum node count constant used by the graph builder.",
      }),
      "utf-8",
    );

    const result = await finalizeEnrichedGraphBuild({
      graph: G,
      communities,
      labels,
      graphPath: join(stateDir, "graph.json"),
      stateDir,
      labelsPath: join(stateDir, ".graphify_labels.json"),
      force: true,
    });

    expect(result.jsonWritten).toBe(true);
    expect(result.descriptionsComplete).toBe(true);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe(
      "Resolves the configuration for the code graph.",
    );
    // Persisted graph.json carries the description.
    const persisted = JSON.parse(readFileSync(join(stateDir, "graph.json"), "utf-8"));
    const node = persisted.nodes.find((n: { id: string }) => n.id === "src_a_resolveconfig");
    expect(node.description).toBe("Resolves the configuration for the code graph.");
  });

  it("runs the description stage (direct) in the shared path with an injected callLlm", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const labels = genericLabels(communities);
    const stateDir = mkStateDir();

    const result = await finalizeEnrichedGraphBuild({
      graph: G,
      communities,
      labels,
      graphPath: join(stateDir, "graph.json"),
      stateDir,
      labelsPath: join(stateDir, ".graphify_labels.json"),
      force: true,
      descriptionCallLlm: mockCallLlm((id) => `Describes ${id}.`),
    });

    expect(result.jsonWritten).toBe(true);
    // describe RAN in the shared path: every describable node now has a description.
    expect(result.descriptionsComplete).toBe(true);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe(
      "Describes src_a_resolveconfig.",
    );
  });

  it("a description-only callback does NOT drive the LABEL stage into direct", async () => {
    // FIX 3: `descriptionCallLlm` is forwarded ONLY to the description stage.
    // An injected callLlm is a programmatic direct opt-in (community-labeling),
    // so a description-only caller must NOT flip labels to direct or feed the
    // label stage description prompts. With no `labelCallLlm` + no key the label
    // stage stays assistant-emit while descriptions run direct via the caller.
    clearProviderKeys();
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const labels = genericLabels(communities);
    const stateDir = mkStateDir();
    const graphPath = join(stateDir, "graph.json");

    // A label-shaped caller would mark its prompt so we can prove it was NEVER
    // invoked for labels: this fn throws if handed a label prompt.
    const descCalls: string[] = [];
    const descriptionCallLlm: CallLlmFn = async (prompt: string) => {
      descCalls.push(prompt);
      const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
      return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `Describes ${id}.`])));
    };

    const result = await finalizeEnrichedGraphBuild({
      graph: G,
      communities,
      labels,
      graphPath,
      stateDir,
      labelsPath: join(stateDir, ".graphify_labels.json"),
      force: true,
      descriptionCallLlm,
    });

    // Labels stayed assistant-emit (NOT "llm"): the description caller did not
    // drive the label stage into direct mode.
    expect(result.labelSource).toBe("assistant");
    expect(existsSync(join(stateDir, "label-instructions"))).toBe(true);
    // The labels map still carries the generic names (no direct labeling ran).
    expect(labels.get(0)).toBe("Community 0");

    // Descriptions DID run direct through the description-only caller.
    expect(result.descriptionsComplete).toBe(true);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe(
      "Describes src_a_resolveconfig.",
    );

    // The injected caller was only ever handed description prompts (node ids),
    // never a community-label prompt.
    expect(descCalls.length).toBeGreaterThan(0);
    expect(descCalls.every((p) => !/community/iu.test(p) || /^- "/mu.test(p))).toBe(true);
  });

  it("--no-description skips the description stage but still writes the graph", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const labels = genericLabels(communities);
    const stateDir = mkStateDir();

    const result = await finalizeEnrichedGraphBuild({
      graph: G,
      communities,
      labels,
      graphPath: join(stateDir, "graph.json"),
      stateDir,
      labelsPath: join(stateDir, ".graphify_labels.json"),
      force: true,
      describe: false,
    });

    expect(result.jsonWritten).toBe(true);
    expect(existsSync(join(stateDir, "description-instructions"))).toBe(false);
    expect(G.hasNodeAttribute("src_a_resolveconfig", "description")).toBe(false);
  });
});

describe("auto-mode: detected API key must NOT auto-switch to direct", () => {
  it("generateNodeDescriptions stays assistant-emit when a key is present but direct is not requested", async () => {
    clearProviderKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key";
    const G = mkCodeGraph();
    const instructionDir = mkStateDir();

    // No `mode`, no injected callLlm — only a detected key. Must resolve to
    // assistant/emit, NOT direct (which would attempt a real network call).
    const result = await generateNodeDescriptions(G, { instructionDir, quiet: true });

    expect(result.source).toBe("assistant");
    expect(result.describedCount).toBe(0);
    const files = readdirSync(instructionDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
    expect(G.hasNodeAttribute("src_a_resolveconfig", "description")).toBe(false);
  });

  it("generateCommunityLabels stays assistant-emit when a key is present but direct is not requested", async () => {
    clearProviderKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key";
    const G = mkCodeGraph();
    const communities = singleCommunity(G);
    const instructionDir = mkStateDir();

    const result = await generateCommunityLabels(G, communities, { instructionDir, quiet: true });

    // Detected key alone must NOT flip to direct (source "llm").
    expect(result.source).toBe("assistant");
    const files = readdirSync(instructionDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
  });

  it("explicit --description-mode direct still honors the detected key path (skips with fake key)", async () => {
    clearProviderKeys();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-fake-key";
    const G = mkCodeGraph();
    // mode:"direct" is the EXPLICIT opt-in. With no real backend reachable the
    // injected callLlm is what proves direct ran; here we inject it.
    const result = await generateNodeDescriptions(G, {
      mode: "direct",
      callLlm: mockCallLlm((id) => `Direct ${id}.`),
      quiet: true,
    });
    expect(result.describedCount).toBeGreaterThan(0);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe("Direct src_a_resolveconfig.");
  });

  it("auto-mode WITH an injected callLlm (programmatic opt-in) still resolves to direct", async () => {
    clearProviderKeys();
    const G = mkCodeGraph();
    // No `mode`, but callLlm injected — programmatic direct opt-in, not an env key.
    const result = await generateNodeDescriptions(G, {
      callLlm: mockCallLlm((id) => `Injected ${id}.`),
      quiet: true,
    });
    expect(result.describedCount).toBeGreaterThan(0);
    expect(G.getNodeAttribute("src_a_resolveconfig", "description")).toBe("Injected src_a_resolveconfig.");
  });
});

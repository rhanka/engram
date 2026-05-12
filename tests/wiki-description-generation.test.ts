import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";

import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  buildWikiDescriptionCacheKey,
} from "../src/wiki-descriptions.js";
import {
  buildWikiDescriptionPrompt,
  collectWikiDescriptionTargets,
  generateWikiDescriptionSidecars,
  type GenerateWikiDescriptionSidecarsClients,
} from "../src/wiki-description-generation.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-wiki-description-generation-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
    if (existsSync(`${dir}.json`)) {
      rmSync(`${dir}.json`, { force: true });
    }
  }
});

function mkGraph(): Graph {
  const graph = new Graph({ type: "undirected" });
  graph.addNode("alpha", { label: "AlphaService", source_file: "src/alpha.ts", node_type: "service", community: 0 });
  graph.addNode("beta", { label: "BetaRepository", source_file: "src/beta.ts", node_type: "service", community: 0 });
  graph.addNode("gamma", { label: "GammaEngine", source_file: "src/gamma.ts", node_type: "service", community: 1 });
  graph.addNode("delta", { label: "DeltaTask", source_file: "src/delta.ts", node_type: "service", community: 1 });

  graph.addUndirectedEdge("alpha", "beta", { relation: "uses" });
  graph.addUndirectedEdge("alpha", "gamma", { relation: "calls" });
  graph.addUndirectedEdge("alpha", "delta", { relation: "calls" });
  graph.addUndirectedEdge("beta", "gamma", { relation: "invokes" });

  return graph;
}

function assistantClient(tmpDir: string): GenerateWikiDescriptionSidecarsClients {
  return {
    assistant: {
      mode: "assistant",
      provider: "assistant",
      async generateJson(input) {
        if (input.outputPath) {
          writeFileSync(input.outputPath, "{}\n", "utf-8");
        }
        return {
          status: "instructions_written",
          provider: "assistant",
          mode: "assistant",
          outputPath: input.outputPath,
          instructionPath: join(dirname(tmpDir), "instructions", "wiki-description.txt"),
          audit: {},
        };
      },
    },
  };
}

function completedClient(): GenerateWikiDescriptionSidecarsClients {
  return {
    direct: {
      mode: "direct",
      provider: "openai",
      model: "mock-model",
      async generateJson(input) {
        if (input.outputPath) {
          writeFileSync(input.outputPath, JSON.stringify({
            status: "generated",
            description: "AlphaService coordinates repository and engine interactions.",
            evidence_refs: ["src/alpha.ts"],
            confidence: 0.82,
          }), "utf-8");
        }
        return {
          status: "completed",
          provider: "openai",
          mode: "direct",
          model: "mock-model",
          outputPath: input.outputPath,
          audit: {},
        };
      },
    },
  };
}

describe("wiki description target collection", () => {
  it("collects deterministic node and community targets from graph context", () => {
    const graph = mkGraph();
    const communities = new Map<number, string[]>([
      [0, ["alpha", "beta"]],
      [1, ["gamma", "delta"]],
    ]);

    const targets = collectWikiDescriptionTargets(graph, {
      communities,
      includeNodeTargets: true,
      includeCommunityTargets: true,
      maxNodeTargets: 2,
      maxCommunityTargets: 2,
      maxNodeNeighbors: 3,
    });

    expect(targets.nodes.map((target) => target.target_id)).toEqual(["alpha", "beta"]);
    expect(targets.nodes[0].neighbors).toHaveLength(3);
    expect(targets.communities.map((target) => target.target_id)).toEqual(["community:0", "community:1"]);
    expect(targets.communities[0].source_refs).toEqual(["src/alpha.ts", "src/beta.ts"]);
  });
});

describe("wiki description prompt generation", () => {
  it("builds deterministic, context-rich prompts for nodes", () => {
    const graph = mkGraph();
    const [nodeTarget] = collectWikiDescriptionTargets(graph, { maxNodeTargets: 1, maxNodeNeighbors: 3 }).nodes;
    const prompt = buildWikiDescriptionPrompt(nodeTarget, { graphHash: "graph-hash", maxNeighbors: 4 });

    expect(prompt).toContain(`graph_hash: graph-hash`);
    expect(prompt).toContain(`prompt_version: ${WIKI_DESCRIPTION_PROMPT_VERSION}`);
    expect(prompt).toContain("target_id: alpha");
    expect(prompt).toContain("label: AlphaService");
    expect(prompt).toContain("[calls] DeltaTask");
    expect(prompt).toContain("[calls] GammaEngine");
    expect(prompt).toContain("[uses] BetaRepository");
    expect(prompt.indexOf("[calls]") < prompt.indexOf("[uses]"));
    expect(prompt).toContain("Return JSON fields that Graphify will wrap into graphify_wiki_description_v1");
  });
});

describe("assistant-mode generation behavior", () => {
  it("writes instructions and never pretends generated descriptions were produced", async () => {
    const graph = mkGraph();
    const outputDir = makeTempDir();
    const result = await generateWikiDescriptionSidecars(graph, {
      graphHash: "graph-hash",
      mode: "assistant",
      clients: assistantClient(outputDir),
      includeCommunityTargets: false,
      maxNodeTargets: 1,
      outputDir,
    });

    expect(result.status).toBe("instructions_written");
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]?.status).toBe("instructions_written");
    expect(result.targets[0]?.sidecar.status).toBe("insufficient_evidence");
    expect(result.targets[0]?.sidecar.description).toBeNull();
    expect(result.targets[0]!.sidecar.generator.provider).toBe("assistant");
    expect(result.index.nodes["alpha"]?.status).toBe("insufficient_evidence");
    expect(result.index.nodes["alpha"]?.generator.provider).toBe("assistant");
    expect(result.targets[0]?.outputPath).toBe(join(outputDir, "alpha.json"));
    expect(result.indexPath).toBe(`${outputDir}.json`);
    const persistedSidecar = JSON.parse(readFileSync(join(outputDir, "alpha.json"), "utf-8")) as Record<string, unknown>;
    const persistedIndex = JSON.parse(readFileSync(`${outputDir}.json`, "utf-8")) as Record<string, unknown>;
    expect(persistedSidecar.schema).toBe("graphify_wiki_description_v1");
    expect(persistedSidecar.status).toBe("insufficient_evidence");
    expect(persistedIndex.schema).toBe("graphify_wiki_description_index_v1");
  });

  it("returns explicit not_implemented status when assistant client is missing", async () => {
    const graph = mkGraph();
    const outputDir = makeTempDir();
    const result = await generateWikiDescriptionSidecars(graph, {
      graphHash: "graph-hash",
      mode: "assistant",
      includeCommunityTargets: false,
      maxNodeTargets: 1,
      outputDir,
    });

    expect(result.status).toBe("not_implemented");
    expect(result.targets).toHaveLength(1);
    expect(result.targets[0]?.status).toBe("not_implemented");
    expect(result.targets[0]?.reason).toContain("No injected assistant client");
    expect(result.targets[0]?.sidecar.status).toBe("insufficient_evidence");
    expect(existsSync(join(outputDir, "alpha.json"))).toBe(true);
    expect(existsSync(`${outputDir}.json`)).toBe(true);
  });

  it("attaches cache metadata for all generated sidecar records", async () => {
    const graph = mkGraph();
    const outputDir = makeTempDir();
    const result = await generateWikiDescriptionSidecars(graph, {
      graphHash: "graph-hash",
      mode: "assistant",
      clients: assistantClient(outputDir),
      communities: new Map<number, string[]>([
        [0, ["alpha", "beta"]],
      ]),
      includeNodeTargets: true,
      includeCommunityTargets: true,
      maxNodeTargets: 1,
      maxCommunityTargets: 1,
      outputDir,
    });

    expect(result.prompt_version).toBe(WIKI_DESCRIPTION_PROMPT_VERSION);
    const nodeKey = buildWikiDescriptionCacheKey({
      target_id: "alpha",
      target_kind: "node",
      graph_hash: "graph-hash",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant",
      provider: "assistant",
      model: null,
    });
    const communityKey = buildWikiDescriptionCacheKey({
      target_id: "community:0",
      target_kind: "community",
      graph_hash: "graph-hash",
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant",
      provider: "assistant",
      model: null,
    });

    expect(result.index.nodes["alpha"]?.cache_key).toBe(nodeKey);
    expect(result.index.communities?.["0"]?.cache_key).toBe(communityKey);
  });

  it("wraps completed client output with Graphify sidecar metadata", async () => {
    const graph = mkGraph();
    const outputDir = makeTempDir();
    const result = await generateWikiDescriptionSidecars(graph, {
      graphHash: "graph-hash",
      mode: "direct",
      clients: completedClient(),
      includeCommunityTargets: false,
      maxNodeTargets: 1,
      outputDir,
      createdAt: "2026-05-12T00:00:00.000Z",
    });

    const outputPath = join(outputDir, "alpha.json");
    const persisted = JSON.parse(readFileSync(outputPath, "utf-8")) as Record<string, unknown>;
    const persistedIndex = JSON.parse(readFileSync(`${outputDir}.json`, "utf-8")) as Record<string, unknown>;
    expect(result.status).toBe("completed");
    expect(result.targets[0]?.status).toBe("completed");
    expect(result.targets[0]?.sidecar).toMatchObject({
      schema: "graphify_wiki_description_v1",
      target_id: "alpha",
      target_kind: "node",
      graph_hash: "graph-hash",
      status: "generated",
      generator: {
        mode: "direct",
        provider: "openai",
        model: "mock-model",
      },
    });
    expect(result.index.nodes["alpha"]?.status).toBe("generated");
    expect(persisted.schema).toBe("graphify_wiki_description_v1");
    expect(persisted.target_id).toBe("alpha");
    expect(persisted.cache_key).toBe(result.index.nodes["alpha"]?.cache_key);
    expect(persistedIndex.nodes).toMatchObject({ alpha: { status: "generated" } });
  });
});

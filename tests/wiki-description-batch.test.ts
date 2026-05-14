import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Graph from "graphology";

import {
  collectWikiDescriptionTargets,
} from "../src/wiki-description-generation.js";
import {
  WIKI_DESCRIPTION_BATCH_SCHEMA,
  buildTargetKindsMap,
  buildWikiDescriptionBatchExport,
  exportWikiDescriptionBatchToJsonl,
  parseWikiDescriptionBatchResults,
  type WikiDescriptionBatchResultRecord,
} from "../src/wiki-description-batch.js";
import { WIKI_DESCRIPTION_PROMPT_VERSION } from "../src/wiki-descriptions.js";
import type { BatchTextJsonClient, BatchTextJsonExportInput, BatchTextJsonExportResult } from "../src/llm-execution.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-wiki-batch-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

function mkGraph(): Graph {
  const graph = new Graph({ type: "undirected" });
  graph.addNode("alpha", { label: "AlphaService", source_file: "src/alpha.ts", node_type: "service", community: 0 });
  graph.addNode("beta", { label: "BetaRepository", source_file: "src/beta.ts", node_type: "service", community: 0 });
  graph.addNode("gamma", { label: "GammaEngine", source_file: "src/gamma.ts", node_type: "service", community: 1 });
  graph.addUndirectedEdge("alpha", "beta", { relation: "uses" });
  graph.addUndirectedEdge("alpha", "gamma", { relation: "calls" });
  return graph;
}

describe("wiki description batch — export contract", () => {
  it("turns a target collection into one request per node and community", () => {
    const graph = mkGraph();
    const communities = new Map<number, string[]>([[0, ["alpha", "beta"]], [1, ["gamma"]]]);
    const targets = collectWikiDescriptionTargets(graph, {
      communities,
      includeNodeTargets: true,
      includeCommunityTargets: true,
      maxNodeTargets: 2,
      maxCommunityTargets: 2,
      maxNodeNeighbors: 3,
    });

    const dir = makeTempDir();
    const outputPath = join(dir, "batch-input.jsonl");
    const exportInput = buildWikiDescriptionBatchExport(targets, {
      graphHash: "graph-batch-a",
      outputPath,
      maxNeighbors: 3,
    });

    expect(exportInput.schema).toBe(WIKI_DESCRIPTION_BATCH_SCHEMA);
    expect(exportInput.outputPath).toBe(outputPath);
    expect(exportInput.requests).toHaveLength(targets.nodes.length + targets.communities.length);
    expect(exportInput.requests[0]?.id).toBe(targets.nodes[0]?.target_id);
    expect(exportInput.requests[0]?.schema).toBe("graphify_wiki_description_v1");
    expect(exportInput.requests[0]?.prompt).toContain("graph_hash: graph-batch-a");
    expect(exportInput.requests[0]?.prompt).toContain(`prompt_version: ${WIKI_DESCRIPTION_PROMPT_VERSION}`);
  });

  it("writes JSONL to disk and forwards the request to the injected client", async () => {
    const graph = mkGraph();
    const targets = collectWikiDescriptionTargets(graph, { maxNodeTargets: 2, maxNodeNeighbors: 2 });

    const dir = makeTempDir();
    const outputPath = join(dir, "subdir", "batch.jsonl");
    const exportInput = buildWikiDescriptionBatchExport(targets, {
      graphHash: "graph-batch-b",
      outputPath,
    });

    const seen: BatchTextJsonExportInput[] = [];
    const client: BatchTextJsonClient = {
      provider: "mock-batch",
      async exportRequests(input): Promise<BatchTextJsonExportResult> {
        seen.push(input);
        return {
          provider: "mock-batch",
          outputPath: input.outputPath,
          requestCount: input.requests.length,
          audit: { mocked: true },
        };
      },
      async importResults() {
        return { provider: "mock-batch", importedCount: 0, failedCount: 0, audit: {} };
      },
    };

    const result = await exportWikiDescriptionBatchToJsonl(client, exportInput);

    expect(seen).toHaveLength(1);
    expect(result.provider).toBe("mock-batch");
    expect(result.requestCount).toBe(exportInput.requests.length);
    expect(existsSync(outputPath)).toBe(true);
    const lines = readFileSync(outputPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(exportInput.requests.length);
    const first = JSON.parse(lines[0]!) as { id: string; schema: string; prompt: string };
    expect(first.id).toBe(exportInput.requests[0]?.id);
    expect(first.schema).toBe("graphify_wiki_description_v1");
    expect(first.prompt).toContain("graph_hash: graph-batch-b");
  });
});

describe("wiki description batch — parse results", () => {
  it("wraps generated + insufficient_evidence records into a validated index", () => {
    const graph = mkGraph();
    const communities = new Map<number, string[]>([[0, ["alpha", "beta"]]]);
    const targets = collectWikiDescriptionTargets(graph, {
      communities,
      includeNodeTargets: true,
      includeCommunityTargets: true,
      maxNodeTargets: 2,
      maxCommunityTargets: 1,
      maxNodeNeighbors: 2,
    });
    const targetKinds = buildTargetKindsMap(targets);

    const records: WikiDescriptionBatchResultRecord[] = [
      {
        id: "alpha",
        status: "generated",
        description: "AlphaService coordinates downstream services with source-backed evidence.",
        evidence_refs: ["src/alpha.ts#1"],
        confidence: 0.85,
      },
      {
        id: "beta",
        status: "insufficient_evidence",
        description: null,
        evidence_refs: [],
        confidence: null,
      },
      {
        id: "community:0",
        status: "generated",
        description: "Community 0 groups the source-backed services together.",
        evidence_refs: ["src/alpha.ts", "src/beta.ts"],
        confidence: 0.7,
      },
    ];

    const { index, dropped } = parseWikiDescriptionBatchResults(records, {
      graphHash: "graph-batch-c",
      generator: {
        mode: "batch",
        provider: "openai",
        model: "gpt-batch",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      },
      targetKinds,
    });

    expect(dropped).toEqual([]);
    expect(index.schema).toBe("graphify_wiki_description_index_v1");
    expect(index.graph_hash).toBe("graph-batch-c");
    expect(index.prompt_version).toBe(WIKI_DESCRIPTION_PROMPT_VERSION);
    expect(Object.keys(index.nodes).sort()).toEqual(["alpha", "beta"]);
    expect(index.nodes["alpha"]?.status).toBe("generated");
    expect(index.nodes["beta"]?.status).toBe("insufficient_evidence");
    expect(index.communities && Object.keys(index.communities)).toEqual(["0"]);
    expect(index.communities?.["0"]?.status).toBe("generated");
    expect(index.communities?.["0"]?.generator.mode).toBe("batch");
    expect(index.communities?.["0"]?.generator.model).toBe("gpt-batch");
  });

  it("drops malformed records with a reason instead of throwing", () => {
    const graph = mkGraph();
    const targets = collectWikiDescriptionTargets(graph, { maxNodeTargets: 2 });
    const targetKinds = buildTargetKindsMap(targets);

    const records: WikiDescriptionBatchResultRecord[] = [
      {
        id: "alpha",
        status: "generated",
        description: "",
        evidence_refs: [],
        confidence: 0.9,
      },
      {
        id: "missing-target-id",
        status: "generated",
        description: "Some text",
        evidence_refs: ["src/x.ts"],
        confidence: 0.8,
      },
      {
        id: "beta",
        status: "generated",
        description: "Has description but no evidence",
        evidence_refs: [],
        confidence: 0.5,
      },
    ];

    const { index, dropped } = parseWikiDescriptionBatchResults(records, {
      graphHash: "graph-drop",
      generator: {
        mode: "batch",
        provider: "openai",
        model: null,
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      },
      targetKinds,
    });

    expect(Object.keys(index.nodes)).toEqual([]);
    expect(dropped.map((entry) => entry.id).sort()).toEqual(["alpha", "beta", "missing-target-id"]);
    expect(dropped.find((entry) => entry.id === "alpha")?.reason).toContain("description");
    expect(dropped.find((entry) => entry.id === "missing-target-id")?.reason).toContain("unknown target id");
    expect(dropped.find((entry) => entry.id === "beta")?.reason).toContain("evidence_refs");
  });
});

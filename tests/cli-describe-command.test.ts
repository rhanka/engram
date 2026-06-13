/**
 * Tests for `graphify describe [path]` — the non-destructive node-description
 * command that mirrors `graphify label [path]`.
 *
 * These tests do NOT invoke the real CLI binary; they exercise the command
 * action logic via the same in-process pattern as other cli tests in this repo.
 * The "no-graph" test just checks the error message via stderr spy.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Minimal graph.json fixture (2 code nodes, 1 edge, community assignment)
// ---------------------------------------------------------------------------
function makeGraphJson(extraNodeAttrs: Record<string, Record<string, unknown>> = {}): string {
  const base = {
    nodes: [
      {
        id: "fn_a",
        label: "doA()",
        file_type: "code",
        source_file: "src/a.ts",
        community: 0,
        community_name: "Community 0",
        ...( extraNodeAttrs["fn_a"] ?? {}),
      },
      {
        id: "fn_b",
        label: "doB()",
        file_type: "code",
        source_file: "src/b.ts",
        community: 0,
        community_name: "Community 0",
        ...( extraNodeAttrs["fn_b"] ?? {}),
      },
    ],
    links: [{ source: "fn_a", target: "fn_b", relation: "calls", weight: 1.0, confidence: "EXTRACTED", confidence_score: 1.0 }],
    community_labels: { "0": "Community 0" },
    graph: { topology_signature: "abc", freshness: {} },
    hyperedges: [],
  };
  return JSON.stringify(base, null, 2);
}

function setupProjectDir(graphJson: string): string {
  const root = join(tmpdir(), `graphify-describe-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stateDir = join(root, ".graphify");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "graph.json"), graphJson, "utf-8");
  return root;
}

function teardown(root: string): void {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helper: run the describe command action inline (no subprocess)
// Replicates the exact logic of the `describe [path]` CLI action.
// ---------------------------------------------------------------------------
async function runDescribeCommand(
  root: string,
  opts: {
    descriptionBackend?: string;
    descriptionModel?: string;
    descriptionMode?: string;
    fillMissing?: boolean;
    callLlm?: (prompt: string, maxTokens: number) => Promise<string>;
  } = {},
): Promise<{ exitCode: number | null; stderr: string }> {
  const { existsSync, readFileSync: rf } = await import("node:fs");
  const { resolve: res, join: pjoin } = await import("node:path");
  const { resolveGraphifyPaths } = await import("../src/paths.js");
  const { loadGraphFromData } = await import("../src/graph.js");
  const { makeGraphPortable } = await import("../src/portable-artifacts.js");
  const { cluster, remapCommunitiesToPrevious } = await import("../src/cluster.js");
  const { toJson } = await import("../src/export.js");
  const { generateNodeDescriptions, DESCRIPTION_INSTRUCTIONS_DIR } = await import("../src/node-descriptions.js");

  const stderrLines: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  });

  const resolvedRoot = res(root);
  const paths = resolveGraphifyPaths({ root: resolvedRoot });

  if (!existsSync(paths.graph)) {
    process.stderr.write(`error: no graph found at ${paths.graph} - run /graphify first\n`);
    spy.mockRestore();
    return { exitCode: 1, stderr: stderrLines.join("") };
  }

  const rawGraphText = rf(paths.graph, "utf-8");
  const rawGraphParsed = JSON.parse(rawGraphText) as { nodes?: Array<Record<string, unknown>> };
  const G = makeGraphPortable(loadGraphFromData(JSON.parse(rawGraphText)), resolvedRoot);

  let communities = cluster(G);
  const previousNodeCommunity: Record<string, number> = {};
  for (const n of (rawGraphParsed.nodes ?? [])) {
    const nodeId = typeof n["id"] === "string" ? n["id"] : undefined;
    const nodeCommunity = typeof n["community"] === "number" ? n["community"] : undefined;
    if (nodeId !== undefined && nodeCommunity !== undefined) {
      previousNodeCommunity[nodeId] = nodeCommunity;
    }
  }
  if (Object.keys(previousNodeCommunity).length > 0) {
    communities = remapCommunitiesToPrevious(communities, previousNodeCommunity);
  }

  const descriptionBackend = opts.descriptionBackend?.trim() || undefined;
  const descriptionModel = opts.descriptionModel?.trim() || undefined;
  const descriptionMode = (opts.descriptionMode === "assistant" || opts.descriptionMode === "direct")
    ? opts.descriptionMode as "assistant" | "direct"
    : undefined;

  const instructionDir = pjoin(paths.stateDir, DESCRIPTION_INSTRUCTIONS_DIR);

  await generateNodeDescriptions(G, {
    ...(descriptionBackend ? { provider: descriptionBackend } : {}),
    ...(descriptionModel ? { model: descriptionModel } : {}),
    ...(descriptionMode ? { mode: descriptionMode } : {}),
    ...(opts.fillMissing ? { onlyMissing: true } : {}),
    ...(opts.callLlm ? { callLlm: opts.callLlm } : {}),
    instructionDir,
  });

  // Reconstruct community labels from existing community_name attrs
  const communityLabels = new Map<number, string>();
  for (const [cid, members] of communities.entries()) {
    const sampleId = members[0];
    if (sampleId !== undefined) {
      const attrs = G.getNodeAttributes(sampleId) as Record<string, unknown>;
      if (typeof attrs["community_name"] === "string") {
        communityLabels.set(cid, attrs["community_name"]);
      }
    }
  }

  toJson(G, communities, paths.graph, { communityLabels, force: true });

  spy.mockRestore();
  return { exitCode: 0, stderr: stderrLines.join("") };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("graphify describe [path]", () => {
  let root: string;

  afterEach(() => {
    if (root) teardown(root);
    vi.restoreAllMocks();
  });

  it("adds node.description to existing graph — node count, edge count, community_name set unchanged", async () => {
    root = setupProjectDir(makeGraphJson());
    const graphPath = join(root, ".graphify", "graph.json");

    const before = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; community_name?: string; description?: string }>;
      links: unknown[];
    };
    const beforeNodeCount = before.nodes.length;
    const beforeEdgeCount = before.links.length;
    const beforeIds = new Set(before.nodes.map((n) => n.id));
    const beforeCommunityNames = new Set(before.nodes.map((n) => n.community_name).filter(Boolean));

    const mockCallLlm = async (prompt: string): Promise<string> => {
      const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
      const result: Record<string, string> = {};
      for (const id of ids) result[id] = `Description for ${id}.`;
      return JSON.stringify(result);
    };

    const { exitCode } = await runDescribeCommand(root, { callLlm: mockCallLlm });
    expect(exitCode).toBe(0);

    const after = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; community_name?: string; description?: string }>;
      links: unknown[];
    };

    // Non-destructive guarantee: node count unchanged
    expect(after.nodes.length).toBe(beforeNodeCount);
    // Non-destructive guarantee: edge count unchanged
    expect(after.links.length).toBe(beforeEdgeCount);
    // Non-destructive guarantee: node IDs unchanged
    const afterIds = new Set(after.nodes.map((n) => n.id));
    expect(afterIds).toEqual(beforeIds);
    // Non-destructive guarantee: community_name set unchanged
    const afterCommunityNames = new Set(after.nodes.map((n) => n.community_name).filter(Boolean));
    expect(afterCommunityNames).toEqual(beforeCommunityNames);
    // description added to every node
    for (const node of after.nodes) {
      expect(node.description).toBeTruthy();
      expect(typeof node.description).toBe("string");
    }
  });

  it("--fill-missing only describes nodes without an existing description", async () => {
    root = setupProjectDir(makeGraphJson({
      fn_a: { description: "Already described." },
    }));
    const graphPath = join(root, ".graphify", "graph.json");

    const calledForIds: string[] = [];
    const mockCallLlm = async (prompt: string): Promise<string> => {
      const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
      calledForIds.push(...ids);
      const result: Record<string, string> = {};
      for (const id of ids) result[id] = `Description for ${id}.`;
      return JSON.stringify(result);
    };

    await runDescribeCommand(root, { callLlm: mockCallLlm, fillMissing: true });

    // fn_a already had description → should not appear in LLM call
    expect(calledForIds).not.toContain("fn_a");
    // fn_b was missing → should appear
    expect(calledForIds).toContain("fn_b");

    const after = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; description?: string }>;
    };
    const fnA = after.nodes.find((n) => n.id === "fn_a")!;
    expect(fnA.description).toBe("Already described.");
  });

  it("assistant mode emits instruction files then ingests on second run", async () => {
    const { existsSync, readdirSync } = await import("node:fs");
    root = setupProjectDir(makeGraphJson());
    const stateDir = join(root, ".graphify");
    const instrDir = join(stateDir, "description-instructions");

    // First run: force assistant mode → emits instruction files
    const { exitCode: ec1 } = await runDescribeCommand(root, { descriptionMode: "assistant" });
    expect(ec1).toBe(0);
    // Instruction files should have been emitted
    expect(existsSync(instrDir)).toBe(true);
    const mdFiles = readdirSync(instrDir).filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThan(0);

    // Simulate assistant writing answer files
    for (const mdFile of mdFiles) {
      const jsonFile = mdFile.replace(/\.md$/, ".json");
      writeFileSync(join(instrDir, jsonFile), JSON.stringify({
        fn_a: "Resolves A.",
        fn_b: "Resolves B.",
      }), "utf-8");
    }

    // Second run: ingest
    const { exitCode: ec2 } = await runDescribeCommand(root, { descriptionMode: "assistant" });
    expect(ec2).toBe(0);

    const after = JSON.parse(readFileSync(join(stateDir, "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; description?: string }>;
    };
    const descriptions = Object.fromEntries(after.nodes.map((n) => [n.id, n.description]));
    expect(descriptions["fn_a"]).toBe("Resolves A.");
    expect(descriptions["fn_b"]).toBe("Resolves B.");

    // Lifecycle cleanup: instruction files cleaned after ingest
    const remaining = readdirSync(instrDir).filter((f) => f.endsWith(".md") || f.endsWith(".json"));
    expect(remaining.length).toBe(0);
  });

  it("direct mode with injected callLlm stamps descriptions", async () => {
    root = setupProjectDir(makeGraphJson());
    const graphPath = join(root, ".graphify", "graph.json");

    const mockCallLlm = async (prompt: string): Promise<string> => {
      const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
      return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `Direct: ${id}`])));
    };

    const { exitCode } = await runDescribeCommand(root, {
      descriptionMode: "direct",
      callLlm: mockCallLlm,
    });
    expect(exitCode).toBe(0);

    const after = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; description?: string }>;
    };
    for (const node of after.nodes) {
      expect(node.description).toMatch(/^Direct: /);
    }
  });

  it("exits with error when graph.json does not exist", async () => {
    const emptyRoot = join(tmpdir(), `graphify-describe-noexist-${Date.now()}`);
    mkdirSync(emptyRoot, { recursive: true });
    try {
      const { exitCode, stderr } = await runDescribeCommand(emptyRoot);
      expect(exitCode).toBe(1);
      expect(stderr).toContain("no graph found");
    } finally {
      teardown(emptyRoot);
    }
  });
});

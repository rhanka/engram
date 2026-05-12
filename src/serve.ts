/**
 * MCP stdio server - exposes graph query tools to Claude and other agents.
 *
 * Uses @modelcontextprotocol/sdk for the server and graphology for the graph.
 */
import { existsSync, readFileSync } from "node:fs";
import Graph from "graphology";
import { bidirectional } from "graphology-shortest-path/unweighted.js";
import { basename, dirname, join, resolve } from "node:path";
import pkg from "../package.json";
import {
  forEachTraversalNeighbor,
  loadGraphFromData,
  type SerializedGraphData,
} from "./graph.js";
import { resolveGraphInputPath } from "./paths.js";
import { validateGraphPath, sanitizeLabel } from "./security.js";
import { normalizeSearchText, scoreSearchText, textMatchesQuery } from "./search.js";
import {
  godNodes as computeGodNodes,
  surprisingConnections,
  suggestQuestions,
} from "./analyze.js";
import { buildFirstHopSummary, firstHopSummaryToText } from "./summary.js";
import { buildReviewDelta, reviewDeltaToText } from "./review.js";
import { buildReviewAnalysis, reviewAnalysisToText } from "./review-analysis.js";
import { buildCommitRecommendation, commitRecommendationToText } from "./recommend.js";
import { applyOntologyPatch, validateOntologyPatch } from "./ontology-patch.js";
import { loadOntologyPatchContext } from "./ontology-patch-context.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export interface ServeOptions {
  ontology?: {
    write?: boolean;
    profileStatePath?: string;
  };
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

const MCP_RESOURCES: McpResourceDefinition[] = [
  {
    uri: "graphify://report",
    name: "Graph Report",
    description: "Full GRAPH_REPORT.md",
    mimeType: "text/markdown",
  },
  {
    uri: "graphify://stats",
    name: "Graph Stats",
    description: "Node/edge/community counts and confidence breakdown",
    mimeType: "text/plain",
  },
  {
    uri: "graphify://god-nodes",
    name: "God Nodes",
    description: "Top 10 most-connected nodes",
    mimeType: "text/plain",
  },
  {
    uri: "graphify://surprises",
    name: "Surprising Connections",
    description: "Cross-community surprising connections",
    mimeType: "text/plain",
  },
  {
    uri: "graphify://audit",
    name: "Confidence Audit",
    description: "EXTRACTED/INFERRED/AMBIGUOUS edge breakdown",
    mimeType: "text/plain",
  },
  {
    uri: "graphify://questions",
    name: "Suggested Questions",
    description: "Suggested questions for this codebase",
    mimeType: "text/plain",
  },
];

// ---------------------------------------------------------------------------
// Graph loading
// ---------------------------------------------------------------------------

function loadGraph(graphPath: string): Graph {
  let safePath: string;
  try {
    safePath = validateGraphPath(graphPath, dirname(resolve(graphPath)));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  let data: SerializedGraphData;
  try {
    data = JSON.parse(readFileSync(safePath, "utf-8")) as SerializedGraphData;
  } catch (err) {
    console.error(
      `error: graph.json is corrupted (${err instanceof Error ? err.message : err}). Re-run the graphify skill to rebuild it (for Codex: $graphify .).`,
    );
    process.exit(1);
  }

  return loadGraphFromData(data);
}

function getVersion(): string {
  return pkg.version ?? "unknown";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function communitiesFromGraph(G: Graph): Map<number, string[]> {
  const communities = new Map<number, string[]>();
  G.forEachNode((nodeId, data) => {
    const cid = data.community as number | undefined;
    if (cid !== undefined && cid !== null) {
      if (!communities.has(cid)) communities.set(cid, []);
      communities.get(cid)!.push(nodeId);
    }
  });
  return communities;
}

function communityName(G: Graph, cid: number | string | null | undefined): string | null {
  if (cid === undefined || cid === null) return null;
  const labels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  const fromGraph = labels?.[String(cid)];
  if (typeof fromGraph === "string" && fromGraph.length > 0) {
    return sanitizeLabel(fromGraph);
  }
  return null;
}

function mcpField(value: unknown): string {
  return sanitizeLabel(value);
}

function nodeDisplayLabel(G: Graph, nodeId: string): string {
  return mcpField((G.getNodeAttribute(nodeId, "label") as string | undefined) ?? nodeId);
}

function scoreNodes(G: Graph, terms: string[]): Array<[number, string]> {
  const scored: Array<[number, string]> = [];
  G.forEachNode((nid, data) => {
    const label = (data.label as string) ?? "";
    const source = (data.source_file as string) ?? "";
    const score = scoreSearchText(label, source, terms);
    if (score > 0) scored.push([score, nid]);
  });
  scored.sort((a, b) => b[0] - a[0]);
  return scored;
}

function bfs(
  G: Graph,
  startNodes: string[],
  depth: number,
): { visited: Set<string>; edges: Array<[string, string]> } {
  const visited = new Set<string>(startNodes);
  let frontier = new Set<string>(startNodes);
  const edges: Array<[string, string]> = [];
  for (let i = 0; i < depth; i++) {
    const nextFrontier = new Set<string>();
    for (const n of frontier) {
      forEachTraversalNeighbor(G, n, (neighbor) => {
        if (!visited.has(neighbor)) {
          nextFrontier.add(neighbor);
          edges.push([n, neighbor]);
        }
      });
    }
    for (const n of nextFrontier) visited.add(n);
    frontier = nextFrontier;
  }
  return { visited, edges };
}

function dfs(
  G: Graph,
  startNodes: string[],
  depth: number,
): { visited: Set<string>; edges: Array<[string, string]> } {
  const visited = new Set<string>();
  const edges: Array<[string, string]> = [];
  const stack: Array<[string, number]> = [...startNodes].reverse().map((n) => [n, 0]);
  while (stack.length > 0) {
    const [node, d] = stack.pop()!;
    if (visited.has(node) || d > depth) continue;
    visited.add(node);
    forEachTraversalNeighbor(G, node, (neighbor) => {
      if (!visited.has(neighbor)) {
        stack.push([neighbor, d + 1]);
        edges.push([node, neighbor]);
      }
    });
  }
  return { visited, edges };
}

function subgraphToText(
  G: Graph,
  nodes: Set<string>,
  edges: Array<[string, string]>,
  tokenBudget: number = 2000,
): string {
  const charBudget = tokenBudget * 3;
  const lines: string[] = [];

  const sorted = [...nodes].sort((a, b) => G.degree(b) - G.degree(a));
  for (const nid of sorted) {
    const d = G.getNodeAttributes(nid);
    lines.push(
      `NODE ${mcpField((d.label as string) ?? nid)} [src=${mcpField(d.source_file)} loc=${mcpField(d.source_location)} community=${mcpField(d.community)}]`,
    );
  }
  for (const [u, v] of edges) {
    if (nodes.has(u) && nodes.has(v)) {
      const edgeKey = G.edge(u, v);
      if (!edgeKey) continue;
      const d = G.getEdgeAttributes(edgeKey);
      lines.push(
        `EDGE ${nodeDisplayLabel(G, u)} --${mcpField(d.relation)} [${mcpField(d.confidence)}]--> ${nodeDisplayLabel(G, v)}`,
      );
    }
  }
  let output = lines.join("\n");
  if (output.length > charBudget) {
    output = output.slice(0, charBudget) + `\n... (truncated to ~${tokenBudget} token budget)`;
  }
  return output;
}

function findNode(G: Graph, label: string): string[] {
  const term = normalizeSearchText(label);
  const result: string[] = [];
  G.forEachNode((nid, d) => {
    if (
      textMatchesQuery((d.label as string) ?? "", term) ||
      normalizeSearchText(nid) === term
    ) {
      result.push(nid);
    }
  });
  return result;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function toolQueryGraph(G: Graph, args: Record<string, unknown>): string {
  const question = args.question as string;
  const mode = (args.mode as string) ?? "bfs";
  const depth = Math.min(Number(args.depth ?? 3), 6);
  const budget = Number(args.token_budget ?? 2000);
  const terms = question
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .map(normalizeSearchText);

  const scored = scoreNodes(G, terms);
  const startNodes = scored.slice(0, 3).map(([, nid]) => nid);
  if (startNodes.length === 0) return "No matching nodes found.";

  const { visited, edges } =
    mode === "dfs" ? dfs(G, startNodes, depth) : bfs(G, startNodes, depth);

  const startLabels = startNodes.map(
    (n) => nodeDisplayLabel(G, n),
  );
  const header = `Traversal: ${mode.toUpperCase()} depth=${depth} | Start: [${startLabels.join(", ")}] | ${visited.size} nodes found\n\n`;
  return header + subgraphToText(G, visited, edges, budget);
}

function toolGetNode(G: Graph, args: Record<string, unknown>): string {
  const label = normalizeSearchText(args.label as string);
  const matches: Array<[string, Record<string, unknown>]> = [];
  G.forEachNode((nid, d) => {
    if (
      textMatchesQuery((d.label as string) ?? "", label) ||
      normalizeSearchText(nid) === label
    ) {
      matches.push([nid, d]);
    }
  });
  if (matches.length === 0) return `No node matching '${label}' found.`;
  const [nid, d] = matches[0]!;
  return [
    `Node: ${mcpField(d.label ?? nid)}`,
    `  ID: ${mcpField(nid)}`,
    `  Source: ${mcpField(d.source_file)} ${mcpField(d.source_location)}`,
    `  Type: ${mcpField(d.file_type)}`,
    `  Community: ${
      d.community_name
        ? `${mcpField(d.community)} (${mcpField(d.community_name)})`
        : (communityName(G, d.community as number | undefined) ?? mcpField(d.community))
    }`,
    `  Degree: ${G.degree(nid)}`,
  ].join("\n");
}

function toolGetNeighbors(G: Graph, args: Record<string, unknown>): string {
  const label = (args.label as string).toLowerCase();
  const relFilter = ((args.relation_filter as string) ?? "").toLowerCase();
  const matches = findNode(G, label);
  if (matches.length === 0) return `No node matching '${label}' found.`;
  const nid = matches[0]!;
  const lines = [`Neighbors of ${nodeDisplayLabel(G, nid)}:`];
  forEachTraversalNeighbor(G, nid, (neighbor) => {
    const edgeKey = G.edge(nid, neighbor);
    if (!edgeKey) return;
    const d = G.getEdgeAttributes(edgeKey);
    const rel = (d.relation as string) ?? "";
    if (relFilter && !rel.toLowerCase().includes(relFilter)) return;
    lines.push(
      `  --> ${nodeDisplayLabel(G, neighbor)} [${mcpField(rel)}] [${mcpField(d.confidence)}]`,
    );
  });
  return lines.join("\n");
}

function toolGetCommunity(
  communities: Map<number, string[]>,
  G: Graph,
  args: Record<string, unknown>,
): string {
  const cid = Number(args.community_id);
  const nodes = communities.get(cid);
  if (!nodes || nodes.length === 0) return `Community ${cid} not found.`;
  const label = communityName(G, cid);
  const lines = [label
    ? `Community ${cid} - ${label} (${nodes.length} nodes):`
    : `Community ${cid} (${nodes.length} nodes):`];
  for (const n of nodes) {
    const d = G.getNodeAttributes(n);
    lines.push(`  ${mcpField(d.label ?? n)} [${mcpField(d.source_file)}]`);
  }
  return lines.join("\n");
}

function toolGodNodes(G: Graph, args: Record<string, unknown>): string {
  const topN = Number(args.top_n ?? 10);
  const nodes = computeGodNodes(G, topN);
  const lines = ["God nodes (most connected):"];
  nodes.forEach((n, i) => {
    lines.push(`  ${i + 1}. ${mcpField(n.label)} - ${n.edges} edges`);
  });
  return lines.join("\n");
}

function toolGraphStats(
  G: Graph,
  communities: Map<number, string[]>,
): string {
  const confs: string[] = [];
  G.forEachEdge((_, data) => {
    confs.push((data.confidence as string) ?? "EXTRACTED");
  });
  const total = confs.length || 1;
  return [
    `Nodes: ${G.order}`,
    `Edges: ${G.size}`,
    `Communities: ${communities.size}`,
    `EXTRACTED: ${Math.round((confs.filter((c) => c === "EXTRACTED").length / total) * 100)}%`,
    `INFERRED: ${Math.round((confs.filter((c) => c === "INFERRED").length / total) * 100)}%`,
    `AMBIGUOUS: ${Math.round((confs.filter((c) => c === "AMBIGUOUS").length / total) * 100)}%`,
  ].join("\n");
}

function communityLabelsFromGraph(
  G: Graph,
  communities: Map<number, string[]>,
): Map<number, string> {
  const labels = new Map<number, string>();
  const graphLabels = G.getAttribute("community_labels") as
    | Record<string, unknown>
    | undefined;

  for (const cid of communities.keys()) {
    const label = graphLabels?.[String(cid)];
    labels.set(cid, typeof label === "string" && label.length > 0
      ? sanitizeLabel(label)
      : `Community ${cid}`);
  }
  return labels;
}

function resourceConfidenceAudit(G: Graph): string {
  const counts = {
    EXTRACTED: 0,
    INFERRED: 0,
    AMBIGUOUS: 0,
  };
  G.forEachEdge((_, data) => {
    const confidence = (data.confidence as string | undefined) ?? "EXTRACTED";
    if (confidence === "EXTRACTED" || confidence === "INFERRED" || confidence === "AMBIGUOUS") {
      counts[confidence] += 1;
    }
  });

  const total = G.size;
  const denominator = total || 1;
  return [
    `Total edges: ${total}`,
    `EXTRACTED: ${counts.EXTRACTED} (${Math.round((counts.EXTRACTED / denominator) * 100)}%)`,
    `INFERRED: ${counts.INFERRED} (${Math.round((counts.INFERRED / denominator) * 100)}%)`,
    `AMBIGUOUS: ${counts.AMBIGUOUS} (${Math.round((counts.AMBIGUOUS / denominator) * 100)}%)`,
  ].join("\n");
}

function resourceSurprises(
  G: Graph,
  communities: Map<number, string[]>,
): string {
  const surprises = surprisingConnections(G, communities, 10);
  if (surprises.length === 0) {
    return "No surprising connections found.";
  }
  return [
    "Surprising cross-community connections:",
    ...surprises.map((surprise) =>
      `  ${mcpField(surprise.source)} <-> ${mcpField(surprise.target)} [${mcpField(surprise.relation)}]`,
    ),
  ].join("\n");
}

function resourceQuestions(
  G: Graph,
  communities: Map<number, string[]>,
): string {
  const questions = suggestQuestions(
    G,
    communities,
    communityLabelsFromGraph(G, communities),
    10,
  ).filter((question) => typeof question.question === "string" && question.question.length > 0);
  if (questions.length === 0) {
    return "No suggested questions available.";
  }
  return [
    "Suggested questions:",
    ...questions.map((question) => `  - ${mcpField(question.question)}`),
  ].join("\n");
}

function readMcpResource(
  uri: string,
  graphPath: string,
  G: Graph,
  communities: Map<number, string[]>,
): string {
  if (uri === "graphify://report") {
    const reportPath = join(dirname(resolve(graphPath)), "GRAPH_REPORT.md");
    if (!existsSync(reportPath)) {
      return "GRAPH_REPORT.md not found. Run graphify extract first.";
    }
    return readFileSync(reportPath, "utf-8");
  }
  if (uri === "graphify://stats") {
    return toolGraphStats(G, communities);
  }
  if (uri === "graphify://god-nodes") {
    return toolGodNodes(G, { top_n: 10 });
  }
  if (uri === "graphify://surprises") {
    return resourceSurprises(G, communities);
  }
  if (uri === "graphify://audit") {
    return resourceConfidenceAudit(G);
  }
  if (uri === "graphify://questions") {
    return resourceQuestions(G, communities);
  }
  throw new Error(`Unknown resource: ${uri}`);
}

function toolFirstHopSummary(G: Graph): string {
  return firstHopSummaryToText(buildFirstHopSummary(G));
}

function toolReviewDelta(G: Graph, args: Record<string, unknown>): string {
  const changedFiles = Array.isArray(args.changed_files)
    ? args.changed_files.filter((item): item is string => typeof item === "string")
    : [];
  if (changedFiles.length === 0) {
    return "No changed_files provided. Pass repository-relative paths to compute review impact.";
  }
  const delta = buildReviewDelta(G, changedFiles, {
    maxNodes: Number(args.max_nodes ?? 80),
    maxChains: Number(args.max_chains ?? 8),
  });
  return reviewDeltaToText(delta);
}

function toolRecommendCommits(G: Graph, args: Record<string, unknown>): string {
  const changedFiles = Array.isArray(args.changed_files)
    ? args.changed_files.filter((item): item is string => typeof item === "string")
    : [];
  if (changedFiles.length === 0) {
    return "No changed_files provided. Pass repository-relative paths to compute advisory commit groups.";
  }
  const recommendation = buildCommitRecommendation(G, changedFiles, {
    graphAvailable: true,
    maxGroups: Number(args.max_groups ?? 6),
    maxNodes: Number(args.max_nodes ?? 60),
    maxChains: Number(args.max_chains ?? 4),
  });
  return commitRecommendationToText(recommendation);
}

function toolReviewAnalysis(G: Graph, args: Record<string, unknown>): string {
  const changedFiles = Array.isArray(args.changed_files)
    ? args.changed_files.filter((item): item is string => typeof item === "string")
    : [];
  if (changedFiles.length === 0) {
    return "No changed_files provided. Pass repository-relative paths to compute review analysis.";
  }
  const analysis = buildReviewAnalysis(G, changedFiles, {
    maxNodes: Number(args.max_nodes ?? 120),
    maxChains: Number(args.max_chains ?? 12),
    maxCommunities: Number(args.max_communities ?? 8),
  });
  return reviewAnalysisToText(analysis);
}

function toolShortestPath(G: Graph, args: Record<string, unknown>): string {
  const srcTerms = (args.source as string)
    .split(/\s+/)
    .map((t) => t.toLowerCase());
  const tgtTerms = (args.target as string)
    .split(/\s+/)
    .map((t) => t.toLowerCase());
  const srcScored = scoreNodes(G, srcTerms);
  const tgtScored = scoreNodes(G, tgtTerms);

  if (srcScored.length === 0)
    return `No node matching source '${args.source}' found.`;
  if (tgtScored.length === 0)
    return `No node matching target '${args.target}' found.`;

  const srcNid = srcScored[0]![1];
  const tgtNid = tgtScored[0]![1];
  const maxHops = Number(args.max_hops ?? 8);

  const pathNodes = bidirectional(G, srcNid, tgtNid);
  if (!pathNodes) {
    return `No path found between '${nodeDisplayLabel(G, srcNid)}' and '${nodeDisplayLabel(G, tgtNid)}'.`;
  }

  const hops = pathNodes.length - 1;
  if (hops > maxHops) return `Path exceeds max_hops=${maxHops} (${hops} hops found).`;

  const segments: string[] = [];
  for (let i = 0; i < pathNodes.length - 1; i++) {
    const u = pathNodes[i]!;
    const v = pathNodes[i + 1]!;
    const edgeKey = G.edge(u, v);
    const edata = edgeKey ? G.getEdgeAttributes(edgeKey) : {};
    const rel = (edata.relation as string) ?? "";
    const conf = (edata.confidence as string) ?? "";
    const confStr = conf ? ` [${conf}]` : "";
    if (i === 0) {
      segments.push(nodeDisplayLabel(G, u));
    }
    segments.push(
      `--${mcpField(rel)}${confStr ? ` [${mcpField(conf)}]` : ""}--> ${nodeDisplayLabel(G, v)}`,
    );
  }
  return `Shortest path (${hops} hops):\n  ${segments.join(" ")}`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export async function serve(
  graphPath: string = resolveGraphInputPath(),
  transport?: Transport,
  options: ServeOptions = {},
): Promise<void> {
  let Server: typeof import("@modelcontextprotocol/sdk/server/index.js").Server;
  let StdioServerTransport: typeof import("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport;
  let ListToolsRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").ListToolsRequestSchema;
  let CallToolRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").CallToolRequestSchema;
  let ListResourcesRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").ListResourcesRequestSchema;
  let ReadResourceRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").ReadResourceRequestSchema;

  try {
    const serverMod = await import("@modelcontextprotocol/sdk/server/index.js");
    const stdioMod = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const typesMod = await import("@modelcontextprotocol/sdk/types.js");
    Server = serverMod.Server;
    StdioServerTransport = stdioMod.StdioServerTransport;
    ListToolsRequestSchema = typesMod.ListToolsRequestSchema;
    CallToolRequestSchema = typesMod.CallToolRequestSchema;
    ListResourcesRequestSchema = typesMod.ListResourcesRequestSchema;
    ReadResourceRequestSchema = typesMod.ReadResourceRequestSchema;
  } catch {
    throw new Error(
      "@modelcontextprotocol/sdk not installed. Run: npm install @modelcontextprotocol/sdk",
    );
  }

  const G = loadGraph(graphPath);
  const communities = communitiesFromGraph(G);
  const ontologyWrite = options.ontology?.write === true;
  if (ontologyWrite && !options.ontology?.profileStatePath) {
    throw new Error("ontology write mode requires profileStatePath");
  }
  const ontologyPatchContext = ontologyWrite
    ? loadOntologyPatchContext(options.ontology!.profileStatePath!)
    : null;

  const server = new Server(
    { name: "graphify", version: getVersion() },
    { capabilities: { tools: {}, resources: {} } },
  );

  const tools: McpToolDefinition[] = [
      {
        name: "first_hop_summary",
        description:
          "Return a compact deterministic first-hop orientation: graph size, density, top hubs, key communities, and next graph action.",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "review_delta",
        description:
          "Return review-oriented graph impact for changed files: impacted files, hubs, bridges, likely test gaps, and high-risk chains.",
        inputSchema: {
          type: "object" as const,
          properties: {
            changed_files: {
              type: "array",
              items: { type: "string" },
              description: "Repository-relative changed files",
            },
            max_nodes: { type: "integer", default: 80 },
            max_chains: { type: "integer", default: 8 },
          },
          required: ["changed_files"],
        },
      },
      {
        name: "review_analysis",
        description:
          "Return actionable review analysis: blast radius, impacted communities, bridge nodes, test gaps, and multimodal/doc safety.",
        inputSchema: {
          type: "object" as const,
          properties: {
            changed_files: {
              type: "array",
              items: { type: "string" },
              description: "Repository-relative changed files",
            },
            max_nodes: { type: "integer", default: 120 },
            max_chains: { type: "integer", default: 12 },
            max_communities: { type: "integer", default: 8 },
          },
          required: ["changed_files"],
        },
      },
      {
        name: "recommend_commits",
        description:
          "Return advisory-only commit grouping recommendations for changed files. Never stages, commits, or mutates branches.",
        inputSchema: {
          type: "object" as const,
          properties: {
            changed_files: {
              type: "array",
              items: { type: "string" },
              description: "Repository-relative changed files",
            },
            max_groups: { type: "integer", default: 6 },
            max_nodes: { type: "integer", default: 60 },
            max_chains: { type: "integer", default: 4 },
          },
          required: ["changed_files"],
        },
      },
      {
        name: "query_graph",
        description:
          "Search the knowledge graph using BFS or DFS. Returns relevant nodes and edges as text context.",
        inputSchema: {
          type: "object" as const,
          properties: {
            question: {
              type: "string",
              description: "Natural language question or keyword search",
            },
            mode: {
              type: "string",
              enum: ["bfs", "dfs"],
              default: "bfs",
              description: "bfs=broad context, dfs=trace a specific path",
            },
            depth: {
              type: "integer",
              default: 3,
              description: "Traversal depth (1-6)",
            },
            token_budget: {
              type: "integer",
              default: 2000,
              description: "Max output tokens",
            },
          },
          required: ["question"],
        },
      },
      {
        name: "get_node",
        description: "Get full details for a specific node by label or ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            label: {
              type: "string",
              description: "Node label or ID to look up",
            },
          },
          required: ["label"],
        },
      },
      {
        name: "get_neighbors",
        description:
          "Get all direct neighbors of a node with edge details.",
        inputSchema: {
          type: "object" as const,
          properties: {
            label: { type: "string" },
            relation_filter: {
              type: "string",
              description: "Optional: filter by relation type",
            },
          },
          required: ["label"],
        },
      },
      {
        name: "get_community",
        description: "Get all nodes in a community by community ID.",
        inputSchema: {
          type: "object" as const,
          properties: {
            community_id: {
              type: "integer",
              description: "Community ID (0-indexed by size)",
            },
          },
          required: ["community_id"],
        },
      },
      {
        name: "god_nodes",
        description:
          "Return the most connected nodes - the core abstractions of the knowledge graph.",
        inputSchema: {
          type: "object" as const,
          properties: {
            top_n: { type: "integer", default: 10 },
          },
        },
      },
      {
        name: "graph_stats",
        description:
          "Return summary statistics: node count, edge count, communities, confidence breakdown.",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "shortest_path",
        description:
          "Find the shortest path between two concepts in the knowledge graph.",
        inputSchema: {
          type: "object" as const,
          properties: {
            source: {
              type: "string",
              description: "Source concept label or keyword",
            },
            target: {
              type: "string",
              description: "Target concept label or keyword",
            },
            max_hops: {
              type: "integer",
              default: 8,
              description: "Maximum hops to consider",
            },
          },
          required: ["source", "target"],
        },
      },
    ];

  if (ontologyWrite) {
    tools.push(
      {
        name: "validate_ontology_patch",
        description:
          "Validate a graphify_ontology_patch_v1 object against the active ontology profile and generated ontology artifacts. Does not mutate files.",
        inputSchema: {
          type: "object" as const,
          properties: {
            patch: {
              type: "object",
              description: "graphify_ontology_patch_v1 object",
            },
          },
          required: ["patch"],
        },
      },
      {
        name: "apply_ontology_patch",
        description:
          "Dry-run by default, or write-apply a graphify_ontology_patch_v1 object through configured authoritative decision logs and local audit logs.",
        inputSchema: {
          type: "object" as const,
          properties: {
            patch: {
              type: "object",
              description: "graphify_ontology_patch_v1 object",
            },
            dry_run: {
              type: "boolean",
              default: true,
              description: "Preview changed files without mutating them.",
            },
            write: {
              type: "boolean",
              default: false,
              description: "Must be true for non-dry-run apply.",
            },
          },
          required: ["patch"],
        },
      },
    );
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: MCP_RESOURCES,
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = String(request.params.uri);
    const resource = MCP_RESOURCES.find((candidate) => candidate.uri === uri);
    const text = readMcpResource(uri, graphPath, G, communities);
    return {
      contents: [
        {
          uri,
          mimeType: resource?.mimeType ?? "text/plain",
          text,
        },
      ],
    };
  });

  const handlers: Record<
    string,
    (args: Record<string, unknown>) => string
  > = {
    first_hop_summary: () => toolFirstHopSummary(G),
    review_delta: (a) => toolReviewDelta(G, a),
    review_analysis: (a) => toolReviewAnalysis(G, a),
    recommend_commits: (a) => toolRecommendCommits(G, a),
    query_graph: (a) => toolQueryGraph(G, a),
    get_node: (a) => toolGetNode(G, a),
    get_neighbors: (a) => toolGetNeighbors(G, a),
    get_community: (a) => toolGetCommunity(communities, G, a),
    god_nodes: (a) => toolGodNodes(G, a),
    graph_stats: () => toolGraphStats(G, communities),
    shortest_path: (a) => toolShortestPath(G, a),
  };
  if (ontologyPatchContext) {
    handlers.validate_ontology_patch = (a) =>
      JSON.stringify(validateOntologyPatch(a.patch, ontologyPatchContext), null, 2);
    handlers.apply_ontology_patch = (a) =>
      JSON.stringify(
        applyOntologyPatch(a.patch, ontologyPatchContext, {
          dryRun: a.write === true ? false : true,
          write: a.write === true,
        }),
        null,
        2,
      );
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return { content: [{ type: "text" as const, text: `Unknown tool: ${name}` }] };
    }
    try {
      const text = handler((args ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: `Error executing ${name}: ${message}` }] };
    }
  });

  const serverTransport = transport ?? new StdioServerTransport();
  let keepAlive: NodeJS.Timeout | undefined;
  if (!transport) {
    keepAlive = setInterval(() => undefined, 60_000);
    process.stdin?.resume();
  }

  const closed = new Promise<void>((resolve) => {
    const previousOnClose = server.onclose;
    server.onclose = () => {
      if (keepAlive) {
        clearInterval(keepAlive);
      }
      previousOnClose?.();
      resolve();
    };
  });

  await server.connect(serverTransport);
  if (transport) {
    await closed;
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectExecution = typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /^serve\.(?:js|mjs|cjs|ts)$/.test(basename(process.argv[1]));

if (isDirectExecution) {
  const graphPath = resolveGraphInputPath(process.argv[2]);
  serve(graphPath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

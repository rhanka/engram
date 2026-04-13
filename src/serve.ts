/**
 * MCP stdio server - exposes graph query tools to Claude and other agents.
 *
 * Uses @modelcontextprotocol/sdk for the server and graphology for the graph.
 */
import { readFileSync } from "node:fs";
import Graph from "graphology";
import { bidirectional } from "graphology-shortest-path/unweighted.js";
import { basename, dirname, resolve } from "node:path";
import {
  forEachTraversalNeighbor,
  loadGraphFromData,
  type SerializedGraphData,
} from "./graph.js";
import { validateGraphPath, sanitizeLabel } from "./security.js";
import { godNodes as computeGodNodes } from "./analyze.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

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

function scoreNodes(G: Graph, terms: string[]): Array<[number, string]> {
  const scored: Array<[number, string]> = [];
  G.forEachNode((nid, data) => {
    const label = ((data.label as string) ?? "").toLowerCase();
    const source = ((data.source_file as string) ?? "").toLowerCase();
    const score =
      terms.reduce((s, t) => s + (label.includes(t) ? 1 : 0), 0) +
      terms.reduce((s, t) => s + (source.includes(t) ? 0.5 : 0), 0);
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
      `NODE ${sanitizeLabel((d.label as string) ?? nid)} [src=${d.source_file ?? ""} loc=${d.source_location ?? ""} community=${d.community ?? ""}]`,
    );
  }
  for (const [u, v] of edges) {
    if (nodes.has(u) && nodes.has(v)) {
      const edgeKey = G.edge(u, v);
      if (!edgeKey) continue;
      const d = G.getEdgeAttributes(edgeKey);
      lines.push(
        `EDGE ${sanitizeLabel((G.getNodeAttribute(u, "label") as string) ?? u)} --${d.relation ?? ""} [${d.confidence ?? ""}]--> ${sanitizeLabel((G.getNodeAttribute(v, "label") as string) ?? v)}`,
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
  const term = label.toLowerCase();
  const result: string[] = [];
  G.forEachNode((nid, d) => {
    if (
      ((d.label as string) ?? "").toLowerCase().includes(term) ||
      nid.toLowerCase() === term
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
    .map((t) => t.toLowerCase());

  const scored = scoreNodes(G, terms);
  const startNodes = scored.slice(0, 3).map(([, nid]) => nid);
  if (startNodes.length === 0) return "No matching nodes found.";

  const { visited, edges } =
    mode === "dfs" ? dfs(G, startNodes, depth) : bfs(G, startNodes, depth);

  const startLabels = startNodes.map(
    (n) => (G.getNodeAttribute(n, "label") as string) ?? n,
  );
  const header = `Traversal: ${mode.toUpperCase()} depth=${depth} | Start: [${startLabels.join(", ")}] | ${visited.size} nodes found\n\n`;
  return header + subgraphToText(G, visited, edges, budget);
}

function toolGetNode(G: Graph, args: Record<string, unknown>): string {
  const label = (args.label as string).toLowerCase();
  const matches: Array<[string, Record<string, unknown>]> = [];
  G.forEachNode((nid, d) => {
    if (
      ((d.label as string) ?? "").toLowerCase().includes(label) ||
      nid.toLowerCase() === label
    ) {
      matches.push([nid, d]);
    }
  });
  if (matches.length === 0) return `No node matching '${label}' found.`;
  const [nid, d] = matches[0]!;
  return [
    `Node: ${d.label ?? nid}`,
    `  ID: ${nid}`,
    `  Source: ${d.source_file ?? ""} ${d.source_location ?? ""}`,
    `  Type: ${d.file_type ?? ""}`,
    `  Community: ${
      d.community_name
        ? `${d.community ?? ""} (${d.community_name as string})`
        : (communityName(G, d.community as number | undefined) ?? String(d.community ?? ""))
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
  const lines = [`Neighbors of ${(G.getNodeAttribute(nid, "label") as string) ?? nid}:`];
  forEachTraversalNeighbor(G, nid, (neighbor) => {
    const edgeKey = G.edge(nid, neighbor);
    if (!edgeKey) return;
    const d = G.getEdgeAttributes(edgeKey);
    const rel = (d.relation as string) ?? "";
    if (relFilter && !rel.toLowerCase().includes(relFilter)) return;
    lines.push(
      `  --> ${(G.getNodeAttribute(neighbor, "label") as string) ?? neighbor} [${rel}] [${d.confidence ?? ""}]`,
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
    lines.push(`  ${d.label ?? n} [${d.source_file ?? ""}]`);
  }
  return lines.join("\n");
}

function toolGodNodes(G: Graph, args: Record<string, unknown>): string {
  const topN = Number(args.top_n ?? 10);
  const nodes = computeGodNodes(G, topN);
  const lines = ["God nodes (most connected):"];
  nodes.forEach((n, i) => {
    lines.push(`  ${i + 1}. ${n.label} - ${n.edges} edges`);
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
    return `No path found between '${(G.getNodeAttribute(srcNid, "label") as string) ?? srcNid}' and '${(G.getNodeAttribute(tgtNid, "label") as string) ?? tgtNid}'.`;
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
      segments.push((G.getNodeAttribute(u, "label") as string) ?? u);
    }
    segments.push(
      `--${rel}${confStr}--> ${(G.getNodeAttribute(v, "label") as string) ?? v}`,
    );
  }
  return `Shortest path (${hops} hops):\n  ${segments.join(" ")}`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export async function serve(
  graphPath: string = "graphify-out/graph.json",
  transport?: Transport,
): Promise<void> {
  let Server: typeof import("@modelcontextprotocol/sdk/server/index.js").Server;
  let StdioServerTransport: typeof import("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport;
  let ListToolsRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").ListToolsRequestSchema;
  let CallToolRequestSchema: typeof import("@modelcontextprotocol/sdk/types.js").CallToolRequestSchema;

  try {
    const serverMod = await import("@modelcontextprotocol/sdk/server/index.js");
    const stdioMod = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const typesMod = await import("@modelcontextprotocol/sdk/types.js");
    Server = serverMod.Server;
    StdioServerTransport = stdioMod.StdioServerTransport;
    ListToolsRequestSchema = typesMod.ListToolsRequestSchema;
    CallToolRequestSchema = typesMod.CallToolRequestSchema;
  } catch {
    throw new Error(
      "@modelcontextprotocol/sdk not installed. Run: npm install @modelcontextprotocol/sdk",
    );
  }

  const G = loadGraph(graphPath);
  const communities = communitiesFromGraph(G);

  const server = new Server(
    { name: "graphify", version: "0.3.17" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
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
    ],
  }));

  const handlers: Record<
    string,
    (args: Record<string, unknown>) => string
  > = {
    query_graph: (a) => toolQueryGraph(G, a),
    get_node: (a) => toolGetNode(G, a),
    get_neighbors: (a) => toolGetNeighbors(G, a),
    get_community: (a) => toolGetCommunity(communities, G, a),
    god_nodes: (a) => toolGodNodes(G, a),
    graph_stats: () => toolGraphStats(G, communities),
    shortest_path: (a) => toolShortestPath(G, a),
  };

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
  const graphPath = process.argv[2] ?? "graphify-out/graph.json";
  serve(graphPath).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { serve } from "../src/serve.js";

const tempDirs: string[] = [];
const tsRoot = fileURLToPath(new URL("..", import.meta.url));
const graphifyOutRoot = join(tsRoot, "graphify-out");
const cliPath = join(tsRoot, "dist/cli.js");

function makeTempDir(): string {
  mkdirSync(graphifyOutRoot, { recursive: true });
  const dir = mkdtempSync(join(graphifyOutRoot, "serve-test-"));
  tempDirs.push(dir);
  return dir;
}

function makeExternalTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-serve-external-"));
  tempDirs.push(dir);
  return dir;
}

function writeFixtureGraph(dir: string): string {
  const graphPath = join(dir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify(
      {
        graph: {
          community_labels: {
            "0": "Core Services",
            "1": "Docs + Analysis",
          },
        },
        nodes: [
          {
            id: "alpha",
            label: "AlphaService",
            source_file: "src/alpha.ts",
            source_location: "10",
            file_type: "code",
            community: 0,
            community_name: "Core Services",
          },
          {
            id: "beta",
            label: "BetaRepository",
            source_file: "src/beta.ts",
            source_location: "24",
            file_type: "code",
            community: 0,
            community_name: "Core Services",
          },
          {
            id: "gamma",
            label: "GammaDocs",
            source_file: "docs/gamma.md",
            source_location: "4",
            file_type: "document",
            community: 1,
            community_name: "Docs + Analysis",
          },
          {
            id: "delta",
            label: "DeltaAnalyzer",
            source_file: "src/delta.ts",
            source_location: "8",
            file_type: "code",
            community: 1,
            community_name: "Docs + Analysis",
          },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
          { source: "beta", target: "gamma", relation: "documents", confidence: "INFERRED" },
          { source: "beta", target: "delta", relation: "calls", confidence: "EXTRACTED" },
        ],
      },
      null,
      2,
    ),
  );
  return graphPath;
}

function toolText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return (result.content ?? [])
    .map((item) => (item.type === "text" ? item.text ?? "" : ""))
    .filter(Boolean)
    .join("\n");
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("MCP stdio server", () => {
  it("handshakes and lists the expected tools", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const result = await client.listTools();
      const names = result.tools.map((tool) => tool.name).sort();

      expect(names).toEqual(
        [
          "get_community",
          "get_neighbors",
          "get_node",
          "god_nodes",
          "graph_stats",
          "query_graph",
          "shortest_path",
        ].sort(),
      );
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("accepts a graph path outside the local graphify-out directory", async () => {
    const dir = makeExternalTempDir();
    const graphPath = writeFixtureGraph(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const stats = toolText(
        await client.callTool({
          name: "graph_stats",
          arguments: {},
        }),
      );
      expect(stats).toContain("Nodes: 4");
      expect(stats).toContain("Edges: 3");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("serves representative tools over stdio", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);

      const query = toolText(
        await client.callTool({
          name: "query_graph",
          arguments: { question: "AlphaService BetaRepository", mode: "bfs", depth: 2 },
        }),
      );
      expect(query).toContain("Traversal: BFS");
      expect(query).toContain("AlphaService");
      expect(query).toContain("BetaRepository");
      expect(query).toContain("GammaDocs");
      expect(query).toContain("DeltaAnalyzer");

      const node = toolText(
        await client.callTool({
          name: "get_node",
          arguments: { label: "AlphaService" },
        }),
      );
      expect(node).toContain("Node: AlphaService");
      expect(node).toContain("Source: src/alpha.ts 10");
      expect(node).toContain("Type: code");
      expect(node).toContain("Community: 0 (Core Services)");

      const neighbors = toolText(
        await client.callTool({
          name: "get_neighbors",
          arguments: { label: "BetaRepository" },
        }),
      );
      expect(neighbors).toContain("Neighbors of BetaRepository:");
      expect(neighbors).toContain("AlphaService [uses] [EXTRACTED]");
      expect(neighbors).toContain("GammaDocs [documents] [INFERRED]");
      expect(neighbors).toContain("DeltaAnalyzer [calls] [EXTRACTED]");

      const community = toolText(
        await client.callTool({
          name: "get_community",
          arguments: { community_id: 0 },
        }),
      );
      expect(community).toContain("Community 0 - Core Services (2 nodes):");
      expect(community).toContain("AlphaService [src/alpha.ts]");
      expect(community).toContain("BetaRepository [src/beta.ts]");

      const stats = toolText(
        await client.callTool({
          name: "graph_stats",
          arguments: {},
        }),
      );
      expect(stats).toContain("Nodes: 4");
      expect(stats).toContain("Edges: 3");
      expect(stats).toContain("Communities: 2");

      const path = toolText(
        await client.callTool({
          name: "shortest_path",
          arguments: { source: "AlphaService", target: "GammaDocs" },
        }),
      );
      expect(path).toContain("Shortest path (2 hops):");
      expect(path).toContain("AlphaService --uses [EXTRACTED]--> BetaRepository");
      expect(path).toContain("BetaRepository --documents [INFERRED]--> GammaDocs");

      const toolError = toolText(
        await client.callTool({
          name: "get_node",
          arguments: {},
        }),
      );
      expect(toolError).toContain("Error executing get_node");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });
});

const cliSmoke = existsSync(cliPath) ? it : it.skip;

cliSmoke("keeps the public graphify serve CLI alive until terminated", async () => {
  const dir = makeTempDir();
  const graphPath = writeFixtureGraph(dir);
  const child = spawn("node", [cliPath, "serve", graphPath], {
    cwd: tsRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(child.exitCode).toBeNull();
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
});

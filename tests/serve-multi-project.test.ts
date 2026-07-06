/**
 * Multi-project MCP serving — port of upstream safishamsi 9e7fbcb (#1594).
 *
 * Every graph-backed MCP tool accepts an optional absolute `project_path`;
 * omitted, the server answers against its default graph (fully backward
 * compatible); supplied, the call is routed to that project's
 * `.graphify/graph.json` with its own mtime+size hot-reload. A missing or
 * corrupt project graph is a tool error, never a process exit.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { serve } from "../src/serve.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function graphJson(nodeId: string, label: string): string {
  return JSON.stringify({
    directed: false,
    graph: {},
    nodes: [
      { id: nodeId, label, source_file: `src/${nodeId}.ts`, file_type: "code", community: 0 },
    ],
    links: [],
  });
}

async function withServer(
  graphPath: string,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverPromise = serve(graphPath, serverTransport);
  const client = new Client({ name: "graphify-multi-project-test", version: "0.0.0" });
  try {
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close().catch(() => undefined);
    await clientTransport.close().catch(() => undefined);
    await serverPromise.catch(() => undefined);
  }
}

function toolText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as Array<{ type: string; text: string }>)
    .map((c) => c.text)
    .join("\n");
}

describe("multi-project MCP serving (upstream 9e7fbcb)", () => {
  it("exposes an optional project_path on every tool", async () => {
    const dir = makeTempDir("graphify-mp-tools-");
    const graphPath = join(dir, "graph.json");
    writeFileSync(graphPath, graphJson("alpha", "AlphaService"));

    await withServer(graphPath, async (client) => {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        const schema = tool.inputSchema as {
          properties?: Record<string, unknown>;
          required?: string[];
        };
        expect(schema.properties?.project_path, `tool ${tool.name}`).toBeDefined();
        expect(schema.required ?? []).not.toContain("project_path");
      }
    });
  });

  it("routes a call to the requested project graph and defaults without it", async () => {
    const defaultDir = makeTempDir("graphify-mp-default-");
    const defaultGraph = join(defaultDir, "graph.json");
    writeFileSync(defaultGraph, graphJson("alpha", "AlphaService"));

    const projectRoot = makeTempDir("graphify-mp-project-");
    mkdirSync(join(projectRoot, ".graphify"), { recursive: true });
    writeFileSync(join(projectRoot, ".graphify", "graph.json"), graphJson("beta", "BetaRepository"));

    await withServer(defaultGraph, async (client) => {
      const defaultAnswer = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "AlphaService" },
      }));
      expect(defaultAnswer).toContain("AlphaService");

      const routed = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "BetaRepository", project_path: projectRoot },
      }));
      expect(routed).toContain("BetaRepository");

      // The routed project does not know the default graph's node…
      const missOnProject = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "AlphaService", project_path: projectRoot },
      }));
      expect(missOnProject).toContain("No node matching");

      // …and the default graph is still served when project_path is omitted.
      const stillDefault = toolText(await client.callTool({
        name: "graph_stats",
        arguments: {},
      }));
      expect(stillDefault).toContain("Nodes: 1");
    });
  });

  it("treats a bad project_path as a tool error and keeps serving", async () => {
    const defaultDir = makeTempDir("graphify-mp-bad-");
    const defaultGraph = join(defaultDir, "graph.json");
    writeFileSync(defaultGraph, graphJson("alpha", "AlphaService"));

    await withServer(defaultGraph, async (client) => {
      const missing = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "AlphaService", project_path: join(defaultDir, "no-such-project") },
      }));
      expect(missing).toContain("Error executing get_node");

      const relative = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "AlphaService", project_path: "relative/path" },
      }));
      expect(relative).toContain("project_path must be an absolute path");

      // The server survives both errors and still answers on the default graph.
      const alive = toolText(await client.callTool({
        name: "get_node",
        arguments: { label: "AlphaService" },
      }));
      expect(alive).toContain("AlphaService");
    });
  });
});

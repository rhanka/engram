import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildMerge } from "../src/build.js";
import { main } from "../src/cli.js";
import { toJson } from "../src/export.js";
import type { Extraction } from "../src/types.js";
import { validateExtraction } from "../src/validate.js";

const cleanupDirs: string[] = [];

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-fragment-gate-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

async function runCli(args: string[], cwd: string) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const logs: string[] = [];

  console.log = (...items: unknown[]) => {
    logs.push(items.join(" "));
  };
  process.argv = ["node", "graphify", ...args];
  process.chdir(cwd);
  try {
    await main();
    return { logs };
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
  }
}

function conversationFragment(): Extraction {
  return {
    provenance: {
      source_owner: "agent-stats",
      source_id: "conversation:codex:wp3",
      observed_at: "2026-06-13T10:00:00.000Z",
      source_hash: "sha256:conversation-fragment",
      adapter_version: "agent-stats@0.1.0",
      ttl: "P30D",
    },
    nodes: [
      {
        id: "conversation:codex:wp3",
        label: "WP3 Fragment Gate",
        file_type: "document",
        source_file: "agent-stats/conversations/wp3.jsonl",
        node_type: "Conversation",
      },
      {
        id: "agent-session:codex:wp3",
        label: "Codex WP3 session",
        file_type: "document",
        source_file: "agent-stats/conversations/wp3.jsonl",
        node_type: "AgentSession",
      },
    ],
    edges: [
      {
        source: "agent-session:codex:wp3",
        target: "conversation:codex:wp3",
        relation: "participates_in",
        confidence: "EXTRACTED",
        source_file: "agent-stats/conversations/wp3.jsonl",
      },
    ],
    input_tokens: 12,
    output_tokens: 4,
  };
}

describe("fragment ingestion gate", () => {
  it("accepts legacy extractions without provenance", () => {
    expect(validateExtraction({
      nodes: [{ id: "a", label: "A", file_type: "code", source_file: "src/a.ts" }],
      edges: [],
      input_tokens: 0,
      output_tokens: 0,
    })).toEqual([]);
  });

  it("round-trips provenance and non-code node_type through buildMerge graph.json", () => {
    const dir = tempProject();
    const graphPath = join(dir, ".graphify", "graph.json");
    const fragment = conversationFragment();
    mkdirSync(join(dir, ".graphify"), { recursive: true });

    expect(validateExtraction(fragment)).toEqual([]);

    const graph = buildMerge([fragment], { graphPath });
    toJson(graph, new Map(), graphPath, { force: true });

    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      graph?: { provenance?: unknown };
      nodes?: Array<{ id?: string; node_type?: string }>;
      links?: Array<{ source?: string; target?: string; relation?: string }>;
    };

    expect(persisted.graph?.provenance).toEqual(fragment.provenance);
    expect(persisted.nodes?.find((node) => node.id === "conversation:codex:wp3")?.node_type)
      .toBe("Conversation");
    expect(persisted.links).toContainEqual(expect.objectContaining({
      source: "agent-session:codex:wp3",
      target: "conversation:codex:wp3",
      relation: "participates_in",
    }));
  });

  it("ingests a validated fragment through graphify build --fragment", async () => {
    const dir = tempProject();
    const graphifyDir = join(dir, ".graphify");
    const fragmentPath = join(dir, "conversation-fragment.json");
    const graphPath = join(graphifyDir, "graph.json");
    mkdirSync(graphifyDir, { recursive: true });
    writeFileSync(fragmentPath, JSON.stringify(conversationFragment(), null, 2), "utf-8");

    const result = await runCli(["build", "--fragment", fragmentPath], dir);

    expect(result.logs.join("\n")).toContain("ingested fragment");
    expect(existsSync(graphPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      graph?: { provenance?: unknown };
      nodes?: Array<{ id?: string; node_type?: string }>;
    };
    expect(persisted.graph?.provenance).toEqual(conversationFragment().provenance);
    expect(persisted.nodes?.find((node) => node.id === "agent-session:codex:wp3")?.node_type)
      .toBe("AgentSession");
  });
});

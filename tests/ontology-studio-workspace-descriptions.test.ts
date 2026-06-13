import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { renderOntologyStudioWorkspace } from "../src/ontology-studio-workspace.js";
import type { OntologyPatchContext } from "../src/ontology-patch.js";
import { WIKI_DESCRIPTION_PROMPT_VERSION, buildWikiDescriptionCacheKey } from "../src/wiki-descriptions.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-studio-workspace-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

function context(rootDir: string): OntologyPatchContext {
  const stateDir = join(rootDir, ".graphify");
  return {
    rootDir,
    stateDir,
    graphHash: "graph-hash",
    profile: { id: "test-profile", profile_hash: "profile-hash" } as never,
    profileState: {} as never,
    nodes: [],
    relations: [],
    evidenceRefs: new Set<string>(),
  };
}

function writeGraph(stateDir: string, description?: string): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, "graph.json"),
    JSON.stringify({
      directed: false,
      graph: {},
      nodes: [
        {
          id: "alpha",
          label: "AlphaService",
          node_type: "Service",
          ...(description ? { description } : {}),
        },
      ],
      links: [],
    }, null, 2),
    "utf-8",
  );
}

function graphHash(stateDir: string): string {
  return createHash("sha256").update(readFileSync(join(stateDir, "graph.json"))).digest("hex");
}

function generatedDescriptionSidecar(
  stateDir: string,
  description: string,
  options: { graph_hash?: string; prompt_version?: string; target_id?: string } = {},
): Record<string, unknown> {
  const graph_hash = options.graph_hash ?? graphHash(stateDir);
  const prompt_version = options.prompt_version ?? WIKI_DESCRIPTION_PROMPT_VERSION;
  const target_id = options.target_id ?? "alpha";
  return {
    schema: "graphify_wiki_description_v1",
    target_id,
    target_kind: "node",
    graph_hash,
    status: "generated",
    description,
    evidence_refs: ["src/alpha.ts"],
    confidence: 0.9,
    cache_key: buildWikiDescriptionCacheKey({
      target_id,
      target_kind: "node",
      graph_hash,
      prompt_version,
      mode: "direct",
      provider: "openai",
      model: "mock",
    }),
    generator: {
      mode: "direct",
      provider: "openai",
      model: "mock",
      prompt_version,
    },
  };
}

function writeDescriptionIndex(stateDir: string, entry: Record<string, unknown>, filename = "descriptions.json"): void {
  const wikiDir = join(stateDir, "wiki");
  mkdirSync(wikiDir, { recursive: true });
  writeFileSync(
    join(wikiDir, filename),
    JSON.stringify({
      schema: "graphify_wiki_description_index_v1",
      graph_hash: entry.graph_hash ?? graphHash(stateDir),
      prompt_version: (entry.generator as { prompt_version?: unknown } | undefined)?.prompt_version ?? WIKI_DESCRIPTION_PROMPT_VERSION,
      nodes: { alpha: entry },
    }, null, 2),
    "utf-8",
  );
}

describe("ontology studio workspace description resolution", () => {
  it("prefers graph.json inline descriptions over wiki sidecars", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir, "Inline canonical description.");
    writeDescriptionIndex(ctx.stateDir, {
      schema: "graphify_wiki_description_v1",
      target_id: "alpha",
      target_kind: "node",
      graph_hash: "graph-hash",
      status: "generated",
      description: "Derived wiki sidecar description.",
      evidence_refs: ["src/alpha.ts"],
      confidence: 0.9,
      cache_key: "cache-key",
      generator: {
        mode: "direct",
        provider: "openai",
        model: "mock",
        prompt_version: "wiki-description-v1",
      },
    });

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).toContain("Inline canonical description.");
    expect(html).not.toContain("Derived wiki sidecar description.");
  });

  it("does not render pending wiki sidecars as descriptions", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir);
    writeDescriptionIndex(ctx.stateDir, {
      target_id: "alpha",
      target_kind: "node",
      status: "pending",
      description: "Pending assistant output.",
    });

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).not.toContain("Pending assistant output.");
    expect(html).not.toContain('class="ws-entity-description"');
  });

  it("does not render generated wiki sidecars from a stale graph hash", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir);
    writeDescriptionIndex(ctx.stateDir, {
      schema: "graphify_wiki_description_v1",
      target_id: "alpha",
      target_kind: "node",
      graph_hash: "old-graph-hash",
      status: "generated",
      description: "Stale wiki sidecar description.",
      evidence_refs: ["src/alpha.ts"],
      confidence: 0.9,
      cache_key: "cache-key",
      generator: {
        mode: "direct",
        provider: "openai",
        model: "mock",
        prompt_version: "wiki-description-v1",
      },
    });

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).not.toContain("Stale wiki sidecar description.");
    expect(html).not.toContain('class="ws-entity-description"');
  });

  it("falls back to canonical descriptions when assistant-merged descriptions are stale", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir);
    writeDescriptionIndex(
      ctx.stateDir,
      generatedDescriptionSidecar(ctx.stateDir, "Stale merged description.", {
        graph_hash: "old-graph-hash",
      }),
      "descriptions.assistant-merged.json",
    );
    writeDescriptionIndex(
      ctx.stateDir,
      generatedDescriptionSidecar(ctx.stateDir, "Fresh canonical description."),
      "descriptions.json",
    );

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).toContain("Fresh canonical description.");
    expect(html).not.toContain("Stale merged description.");
  });

  it("falls back to canonical descriptions when assistant-merged lacks the selected node", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir);
    const currentHash = graphHash(ctx.stateDir);
    const wikiDir = join(ctx.stateDir, "wiki");
    mkdirSync(wikiDir, { recursive: true });
    writeFileSync(
      join(wikiDir, "descriptions.assistant-merged.json"),
      JSON.stringify({
        schema: "graphify_wiki_description_index_v1",
        graph_hash: currentHash,
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        nodes: {
          other: generatedDescriptionSidecar(ctx.stateDir, "Fresh description for another node.", {
            target_id: "other",
          }),
        },
      }, null, 2),
      "utf-8",
    );
    writeDescriptionIndex(
      ctx.stateDir,
      generatedDescriptionSidecar(ctx.stateDir, "Fresh selected-node description."),
      "descriptions.json",
    );

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).toContain("Fresh selected-node description.");
    expect(html).not.toContain("Fresh description for another node.");
  });

  it("keeps a selected legacy sidecar when another node has complete freshness metadata", () => {
    const rootDir = makeTempDir();
    const ctx = context(rootDir);
    writeGraph(ctx.stateDir);
    const currentHash = graphHash(ctx.stateDir);
    writeDescriptionIndex(
      ctx.stateDir,
      {
        status: "generated",
        description: "Legacy selected-node description.",
      },
      "descriptions.json",
    );
    const wikiDir = join(ctx.stateDir, "wiki");
    const index = JSON.parse(readFileSync(join(wikiDir, "descriptions.json"), "utf-8")) as {
      nodes: Record<string, unknown>;
      graph_hash: string;
    };
    index.graph_hash = currentHash;
    index.nodes.other = generatedDescriptionSidecar(ctx.stateDir, "Fully stamped other-node description.", {
      target_id: "other",
    });
    writeFileSync(join(wikiDir, "descriptions.json"), JSON.stringify(index, null, 2), "utf-8");

    const html = renderOntologyStudioWorkspace(ctx, {
      writeEnabled: false,
      activeView: "workspace",
      selectedNodeId: "alpha",
    });

    expect(html).toContain("Legacy selected-node description.");
    expect(html).not.toContain("Fully stamped other-node description.");
  });
});

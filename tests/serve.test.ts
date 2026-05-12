import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { serve } from "../src/serve.js";
import { ONTOLOGY_PATCH_SCHEMA, type OntologyPatch } from "../src/ontology-patch.js";

const tempDirs: string[] = [];
const tsRoot = fileURLToPath(new URL("..", import.meta.url));
const graphifyOutRoot = join(tsRoot, "graphify-out");
const cliPath = join(tsRoot, "dist/cli.js");
const packageVersion = JSON.parse(readFileSync(join(tsRoot, "package.json"), "utf-8")).version as string;

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

function writeFixtureGraph(dir: string, directed: boolean = false): string {
  const graphPath = join(dir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify(
      {
        directed,
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

function rewriteFixtureGraphWithEdgesKey(graphPath: string): void {
  const data = JSON.parse(readFileSync(graphPath, "utf-8")) as {
    links?: unknown[];
    edges?: unknown[];
  };
  data.edges = data.links;
  delete data.links;
  writeFileSync(graphPath, JSON.stringify(data, null, 2), "utf-8");
}

function toolText(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return (result.content ?? [])
    .map((item) => (item.type === "text" ? item.text ?? "" : ""))
    .filter(Boolean)
    .join("\n");
}

function resourceText(result: { contents?: Array<{ text?: string }> }): string {
  return (result.contents ?? [])
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function writeOntologyPatchFixture(root: string): {
  graphPath: string;
  profileStatePath: string;
  decisionsPath: string;
  stateDir: string;
  candidatesPath: string;
  auditPath: string;
  patch: OntologyPatch;
} {
  const stateDir = join(root, ".graphify");
  const profileDir = join(stateDir, "profile");
  const ontologyDir = join(stateDir, "ontology");
  const reconciliationDir = join(ontologyDir, "reconciliation");
  const decisionsPath = join(root, "graphify", "reconciliation", "decisions.jsonl");
  const candidatesPath = join(reconciliationDir, "candidates.json");
  const auditPath = join(reconciliationDir, "applied-patches.jsonl");
  mkdirSync(profileDir, { recursive: true });
  mkdirSync(ontologyDir, { recursive: true });
  const graphPath = writeFixtureGraph(stateDir);
  const profileHash = "profile-hash";
  const graphHash = "graph-hash";
  const profileStatePath = join(profileDir, "profile-state.json");
  writeFileSync(
    profileStatePath,
    JSON.stringify({
      profile_id: "synthetic",
      profile_version: "1",
      profile_hash: profileHash,
      project_config_path: join(root, "graphify.yaml"),
      ontology_profile_path: join(root, "graphify", "ontology-profile.yaml"),
      state_dir: stateDir,
      detect_roots: [join(root, "docs")],
      exclude_roots: [],
      registry_counts: {},
      registry_node_count: 0,
      semantic_file_count: 1,
      transcript_count: 0,
      pdf_artifact_count: 0,
    }, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(profileDir, "ontology-profile.normalized.json"),
    JSON.stringify({
      id: "synthetic",
      version: "1",
      default_language: "en",
      profile_hash: profileHash,
      node_types: { Component: {} },
      relation_types: {},
      registries: {},
      citation_policy: { minimum_granularity: "page", require_source_file: true, allow_bbox: "when_available" },
      hardening: { statuses: ["candidate", "validated"], default_status: "candidate", promotion_requires: [], status_transitions: [] },
      inference_policy: { allow_inferred_relations: true, allowed_relation_types: [], require_evidence_refs: false },
      evidence_policy: { require_evidence_refs: false, min_refs: 0, node_types: [], relation_types: [] },
      hierarchies: {},
      outputs: {
        ontology: {
          enabled: true,
          artifact_schema: "graphify_ontology_outputs_v1",
          canonical_node_types: ["Component"],
          source_node_types: [],
          occurrence_node_types: [],
          alias_fields: [],
          relation_exports: [],
          wiki: { enabled: false, page_node_types: [], include_backlinks: false, include_source_snippets: false },
        },
      },
    }, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(profileDir, "project-config.normalized.json"),
    JSON.stringify({
      version: 1,
      sourcePath: join(root, "graphify.yaml"),
      configDir: root,
      profile: { path: "graphify/ontology-profile.yaml", resolvedPath: join(root, "graphify", "ontology-profile.yaml") },
      inputs: { corpus: [join(root, "docs")], scope: "all", scope_source: "configured-default", registries: [], registrySources: {}, generated: [], exclude: [] },
      dataprep: {
        pdf_ocr: "auto",
        prefer_ocr_markdown: true,
        use_extracted_pdf_images: true,
        full_page_screenshot_vision: false,
        citation_minimum: "page",
        preserve_source_structure: true,
        image_analysis: {
          enabled: false,
          mode: "off",
          artifact_source: "ocr_crops",
          caption_schema: "generic_image_caption_v1",
          routing_profile: "generic_image_routing_v1",
          primary_model: null,
          deep_model: null,
          calibration: { rules_path: null, resolvedRulesPath: null, labels_path: null, resolvedLabelsPath: null },
          max_markdown_context_chars: 8000,
          batch: { completion_window: "24h", output_dir: join(stateDir, "image-dataprep", "batch") },
        },
      },
      llm_execution: { mode: "assistant", provider: null, text_json: { model: "" }, vision_json: { primary_model: "", deep_model: "" }, batch: { provider: "", completion_window: "24h" }, mesh: { adapter: "" } },
      outputs: {
        state_dir: stateDir,
        write_html: true,
        write_wiki: false,
        write_profile_report: true,
        ontology: { reconciliation: { decisions_path: decisionsPath, patches_path: null } },
      },
    }, null, 2),
    "utf-8",
  );
  writeFileSync(join(ontologyDir, "manifest.json"), JSON.stringify({ graph_hash: graphHash, profile_hash: profileHash }, null, 2), "utf-8");
  writeFileSync(
    join(ontologyDir, "nodes.json"),
    JSON.stringify([
      { id: "candidate-component", type: "Component", status: "candidate", source_refs: ["manual.md#p1"] },
      { id: "component-a", type: "Component", status: "validated", source_refs: ["manual.md#p1"] },
    ], null, 2),
    "utf-8",
  );
  writeFileSync(join(ontologyDir, "relations.json"), "[]", "utf-8");
  writeFileSync(join(ontologyDir, "sources.json"), JSON.stringify([{ id: "manual.md#p1" }], null, 2), "utf-8");
  return {
    graphPath,
    profileStatePath,
    decisionsPath,
    stateDir,
    candidatesPath,
    auditPath,
    patch: {
      schema: ONTOLOGY_PATCH_SCHEMA,
      id: "patch-mcp-001",
      operation: "accept_match",
      status: "proposed",
      profile_hash: profileHash,
      graph_hash: graphHash,
      target: { candidate_id: "candidate-component", canonical_id: "component-a" },
      evidence_refs: ["manual.md#p1"],
      reason: "Synthetic MCP patch.",
      author: "tester",
      created_at: "2026-05-05T00:00:00.000Z",
    },
  };
}

function writeOntologyReconciliationFixture(root: string): ReturnType<typeof writeOntologyPatchFixture> {
  const fixture = writeOntologyPatchFixture(root);
  mkdirSync(join(root, "graphify", "reconciliation"), { recursive: true });
  mkdirSync(join(fixture.stateDir, "ontology", "reconciliation"), { recursive: true });
  writeFileSync(
    fixture.candidatesPath,
    JSON.stringify({
      schema: "graphify_ontology_reconciliation_candidates_v1",
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      generated_at: "2026-05-09T00:00:00.000Z",
      candidate_count: 2,
      candidates: [
        {
          id: "candidate-high",
          kind: "entity_match",
          status: "candidate",
          score: 0.91,
          candidate_id: "candidate-component",
          canonical_id: "component-a",
          shared_terms: ["component"],
          evidence_refs: ["manual.md#p1"],
          reasons: ["same node type: Component"],
          proposed_patch_operation: "accept_match",
        },
        {
          id: "candidate-low",
          kind: "entity_match",
          status: "candidate",
          score: 0.52,
          candidate_id: "other-component",
          canonical_id: "component-a",
          shared_terms: ["other"],
          evidence_refs: ["manual.md#p2"],
          reasons: ["shared normalized term(s): other"],
          proposed_patch_operation: "accept_match",
        },
      ],
    }, null, 2),
    "utf-8",
  );
  writeFileSync(
    fixture.decisionsPath,
    JSON.stringify({ ...fixture.patch, id: "decision-authoritative", created_at: "2026-05-10T00:00:00.000Z" }) + "\n",
    "utf-8",
  );
  writeFileSync(
    fixture.auditPath,
    JSON.stringify({
      patch: { ...fixture.patch, id: "decision-audit", created_at: "2026-05-11T00:00:00.000Z" },
      applied_at: "2026-05-11T01:00:00.000Z",
    }) + "\n",
    "utf-8",
  );
  writeFileSync(join(fixture.stateDir, "needs_update"), "ontology patch applied: fixture\n", "utf-8");
  return fixture;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("MCP stdio server", () => {
  it("announces the package version during MCP initialization", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      expect(client.getServerVersion()).toEqual({ name: "graphify", version: packageVersion });
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

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
          "first_hop_summary",
          "review_delta",
          "review_analysis",
          "recommend_commits",
          "query_graph",
          "shortest_path",
        ].sort(),
      );
      expect(names).not.toContain("validate_ontology_patch");
      expect(names).not.toContain("apply_ontology_patch");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("lists upstream-compatible graph resources", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const result = await client.listResources();
      const resources = result.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        mimeType: resource.mimeType,
      }));

      expect(resources).toEqual(
        expect.arrayContaining([
          { uri: "graphify://report", name: "Graph Report", mimeType: "text/markdown" },
          { uri: "graphify://stats", name: "Graph Stats", mimeType: "text/plain" },
          { uri: "graphify://god-nodes", name: "God Nodes", mimeType: "text/plain" },
          { uri: "graphify://surprises", name: "Surprising Connections", mimeType: "text/plain" },
          { uri: "graphify://audit", name: "Confidence Audit", mimeType: "text/plain" },
          { uri: "graphify://questions", name: "Suggested Questions", mimeType: "text/plain" },
        ]),
      );
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("reads upstream-compatible graph resources", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    writeFileSync(join(dir, "GRAPH_REPORT.md"), "# Fixture Graph Report\n\n## Summary\n", "utf-8");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);

      expect(resourceText(await client.readResource({ uri: "graphify://report" }))).toContain(
        "# Fixture Graph Report",
      );

      const stats = resourceText(await client.readResource({ uri: "graphify://stats" }));
      expect(stats).toContain("Nodes: 4");
      expect(stats).toContain("Edges: 3");
      expect(stats).toContain("Communities: 2");

      const godNodes = resourceText(await client.readResource({ uri: "graphify://god-nodes" }));
      expect(godNodes).toContain("God nodes (most connected):");
      expect(godNodes).toContain("BetaRepository");

      const surprises = resourceText(await client.readResource({ uri: "graphify://surprises" }));
      expect(surprises).toContain("Surprising cross-community connections:");
      expect(surprises).toContain("BetaRepository <-> GammaDocs [documents]");

      const audit = resourceText(await client.readResource({ uri: "graphify://audit" }));
      expect(audit).toContain("Total edges: 3");
      expect(audit).toContain("EXTRACTED: 2 (67%)");
      expect(audit).toContain("INFERRED: 1 (33%)");
      expect(audit).toContain("AMBIGUOUS: 0 (0%)");

      const questions = resourceText(await client.readResource({ uri: "graphify://questions" }));
      expect(questions).toContain("Suggested questions:");
      expect(questions).toContain("`BetaRepository`");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("loads graph JSON resources and tools when edges is used instead of links", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir);
    rewriteFixtureGraphWithEdgesKey(graphPath);
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
      expect(stats).toContain("Edges: 3");

      const audit = resourceText(await client.readResource({ uri: "graphify://audit" }));
      expect(audit).toContain("Total edges: 3");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("scrubs control characters from MCP graph text fields", async () => {
    const dir = makeTempDir();
    const graphPath = join(dir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          {
            id: "alpha",
            label: "Alpha\rNode",
            source_file: "src/alpha.ts\r\nInjected: true",
            source_location: "10\n20",
            file_type: "code\rmalicious",
            community: 0,
          },
          {
            id: "beta",
            label: "Beta\nNode",
            source_file: "src/beta.ts",
            file_type: "code",
            community: 0,
          },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses\nmalicious", confidence: "EXTRACTED\rspoof" },
        ],
      }, null, 2),
      "utf-8",
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);

      const node = toolText(
        await client.callTool({
          name: "get_node",
          arguments: { label: "alpha" },
        }),
      );
      const neighbors = toolText(
        await client.callTool({
          name: "get_neighbors",
          arguments: { label: "alpha" },
        }),
      );

      expect(node.includes("\r")).toBe(false);
      expect(neighbors.includes("\r")).toBe(false);
      expect(node).not.toContain("Injected: true\n");
      expect(neighbors).not.toContain("uses\nmalicious");
      expect(neighbors).toContain("[usesmalicious] [EXTRACTEDspoof]");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("exposes ontology mutation tools only in explicit write mode", async () => {
    const dir = makeExternalTempDir();
    const { graphPath, profileStatePath, decisionsPath, patch } = writeOntologyPatchFixture(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport, {
      ontology: { write: true, profileStatePath },
    });
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(["validate_ontology_patch", "apply_ontology_patch"]));

      const validate = JSON.parse(toolText(await client.callTool({
        name: "validate_ontology_patch",
        arguments: { patch },
      })));
      const dryRun = JSON.parse(toolText(await client.callTool({
        name: "apply_ontology_patch",
        arguments: { patch, dry_run: true },
      })));
      const write = JSON.parse(toolText(await client.callTool({
        name: "apply_ontology_patch",
        arguments: { patch, write: true },
      })));

      expect(validate.valid).toBe(true);
      expect(dryRun.dry_run).toBe(true);
      expect(write.valid).toBe(true);
      expect(readFileSync(decisionsPath, "utf-8")).toContain("patch-mcp-001");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("exposes read-only ontology reconciliation tools when profile state is configured", async () => {
    const dir = makeExternalTempDir();
    const { graphPath, profileStatePath } = writeOntologyReconciliationFixture(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport, {
      ontology: { profileStatePath },
    });
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        "list_reconciliation_candidates",
        "get_reconciliation_candidate",
        "preview_ontology_decision_log",
        "ontology_rebuild_status",
      ]));
      expect(names).not.toContain("validate_ontology_patch");
      expect(names).not.toContain("apply_ontology_patch");

      const candidates = JSON.parse(toolText(await client.callTool({
        name: "list_reconciliation_candidates",
        arguments: {
          canonical_id: "component-a",
          min_score: 0.8,
          query: "component",
          sort: "score",
          order: "desc",
          limit: 1,
          offset: 0,
        },
      })));
      expect(candidates.schema).toBe("graphify_ontology_reconciliation_candidates_response_v1");
      expect(candidates.total).toBe(1);
      expect(candidates.items).toMatchObject([
        {
          id: "candidate-high",
          canonical_id: "component-a",
          candidate_id: "candidate-component",
        },
      ]);

      const candidate = JSON.parse(toolText(await client.callTool({
        name: "get_reconciliation_candidate",
        arguments: { id: "candidate-high" },
      })));
      expect(candidate).toMatchObject({
        id: "candidate-high",
        proposed_patch_operation: "accept_match",
      });

      const missing = toolText(await client.callTool({
        name: "get_reconciliation_candidate",
        arguments: { id: "does-not-exist" },
      }));
      expect(missing).toContain("Error executing get_reconciliation_candidate");
      expect(missing).toContain("reconciliation candidate not found: does-not-exist");

      const logPreview = JSON.parse(toolText(await client.callTool({
        name: "preview_ontology_decision_log",
        arguments: { limit: 10, offset: 0 },
      })));
      expect(logPreview.schema).toBe("graphify_ontology_reconciliation_decision_log_v1");
      expect(logPreview.total).toBe(2);
      expect(logPreview.items.map((item: { source: string }) => item.source)).toEqual([
        "authoritative",
        "audit",
      ]);
      expect(logPreview.items.map((item: { patch: { id: string } }) => item.patch.id)).toEqual([
        "decision-authoritative",
        "decision-audit",
      ]);

      const status = JSON.parse(toolText(await client.callTool({
        name: "ontology_rebuild_status",
        arguments: {},
      })));
      expect(status).toMatchObject({
        schema: "graphify_ontology_rebuild_status_v1",
        needs_update: true,
        graph_hash: "graph-hash",
        profile_hash: "profile-hash",
        candidates: {
          path: "ontology/reconciliation/candidates.json",
          exists: true,
          readable: true,
          candidate_count: 2,
          graph_hash: "graph-hash",
          profile_hash: "profile-hash",
          consistent_with_context: true,
        },
      });
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("reports a clear read-only ontology error when reconciliation candidates are missing", async () => {
    const dir = makeExternalTempDir();
    const { graphPath, profileStatePath } = writeOntologyPatchFixture(dir);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport, {
      ontology: { profileStatePath },
    });
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const result = toolText(await client.callTool({
        name: "list_reconciliation_candidates",
        arguments: {},
      }));
      expect(result).toContain("Error executing list_reconciliation_candidates");
      expect(result).toContain("reconciliation candidates file not found: ontology/reconciliation/candidates.json");
    } finally {
      await client.close().catch(() => undefined);
      await clientTransport.close().catch(() => undefined);
      await serverPromise.catch(() => undefined);
    }
  });

  it("marks reconciliation candidate responses stale when hashes no longer match", async () => {
    const dir = makeExternalTempDir();
    const fixture = writeOntologyReconciliationFixture(dir);
    rmSync(join(fixture.stateDir, "needs_update"), { force: true });
    const queue = JSON.parse(readFileSync(fixture.candidatesPath, "utf-8")) as Record<string, unknown>;
    writeFileSync(
      fixture.candidatesPath,
      JSON.stringify({ ...queue, graph_hash: "stale-graph-hash" }, null, 2),
      "utf-8",
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(fixture.graphPath, serverTransport, {
      ontology: { profileStatePath: fixture.profileStatePath },
    });
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);
      const candidates = JSON.parse(toolText(await client.callTool({
        name: "list_reconciliation_candidates",
        arguments: {},
      })));
      expect(candidates.stale).toBe(true);

      const status = JSON.parse(toolText(await client.callTool({
        name: "ontology_rebuild_status",
        arguments: {},
      })));
      expect(status.candidates.consistent_with_context).toBe(false);
      expect(status.candidates.issues).toContain("candidates graph_hash does not match active graph");
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

      const firstHop = toolText(
        await client.callTool({
          name: "first_hop_summary",
          arguments: {},
        }),
      );
      expect(firstHop).toContain("Graphify First-Hop Summary");
      expect(firstHop).toContain("Graph: 4 nodes, 3 edges, 2 communities, density 0.5");
      expect(firstHop).toContain("BetaRepository (degree 3, community 0 Core Services, src/beta.ts)");
      expect(firstHop).toContain("Next best action: Start with get_neighbors on \"BetaRepository\"");

      const reviewDelta = toolText(
        await client.callTool({
          name: "review_delta",
          arguments: { changed_files: ["src/beta.ts"] },
        }),
      );
      expect(reviewDelta).toContain("Graphify Review Delta");
      expect(reviewDelta).toContain("src/beta.ts");
      expect(reviewDelta).toContain("GammaDocs");
      expect(reviewDelta).toContain("Likely test gaps:");

      const reviewAnalysis = toolText(
        await client.callTool({
          name: "review_analysis",
          arguments: { changed_files: ["src/beta.ts"] },
        }),
      );
      expect(reviewAnalysis).toContain("Graphify Review Analysis");
      expect(reviewAnalysis).toContain("Blast radius:");
      expect(reviewAnalysis).toContain("Impacted communities:");

      const commitRecommendation = toolText(
        await client.callTool({
          name: "recommend_commits",
          arguments: { changed_files: ["src/beta.ts"] },
        }),
      );
      expect(commitRecommendation).toContain("Graphify Commit Recommendation");
      expect(commitRecommendation).toContain("Advisory only");
      expect(commitRecommendation).toContain("src/beta.ts");
      expect(commitRecommendation).toContain("Suggested commit groups:");

      const path = toolText(
        await client.callTool({
          name: "shortest_path",
          arguments: { source: "AlphaService", target: "GammaDocs" },
        }),
      );
      expect(path).toContain("Shortest path (2 hops):");
      expect(path).toContain("AlphaService --uses [EXTRACTED]--> BetaRepository");
      expect(path).toContain("BetaRepository --documents [INFERRED]--> GammaDocs");

      const sameNodePath = toolText(
        await client.callTool({
          name: "shortest_path",
          arguments: { source: "AlphaService", target: "AlphaService" },
        }),
      );
      expect(sameNodePath).toContain("both resolved to the same node");

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

  it("preserves directed graph traversal semantics when graph.json is directed", async () => {
    const dir = makeTempDir();
    const graphPath = writeFixtureGraph(dir, true);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverPromise = serve(graphPath, serverTransport);
    const client = new Client({ name: "graphify-serve-test", version: "0.0.0" });

    try {
      await client.connect(clientTransport);

      const betaNeighbors = toolText(
        await client.callTool({
          name: "get_neighbors",
          arguments: { label: "BetaRepository" },
        }),
      );
      expect(betaNeighbors).toContain("GammaDocs [documents] [INFERRED]");
      expect(betaNeighbors).toContain("DeltaAnalyzer [calls] [EXTRACTED]");
      expect(betaNeighbors).not.toContain("AlphaService [uses] [EXTRACTED]");

      const alphaNeighbors = toolText(
        await client.callTool({
          name: "get_neighbors",
          arguments: { label: "AlphaService" },
        }),
      );
      expect(alphaNeighbors).toContain("BetaRepository [uses] [EXTRACTED]");
      expect(alphaNeighbors).not.toContain("GammaDocs");
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

cliSmoke("starts ontology serve in read-only mode without --write", async () => {
  const dir = makeExternalTempDir();
  const { graphPath } = writeOntologyReconciliationFixture(dir);
  const configPath = join(dir, "graphify.yaml");
  writeFileSync(
    configPath,
    [
      "version: 1",
      "profile:",
      "  path: graphify/profile.yaml",
      "inputs:",
      "  corpus:",
      "    - .",
      "outputs:",
      "  state_dir: .graphify",
      "  ontology:",
      "    reconciliation:",
      "      decisions_path: graphify/reconciliation/decisions.jsonl",
      "",
    ].join("\n"),
    "utf-8",
  );

  const child = spawn("node", [cliPath, "ontology", "serve", "--config", configPath, "--graph", graphPath], {
    cwd: dir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stderr: string[] = [];
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf-8")));

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(child.exitCode, stderr.join("")).toBeNull();
    expect(stderr.join("")).not.toContain("write tools only");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
});

cliSmoke("ignores blank MCP stdio lines instead of terminating", async () => {
  const dir = makeTempDir();
  const graphPath = writeFixtureGraph(dir);
  const child = spawn("node", [cliPath, "serve", graphPath], {
    cwd: tsRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });

  try {
    child.stdin.write("\n\n");
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

import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { compileOntologyOutputs } from "../src/ontology-output.js";
import type { Extraction, NormalizedOntologyProfile } from "../src/types.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-output-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

const profile: NormalizedOntologyProfile = {
  id: "synthetic",
  version: "1",
  default_language: "en",
  profile_hash: "profile-hash",
  node_types: {
    Component: {},
    Tool: {},
  },
  relation_types: {
    requires_tool: { source_types: ["Component"], target_types: ["Tool"] },
  },
  registries: {},
  citation_policy: {
    minimum_granularity: "page",
    require_source_file: true,
    allow_bbox: "when_available",
  },
  hardening: {
    statuses: ["candidate", "needs_review", "validated"],
    default_status: "candidate",
    promotion_requires: [],
  },
};

const extraction: Extraction = {
  input_tokens: 0,
  output_tokens: 0,
  nodes: [
    {
      id: "component-a",
      label: "Synthetic Component",
      type: "Component",
      aliases: ["component alias"],
      file_type: "document",
      source_file: "manual.md",
      confidence: "EXTRACTED",
      status: "validated",
    },
    {
      id: "tool-a",
      label: "Synthetic Tool",
      type: "Tool",
      file_type: "document",
      source_file: "manual.md",
      confidence: "EXTRACTED",
    },
  ],
  edges: [{
    source: "component-a",
    target: "tool-a",
    relation: "requires_tool",
    confidence: "EXTRACTED",
    source_file: "manual.md",
  }],
};

describe("ontology output artifacts", () => {
  it("does not generate ontology outputs when disabled", () => {
    const root = makeTempDir();

    const result = compileOntologyOutputs({
      outputDir: join(root, ".graphify", "ontology"),
      extraction,
      profile,
      config: { enabled: false },
    });

    expect(result.enabled).toBe(false);
    expect(existsSync(join(root, ".graphify", "ontology"))).toBe(false);
  });

  it("compiles nodes, aliases, relations, manifest and entity wiki pages", () => {
    const root = makeTempDir();
    const outputDir = join(root, ".graphify", "ontology");

    const result = compileOntologyOutputs({
      outputDir,
      extraction,
      profile,
      config: {
        enabled: true,
        canonical_node_types: ["Component", "Tool"],
        relation_exports: ["requires_tool"],
        wiki: { enabled: true, page_node_types: ["Component"] },
      },
    });

    expect(result.enabled).toBe(true);
    expect(result.nodeCount).toBe(2);
    expect(result.relationCount).toBe(1);
    expect(JSON.parse(readFileSync(join(outputDir, "manifest.json"), "utf-8")).schema).toBe(
      "graphify_ontology_outputs_v1",
    );
    expect(readFileSync(join(outputDir, "nodes.json"), "utf-8")).toContain("Synthetic Component");
    expect(readFileSync(join(outputDir, "aliases.json"), "utf-8")).toContain("component alias");
    expect(readFileSync(join(outputDir, "relations.json"), "utf-8")).toContain("requires_tool");
    expect(readFileSync(join(outputDir, "wiki", "entities", "component-a.md"), "utf-8")).toContain(
      "# Synthetic Component",
    );
  });

  it("marks ambiguous aliases as needs_review and reports validation issues", () => {
    const root = makeTempDir();
    const outputDir = join(root, ".graphify", "ontology");
    const ambiguous: Extraction = {
      input_tokens: 0,
      output_tokens: 0,
      nodes: [
        { ...extraction.nodes[0]!, id: "a", label: "A", aliases: ["same"] },
        { ...extraction.nodes[0]!, id: "b", label: "B", aliases: ["same"] },
      ],
      edges: [],
    };

    const result = compileOntologyOutputs({
      outputDir,
      extraction: ambiguous,
      profile,
      config: { enabled: true, canonical_node_types: ["Component"] },
    });

    expect(result.validationIssues).toContain("alias \"same\" ambiguously attaches to a, b");
    const nodes = JSON.parse(readFileSync(join(outputDir, "nodes.json"), "utf-8")) as Array<{ status: string }>;
    expect(nodes.every((node) => node.status === "needs_review")).toBe(true);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  ALL_EXTRACTED_CITATION_CONTRACT,
  hashCitationExtractionContract,
  hashQualityTarget,
  loadQualityTargetsConfig,
  type NormalizedQualityTarget,
} from "../src/quality-target.js";
import {
  computeGraphCitationSignatureFromJson,
  evaluateQualityBundle,
  sha256File,
  validatePrecomputedQaReportBinding,
  type ResolvedTargetManifest,
} from "../src/qa.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-qa-"));
  tempDirs.push(dir);
  return dir;
}

function write(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, "utf-8");
}

function writeJson(path: string, value: unknown): void {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function targetYaml(contractHash = hashCitationExtractionContract(ALL_EXTRACTED_CITATION_CONTRACT)): string {
  return [
    "quality:",
    "  targets:",
    "    public_studio:",
    "      kind: studio-static-bundle",
    "      bundle_path: bundle",
    "      baseline_bundle_path: baseline",
    "      publication:",
    "        blocking: true",
    "        require_resolved_manifest: true",
    "        data_only_chrome: true",
    "        chrome_reference_path: chrome-reference",
    "        deny_source_path_patterns:",
    "          - .graphify/scratch/**",
    "        data_allowlist:",
    "          - graph.json",
    "          - scene.json",
    "          - reconciliation-candidates.json",
    "          - ontology/citations.json",
    "      citations:",
    "        extraction:",
    "          mode: all_extracted",
    "          require_producer_proof: true",
    "          contract_id: graphify_all_extracted_entity_citations_v1",
    "          allowed_contract_hashes:",
    `            - ${contractHash}`,
    "          require_batch_coverage: true",
    "        display: full",
    "        inline:",
    "          mode: top_k",
    "          top_k: 8",
    "        require_sidecar: true",
    "        min_count_by_node:",
    "          a: 2",
    "      graph:",
    "        min_nodes: 2",
    "        min_edges: 1",
    "        max_missing_descriptions: 0",
    "        forbidden_node_id_patterns:",
    "          - '^src_'",
    "          - '^scripts_'",
    "          - '^tests_'",
    "        forbidden_source_path_patterns:",
    "          - src/**",
    "          - scripts/**",
    "          - tests/**",
    "        allowed_node_types:",
    "          - Character",
    "        min_degree_by_type:",
    "          Character: 1",
    "        max_degree_by_type:",
    "          Character: 2",
    "        max_degree_by_type_and_derivation:",
    "          Character:",
    "            citation_section_story_context: 2",
    "        required_neighbor_ids_by_node:",
    "          a:",
    "            - b",
    "        forbidden_edges:",
    "          - source: b",
    "            target: a",
    "            relation: SHOULD_NOT",
    "      scene:",
    "        forbidden_shape_by_type:",
    "          Work:",
    "            - box",
    "            - roundedbox",
    "          ChapterOrStory:",
    "            - box",
    "            - roundedbox",
    "      reconciliation:",
    "        min_candidates: 1",
    "        require_groupable_by_type: true",
    "",
  ].join("\n");
}

function writeTarget(root: string): NormalizedQualityTarget {
  const configPath = join(root, "graphify.yaml");
  write(configPath, targetYaml());
  return loadQualityTargetsConfig(configPath).targets.public_studio;
}

function graphFixture() {
  return {
    topology_signature: "graph-hash",
    directed: false,
    graph: {},
    nodes: [
      {
        id: "a",
        label: "A",
        node_type: "Character",
        source_file: "work.md",
        file_type: "document",
        description: "Alpha.",
        citation_count: 2,
        citations: [
          { source_file: "work-1.md", section: "I" },
          { source_file: "work-2.md", section: "II" },
        ],
      },
      {
        id: "b",
        label: "B",
        node_type: "Character",
        source_file: "work.md",
        file_type: "document",
        description: "Beta.",
        citation_count: 0,
        citations: [],
      },
    ],
    links: [{ source: "a", target: "b", relation: "KNOWS" }],
  };
}

function reconciliationQueue() {
  return {
    schema: "graphify_ontology_reconciliation_candidates_v1",
    graph_hash: "graph-hash",
    profile_hash: "profile-hash",
    generated_at: "2026-06-17T00:00:00.000Z",
    candidate_count: 1,
    candidates: [
      {
        id: "cand-1",
        kind: "entity_match",
        status: "candidate",
        score: 0.9,
        candidate_id: "a",
        canonical_id: "b",
        shared_terms: ["a"],
        evidence_refs: [],
        reasons: ["fixture"],
        proposed_patch_operation: "accept_match",
      },
    ],
  };
}

function writeValidBundle(root: string): { target: NormalizedQualityTarget; bundleDir: string; manifest: ResolvedTargetManifest } {
  const target = writeTarget(root);
  const bundleDir = join(root, "bundle");
  const referenceDir = join(root, "chrome-reference");
  const graph = graphFixture();
  write(bundleDir + "/index.html", "<html>chrome</html>");
  write(referenceDir + "/index.html", "<html>chrome</html>");
  writeJson(join(bundleDir, "graph.json"), graph);
  writeJson(join(bundleDir, "scene.json"), {
    nodes: [
      { id: "a", label: "A", type: "Character", shape: "roundedbox" },
      { id: "b", label: "B", type: "Character", shape: "diamond" },
    ],
    edges: [{ source: "a", target: "b", relation: "KNOWS" }],
    stats: { nodeCount: 2, edgeCount: 1, weakEdgeCount: 0, communityCount: 1 },
  });
  writeJson(join(bundleDir, "ontology", "citations.json"), {
    schema: "graphify_ontology_citations_v1",
    graph_signature: computeGraphCitationSignatureFromJson(graph),
    nodes: {
      a: {
        count: 2,
        citations: [
          { source_file: "work-1.md", section: "I" },
          { source_file: "work-2.md", section: "II" },
        ],
      },
    },
  });
  writeJson(join(bundleDir, "reconciliation-candidates.json"), reconciliationQueue());

  const contractHash = hashCitationExtractionContract(ALL_EXTRACTED_CITATION_CONTRACT);
  const manifest: ResolvedTargetManifest = {
    schema: "graphify_resolved_target_v1",
    target_id: target.id,
    target_hash: "sha256:target",
    artifacts: {
      "graph.json": {
        bundle_path: "graph.json",
        source_path: ".graphify/runs/run-1/graph.json",
        source_kind: "generated",
        sha256: sha256File(join(bundleDir, "graph.json")),
      },
      "scene.json": {
        bundle_path: "scene.json",
        source_path: ".graphify/runs/run-1/scene.json",
        source_kind: "generated",
        sha256: sha256File(join(bundleDir, "scene.json")),
      },
      "reconciliation-candidates.json": {
        bundle_path: "reconciliation-candidates.json",
        source_path: ".graphify/runs/run-1/reconciliation-candidates.json",
        source_kind: "generated",
        sha256: sha256File(join(bundleDir, "reconciliation-candidates.json")),
      },
      "ontology/citations.json": {
        bundle_path: "ontology/citations.json",
        source_path: ".graphify/runs/run-1/ontology/citations.json",
        source_kind: "generated",
        sha256: sha256File(join(bundleDir, "ontology", "citations.json")),
      },
    },
    resolved_policy: {
      corpus_type: "long-document",
      citations: {
        extraction: {
          mode: "all_extracted",
          contract_id: "graphify_all_extracted_entity_citations_v1",
          contract_hash: contractHash,
          contract: ALL_EXTRACTED_CITATION_CONTRACT,
          assembly: { same_entity_merge: "union_by_citation_identity" },
        },
      },
    },
    extraction_units: [
      {
        id: "batch-000",
        source_path: ".graphify/extraction/batch-000.json",
        contract_id: "graphify_all_extracted_entity_citations_v1",
        contract_hash: contractHash,
        citation_mode: "all_extracted",
      },
    ],
  };
  return { target, bundleDir, manifest };
}

function errorIds(reportOrChecks: { checks: Array<{ id: string; severity: string }> } | Array<{ id: string; severity: string }>): string[] {
  const checks = Array.isArray(reportOrChecks) ? reportOrChecks : reportOrChecks.checks;
  return checks.filter((check) => check.severity === "error").map((check) => check.id);
}

describe("evaluateQualityBundle", () => {
  it("passes a complete bundle with manifest proof and full citation sidecar", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);

    const report = evaluateQualityBundle({ target, bundleDir, manifest, targetHash: "sha256:target" });

    expect(report.status).toBe("passed");
    expect(report.summary.failed).toBe(0);
    expect(report.chrome?.bundle_non_data_tree_hash).toBe(report.chrome?.chrome_reference_tree_hash);
  });

  it("rejects graph boundary leaks and out-of-bounds target type degrees", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.graph.allowed_node_types = ["Character", "ChapterOrStory"];
    target.graph.min_degree_by_type = { ChapterOrStory: 2 };
    target.graph.max_degree_by_type = { ChapterOrStory: 2 };
    target.graph.max_degree_by_type_and_derivation = { ChapterOrStory: { citation_section_story_context: 2 } };
    manifest.target_hash = hashQualityTarget(target);

    const graph = graphFixture();
    graph.nodes.push({
      id: "src_graphify_deepening_ts",
      label: "graphify-deepening.ts",
      node_type: "code",
      source_file: "src/graphify-deepening.ts",
      file_type: "code",
      description: "Implementation node leaked into a document-only bundle.",
      citation_count: 0,
      citations: [],
    });
    graph.nodes.push({
      id: "story_speckled_band",
      label: "The Adventure of the Speckled Band",
      node_type: "ChapterOrStory",
      source_file: "sherlock-holmes/the-adventures-of-sherlock-holmes.md",
      file_type: "document",
      description: "Story fixture.",
      citation_count: 0,
      citations: [],
    });
    graph.nodes.push({
      id: "story_case_book_catch_all",
      label: "The Case-Book catch-all",
      node_type: "ChapterOrStory",
      source_file: "sherlock-holmes/the-case-book-of-sherlock-holmes.md",
      file_type: "document",
      description: "Story fixture.",
      citation_count: 0,
      citations: [],
    });
    graph.links.push({ source: "a", target: "story_speckled_band", relation: "appears_in" });
    graph.links.push({ source: "a", target: "story_case_book_catch_all", relation: "appears_in", derivation_method: "citation_section_story_context" });
    graph.links.push({ source: "b", target: "story_case_book_catch_all", relation: "appears_in", derivation_method: "citation_section_story_context" });
    graph.links.push({ source: "story_case_book_catch_all", target: "a", relation: "mentions", derivation_method: "citation_section_story_context" });
    writeJson(join(bundleDir, "graph.json"), graph);
    manifest.artifacts["graph.json"]!.sha256 = sha256File(join(bundleDir, "graph.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "graph.forbidden_node_id_patterns",
      "graph.forbidden_source_path_patterns",
      "graph.allowed_node_types",
      "graph.min_degree_by_type.ChapterOrStory",
      "graph.max_degree_by_type.ChapterOrStory",
      "graph.max_degree_by_type_and_derivation.ChapterOrStory.citation_section_story_context",
    ]));
  });

  it("counts derivation-specific degree independently from total degree", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.graph.allowed_node_types = ["Character", "ChapterOrStory"];
    target.graph.min_degree_by_type = {};
    target.graph.max_degree_by_type = {};
    target.graph.max_degree_by_type_and_derivation = { ChapterOrStory: { citation_section_story_context: 1 } };
    manifest.target_hash = hashQualityTarget(target);

    const graph = graphFixture();
    graph.nodes.push({
      id: "story_context_target",
      label: "Story Context Target",
      node_type: "ChapterOrStory",
      source_file: "sherlock-holmes/the-case-book-of-sherlock-holmes.md",
      file_type: "document",
      description: "Story fixture.",
      citation_count: 0,
      citations: [],
    });
    graph.links.push({ source: "a", target: "story_context_target", relation: "appears_in" });
    graph.links.push({ source: "b", target: "story_context_target", relation: "appears_in" });
    graph.links.push({
      source: "story_context_target",
      target: "a",
      relation: "mentions",
      derivation_method: "citation_section_story_context",
    });
    writeJson(join(bundleDir, "graph.json"), graph);
    manifest.artifacts["graph.json"]!.sha256 = sha256File(join(bundleDir, "graph.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).not.toContain(
      "graph.max_degree_by_type_and_derivation.ChapterOrStory.citation_section_story_context",
    );
  });

  it("rejects missing required graph neighbors and forbidden graph edges", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.graph.required_neighbor_ids_by_node = {
      story_speckled_band: ["character_helen_stoner"],
    };
    target.graph.forbidden_edges = [
      { source: "b", target: "a", relation: "KNOWS" },
    ];
    manifest.target_hash = hashQualityTarget(target);

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "graph.required_neighbor_ids_by_node.story_speckled_band",
      "graph.forbidden_edges",
    ]));
  });

  it("rejects dangling edges instead of counting them as degree or required-neighbor evidence", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.graph.min_nodes = 1;
    target.graph.min_edges = 1;
    target.graph.min_degree_by_type = { Character: 1 };
    target.graph.max_degree_by_type = {};
    target.graph.max_degree_by_type_and_derivation = {};
    target.graph.required_neighbor_ids_by_node = { a: ["missing_story"] };
    target.graph.forbidden_edges = [];
    target.reconciliation.min_candidates = null;
    target.reconciliation.require_groupable_by_type = false;
    manifest.target_hash = hashQualityTarget(target);

    const graph = graphFixture();
    graph.nodes = graph.nodes.filter((node) => node.id === "a");
    graph.links = [{ source: "a", target: "missing_story", relation: "KNOWS" }];
    writeJson(join(bundleDir, "graph.json"), graph);
    manifest.artifacts["graph.json"]!.sha256 = sha256File(join(bundleDir, "graph.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "graph.edge_endpoints_present",
      "graph.min_degree_by_type.Character",
      "graph.required_neighbor_ids_by_node.a",
    ]));
  });

  it("rejects forbidden scene shapes by node type", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    manifest.target_hash = hashQualityTarget(target);
    writeJson(join(bundleDir, "scene.json"), {
      nodes: [
        { id: "story_speckled_band", label: "The Adventure of the Speckled Band", type: "ChapterOrStory", shape: "roundedbox" },
        { id: "work_adventures", label: "The Adventures of Sherlock Holmes", type: "Work", shape: "box" },
        { id: "character_sherlock_holmes", label: "Sherlock Holmes", type: "Character", shape: "roundedbox" },
      ],
      edges: [],
      stats: { nodeCount: 3, edgeCount: 0, weakEdgeCount: 0, communityCount: 0 },
    });
    manifest.artifacts["scene.json"]!.sha256 = sha256File(join(bundleDir, "scene.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "scene.forbidden_shape_by_type.ChapterOrStory",
      "scene.forbidden_shape_by_type.Work",
    ]));
    expect(errorIds(report)).not.toContain("scene.forbidden_shape_by_type.Character");
  });

  it("rejects scratch/no-publish artifact provenance", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    manifest.artifacts["graph.json"]!.source_path = ".graphify/scratch/reindex-multimodel/opus/graph.json";

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toContain("manifest.artifacts.graph.json.source_path");
  });

  it("rejects a partial full-citation sidecar", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    const sidecar = JSON.parse(readFileSync(join(bundleDir, "ontology", "citations.json"), "utf-8"));
    sidecar.nodes = {};
    writeJson(join(bundleDir, "ontology", "citations.json"), sidecar);
    manifest.artifacts["ontology/citations.json"]!.sha256 = sha256File(join(bundleDir, "ontology", "citations.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toContain("citations.sidecar.node.a");
  });

  it("rejects a truncated reconciliation response even when total is high enough", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    writeJson(join(bundleDir, "reconciliation-candidates.json"), {
      schema: "graphify_ontology_reconciliation_candidates_response_v1",
      generated_at: "2026-06-17T00:00:00.000Z",
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      stale: false,
      total: 31,
      limit: 1,
      offset: 0,
      items: reconciliationQueue().candidates,
    });
    manifest.artifacts["reconciliation-candidates.json"]!.sha256 = sha256File(join(bundleDir, "reconciliation-candidates.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toContain("reconciliation.response.complete");
    expect(errorIds(report)).toContain("reconciliation.min_candidates");
  });

  it("rejects a manifest whose extraction unit is unknown", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    manifest.extraction_units![0]!.citation_mode = "unknown";

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toContain("manifest.extraction_units.batch-000.mode");
  });

  it("rejects a resolved manifest bound to another target or stale target hash", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    manifest.target_id = "other_target";
    manifest.target_hash = "sha256:stale";

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "manifest.target_id",
      "manifest.target_hash",
    ]));
  });

  it("rejects runtime data-only chrome self-comparison after bundle override", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.publication.resolvedChromeReferencePath = bundleDir;
    target.publication.chrome_reference_path = "bundle";
    manifest.target_hash = hashQualityTarget(target);

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toContain("publication.chrome_reference_path");
  });

  it("rejects the Opus incident class before publication", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    target.citations.min_count_by_node.a = 89;
    manifest.artifacts["graph.json"]!.source_path = ".graphify/scratch/reindex-multimodel/opus/graph.json";

    const graph = graphFixture();
    const sherlockCitations = Array.from({ length: 8 }, (_, index) => ({
      source_file: `sherlock-${index + 1}.md`,
      section: String(index + 1),
    }));
    graph.nodes[0]!.citations = sherlockCitations;
    graph.nodes[0]!.citation_count = sherlockCitations.length;
    writeJson(join(bundleDir, "graph.json"), graph);
    manifest.artifacts["graph.json"]!.sha256 = sha256File(join(bundleDir, "graph.json"));

    writeJson(join(bundleDir, "ontology", "citations.json"), {
      schema: "graphify_ontology_citations_v1",
      graph_signature: computeGraphCitationSignatureFromJson(graph),
      nodes: {},
    });
    manifest.artifacts["ontology/citations.json"]!.sha256 = sha256File(join(bundleDir, "ontology", "citations.json"));

    writeJson(join(bundleDir, "reconciliation-candidates.json"), {
      schema: "graphify_ontology_reconciliation_candidates_response_v1",
      generated_at: "2026-06-17T00:00:00.000Z",
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      stale: false,
      total: 31,
      limit: 8,
      offset: 0,
      items: [],
    });
    manifest.artifacts["reconciliation-candidates.json"]!.sha256 = sha256File(join(bundleDir, "reconciliation-candidates.json"));

    const report = evaluateQualityBundle({ target, bundleDir, manifest });

    expect(errorIds(report)).toEqual(expect.arrayContaining([
      "manifest.artifacts.graph.json.source_path",
      "citations.min_count_by_node.a",
      "citations.sidecar.node.a",
      "reconciliation.response.complete",
      "reconciliation.min_candidates",
    ]));
  });
});

describe("validatePrecomputedQaReportBinding", () => {
  it("rejects a report from a different bundle path even when hashes match", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    const report = evaluateQualityBundle({ target, bundleDir, manifest, targetHash: "sha256:target" });
    report.bundle_path = join(root, "other-bundle");

    const checks = validatePrecomputedQaReportBinding(report, {
      target,
      bundleDir,
      manifest,
      targetHash: "sha256:target",
    });

    expect(errorIds(checks)).toContain("qa_report.bundle_path");
  });

  it("rejects a stale report after chrome reference bytes change", () => {
    const root = tempDir();
    const { target, bundleDir, manifest } = writeValidBundle(root);
    const report = evaluateQualityBundle({ target, bundleDir, manifest, targetHash: "sha256:target" });

    write(join(root, "chrome-reference", "index.html"), "<html>new chrome</html>");
    const checks = validatePrecomputedQaReportBinding(report, {
      target,
      bundleDir,
      manifest,
      targetHash: "sha256:target",
    });

    expect(errorIds(checks)).toContain("qa_report.chrome");
  });
});

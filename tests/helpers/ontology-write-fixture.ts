import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ONTOLOGY_PATCH_SCHEMA, type OntologyPatch } from "../../src/ontology-patch.js";

export interface OntologyWriteFixture {
  root: string;
  stateDir: string;
  profileStatePath: string;
  decisionsPath: string;
  auditPath: string;
  rejectedAuditPath: string;
  patch: OntologyPatch;
}

const PROFILE_HASH = "profile-hash";
const GRAPH_HASH = "graph-hash";

/**
 * Minimal on-disk fixture sufficient for loadOntologyPatchContext + apply/validate.
 * Mirrors the layout produced by `graphify profile dataprep` for a tiny synthetic
 * profile with a single Component canonical entity and one candidate.
 */
export function writeOntologyWriteFixture(root: string): OntologyWriteFixture {
  const stateDir = join(root, ".graphify");
  const profileDir = join(stateDir, "profile");
  const ontologyDir = join(stateDir, "ontology");
  const reconciliationDir = join(ontologyDir, "reconciliation");
  const decisionsPath = join(root, "graphify", "reconciliation", "decisions.jsonl");
  const auditPath = join(reconciliationDir, "applied-patches.jsonl");
  const rejectedAuditPath = join(reconciliationDir, "rejected-patches.jsonl");

  mkdirSync(profileDir, { recursive: true });
  mkdirSync(ontologyDir, { recursive: true });
  mkdirSync(reconciliationDir, { recursive: true });
  mkdirSync(join(root, "graphify", "reconciliation"), { recursive: true });
  writeFileSync(decisionsPath, "", "utf-8");

  const profileStatePath = join(profileDir, "profile-state.json");
  writeFileSync(
    profileStatePath,
    JSON.stringify(
      {
        profile_id: "synthetic",
        profile_version: "1",
        profile_hash: PROFILE_HASH,
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
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(profileDir, "ontology-profile.normalized.json"),
    JSON.stringify(
      {
        id: "synthetic",
        version: "1",
        default_language: "en",
        profile_hash: PROFILE_HASH,
        node_types: { Component: {} },
        relation_types: {},
        registries: {},
        citation_policy: { minimum_granularity: "page", require_source_file: true, allow_bbox: "when_available" },
        hardening: {
          statuses: ["candidate", "validated"],
          default_status: "candidate",
          promotion_requires: [],
          status_transitions: [],
        },
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
            wiki: {
              enabled: false,
              page_node_types: [],
              include_backlinks: false,
              include_source_snippets: false,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(profileDir, "project-config.normalized.json"),
    JSON.stringify(
      {
        version: 1,
        sourcePath: join(root, "graphify.yaml"),
        configDir: root,
        profile: {
          path: "graphify/ontology-profile.yaml",
          resolvedPath: join(root, "graphify", "ontology-profile.yaml"),
        },
        inputs: {
          corpus: [join(root, "docs")],
          scope: "all",
          scope_source: "configured-default",
          registries: [],
          registrySources: {},
          generated: [],
          exclude: [],
        },
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
        llm_execution: {
          mode: "assistant",
          provider: null,
          text_json: { model: "" },
          vision_json: { primary_model: "", deep_model: "" },
          batch: { provider: "", completion_window: "24h" },
          mesh: { adapter: "" },
        },
        outputs: {
          state_dir: stateDir,
          write_html: false,
          write_wiki: false,
          write_profile_report: false,
          ontology: { reconciliation: { decisions_path: decisionsPath, patches_path: null } },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  writeFileSync(
    join(ontologyDir, "manifest.json"),
    JSON.stringify({ graph_hash: GRAPH_HASH, profile_hash: PROFILE_HASH }, null, 2),
    "utf-8",
  );
  writeFileSync(
    join(ontologyDir, "nodes.json"),
    JSON.stringify(
      [
        { id: "candidate-component", type: "Component", status: "candidate", source_refs: ["manual.md#p1"] },
        { id: "component-a", type: "Component", status: "validated", source_refs: ["manual.md#p1"] },
      ],
      null,
      2,
    ),
    "utf-8",
  );
  writeFileSync(join(ontologyDir, "relations.json"), "[]", "utf-8");
  writeFileSync(
    join(ontologyDir, "sources.json"),
    JSON.stringify([{ id: "manual.md#p1" }], null, 2),
    "utf-8",
  );

  return {
    root,
    stateDir,
    profileStatePath,
    decisionsPath,
    auditPath,
    rejectedAuditPath,
    patch: {
      schema: ONTOLOGY_PATCH_SCHEMA,
      id: "patch-studio-write-001",
      operation: "accept_match",
      status: "proposed",
      profile_hash: PROFILE_HASH,
      graph_hash: GRAPH_HASH,
      target: { candidate_id: "candidate-component", canonical_id: "component-a" },
      evidence_refs: ["manual.md#p1"],
      reason: "Studio write-mode UAT.",
      author: "tester",
      created_at: "2026-05-13T00:00:00.000Z",
    },
  };
}

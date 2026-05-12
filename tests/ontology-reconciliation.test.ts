import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  generateOntologyReconciliationCandidates,
  ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
  ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA,
  loadOntologyReconciliationCandidates,
  queryOntologyReconciliationCandidates,
  type OntologyReconciliationCandidate,
  type OntologyReconciliationCandidateFilter,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const profile = {
  id: "synthetic-profile",
  version: "1",
  default_language: "en",
  profile_hash: "profile-hash",
  node_types: {
    Component: {
      description: "Synthetic component",
      required_fields: [],
      optional_fields: [],
    },
  },
  relation_types: {},
  registries: {},
  citation_policy: {},
  hardening: {
    statuses: ["candidate", "needs_review", "validated", "rejected", "deprecated"],
    default_status: "candidate",
    status_transitions: [],
  },
  inference_policy: {},
  evidence_policy: {},
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
      },
    },
  },
} as unknown as NormalizedOntologyProfile;

function context(): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "graph-hash",
    profile,
    profileState: {
      profile_id: "synthetic-profile",
      profile_version: "1",
      profile_hash: "profile-hash",
      project_config_path: "/repo/graphify.yaml",
      ontology_profile_path: "/repo/profile.yaml",
      state_dir: "/repo/.graphify",
      detect_roots: [],
      exclude_roots: [],
      registry_counts: {},
      registry_node_count: 0,
      semantic_file_count: 0,
      transcript_count: 0,
      pdf_artifact_count: 0,
    },
    nodes: [
      {
        id: "component-payment",
        label: "Payment Service",
        type: "Component",
        status: "validated",
        aliases: ["Payments"],
        normalized_terms: ["payment service", "payments"],
        source_refs: ["manual.md#p1"],
      },
      {
        id: "candidate-payments",
        label: "Payments",
        type: "Component",
        status: "candidate",
        aliases: [],
        normalized_terms: ["payments"],
        source_refs: ["manual.md#p2"],
      },
    ],
    relations: [],
    evidenceRefs: new Set(["manual.md#p1", "manual.md#p2"]),
  };
}

describe("ontology reconciliation candidates", () => {
  it("loads and pages filtered candidate responses deterministically", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-candidates-"));
    const path = join(dir, "candidates.json");
    const queue = {
      schema: "graphify_ontology_reconciliation_candidates_v1" as const,
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      generated_at: "2026-05-09T00:00:00.000Z",
      candidate_count: 3,
      candidates: [
        {
          id: "candidate-b",
          kind: "entity_match",
          status: "candidate",
          score: 0.95,
          candidate_id: "node-b",
          canonical_id: "canon-2",
          shared_terms: ["shared"],
          evidence_refs: ["source.md#b"],
          reasons: ["same node type: Component", "shared normalized term(s): shared"],
          proposed_patch_operation: "accept_match",
        },
        {
          id: "candidate-a",
          kind: "entity_match",
          status: "candidate",
          score: 0.85,
          candidate_id: "node-a",
          canonical_id: "canon-1",
          shared_terms: ["shared"],
          evidence_refs: ["source.md#a"],
          reasons: ["same node type: Component", "shared normalized term(s): shared"],
          proposed_patch_operation: "accept_match",
        },
        {
          id: "candidate-c",
          kind: "entity_match",
          status: "candidate",
          score: 0.55,
          candidate_id: "node-c",
          canonical_id: "canon-1",
          shared_terms: ["shared-other"],
          evidence_refs: ["source.md#c"],
          reasons: ["same node type: Component", "shared normalized term(s): shared-other"],
          proposed_patch_operation: "accept_match",
        },
      ] satisfies OntologyReconciliationCandidate[],
    };
    writeFileSync(path, JSON.stringify(queue, null, 2), "utf-8");

    const loaded = loadOntologyReconciliationCandidates(path);
    const response = queryOntologyReconciliationCandidates(loaded, {
      canonical_id: "canon-1",
      min_score: 0.6,
      sort: "score",
      order: "desc",
      limit: 1,
      offset: 0,
      query: "node",
    });

    expect(loaded.candidate_count).toBe(3);
    expect(response.schema).toBe(ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA);
    expect(response.total).toBe(1);
    expect(response.limit).toBe(1);
    expect(response.offset).toBe(0);
    expect(response.items).toMatchObject([
      {
        id: "candidate-a",
        canonical_id: "canon-1",
        candidate_id: "node-a",
      },
    ]);
  });

  it("supports score/id sort direction and query-based candidate search", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-ontology-candidates-"));
    const path = join(dir, "candidates.json");
    const queue = {
      schema: "graphify_ontology_reconciliation_candidates_v1" as const,
      graph_hash: "graph-hash",
      profile_hash: "profile-hash",
      generated_at: "2026-05-09T00:00:00.000Z",
      candidate_count: 3,
      candidates: [
        {
          id: "zz-candidate",
          kind: "entity_match",
          status: "candidate",
          score: 0.75,
          candidate_id: "node-1",
          canonical_id: "canon-1",
          shared_terms: ["shared"],
          evidence_refs: ["source.md#1"],
          reasons: ["same node type: Component", "shared normalized term(s): shared"],
          proposed_patch_operation: "accept_match",
        },
        {
          id: "aa-candidate",
          kind: "entity_match",
          status: "candidate",
          score: 0.99,
          candidate_id: "node-2",
          canonical_id: "canon-2",
          shared_terms: ["shared"],
          evidence_refs: ["source.md#2"],
          reasons: ["same node type: Component", "shared normalized term(s): shared"],
          proposed_patch_operation: "accept_match",
        },
        {
          id: "mm-candidate",
          kind: "entity_match",
          status: "candidate",
          score: 0.88,
          candidate_id: "node-2",
          canonical_id: "canon-3",
          shared_terms: ["other"],
          evidence_refs: ["source.md#3"],
          reasons: ["same node type: Component", "shared normalized term(s): other"],
          proposed_patch_operation: "accept_match",
        },
      ] satisfies OntologyReconciliationCandidate[],
    };
    writeFileSync(path, JSON.stringify(queue, null, 2), "utf-8");
    const loaded = loadOntologyReconciliationCandidates(path);
    const filters: OntologyReconciliationCandidateFilter = {
      status: "candidate",
      query: "node-2",
      sort: "id",
      order: "asc",
      operation: "accept_match",
      limit: 2,
      offset: 0,
    };
    const response = queryOntologyReconciliationCandidates(loaded, filters);

    expect(response.total).toBe(2);
    expect(response.items).toMatchObject([
      {
        id: "aa-candidate",
        candidate_id: "node-2",
      },
      {
        id: "mm-candidate",
        candidate_id: "node-2",
      },
    ]);
  });

  it("generates deterministic entity-match candidates from shared normalized terms", () => {
    const first = generateOntologyReconciliationCandidates(context(), {
      generatedAt: "2026-05-09T00:00:00.000Z",
    });
    const second = generateOntologyReconciliationCandidates(context(), {
      generatedAt: "2026-05-09T00:00:00.000Z",
    });

    expect(first).toEqual(second);
    expect(first.schema).toBe(ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA);
    expect(first.candidate_count).toBe(1);
    expect(first.candidates[0]).toMatchObject({
      kind: "entity_match",
      status: "candidate",
      canonical_id: "component-payment",
      candidate_id: "candidate-payments",
      shared_terms: ["payments"],
      evidence_refs: ["manual.md#p1", "manual.md#p2"],
      proposed_patch_operation: "accept_match",
    });
    expect(first.candidates[0]!.score).toBeGreaterThan(0.8);
  });
});

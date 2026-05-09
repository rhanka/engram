import { describe, expect, it } from "vitest";

import {
  generateOntologyReconciliationCandidates,
  ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
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

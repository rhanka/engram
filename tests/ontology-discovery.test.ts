import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runConfiguredDataprep } from "../src/configured-dataprep.js";
import { loadOntologyProfile } from "../src/ontology-profile.js";
import { loadProjectConfig } from "../src/project-config.js";
import { loadProfileRegistries } from "../src/profile-registry.js";
import {
  buildOntologyDiscoveryDiff,
  buildOntologyDiscoverySample,
  loadOntologyDiscoveryContext,
  ontologyDiscoveryDiffToMarkdown,
  type OntologyDiscoveryContext,
  type OntologyDiscoveryProposalsFile,
} from "../src/ontology-discovery.js";
import type { DetectionResult } from "../src/types.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "profile-demo");

function semanticDetection(): DetectionResult {
  return {
    files: {
      code: [],
      document: [join(fixtureRoot, "raw", "manuals", "manual.md")],
      paper: [],
      image: [join(fixtureRoot, "derived", "full-page-screenshots", "page-001.png")],
      video: [],
    },
    total_files: 2,
    total_words: 12,
    needs_graph: false,
    warning: null,
    skipped_sensitive: [],
    graphifyignore_patterns: 0,
  };
}

function discoveryContext(): OntologyDiscoveryContext {
  const projectConfig = loadProjectConfig(join(fixtureRoot, "graphify.yaml"));
  const profile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
  return {
    profileState: {
      profile_id: profile.id,
      profile_version: profile.version,
      profile_hash: profile.profile_hash,
      project_config_path: projectConfig.sourcePath,
      ontology_profile_path: profile.sourcePath ?? null,
      state_dir: join(fixtureRoot, ".graphify"),
      detect_roots: projectConfig.inputs.corpus,
      exclude_roots: projectConfig.inputs.exclude,
      registry_counts: {},
      registry_node_count: 0,
      semantic_file_count: 2,
      transcript_count: 0,
      pdf_artifact_count: 0,
    },
    profile,
    projectConfig,
    semanticDetection: semanticDetection(),
    registries: loadProfileRegistries(profile),
  };
}

describe("ontology discovery workflow", () => {
  it("builds a deterministic review sample without mutating the profile", () => {
    const sample = buildOntologyDiscoverySample(discoveryContext(), {
      maxFiles: 1,
      maxCharsPerFile: 80,
      maxRegistryRecords: 1,
    });

    expect(sample.schema).toBe("graphify_ontology_discovery_sample_v1");
    expect(sample.files).toHaveLength(1);
    expect(sample.files[0]).toMatchObject({
      id: "sample-file-001",
      path: "raw/manuals/manual.md",
      file_type: "document",
    });
    expect(sample.registry_records).toHaveLength(2);
    expect(sample.existing_profile.node_types).toContain("MaintenanceProcess");
    expect(sample.sample_hash).toMatch(/^[a-f0-9]{64}$/);

    const repeat = buildOntologyDiscoverySample(discoveryContext(), {
      maxFiles: 1,
      maxCharsPerFile: 80,
      maxRegistryRecords: 1,
    });
    expect(repeat.sample_hash).toBe(sample.sample_hash);
  });

  it("converts assistant proposals into a non-mutating profile diff", () => {
    const context = discoveryContext();
    const sample = buildOntologyDiscoverySample(context, { maxFiles: 1, maxRegistryRecords: 1 });
    const proposals: OntologyDiscoveryProposalsFile = {
      schema: "graphify_ontology_discovery_proposals_v1",
      profile_hash: context.profile.profile_hash,
      sample_hash: sample.sample_hash,
      proposals: [
        {
          id: "proposal-node-type-001",
          kind: "node_type",
          action: "add",
          path: "/node_types/SyntheticDiscoveryEntity",
          value: { source_backed: true },
          evidence_refs: ["sample-file-001"],
          confidence: 0.7,
          rationale: "Synthetic fixture evidence.",
        },
      ],
    };

    const diff = buildOntologyDiscoveryDiff(context.profile, proposals, sample);

    expect(diff.valid).toBe(true);
    expect(diff.mutates_profile).toBe(false);
    expect(diff.requires_user_approval).toBe(true);
    expect(diff.operations).toEqual([
      expect.objectContaining({
        op: "add",
        path: "/node_types/SyntheticDiscoveryEntity",
        review_status: "needs_review",
      }),
    ]);
    expect(ontologyDiscoveryDiffToMarkdown(diff)).toContain("Requires user approval: true");
  });

  it("rejects unsafe paths and proposals without sample evidence", () => {
    const context = discoveryContext();
    const sample = buildOntologyDiscoverySample(context, { maxFiles: 1, maxRegistryRecords: 1 });
    const proposals: OntologyDiscoveryProposalsFile = {
      schema: "graphify_ontology_discovery_proposals_v1",
      profile_hash: context.profile.profile_hash,
      sample_hash: sample.sample_hash,
      proposals: [
        {
          id: "proposal-unsafe",
          kind: "relation_type",
          action: "add",
          path: "/node_types/NotARelation",
          value: {},
          evidence_refs: ["missing-ref"],
        },
      ],
    };

    const diff = buildOntologyDiscoveryDiff(context.profile, proposals, sample);

    expect(diff.valid).toBe(false);
    expect(diff.operations).toHaveLength(0);
    expect(diff.issues.map((issue) => issue.message).join("\n")).toContain("not valid for proposal kind relation_type");
    expect(diff.issues.map((issue) => issue.message).join("\n")).toContain("Unknown evidence_ref");
  });

  it("loads profile-state artifacts produced by configured dataprep", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "graphify-ontology-discovery-"));
    try {
      cpSync(fixtureRoot, tempRoot, { recursive: true });
      const result = await runConfiguredDataprep(tempRoot, {
        semanticPrepare: async (detection) => ({
          detection,
          transcriptPaths: [],
          pdfArtifacts: [],
        }),
      });

      const context = loadOntologyDiscoveryContext(join(tempRoot, ".graphify", "profile", "profile-state.json"));
      const sample = buildOntologyDiscoverySample(context, { maxFiles: 2 });

      expect(sample.files.length).toBeGreaterThan(0);
      expect(sample.profile_hash).toBe(result.profile.profile_hash);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

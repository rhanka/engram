import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { loadOntologyProfile } from "../src/ontology-profile.js";
import { loadProjectConfig } from "../src/project-config.js";
import { buildProfileReport } from "../src/profile-report.js";
import type { ProfileState } from "../src/configured-dataprep.js";
import type { ProfileValidationResult } from "../src/profile-validate.js";
import type { RegistryRecord } from "../src/types.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "profile-demo");

function baseState(): ProfileState {
  return {
    profile_id: "equipment-maintenance-demo",
    profile_version: "1",
    profile_hash: "hash-demo",
    project_config_path: join(fixtureRoot, "graphify.yaml"),
    ontology_profile_path: join(fixtureRoot, "graphify", "ontology-profile.yaml"),
    state_dir: join(fixtureRoot, ".graphify"),
    detect_roots: [join(fixtureRoot, "raw", "manuals")],
    exclude_roots: [join(fixtureRoot, "derived", "full-page-screenshots")],
    registry_counts: { components: 2, tooling: 1 },
    registry_node_count: 3,
    semantic_file_count: 4,
    transcript_count: 1,
    pdf_artifact_count: 2,
  };
}

function validationResult(): ProfileValidationResult {
  return {
    valid: false,
    profile_id: "equipment-maintenance-demo",
    profile_version: "1",
    profile_hash: "hash-demo",
    baseErrors: [],
    issues: [
      { severity: "error", code: "unknown_relation", message: "bad relation", edgeIndex: 1 },
      { severity: "warning", code: "missing_registry_link", message: "missing registry", nodeId: "component-unmatched" },
    ],
  };
}

describe("profile QA report", () => {
  it("summarizes profile config, registry coverage, evidence risks, graph risks, and OCR sidecars", () => {
    const projectConfig = loadProjectConfig(join(fixtureRoot, "graphify.yaml"));
    const profile = loadOntologyProfile(projectConfig.profile.resolvedPath, { projectConfig });
    const registries: Record<string, RegistryRecord[]> = {
      components: [
        {
          registryId: "components",
          id: "CMP-001",
          label: "Demo Filter Cartridge",
          aliases: ["DFC-001"],
          nodeType: "Component",
          sourceFile: "references/components.csv",
          raw: {},
        },
        {
          registryId: "components",
          id: "CMP-999",
          label: "Demo Orphan Component",
          aliases: [],
          nodeType: "Component",
          sourceFile: "references/components.csv",
          raw: {},
        },
      ],
    };

    const report = buildProfileReport({
      profileState: baseState(),
      profile,
      projectConfig,
      registries,
      validationResult: validationResult(),
      pdfArtifacts: [
        { filePath: "manual.pdf", markdownPath: ".graphify/converted/pdf/manual.md" },
        { filePath: "scan.pdf", ocrRequired: true },
      ],
      graph: {
        nodes: [
          {
            id: "process",
            label: "Synthetic replacement",
            node_type: "MaintenanceProcess",
            status: "candidate",
          },
          {
            id: "component-matched",
            label: "Demo Filter Cartridge",
            node_type: "Component",
            registry_id: "components",
            registry_record_id: "CMP-001",
          },
          {
            id: "component-unmatched",
            label: "Unmatched Component",
            node_type: "Component",
          },
          { id: "hub", label: "Hub Node" },
        ],
        links: [
          { source: "hub", target: "process", relation: "replaces", confidence: "EXTRACTED" },
          { source: "hub", target: "component-matched", relation: "replaces", confidence: "INFERRED" },
          { source: "hub", target: "component-unmatched", relation: "invented", confidence: "AMBIGUOUS" },
        ],
      },
    });

    expect(report).toContain("# Graphify Profile Report");
    expect(report).toContain("## Project Config Summary");
    expect(report).toContain("raw/manuals");
    expect(report).toContain("## Profile");
    expect(report).toContain("equipment-maintenance-demo");
    expect(report).toContain("## Registry Coverage");
    expect(report).toContain("components: 1/2 attached");
    expect(report).toContain("Demo Orphan Component");
    expect(report).toContain("## Extracted Entities Without Registry Attachment");
    expect(report).toContain("Unmatched Component");
    expect(report).toContain("## Invalid Or Ambiguous Relations");
    expect(report).toContain("unknown_relation");
    expect(report).toContain("AMBIGUOUS");
    expect(report).toContain("## High-Degree Nodes");
    expect(report).toContain("Hub Node");
    expect(report).toContain("## Low-Evidence Relation Types");
    expect(report).toContain("replaces: 1 inferred, 0 ambiguous");
    expect(report).toContain("invented: 0 inferred, 1 ambiguous");
    expect(report).toContain("## Human Review Candidates");
    expect(report).toContain("Synthetic replacement");
    expect(report).toContain("## PDF/OCR Sidecars");
    expect(report).toContain("manual.pdf -> .graphify/converted/pdf/manual.md");
    expect(report).toContain("scan.pdf requires OCR");
    expect(report).toContain("This QA report is advisory");
    expect(report).not.toContain("business-approved truth");
  });
});

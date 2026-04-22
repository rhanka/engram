import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { loadOntologyProfile } from "../src/ontology-profile.js";
import {
  profileValidationResultToJson,
  profileValidationResultToMarkdown,
  validateProfileExtraction,
} from "../src/profile-validate.js";
import type { Extraction, NormalizedOntologyProfile } from "../src/types.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "profile-demo");

function profile(): NormalizedOntologyProfile {
  return loadOntologyProfile(join(fixtureRoot, "graphify", "ontology-profile.yaml"));
}

function baseExtraction(overrides: Partial<Extraction> = {}): Extraction {
  const extraction: Extraction = {
    nodes: [
      {
        id: "process",
        label: "Synthetic filter replacement",
        file_type: "document",
        source_file: "manual.md",
        node_type: "MaintenanceProcess",
        status: "candidate",
        citations: [{ source_file: "manual.md", page: 1 }],
      },
      {
        id: "component",
        label: "Demo Filter Cartridge",
        file_type: "document",
        source_file: "manual.md",
        node_type: "Component",
        registry_id: "components",
        registry_record_id: "CMP-001",
        status: "attached",
        citations: [{ source_file: "manual.md", page: 1 }],
      },
      {
        id: "helper",
        label: "helper()",
        file_type: "code",
        source_file: "src/helper.ts",
      },
    ],
    edges: [
      {
        source: "process",
        target: "component",
        relation: "replaces",
        confidence: "EXTRACTED",
        source_file: "manual.md",
        status: "candidate",
        citations: [{ source_file: "manual.md", page: 1 }],
      },
    ],
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
  return { ...extraction, ...overrides };
}

describe("profile-aware extraction validation", () => {
  it("returns base validation errors before profile checks", () => {
    const result = validateProfileExtraction({ nodes: [] }, { profile: profile() });

    expect(result.valid).toBe(false);
    expect(result.baseErrors).toContain("Missing required key 'edges'");
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "base_schema",
        message: "Missing required key 'edges'",
      }),
    );
  });

  it("accepts profile extraction and generic AST code nodes without node_type", () => {
    const result = validateProfileExtraction(baseExtraction(), { profile: profile() });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects unknown profile node types", () => {
    const extraction = baseExtraction({
      nodes: [
        {
          id: "unknown",
          label: "Unknown",
          file_type: "document",
          source_file: "manual.md",
          node_type: "InventedType",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
      edges: [],
    });

    const result = validateProfileExtraction(extraction, { profile: profile() });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_node_type",
        nodeId: "unknown",
      }),
    );
  });

  it("rejects unknown profile relations", () => {
    const extraction = baseExtraction({
      edges: [
        {
          source: "process",
          target: "component",
          relation: "invented_relation",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
    });

    const result = validateProfileExtraction(extraction, { profile: profile() });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "unknown_relation",
        edgeIndex: 0,
      }),
    );
  });

  it("rejects incompatible relation source and target node types", () => {
    const extraction = baseExtraction({
      nodes: [
        {
          id: "tool",
          label: "Demo Torque Fixture",
          file_type: "document",
          source_file: "manual.md",
          node_type: "Tool",
          registry_id: "tooling",
          registry_record_id: "TOOL-001",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
        {
          id: "procedure",
          label: "Synthetic procedure",
          file_type: "document",
          source_file: "manual.md",
          node_type: "Procedure",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
      edges: [
        {
          source: "tool",
          target: "procedure",
          relation: "replaces",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
    });

    const result = validateProfileExtraction(extraction, { profile: profile() });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "incompatible_source_type",
        edgeIndex: 0,
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "incompatible_target_type",
        edgeIndex: 0,
      }),
    );
  });

  it("requires citation source_file and page when configured by the profile", () => {
    const extraction = baseExtraction({
      nodes: [
        {
          id: "procedure",
          label: "Synthetic procedure",
          file_type: "document",
          source_file: "manual.md",
          node_type: "Procedure",
          citations: [{ page: 1 }],
        },
        {
          id: "figure",
          label: "Synthetic figure",
          file_type: "image",
          source_file: "figure.png",
          node_type: "Figure",
          citations: [{ source_file: "figure.png" }],
        },
      ],
      edges: [],
    });

    const result = validateProfileExtraction(extraction, { profile: profile() });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "missing_citation_source_file",
        nodeId: "procedure",
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "error",
        code: "missing_citation_page",
        nodeId: "figure",
      }),
    );
  });

  it("warns when registry-backed node types have no registry link", () => {
    const extraction = baseExtraction({
      nodes: [
        {
          id: "component",
          label: "Demo Filter Cartridge",
          file_type: "document",
          source_file: "manual.md",
          node_type: "Component",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
      edges: [],
    });

    const result = validateProfileExtraction(extraction, { profile: profile() });

    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "missing_registry_link",
        nodeId: "component",
      }),
    );
  });

  it("serializes validation results to markdown and JSON", () => {
    const result = validateProfileExtraction(baseExtraction({
      edges: [
        {
          source: "process",
          target: "component",
          relation: "invented_relation",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          citations: [{ source_file: "manual.md", page: 1 }],
        },
      ],
    }), { profile: profile() });

    expect(profileValidationResultToJson(result)).toEqual(result);
    expect(profileValidationResultToMarkdown(result)).toContain("| error | unknown_relation |");
  });
});

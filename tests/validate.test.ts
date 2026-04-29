import { describe, it, expect } from "vitest";
import { validateExtraction, assertValid } from "../src/validate.js";

describe("validateExtraction", () => {
  it("rejects non-object input", () => {
    expect(validateExtraction("string")).toEqual(["Extraction must be a JSON object"]);
    expect(validateExtraction(null)).toEqual(["Extraction must be a JSON object"]);
    expect(validateExtraction([])).toEqual(["Extraction must be a JSON object"]);
  });

  it("requires nodes and edges keys", () => {
    const errors = validateExtraction({});
    expect(errors).toContain("Missing required key 'nodes'");
    expect(errors).toContain("Missing required key 'edges'");
  });

  it("validates node required fields", () => {
    const errors = validateExtraction({
      nodes: [{ id: "a" }],
      edges: [],
    });
    expect(errors.some((e) => e.includes("missing required field 'label'"))).toBe(true);
    expect(errors.some((e) => e.includes("missing required field 'file_type'"))).toBe(true);
    expect(errors.some((e) => e.includes("missing required field 'source_file'"))).toBe(true);
  });

  it("validates file_type values", () => {
    const errors = validateExtraction({
      nodes: [{ id: "a", label: "A", file_type: "invalid", source_file: "f.py" }],
      edges: [],
    });
    expect(errors.some((e) => e.includes("invalid file_type"))).toBe(true);
  });

  it("accepts concept file_type values", () => {
    const errors = validateExtraction({
      nodes: [{ id: "a", label: "A", file_type: "concept", source_file: "notes.md" }],
      edges: [],
    });
    expect(errors).toEqual([]);
  });

  it("validates edge confidence values", () => {
    const errors = validateExtraction({
      nodes: [{ id: "a", label: "A", file_type: "code", source_file: "f.py" }],
      edges: [{ source: "a", target: "a", relation: "calls", confidence: "WRONG", source_file: "f.py" }],
    });
    expect(errors.some((e) => e.includes("invalid confidence"))).toBe(true);
  });

  it("detects dangling edges", () => {
    const errors = validateExtraction({
      nodes: [{ id: "a", label: "A", file_type: "code", source_file: "f.py" }],
      edges: [{ source: "a", target: "missing", relation: "calls", confidence: "EXTRACTED", source_file: "f.py" }],
    });
    expect(errors.some((e) => e.includes("does not match any node id"))).toBe(true);
  });

  it("accepts valid extraction", () => {
    const errors = validateExtraction({
      nodes: [
        { id: "a", label: "A", file_type: "code", source_file: "f.py" },
        { id: "b", label: "B", file_type: "code", source_file: "f.py" },
      ],
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED", source_file: "f.py" },
      ],
    });
    expect(errors).toEqual([]);
  });

  it("accepts additive profile metadata on nodes and edges", () => {
    const errors = validateExtraction({
      nodes: [
        {
          id: "registry_components_CMP_001",
          label: "Demo Filter Cartridge",
          file_type: "document",
          source_file: "references/components.csv",
          node_type: "Component",
          registry_id: "components",
          registry_record_id: "CMP-001",
          aliases: ["DFC-001"],
          status: "validated",
          citations: [{ source_file: "manual.md", page: 2 }],
        },
      ],
      edges: [
        {
          source: "registry_components_CMP_001",
          target: "registry_components_CMP_001",
          relation: "inspects",
          confidence: "EXTRACTED",
          source_file: "manual.md",
          status: "candidate",
          citations: [{ source_file: "manual.md", page: 2 }],
          evidence_text: "Synthetic evidence text.",
        },
      ],
    });
    expect(errors).toEqual([]);
  });
});

describe("assertValid", () => {
  it("throws on invalid extraction", () => {
    expect(() => assertValid({})).toThrow("error(s)");
  });

  it("does not throw on valid extraction", () => {
    expect(() =>
      assertValid({
        nodes: [{ id: "a", label: "A", file_type: "code", source_file: "f.py" }],
        edges: [],
      }),
    ).not.toThrow();
  });
});

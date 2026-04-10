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

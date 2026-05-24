// Tests for the semantic-fragment validator + sanitizer.
//
// Ports the upstream Python `semantic_cleanup.py` module's behavior contract
// (PR #825 / commit b6127aa on safishamsi/graphify) into TypeScript. Used by
// the OpenCode + Codex skill markdown templates when merging untrusted
// JSON chunks emitted by the LLM agent.

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_SEMANTIC_FRAGMENT_BYTES,
  MAX_SEMANTIC_FRAGMENT_NODES,
  MAX_SEMANTIC_FRAGMENT_EDGES,
  MAX_SEMANTIC_FRAGMENT_HYPEREDGES,
  MAX_SEMANTIC_HYPEREDGE_NODES,
  MAX_SEMANTIC_ID_LENGTH,
  VALID_SEMANTIC_FILE_TYPES,
  validateSemanticFragment,
  sanitizeSemanticFragment,
  loadValidatedSemanticFragment,
} from "../src/semantic-fragment-validation.js";

describe("validateSemanticFragment - structural rejection", () => {
  it("rejects non-object input", () => {
    expect(validateSemanticFragment(null)).toEqual(["fragment must be a JSON object"]);
    expect(validateSemanticFragment("not an object")).toEqual(["fragment must be a JSON object"]);
    expect(validateSemanticFragment(42)).toEqual(["fragment must be a JSON object"]);
    expect(validateSemanticFragment([])).toEqual(["fragment must be a JSON object"]);
  });

  it("accepts an empty object as a valid (empty) fragment", () => {
    expect(validateSemanticFragment({})).toEqual([]);
  });

  it("rejects when nodes is not a list", () => {
    const errs = validateSemanticFragment({ nodes: "not a list" });
    expect(errs).toContain("nodes must be a list");
  });

  it("rejects when edges is not a list", () => {
    const errs = validateSemanticFragment({ edges: { not: "a list" } });
    expect(errs).toContain("edges must be a list");
  });

  it("rejects when hyperedges is not a list", () => {
    const errs = validateSemanticFragment({ hyperedges: 42 });
    expect(errs).toContain("hyperedges must be a list");
  });

  it("rejects non-object node entries", () => {
    const errs = validateSemanticFragment({ nodes: ["bare string"] });
    expect(errs).toContain("nodes[0] must be an object");
  });
});

describe("validateSemanticFragment - id charset and length", () => {
  it("rejects ids containing path separators", () => {
    const errs = validateSemanticFragment({
      nodes: [{ id: "../etc/passwd" }],
    });
    expect(errs.some((e) => e.includes("nodes[0].id") && e.includes("path separators"))).toBe(true);
  });

  it("rejects ids containing backslash separators", () => {
    const errs = validateSemanticFragment({
      nodes: [{ id: "a\\b" }],
    });
    expect(errs.some((e) => e.includes("nodes[0].id") && e.includes("path separators"))).toBe(true);
  });

  it("rejects empty string ids", () => {
    const errs = validateSemanticFragment({ nodes: [{ id: "" }] });
    expect(errs).toContain("nodes[0].id must not be empty");
  });

  it("rejects non-string ids", () => {
    const errs = validateSemanticFragment({ nodes: [{ id: 42 }] });
    expect(errs).toContain("nodes[0].id must be a string");
  });

  it("rejects ids containing unsupported chars", () => {
    const errs = validateSemanticFragment({
      nodes: [{ id: "weird id with space" }],
    });
    expect(errs.some((e) => e.includes("nodes[0].id") && e.includes("unsupported characters"))).toBe(true);
  });

  it("rejects ids longer than the cap", () => {
    const longId = "a".repeat(MAX_SEMANTIC_ID_LENGTH + 1);
    const errs = validateSemanticFragment({ nodes: [{ id: longId }] });
    expect(errs.some((e) => e.includes("nodes[0].id") && e.includes("max is"))).toBe(true);
  });

  it("validates edge source and target ids", () => {
    const errs = validateSemanticFragment({
      edges: [{ source: "../boom", target: "ok" }],
    });
    expect(errs.some((e) => e.includes("edges[0].source"))).toBe(true);
  });

  it("validates hyperedge id and node refs", () => {
    const errs = validateSemanticFragment({
      hyperedges: [{ id: "../escape", nodes: ["bad/ref"] }],
    });
    expect(errs.some((e) => e.includes("hyperedges[0].id"))).toBe(true);
    expect(errs.some((e) => e.includes("hyperedges[0].nodes[0]"))).toBe(true);
  });

  it("rejects when hyperedge.nodes is not a list", () => {
    const errs = validateSemanticFragment({
      hyperedges: [{ id: "ok", nodes: "not-a-list" }],
    });
    expect(errs).toContain("hyperedges[0].nodes must be a list");
  });
});

describe("validateSemanticFragment - file_type", () => {
  it("accepts valid file_type values", () => {
    for (const ft of VALID_SEMANTIC_FILE_TYPES) {
      const errs = validateSemanticFragment({
        nodes: [{ id: "ok", file_type: ft }],
      });
      expect(errs).toEqual([]);
    }
  });

  it("rejects unknown file_type values", () => {
    const errs = validateSemanticFragment({
      nodes: [{ id: "ok", file_type: "not-real" }],
    });
    expect(errs.some((e) => e.includes("nodes[0].file_type") && e.includes("not-real"))).toBe(true);
  });

  it("treats null file_type as absent (allowed)", () => {
    const errs = validateSemanticFragment({
      nodes: [{ id: "ok", file_type: null }],
    });
    expect(errs).toEqual([]);
  });
});

describe("validateSemanticFragment - counts", () => {
  it("accepts up to the node cap", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}` }));
    expect(validateSemanticFragment({ nodes })).toEqual([]);
  });

  it("rejects when too many nodes", () => {
    const nodes = Array.from({ length: MAX_SEMANTIC_FRAGMENT_NODES + 1 }, (_, i) => ({ id: `n${i}` }));
    const errs = validateSemanticFragment({ nodes });
    expect(errs.some((e) => e.includes("nodes has"))).toBe(true);
  });

  it("rejects when too many edges", () => {
    const edges = Array.from({ length: MAX_SEMANTIC_FRAGMENT_EDGES + 1 }, (_, i) => ({
      source: `s${i}`,
      target: `t${i}`,
    }));
    const errs = validateSemanticFragment({ edges });
    expect(errs.some((e) => e.includes("edges has"))).toBe(true);
  });

  it("rejects when too many hyperedges", () => {
    const hyperedges = Array.from({ length: MAX_SEMANTIC_FRAGMENT_HYPEREDGES + 1 }, (_, i) => ({
      id: `h${i}`,
      nodes: ["a", "b"],
    }));
    const errs = validateSemanticFragment({ hyperedges });
    expect(errs.some((e) => e.includes("hyperedges has"))).toBe(true);
  });

  it("rejects hyperedges that exceed the per-hyperedge member cap", () => {
    const tooMany = Array.from({ length: MAX_SEMANTIC_HYPEREDGE_NODES + 1 }, (_, i) => `m${i}`);
    const errs = validateSemanticFragment({
      hyperedges: [{ id: "huge", nodes: tooMany }],
    });
    expect(errs.some((e) => e.includes("hyperedges[0].nodes has"))).toBe(true);
  });
});

describe("validateSemanticFragment - happy path", () => {
  it("returns no errors for a minimal well-formed fragment", () => {
    expect(
      validateSemanticFragment({
        nodes: [{ id: "n1", file_type: "code" }, { id: "n2", file_type: "document" }],
        edges: [{ source: "n1", target: "n2" }],
        hyperedges: [{ id: "h1", nodes: ["n1", "n2"] }],
      }),
    ).toEqual([]);
  });
});

describe("sanitizeSemanticFragment", () => {
  it("returns the same object reference (in-place semantics)", () => {
    const fragment = { nodes: [], edges: [], hyperedges: [] };
    const out = sanitizeSemanticFragment(fragment);
    expect(out).toBe(fragment);
  });

  it("removes nodes whose file_type is 'rationale' or 'concept'", () => {
    const fragment = {
      nodes: [
        { id: "good", file_type: "code", label: "Good" },
        { id: "rat", file_type: "rationale", label: "Some long rationale text explaining why decisions were made." },
        { id: "con", file_type: "concept", label: "Short" },
      ],
      edges: [],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment);
    expect(out.nodes.map((n: { id: string }) => n.id)).toEqual(["good"]);
  });

  it("converts sentence-like rationale nodes into rationale attributes via rationale_for edges", () => {
    const longSentence = "This is a long rationale that explains the design choice for the component.";
    const fragment = {
      nodes: [
        { id: "target", file_type: "code", label: "Target" },
        { id: "rat", file_type: "rationale", label: longSentence },
      ],
      edges: [{ source: "rat", target: "target", relation: "rationale_for" }],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      nodes: Array<{ id: string; rationale?: string }>;
      edges: unknown[];
    };
    expect(out.nodes.map((n) => n.id)).toEqual(["target"]);
    const target = out.nodes.find((n) => n.id === "target");
    expect(target?.rationale).toBe(longSentence);
    expect(out.edges).toEqual([]); // rationale_for edge removed because source was dropped
  });

  it("does NOT propagate rationale via non-rationale_for edges", () => {
    const longSentence = "This explains the whole design rationale at length and with detail.";
    const fragment = {
      nodes: [
        { id: "target", file_type: "code", label: "Target" },
        { id: "rat", file_type: "rationale", label: longSentence },
      ],
      // 'references' edge: should NOT propagate rationale
      edges: [{ source: "rat", target: "target", relation: "references" }],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      nodes: Array<{ id: string; rationale?: string }>;
    };
    const target = out.nodes.find((n) => n.id === "target");
    expect(target?.rationale).toBeUndefined();
  });

  it("converts sentence-like nodes with ALLOWED file_type when they source rationale_for", () => {
    const longSentence = "Document-level rationale explaining a strategic architectural choice in detail.";
    const fragment = {
      nodes: [
        { id: "target", file_type: "code", label: "Target" },
        // allowed file_type but sentence-like + sources rationale_for
        { id: "doc", file_type: "document", label: longSentence },
      ],
      edges: [{ source: "doc", target: "target", relation: "rationale_for" }],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      nodes: Array<{ id: string; rationale?: string }>;
    };
    expect(out.nodes.map((n) => n.id)).toEqual(["target"]);
    const target = out.nodes.find((n) => n.id === "target");
    expect(target?.rationale).toBe(longSentence);
  });

  it("does NOT treat short labels as sentence-like rationale (false-positive guard)", () => {
    const fragment = {
      nodes: [
        { id: "target", file_type: "code", label: "Target" },
        // file_type rationale, but label is a short concept name
        { id: "rat", file_type: "rationale", label: "ShortName" },
      ],
      edges: [{ source: "rat", target: "target", relation: "rationale_for" }],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      nodes: Array<{ id: string; rationale?: string }>;
    };
    // node still removed because file_type is invalid, BUT no rationale text propagated
    expect(out.nodes.map((n) => n.id)).toEqual(["target"]);
    expect(out.nodes.find((n) => n.id === "target")?.rationale).toBeUndefined();
  });

  it("filters hyperedges referencing removed or unknown nodes", () => {
    const longSentence = "Long rationale text explaining the whole reason for this design choice at depth.";
    const fragment = {
      nodes: [
        { id: "a", file_type: "code", label: "A" },
        { id: "b", file_type: "code", label: "B" },
        { id: "rat", file_type: "rationale", label: longSentence },
      ],
      edges: [{ source: "rat", target: "a", relation: "rationale_for" }],
      hyperedges: [
        { id: "h1", nodes: ["a", "b", "rat"] }, // 'rat' removed -> filter to ['a', 'b']
        { id: "h2", nodes: ["a", "unknown"] }, // only one surviving -> drop
        { id: "h3", nodes: ["a", "b"] }, // both survive
      ],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      hyperedges: Array<{ id: string; nodes: string[] }>;
    };
    expect(out.hyperedges.map((h) => h.id)).toEqual(["h1", "h3"]);
    expect(out.hyperedges.find((h) => h.id === "h1")?.nodes).toEqual(["a", "b"]);
  });

  it("strips edges that reference removed nodes", () => {
    const longSentence = "Removed rationale that propagates nothing, but had non-rationale_for edges.";
    const fragment = {
      nodes: [
        { id: "a", file_type: "code", label: "A" },
        { id: "rat", file_type: "rationale", label: longSentence },
      ],
      edges: [{ source: "rat", target: "a", relation: "references" }],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment);
    expect(out.edges).toEqual([]);
  });

  it("drops nodes with empty ids", () => {
    const fragment = {
      nodes: [
        { id: "", file_type: "code", label: "Anon" },
        { id: "good", file_type: "code", label: "Good" },
      ],
      edges: [],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as { nodes: Array<{ id: string }> };
    expect(out.nodes.map((n) => n.id)).toEqual(["good"]);
  });

  it("appends multiple rationale texts onto a single target", () => {
    const r1 = "First reason explaining the rationale at significant length and with detail.";
    const r2 = "Second reason explaining the rationale at significant length and with detail.";
    const fragment = {
      nodes: [
        { id: "target", file_type: "code", label: "T" },
        { id: "r1", file_type: "rationale", label: r1 },
        { id: "r2", file_type: "rationale", label: r2 },
      ],
      edges: [
        { source: "r1", target: "target", relation: "rationale_for" },
        { source: "r2", target: "target", relation: "rationale_for" },
      ],
      hyperedges: [],
    };
    const out = sanitizeSemanticFragment(fragment) as {
      nodes: Array<{ id: string; rationale?: string }>;
    };
    const target = out.nodes.find((n) => n.id === "target");
    expect(target?.rationale).toContain(r1);
    expect(target?.rationale).toContain(r2);
  });
});

describe("loadValidatedSemanticFragment", () => {
  const tmps: string[] = [];
  afterEach(() => {
    while (tmps.length > 0) {
      rmSync(tmps.pop()!, { recursive: true, force: true });
    }
  });
  function makeDir(): string {
    const d = mkdtempSync(join(tmpdir(), "graphify-semcleanup-"));
    tmps.push(d);
    return d;
  }

  it("loads a valid JSON fragment", () => {
    const dir = makeDir();
    const file = join(dir, "chunk.json");
    writeFileSync(
      file,
      JSON.stringify({ nodes: [{ id: "a" }], edges: [], hyperedges: [] }),
      "utf-8",
    );
    const { fragment, errors } = loadValidatedSemanticFragment(file);
    expect(errors).toEqual([]);
    expect(fragment).not.toBeNull();
    expect(fragment?.nodes).toHaveLength(1);
  });

  it("returns errors for invalid JSON", () => {
    const dir = makeDir();
    const file = join(dir, "bad.json");
    writeFileSync(file, "{not json", "utf-8");
    const { fragment, errors } = loadValidatedSemanticFragment(file);
    expect(fragment).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/invalid JSON/i);
  });

  it("returns errors for missing files (stat failure)", () => {
    const dir = makeDir();
    const file = join(dir, "missing.json");
    const { fragment, errors } = loadValidatedSemanticFragment(file);
    expect(fragment).toBeNull();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/could not stat/i);
  });

  it("rejects files larger than the byte cap before parsing", () => {
    const dir = makeDir();
    const file = join(dir, "huge.json");
    // Write a payload that exceeds MAX_SEMANTIC_FRAGMENT_BYTES
    const huge = "a".repeat(MAX_SEMANTIC_FRAGMENT_BYTES + 64);
    writeFileSync(file, huge, "utf-8");
    const { fragment, errors } = loadValidatedSemanticFragment(file);
    expect(fragment).toBeNull();
    expect(errors.some((e) => e.includes("max is"))).toBe(true);
  });

  it("propagates validation errors when JSON parses but content is malformed", () => {
    const dir = makeDir();
    const file = join(dir, "malformed.json");
    writeFileSync(
      file,
      JSON.stringify({ nodes: [{ id: "../escape" }] }),
      "utf-8",
    );
    const { fragment, errors } = loadValidatedSemanticFragment(file);
    expect(fragment).toBeNull();
    expect(errors.some((e) => e.includes("path separators"))).toBe(true);
  });
});

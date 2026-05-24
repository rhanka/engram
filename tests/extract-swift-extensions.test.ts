import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { _mergeSwiftExtensions, extract, type ExtractionResult } from "../src/extract.js";
import type { GraphNode, GraphEdge } from "../src/types.js";

/**
 * Regression: cross-file `extension Foo` nodes must collapse onto the canonical
 * `Foo` class. tree-sitter-swift parses both `class Foo` and `extension Foo`
 * as `class_declaration`, and per-file node ids carry the file stem, so
 * without a corpus-level merge each file would emit its own Foo. Port of
 * upstream safishamsi 406bea4 / #969.
 *
 * The merge logic is exercised directly with synthetic per-file results so
 * the test is deterministic regardless of whether tree-sitter-swift is
 * installed in the test environment (the grammar is an optional peer dep).
 * A real-grammar integration test is included but auto-skips when the
 * grammar isn't available.
 */
describe("_mergeSwiftExtensions (upstream #969)", () => {
  function mkNode(id: string, label: string, file: string): GraphNode {
    return { id, label, file_type: "code", source_file: file, source_location: "L1" };
  }
  function mkEdge(src: string, tgt: string, rel: string, file: string): GraphEdge {
    return {
      source: src, target: tgt, relation: rel,
      confidence: "EXTRACTED", source_file: file, source_location: "L1", weight: 1.0,
    };
  }

  it("collapses an extension node onto the canonical class node when label matches exactly one", () => {
    // Per-file 1: class Foo with method one()
    // Per-file 2: extension Foo with method two() — tree-sitter emits both as
    //             class_declaration; the extension node label is "Foo" but its
    //             id carries the second file's stem.
    const fooClassId = "Foo_Foo";        // stem(Foo) + label(Foo)
    const fooExtId = "Foo_Ext_Foo";      // stem(Foo+Ext) + label(Foo)
    const oneId = "Foo_Foo_one";
    const twoId = "Foo_Ext_Foo_two";

    const perFile: ExtractionResult[] = [
      {
        nodes: [
          mkNode("Foo", "Foo.swift", "Foo.swift"),
          mkNode(fooClassId, "Foo", "Foo.swift"),
          mkNode(oneId, "one()", "Foo.swift"),
        ],
        edges: [
          mkEdge("Foo", fooClassId, "contains", "Foo.swift"),
          mkEdge(fooClassId, oneId, "method", "Foo.swift"),
        ],
      },
      {
        nodes: [
          mkNode("Foo_Ext", "Foo+Ext.swift", "Foo+Ext.swift"),
          mkNode(fooExtId, "Foo", "Foo+Ext.swift"),
          mkNode(twoId, "two()", "Foo+Ext.swift"),
        ],
        edges: [
          mkEdge("Foo_Ext", fooExtId, "contains", "Foo+Ext.swift"),
          mkEdge(fooExtId, twoId, "method", "Foo+Ext.swift"),
        ],
        swift_extensions: [{ nid: fooExtId, label: "Foo" }],
      },
    ];

    const allNodes = perFile.flatMap((r) => r.nodes);
    const allEdges = perFile.flatMap((r) => r.edges);
    const merged = _mergeSwiftExtensions(perFile, allNodes, allEdges);

    const fooNodes = merged.nodes.filter((n) => n.label === "Foo");
    expect(fooNodes.length).toBe(1);
    expect(fooNodes[0]!.id).toBe(fooClassId);

    // The extension's method edge must have been rewritten to the canonical id.
    const methodEdges = merged.edges.filter((e) => e.relation === "method");
    const methodTargets = methodEdges.map((e) => `${e.source}→${e.target}`);
    expect(methodTargets).toContain(`${fooClassId}→${oneId}`);
    expect(methodTargets).toContain(`${fooClassId}→${twoId}`);
  });

  it("leaves extensions of types outside the corpus untouched (no canonical match)", () => {
    // `extension Array { … }` references a stdlib type with no class
    // declaration in the corpus; no canonical match → no remap → node stays.
    const arrayExtId = "ArrayExt_Array";
    const helperId = "ArrayExt_Array_helper";
    const perFile: ExtractionResult[] = [
      {
        nodes: [
          mkNode("ArrayExt", "ArrayExt.swift", "ArrayExt.swift"),
          mkNode(arrayExtId, "Array", "ArrayExt.swift"),
          mkNode(helperId, "helper()", "ArrayExt.swift"),
        ],
        edges: [
          mkEdge("ArrayExt", arrayExtId, "contains", "ArrayExt.swift"),
          mkEdge(arrayExtId, helperId, "method", "ArrayExt.swift"),
        ],
        swift_extensions: [{ nid: arrayExtId, label: "Array" }],
      },
    ];

    const allNodes = perFile.flatMap((r) => r.nodes);
    const allEdges = perFile.flatMap((r) => r.edges);
    const merged = _mergeSwiftExtensions(perFile, allNodes, allEdges);

    expect(merged.nodes.filter((n) => n.label === "Array").length).toBe(1);
    expect(merged.nodes.some((n) => n.id === arrayExtId)).toBe(true);
  });

  it("leaves ambiguous-label extensions untouched (multiple candidates)", () => {
    // Two unrelated `class Foo` declarations + an `extension Foo`. Upstream
    // refuses to pick: any choice would invent edges. Both classes stay,
    // and the extension stays as its own node.
    const fooAId = "A_Foo";
    const fooBId = "B_Foo";
    const fooExtId = "Ext_Foo";
    const perFile: ExtractionResult[] = [
      {
        nodes: [mkNode("A", "A.swift", "A.swift"), mkNode(fooAId, "Foo", "A.swift")],
        edges: [mkEdge("A", fooAId, "contains", "A.swift")],
      },
      {
        nodes: [mkNode("B", "B.swift", "B.swift"), mkNode(fooBId, "Foo", "B.swift")],
        edges: [mkEdge("B", fooBId, "contains", "B.swift")],
      },
      {
        nodes: [mkNode("Ext", "Ext.swift", "Ext.swift"), mkNode(fooExtId, "Foo", "Ext.swift")],
        edges: [mkEdge("Ext", fooExtId, "contains", "Ext.swift")],
        swift_extensions: [{ nid: fooExtId, label: "Foo" }],
      },
    ];

    const allNodes = perFile.flatMap((r) => r.nodes);
    const allEdges = perFile.flatMap((r) => r.edges);
    const merged = _mergeSwiftExtensions(perFile, allNodes, allEdges);

    expect(merged.nodes.filter((n) => n.label === "Foo").length).toBe(3);
  });

  it("drops self-loop edges created by the remap", () => {
    // Pre-remap: extension Foo node has a self-relation that ends up as
    // canonical->canonical after the merge — those self-loops must drop.
    const fooClassId = "Foo_Foo";
    const fooExtId = "Foo_Ext_Foo";
    const perFile: ExtractionResult[] = [
      {
        nodes: [mkNode(fooClassId, "Foo", "Foo.swift")],
        edges: [],
      },
      {
        nodes: [mkNode(fooExtId, "Foo", "Foo+Ext.swift")],
        edges: [mkEdge(fooExtId, fooClassId, "uses", "Foo+Ext.swift")],
        swift_extensions: [{ nid: fooExtId, label: "Foo" }],
      },
    ];

    const allNodes = perFile.flatMap((r) => r.nodes);
    const allEdges = perFile.flatMap((r) => r.edges);
    const merged = _mergeSwiftExtensions(perFile, allNodes, allEdges);

    expect(merged.edges.filter((e) => e.source === e.target).length).toBe(0);
  });

  it("collapses duplicate edges after remap (same src/tgt/relation key)", () => {
    // Two extension nodes that both redirect to the same canonical produce
    // duplicate edges; the seenKeys dedup must keep only one.
    const fooClassId = "Foo_Foo";
    const ext1 = "F1_Foo";
    const ext2 = "F2_Foo";
    const helperId = "Common_helper";
    const perFile: ExtractionResult[] = [
      { nodes: [mkNode(fooClassId, "Foo", "Foo.swift"), mkNode(helperId, "helper", "Common.swift")], edges: [] },
      {
        nodes: [mkNode(ext1, "Foo", "F1.swift")],
        edges: [mkEdge(ext1, helperId, "uses", "F1.swift")],
        swift_extensions: [{ nid: ext1, label: "Foo" }],
      },
      {
        nodes: [mkNode(ext2, "Foo", "F1.swift")],
        edges: [mkEdge(ext2, helperId, "uses", "F1.swift")],
        swift_extensions: [{ nid: ext2, label: "Foo" }],
      },
    ];

    const allNodes = perFile.flatMap((r) => r.nodes);
    const allEdges = perFile.flatMap((r) => r.edges);
    const merged = _mergeSwiftExtensions(perFile, allNodes, allEdges);

    const usesEdges = merged.edges.filter((e) => e.relation === "uses");
    expect(usesEdges.length).toBe(1);
    expect(usesEdges[0]!.source).toBe(fooClassId);
    expect(usesEdges[0]!.target).toBe(helperId);
  });

  it("returns inputs unchanged when no extensions present", () => {
    const nodes = [mkNode("Foo_Foo", "Foo", "Foo.swift")];
    const edges: GraphEdge[] = [];
    const merged = _mergeSwiftExtensions([{ nodes, edges }], nodes, edges);
    expect(merged.nodes).toBe(nodes);
    expect(merged.edges).toBe(edges);
  });
});

describe("Swift cross-file extension dedup (integration via real grammar)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "graphify-swift-ext-int-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("collapses `extension Foo` from a sibling file onto canonical `class Foo`", async () => {
    writeFileSync(join(dir, "Foo.swift"), "class Foo {\n    func one() {}\n}\n");
    writeFileSync(join(dir, "Foo+Ext.swift"), "extension Foo {\n    func two() {}\n}\n");

    const result = await extract([
      join(dir, "Foo.swift"),
      join(dir, "Foo+Ext.swift"),
    ]);

    // If tree-sitter-swift isn't installed in this environment, the extractor
    // returns empty nodes; skip the assertion rather than fail.
    const fooNodes = result.nodes.filter((n) => n.label === "Foo");
    if (fooNodes.length === 0) {
      // grammar absent — covered by the synthetic unit tests above
      return;
    }
    expect(fooNodes.length).toBe(1);
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAppContextRelationRecords, extractSpecs } from "../src/app-context/extract-spec.js";
import { buildFromJson } from "../src/build.js";
import { loadGraphFromData, serializeGraph } from "../src/graph.js";
import type { GraphEdge } from "../src/types.js";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function emission(overrides: Partial<GraphEdge> = {}): GraphEdge {
  return {
    source: "spec", target: "target", relation: "governs", confidence: "EXTRACTED",
    source_file: "docs/spec/example.md", source_location: "L3", derivation_method: "spec_frontmatter_governs",
    evidence_refs: ["ev:frontmatter"],
    citations: [{ source_file: "docs/spec/example.md", line_start: 3, line_end: 3, commit: "a".repeat(40) }],
    ...overrides,
  };
}

describe("app-context multi-links compatibility projection", () => {
  it("keeps distinct citation payloads at the same locator, independent of emission order", () => {
    const first = emission();
    const second = emission({
      derivation_method: "spec_map_governs", evidence_refs: ["ev:manifest"],
      citations: first.citations!.map(citation => ({ ...citation, excerpt_sha256: "different-text" })),
    });
    const records = buildAppContextRelationRecords([first, second, first]);
    expect(records).toHaveLength(1);
    expect(records[0]!.citations).toHaveLength(2);
    expect(records[0]!.citations).toEqual(expect.arrayContaining([first.citations![0], second.citations![0]]));
    expect(records[0]!.derivation_methods).toEqual(["spec_frontmatter_governs", "spec_map_governs"]);
    expect(records[0]!.evidence_refs).toEqual(["ev:frontmatter", "ev:manifest"]);
    expect(buildAppContextRelationRecords([second, first])).toEqual(records);
  });

  it("groups effective directed triples without collapsing reciprocals, relations or tuple delimiters", () => {
    const edges = [
      emission({ source: "raw-a", target: "raw-b", _src: "a", _tgt: "b" }),
      emission({ source: "b", target: "a", _src: "a", _tgt: "b" }),
      emission({ source: "b", target: "a" }),
      emission({ source: "a", target: "b", relation: "refines" }),
      emission({ source: "a", target: "a" }),
      emission({ source: "a\0b", target: "c" }),
      emission({ source: "a", target: "b\0c" }),
      emission({ source: "\ud800", target: "b" }),
    ];
    const records = buildAppContextRelationRecords(edges);
    expect(records).toHaveLength(7);
    expect(records.map(({ source, target, relation }) => [source, target, relation])).toEqual(expect.arrayContaining([
      ["a", "b", "governs"], ["b", "a", "governs"], ["a", "b", "refines"], ["a", "a", "governs"],
      ["a\0b", "c", "governs"], ["a", "b\0c", "governs"], ["\ud800", "b", "governs"],
    ]));
    expect(buildAppContextRelationRecords([...edges].reverse())).toEqual(records);
  });

  it("derives the projection from captured observations without rewriting or trusting scalar shells", () => {
    const observation = {
      source_file: "/repo/docs/spec/example.md", confidence: "EXTRACTED", derivation_method: "spec_map_governs",
      evidence_refs: ["ev:original"], citations: emission().citations,
    };
    const captured = emission({
      source_file: "rewritten.md", derivation_method: "shell-only", evidence_refs: ["ev:shell"], citations: [],
      evidence_observations: [observation],
    });
    const before = structuredClone(captured);
    const [record] = buildAppContextRelationRecords([captured]);
    expect(record!.derivation_methods).toEqual(["spec_map_governs"]);
    expect(record!.evidence_refs).toEqual(["ev:original"]);
    expect(record!.citations).toEqual(observation.citations);
    record!.citations[0]!.source_file = "projection-only.md";
    expect(captured).toEqual(before);
  });

  it("returns the derived confidence for fresh non-EXTRACTED input", () => {
    const [record] = buildAppContextRelationRecords([emission({ confidence: "INFERRED" })]);
    expect(record!.confidence).toBe("INFERRED");
  });

  it("omits the confidence key when captured observations carry none", () => {
    const observation = {
      source_file: "/repo/docs/spec/example.md", derivation_method: "spec_map_governs",
      evidence_refs: ["ev:original"], citations: emission().citations,
    };
    const captured = emission({ evidence_observations: [observation] });
    const before = structuredClone(captured);
    const [record] = buildAppContextRelationRecords([captured]);
    expect("confidence" in record!).toBe(false);
    expect(record!.confidence).toBeUndefined();
    expect(captured).toEqual(before);
  });

  it("handles 150000 identical contributions as one bucket without input-sized call arity", () => {
    const edge = emission();
    expect(buildAppContextRelationRecords(Array.from({ length: 150_000 }, () => edge)))
      .toEqual(buildAppContextRelationRecords([edge]));
  });

  it("builds one persisted link per triple with every explicit declaration preserved verbatim", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "appctx-multi-links-"));
    tempDirs.push(rootDir);
    mkdirSync(join(rootDir, "docs/spec"), { recursive: true });
    mkdirSync(join(rootDir, ".engram"));
    writeFileSync(join(rootDir, "docs/spec/current.md"), "---\nid: current\nsupersedes: [previous]\n---\n# Current\n");
    writeFileSync(join(rootDir, "docs/spec/previous.md"), "---\nid: previous\n---\n# Previous\n");
    writeFileSync(join(rootDir, ".engram/spec-map.yaml"), "entries:\n  - path: docs/spec/current.md\n    supersedes: [previous]\n");
    const result = await extractSpecs({ rootDir, repoKey: "example", commit: "a".repeat(40) });
    expect(result.diagnostics).toEqual([]);
    const emissions = result.edges.filter(edge => edge.relation === "supersedes");
    expect(emissions).toHaveLength(2);
    expect(emissions.every(edge => edge.evidence_observations === undefined)).toBe(true);
    const expectedObservations = emissions.map(edge => ({
      source_file: edge.source_file, source_location: edge.source_location, confidence: edge.confidence,
      derivation_method: edge.derivation_method, evidence_refs: edge.evidence_refs, citations: edge.citations,
    }));
    const graph = buildFromJson(result.extraction, { root: rootDir });
    const serialized = serializeGraph(graph);
    const links = serialized.links.filter(link => link.relation === "supersedes");
    expect(links).toHaveLength(1);
    expect(links[0]!.evidence_observations).toHaveLength(2);
    expect(links[0]!.evidence_observations).toEqual(expect.arrayContaining(expectedObservations));
    expect(links[0]!.derivation_methods).toEqual(["spec_frontmatter_supersedes", "spec_map_supersedes"]);
    expect(serializeGraph(loadGraphFromData(serialized)).links).toEqual(serialized.links);
    expect(graph.hasAttribute("app_context")).toBe(false);
    const before = serializeGraph(graph);
    result.relations.splice(0);
    expect(serializeGraph(graph)).toEqual(before);
  });
});

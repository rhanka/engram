/**
 * MCP-L3 — Filtered memory projection into the graph (restored D3/D10).
 *
 * Derived from SPEC-memory-mcp-v3.2.md M10 (l.1354-1405), M11 (l.1407+), the
 * MCP-L3 row (l.1675) and the filtered-projection acceptance row (l.1431), on
 * top of spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md D3 (l.73-77), §5.8 (l.1056)
 * and D10 (l.1643-1649). Each case cites its normative line below.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { buildFromJson, buildMerge } from "../src/build.js";
import { toJson } from "../src/export.js";
import { generate } from "../src/report.js";
import { toWiki } from "../src/wiki.js";
import { loadCached, saveCached } from "../src/cache.js";
import { validateExtraction } from "../src/validate.js";
import {
  MEMORY_PROJECTION_RAW_BYTE_CEILING,
  type Digest,
} from "../engram-memory/index.js";
import {
  MEMORY_GRAPH_PROJECTION_RELATION_V1,
  assembleMemoryGraphProjection,
  assertMemoryProjectionFresh,
  attachMemoryProjectionToGraph,
  checkGraphMemoryFreshness,
  isMemoryProjectionFresh,
  reconcileMemoryProjectionInGraph,
  type MemoryGraphCandidateV1,
  type MemoryGraphRecordState,
} from "../src/memory-graph-projection.js";

const DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Digest;
const CODE_NODES = ["alpha_fn", "beta_fn"];

function codeExtraction() {
  return {
    nodes: CODE_NODES.map((id) => ({ id, label: `${id}()`, file_type: "code" as const, source_file: "src/sample.ts" })),
    edges: [{ source: "alpha_fn", target: "beta_fn", relation: "calls", confidence: "EXTRACTED" as const, source_file: "src/sample.ts" }],
    input_tokens: 0,
    output_tokens: 0,
  };
}

function candidate(overrides: Partial<MemoryGraphCandidateV1> = {}): MemoryGraphCandidateV1 {
  return {
    record_id: "mem:admitted:001",
    state: "accepted_current",
    projection_eligible: true,
    authorized: true,
    eligible_now: true,
    record_digest: DIGEST,
    scope_ref: "scope:l3",
    valid_time: { t: 1 },
    projection_cursor: "7",
    citation_refs: ["source:l3"],
    code_targets: ["alpha_fn"],
    ...overrides,
  };
}

function assembleInput(candidates: MemoryGraphCandidateV1[]) {
  return {
    high_water_cursor: "7",
    projection_cursor: "7",
    candidates,
    code_node_ids: CODE_NODES,
  };
}

const cleanupDirs: string[] = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

const NON_CURRENT: MemoryGraphRecordState[] = [
  "pending", "rejected", "accepted_disputed", "withdrawn", "historical", "expired", "trust_invalid", "tombstoned",
];

describe("MCP-L3 filtered memory projection (M10 l.1368; MCP-L3 l.1675)", () => {
  it("projects an admitted, eligible, authorized memory as a memory node linked to its code node, with §5.8 fields only", () => {
    const assembled = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.value.included).toEqual(["mem:admitted:001"]);

    const extraction = { ...codeExtraction(), nodes: [...codeExtraction().nodes, ...assembled.value.extraction.nodes], edges: [...codeExtraction().edges, ...assembled.value.extraction.edges] };
    expect(validateExtraction(extraction)).toEqual([]);

    const node = assembled.value.extraction.nodes[0] as Record<string, unknown>;
    expect(node.file_type).toBe("memory");
    expect(Object.keys(node).sort()).toEqual(["citation_refs", "file_type", "id", "label", "memory_projection", "source_file"]);
    const envelope = node.memory_projection as Record<string, unknown>;
    expect(Object.keys(envelope).sort()).toEqual(["envelope_digest", "projection_cursor", "record_digest", "record_id", "schema_version", "scope_ref", "valid_time"]);

    const edge = assembled.value.extraction.edges[0] as Record<string, unknown>;
    expect(edge.relation).toBe(MEMORY_GRAPH_PROJECTION_RELATION_V1);
    expect([edge.source, edge.target]).toContain("memory:mem:admitted:001");
    expect([edge.source, edge.target]).toContain("alpha_fn");

    // §5.8/D10 l.1366: never bodies, pending data, journal events, tombstone
    // history, receipts, backup material or vectors.
    const raw = JSON.stringify(assembled.value.extraction);
    for (const forbidden of ["components", "ciphertext", "event_hash", "tombstone", "authorization", "rank_receipt", "vector"]) {
      expect(raw.includes(`"${forbidden}"`)).toBe(false);
    }

    const G = buildFromJson(extraction);
    expect(G.hasNode("memory:mem:admitted:001")).toBe(true);
    expect(G.hasEdge("memory:mem:admitted:001", "alpha_fn")).toBe(true);
  });

  it("excludes every non-current state and every non-authorized record before assembly, with deterministic omission reasons", () => {
    for (const state of NON_CURRENT) {
      const recId = `mem:${state}:001`;
      const assembled = assembleMemoryGraphProjection(assembleInput([candidate({ record_id: recId, state })]));
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) continue;
      expect(assembled.value.included).toEqual([]);
      expect(assembled.value.extraction.nodes).toEqual([]);
      expect(assembled.value.extraction.edges).toEqual([]);
      expect(assembled.value.omitted_by_reason[state]).toBe(1);
      expect(JSON.stringify(assembled.value.extraction).includes(recId)).toBe(false);
    }
  });

  it("requires literal === true for eligibility and authorization (M4 literal-true; A10-R2 mutant-killer)", () => {
    // Truthy-but-not-true, absent and false values MUST NOT project.
    const variants: Array<Partial<MemoryGraphCandidateV1>> = [
      { projection_eligible: 1 }, { projection_eligible: "true" }, { projection_eligible: undefined },
      { projection_eligible: false }, { authorized: 1 }, { authorized: "yes" }, { authorized: undefined },
      { authorized: false }, { eligible_now: 0 }, { eligible_now: null }, { eligible_now: undefined }, { eligible_now: false },
    ];
    for (const variant of variants) {
      const assembled = assembleMemoryGraphProjection(assembleInput([candidate({ record_id: "mem:mutant:001", ...variant })]));
      expect(assembled.ok).toBe(true);
      if (!assembled.ok) continue;
      expect(assembled.value.included).toEqual([]);
      expect(assembled.value.extraction.nodes).toEqual([]);
    }
  });

  it("removes the memory at the next regeneration/reconciliation after each terminal transition (M10 l.1368)", () => {
    const first = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, first.value);
    expect(G.hasNode("memory:mem:admitted:001")).toBe(true);

    const terminal: MemoryGraphRecordState[] = ["accepted_disputed", "withdrawn", "historical", "expired", "trust_invalid", "tombstoned"];
    for (const state of terminal) {
      const next = assembleMemoryGraphProjection(assembleInput([candidate({ state })]));
      expect(next.ok).toBe(true);
      if (!next.ok) continue;
      const receipt = reconcileMemoryProjectionInGraph(G, next.value);
      expect(receipt.removed).toContain("mem:admitted:001");
      expect(G.hasNode("memory:mem:admitted:001")).toBe(false);
      expect(G.hasEdge("memory:mem:admitted:001", "alpha_fn")).toBe(false);
      // Re-attach for the next transition in the loop.
      const back = assembleMemoryGraphProjection(assembleInput([candidate()]));
      if (back.ok) attachMemoryProjectionToGraph(G, back.value);
    }
    // Code nodes survive every reconciliation (foreign objects preserved, M10 l.1374).
    expect(G.hasNode("alpha_fn")).toBe(true);
    expect(G.hasNode("beta_fn")).toBe(true);
  });

  it("never serves a stale projection as current (M10 l.1372)", () => {
    expect(isMemoryProjectionFresh("7", "7")).toBe(true);
    expect(isMemoryProjectionFresh("9", "7")).toBe(true);
    expect(isMemoryProjectionFresh("7", "9")).toBe(false);
    expect(() => assertMemoryProjectionFresh("7", "9")).toThrow(/PROJECTION_STALE/);

    const fresh = assembleMemoryGraphProjection({ ...assembleInput([candidate({ projection_cursor: "9" })]), projection_cursor: "9", high_water_cursor: "9" });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, fresh.value);
    expect(() => checkGraphMemoryFreshness(G, "9")).not.toThrow();
    expect(() => checkGraphMemoryFreshness(G, "12")).toThrow(/PROJECTION_STALE/);
    // A code-only graph carries no projection and stays servable.
    expect(() => checkGraphMemoryFreshness(buildFromJson(codeExtraction()), "12")).not.toThrow();
  });

  it("never resurrects a tombstoned record on replay, and never touches the canonical journal (D3 l.1364; M10 l.1372)", () => {
    // A replayed batch that still lists a tombstoned record as current MUST NOT re-add it.
    const replayed = assembleMemoryGraphProjection({
      ...assembleInput([candidate()]),
      tombstoned_ids: ["mem:admitted:001"],
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.included).toEqual([]);
    expect(replayed.value.extraction.nodes).toEqual([]);

    // The module is data-pure: it cannot commit, admit, mutate or resurrect.
    const source = readFileSync(new URL("../src/memory-graph-projection.ts", import.meta.url), "utf-8");
    for (const forbidden of ["CanonicalMemoryStorePort", "MemoryPortV2", "pushGraph", "readJournal", "transition(", "capture(", "requestAdmission", "GraphStore"]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  it("enforces the 52_428_800-byte ceiling deterministically, refusing without silent loss (D10 l.1362)", () => {
    expect(MEMORY_PROJECTION_RAW_BYTE_CEILING).toBe(52_428_800);
    const tiny = assembleMemoryGraphProjection({ ...assembleInput([candidate()]), byte_ceiling: 10 });
    expect(tiny.ok).toBe(false);
    if (tiny.ok) return;
    expect(tiny.error.code).toBe("PROJECTION_OVERSIZED");
    expect(tiny.error.message).toContain("1 objects");

    const first = assembleMemoryGraphProjection(assembleInput([candidate(), candidate({ record_id: "mem:admitted:002", code_targets: ["beta_fn"] })]));
    const second = assembleMemoryGraphProjection(assembleInput([candidate({ record_id: "mem:admitted:002", code_targets: ["beta_fn"] }), candidate()]));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.extraction).toEqual(second.value.extraction);
    expect(first.value.projection_digest).toBe(second.value.projection_digest);
  });

  it("buildMerge reconciles memory on regeneration without tripping the shrink guard on memory-only shrinkage", () => {
    const dir = tempDir("graphify-l3-merge-");
    const graphPath = join(dir, "graph.json");
    const stale = new Graph();
    stale.addNode("alpha_fn", { label: "alpha_fn()", file_type: "code", source_file: "src/sample.ts" });
    stale.addNode("memory:mem:stale:001", { label: "mem:stale:001", file_type: "memory", source_file: "", memory_projection: { schema_version: 2 }, citation_refs: [] });
    writeFileSync(graphPath, JSON.stringify({ directed: false, graph: {}, nodes: [{ id: "alpha_fn", label: "alpha_fn()", file_type: "code", source_file: "src/sample.ts" }, { id: "memory:mem:stale:001", label: "mem:stale:001", file_type: "memory", source_file: "" }], links: [] }), "utf-8");

    const fresh = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const G = buildMerge([{ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }], { graphPath, memoryProjection: fresh.value });
    expect(G.hasNode("alpha_fn")).toBe(true);
    expect(G.hasNode("memory:mem:stale:001")).toBe(false);
    expect(G.hasNode("memory:mem:admitted:001")).toBe(true);
  });

  it("report, wiki, export and caches expose only what is projected (M10 l.1368-1369)", () => {
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    const excluded = assembleMemoryGraphProjection(assembleInput([candidate({ record_id: "mem:private:009", state: "accepted_current", authorized: false, citation_refs: ["source:private"] })]));
    expect(admitted.ok && excluded.ok).toBe(true);
    if (!admitted.ok || !excluded.ok) return;
    expect(excluded.value.included).toEqual([]);

    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    const communities = new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]);

    const dir = tempDir("graphify-l3-surfaces-");
    const graphPath = join(dir, "graph.json");
    expect(toJson(G, communities, graphPath, { force: true })).toBe(true);
    const persisted = readFileSync(graphPath, "utf-8");
    expect(persisted.includes("mem:admitted:001")).toBe(true);
    expect(persisted.includes("mem:private:009")).toBe(false);
    expect(persisted.includes("source:private")).toBe(false);

    const wikiDir = join(dir, "wiki");
    expect(toWiki(G, communities, wikiDir)).toBeGreaterThan(0);
    const wikiText = readdirSync(wikiDir).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(wikiDir, f), "utf-8")).join("\n");
    expect(wikiText.includes("mem:admitted:001")).toBe(true);
    expect(wikiText.includes("mem:private:009")).toBe(false);

    const report = generate(G, communities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], { files: {}, total_files: 1, total_words: 100, needs_graph: true, warning: null, skipped_sensitive: [], graphifyignore_patterns: 0 }, { input: 0, output: 0 }, dir);
    expect(report.includes("mem:private:009")).toBe(false);
    expect(report.includes("source:private")).toBe(false);

    const cacheFile = join(dir, "sample.ts");
    writeFileSync(cacheFile, "export function demo() { return 1; }\n", "utf-8");
    saveCached(cacheFile, admitted.value.extraction, dir);
    const cached = loadCached(cacheFile, dir) as { nodes: Array<{ id: string }> } | null;
    expect(cached?.nodes.map((n) => n.id)).toContain("memory:mem:admitted:001");
    expect(JSON.stringify(cached).includes("mem:private:009")).toBe(false);
  });
});

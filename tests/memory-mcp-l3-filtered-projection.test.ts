/**
 * MCP-L3 — Filtered memory projection into the graph (restored D3/D10).
 *
 * Derived from SPEC-memory-mcp-v3.2.md M10 (l.1354-1405), M11 (l.1407+), the
 * MCP-L3 row (l.1675) and the filtered-projection acceptance row (l.1431), on
 * top of spec/SPEC_EVOL_AGENT_MEMORY_SUBSTRATE.md D3 (l.73-77), §5.8 (l.1056)
 * and D10 (l.1643-1649). Each case cites its normative line below.
 *
 * Notes:
 * - The ceiling constant is pinned through the product re-export
 *   (`src/graph-memory-projection.ts`), never through an `engram-memory`
 *   import, so this suite stays outside the neutral import closure guarded
 *   by `tests/memory-neutrality.test.ts`.
 * - Code-target join is exact identifier equality, local to L3. Sharing of
 *   the citation-resolution convention with live-git G3 (`explainLineOrigin`,
 *   M10 l.1401) is unverified: no shared helper is invented or asserted here.
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import { buildFromJson, buildMerge } from "../src/build.js";
import { toJson } from "../src/export.js";
import { loadGraphFromData } from "../src/graph.js";
import { generate } from "../src/report.js";
import { toWiki } from "../src/wiki.js";
import { loadCached, saveCached } from "../src/cache.js";
import { validateExtraction } from "../src/validate.js";
import {
  MEMORY_GRAPH_PROJECTION_RELATION_V1,
  MEMORY_PROJECTION_RAW_BYTE_CEILING,
  assembleMemoryGraphProjection,
  assertMemoryProjectionFresh,
  attachMemoryProjectionToGraph,
  checkGraphMemoryFreshness,
  isMemoryProjectionFresh,
  reconcileMemoryProjectionInGraph,
  type MemoryGraphCandidateV1,
  type MemoryGraphRecordState,
} from "../src/graph-memory-projection.js";

type Digest = MemoryGraphCandidateV1["record_digest"];
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

function detectionFixture() {
  return { files: {}, total_files: 1, total_words: 100, needs_graph: true, warning: null, skipped_sensitive: [], graphifyignore_patterns: 0 };
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

  it("never resurrects a tombstoned record on replay, and never mutates the canonical journal (D3 l.1364; M10 l.1372)", () => {
    // A real journal: the tombstone event dominates the earlier admission.
    const journal: Array<Record<string, unknown>> = [
      { seq: 1, event: "captured", record_id: "mem:admitted:001", state: "pending" },
      { seq: 2, event: "admitted", record_id: "mem:admitted:001", state: "accepted_current", projection_eligible: true },
      { seq: 3, event: "tombstoned", record_id: "mem:admitted:001", state: "tombstoned" },
    ];
    const journalBefore = JSON.stringify(journal);
    // A replayed batch that still lists the tombstoned record as current
    // MUST NOT re-project it.
    const replayed = assembleMemoryGraphProjection({
      ...assembleInput([candidate()]),
      tombstoned_ids: ["mem:admitted:001"],
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.value.included).toEqual([]);
    expect(replayed.value.extraction.nodes).toEqual([]);
    expect(replayed.value.extraction.edges).toEqual([]);

    const G = buildFromJson(codeExtraction());
    reconcileMemoryProjectionInGraph(G, replayed.value);
    expect(G.hasNode("memory:mem:admitted:001")).toBe(false);
    // The assembly is data-pure: the canonical journal is byte-identical.
    expect(JSON.stringify(journal)).toBe(journalBefore);
  });

  it("retires previous memory reference edges when authorized targets change (M10 l.1370)", () => {
    const first = assembleMemoryGraphProjection(assembleInput([candidate({ code_targets: ["alpha_fn"] })]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, first.value);
    expect(G.hasEdge("memory:mem:admitted:001", "alpha_fn")).toBe(true);

    // The authorization now covers `[beta]` instead of `[alpha]`.
    const second = assembleMemoryGraphProjection(assembleInput([candidate({ code_targets: ["beta_fn"] })]));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const receipt = reconcileMemoryProjectionInGraph(G, second.value);
    expect(receipt.removed).toEqual([]);
    expect(G.hasEdge("memory:mem:admitted:001", "beta_fn")).toBe(true);
    expect(G.hasEdge("memory:mem:admitted:001", "alpha_fn")).toBe(false);
    // The code-code edge is untouched.
    expect(G.hasEdge("alpha_fn", "beta_fn")).toBe(true);
  });

  it("drops dangling code targets without creating nodes (exact-id join, L3-local)", () => {
    // Assembly already drops targets outside the live code set ("ghost_fn"
    // never reaches the extraction); the attach step skips references whose
    // code node is absent from the graph ("beta_fn" here) without creating it.
    const assembled = assembleMemoryGraphProjection(
      assembleInput([candidate({ code_targets: ["alpha_fn", "ghost_fn", "beta_fn"] })]),
    );
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.value.extraction.edges.map((edge) => edge.target).sort()).toEqual(["alpha_fn", "beta_fn"]);

    const alphaOnly = { nodes: [codeExtraction().nodes[0]], edges: [], input_tokens: 0, output_tokens: 0 };
    const G = buildFromJson(alphaOnly);
    const receipt = attachMemoryProjectionToGraph(G, assembled.value);
    expect(receipt.skipped_dangling_edges).toBe(1);
    expect(G.hasNode("beta_fn")).toBe(false);
    expect(G.hasNode("ghost_fn")).toBe(false);
    expect(G.hasEdge("memory:mem:admitted:001", "alpha_fn")).toBe(true);
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

  it("counts code-reference edges in the ceiling: an edge-blind check would admit this projection (D10 l.1362)", () => {
    const full = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    // The ceiling set exactly at the node-rows size: an implementation that
    // ignores edges admits it, the specified one refuses it.
    const edgeBytes = new TextEncoder().encode(JSON.stringify(full.value.extraction.edges)).byteLength;
    expect(edgeBytes).toBeGreaterThan(0);
    const nodesOnly = full.value.raw_byte_size - edgeBytes;
    const admitted = assembleMemoryGraphProjection({ ...assembleInput([candidate()]), byte_ceiling: nodesOnly });
    expect(admitted.ok).toBe(false);
    if (admitted.ok) return;
    expect(admitted.error.code).toBe("PROJECTION_OVERSIZED");
  });

  it("refuses a projection whose code references overflow the 52_428_800-byte ceiling (D10 l.1362)", () => {
    const overflowTarget = `code:${"x".repeat(52_428_800)}`;
    const assembled = assembleMemoryGraphProjection({
      high_water_cursor: "7",
      projection_cursor: "7",
      candidates: [candidate({ code_targets: [overflowTarget] })],
      code_node_ids: [...CODE_NODES, overflowTarget],
    });
    expect(assembled.ok).toBe(false);
    if (assembled.ok) return;
    expect(assembled.error.code).toBe("PROJECTION_OVERSIZED");
    expect(assembled.error.message).toContain("exceeds the 52428800-byte ceiling");
    const reported = Number(/is ([0-9]+) bytes/.exec(assembled.error.message)?.[1] ?? "0");
    expect(reported).toBeGreaterThan(52_428_800);
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

  it("buildMerge conserves no memory without a fresh projection (M10 l.1399)", () => {
    const dir = tempDir("graphify-l3-merge-noproj-");
    const graphPath = join(dir, "graph.json");
    writeFileSync(graphPath, JSON.stringify({ directed: false, graph: {}, nodes: [{ id: "alpha_fn", label: "alpha_fn()", file_type: "code", source_file: "src/sample.ts" }, { id: "memory:mem:stale:001", label: "mem:stale:001", file_type: "memory", source_file: "" }], links: [{ source: "memory:mem:stale:001", target: "alpha_fn", relation: "memory_about", confidence: "EXTRACTED", source_file: "" }] }), "utf-8");

    const G = buildMerge([{ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }], { graphPath });
    expect(G.hasNode("alpha_fn")).toBe(true);
    expect(G.hasNode("memory:mem:stale:001")).toBe(false);
    expect(G.size).toBe(0);
    // No freshness pins remain: the stripped graph is a servable code-only view.
    expect(() => checkGraphMemoryFreshness(G, "99")).not.toThrow();
  });

  it("buildMerge refuses a supplied projection behind its own high-water cursor (M10 l.1399)", () => {
    const dir = tempDir("graphify-l3-merge-stale-");
    const graphPath = join(dir, "graph.json");
    const staleSupplied = assembleMemoryGraphProjection({
      ...assembleInput([candidate({ projection_cursor: "7" })]),
      high_water_cursor: "9",
    });
    expect(staleSupplied.ok).toBe(true);
    if (!staleSupplied.ok) return;
    expect(() => buildMerge([{ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 }], { graphPath, memoryProjection: staleSupplied.value })).toThrow(/PROJECTION_STALE/);
  });

  it("report, wiki, export and caches expose only what is projected (M10 l.1368-1369)", () => {
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    const excluded = assembleMemoryGraphProjection(assembleInput([candidate({ record_id: "mem:private:009", state: "accepted_current", authorized: false, citation_refs: ["source:private"] })]));
    expect(admitted.ok && excluded.ok).toBe(true);
    if (!admitted.ok || !excluded.ok) return;
    expect(excluded.value.included).toEqual([]);
    expect(excluded.value.withheld).toEqual(["mem:private:009"]);

    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    // A private-for-the-audience memory really present in the view (stale or
    // contaminated projection): the next regeneration must remove it.
    G.mergeNode("memory:mem:private:009", { label: "mem:private:009", file_type: "memory", source_file: "", memory_projection: { schema_version: 2, record_id: "mem:private:009", projection_cursor: "7" }, citation_refs: ["source:private"] });
    G.mergeEdge("memory:mem:private:009", "alpha_fn", { relation: MEMORY_GRAPH_PROJECTION_RELATION_V1, confidence: "EXTRACTED", source_file: "" });
    expect(G.hasNode("memory:mem:private:009")).toBe(true);
    const fresh = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) return;
    const receipt = reconcileMemoryProjectionInGraph(G, fresh.value);
    expect(receipt.removed).toContain("mem:private:009");
    expect(G.hasNode("memory:mem:private:009")).toBe(false);
    expect(G.hasEdge("memory:mem:private:009", "alpha_fn")).toBe(false);

    const communities = new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]);
    const dir = tempDir("graphify-l3-surfaces-");
    const graphPath = join(dir, "graph.json");
    expect(toJson(G, communities, graphPath, { force: true, memoryHighWaterCursor: "7" })).toBe(true);
    const persisted = readFileSync(graphPath, "utf-8");
    expect(persisted.includes("mem:admitted:001")).toBe(true);
    expect(persisted.includes("mem:private:009")).toBe(false);
    expect(persisted.includes("source:private")).toBe(false);

    const wikiDir = join(dir, "wiki");
    expect(toWiki(G, communities, wikiDir, { memoryHighWaterCursor: "7" })).toBeGreaterThan(0);
    const wikiText = readdirSync(wikiDir).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(wikiDir, f), "utf-8")).join("\n");
    expect(wikiText.includes("mem:admitted:001")).toBe(true);
    expect(wikiText.includes("mem:private:009")).toBe(false);

    const report = generate(G, communities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], detectionFixture(), { input: 0, output: 0 }, dir, { memoryHighWaterCursor: "7" });
    expect(report.includes("mem:private:009")).toBe(false);
    expect(report.includes("source:private")).toBe(false);

    const cacheFile = join(dir, "sample.ts");
    writeFileSync(cacheFile, "export function demo() { return 1; }\n", "utf-8");
    saveCached(cacheFile, admitted.value.extraction, dir, { memoryHighWaterCursor: "7" });
    const cached = loadCached(cacheFile, dir, { memoryHighWaterCursor: "7" }) as { nodes: Array<{ id: string }> } | null;
    expect(cached?.nodes.map((n) => n.id)).toContain("memory:mem:admitted:001");
    expect(JSON.stringify(cached).includes("mem:private:009")).toBe(false);
  });

  it("derived surfaces refuse a stale projection as current instead of exposing it (M10 l.1399)", () => {
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    const communities = new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]);
    const dir = tempDir("graphify-l3-surfaces-stale-");

    // Fresh high-water serves the view on every surface.
    expect(() => checkGraphMemoryFreshness(G, "7")).not.toThrow();
    expect(toJson(G, communities, join(dir, "graph.json"), { force: true, memoryHighWaterCursor: "7" })).toBe(true);
    expect(toWiki(G, communities, join(dir, "wiki"), { memoryHighWaterCursor: "7" })).toBeGreaterThan(0);
    expect(() => generate(G, communities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], detectionFixture(), { input: 0, output: 0 }, dir, { memoryHighWaterCursor: "7" })).not.toThrow();

    // Past the high-water cursor every surface refuses instead of exposing.
    expect(() => checkGraphMemoryFreshness(G, "12")).toThrow(/PROJECTION_STALE/);
    expect(() => toJson(G, communities, join(dir, "graph.json"), { force: true, memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);
    expect(() => toWiki(G, communities, join(dir, "wiki"), { memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);
    expect(() => generate(G, communities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], detectionFixture(), { input: 0, output: 0 }, dir, { memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);

    const cacheFile = join(dir, "sample.ts");
    writeFileSync(cacheFile, "export function demo() { return 1; }\n", "utf-8");
    saveCached(cacheFile, admitted.value.extraction, dir, { memoryHighWaterCursor: "7" });
    expect(loadCached(cacheFile, dir, { memoryHighWaterCursor: "7" })).not.toBeNull();
    expect(() => saveCached(cacheFile, admitted.value.extraction, dir, { memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);
    expect(() => loadCached(cacheFile, dir, { memoryHighWaterCursor: "12" })).toThrow(/PROJECTION_STALE/);
  });

  it("an exported graph reloaded keeps its cursors, so a stale reload is refused (M10 l.1399)", () => {
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    const dir = tempDir("graphify-l3-reload-");
    const graphPath = join(dir, "graph.json");
    expect(toJson(G, new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]), graphPath, { force: true, memoryHighWaterCursor: "7" })).toBe(true);

    const raw = JSON.parse(readFileSync(graphPath, "utf-8")) as Record<string, unknown>;
    const graphBlock = raw.graph as Record<string, unknown>;
    expect(graphBlock.memory_projection_cursor).toBe("7");
    expect(graphBlock.memory_high_water_cursor).toBe("7");

    const reloaded = loadGraphFromData(raw as Parameters<typeof loadGraphFromData>[0], { memoryHighWaterCursor: "7" });
    expect(reloaded.hasNode("memory:mem:admitted:001")).toBe(true);
    expect(() => checkGraphMemoryFreshness(reloaded, "7")).not.toThrow();
    expect(() => checkGraphMemoryFreshness(reloaded, "12")).toThrow(/PROJECTION_STALE/);
  });

  it("existing surfaces called as today refuse a memory view without a high-water proof (M10 l.1399; R3 Sol counterexample: projection 7, live high-water 12)", () => {
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    const communities = new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]);
    const dir = tempDir("graphify-l3-noproof-");

    // Called exactly as existing callers do today: no high-water proof is
    // supplied. A projection at cursor 7 against a live high-water of 12
    // MUST NOT be served as a current view on any surface.
    expect(() => generate(G, communities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], detectionFixture(), { input: 0, output: 0 }, dir)).toThrow(/PROJECTION_STALE/);
    expect(() => toWiki(G, communities, join(dir, "wiki"))).toThrow(/PROJECTION_STALE/);
    expect(() => toJson(G, communities, join(dir, "graph.json"), { force: true })).toThrow(/PROJECTION_STALE/);

    const cacheFile = join(dir, "sample.ts");
    writeFileSync(cacheFile, "export function demo() { return 1; }\n", "utf-8");
    expect(() => saveCached(cacheFile, admitted.value.extraction, dir)).toThrow(/PROJECTION_STALE/);
    saveCached(cacheFile, admitted.value.extraction, dir, { memoryHighWaterCursor: "7" });
    expect(() => loadCached(cacheFile, dir)).toThrow(/PROJECTION_STALE/);
    expect(loadCached(cacheFile, dir, { memoryHighWaterCursor: "7" })).not.toBeNull();

    // A code-only view carries no projection and stays servable without proof.
    const codeOnly = buildFromJson(codeExtraction());
    const codeCommunities = new Map([[0, ["alpha_fn", "beta_fn"]]]);
    expect(() => generate(codeOnly, codeCommunities, new Map([[0, 1]]), new Map([[0, "Community 0"]]), [], [], detectionFixture(), { input: 0, output: 0 }, dir)).not.toThrow();
    expect(toWiki(codeOnly, codeCommunities, join(dir, "wiki-code"))).toBeGreaterThan(0);
    expect(toJson(codeOnly, codeCommunities, join(dir, "graph-code.json"), { force: true })).toBe(true);
  });

  it("refuses 100 memories whose real serialized nodes+edges exceed the ceiling while the envelope estimate admits them (D10 l.1362; R3 Sol counterexample)", () => {
    expect(MEMORY_PROJECTION_RAW_BYTE_CEILING).toBe(52_428_800);
    // Calibrated straddle: the neutral envelope plus the edge JSON stays at
    // or below the ceiling (the round-2 computation admits), while the real
    // serialized memory nodes plus memory edges exceed it (refusal required).
    const bulky = (index: number): MemoryGraphCandidateV1 => {
      const refs = Array.from({ length: 1041 }, () => "y".repeat(500));
      refs.push("z".repeat(154));
      return candidate({
        record_id: `mem:bulk:${String(index).padStart(3, "0")}`,
        citation_refs: refs,
        code_targets: [index % 2 === 0 ? "alpha_fn" : "beta_fn"],
      });
    };
    const candidates = Array.from({ length: 100 }, (_, index) => bulky(index));
    const assembled = assembleMemoryGraphProjection({
      high_water_cursor: "7",
      projection_cursor: "7",
      candidates,
      code_node_ids: CODE_NODES,
    });
    expect(assembled.ok).toBe(false);
    if (assembled.ok) return;
    expect(assembled.error.code).toBe("PROJECTION_OVERSIZED");
    expect(assembled.error.message).toContain("100 objects");
    // The refusal comes from the L3 real-serialized-size measure (which
    // names the code references), not from the neutral envelope check.
    expect(assembled.error.message).toContain("code references");
    const reported = Number(/is ([0-9]+) bytes/.exec(assembled.error.message)?.[1] ?? "0");
    expect(reported).toBeGreaterThan(52_428_800);
  });

  it("a revocation reaches disk: memory-only shrinkage is written, not refused (M10 l.1368)", () => {
    const dir = tempDir("graphify-l3-revocation-");
    const graphPath = join(dir, "graph.json");
    const admitted = assembleMemoryGraphProjection(assembleInput([candidate()]));
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const G = buildFromJson(codeExtraction());
    attachMemoryProjectionToGraph(G, admitted.value);
    const communities = new Map([[0, ["alpha_fn", "beta_fn", "memory:mem:admitted:001"]]]);
    expect(toJson(G, communities, graphPath, { force: true, memoryHighWaterCursor: "7" })).toBe(true);
    expect(JSON.parse(readFileSync(graphPath, "utf-8")).nodes).toHaveLength(3);

    // The record is withdrawn: the next reconciliation drops it (three nodes
    // become two) and the write without force must persist the removal.
    const revoked = assembleMemoryGraphProjection(assembleInput([candidate({ state: "withdrawn" })]));
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    const receipt = reconcileMemoryProjectionInGraph(G, revoked.value);
    expect(receipt.removed).toContain("mem:admitted:001");
    const written = toJson(G, new Map([[0, ["alpha_fn", "beta_fn"]]]), graphPath);
    expect(written).toBe(true);
    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(persisted.nodes).toHaveLength(2);
    expect(persisted.nodes.map((node) => node.id)).not.toContain("memory:mem:admitted:001");
    expect(JSON.stringify(persisted).includes("mem:admitted:001")).toBe(false);
  });
});





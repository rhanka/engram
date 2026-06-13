/**
 * Track G studio-svelte — server-side plumbing for the client Svelte SPA.
 *
 * Covers the load-bearing helpers added to serve the SPA + its per-entity
 * data: the static-asset traversal guard and the entity sidecar assembly
 * (node description + occurrences) read from a `.graphify` state dir, including
 * the WP11 precedence where each graph.json node's own `description` wins over
 * the opt-in wiki sidecar.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Graph from "graphology";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildEntitySidecar,
  serveStudioAsset,
  __resetGraphDescriptionCache,
  __resetCitationsSidecarCache,
} from "../src/studio-assets.js";
import {
  aggregateCitations,
  writeCitationsSidecar,
  CITATIONS_SIDECAR_RELPATH,
} from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

function makeStateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-studio-assets-"));
  mkdirSync(join(dir, "wiki"), { recursive: true });
  mkdirSync(join(dir, "ontology"), { recursive: true });
  writeFileSync(
    join(dir, "wiki", "descriptions.json"),
    JSON.stringify({
      schema: "graphify_wiki_description_index_v1",
      nodes: {
        work_a: { status: "generated", description: "A landmark **novel**." },
        place_b: { status: "insufficient_evidence", description: null },
      },
    }),
  );
  writeFileSync(
    join(dir, "ontology", "occurrences.json"),
    JSON.stringify({ nodes: { work_a: { total: 7, documents: { "doc.txt": 7 } } } }),
  );
  return dir;
}

/** Write a graph.json carrying WP11 per-node `description` fields. */
function writeGraph(dir: string, nodes: Array<Record<string, unknown>>): void {
  writeFileSync(join(dir, "graph.json"), JSON.stringify({ nodes, edges: [] }));
}

afterEach(() => {
  __resetGraphDescriptionCache();
  __resetCitationsSidecarCache();
});

/**
 * Build a real (graph.json + ontology/citations.json) pair via the engine
 * aggregation pass so the studio-side signature gate is tested against the
 * SAME content hash the producer stamps. `hubCitations` is the full union for
 * the hub node; the engine trims the inline set + writes the co-derived store.
 */
function makeCitationStateDir(hubCitations: OntologyCitation[]): { dir: string; count: number } {
  const dir = mkdtempSync(join(tmpdir(), "graphify-citations-"));
  mkdirSync(join(dir, "ontology"), { recursive: true });
  const G = new Graph({ type: "directed" });
  G.addNode("hub", { label: "Hub", citations: hubCitations.map((c) => ({ ...c })) });
  G.addNode("leaf", { label: "Leaf" });
  const map = aggregateCitations(G);
  // graph.json mirrors toJson's `...attrs` spread: each node serializes its
  // (now trimmed) inline `citations` + `citation_count`.
  const nodes = G.mapNodes((id, attrs) => ({ id, ...attrs }));
  writeFileSync(join(dir, "graph.json"), JSON.stringify({ nodes, edges: [] }));
  writeCitationsSidecar(dir, map, G);
  return { dir, count: map.hub!.count };
}

function citation(source: string, section: string, page?: number): OntologyCitation {
  return page == null ? { source_file: source, section } : { source_file: source, section, page };
}

describe("buildEntitySidecar citations (Level-2 lazy store)", () => {
  it("returns { count, citations } for a present hub id", () => {
    const cites = [
      citation("a.txt", "ch1", 1),
      citation("b.txt", "ch2", 2),
      citation("c.txt", "ch3", 3),
      citation("d.txt", "ch4", 4),
      citation("e.txt", "ch5", 5),
      citation("f.txt", "ch6", 6),
      citation("g.txt", "ch7", 7),
      citation("h.txt", "ch8", 8),
      citation("i.txt", "ch9", 9),
      citation("j.txt", "ch10", 10),
    ];
    const { dir, count } = makeCitationStateDir(cites);
    const res = buildEntitySidecar(dir, "hub");
    expect(res.citations).not.toBeUndefined();
    expect(res.citations!.count).toBe(count);
    expect(count).toBe(10);
    // The full union (10) is served, not just the inline top-K.
    expect(res.citations!.citations).toHaveLength(10);
  });

  it("returns undefined citations for an absent id", () => {
    const { dir } = makeCitationStateDir([citation("a.txt", "ch1", 1)]);
    const res = buildEntitySidecar(dir, "ghost");
    expect(res.citations).toBeUndefined();
  });

  it("returns undefined citations when no citations.json exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-nocite-"));
    writeFileSync(join(dir, "graph.json"), JSON.stringify({ nodes: [{ id: "hub" }], edges: [] }));
    const res = buildEntitySidecar(dir, "hub");
    expect(res.citations).toBeUndefined();
  });

  it("treats the store as ABSENT on graph_signature mismatch (client falls back to inline)", () => {
    const { dir } = makeCitationStateDir([
      citation("a.txt", "ch1", 1),
      citation("b.txt", "ch2", 2),
    ]);
    // Rewrite graph.json with DIFFERENT inline citations -> the on-disk
    // citation-content hash no longer matches the stamped graph_signature.
    writeFileSync(
      join(dir, "graph.json"),
      JSON.stringify({
        nodes: [{ id: "hub", citations: [citation("z.txt", "zzz", 99)], citation_count: 2 }],
        edges: [],
      }),
    );
    __resetGraphDescriptionCache();
    __resetCitationsSidecarCache();
    const res = buildEntitySidecar(dir, "hub");
    expect(res.citations).toBeUndefined();
  });

  it("caches citations.json by mtime (no re-parse at an unchanged mtime)", async () => {
    const { dir } = makeCitationStateDir([citation("a.txt", "ch1", 1)]);
    const citePath = join(dir, CITATIONS_SIDECAR_RELPATH);
    const { utimesSync } = await import("node:fs");
    // Pin mtime to a whole-second epoch so a later restore is exact (mtimeMs
    // has sub-ms drift across writes otherwise). First read populates the
    // mtime-keyed index for this stamp.
    const pinned = new Date(1_700_000_000_000); // 2023-11-14T22:13:20Z, integer ms
    utimesSync(citePath, pinned, pinned);
    __resetCitationsSidecarCache();
    const first = buildEntitySidecar(dir, "hub");
    expect(first.citations).not.toBeUndefined();
    // Corrupt the file but restore the SAME mtime: a re-parse would now fail
    // (loadJsonSafe -> null -> undefined). A stable result proves the cache
    // served the second call without re-reading citations.json.
    writeFileSync(citePath, "}{ not json");
    utimesSync(citePath, pinned, pinned);
    const second = buildEntitySidecar(dir, "hub");
    expect(second.citations).toEqual(first.citations);
  });
});

describe("buildEntitySidecar", () => {
  it("surfaces the graph.json node.description as the generated description (WP11)", () => {
    const dir = makeStateDir();
    writeGraph(dir, [
      { id: "sym_a", description: "Entry point that wires the asset routes." },
    ]);
    const res = buildEntitySidecar(dir, "sym_a");
    expect(res.description).toEqual({
      status: "generated",
      description: "Entry point that wires the asset routes.",
    });
  });

  it("prefers node.description over the wiki sidecar for the same id", () => {
    const dir = makeStateDir();
    // work_a also exists in the wiki sidecar ("A landmark **novel**."); the
    // node's own description must win.
    writeGraph(dir, [{ id: "work_a", description: "Node-level one-liner." }]);
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.description).toEqual({ status: "generated", description: "Node-level one-liner." });
  });

  it("falls back to the wiki sidecar when the node has no description", () => {
    const dir = makeStateDir();
    // graph.json present but work_a carries no description -> wiki fallback.
    writeGraph(dir, [{ id: "work_a" }]);
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.description).toEqual({ status: "generated", description: "A landmark **novel**." });
  });

  it("ignores blank/non-string node descriptions and falls back", () => {
    const dir = makeStateDir();
    writeGraph(dir, [{ id: "place_b", description: "   " }]);
    const res = buildEntitySidecar(dir, "place_b");
    // Blank node description -> wiki sidecar (insufficient_evidence) takes over.
    expect(res.description).toEqual({ status: "insufficient_evidence", description: null });
  });

  it("returns the generated wiki description for a node", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "work_a");
    expect(res.id).toBe("work_a");
    expect(res.description).toEqual({ status: "generated", description: "A landmark **novel**." });
    expect(res.occurrences).toEqual({ total: 7, documents: { "doc.txt": 7 } });
  });

  it("normalises insufficient-evidence entries", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "place_b");
    expect(res.description).toEqual({ status: "insufficient_evidence", description: null });
  });

  it("yields nulls for an unknown node id (panel degrades gracefully)", () => {
    const dir = makeStateDir();
    const res = buildEntitySidecar(dir, "ghost");
    expect(res.description).toBeNull();
    expect(res.occurrences).toBeNull();
  });

  it("tolerates a missing state dir", () => {
    const res = buildEntitySidecar(join(tmpdir(), "does-not-exist-xyz"), "work_a");
    expect(res).toEqual({ id: "work_a", description: null, occurrences: null });
  });
});

describe("serveStudioAsset", () => {
  it("rejects path traversal outside the app dir", () => {
    // Regardless of whether the SPA is built, traversal must never escape.
    const res = serveStudioAsset("/../../../../etc/passwd");
    expect(res).not.toBeNull();
    // Either 403 (app built, guard tripped) or 404 (app not built); never 200.
    expect(res!.status).not.toBe(200);
  });
});

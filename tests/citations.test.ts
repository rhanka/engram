import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";
import {
  CITATIONS_INLINE_TOP_K,
  aggregateCitations,
  citationKey,
  computeCitationSignature,
  selectTopCitations,
  unionCitations,
  writeCitationsSidecar,
} from "../src/citations.js";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-citations-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

describe("citationKey", () => {
  it("derives a stable key from source_file|page|section|paragraph_id", () => {
    const c: OntologyCitation = {
      source_file: "doyle/study.txt",
      page: 12,
      section: "ch1",
      paragraph_id: "p3",
    };
    expect(citationKey(c, { includeBbox: false })).toBe("doyle/study.txt|12|ch1|p3");
  });

  it("excludes bbox by default (prose) and includes it when requested (figures)", () => {
    const c: OntologyCitation = {
      source_file: "fig/plate.png",
      figure_id: "f1",
      bbox: [1, 2, 3, 4],
    };
    const prose = citationKey(c, { includeBbox: false });
    const fig = citationKey(c, { includeBbox: true });
    expect(fig).not.toBe(prose);
    expect(fig).toContain("1,2,3,4");
    expect(prose).not.toContain("1,2,3,4");
  });

  it("treats missing locator fields as empty, not 'undefined'", () => {
    const c: OntologyCitation = { source_file: "a.txt" };
    expect(citationKey(c, { includeBbox: false })).toBe("a.txt|||");
  });
});

describe("unionCitations", () => {
  it("dedupes across lists by identity, preserving first-seen for selection", () => {
    const a: OntologyCitation[] = [
      { source_file: "b.txt", page: 2 },
      { source_file: "a.txt", page: 1 },
    ];
    const b: OntologyCitation[] = [
      { source_file: "a.txt", page: 1 }, // dup of a[1]
      { source_file: "c.txt", page: 3 },
    ];
    const out = unionCitations([a, b], { includeBbox: false });
    expect(out).toHaveLength(3);
    // stable lexicographic sort by (source_file, page, section, paragraph_id)
    expect(out.map((c) => c.source_file)).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("is deterministic regardless of input order", () => {
    const x: OntologyCitation[] = [
      { source_file: "z.txt", page: 9 },
      { source_file: "a.txt", page: 1 },
      { source_file: "m.txt", section: "s" },
    ];
    const reversed = [...x].reverse();
    const u1 = unionCitations([x], { includeBbox: false });
    const u2 = unionCitations([reversed], { includeBbox: false });
    expect(JSON.stringify(u1)).toBe(JSON.stringify(u2));
  });

  it("ignores non-array / malformed entries gracefully", () => {
    const out = unionCitations(
      [
        [{ source_file: "a.txt" }],
        undefined as unknown as OntologyCitation[],
        [null as unknown as OntologyCitation, { source_file: "b.txt" }],
      ],
      { includeBbox: false },
    );
    expect(out.map((c) => c.source_file)).toEqual(["a.txt", "b.txt"]);
  });
});

describe("selectTopCitations", () => {
  const K = CITATIONS_INLINE_TOP_K;

  it("exports a default inline K of 8", () => {
    expect(K).toBe(8);
  });

  it("is byte-identical across two runs (determinism)", () => {
    const all: OntologyCitation[] = [];
    for (let i = 0; i < 30; i += 1) {
      all.push({ source_file: `src${i % 5}.txt`, page: i, section: `s${i}` });
    }
    const run1 = selectTopCitations(all, K);
    const run2 = selectTopCitations([...all].reverse(), K);
    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    expect(run1).toHaveLength(K);
  });

  it("maximizes distinct-source coverage before repeating a source", () => {
    // 4 distinct sources, several citations each; K=3 must cover 3 sources.
    const all: OntologyCitation[] = [
      { source_file: "a.txt", page: 1 },
      { source_file: "a.txt", page: 2 },
      { source_file: "b.txt", page: 1 },
      { source_file: "b.txt", page: 2 },
      { source_file: "c.txt", page: 1 },
      { source_file: "d.txt", page: 1 },
    ];
    const top = selectTopCitations(all, 3);
    const sources = new Set(top.map((c) => c.source_file));
    expect(sources.size).toBe(3);
  });

  it("breaks greedy ties by the lexicographic key (stable, first source wins its earliest citation)", () => {
    const all: OntologyCitation[] = [
      { source_file: "b.txt", page: 5 },
      { source_file: "a.txt", page: 9 },
      { source_file: "a.txt", page: 2 },
    ];
    const top = selectTopCitations(all, 2);
    // a.txt covered first (lexicographically), and its earliest (page 2) wins.
    expect(top[0]).toEqual({ source_file: "a.txt", page: 2 });
    expect(top[1]).toEqual({ source_file: "b.txt", page: 5 });
  });

  it("fills remaining slots by locator specificity when sources are exhausted", () => {
    // 2 sources, 5 citations, K=3. After covering a.txt and b.txt once each
    // (bare-locator wins the cover by lex key), one fill slot remains; the fill
    // step prefers a finer locator (has page/section) over the bare extras.
    const all: OntologyCitation[] = [
      { source_file: "a.txt" }, // bare
      { source_file: "a.txt", page: 7 }, // finer
      { source_file: "b.txt" }, // bare
      { source_file: "b.txt", section: "intro" }, // finer
      { source_file: "b.txt" }, // dup of bare b.txt
    ];
    const top = selectTopCitations(all, 3);
    expect(top).toHaveLength(3);
    // First two cover distinct sources; the third is a finer-locator fill.
    const fill = top[2];
    expect(fill.page != null || fill.section != null).toBe(true);
  });

  it("returns the whole deduped set when it is smaller than K", () => {
    const all: OntologyCitation[] = [
      { source_file: "a.txt", page: 1 },
      { source_file: "a.txt", page: 1 }, // dup
      { source_file: "b.txt", page: 2 },
    ];
    const top = selectTopCitations(all, 8);
    expect(top).toHaveLength(2);
  });
});

function hubGraph(citationCount: number): Graph {
  const G = new Graph();
  const citations: OntologyCitation[] = [];
  for (let i = 0; i < citationCount; i += 1) {
    citations.push({ source_file: `work${i % 25}.txt`, page: i, section: `ch${i % 7}` });
  }
  G.addNode("sherlock", { label: "Sherlock", citations });
  G.addNode("bare", { label: "Bare" }); // no citations
  return G;
}

describe("aggregateCitations", () => {
  it("sets citation_count = |union| and trims node.citations to K", () => {
    const G = hubGraph(200);
    const map = aggregateCitations(G, { topK: CITATIONS_INLINE_TOP_K });

    const inline = G.getNodeAttribute("sherlock", "citations") as OntologyCitation[];
    expect(G.getNodeAttribute("sherlock", "citation_count")).toBe(200);
    expect(inline).toHaveLength(CITATIONS_INLINE_TOP_K);

    // Map carries the FULL union, count matches.
    expect(map.sherlock.count).toBe(200);
    expect(map.sherlock.citations).toHaveLength(200);
    // Untouched nodes do not appear and gain no count.
    expect(map.bare).toBeUndefined();
    expect(G.getNodeAttribute("bare", "citation_count")).toBeUndefined();
  });

  it("count = size of the deduped union (not the raw list)", () => {
    const G = new Graph();
    G.addNode("dupy", {
      citations: [
        { source_file: "a.txt", page: 1 },
        { source_file: "a.txt", page: 1 }, // exact dup
        { source_file: "b.txt", page: 2 },
      ],
    });
    aggregateCitations(G);
    expect(G.getNodeAttribute("dupy", "citation_count")).toBe(2);
  });
});

describe("writeCitationsSidecar + computeCitationSignature", () => {
  it("writes a keyed graphify_ontology_citations_v1 store with count=N and full list", () => {
    const dir = tempDir();
    const G = hubGraph(214);
    const map = aggregateCitations(G);
    const path = writeCitationsSidecar(dir, map, G);
    expect(path).toBe(join(dir, "ontology", "citations.json"));

    const payload = JSON.parse(readFileSync(path!, "utf-8")) as {
      schema: string;
      graph_signature: string;
      nodes: Record<string, { count: number; citations: OntologyCitation[] }>;
    };
    expect(payload.schema).toBe("graphify_ontology_citations_v1");
    expect(payload.nodes.sherlock.count).toBe(214);
    expect(payload.nodes.sherlock.citations).toHaveLength(214);
    expect(typeof payload.graph_signature).toBe("string");
    expect(payload.graph_signature).toHaveLength(64); // sha256 hex
  });

  it("returns null and writes nothing when no node carries citations", () => {
    const dir = tempDir();
    const G = new Graph();
    G.addNode("x", { label: "X" });
    const map = aggregateCitations(G);
    expect(writeCitationsSidecar(dir, map, G)).toBeNull();
  });

  it("signature is stable across an identical rebuild (no false-stale)", () => {
    const G1 = hubGraph(50);
    aggregateCitations(G1);
    const sig1 = computeCitationSignature(G1);

    const G2 = hubGraph(50);
    aggregateCitations(G2);
    const sig2 = computeCitationSignature(G2);

    expect(sig2).toBe(sig1);
  });

  it("signature changes iff the inline citations change", () => {
    const G = hubGraph(50);
    aggregateCitations(G);
    const before = computeCitationSignature(G);

    // Mutate inline citations on the hub → signature must move.
    G.setNodeAttribute("sherlock", "citations", [{ source_file: "different.txt", page: 999 }]);
    const after = computeCitationSignature(G);
    expect(after).not.toBe(before);

    // A no-op re-read yields the same signature.
    expect(computeCitationSignature(G)).toBe(after);
  });
});

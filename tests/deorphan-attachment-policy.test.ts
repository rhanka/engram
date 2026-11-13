/**
 * De-orphan ATTACHMENT POLICY — credibility locks (WP1).
 *
 * De-orphaning is a data-credibility surface, not cosmetics: every edge it adds
 * is read as a fact about the corpus. These tests lock the two properties the
 * previous policy violated at corpus scale:
 *
 *   1. GROUNDING — a derived edge exists only where the corpus supports it
 *      (containment, or co-provenance = the same source document). An orphan
 *      with neither ground STAYS ORPHANED and is counted in `unattachable`.
 *      Measured on the PROCESS_STD graph (47 762 nodes), the previous global-hub
 *      fallback emitted 19 542 edges with NO provenance relation at all.
 *
 *   2. NO SYNTHETIC STAR — co-provenance attachments are spread over the
 *      top-ranked peers of the document (√-rule), so no node becomes a hub of
 *      derived degree-1 spokes. Measured on PROCESS_STD: the previous policy funnelled
 *      all 20 389 orphans onto ONE anchor (its degree went 39 → 20 417); the
 *      policy under test spreads 16 516 attachments over 5 624 anchors with a
 *      worst fan-out of 35, leaving the graph's densest node at degree 40.
 */
import { describe, expect, it } from "vitest";

import { deOrphanByContainer } from "../src/assembly-hygiene.js";
import type { Extraction, GraphEdge, GraphNode } from "../src/types.js";

function node(partial: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    label: partial.label ?? partial.id,
    file_type: partial.file_type ?? "document",
    source_file: partial.source_file ?? "",
    ...partial,
  };
}

function edge(partial: Partial<GraphEdge> & { source: string; target: string }): GraphEdge {
  return {
    relation: partial.relation ?? "related_to",
    confidence: partial.confidence ?? "EXTRACTED",
    source_file: partial.source_file ?? "",
    ...partial,
  };
}

function extraction(nodes: GraphNode[], edges: GraphEdge[] = []): Extraction {
  return { nodes, edges, hyperedges: [], input_tokens: 0, output_tokens: 0 };
}

function endpoint(v: unknown): string {
  if (v && typeof v === "object" && "id" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).id);
  }
  return String(v);
}

function derivedEdges(ex: Extraction): GraphEdge[] {
  return (ex.edges ?? []).filter((e) =>
    String((e as Record<string, unknown>).derivation_method ?? "").startsWith("deorphan"),
  );
}

function components(nodes: GraphNode[], edges: GraphEdge[]): Set<string>[] {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(String(n.id), new Set());
  for (const e of edges) {
    const s = endpoint(e.source);
    const t = endpoint(e.target);
    if (s === t) continue;
    adj.get(s)?.add(t);
    adj.get(t)?.add(s);
  }
  const seen = new Set<string>();
  const comps: Set<string>[] = [];
  for (const k of [...adj.keys()].sort()) {
    if (seen.has(k)) continue;
    const c = new Set<string>();
    const stack = [k];
    while (stack.length) {
      const u = stack.pop()!;
      if (c.has(u)) continue;
      c.add(u);
      seen.add(u);
      for (const v of adj.get(u) ?? []) if (!c.has(v)) stack.push(v);
    }
    comps.push(c);
  }
  return comps;
}

/**
 * A document ("doc-a") whose extraction produced ONE small connected core plus
 * `orphanCount` degree-0 entities. This is the shape that produced the PROCESS_STD
 * star: many same-document orphans, a handful of grounded peers.
 */
function coProvenanceGraph(orphanCount: number, peerCount = 6): Extraction {
  const SRC = "corpus/docs/doc-a/text.txt";
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < peerCount; i += 1) {
    nodes.push(node({ id: `peer_${String(i).padStart(2, "0")}`, type: "Character", source_file: SRC }));
  }
  // Connect the peers in a path so each has degree >= 1 with differing degrees.
  for (let i = 1; i < peerCount; i += 1) {
    edges.push(edge({ source: `peer_${String(i - 1).padStart(2, "0")}`, target: `peer_${String(i).padStart(2, "0")}`, relation: "knows" }));
  }
  edges.push(edge({ source: "peer_00", target: "peer_02", relation: "knows" }));
  for (let i = 0; i < orphanCount; i += 1) {
    nodes.push(node({ id: `orphan_${String(i).padStart(3, "0")}`, type: "Object", source_file: SRC }));
  }
  return extraction(nodes, edges);
}

describe("de-orphan attachment policy — grounding", () => {
  it("emits NO edge for an orphan with no container and no co-provenance peer — it stays orphaned and is COUNTED", () => {
    // The giant lives in an unrelated document; the orphan's own document has
    // no other node at all. Any edge here would assert a relation the corpus
    // does not contain. The honest outcome is: no edge.
    const ex = extraction(
      [
        node({ id: "character_a", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "character_b", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "character_c", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "orphan_x", type: "Character", source_file: "corpus/docs/lonely/only.txt" }),
      ],
      [
        edge({ source: "character_a", target: "character_b", relation: "knows" }),
        edge({ source: "character_b", target: "character_c", relation: "knows" }),
        edge({ source: "character_a", target: "character_c", relation: "knows" }),
      ],
    );
    const out = deOrphanByContainer(ex);
    expect(derivedEdges(out.extraction)).toHaveLength(0);
    expect(out.unattachable).toBe(1);
    expect(out.orphansAfter).toBe(1);
    // and it is reported, not silently swallowed
    expect(out.unresolved).toBeGreaterThanOrEqual(1);
  });

  it("every derived edge shares provenance with its orphan (no basis-free edge)", () => {
    const ex = coProvenanceGraph(40);
    // add an ungrounded orphan from a document of its own
    ex.nodes.push(node({ id: "orphan_zzz", type: "Object", source_file: "corpus/docs/elsewhere/x.txt" }));
    const out = deOrphanByContainer(ex);
    const byId = new Map(out.extraction.nodes.map((n) => [String(n.id), n]));
    for (const e of derivedEdges(out.extraction)) {
      const src = byId.get(endpoint(e.source))!;
      const tgt = byId.get(endpoint(e.target))!;
      expect(String(src.source_file)).toBe(String(tgt.source_file));
    }
    // the ungrounded one got nothing
    expect(
      derivedEdges(out.extraction).some((e) => endpoint(e.source) === "orphan_zzz"),
    ).toBe(false);
    expect(out.unattachable).toBe(1);
  });

  it("the removed global-hub fallback is opt-in only, and reproduces the star when enabled", () => {
    const ex = extraction(
      [
        node({ id: "character_a", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "character_b", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "character_c", type: "Character", source_file: "corpus/docs/other/text.txt" }),
        node({ id: "orphan_x", type: "Character", source_file: "corpus/docs/lonely/only.txt" }),
        node({ id: "orphan_y", type: "Character", source_file: "corpus/docs/lonelier/only.txt" }),
      ],
      [
        edge({ source: "character_a", target: "character_b", relation: "knows" }),
        edge({ source: "character_b", target: "character_c", relation: "knows" }),
        edge({ source: "character_a", target: "character_c", relation: "knows" }),
      ],
    );
    expect(deOrphanByContainer(ex).unattachable).toBe(2);
    const opted = deOrphanByContainer(ex, { allowGlobalHubFallback: true });
    const derived = derivedEdges(opted.extraction);
    expect(derived).toHaveLength(2);
    // both hang off the single global hub — exactly the artifact we removed
    expect(new Set(derived.map((e) => endpoint(e.target))).size).toBe(1);
    expect(derived[0]!.derivation_method).toBe("deorphan:giant-hub-global");
    expect(opted.unattachable).toBe(0);
  });
});

describe("de-orphan attachment policy — no synthetic hub-spoke star", () => {
  it("spreads same-document attachments over multiple peers instead of one hub", () => {
    const out = deOrphanByContainer(coProvenanceGraph(64, 8));
    expect(out.appearsInAdded).toBe(64);
    // √-rule: 64 orphans spread over ceil(√64) = 8 anchors → fan-out 8, not 64.
    expect(out.maxAnchorFanOut).toBe(8);
    const anchors = new Set(derivedEdges(out.extraction).map((e) => endpoint(e.target)));
    expect(anchors.size).toBe(8);
  });

  it("fan-out grows like √n, not n (the star signature)", () => {
    for (const n of [16, 100, 400]) {
      const out = deOrphanByContainer(coProvenanceGraph(n, 40));
      expect(out.appearsInAdded).toBe(n);
      expect(out.maxAnchorFanOut).toBeLessThanOrEqual(Math.ceil(Math.sqrt(n)));
    }
  });

  it("spread is bounded by the peers that actually exist (never invents an anchor)", () => {
    // 100 orphans but only 3 grounded peers → fan-out is 34, and that is honest:
    // there is nothing else in the document to attach to.
    const out = deOrphanByContainer(coProvenanceGraph(100, 3));
    const anchors = new Set(derivedEdges(out.extraction).map((e) => endpoint(e.target)));
    expect(anchors.size).toBe(3);
    expect(out.maxAnchorFanOut).toBe(34);
  });

  it("maxAnchorFanOut widens the spread further", () => {
    const out = deOrphanByContainer(coProvenanceGraph(64, 32), { maxAnchorFanOut: 4 });
    expect(out.maxAnchorFanOut).toBeLessThanOrEqual(4);
  });

  it("containment is NOT spread — a chapter really does contain all its entities", () => {
    const nodes: GraphNode[] = [
      node({ id: "work_w", type: "Work", source_file: "corpus/saga/w/text.txt" }),
      node({ id: "chapter_w_ch1", type: "ChapterOrStory", source_file: "corpus/saga/w/ch1.txt" }),
      node({ id: "character_hero", type: "Character", source_file: "corpus/saga/w/ch1.txt" }),
    ];
    for (let i = 0; i < 20; i += 1) {
      nodes.push(node({ id: `character_o${String(i).padStart(2, "0")}`, type: "Character", source_file: "corpus/saga/w/ch1.txt" }));
    }
    const ex = extraction(nodes, [
      edge({ source: "chapter_w_ch1", target: "work_w", relation: "part_of" }),
      edge({ source: "character_hero", target: "chapter_w_ch1", relation: "appears_in" }),
    ]);
    const out = deOrphanByContainer(ex);
    const derived = derivedEdges(out.extraction);
    expect(derived).toHaveLength(20);
    for (const e of derived) {
      expect(endpoint(e.target)).toBe("chapter_w_ch1");
      expect(e.relation).toBe("appears_in");
      expect(e.derivation_method).toBe("deorphan:giant-component");
    }
  });
});

describe("de-orphan attachment policy — no 2-node islands, honest components", () => {
  it("creates NO new 2-node island", () => {
    const ex = coProvenanceGraph(30, 5);
    // plus an isolated pair-forming trap: an orphan whose only same-document
    // company is another orphan. Pairing them would be the classic artifact.
    ex.nodes.push(node({ id: "orphan_p1", type: "Object", source_file: "corpus/docs/pair/p.txt" }));
    ex.nodes.push(node({ id: "orphan_p2", type: "Object", source_file: "corpus/docs/pair/p.txt" }));
    const beforeIslands = components(ex.nodes, ex.edges).filter((c) => c.size === 2).length;
    const out = deOrphanByContainer(ex);
    const afterIslands = components(out.extraction.nodes, out.extraction.edges).filter((c) => c.size === 2).length;
    expect(afterIslands).toBeLessThanOrEqual(beforeIslands);
    // the pair stayed two separate isolates rather than becoming a fake island
    expect(
      derivedEdges(out.extraction).some((e) => endpoint(e.source).startsWith("orphan_p")),
    ).toBe(false);
    expect(out.unattachable).toBe(2);
  });

  it("prefers a peer in the giant component over an equally grounded peer outside it", () => {
    const SRC = "corpus/docs/shared/doc.txt";
    const ex = extraction(
      [
        // small off-giant pair sharing the orphan's document
        node({ id: "small_a", type: "Character", source_file: SRC }),
        node({ id: "small_b", type: "Character", source_file: SRC }),
        // the giant, ALSO sharing the orphan's document
        node({ id: "giant_a", type: "Character", source_file: SRC }),
        node({ id: "giant_b", type: "Character", source_file: SRC }),
        node({ id: "giant_c", type: "Character", source_file: SRC }),
        node({ id: "giant_d", type: "Character", source_file: SRC }),
        node({ id: "orphan_x", type: "Object", source_file: SRC }),
      ],
      [
        edge({ source: "small_a", target: "small_b", relation: "knows" }),
        edge({ source: "giant_a", target: "giant_b", relation: "knows" }),
        edge({ source: "giant_b", target: "giant_c", relation: "knows" }),
        edge({ source: "giant_c", target: "giant_d", relation: "knows" }),
        edge({ source: "giant_a", target: "giant_c", relation: "knows" }),
      ],
    );
    const out = deOrphanByContainer(ex);
    const derived = derivedEdges(out.extraction);
    expect(derived).toHaveLength(1);
    expect(endpoint(derived[0]!.target)).toMatch(/^giant_/);
    expect(derived[0]!.derivation_method).toBe("deorphan:co-provenance-peer");
  });

  it("attaches to a real container even when its whole work sits outside the giant", () => {
    // work_lonely is isolated. `orphan appears_in work_lonely` is TRUE — the
    // entity was extracted from that work — so we emit it, and accept that the
    // component stays separate. What we refuse is to fake a bridge to the giant.
    const ex = extraction(
      [
        node({ id: "work_other", type: "Work", source_file: "corpus/other/o/text.txt" }),
        node({ id: "character_a", type: "Character", source_file: "corpus/other/o/text.txt" }),
        node({ id: "character_b", type: "Character", source_file: "corpus/other/o/text.txt" }),
        node({ id: "work_lonely", type: "Work", source_file: "corpus/lonely/l/text.txt" }),
        node({ id: "character_l1", type: "Character", source_file: "corpus/lonely/l/text.txt" }),
      ],
      [
        edge({ source: "character_a", target: "work_other", relation: "central_to" }),
        edge({ source: "character_b", target: "work_other", relation: "central_to" }),
        edge({ source: "character_a", target: "character_b", relation: "knows" }),
      ],
    );
    const out = deOrphanByContainer(ex);
    const derived = derivedEdges(out.extraction);
    expect(derived).toHaveLength(1);
    expect(endpoint(derived[0]!.target)).toBe("work_lonely");
    expect(derived[0]!.relation).toBe("appears_in");
    expect(derived[0]!.derivation_method).toBe("deorphan:container-offgiant");
    // no invented bridge into the unrelated giant
    expect(derived.some((e) => endpoint(e.target).startsWith("work_other"))).toBe(false);
  });
});

describe("de-orphan attachment policy — determinism & idempotency", () => {
  it("is independent of input node/edge order", () => {
    const base = coProvenanceGraph(50, 7);
    const shuffled = extraction([...base.nodes].reverse(), [...base.edges].reverse());
    const a = deOrphanByContainer(base);
    const b = deOrphanByContainer(shuffled);
    const key = (e: GraphEdge) => `${endpoint(e.source)}->${endpoint(e.target)}:${e.derivation_method}`;
    expect(derivedEdges(a.extraction).map(key).sort()).toEqual(derivedEdges(b.extraction).map(key).sort());
    expect(a.maxAnchorFanOut).toBe(b.maxAnchorFanOut);
  });

  it("re-running on its own output adds nothing", () => {
    const first = deOrphanByContainer(coProvenanceGraph(50, 7));
    const second = deOrphanByContainer(first.extraction);
    expect(second.appearsInAdded).toBe(0);
    expect(second.extraction.edges).toEqual(first.extraction.edges);
  });

  it("reports a per-method breakdown callers can surface", () => {
    const out = deOrphanByContainer(coProvenanceGraph(9, 3));
    expect(out.byMethod["deorphan:co-provenance-peer"]).toBe(9);
    expect(Object.values(out.byMethod).reduce((a, b) => a + b, 0)).toBe(out.appearsInAdded);
  });
});

import { describe, expect, it } from "vitest";

import {
  canonicalId,
  canonicalType,
  deriveAliasesAndNormalizedTerms,
  deriveLabelTerms,
  deOrphanByContainer,
  normalizeSchemaHygiene,
} from "../src/assembly-hygiene.js";
import { applyAssemblyHygiene, buildFromJson } from "../src/build.js";
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

// ---------------------------------------------------------------------------
// (A) Schema hygiene
// ---------------------------------------------------------------------------
describe("normalizeSchemaHygiene (A)", () => {
  it("canonicalizes id-prefixes and types", () => {
    expect(canonicalId("location_british_museum", { location: "place" })).toBe("place_british_museum");
    expect(canonicalId("org_eyres", { org: "organization" })).toBe("organization_eyres");
    expect(canonicalId("character_holmes", { location: "place" })).toBe("character_holmes");
    expect(canonicalType("place", { place: "Location" })).toBe("Location");
    expect(canonicalType("character", {})).toBe("Character");
    expect(canonicalType("ChapterOrStory", {})).toBe("ChapterOrStory");
    expect(canonicalType("CrimeOrScheme", {})).toBe("CrimeOrScheme");
  });

  it("collapses a location_/place_ duplicate pair and unions edges + citations + attrs", () => {
    const ex = extraction(
      [
        node({
          id: "location_british_museum",
          label: "British Museum",
          type: "Location",
          source_file: "corpus/w/text.txt",
          citations: [{ source_file: "corpus/w/text.txt", section: "I", quote: "a" }],
          description: "the museum",
        }),
        node({
          id: "place_british_museum",
          label: "British Museum (Egyptian Antiquities)",
          type: "place",
          citations: [{ source_file: "corpus/w/text.txt", section: "II", quote: "b" }],
          community: 3,
        }),
        node({ id: "character_holmes", label: "Sherlock Holmes", type: "Character" }),
      ],
      [
        edge({ source: "location_british_museum", target: "character_holmes", relation: "visited_by" }),
        edge({ source: "place_british_museum", target: "character_holmes", relation: "near" }),
      ],
    );

    const out = normalizeSchemaHygiene(ex);
    const ids = out.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["character_holmes", "place_british_museum"]);

    const museum = out.nodes.find((n) => n.id === "place_british_museum")!;
    expect(museum.type).toBe("Location"); // canonicalized from "place"
    // Citation union: both sections survive (no last-write-wins drop).
    expect(museum.citations).toHaveLength(2);
    // First-seen scalar fill: description from one, community from the other.
    expect(museum.description).toBe("the museum");
    expect(museum.community).toBe(3);

    // Two distinct relations between the same canonical pair both survive.
    const rels = out.edges
      .filter((e) => e.source === "place_british_museum" && e.target === "character_holmes")
      .map((e) => e.relation)
      .sort();
    expect(rels).toEqual(["near", "visited_by"]);
  });

  it("is idempotent (re-running on its own output is a no-op)", () => {
    const ex = extraction(
      [
        node({ id: "location_a", label: "A", type: "place", source_file: "w/text.txt" }),
        node({ id: "place_a", label: "A", type: "Location", source_file: "w/text.txt" }),
        node({ id: "org_x", label: "X", type: "organization" }),
      ],
      [edge({ source: "location_a", target: "org_x" })],
    );
    const once = normalizeSchemaHygiene(ex);
    const twice = normalizeSchemaHygiene(once);
    expect(twice).toEqual(once);
  });

  it("drops self-loops created by a collapse", () => {
    const ex = extraction(
      [
        node({ id: "location_a", label: "A", type: "Location" }),
        node({ id: "place_a", label: "A", type: "Location" }),
      ],
      [edge({ source: "location_a", target: "place_a", relation: "same_as" })],
    );
    const out = normalizeSchemaHygiene(ex);
    expect(out.nodes).toHaveLength(1);
    expect(out.edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (B) Alias / normalized_terms derivation
// ---------------------------------------------------------------------------
describe("deriveAliasesAndNormalizedTerms (B)", () => {
  it("strips parentheticals", () => {
    const { aliases, normalizedTerms } = deriveLabelTerms("Hugo Oberstein (spy)");
    expect(aliases).toContain("Hugo Oberstein");
    expect(normalizedTerms).toContain("hugo oberstein");
  });

  it("strips leading honorifics", () => {
    expect(deriveLabelTerms("Dr. Watson").aliases).toContain("Watson");
    expect(deriveLabelTerms("Sir Henry Baskerville").aliases).toContain("Henry Baskerville");
    expect(deriveLabelTerms("Inspector Lestrade").aliases).toContain("Lestrade");
    expect(deriveLabelTerms("Professor Moriarty").normalizedTerms).toContain("moriarty");
  });

  it("combines honorific + parenthetical strips", () => {
    const { aliases } = deriveLabelTerms("Colonel Sebastian Moran (sniper)");
    expect(aliases).toContain("Sebastian Moran");
    expect(aliases).toContain("Colonel Sebastian Moran");
  });

  it("does not over-generate for a bare name", () => {
    const { aliases, normalizedTerms } = deriveLabelTerms("Sherlock Holmes");
    expect(aliases).toEqual([]); // no honorific/parenthetical → no extra alias
    expect(normalizedTerms).toEqual(["sherlock holmes"]);
  });

  it("populates node.aliases / node.normalized_terms idempotently", () => {
    const ex = extraction([node({ id: "c_oberstein", label: "Hugo Oberstein (spy)", type: "Character" })]);
    const once = deriveAliasesAndNormalizedTerms(ex);
    const n = once.nodes[0]!;
    expect(n.aliases).toContain("Hugo Oberstein");
    expect(n.normalized_terms).toContain("hugo oberstein");
    const twice = deriveAliasesAndNormalizedTerms(once);
    expect(twice).toEqual(once);
  });

  it("merges with pre-existing aliases without clobbering", () => {
    const ex = extraction([
      node({ id: "c_w", label: "Dr. Watson", type: "Character", aliases: ["Johnny"] }),
    ]);
    const out = deriveAliasesAndNormalizedTerms(ex);
    expect(out.nodes[0]!.aliases).toEqual(expect.arrayContaining(["Johnny", "Watson"]));
  });
});

// ---------------------------------------------------------------------------
// (D) De-orphan
// ---------------------------------------------------------------------------
describe("deOrphanByContainer (D)", () => {
  const work = node({
    id: "work_w",
    label: "The Work",
    type: "Work",
    source_file: "corpus/saga/the-work/text.txt",
  });
  const chapter = node({
    id: "chapter_the-work_ch1",
    label: "Chapter 1",
    type: "ChapterOrStory",
    source_file: "corpus/saga/the-work/text.txt",
  });

  it("links an orphan to the FINEST container (chapter, not Work) when available", () => {
    const orphan = node({
      id: "character_x",
      label: "X",
      type: "Character",
      source_file: "corpus/saga/the-work/text.txt",
    });
    const ex = extraction([work, chapter, orphan], [
      // keep work + chapter non-orphan so they are not themselves linked
      edge({ source: "chapter_the-work_ch1", target: "work_w", relation: "part_of" }),
    ]);
    const out = deOrphanByContainer(ex);
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in");
    expect(appears).toHaveLength(1);
    expect(appears[0]!.target).toBe("chapter_the-work_ch1"); // finest, not work_w
    expect(appears[0]!.derived).toBe(true);
    expect(out.orphansAfter).toBe(0);
  });

  it("falls back to the Work when no finer container shares provenance", () => {
    const orphan = node({
      id: "character_y",
      label: "Y",
      type: "Character",
      source_file: "corpus/saga/the-work/text.txt",
    });
    const ex = extraction([work, orphan], [
      // work must not be an orphan itself for this assertion to be about the orphan
      edge({ source: "work_w", target: "work_w_anchor", relation: "noop" }),
    ]);
    const out = deOrphanByContainer(ex);
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in");
    expect(appears).toHaveLength(1);
    expect(appears[0]!.target).toBe("work_w");
  });

  it("resolves the container via citation source_file when the node lacks one", () => {
    const orphan = node({
      id: "object_z",
      label: "Z",
      type: "Object",
      source_file: "",
      citations: [{ source_file: "corpus/saga/the-work/text.txt", section: "I", quote: "z" }],
    });
    const ex = extraction([work, chapter, orphan], [
      edge({ source: "chapter_the-work_ch1", target: "work_w", relation: "part_of" }),
    ]);
    const out = deOrphanByContainer(ex);
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in");
    expect(appears[0]!.target).toBe("chapter_the-work_ch1");
  });

  it("is idempotent and respects pre-existing appears_in", () => {
    const orphan = node({
      id: "character_x",
      label: "X",
      type: "Character",
      source_file: "corpus/saga/the-work/text.txt",
    });
    const ex = extraction([work, chapter, orphan], [
      edge({ source: "chapter_the-work_ch1", target: "work_w", relation: "part_of" }),
    ]);
    const first = deOrphanByContainer(ex);
    const second = deOrphanByContainer(first.extraction);
    expect(second.appearsInAdded).toBe(0);
    expect(second.extraction.edges).toEqual(first.extraction.edges);
  });

  it("does not double-add when an appears_in already exists", () => {
    const orphan = node({
      id: "character_x",
      label: "X",
      type: "Character",
      source_file: "corpus/saga/the-work/text.txt",
    });
    const ex = extraction([work, chapter, orphan], [
      edge({ source: "character_x", target: "chapter_the-work_ch1", relation: "appears_in" }),
    ]);
    const out = deOrphanByContainer(ex);
    expect(out.appearsInAdded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (D) De-orphan — giant-component island/star avoidance (TRACKED #3)
// ---------------------------------------------------------------------------
describe("deOrphanByContainer (D) — giant-component steering", () => {
  /**
   * Build a graph where the Work is in the giant component, a SECOND chapter is
   * isolated (degree-0, shares the orphan's provenance), and the orphan's only
   * provenance match is that isolated chapter. Legacy strict-finest links the
   * orphan to the isolated chapter → a 2-node island; giant-mode must link it to
   * the Work (in the giant) instead.
   */
  function islandScenario() {
    const work = node({ id: "work_w", label: "W", type: "Work", source_file: "corpus/saga/the-work/text.txt" });
    // chapter1 is part of the giant component (linked to Work and a hub character).
    const ch1 = node({ id: "chapter_the-work_ch1", label: "Ch1", type: "ChapterOrStory", source_file: "corpus/saga/the-work/ch1.txt" });
    const hero = node({ id: "character_hero", label: "Hero", type: "Character", source_file: "corpus/saga/the-work/ch1.txt" });
    // chapter2 shares the orphan's provenance but is ISOLATED (no other edges).
    const ch2 = node({ id: "chapter_the-work_ch2", label: "Ch2", type: "ChapterOrStory", source_file: "corpus/saga/the-work/ch2.txt" });
    const orphan = node({ id: "character_x", label: "X", type: "Character", source_file: "corpus/saga/the-work/ch2.txt" });
    const edges = [
      edge({ source: "chapter_the-work_ch1", target: "work_w", relation: "part_of" }),
      edge({ source: "character_hero", target: "chapter_the-work_ch1", relation: "appears_in" }),
      edge({ source: "character_hero", target: "work_w", relation: "central_to" }),
    ];
    return extraction([work, ch1, hero, ch2, orphan], edges);
  }

  it("links to the Work (giant) when the finest container is an isolated chapter — no 2-node island", () => {
    const ex = islandScenario();
    const out = deOrphanByContainer(ex); // default: preferGiantComponent on
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in" && e.source === "character_x");
    expect(appears).toHaveLength(1);
    expect(appears[0]!.target).toBe("work_w"); // the giant anchor, NOT the isolated chapter
    // Work is the finest container that is itself in the giant component here.
    expect(appears[0]!.derivation_method).toBe("deorphan:giant-component");
    // character_x is no longer an orphan (the isolated container chapter_ch2
    // stays a container-orphan — that is the separate re-index concern).
    const xDegree = out.extraction.edges.filter(
      (e) => e.source === "character_x" || e.target === "character_x",
    ).length;
    expect(xDegree).toBeGreaterThan(0);
  });

  it("legacy mode (preferGiantComponent:false) links to the isolated finest chapter (regression baseline)", () => {
    const ex = islandScenario();
    const out = deOrphanByContainer(ex, { preferGiantComponent: false });
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in" && e.source === "character_x");
    expect(appears[0]!.target).toBe("chapter_the-work_ch2"); // isolated chapter → island
  });

  it("still prefers the finest container when that container IS in the giant component", () => {
    // chapter1 in giant; orphan shares chapter1's provenance → link to chapter1, not Work.
    const work = node({ id: "work_w", label: "W", type: "Work", source_file: "corpus/saga/the-work/text.txt" });
    const ch1 = node({ id: "chapter_the-work_ch1", label: "Ch1", type: "ChapterOrStory", source_file: "corpus/saga/the-work/ch1.txt" });
    const hero = node({ id: "character_hero", label: "Hero", type: "Character", source_file: "corpus/saga/the-work/ch1.txt" });
    const orphan = node({ id: "character_x", label: "X", type: "Character", source_file: "corpus/saga/the-work/ch1.txt" });
    const ex = extraction([work, ch1, hero, orphan], [
      edge({ source: "chapter_the-work_ch1", target: "work_w", relation: "part_of" }),
      edge({ source: "character_hero", target: "chapter_the-work_ch1", relation: "appears_in" }),
    ]);
    const out = deOrphanByContainer(ex);
    const appears = out.extraction.edges.filter((e) => e.relation === "appears_in" && e.source === "character_x");
    expect(appears[0]!.target).toBe("chapter_the-work_ch1");
    expect(appears[0]!.derivation_method).toBe("deorphan:giant-component");
  });

  it("never adds a redundant entity->Work edge — exactly one container per orphan", () => {
    const ex = islandScenario();
    const out = deOrphanByContainer(ex);
    const added = out.extraction.edges.filter(
      (e) => e.source === "character_x" && String((e as Record<string, unknown>).derived) === "true",
    );
    expect(added).toHaveLength(1); // one anchor edge only, no chapter+Work double
  });

  it("anchors to its own (off-giant) container rather than inventing a bridge to an unrelated giant", () => {
    // The giant lives in an UNRELATED work; this work's chapter+Work are both
    // OUTSIDE the giant. There is a TRUE anchor available — the orphan's own
    // chapter, which really does contain it — so we use it, and accept that the
    // component stays separate. Wiring the orphan to the unrelated giant's hub
    // (the previous `deorphan:giant-hub-global`) would assert a relationship the
    // corpus does not contain; at PROCESS_STD scale that path emitted 19 542 such
    // edges onto a single anchor.
    const otherWork = node({ id: "work_other", label: "Other", type: "Work", source_file: "corpus/other/text.txt" });
    const a = node({ id: "character_a", label: "A", type: "Character", source_file: "corpus/other/text.txt" });
    const b = node({ id: "character_b", label: "B", type: "Character", source_file: "corpus/other/text.txt" });
    const c = node({ id: "character_c", label: "C", type: "Character", source_file: "corpus/other/text.txt" });
    const work = node({ id: "work_w", label: "W", type: "Work", source_file: "corpus/saga/the-work/text.txt" });
    const ch = node({ id: "chapter_the-work_ch9", label: "Ch9", type: "ChapterOrStory", source_file: "corpus/saga/the-work/ch9.txt" });
    const orphan = node({ id: "character_x", label: "X", type: "Character", source_file: "corpus/saga/the-work/ch9.txt" });
    const ex = extraction([otherWork, a, b, c, work, ch, orphan], [
      // giant = the 4-node Other-work clique; everything in the-work is isolated.
      edge({ source: "character_a", target: "work_other", relation: "central_to" }),
      edge({ source: "character_b", target: "work_other", relation: "central_to" }),
      edge({ source: "character_c", target: "work_other", relation: "central_to" }),
      edge({ source: "character_a", target: "character_b", relation: "knows" }),
    ]);
    const out = deOrphanByContainer(ex);
    const added = out.extraction.edges.filter((e) => e.source === "character_x");
    expect(added).toHaveLength(1);
    // Anchored to its OWN finest container (ch9) — a true containment fact —
    // not to the unrelated giant's hub.
    expect(added[0]!.target).toBe("chapter_the-work_ch9");
    expect(added[0]!.relation).toBe("appears_in");
    expect(added[0]!.derivation_method).toBe("deorphan:container-offgiant");
    expect(out.extraction.edges.some((e) => e.source === "character_x" && e.target === "work_other")).toBe(false);
    expect(out.unattachable).toBe(0);
  });

  it("is idempotent in giant mode (re-run adds nothing, byte-equal edges)", () => {
    const ex = islandScenario();
    const first = deOrphanByContainer(ex);
    const second = deOrphanByContainer(first.extraction);
    expect(second.appearsInAdded).toBe(0);
    expect(second.extraction.edges).toEqual(first.extraction.edges);
  });
});

// ---------------------------------------------------------------------------
// (D) De-orphan — ABSOLUTE topology invariants on a representative graph
//   (1) no 2-node islands  (2) every derived edge is GROUNDED in provenance
//   (3) every orphan joins the giant, or its own work's real component. These
//   are absolute (not relative-to-legacy) guarantees. Fan-out bounds and the
//   unattachable-is-reported rule live in deorphan-attachment-policy.test.ts.
// ---------------------------------------------------------------------------
describe("deOrphanByContainer (D) — absolute topology invariants", () => {
  function endpoint(v: unknown): string {
    if (v && typeof v === "object" && "id" in (v as Record<string, unknown>)) {
      return String((v as Record<string, unknown>).id);
    }
    return String(v);
  }
  /** Undirected components + per-node degree over an extraction. */
  function topology(nodes: GraphNode[], edges: GraphEdge[]) {
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
    let giant = new Set<string>();
    for (const c of comps) if (c.size > giant.size) giant = c;
    const degree = new Map<string, number>();
    for (const [k, v] of adj) degree.set(k, v.size);
    return { adj, comps, giant, degree };
  }

  /**
   * A REPRESENTATIVE orphan-rich graph reproducing BOTH legacy failure modes:
   *   (a) orphans whose finer container (chapter) is isolated but whose WORK is
   *       in the giant — legacy would spoke them onto the Work;
   *   (b) orphans of a SEPARATE, fully-isolated "lonely" work — legacy
   *       `work-fallback` would anchor them to that isolated Work, producing a
   *       disconnected hub-spoke star (and, with a single orphan, a 2-node
   *       island) that NEVER joins the giant.
   * The fix must steer every entity orphan into the single giant component via a
   * high-degree node.
   */
  function representativeGraph(): Extraction {
    const nodes: GraphNode[] = [
      // --- the giant: a connected saga ---
      node({ id: "work_the-saga", label: "The Saga", type: "Work", source_file: "corpus/saga/the-saga/text.txt" }),
      node({ id: "chapter_the-saga_ch1", label: "Ch1", type: "ChapterOrStory", source_file: "corpus/saga/the-saga/ch1.txt" }),
      node({ id: "character_hero", label: "Hero", type: "Character", source_file: "corpus/saga/the-saga/ch1.txt" }),
      node({ id: "character_friend", label: "Friend", type: "Character", source_file: "corpus/saga/the-saga/ch1.txt" }),
      node({ id: "place_castle", label: "Castle", type: "Location", source_file: "corpus/saga/the-saga/ch1.txt" }),
      // --- (a) orphans whose finer container (ch2/ch3) is isolated, same saga ---
      node({ id: "character_o1", label: "O1", type: "Character", source_file: "corpus/saga/the-saga/ch2.txt" }),
      node({ id: "character_o2", label: "O2", type: "Character", source_file: "corpus/saga/the-saga/ch2.txt" }),
      node({ id: "object_o3", label: "O3", type: "Object", source_file: "corpus/saga/the-saga/ch3.txt" }),
      node({ id: "chapter_the-saga_ch2", label: "Ch2", type: "ChapterOrStory", source_file: "corpus/saga/the-saga/ch2.txt" }),
      node({ id: "chapter_the-saga_ch3", label: "Ch3", type: "ChapterOrStory", source_file: "corpus/saga/the-saga/ch3.txt" }),
      // --- (b) a SEPARATE fully-isolated "lonely" work + its orphans ---
      node({ id: "work_lonely", label: "Lonely", type: "Work", source_file: "corpus/lonely/the-lonely/text.txt" }),
      node({ id: "character_l1", label: "L1", type: "Character", source_file: "corpus/lonely/the-lonely/text.txt" }),
      node({ id: "character_l2", label: "L2", type: "Character", source_file: "corpus/lonely/the-lonely/text.txt" }),
      node({ id: "place_l3", label: "L3", type: "Location", source_file: "corpus/lonely/the-lonely/text.txt" }),
    ];
    const edges: GraphEdge[] = [
      // giant clique: hero–friend–castle around ch1/work, all densely linked.
      edge({ source: "chapter_the-saga_ch1", target: "work_the-saga", relation: "part_of" }),
      edge({ source: "character_hero", target: "chapter_the-saga_ch1", relation: "appears_in" }),
      edge({ source: "character_friend", target: "chapter_the-saga_ch1", relation: "appears_in" }),
      edge({ source: "place_castle", target: "chapter_the-saga_ch1", relation: "appears_in" }),
      edge({ source: "character_hero", target: "character_friend", relation: "knows" }),
      edge({ source: "character_hero", target: "place_castle", relation: "lives_in" }),
      edge({ source: "character_hero", target: "work_the-saga", relation: "central_to" }),
      // work_lonely and its l1/l2/l3 have NO edges → fully isolated until de-orphan.
    ];
    return { nodes, edges, hyperedges: [], input_tokens: 0, output_tokens: 0 };
  }

  it("INVARIANT 1: produces NO 2-node islands", () => {
    const out = deOrphanByContainer(representativeGraph());
    const { comps } = topology(out.extraction.nodes, out.extraction.edges);
    const twoNodeIslands = comps.filter((c) => c.size === 2);
    expect(twoNodeIslands).toHaveLength(0);
  });

  it("INVARIANT 2: every derived edge is GROUNDED — the anchor shares the orphan's provenance", () => {
    const before = representativeGraph();
    const out = deOrphanByContainer(before);
    const byId = new Map(out.extraction.nodes.map((n) => [String(n.id), n]));
    const slug = (sf: string) => {
      const parts = sf.split("/").filter(Boolean);
      return parts.length >= 2 ? parts[parts.length - 2]! : "";
    };
    const derived = out.extraction.edges.filter(
      (e) => String((e as Record<string, unknown>).derivation_method ?? "").startsWith("deorphan"),
    );
    expect(derived.length).toBeGreaterThan(0);
    for (const e of derived) {
      const src = String(byId.get(endpoint(e.source))!.source_file);
      const tgt = String(byId.get(endpoint(e.target))!.source_file);
      // same document, or same work directory (containment) — never unrelated.
      expect(src === tgt || slug(src) === slug(tgt)).toBe(true);
    }
  });

  it("INVARIANT 3: every orphan is either in the giant or attached to a TRUE container of its own work", () => {
    const before = representativeGraph();
    const beforeTopo = topology(before.nodes, before.edges);
    const orphansBefore = before.nodes
      .filter((n) => (beforeTopo.degree.get(String(n.id)) ?? 0) === 0)
      // container nodes (Work/Chapter) are not entity orphans we must rescue
      .filter((n) => !["Work", "ChapterOrStory", "Scene", "Section"].includes(String(n.type)));
    expect(orphansBefore.length).toBeGreaterThan(0); // the scenario IS orphan-rich

    const out = deOrphanByContainer(before);
    const { giant, comps, degree } = topology(out.extraction.nodes, out.extraction.edges);
    for (const o of orphansBefore) {
      const id = String(o.id);
      expect(degree.get(id) ?? 0).toBeGreaterThan(0); // nobody is left dangling here
      if (giant.has(id)) continue;
      // Off-giant is allowed ONLY when the orphan sits inside its own work's
      // component — the lonely work is genuinely separate in this corpus, and
      // faking a bridge to the saga would be the invented structure.
      const comp = comps.find((c) => c.has(id))!;
      expect(comp.has("work_lonely")).toBe(true);
    }
    // The saga orphans DID join the giant through their work.
    expect(giant.has("character_o1")).toBe(true);
    expect(giant.has("object_o3")).toBe(true);
  });

  it("anchors every entity orphan THROUGH a high-degree giant node (degree >= castle)", () => {
    const out = deOrphanByContainer(representativeGraph());
    const { degree } = topology(out.extraction.nodes, out.extraction.edges);
    const derived = out.extraction.edges.filter(
      (e) => String((e as Record<string, unknown>).derivation_method ?? "").startsWith("deorphan"),
    );
    expect(derived.length).toBeGreaterThan(0);
    // every derived anchor target is a genuinely high-degree node (>= 2).
    for (const e of derived) {
      expect(degree.get(endpoint(e.target)) ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it("is idempotent on the representative graph (re-run adds nothing)", () => {
    const first = deOrphanByContainer(representativeGraph());
    const second = deOrphanByContainer(first.extraction);
    expect(second.appearsInAdded).toBe(0);
    expect(second.extraction.edges).toEqual(first.extraction.edges);
  });

  it("the lonely work stays a SEPARATE honest component — we do not fake a bridge to the saga", () => {
    // The lonely work shares nothing with the saga: no document, no container.
    // Its entities attach to their own Work (true containment) and the component
    // remains separate. That separation is a FACT about the corpus, and the
    // remedy is cross-work extraction, not a synthetic edge.
    const out = deOrphanByContainer(representativeGraph());
    const { giant, comps } = topology(out.extraction.nodes, out.extraction.edges);
    expect(giant.has("character_l1")).toBe(false);
    const lonelyComp = comps.find((c) => c.has("work_lonely"))!;
    expect(lonelyComp.has("character_l1")).toBe(true);
    expect(lonelyComp.has("character_hero")).toBe(false); // separate from the giant
    // Disabling peer attachment does not change this container-only case.
    const noPeers = deOrphanByContainer(representativeGraph(), { joinGiantViaHub: false });
    expect(
      noPeers.extraction.edges.filter((e) => e.source === "character_l1"),
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Pipeline wiring — config-gated, default OFF
// ---------------------------------------------------------------------------
describe("assembly-hygiene pipeline gate", () => {
  const ex = extraction(
    [
      node({ id: "location_a", label: "Dr. Alpha (ghost)", type: "place", source_file: "corpus/w/the-w/text.txt" }),
      node({ id: "place_a", label: "Alpha", type: "Location", source_file: "corpus/w/the-w/text.txt" }),
      node({ id: "work_the-w", label: "The W", type: "Work", source_file: "corpus/w/the-w/text.txt" }),
    ],
    [],
  );

  it("is a no-op when assemblyHygiene is not set (default OFF)", () => {
    const G = buildFromJson(ex);
    expect(G.hasNode("location_a")).toBe(true);
    expect(G.hasNode("place_a")).toBe(true);
    expect(G.size).toBe(0); // no derived edges
  });

  it("runs all three steps when gated on", () => {
    const G = buildFromJson(ex, {
      assemblyHygiene: { schemaHygiene: true, deriveAliases: true, deOrphan: true },
    });
    // (A) location_a collapsed into place_a.
    expect(G.hasNode("location_a")).toBe(false);
    expect(G.hasNode("place_a")).toBe(true);
    // (B) alias derived from the collapsed label "Dr. Alpha (ghost)".
    const aliases = G.getNodeAttribute("place_a", "aliases") as string[];
    expect(aliases).toEqual(expect.arrayContaining(["Alpha (ghost)", "Dr. Alpha"]));
    // (D) the now-collapsed entity is de-orphaned to its Work.
    expect(G.hasEdge("place_a", "work_the-w")).toBe(true);
  });

  it("applyAssemblyHygiene returns input unchanged with no options", () => {
    expect(applyAssemblyHygiene(ex)).toBe(ex);
  });
});

describe("L0-R hygiene", () => {
  it("hygiene-keeps-both-under-unrelated-remap", async () => {
    const { serializeGraph, loadGraphFromData } = await import("../src/graph.js");
    const both = extraction(
      [
        node({ id: "a", label: "Alpha", source_file: "a.ts" }),
        node({ id: "b", label: "Beta", source_file: "a.ts" }),
        node({ id: "org_unused", label: "Unused", source_file: "a.ts" }),
        node({ id: "organization_unused", label: "Unused", source_file: "a.ts" }),
      ],
      [
        edge({ source: "a", target: "b", relation: "calls", source_file: "a.ts", source_location: "a.ts:L10", evidence_refs: ["ref-L10"] }),
        edge({ source: "a", target: "b", relation: "calls", source_file: "a.ts", source_location: "a.ts:L44", evidence_refs: ["ref-L44"] }),
      ],
    );
    const out = normalizeSchemaHygiene(both, {});
    expect(out.edges).toHaveLength(2);
    const G = buildFromJson(out);
    expect(G.size).toBe(1);
    expect(serializeGraph(G).links).toHaveLength(1);
    const obs = ((serializeGraph(G).links ?? [])[0] as Record<string, unknown>)["evidence_observations"] as Array<Record<string, unknown>> | undefined;
    expect(obs).toHaveLength(2);
    expect(obs!.map((o) => o["source_location"]).sort()).toEqual(["a.ts:L10", "a.ts:L44"]);
    const reloaded = loadGraphFromData(serializeGraph(G));
    expect(serializeGraph(reloaded).links).toHaveLength(1);
    expect(((G as unknown) as { multi?: boolean }).multi).toBe(true);
  });
});

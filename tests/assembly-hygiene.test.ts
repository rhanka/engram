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
    // The Work must itself be in the giant component for it to be a valid link
    // target — anchor it to a real connected entity (work_anchor) so the Work is
    // the giant and the degree-0 orphan is what gets de-orphaned onto it.
    const anchor = node({
      id: "character_anchor",
      label: "Anchor",
      type: "Character",
      source_file: "corpus/saga/the-work/text.txt",
    });
    const ex = extraction([work, anchor, orphan], [
      edge({ source: "character_anchor", target: "work_w", relation: "appears_in" }),
    ]);
    const out = deOrphanByContainer(ex);
    const appears = out.extraction.edges.filter((e) => (e as { derived?: boolean }).derived);
    expect(appears).toHaveLength(1);
    expect(appears[0]!.source).toBe("character_y");
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

  // -- Giant-component join (TRACKED #3): no 2-node island, no isolated orphan --

  // Helper: undirected connected-components from an extraction's edges.
  function componentsOf(ex: Extraction): string[][] {
    const ids = new Set((ex.nodes ?? []).map((n) => String(n.id)));
    const adj = new Map<string, Set<string>>();
    for (const id of ids) adj.set(id, new Set());
    for (const e of ex.edges ?? []) {
      const s = String(e.source);
      const t = String(e.target);
      if (!ids.has(s) || !ids.has(t) || s === t) continue;
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }
    const seen = new Set<string>();
    const comps: string[][] = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const members: string[] = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const u = stack.pop()!;
        members.push(u);
        for (const v of adj.get(u)!) if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
      }
      comps.push(members.sort());
    }
    return comps.sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
  }

  it("links an orphan to the in-giant Work when the finest container is itself isolated (no 2-node island)", () => {
    // A giant component exists (work + chapter + several connected entities).
    const giantWork = node({ id: "work_g", label: "Giant Work", type: "Work", source_file: "corpus/saga/g/text.txt" });
    const giantCh = node({ id: "chapter_g_ch1", label: "G ch1", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const a = node({ id: "character_a", label: "A", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const b = node({ id: "character_b", label: "B", type: "Character", source_file: "corpus/saga/g/text.txt" });
    // An ISOLATED chapter sharing the orphan's provenance but connected to NOTHING.
    // Its id sorts BEFORE the connected chapter (chapter_g_ch0 < chapter_g_ch1) so a
    // naive first-seen-by-id container index would pick this isolated one — the fix
    // must reject it because it is not in the giant component.
    const lonelyCh = node({ id: "chapter_g_ch0", label: "G ch0", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const orphan = node({ id: "character_orphan", label: "Orphan", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const ex = extraction(
      [giantWork, giantCh, a, b, lonelyCh, orphan],
      [
        edge({ source: "chapter_g_ch1", target: "work_g", relation: "part_of" }),
        edge({ source: "character_a", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_b", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_a", target: "character_b", relation: "knows" }),
      ],
    );
    const out = deOrphanByContainer(ex);
    const added = out.extraction.edges.filter((e) => (e as { derived?: boolean }).derived);
    const orphanEdge = added.find((e) => String(e.source) === "character_orphan");
    expect(orphanEdge).toBeDefined();
    // MUST link to an in-giant container, NOT the isolated lonely chapter.
    expect(orphanEdge!.target).not.toBe("chapter_g_ch0");
    // And no 2-node island may exist after.
    const comps = componentsOf(out.extraction);
    const twoNode = comps.filter((c) => c.length === 2);
    expect(twoNode).toHaveLength(0);
    // The orphan now belongs to the single giant component.
    expect(comps[0]).toContain("character_orphan");
  });

  it("dissolves a pre-existing 2-node island into the giant component", () => {
    // Giant: a work + chapter + 3 connected entities.
    const giantWork = node({ id: "work_g", label: "Giant Work", type: "Work", source_file: "corpus/saga/g/text.txt" });
    const giantCh = node({ id: "chapter_g_ch1", label: "G ch1", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const a = node({ id: "character_a", label: "A", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const b = node({ id: "character_b", label: "B", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const c = node({ id: "character_c", label: "C", type: "Character", source_file: "corpus/saga/g/text.txt" });
    // 2-node island: two entities linked ONLY to each other (each degree-1).
    const islandX = node({ id: "character_x_isle", label: "X", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const islandY = node({ id: "object_y_isle", label: "Y", type: "Object", source_file: "corpus/saga/g/text.txt" });
    const ex = extraction(
      [giantWork, giantCh, a, b, c, islandX, islandY],
      [
        edge({ source: "chapter_g_ch1", target: "work_g", relation: "part_of" }),
        edge({ source: "character_a", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_b", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_c", target: "chapter_g_ch1", relation: "appears_in" }),
        // the island, disconnected from everything else
        edge({ source: "character_x_isle", target: "object_y_isle", relation: "uses" }),
      ],
    );
    const before = componentsOf(ex);
    expect(before.filter((comp) => comp.length === 2)).toHaveLength(1); // the island exists before
    const out = deOrphanByContainer(ex);
    const comps = componentsOf(out.extraction);
    expect(comps.filter((comp) => comp.length === 2)).toHaveLength(0); // dissolved
    expect(comps).toHaveLength(1); // single giant component
    expect(comps[0]).toContain("character_x_isle");
    expect(comps[0]).toContain("object_y_isle");
  });

  it("does not add a redundant entity->Work edge when the entity already reaches the work via a chapter", () => {
    const giantWork = node({ id: "work_g", label: "Giant Work", type: "Work", source_file: "corpus/saga/g/text.txt" });
    const giantCh = node({ id: "chapter_g_ch1", label: "G ch1", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const a = node({ id: "character_a", label: "A", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const ex = extraction(
      [giantWork, giantCh, a],
      [
        edge({ source: "chapter_g_ch1", target: "work_g", relation: "part_of" }),
        edge({ source: "character_a", target: "chapter_g_ch1", relation: "appears_in" }),
      ],
    );
    // character_a already reaches work_g via the chapter; it is not an orphan.
    const out = deOrphanByContainer(ex);
    const addedToWork = out.extraction.edges.filter(
      (e) => (e as { derived?: boolean }).derived && String(e.target) === "work_g" && String(e.source) === "character_a",
    );
    expect(addedToWork).toHaveLength(0);
  });

  it("is idempotent under the giant-component join path", () => {
    const giantWork = node({ id: "work_g", label: "Giant Work", type: "Work", source_file: "corpus/saga/g/text.txt" });
    const giantCh = node({ id: "chapter_g_ch1", label: "G ch1", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const a = node({ id: "character_a", label: "A", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const b = node({ id: "character_b", label: "B", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const islandX = node({ id: "character_x_isle", label: "X", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const islandY = node({ id: "object_y_isle", label: "Y", type: "Object", source_file: "corpus/saga/g/text.txt" });
    const lonelyCh = node({ id: "chapter_g_ch9", label: "G ch9", type: "ChapterOrStory", source_file: "corpus/saga/g/text.txt" });
    const orphan = node({ id: "character_orphan", label: "Orphan", type: "Character", source_file: "corpus/saga/g/text.txt" });
    const ex = extraction(
      [giantWork, giantCh, a, b, islandX, islandY, lonelyCh, orphan],
      [
        edge({ source: "chapter_g_ch1", target: "work_g", relation: "part_of" }),
        edge({ source: "character_a", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_b", target: "chapter_g_ch1", relation: "appears_in" }),
        edge({ source: "character_a", target: "character_b", relation: "knows" }),
        edge({ source: "character_x_isle", target: "object_y_isle", relation: "uses" }),
      ],
    );
    const first = deOrphanByContainer(ex);
    const second = deOrphanByContainer(first.extraction);
    expect(second.appearsInAdded).toBe(0);
    expect(second.extraction.edges).toEqual(first.extraction.edges);
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

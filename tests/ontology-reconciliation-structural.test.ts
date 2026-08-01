import { describe, expect, it } from "vitest";

import {
  DEFAULT_STRUCTURAL_TIER_CONFIG,
  STRUCTURAL_TIER_BASE_SCORE,
  STRUCTURAL_TIER_MAX_SCORE,
  buildStructuralIndex,
  generateOntologyReconciliationCandidates,
  structuralCandidatePairs,
  structuralLabelRejectReason,
  structuralMatchNodes,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode, OntologyPatchRelation } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

/**
 * STRUCTURAL TIER — the tier that proposes a pair on graph EVIDENCE (shared
 * neighbours, relation-type profile, registry provenance) when the strings do
 * not look alike.
 *
 * The measured reality these tests encode (mystery pack, 1983 nodes / 3553
 * relations, and the PROCESS_STD bundle, 38853 nodes / 13921 relations): raw
 * shared-neighbour similarity finds SIBLINGS, not duplicates. Unguarded it
 * emitted 18 candidates on mystery and 119 on PROCESS_STD, and every one inspected was
 * a false positive (Father Brown ↔ Flambeau; Google Sheets ↔ Google Drive).
 * With the guard suite below, both corpora emit 0 — while the positive control
 * proves the tier is not vacuous.
 */

const profile = { profile_hash: "h" } as unknown as NormalizedOntologyProfile;

function ctx(nodes: OntologyPatchNode[], relations: OntologyPatchRelation[] = []): OntologyPatchContext {
  return {
    rootDir: "/r",
    stateDir: "/r/.graphify",
    graphHash: "g",
    profile,
    profileState: {} as never,
    nodes,
    relations,
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string, extra: Partial<OntologyPatchNode> = {}): OntologyPatchNode {
  return { id, label, type: "Character", ...extra };
}

function rel(source: string, target: string, type = "mentions"): OntologyPatchRelation {
  return { id: `${source}->${target}:${type}`, type, source_id: source, target_id: target };
}

/** A pair of nodes with `shared` common neighbours, drawn from DIFFERENT sources. */
function twinFixture(options: {
  shared?: number;
  leftOnly?: number;
  rightOnly?: number;
  sourceA?: string;
  sourceB?: string;
} = {}) {
  const shared = options.shared ?? 6;
  const leftOnly = options.leftOnly ?? 0;
  const rightOnly = options.rightOnly ?? 0;
  const nodes: OntologyPatchNode[] = [
    // Deliberately share NO tokens: the structural tier exists precisely for
    // pairs the lexical tiers cannot see, so the fixture must not fuzzy-match.
    node("a", "Alderney", { source_refs: [options.sourceA ?? "doc/a.txt"] }),
    node("b", "Bellweather", { source_refs: [options.sourceB ?? "doc/b.txt"] }),
  ];
  const relations: OntologyPatchRelation[] = [];
  for (let i = 0; i < shared; i += 1) {
    nodes.push(node(`s${i}`, `Shared ${String.fromCharCode(97 + i)}`, { type: "Object" }));
    relations.push(rel("a", `s${i}`), rel("b", `s${i}`));
  }
  for (let i = 0; i < leftOnly; i += 1) {
    nodes.push(node(`l${i}`, `Left ${String.fromCharCode(97 + i)}`, { type: "Object" }));
    relations.push(rel("a", `l${i}`));
  }
  for (let i = 0; i < rightOnly; i += 1) {
    nodes.push(node(`r${i}`, `Right ${String.fromCharCode(97 + i)}`, { type: "Object" }));
    relations.push(rel("b", `r${i}`));
  }
  return { nodes, relations };
}

function match(fixture: { nodes: OntologyPatchNode[]; relations: OntologyPatchRelation[] }, config = {}) {
  const index = buildStructuralIndex(fixture.relations, fixture.nodes);
  const left = fixture.nodes.find((n) => n.id === "a")!;
  const right = fixture.nodes.find((n) => n.id === "b")!;
  return structuralMatchNodes(left, right, index, { ...DEFAULT_STRUCTURAL_TIER_CONFIG, ...config });
}

describe("structural tier — positive control (the tier is not vacuous)", () => {
  it("proposes a cross-source pair with a strong shared neighbourhood", () => {
    const result = match(twinFixture({ shared: 6 }));
    expect(result.matched).toBe(true);
    expect(result.rejectReason).toBeNull();
    expect(result.sharedNeighbours).toHaveLength(6);
    expect(result.neighbourJaccard).toBe(1);
  });

  it("actually EMITS through the generator and cannot go silently mute", () => {
    const fixture = twinFixture({ shared: 6 });
    const queue = generateOntologyReconciliationCandidates(ctx(fixture.nodes, fixture.relations), {
      structural: true,
      generatedAt: "2026-07-26T00:00:00.000Z",
    });
    const structural = queue.candidates.filter((candidate) => candidate.tier === "structural");

    expect(structural.length).toBeGreaterThan(0);
    expect(structural).toContainEqual(expect.objectContaining({ canonical_id: "a", candidate_id: "b" }));
  });

  it("carries its evidence: shared neighbours, relation profile, score breakdown", () => {
    const fixture = twinFixture({ shared: 6 });
    const queue = generateOntologyReconciliationCandidates(ctx(fixture.nodes, fixture.relations), {
      structural: true,
      generatedAt: "2026-07-26T00:00:00.000Z",
    });
    const structural = queue.candidates.filter((c) => c.tier === "structural");
    expect(structural).toHaveLength(1);
    const candidate = structural[0]!;
    expect(candidate.structural_basis?.shared_neighbour_count).toBe(6);
    expect(candidate.structural_basis?.shared_neighbour_ids).toContain("s0");
    expect(candidate.structural_basis?.shared_relation_types).toContain("out:mentions");
    expect(candidate.score_breakdown?.neighbour_jaccard).toBe(1);
    expect(candidate.score_breakdown?.shared_neighbours).toBe(6);
    expect(candidate.reasons.some((r) => r.includes("shared neighbours:"))).toBe(true);
    expect(candidate.reasons.some((r) => r.includes("human adjudication required"))).toBe(true);
  });
});

describe("structural tier — never auto-applies, always ranked below lexical", () => {
  it("emits a CANDIDATE proposal only — nothing is merged", () => {
    const fixture = twinFixture({ shared: 6 });
    const queue = generateOntologyReconciliationCandidates(ctx(fixture.nodes, fixture.relations), {
      structural: true,
    });
    const structural = queue.candidates.filter((candidate) => candidate.tier === "structural");
    expect(structural.length).toBeGreaterThan(0);
    for (const candidate of structural) {
      expect(candidate.status).toBe("candidate");
      expect(candidate.proposed_patch_operation).toBe("accept_match");
    }
  });

  it("scores strictly below the fuzzy floor (0.7) and the exact tier (0.85/1.0)", () => {
    expect(STRUCTURAL_TIER_MAX_SCORE).toBeLessThan(0.7);
    expect(STRUCTURAL_TIER_BASE_SCORE).toBeLessThanOrEqual(STRUCTURAL_TIER_MAX_SCORE);
    const result = match(twinFixture({ shared: 12 }));
    expect(result.score).toBeLessThanOrEqual(STRUCTURAL_TIER_MAX_SCORE);
    expect(result.score).toBeGreaterThanOrEqual(STRUCTURAL_TIER_BASE_SCORE);
  });

  it("is capability-gated: OFF by default, and switching it on is strictly additive", () => {
    const fixture = twinFixture({ shared: 6 });
    const context = ctx(fixture.nodes, fixture.relations);
    const off = generateOntologyReconciliationCandidates(context, { generatedAt: "t" });
    expect(off.candidates.some((c) => c.tier === "structural")).toBe(false);

    const on = generateOntologyReconciliationCandidates(context, { structural: true, generatedAt: "t" });
    // Every pre-existing candidate survives byte-identically; only additions.
    for (const before of off.candidates) {
      const after = on.candidates.find((c) => c.id === before.id);
      expect(after).toEqual(before);
    }
    expect(on.candidates.some((candidate) => candidate.tier === "structural")).toBe(true);
    expect(on.candidates.length).toBeGreaterThan(off.candidates.length);
  });
});

describe("structural tier — false-positive guards", () => {
  it("(S1) rejects a sibling LEAF pair: two nodes under one shared parent", () => {
    // The canonical structural trap: perfect neighbour Jaccard (1.0) on a single
    // shared parent. Two children of one parent are maximally similar and never
    // the same entity.
    const nodes = [
      node("a", "Ashwood Grange"),
      node("b", "The Grange at Ashwood"),
      node("p", "Parent", { type: "Object" }),
    ];
    const relations = [rel("a", "p"), rel("b", "p")];
    const index = buildStructuralIndex(relations, nodes);
    const result = structuralMatchNodes(nodes[0]!, nodes[1]!, index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/insufficient informative degree/u);
  });

  it("(S1) rejects when too few informative neighbours are shared", () => {
    const result = match(twinFixture({ shared: 2, leftOnly: 2, rightOnly: 2 }));
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/too few shared informative neighbours/u);
  });

  it("(S2) discounts HUB neighbours: co-membership of a hub is not identity", () => {
    const nodes: OntologyPatchNode[] = [
      node("a", "Ashwood Grange", { source_refs: ["doc/a.txt"] }),
      node("b", "The Grange at Ashwood", { source_refs: ["doc/b.txt"] }),
    ];
    const relations: OntologyPatchRelation[] = [];
    // Three shared neighbours, each an enormous hub (degree > hubDegreeMax).
    for (let h = 0; h < 3; h += 1) {
      nodes.push(node(`hub${h}`, `Hub ${h}`, { type: "Object" }));
      relations.push(rel("a", `hub${h}`), rel("b", `hub${h}`));
      for (let f = 0; f < DEFAULT_STRUCTURAL_TIER_CONFIG.hubDegreeMax + 2; f += 1) {
        nodes.push(node(`f${h}_${f}`, `Filler ${h} ${f}`, { type: "Object" }));
        relations.push(rel(`hub${h}`, `f${h}_${f}`));
      }
    }
    const index = buildStructuralIndex(relations, nodes);
    const result = structuralMatchNodes(nodes[0]!, nodes[1]!, index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/insufficient informative degree/u);
  });

  it("(S3) never re-admits a pair the LEXICAL guards confidently rejected", () => {
    // "Lord X" / "Lady X" is a spouse pair. However identical their structure is,
    // structure must not resurrect it.
    const fixture = twinFixture({ shared: 8 });
    fixture.nodes[0]!.label = "Lord Trelawney Hope";
    fixture.nodes[1]!.label = "Lady Trelawney Hope";
    const result = match(fixture);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/lexically rejected pair/u);
    expect(structuralLabelRejectReason(fixture.nodes[0]!, fixture.nodes[1]!)).toMatch(/opposite-gender title/u);
  });

  it("(S4) rejects the HC-14 → COMPTON:C-15 class: divergent serial identifiers", () => {
    // The KNOWN false positive the fuzzy tier once produced at 0.45 confidence.
    // The structural tier must not reproduce it in a new form, however alike the
    // two neighbourhoods are — members 14 and 15 of a series are not one thing.
    const fixture = twinFixture({ shared: 10 });
    fixture.nodes[0]!.label = "HC-14";
    fixture.nodes[1]!.label = "COMPTON:C-15";
    const result = match(fixture);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/divergent serial identifiers/u);
    expect(structuralLabelRejectReason(fixture.nodes[0]!, fixture.nodes[1]!)).toMatch(/14.*15|15.*14/u);

    // …and end-to-end: the generator emits no candidate for the pair.
    const queue = generateOntologyReconciliationCandidates(ctx(fixture.nodes, fixture.relations), {
      structural: true,
      generatedAt: "t",
    });
    const pair = queue.candidates.find(
      (c) => [c.canonical_id, c.candidate_id].sort().join("|") === "a|b",
    );
    expect(pair).toBeUndefined();
  });

  it("(S4) rejects a formulaic ordinal series (Edward I ↔ Edward II)", () => {
    const fixture = twinFixture({ shared: 10 });
    fixture.nodes[0]!.label = "Edward I";
    fixture.nodes[1]!.label = "Edward II";
    const result = match(fixture);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/formulaic series|divergent serial/u);
  });

  it("(S5) rejects a pair the corpus DIRECTLY relates: an entity does not oppose itself", () => {
    const fixture = twinFixture({ shared: 8 });
    fixture.relations.push(rel("a", "b", "opposes"));
    const result = match(fixture);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/direct relation asserts distinct entities: opposes/u);
  });

  it("(S5) does NOT veto on an IDENTITY relation between the two nodes", () => {
    const fixture = twinFixture({ shared: 8 });
    fixture.relations.push(rel("a", "b", "alias_of"));
    // alias_of asserts sameness, so the direct-edge veto must stay silent.
    expect(match(fixture).rejectReason ?? "").not.toMatch(/direct relation asserts/u);
  });

  it("(S6) discounts CONTAINER neighbours: sharing chapters is co-occurrence", () => {
    // Father Brown ↔ Flambeau: two protagonists appearing in the same stories.
    // Measured on the mystery pack as a 0.65-scoring false positive before this
    // guard existed.
    const nodes: OntologyPatchNode[] = [
      node("a", "Father Brown", { source_refs: ["doc/a.txt"] }),
      node("b", "Flambeau", { source_refs: ["doc/b.txt"] }),
    ];
    const relations: OntologyPatchRelation[] = [];
    for (let i = 0; i < 8; i += 1) {
      nodes.push(node(`c${i}`, `Story ${i}`, { type: "ChapterOrStory" }));
      relations.push(rel("a", `c${i}`, "appears_in"), rel("b", `c${i}`, "appears_in"));
    }
    const index = buildStructuralIndex(relations, nodes);
    const result = structuralMatchNodes(nodes[0]!, nodes[1]!, index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/insufficient informative degree/u);
  });

  it("(S7) rejects SAME-SOURCE siblings: one pass over one document separated them", () => {
    // Google Sheets ↔ Google Drive: same document, same five supported processes.
    // Measured as the guard that removes all 119 PROCESS_STD false positives.
    const fixture = twinFixture({ shared: 6, sourceA: "doc/same.txt", sourceB: "doc/same.txt" });
    const result = match(fixture);
    expect(result.matched).toBe(false);
    expect(result.rejectReason).toMatch(/same-source siblings/u);
  });

  it("(S7) a shared REGISTRY record overrides the same-source veto", () => {
    // Pointing at the same canonical registry record is positive identity
    // evidence, unlike merely being mentioned in the same document.
    const fixture = twinFixture({ shared: 6, sourceA: "doc/same.txt", sourceB: "doc/same.txt" });
    fixture.nodes[0]!.registry_refs = ["registry:tools#rec-7"];
    fixture.nodes[1]!.registry_refs = ["registry:tools#rec-7"];
    const result = match(fixture);
    expect(result.matched).toBe(true);
    expect(result.sharedProvenance).toEqual(["registry:tools#rec-7"]);
  });
});

describe("structural tier — blocking", () => {
  it("only pairs nodes that share an informative neighbour, and skips hub blocks", () => {
    const nodes: OntologyPatchNode[] = [node("a", "A"), node("b", "B"), node("c", "C")];
    const relations = [rel("a", "p"), rel("b", "p")];
    nodes.push(node("p", "P", { type: "Object" }));
    const index = buildStructuralIndex(relations, nodes);
    const pairs = structuralCandidatePairs(index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    // a and b share p; c shares nothing with anyone.
    expect(pairs).toContainEqual(["a", "b"]);
    expect(pairs.some((p) => p.includes("c"))).toBe(false);
  });

  it("is deterministic across runs", () => {
    const fixture = twinFixture({ shared: 5 });
    const index = buildStructuralIndex(fixture.relations, fixture.nodes);
    const first = structuralCandidatePairs(index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    const second = structuralCandidatePairs(index, DEFAULT_STRUCTURAL_TIER_CONFIG);
    expect(second).toEqual(first);
  });

  it("excludes container TYPES from the tier entirely", () => {
    const nodes: OntologyPatchNode[] = [
      node("a", "Part One", { type: "ChapterOrStory", source_refs: ["doc/a.txt"] }),
      node("b", "The Opening Part", { type: "ChapterOrStory", source_refs: ["doc/b.txt"] }),
    ];
    const relations: OntologyPatchRelation[] = [];
    for (let i = 0; i < 6; i += 1) {
      nodes.push(node(`s${i}`, `Shared ${i}`, { type: "Object" }));
      relations.push(rel("a", `s${i}`), rel("b", `s${i}`));
    }
    const queue = generateOntologyReconciliationCandidates(ctx(nodes, relations), {
      structural: true,
      generatedAt: "t",
    });
    expect(queue.candidates.some((c) => c.tier === "structural")).toBe(false);
  });
});

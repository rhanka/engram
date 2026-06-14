import { describe, expect, it } from "vitest";

import {
  fuzzyMatchNodes,
  generateOntologyReconciliationCandidates,
  type OntologyReconciliationCandidate,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const profile = { profile_hash: "h" } as unknown as NormalizedOntologyProfile;

function ctx(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/r",
    stateDir: "/r/.graphify",
    graphHash: "g",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

let counter = 0;
function n(label: string, type = "Character"): OntologyPatchNode {
  counter += 1;
  return { id: `node_${counter}_${label.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`, label, type };
}

/** Did the generator emit a candidate pairing these two labels? */
function pairsLabels(
  candidates: OntologyReconciliationCandidate[],
  nodes: OntologyPatchNode[],
  a: string,
  b: string,
): boolean {
  const byId = new Map(nodes.map((x) => [x.id, x.label]));
  return candidates.some((c) => {
    const labels = [byId.get(c.canonical_id), byId.get(c.candidate_id)].sort();
    return labels[0] === [a, b].sort()[0] && labels[1] === [a, b].sort()[1];
  });
}

describe("reconciliation fuzzy tier — precision on known mystery pairs", () => {
  // MUST-surface genuine pairs (qualifier / parenthetical variants).
  const genuine: Array<[string, string, string]> = [
    ["Character", "Hugo Oberstein", "Hugo Oberstein (spy)"],
    ["Location", "British Museum", "British Museum (Egyptian Antiquities)"],
    ["Location", "Devonshire (Exmoor estate)", "Exmoor estate"],
    ["Character", "Reuben Hornby", "Reuben Hornby (accused)"],
    ["Character", "Gournay-Martin", "M. Gournay-Martin"],
  ];
  it.each(genuine)("surfaces genuine pair (%s): %s ↔ %s", (type, a, b) => {
    const nodes = [n(a, type), n(b, type)];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    expect(pairsLabels(queue.candidates, nodes, a, b)).toBe(true);
  });

  // MUST-reject false positives.
  const falsePositives: Array<[string, string, string]> = [
    ["Character", "Sir Henry Baskerville", "Sir Charles Baskerville"],
    ["Character", "Edward I", "Edward II"],
    ["Character", "Edward II", "Edward III"],
    ["Character", "Inspector Lestrade", "Inspector Gregson"],
    ["Character", "Inspector Bradstreet", "Inspector Lanner"],
    ["Location", "Château de Blois", "Château de Chambord"],
    ["Location", "Château de Blois", "Château de Chantilly"],
    ["Location", "Château de Chambord", "Château de Chantilly"],
  ];
  it.each(falsePositives)("rejects false positive (%s): %s ↔ %s", (type, a, b) => {
    const nodes = [n(a, type), n(b, type)];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    expect(pairsLabels(queue.candidates, nodes, a, b)).toBe(false);
  });

  it("scores exact tier 1.0 and fuzzy tier strictly below", () => {
    const nodes = [n("Hugo Oberstein"), n("Hugo Oberstein (spy)"), n("Watson"), n("Watson")];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    const exact = queue.candidates.find((c) => c.tier === "exact");
    const fuzzy = queue.candidates.find((c) => c.tier === "fuzzy");
    expect(exact?.score).toBe(1);
    expect(fuzzy).toBeDefined();
    expect(fuzzy!.score).toBeLessThan(1);
  });

  it("applies the type-guard (no cross-type fuzzy match)", () => {
    const nodes = [n("Hugo Oberstein", "Character"), n("Hugo Oberstein (place)", "Location")];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    expect(queue.candidates).toHaveLength(0);
  });

  it("can disable the fuzzy tier (exact-only)", () => {
    const nodes = [n("Hugo Oberstein"), n("Hugo Oberstein (spy)")];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t", fuzzy: false });
    // labels differ → no exact shared term → no candidate without fuzzy.
    expect(queue.candidates).toHaveLength(0);
  });

  it("caps the output and ranks exact above fuzzy", () => {
    const nodes = [
      n("Alpha"),
      n("Alpha"), // exact pair, score 1.0
      n("Beta Gamma"),
      n("Beta Gamma (note)"), // fuzzy pair
    ];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t", cap: 1 });
    expect(queue.candidates).toHaveLength(1);
    expect(queue.candidates[0]!.tier).toBe("exact");
  });

  it("is deterministic", () => {
    const make = () => generateOntologyReconciliationCandidates(
      ctx([n("Hugo Oberstein"), n("Hugo Oberstein (spy)")]),
      { generatedAt: "t" },
    );
    // reset counter so ids match between runs
    counter = 0;
    const a = make();
    counter = 0;
    const b = make();
    expect(a).toEqual(b);
  });

  it("fuzzyMatchNodes is a pure predicate over labels", () => {
    expect(fuzzyMatchNodes(n("Hugo Oberstein"), n("Hugo Oberstein (spy)")).matched).toBe(true);
    expect(fuzzyMatchNodes(n("Sir Henry Baskerville"), n("Sir Charles Baskerville")).matched).toBe(false);
  });

  it("rejects formulaic-series pairs (chapter/regnal ordinals)", () => {
    expect(fuzzyMatchNodes(n("Part I, Chapter II"), n("Part II, Chapter I")).matched).toBe(false);
    expect(fuzzyMatchNodes(n("Part I, Chapter I"), n("Part II, Chapter I")).matched).toBe(false);
    expect(fuzzyMatchNodes(n("Edward I"), n("Edward III")).matched).toBe(false);
  });

  it("rejects generic single-token locator collisions via parentheticals", () => {
    // name "Greenford" must not match the "(Greenford)" locator inside another label.
    expect(fuzzyMatchNodes(n("Greenford"), n("Revival Mission (Greenford)")).matched).toBe(false);
    // generic descriptor parens never collide.
    expect(fuzzyMatchNodes(n("Bannister (Servant)"), n("Green (the servant)")).matched).toBe(false);
    expect(fuzzyMatchNodes(n("Small hammer (murder weapon)"), n("Lift shaft (murder weapon)")).matched).toBe(false);
  });

  it("excludes structural container types from the fuzzy tier", () => {
    const nodes = [
      n("Part I, Chapter I", "ChapterOrStory"),
      n("Part I, Chapter I: The Long Subtitle", "ChapterOrStory"),
      n("The Adventures of Sherlock Holmes", "Work"),
      n("The Memoirs of Sherlock Holmes", "Work"),
    ];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    expect(queue.candidates.filter((c) => c.tier === "fuzzy")).toHaveLength(0);
    // But a custom empty exclude-set re-enables fuzzy on those types.
    const queue2 = generateOntologyReconciliationCandidates(ctx(nodes), {
      generatedAt: "t",
      fuzzyExcludeTypes: [],
    });
    expect(queue2.candidates.some((c) => c.tier === "fuzzy")).toBe(true);
  });
});

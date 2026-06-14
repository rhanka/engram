import { describe, expect, it } from "vitest";

import {
  differentEntityReason,
  fuzzyMatchNodes,
  generateOntologyReconciliationCandidates,
  type OntologyReconciliationCandidate,
} from "../src/ontology-reconciliation.js";
import { deriveLabelTerms } from "../src/assembly-hygiene.js";
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

// ---------------------------------------------------------------------------
// Precision guards (broad-ranked posture): reject the measured false-positive
// CLASSES from the mystery pack while keeping the genuine qualifier-variants.
// Each guard is exercised both as a pure `differentEntityReason` predicate and
// end-to-end through the generator (so it covers BOTH the alias-fed exact tier
// and the fuzzy tier).
// ---------------------------------------------------------------------------

/** A node carrying explicit normalized_terms (simulating post-hygiene state, so
 * the EXACT tier fires on a shared generic term such as "narrator"). */
function withTerms(label: string, terms: string[], type = "Character"): OntologyPatchNode {
  return { ...n(label, type), normalized_terms: terms.map((t) => t.toLowerCase()) };
}

describe("reconciliation precision guards — reject confidently-different entities", () => {
  // (1) Role-noun / common-noun explosion (the worst class; exact tier).
  it("rejects the Narrator role-noun explosion (shared generic term only)", () => {
    // Both nodes carry "narrator" as a normalized term → exact tier would pair
    // them; the guard rejects because the ONLY shared name token is generic.
    const a = withTerms("Narrator (Watson)", ["narrator", "watson"]);
    const b = withTerms("Narrator (Bunny Manders)", ["narrator", "bunny manders"]);
    expect(differentEntityReason(a, b)).not.toBeNull();
    const queue = generateOntologyReconciliationCandidates(ctx([a, b]), { generatedAt: "t" });
    expect(pairsLabels(queue.candidates, [a, b], a.label!, b.label!)).toBe(false);
  });

  it.each([
    ["Inspector Robinson (Highgate)", "Mrs. Robinson (housekeeper)"], // surname + disjoint disambiguators
    ["Revolver (left in bedroom by Smart)", "Revolver (Royce's, fired into carpet)"], // generic object noun
  ])("rejects role/common-noun collision: %s ↔ %s", (a, b) => {
    expect(differentEntityReason(n(a), n(b))).not.toBeNull();
  });

  // (2) Opposite-gender / relational title pairs.
  it.each([
    ["Lord Galloway", "Lady Galloway"],
    ["Mr. Warren", "Mrs. Warren"],
    ["Count de Dreux-Soubise", "Countess de Dreux-Soubise"],
    ["Mrs. Smith", "Mr. Smith (beekeeper)"],
    ["Lady Mounteagle", "Lord Mounteagle"],
  ])("rejects opposite-gender title pair: %s ↔ %s", (a, b) => {
    expect(differentEntityReason(n(a), n(b))).not.toBeNull();
  });

  it.each([
    ["Eduardo Lucas (Henri Fournaye)", "Mme. Henri Fournaye (Lucas's wife)"],
    ["Madame Grunov", "Mr. Grunov (Madame Grunov's husband)"],
    ["Captain James Musgrave", "Sir James Musgrave (ancestor, portrait)"],
    ["Lady Hilda Trelawney Hope", "Trelawney Hope (European Secretary)"],
  ])("rejects relational (spouse/relative) pair: %s ↔ %s", (a, b) => {
    expect(differentEntityReason(n(a), n(b))).not.toBeNull();
  });

  // (3) Containment with a NEW head-noun → different (contained/adjacent) place.
  it.each([
    ["Westminster Abbey", "New flats near Westminster Abbey"],
    ["Camden Town", "Camden Town confectioner's shop"],
    ["Scotland Yard", "Black Museum, Scotland Yard"],
    ["Grimpen Mire", "Tin Mine Island in Grimpen Mire"],
    ["Bloomsbury Square", "Queen Square, Bloomsbury"],
  ])("rejects containment-adds-new-head-noun place: %s ↔ %s", (a, b) => {
    expect(differentEntityReason(n(a, "Location"), n(b, "Location"))).not.toBeNull();
  });

  // (4) Address / numeric divergence.
  it("rejects address-number divergence: 5A ↔ 6A King's Bench Walk", () => {
    expect(
      differentEntityReason(n("5A King's Bench Walk, Temple", "Location"), n("6A King's Bench Walk, Inner Temple", "Location")),
    ).not.toBeNull();
  });

  // MUST-KEEP genuine pairs — the precision FLOOR. A trailing parenthetical
  // disambiguator on a person/thing name means SAME entity.
  const mustKeep: Array<[string, string, string]> = [
    ["Character", "Hugo Oberstein", "Hugo Oberstein (spy)"],
    ["Location", "Devonshire (Exmoor estate)", "Exmoor estate"],
    ["Object", "The Black Pearl", "Black Pearl of the Borgias"],
    ["Character", "The Duke of Exmoor (actually Isaac Green)", "Isaac Green (lawyer / actual identity of the 'Duke')"],
    ["Character", "Marquis of Marne (James Mair / Maurice Mair)", "Maurice Mair (the false Marquis, the impersonator)"],
    ["Character", "Inspector Lestrade", "Lestrade (mentioned)"],
    ["Object", "Western Sun (American newspaper)", "Western Sun (American daily)"],
    ["Character", "Reuben Hornby", "Reuben Hornby (Vanishing Man)"],
    ["Character", "Germaine Gournay-Martin", "M. Gournay-Martin"],
    ["Event", "Murder of Michael Moonshine / John Bankes kills Moonshine", "Moonshine Murder"],
    ["Location", "Devonshire", "Devonshire (Exmoor estate)"],
    ["Location", "British Museum", "British Museum (Egyptian Antiquities)"],
  ];

  it.each(mustKeep)("keeps genuine pair (%s): %s ↔ %s — guard returns null", (type, a, b) => {
    expect(differentEntityReason(n(a, type), n(b, type))).toBeNull();
  });

  // Build a node whose aliases/normalized_terms are derived exactly as the
  // assembly hygiene stage does in production, so the generator exercises the
  // real exact + fuzzy tiers (some genuine pairs only share a DERIVED term).
  function hygieneNode(label: string, type: string): OntologyPatchNode {
    const { aliases, normalizedTerms } = deriveLabelTerms(label);
    return { ...n(label, type), aliases, normalized_terms: normalizedTerms };
  }

  it.each(mustKeep)("surfaces genuine pair through the generator (%s): %s ↔ %s", (type, a, b) => {
    const nodes = [hygieneNode(a, type), hygieneNode(b, type)];
    const queue = generateOntologyReconciliationCandidates(ctx(nodes), { generatedAt: "t" });
    expect(pairsLabels(queue.candidates, nodes, a, b)).toBe(true);
  });

  it("a one-sided non-gendered title (Inspector/Dr.) is NOT a relative — kept", () => {
    expect(differentEntityReason(n("Inspector Lestrade"), n("Lestrade (mentioned)"))).toBeNull();
    expect(differentEntityReason(n("Dr. Simon"), n("Simon (Dr Hirsch's old servant)"))).toBeNull();
  });
});

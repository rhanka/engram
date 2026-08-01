import { describe, expect, it } from "vitest";

import { generateOntologyReconciliationCandidates } from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode, OntologyPatchRelation } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const profile = { profile_hash: "trust-tier-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-08-01T00:00:00.000Z";

function context(nodes: OntologyPatchNode[], relations: OntologyPatchRelation[] = []): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "trust-tier-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations,
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string, overrides: Partial<OntologyPatchNode> = {}): OntologyPatchNode {
  return { id, label, type: "Character", ...overrides };
}

function queueOf(nodes: OntologyPatchNode[], relations: OntologyPatchRelation[] = [], structural = false) {
  return generateOntologyReconciliationCandidates(context(nodes, relations), {
    generatedAt,
    ...(structural ? { structural: true } : {}),
  });
}

/**
 * Two same-type nodes sharing six informative neighbours, seen in DIFFERENT
 * sources and with no direct relation between them — the shape the structural
 * tier is built to propose.
 */
function structuralTwins(leftOverrides: Partial<OntologyPatchNode>, rightOverrides: Partial<OntologyPatchNode>) {
  const shared = Array.from({ length: 6 }, (_, index) => node(`s${index}`, `Shared ${index}`));
  const nodes = [
    // Deliberately share NO token: the structural tier's whole point is to pair
    // entities whose strings do not look alike, and a shared generic noun would
    // trip the lexical veto (S3) before the tier could propose anything.
    node("a", "Alpha Vance", { source_refs: ["doc/a.txt"], ...leftOverrides }),
    node("b", "Beta Quill", { source_refs: ["doc/b.txt"], ...rightOverrides }),
    ...shared,
  ];
  const relations: OntologyPatchRelation[] = shared.flatMap(({ id }) => [
    { id: `a->${id}:mentions`, type: "mentions", source_id: "a", target_id: id },
    { id: `b->${id}:mentions`, type: "mentions", source_id: "b", target_id: id },
  ]);
  return { nodes, relations };
}

describe("inter-tier rejection — an assertion never merges with what the corpus earned", () => {
  it("rejects an EXACT-label pair whose members are of different tiers", () => {
    const withoutTiers = queueOf([
      node("earned", "Irene Adler"),
      node("asserted", "Irene Adler"),
    ]);
    // Control: without tiers this is the strongest possible candidate.
    expect(withoutTiers.candidates.filter((c) => c.tier === "exact")).toHaveLength(1);

    const withTiers = queueOf([
      node("earned", "Irene Adler", { trust: "earned" }),
      node("asserted", "Irene Adler", { trust: "asserted" }),
    ]);
    expect(withTiers.candidates).toHaveLength(0);
  });

  it("rejects a FUZZY pair whose members are of different tiers", () => {
    const withoutTiers = queueOf([
      node("earned", "Hugo Oberstein"),
      node("asserted", "Hugo Oberstein (spy)"),
    ]);
    expect(withoutTiers.candidates.filter((c) => c.tier === "fuzzy")).toHaveLength(1);

    const withTiers = queueOf([
      node("earned", "Hugo Oberstein", { trust: "earned" }),
      node("asserted", "Hugo Oberstein (spy)", { trust: "asserted" }),
    ]);
    expect(withTiers.candidates).toHaveLength(0);
  });

  it("rejects a STRUCTURAL pair whose members are of different tiers", () => {
    const untagged = structuralTwins({}, {});
    const control = queueOf(untagged.nodes, untagged.relations, true);
    // Control: the structural tier really does propose this pair.
    expect(control.candidates.filter((c) => c.tier === "structural").length).toBeGreaterThan(0);

    const tagged = structuralTwins({ trust: "earned" }, { trust: "asserted" });
    const guarded = queueOf(tagged.nodes, tagged.relations, true);
    expect(guarded.candidates.filter((c) => c.tier === "structural")).toHaveLength(0);
  });

  it("does NOT reject a pair whose members share the same tier", () => {
    const bothEarned = queueOf([
      node("l", "Irene Adler", { trust: "earned" }),
      node("r", "Irene Adler", { trust: "earned" }),
    ]);
    expect(bothEarned.candidates).toHaveLength(1);

    const bothAsserted = queueOf([
      node("l", "Irene Adler", { trust: "asserted" }),
      node("r", "Irene Adler", { trust: "asserted" }),
    ]);
    expect(bothAsserted.candidates).toHaveLength(1);
  });

  it("treats an ABSENT tier as unknown, not as a violation — the documented limit", () => {
    // This pins a deliberate choice so it cannot drift silently: while one side
    // carries no tier, the pair is NOT rejected. The invariant therefore only
    // bites once BOTH sides declare one. Untagged is not a synonym for earned.
    const oneSideUntagged = queueOf([
      node("untagged", "Irene Adler"),
      node("asserted", "Irene Adler", { trust: "asserted" }),
    ]);
    expect(oneSideUntagged.candidates).toHaveLength(1);

    const neitherTagged = queueOf([
      node("l", "Irene Adler"),
      node("r", "Irene Adler"),
    ]);
    expect(neitherTagged.candidates).toHaveLength(1);
  });
});

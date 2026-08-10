import { describe, expect, it } from "vitest";

import { generateOntologyReconciliationCandidates } from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

/**
 * Pins `trust_tier_gate`, the disclosure of what the inter-tier guard retracted.
 *
 * The guard removes pairs the enumeration had already produced, so an
 * undeclared narrowing leaves a queue that is missing candidates
 * indistinguishable from a clean corpus — the motive behind the veto that put
 * the bucket cap under a stamp in the first place.
 *
 * The cases below exist because a single `pairs_rejected` cannot survive its
 * own zero: it covers both "no pair ever had two tiers" (the guard had no
 * domain) and "pairs had two tiers and agreed" (a fact about the corpus). Each
 * gets its own test, because they call for opposite follow-ups.
 *
 * Anchored on imported symbols, never on line numbers.
 */

const profile = { profile_hash: "trust-gate-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-08-01T00:00:00.000Z";

function context(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "trust-gate-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string, overrides: Partial<OntologyPatchNode> = {}): OntologyPatchNode {
  return { id, label, type: "Character", ...overrides };
}

function gateOf(nodes: OntologyPatchNode[]) {
  const queue = generateOntologyReconciliationCandidates(context(nodes), { generatedAt });
  return queue.trust_tier_gate;
}

describe("trust_tier_gate disclosure", () => {
  it("is emitted even when NOTHING carries a tier", () => {
    // The load-bearing case, and today's real one: no producer stamps a tier,
    // so a conditional block would never be written and a reader could not tell
    // "guard ran, retracted nothing" from "guard did not run".
    const gate = gateOf([node("a", "Irene Adler"), node("b", "Irene Adler")]);

    // NON-VACUITY: without this the pair might never have reached the guard and
    // every count below would be zero for the wrong reason.
    expect(gate.pairs_evaluated).toBeGreaterThan(0);
    expect(gate).toMatchObject({ pairs_both_tagged: 0, pairs_one_side_tagged: 0, pairs_rejected: 0 });
  });

  it("counts a rejection when both sides declare DIFFERENT tiers", () => {
    const gate = gateOf([
      node("a", "Irene Adler", { trust: "earned" }),
      node("b", "Irene Adler", { trust: "asserted" }),
    ]);

    expect(gate).toMatchObject({ pairs_both_tagged: 1, pairs_one_side_tagged: 0, pairs_rejected: 1 });
  });

  it("separates AGREEMENT from an empty domain — both zero on rejections", () => {
    // Same tier on both sides: the guard had a domain and retracted nothing.
    // Indistinguishable from the first case on `pairs_rejected` alone, which is
    // exactly why the domain is published beside the outcome.
    const gate = gateOf([
      node("a", "Irene Adler", { trust: "asserted" }),
      node("b", "Irene Adler", { trust: "asserted" }),
    ]);

    expect(gate).toMatchObject({ pairs_both_tagged: 1, pairs_rejected: 0 });
  });

  it("counts the FAIL-OPEN population when a single side is tagged", () => {
    // The pair passes only because a tier is missing. Published because that is
    // the impact figure the untagged-tier decision says it is waiting for.
    const gate = gateOf([node("a", "Irene Adler", { trust: "earned" }), node("b", "Irene Adler")]);

    expect(gate).toMatchObject({ pairs_both_tagged: 0, pairs_one_side_tagged: 1, pairs_rejected: 0 });
  });

  it("states its criterion, including WHICH pairs it counts", () => {
    const gate = gateOf([node("a", "Irene Adler"), node("b", "Irene Adler")]);

    // `pairs_evaluated` is post-type/partition, not the blocking-index total; a
    // reader comparing it to the wrong denominator would misread the ratio.
    expect(gate.criterion).toContain("after the type and partition guards");
    expect(gate.criterion).toContain("BOTH");
  });
});

import { describe, expect, it } from "vitest";

import { generateOntologyReconciliationCandidates } from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

/**
 * Pins `precision_guard`, the disclosure of what the precision guards retracted
 * from the EXACT tier.
 *
 * That guard removes pairs sharing a normalized term — pairs the exact tier
 * would otherwise have emitted — so it narrows the queue and declares itself
 * like the bucket cap and the tier exclusion beside it.
 *
 * The SCOPE is the point of several of these cases. The count covers the exact
 * tier only, because there the guard fires after `sharedTerms.length > 0` and
 * blocking is lossless on shared terms, so the figure means the same under
 * either enumeration. The fuzzy tier applies the same guard BEFORE matching, so
 * its count would rise with the number of pairs offered. A partial count that
 * said so is a fact; one that did not would be the defect.
 *
 * Anchored on imported symbols, never on line numbers.
 */

const profile = { profile_hash: "precision-guard-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-08-01T00:00:00.000Z";

function context(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "precision-guard-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

/** Shares a normalized term with its twin, so the EXACT tier reaches the guard. */
function withTerms(id: string, label: string, terms: string[]): OntologyPatchNode {
  return { id, label, type: "Character", normalized_terms: terms };
}

function guardOf(nodes: OntologyPatchNode[]) {
  return generateOntologyReconciliationCandidates(context(nodes), { generatedAt }).precision_guard;
}

describe("precision_guard disclosure", () => {
  it("counts a pair the exact tier would have emitted and the guard took back", () => {
    // The role-noun explosion: both carry "narrator", so the exact tier pairs
    // them, and the guard retracts because the only shared token is generic.
    const guard = guardOf([
      withTerms("a", "Narrator (Watson)", ["narrator", "watson"]),
      withTerms("b", "Narrator (Bunny Manders)", ["narrator", "bunny manders"]),
    ]);

    expect(guard.exact_pairs_retracted).toBe(1);
  });

  it("is emitted even when the guard retracts NOTHING", () => {
    // The zero case: two nodes that share nothing never reach the guard, and an
    // omitted block would read as "no guard" rather than "guard took nothing".
    const guard = guardOf([
      withTerms("a", "Irene Adler", ["irene adler"]),
      withTerms("b", "Mycroft Holmes", ["mycroft holmes"]),
    ]);

    expect(guard.exact_pairs_retracted).toBe(0);
    expect(guard.criterion.length).toBeGreaterThan(0);
  });

  it("carries a denominator, because a lone count does not survive its own zero", () => {
    // The two zeros a single figure cannot tell apart. Both report
    // `exact_pairs_retracted: 0`; they are opposite facts about the corpus, and
    // only the denominator separates them.
    const nothingOffered = guardOf([
      withTerms("a", "Irene Adler", ["irene adler"]),
      withTerms("b", "Mycroft Holmes", ["mycroft holmes"]),
    ]);
    const offeredAndKept = guardOf([
      withTerms("a", "Irene Adler", ["irene adler"]),
      withTerms("b", "Irene Adler", ["irene adler"]),
    ]);

    expect(nothingOffered.exact_pairs_retracted).toBe(0);
    expect(offeredAndKept.exact_pairs_retracted).toBe(0);

    // Nothing shared a term: the guard was never asked to judge anything.
    expect(nothingOffered.exact_pairs_offered).toBe(0);
    // A pair reached the guard and it let the pair through.
    expect(offeredAndKept.exact_pairs_offered).toBe(1);
  });

  it("is emitted unconditionally: the denominator is present at zero too", () => {
    // A disclosure that vanished at zero would move the ambiguity rather than
    // lift it — absence must keep meaning "this artefact predates the block".
    const guard = guardOf([withTerms("a", "Irene Adler", ["irene adler"])]);

    expect(guard.exact_pairs_offered).toBe(0);
    expect(guard.exact_pairs_retracted).toBe(0);
    expect(Object.keys(guard)).toContain("exact_pairs_offered");
  });

  it("counts what THIS guard saw, downstream of the guards that run before it", () => {
    // The failure mode a denominator invites: counting every exact pair in the
    // corpus instead of the ones actually offered here. It would err in the
    // REASSURING direction — the same retraction over a larger base reads as a
    // smaller loss — and a wrong denominator looks like a measurement, which is
    // worse than none.
    //
    // These two share a term AND would be retracted by the precision guard, but
    // the §3.4 inter-tier rejection fires first and they never reach it. A
    // denominator counted upstream would report 1 offered; counted where the
    // guard stands, it reports 0.
    const guard = guardOf([
      { ...withTerms("a", "Narrator (Watson)", ["narrator", "watson"]), trust: "earned" },
      { ...withTerms("b", "Narrator (Bunny Manders)", ["narrator", "bunny manders"]), trust: "asserted" },
    ]);

    expect(guard.exact_pairs_offered).toBe(0);
    expect(guard.exact_pairs_retracted).toBe(0);
  });

  it("lets the reader recover what the exact tier emitted, and stores it nowhere", () => {
    // `offered - retracted` is what survived the guard. Storing that third
    // number would let it drift out of step with the two it derives from.
    const nodes = [
      withTerms("a", "Narrator (Watson)", ["narrator", "watson"]),
      withTerms("b", "Narrator (Bunny Manders)", ["narrator", "bunny manders"]),
      withTerms("c", "Irene Adler", ["irene adler"]),
      withTerms("d", "Irene Adler", ["irene adler"]),
    ];
    const queue = generateOntologyReconciliationCandidates(context(nodes), { generatedAt });
    const guard = queue.precision_guard;

    expect(guard.exact_pairs_offered).toBe(2);
    expect(guard.exact_pairs_retracted).toBe(1);
    expect(queue.candidates.filter((candidate) => candidate.tier === "exact").length).toBe(
      guard.exact_pairs_offered - guard.exact_pairs_retracted,
    );
    expect(Object.keys(guard)).not.toContain("exact_pairs_emitted");
  });

  it("does not count a pair it let through", () => {
    // NON-VACUITY of the count itself: a counter that incremented on every
    // shared term would report 1 here, where the pair is legitimately emitted.
    const nodes = [
      withTerms("a", "Irene Adler", ["irene adler"]),
      withTerms("b", "Irene Adler", ["irene adler"]),
    ];
    const queue = generateOntologyReconciliationCandidates(context(nodes), { generatedAt });

    expect(queue.candidates.length).toBeGreaterThan(0);
    expect(queue.precision_guard.exact_pairs_retracted).toBe(0);
  });

  it("declares that the fuzzy tier is OUT of the count, and why", () => {
    // A partial figure read as total would understate the narrowing. The limit
    // is published rather than left for a reader to infer from silence.
    const guard = guardOf([withTerms("a", "Irene Adler", ["irene adler"])]);

    expect(guard.criterion).toContain("fuzzy-tier retractions are NOT counted");
    expect(guard.scope).toContain("exact tier only");
    expect(guard.scope).toContain("BEFORE matching");
  });
});

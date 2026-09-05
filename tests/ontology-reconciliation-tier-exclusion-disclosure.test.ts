import { describe, expect, it } from "vitest";

import {
  DEFAULT_FUZZY_EXCLUDE_TYPES,
  generateOntologyReconciliationCandidates,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

/**
 * Pins `tier_exclusion`, the disclosure of which node types are barred from the
 * fuzzy and structural tiers.
 *
 * This narrowing is ON BY DEFAULT, so it shapes every corpus — unlike the
 * opt-in bucket cap that already declares itself. The queue used to publish its
 * opt-in loss and stay silent about its default one, which is the asymmetry
 * these tests close.
 *
 * The counts are over NODES on purpose: the node population does not depend on
 * how pairs are enumerated, so the figure means the same under the blocking
 * index and under a cross product. A pair count would differ between them and
 * would turn the losslessness golden into an assertion that blocking does
 * nothing.
 *
 * Anchored on imported symbols, never on line numbers.
 */

const profile = { profile_hash: "tier-exclusion-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-08-01T00:00:00.000Z";

function context(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "tier-exclusion-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string, type: string): OntologyPatchNode {
  return { id, label, type };
}

function exclusionOf(nodes: OntologyPatchNode[], fuzzyExcludeTypes?: readonly string[]) {
  return generateOntologyReconciliationCandidates(context(nodes), {
    generatedAt,
    ...(fuzzyExcludeTypes ? { fuzzyExcludeTypes } : {}),
  }).tier_exclusion;
}

describe("tier_exclusion disclosure", () => {
  it("counts the nodes the default exclusion denies the weaker tiers", () => {
    const excluded = exclusionOf([
      node("w1", "Volume One", "Work"),
      node("w2", "Volume Two", "Work"),
      node("s1", "A Scene", "Scene"),
      node("c1", "Irene Adler", "Character"),
    ]);

    // NON-VACUITY: `nodes_total` also guards the fixture — an empty context
    // would satisfy an excluded-count assertion while covering nothing.
    expect(excluded).toMatchObject({ nodes_excluded: 3, nodes_total: 4 });
  });

  it("publishes the list ACTUALLY in force, not the default constant", () => {
    // An override has to be visible: a reader who saw only the default would
    // mis-attribute the narrowing to a list that is not the one applied.
    const excluded = exclusionOf(
      [node("t1", "A Tome", "Tome"), node("c1", "Irene Adler", "Character")],
      ["Tome"],
    );

    expect(excluded.excluded_types).toEqual(["Tome"]);
    expect(excluded.nodes_excluded).toBe(1);
  });

  it("carries the default list when no override is given", () => {
    const excluded = exclusionOf([node("c1", "Irene Adler", "Character")]);

    expect(excluded.excluded_types).toEqual([...DEFAULT_FUZZY_EXCLUDE_TYPES].sort());
  });

  it("is emitted even when the exclusion touches NOTHING", () => {
    // The zero case, and the reason the block is unconditional: omitted, it
    // would read as "no exclusion configured" rather than "configured, matched
    // nothing here".
    const excluded = exclusionOf([node("c1", "Irene Adler", "Character")]);

    expect(excluded.nodes_excluded).toBe(0);
    expect(excluded.nodes_total).toBe(1);
    expect(excluded.excluded_types.length).toBeGreaterThan(0);
  });

  it("states the mitigation, not only the loss", () => {
    // "Excluded" alone would overstate into "invisible to reconciliation".
    // These types keep the exact tier, and the criterion has to say so.
    const excluded = exclusionOf([node("c1", "Irene Adler", "Character")]);

    expect(excluded.criterion).toContain("FUZZY and STRUCTURAL");
    expect(excluded.criterion).toContain("exact tier still runs");
  });
});

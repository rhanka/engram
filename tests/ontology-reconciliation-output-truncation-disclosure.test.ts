import { describe, expect, it } from "vitest";

import {
  DEFAULT_RECONCILIATION_CANDIDATE_CAP,
  generateOntologyReconciliationCandidates,
} from "../src/ontology-reconciliation.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

/**
 * Pins `output_truncation`, the disclosure of what the final cap threw away.
 *
 * This is the last narrowing of the pipeline and the widest: everything
 * upstream trims pairs unlikely to matter, while this one discards ranked
 * candidates purely because a fixed number of them fit. `candidate_count`
 * reports what SURVIVED, so without this block a full queue and a truncated one
 * read alike — the indistinguishability that put every other narrowing on this
 * path under a stamp.
 *
 * Anchored on imported symbols, never on line numbers.
 */

const profile = { profile_hash: "output-truncation-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-08-01T00:00:00.000Z";

function context(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "output-truncation-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

/** N disjoint twin pairs, each sharing a label, so each yields one candidate. */
function twinPairs(count: number): OntologyPatchNode[] {
  return Array.from({ length: count }, (_, index) => [
    { id: `l${index}`, label: `Twin Label ${index}`, type: "Character" },
    { id: `r${index}`, label: `Twin Label ${index}`, type: "Character" },
  ]).flat();
}

function queueOf(nodes: OntologyPatchNode[], cap?: number) {
  return generateOntologyReconciliationCandidates(context(nodes), {
    generatedAt,
    ...(cap === undefined ? {} : { cap }),
  });
}

describe("output_truncation disclosure", () => {
  it("counts what ranking placed below the cut", () => {
    const queue = queueOf(twinPairs(5), 2);

    // NON-VACUITY: the fixture has to actually produce more than the cap, or
    // a dropped-count assertion would hold over nothing.
    expect(queue.candidate_count).toBe(2);
    expect(queue.output_truncation).toMatchObject({ cap: 2, dropped: 3 });
  });

  it("lets the reader recover the pre-cap total, and stores it nowhere", () => {
    // `candidate_count + dropped` is the population the tiers produced. A third
    // stored number could drift from the two beside it.
    const queue = queueOf(twinPairs(5), 2);

    expect(queue.candidate_count + queue.output_truncation.dropped).toBe(5);
    expect(queue.output_truncation).not.toHaveProperty("produced");
  });

  it("is emitted when the cap dropped NOTHING", () => {
    // The zero case. Omitted, it would read as "no cap configured" rather than
    // "cap configured, nothing exceeded it" — and the cap is on by default.
    const queue = queueOf(twinPairs(2), 10);

    expect(queue.output_truncation).toMatchObject({ cap: 10, dropped: 0 });
  });

  it("carries the cap actually in force, defaulting to the shipped one", () => {
    const queue = queueOf(twinPairs(2));

    expect(queue.output_truncation.cap).toBe(DEFAULT_RECONCILIATION_CANDIDATE_CAP);
  });

  it("reports a null cap when nothing was capped, which is not a cap of zero", () => {
    const queue = queueOf(twinPairs(3), Number.POSITIVE_INFINITY);

    expect(queue.output_truncation.cap).toBeNull();
    expect(queue.output_truncation.dropped).toBe(0);
    expect(queue.candidate_count).toBe(3);
  });

  it("states what the two numbers mean", () => {
    const queue = queueOf(twinPairs(1));

    expect(queue.output_truncation.criterion).toContain("ranked by score");
    expect(queue.output_truncation.criterion).toContain("survived");
  });
});

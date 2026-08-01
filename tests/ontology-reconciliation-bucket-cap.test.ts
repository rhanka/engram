import { describe, expect, it } from "vitest";

import {
  DEFAULT_FUZZY_BUCKET_MAX,
  buildOntologyReconciliationLexicalBlockingIndex,
  generateOntologyReconciliationCandidates,
} from "../src/ontology-reconciliation.js";
import * as publicApi from "../src/index.js";
import type { OntologyPatchContext, OntologyPatchNode } from "../src/ontology-patch.js";
import type { NormalizedOntologyProfile } from "../src/types.js";

const profile = { profile_hash: "bucket-cap-profile" } as unknown as NormalizedOntologyProfile;
const generatedAt = "2026-07-31T00:00:00.000Z";
const fuzzyCapNote =
  "This queue is incomplete because oversized fuzzy blocking buckets were skipped; rerun without fuzzyBucketMax for a lossless pass.";

function context(nodes: OntologyPatchNode[]): OntologyPatchContext {
  return {
    rootDir: "/repo",
    stateDir: "/repo/.graphify",
    graphHash: "bucket-cap-graph",
    profile,
    profileState: {} as never,
    nodes,
    relations: [],
    evidenceRefs: new Set(),
  };
}

function node(id: string, label: string): OntologyPatchNode {
  return { id, label, type: "Character" };
}

function alphabeticSuffix(index: number): string {
  let value = index;
  let suffix = "";
  do {
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return suffix;
}

/**
 * Every label shares the alpha/beta/delta pairs but varies a non-numeric tail.
 * Each pair has token Jaccard 3/5 = 0.6, so the uncapped fuzzy pass emits it.
 */
function frequentFuzzyNodes(count: number): OntologyPatchNode[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = alphabeticSuffix(index);
    return node(`fuzzy-${suffix}`, `Alpha Beta Delta ZetaKestrel${suffix}`);
  });
}

function expectNoCapStamp(queue: ReturnType<typeof generateOntologyReconciliationCandidates>): void {
  expect(queue.fuzzy_blocking_cap).toBeUndefined();
  expect(Object.hasOwn(queue, "fuzzy_blocking_cap")).toBe(false);
}

describe("ontology reconciliation fuzzy bucket cap", () => {
  it("defaults to lossless fuzzy blocking and leaves the cap declaration absent", () => {
    const value = context(frequentFuzzyNodes(3));
    const queue = generateOntologyReconciliationCandidates(value, { generatedAt });
    const index = buildOntologyReconciliationLexicalBlockingIndex(value);

    expect(queue.candidates).toHaveLength(3);
    expectNoCapStamp(queue);
    expect(index.fuzzyBucketMax).toBeUndefined();
    expect(index.fuzzyBucketCap).toBeUndefined();
  });

  it("exports 50 as an opt-in recommendation rather than a default", () => {
    const value = context(frequentFuzzyNodes(DEFAULT_FUZZY_BUCKET_MAX + 1));
    const defaultQueue = generateOntologyReconciliationCandidates(value, { generatedAt });
    const recommendedQueue = generateOntologyReconciliationCandidates(value, {
      generatedAt,
      fuzzyBucketMax: DEFAULT_FUZZY_BUCKET_MAX,
    });

    expect(DEFAULT_FUZZY_BUCKET_MAX).toBe(50);
    expect(publicApi.DEFAULT_FUZZY_BUCKET_MAX).toBe(DEFAULT_FUZZY_BUCKET_MAX);
    expect(defaultQueue.candidates).not.toHaveLength(0);
    expectNoCapStamp(defaultQueue);
    expect(recommendedQueue.candidates).toHaveLength(0);
    expect(recommendedQueue.fuzzy_blocking_cap?.threshold).toBe(DEFAULT_FUZZY_BUCKET_MAX);
  });

  it("declares the fuzzy threshold when the cap skips a block", () => {
    const queue = generateOntologyReconciliationCandidates(context(frequentFuzzyNodes(3)), {
      generatedAt,
      fuzzyBucketMax: 2,
    });

    expect(queue.fuzzy_blocking_cap).toEqual({
      applied: true,
      scope: "fuzzy_blocking",
      threshold: 2,
      skipped_key_count: 3,
      largest_skipped_block_size: 3,
      note: fuzzyCapNote,
    });
  });

  it("does not declare a cap when no fuzzy block exceeds the threshold", () => {
    const queue = generateOntologyReconciliationCandidates(context(frequentFuzzyNodes(3)), {
      generatedAt,
      fuzzyBucketMax: 3,
    });

    expect(queue.candidates).toHaveLength(3);
    expectNoCapStamp(queue);
  });

  it("declares real candidate loss only on the capped pass", () => {
    const value = context(frequentFuzzyNodes(4));
    const uncapped = generateOntologyReconciliationCandidates(value, { generatedAt });
    const capped = generateOntologyReconciliationCandidates(value, { generatedAt, fuzzyBucketMax: 3 });

    expect(uncapped.candidates.length).toBeGreaterThan(0);
    expect(capped.candidates.length).toBeLessThan(uncapped.candidates.length);
    expectNoCapStamp(uncapped);
    expect(capped.fuzzy_blocking_cap).toMatchObject({
      applied: true,
      scope: "fuzzy_blocking",
      threshold: 3,
    });
  });

  it("preserves exact candidates even with the tightest fuzzy cap", () => {
    const value = context([
      node("exact-a", "Alpha Beta Delta"),
      node("exact-b", "Alpha Beta Delta"),
    ]);
    const queue = generateOntologyReconciliationCandidates(value, { generatedAt, fuzzyBucketMax: 0 });

    expect(queue.candidates).toEqual([
      expect.objectContaining({
        tier: "exact",
        canonical_id: "exact-a",
        candidate_id: "exact-b",
      }),
    ]);
    expect(queue.fuzzy_blocking_cap?.threshold).toBe(0);
  });

  it("exposes cap diagnostics and deletes oversized fuzzy keys wholesale", () => {
    const value = context(frequentFuzzyNodes(3));
    const index = buildOntologyReconciliationLexicalBlockingIndex(value, { fuzzyBucketMax: 2 });
    const sharedPairKey = "Character\u0000alpha\u0000beta";

    expect(index.fuzzyBucketMax).toBe(2);
    expect(index.fuzzyBucketCap).toMatchObject({
      threshold: 2,
      skipped_key_count: 3,
      largest_skipped_block_size: 3,
    });
    expect(index.fuzzy.has(sharedPairKey)).toBe(false);
    expect(index.fuzzy.get(sharedPairKey)).toBeUndefined();
    expect([...index.fuzzy.values()].every((members) => members.length <= 2)).toBe(true);
  });

  it("caps the narrow fuzzy side indexes as well", () => {
    const value = context([
      node("echo-a", "Echo Echo (Amber)"),
      node("echo-b", "Echo Echo (Beryl)"),
      node("echo-c", "Echo Echo (Cedar)"),
    ]);
    const index = buildOntologyReconciliationLexicalBlockingIndex(value, { fuzzyBucketMax: 2 });
    const echoKey = "Character\u0000echo";

    expect(index.fuzzySingles).toBeDefined();
    expect(index.fuzzyDegenerate).toBeDefined();
    expect(index.fuzzySingles!.has(echoKey)).toBe(false);
    expect(index.fuzzyDegenerate!.has(echoKey)).toBe(false);
    expect(index.fuzzyBucketCap?.skipped_key_count).toBeGreaterThanOrEqual(3);
  });
});

import { describe, expect, it } from "vitest";
import { buildPatchFromCandidate } from "../lib/reconciliation.js";

const cand = {
  id: "reconcile:abc",
  candidate_id: "character_king_of_bohemia",
  canonical_id: "character_king_bohemia",
  score: 0.95,
  evidence_refs: ["corpus/x/text.txt#A Scandal in Bohemia"],
};

describe("buildPatchFromCandidate (SVELTE-7)", () => {
  it("builds an accept_match patch with target + evidence + hashes", () => {
    const p = buildPatchFromCandidate(cand, "accept", { graphHash: "gh", profileHash: "ph", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(p.schema).toBe("graphify_ontology_patch_v1");
    expect(p.operation).toBe("accept_match");
    expect(p.target).toEqual({ candidate_id: "character_king_of_bohemia", canonical_id: "character_king_bohemia" });
    expect(p.evidence_refs.length).toBe(1);
    expect(p.graph_hash).toBe("gh");
    expect(p.profile_hash).toBe("ph");
    expect(p.created_at).toBe("2026-01-01T00:00:00.000Z");
  });
  it("builds a reject_match patch", () => {
    const p = buildPatchFromCandidate(cand, "reject", {});
    expect(p.operation).toBe("reject_match");
  });
  it("throws without candidate ids", () => {
    expect(() => buildPatchFromCandidate({}, "accept")).toThrow();
  });
});

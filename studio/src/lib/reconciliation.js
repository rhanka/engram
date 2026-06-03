/**
 * SVELTE-7: build an ontology patch payload from a reconciliation candidate.
 *
 * The studio server's POST /api/ontology/patch/{validate,dry-run,apply} expects
 * a `graphify_ontology_patch_v1` document. Accept = accept_match, reject =
 * reject_match. graph_hash/profile_hash come from the candidate queue response
 * so the server can detect drift.
 */
const PATCH_SCHEMA = "graphify_ontology_patch_v1";

/**
 * @param {object} candidate  one queue item ({ id, candidate_id, canonical_id, evidence_refs, ... })
 * @param {"accept"|"reject"} decision
 * @param {{ graphHash?: string, profileHash?: string, author?: string, createdAt?: string }} ctx
 * @returns {object} the patch document
 */
export function buildPatchFromCandidate(candidate, decision, ctx = {}) {
  if (!candidate || !candidate.candidate_id || !candidate.canonical_id) {
    throw new Error("candidate must have candidate_id and canonical_id");
  }
  const operation = decision === "reject" ? "reject_match" : "accept_match";
  return {
    schema: PATCH_SCHEMA,
    id: `patch-${candidate.id ?? candidate.candidate_id}-${operation}`,
    operation,
    status: "proposed",
    profile_hash: ctx.profileHash ?? "",
    graph_hash: ctx.graphHash ?? "",
    target: {
      candidate_id: candidate.candidate_id,
      canonical_id: candidate.canonical_id,
    },
    evidence_refs: Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs : [],
    reason:
      decision === "reject"
        ? `Rejected via studio reconciliation (${candidate.id ?? candidate.candidate_id}).`
        : `Accepted via studio reconciliation (${candidate.id ?? candidate.candidate_id}; score ${candidate.score ?? "?"}).`,
    author: ctx.author ?? "studio-reconciliation",
    created_at: ctx.createdAt ?? "1970-01-01T00:00:00.000Z",
  };
}

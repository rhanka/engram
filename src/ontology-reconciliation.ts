import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { OntologyPatchContext, OntologyPatchNode } from "./ontology-patch.js";

export const ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA = "graphify_ontology_reconciliation_candidates_v1" as const;

export type OntologyReconciliationCandidateKind = "entity_match";
export type OntologyReconciliationCandidateStatus = "candidate";

export interface OntologyReconciliationCandidate {
  id: string;
  kind: OntologyReconciliationCandidateKind;
  status: OntologyReconciliationCandidateStatus;
  score: number;
  candidate_id: string;
  canonical_id: string;
  shared_terms: string[];
  evidence_refs: string[];
  reasons: string[];
  proposed_patch_operation: "accept_match";
}

export interface OntologyReconciliationCandidateQueue {
  schema: typeof ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA;
  graph_hash: string;
  profile_hash: string;
  generated_at: string;
  candidate_count: number;
  candidates: OntologyReconciliationCandidate[];
}

export interface GenerateOntologyReconciliationCandidatesOptions {
  generatedAt?: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function nodeTerms(node: OntologyPatchNode): string[] {
  return uniqueSorted([
    ...(node.label ? [normalizeTerm(node.label)] : []),
    ...(node.aliases ?? []).map(normalizeTerm),
    ...(node.normalized_terms ?? []).map(normalizeTerm),
  ]);
}

function statusRank(status: string | undefined): number {
  switch (status) {
    case "validated":
      return 4;
    case "needs_review":
      return 3;
    case "candidate":
      return 2;
    case "rejected":
      return 1;
    default:
      return 0;
  }
}

function chooseCanonicalPair(a: OntologyPatchNode, b: OntologyPatchNode): {
  canonical: OntologyPatchNode;
  candidate: OntologyPatchNode;
} {
  const rankA = statusRank(a.status);
  const rankB = statusRank(b.status);
  if (rankA !== rankB) {
    return rankA > rankB ? { canonical: a, candidate: b } : { canonical: b, candidate: a };
  }
  return a.id.localeCompare(b.id) <= 0 ? { canonical: a, candidate: b } : { canonical: b, candidate: a };
}

function candidateScore(sharedTerms: string[], canonical: OntologyPatchNode, candidate: OntologyPatchNode): number {
  const canonicalLabel = canonical.label ? normalizeTerm(canonical.label) : null;
  const candidateLabel = candidate.label ? normalizeTerm(candidate.label) : null;
  const exactLabelMatch = canonicalLabel !== null && canonicalLabel === candidateLabel && sharedTerms.includes(canonicalLabel);
  const statusBoost = statusRank(canonical.status) > statusRank(candidate.status) ? 0.05 : 0;
  return Math.min(exactLabelMatch ? 0.95 + statusBoost : 0.8 + statusBoost, 1);
}

function candidateId(canonical: OntologyPatchNode, candidate: OntologyPatchNode, sharedTerms: string[]): string {
  return `reconcile:${sha256([
    "entity_match",
    canonical.id,
    candidate.id,
    ...sharedTerms,
  ].join("|")).slice(0, 24)}`;
}

export function generateOntologyReconciliationCandidates(
  context: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions = {},
): OntologyReconciliationCandidateQueue {
  const candidates: OntologyReconciliationCandidate[] = [];
  const comparableNodes = context.nodes
    .filter((node) => node.type && nodeTerms(node).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < comparableNodes.length; i += 1) {
    for (let j = i + 1; j < comparableNodes.length; j += 1) {
      const left = comparableNodes[i]!;
      const right = comparableNodes[j]!;
      if (left.type !== right.type) continue;

      const leftTerms = new Set(nodeTerms(left));
      const sharedTerms = nodeTerms(right).filter((term) => leftTerms.has(term));
      if (sharedTerms.length === 0) continue;

      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const evidenceRefs = uniqueSorted([
        ...(canonical.source_refs ?? []),
        ...(candidate.source_refs ?? []),
      ]);
      candidates.push({
        id: candidateId(canonical, candidate, sharedTerms),
        kind: "entity_match",
        status: "candidate",
        score: candidateScore(sharedTerms, canonical, candidate),
        candidate_id: candidate.id,
        canonical_id: canonical.id,
        shared_terms: sharedTerms,
        evidence_refs: evidenceRefs,
        reasons: [
          `same node type: ${canonical.type}`,
          `shared normalized term(s): ${sharedTerms.join(", ")}`,
        ],
        proposed_patch_operation: "accept_match",
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
    graph_hash: context.graphHash,
    profile_hash: context.profile.profile_hash,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    candidate_count: candidates.length,
    candidates,
  };
}

export function writeOntologyReconciliationCandidates(
  outPath: string,
  queue: OntologyReconciliationCandidateQueue,
): void {
  const resolved = resolve(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(queue, null, 2) + "\n", "utf-8");
}

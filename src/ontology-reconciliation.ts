import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { OntologyPatchContext, OntologyPatchNode } from "./ontology-patch.js";

export const ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA = "graphify_ontology_reconciliation_candidates_v1" as const;
export const ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA =
  "graphify_ontology_reconciliation_candidates_response_v1" as const;

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

export interface OntologyReconciliationCandidateFilter {
  status?: OntologyReconciliationCandidateStatus;
  kind?: OntologyReconciliationCandidateKind;
  operation?: OntologyReconciliationCandidate["proposed_patch_operation"];
  canonical_id?: string;
  candidate_id?: string;
  min_score?: number;
  query?: string;
  sort?: "score" | "id";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  stale?: boolean;
}

export interface OntologyReconciliationCandidatesResponse {
  schema: typeof ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA;
  generated_at: string;
  graph_hash: string;
  profile_hash: string;
  stale: boolean;
  total: number;
  limit: number;
  offset: number;
  items: OntologyReconciliationCandidate[];
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

export function loadOntologyReconciliationCandidates(path: string): OntologyReconciliationCandidateQueue {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as OntologyReconciliationCandidateQueue;
}

export function queryOntologyReconciliationCandidates(
  queue: OntologyReconciliationCandidateQueue,
  options: OntologyReconciliationCandidateFilter = {},
): OntologyReconciliationCandidatesResponse {
  const sortKey = options.sort ?? "score";
  const order = options.order ?? "desc";
  const query = options.query?.trim().toLowerCase();
  const status = options.status;
  const kind = options.kind;
  const operation = options.operation;
  const canonicalId = options.canonical_id;
  const candidateIdFilter = options.candidate_id;
  const minScore = options.min_score;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limitValue = options.limit ?? Number.POSITIVE_INFINITY;
  const hasExplicitLimit = Number.isFinite(limitValue);
  const limit = hasExplicitLimit ? Math.max(0, Math.floor(limitValue)) : Number.POSITIVE_INFINITY;

  const filtered = queue.candidates.filter((candidate) => {
    if (status !== undefined && candidate.status !== status) return false;
    if (kind !== undefined && candidate.kind !== kind) return false;
    if (operation !== undefined && candidate.proposed_patch_operation !== operation) return false;
    if (canonicalId !== undefined && candidate.canonical_id !== canonicalId) return false;
    if (candidateIdFilter !== undefined && candidate.candidate_id !== candidateIdFilter) return false;
    if (typeof minScore === "number" && candidate.score < minScore) return false;
    if (!query) return true;

    const haystack = [
      candidate.id,
      candidate.kind,
      candidate.status,
      candidate.candidate_id,
      candidate.canonical_id,
      candidate.proposed_patch_operation,
      ...candidate.shared_terms,
      ...candidate.evidence_refs,
      ...candidate.reasons,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  filtered.sort((left, right) => {
    if (sortKey === "id") {
      const orderDelta = left.id.localeCompare(right.id);
      return order === "asc" ? orderDelta : -orderDelta;
    }
    const scoreDelta = left.score - right.score;
    if (scoreDelta !== 0) return order === "asc" ? scoreDelta : -scoreDelta;
    return left.id.localeCompare(right.id);
  });

  const resolvedLimit = Number.isFinite(limit) ? limit : filtered.length;
  const start = Math.min(offset, filtered.length);
  const end = Number.isFinite(resolvedLimit) ? start + resolvedLimit : undefined;
  const items = filtered.slice(start, end);

  return {
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA,
    generated_at: queue.generated_at,
    graph_hash: queue.graph_hash,
    profile_hash: queue.profile_hash,
    stale: options.stale ?? false,
    total: filtered.length,
    limit: Number.isFinite(resolvedLimit) ? resolvedLimit : items.length,
    offset,
    items,
  };
}

export function filterOntologyReconciliationCandidates(
  queue: OntologyReconciliationCandidateQueue,
  options: OntologyReconciliationCandidateFilter = {},
): OntologyReconciliationCandidatesResponse {
  return queryOntologyReconciliationCandidates(queue, options);
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

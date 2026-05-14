import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  loadOntologyReconciliationDecisionLog,
  type OntologyPatchContext,
  type OntologyReconciliationDecisionLogOptions,
  type OntologyReconciliationDecisionLogResponse,
} from "./ontology-patch.js";
import {
  loadOntologyReconciliationCandidates,
  queryOntologyReconciliationCandidates,
  type OntologyReconciliationCandidate,
  type OntologyReconciliationCandidateFilter,
  type OntologyReconciliationCandidateQueue,
  type OntologyReconciliationCandidatesResponse,
} from "./ontology-reconciliation.js";

export interface OntologyRebuildStatusResponse {
  schema: "graphify_ontology_rebuild_status_v1";
  needs_update: boolean;
  graph_hash: string | null;
  profile_hash: string | null;
  candidates_match: boolean;
  decision_log_available: boolean;
  candidates: {
    path: string;
    exists: boolean;
    readable: boolean;
    candidate_count: number | null;
    generated_at: string | null;
    graph_hash: string | null;
    profile_hash: string | null;
    consistent_with_context: boolean | null;
    issues: string[];
  };
}

export function readableStatePath(context: OntologyPatchContext, path: string): string {
  const resolvedStateDir = resolve(context.stateDir);
  const resolvedPath = resolve(path);
  const fromState = relative(resolvedStateDir, resolvedPath);
  if (fromState === "") return ".";
  if (!fromState.startsWith("..") && !fromState.startsWith(sep) && !isAbsolute(fromState)) {
    return fromState;
  }
  return resolvedPath;
}

export function ontologyReconciliationCandidatesPath(context: OntologyPatchContext): string {
  return join(context.stateDir, "ontology", "reconciliation", "candidates.json");
}

export function ontologyAppliedPatchesPath(context: OntologyPatchContext): string {
  return join(context.stateDir, "ontology", "reconciliation", "applied-patches.jsonl");
}

export function ontologyNeedsUpdatePath(context: OntologyPatchContext): string {
  return join(context.stateDir, "needs_update");
}

export function loadReadonlyReconciliationCandidates(
  context: OntologyPatchContext,
): OntologyReconciliationCandidateQueue {
  const path = ontologyReconciliationCandidatesPath(context);
  if (!existsSync(path)) {
    throw new Error(`reconciliation candidates file not found: ${readableStatePath(context, path)}`);
  }
  return loadOntologyReconciliationCandidates(path);
}

export function reconciliationQueueIsStale(
  context: OntologyPatchContext,
  queue: OntologyReconciliationCandidateQueue,
): boolean {
  const graphMismatch = context.graphHash.length > 0 && queue.graph_hash !== context.graphHash;
  const profileMismatch = context.profile.profile_hash.length > 0 && queue.profile_hash !== context.profile.profile_hash;
  return existsSync(ontologyNeedsUpdatePath(context)) || graphMismatch || profileMismatch;
}

export function listOntologyReconciliationCandidates(
  context: OntologyPatchContext,
  filters: OntologyReconciliationCandidateFilter = {},
): OntologyReconciliationCandidatesResponse {
  const queue = loadReadonlyReconciliationCandidates(context);
  return queryOntologyReconciliationCandidates(queue, {
    ...filters,
    stale: reconciliationQueueIsStale(context, queue),
  });
}

export function getOntologyReconciliationCandidate(
  context: OntologyPatchContext,
  id: string,
): OntologyReconciliationCandidate {
  const queue = loadReadonlyReconciliationCandidates(context);
  const candidate = queue.candidates.find((item) => item.id === id);
  if (!candidate) {
    throw new Error(`reconciliation candidate not found: ${id}`);
  }
  return candidate;
}

export function previewOntologyDecisionLog(
  context: OntologyPatchContext,
  options: Omit<OntologyReconciliationDecisionLogOptions, "authoritativePath" | "auditPath" | "rootDir"> = {},
): OntologyReconciliationDecisionLogResponse {
  const response = loadOntologyReconciliationDecisionLog({
    ...options,
    authoritativePath: context.decisionsPath,
    auditPath: ontologyAppliedPatchesPath(context),
    rootDir: context.rootDir,
  });
  if (!context.decisionsPath && options.source !== "audit") {
    response.issues.unshift({
      severity: "warning",
      message: "authoritative decisionsPath is not configured",
    });
  }
  return response;
}

export function getOntologyRebuildStatus(context: OntologyPatchContext): OntologyRebuildStatusResponse {
  const candidatesPath = ontologyReconciliationCandidatesPath(context);
  const candidates = {
    path: readableStatePath(context, candidatesPath),
    exists: existsSync(candidatesPath),
    readable: false,
    candidate_count: null as number | null,
    generated_at: null as string | null,
    graph_hash: null as string | null,
    profile_hash: null as string | null,
    consistent_with_context: null as boolean | null,
    issues: [] as string[],
  };

  if (candidates.exists) {
    try {
      const queue = loadOntologyReconciliationCandidates(candidatesPath);
      const expectedGraphHash = context.graphHash;
      const expectedProfileHash = context.profile.profile_hash;
      const graphMatches = expectedGraphHash.length === 0 || queue.graph_hash === expectedGraphHash;
      const profileMatches = expectedProfileHash.length === 0 || queue.profile_hash === expectedProfileHash;
      candidates.readable = true;
      candidates.candidate_count = queue.candidate_count;
      candidates.generated_at = queue.generated_at;
      candidates.graph_hash = queue.graph_hash;
      candidates.profile_hash = queue.profile_hash;
      candidates.consistent_with_context = graphMatches && profileMatches;
      if (!graphMatches) {
        candidates.issues.push("candidates graph_hash does not match active graph");
      }
      if (!profileMatches) {
        candidates.issues.push("candidates profile_hash does not match active profile");
      }
    } catch (err) {
      candidates.issues.push(`candidates file could not be read: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const needsUpdate = existsSync(ontologyNeedsUpdatePath(context));
  return {
    schema: "graphify_ontology_rebuild_status_v1",
    needs_update: needsUpdate,
    graph_hash: context.graphHash || null,
    profile_hash: context.profile.profile_hash || null,
    candidates_match: candidates.consistent_with_context === true,
    decision_log_available: Boolean(
      context.decisionsPath && existsSync(context.decisionsPath),
    ) || existsSync(ontologyAppliedPatchesPath(context)),
    candidates,
  };
}

import { createHash } from "node:crypto";

import {
  getPullRequest,
  getPullRequestMerge,
  listPullRequests,
  type CommandRunner,
  type PullRequestCheck,
} from "./pr.js";
import { branchId, commitId, prId, repoKey } from "./repo-key.js";
import type { Extraction, GraphEdge, GraphNode, OntologyProfile } from "./types.js";

export const GH_EXTRACT_ADAPTER_VERSION = "graphify-gh/1";
export const GH_EXTRACTION_TTL = "PT4H";

const DEFAULT_LIMIT = 30;
const DEFAULT_STATE = "all";

const PASSED_CHECKS = new Set(["SUCCESS", "PASSED", "PASS"]);
const FAILED_CHECKS = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "ERROR",
  "FAILED",
  "FAILURE",
  "STARTUP_FAILURE",
  "TIMED_OUT",
]);
const PENDING_CHECKS = new Set(["EXPECTED", "IN_PROGRESS", "PENDING", "QUEUED", "REQUESTED", "WAITING"]);

export const GH_ONTOLOGY_PROFILE: OntologyProfile = {
  id: "gh",
  version: 1,
  node_types: {
    PullRequest: {
      aliases: ["GitHub pull request", "PR"],
      source_backed: true,
    },
    // Compatibility endpoint types for cross-profile references emitted as
    // branch:/commit: ids. The extractor does not create these nodes.
    Branch: {
      aliases: ["git branch", "ref"],
      source_backed: true,
    },
    Commit: {
      aliases: ["git commit", "revision"],
      source_backed: true,
    },
  },
  relation_types: {
    FROM_BRANCH: {
      source: "PullRequest",
      target: "Branch",
      derivation_method: "gh_pr_ref",
    },
    INTO_BRANCH: {
      source: "PullRequest",
      target: "Branch",
      derivation_method: "gh_pr_ref",
    },
    CONTAINS_COMMIT: {
      source: "PullRequest",
      target: "Commit",
      derivation_method: "gh_pr_commits",
    },
    MERGED_AS: {
      source: "PullRequest",
      target: "Commit",
      derivation_method: "gh_pr_merge_commit",
    },
  },
};

export interface ExtractPullRequestsOptions {
  cwd?: string;
  runner?: CommandRunner;
  enabled?: boolean;
  limit?: number;
  state?: string;
  observedAt?: string;
  ttl?: string;
}

interface CheckAggregate {
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  checks_pending: number;
  checks_other: number;
  checks_conclusion: string;
  check_runs?: PullRequestCheck[];
}

function emptyExtraction(): Extraction {
  return {
    nodes: [],
    edges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function shortSha(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/[0-9a-f]{7,64}/i);
  return match ? match[0]!.slice(0, 12) : undefined;
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function checkBucket(check: PullRequestCheck): "passed" | "failed" | "pending" | "other" {
  const conclusion = check.conclusion.toUpperCase();
  if (PASSED_CHECKS.has(conclusion)) return "passed";
  if (FAILED_CHECKS.has(conclusion)) return "failed";
  if (PENDING_CHECKS.has(conclusion)) return "pending";
  return "other";
}

function normalizeCheck(check: PullRequestCheck): PullRequestCheck {
  return {
    name: check.name,
    conclusion: check.conclusion.toUpperCase(),
    ...(check.url ? { url: check.url } : {}),
  };
}

function aggregateChecks(checks: PullRequestCheck[]): CheckAggregate {
  const normalized = checks.map(normalizeCheck);
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let other = 0;
  for (const check of normalized) {
    const bucket = checkBucket(check);
    if (bucket === "passed") passed += 1;
    else if (bucket === "failed") failed += 1;
    else if (bucket === "pending") pending += 1;
    else other += 1;
  }

  const total = normalized.length;
  const conclusion =
    total === 0 ? "NONE" : failed > 0 ? "FAILURE" : pending > 0 ? "PENDING" : other > 0 ? "MIXED" : "SUCCESS";
  return {
    checks_total: total,
    checks_passed: passed,
    checks_failed: failed,
    checks_pending: pending,
    checks_other: other,
    checks_conclusion: conclusion,
    ...(normalized.length > 0 ? { check_runs: normalized } : {}),
  };
}

function prNode(repoKeyStr: string, pr: ReturnType<typeof getPullRequest>): GraphNode {
  const checks = aggregateChecks(pr.checkRuns);
  return {
    id: prId(repoKeyStr, pr.number),
    label: `#${pr.number} ${pr.title}`,
    file_type: "concept",
    source_file: "gh",
    node_type: "PullRequest",
    repo: repoKeyStr,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    is_draft: pr.isDraft,
    base_branch: pr.baseRefName,
    head_branch: pr.headRefName,
    ...(pr.author ? { author: pr.author } : {}),
    ...(pr.url ? { url: pr.url } : {}),
    ...(pr.reviewDecision ? { review_decision: pr.reviewDecision } : {}),
    ...(pr.mergeStateStatus ?? pr.mergeable ? { merge_state: pr.mergeStateStatus ?? pr.mergeable } : {}),
    ...(pr.updatedAt ? { updated_at: pr.updatedAt } : {}),
    ...(pr.body ? { body_length: pr.body.length, body_hash: sha256(pr.body) } : {}),
    ...checks,
  };
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.source}\0${edge.target}\0${edge.relation}\0${String(edge.source_file ?? "")}`;
}

function extractedEdge(source: string, target: string, relation: string, derivationMethod: string): GraphEdge {
  return {
    source,
    target,
    relation,
    confidence: "EXTRACTED",
    source_file: "gh",
    derivation_method: derivationMethod,
  };
}

export function extractPullRequests(root: string = ".", options: ExtractPullRequestsOptions = {}): Extraction {
  if (options.enabled !== true) return emptyExtraction();

  const cwd = options.cwd ?? root;
  const limit = positiveInteger(options.limit, DEFAULT_LIMIT);
  const state = options.state ?? DEFAULT_STATE;
  const repoKeyStr = repoKey(cwd, options.runner);
  const summaries = listPullRequests({ cwd, runner: options.runner, limit, state });

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const summary of summaries) {
    const details = getPullRequest(summary.number, { cwd, runner: options.runner });
    const merge = getPullRequestMerge(summary.number, { cwd, runner: options.runner });
    const id = prId(repoKeyStr, details.number);
    nodes.push(prNode(repoKeyStr, details));

    if (details.headRefName) {
      edges.push(extractedEdge(id, branchId(repoKeyStr, details.headRefName), "FROM_BRANCH", "gh_pr_ref"));
    }
    if (details.baseRefName) {
      edges.push(extractedEdge(id, branchId(repoKeyStr, details.baseRefName), "INTO_BRANCH", "gh_pr_ref"));
    }

    const commits = uniqueSorted([
      ...merge.commits.map(shortSha),
      ...details.commits.map(shortSha),
    ]);
    for (const sha of commits) {
      edges.push(extractedEdge(id, commitId(repoKeyStr, sha), "CONTAINS_COMMIT", "gh_pr_commits"));
    }

    const mergeCommit = shortSha(merge.mergeCommit);
    if (mergeCommit) {
      edges.push(extractedEdge(id, commitId(repoKeyStr, mergeCommit), "MERGED_AS", "gh_pr_merge_commit"));
    }
  }

  const dedupedEdges = new Map<string, GraphEdge>();
  for (const edge of edges) dedupedEdges.set(edgeKey(edge), edge);
  const resultEdges = [...dedupedEdges.values()];

  return {
    provenance: {
      source_owner: "gh",
      source_id: repoKeyStr,
      observed_at: options.observedAt ?? new Date().toISOString(),
      source_hash: sha256(JSON.stringify({ repo: repoKeyStr, nodes, edges: resultEdges })),
      adapter_version: GH_EXTRACT_ADAPTER_VERSION,
      ttl: options.ttl ?? GH_EXTRACTION_TTL,
    },
    nodes,
    edges: resultEdges,
    input_tokens: 0,
    output_tokens: 0,
  };
}

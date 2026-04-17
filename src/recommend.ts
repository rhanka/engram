import Graph from "graphology";

import { buildReviewDelta, type ReviewDelta } from "./review.js";
import { sanitizeLabel } from "./security.js";
import type { LifecycleMetadata } from "./lifecycle.js";

export type CommitRecommendationConfidence = "high" | "medium" | "low";

export interface CommitRecommendationStaleness {
  stale: boolean;
  reasons: string[];
}

export interface CommitRecommendationGroup {
  title: string;
  suggested_commit_message: string;
  files: string[];
  rationale: string;
  confidence: CommitRecommendationConfidence;
  confidence_reasons: string[];
  graph_impact: {
    changed_nodes: number;
    impacted_nodes: number;
    impacted_files: string[];
    communities: Array<{ id: number; label: string; node_count: number }>;
    hub_nodes: string[];
    bridge_nodes: string[];
    likely_test_gaps: string[];
    high_risk_chains: number;
  };
}

export interface CommitRecommendation {
  advisory_only: true;
  actor: "user";
  forbidden_actions: string[];
  changed_files: string[];
  staleness: CommitRecommendationStaleness;
  confidence: CommitRecommendationConfidence;
  confidence_reasons: string[];
  groups: CommitRecommendationGroup[];
  next_best_action: string;
}

export interface CommitRecommendationOptions {
  lifecycle?: LifecycleMetadata | null;
  needsUpdate?: boolean;
  graphAvailable?: boolean;
  maxGroups?: number;
  maxNodes?: number;
  maxChains?: number;
}

interface FileGraphInfo {
  file: string;
  matched_nodes: string[];
  communities: number[];
}

interface GroupDraft {
  key: string;
  title: string;
  commitPrefix: string;
  files: string[];
  matchedFiles: number;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean).map(normalizePath))].sort(compareStrings);
}

function isGraphifyStatePath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === ".graphify" || normalized.startsWith(".graphify/");
}

function maybeCommunity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sourceMatches(sourceFile: string | null, changedFile: string): boolean {
  if (!sourceFile) return false;
  const source = normalizePath(sourceFile);
  const changed = normalizePath(changedFile);
  return source === changed || source.endsWith(`/${changed}`) || changed.endsWith(`/${source}`);
}

function communityLabel(G: Graph, community: number): string {
  const labels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  const label = labels?.[String(community)];
  if (typeof label === "string" && label.trim().length > 0) {
    return sanitizeLabel(label);
  }
  return `Community ${community}`;
}

function topLevelArea(path: string): string {
  const normalized = normalizePath(path);
  const first = normalized.split("/")[0];
  if (!first || first === normalized) return "root";
  return first;
}

function commitPrefixForArea(area: string): string {
  if (area === "root") return "repo";
  return area.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
}

function fileInfo(G: Graph, file: string): FileGraphInfo {
  const matched: string[] = [];
  const communities = new Set<number>();
  G.forEachNode((nodeId, attrs) => {
    const source = typeof attrs.source_file === "string" ? attrs.source_file : null;
    if (!sourceMatches(source, file)) return;
    matched.push(nodeId);
    const community = maybeCommunity(attrs.community);
    if (community !== null) communities.add(community);
  });
  matched.sort(compareStrings);
  return {
    file,
    matched_nodes: matched,
    communities: [...communities].sort((a, b) => a - b),
  };
}

function dominantCommunity(infos: FileGraphInfo[]): number | null {
  const counts = new Map<number, number>();
  for (const info of infos) {
    for (const community of info.communities) {
      counts.set(community, (counts.get(community) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return sorted[0]?.[0] ?? null;
}

function groupDraftForFile(G: Graph, info: FileGraphInfo): GroupDraft {
  const community = dominantCommunity([info]);
  if (community !== null) {
    const label = communityLabel(G, community);
    return {
      key: `community:${community}`,
      title: `${label} changes`,
      commitPrefix: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `community-${community}`,
      files: [info.file],
      matchedFiles: info.matched_nodes.length > 0 ? 1 : 0,
    };
  }

  const area = topLevelArea(info.file);
  return {
    key: `area:${area}`,
    title: `${area} changes`,
    commitPrefix: commitPrefixForArea(area),
    files: [info.file],
    matchedFiles: 0,
  };
}

function mergeDrafts(drafts: GroupDraft[], maxGroups: number): GroupDraft[] {
  const merged = new Map<string, GroupDraft>();
  for (const draft of drafts) {
    const existing = merged.get(draft.key);
    if (!existing) {
      merged.set(draft.key, { ...draft, files: [...draft.files] });
      continue;
    }
    existing.files.push(...draft.files);
    existing.matchedFiles += draft.matchedFiles;
  }

  const groups = [...merged.values()]
    .map((group) => ({ ...group, files: uniqueSorted(group.files) }))
    .sort((a, b) => b.files.length - a.files.length || compareStrings(a.title, b.title));

  if (groups.length <= maxGroups) return groups;

  const kept = groups.slice(0, maxGroups - 1);
  const overflow = groups.slice(maxGroups - 1);
  kept.push({
    key: "overflow:mixed",
    title: "remaining changes",
    commitPrefix: "mixed",
    files: uniqueSorted(overflow.flatMap((group) => group.files)),
    matchedFiles: overflow.reduce((sum, group) => sum + group.matchedFiles, 0),
  });
  return kept;
}

function stalenessFrom(options: CommitRecommendationOptions): CommitRecommendationStaleness {
  const reasons: string[] = [];
  const branch = options.lifecycle?.branch;
  const worktree = options.lifecycle?.worktree;

  if (options.graphAvailable === false) {
    reasons.push("graph file not found; recommendations use path grouping only");
  }
  if (options.needsUpdate === true) {
    reasons.push(".graphify/needs_update exists");
  }
  if (branch?.stale) {
    reasons.push(branch.staleReason ? `branch metadata is stale: ${branch.staleReason}` : "branch metadata is stale");
  }
  if (branch?.lastAnalyzedHead && branch.lastSeenHead && branch.lastAnalyzedHead !== branch.lastSeenHead) {
    reasons.push("branch HEAD changed since last analyzed graph");
  }
  if (worktree?.lastAnalyzedHead && worktree.lastSeenHead && worktree.lastAnalyzedHead !== worktree.lastSeenHead) {
    reasons.push("worktree HEAD changed since last analyzed graph");
  }
  const lifecycleSignal = `${branch?.lifecycleEvent ?? ""} ${branch?.staleReason ?? ""}`.toLowerCase();
  if (lifecycleSignal.includes("post-rewrite") || lifecycleSignal.includes("rebase")) {
    reasons.push("branch history rewrite/rebase signal present");
  }

  const unique = uniqueSorted(reasons);
  return {
    stale: unique.length > 0,
    reasons: unique,
  };
}

function confidenceRank(confidence: CommitRecommendationConfidence): number {
  return confidence === "high" ? 3 : confidence === "medium" ? 2 : 1;
}

function minConfidence(values: CommitRecommendationConfidence[]): CommitRecommendationConfidence {
  return values.reduce<CommitRecommendationConfidence>(
    (lowest, value) => (confidenceRank(value) < confidenceRank(lowest) ? value : lowest),
    "high",
  );
}

function groupConfidence(
  group: GroupDraft,
  delta: ReviewDelta,
  stale: boolean,
): { confidence: CommitRecommendationConfidence; reasons: string[] } {
  const reasons: string[] = [];
  const unmatched = group.files.length - group.matchedFiles;

  if (stale) reasons.push("graph/lifecycle state is stale");
  if (delta.changed_nodes.length === 0) reasons.push("no changed file maps to a graph node");
  if (unmatched > 0) reasons.push(`${unmatched} changed file(s) missing from graph`);
  if (delta.high_risk_chains.length > 0) reasons.push("high-risk graph chains touch this group");
  if (delta.likely_test_gaps.length > 0) reasons.push("likely test gaps surfaced for this group");
  if (reasons.length === 0) reasons.push("all files map to fresh graph nodes");

  let confidence: CommitRecommendationConfidence = "high";
  if (stale || delta.changed_nodes.length === 0) {
    confidence = "low";
  } else if (unmatched > 0 || delta.high_risk_chains.length > 0 || delta.likely_test_gaps.length > 0) {
    confidence = "medium";
  }

  return { confidence, reasons: uniqueSorted(reasons) };
}

function communitiesFromDelta(G: Graph, delta: ReviewDelta): Array<{ id: number; label: string; node_count: number }> {
  const counts = new Map<number, number>();
  for (const node of delta.impacted_nodes) {
    if (node.community === null) continue;
    counts.set(node.community, (counts.get(node.community) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id, node_count]) => ({ id, label: communityLabel(G, id), node_count }));
}

function suggestedMessage(prefix: string, files: string[]): string {
  const normalized = prefix || "change";
  if (files.length === 1) return `${normalized}: update ${files[0]}`;
  return `${normalized}: update ${files.length} related files`;
}

function rationaleFor(delta: ReviewDelta, matchedFiles: number, totalFiles: number): string {
  const parts: string[] = [];
  if (matchedFiles > 0) parts.push(`${matchedFiles}/${totalFiles} file(s) map to graph nodes`);
  if (delta.impacted_files.length > 0) parts.push(`${delta.impacted_files.length} impacted file(s) surfaced`);
  if (delta.hub_nodes.length > 0) parts.push(`${delta.hub_nodes.length} hub node(s) touched`);
  if (delta.bridge_nodes.length > 0) parts.push(`${delta.bridge_nodes.length} bridge node(s) touched`);
  if (parts.length === 0) return "Grouped by repository path because graph impact is unavailable.";
  return `${parts.join("; ")}.`;
}

export function buildCommitRecommendation(
  G: Graph,
  changedFilesInput: string[],
  options: CommitRecommendationOptions = {},
): CommitRecommendation {
  const changedFiles = uniqueSorted(changedFilesInput).filter((file) => !isGraphifyStatePath(file));
  const staleness = stalenessFrom(options);
  const maxGroups = Math.max(1, options.maxGroups ?? 6);
  const maxNodes = Math.max(1, options.maxNodes ?? 60);
  const maxChains = Math.max(0, options.maxChains ?? 4);
  const infos = changedFiles.map((file) => fileInfo(G, file));
  const drafts = mergeDrafts(infos.map((info) => groupDraftForFile(G, info)), maxGroups);

  const groups = drafts.map((draft) => {
    const delta = buildReviewDelta(G, draft.files, {
      maxNodes,
      maxChains,
    });
    const confidence = groupConfidence(draft, delta, staleness.stale);
    return {
      title: draft.title,
      suggested_commit_message: suggestedMessage(draft.commitPrefix, draft.files),
      files: draft.files,
      rationale: rationaleFor(delta, draft.matchedFiles, draft.files.length),
      confidence: confidence.confidence,
      confidence_reasons: confidence.reasons,
      graph_impact: {
        changed_nodes: delta.changed_nodes.length,
        impacted_nodes: delta.impacted_nodes.length,
        impacted_files: delta.impacted_files,
        communities: communitiesFromDelta(G, delta),
        hub_nodes: delta.hub_nodes.map((node) => node.label),
        bridge_nodes: delta.bridge_nodes.map((node) => node.label),
        likely_test_gaps: delta.likely_test_gaps,
        high_risk_chains: delta.high_risk_chains.length,
      },
    } satisfies CommitRecommendationGroup;
  });

  const confidenceReasons = new Set<string>();
  if (changedFiles.length === 0) confidenceReasons.add("no changed files to recommend");
  for (const reason of staleness.reasons) confidenceReasons.add(reason);
  for (const group of groups) {
    for (const reason of group.confidence_reasons) confidenceReasons.add(reason);
  }

  const confidence = groups.length === 0
    ? "low"
    : minConfidence(groups.map((group) => group.confidence));

  return {
    advisory_only: true,
    actor: "user",
    forbidden_actions: ["auto-stage", "auto-commit", "branch-mutation"],
    changed_files: changedFiles,
    staleness,
    confidence,
    confidence_reasons: [...confidenceReasons].sort(compareStrings),
    groups,
    next_best_action: groups.length === 0
      ? "No commit grouping is available because no changed files were provided."
      : "Review the suggested groups, inspect stale/confidence reasons, then stage and commit manually if they match your intent.",
  };
}

function formatList(values: string[], empty: string = "none"): string[] {
  return values.length > 0 ? values.map((value) => `    - ${value}`) : [`    ${empty}`];
}

export function commitRecommendationToText(recommendation: CommitRecommendation): string {
  const lines = [
    "Graphify Commit Recommendation",
    "Advisory only: no staging, no commits, no branch mutations performed.",
    `Changed files: ${recommendation.changed_files.length}`,
    `Confidence: ${recommendation.confidence}`,
    `Staleness: ${recommendation.staleness.stale ? "stale" : "fresh"}`,
  ];

  if (recommendation.staleness.reasons.length > 0) {
    lines.push("Staleness reasons:");
    lines.push(...recommendation.staleness.reasons.map((reason) => `  - ${reason}`));
  }

  lines.push("", "Suggested commit groups:");
  if (recommendation.groups.length === 0) {
    lines.push("  none");
  }

  recommendation.groups.forEach((group, index) => {
    lines.push(
      `  ${index + 1}. ${group.title}`,
      `    suggested message: ${group.suggested_commit_message}`,
      `    confidence: ${group.confidence}`,
      `    rationale: ${group.rationale}`,
      "    files:",
      ...formatList(group.files),
      "    impact:",
      `    - changed nodes: ${group.graph_impact.changed_nodes}`,
      `    - impacted nodes: ${group.graph_impact.impacted_nodes}`,
      `    - impacted files: ${group.graph_impact.impacted_files.length}`,
      `    - communities: ${group.graph_impact.communities.map((community) => community.label).join(", ") || "none"}`,
    );
    if (group.graph_impact.hub_nodes.length > 0) {
      lines.push(`    - hubs: ${group.graph_impact.hub_nodes.join(", ")}`);
    }
    if (group.graph_impact.bridge_nodes.length > 0) {
      lines.push(`    - bridges: ${group.graph_impact.bridge_nodes.join(", ")}`);
    }
    if (group.graph_impact.likely_test_gaps.length > 0) {
      lines.push("    likely test gaps:");
      lines.push(...formatList(group.graph_impact.likely_test_gaps));
    }
  });

  lines.push("", "Confidence reasons:");
  lines.push(...(recommendation.confidence_reasons.length
    ? recommendation.confidence_reasons.map((reason) => `  - ${reason}`)
    : ["  none"]));

  lines.push("", `Next best action: ${recommendation.next_best_action}`);
  return lines.join("\n");
}

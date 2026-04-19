import { extname } from "node:path";
import Graph from "graphology";

import { buildReviewDelta, type ReviewDelta, type ReviewNode } from "./review.js";
import { sanitizeLabel } from "./security.js";

export type ReviewRiskLevel = "low" | "medium" | "high";

export interface ReviewBlastRadius {
  level: ReviewRiskLevel;
  score: number;
  changed_files: number;
  impacted_files: number;
  impacted_nodes: number;
  impacted_communities: number;
  hub_nodes: number;
  bridge_nodes: number;
  high_risk_chains: number;
  rationale: string[];
}

export interface ReviewImpactedCommunity {
  id: number;
  label: string;
  changed_nodes: number;
  impacted_nodes: number;
  impacted_files: string[];
  hub_nodes: string[];
  bridge_nodes: string[];
  risk_level: ReviewRiskLevel;
}

export interface ReviewMultimodalSafety {
  status: "none" | "covered" | "review";
  touched_files: string[];
  rationale: string[];
}

export interface ReviewAnalysis {
  changed_files: string[];
  blast_radius: ReviewBlastRadius;
  impacted_communities: ReviewImpactedCommunity[];
  bridge_nodes: ReviewNode[];
  test_gap_hints: string[];
  multimodal_safety: ReviewMultimodalSafety;
  next_best_action: string;
}

export interface ReviewAnalysisOptions {
  maxNodes?: number;
  maxChains?: number;
  maxCommunities?: number;
}

export interface ReviewEvaluationCase {
  name: string;
  changed_files: string[];
  expected_impacted_files?: string[];
  expected_summary_terms?: string[];
  expected_multimodal_files?: string[];
  naive_tokens?: number;
}

export interface ReviewEvaluationCaseResult {
  name: string;
  analysis_tokens: number;
  naive_tokens: number;
  token_savings_ratio: number;
  impacted_file_recall: number | null;
  review_summary_precision: number | null;
  multimodal_regression_safety: number | null;
  notes: string[];
}

export interface ReviewEvaluationResult {
  cases: ReviewEvaluationCaseResult[];
  aggregate: {
    token_savings_ratio: number | null;
    impacted_file_recall: number | null;
    review_summary_precision: number | null;
    multimodal_regression_safety: number | null;
  };
}

export interface ReviewEvaluationOptions extends ReviewAnalysisOptions {
  defaultFileTokens?: number;
}

const MULTIMODAL_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".rst",
  ".pdf",
  ".docx",
  ".xlsx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
  ".m4v",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
]);

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean).map((value) => value.replace(/\\/g, "/")))].sort(compareStrings);
}

function maybeCommunity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function communityLabel(G: Graph, community: number): string {
  const labels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
  const label = labels?.[String(community)];
  return typeof label === "string" && label.trim().length > 0
    ? sanitizeLabel(label)
    : "Community " + community;
}

function riskLevel(score: number): ReviewRiskLevel {
  if (score >= 30) return "high";
  if (score >= 12) return "medium";
  return "low";
}

function communityRisk(changedNodes: number, impactedNodes: number, bridgeNodes: number, hubNodes: number): ReviewRiskLevel {
  const score = changedNodes * 4 + impactedNodes + bridgeNodes * 4 + hubNodes * 2;
  return riskLevel(score);
}

function nodeCommunities(nodes: ReviewNode[]): Set<number> {
  const communities = new Set<number>();
  for (const node of nodes) {
    if (node.community !== null) communities.add(node.community);
  }
  return communities;
}

function buildBlastRadius(delta: ReviewDelta): ReviewBlastRadius {
  const impactedCommunities = nodeCommunities(delta.impacted_nodes).size;
  const score =
    delta.impacted_files.length * 3 +
    impactedCommunities * 5 +
    delta.hub_nodes.length * 2 +
    delta.bridge_nodes.length * 3 +
    delta.high_risk_chains.length * 4 +
    delta.likely_test_gaps.length * 2;
  const rationale: string[] = [];
  if (delta.impacted_files.length > delta.changed_files.length) rationale.push("graph expands review beyond changed files");
  if (impactedCommunities > 1) rationale.push("multiple communities are impacted");
  if (delta.bridge_nodes.length > 0) rationale.push("bridge nodes connect this change across communities");
  if (delta.high_risk_chains.length > 0) rationale.push("high-risk chains are present");
  if (delta.likely_test_gaps.length > 0) rationale.push("test-gap hints are present");
  if (rationale.length === 0) rationale.push("impact appears localized in the current graph");

  return {
    level: riskLevel(score),
    score,
    changed_files: delta.changed_files.length,
    impacted_files: delta.impacted_files.length,
    impacted_nodes: delta.impacted_nodes.length,
    impacted_communities: impactedCommunities,
    hub_nodes: delta.hub_nodes.length,
    bridge_nodes: delta.bridge_nodes.length,
    high_risk_chains: delta.high_risk_chains.length,
    rationale,
  };
}

function impactedCommunities(G: Graph, delta: ReviewDelta, maxCommunities: number): ReviewImpactedCommunity[] {
  const changedCounts = new Map<number, number>();
  const impactedCounts = new Map<number, number>();
  const files = new Map<number, Set<string>>();
  const hubs = new Map<number, Set<string>>();
  const bridges = new Map<number, Set<string>>();

  for (const node of delta.changed_nodes) {
    if (node.community !== null) changedCounts.set(node.community, (changedCounts.get(node.community) ?? 0) + 1);
  }
  for (const node of delta.impacted_nodes) {
    if (node.community === null) continue;
    impactedCounts.set(node.community, (impactedCounts.get(node.community) ?? 0) + 1);
    if (node.source_file) {
      if (!files.has(node.community)) files.set(node.community, new Set());
      files.get(node.community)!.add(node.source_file);
    }
  }
  for (const node of delta.hub_nodes) {
    if (node.community === null) continue;
    if (!hubs.has(node.community)) hubs.set(node.community, new Set());
    hubs.get(node.community)!.add(node.label);
  }
  for (const node of delta.bridge_nodes) {
    if (node.community === null) continue;
    if (!bridges.has(node.community)) bridges.set(node.community, new Set());
    bridges.get(node.community)!.add(node.label);
  }

  return [...impactedCounts.keys()]
    .sort((a, b) => (impactedCounts.get(b) ?? 0) - (impactedCounts.get(a) ?? 0) || a - b)
    .slice(0, maxCommunities)
    .map((id) => {
      const changed = changedCounts.get(id) ?? 0;
      const impacted = impactedCounts.get(id) ?? 0;
      const bridgeList = uniqueSorted(bridges.get(id) ?? []);
      const hubList = uniqueSorted(hubs.get(id) ?? []);
      return {
        id,
        label: communityLabel(G, id),
        changed_nodes: changed,
        impacted_nodes: impacted,
        impacted_files: uniqueSorted(files.get(id) ?? []),
        hub_nodes: hubList,
        bridge_nodes: bridgeList,
        risk_level: communityRisk(changed, impacted, bridgeList.length, hubList.length),
      };
    });
}

function isMultimodalPath(path: string): boolean {
  return MULTIMODAL_EXTENSIONS.has(extname(path).toLowerCase());
}

function multimodalSafety(delta: ReviewDelta): ReviewMultimodalSafety {
  const touched = uniqueSorted(delta.impacted_files.filter(isMultimodalPath));
  const changedMultimodal = uniqueSorted(delta.changed_files.filter(isMultimodalPath));
  if (touched.length === 0) {
    return {
      status: "none",
      touched_files: [],
      rationale: ["no multimodal/doc artifact surfaced in the impacted graph"],
    };
  }
  const rationale = ["review should include graph-extracted document/media context"];
  if (changedMultimodal.length > 0) rationale.push("changed files include document/media inputs");
  if (delta.high_risk_chains.length > 0) rationale.push("high-risk chains touch multimodal context indirectly");
  return {
    status: changedMultimodal.length > 0 || delta.high_risk_chains.length > 0 ? "review" : "covered",
    touched_files: touched,
    rationale,
  };
}

export function buildReviewAnalysis(
  G: Graph,
  changedFiles: string[],
  options: ReviewAnalysisOptions = {},
): ReviewAnalysis {
  const delta = buildReviewDelta(G, changedFiles, {
    maxNodes: options.maxNodes ?? 120,
    maxChains: options.maxChains ?? 12,
  });
  const blast = buildBlastRadius(delta);
  const communities = impactedCommunities(G, delta, Math.max(1, options.maxCommunities ?? 8));
  const safety = multimodalSafety(delta);

  return {
    changed_files: delta.changed_files,
    blast_radius: blast,
    impacted_communities: communities,
    bridge_nodes: delta.bridge_nodes,
    test_gap_hints: delta.likely_test_gaps,
    multimodal_safety: safety,
    next_best_action: blast.level === "high"
      ? "Start with bridge nodes and high-risk chains before reviewing individual files."
      : blast.level === "medium"
        ? "Review impacted communities and test-gap hints before file-level review."
        : "Review changed files, then spot-check surfaced neighbors.",
  };
}

function nodeLine(node: ReviewNode): string {
  const community = node.community === null ? "" : ", community " + node.community;
  const source = node.source_file ? ", " + node.source_file : "";
  return node.label + " (degree " + node.degree + community + source + ")";
}

export function reviewAnalysisToText(analysis: ReviewAnalysis): string {
  const lines = [
    "Graphify Review Analysis",
    "Changed files: " + analysis.changed_files.length,
    "Blast radius: " + analysis.blast_radius.level + " (score " + analysis.blast_radius.score + ")",
    "Impacted files: " + analysis.blast_radius.impacted_files,
    "Impacted communities: " + analysis.blast_radius.impacted_communities,
    "Bridge nodes: " + analysis.bridge_nodes.length,
    "Test-gap hints: " + analysis.test_gap_hints.length,
    "Multimodal safety: " + analysis.multimodal_safety.status,
    "",
    "Blast rationale:",
  ];
  lines.push(...analysis.blast_radius.rationale.map((item) => "  - " + item));

  lines.push("", "Impacted communities:");
  if (analysis.impacted_communities.length === 0) {
    lines.push("  none");
  } else {
    for (const community of analysis.impacted_communities) {
      lines.push(
        "  - " + community.label + " (" + community.risk_level + ", " + community.impacted_nodes + " impacted nodes, " + community.changed_nodes + " changed nodes)",
      );
    }
  }

  lines.push("", "Bridge nodes:");
  lines.push(...(analysis.bridge_nodes.length > 0 ? analysis.bridge_nodes.map((node) => "  - " + nodeLine(node)) : ["  none"]));

  lines.push("", "Test-gap hints:");
  lines.push(...(analysis.test_gap_hints.length > 0 ? analysis.test_gap_hints.map((hint) => "  - " + hint) : ["  none"]));

  lines.push("", "Multimodal/doc safety:");
  lines.push(...analysis.multimodal_safety.rationale.map((item) => "  - " + item));
  if (analysis.multimodal_safety.touched_files.length > 0) {
    lines.push(...analysis.multimodal_safety.touched_files.map((file) => "  - touched: " + file));
  }

  lines.push("", "Next best action: " + analysis.next_best_action);
  return lines.join("\n");
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function ratio(hits: number, total: number): number | null {
  return total > 0 ? hits / total : null;
}

function average(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export function evaluateReviewAnalysis(
  G: Graph,
  cases: ReviewEvaluationCase[],
  options: ReviewEvaluationOptions = {},
): ReviewEvaluationResult {
  const defaultFileTokens = Math.max(1, options.defaultFileTokens ?? 800);
  const results = cases.map((testCase) => {
    const analysis = buildReviewAnalysis(G, testCase.changed_files, options);
    const text = reviewAnalysisToText(analysis);
    const analysisTokens = estimateTokens(text);
    const naiveFiles = uniqueSorted([
      ...testCase.changed_files,
      ...analysis.impacted_communities.flatMap((community) => community.impacted_files),
    ]);
    const naiveTokens = testCase.naive_tokens ?? Math.max(1, naiveFiles.length) * defaultFileTokens;
    const expectedFiles = uniqueSorted(testCase.expected_impacted_files ?? []);
    const impactedFiles = new Set(analysis.impacted_communities.flatMap((community) => community.impacted_files));
    const recallHits = expectedFiles.filter((file) => impactedFiles.has(file)).length;
    const terms = testCase.expected_summary_terms ?? [];
    const lowerText = text.toLowerCase();
    const termHits = terms.filter((term) => lowerText.includes(term.toLowerCase())).length;
    const expectedMultimodal = uniqueSorted(testCase.expected_multimodal_files ?? []);
    const touchedMultimodal = new Set(analysis.multimodal_safety.touched_files);
    const multimodalHits = expectedMultimodal.filter((file) => touchedMultimodal.has(file)).length;
    const notes: string[] = [];
    if (analysis.blast_radius.level === "high") notes.push("high blast radius");
    if (analysis.test_gap_hints.length > 0) notes.push("test-gap hints present");
    if (analysis.multimodal_safety.status === "review") notes.push("manual multimodal/doc review advised");

    return {
      name: testCase.name,
      analysis_tokens: analysisTokens,
      naive_tokens: Math.max(analysisTokens, naiveTokens),
      token_savings_ratio: 1 - analysisTokens / Math.max(analysisTokens, naiveTokens),
      impacted_file_recall: ratio(recallHits, expectedFiles.length),
      review_summary_precision: ratio(termHits, terms.length),
      multimodal_regression_safety: ratio(multimodalHits, expectedMultimodal.length),
      notes,
    };
  });

  return {
    cases: results,
    aggregate: {
      token_savings_ratio: average(results.map((item) => item.token_savings_ratio)),
      impacted_file_recall: average(results.map((item) => item.impacted_file_recall)),
      review_summary_precision: average(results.map((item) => item.review_summary_precision)),
      multimodal_regression_safety: average(results.map((item) => item.multimodal_regression_safety)),
    },
  };
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : (value * 100).toFixed(1) + "%";
}

export function reviewEvaluationToText(result: ReviewEvaluationResult): string {
  const lines = [
    "Graphify Review Evaluation",
    "Token savings vs naive reads: " + formatMetric(result.aggregate.token_savings_ratio),
    "Impacted-file recall: " + formatMetric(result.aggregate.impacted_file_recall),
    "Review summary precision: " + formatMetric(result.aggregate.review_summary_precision),
    "Multimodal regression safety: " + formatMetric(result.aggregate.multimodal_regression_safety),
    "",
    "Cases:",
  ];
  for (const item of result.cases) {
    lines.push(
      "  - " + item.name + ": tokens " + item.analysis_tokens + "/" + item.naive_tokens +
        ", savings " + formatMetric(item.token_savings_ratio) +
        ", recall " + formatMetric(item.impacted_file_recall) +
        ", precision " + formatMetric(item.review_summary_precision) +
        ", multimodal " + formatMetric(item.multimodal_regression_safety),
    );
    if (item.notes.length > 0) {
      lines.push("    notes: " + item.notes.join(", "));
    }
  }
  return lines.join("\n");
}

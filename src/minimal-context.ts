import { analyzeChanges } from "./detect-changes.js";
import { getAffectedFlows, listFlows, type ReviewFlowArtifact } from "./flows.js";
import type { ReviewGraphStoreLike } from "./review-store.js";

export type MinimalContextRisk = "unknown" | "low" | "medium" | "high";

export interface BuildMinimalContextOptions {
  task?: string;
  changedFiles?: string[];
  flows?: ReviewFlowArtifact | null;
  topCommunities?: number;
  topFlows?: number;
}

export interface MinimalContextResult {
  summary: string;
  keyEntities?: string[];
  risk: MinimalContextRisk;
  riskScore: number;
  communities?: string[];
  flowsAffected?: string[];
  flowsAvailable: boolean;
  nextToolSuggestions: string[];
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareStrings);
}

function riskFromScore(score: number): Exclude<MinimalContextRisk, "unknown"> {
  if (score > 0.7) return "high";
  if (score > 0.4) return "medium";
  return "low";
}

function suggestionsForTask(task: string | undefined): string[] {
  const value = (task ?? "").toLowerCase();
  if (/(review|pr|merge|diff)/u.test(value)) return ["detect-changes", "affected-flows", "review-context"];
  if (/(debug|bug|error|fix)/u.test(value)) return ["summary", "query", "flows get"];
  if (/(refactor|rename|dead|clean)/u.test(value)) return ["review-context", "detect-changes", "recommend-commits"];
  if (/(onboard|understand|explore|arch)/u.test(value)) return ["summary", "flows list", "path"];
  return ["detect-changes", "summary", "review-context"];
}

function topCommunities(store: ReviewGraphStoreLike, limit: number): string[] {
  const labels = store.getCommunityLabels();
  const counts = new Map<number, number>();
  for (const node of store.getAllNodes({ excludeFiles: true })) {
    if (node.communityId === null) continue;
    counts.set(node.communityId, (counts.get(node.communityId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([id]) => labels.get(id) ?? `Community ${id}`);
}

function topFlowNames(flows: ReviewFlowArtifact, limit: number): string[] {
  return listFlows(flows, { limit }).map((flow) => flow.name);
}

export function buildMinimalContext(
  store: ReviewGraphStoreLike,
  options: BuildMinimalContextOptions = {},
): MinimalContextResult {
  const stats = store.getGraphStats();
  const changedFiles = uniqueSorted(options.changedFiles ?? []);
  let risk: MinimalContextRisk = "unknown";
  let riskScore = 0;
  let keyEntities: string[] | undefined;
  let testGapCount = 0;

  if (changedFiles.length > 0) {
    const analysis = analyzeChanges(store, changedFiles, { flows: options.flows ?? null });
    riskScore = analysis.riskScore;
    risk = riskFromScore(riskScore);
    keyEntities = analysis.changedFunctions.slice(0, 5).map((node) => node.name);
    testGapCount = analysis.testGaps.length;
  }

  const communities = topCommunities(store, Math.max(0, options.topCommunities ?? 3));
  const flowsAvailable = !!options.flows;
  let flowsAffected: string[] | undefined;
  if (options.flows) {
    flowsAffected = changedFiles.length > 0
      ? getAffectedFlows(options.flows, changedFiles, store).affectedFlows.slice(0, options.topFlows ?? 3).map((flow) => flow.name)
      : topFlowNames(options.flows, options.topFlows ?? 3);
  }

  const summaryParts = [
    `${stats.totalNodes} nodes, ${stats.totalEdges} edges across ${stats.filesCount} files.`,
  ];
  if (risk !== "unknown") summaryParts.push(`Risk: ${risk} (${riskScore.toFixed(2)}).`);
  if (testGapCount > 0) summaryParts.push(`${testGapCount} test gaps.`);

  return {
    summary: summaryParts.join(" "),
    keyEntities: keyEntities && keyEntities.length > 0 ? keyEntities : undefined,
    risk,
    riskScore,
    communities: communities.length > 0 ? communities : undefined,
    flowsAffected: flowsAffected && flowsAffected.length > 0 ? flowsAffected : [],
    flowsAvailable,
    nextToolSuggestions: suggestionsForTask(options.task),
  };
}

export function minimalContextToText(result: MinimalContextResult): string {
  const lines = [
    result.summary,
    `Risk: ${result.risk} (${result.riskScore.toFixed(4)})`,
    `Flows available: ${result.flowsAvailable ? "yes" : "no"}`,
    `Next tools: ${result.nextToolSuggestions.join(", ")}`,
  ];
  if (result.keyEntities) lines.push(`Key entities: ${result.keyEntities.join(", ")}`);
  if (result.communities) lines.push(`Communities: ${result.communities.join(", ")}`);
  if (result.flowsAffected && result.flowsAffected.length > 0) lines.push(`Flows affected: ${result.flowsAffected.join(", ")}`);
  return lines.join("\n");
}

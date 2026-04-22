import type { ReviewFlowArtifact, ReviewFlowDetail } from "./flows.js";
import { getAffectedFlows } from "./flows.js";
import type {
  ReviewGraphNode,
  ReviewGraphStoreLike,
} from "./review-store.js";

export interface ChangedRange {
  start: number;
  end: number;
}

export type ChangedRangesByFile = Record<string, Array<[number, number]> | ChangedRange[]>;

export interface ComputeRiskScoreOptions {
  flows?: ReviewFlowArtifact | null;
}

export interface AnalyzeChangesOptions extends ComputeRiskScoreOptions {
  changedRanges?: ChangedRangesByFile | null;
}

export interface DetectChangesNodeRisk {
  id: string;
  name: string;
  qualifiedName: string;
  kind: string;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  riskScore: number;
}

export interface DetectChangesTestGap {
  name: string;
  qualifiedName: string;
  file: string | null;
  lineStart: number | null;
  lineEnd: number | null;
}

export interface DetectChangesResult {
  status: "ok";
  summary: string;
  riskScore: number;
  changedFiles: string[];
  changedFunctions: DetectChangesNodeRisk[];
  affectedFlows: ReviewFlowDetail[];
  testGaps: DetectChangesTestGap[];
  reviewPriorities: DetectChangesNodeRisk[];
  warnings: string[];
}

export interface DetectChangesMinimalResult {
  status: "ok";
  summary: string;
  riskScore: number;
  changedFileCount: number;
  testGapCount: number;
  reviewPriorities: string[];
  warnings: string[];
}

const SAFE_GIT_REF_RE = /^(?!-)(?!.*\.\.)[A-Za-z0-9_.~^/@{}-]+$/u;

const SECURITY_KEYWORDS = [
  "auth",
  "login",
  "password",
  "token",
  "session",
  "crypt",
  "secret",
  "credential",
  "permission",
  "sql",
  "query",
  "execute",
  "connect",
  "socket",
  "request",
  "http",
  "sanitize",
  "validate",
  "encrypt",
  "decrypt",
  "hash",
  "sign",
  "verify",
  "admin",
  "privilege",
];

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareStrings);
}

function rangeStart(range: [number, number] | ChangedRange): number {
  return Array.isArray(range) ? range[0] : range.start;
}

function rangeEnd(range: [number, number] | ChangedRange): number {
  return Array.isArray(range) ? range[1] : range.end;
}

function sortNodesByLocation(nodes: ReviewGraphNode[]): ReviewGraphNode[] {
  return [...nodes].sort((a, b) => (
    compareStrings(a.filePath ?? "", b.filePath ?? "") ||
    (a.lineStart ?? Number.MAX_SAFE_INTEGER) - (b.lineStart ?? Number.MAX_SAFE_INTEGER) ||
    compareStrings(a.qualifiedName, b.qualifiedName)
  ));
}

function nodeRiskRecord(node: ReviewGraphNode, riskScore: number): DetectChangesNodeRisk {
  return {
    id: node.id,
    name: node.name,
    qualifiedName: node.qualifiedName,
    kind: node.kind,
    filePath: node.filePath,
    lineStart: node.lineStart,
    lineEnd: node.lineEnd,
    riskScore,
  };
}

export function isSafeGitRef(ref: string): boolean {
  return SAFE_GIT_REF_RE.test(ref);
}

export function parseUnifiedDiff(diffText: string): Record<string, Array<[number, number]>> {
  const ranges: Record<string, Array<[number, number]>> = {};
  let currentFile: string | null = null;
  const filePattern = /^\+\+\+ b\/(.+)$/u;
  const hunkPattern = /^@@ .+? \+(\d+)(?:,(\d+))? @@/u;

  for (const line of diffText.split(/\r?\n/u)) {
    const fileMatch = line.match(filePattern);
    if (fileMatch?.[1]) {
      currentFile = fileMatch[1];
      continue;
    }
    const hunkMatch = line.match(hunkPattern);
    if (!hunkMatch?.[1] || currentFile === null) continue;
    const start = Number.parseInt(hunkMatch[1], 10);
    const count = hunkMatch[2] ? Number.parseInt(hunkMatch[2], 10) : 1;
    const end = count === 0 ? start : start + count - 1;
    ranges[currentFile] ??= [];
    ranges[currentFile]!.push([start, end]);
  }

  return ranges;
}

export function mapChangesToNodes(
  store: ReviewGraphStoreLike,
  changedRanges: ChangedRangesByFile,
): ReviewGraphNode[] {
  const seen = new Set<string>();
  const result: ReviewGraphNode[] = [];

  for (const [filePath, ranges] of Object.entries(changedRanges)) {
    let nodes = store.getNodesByFile(filePath);
    if (nodes.length === 0) {
      for (const match of store.getFilesMatching(filePath)) nodes = [...nodes, ...store.getNodesByFile(match)];
    }
    for (const node of nodes) {
      if (seen.has(node.qualifiedName) || node.lineStart === null || node.lineEnd === null) continue;
      if (ranges.some((range) => node.lineStart! <= rangeEnd(range) && node.lineEnd! >= rangeStart(range))) {
        seen.add(node.qualifiedName);
        result.push(node);
      }
    }
  }

  return sortNodesByLocation(result);
}

export function computeRiskScore(
  store: ReviewGraphStoreLike,
  node: ReviewGraphNode,
  options: ComputeRiskScoreOptions = {},
): number {
  let score = 0;

  const flowCriticalities = options.flows?.flows
    .filter((flow) => flow.path.includes(node.id))
    .map((flow) => flow.criticality) ?? [];
  if (flowCriticalities.length > 0) {
    score += Math.min(flowCriticalities.reduce((sum, value) => sum + value, 0), 0.25);
  }

  const callers = store.getEdgesByTarget(node.qualifiedName, "CALLS");
  const nodeCommunity = store.getNodeCommunityId(node.id);
  if (nodeCommunity !== null && callers.length > 0) {
    const callerCommunities = store.getCommunityIdsByQualifiedNames(callers.map((edge) => edge.sourceQualified));
    const crossCommunity = [...callerCommunities.values()].filter((community) => community !== null && community !== nodeCommunity).length;
    score += Math.min(crossCommunity * 0.05, 0.15);
  }

  const testCount = store.getTransitiveTests(node.qualifiedName).length;
  score += 0.30 - Math.min(testCount / 5, 1) * 0.25;

  const name = node.name.toLowerCase();
  const qualified = node.qualifiedName.toLowerCase();
  if (SECURITY_KEYWORDS.some((keyword) => name.includes(keyword) || qualified.includes(keyword))) {
    score += 0.20;
  }

  score += Math.min(callers.length / 20, 0.10);

  return Math.round(Math.min(Math.max(score, 0), 1) * 10000) / 10000;
}

function changedNodesFromFiles(store: ReviewGraphStoreLike, changedFiles: string[]): ReviewGraphNode[] {
  const nodes = new Map<string, ReviewGraphNode>();
  for (const file of changedFiles) {
    for (const node of store.getNodesByFile(file)) nodes.set(node.qualifiedName, node);
  }
  return sortNodesByLocation([...nodes.values()]);
}

function isRiskScoredKind(node: ReviewGraphNode): boolean {
  return node.kind === "Function" || node.kind === "Method" || node.kind === "Test" || node.kind === "Class";
}

function testGapRecord(node: ReviewGraphNode): DetectChangesTestGap {
  return {
    name: node.name,
    qualifiedName: node.qualifiedName,
    file: node.filePath,
    lineStart: node.lineStart,
    lineEnd: node.lineEnd,
  };
}

export function analyzeChanges(
  store: ReviewGraphStoreLike,
  changedFilesInput: string[],
  options: AnalyzeChangesOptions = {},
): DetectChangesResult {
  const changedFiles = uniqueSorted(changedFilesInput);
  const changedNodes = options.changedRanges && Object.keys(options.changedRanges).length > 0
    ? mapChangesToNodes(store, options.changedRanges)
    : changedNodesFromFiles(store, changedFiles);
  const changedFunctions = sortNodesByLocation(changedNodes.filter(isRiskScoredKind));
  const nodeRisks = changedFunctions.map((node) => nodeRiskRecord(node, computeRiskScore(store, node, options)));
  const riskScore = Math.max(...nodeRisks.map((node) => node.riskScore), 0);
  const affectedFlows = options.flows ? getAffectedFlows(options.flows, changedFiles, store).affectedFlows : [];
  const testGaps = changedFunctions
    .filter((node) => !node.isTest && store.getEdgesByTarget(node.qualifiedName, "TESTED_BY").length === 0)
    .map(testGapRecord);
  const reviewPriorities = [...nodeRisks].sort((a, b) => b.riskScore - a.riskScore || compareStrings(a.qualifiedName, b.qualifiedName)).slice(0, 10);
  const summaryLines = [
    `Analyzed ${changedFiles.length} changed file(s):`,
    `  - ${changedFunctions.length} changed function(s)/class(es)`,
    `  - ${affectedFlows.length} affected flow(s)`,
    `  - ${testGaps.length} test gap(s)`,
    `  - Overall risk score: ${riskScore.toFixed(2)}`,
  ];
  if (testGaps.length > 0) summaryLines.push(`  - Untested: ${testGaps.slice(0, 5).map((gap) => gap.name).join(", ")}`);

  return {
    status: "ok",
    summary: summaryLines.join("\n"),
    riskScore,
    changedFiles,
    changedFunctions: nodeRisks,
    affectedFlows,
    testGaps,
    reviewPriorities,
    warnings: [],
  };
}

export function detectChangesToMinimal(result: DetectChangesResult): DetectChangesMinimalResult {
  return {
    status: "ok",
    summary: result.summary,
    riskScore: result.riskScore,
    changedFileCount: result.changedFiles.length,
    testGapCount: result.testGaps.length,
    reviewPriorities: result.reviewPriorities.slice(0, 3).map((priority) => priority.name),
    warnings: result.warnings,
  };
}

export function detectChangesToText(result: DetectChangesResult | DetectChangesMinimalResult): string {
  const lines = [
    result.summary,
    `Risk score: ${result.riskScore.toFixed(4)}`,
  ];
  if ("changedFunctions" in result) {
    lines.push("Review priorities:");
    for (const priority of result.reviewPriorities) {
      lines.push(`- ${priority.name} (${priority.qualifiedName}) risk=${priority.riskScore.toFixed(4)}`);
    }
    lines.push(`Affected flows: ${result.affectedFlows.length}`);
    lines.push(`Test gaps: ${result.testGaps.length}`);
  } else {
    lines.push(`Changed files: ${result.changedFileCount}`);
    lines.push(`Test gaps: ${result.testGapCount}`);
    lines.push(`Review priorities: ${result.reviewPriorities.join(", ") || "none"}`);
  }
  if (result.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return lines.join("\n");
}

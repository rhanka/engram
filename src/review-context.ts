import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

import type {
  ReviewGraphEdge,
  ReviewGraphNode,
  ReviewGraphStoreLike,
} from "./review-store.js";

export type ReviewContextDetailLevel = "minimal" | "standard";
export type ReviewContextRisk = "low" | "medium" | "high";

export interface BuildReviewContextOptions {
  maxDepth?: number;
  detailLevel?: ReviewContextDetailLevel;
  includeSource?: boolean;
  maxLinesPerFile?: number;
  repoRoot?: string;
}

export interface ReviewContextPayload {
  changedFiles: string[];
  impactedFiles: string[];
  graph: {
    changedNodes: ReviewGraphNode[];
    impactedNodes: ReviewGraphNode[];
    edges: ReviewGraphEdge[];
  };
  sourceSnippets?: Record<string, string>;
  reviewGuidance: string;
}

export interface ReviewContextResult {
  status: "ok";
  summary: string;
  risk?: ReviewContextRisk;
  changedFileCount?: number;
  impactedFileCount?: number;
  keyEntities?: string[];
  testGaps?: number;
  nextToolSuggestions?: string[];
  context?: ReviewContextPayload | Record<string, never>;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean).map(normalizePath))].sort(compareStrings);
}

function sourceMatches(sourceFile: string | null, changedFile: string): boolean {
  if (!sourceFile) return false;
  const source = normalizePath(sourceFile);
  const changed = normalizePath(changedFile);
  return source === changed || source.endsWith(`/${changed}`) || changed.endsWith(`/${source}`);
}

function riskForImpactedNodes(count: number): ReviewContextRisk {
  if (count > 20) return "high";
  if (count > 5) return "medium";
  return "low";
}

function changedFunctionsWithoutTests(changedNodes: ReviewGraphNode[], store: ReviewGraphStoreLike): ReviewGraphNode[] {
  return changedNodes.filter((node) => (
    node.kind === "Function" &&
    !node.isTest &&
    store.getEdgesByTarget(node.qualifiedName, "TESTED_BY").length === 0
  ));
}

function isSensitivePath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  const file = basename(normalized);
  return (
    file === ".env" ||
    file === ".npmrc" ||
    /\.(key|pem|p12|pfx|crt|cer)$/iu.test(file) ||
    /(secret|credential|token)/iu.test(normalized)
  );
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !resolve(rel).startsWith(".."));
}

function formatLines(lines: string[], start: number, end: number): string {
  const out: string[] = [];
  for (let i = start; i < end; i += 1) out.push(`${i + 1}: ${lines[i] ?? ""}`);
  return out.join("\n");
}

export function extractRelevantLines(
  lines: string[],
  nodes: ReviewGraphNode[],
  filePath: string,
): string {
  const ranges: Array<[number, number]> = [];
  for (const node of nodes) {
    if (!sourceMatches(node.filePath, filePath) || node.lineStart === null || node.lineEnd === null) continue;
    const start = Math.max(0, node.lineStart - 3);
    const end = Math.min(lines.length, node.lineEnd + 2);
    ranges.push([start, end]);
  }

  if (ranges.length === 0) return formatLines(lines, 0, Math.min(lines.length, 50));

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [ranges[0]!];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1]!;
    if (start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }

  const parts: string[] = [];
  for (const [start, end] of merged) {
    if (parts.length > 0) parts.push("...");
    parts.push(formatLines(lines, start, end));
  }
  return parts.join("\n");
}

function readSourceSnippet(
  changedFile: string,
  changedNodes: ReviewGraphNode[],
  options: Required<Pick<BuildReviewContextOptions, "maxLinesPerFile" | "repoRoot">>,
): string {
  if (isSensitivePath(changedFile)) return "(skipped sensitive file)";
  try {
    const root = realpathSync(resolve(options.repoRoot));
    const fullPath = realpathSync(resolve(root, changedFile));
    if (!isInside(root, fullPath) || !statSync(fullPath).isFile()) return "(could not read file)";
    const content = readFileSync(fullPath, "utf-8");
    if (content.includes("\0")) return "(could not read file)";
    const lines = content.split(/\r?\n/u);
    if (lines.length > options.maxLinesPerFile) {
      return extractRelevantLines(lines, changedNodes, changedFile);
    }
    return formatLines(lines, 0, lines.length);
  } catch {
    return "(could not read file)";
  }
}

function buildSourceSnippets(
  changedFiles: string[],
  changedNodes: ReviewGraphNode[],
  options: Required<Pick<BuildReviewContextOptions, "maxLinesPerFile" | "repoRoot">>,
): Record<string, string> {
  const snippets: Record<string, string> = {};
  for (const file of changedFiles) snippets[file] = readSourceSnippet(file, changedNodes, options);
  return snippets;
}

function buildReviewGuidance(
  changedFiles: string[],
  changedNodes: ReviewGraphNode[],
  impactedFiles: string[],
  impactedNodes: ReviewGraphNode[],
  edges: ReviewGraphEdge[],
  store: ReviewGraphStoreLike,
): string {
  const guidance: string[] = [];
  const untested = changedFunctionsWithoutTests(changedNodes, store);
  if (untested.length > 0) {
    guidance.push(
      `- ${untested.length} changed function(s) lack test coverage: ` +
      untested.slice(0, 5).map((node) => node.name).join(", "),
    );
  }
  if (impactedNodes.length > 20) {
    guidance.push(`- Wide blast radius: ${impactedNodes.length} nodes impacted. Review callers and dependents carefully.`);
  }
  const inheritanceEdges = edges.filter((edge) => edge.kind === "INHERITS" || edge.kind === "IMPLEMENTS");
  if (inheritanceEdges.length > 0) {
    guidance.push(`- ${inheritanceEdges.length} inheritance/implementation relationship(s) affected. Check for Liskov substitution violations.`);
  }
  if (impactedFiles.length > 3) {
    guidance.push(`- Changes impact ${impactedFiles.length} other files. Consider splitting into smaller PRs.`);
  }
  if (guidance.length === 0) guidance.push("- Changes appear well-contained with minimal blast radius.");
  return guidance.join("\n");
}

export function buildReviewContext(
  store: ReviewGraphStoreLike,
  changedFilesInput: string[],
  options: BuildReviewContextOptions = {},
): ReviewContextResult {
  const changedFiles = uniqueSorted(changedFilesInput);
  if (changedFiles.length === 0) {
    return {
      status: "ok",
      summary: "No changes detected. Nothing to review.",
      context: {},
    };
  }

  const maxDepth = Math.max(0, options.maxDepth ?? 2);
  const impact = store.getImpactRadius(changedFiles, { maxDepth });
  const changedNodes = impact.changedNodes;
  const impactedNodes = impact.impactedNodes;
  const impactedFiles = impact.impactedFiles;

  if (options.detailLevel === "minimal") {
    const risk = riskForImpactedNodes(impactedNodes.length);
    const summary = [
      `Review context for ${changedFiles.length} changed file(s):`,
      `  - Risk: ${risk}`,
      `  - ${impactedNodes.length} impacted nodes in ${impactedFiles.length} files`,
    ].join("\n");
    return {
      status: "ok",
      summary,
      risk,
      changedFileCount: changedFiles.length,
      impactedFileCount: impactedFiles.length,
      keyEntities: changedNodes.slice(0, 5).map((node) => node.name),
      testGaps: changedFunctionsWithoutTests(changedNodes, store).length,
      nextToolSuggestions: ["detect-changes", "affected-flows", "review-context"],
    };
  }

  const guidance = buildReviewGuidance(changedFiles, changedNodes, impactedFiles, impactedNodes, impact.edges, store);
  const payload: ReviewContextPayload = {
    changedFiles,
    impactedFiles,
    graph: {
      changedNodes,
      impactedNodes,
      edges: impact.edges,
    },
    reviewGuidance: guidance,
  };
  if (options.includeSource) {
    payload.sourceSnippets = buildSourceSnippets(changedFiles, changedNodes, {
      repoRoot: options.repoRoot ?? ".",
      maxLinesPerFile: Math.max(1, options.maxLinesPerFile ?? 200),
    });
  }
  const summary = [
    `Review context for ${changedFiles.length} changed file(s):`,
    `  - ${changedNodes.length} directly changed nodes`,
    `  - ${impactedNodes.length} impacted nodes in ${impactedFiles.length} files`,
    "",
    "Review guidance:",
    guidance,
  ].join("\n");
  return {
    status: "ok",
    summary,
    context: payload,
  };
}

export function reviewContextToText(result: ReviewContextResult): string {
  const lines = [result.summary];
  if (result.risk) lines.push(`Risk: ${result.risk}`);
  if (result.keyEntities) lines.push(`Key entities: ${result.keyEntities.join(", ") || "none"}`);
  if (typeof result.testGaps === "number") lines.push(`Test gaps: ${result.testGaps}`);
  if (result.nextToolSuggestions) lines.push(`Next tools: ${result.nextToolSuggestions.join(", ")}`);
  if (result.context && "reviewGuidance" in result.context) {
    lines.push("", "Changed files:");
    for (const file of result.context.changedFiles) lines.push(`- ${file}`);
    lines.push("Impacted files:");
    for (const file of result.context.impactedFiles) lines.push(`- ${file}`);
    if (result.context.sourceSnippets) {
      lines.push("Source snippets:");
      for (const [file, snippet] of Object.entries(result.context.sourceSnippets)) {
        lines.push(`--- ${file} ---`, snippet);
      }
    }
  }
  return lines.join("\n");
}

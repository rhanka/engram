import { analyzeChanges, type ChangedRangesByFile } from "./detect-changes.js";
import { buildReviewContext, reviewContextToText } from "./review-context.js";
import type { ReviewFlowArtifact } from "./flows.js";
import type { ReviewGraphStoreLike } from "./review-store.js";

export interface ReviewBenchmarkCase {
  name: string;
  changedFiles: string[];
  changedRanges?: ChangedRangesByFile;
  expectedChangedNodes?: string[];
  expectedImpactedFiles?: string[];
  expectedAffectedFlows?: string[];
  expectedTestGaps?: string[];
  expectedSummaryFacts?: string[];
  naiveTokenEstimate?: number;
  tokenBudget?: number;
}

export interface ReviewBenchmarkOptions {
  flows?: ReviewFlowArtifact | null;
  maxDepth?: number;
  defaultTokenBudget?: number;
}

export type ReviewBenchmarkTokenBudgetStatus = "pass" | "fail";

export interface ReviewBenchmarkMetrics {
  changedNodeRecall: number | null;
  impactedFilePrecision: number | null;
  impactedFileRecall: number | null;
  impactedFileF1: number | null;
  flowCompleteness: number | null;
  testGapRecall: number | null;
  summaryFactRecall: number | null;
  falsePositiveCount: number;
  estimatedTokenCount: number;
  tokenBudget: number;
  tokenBudgetStatus: ReviewBenchmarkTokenBudgetStatus;
}

export interface ReviewBenchmarkCaseResult {
  name: string;
  changedFiles: string[];
  metrics: ReviewBenchmarkMetrics;
  actual: {
    changedNodes: string[];
    impactedFiles: string[];
    affectedFlows: string[];
    testGaps: string[];
  };
  notes: string[];
}

export interface ReviewBenchmarkResult {
  cases: ReviewBenchmarkCaseResult[];
  aggregate: Omit<ReviewBenchmarkMetrics, "tokenBudget" | "tokenBudgetStatus"> & {
    tokenBudgetPassRate: number | null;
  };
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normalize(value: string): string {
  return value.trim().replace(/\\/g, "/");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(normalize).filter(Boolean))].sort(compareStrings);
}

function identifiers(values: Array<{ id?: string; name?: string; qualifiedName?: string }>): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    if (value.id) result.add(normalize(value.id));
    if (value.name) result.add(normalize(value.name));
    if (value.qualifiedName) result.add(normalize(value.qualifiedName));
  }
  return result;
}

function flowIdentifiers(values: Array<{ id: string; name: string; entryPoint: string }>): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    result.add(normalize(value.id));
    result.add(normalize(value.name));
    result.add(normalize(value.entryPoint));
  }
  return result;
}

function ratio(hits: number, total: number): number | null {
  return total > 0 ? hits / total : null;
}

function f1(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null || precision + recall === 0) return null;
  return (2 * precision * recall) / (precision + recall);
}

function average(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (usable.length === 0) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function countHits(expected: string[] | undefined, actual: Set<string>): number {
  return uniqueSorted(expected ?? []).filter((item) => actual.has(item)).length;
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : (value * 100).toFixed(1) + "%";
}

export function evaluateReviewBenchmarks(
  store: ReviewGraphStoreLike,
  cases: ReviewBenchmarkCase[],
  options: ReviewBenchmarkOptions = {},
): ReviewBenchmarkResult {
  const results = cases.map((testCase) => {
    const changes = analyzeChanges(store, testCase.changedFiles, {
      changedRanges: testCase.changedRanges ?? null,
      flows: options.flows ?? null,
    });
    const context = buildReviewContext(store, testCase.changedFiles, {
      detailLevel: "standard",
      maxDepth: options.maxDepth ?? 2,
    });
    const contextPayload = context.context;
    const impactedFiles = contextPayload && "reviewGuidance" in contextPayload
      ? uniqueSorted(contextPayload.impactedFiles)
      : [];
    const changedNodes = identifiers(changes.changedFunctions);
    const affectedFlows = flowIdentifiers(changes.affectedFlows);
    const testGaps = identifiers(changes.testGaps.map((gap) => ({
      name: gap.name,
      qualifiedName: gap.qualifiedName,
      id: gap.qualifiedName,
    })));
    const expectedChangedNodes = uniqueSorted(testCase.expectedChangedNodes ?? []);
    const expectedImpactedFiles = uniqueSorted(testCase.expectedImpactedFiles ?? []);
    const expectedAffectedFlows = uniqueSorted(testCase.expectedAffectedFlows ?? []);
    const expectedTestGaps = uniqueSorted(testCase.expectedTestGaps ?? []);
    const expectedSummaryFacts = uniqueSorted(testCase.expectedSummaryFacts ?? []);

    const changedHits = countHits(expectedChangedNodes, changedNodes);
    const impactedSet = new Set(impactedFiles);
    const impactedHits = expectedImpactedFiles.filter((file) => impactedSet.has(file)).length;
    const changedFileSet = new Set(uniqueSorted(testCase.changedFiles));
    const falsePositiveCount = impactedFiles.filter((file) => (
      expectedImpactedFiles.length > 0 &&
      !expectedImpactedFiles.includes(file) &&
      !changedFileSet.has(file)
    )).length;
    const flowHits = countHits(expectedAffectedFlows, affectedFlows);
    const testGapHits = countHits(expectedTestGaps, testGaps);
    const summaryText = [
      changes.summary,
      reviewContextToText(context),
      changes.reviewPriorities.map((node) => node.name).join(" "),
      changes.affectedFlows.map((flow) => flow.name).join(" "),
    ].join("\n");
    const lowerSummary = summaryText.toLowerCase();
    const summaryHits = expectedSummaryFacts.filter((fact) => lowerSummary.includes(fact.toLowerCase())).length;
    const estimatedTokenCount = estimateTokens(summaryText);
    const tokenBudget = Math.max(1, testCase.tokenBudget ?? options.defaultTokenBudget ?? testCase.naiveTokenEstimate ?? 800);
    const impactedFilePrecision = ratio(impactedHits, expectedImpactedFiles.length > 0 ? impactedFiles.length : 0);
    const impactedFileRecall = ratio(impactedHits, expectedImpactedFiles.length);
    const metrics: ReviewBenchmarkMetrics = {
      changedNodeRecall: ratio(changedHits, expectedChangedNodes.length),
      impactedFilePrecision,
      impactedFileRecall,
      impactedFileF1: f1(impactedFilePrecision, impactedFileRecall),
      flowCompleteness: ratio(flowHits, expectedAffectedFlows.length),
      testGapRecall: ratio(testGapHits, expectedTestGaps.length),
      summaryFactRecall: ratio(summaryHits, expectedSummaryFacts.length),
      falsePositiveCount,
      estimatedTokenCount,
      tokenBudget,
      tokenBudgetStatus: estimatedTokenCount <= tokenBudget ? "pass" : "fail",
    };
    const notes: string[] = [];
    if (falsePositiveCount > 0) notes.push(`${falsePositiveCount} false positives reported, not hidden`);
    if (metrics.flowCompleteness !== null && metrics.flowCompleteness < 1) notes.push("flow completeness below expectation");
    if (metrics.tokenBudgetStatus === "fail") notes.push("estimated graph context exceeds token budget");

    return {
      name: testCase.name,
      changedFiles: uniqueSorted(testCase.changedFiles),
      metrics,
      actual: {
        changedNodes: uniqueSorted([...changedNodes]),
        impactedFiles,
        affectedFlows: uniqueSorted([...affectedFlows]),
        testGaps: uniqueSorted([...testGaps]),
      },
      notes,
    };
  });

  return {
    cases: results,
    aggregate: {
      changedNodeRecall: average(results.map((item) => item.metrics.changedNodeRecall)),
      impactedFilePrecision: average(results.map((item) => item.metrics.impactedFilePrecision)),
      impactedFileRecall: average(results.map((item) => item.metrics.impactedFileRecall)),
      impactedFileF1: average(results.map((item) => item.metrics.impactedFileF1)),
      flowCompleteness: average(results.map((item) => item.metrics.flowCompleteness)),
      testGapRecall: average(results.map((item) => item.metrics.testGapRecall)),
      summaryFactRecall: average(results.map((item) => item.metrics.summaryFactRecall)),
      falsePositiveCount: results.reduce((sum, item) => sum + item.metrics.falsePositiveCount, 0),
      estimatedTokenCount: results.reduce((sum, item) => sum + item.metrics.estimatedTokenCount, 0),
      tokenBudgetPassRate: ratio(
        results.filter((item) => item.metrics.tokenBudgetStatus === "pass").length,
        results.length,
      ),
    },
  };
}

export function reviewBenchmarkToMarkdown(result: ReviewBenchmarkResult): string {
  const lines = [
    "# Graphify Review Benchmarks",
    "",
    "> Token metrics are estimated from graph review text unless backed by actual model usage.",
    "> Flow quality depends on parser/call metadata; weak or undirected metadata can reduce completeness.",
    "",
    "## Aggregate",
    "",
    `- Changed-node recall: ${formatMetric(result.aggregate.changedNodeRecall)}`,
    `- Impacted-file precision: ${formatMetric(result.aggregate.impactedFilePrecision)}`,
    `- Impacted-file recall: ${formatMetric(result.aggregate.impactedFileRecall)}`,
    `- Impacted-file F1: ${formatMetric(result.aggregate.impactedFileF1)}`,
    `- Flow completeness: ${formatMetric(result.aggregate.flowCompleteness)}`,
    `- Test-gap recall: ${formatMetric(result.aggregate.testGapRecall)}`,
    `- Summary fact recall: ${formatMetric(result.aggregate.summaryFactRecall)}`,
    `- False positives: ${result.aggregate.falsePositiveCount}`,
    `- Estimated graph-context tokens: ${result.aggregate.estimatedTokenCount}`,
    `- Token budget pass rate: ${formatMetric(result.aggregate.tokenBudgetPassRate)}`,
    "",
    "## Cases",
    "",
  ];

  for (const testCase of result.cases) {
    lines.push(
      `### ${testCase.name}`,
      "",
      `- changed files: ${testCase.changedFiles.join(", ") || "none"}`,
      `- changed-node recall: ${formatMetric(testCase.metrics.changedNodeRecall)}`,
      `- impacted-file precision: ${formatMetric(testCase.metrics.impactedFilePrecision)}`,
      `- impacted-file recall: ${formatMetric(testCase.metrics.impactedFileRecall)}`,
      `- flow completeness: ${formatMetric(testCase.metrics.flowCompleteness)}`,
      `- test-gap recall: ${formatMetric(testCase.metrics.testGapRecall)}`,
      `- false positives: ${testCase.metrics.falsePositiveCount}`,
      `- estimated tokens: ${testCase.metrics.estimatedTokenCount}/${testCase.metrics.tokenBudget} (${testCase.metrics.tokenBudgetStatus})`,
    );
    if (testCase.notes.length > 0) {
      lines.push(`- notes: ${testCase.notes.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

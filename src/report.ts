/**
 * Generate GRAPH_REPORT.md - the human-readable audit trail.
 */
import Graph from "graphology";
import type { GodNodeEntry, SurpriseEntry, SuggestedQuestion, DetectionResult } from "./types.js";
import { type NumericMapLike, toNumericMap } from "./collections.js";
import { isFileNode, isConceptNode } from "./analyze.js";
import type { AffectedFlowsResult, ReviewFlow, ReviewFlowArtifact } from "./flows.js";

export interface ReportHighRiskNode {
  name: string;
  file?: string | null;
  riskScore?: number | null;
  reason?: string | null;
}

export interface ReportTestGap {
  name: string;
  file?: string | null;
  reason?: string | null;
}

export interface ReportReviewOptions {
  flows?: ReviewFlowArtifact | ReviewFlow[] | null;
  affectedFlows?: AffectedFlowsResult | ReviewFlow[] | null;
  highRiskNodes?: ReportHighRiskNode[] | null;
  testGaps?: ReportTestGap[] | null;
}

export interface GenerateReportOptions {
  suggestedQuestions?: SuggestedQuestion[] | null;
  review?: ReportReviewOptions | null;
  freshness?: {
    builtFromCommit?: string | null;
  } | null;
}

function compareFlowCriticality(a: ReviewFlow, b: ReviewFlow): number {
  return b.criticality - a.criticality || a.name.localeCompare(b.name);
}

function normalizeFlows(input?: ReviewFlowArtifact | ReviewFlow[] | null): ReviewFlow[] {
  if (!input) return [];
  return Array.isArray(input) ? input : input.flows;
}

function normalizeAffectedFlows(input?: AffectedFlowsResult | ReviewFlow[] | null): ReviewFlow[] {
  if (!input) return [];
  return Array.isArray(input) ? input : input.affectedFlows;
}

function formatFlow(flow: ReviewFlow): string {
  const files = flow.files.length > 0 ? ` · files ${flow.files.join(", ")}` : "";
  return `- **${flow.name}** entry=\`${flow.entryPoint}\` criticality ${flow.criticality.toFixed(4)} ` +
    `depth ${flow.depth} · nodes ${flow.nodeCount}${files}`;
}

function appendReviewSections(lines: string[], review?: ReportReviewOptions | null): void {
  if (!review) return;

  const topFlows = [...normalizeFlows(review.flows)].sort(compareFlowCriticality).slice(0, 5);
  if (topFlows.length > 0) {
    lines.push("## Execution Flows");
    for (const flow of topFlows) lines.push(formatFlow(flow));
    lines.push("");
  }

  const affectedFlows = [...normalizeAffectedFlows(review.affectedFlows)].sort(compareFlowCriticality).slice(0, 8);
  if (affectedFlows.length > 0) {
    lines.push("## Affected Flows");
    if (review.affectedFlows && !Array.isArray(review.affectedFlows)) {
      lines.push(`Changed files: ${review.affectedFlows.changedFiles.join(", ") || "none"}`);
    }
    for (const flow of affectedFlows) lines.push(formatFlow(flow));
    lines.push("");
  }

  const highRiskNodes = review.highRiskNodes ?? [];
  if (highRiskNodes.length > 0) {
    lines.push("## High-Risk Nodes");
    for (const node of highRiskNodes.slice(0, 12)) {
      const file = node.file ? ` · \`${node.file}\`` : "";
      const score = node.riskScore != null ? ` · risk ${node.riskScore.toFixed(4)}` : "";
      const reason = node.reason ? ` · ${node.reason}` : "";
      lines.push(`- **${node.name}**${file}${score}${reason}`);
    }
    lines.push("");
  }

  const testGaps = review.testGaps ?? [];
  if (testGaps.length > 0) {
    lines.push("## Test Gaps");
    for (const gap of testGaps.slice(0, 12)) {
      const file = gap.file ? ` · \`${gap.file}\`` : "";
      const reason = gap.reason ? ` · ${gap.reason}` : "";
      lines.push(`- **${gap.name}**${file}${reason}`);
    }
    lines.push("");
  }
}

function appendInputScopeSection(lines: string[], detectionResult: DetectionResult): void {
  const scope = detectionResult.scope;
  if (!scope) return;

  const included = scope.included_count ?? "n/a";
  const candidate = scope.candidate_count ?? "recursive";
  lines.push(
    "",
    "## Input Scope",
    `- Requested: ${scope.requested_mode}`,
    `- Resolved: ${scope.resolved_mode} (source: ${scope.source})`,
    `- Included files: ${included} · Candidates: ${candidate}`,
    `- Excluded: ${scope.excluded_untracked_count} untracked · ${scope.excluded_ignored_count} ignored · ${scope.excluded_sensitive_count} sensitive · ${scope.missing_committed_count} missing committed`,
  );
  for (const warning of scope.warnings) {
    lines.push(`- Warning: ${warning}`);
  }
  if (scope.recommendation) {
    lines.push(`- Recommendation: ${scope.recommendation}`);
  }
}

function appendFreshnessSection(
  lines: string[],
  freshness?: GenerateReportOptions["freshness"],
): void {
  const builtFromCommit = freshness?.builtFromCommit?.trim();
  if (!builtFromCommit) return;
  const shortCommit = builtFromCommit.slice(0, 7);
  lines.push(
    "",
    "## Graph Freshness",
    `- Built from Git commit: \`${shortCommit}\``,
    "- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.",
  );
}

export function generate(
  G: Graph,
  communities: NumericMapLike<string[]>,
  cohesionScores: NumericMapLike<number>,
  communityLabels: NumericMapLike<string>,
  godNodeList: GodNodeEntry[],
  surpriseList: SurpriseEntry[],
  detectionResult: DetectionResult,
  tokenCost: { input: number; output: number },
  root: string,
  suggestedQuestions?:
    | SuggestedQuestion[]
    | GenerateReportOptions
    | null,
): string {
  const communityMap = toNumericMap(communities);
  const cohesionMap = toNumericMap(cohesionScores);
  const labelMap = toNumericMap(communityLabels);
  const suggestedQuestionList = Array.isArray(suggestedQuestions)
    ? suggestedQuestions
    : (suggestedQuestions?.suggestedQuestions ?? null);
  const reviewOptions = Array.isArray(suggestedQuestions)
    ? null
    : (suggestedQuestions?.review ?? null);
  const freshnessOptions = Array.isArray(suggestedQuestions)
    ? null
    : (suggestedQuestions?.freshness ?? null);
  const today = new Date().toISOString().slice(0, 10);

  const confidences: string[] = [];
  G.forEachEdge((_, data) => {
    confidences.push((data.confidence as string) ?? "EXTRACTED");
  });
  const total = confidences.length || 1;
  const extPct = Math.round((confidences.filter((c) => c === "EXTRACTED").length / total) * 100);
  const infPct = Math.round((confidences.filter((c) => c === "INFERRED").length / total) * 100);
  const ambPct = Math.round((confidences.filter((c) => c === "AMBIGUOUS").length / total) * 100);

  const infEdges: { score: number }[] = [];
  G.forEachEdge((_, data) => {
    if (data.confidence === "INFERRED") {
      infEdges.push({ score: (data.confidence_score as number) ?? 0.5 });
    }
  });
  const infAvg = infEdges.length > 0
    ? Math.round((infEdges.reduce((s, e) => s + e.score, 0) / infEdges.length) * 100) / 100
    : null;
  const nonEmptyCommunities = new Map<number, string[]>();
  for (const [cid, nodes] of communityMap) {
    const realNodes = nodes.filter((n) => !isFileNode(G, n));
    if (realNodes.length > 0) nonEmptyCommunities.set(cid, realNodes);
  }

  const lines: string[] = [
    `# Graph Report - ${root}  (${today})`,
    "",
    "## Corpus Check",
  ];

  if (detectionResult.warning) {
    lines.push(`- ${detectionResult.warning}`);
  } else {
    lines.push(
      `- ${detectionResult.total_files} files · ~${detectionResult.total_words.toLocaleString()} words`,
      "- Verdict: corpus is large enough that graph structure adds value.",
    );
  }

  lines.push(
    "",
    "## Summary",
    `- ${G.order} nodes · ${G.size} edges · ${nonEmptyCommunities.size} communities detected`,
    `- Extraction: ${extPct}% EXTRACTED · ${infPct}% INFERRED · ${ambPct}% AMBIGUOUS` +
      (infAvg !== null ? ` · INFERRED: ${infEdges.length} edges (avg confidence: ${infAvg})` : ""),
    `- Token cost: ${tokenCost.input.toLocaleString()} input · ${tokenCost.output.toLocaleString()} output`,
    "",
  );

  appendInputScopeSection(lines, detectionResult);
  appendFreshnessSection(lines, freshnessOptions);

  appendReviewSections(lines, reviewOptions);

  lines.push("## God Nodes (most connected - your core abstractions)");

  godNodeList.forEach((node, i) => {
    const degree = node.degree ?? node.edges;
    lines.push(`${i + 1}. \`${node.label}\` - ${degree} edges`);
  });

  lines.push("", "## Surprising Connections (you probably didn't know these)");
  if (surpriseList.length > 0) {
    for (const s of surpriseList) {
      const relation = s.relation ?? "related_to";
      const note = s.note ?? "";
      const files = s.source_files ?? ["", ""];
      const conf = s.confidence ?? "EXTRACTED";
      const cscore = s.confidence_score;
      const confTag = conf === "INFERRED" && cscore != null ? `INFERRED ${cscore.toFixed(2)}` : conf;
      const semTag = relation === "semantically_similar_to" ? " [semantically similar]" : "";
      lines.push(
        `- \`${s.source}\` --${relation}--> \`${s.target}\`  [${confTag}]${semTag}`,
        `  ${files[0]} → ${files[1]}${note ? `  _${note}_` : ""}`,
      );
    }
  } else {
    lines.push("- None detected - all connections are within the same source files.");
  }

  const hyperedges = (G.getAttribute("hyperedges") as Array<Record<string, unknown>>) ?? [];
  if (hyperedges.length > 0) {
    lines.push("", "## Hyperedges (group relationships)");
    for (const h of hyperedges) {
      const nodeLabels = ((h.nodes as string[]) ?? []).join(", ");
      const conf = (h.confidence as string) ?? "INFERRED";
      const cscore = h.confidence_score as number | undefined;
      const confTag = cscore != null ? `${conf} ${cscore.toFixed(2)}` : conf;
      lines.push(`- **${h.label ?? h.id ?? ""}** — ${nodeLabels} [${confTag}]`);
    }
  }

  lines.push("", "## Communities");
  for (const [cid, nodes] of communityMap) {
    const label = labelMap.get(cid) ?? `Community ${cid}`;
    const score = cohesionMap.get(cid) ?? 0.0;
    const realNodes = nonEmptyCommunities.get(cid) ?? [];
    if (realNodes.length === 0) continue;
    const display = realNodes.slice(0, 8).map((n) => (G.getNodeAttribute(n, "label") as string | undefined) ?? n);
    const suffix = realNodes.length > 8 ? ` (+${realNodes.length - 8} more)` : "";
    lines.push(
      "",
      `### Community ${cid} - "${label}"`,
      `Cohesion: ${score}`,
      `Nodes (${realNodes.length}): ${display.join(", ")}${suffix}`.trimEnd(),
    );
  }

  const ambiguous: [string, string, Record<string, unknown>][] = [];
  G.forEachEdge((_, data, u, v) => {
    if (data.confidence === "AMBIGUOUS") ambiguous.push([u, v, data]);
  });
  if (ambiguous.length > 0) {
    lines.push("", "## Ambiguous Edges - Review These");
    for (const [u, v, d] of ambiguous) {
      const ul = (G.getNodeAttribute(u, "label") as string) ?? u;
      const vl = (G.getNodeAttribute(v, "label") as string) ?? v;
      lines.push(
        `- \`${ul}\` → \`${vl}\`  [AMBIGUOUS]`,
        `  ${d.source_file ?? ""} · relation: ${d.relation ?? "unknown"}`,
      );
    }
  }

  // Gaps section
  const isolated = G.nodes().filter(
    (n) => G.degree(n) <= 1 && !isFileNode(G, n) && !isConceptNode(G, n),
  );
  const thinCommunities = new Map<number, string[]>();
  for (const [cid, nodes] of nonEmptyCommunities) {
    if (nodes.length < 3) thinCommunities.set(cid, nodes);
  }
  const gapCount = isolated.length + thinCommunities.size;

  if (gapCount > 0 || ambPct > 20) {
    lines.push("", "## Knowledge Gaps");
    if (isolated.length > 0) {
      const isolatedLabels = isolated.slice(0, 5).map((n) => (G.getNodeAttribute(n, "label") as string | undefined) ?? n);
      const suffix = isolated.length > 5 ? ` (+${isolated.length - 5} more)` : "";
      lines.push(
        `- **${isolated.length} isolated node(s):** ${isolatedLabels.map((l) => `\`${l}\``).join(", ")}${suffix}`,
        "  These have ≤1 connection - possible missing edges or undocumented components.",
      );
    }
    if (thinCommunities.size > 0) {
      for (const [cid, nodes] of thinCommunities) {
        const label = labelMap.get(cid) ?? `Community ${cid}`;
        const nodeLabels = nodes.map((n) => (G.getNodeAttribute(n, "label") as string | undefined) ?? n);
        lines.push(
          `- **Thin community \`${label}\`** (${nodes.length} nodes): ${nodeLabels.map((l) => `\`${l}\``).join(", ")}`,
          "  Too small to be a meaningful cluster - may be noise or needs more connections extracted.",
        );
      }
    }
    if (ambPct > 20) {
      lines.push(`- **High ambiguity: ${ambPct}% of edges are AMBIGUOUS.** Review the Ambiguous Edges section above.`);
    }
  }

  if (suggestedQuestionList && suggestedQuestionList.length > 0) {
    lines.push("", "## Suggested Questions");
    const noSignal = suggestedQuestionList.length === 1 && suggestedQuestionList[0]!.type === "no_signal";
    if (noSignal) {
      lines.push(`_${suggestedQuestionList[0]!.why}_`);
    } else {
      lines.push("_Questions this graph is uniquely positioned to answer:_", "");
      for (const q of suggestedQuestionList) {
        if (q.question) {
          lines.push(`- **${q.question}**`, `  _${q.why}_`);
        }
      }
    }
  }

  return lines.join("\n");
}

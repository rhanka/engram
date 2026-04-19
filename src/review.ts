import { extname } from "node:path";
import Graph from "graphology";

import { isFileNode } from "./analyze.js";
import { CODE_EXTENSIONS } from "./detect.js";
import { forEachTraversalNeighbor } from "./graph.js";
import { sanitizeLabel } from "./security.js";

export interface ReviewNode {
  id: string;
  label: string;
  degree: number;
  source_file: string | null;
  community: number | null;
}

export interface ReviewChain {
  nodes: ReviewNode[];
  relations: string[];
  confidences: string[];
  risk: string;
}

export interface ReviewDelta {
  changed_files: string[];
  impacted_files: string[];
  changed_nodes: ReviewNode[];
  impacted_nodes: ReviewNode[];
  hub_nodes: ReviewNode[];
  bridge_nodes: ReviewNode[];
  likely_test_gaps: string[];
  high_risk_chains: ReviewChain[];
  next_best_action: string;
}

export interface ReviewDeltaOptions {
  maxNodes?: number;
  maxHubs?: number;
  maxChains?: number;
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

function maybeCommunity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nodeInfo(G: Graph, nodeId: string): ReviewNode {
  const attrs = G.getNodeAttributes(nodeId);
  return {
    id: nodeId,
    label: sanitizeLabel((attrs.label as string | undefined) ?? nodeId),
    degree: G.degree(nodeId),
    source_file: typeof attrs.source_file === "string" && attrs.source_file.length > 0
      ? normalizePath(attrs.source_file)
      : null,
    community: maybeCommunity(attrs.community),
  };
}

function compareNodes(a: ReviewNode, b: ReviewNode): number {
  return b.degree - a.degree || compareStrings(a.label, b.label) || compareStrings(a.id, b.id);
}

function sourceMatches(sourceFile: string | null, changedFile: string): boolean {
  if (!sourceFile) return false;
  const source = normalizePath(sourceFile);
  const changed = normalizePath(changedFile);
  return source === changed || source.endsWith(`/${changed}`) || changed.endsWith(`/${source}`);
}

function changedNodeIds(G: Graph, changedFiles: string[]): string[] {
  const result: string[] = [];
  G.forEachNode((nodeId, attrs) => {
    const source = typeof attrs.source_file === "string" ? attrs.source_file : null;
    if (changedFiles.some((file) => sourceMatches(source, file))) {
      result.push(nodeId);
    }
  });
  return result.sort(compareStrings);
}

function impactedNodeIds(G: Graph, starts: string[], maxNodes: number): string[] {
  const impacted = new Set(starts);
  for (const nodeId of starts) {
    forEachTraversalNeighbor(G, nodeId, (neighbor) => {
      if (impacted.size < maxNodes) impacted.add(neighbor);
    });
  }
  return [...impacted].sort((a, b) => G.degree(b) - G.degree(a) || compareStrings(a, b));
}

function neighborCommunities(G: Graph, nodeId: string): Set<number> {
  const communities = new Set<number>();
  forEachTraversalNeighbor(G, nodeId, (neighbor) => {
    const community = maybeCommunity(G.getNodeAttribute(neighbor, "community"));
    if (community !== null) communities.add(community);
  });
  return communities;
}

function isCodePath(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase());
}

function isTestPath(path: string): boolean {
  const normalized = normalizePath(path).toLowerCase();
  return (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/__tests__/") ||
    /(?:^|[._-])(test|spec)\.[^.]+$/.test(normalized)
  );
}

function stem(path: string): string {
  const file = normalizePath(path).split("/").pop() ?? path;
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[._-](test|spec)$/i, "");
}

function likelyTestGaps(changedFiles: string[], impactedFiles: string[]): string[] {
  const tests = impactedFiles.filter(isTestPath);
  return changedFiles
    .filter((file) => isCodePath(file) && !isTestPath(file))
    .filter((file) => {
      const base = stem(file).toLowerCase();
      return !tests.some((test) => stem(test).toLowerCase().includes(base));
    })
    .map((file) => `${file}: no related test file surfaced in the impacted graph`);
}

function edgeText(G: Graph, source: string, target: string): { relation: string; confidence: string } {
  const edge = G.edge(source, target);
  const attrs = edge ? G.getEdgeAttributes(edge) : {};
  return {
    relation: sanitizeLabel((attrs.relation as string | undefined) ?? "related_to"),
    confidence: sanitizeLabel((attrs.confidence as string | undefined) ?? "EXTRACTED"),
  };
}

function riskFor(G: Graph, nodeId: string, confidence: string): string | null {
  if (confidence === "AMBIGUOUS") return "ambiguous relationship touches review scope";
  if (confidence === "INFERRED") return "inferred relationship touches review scope";
  if (G.degree(nodeId) >= 5) return "high-degree dependency touches review scope";
  const communities = neighborCommunities(G, nodeId);
  if (communities.size >= 2) return "cross-community bridge touches review scope";
  return null;
}

function highRiskChains(
  G: Graph,
  starts: string[],
  impacted: Set<string>,
  maxChains: number,
): ReviewChain[] {
  const chains: ReviewChain[] = [];
  const seen = new Set<string>();

  function addChain(nodes: string[], relations: string[], confidences: string[], risk: string): void {
    const key = nodes.join("->") + `:${relations.join("|")}`;
    if (seen.has(key) || chains.length >= maxChains) return;
    seen.add(key);
    chains.push({
      nodes: nodes.map((nodeId) => nodeInfo(G, nodeId)),
      relations,
      confidences,
      risk,
    });
  }

  for (const start of starts) {
    forEachTraversalNeighbor(G, start, (first) => {
      if (!impacted.has(first)) return;
      const firstEdge = edgeText(G, start, first);
      const firstRisk = riskFor(G, first, firstEdge.confidence);
      if (firstRisk) addChain([start, first], [firstEdge.relation], [firstEdge.confidence], firstRisk);

      forEachTraversalNeighbor(G, first, (second) => {
        if (second === start || !impacted.has(second)) return;
        const secondEdge = edgeText(G, first, second);
        const secondRisk = riskFor(G, second, secondEdge.confidence);
        if (!secondRisk) return;
        addChain(
          [start, first, second],
          [firstEdge.relation, secondEdge.relation],
          [firstEdge.confidence, secondEdge.confidence],
          secondRisk,
        );
      });
    });
  }

  return chains.sort((a, b) => {
    const aDegree = a.nodes.reduce((sum, node) => sum + node.degree, 0);
    const bDegree = b.nodes.reduce((sum, node) => sum + node.degree, 0);
    return bDegree - aDegree || compareStrings(chainLabel(a), chainLabel(b));
  }).slice(0, maxChains);
}

function chainLabel(chain: ReviewChain): string {
  return chain.nodes.map((node) => node.label).join(" -> ");
}

export function buildReviewDelta(
  G: Graph,
  changedFilesInput: string[],
  options: ReviewDeltaOptions = {},
): ReviewDelta {
  const maxNodes = Math.max(1, options.maxNodes ?? 80);
  const maxHubs = Math.max(0, options.maxHubs ?? 8);
  const maxChains = Math.max(0, options.maxChains ?? 8);
  const changedFiles = uniqueSorted(changedFilesInput);
  const changedIds = changedNodeIds(G, changedFiles);
  const impactedIds = impactedNodeIds(G, changedIds, maxNodes);
  const impactedSet = new Set(impactedIds);
  const changedNodes = changedIds.map((nodeId) => nodeInfo(G, nodeId)).sort(compareNodes);
  const impactedNodes = impactedIds.map((nodeId) => nodeInfo(G, nodeId)).sort(compareNodes);
  const impactedFiles = uniqueSorted(impactedNodes.map((node) => node.source_file ?? ""));
  const hubNodes = impactedNodes
    .filter((node) => node.degree > 1 && !isFileNode(G, node.id))
    .sort(compareNodes)
    .slice(0, maxHubs);
  const bridgeNodes = impactedNodes
    .filter((node) => !isFileNode(G, node.id) && neighborCommunities(G, node.id).size >= 2)
    .sort((a, b) => (
      neighborCommunities(G, b.id).size - neighborCommunities(G, a.id).size || compareNodes(a, b)
    ))
    .slice(0, maxHubs);
  const chains = highRiskChains(G, changedIds, impactedSet, maxChains);
  const gaps = likelyTestGaps(changedFiles, impactedFiles);

  return {
    changed_files: changedFiles,
    impacted_files: impactedFiles,
    changed_nodes: changedNodes,
    impacted_nodes: impactedNodes.slice(0, maxNodes),
    hub_nodes: hubNodes,
    bridge_nodes: bridgeNodes,
    likely_test_gaps: gaps,
    high_risk_chains: chains,
    next_best_action: chains.length > 0
      ? "Review high-risk chains first, then inspect likely test gaps."
      : "Review impacted hubs and confirm tests cover the changed files.",
  };
}

function nodeLine(node: ReviewNode): string {
  const source = node.source_file ? `, ${node.source_file}` : "";
  const community = node.community !== null ? `, community ${node.community}` : "";
  return `${node.label} (degree ${node.degree}${community}${source})`;
}

function chainLine(chain: ReviewChain): string {
  const parts: string[] = [];
  chain.nodes.forEach((node, index) => {
    if (index === 0) {
      parts.push(node.label);
      return;
    }
    const relation = chain.relations[index - 1] ?? "related_to";
    const confidence = chain.confidences[index - 1] ?? "";
    parts.push(`--${relation}${confidence ? ` [${confidence}]` : ""}--> ${node.label}`);
  });
  return `${parts.join(" ")} (${chain.risk})`;
}

export function reviewDeltaToText(delta: ReviewDelta): string {
  const lines = [
    "Graphify Review Delta",
    `Changed files: ${delta.changed_files.length}`,
    `Changed nodes: ${delta.changed_nodes.length}`,
    `Impacted nodes: ${delta.impacted_nodes.length}`,
    `Impacted files: ${delta.impacted_files.length}`,
    "",
    "Impacted files:",
  ];

  lines.push(...(delta.impacted_files.length ? delta.impacted_files.map((file) => `  - ${file}`) : ["  none"]));

  lines.push("", "Hub nodes:");
  lines.push(...(delta.hub_nodes.length ? delta.hub_nodes.map((node) => `  - ${nodeLine(node)}`) : ["  none"]));

  lines.push("", "Bridge nodes:");
  lines.push(...(delta.bridge_nodes.length ? delta.bridge_nodes.map((node) => `  - ${nodeLine(node)}`) : ["  none"]));

  lines.push("", "Likely test gaps:");
  lines.push(...(delta.likely_test_gaps.length ? delta.likely_test_gaps.map((gap) => `  - ${gap}`) : ["  none"]));

  lines.push("", "High-risk dependency chains:");
  lines.push(...(delta.high_risk_chains.length ? delta.high_risk_chains.map((chain) => `  - ${chainLine(chain)}`) : ["  none"]));

  lines.push("", `Next best action: ${delta.next_best_action}`);
  return lines.join("\n");
}

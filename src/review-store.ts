import Graph from "graphology";

export type ReviewGraphNodeKind =
  | "File"
  | "Class"
  | "Function"
  | "Method"
  | "Type"
  | "Test"
  | "Concept"
  | "Document"
  | "Image"
  | "Video"
  | "Unknown";

export interface ReviewGraphNode {
  id: string;
  name: string;
  qualifiedName: string;
  kind: ReviewGraphNodeKind;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  language: string | null;
  parentName: string | null;
  isTest: boolean;
  communityId: number | null;
  confidence: string | null;
  extra: Record<string, unknown>;
}

export interface ReviewGraphEdge {
  id: string;
  kind: string;
  sourceQualified: string;
  targetQualified: string;
  sourceId: string;
  targetId: string;
  direction: "directed" | "preserved" | "undirected";
  filePath: string | null;
  line: number | null;
  confidence: number;
  confidenceTier: string;
  extra: Record<string, unknown>;
}

export interface ReviewImpactRadius {
  changedNodes: ReviewGraphNode[];
  impactedNodes: ReviewGraphNode[];
  impactedFiles: string[];
  edges: ReviewGraphEdge[];
  truncated: boolean;
  totalImpacted: number;
}

export interface ReviewGraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByKind: Record<string, number>;
  edgesByKind: Record<string, number>;
  languages: string[];
  filesCount: number;
  lastUpdated: string | null;
}

export interface ReviewGraphStoreLike {
  getNode(qualifiedNameOrId: string): ReviewGraphNode | null;
  getNodeById(id: string): ReviewGraphNode | null;
  getAllNodes(options?: { excludeFiles?: boolean }): ReviewGraphNode[];
  getNodesByFile(filePath: string): ReviewGraphNode[];
  getFilesMatching(pattern: string): string[];
  getNodesByKind(kinds: ReviewGraphNodeKind[]): ReviewGraphNode[];
  getAllFiles(): string[];
  getEdgesBySource(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[];
  getEdgesByTarget(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[];
  getAllEdges(): ReviewGraphEdge[];
  getEdgesAmong(qualifiedNamesOrIds: Set<string>): ReviewGraphEdge[];
  getAllCallTargets(): Set<string>;
  getImpactRadius(
    changedFiles: string[],
    options?: { maxDepth?: number; maxNodes?: number; direction?: "directed" | "undirected" },
  ): ReviewImpactRadius;
  getTransitiveTests(qualifiedNameOrId: string, maxDepth?: number): ReviewGraphNode[];
  getNodeCommunityId(qualifiedNameOrId: string): number | null;
  getCommunityIdsByQualifiedNames(qualifiedNamesOrIds: string[]): Map<string, number | null>;
  getCommunityLabels(): Map<number, string>;
  getGraphStats(): ReviewGraphStats;
}

const KNOWN_KINDS = new Set<ReviewGraphNodeKind>([
  "File",
  "Class",
  "Function",
  "Method",
  "Type",
  "Test",
  "Concept",
  "Document",
  "Image",
  "Video",
  "Unknown",
]);

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isTestPath(path: string | null): boolean {
  if (!path) return false;
  const normalized = normalizePath(path).toLowerCase();
  return (
    normalized.includes("/test/") ||
    normalized.includes("/tests/") ||
    normalized.includes("/__tests__/") ||
    /(?:^|[._-])(test|spec)\.[^.]+$/.test(normalized)
  );
}

function pathMatches(sourceFile: string | null, changedFile: string): boolean {
  if (!sourceFile) return false;
  const source = normalizePath(sourceFile);
  const changed = normalizePath(changedFile);
  return source === changed || source.endsWith(`/${changed}`) || changed.endsWith(`/${source}`);
}

function normalizeKind(attrs: Record<string, unknown>, filePath: string | null): ReviewGraphNodeKind {
  const raw = asString(attrs.kind) ?? asString(attrs.node_type) ?? asString(attrs.nodeType) ?? asString(attrs.type);
  if (raw) {
    const normalized = raw.slice(0, 1).toUpperCase() + raw.slice(1);
    if (KNOWN_KINDS.has(normalized as ReviewGraphNodeKind)) return normalized as ReviewGraphNodeKind;
  }
  if (isTestPath(filePath)) return "Test";
  switch (attrs.file_type) {
    case "code":
      return "Function";
    case "document":
    case "paper":
    case "concept":
    case "rationale":
      return "Document";
    case "image":
      return "Image";
    case "video":
      return "Video";
    default:
      return "Unknown";
  }
}

function parseLineRange(attrs: Record<string, unknown>): { lineStart: number | null; lineEnd: number | null } {
  const directStart = asNumber(attrs.line_start) ?? asNumber(attrs.lineStart) ?? asNumber(attrs.line);
  const directEnd = asNumber(attrs.line_end) ?? asNumber(attrs.lineEnd) ?? directStart;
  if (directStart !== null) return { lineStart: directStart, lineEnd: directEnd };

  const sourceLocation = asString(attrs.source_location) ?? asString(attrs.sourceLocation);
  if (!sourceLocation) return { lineStart: null, lineEnd: null };
  const match = sourceLocation.match(/(?:lines?\s+|#L|L|:)(\d+)(?:\s*-\s*(?:L)?(\d+))?/i);
  if (!match?.[1]) return { lineStart: null, lineEnd: null };
  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { lineStart: null, lineEnd: null };
  return { lineStart: start, lineEnd: end };
}

function canonicalRelation(value: unknown): string {
  const raw = typeof value === "string" && value.trim().length > 0 ? value.trim() : "RELATED_TO";
  const normalized = raw.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();
  if (normalized === "VALIDATED_BY" || normalized === "VALIDATES" || normalized === "TESTS") return "TESTED_BY";
  if (normalized === "IMPORTS") return "IMPORTS_FROM";
  // CRG-style canonical inheritance/implementation kinds (used by F5 guidance).
  if (normalized === "EXTENDS" || normalized === "INHERITS_FROM" || normalized === "SUBCLASS_OF") return "INHERITS";
  if (normalized === "IMPLEMENTS_INTERFACE" || normalized === "REALIZES") return "IMPLEMENTS";
  return normalized;
}

function confidenceValue(tier: string, score: unknown, weight: unknown): number {
  const direct = typeof score === "number" && Number.isFinite(score)
    ? score
    : typeof weight === "number" && Number.isFinite(weight)
      ? weight
      : null;
  if (direct !== null) return direct;
  if (tier === "INFERRED") return 0.5;
  if (tier === "AMBIGUOUS") return 0.25;
  return 1;
}

function sortNodes(nodes: ReviewGraphNode[]): ReviewGraphNode[] {
  return [...nodes].sort((a, b) => (
    compareStrings(a.name, b.name) ||
    compareStrings(a.qualifiedName, b.qualifiedName) ||
    compareStrings(a.filePath ?? "", b.filePath ?? "")
  ));
}

function sortEdges(edges: ReviewGraphEdge[]): ReviewGraphEdge[] {
  return [...edges].sort((a, b) => (
    compareStrings(a.sourceQualified, b.sourceQualified) ||
    compareStrings(a.targetQualified, b.targetQualified) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.id, b.id)
  ));
}

export function createReviewGraphStore(G: Graph): ReviewGraphStoreLike {
  const nodesById = new Map<string, ReviewGraphNode>();
  const nodeIdByQualifiedName = new Map<string, string>();

  G.forEachNode((nodeId, attrs) => {
    const record = attrs as Record<string, unknown>;
    const filePath = asString(record.source_file) ?? asString(record.sourceFile);
    const { lineStart, lineEnd } = parseLineRange(record);
    const kind = normalizeKind(record, filePath);
    const name = asString(record.label) ?? nodeId;
    const qualifiedName = asString(record.qualified_name) ?? asString(record.qualifiedName) ?? nodeId;
    const node: ReviewGraphNode = {
      id: nodeId,
      name,
      qualifiedName,
      kind,
      filePath,
      lineStart,
      lineEnd,
      language: asString(record.language),
      parentName: asString(record.parent_name) ?? asString(record.parentName),
      isTest: kind === "Test" || isTestPath(filePath),
      communityId: asNumber(record.community) ?? asNumber(record.community_id) ?? asNumber(record.communityId),
      confidence: asString(record.confidence),
      extra: { ...record },
    };
    nodesById.set(nodeId, node);
    if (!nodeIdByQualifiedName.has(qualifiedName)) nodeIdByQualifiedName.set(qualifiedName, nodeId);
  });

  function resolveNodeId(qualifiedNameOrId: string): string | null {
    if (nodesById.has(qualifiedNameOrId)) return qualifiedNameOrId;
    return nodeIdByQualifiedName.get(qualifiedNameOrId) ?? null;
  }

  function normalizeEdge(edgeId: string, attrs: Record<string, unknown>, graphSource: string, graphTarget: string): ReviewGraphEdge | null {
    let sourceId = graphSource;
    let targetId = graphTarget;
    let direction: ReviewGraphEdge["direction"] = "directed";
    if (G.type !== "directed") {
      const preservedSource = asString(attrs._src);
      const preservedTarget = asString(attrs._tgt);
      direction = preservedSource && preservedTarget ? "preserved" : "undirected";
      sourceId = preservedSource ?? graphSource;
      targetId = preservedTarget ?? graphTarget;
    }
    const source = nodesById.get(sourceId);
    const target = nodesById.get(targetId);
    if (!source || !target) return null;
    const confidenceTier = asString(attrs.confidence) ?? "EXTRACTED";
    const { lineStart } = parseLineRange(attrs);
    return {
      id: edgeId,
      kind: canonicalRelation(attrs.relation),
      sourceQualified: source.qualifiedName,
      targetQualified: target.qualifiedName,
      sourceId,
      targetId,
      direction,
      filePath: asString(attrs.source_file) ?? asString(attrs.sourceFile),
      line: lineStart,
      confidence: confidenceValue(confidenceTier, attrs.confidence_score, attrs.weight),
      confidenceTier,
      extra: { ...attrs },
    };
  }

  const allEdges: ReviewGraphEdge[] = [];
  G.forEachEdge((edgeId, attrs, source, target) => {
    const edge = normalizeEdge(edgeId, attrs as Record<string, unknown>, source, target);
    if (edge) allEdges.push(edge);
  });
  const sortedEdges = sortEdges(allEdges);

  function getNode(qualifiedNameOrId: string): ReviewGraphNode | null {
    const nodeId = resolveNodeId(qualifiedNameOrId);
    return nodeId ? nodesById.get(nodeId) ?? null : null;
  }

  function getAllNodes(options: { excludeFiles?: boolean } = {}): ReviewGraphNode[] {
    const nodes = [...nodesById.values()].filter((node) => !(options.excludeFiles && node.kind === "File"));
    return sortNodes(nodes);
  }

  function getNodesByFile(filePath: string): ReviewGraphNode[] {
    return sortNodes([...nodesById.values()].filter((node) => pathMatches(node.filePath, filePath)));
  }

  function getFilesMatching(pattern: string): string[] {
    const files = new Set<string>();
    for (const node of nodesById.values()) {
      if (pathMatches(node.filePath, pattern) && node.filePath) files.add(node.filePath);
    }
    return [...files].sort(compareStrings);
  }

  function getEdgesBySource(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[] {
    const node = getNode(qualifiedNameOrId);
    if (!node) return [];
    const targetKind = kind ? canonicalRelation(kind) : null;
    return sortedEdges.filter((edge) => edge.sourceQualified === node.qualifiedName && (!targetKind || edge.kind === targetKind));
  }

  function getEdgesByTarget(qualifiedNameOrId: string, kind?: string): ReviewGraphEdge[] {
    const node = getNode(qualifiedNameOrId);
    if (!node) return [];
    const targetKind = kind ? canonicalRelation(kind) : null;
    return sortedEdges.filter((edge) => edge.targetQualified === node.qualifiedName && (!targetKind || edge.kind === targetKind));
  }

  function getTransitiveTests(qualifiedNameOrId: string, maxDepth: number = 1): ReviewGraphNode[] {
    const start = getNode(qualifiedNameOrId);
    if (!start) return [];
    const found = new Map<string, ReviewGraphNode>();

    function addDirectTests(target: ReviewGraphNode): void {
      for (const edge of getEdgesByTarget(target.qualifiedName, "TESTED_BY")) {
        const testNode = getNode(edge.sourceQualified);
        if (testNode?.isTest) found.set(testNode.qualifiedName, testNode);
      }
    }

    addDirectTests(start);
    let frontier = [start];
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const next: ReviewGraphNode[] = [];
      for (const node of frontier) {
        for (const edge of getEdgesBySource(node.qualifiedName, "CALLS")) {
          const callee = getNode(edge.targetQualified);
          if (!callee) continue;
          addDirectTests(callee);
          next.push(callee);
        }
      }
      frontier = next;
    }
    return sortNodes([...found.values()]);
  }

  function getImpactRadius(
    changedFiles: string[],
    options: { maxDepth?: number; maxNodes?: number; direction?: "directed" | "undirected" } = {},
  ): ReviewImpactRadius {
    const maxDepth = Math.max(0, options.maxDepth ?? 2);
    const maxNodes = Math.max(1, options.maxNodes ?? 200);
    const changed = new Map<string, ReviewGraphNode>();
    for (const file of changedFiles) {
      for (const node of getNodesByFile(file)) changed.set(node.id, node);
    }
    const visited = new Map(changed);
    let truncated = false;
    let frontier = [...changed.values()];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
      const next: ReviewGraphNode[] = [];
      for (const node of frontier) {
        const relatedEdges = options.direction === "directed"
          ? getEdgesBySource(node.qualifiedName)
          : [...getEdgesBySource(node.qualifiedName), ...getEdgesByTarget(node.qualifiedName)];
        for (const edge of relatedEdges) {
          const otherQualified = edge.sourceQualified === node.qualifiedName ? edge.targetQualified : edge.sourceQualified;
          const other = getNode(otherQualified);
          if (!other || visited.has(other.id)) continue;
          if (visited.size >= maxNodes) {
            truncated = true;
            continue;
          }
          visited.set(other.id, other);
          next.push(other);
        }
      }
      frontier = next;
    }

    const visitedQualified = new Set([...visited.values()].map((node) => node.qualifiedName));
    const edges = sortedEdges.filter((edge) => visitedQualified.has(edge.sourceQualified) && visitedQualified.has(edge.targetQualified));
    const impactedNodes = [...visited.values()].filter((node) => !changed.has(node.id));
    const impactedFiles = [...new Set([...visited.values()].map((node) => node.filePath).filter((file): file is string => !!file))].sort(compareStrings);

    return {
      changedNodes: sortNodes([...changed.values()]),
      impactedNodes: sortNodes(impactedNodes),
      impactedFiles,
      edges,
      truncated,
      totalImpacted: visited.size,
    };
  }

  return {
    getNode,
    getNodeById: (id) => nodesById.get(id) ?? null,
    getAllNodes,
    getNodesByFile,
    getFilesMatching,
    getNodesByKind: (kinds) => sortNodes([...nodesById.values()].filter((node) => kinds.includes(node.kind))),
    getAllFiles: () => [...new Set([...nodesById.values()].map((node) => node.filePath).filter((file): file is string => !!file))].sort(compareStrings),
    getEdgesBySource,
    getEdgesByTarget,
    getAllEdges: () => [...sortedEdges],
    getEdgesAmong: (qualifiedNamesOrIds) => {
      const qualified = new Set<string>();
      for (const value of qualifiedNamesOrIds) {
        const node = getNode(value);
        if (node) qualified.add(node.qualifiedName);
      }
      return sortedEdges.filter((edge) => qualified.has(edge.sourceQualified) && qualified.has(edge.targetQualified));
    },
    getAllCallTargets: () => new Set(sortedEdges.filter((edge) => edge.kind === "CALLS").map((edge) => edge.targetQualified)),
    getImpactRadius,
    getTransitiveTests,
    getNodeCommunityId: (qualifiedNameOrId) => getNode(qualifiedNameOrId)?.communityId ?? null,
    getCommunityIdsByQualifiedNames: (qualifiedNamesOrIds) => {
      const result = new Map<string, number | null>();
      for (const value of qualifiedNamesOrIds) result.set(value, getNode(value)?.communityId ?? null);
      return result;
    },
    getCommunityLabels: () => {
      const rawLabels = G.getAttribute("community_labels") as Record<string, unknown> | undefined;
      const labels = new Map<number, string>();
      for (const [key, value] of Object.entries(rawLabels ?? {})) {
        const id = Number.parseInt(key, 10);
        if (Number.isFinite(id) && typeof value === "string" && value.trim().length > 0) {
          labels.set(id, value);
        }
      }
      return labels;
    },
    getGraphStats: () => {
      const nodesByKind: Record<string, number> = {};
      const edgesByKind: Record<string, number> = {};
      const languages = new Set<string>();
      for (const node of nodesById.values()) {
        nodesByKind[node.kind] = (nodesByKind[node.kind] ?? 0) + 1;
        if (node.language) languages.add(node.language);
      }
      for (const edge of sortedEdges) edgesByKind[edge.kind] = (edgesByKind[edge.kind] ?? 0) + 1;
      return {
        totalNodes: nodesById.size,
        totalEdges: sortedEdges.length,
        nodesByKind,
        edgesByKind,
        languages: [...languages].sort(compareStrings),
        filesCount: new Set([...nodesById.values()].map((node) => node.filePath).filter(Boolean)).size,
        lastUpdated: null,
      };
    },
  };
}

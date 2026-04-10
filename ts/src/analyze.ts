/**
 * Graph analysis: god nodes (most connected), surprising connections (cross-community),
 * suggested questions, graph diff.
 */
import Graph from "graphology";
import betweennessCentrality from "graphology-metrics/centrality/betweenness.js";
import type { GodNodeEntry, SurpriseEntry, SuggestedQuestion, GraphDiffResult } from "./types.js";
import { cohesionScore } from "./cluster.js";

type GraphInstance = InstanceType<typeof Graph>;

function nodeCommunityMap(communities: Map<number, string[]>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [cid, nodes] of communities) {
    for (const n of nodes) result.set(n, cid);
  }
  return result;
}

export function isFileNode(G: Graph, nodeId: string): boolean {
  const attrs = G.getNodeAttributes(nodeId);
  const label = (attrs.label as string) ?? "";
  if (!label) return false;

  const sourceFile = (attrs.source_file as string) ?? "";
  if (sourceFile) {
    const fileName = sourceFile.split("/").pop() ?? "";
    if (label === fileName) return true;
  }

  if (label.startsWith(".") && label.endsWith("()")) return true;
  if (label.endsWith("()") && G.degree(nodeId) <= 1) return true;
  return false;
}

export function isConceptNode(G: Graph, nodeId: string): boolean {
  const data = G.getNodeAttributes(nodeId);
  const source = (data.source_file as string) ?? "";
  if (!source) return true;
  const lastPart = source.split("/").pop() ?? "";
  if (!lastPart.includes(".")) return true;
  return false;
}

const CODE_EXTENSIONS = new Set([
  "py", "ts", "tsx", "js", "go", "rs", "java", "rb", "cpp", "c", "h", "cs", "kt", "scala", "php",
]);
const DOC_EXTENSIONS = new Set(["md", "txt", "rst"]);
const PAPER_EXTENSIONS = new Set(["pdf"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);

function fileCategory(path: string): string {
  const ext = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "" : "";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (PAPER_EXTENSIONS.has(ext)) return "paper";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  return "doc";
}

function topLevelDir(path: string): string {
  return path.includes("/") ? path.split("/")[0]! : path;
}

function surpriseScore(
  G: Graph,
  u: string,
  v: string,
  data: Record<string, unknown>,
  nodeCommunity: Map<string, number>,
  uSource: string,
  vSource: string,
): [number, string[]] {
  let score = 0;
  const reasons: string[] = [];

  const conf = (data.confidence as string) ?? "EXTRACTED";
  const confBonus: Record<string, number> = { AMBIGUOUS: 3, INFERRED: 2, EXTRACTED: 1 };
  score += confBonus[conf] ?? 1;
  if (conf === "AMBIGUOUS" || conf === "INFERRED") {
    reasons.push(`${conf.toLowerCase()} connection - not explicitly stated in source`);
  }

  const catU = fileCategory(uSource);
  const catV = fileCategory(vSource);
  if (catU !== catV) {
    score += 2;
    reasons.push(`crosses file types (${catU} ↔ ${catV})`);
  }

  if (topLevelDir(uSource) !== topLevelDir(vSource)) {
    score += 2;
    reasons.push("connects across different repos/directories");
  }

  const cidU = nodeCommunity.get(u);
  const cidV = nodeCommunity.get(v);
  if (cidU !== undefined && cidV !== undefined && cidU !== cidV) {
    score += 1;
    reasons.push("bridges separate communities");
  }

  if (data.relation === "semantically_similar_to") {
    score = Math.floor(score * 1.5);
    reasons.push("semantically similar concepts with no structural link");
  }

  const degU = G.degree(u);
  const degV = G.degree(v);
  if (Math.min(degU, degV) <= 2 && Math.max(degU, degV) >= 5) {
    score += 1;
    const peripheral = degU <= 2 ? (G.getNodeAttribute(u, "label") as string) : (G.getNodeAttribute(v, "label") as string);
    const hub = degU <= 2 ? (G.getNodeAttribute(v, "label") as string) : (G.getNodeAttribute(u, "label") as string);
    reasons.push(`peripheral node \`${peripheral}\` unexpectedly reaches hub \`${hub}\``);
  }

  return [score, reasons];
}

export function godNodes(G: Graph, topN: number = 10): GodNodeEntry[] {
  const degree: [string, number][] = [];
  G.forEachNode((n) => degree.push([n, G.degree(n)]));
  degree.sort((a, b) => b[1] - a[1]);

  const result: GodNodeEntry[] = [];
  for (const [nodeId, deg] of degree) {
    if (isFileNode(G, nodeId) || isConceptNode(G, nodeId)) continue;
    result.push({
      id: nodeId,
      label: (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId,
      edges: deg,
    });
    if (result.length >= topN) break;
  }
  return result;
}

export function surprisingConnections(
  G: Graph,
  communities?: Map<number, string[]>,
  topN: number = 5,
): SurpriseEntry[] {
  const comms = communities ?? new Map<number, string[]>();
  const sourceFiles = new Set<string>();
  G.forEachNode((_, data) => {
    const sf = (data.source_file as string) ?? "";
    if (sf) sourceFiles.add(sf);
  });
  const isMultiSource = sourceFiles.size > 1;

  if (isMultiSource) {
    return crossFileSurprises(G, comms, topN);
  }
  return crossCommunitySurprises(G, comms, topN);
}

function crossFileSurprises(G: Graph, communities: Map<number, string[]>, topN: number): SurpriseEntry[] {
  const nodeCommunity = nodeCommunityMap(communities);
  const candidates: (SurpriseEntry & { _score: number })[] = [];

  G.forEachEdge((edge, data, source, target) => {
    const relation = (data.relation as string) ?? "";
    if (["imports", "imports_from", "contains", "method"].includes(relation)) return;
    if (isConceptNode(G, source) || isConceptNode(G, target)) return;
    if (isFileNode(G, source) || isFileNode(G, target)) return;

    const uSource = (G.getNodeAttribute(source, "source_file") as string) ?? "";
    const vSource = (G.getNodeAttribute(target, "source_file") as string) ?? "";
    if (!uSource || !vSource || uSource === vSource) return;

    const [score, reasons] = surpriseScore(G, source, target, data, nodeCommunity, uSource, vSource);
    const srcId = (data._src as string) ?? source;
    const tgtId = (data._tgt as string) ?? target;

    candidates.push({
      _score: score,
      source: (G.getNodeAttribute(srcId, "label") as string) ?? srcId,
      target: (G.getNodeAttribute(tgtId, "label") as string) ?? tgtId,
      source_files: [
        (G.getNodeAttribute(srcId, "source_file") as string) ?? "",
        (G.getNodeAttribute(tgtId, "source_file") as string) ?? "",
      ],
      confidence: (data.confidence as SurpriseEntry["confidence"]) ?? "EXTRACTED",
      relation,
      why: reasons.length > 0 ? reasons.join("; ") : "cross-file semantic connection",
    });
  });

  candidates.sort((a, b) => b._score - a._score);
  const result = candidates.slice(0, topN).map(({ _score, ...rest }) => rest);

  if (result.length > 0) return result;
  return crossCommunitySurprises(G, communities, topN);
}

function crossCommunitySurprises(
  G: Graph,
  communities: Map<number, string[]>,
  topN: number,
): SurpriseEntry[] {
  if (communities.size === 0) {
    if (G.size === 0) return [];
    // Use edge betweenness centrality approximation
    return edgeBetweennessSurprises(G, topN);
  }

  const nodeCommunity = nodeCommunityMap(communities);
  const surprises: (SurpriseEntry & { _pair: string })[] = [];

  G.forEachEdge((edge, data, u, v) => {
    const cidU = nodeCommunity.get(u);
    const cidV = nodeCommunity.get(v);
    if (cidU === undefined || cidV === undefined || cidU === cidV) return;
    if (isFileNode(G, u) || isFileNode(G, v)) return;
    const relation = (data.relation as string) ?? "";
    if (["imports", "imports_from", "contains", "method"].includes(relation)) return;

    const srcId = (data._src as string) ?? u;
    const tgtId = (data._tgt as string) ?? v;

    surprises.push({
      source: (G.getNodeAttribute(srcId, "label") as string) ?? srcId,
      target: (G.getNodeAttribute(tgtId, "label") as string) ?? tgtId,
      source_files: [
        (G.getNodeAttribute(srcId, "source_file") as string) ?? "",
        (G.getNodeAttribute(tgtId, "source_file") as string) ?? "",
      ],
      confidence: (data.confidence as SurpriseEntry["confidence"]) ?? "EXTRACTED",
      relation,
      note: `Bridges community ${cidU} → community ${cidV}`,
      _pair: [Math.min(cidU, cidV), Math.max(cidU, cidV)].join(","),
    });
  });

  const order: Record<string, number> = { AMBIGUOUS: 0, INFERRED: 1, EXTRACTED: 2 };
  surprises.sort((a, b) => (order[a.confidence] ?? 3) - (order[b.confidence] ?? 3));

  const seenPairs = new Set<string>();
  const deduped: SurpriseEntry[] = [];
  for (const s of surprises) {
    const pair = s._pair;
    if (!seenPairs.has(pair)) {
      seenPairs.add(pair);
      const { _pair, ...rest } = s;
      deduped.push(rest);
    }
  }
  return deduped.slice(0, topN);
}

function edgeBetweennessSurprises(G: Graph, topN: number): SurpriseEntry[] {
  // Approximate edge betweenness via node betweenness
  const bc = betweennessCentrality(G);
  const edgeScores: [string, string, number, Record<string, unknown>][] = [];

  G.forEachEdge((edge, data, u, v) => {
    const score = (bc[u] ?? 0) + (bc[v] ?? 0);
    edgeScores.push([u, v, score, data]);
  });

  edgeScores.sort((a, b) => b[2] - a[2]);

  return edgeScores.slice(0, topN).map(([u, v, score, data]) => ({
    source: (G.getNodeAttribute(u, "label") as string) ?? u,
    target: (G.getNodeAttribute(v, "label") as string) ?? v,
    source_files: [
      (G.getNodeAttribute(u, "source_file") as string) ?? "",
      (G.getNodeAttribute(v, "source_file") as string) ?? "",
    ],
    confidence: (data.confidence as SurpriseEntry["confidence"]) ?? "EXTRACTED",
    relation: (data.relation as string) ?? "",
    note: `Bridges graph structure (betweenness=${score.toFixed(3)})`,
  }));
}

export function suggestQuestions(
  G: Graph,
  communities: Map<number, string[]>,
  communityLabels: Map<number, string>,
  topN: number = 7,
): SuggestedQuestion[] {
  const questions: SuggestedQuestion[] = [];
  const nodeCommunity = nodeCommunityMap(communities);

  // 1. AMBIGUOUS edges
  G.forEachEdge((edge, data, u, v) => {
    if (data.confidence === "AMBIGUOUS") {
      const ul = (G.getNodeAttribute(u, "label") as string) ?? u;
      const vl = (G.getNodeAttribute(v, "label") as string) ?? v;
      const relation = (data.relation as string) ?? "related to";
      questions.push({
        type: "ambiguous_edge",
        question: `What is the exact relationship between \`${ul}\` and \`${vl}\`?`,
        why: `Edge tagged AMBIGUOUS (relation: ${relation}) - confidence is low.`,
      });
    }
  });

  // 2. Bridge nodes (high betweenness)
  if (G.size > 0) {
    const bc = betweennessCentrality(G);
    const bridges: [string, number][] = Object.entries(bc)
      .filter(([n, s]) => !isFileNode(G, n) && !isConceptNode(G, n) && (s as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3) as [string, number][];

    for (const [nodeId, score] of bridges) {
      const label = (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId;
      const cid = nodeCommunity.get(nodeId);
      const commLabel = cid !== undefined ? (communityLabels.get(cid) ?? `Community ${cid}`) : "unknown";
      const neighborComms = new Set<number>();
      G.forEachNeighbor(nodeId, (n) => {
        const nc = nodeCommunity.get(n);
        if (nc !== undefined && nc !== cid) neighborComms.add(nc);
      });
      if (neighborComms.size > 0) {
        const otherLabels = [...neighborComms].map((c) => communityLabels.get(c) ?? `Community ${c}`);
        questions.push({
          type: "bridge_node",
          question: `Why does \`${label}\` connect \`${commLabel}\` to ${otherLabels.map((l) => `\`${l}\``).join(", ")}?`,
          why: `High betweenness centrality (${score.toFixed(3)}) - this node is a cross-community bridge.`,
        });
      }
    }
  }

  // 3. God nodes with many INFERRED edges
  const degree: [string, number][] = [];
  G.forEachNode((n) => degree.push([n, G.degree(n)]));
  degree.sort((a, b) => b[1] - a[1]);
  const topNodes = degree.filter(([n]) => !isFileNode(G, n)).slice(0, 5);

  for (const [nodeId] of topNodes) {
    const inferred: string[] = [];
    G.forEachEdge(nodeId, (edge, data, source, target) => {
      if (data.confidence === "INFERRED") {
        const srcId = (data._src as string) ?? source;
        const tgtId = (data._tgt as string) ?? target;
        const otherId = srcId === nodeId ? tgtId : srcId;
        inferred.push((G.getNodeAttribute(otherId, "label") as string) ?? otherId);
      }
    });
    if (inferred.length >= 2) {
      const label = (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId;
      questions.push({
        type: "verify_inferred",
        question: `Are the ${inferred.length} inferred relationships involving \`${label}\` (e.g. with \`${inferred[0]}\` and \`${inferred[1]}\`) actually correct?`,
        why: `\`${label}\` has ${inferred.length} INFERRED edges - model-reasoned connections that need verification.`,
      });
    }
  }

  // 4. Isolated nodes
  const isolated: string[] = [];
  G.forEachNode((n) => {
    if (G.degree(n) <= 1 && !isFileNode(G, n) && !isConceptNode(G, n)) {
      isolated.push(n);
    }
  });
  if (isolated.length > 0) {
    const labels = isolated.slice(0, 3).map((n) => (G.getNodeAttribute(n, "label") as string) ?? n);
    questions.push({
      type: "isolated_nodes",
      question: `What connects ${labels.map((l) => `\`${l}\``).join(", ")} to the rest of the system?`,
      why: `${isolated.length} weakly-connected nodes found - possible documentation gaps or missing edges.`,
    });
  }

  // 5. Low-cohesion communities
  for (const [cid, nodes] of communities) {
    const score = cohesionScore(G, nodes);
    if (score < 0.15 && nodes.length >= 5) {
      const label = communityLabels.get(cid) ?? `Community ${cid}`;
      questions.push({
        type: "low_cohesion",
        question: `Should \`${label}\` be split into smaller, more focused modules?`,
        why: `Cohesion score ${score} - nodes in this community are weakly interconnected.`,
      });
    }
  }

  if (questions.length === 0) {
    return [{
      type: "no_signal",
      question: null,
      why:
        "Not enough signal to generate questions. " +
        "This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, " +
        "no INFERRED relationships, and all communities are tightly cohesive. " +
        "Add more files or run with --mode deep to extract richer edges.",
    }];
  }

  return questions.slice(0, topN);
}

export function graphDiff(GOld: Graph, GNew: Graph): GraphDiffResult {
  const oldNodes = new Set(GOld.nodes());
  const newNodes = new Set(GNew.nodes());

  const addedNodeIds = [...newNodes].filter((n) => !oldNodes.has(n));
  const removedNodeIds = [...oldNodes].filter((n) => !newNodes.has(n));

  const newNodesList = addedNodeIds.map((n) => ({
    id: n,
    label: (GNew.getNodeAttribute(n, "label") as string) ?? n,
  }));
  const removedNodesList = removedNodeIds.map((n) => ({
    id: n,
    label: (GOld.getNodeAttribute(n, "label") as string) ?? n,
  }));

  function edgeKey(u: string, v: string, relation: string): string {
    return `${[u, v].sort().join(",")}:${relation}`;
  }

  const oldEdgeKeys = new Set<string>();
  GOld.forEachEdge((edge, data, u, v) => {
    oldEdgeKeys.add(edgeKey(u, v, (data.relation as string) ?? ""));
  });
  const newEdgeKeys = new Set<string>();
  GNew.forEachEdge((edge, data, u, v) => {
    newEdgeKeys.add(edgeKey(u, v, (data.relation as string) ?? ""));
  });

  const addedEdgeKeys = new Set([...newEdgeKeys].filter((k) => !oldEdgeKeys.has(k)));
  const removedEdgeKeys = new Set([...oldEdgeKeys].filter((k) => !newEdgeKeys.has(k)));

  const newEdgesList: GraphDiffResult["new_edges"] = [];
  GNew.forEachEdge((edge, data, u, v) => {
    if (addedEdgeKeys.has(edgeKey(u, v, (data.relation as string) ?? ""))) {
      newEdgesList.push({
        source: u, target: v,
        relation: (data.relation as string) ?? "",
        confidence: (data.confidence as string) ?? "",
      });
    }
  });

  const removedEdgesList: GraphDiffResult["removed_edges"] = [];
  GOld.forEachEdge((edge, data, u, v) => {
    if (removedEdgeKeys.has(edgeKey(u, v, (data.relation as string) ?? ""))) {
      removedEdgesList.push({
        source: u, target: v,
        relation: (data.relation as string) ?? "",
        confidence: (data.confidence as string) ?? "",
      });
    }
  });

  const parts: string[] = [];
  if (newNodesList.length > 0) parts.push(`${newNodesList.length} new node${newNodesList.length !== 1 ? "s" : ""}`);
  if (newEdgesList.length > 0) parts.push(`${newEdgesList.length} new edge${newEdgesList.length !== 1 ? "s" : ""}`);
  if (removedNodesList.length > 0) parts.push(`${removedNodesList.length} node${removedNodesList.length !== 1 ? "s" : ""} removed`);
  if (removedEdgesList.length > 0) parts.push(`${removedEdgesList.length} edge${removedEdgesList.length !== 1 ? "s" : ""} removed`);

  return {
    new_nodes: newNodesList,
    removed_nodes: removedNodesList,
    new_edges: newEdgesList,
    removed_edges: removedEdgesList,
    summary: parts.length > 0 ? parts.join(", ") : "no changes",
  };
}

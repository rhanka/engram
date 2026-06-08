/**
 * Build-time studio scene preprocessor (ÉTAPE 1 — additive, parity-only).
 *
 * `buildStudioScene` is a pure-TypeScript replica of the SPA scene adapter
 * `studio/src/lib/graphAdapter.js` → `buildScene(graph, { showWeakLinks })`.
 * It produces the exact same `{ nodes, edges, stats }` shape and values, so it
 * can be emitted at build time as a light `scene.json` (instead of the SPA
 * reconstructing it client-side from the full 5.8 MB `graph.json`).
 *
 * PARITY CONTRACT (must match graphAdapter.js byte-for-byte in field set and
 * values):
 *   node  -> { id, label, weight, shape, group?, type?, profile metadata?, x/y/fx/fy/fixed? }
 *   edge  -> { source, target, relation?, dash?, profile metadata?, weak? }
 *   stats -> { nodeCount, edgeCount, weakEdgeCount, communityCount }
 *
 * The helpers below are faithful 1:1 ports of the studio helpers
 * (shapeForType/TYPE_SHAPE, dashForRelation/REL_DASH, weightForDegree
 * normalised by maxDegree, computeDegrees, nodeGroup, nodeLabel, nodeType,
 * communityStats for the live community count). Keep them in lockstep with the
 * studio source until ÉTAPE 2 (client wiring) collapses the duplication.
 */

// ---------------------------------------------------------------------------
// Input shapes (loose — we only read the fields the adapter reads).
// ---------------------------------------------------------------------------

export interface StudioSceneGraphNode {
  id: string;
  label?: unknown;
  title?: unknown;
  name?: unknown;
  node_type?: unknown;
  type?: unknown;
  kind?: unknown;
  file_type?: unknown;
  community?: unknown;
  community_name?: unknown;
  [key: string]: unknown;
}

export interface StudioSceneGraphEdge {
  source: string;
  target: string;
  relation?: unknown;
  confidence?: unknown;
  [key: string]: unknown;
}

export interface StudioSceneGraphLike {
  nodes?: StudioSceneGraphNode[];
  edges?: StudioSceneGraphEdge[];
  links?: StudioSceneGraphEdge[];
}

export interface BuildStudioSceneOptions {
  /** Mirror of buildScene's `showWeakLinks` (default true). */
  showWeakLinks?: boolean;
}

// ---------------------------------------------------------------------------
// Output shapes (the scene.json contract).
// ---------------------------------------------------------------------------

export interface StudioSceneNode {
  id: string;
  label: string;
  weight: number;
  shape: string;
  group?: string;
  type?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
  fixed?: boolean;
  [key: string]: unknown;
}

export interface StudioSceneEdge {
  source: string;
  target: string;
  relation?: string;
  relation_type?: string;
  dash?: string;
  weak?: true;
  [key: string]: unknown;
}

export interface StudioSceneStats {
  nodeCount: number;
  edgeCount: number;
  weakEdgeCount: number;
  communityCount: number;
}

export interface StudioScene {
  nodes: StudioSceneNode[];
  edges: StudioSceneEdge[];
  stats: StudioSceneStats;
}

// ---------------------------------------------------------------------------
// Helpers — 1:1 port of studio/src/lib/graphAdapter.js.
// ---------------------------------------------------------------------------

/** Graphify persists `links`; some adapters/tests pass `edges`. Accept both. */
function graphEdges(graph: StudioSceneGraphLike | null | undefined): StudioSceneGraphEdge[] {
  if (!graph) return [];
  return graph.edges ?? graph.links ?? [];
}

function graphNodes(graph: StudioSceneGraphLike | null | undefined): StudioSceneGraphNode[] {
  return graph?.nodes ?? [];
}

function displayValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function copyOwnFields(
  source: Record<string, unknown> | undefined,
  target: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (!source) return;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      target[field] = source[field];
    }
  }
}

const NODE_PROFILE_FIELDS = [
  "status",
  "ontology_status",
  "review_status",
  "assertion_basis",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "canonical_id",
  "entity_url",
  "source_file",
  "source_location",
  "parent_id",
  "child_ids",
  "level",
  "code",
  "hierarchy_id",
  "hierarchy_ids",
  "badges",
  "documents",
] as const;

const EDGE_PROFILE_FIELDS = [
  "assertion_basis",
  "review_status",
  "status",
  "ontology_status",
  "derivation_method",
  "confidence_score",
  "evidence_refs",
  "hierarchy_id",
  "structural",
] as const;

function nodeLabel(node: StudioSceneGraphNode | undefined): string {
  return (
    displayValue(node?.label) ??
    displayValue(node?.title) ??
    displayValue(node?.name) ??
    String(node?.id ?? "")
  );
}

function nodeType(node: StudioSceneGraphNode | undefined): string | null {
  return (
    displayValue(node?.node_type) ??
    displayValue(node?.type) ??
    displayValue(node?.kind) ??
    displayValue(node?.file_type)
  );
}

/**
 * Grouping key for tone assignment. Community wins (named, then numeric),
 * falling back to the node type. Returns `undefined` when nothing is known.
 */
function nodeGroup(node: StudioSceneGraphNode | undefined): string | undefined {
  const community =
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `community:${node.community}` : null);
  if (community) return community;
  return nodeType(node) ?? undefined;
}

/** Community name for an entity (named, then numeric, then null). */
function nodeCommunity(node: StudioSceneGraphNode | undefined): string | null {
  return (
    displayValue(node?.community_name) ??
    (typeof node?.community === "number" ? `Community ${node.community}` : null)
  );
}

const TYPE_SHAPE: Record<string, string> = {
  Character: "diamond",
  Alias: "diamond",
  DisguisePersona: "star",
  NarrativeRole: "star",
  Location: "triangle",
  Organization: "hexagon",
  Evidence: "square",
  Object: "square",
  ForensicMethod: "hexagon",
  Work: "roundedbox",
  Saga: "roundedbox",
  ChapterOrStory: "roundedbox",
  Author: "roundedbox",
  Translator: "roundedbox",
};

function shapeForType(node: StudioSceneGraphNode | undefined): string {
  const t = nodeType(node);
  return (t && TYPE_SHAPE[t]) || "dot";
}

/**
 * Map an ontology relation to a typed dash style.
 * Unmapped relations fall back to "solid".
 */
const REL_DASH: Record<string, string> = {
  // structure / belonging (the skeleton)
  appears_in: "solid",
  part_of: "solid",
  belongs_to_saga: "solid",
  contains_evidence: "solid",
  written_by: "solid",
  narrates: "solid",
  alias_of: "solid",
  same_as: "solid",
  // agency / interaction
  commits: "dashed",
  investigates: "dashed",
  assists: "dashed",
  opposes: "dashed",
  targets: "dashed",
  suspected_of: "dashed",
  disguises_as: "dashed",
  motivates: "dashed",
  // spatial / factual anchoring
  occurs_at: "dotted",
  located_in: "dotted",
  establishes_fact: "dotted",
  mentions: "dotted",
  // method / usage
  used_in: "long-dash",
  uses_method: "long-dash",
  involves: "long-dash",
};

function dashForRelation(relation: unknown): string | undefined {
  if (!relation) return undefined;
  return REL_DASH[String(relation)] ?? "solid";
}

/** Strong = EXTRACTED (default). Anything else (INFERRED, …) renders weak. */
function isStrongEdge(edge: StudioSceneGraphEdge | undefined): boolean {
  const basis = displayValue(edge?.assertion_basis)?.toLowerCase();
  if (basis === "heuristic_guess" || basis === "document_inferred") return false;
  const conf = String(edge?.confidence ?? "EXTRACTED").toUpperCase();
  return conf === "EXTRACTED";
}

/** Undirected degree per node id, used to scale node radius. */
function computeDegrees(
  nodes: StudioSceneGraphNode[],
  edges: StudioSceneGraphEdge[],
): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of nodes) degree.set(node.id, 0);
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

/**
 * Legacy autosizing: node radius is LINEAR in degree, NORMALISED by the graph's
 * max degree. weight = (1 + (RADIUS_RATIO - 1) * (deg / maxDeg))^2.
 */
const RADIUS_RATIO = 4; // rmax / rmin, matches the legacy 4->16 spread
function weightForDegree(degree: number, maxDegree: number): number {
  const max = Number.isFinite(maxDegree) && maxDegree > 0 ? maxDegree : 1;
  const ratio = Math.min(1, Math.max(0, (Number.isFinite(degree) ? degree : 0) / max));
  const rOverRmin = 1 + (RADIUS_RATIO - 1) * ratio;
  return rOverRmin * rOverRmin;
}

/**
 * Community breakdown that EXCLUDES isolated singletons from the count. Mirrors
 * graphAdapter.js communityStats; only `liveCount` is consumed by buildScene.
 */
function communityLiveCount(graph: StudioSceneGraphLike): number {
  const nodes = graphNodes(graph);
  const ids = new Set(nodes.map((n) => n.id));
  const deg = new Map<string, number>();
  for (const e of graphEdges(graph)) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
  }

  const byComm = new Map<string, { count: number; live: boolean }>();
  for (const node of nodes) {
    const key = nodeCommunity(node);
    const live = (deg.get(node.id) ?? 0) > 0;
    if (key === undefined || key === null || key === "") continue;
    const rec = byComm.get(key) ?? { count: 0, live: false };
    rec.count += 1;
    if (live) rec.live = true;
    byComm.set(key, rec);
  }
  let liveCount = 0;
  for (const rec of byComm.values()) {
    if (rec.live) liveCount += 1;
  }
  return liveCount;
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/**
 * Build the full Studio scene from a GraphLike payload. Strict parity with
 * studio/src/lib/graphAdapter.js → buildScene.
 */
export function buildStudioScene(
  graph: StudioSceneGraphLike | null | undefined,
  options: BuildStudioSceneOptions = {},
): StudioScene {
  const { showWeakLinks = true } = options;
  const safeGraph = graph ?? {};
  const rawNodes = graphNodes(safeGraph);
  const rawEdges = graphEdges(safeGraph);

  const nodeIds = new Set(rawNodes.map((n) => n.id));
  let edges = rawEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  if (!showWeakLinks) edges = edges.filter(isStrongEdge);

  const degree = computeDegrees(rawNodes, edges);
  const maxDegree = degree.size > 0 ? Math.max(...degree.values()) : 1;

  const nodes: StudioSceneNode[] = rawNodes.map((node) => {
    const group = nodeGroup(node);
    const type = nodeType(node);
    const x = finiteNumber(node.x) ? node.x : finiteNumber(node.fx) ? node.fx : undefined;
    const y = finiteNumber(node.y) ? node.y : finiteNumber(node.fy) ? node.fy : undefined;
    const out: StudioSceneNode = {
      id: node.id,
      label: nodeLabel(node),
      weight: weightForDegree(degree.get(node.id) ?? 0, maxDegree),
      shape: shapeForType(node),
    };
    if (group !== undefined) out.group = group;
    if (type) out.type = type;
    copyOwnFields(node, out, NODE_PROFILE_FIELDS);
    if (x !== undefined) out.x = x;
    if (y !== undefined) out.y = y;
    if (finiteNumber(node.fx)) out.fx = node.fx;
    if (finiteNumber(node.fy)) out.fy = node.fy;
    if (typeof node.fixed === "boolean") out.fixed = node.fixed;
    return out;
  });

  const sceneEdges: StudioSceneEdge[] = edges.map((edge) => {
    const out: StudioSceneEdge = { source: edge.source, target: edge.target };
    const relation = displayValue(edge.relation) ?? displayValue(edge.relation_type);
    if (relation) {
      out.relation = relation;
      const dash = dashForRelation(relation);
      if (dash) out.dash = dash;
    }
    const relationType = displayValue(edge.relation_type);
    if (relationType) out.relation_type = relationType;
    copyOwnFields(edge, out, EDGE_PROFILE_FIELDS);
    if (!isStrongEdge(edge)) out.weak = true;
    return out;
  });

  return {
    nodes,
    edges: sceneEdges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: sceneEdges.length,
      weakEdgeCount: sceneEdges.filter((e) => e.weak).length,
      communityCount: communityLiveCount(safeGraph),
    },
  };
}

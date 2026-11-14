import Graph from "graphology";
import { isAbsolute, relative, resolve } from "node:path";
import { enforceMemoryFreshnessForSurface } from "./graph-memory-projection.js";
import { canonicalBytes } from "./ontology-guardian/canonical.js";
import { closedTemporalBounds } from "./temporal-interval.js";
import type { EvidenceObservation, Extraction } from "./types.js";
import { compareLinkRows, deepSortKeys, graphJsonLink, topologySignatureFromRows } from "./graph-json-serialization.js";

export const GRAPH_FORMAT_VERSION = "engram-graph/2";

export class UnsupportedGraphFormatError extends Error {
  readonly code = "unsupported-graph-format";
  constructor(marker: unknown, sourceLabel = "graph") {
    super(`${sourceLabel}: unsupported graph format ${String(marker)} or read-only graph`);
    this.name = "UnsupportedGraphFormatError";
  }
}

/** Writer invariant failures must escape recoverable snapshot-read blocks. */
export class RelationEdgeInvariantError extends Error {
  constructor(message: string) {
    super(`upsertRelationEdge: ${message}`);
    this.name = "RelationEdgeInvariantError";
  }
}

/** May be used on raw envelopes or on Graphology attributes before writing. */
export function assertSupportedGraphFormat(raw: Record<string, unknown>, sourceLabel = "graph"): void {
  if (raw.read_only === true || (raw.graph_format !== undefined && raw.graph_format !== GRAPH_FORMAT_VERSION)) {
    throw new UnsupportedGraphFormatError(raw.graph_format, sourceLabel);
  }
  const attributes = raw.graph;
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
    assertSupportedGraphFormat(attributes as Record<string, unknown>, sourceLabel);
  }
}

type Attributes = Record<string, unknown>;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const own = (value: Attributes, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Attributes => value !== null && typeof value === "object" && !Array.isArray(value);
const observationFields = ["source_file", "source_location", "citations", "confidence", "confidence_score", "derivation_method", "evidence_refs", "extractor", "t", "t_end"] as const;
const derivedFields = new Set<string>([...observationFields, "derivation_methods", "evidence_observations"]);
const identityFields = new Set(["source", "target", "_src", "_tgt", "relation"]);

export function assertionIdentityOf(source: unknown, target: unknown, attrs: Attributes = {}): { src: string; tgt: string; relation: string } {
  return {
    src: String(attrs._src ?? source),
    tgt: String(attrs._tgt ?? target),
    relation: typeof attrs.relation === "string" && attrs.relation.length > 0 ? attrs.relation : "related_to",
  };
}

export function edgeKey(src: string, tgt: string, relation: string): string {
  return JSON.stringify([src, tgt, relation]);
}

export function normalizeSourceFilePath(value: unknown, root?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalized = value.replace(/\\/g, "/");
  if (root && isAbsolute(normalized)) {
    try {
      const local = relative(resolve(root), normalized);
      if (local && !local.startsWith("..") && !isAbsolute(local)) normalized = local.replace(/\\/g, "/");
    } catch {
      // Preserve the existing build helper's fallback for invalid runtime roots.
    }
  }
  return normalized;
}

/** Pure preparation boundary; captured observations and their scalars are immutable. */
export function prepareFreshExtraction(extraction: Extraction, options: { root?: string } = {}): Extraction {
  return {
    ...extraction,
    edges: extraction.edges.map(edge => {
      // Leave malformed members to the intake's existing admission checks.
      if (!record(edge) || ![Object.prototype, null].includes(Object.getPrototypeOf(edge))) return edge;
      if (Array.isArray(edge.evidence_observations) && edge.evidence_observations.length > 0) return edge;
      const sourceFile = normalizeSourceFilePath(edge.source_file, options.root);
      return sourceFile === undefined ? { ...edge } : { ...edge, source_file: sourceFile };
    }),
  };
}

/** Snapshot the JSON wire domain, without JSON.stringify's silent coercions. */
function cloneObservationValue(value: unknown, active = new Set<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RelationEdgeInvariantError("evidence observation: non-finite number");
    return value === 0 ? 0 : value;
  }
  if (typeof value !== "object") throw new RelationEdgeInvariantError(`evidence observation: unsupported ${typeof value}`);
  if (active.has(value)) throw new RelationEdgeInvariantError("evidence observation: cycle");
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new RelationEdgeInvariantError("evidence observation: non-plain object");
  if (Object.getOwnPropertySymbols(value).length) throw new RelationEdgeInvariantError("evidence observation: symbol key");
  active.add(value);
  const result = Array.isArray(value)
    ? Array.from(value, member => member === undefined ? null : cloneObservationValue(member, active))
    : Object.fromEntries(Object.keys(value).filter(key => (value as Attributes)[key] !== undefined).map(key => [key, cloneObservationValue((value as Attributes)[key], active)]));
  active.delete(value);
  return result;
}

export function observationFromEmission(attrs: Attributes): EvidenceObservation {
  const fields = Object.fromEntries(observationFields.filter(key => own(attrs, key) && attrs[key] !== undefined).map(key => [key, attrs[key]]));
  if (typeof fields.source_file !== "string") fields.source_file = "";
  return cloneObservationValue(fields) as EvidenceObservation;
}

/** Empty arrays are fresh emissions; nonempty captured sets must retain evidence. */
function decodeCapturedObservations(attrs: Attributes): EvidenceObservation[] | undefined {
  const captured = attrs.evidence_observations;
  if (!Array.isArray(captured) || captured.length === 0) return undefined;
  const members = captured.filter(record).map(value => cloneObservationValue(value) as EvidenceObservation);
  if (!members.length) throw new RelationEdgeInvariantError("captured set has no valid observations");
  return members;
}

/** Raw-first ingestion also recovers plural-only legacy derivation aggregates. */
export function legacyObservationFromRawLink(raw: Attributes): EvidenceObservation[] {
  const captured = decodeCapturedObservations(raw);
  if (captured) return captured;
  const methods = Array.isArray(raw.derivation_methods) ? [...new Set(raw.derivation_methods.filter((value): value is string => typeof value === "string"))].sort(compare) : [];
  return methods.length > 0
    ? methods.map(derivation_method => observationFromEmission({ ...raw, derivation_method }))
    : [observationFromEmission(raw)];
}

function escapeEncode(value: unknown): unknown {
  if (value === null) return ["null"];
  if (typeof value === "boolean") return ["b", value];
  if (typeof value === "string") return ["s", ...Array.from({ length: value.length }, (_, i) => value.charCodeAt(i))];
  if (typeof value === "number") return ["n", JSON.stringify(value)];
  if (Array.isArray(value)) return ["a", ...value.map(escapeEncode)];
  return ["o", Object.entries(value as Attributes).map(([key, member]) => [escapeEncode(key), escapeEncode(member)]).sort((a, b) => compare(canonicalBytes(a[0]), canonicalBytes(b[0])))];
}

export function observationKey(value: Attributes): string {
  const snapshot = cloneObservationValue(value);
  try {
    return "jcs:" + canonicalBytes(snapshot);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "invalid-unicode:lone-surrogate") throw error;
    return "esc:" + canonicalBytes(escapeEncode(snapshot));
  }
}

/** Total residual ordering, independent of locale and object insertion order. */
function compareValues(a: unknown, b: unknown): number {
  const rank = (v: unknown): number => v === null ? 0 : typeof v === "boolean" ? 1 : typeof v === "number" ? 2 : typeof v === "string" ? 3 : Array.isArray(v) ? 4 : 5;
  const delta = rank(a) - rank(b);
  if (delta) return delta;
  if (a === b || (Number.isNaN(a) && Number.isNaN(b))) return 0;
  if (typeof a === "number" && typeof b === "number") {
    const special = (v: number): number => Number.isFinite(v) ? 0 : Number.isNaN(v) ? 1 : v === -Infinity ? 2 : 3;
    return special(a) - special(b) || (a < b ? -1 : 1);
  }
  if (typeof a === "string" && typeof b === "string") return compare(a, b);
  if (typeof a === "boolean") return a ? 1 : -1;
  const as = Array.isArray(a) ? a : Object.keys(a as Attributes).sort(compare);
  const bs = Array.isArray(b) ? b : Object.keys(b as Attributes).sort(compare);
  for (let i = 0; i < Math.min(as.length, bs.length); i++) {
    const d = compareValues(as[i], bs[i]);
    if (d) return d;
  }
  if (as.length !== bs.length) return as.length - bs.length;
  if (!Array.isArray(a)) for (const key of as) {
    const d = compareValues((a as Attributes)[key], (b as Attributes)[key]);
    if (d) return d;
  }
  return 0;
}

/** Compatibility wrapper for small, fixed-arity callers. */
export function mergeEdgeEvidence(existing: Attributes | null, ...incoming: Attributes[]): Attributes {
  return mergeEdgeEvidenceAll(existing, incoming);
}

/** Pure collection union. Validate the full bucket, then derive its final set once. */
export function mergeEdgeEvidenceAll(existing: Attributes | null, incoming: readonly Attributes[]): Attributes {
  const contributions = [...(existing ? [existing] : []), ...incoming];
  const observations = new Map<string, EvidenceObservation>();
  for (const attrs of contributions) {
    const members = decodeCapturedObservations(attrs) ?? [observationFromEmission(attrs)];
    for (const member of members) observations.set(observationKey(member), member);
  }
  const sorted = [...observations].sort(([a], [b]) => compare(a, b)).map(([, value]) => value);
  const result: Attributes = {};
  const keys = [...new Set(contributions.flatMap(Object.keys))].sort(compare);
  for (const key of keys) {
    if (derivedFields.has(key) || identityFields.has(key)) continue;
    const votes = contributions.filter(attrs => own(attrs, key) && attrs[key] !== undefined).map(attrs => attrs[key]);
    if (key === "weight") {
      const weights = votes.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      if (weights.length) result.weight = weights.reduce((maximum, value) => Math.max(maximum, value), -Infinity);
    } else if (key === "assertion_basis") {
      const members = [...new Set(votes.flatMap(value => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []))].sort(compare);
      if (votes.length) result[key] = members.length === 1 && votes.every(value => typeof value === "string") ? members[0] : members;
    } else if (votes.length) {
      Object.defineProperty(result, key, {
        value: structuredClone(votes.sort(compareValues)[0]),
        enumerable: true, writable: true, configurable: true,
      });
    }
  }
  result.evidence_observations = sorted;
  if (!sorted.length) throw new RelationEdgeInvariantError("requires a nonempty observation set");
  const confidenceRank = new Map([["AMBIGUOUS", 1], ["INFERRED", 2], ["EXTRACTED", 3]]);
  const defaults = new Map([["EXTRACTED", 1], ["INFERRED", 0.5], ["AMBIGUOUS", 0.2]]);
  const confidences = sorted.map(rec => rec.confidence).filter((value): value is string => typeof value === "string").sort((a, b) => (confidenceRank.get(b) ?? 0) - (confidenceRank.get(a) ?? 0) || compare(a, b));
  if (confidences.length) result.confidence = confidences[0];
  result.confidence_score = sorted.reduce((maximum, rec) => Math.max(maximum,
    typeof rec.confidence_score === "number" ? rec.confidence_score : defaults.get(rec.confidence ?? "") ?? 1), -Infinity);
  const methods = [...new Set(sorted.map(rec => rec.derivation_method).filter((value): value is string => typeof value === "string" && value.length > 0))].sort(compare);
  if (methods.length) { result.derivation_methods = methods; result.derivation_method = methods[0]; }
  const citations = new Map<string, Attributes>();
  for (const rec of sorted) if (Array.isArray(rec.citations)) for (const citation of rec.citations) if (record(citation)) citations.set(observationKey(citation), citation);
  if (citations.size) result.citations = [...citations].sort(([a], [b]) => compare(a, b)).map(([, value]) => value);
  const refs = [...new Set(sorted.flatMap(rec => Array.isArray(rec.evidence_refs) ? rec.evidence_refs.filter((value): value is string => typeof value === "string") : []))].sort(compare);
  if (refs.length) result.evidence_refs = refs;
  let earliest = Infinity;
  let latest = -Infinity;
  let openEnded = false;
  for (const rec of sorted) {
    const bounds = closedTemporalBounds(rec);
    if (!bounds) continue;
    earliest = Math.min(earliest, bounds.t);
    if (bounds.tEnd === undefined) openEnded = true;
    else latest = Math.max(latest, bounds.tEnd);
  }
  if (earliest !== Infinity) {
    result.t = earliest;
    if (!openEnded) result.t_end = latest;
  }
  result.source_file = typeof sorted[0]!.source_file === "string" ? sorted[0]!.source_file : "";
  if (typeof sorted[0]!.source_location === "string") result.source_location = sorted[0]!.source_location;
  return result;
}

export function upsertRelationEdge(G: Graph, source: string, target: string, attrs: Attributes): string {
  assertSupportedGraphFormat(G.getAttributes(), "upsertRelationEdge");
  if (G.multi !== true) throw new RelationEdgeInvariantError("requires a multigraph");
  const { src, tgt, relation } = assertionIdentityOf(source, target, attrs);
  if (!G.hasNode(src) || !G.hasNode(tgt)) throw new RelationEdgeInvariantError(`missing effective endpoint (${src}, ${tgt})`);
  const key = edgeKey(src, tgt, relation);
  const exists = G.hasEdge(key);
  const current = exists ? G.getEdgeAttributes(key) : null;
  if (exists) {
    const [storedSrc, storedTgt] = G.extremities(key);
    const effective = assertionIdentityOf(storedSrc, storedTgt, current!);
    if (storedSrc !== src || storedTgt !== tgt || effective.src !== src || effective.tgt !== tgt || effective.relation !== relation) throw new RelationEdgeInvariantError("ordered assertion invariant mismatch");
  }
  const merged: Attributes = { ...mergeEdgeEvidence(current, attrs), _src: src, _tgt: tgt, relation };
  if (!Array.isArray(merged.evidence_observations) || merged.evidence_observations.length === 0) {
    throw new RelationEdgeInvariantError("requires a nonempty observation set before writing");
  }
  if (exists) G.replaceEdgeAttributes(key, merged);
  else G.addEdgeWithKey(key, src, tgt, merged);
  return key;
}

export interface PairEdge {
  key: string;
  attrs: Attributes;
  src: string;
  tgt: string;
  orientation: "forward" | "reverse" | "self" | "as-stored";
}

export function getPairEdges(G: Graph, u: string, v: string, opts: { traversable?: boolean } = {}): PairEdge[] {
  return G.edges(u, v).map(key => {
    const attrs = G.getEdgeAttributes(key);
    const [source, target] = G.extremities(key);
    const { src, tgt } = assertionIdentityOf(source, target, attrs);
    const orientation: PairEdge["orientation"] = attrs._src == null && attrs._tgt == null ? "as-stored" : src === tgt ? "self" : src === u && tgt === v ? "forward" : "reverse";
    return { key, attrs, src, tgt, orientation };
  }).filter(edge => opts.traversable === false || !isDirectedGraph(G) || edge.src === u && edge.tgt === v)
    .sort((a, b) => compare(edgeKey(a.src, a.tgt, assertionIdentityOf(a.src, a.tgt, a.attrs).relation), edgeKey(b.src, b.tgt, assertionIdentityOf(b.src, b.tgt, b.attrs).relation)) || compare(a.key, b.key));
}

export function neighborDegree(G: Graph, node: string): number { return G.neighbors(node).length; }
export function edgeCount(G: Graph, node: string): number { return G.edges(node).length; }

/** Readers accept both caller-built simple graphs and multigraphs. */
export function readerDegree(G: Graph, node: string): number {
  return neighborDegree(G, node);
}

export function readerPairEdges(G: Graph, u: string, v: string): PairEdge[] {
  return getPairEdges(G, u, v);
}

export interface SerializedGraphData {
  topology_signature?: unknown;
  graph_format?: string;
  directed?: boolean;
  multigraph?: boolean;
  graph?: Record<string, unknown>;
  nodes?: Array<Record<string, unknown> & { id: string }>;
  links?: Array<Record<string, unknown> & { source: string; target: string }>;
  edges?: Array<Record<string, unknown> & { source: string; target: string }>;
  hyperedges?: Array<Record<string, unknown>>;
}

export function createGraph(directed: boolean = false): Graph {
  return new Graph({ type: directed ? "directed" : "undirected", multi: true });
}

export function isDirectedGraph(G: Graph): boolean {
  return G.type === "directed";
}

export function loadGraphFromData(
  raw: SerializedGraphData,
  options?: { memoryHighWaterCursor?: string; allowUnknownFormatReadOnly?: boolean },
): Graph {
  let readOnly = false;
  try {
    assertSupportedGraphFormat(raw as Record<string, unknown>, "loadGraphFromData");
  } catch (error) {
    if (!options?.allowUnknownFormatReadOnly || !(error instanceof UnsupportedGraphFormatError)) throw error;
    readOnly = true;
  }
  // Validate all raw contributions before constructing any destination state.
  for (const link of raw.links ?? raw.edges ?? []) legacyObservationFromRawLink(link);
  const G = createGraph(raw.directed === true);

  for (const [key, value] of Object.entries(raw.graph ?? {})) {
    if (readOnly && (key === "read_only" || key === "graph_format")) continue;
    G.setAttribute(key, value);
  }

  for (const node of raw.nodes ?? []) {
    const { id, ...attrs } = node;
    G.mergeNode(id, attrs);
  }

  for (const link of raw.links ?? raw.edges ?? []) {
    const { source, target, ...attrs } = link;
    const { src, tgt } = assertionIdentityOf(source, target, attrs);
    if (!G.hasNode(src) || !G.hasNode(tgt)) continue;
    upsertRelationEdge(G, source, target, { ...attrs, evidence_observations: legacyObservationFromRawLink(link) });
  }

  if (raw.hyperedges && raw.hyperedges.length > 0) {
    G.setAttribute("hyperedges", raw.hyperedges);
  }

  // Persisted cursor pins are not a live authorization/freshness proof.
  if (readOnly) {
    G.setAttribute("graph_format", own(raw as Record<string, unknown>, "graph_format") ? raw.graph_format : raw.graph?.graph_format);
    G.setAttribute("read_only", true);
  }
  // Every reload uses the same mandatory gate as reports and exports.
  enforceMemoryFreshnessForSurface(G, options?.memoryHighWaterCursor);
  return G;
}

export function serializeGraph(G: Graph): SerializedGraphData {
  assertSupportedGraphFormat(G.getAttributes(), "serializeGraph");
  const nodes: Array<Record<string, unknown> & { id: string }> = [];
  G.forEachNode((nodeId, attrs) => {
    nodes.push({ id: nodeId, ...attrs });
  });

  const links: Array<Record<string, unknown> & { source: string; target: string }> = [];
  G.forEachEdge((_edge, attrs, source, target) => {
    links.push(graphJsonLink(source, target, attrs) as Record<string, unknown> & { source: string; target: string });
  });

  const graph = G.getAttributes();
  const hyperedges = G.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined;

  return {
    graph_format: GRAPH_FORMAT_VERSION,
    topology_signature: topologySignatureFromRows(nodes, links),
    directed: isDirectedGraph(G),
    multigraph: true,
    graph,
    nodes: nodes.sort((a, b) => compare(a.id, b.id)).map(deepSortKeys),
    links: links.sort(compareLinkRows),
    ...(hyperedges && hyperedges.length > 0 ? { hyperedges } : {}),
  };
}

export function toUndirectedGraph(G: Graph): Graph {
  if (!isDirectedGraph(G)) return G.copy();

  const copy = createGraph(false);

  for (const [key, value] of Object.entries(G.getAttributes())) {
    copy.setAttribute(key, value);
  }

  G.forEachNode((nodeId, attrs) => {
    copy.mergeNode(nodeId, attrs);
  });

  G.forEachEdge((_edge, attrs, source, target) => {
    const { src, tgt } = assertionIdentityOf(source, target, attrs);
    if (!copy.hasNode(src) || !copy.hasNode(tgt)) return;
    upsertRelationEdge(copy, source, target, attrs);
  });

  return copy;
}

export function forEachTraversalNeighbor(
  G: Graph,
  node: string,
  callback: (neighbor: string) => void,
): void {
  if (isDirectedGraph(G)) {
    G.forEachOutboundNeighbor(node, callback);
    return;
  }
  G.forEachNeighbor(node, callback);
}

export function traversalNeighbors(G: Graph, node: string): string[] {
  const neighbors: string[] = [];
  forEachTraversalNeighbor(G, node, (neighbor) => {
    neighbors.push(neighbor);
  });
  return neighbors;
}

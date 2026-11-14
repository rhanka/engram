import type Graph from "graphology";
import { assertionIdentityOf, assertSupportedGraphFormat, edgeKey, legacyObservationFromRawLink, mergeEdgeEvidenceAll, upsertRelationEdge } from "./graph.js";

export interface RelationContribution {
  source: string;
  target: string;
  attrs: Record<string, unknown>;
}

/** Validate the whole batch and affected stored evidence before any mutation. */
export function prepareRelationContributions(G: Graph, rows: readonly RelationContribution[]): RelationContribution[] {
  const buckets = new Map<string, { src: string; tgt: string; relation: string; contributions: Record<string, unknown>[] }>();
  for (const { source, target, attrs } of rows) {
    const { src, tgt, relation } = assertionIdentityOf(source, target, attrs);
    const key = edgeKey(src, tgt, relation);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { src, tgt, relation, contributions: [] };
      buckets.set(key, bucket);
    }
    bucket.contributions.push(attrs);
  }
  // One union per tuple: retaining every growing prefix is quadratic in evidence.
  // Finish every bucket before returning anything that a caller can replay.
  return [...buckets].map(([key, { src: source, tgt: target, relation, contributions }]) => {
    const current = G.hasEdge(key) ? G.getEdgeAttributes(key) : null;
    const attrs = { ...mergeEdgeEvidenceAll(current, contributions), _src: source, _tgt: target, relation };
    return { source, target, attrs };
  });
}

export function prepareRelationGraphReplay(target: Graph, source: Graph): RelationContribution[] {
  assertSupportedGraphFormat(source.getAttributes(), "edge replay source");
  assertSupportedGraphFormat(target.getAttributes(), "edge replay target");
  const rows: RelationContribution[] = [];
  source.forEachEdge((_key, attrs, source, target) => rows.push({ source, target, attrs: { ...attrs, evidence_observations: legacyObservationFromRawLink(attrs) } }));
  return prepareRelationContributions(target, rows);
}

export function replayPreparedRelationEdges(G: Graph, rows: readonly RelationContribution[]): void {
  for (const { source, target, attrs } of rows) {
    if (!G.hasNode(source) || !G.hasNode(target)) continue;
    upsertRelationEdge(G, source, target, attrs);
  }
}

/** Replay a stored row, capturing raw legacy fields before any shell defaults. */
export function replayRelationEdge(G: Graph, source: string, target: string, attrs: Record<string, unknown>): void {
  replayPreparedRelationEdges(G, prepareRelationContributions(G, [{ source, target, attrs: { ...attrs, evidence_observations: legacyObservationFromRawLink(attrs) } }]));
}

export function replayRelationGraph(target: Graph, source: Graph): void {
  replayPreparedRelationEdges(target, prepareRelationGraphReplay(target, source));
}

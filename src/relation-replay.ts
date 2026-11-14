import type Graph from "graphology";
import { assertionIdentityOf, assertSupportedGraphFormat, edgeKey, legacyObservationFromRawLink, mergeEdgeEvidence, upsertRelationEdge } from "./graph.js";

export interface RelationContribution {
  source: string;
  target: string;
  attrs: Record<string, unknown>;
}

/** Validate the whole batch and affected stored evidence before any mutation. */
export function prepareRelationContributions(G: Graph, rows: readonly RelationContribution[]): RelationContribution[] {
  const pending = new Map<string, Record<string, unknown>>();
  return rows.map(({ source, target, attrs }) => {
    const { src, tgt, relation } = assertionIdentityOf(source, target, attrs);
    const key = edgeKey(src, tgt, relation);
    const current = pending.get(key) ?? (G.hasEdge(key) ? G.getEdgeAttributes(key) : null);
    const validated = { ...mergeEdgeEvidence(current, attrs), _src: src, _tgt: tgt, relation };
    pending.set(key, validated);
    return { source: src, target: tgt, attrs: validated };
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

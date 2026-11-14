import { assertionIdentityOf, legacyObservationFromRawLink, mergeEdgeEvidence, prepareFreshExtraction } from "../graph.js";
import type { GraphEdge } from "../types.js";
import { normalizeStoreEdgeIdentity, type GraphEdgeInput } from "./types.js";

/** Materialise the storage port's literal triple before invoking the P1 core. */
export function mergeStoreEdgeContribution(current: Record<string, unknown> | null, incoming: GraphEdgeInput): GraphEdgeInput {
  const identity = normalizeStoreEdgeIdentity(incoming.source, incoming.target, incoming.relation);
  const prepared = prepareFreshExtraction({
    nodes: [], edges: [incoming as GraphEdge], hyperedges: [], input_tokens: 0, output_tokens: 0,
  }).edges[0]!;
  const prior = current ? { ...current, evidence_observations: legacyObservationFromRawLink(current) } : null;
  return {
    ...mergeEdgeEvidence(prior, { ...prepared, ...identity, _src: identity.source, _tgt: identity.target }),
    ...identity, _src: identity.source, _tgt: identity.target,
  };
}

/** Graph pushes carry a core-materialised identity; they do not use port defaults. */
export function graphEdgeContribution(source: string, target: string, attrs: Record<string, unknown>): GraphEdgeInput {
  const { src, tgt, relation } = assertionIdentityOf(source, target, attrs);
  return mergeStoreEdgeContribution(null, { ...attrs, source: src, target: tgt, relation, evidence_observations: legacyObservationFromRawLink(attrs) });
}

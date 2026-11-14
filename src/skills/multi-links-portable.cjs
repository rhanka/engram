// Compatibility: upgrade the runtime, Git merge driver and all installed skills
// together. Old runtimes collapse v2 parallel/reciprocal links on rewrite.
// Degree means distinct neighbours; edgeCount counts incident links (loop once).
// QA min/max_degree_by_type keeps endpoint incidence: self-loop counts twice.
// Captured provenance stays verbatim; shortening is an inspection projection.
// Neo4j/Spanner retain derived scalars only and warn: observations not persisted.
// Shared portable block for the six skill documents (activation embeds it).
// Bind to the installed core so scripts use the same capture, validation,
// canonical identity, derivation and writer implementation as the library.
const {
  createGraph, loadGraphFromData, serializeGraph,
  assertionIdentityOf, edgeKey, normalizeSourceFilePath, prepareFreshExtraction,
  legacyObservationFromRawLink, observationFromEmission, observationKey,
  mergeEdgeEvidence, upsertRelationEdge, getPairEdges, neighborDegree, edgeCount,
  GRAPH_FORMAT_VERSION, assertSupportedGraphFormat, UnsupportedGraphFormatError,
} = require('@sentropic/engram');

if (GRAPH_FORMAT_VERSION !== 'engram-graph/2' || typeof upsertRelationEdge !== 'function') {
  throw new Error('The multi-links skill requires an upgraded Engram runtime.');
}

module.exports = {
  createGraph, loadGraphFromData, serializeGraph,
  assertionIdentityOf, edgeKey, normalizeSourceFilePath, prepareFreshExtraction,
  legacyObservationFromRawLink, observationFromEmission, observationKey,
  mergeEdgeEvidence, upsertRelationEdge, getPairEdges, neighborDegree, edgeCount,
  GRAPH_FORMAT_VERSION, assertSupportedGraphFormat, UnsupportedGraphFormatError,
};

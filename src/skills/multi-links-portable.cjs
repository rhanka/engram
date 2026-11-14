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

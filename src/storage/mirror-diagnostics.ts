import type Graph from "graphology";

/** Pure diagnostics for the explicitly scalar-only mirrors. */
export function mirrorObservationWarnings(G: Graph, backend: string, relationLabel?: (relation: string) => string): string[] {
  let discarded = 0;
  const relations = new Set<string>();
  G.forEachEdge((_key, attrs) => {
    if (Array.isArray(attrs.evidence_observations) && attrs.evidence_observations.length > 0) discarded++;
    if (relationLabel && typeof attrs.relation === "string" && relationLabel(attrs.relation) !== attrs.relation) relations.add(attrs.relation);
  });
  const warnings = discarded ? [`${backend}: ${discarded} edge${discarded === 1 ? "" : "s"}: observations not persisted (derived scalars only)`] : [];
  for (const relation of [...relations].sort()) warnings.push(`${backend}: relation ${JSON.stringify(relation)} cannot round-trip through label ${JSON.stringify(relationLabel!(relation))}`);
  return warnings;
}

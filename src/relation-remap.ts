import { assertionIdentityOf } from "./graph.js";
import type { GraphEdge } from "./types.js";

/** Shared emission rewrite for the three prepared remappers, activated in A. */
export function remapRelationEmissions(edges: readonly GraphEdge[], resolve: (id: string) => string): GraphEdge[] {
  const resolveFully = (id: string): string => {
    const visited = new Set<string>();
    while (!visited.has(id)) {
      visited.add(id);
      const next = resolve(id);
      if (next === id) return id;
      id = next;
    }
    throw new Error("cyclic relation endpoint remap");
  };
  return edges.flatMap(edge => {
    const { src, tgt, relation } = assertionIdentityOf(edge.source, edge.target, edge);
    const source = resolveFully(src), target = resolveFully(tgt);
    if (src !== tgt && source === target) return [];
    return [{ ...edge, source, target, _src: source, _tgt: target, relation }];
  });
}

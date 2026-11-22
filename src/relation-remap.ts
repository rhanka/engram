import type { GraphEdge } from "./types.js";

/**
 * Identity of one emitted relation: the surviving source and target after
 * `_src`/`_tgt` redirection, and the relation label (default `related_to`).
 *
 * Pure value function with no imports beyond types (plan/09 L5-P2a, edge 4):
 * moved here verbatim from `src/graph.ts` so that the closed extraction core
 * reaches it without the `graphology` import of that module. `src/graph.ts`
 * imports it from here and re-exports it, so it keeps one definition and no
 * importer of `./graph.js` changes.
 */
export function assertionIdentityOf(
  source: unknown,
  target: unknown,
  attrs: Record<string, unknown> = {},
): { src: string; tgt: string; relation: string } {
  return {
    src: String(attrs._src ?? source),
    tgt: String(attrs._tgt ?? target),
    relation: typeof attrs.relation === "string" && attrs.relation.length > 0 ? attrs.relation : "related_to",
  };
}

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

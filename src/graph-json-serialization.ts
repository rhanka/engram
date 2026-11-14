/** The graph.json row shape and encoding shared by projection sizing and export. */
import { assertionIdentityOf, edgeKey, legacyObservationFromRawLink, mergeEdgeEvidence } from "./graph.js";
type Row = Record<string, unknown>;

export const compareCodeUnits = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function deepSortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepSortKeys) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort(compareCodeUnits).map(key => [key, deepSortKeys((value as Row)[key])])) as T;
  }
  return value;
}

export function compareLinkRows(a: Row, b: Row): number {
  const left = assertionIdentityOf(a.source, a.target, a);
  const right = assertionIdentityOf(b.source, b.target, b);
  return compareCodeUnits(edgeKey(left.src, left.tgt, left.relation), edgeKey(right.src, right.tgt, right.relation));
}

export function topologySignatureFromRows(nodes: ReadonlyArray<{ id: unknown }>, links: ReadonlyArray<{ source: unknown; target: unknown; relation?: unknown }>): string {
  const ids = nodes.map(node => String(node.id)).sort(compareCodeUnits);
  const edges = links.map(link => {
    const { src, tgt, relation } = assertionIdentityOf(link.source, link.target, link as Row);
    return edgeKey(src, tgt, relation);
  }).sort(compareCodeUnits);
  return `topo/2;n=${ids.length};e=${edges.length};${JSON.stringify(ids)}|${edges.join(";")}`;
}

export function graphJsonNode(
  id: string,
  attrs: Row,
  community: number | null = null,
  community_name: string | null = null,
): Row {
  return { id, ...attrs, community, community_name };
}

export function graphJsonLink(source: string, target: string, attrs: Row): Row {
  const { src, tgt, relation } = assertionIdentityOf(source, target, attrs);
  const normalized = mergeEdgeEvidence(null, { ...attrs, evidence_observations: legacyObservationFromRawLink(attrs) });
  return deepSortKeys({ ...normalized, source: src, target: tgt, _src: src, _tgt: tgt, relation });
}

export function serializeGraphJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Include the array framing and the indentation used at the graph.json root. */
export function memoryGraphJsonByteSize(nodes: Row[], links: Row[]): number {
  const memoryNodes = nodes.filter((node) => node.file_type === "memory");
  if (memoryNodes.length === 0) return 0;
  const ids = new Set(memoryNodes.map((node) => node.id));
  const memoryLinks = links.filter((link) => ids.has(link.source) || ids.has(link.target));
  return Buffer.byteLength(serializeGraphJson({ nodes: memoryNodes, links: memoryLinks }), "utf-8");
}

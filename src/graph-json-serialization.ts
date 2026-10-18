/** The graph.json row shape and encoding shared by projection sizing and export. */
type Row = Record<string, unknown>;

export function graphJsonNode(
  id: string,
  attrs: Row,
  community: number | null = null,
  community_name: string | null = null,
): Row {
  return { id, ...attrs, community, community_name };
}

export function graphJsonLink(source: string, target: string, attrs: Row): Row {
  const link = { source, target, ...attrs } as Row;
  if (link.confidence_score === undefined) {
    const defaults: Record<string, number> = { EXTRACTED: 1.0, INFERRED: 0.5, AMBIGUOUS: 0.2 };
    link.confidence_score = defaults[(attrs.confidence as string) ?? "EXTRACTED"] ?? 1.0;
  }
  return link;
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

/** Display lanes use ordered pairs: reversal supplies the opposite geometric side. */
export function relationEdgeLanes<T extends { source: string; target: string; relation?: string; curvature?: number }>(edges: T[], base: number): number[] {
  const lanes = edges.map(edge => Number.isFinite(edge.curvature) ? edge.curvature! : base);
  const groups = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = JSON.stringify([edge.source, edge.target]);
    const members = groups.get(key) ?? [];
    members.push(index);
    groups.set(key, members);
  });
  for (const members of groups.values()) {
    members.sort((a, b) => {
      const left = JSON.stringify([edges[a]!.source, edges[a]!.target, edges[a]!.relation ?? ""]);
      const right = JSON.stringify([edges[b]!.source, edges[b]!.target, edges[b]!.relation ?? ""]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    members.forEach((index, lane) => {
      if (!Number.isFinite(edges[index]!.curvature)) lanes[index] = base === 0 ? 0 : base + lane * 0.12;
    });
  }
  return lanes;
}

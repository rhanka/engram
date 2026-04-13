/**
 * Wiki export - Wikipedia-style markdown articles from the knowledge graph.
 * Generates an agent-crawlable wiki: index.md + one article per community + god node articles.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Graph from "graphology";
import type { GodNodeEntry } from "./types.js";
import { type NumericMapLike, toNumericMap } from "./collections.js";
import { traversalNeighbors } from "./graph.js";

function safeFilename(name: string): string {
  return name.replace(/\//g, "-").replace(/ /g, "_").replace(/:/g, "-");
}

function crossCommunityLinks(
  G: Graph,
  nodes: string[],
  ownCid: number,
  labels: NumericMapLike<string>,
): [string, number][] {
  const labelMap = toNumericMap(labels);
  const counts = new Map<string, number>();
  for (const nid of nodes) {
    for (const neighbor of traversalNeighbors(G, nid)) {
      const ncid = G.getNodeAttribute(neighbor, "community") as number | undefined;
      if (ncid !== undefined && ncid !== ownCid) {
        const label = labelMap.get(ncid) ?? `Community ${ncid}`;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function communityArticle(
  G: Graph,
  cid: number,
  nodes: string[],
  label: string,
  labels: Map<number, string>,
  cohesion: number | undefined,
): string {
  const topNodes = [...nodes].sort((a, b) => G.degree(b) - G.degree(a)).slice(0, 25);
  const cross = crossCommunityLinks(G, nodes, cid, labels);

  const confCounts: Record<string, number> = { EXTRACTED: 0, INFERRED: 0, AMBIGUOUS: 0 };
  for (const nid of nodes) {
    G.forEachEdge(nid, (_, data) => {
      const conf = (data.confidence as string) ?? "EXTRACTED";
      confCounts[conf] = (confCounts[conf] ?? 0) + 1;
    });
  }
  const totalEdges = Object.values(confCounts).reduce((s, n) => s + n, 0) || 1;

  const sources = [...new Set(nodes.map((n) => (G.getNodeAttribute(n, "source_file") as string) ?? "").filter(Boolean))].sort();

  const lines: string[] = [];
  lines.push(`# ${label}`, "");

  const metaParts = [`${nodes.length} nodes`];
  if (cohesion !== undefined) metaParts.push(`cohesion ${cohesion.toFixed(2)}`);
  lines.push(`> ${metaParts.join(" · ")}`, "");

  lines.push("## Key Concepts", "");
  for (const nid of topNodes) {
    const d = G.getNodeAttributes(nid);
    const nodeLabel = (d.label as string) ?? nid;
    const src = (d.source_file as string) ?? "";
    const degree = G.degree(nid);
    const srcStr = src ? ` — \`${src}\`` : "";
    lines.push(`- **${nodeLabel}** (${degree} connections)${srcStr}`);
  }
  const remaining = nodes.length - topNodes.length;
  if (remaining > 0) lines.push(`- *... and ${remaining} more nodes in this community*`);
  lines.push("");

  lines.push("## Relationships", "");
  if (cross.length > 0) {
    for (const [otherLabel, count] of cross.slice(0, 12)) {
      lines.push(`- [[${otherLabel}]] (${count} shared connections)`);
    }
  } else {
    lines.push("- No strong cross-community connections detected");
  }
  lines.push("");

  if (sources.length > 0) {
    lines.push("## Source Files", "");
    for (const src of sources.slice(0, 20)) {
      lines.push(`- \`${src}\``);
    }
    lines.push("");
  }

  lines.push("## Audit Trail", "");
  for (const conf of ["EXTRACTED", "INFERRED", "AMBIGUOUS"]) {
    const n = confCounts[conf] ?? 0;
    const pct = Math.round((n / totalEdges) * 100);
    lines.push(`- ${conf}: ${n} (${pct}%)`);
  }
  lines.push("");

  lines.push("---", "", "*Part of the graphify knowledge wiki. See [[index]] to navigate.*");
  return lines.join("\n");
}

function godNodeArticle(G: Graph, nid: string, labels: Map<number, string>): string {
  const d = G.getNodeAttributes(nid);
  const nodeLabel = (d.label as string) ?? nid;
  const src = (d.source_file as string) ?? "";
  const cid = d.community as number | undefined;
  const communityName = cid !== undefined ? (labels.get(cid) ?? `Community ${cid}`) : undefined;

  const lines: string[] = [];
  lines.push(`# ${nodeLabel}`, "");
  lines.push(`> God node · ${G.degree(nid)} connections · \`${src}\``, "");

  if (communityName) {
    lines.push(`**Community:** [[${communityName}]]`, "");
  }

  const byRelation = new Map<string, string[]>();
  const neighbors = traversalNeighbors(G, nid).sort((a, b) => G.degree(b) - G.degree(a));
  for (const neighbor of neighbors) {
    const ed = G.getEdgeAttributes(G.edge(nid, neighbor)!);
    const rel = (ed.relation as string) ?? "related";
    const neighborLabel = (G.getNodeAttribute(neighbor, "label") as string) ?? neighbor;
    const conf = (ed.confidence as string) ?? "";
    const confStr = conf ? ` \`${conf}\`` : "";
    if (!byRelation.has(rel)) byRelation.set(rel, []);
    byRelation.get(rel)!.push(`[[${neighborLabel}]]${confStr}`);
  }

  lines.push("## Connections by Relation", "");
  for (const [rel, targets] of [...byRelation.entries()].sort()) {
    lines.push(`### ${rel}`);
    for (const t of targets.slice(0, 20)) {
      lines.push(`- ${t}`);
    }
    lines.push("");
  }

  lines.push("---", "", "*Part of the graphify knowledge wiki. See [[index]] to navigate.*");
  return lines.join("\n");
}

function indexMd(
  communities: Map<number, string[]>,
  labels: Map<number, string>,
  godNodesData: GodNodeEntry[],
  totalNodes: number,
  totalEdges: number,
): string {
  const lines: string[] = [
    "# Knowledge Graph Index",
    "",
    "> Auto-generated by graphify. Start here — read community articles for context, then drill into god nodes for detail.",
    "",
    `**${totalNodes} nodes · ${totalEdges} edges · ${communities.size} communities**`,
    "",
    "---",
    "",
    "## Communities",
    "(sorted by size, largest first)",
    "",
  ];

  const sorted = [...communities.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [cid, nodes] of sorted) {
    const label = labels.get(cid) ?? `Community ${cid}`;
    lines.push(`- [[${label}]] — ${nodes.length} nodes`);
  }
  lines.push("");

  if (godNodesData.length > 0) {
    lines.push("## God Nodes", "(most connected concepts — the load-bearing abstractions)", "");
    for (const node of godNodesData) {
      lines.push(`- [[${node.label}]] — ${node.edges} connections`);
    }
    lines.push("");
  }

  lines.push(
    "---",
    "",
    "*Generated by [graphify](https://github.com/safishamsi/graphify)*",
  );
  return lines.join("\n");
}

export function toWiki(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputDir: string,
  options?: {
    communityLabels?: NumericMapLike<string>;
    cohesion?: NumericMapLike<number>;
    godNodesData?: GodNodeEntry[];
  },
): number {
  const communityMap = toNumericMap(communities);
  mkdirSync(outputDir, { recursive: true });

  const labels = options?.communityLabels
    ? toNumericMap(options.communityLabels)
    : new Map([...communityMap.keys()].map((cid) => [cid, `Community ${cid}`]));
  const cohesion = toNumericMap(options?.cohesion);
  const godNodesData = options?.godNodesData ?? [];

  let count = 0;

  // Community articles
  for (const [cid, nodes] of communityMap) {
    const label = labels.get(cid) ?? `Community ${cid}`;
    const article = communityArticle(G, cid, nodes, label, labels, cohesion.get(cid));
    writeFileSync(join(outputDir, `${safeFilename(label)}.md`), article);
    count++;
  }

  // God node articles
  for (const nodeData of godNodesData) {
    const nid = nodeData.id;
    if (nid && G.hasNode(nid)) {
      const article = godNodeArticle(G, nid, labels);
      writeFileSync(join(outputDir, `${safeFilename(nodeData.label)}.md`), article);
      count++;
    }
  }

  // Index
  writeFileSync(
    join(outputDir, "index.md"),
    indexMd(communityMap, labels, godNodesData, G.order, G.size),
  );

  return count;
}

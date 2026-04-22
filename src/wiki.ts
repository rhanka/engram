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
import type { ReviewFlow, ReviewFlowArtifact } from "./flows.js";

interface WikiPageRef {
  key: string;
  title: string;
  filename: string;
  link: string;
}

function safeFilename(name: string): string {
  return name
    .replace(/\r\n/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\//g, "-")
    .replace(/ /g, "_")
    .replace(/:/g, "-");
}

function uniquePageRefs(pages: Array<{ key: string; title: string }>): Map<string, WikiPageRef> {
  const used = new Set<string>();
  const refs = new Map<string, WikiPageRef>();
  for (const page of pages) {
    const base = safeFilename(page.title) || "page";
    let stem = base;
    let suffix = 2;
    while (used.has(stem)) {
      stem = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(stem);
    refs.set(page.key, {
      key: page.key,
      title: page.title,
      filename: `${stem}.md`,
      link: stem === base ? `[[${page.title}]]` : `[[${stem}|${page.title}]]`,
    });
  }
  return refs;
}

function normalizeFlows(input?: ReviewFlowArtifact | ReviewFlow[] | null): ReviewFlow[] {
  if (!input) return [];
  return Array.isArray(input) ? input : input.flows;
}

function compareFlowCriticality(a: ReviewFlow, b: ReviewFlow): number {
  return b.criticality - a.criticality || a.name.localeCompare(b.name);
}

function flowsThroughNodes(flows: ReviewFlow[], nodes: string[]): ReviewFlow[] {
  const nodeSet = new Set(nodes);
  return flows
    .filter((flow) => flow.path.some((nodeId) => nodeSet.has(nodeId)))
    .sort(compareFlowCriticality);
}

function crossCommunityLinks(
  G: Graph,
  nodes: string[],
  ownCid: number,
): [number, number][] {
  const counts = new Map<number, number>();
  for (const nid of nodes) {
    for (const neighbor of traversalNeighbors(G, nid)) {
      const ncid = G.getNodeAttribute(neighbor, "community") as number | undefined;
      if (ncid !== undefined && ncid !== ownCid) {
        counts.set(ncid, (counts.get(ncid) ?? 0) + 1);
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
  communityLinks: Map<number, string>,
  flows: ReviewFlow[],
  flowLinks: Map<string, string>,
): string {
  const topNodes = [...nodes].sort((a, b) => G.degree(b) - G.degree(a)).slice(0, 25);
  const cross = crossCommunityLinks(G, nodes, cid);
  const communityFlows = flowsThroughNodes(flows, nodes);

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
    for (const [otherCid, count] of cross.slice(0, 12)) {
      lines.push(`- ${communityLinks.get(otherCid) ?? `[[${labels.get(otherCid) ?? `Community ${otherCid}`}]]`} (${count} shared connections)`);
    }
  } else {
    lines.push("- No strong cross-community connections detected");
  }
  lines.push("");

  if (communityFlows.length > 0) {
    lines.push("## Execution Flows", "");
    for (const flow of communityFlows.slice(0, 12)) {
      const link = flowLinks.get(flow.id) ?? `[[Flow ${flow.name}]]`;
      lines.push(`- ${link} — criticality ${flow.criticality.toFixed(4)} · ${flow.nodeCount} nodes · ${flow.fileCount} files`);
    }
    lines.push("");
  }

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

function godNodeArticle(G: Graph, nid: string, labels: Map<number, string>, communityLinks: Map<number, string>): string {
  const d = G.getNodeAttributes(nid);
  const nodeLabel = (d.label as string) ?? nid;
  const src = (d.source_file as string) ?? "";
  const cid = d.community as number | undefined;
  const communityName = cid !== undefined ? (labels.get(cid) ?? `Community ${cid}`) : undefined;

  const lines: string[] = [];
  lines.push(`# ${nodeLabel}`, "");
  lines.push(`> God node · ${G.degree(nid)} connections · \`${src}\``, "");

  if (communityName) {
    lines.push(`**Community:** ${communityLinks.get(cid!) ?? `[[${communityName}]]`}`, "");
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

function flowArticle(G: Graph, flow: ReviewFlow, communityLinks: Map<number, string>): string {
  const lines: string[] = [];
  lines.push(`# Flow ${flow.name}`, "");
  lines.push(
    `> Execution flow · criticality ${flow.criticality.toFixed(4)} · depth ${flow.depth} · ` +
      `${flow.nodeCount} nodes · ${flow.fileCount} files`,
    "",
  );
  lines.push(`**Entry point:** \`${flow.entryPoint}\``, "");

  if (flow.files.length > 0) {
    lines.push("## Files", "");
    for (const file of flow.files) lines.push(`- \`${file}\``);
    lines.push("");
  }

  lines.push("## Steps", "");
  flow.path.forEach((nodeId, index) => {
    const attrs = G.hasNode(nodeId) ? G.getNodeAttributes(nodeId) : {};
    const label = (attrs.label as string | undefined) ?? flow.qualifiedPath[index] ?? nodeId;
    const file = (attrs.source_file as string | undefined) ?? "";
    const cid = attrs.community as number | undefined;
    const community = cid !== undefined ? ` · ${communityLinks.get(cid) ?? `[[Community ${cid}]]`}` : "";
    const filePart = file ? ` · \`${file}\`` : "";
    lines.push(`- ${index + 1}. **${label}** — \`${flow.qualifiedPath[index] ?? nodeId}\`${filePart}${community}`);
  });
  lines.push("");

  if (flow.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of flow.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }

  lines.push("---", "", "*Part of the graphify knowledge wiki. See [[index]] to navigate.*");
  return lines.join("\n");
}

function indexMd(
  communities: Map<number, string[]>,
  labels: Map<number, string>,
  communityLinks: Map<number, string>,
  godNodesData: GodNodeEntry[],
  flowPages: Array<{ flow: ReviewFlow; page: WikiPageRef }>,
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
    lines.push(`- ${communityLinks.get(cid) ?? `[[${label}]]`} — ${nodes.length} nodes`);
  }
  lines.push("");

  if (godNodesData.length > 0) {
    lines.push("## God Nodes", "(most connected concepts — the load-bearing abstractions)", "");
    for (const node of godNodesData) {
      lines.push(`- [[${node.label}]] — ${node.edges} connections`);
    }
    lines.push("");
  }

  if (flowPages.length > 0) {
    lines.push("## Execution Flows", "(highest criticality first)", "");
    for (const { flow, page } of flowPages.sort((a, b) => compareFlowCriticality(a.flow, b.flow))) {
      lines.push(`- ${page.link} — criticality ${flow.criticality.toFixed(4)} · ${flow.nodeCount} nodes`);
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
    flows?: ReviewFlowArtifact | ReviewFlow[] | null;
  },
): number {
  const communityMap = toNumericMap(communities);
  mkdirSync(outputDir, { recursive: true });

  const labels = options?.communityLabels
    ? toNumericMap(options.communityLabels)
    : new Map([...communityMap.keys()].map((cid) => [cid, `Community ${cid}`]));
  const cohesion = toNumericMap(options?.cohesion);
  const godNodesData = options?.godNodesData ?? [];
  const flows = normalizeFlows(options?.flows);
  const pageRefs = uniquePageRefs([
    ...[...communityMap.keys()].map((cid) => ({ key: `community:${cid}`, title: labels.get(cid) ?? `Community ${cid}` })),
    ...godNodesData.map((node) => ({ key: `god:${node.id}`, title: node.label })),
    ...flows.map((flow) => ({ key: `flow:${flow.id}`, title: `Flow ${flow.name}` })),
  ]);
  const communityLinks = new Map<number, string>();
  for (const cid of communityMap.keys()) {
    const ref = pageRefs.get(`community:${cid}`);
    if (ref) communityLinks.set(cid, ref.link);
  }
  const flowLinks = new Map<string, string>();
  for (const flow of flows) {
    const ref = pageRefs.get(`flow:${flow.id}`);
    if (ref) flowLinks.set(flow.id, ref.link);
  }

  let count = 0;

  // Community articles
  for (const [cid, nodes] of communityMap) {
    const label = labels.get(cid) ?? `Community ${cid}`;
    const article = communityArticle(G, cid, nodes, label, labels, cohesion.get(cid), communityLinks, flows, flowLinks);
    const page = pageRefs.get(`community:${cid}`);
    writeFileSync(join(outputDir, page?.filename ?? `${safeFilename(label)}.md`), article);
    count++;
  }

  // God node articles
  for (const nodeData of godNodesData) {
    const nid = nodeData.id;
    if (nid && G.hasNode(nid)) {
      const article = godNodeArticle(G, nid, labels, communityLinks);
      const page = pageRefs.get(`god:${nodeData.id}`);
      writeFileSync(join(outputDir, page?.filename ?? `${safeFilename(nodeData.label)}.md`), article);
      count++;
    }
  }

  // Flow articles
  for (const flow of flows) {
    const page = pageRefs.get(`flow:${flow.id}`);
    writeFileSync(join(outputDir, page?.filename ?? `${safeFilename(`Flow ${flow.name}`)}.md`), flowArticle(G, flow, communityLinks));
    count++;
  }

  // Index
  writeFileSync(
    join(outputDir, "index.md"),
    indexMd(
      communityMap,
      labels,
      communityLinks,
      godNodesData,
      flows.map((flow) => ({ flow, page: pageRefs.get(`flow:${flow.id}`)! })).filter((item) => !!item.page),
      G.order,
      G.size,
    ),
  );

  return count;
}

/**
 * Export graph to HTML, JSON, SVG, GraphML, Obsidian Canvas, and Neo4j Cypher.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import Graph from "graphology";
import { sanitizeLabel, escapeHtml } from "./security.js";
import { isDirectedGraph } from "./graph.js";
import { safeGitRevParse } from "./git.js";
import type { Hyperedge } from "./types.js";
import {
  type NumericMapLike,
  type StringMapLike,
  toNumericMap,
  toStringMap,
} from "./collections.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMUNITY_COLORS = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
];

/**
 * Track C3 — file_type → vis.js shape mapping. Defaults target a code
 * corpus and intentionally do NOT touch domain-specific node types
 * (Character, Work, etc. for the mystery profile). Profile-aware
 * mapping override is a follow-up lot (C3.5) once the per-profile
 * schema is locked.
 *
 * vis.js shapes used: dot, square, triangle, box, diamond, star,
 * hexagon. All non-color-only so accessibility (color-blind, B&W
 * print) is preserved.
 */
export function inferNodeShape(fileType: string, sourceFile: string): string {
  const path = (sourceFile || "").toLowerCase();
  const type = (fileType || "").toLowerCase();
  // Test files first (most specific path match).
  if (/(?:^|[/\\])(?:tests?|__tests__)[/\\]/.test(path) || /[._-](?:test|spec)\.[a-z0-9]+$/.test(path)) {
    return "square";
  }
  // TypeScript declaration files (type-only modules).
  if (/\.d\.ts$/.test(path)) return "diamond";
  // Config-ish files by extension.
  if (/\.(?:ya?ml|toml|cfg|ini|properties|env|conf)$/.test(path)) return "triangle";
  // Doc / paper / concept nodes.
  if (type === "document" || type === "paper" || type === "concept" || type === "rationale") return "box";
  if (type === "image") return "star";
  if (type === "video") return "hexagon";
  // Default code dot.
  return "dot";
}

/**
 * Track C3 — relation → vis.js dashes pattern. Solid by default for
 * direct dependencies; dashed for inferred / loose links so the user
 * can tell strong vs weak connections at a glance without hovering.
 * Profile-aware override is C3.5.
 */
export function inferEdgeDashes(relation: string, confidenceTier: string): boolean | number[] {
  const r = (relation || "").toLowerCase();
  if (r === "imports_from" || r === "imports") return [6, 4];
  if (r === "tested_by" || r === "validated_by") return [2, 4];
  if (r === "inherits" || r === "extends" || r === "implements") return [10, 4];
  // Confidence fallback: solid for EXTRACTED, dashed for INFERRED/AMBIGUOUS.
  return confidenceTier !== "EXTRACTED";
}

const MAX_NODES_FOR_VIZ = 5_000;

const CONFIDENCE_SCORE_DEFAULTS: Record<string, number> = {
  EXTRACTED: 1.0,
  INFERRED: 0.5,
  AMBIGUOUS: 0.2,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CommunityLabelsInput = NumericMapLike<string>;
type CommunityLabelOptions = { communityLabels?: CommunityLabelsInput };
type HtmlOptions = CommunityLabelOptions & { memberCounts?: NumericMapLike<number> };
type JsonOptions = CommunityLabelOptions & { force?: boolean };
type SvgOptions = CommunityLabelOptions & { figsize?: [number, number] };
type CanvasOptions = CommunityLabelOptions & { nodeFilenames?: StringMapLike<string> };
type Neo4jPushOptions = {
  uri: string;
  user: string;
  password: string;
  communities?: NumericMapLike<string[]>;
};

function nodeCommunityMap(communities: NumericMapLike<string[]>): Map<string, number> {
  const communityMap = toNumericMap(communities);
  const result = new Map<string, number>();
  for (const [cid, nodes] of communityMap) {
    for (const n of nodes) result.set(n, cid);
  }
  return result;
}

function cypherEscape(value: unknown): string {
  let out = "";
  for (const ch of String(value ?? "")) {
    const code = ch.charCodeAt(0);
    if (ch === "\\") out += "\\\\";
    else if (ch === "'") out += "\\'";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) out += " ";
    else out += ch;
  }
  return out;
}

function cypherIdentifier(value: unknown, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/^_+/, "");
  return cleaned && /^[A-Za-z]/.test(cleaned) ? cleaned : fallback;
}

function isCommunityLabelOptions(
  value: CommunityLabelsInput | CommunityLabelOptions | HtmlOptions,
): value is CommunityLabelOptions {
  return !(value instanceof Map) && (
    Object.prototype.hasOwnProperty.call(value, "communityLabels") ||
    Object.prototype.hasOwnProperty.call(value, "memberCounts") ||
    Object.prototype.hasOwnProperty.call(value, "force")
  );
}

function isCanvasOptions(
  value: CommunityLabelsInput | CanvasOptions,
): value is CanvasOptions {
  return !(value instanceof Map) && (
    Object.prototype.hasOwnProperty.call(value, "communityLabels") ||
    Object.prototype.hasOwnProperty.call(value, "nodeFilenames")
  );
}

function isSvgOptions(
  value: CommunityLabelsInput | SvgOptions,
): value is SvgOptions {
  return !(value instanceof Map) && (
    Object.prototype.hasOwnProperty.call(value, "communityLabels") ||
    Object.prototype.hasOwnProperty.call(value, "figsize")
  );
}

function normalizeCommunityLabels(
  labelsOrOptions?: CommunityLabelsInput | CommunityLabelOptions | HtmlOptions,
): Map<number, string> | undefined {
  if (!labelsOrOptions) return undefined;
  if (!isCommunityLabelOptions(labelsOrOptions)) {
    return toNumericMap(labelsOrOptions as CommunityLabelsInput);
  }
  return labelsOrOptions.communityLabels ? toNumericMap(labelsOrOptions.communityLabels) : undefined;
}

function normalizeMemberCounts(
  labelsOrOptions?: CommunityLabelsInput | HtmlOptions,
): Map<number, number> | undefined {
  if (!labelsOrOptions || !isCommunityLabelOptions(labelsOrOptions)) return undefined;
  if (!("memberCounts" in labelsOrOptions) || !labelsOrOptions.memberCounts) return undefined;
  return toNumericMap(labelsOrOptions.memberCounts);
}

function buildFreshnessMetadata(outputPath: string): { built_from_commit?: string } {
  const resolved = resolve(outputPath);
  if (basename(resolved) !== "graph.json") return {};
  const stateDir = basename(dirname(resolved));
  if (stateDir !== ".graphify" && stateDir !== "graphify-out") return {};
  const root = dirname(dirname(resolved));
  const head = safeGitRevParse(root, ["HEAD"]);
  return head ? { built_from_commit: head } : {};
}

// ---------------------------------------------------------------------------
// toJson
// ---------------------------------------------------------------------------

/**
 * Compute the topology signature from already-serialized node and link
 * dictionaries. Shared with watch.ts so the watcher's "topology unchanged"
 * short-circuit uses the exact same recipe as the persisted signature in
 * graph.json.
 */
export function computeTopologySignatureFromLinks(
  nodes: ReadonlyArray<{ id: unknown }>,
  links: ReadonlyArray<{ source: unknown; target: unknown; relation?: unknown }>,
): string {
  const sortedNodeIds = nodes.map((node) => String(node.id)).sort();
  const sortedEdges = links.map((link) => {
    const [src, tgt] = [String(link.source), String(link.target)].sort();
    return `${src}\t${tgt}\t${String(link.relation ?? "")}`;
  }).sort();
  return `n=${sortedNodeIds.length};e=${sortedEdges.length};${sortedNodeIds.join(",")}|${sortedEdges.join(";")}`;
}

/**
 * Compute the topology signature directly from a graphology graph instance,
 * matching what toJson() would emit. Used by the watcher to decide whether
 * to skip reclustering on a rebuild.
 */
export function computeTopologySignature(G: Graph): string {
  const nodes: { id: string }[] = [];
  G.forEachNode((nodeId) => nodes.push({ id: nodeId }));
  const links: { source: string; target: string; relation?: unknown }[] = [];
  G.forEachEdge((_edgeKey, data, source, target) => {
    links.push({ source, target, relation: (data as { relation?: unknown }).relation });
  });
  return computeTopologySignatureFromLinks(nodes, links);
}

export function toJson(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
  communityLabelsOrOptions?: CommunityLabelsInput | JsonOptions,
): boolean {
  const nodeComm = nodeCommunityMap(communities);
  const communityLabels = normalizeCommunityLabels(communityLabelsOrOptions);
  const forceWrite = Boolean(
    communityLabelsOrOptions &&
    !(communityLabelsOrOptions instanceof Map) &&
    Object.prototype.hasOwnProperty.call(communityLabelsOrOptions, "force") &&
    (communityLabelsOrOptions as { force?: boolean }).force,
  );

  const nodes: Record<string, unknown>[] = [];
  G.forEachNode((nodeId, attrs) => {
    const communityId = nodeComm.get(nodeId) ?? null;
    nodes.push({
      id: nodeId,
      ...attrs,
      community: communityId,
      community_name:
        communityId !== null
          ? sanitizeLabel(communityLabels?.get(communityId) ?? `Community ${communityId}`)
          : null,
    });
  });

  const links: Record<string, unknown>[] = [];
  G.forEachEdge((_edge, data, source, target) => {
    const link: Record<string, unknown> = {
      source,
      target,
      ...data,
    };
    if (link.confidence_score === undefined) {
      const conf = (data.confidence as string) ?? "EXTRACTED";
      link.confidence_score = CONFIDENCE_SCORE_DEFAULTS[conf] ?? 1.0;
    }
    links.push(link);
  });

  const hyperedges = (G.getAttribute("hyperedges") as Hyperedge[] | undefined) ?? [];
  const communityLabelsObject = communityLabels
    ? Object.fromEntries(
        [...communityLabels.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([cid, label]) => [String(cid), sanitizeLabel(label)]),
      )
    : {};

  const topology_signature = computeTopologySignatureFromLinks(
    nodes as unknown as ReadonlyArray<{ id: unknown }>,
    links as unknown as ReadonlyArray<{ source: unknown; target: unknown; relation?: unknown }>,
  );

  const output = {
    directed: isDirectedGraph(G),
    multigraph: false,
    graph: {
      community_labels: communityLabelsObject,
      ...buildFreshnessMetadata(outputPath),
    },
    topology_signature,
    nodes,
    links,
    hyperedges,
  };

  if (!forceWrite) {
    try {
      const existing = JSON.parse(readFileSync(outputPath, "utf-8")) as { nodes?: unknown[] };
      const existingNodeCount = existing.nodes?.length ?? 0;
      if (existingNodeCount > nodes.length) {
        console.warn(
          `[graphify] WARNING: new graph has ${nodes.length} nodes but existing graph.json has ` +
          `${existingNodeCount}. Refusing to overwrite; pass force=true to override.`,
        );
        return false;
      }
    } catch {
      // No previous graph or unreadable payload - continue with the write.
    }
  }

  writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  return true;
}

// ---------------------------------------------------------------------------
// toCypher
// ---------------------------------------------------------------------------

export function toCypher(G: Graph, outputPath: string): void {
  const lines: string[] = ["// Neo4j Cypher import - generated by the graphify skill", ""];

  G.forEachNode((nodeId, data) => {
    const label = cypherEscape((data.label as string) ?? nodeId);
    const nodeIdEsc = cypherEscape(nodeId);
    const rawFt = ((data.file_type as string) ?? "unknown")
      .charAt(0).toUpperCase() + ((data.file_type as string) ?? "unknown").slice(1);
    const ftype = cypherIdentifier(rawFt, "Entity");
    lines.push(`MERGE (n:${ftype} {id: '${nodeIdEsc}', label: '${label}'});`);
  });

  lines.push("");

  G.forEachEdge((_edge, data, u, v) => {
    const rel = cypherIdentifier(
      ((data.relation as string) ?? "RELATES_TO").toUpperCase(),
      "RELATES_TO",
    );
    const conf = cypherEscape((data.confidence as string) ?? "EXTRACTED");
    const uEsc = cypherEscape(u);
    const vEsc = cypherEscape(v);
    lines.push(
      `MATCH (a {id: '${uEsc}'}), (b {id: '${vEsc}'}) ` +
      `MERGE (a)-[:${rel} {confidence: '${conf}'}]->(b);`,
    );
  });

  writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

function neo4jLabel(label: string): string {
  const sanitized = label.replace(/[^A-Za-z0-9_]/g, "");
  return sanitized || "Entity";
}

function neo4jRelation(relation: string): string {
  const sanitized = relation
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^A-Z0-9_]/g, "_");
  return sanitized && /^[A-Z]/.test(sanitized) ? sanitized : "RELATED_TO";
}

function scalarProps(data: Record<string, unknown>): Record<string, string | number | boolean> {
  const props: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      props[key] = value;
    }
  }
  return props;
}

export async function pushToNeo4j(
  G: Graph,
  optionsOrUri: Neo4jPushOptions | string,
  user?: string,
  password?: string,
  communities?: NumericMapLike<string[]>,
): Promise<{ nodes: number; edges: number }> {
  const options = typeof optionsOrUri === "string"
    ? {
      uri: optionsOrUri,
      user: user ?? "neo4j",
      password: password ?? "",
      communities,
    }
    : optionsOrUri;

  let neo4jMod: Record<string, any>;
  try {
    neo4jMod = await import("neo4j-driver");
  } catch {
    throw new Error("neo4j-driver not installed. Run: npm install neo4j-driver");
  }

  const neo4j = neo4jMod.default ?? neo4jMod;
  const driver = neo4j.driver(
    options.uri,
    neo4j.auth.basic(options.user, options.password),
  );
  const communityMap = nodeCommunityMap(options.communities ?? new Map<number, string[]>());

  let nodes = 0;
  let edges = 0;
  const session = driver.session();

  try {
    for (const nodeId of G.nodes()) {
      const attrs = G.getNodeAttributes(nodeId) as Record<string, unknown>;
      const props = scalarProps(attrs);
      props.id = nodeId;

      const communityId = communityMap.get(nodeId);
      if (communityId !== undefined) {
        props.community = communityId;
      }

      const fileType = neo4jLabel(
        (((attrs.file_type as string) ?? "Entity").charAt(0).toUpperCase()) +
        (((attrs.file_type as string) ?? "Entity").slice(1)),
      );

      await session.run(
        `MERGE (n:${fileType} {id: $id}) SET n += $props`,
        { id: nodeId, props },
      );
      nodes++;
    }

    for (const edgeKey of G.edges()) {
      const source = G.source(edgeKey);
      const target = G.target(edgeKey);
      const attrs = G.getEdgeAttributes(edgeKey) as Record<string, unknown>;
      const relation = neo4jRelation((attrs.relation as string) ?? "RELATED_TO");
      const props = scalarProps(attrs);

      await session.run(
        `MATCH (a {id: $source}), (b {id: $target}) ` +
        `MERGE (a)-[r:${relation}]->(b) SET r += $props`,
        { source, target, props },
      );
      edges++;
    }
  } finally {
    await session.close();
    await driver.close();
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// toHtml - full interactive vis.js visualization
// ---------------------------------------------------------------------------

function htmlStyles(): string {
  return `<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f1a; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; display: flex; height: 100vh; overflow: hidden; }
  /* Skip link visible only on focus, lets keyboard users jump past the canvas. */
  .skip-link { position: absolute; top: -40px; left: 8px; background: #4E79A7; color: #fff; padding: 6px 12px; border-radius: 0 0 4px 4px; z-index: 1000; text-decoration: none; }
  .skip-link:focus { top: 0; }
  /* Visually hidden but exposed to screen readers. */
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
  /* Focus visible everywhere, WCAG-compliant outline. */
  :focus-visible { outline: 3px solid #ffd54f; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(78, 121, 167, 0.55); }
  #graph { flex: 1; outline: none; }
  #graph:focus-visible { box-shadow: inset 0 0 0 3px #ffd54f; }
  #sidebar { width: 280px; background: #1a1a2e; border-left: 1px solid #2a2a4e; display: flex; flex-direction: column; overflow: hidden; }
  #search-wrap { padding: 12px; border-bottom: 1px solid #2a2a4e; }
  #search { width: 100%; background: #0f0f1a; border: 1px solid #3a3a5e; color: #e0e0e0; padding: 7px 10px; border-radius: 6px; font-size: 13px; outline: none; }
  #search:focus { border-color: #4E79A7; }
  #search-results { max-height: 140px; overflow-y: auto; padding: 4px 12px; border-bottom: 1px solid #2a2a4e; display: none; }
  .search-item { padding: 4px 6px; cursor: pointer; border-radius: 4px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .search-item:hover, .search-item:focus { background: #2a2a4e; }
  #info-panel { padding: 14px; border-bottom: 1px solid #2a2a4e; min-height: 140px; }
  #info-panel h3 { font-size: 13px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  #info-content { font-size: 13px; color: #ccc; line-height: 1.6; }
  #info-content .field { margin-bottom: 5px; }
  #info-content .field b { color: #e0e0e0; }
  #info-content .empty { color: #777; font-style: italic; } /* WCAG AA: bumped from #555 (3.8:1) to #777 (5.0:1) */
  .neighbor-link { display: block; padding: 2px 6px; margin: 2px 0; border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid #333; }
  .neighbor-link:hover, .neighbor-link:focus { background: #2a2a4e; }
  #neighbors-list { max-height: 160px; overflow-y: auto; margin-top: 4px; }
  #legend-wrap { flex: 1; overflow-y: auto; padding: 12px; }
  #legend-wrap h3 { font-size: 13px; color: #aaa; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .legend-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; border-radius: 4px; font-size: 12px; }
  .legend-item:hover, .legend-item:focus-within { background: #2a2a4e; padding-left: 4px; }
  .legend-item.dimmed { opacity: 0.45; } /* WCAG: bumped from 0.35 for better contrast in dimmed state */
  .legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
  .legend-cb { accent-color: #4E79A7; cursor: pointer; flex-shrink: 0; }
  .legend-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { color: #888; font-size: 11px; } /* WCAG AA: bumped from #666 to #888 */
  #legend-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 11px; color: #aaa; }
  #legend-controls label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  #stats { padding: 10px 14px; border-top: 1px solid #2a2a4e; font-size: 11px; color: #888; } /* WCAG AA */
  /* Help overlay modal. */
  #help-button { position: fixed; bottom: 12px; right: 296px; width: 36px; height: 36px; border-radius: 50%; background: #2a2a4e; color: #e0e0e0; border: 1px solid #3a3a5e; font-size: 16px; font-weight: bold; cursor: pointer; z-index: 100; }
  #help-button:hover, #help-button:focus { background: #3a3a5e; }
  #help-overlay { display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); z-index: 200; align-items: center; justify-content: center; }
  #help-overlay.open { display: flex; }
  #help-modal { background: #1a1a2e; color: #e0e0e0; padding: 24px 28px; border-radius: 8px; max-width: 480px; max-height: 80vh; overflow-y: auto; border: 1px solid #3a3a5e; }
  #help-modal h2 { font-size: 16px; margin-bottom: 12px; }
  #help-modal kbd { background: #0f0f1a; border: 1px solid #3a3a5e; border-radius: 3px; padding: 1px 6px; font-family: monospace; font-size: 12px; }
  #help-modal dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 12px 0; font-size: 13px; }
  #help-modal dt { color: #ffd54f; }
  #help-close { float: right; background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer; }
  #help-close:hover, #help-close:focus { color: #e0e0e0; }
  /* High-contrast mode (system preference + manual toggle). */
  @media (prefers-contrast: more) {
    body, #sidebar, #search { background: #000; color: #fff; }
    #search { border-color: #fff; }
    #info-content .empty, .legend-count, #stats { color: #ddd; }
  }
  body.high-contrast { background: #000; color: #fff; }
  body.high-contrast #sidebar, body.high-contrast #search, body.high-contrast #help-modal { background: #000; color: #fff; }
  body.high-contrast #search { border-color: #fff; }
  body.high-contrast #info-content .empty, body.high-contrast .legend-count, body.high-contrast #stats { color: #ddd; }
</style>`;
}

function hyperedgeScript(hyperedgesJson: string): string {
  return `<script>
// Render hyperedges as shaded regions
const hyperedges = ${hyperedgesJson};
function drawHyperedges() {
    const canvas = network.canvas.frame.canvas;
    const ctx = canvas.getContext('2d');
    hyperedges.forEach(h => {
        const positions = h.nodes
            .map(nid => network.getPositions([nid])[nid])
            .filter(p => p !== undefined);
        if (positions.length < 2) return;
        // Draw convex hull as filled polygon
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#6366f1';
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const scale = network.getScale();
        const offset = network.getViewPosition();
        const canvasWidth = canvas.clientWidth || canvas.width;
        const canvasHeight = canvas.clientHeight || canvas.height;
        const toCanvas = (p) => ({
            x: (p.x - offset.x) * scale + canvasWidth / 2,
            y: (p.y - offset.y) * scale + canvasHeight / 2
        });
        const pts = positions.map(toCanvas);
        // Expand hull slightly
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const expanded = pts.map(p => ({
            x: cx + (p.x - cx) * 1.15,
            y: cy + (p.y - cy) * 1.15
        }));
        ctx.moveTo(expanded[0].x, expanded[0].y);
        expanded.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        // Label
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(h.label, cx, cy - 5);
        ctx.restore();
    });
}
network.on('afterDrawing', drawHyperedges);
</script>`;
}

function htmlScript(nodesJson: string, edgesJson: string, legendJson: string): string {
  return `<script>
const RAW_NODES = ${nodesJson};
const RAW_EDGES = ${edgesJson};
const LEGEND = ${legendJson};

// Build vis datasets
const nodesDS = new vis.DataSet(RAW_NODES.map(n => ({
  id: n.id, label: n.label, color: n.color, size: n.size,
  shape: n.shape || 'dot',
  font: n.font, title: n.title,
  _community: n.community, _community_name: n.community_name,
  _source_file: n.source_file, _file_type: n.file_type, _degree: n.degree,
  _shape: n.shape || 'dot',
})));

const edgesDS = new vis.DataSet(RAW_EDGES.map((e, i) => ({
  id: i, from: e.from, to: e.to,
  label: '',
  title: e.title,
  dashes: e.dashes,
  width: e.width,
  color: e.color,
  arrows: { to: { enabled: true, scaleFactor: 0.5 } },
})));

const container = document.getElementById('graph');
container.setAttribute('role', 'application');
container.setAttribute('tabindex', '0');
container.setAttribute('aria-label', 'Graphify knowledge graph. Use arrow keys to pan, plus and minus to zoom, F1 for help.');
const liveRegion = document.getElementById('live-status');
function announce(message) {
  if (liveRegion) liveRegion.textContent = message;
}
const network = new vis.Network(container, { nodes: nodesDS, edges: edgesDS }, {
  physics: {
    enabled: true,
    solver: 'forceAtlas2Based',
    forceAtlas2Based: {
      gravitationalConstant: -60,
      centralGravity: 0.005,
      springLength: 120,
      springConstant: 0.08,
      damping: 0.4,
      avoidOverlap: 0.8,
    },
    stabilization: { iterations: 200, fit: true },
  },
  interaction: {
    hover: true,
    tooltipDelay: 100,
    hideEdgesOnDrag: true,
    navigationButtons: false,
    keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.05 }, bindToWindow: false },
  },
  nodes: { borderWidth: 1.5 },  /* shape comes from per-node n.shape */
  edges: { smooth: { type: 'continuous', roundness: 0.2 }, selectionWidth: 3 },
});

network.once('stabilizationIterationsDone', () => {
  network.setOptions({ physics: { enabled: false } });
});

function showInfo(nodeId) {
  const n = nodesDS.get(nodeId);
  if (!n) return;
  const neighborIds = network.getConnectedNodes(nodeId);
  const neighborItems = neighborIds.map(nid => {
    const nb = nodesDS.get(nid);
    const color = nb ? nb.color.background : '#555';
    return \`<span class="neighbor-link" style="border-left-color:\${color}" onclick="focusNode('\${nid}')">\${nb ? nb.label : nid}</span>\`;
  }).join('');
  document.getElementById('info-content').innerHTML = \`
    <div class="field"><b>\${n.label}</b></div>
    <div class="field">Type: \${n._file_type || 'unknown'} <span style="color:#888;font-size:11px">(shape: \${n._shape})</span></div>
    <div class="field">Community: \${n._community_name}</div>
    <div class="field">Source: \${n._source_file || '-'}</div>
    <div class="field">Degree: \${n._degree}</div>
    \${neighborIds.length ? \`<div class="field" style="margin-top:8px;color:#aaa;font-size:11px">Neighbors (\${neighborIds.length})</div><div id="neighbors-list">\${neighborItems}</div>\` : ''}
  \`;
}

function focusNode(nodeId) {
  network.focus(nodeId, { scale: 1.4, animation: true });
  network.selectNodes([nodeId]);
  showInfo(nodeId);
}

let hoveredNodeId = null;
network.on('hoverNode', params => {
  hoveredNodeId = params.node;
  container.style.cursor = 'pointer';
});
network.on('blurNode', () => {
  hoveredNodeId = null;
  container.style.cursor = 'default';
});
container.addEventListener('click', () => {
  if (hoveredNodeId !== null) {
    showInfo(hoveredNodeId);
    network.selectNodes([hoveredNodeId]);
  }
});
network.on('click', params => {
  if (params.nodes.length > 0) {
    showInfo(params.nodes[0]);
    const n = nodesDS.get(params.nodes[0]);
    if (n) announce(\`Selected \${n.label}, in community \${n._community_name}, \${n._degree} connection(s).\`);
  } else if (hoveredNodeId === null) {
    document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect it</span>';
  }
});
network.on('selectNode', params => {
  if (params.nodes.length > 0) {
    const n = nodesDS.get(params.nodes[0]);
    if (n) announce(\`Selected \${n.label}, in community \${n._community_name}, \${n._degree} connection(s).\`);
  }
});

const searchInput = document.getElementById('search');
const searchResults = document.getElementById('search-results');
const normalizeSearch = value => value.normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
searchInput.addEventListener('input', () => {
  const q = normalizeSearch(searchInput.value).trim();
  searchResults.innerHTML = '';
  if (!q) { searchResults.style.display = 'none'; announce(''); return; }
  const totalMatches = RAW_NODES.filter(n => normalizeSearch(n.label).includes(q)).length;
  const matches = RAW_NODES.filter(n => normalizeSearch(n.label).includes(q)).slice(0, 20);
  if (!matches.length) {
    searchResults.style.display = 'none';
    announce('No nodes match the search.');
    return;
  }
  searchResults.style.display = 'block';
  announce(\`Found \${totalMatches} node(s) matching "\${q}". Showing first \${matches.length}.\`);
  matches.forEach(n => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'search-item';
    el.textContent = n.label;
    el.setAttribute('aria-label', \`Focus node \${n.label}\`);
    el.style.borderLeft = \`3px solid \${n.color.background}\`;
    el.style.paddingLeft = '8px';
    el.onclick = () => {
      network.focus(n.id, { scale: 1.5, animation: true });
      network.selectNodes([n.id]);
      showInfo(n.id);
      searchResults.style.display = 'none';
      searchInput.value = '';
      announce(\`Focused on \${n.label}.\`);
    };
    searchResults.appendChild(el);
  });
});
document.addEventListener('click', e => {
  if (!searchResults.contains(e.target) && e.target !== searchInput)
    searchResults.style.display = 'none';
});

const hiddenCommunities = new Set();
const selectAllCb = document.getElementById('select-all-cb');
function updateSelectAllState() {
  const total = LEGEND.length;
  const hidden = hiddenCommunities.size;
  selectAllCb.checked = hidden === 0;
  selectAllCb.indeterminate = hidden > 0 && hidden < total;
}
function toggleAllCommunities(hide) {
  document.querySelectorAll('.legend-item').forEach(item => {
    hide ? item.classList.add('dimmed') : item.classList.remove('dimmed');
  });
  document.querySelectorAll('.legend-cb').forEach(cb => {
    cb.checked = !hide;
  });
  LEGEND.forEach(c => {
    if (hide) hiddenCommunities.add(c.cid); else hiddenCommunities.delete(c.cid);
  });
  const updates = RAW_NODES.map(n => ({ id: n.id, hidden: hide }));
  nodesDS.update(updates);
  updateSelectAllState();
}
const legendEl = document.getElementById('legend');
LEGEND.forEach(c => {
  const item = document.createElement('div');
  item.className = 'legend-item';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'legend-cb';
  cb.checked = true;
  cb.addEventListener('change', e => {
    e.stopPropagation();
    if (cb.checked) {
      hiddenCommunities.delete(c.cid);
      item.classList.remove('dimmed');
    } else {
      hiddenCommunities.add(c.cid);
      item.classList.add('dimmed');
    }
    const updates = RAW_NODES
      .filter(n => n.community === c.cid)
      .map(n => ({ id: n.id, hidden: !cb.checked }));
    nodesDS.update(updates);
    updateSelectAllState();
  });
  item.innerHTML = \`<div class="legend-dot" style="background:\${c.color}"></div>
    <span class="legend-label">\${c.label}</span>
    <span class="legend-count">\${c.count}</span>\`;
  item.prepend(cb);
  item.onclick = e => {
    if (e.target === cb) return;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  };
  legendEl.appendChild(item);
});
selectAllCb.addEventListener('change', () => {
  toggleAllCommunities(!selectAllCb.checked);
});
updateSelectAllState();

// Help overlay (F1 / ? toggle).
const helpButton = document.getElementById('help-button');
const helpOverlay = document.getElementById('help-overlay');
const helpClose = document.getElementById('help-close');
function toggleHelp(open) {
  if (open === undefined) open = !helpOverlay.classList.contains('open');
  if (open) {
    helpOverlay.classList.add('open');
    helpOverlay.setAttribute('aria-hidden', 'false');
    helpClose.focus();
  } else {
    helpOverlay.classList.remove('open');
    helpOverlay.setAttribute('aria-hidden', 'true');
    helpButton.focus();
  }
}
helpButton.addEventListener('click', () => toggleHelp(true));
helpClose.addEventListener('click', () => toggleHelp(false));
helpOverlay.addEventListener('click', (e) => { if (e.target === helpOverlay) toggleHelp(false); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'F1' || (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName))) {
    e.preventDefault();
    toggleHelp();
  } else if (e.key === 'Escape' && helpOverlay.classList.contains('open')) {
    toggleHelp(false);
  } else if (e.key === 'Escape' && network.getSelectedNodes().length > 0) {
    network.unselectAll();
    document.getElementById('info-content').innerHTML = '<span class="empty">Click a node to inspect it</span>';
    announce('Selection cleared.');
  }
});

// High-contrast toggle.
const contrastBtn = document.getElementById('contrast-toggle');
if (contrastBtn) {
  contrastBtn.addEventListener('click', () => {
    document.body.classList.toggle('high-contrast');
    const on = document.body.classList.contains('high-contrast');
    contrastBtn.setAttribute('aria-pressed', String(on));
    announce(on ? 'High contrast mode enabled.' : 'High contrast mode disabled.');
  });
}

// Initial announce so screen readers know what loaded.
announce(\`Graph loaded: \${RAW_NODES.length} node(s), \${RAW_EDGES.length} edge(s) across \${LEGEND.length} community(ies).\`);
</script>`;
}

export function toHtml(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
  communityLabelsOrOptions?: CommunityLabelsInput | HtmlOptions,
): void {
  const communityMap = toNumericMap(communities);
  const communityLabels = normalizeCommunityLabels(communityLabelsOrOptions);
  const memberCounts = normalizeMemberCounts(communityLabelsOrOptions);
  if (G.order > MAX_NODES_FOR_VIZ) {
    throw new Error(
      `Graph has ${G.order} nodes - too large for HTML viz. ` +
      `Use --no-viz or reduce input size.`,
    );
  }

  const nodeComm = nodeCommunityMap(communityMap);
  const degree = new Map<string, number>();
  G.forEachNode((n) => degree.set(n, G.degree(n)));
  const maxDeg = Math.max(1, ...degree.values());
  const maxMemberCount = memberCounts && memberCounts.size > 0
    ? Math.max(1, ...memberCounts.values())
    : 1;

  // Build nodes list for vis.js
  interface VisNode {
    id: string;
    label: string;
    color: { background: string; border: string; highlight: { background: string; border: string } };
    size: number;
    font: { size: number; color: string };
    title: string;
    community: number;
    community_name: string;
    source_file: string;
    file_type: string;
    shape: string;
    degree: number;
  }
  const visNodes: VisNode[] = [];
  G.forEachNode((nodeId, data) => {
    const cid = nodeComm.get(nodeId) ?? 0;
    const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]!;
    const label = sanitizeLabel((data.label as string) ?? nodeId);
    const deg = degree.get(nodeId) ?? 1;
    const memberCount = memberCounts?.get(cid) ?? 1;
    const size = memberCounts
      ? 10 + 30 * (memberCount / maxMemberCount)
      : 10 + 30 * (deg / maxDeg);
    const fontSize = memberCounts ? 12 : (deg >= maxDeg * 0.15 ? 12 : 0);
    const sourceFile = (data.source_file as string) ?? "";
    const fileType = (data.file_type as string) ?? "";
    visNodes.push({
      id: nodeId,
      label,
      color: {
        background: color,
        border: color,
        highlight: { background: "#ffffff", border: color },
      },
      size: Math.round(size * 10) / 10,
      font: { size: fontSize, color: "#ffffff" },
      title: label,
      community: cid,
      community_name: sanitizeLabel(communityLabels?.get(cid) ?? `Community ${cid}`),
      source_file: sanitizeLabel(sourceFile),
      file_type: fileType,
      shape: inferNodeShape(fileType, sourceFile),
      degree: deg,
    });
  });

  // Build edges list
  interface VisEdge {
    from: string;
    to: string;
    label: string;
    title: string;
    dashes: boolean | number[];
    width: number;
    color: { opacity: number };
    confidence: string;
    relation: string;
  }
  const visEdges: VisEdge[] = [];
  G.forEachEdge((_edge, data, u, v) => {
    const confidence = (data.confidence as string) ?? "EXTRACTED";
    const relation = (data.relation as string) ?? "";
    visEdges.push({
      from: u,
      to: v,
      label: relation,
      title: `${relation} [${confidence}]`,
      dashes: inferEdgeDashes(relation, confidence),
      width: confidence === "EXTRACTED" ? 2 : 1,
      color: { opacity: confidence === "EXTRACTED" ? 0.7 : 0.35 },
      confidence,
      relation,
    });
  });

  // Build community legend data
  interface LegendEntry {
    cid: number;
    color: string;
    label: string;
    count: number;
  }
  const legendData: LegendEntry[] = [];
  const labelKeys = communityLabels ? [...communityLabels.keys()].sort((a, b) => a - b) : [];
  for (const cid of labelKeys) {
    const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]!;
    const lbl = escapeHtml(sanitizeLabel(communityLabels?.get(cid) ?? `Community ${cid}`));
    const n = memberCounts?.get(cid) ?? communityMap.get(cid)?.length ?? 0;
    legendData.push({ cid, color, label: lbl, count: n });
  }

  const nodesJson = JSON.stringify(visNodes);
  const edgesJson = JSON.stringify(visEdges);
  const legendJson = JSON.stringify(legendData);
  const rawHyperedges = (G.getAttribute("hyperedges") as Hyperedge[] | undefined) ?? [];
  const hyperedgesJson = JSON.stringify(rawHyperedges);
  const title = escapeHtml(sanitizeLabel(outputPath));
  const stats =
    `${G.order} nodes &middot; ${G.size} edges &middot; ${communityMap.size} communities`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>graphify - ${title}</title>
<script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
${htmlStyles()}
</head>
<body>
<a class="skip-link" href="#sidebar">Skip to controls</a>
<div id="live-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<div id="graph" aria-label="Graphify knowledge graph"></div>
<aside id="sidebar" aria-label="Graph controls">
  <div id="search-wrap">
    <label for="search" class="sr-only">Search nodes</label>
    <input id="search" type="text" placeholder="Search nodes..." autocomplete="off"
           role="combobox" aria-controls="search-results" aria-expanded="false" aria-autocomplete="list">
    <div id="search-results" role="listbox" aria-label="Search results"></div>
  </div>
  <section id="info-panel" aria-labelledby="info-heading">
    <h3 id="info-heading">Node Info</h3>
    <div id="info-content" aria-live="polite"><span class="empty">Click a node to inspect it</span></div>
  </section>
  <section id="legend-wrap" aria-labelledby="legend-heading">
    <h3 id="legend-heading">Communities</h3>
    <div id="legend-controls">
      <label><input id="select-all-cb" type="checkbox" checked> <span>Select all</span></label>
      <button id="contrast-toggle" type="button" aria-pressed="false" aria-label="Toggle high contrast">HC</button>
    </div>
    <div id="legend" role="group" aria-label="Community filters"></div>
    <h3 id="shapes-heading" style="margin-top:14px">Shapes</h3>
    <ul id="shape-legend" aria-labelledby="shapes-heading" style="list-style:none;padding:0;margin:0;font-size:12px;color:#bbb">
      <li>● dot &mdash; code</li>
      <li>■ square &mdash; test</li>
      <li>▲ triangle &mdash; config (yaml/toml/...)</li>
      <li>◆ diamond &mdash; type definition (.d.ts)</li>
      <li>▢ box &mdash; document / paper / concept</li>
      <li>★ star &mdash; image</li>
      <li>⬢ hexagon &mdash; video</li>
    </ul>
    <h3 id="relations-heading" style="margin-top:14px">Edges</h3>
    <ul id="relation-legend" aria-labelledby="relations-heading" style="list-style:none;padding:0;margin:0;font-size:12px;color:#bbb">
      <li>━━━━ solid &mdash; calls / strong (EXTRACTED)</li>
      <li>┄┄┄┄ dashed &mdash; imports_from</li>
      <li>┈┈┈┈ dotted &mdash; tested_by / validated_by</li>
      <li>━ ━ ━ long-dash &mdash; inherits / implements</li>
      <li style="opacity:0.6">··· faded &mdash; INFERRED / AMBIGUOUS</li>
    </ul>
  </section>
  <div id="stats" role="status">${stats}</div>
</aside>
<button id="help-button" type="button" aria-label="Open keyboard help (F1)" aria-haspopup="dialog" aria-controls="help-overlay">?</button>
<div id="help-overlay" role="dialog" aria-modal="true" aria-labelledby="help-title" aria-hidden="true">
  <div id="help-modal">
    <button id="help-close" type="button" aria-label="Close help">&times;</button>
    <h2 id="help-title">Keyboard shortcuts</h2>
    <dl>
      <dt><kbd>Tab</kbd></dt><dd>Cycle focus between controls</dd>
      <dt><kbd>&uarr;</kbd> <kbd>&darr;</kbd> <kbd>&larr;</kbd> <kbd>&rarr;</kbd></dt><dd>Pan the graph (graph focused)</dd>
      <dt><kbd>+</kbd> / <kbd>-</kbd></dt><dd>Zoom in / out (graph focused)</dd>
      <dt><kbd>Enter</kbd></dt><dd>Select hovered or focused node</dd>
      <dt><kbd>Esc</kbd></dt><dd>Deselect / close help</dd>
      <dt><kbd>F1</kbd> / <kbd>?</kbd></dt><dd>Toggle this help</dd>
      <dt><kbd>HC</kbd> button</dt><dd>Toggle high-contrast theme</dd>
    </dl>
    <p style="font-size:12px;color:#aaa;margin-top:8px">Search input announces match counts; selecting a node announces its community and degree.</p>
  </div>
</div>
${htmlScript(nodesJson, edgesJson, legendJson)}
${hyperedgeScript(hyperedgesJson)}
</body>
</html>`;

  writeFileSync(outputPath, html, "utf-8");
}

// ---------------------------------------------------------------------------
// toGraphml
// ---------------------------------------------------------------------------

export function toGraphml(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
): void {
  const nodeComm = nodeCommunityMap(communities);

  const xmlEsc = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<graphml xmlns="http://graphml.graphstruct.org/graphml"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' +
    ' xsi:schemaLocation="http://graphml.graphstruct.org/graphml' +
    ' http://graphml.graphstruct.org/graphml/1.0/graphml.xsd">',
  );

  // Declare attribute keys
  lines.push('  <key id="label" for="node" attr.name="label" attr.type="string"/>');
  lines.push('  <key id="file_type" for="node" attr.name="file_type" attr.type="string"/>');
  lines.push('  <key id="source_file" for="node" attr.name="source_file" attr.type="string"/>');
  lines.push('  <key id="community" for="node" attr.name="community" attr.type="int"/>');
  lines.push('  <key id="relation" for="edge" attr.name="relation" attr.type="string"/>');
  lines.push('  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>');

  lines.push(`  <graph id="G" edgedefault="${isDirectedGraph(G) ? "directed" : "undirected"}">`);

  G.forEachNode((nodeId, data) => {
    lines.push(`    <node id="${xmlEsc(nodeId)}">`);
    lines.push(`      <data key="label">${xmlEsc((data.label as string) ?? nodeId)}</data>`);
    lines.push(`      <data key="file_type">${xmlEsc((data.file_type as string) ?? "")}</data>`);
    lines.push(`      <data key="source_file">${xmlEsc((data.source_file as string) ?? "")}</data>`);
    lines.push(`      <data key="community">${nodeComm.get(nodeId) ?? -1}</data>`);
    lines.push("    </node>");
  });

  G.forEachEdge((_edge, data, source, target) => {
    lines.push(`    <edge source="${xmlEsc(source)}" target="${xmlEsc(target)}">`);
    lines.push(`      <data key="relation">${xmlEsc((data.relation as string) ?? "")}</data>`);
    lines.push(`      <data key="confidence">${xmlEsc((data.confidence as string) ?? "EXTRACTED")}</data>`);
    lines.push("    </edge>");
  });

  lines.push("  </graph>");
  lines.push("</graphml>");

  writeFileSync(outputPath, lines.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// toSvg - simple circle-layout SVG
// ---------------------------------------------------------------------------

export function toSvg(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
  communityLabelsOrOptions?: CommunityLabelsInput | SvgOptions,
  figsize: [number, number] = [20, 14],
): void {
  const communityMap = toNumericMap(communities);
  const options = communityLabelsOrOptions && isSvgOptions(communityLabelsOrOptions)
    ? communityLabelsOrOptions
    : undefined;
  const communityLabels = normalizeCommunityLabels(communityLabelsOrOptions);
  const nodeComm = nodeCommunityMap(communityMap);
  const figureSize = options?.figsize ?? figsize;
  const [widthIn, heightIn] = figureSize;
  const width = widthIn * 60;
  const height = heightIn * 60;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(cx, cy) * 0.8;

  const nodeList = G.nodes();
  const n = nodeList.length;

  // Compute positions using a simple circle layout
  const pos = new Map<string, [number, number]>();
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / Math.max(n, 1);
    pos.set(nodeList[i]!, [
      cx + radius * Math.cos(angle),
      cy + radius * Math.sin(angle),
    ]);
  }

  const degree = new Map<string, number>();
  G.forEachNode((node) => degree.set(node, G.degree(node)));
  const maxDeg = Math.max(1, ...degree.values());

  const xmlEsc = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" style="background:#1a1a2e">`,
  );

  // Draw edges
  G.forEachEdge((_edge, data, u, v) => {
    const [x1, y1] = pos.get(u) ?? [0, 0];
    const [x2, y2] = pos.get(v) ?? [0, 0];
    const conf = (data.confidence as string) ?? "EXTRACTED";
    const dasharray = conf === "EXTRACTED" ? "" : ' stroke-dasharray="4,4"';
    const opacity = conf === "EXTRACTED" ? 0.6 : 0.3;
    svgParts.push(
      `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ` +
      `stroke="#aaaaaa" stroke-width="0.8" opacity="${opacity}"${dasharray}/>`,
    );
  });

  // Draw nodes
  for (const nodeId of nodeList) {
    const [x, y] = pos.get(nodeId) ?? [0, 0];
    const cid = nodeComm.get(nodeId) ?? 0;
    const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]!;
    const deg = degree.get(nodeId) ?? 1;
    const r = 4 + 12 * (deg / maxDeg);
    svgParts.push(
      `  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0.9"/>`,
    );
    const label = (G.getNodeAttribute(nodeId, "label") as string) ?? nodeId;
    svgParts.push(
      `  <text x="${x}" y="${y + r + 10}" text-anchor="middle" ` +
      `fill="white" font-size="7" font-family="sans-serif">${xmlEsc(label)}</text>`,
    );
  }

  // Legend
  if (communityLabels) {
    const sortedKeys = [...communityLabels.keys()].sort((a, b) => a - b);
    let ly = 20;
    for (const cid of sortedKeys) {
      const color = COMMUNITY_COLORS[cid % COMMUNITY_COLORS.length]!;
      const label = communityLabels.get(cid) ?? `Community ${cid}`;
      const count = communityMap.get(cid)?.length ?? 0;
      svgParts.push(
        `  <circle cx="20" cy="${ly}" r="5" fill="${color}"/>`,
      );
      svgParts.push(
        `  <text x="30" y="${ly + 4}" fill="white" font-size="8" ` +
        `font-family="sans-serif">${xmlEsc(label)} (${count})</text>`,
      );
      ly += 18;
    }
  }

  svgParts.push("</svg>");
  writeFileSync(outputPath, svgParts.join("\n"), "utf-8");
}

// ---------------------------------------------------------------------------
// toCanvas - Obsidian .canvas JSON
// ---------------------------------------------------------------------------

export function toCanvas(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
  communityLabelsOrOptions?: CommunityLabelsInput | CanvasOptions,
  nodeFilenames?: StringMapLike<string>,
): void {
  const communityMap = toNumericMap(communities);
  const options = communityLabelsOrOptions && isCanvasOptions(communityLabelsOrOptions)
    ? communityLabelsOrOptions
    : undefined;
  const communityLabels = normalizeCommunityLabels(communityLabelsOrOptions);
  const providedNodeFilenames = options?.nodeFilenames ?? nodeFilenames;
  const CANVAS_COLORS = ["1", "2", "3", "4", "5", "6"];

  function safeName(label: string): string {
    return label
      .replace(/\r\n/g, " ")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ")
      .replace(/[\\/*?:"<>|#^[\]]/g, "")
      .trim() || "unnamed";
  }

  // Build nodeFilenames if not provided
  let filenameMap: Map<string, string>;
  if (!providedNodeFilenames) {
    filenameMap = new Map<string, string>();
    const seenNames = new Map<string, number>();
    G.forEachNode((nodeId, data) => {
      const base = safeName((data.label as string) ?? nodeId);
      const count = seenNames.get(base);
      if (count !== undefined) {
        const next = count + 1;
        seenNames.set(base, next);
        filenameMap.set(nodeId, `${base}_${next}`);
      } else {
        seenNames.set(base, 0);
        filenameMap.set(nodeId, base);
      }
    });
  } else {
    filenameMap = toStringMap(providedNodeFilenames);
  }

  const numCommunities = communityMap.size;
  const cols = numCommunities > 0 ? Math.ceil(Math.sqrt(numCommunities)) : 1;
  const rows = numCommunities > 0 ? Math.ceil(numCommunities / cols) : 1;

  const canvasNodes: Record<string, unknown>[] = [];
  const canvasEdges: Record<string, unknown>[] = [];

  const sortedCids = [...communityMap.keys()].sort((a, b) => a - b);

  // Precompute group sizes
  const groupSizes = new Map<number, [number, number]>();
  for (const cid of sortedCids) {
    const members = communityMap.get(cid) ?? [];
    const memberCount = members.length;
    const w = Math.max(600, memberCount > 0 ? 220 * Math.ceil(Math.sqrt(memberCount)) : 600);
    const h = Math.max(400, memberCount > 0 ? 100 * Math.ceil(memberCount / 3) + 120 : 400);
    groupSizes.set(cid, [w, h]);
  }

  // Compute column widths and row heights
  const gap = 80;
  const colWidths: number[] = [];
  for (let colIdx = 0; colIdx < cols; colIdx++) {
    let maxW = 0;
    for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
      const linear = rowIdx * cols + colIdx;
      if (linear < sortedCids.length) {
        const cid = sortedCids[linear]!;
        const [w] = groupSizes.get(cid) ?? [600, 400];
        maxW = Math.max(maxW, w);
      }
    }
    colWidths.push(maxW);
  }

  const rowHeights: number[] = [];
  for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
    let maxH = 0;
    for (let colIdx = 0; colIdx < cols; colIdx++) {
      const linear = rowIdx * cols + colIdx;
      if (linear < sortedCids.length) {
        const cid = sortedCids[linear]!;
        const [, h] = groupSizes.get(cid) ?? [600, 400];
        maxH = Math.max(maxH, h);
      }
    }
    rowHeights.push(maxH);
  }

  // Map from cid -> layout
  const groupLayout = new Map<number, [number, number, number, number]>();
  for (let idx = 0; idx < sortedCids.length; idx++) {
    const cid = sortedCids[idx]!;
    const colIdx = idx % cols;
    const rowIdx = Math.floor(idx / cols);
    const gx = colWidths.slice(0, colIdx).reduce((a, b) => a + b, 0) + colIdx * gap;
    const gy = rowHeights.slice(0, rowIdx).reduce((a, b) => a + b, 0) + rowIdx * gap;
    const [gw, gh] = groupSizes.get(cid) ?? [600, 400];
    groupLayout.set(cid, [gx, gy, gw, gh]);
  }

  // Collect all node IDs in canvas
  const allCanvasNodeIds = new Set<string>();
  for (const members of communityMap.values()) {
    for (const m of members) allCanvasNodeIds.add(m);
  }

  // Generate group and node canvas entries
  for (let idx = 0; idx < sortedCids.length; idx++) {
    const cid = sortedCids[idx]!;
    const members = communityMap.get(cid) ?? [];
    const communityName = communityLabels?.get(cid) ?? `Community ${cid}`;
    const [gx, gy, gw, gh] = groupLayout.get(cid) ?? [0, 0, 600, 400];
    const canvasColor = CANVAS_COLORS[idx % CANVAS_COLORS.length]!;

    // Group node
    canvasNodes.push({
      id: `g${cid}`,
      type: "group",
      label: communityName,
      x: gx,
      y: gy,
      width: gw,
      height: gh,
      color: canvasColor,
    });

    // Node cards inside the group
    const sortedMembers = [...members].sort((a, b) => {
      const la = (G.getNodeAttribute(a, "label") as string) ?? a;
      const lb = (G.getNodeAttribute(b, "label") as string) ?? b;
      return la.localeCompare(lb);
    });
    for (let mIdx = 0; mIdx < sortedMembers.length; mIdx++) {
      const nodeId = sortedMembers[mIdx]!;
      const col = mIdx % 3;
      const row = Math.floor(mIdx / 3);
      const nx = gx + 20 + col * (180 + 20);
      const ny = gy + 80 + row * (60 + 20);
      const fname =
        filenameMap.get(nodeId) ??
        safeName((G.getNodeAttribute(nodeId, "label") as string) ?? nodeId);
      canvasNodes.push({
        id: `n_${nodeId}`,
        type: "file",
        file: `graphify/obsidian/${fname}.md`,
        x: nx,
        y: ny,
        width: 180,
        height: 60,
      });
    }
  }

  // Generate edges - only between nodes both in canvas, cap at 200 highest-weight
  const allEdgesWeighted: [number, string, string, string][] = [];
  G.forEachEdge((_edge, edata, u, v) => {
    if (allCanvasNodeIds.has(u) && allCanvasNodeIds.has(v)) {
      const weight = (edata.weight as number) ?? 1.0;
      const relation = (edata.relation as string) ?? "";
      const conf = (edata.confidence as string) ?? "EXTRACTED";
      const label = relation ? `${relation} [${conf}]` : `[${conf}]`;
      allEdgesWeighted.push([weight, u, v, label]);
    }
  });

  allEdgesWeighted.sort((a, b) => b[0] - a[0]);
  for (const [, u, v, label] of allEdgesWeighted.slice(0, 200)) {
    canvasEdges.push({
      id: `e_${u}_${v}`,
      fromNode: `n_${u}`,
      toNode: `n_${v}`,
      label,
    });
  }

  const canvasData = { nodes: canvasNodes, edges: canvasEdges };
  writeFileSync(outputPath, JSON.stringify(canvasData, null, 2), "utf-8");
}

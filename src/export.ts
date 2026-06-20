/**
 * Export graph to JSON, SVG, GraphML, Obsidian Canvas, Neo4j Cypher, and Spanner DDL/DML.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import Graph from "graphology";
import { sanitizeLabel, sanitizeMetadata } from "./security.js";
import { isDirectedGraph } from "./graph.js";
import { assertGraphJsonFileSize, assertGraphJsonSize } from "./graph-size-guard.js";
import { safeGitRevParse } from "./git.js";
import type { Hyperedge } from "./types.js";
import {
  aggregateCitations,
  writeCitationsSidecar,
  type AggregateCitationsOptions,
} from "./citations.js";
import {
  type NumericMapLike,
  type StringMapLike,
  toNumericMap,
  toStringMap,
} from "./collections.js";

// ---------------------------------------------------------------------------
// backupIfProtected — upstream 6939494 (#834)
// Snapshot artifacts to a dated subfolder before overwrite when graph cost
// real LLM tokens or has been human-curated.
// ---------------------------------------------------------------------------

const BACKUP_ARTIFACTS = [
  "graph.json",
  "GRAPH_REPORT.md",
  ".graphify_labels.json",
  ".graphify_analysis.json",
  "manifest.json",
  ".graphify_semantic_marker",
  "cost.json",
];

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Snapshot graph artifacts to a dated subfolder before an overwrite.
 *
 * Triggers when graph.json exists AND either:
 * - .graphify_semantic_marker is present (graph cost real LLM tokens), or
 * - .graphify_labels.json contains at least one non-default community label
 *   (graph has been curated by a human or skill).
 *
 * Returns the backup folder path, or null if no backup was taken.
 * Never throws — best-effort. Set GRAPHIFY_NO_BACKUP=1 to disable.
 */
export function backupIfProtected(outDir: string): string | null {
  if (process.env.GRAPHIFY_NO_BACKUP) return null;
  const out = resolve(outDir);
  if (!existsSync(join(out, "graph.json"))) return null;

  const isSemantic = existsSync(join(out, ".graphify_semantic_marker"));
  let isCurated = false;
  const labelsFile = join(out, ".graphify_labels.json");
  if (existsSync(labelsFile)) {
    try {
      const labels = JSON.parse(readFileSync(labelsFile, "utf-8")) as Record<string, string>;
      isCurated = Object.entries(labels).some(([k, v]) => v !== `Community ${k}`);
    } catch {
      /* ignore */
    }
  }

  if (!isSemantic && !isCurated) return null;

  const reason = [
    isSemantic ? "semantic" : "",
    isCurated ? "curated" : "",
  ].filter(Boolean).join("+");

  const today = todayIso();
  const backupDir = join(out, today);

  // One backup folder per day (port of upstream 3efae38). If today's backup
  // already holds byte-identical graph.json content, skip the re-copy; if the
  // graph changed since that backup, overwrite it in place so the dated folder
  // always holds the latest pre-overwrite state instead of accumulating `_N`.
  const backupGraph = join(backupDir, "graph.json");
  if (existsSync(backupDir) && existsSync(backupGraph)) {
    try {
      const srcHash = createHash("sha256").update(readFileSync(join(out, "graph.json"))).digest("hex");
      const bakHash = createHash("sha256").update(readFileSync(backupGraph)).digest("hex");
      if (srcHash === bakHash) return backupDir;
    } catch {
      /* fall through and overwrite the backup */
    }
  }

  try {
    mkdirSync(backupDir, { recursive: true });
    let copied = 0;
    for (const name of BACKUP_ARTIFACTS) {
      const src = join(out, name);
      if (existsSync(src)) {
        try {
          copyFileSync(src, join(backupDir, name));
          copied++;
        } catch {
          /* ignore individual file copy failures */
        }
      }
    }
    if (copied > 0) {
      console.log(`[graphify] backed up ${reason} graph (${copied} files) → ${basename(backupDir)}/`);
    }
    return backupDir;
  } catch (err) {
    console.warn(
      `[graphify] warning: backup failed (${err instanceof Error ? err.message : err}) — continuing with overwrite`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMMUNITY_COLORS = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
];

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
  value: CommunityLabelsInput | CommunityLabelOptions,
): value is CommunityLabelOptions {
  return !(value instanceof Map) && (
    Object.prototype.hasOwnProperty.call(value, "communityLabels") ||
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
  labelsOrOptions?: CommunityLabelsInput | CommunityLabelOptions,
): Map<number, string> | undefined {
  if (!labelsOrOptions) return undefined;
  if (!isCommunityLabelOptions(labelsOrOptions)) {
    return toNumericMap(labelsOrOptions as CommunityLabelsInput);
  }
  return labelsOrOptions.communityLabels ? toNumericMap(labelsOrOptions.communityLabels) : undefined;
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

  // F-0816-P3 (S3.2): sanitise the free-form `graph` metadata block at the
  // export boundary. Defence in depth so external indexer or future-extractor
  // output cannot leak control chars or HTML markup through graph.json.
  // Only the metadata block is sanitised here — node / edge / hyperedge rows
  // are round-tripped through graph.json and would double-escape if their
  // canonical fields (label, source_file, relation) were HTML-escaped on
  // every write. Untrusted node / edge metadata sites must apply the helper
  // at the assignment site instead.
  const provenance = G.getAttribute("provenance");
  const sanitisedGraphBlock = sanitizeMetadata({
    ...(provenance !== undefined ? { provenance } : {}),
    community_labels: communityLabelsObject,
    ...buildFreshnessMetadata(outputPath),
  });

  const output = {
    directed: isDirectedGraph(G),
    multigraph: false,
    graph: sanitisedGraphBlock,
    topology_signature,
    nodes,
    links,
    hyperedges,
  };

  if (!forceWrite) {
    try {
      assertGraphJsonFileSize(outputPath, "read");
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

  const serialized = JSON.stringify(output, null, 2);
  assertGraphJsonSize(Buffer.byteLength(serialized, "utf-8"), "write", outputPath);
  writeFileSync(outputPath, serialized, "utf-8");
  return true;
}

/**
 * Co-emit chokepoint (SPEC_CITATIONS area 6). Runs the citation aggregation
 * pass over the assembled graph IMMEDIATELY before graph.json is written, then
 * writes graph.json (trimmed inline `citations` + `citation_count`) and the
 * co-derived `citations.json` so the two projections are always consistent.
 *
 * The aggregation mutates `G` in place: each node's `citations` is trimmed to
 * the deterministic top-K and `citation_count` is stamped with the true union
 * size; the full per-entity union is written to
 * `<dirname(graphPath)>/ontology/citations.json`.
 *
 * Returns the same boolean as `toJson` (false when the shrink-guard refuses the
 * write). The sidecar is only written when graph.json itself was written and at
 * least one node carries citations (no empty sidecar littering).
 */
export function persistGraphWithCitations(
  G: Graph,
  communities: NumericMapLike<string[]>,
  outputPath: string,
  options?: JsonOptions & { citations?: AggregateCitationsOptions },
): boolean {
  const map = aggregateCitations(G, options?.citations ?? {});
  const jsonOptions: JsonOptions | undefined = options
    ? { ...(options.communityLabels ? { communityLabels: options.communityLabels } : {}), ...(options.force ? { force: true } : {}) }
    : undefined;
  const written = toJson(G, communities, outputPath, jsonOptions);
  if (written) {
    writeCitationsSidecar(dirname(outputPath), map, G);
  }
  return written;
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

// ---------------------------------------------------------------------------
// toSpanner
// ---------------------------------------------------------------------------

/**
 * Escape a string value for use inside a GoogleSQL single-quoted string literal.
 * Escapes backslash, single-quote, newline, carriage-return, and tab.
 * Other ASCII control characters are replaced with a space.
 */
function spannerEscape(value: unknown): string {
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

/**
 * Serialise a node/edge attribute map to a JSON string suitable for embedding
 * in a Spanner JSON column value (single-quoted SQL literal).
 * Known schema columns (id, label, node_type, community, source_id, target_id,
 * relation, confidence) are stripped; the remainder go into props.
 * The JSON string is then single-quote-escaped for the SQL literal.
 */
function spannerPropsJson(
  attrs: Record<string, unknown>,
  omit: string[],
): string {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!omit.includes(k)) {
      props[k] = v;
    }
  }
  // JSON.stringify always produces valid JSON; escape single quotes for SQL.
  return JSON.stringify(props).replace(/'/g, "\\'");
}

const SPANNER_NODE_SCHEMA_COLS = ["id", "label", "node_type", "community"];
const SPANNER_EDGE_SCHEMA_COLS = [
  "source_id", "target_id", "relation", "confidence",
];

/**
 * The Spanner schema as an array of DDL text lines (joined with "\n"). This is
 * the single source of truth for both `toSpanner()` (file export) and the live
 * `spanner` GraphStore adapter (ensure-exists). The live adapter reuses these
 * statements verbatim; it adds a `namespace` column and namespaced primary
 * keys on top for multi-project isolation (mirroring the neo4j namespace
 * model). Keeping one definition here prevents the export artifact and the
 * live schema from drifting.
 */
export function spannerDdlLines(): string[] {
  return [
    "-- Spanner DDL generated by graphify",
    "-- GoogleSQL dialect · Cloud Spanner Property Graph",
    "",
    "CREATE TABLE graphify_nodes (",
    "  id STRING(MAX) NOT NULL,",
    "  label STRING(MAX),",
    "  node_type STRING(MAX),",
    "  community INT64,",
    "  props JSON",
    ") PRIMARY KEY (id);",
    "",
    "CREATE TABLE graphify_edges (",
    "  source_id STRING(MAX) NOT NULL,",
    "  target_id STRING(MAX) NOT NULL,",
    "  relation STRING(MAX) NOT NULL,",
    "  confidence STRING(MAX),",
    "  props JSON",
    // Standalone table — NOT interleaved: Spanner requires an interleaved
    // child's PK to be prefixed by the parent's PK columns by name, but the
    // edge PK starts with source_id (parent PK is id). The property-graph
    // SOURCE/DESTINATION KEY references below establish the relationships.
    ") PRIMARY KEY (source_id, target_id, relation);",
    "",
    "-- Property Graph projection",
    "CREATE PROPERTY GRAPH graphify",
    "  NODE TABLES (",
    "    graphify_nodes",
    "      KEY (id)",
    "      LABEL node",
    "      PROPERTIES (label, node_type, community)",
    "  )",
    "  EDGE TABLES (",
    "    graphify_edges",
    "      KEY (source_id, target_id, relation)",
    "      SOURCE KEY (source_id) REFERENCES graphify_nodes (id)",
    "      DESTINATION KEY (target_id) REFERENCES graphify_nodes (id)",
    "      LABEL edge",
    "      PROPERTIES (relation, confidence)",
    "  );",
    "",
  ];
}

/**
 * Export the graph as Google Cloud Spanner DDL and DML artifacts.
 *
 * Writes two files to `outputDir`:
 *   - `spanner.ddl.sql`  — CREATE TABLE + CREATE PROPERTY GRAPH statements
 *   - `spanner.dml.sql`  — INSERT OR UPDATE statements for nodes then edges
 *
 * Zero driver, zero network, zero credentials required.
 * Compatible with the GoogleSQL dialect used by Cloud Spanner.
 */
export function toSpanner(G: Graph, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  // -------------------------------------------------------------------------
  // DDL
  // -------------------------------------------------------------------------
  const ddl: string[] = spannerDdlLines();

  writeFileSync(join(outputDir, "spanner.ddl.sql"), ddl.join("\n"), "utf-8");

  // -------------------------------------------------------------------------
  // DML
  // -------------------------------------------------------------------------
  const dml: string[] = [
    "-- Spanner DML generated by graphify",
    "-- GoogleSQL dialect · INSERT OR UPDATE (upsert) mutations",
    "",
    "-- Nodes",
  ];

  G.forEachNode((nodeId, attrs) => {
    const id = spannerEscape(nodeId);
    const label = spannerEscape((attrs.label as string) ?? nodeId);
    const nodeType = spannerEscape((attrs.node_type as string) ?? "");
    const community = typeof attrs.community === "number"
      ? String(attrs.community)
      : "NULL";
    const propsJson = spannerPropsJson(
      attrs as Record<string, unknown>,
      SPANNER_NODE_SCHEMA_COLS,
    );
    dml.push(
      `INSERT OR UPDATE INTO graphify_nodes (id, label, node_type, community, props) ` +
      `VALUES ('${id}', '${label}', '${nodeType}', ${community}, JSON '${propsJson}');`,
    );
  });

  dml.push("");
  dml.push("-- Edges");

  G.forEachEdge((_edge, edgeAttrs, u, v) => {
    const sourceId = spannerEscape(u);
    const targetId = spannerEscape(v);
    const relation = spannerEscape(
      (edgeAttrs.relation as string) ?? "RELATES_TO",
    );
    const confidence = spannerEscape(
      (edgeAttrs.confidence as string) ?? "EXTRACTED",
    );
    const propsJson = spannerPropsJson(
      edgeAttrs as Record<string, unknown>,
      SPANNER_EDGE_SCHEMA_COLS,
    );
    dml.push(
      `INSERT OR UPDATE INTO graphify_edges (source_id, target_id, relation, confidence, props) ` +
      `VALUES ('${sourceId}', '${targetId}', '${relation}', '${confidence}', JSON '${propsJson}');`,
    );
  });

  dml.push("");

  writeFileSync(join(outputDir, "spanner.dml.sql"), dml.join("\n"), "utf-8");
}


/**
 * @deprecated Legacy one-shot Neo4j push — thin compat wrapper over the
 * batched Neo4j GraphStore adapter (src/storage/neo4j.ts). Kept for
 * backwards-compatibility; use `createNeo4jGraphStore` directly for new code.
 * Signature locked by tests/public-api.test.ts:67.
 */
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

  // Dynamic import to avoid a static circular dependency:
  // export.ts ← neo4j.ts would be circular since neo4j.ts is imported by
  // registry.ts which could be imported transitively. Dynamic import resolves
  // at call time, after module evaluation is complete.
  const { createNeo4jGraphStore } = await import("./storage/neo4j.js");

  const rawCommunities = options.communities;
  const communityMap = new Map<number, string[]>();
  if (rawCommunities) {
    const numeric = toNumericMap(rawCommunities);
    for (const [cid, nodes] of numeric) {
      communityMap.set(cid, nodes);
    }
  }

  const store = await createNeo4jGraphStore({
    target: options.uri,
    user: options.user,
    password: options.password,
    namespace: undefined, // derive from URI
  });

  try {
    const result = await store.pushGraph(G, communityMap, { mode: "merge" });
    return { nodes: result.nodes, edges: result.edges };
  } finally {
    await store.close();
  }
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

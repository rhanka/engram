/**
 * Assemble node+edge dicts into a graphology Graph, preserving edge direction.
 *
 * Node deduplication — three layers:
 *
 * 1. Within a file (AST): each extractor tracks a `seenIds` set.
 * 2. Between files (build): graphology mergeNode is idempotent — last write wins.
 * 3. Semantic merge (skill): before calling build(), the skill merges results
 *    using an explicit `seen` set keyed on node.id.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative as pathRelative, resolve } from "node:path";
import Graph from "graphology";
import type { Extraction } from "./types.js";
import { createGraph } from "./graph.js";
import { assertGraphJsonFileSize } from "./graph-size-guard.js";
import { cleanupStaleNodes } from "./semantic-cleanup.js";
import { validateExtraction } from "./validate.js";

export interface BuildOptions {
  directed?: boolean;
  /**
   * If given, absolute source_file paths from semantic subagents are made
   * repo-relative before graph storage. Closes upstream #932 where semantic
   * chunks produced absolute paths that did not match the AST chunks' relative
   * paths, splitting nodes across two identities.
   */
  root?: string;
}

const CHUNK_SUFFIX = /_c\d+$/;
const SKU_LIKE_LABEL = /^[A-Z0-9][A-Z0-9._/-]{1,11}$/;

function normalizeSourceFilePath(value: unknown, root?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  let normalised = value.replace(/\\/g, "/");
  if (root && isAbsolute(normalised)) {
    try {
      const rel = pathRelative(resolve(root), normalised);
      // Only strip when the path is actually inside root (no .. prefix).
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
        normalised = rel.replace(/\\/g, "/");
      }
    } catch {
      /* ignore — keep original */
    }
  }
  return normalised;
}

// Unicode word characters (letters + digits across scripts) plus underscore.
// Ports safishamsi 86109e9 (#937) to TypeScript: Python's
// `re.sub(r"[\W_]+", " ", label.casefold(), flags=re.UNICODE)` becomes
// `replace(/[^\p{L}\p{N}]+/gu, " ")` in JS (since `\W` is ASCII-only
// without `u`, we spell the inverted Unicode class explicitly).
const UNICODE_NON_WORD = /[^\p{L}\p{N}]+/gu;
// ASCII-only labels still go through the legacy 3-char noise gate
// (intentional TS delta documented in tests/build-merge.test.ts).
// Non-ASCII labels carry meaningful semantic weight at 2 characters
// (e.g. 前端, 東京) and must not be silently skipped.
const ASCII_ONLY = /^[\x20-\x7E]*$/;

function normalizedLabel(value: string): string {
  // NFKC canonicalises width/compatibility variants (e.g. fullwidth digits
  // １２３ → 123) so labels that differ only in glyph form dedup together.
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(UNICODE_NON_WORD, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupLabelKey(node: Extraction["nodes"][number]): string | null {
  const rawLabel = String(node.label ?? node.id ?? "").trim();
  const label = normalizedLabel(rawLabel);
  if (!label) return null;
  const compactLabel = label.replace(/ /g, "");
  const isAsciiOnly = ASCII_ONLY.test(rawLabel);
  if (isAsciiOnly && compactLabel.length <= 3) return null;
  if (SKU_LIKE_LABEL.test(rawLabel)) return null;
  return label;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sourceKey(value: unknown): string {
  return normalizeSourceFilePath(value) ?? "";
}

function rootForOptions(options?: BuildOptions): string | undefined {
  const r = options?.root;
  return typeof r === "string" && r.length > 0 ? resolve(r) : undefined;
}

function resolveRemap(remap: Map<string, string>, id: string): string {
  const seen = new Set<string>();
  let current = id;
  while (remap.has(current) && !seen.has(current)) {
    seen.add(current);
    current = remap.get(current)!;
  }
  return current;
}

function preferNode(current: Extraction["nodes"][number], existing: Extraction["nodes"][number]): boolean {
  const existingChunk = CHUNK_SUFFIX.test(existing.id);
  const currentChunk = CHUNK_SUFFIX.test(current.id);
  return (
    (existingChunk && !currentChunk) ||
    (existingChunk === currentChunk && current.id.length < existing.id.length)
  );
}

function readExistingGraphExtraction(graphPath: string): { extraction: Extraction; nodeCount: number } {
  assertGraphJsonFileSize(graphPath, "read");
  const raw = asRecord(JSON.parse(readFileSync(graphPath, "utf-8"))) ?? {};
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.links) ? raw.links : Array.isArray(raw.edges) ? raw.edges : [];
  const rawGraphAttrs = asRecord(raw.graph) ?? {};
  const rawHyperedges = Array.isArray(raw.hyperedges)
    ? raw.hyperedges
    : Array.isArray(rawGraphAttrs.hyperedges)
      ? rawGraphAttrs.hyperedges
      : [];

  const nodes: Extraction["nodes"] = [];
  for (const item of rawNodes) {
    const node = asRecord(item);
    if (!node) continue;
    const id = asString(node.id);
    if (!id) continue;
    const { id: _id, ...attrs } = node;
    nodes.push({
      id,
      label: String(attrs.label ?? id),
      file_type: String(attrs.file_type ?? "code") as Extraction["nodes"][number]["file_type"],
      source_file: String(attrs.source_file ?? ""),
      ...attrs,
    });
  }

  const edges: Extraction["edges"] = [];
  for (const item of rawEdges) {
    const edge = asRecord(item);
    if (!edge) continue;
    const source = asString(edge._src) ?? asString(edge.source);
    const target = asString(edge._tgt) ?? asString(edge.target);
    if (!source || !target) continue;
    const {
      source: _source,
      target: _target,
      _src,
      _tgt,
      ...attrs
    } = edge;
    edges.push({
      source,
      target,
      relation: String(attrs.relation ?? "related_to"),
      confidence: String(attrs.confidence ?? "EXTRACTED") as Extraction["edges"][number]["confidence"],
      source_file: String(attrs.source_file ?? ""),
      ...attrs,
    });
  }

  return {
    extraction: {
      nodes,
      edges,
      hyperedges: rawHyperedges as Extraction["hyperedges"],
      input_tokens: 0,
      output_tokens: 0,
    },
    nodeCount: nodes.length,
  };
}

export function deduplicateByLabel(extraction: Extraction): Extraction {
  const remap = new Map<string, string>();
  const nodes = extraction.nodes ?? [];

  const applyLabelPass = (partitionBySource: boolean): void => {
    const canonicalByLabel = new Map<string, Extraction["nodes"][number]>();

    for (const node of nodes) {
      if (resolveRemap(remap, node.id) !== node.id) continue;

      const label = dedupLabelKey(node);
      if (!label) continue;

      const key = partitionBySource ? `${sourceKey(node.source_file)}\0${label}` : label;
      const existing = canonicalByLabel.get(key);
      if (!existing) {
        canonicalByLabel.set(key, node);
        continue;
      }

      const sameSource = sourceKey(existing.source_file) === sourceKey(node.source_file);
      const chunkCandidate = CHUNK_SUFFIX.test(existing.id) || CHUNK_SUFFIX.test(node.id);
      if (partitionBySource ? !sameSource : !chunkCandidate) {
        continue;
      }

      if (preferNode(node, existing)) {
        remap.set(existing.id, node.id);
        canonicalByLabel.set(key, node);
      } else {
        remap.set(node.id, existing.id);
      }
    }
  };

  applyLabelPass(true);
  applyLabelPass(false);

  if (remap.size === 0) {
    return extraction;
  }

  console.error(`[graphify] Deduplicated ${remap.size} duplicate node(s) by label.`);

  const deduplicatedNodes = nodes.filter((node) => resolveRemap(remap, node.id) === node.id);
  const edges = (extraction.edges ?? [])
    .map((edge) => ({
      ...edge,
      source: resolveRemap(remap, edge.source),
      target: resolveRemap(remap, edge.target),
    }))
    .filter((edge) => edge.source !== edge.target);
  const hyperedges = (extraction.hyperedges ?? []).map((hyperedge) => ({
    ...hyperedge,
    nodes: hyperedge.nodes.map((nodeId) => resolveRemap(remap, nodeId)),
  }));

  return {
    ...extraction,
    nodes: deduplicatedNodes,
    edges,
    hyperedges,
  };
}

export function buildFromJson(extraction: Extraction, options?: BuildOptions): Graph {
  const root = rootForOptions(options);
  for (const node of extraction.nodes ?? []) {
    const legacySource = node.source as unknown;
    if (legacySource !== undefined && node.source_file === undefined) {
      const affectedEdges = (extraction.edges ?? []).filter(
        (edge) => edge.source === node.id || edge.target === node.id,
      ).length;
      console.error(
        `[graphify] WARNING: node '${node.id}' uses field 'source' instead of ` +
        `'source_file' - ${affectedEdges} edge(s) may be misrouted. Rename the field to ` +
        "'source_file' to silence this warning.",
      );
      node.source_file = normalizeSourceFilePath(String(legacySource), root) ?? String(legacySource);
      delete node.source;
    }
  }

  const errors = validateExtraction(extraction);
  // Dangling edges (stdlib/external imports) are expected - only warn about real schema errors.
  const realErrors = errors.filter((e) => !e.includes("does not match any node id"));
  if (realErrors.length > 0) {
    console.error(
      `[graphify] Extraction warning (${realErrors.length} issues): ${realErrors[0]}`,
    );
  }

  const G = createGraph(options?.directed === true);

  for (const node of extraction.nodes ?? []) {
    const { id, ...attrs } = node;
    const normalizedAttrs = { ...attrs };
    if ("source_file" in normalizedAttrs) {
      normalizedAttrs.source_file = normalizeSourceFilePath(normalizedAttrs.source_file, root) ?? normalizedAttrs.source_file;
    }
    G.mergeNode(id, normalizedAttrs);
  }

  const nodeSet = new Set(G.nodes());

  // F-0819-P2 (#1010): iterate edges in a deterministic order. The graph is
  // undirected and stores direction in _src/_tgt; when two edges collapse onto
  // the same node pair the surviving edge depends on iteration order, so an
  // unstable order (e.g. AST + semantic chunks merged in a different sequence
  // run-to-run) flips _src/_tgt and makes the serialized graph churn. Sorting
  // by (source, target, relation) pins the first-seen outcome.
  const sortedEdges = [...(extraction.edges ?? [])].sort((a, b) => {
    const as = String(a.source ?? "");
    const bs = String(b.source ?? "");
    if (as !== bs) return as < bs ? -1 : 1;
    const at = String(a.target ?? "");
    const bt = String(b.target ?? "");
    if (at !== bt) return at < bt ? -1 : 1;
    const ar = String(a.relation ?? "");
    const br = String(b.relation ?? "");
    if (ar !== br) return ar < br ? -1 : 1;
    return 0;
  });

  for (const edge of sortedEdges) {
    const { source, target, ...attrs } = edge;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
    if ("source_file" in attrs) {
      attrs.source_file = normalizeSourceFilePath(attrs.source_file, root) ?? attrs.source_file;
    }
    // Preserve original edge direction
    attrs._src = source;
    attrs._tgt = target;
    // F-0819-P1 (#1061): on an undirected graph a pair emitted in both
    // directions with the same relation (a calls b AND b calls a) collapses to
    // one edge; the reverse-direction duplicate would otherwise overwrite the
    // first edge's _src/_tgt and silently flip caller/callee. First-seen wins:
    // skip the redundant reverse duplicate.
    if (!G.type.startsWith("directed") && G.hasEdge(source, target)) {
      const existing = G.getEdgeAttributes(source, target) as Record<string, unknown>;
      if (
        existing.relation === attrs.relation &&
        existing._src === target &&
        existing._tgt === source
      ) {
        continue;
      }
    }
    // graphology mergeEdge prevents duplicates on same src/tgt pair
    try {
      G.mergeEdge(source, target, attrs);
    } catch {
      // ignore if edge already exists with different key
    }
  }

  const hyperedges = extraction.hyperedges ?? [];
  if (hyperedges.length > 0) {
    G.setAttribute(
      "hyperedges",
      hyperedges.map((hyperedge) => ({
        ...hyperedge,
        source_file: normalizeSourceFilePath(hyperedge.source_file, root) ?? hyperedge.source_file,
      })),
    );
  }

  return G;
}

/**
 * Merge multiple extraction results into one graph.
 * Extractions are merged in order — last attributes win for duplicate node IDs.
 */
export function build(extractions: Extraction[], options?: BuildOptions): Graph {
  const combined: Extraction = {
    nodes: [],
    edges: [],
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
  for (const ext of extractions) {
    combined.nodes.push(...(ext.nodes ?? []));
    combined.edges.push(...(ext.edges ?? []));
    (combined.hyperedges ??= []).push(...(ext.hyperedges ?? []));
    combined.input_tokens += ext.input_tokens ?? 0;
    combined.output_tokens += ext.output_tokens ?? 0;
  }
  return buildFromJson(combined, options);
}

export interface BuildMergeOptions extends BuildOptions {
  graphPath?: string;
  pruneSources?: string[];
  /**
   * Automatic stale-node prune at finalize (F-0816-M5). When set, any
   * node whose `source_file` no longer exists on disk under `root` (or
   * is missing from `aliveSourceFiles` when provided) is dropped along
   * with its adjacent edges before the shrink-guard fires.
   *
   * The wiki-level equivalent for the render path is the F-0816-P4
   * stale-node filter in `src/wiki.ts > toWiki`. The two layers are
   * deliberately overlapping (defence-in-depth): this pre-render cleanup
   * keeps `.graphify/graph.json` itself dangling-reference-free; the
   * wiki filter still defends the render path against any drift between
   * graph.json and the analysis JSON.
   */
  pruneMissingSources?: {
    root: string;
    aliveSourceFiles?: Set<string>;
  };
}

export function buildMerge(newChunks: Extraction[], options?: BuildMergeOptions): Graph {
  const graphPath = resolve(options?.graphPath ?? ".graphify/graph.json");
  const base: Extraction[] = [];
  let existingNodeCount = 0;

  if (existsSync(graphPath)) {
    const existing = readExistingGraphExtraction(graphPath);
    base.push(existing.extraction);
    existingNodeCount = existing.nodeCount;
  }

  const mergedExtraction: Extraction = {
    nodes: [],
    edges: [],
    hyperedges: [],
    input_tokens: 0,
    output_tokens: 0,
  };
  for (const chunk of [...base, ...newChunks]) {
    mergedExtraction.nodes.push(...(chunk.nodes ?? []));
    mergedExtraction.edges.push(...(chunk.edges ?? []));
    (mergedExtraction.hyperedges ??= []).push(...(chunk.hyperedges ?? []));
    mergedExtraction.input_tokens += chunk.input_tokens ?? 0;
    mergedExtraction.output_tokens += chunk.output_tokens ?? 0;
  }

  const deduplicated = deduplicateByLabel(mergedExtraction);
  const graph = buildFromJson(deduplicated, options);

  if ((options?.pruneSources?.length ?? 0) > 0) {
    const pruneSet = new Set((options?.pruneSources ?? []).map(sourceKey).filter(Boolean));
    const nodesToDrop: string[] = [];
    graph.forEachNode((nodeId, attrs) => {
      if (pruneSet.has(sourceKey(attrs.source_file))) {
        nodesToDrop.push(nodeId);
      }
    });
    for (const nodeId of nodesToDrop) {
      graph.dropNode(nodeId);
    }
  }

  // F-0816-M5: automatic stale-node prune. Ordered AFTER pruneSources so
  // explicit caller intent always wins; the auto-prune catches whatever
  // remains where source_file no longer exists on disk.
  let autoPruned = 0;
  if (options?.pruneMissingSources) {
    const before = graph.order;
    cleanupStaleNodes(graph, options.pruneMissingSources);
    autoPruned = before - graph.order;
  }

  const explicitPruneRequested =
    (options?.pruneSources?.length ?? 0) > 0 ||
    (options?.pruneMissingSources !== undefined && autoPruned > 0);
  if (existingNodeCount > 0 && graph.order < existingNodeCount && !explicitPruneRequested) {
    throw new Error(
      `graphify: buildMerge would shrink graph from ${existingNodeCount} to ${graph.order} nodes. ` +
      "Pass pruneSources explicitly if you intend to remove nodes.",
    );
  }

  return graph;
}

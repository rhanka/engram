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
import { resolve } from "node:path";
import Graph from "graphology";
import type { Extraction } from "./types.js";
import { createGraph } from "./graph.js";
import { validateExtraction } from "./validate.js";

export interface BuildOptions {
  directed?: boolean;
}

const CHUNK_SUFFIX = /_c\d+$/;

function normalizeSourceFilePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(/\\/g, "/");
}

function normalizedLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readExistingGraphExtraction(graphPath: string): { extraction: Extraction; nodeCount: number } {
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
  const canonicalByLabel = new Map<string, Extraction["nodes"][number]>();
  const remap = new Map<string, string>();

  for (const node of extraction.nodes ?? []) {
    const label = normalizedLabel(String(node.label ?? node.id ?? ""));
    if (!label) continue;

    const existing = canonicalByLabel.get(label);
    if (!existing) {
      canonicalByLabel.set(label, node);
      continue;
    }

    const sameSource = existing.source_file === node.source_file;
    const chunkCandidate = CHUNK_SUFFIX.test(existing.id) || CHUNK_SUFFIX.test(node.id);
    if (!sameSource && !chunkCandidate) {
      continue;
    }

    const existingChunk = CHUNK_SUFFIX.test(existing.id);
    const currentChunk = CHUNK_SUFFIX.test(node.id);
    const preferCurrent =
      (existingChunk && !currentChunk) ||
      (existingChunk === currentChunk && node.id.length < existing.id.length);

    if (preferCurrent) {
      remap.set(existing.id, node.id);
      canonicalByLabel.set(label, node);
    } else {
      remap.set(node.id, existing.id);
    }
  }

  if (remap.size === 0) {
    return extraction;
  }

  console.error(`[graphify] Deduplicated ${remap.size} duplicate node(s) by label.`);

  const nodes = Array.from(
    new Map(
      [...canonicalByLabel.values(), ...(extraction.nodes ?? []).filter((node) => !remap.has(node.id))]
        .map((node) => [node.id, node]),
    ).values(),
  );
  const edges = (extraction.edges ?? [])
    .map((edge) => ({
      ...edge,
      source: remap.get(edge.source) ?? edge.source,
      target: remap.get(edge.target) ?? edge.target,
    }))
    .filter((edge) => edge.source !== edge.target);
  const hyperedges = (extraction.hyperedges ?? []).map((hyperedge) => ({
    ...hyperedge,
    nodes: hyperedge.nodes.map((nodeId) => remap.get(nodeId) ?? nodeId),
  }));

  return {
    ...extraction,
    nodes,
    edges,
    hyperedges,
  };
}

export function buildFromJson(extraction: Extraction, options?: BuildOptions): Graph {
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
      node.source_file = normalizeSourceFilePath(String(legacySource)) ?? String(legacySource);
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
      normalizedAttrs.source_file = normalizeSourceFilePath(normalizedAttrs.source_file) ?? normalizedAttrs.source_file;
    }
    G.mergeNode(id, normalizedAttrs);
  }

  const nodeSet = new Set(G.nodes());

  for (const edge of extraction.edges ?? []) {
    const { source, target, ...attrs } = edge;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
    if ("source_file" in attrs) {
      attrs.source_file = normalizeSourceFilePath(attrs.source_file) ?? attrs.source_file;
    }
    // Preserve original edge direction
    attrs._src = source;
    attrs._tgt = target;
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
        source_file: normalizeSourceFilePath(hyperedge.source_file) ?? hyperedge.source_file,
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
    const pruneSet = new Set(options?.pruneSources);
    graph.forEachNode((nodeId, attrs) => {
      if (pruneSet.has(String(attrs.source_file ?? ""))) {
        graph.dropNode(nodeId);
      }
    });
  }

  if (existingNodeCount > 0 && graph.order < existingNodeCount && (options?.pruneSources?.length ?? 0) === 0) {
    throw new Error(
      `graphify: buildMerge would shrink graph from ${existingNodeCount} to ${graph.order} nodes. ` +
      "Pass pruneSources explicitly if you intend to remove nodes.",
    );
  }

  return graph;
}

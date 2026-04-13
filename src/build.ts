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
import Graph from "graphology";
import type { Extraction } from "./types.js";
import { createGraph } from "./graph.js";
import { validateExtraction } from "./validate.js";

export interface BuildOptions {
  directed?: boolean;
}

export function buildFromJson(extraction: Extraction, options?: BuildOptions): Graph {
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
    G.mergeNode(id, attrs);
  }

  const nodeSet = new Set(G.nodes());

  for (const edge of extraction.edges ?? []) {
    const { source, target, ...attrs } = edge;
    if (!nodeSet.has(source) || !nodeSet.has(target)) continue;
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
    G.setAttribute("hyperedges", hyperedges);
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

/**
 * Citation identity, union, and deterministic inline top-K selection.
 *
 * This module is the pure, provider-neutral core of the exhaustive-citations
 * feature (SPEC_CITATIONS.md). It owns:
 *   - the citation identity key (dedupe key),
 *   - the union of citation lists across chunks/works (the discard fix),
 *   - the deterministic inline top-K selection pinned by the spec, and
 *   - the pre-toJson aggregation pass + the co-derived `citations.json` emitter.
 *
 * No LLM, no network, no secrets — everything here is deterministic and
 * replayable from already-extracted citation locators.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type Graph from "graphology";
import type { OntologyCitation } from "./types.js";

/** Default inline Level-1 K (most-distinct-source top-K). Spec Decision 2. */
export const CITATIONS_INLINE_TOP_K = 8;

/** Schema tag for the co-derived Level-2 store. */
export const CITATIONS_SIDECAR_SCHEMA = "graphify_ontology_citations_v1";

/** Relative path (under the graph dir) of the Level-2 keyed store. */
export const CITATIONS_SIDECAR_RELPATH = "ontology/citations.json";

export interface CitationKeyOptions {
  /** Include bbox in identity (figure/image corpora). Default false (prose). */
  includeBbox?: boolean;
}

function locatorPart(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/**
 * Stable identity key for a citation. Prose identity is
 * `source_file|page|section|paragraph_id`; figure/image corpora append `bbox`.
 * Missing locator fields collapse to empty segments (never the literal
 * "undefined") so equality is well-defined.
 */
export function citationKey(c: OntologyCitation, options: CitationKeyOptions = {}): string {
  const base = [
    locatorPart(c.source_file),
    locatorPart(c.page),
    locatorPart(c.section),
    locatorPart(c.paragraph_id),
  ].join("|");
  if (options.includeBbox) {
    const bbox = Array.isArray(c.bbox) ? c.bbox.join(",") : "";
    return `${base}|${bbox}`;
  }
  return base;
}

/**
 * Total, stable lexicographic order by (source_file, page, section,
 * paragraph_id). Matches the `uniqueSorted` posture used elsewhere
 * (ontology-reconciliation). Removes any dependence on extraction order.
 */
function compareCitations(a: OntologyCitation, b: OntologyCitation): number {
  const fields: (keyof OntologyCitation)[] = ["source_file", "page", "section", "paragraph_id"];
  for (const f of fields) {
    const av = locatorPart(a[f]);
    const bv = locatorPart(b[f]);
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export interface UnionOptions {
  includeBbox?: boolean;
}

/**
 * Union of one or more citation lists. Dedupes by identity key (first-seen
 * preserved internally for traceability), then returns a stable
 * lexicographically-sorted array. Malformed / non-array inputs are skipped.
 */
export function unionCitations(
  lists: ReadonlyArray<ReadonlyArray<OntologyCitation> | null | undefined>,
  options: UnionOptions = {},
): OntologyCitation[] {
  const seen = new Set<string>();
  const out: OntologyCitation[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const key = citationKey(c as OntologyCitation, { includeBbox: options.includeBbox });
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c as OntologyCitation);
    }
  }
  out.sort(compareCitations);
  return out;
}

/** True when a citation carries a finer locator than a bare source_file. */
function hasFineLocator(c: OntologyCitation): boolean {
  return c.page != null || (c.section != null && c.section !== "") || (c.paragraph_id != null && c.paragraph_id !== "");
}

/**
 * Deterministic inline top-K selection (spec PINNED algorithm):
 *   1. sort the deduped list lexicographically (input-order independent);
 *   2. greedy most-distinct-source cover: pick the next citation whose
 *      source_file is not yet represented, ties broken by the lexicographic
 *      key, until K chosen or every source is covered;
 *   3. fill the remainder (sources exhausted before K) preferring finer
 *      locators (page/section/paragraph_id over bare source_file), then
 *      lexicographic.
 *
 * Pure: two calls on the same SET (any order) return byte-identical output.
 */
export function selectTopCitations(all: ReadonlyArray<OntologyCitation>, K: number): OntologyCitation[] {
  if (K <= 0) return [];
  // Step 0: dedupe + sort. unionCitations gives the canonical sorted order.
  const sorted = unionCitations([all]);
  if (sorted.length <= K) return sorted;

  const chosen: OntologyCitation[] = [];
  const chosenKeys = new Set<string>();
  const coveredSources = new Set<string>();

  // Step 2: greedy most-distinct-source cover (sorted order = stable tie-break).
  for (const c of sorted) {
    if (chosen.length >= K) break;
    const src = locatorPart(c.source_file);
    if (coveredSources.has(src)) continue;
    coveredSources.add(src);
    chosen.push(c);
    chosenKeys.add(citationKey(c));
  }

  if (chosen.length < K) {
    // Step 3: fill by locator specificity, then lexicographic. `sorted` is
    // already lexicographic, so a stable partition by fineness preserves the
    // lexicographic tie-break within each bucket.
    const remaining = sorted.filter((c) => !chosenKeys.has(citationKey(c)));
    const fine = remaining.filter((c) => hasFineLocator(c));
    const coarse = remaining.filter((c) => !hasFineLocator(c));
    for (const c of [...fine, ...coarse]) {
      if (chosen.length >= K) break;
      chosen.push(c);
      chosenKeys.add(citationKey(c));
    }
  }

  return chosen;
}

// ---------------------------------------------------------------------------
// Aggregation pass + co-derived citations.json emitter
// ---------------------------------------------------------------------------

export interface CitationAggregateEntry {
  count: number;
  citations: OntologyCitation[];
}

export type CitationAggregateMap = Record<string, CitationAggregateEntry>;

export interface AggregateCitationsOptions {
  /** Inline Level-1 K. Default CITATIONS_INLINE_TOP_K (8). */
  topK?: number;
  /** Include bbox in identity (figure/image corpora). Default false. */
  includeBbox?: boolean;
}

/**
 * One pass over the assembled graph. For every node carrying citations:
 *   - compute the deduped union (the node's `citations` are already the
 *     post-merge union; this re-dedupes defensively),
 *   - set `node.citation_count = union.length` (the true, degree-independent
 *     count, authoritative even when the inline set is trimmed),
 *   - replace `node.citations` with the deterministic top-K (the graph.json
 *     leanness / trim requirement),
 *   - collect `{ [id]: { count, citations: fullUnion } }` for the Level-2 store.
 *
 * Mutates the graph in place and returns the full-union map.
 */
export function aggregateCitations(G: Graph, options: AggregateCitationsOptions = {}): CitationAggregateMap {
  const topK = options.topK ?? CITATIONS_INLINE_TOP_K;
  const includeBbox = options.includeBbox ?? false;
  const map: CitationAggregateMap = {};

  G.forEachNode((nodeId, attrs) => {
    const raw = (attrs as Record<string, unknown>).citations;
    if (!Array.isArray(raw) || raw.length === 0) return;
    const union = unionCitations([raw as OntologyCitation[]], { includeBbox });
    if (union.length === 0) return;
    const inline = selectTopCitations(union, topK);
    G.setNodeAttribute(nodeId, "citation_count", union.length);
    G.setNodeAttribute(nodeId, "citations", inline);
    map[nodeId] = { count: union.length, citations: union };
  });

  return map;
}

/**
 * Citation-content hash: sha256 over the sorted projection
 * `{ node_id -> inline citations }`. Explicitly NOT computeTopologySignature
 * (blind to node attrs) and NOT mtime+size (a content-identical rebuild would
 * falsely invalidate). Byte-identical inline citations ⇒ identical signature;
 * any citation change ⇒ a different signature.
 */
export function computeCitationSignature(G: Graph): string {
  const projection: Record<string, OntologyCitation[]> = {};
  G.forEachNode((nodeId, attrs) => {
    const inline = (attrs as Record<string, unknown>).citations;
    if (Array.isArray(inline) && inline.length > 0) {
      projection[nodeId] = inline as OntologyCitation[];
    }
  });
  const sortedIds = Object.keys(projection).sort();
  const canonical = sortedIds.map((id) => [id, projection[id]] as const);
  const hash = createHash("sha256");
  hash.update(JSON.stringify(canonical));
  return hash.digest("hex");
}

/**
 * Write the Level-2 keyed store `<outDir>/ontology/citations.json`. The store
 * is co-derived with graph.json (same aggregation pass) and carries the
 * citation-content `graph_signature` of the graph it was emitted against.
 * Returns the absolute path written, or null when the map is empty (nothing to
 * emit — avoids littering empty sidecars).
 */
export function writeCitationsSidecar(
  outDir: string,
  map: CitationAggregateMap,
  G: Graph,
): string | null {
  if (Object.keys(map).length === 0) return null;
  const target = join(outDir, CITATIONS_SIDECAR_RELPATH);
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Stable node ordering for byte-identical rebuilds.
  const nodes: Record<string, CitationAggregateEntry> = {};
  for (const id of Object.keys(map).sort()) {
    const entry = map[id];
    if (entry) nodes[id] = entry;
  }
  const payload = {
    schema: CITATIONS_SIDECAR_SCHEMA,
    graph_signature: computeCitationSignature(G),
    nodes,
  };
  writeFileSync(target, JSON.stringify(payload, null, 2), "utf-8");
  return target;
}

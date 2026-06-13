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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Fold `dup`'s citations into `kept` (the surviving node) as the deduped union.
 * Used at the skip-duplicate assembly sites (cli/skill-runtime) so a duplicate
 * entity's distinct citations are preserved rather than discarded. Mutates
 * `kept.citations` in place; a no-op when neither side carries citations.
 */
export function foldCitationsInto(
  kept: { citations?: OntologyCitation[] | unknown },
  dup: { citations?: OntologyCitation[] | unknown },
): void {
  const keptCites = Array.isArray(kept.citations) ? (kept.citations as OntologyCitation[]) : [];
  const dupCites = Array.isArray(dup.citations) ? (dup.citations as OntologyCitation[]) : [];
  if (keptCites.length === 0 && dupCites.length === 0) return;
  kept.citations = unionCitations([keptCites, dupCites]);
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
    const record = attrs as Record<string, unknown>;
    const raw = record.citations;
    if (!Array.isArray(raw) || raw.length === 0) return;
    const union = unionCitations([raw as OntologyCitation[]], { includeBbox });
    if (union.length === 0) return;
    // Idempotency guard: a prior aggregation pass already trimmed the inline
    // set to K and stamped the TRUE count. Re-deriving the count from the
    // trimmed inline would undercount, so keep the larger known count. (Within
    // a single build pass this is a no-op; it only protects an accidental
    // double-call on the same in-memory graph.)
    const priorCount = typeof record.citation_count === "number" ? record.citation_count : 0;
    const count = Math.max(union.length, priorCount);
    const inline = selectTopCitations(union, topK);
    G.setNodeAttribute(nodeId, "citation_count", count);
    G.setNodeAttribute(nodeId, "citations", inline);
    map[nodeId] = { count, citations: union };
  });

  return map;
}

export interface BackfillCitationsOptions {
  /** Inline Level-1 K. Default CITATIONS_INLINE_TOP_K (8). */
  topK?: number;
  /** Include bbox in identity (figure/image corpora). Default false. */
  includeBbox?: boolean;
}

export interface BackfillCitationsResult {
  /** How many LEGACY nodes (citations[] but no citation_count) were projected. */
  backfilledNodes: number;
  /** Absolute path of the written `citations.json`, or null when none written. */
  sidecarPath: string | null;
  /**
   * Always true when at least one node was backfilled: backfill projects only
   * the bounded sample already in graph.json, so the counts are a LOWER BOUND.
   */
  lowerBound: boolean;
}

/**
 * Lossy backward-compat projection (SPEC_CITATIONS.md "Backfill"). Walks the
 * graph and, for every node carrying a legacy `citations[]` but no
 * `citation_count`, sets `citation_count = |dedupe(citations)|`, trims the
 * inline `citations` to the deterministic top-K, and records the full deduped
 * set for the co-derived `citations.json`.
 *
 * Nodes that already carry a `citation_count` are LEFT UNTOUCHED (their true
 * count — possibly from a real exhaustive extract — is never downgraded to the
 * trimmed inline length); they are still included in the emitted sidecar from
 * their existing inline set so a re-run reproduces a byte-identical store.
 *
 * Counts are a LOWER BOUND: backfill cannot invent citations the bounded graph
 * never held. Idempotent — a second run finds nothing left to backfill.
 *
 * Mutates `G` in place. No LLM, no network.
 */
export function backfillCitations(
  G: Graph,
  outDir: string,
  options: BackfillCitationsOptions = {},
): BackfillCitationsResult {
  const topK = options.topK ?? CITATIONS_INLINE_TOP_K;
  const includeBbox = options.includeBbox ?? false;
  const map: CitationAggregateMap = {};
  let backfilledNodes = 0;

  G.forEachNode((nodeId, attrs) => {
    const record = attrs as Record<string, unknown>;
    const raw = record.citations;
    if (!Array.isArray(raw) || raw.length === 0) return;

    const union = unionCitations([raw as OntologyCitation[]], { includeBbox });
    if (union.length === 0) return;

    const hasCount = typeof record.citation_count === "number";
    if (hasCount) {
      // Already projected (backfill or real extract): do not touch the count or
      // the inline set, but mirror the existing inline citations into the
      // sidecar so the store stays consistent and re-runs are byte-identical.
      map[nodeId] = { count: record.citation_count as number, citations: union };
      return;
    }

    // Legacy node: project it.
    const inline = selectTopCitations(union, topK);
    G.setNodeAttribute(nodeId, "citation_count", union.length);
    G.setNodeAttribute(nodeId, "citations", inline);
    map[nodeId] = { count: union.length, citations: union };
    backfilledNodes += 1;
  });

  const sidecarPath = backfilledNodes > 0 ? writeCitationsSidecar(outDir, map, G) : null;
  return { backfilledNodes, sidecarPath, lowerBound: backfilledNodes > 0 };
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

// ---------------------------------------------------------------------------
// hook-rebuild re-projection (LLM-free)
// ---------------------------------------------------------------------------

/** Read an existing `citations.json` store, or null when absent/unreadable. */
function readExistingSidecar(outDir: string): CitationAggregateMap | null {
  const target = join(outDir, CITATIONS_SIDECAR_RELPATH);
  if (!existsSync(target)) return null;
  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as {
      nodes?: Record<string, { count?: unknown; citations?: unknown }>;
    };
    if (!parsed || typeof parsed !== "object" || !parsed.nodes) return null;
    const map: CitationAggregateMap = {};
    for (const [id, entry] of Object.entries(parsed.nodes)) {
      const citations = Array.isArray(entry?.citations) ? (entry.citations as OntologyCitation[]) : [];
      const count = typeof entry?.count === "number" ? entry.count : citations.length;
      map[id] = { count, citations };
    }
    return map;
  } catch {
    return null;
  }
}

/** Read per-node full citations from a persisted extraction JSON, or null. */
function readExtractionCitations(extractionPath: string): Record<string, OntologyCitation[]> | null {
  if (!existsSync(extractionPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(extractionPath, "utf-8")) as {
      nodes?: Array<{ id?: unknown; citations?: unknown }>;
    };
    if (!parsed || !Array.isArray(parsed.nodes)) return null;
    const out: Record<string, OntologyCitation[]> = {};
    for (const node of parsed.nodes) {
      const id = typeof node?.id === "string" ? node.id : null;
      if (!id) continue;
      if (!Array.isArray(node.citations) || node.citations.length === 0) continue;
      const existing = out[id] ?? [];
      out[id] = unionCitations([existing, node.citations as OntologyCitation[]]);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export interface ReprojectCitationsOptions {
  /** Inline Level-1 K. Default CITATIONS_INLINE_TOP_K (8). */
  topK?: number;
  /** Include bbox in identity (figure/image corpora). Default false. */
  includeBbox?: boolean;
  /**
   * Path to the persisted merged extraction JSON (`.graphify_extract.json`). When
   * present AND it carries richer per-node citations than graph.json, the FULL
   * Level-1 + Level-2 projection is rebuilt from it. Absent → the no-shrink
   * guard path (preserve an existing fuller sidecar).
   */
  extractionPath?: string;
  /**
   * A snapshot of the prior `citations.json` captured BEFORE any same-pass
   * write that may have shrunk it (e.g. a preceding `persistGraphWithCitations`
   * in the hook path). When supplied it is the no-shrink baseline instead of the
   * on-disk store — so the guard compares against the genuinely fuller tail, not
   * an already-overwritten K-set. Falls back to the on-disk store when absent.
   */
  priorSidecar?: CitationAggregateMap | null;
}

/**
 * Read the current on-disk `citations.json` as an aggregate map (or null when
 * absent / unreadable). Exposed so callers can snapshot the RICH sidecar before
 * a same-pass write shrinks it, then hand it back via `priorSidecar`.
 */
export function readCitationsSidecar(outDir: string): CitationAggregateMap | null {
  return readExistingSidecar(outDir);
}

export interface ReprojectCitationsResult {
  /** True when the sidecar was fully rebuilt from the extraction output. */
  rebuiltFromExtraction: boolean;
  /** Absolute path of the (re)written sidecar, or null when none written. */
  sidecarPath: string | null;
}

/**
 * LLM-free citation re-projection for `hook-rebuild` (SPEC_CITATIONS.md
 * "Exhaustive Extraction" → hook-rebuild). Re-projects Level-1
 * (`citation_count` + trimmed inline `citations`) and re-derives the Level-2
 * `citations.json`, with the pass-1 fidelity guard:
 *
 *   - If the extraction output is available AND richer than graph.json, rebuild
 *     the FULL sidecar (and Level-1) from it — the exhaustive tail is recovered.
 *   - If only the K-trimmed graph.json is available, re-project Level-1 in place
 *     (the aggregateCitations idempotency guard keeps the larger known count)
 *     and write the sidecar MERGED with any existing store, taking the richer
 *     per-node entry — so a re-projection from a trimmed graph NEVER clobbers a
 *     fuller `citations.json`.
 *
 * Never adds a citation the inputs do not already contain. No LLM, no network.
 * Mutates `G` in place.
 */
export function reprojectCitationsLLMFree(
  G: Graph,
  outDir: string,
  options: ReprojectCitationsOptions = {},
): ReprojectCitationsResult {
  const topK = options.topK ?? CITATIONS_INLINE_TOP_K;
  const includeBbox = options.includeBbox ?? false;

  const extractionCitations = options.extractionPath
    ? readExtractionCitations(options.extractionPath)
    : null;

  // Path 1: full rebuild from the extraction output. Fold the extraction's full
  // per-node citations into G BEFORE aggregating so Level-1 + Level-2 both
  // derive from the exhaustive set.
  if (extractionCitations) {
    G.forEachNode((nodeId) => {
      const fromExtraction = extractionCitations[nodeId];
      if (!fromExtraction || fromExtraction.length === 0) return;
      // The extraction output IS the upstream source of truth (SPEC "Source of
      // truth"): the full sidecar derives from it, NOT from graph.json's
      // K-bounded inline. Replace the node's citations with the extraction set
      // so Level-1 + Level-2 both re-derive from the exhaustive list.
      const union = unionCitations([fromExtraction], { includeBbox });
      G.setNodeAttribute(nodeId, "citations", union);
      // Clear the stale count so aggregateCitations stamps the true union size
      // (the prior count may be stale relative to a re-extraction).
      G.removeNodeAttribute(nodeId, "citation_count");
    });
    const map = aggregateCitations(G, { topK, includeBbox });
    const sidecarPath = writeCitationsSidecar(outDir, map, G);
    return { rebuiltFromExtraction: true, sidecarPath };
  }

  // Path 2: trimmed graph only. Re-project Level-1 in place (guarded count) and
  // merge with the existing sidecar so a fuller tail is never shrunk. Prefer the
  // caller-supplied pre-write snapshot over the on-disk store (which a preceding
  // same-pass write may already have shrunk).
  const freshMap = aggregateCitations(G, { topK, includeBbox });
  const existing = options.priorSidecar ?? readExistingSidecar(outDir);
  if (existing) {
    for (const [id, prior] of Object.entries(existing)) {
      const fresh = freshMap[id];
      // Keep whichever entry is richer (larger count / longer list).
      if (!fresh || prior.count > fresh.count || prior.citations.length > fresh.citations.length) {
        freshMap[id] = prior;
        // Reflect the richer count back onto Level-1 so graph.json stays honest.
        if (G.hasNode(id) && prior.count > 0) {
          G.setNodeAttribute(id, "citation_count", Math.max(prior.count, fresh?.count ?? 0));
        }
      }
    }
  }
  const sidecarPath = writeCitationsSidecar(outDir, freshMap, G);
  return { rebuiltFromExtraction: false, sidecarPath };
}

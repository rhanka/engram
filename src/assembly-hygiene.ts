/**
 * Assembly hygiene — deterministic, idempotent, NO-KEY normalization that runs
 * on the assembled extraction (node/edge dicts) BEFORE the graphology build.
 *
 * Three CORE assembly steps (each independently config-gated, each a pure
 * transform of an `Extraction` → `Extraction`):
 *
 *   (A) `normalizeSchemaHygiene` — canonicalize synonymous id-prefixes
 *       (`location_`→`place_`, `org_`→`organization_`, …) and normalize the
 *       node `type` to its canonical Capitalized form. When two nodes collapse
 *       onto the same canonical id, their edges/attrs/citations are UNIONed (the
 *       0.14.0 citation-union-at-merge posture), never last-write-wins-dropped.
 *
 *   (B) `deriveAliasesAndNormalizedTerms` — derive `aliases` +
 *       `normalized_terms` conservatively from the label: strip leading
 *       honorifics/titles, strip parentheticals, lowercase. No fuzzy stemming
 *       (no invented collisions).
 *
 *   (D) `deOrphanByContainer` — link every degree-0 entity node into the graph
 *       through an edge the corpus actually supports: CONTAINMENT (its finest
 *       matching ChapterOrStory/Scene/Section, else the Work → `appears_in`) or
 *       CO-PROVENANCE (an already-connected node sharing its exact
 *       `source_file` → `related_to`), preferring whichever lands it in the
 *       giant component. Co-provenance attachments are SPREAD (√-rule) so no
 *       node becomes a synthetic hub-spoke star. An orphan with neither ground
 *       STAYS ORPHANED and is reported as `unattachable` — de-orphaning never
 *       invents an edge. Idempotent: respects pre-existing edges, never
 *       double-adds.
 *
 * Everything here is deterministic and replayable: no LLM, no network, no
 * secrets, stable ordering, and re-running on its own output is a no-op.
 */
import type { Extraction, GraphEdge, GraphNode, OntologyCitation } from "./types.js";
import { unionCitations } from "./citations.js";

// ---------------------------------------------------------------------------
// (A) Schema hygiene — id-prefix + type canonicalization with merge-union
// ---------------------------------------------------------------------------

/**
 * Config for schema hygiene. Both maps are extensible/overridable per corpus.
 *
 * `idPrefixSynonyms`: maps a synonymous id-prefix to its canonical prefix
 * (without the trailing underscore). e.g. `{ location: "place", org:
 * "organization" }` rewrites `location_british_museum` → `place_british_museum`.
 *
 * `typeSynonyms`: maps a (lowercased) type token to its canonical form. The
 * default also folds bare lowercase types to their Capitalized counterpart, so
 * `character`→`Character`. Entries here override the default Capitalize rule
 * (e.g. `place`→`Location`, `chapter`→`ChapterOrStory`).
 */
export interface SchemaHygieneConfig {
  idPrefixSynonyms?: Record<string, string>;
  typeSynonyms?: Record<string, string>;
}

/** Default id-prefix synonym map (canonical ← synonym). */
export const DEFAULT_ID_PREFIX_SYNONYMS: Record<string, string> = {
  location: "place",
  org: "organization",
};

/**
 * Default type synonym map. Keyed by the LOWERCASED type token. Only entries
 * whose canonical form is NOT the simple Capitalize need listing; bare
 * lowercase types (`character`→`Character`) are folded by the Capitalize rule.
 */
export const DEFAULT_TYPE_SYNONYMS: Record<string, string> = {
  place: "Location",
  chapter: "ChapterOrStory",
  story: "ChapterOrStory",
};

function capitalize(value: string): string {
  if (!value) return value;
  return value[0]!.toUpperCase() + value.slice(1);
}

/**
 * Canonical form of a node `type`. A type that already starts with an
 * uppercase letter is treated as canonical and returned unchanged (so
 * `ChapterOrStory`, `CrimeOrScheme` survive). A lowercase type is mapped
 * through the synonym map, falling back to a plain Capitalize.
 */
export function canonicalType(type: string | undefined, synonyms: Record<string, string>): string | undefined {
  if (typeof type !== "string" || type.length === 0) return type;
  // Already canonical (starts uppercase) — leave compound canonical types intact.
  if (type[0] === type[0]!.toUpperCase() && type[0] !== type[0]!.toLowerCase()) return type;
  const key = type.toLowerCase();
  if (synonyms[key]) return synonyms[key];
  return capitalize(type);
}

/**
 * Canonical id: rewrites a synonymous id-prefix to its canonical prefix.
 * `location_british_museum` → `place_british_museum`. Ids without a known
 * synonym prefix are returned unchanged.
 */
export function canonicalId(id: string, prefixSynonyms: Record<string, string>): string {
  const match = /^([a-z]+)_(.*)$/.exec(id);
  if (!match) return id;
  const [, prefix, rest] = match;
  const canonical = prefixSynonyms[prefix!];
  if (!canonical || canonical === prefix) return id;
  return `${canonical}_${rest}`;
}

function asCitations(value: unknown): OntologyCitation[] {
  return Array.isArray(value) ? (value as OntologyCitation[]) : [];
}

function unionStringArrays(a: unknown, b: unknown): string[] {
  const out = new Set<string>();
  for (const v of Array.isArray(a) ? a : []) if (typeof v === "string" && v) out.add(v);
  for (const v of Array.isArray(b) ? b : []) if (typeof v === "string" && v) out.add(v);
  return Array.from(out).sort((x, y) => x.localeCompare(y));
}

const UNION_STRING_ARRAY_FIELDS = ["aliases", "normalized_terms", "registry_refs", "evidence_refs"] as const;

/**
 * Merge `incoming` into `kept` when two nodes collapse onto one canonical id.
 * Citations + string-array fields are UNIONed (never dropped); scalar attrs are
 * filled only where `kept` is missing them (first-seen, deterministic by sorted
 * iteration order), so a non-empty value never silently loses to a later empty.
 */
function unionNodeInto(kept: GraphNode, incoming: GraphNode): void {
  // Citations: deduped union by identity (0.14.0 posture).
  const keptCites = asCitations(kept.citations);
  const incCites = asCitations(incoming.citations);
  if (keptCites.length > 0 || incCites.length > 0) {
    kept.citations = unionCitations([keptCites, incCites]);
  }
  // String-array fields: deduped union.
  for (const field of UNION_STRING_ARRAY_FIELDS) {
    const merged = unionStringArrays(kept[field], incoming[field]);
    if (merged.length > 0) (kept as Record<string, unknown>)[field] = merged;
  }
  // Scalar attrs: fill only where kept is missing (preserve first-seen non-empty).
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "id" || key === "citations" || (UNION_STRING_ARRAY_FIELDS as readonly string[]).includes(key)) continue;
    const current = (kept as Record<string, unknown>)[key];
    const currentEmpty = current === undefined || current === null || current === "";
    const incomingPresent = value !== undefined && value !== null && value !== "";
    if (currentEmpty && incomingPresent) (kept as Record<string, unknown>)[key] = value;
  }
}

/**
 * (A) Normalize id-prefixes + types, collapsing duplicate nodes via union.
 *
 * Deterministic + idempotent: re-running on the output is a no-op (canonical
 * ids/types are stable fixed points). Edges are rewritten through the same
 * id-remap; self-loops created by a collapse are dropped.
 */
export function normalizeSchemaHygiene(
  extraction: Extraction,
  config: SchemaHygieneConfig = {},
): Extraction {
  const prefixSynonyms = { ...DEFAULT_ID_PREFIX_SYNONYMS, ...(config.idPrefixSynonyms ?? {}) };
  const typeSynonyms = { ...DEFAULT_TYPE_SYNONYMS, ...(config.typeSynonyms ?? {}) };

  const nodes = extraction.nodes ?? [];
  // Process nodes in a stable id order so the first-seen winner of a collapse
  // is deterministic regardless of extraction order.
  const ordered = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const remap = new Map<string, string>();
  const canonicalById = new Map<string, GraphNode>();
  const result: GraphNode[] = [];

  for (const node of ordered) {
    const newId = canonicalId(String(node.id), prefixSynonyms);
    const newType = canonicalType(node.type as string | undefined, typeSynonyms);
    if (newId !== node.id) remap.set(String(node.id), newId);

    const existing = canonicalById.get(newId);
    if (!existing) {
      const normalized: GraphNode = { ...node, id: newId };
      if (newType !== undefined) (normalized as Record<string, unknown>).type = newType;
      canonicalById.set(newId, normalized);
      result.push(normalized);
      continue;
    }
    // Collapse: union the incoming node into the surviving canonical node.
    const incoming: GraphNode = { ...node, id: newId };
    if (newType !== undefined) (incoming as Record<string, unknown>).type = newType;
    unionNodeInto(existing, incoming);
  }

  // Stable output node order by canonical id so re-running is a byte-stable
  // fixed point (a collapse changes push-order vs. a second no-collapse pass).
  result.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  if (remap.size === 0) {
    // No id remap, but types may still have changed; result already carries
    // normalized types. Edges/hyperedges are untouched by id rewriting.
    return { ...extraction, nodes: result };
  }

  const resolve = (id: string): string => remap.get(id) ?? id;
  const seenEdge = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const edge of extraction.edges ?? []) {
    const source = resolve(String(edge.source));
    const target = resolve(String(edge.target));
    if (source === target) continue; // self-loop from collapse
    const key = `${source} ${target} ${edge.relation ?? ""}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ ...edge, source, target });
  }

  const hyperedges = (extraction.hyperedges ?? []).map((h) => ({
    ...h,
    nodes: h.nodes.map(resolve),
  }));

  return { ...extraction, nodes: result, edges, hyperedges };
}

// ---------------------------------------------------------------------------
// (B) Alias / normalized_terms derivation
// ---------------------------------------------------------------------------

/** Leading honorifics/titles stripped to derive a bare-name alias. */
export const DEFAULT_HONORIFICS = [
  "dr",
  "sir",
  "colonel",
  "col",
  "inspector",
  "mr",
  "mrs",
  "ms",
  "miss",
  "lord",
  "lady",
  "captain",
  "capt",
  "professor",
  "prof",
  "doctor",
  "madame",
  "madam",
  "monsieur",
  "the",
] as const;

export interface AliasDerivationConfig {
  honorifics?: readonly string[];
}

/** Lowercase a candidate term to its normalized form (trim + collapse spaces). */
function normalizeTermLocal(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

/**
 * Strip a single leading honorific (with optional trailing period) from a name.
 * Returns the stripped name, or null when nothing was stripped.
 */
function stripLeadingHonorific(name: string, honorifics: Set<string>): string | null {
  const match = /^([A-Za-zÀ-ÖØ-öø-ÿ]+)\.?\s+(.+)$/u.exec(name.trim());
  if (!match) return null;
  const [, head, rest] = match;
  if (!honorifics.has(head!.toLowerCase())) return null;
  return rest!.trim();
}

/** Strip trailing/embedded parentheticals: "Hugo Oberstein (spy)" → "Hugo Oberstein". */
function stripParenthetical(name: string): string | null {
  const stripped = name.replace(/\s*\([^)]*\)\s*/gu, " ").replace(/\s+/gu, " ").trim();
  if (stripped && stripped !== name.trim()) return stripped;
  return null;
}

/**
 * Derive alias + normalized-term candidates for a single label, CONSERVATIVELY.
 * Returns the surface aliases (original-cased variants) and normalized_terms
 * (lowercased). The label's own normalized form is always included as a
 * normalized term so the matcher has a baseline term to compare.
 */
export function deriveLabelTerms(
  label: string,
  config: AliasDerivationConfig = {},
): { aliases: string[]; normalizedTerms: string[] } {
  const honorifics = new Set((config.honorifics ?? DEFAULT_HONORIFICS).map((h) => h.toLowerCase()));
  const surfaces = new Set<string>();
  const base = String(label ?? "").trim();
  if (!base) return { aliases: [], normalizedTerms: [] };

  // Generate variants by applying strips in combination (conservative, finite).
  const queue: string[] = [base];
  const visited = new Set<string>([base]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const variant of [stripParenthetical(current), stripLeadingHonorific(current, honorifics)]) {
      if (variant && variant !== base && !visited.has(variant)) {
        visited.add(variant);
        surfaces.add(variant);
        queue.push(variant);
      }
    }
  }

  const aliases = Array.from(surfaces).sort((a, b) => a.localeCompare(b));
  const normalizedTerms = Array.from(new Set([base, ...surfaces].map(normalizeTermLocal)))
    .filter((t) => t.length > 0)
    .sort((a, b) => a.localeCompare(b));
  return { aliases, normalizedTerms };
}

/**
 * (B) Derive `aliases` + `normalized_terms` for every node with a label.
 * Idempotent: merges with (does not clobber) any pre-existing aliases/terms,
 * and re-running yields the same union. Conservative — no fuzzy stemming.
 */
export function deriveAliasesAndNormalizedTerms(
  extraction: Extraction,
  config: AliasDerivationConfig = {},
): Extraction {
  const nodes = (extraction.nodes ?? []).map((node) => {
    const label = typeof node.label === "string" ? node.label : "";
    if (!label) return node;
    const { aliases, normalizedTerms } = deriveLabelTerms(label, config);
    const mergedAliases = unionStringArrays(node.aliases, aliases);
    const mergedTerms = unionStringArrays(node.normalized_terms, normalizedTerms);
    const next: GraphNode = { ...node };
    if (mergedAliases.length > 0) next.aliases = mergedAliases;
    if (mergedTerms.length > 0) (next as Record<string, unknown>).normalized_terms = mergedTerms;
    return next;
  });
  return { ...extraction, nodes };
}

// ---------------------------------------------------------------------------
// (D) De-orphan — finest-container appears_in derivation
// ---------------------------------------------------------------------------

export interface DeOrphanConfig {
  /** Container node types, FINEST → coarsest. The first matching wins. */
  containerTypesFinestFirst?: string[];
  /** The coarsest fallback container type (the Work). */
  workType?: string;
  /**
   * When true (default), anchor resolution is component-aware: among the
   * GROUNDED anchors available to an orphan we prefer the one that lands it in
   * the largest reachable component (the giant), so de-orphaning grows the
   * connected component instead of spawning satellites.
   *
   * Set false to restore the legacy "strict finest container" behavior.
   */
  preferGiantComponent?: boolean;
  /**
   * When true (default, only effective with `preferGiantComponent`), an orphan
   * with NO container of its own may attach to a CO-PROVENANCE PEER: a node
   * that is already connected (degree ≥ 1) and shares the orphan's EXACT
   * `source_file`. Same-document co-occurrence is the grounding; attachments are
   * SPREAD over the top-ranked peers (see `maxAnchorFanOut`) so no single node
   * becomes a synthetic hub of degree-1 spokes.
   *
   * Set false to disable peer attachment entirely (containers only).
   */
  joinGiantViaHub?: boolean;
  /**
   * Hard cap on how many derived edges a single co-provenance anchor may
   * receive. Default: the √-rule — attachments for one source_file are spread
   * over `ceil(sqrt(orphanCount))` distinct peers, so the worst fan-out grows
   * like √n instead of n. A smaller explicit cap spreads further (bounded by the
   * number of grounded peers actually available).
   */
  maxAnchorFanOut?: number;
  /**
   * OFF by default and deliberately so. When true, an orphan that has NO
   * grounded anchor (no container, no co-provenance peer) is wired to the
   * global highest-degree node of the giant component. That edge asserts a
   * relationship the corpus does not support — it is pure invented structure,
   * and at corpus scale it collapses into one enormous hub-spoke star. Left
   * false, such orphans STAY ORPHANED and are reported as `unattachable`.
   */
  allowGlobalHubFallback?: boolean;
}

/** Default container ranking: chapter/scene/section first, Work last. */
export const DEFAULT_CONTAINER_TYPES_FINEST_FIRST = [
  "ChapterOrStory",
  "Scene",
  "Section",
] as const;
export const DEFAULT_WORK_TYPE = "Work";
const APPEARS_IN = "appears_in";
const RELATED_TO = "related_to";

function edgeEndpoint(value: unknown): string {
  if (value && typeof value === "object" && "id" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).id);
  }
  return String(value);
}

/** Derive the corpus path-slug of a source_file (the work directory stem). */
function slugOfSourceFile(sourceFile: string | undefined): string | null {
  if (!sourceFile) return null;
  const parts = String(sourceFile).split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2]! : null;
}

function nodeSourceFiles(node: GraphNode): Set<string> {
  const set = new Set<string>();
  if (typeof node.source_file === "string" && node.source_file) set.add(node.source_file);
  for (const c of asCitations(node.citations)) {
    if (typeof c.source_file === "string" && c.source_file) set.add(c.source_file);
  }
  return set;
}

export interface DeOrphanResult {
  extraction: Extraction;
  orphansBefore: number;
  orphansAfter: number;
  appearsInAdded: number;
  /** Orphans left unlinked (container-type orphans + ungrounded ones). */
  unresolved: number;
  /**
   * Orphans left orphaned ON PURPOSE: no container and no co-provenance peer
   * exists, so every possible edge would have been invented. Reported, never
   * papered over.
   */
  unattachable: number;
  /** Container-type orphans (a Work has no Work parent) — skipped by design. */
  containerOrphans: number;
  /** Count of derived edges per `derivation_method`. */
  byMethod: Record<string, number>;
  /** Largest number of derived edges landing on any single anchor node. */
  maxAnchorFanOut: number;
}

/**
 * Build an undirected adjacency map over the given nodes/edges (self-loops and
 * dangling endpoints ignored).
 */
function buildAdjacency(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(String(n.id), new Set<string>());
  for (const e of edges) {
    const s = edgeEndpoint(e.source);
    const t = edgeEndpoint(e.target);
    if (s === t) continue;
    const sa = adj.get(s);
    const ta = adj.get(t);
    if (sa && ta) {
      sa.add(t);
      ta.add(s);
    }
  }
  return adj;
}

interface ComponentIndex {
  /** component index per node id */
  of: Map<string, number>;
  /** size of each component, by index */
  size: number[];
  /** index of the largest component (giant); -1 when the graph has no nodes */
  giant: number;
}

/**
 * Label every node with its connected-component index and record component
 * sizes. Ids are visited in sorted order so component numbering — and the
 * giant tie-break (smallest member id wins on equal size) — is deterministic.
 */
function componentIndex(adj: Map<string, Set<string>>): ComponentIndex {
  const of = new Map<string, number>();
  const size: number[] = [];
  const ids = Array.from(adj.keys()).sort((a, b) => a.localeCompare(b));
  for (const start of ids) {
    if (of.has(start)) continue;
    const index = size.length;
    let count = 0;
    const stack = [start];
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (of.has(u)) continue;
      of.set(u, index);
      count += 1;
      for (const v of adj.get(u) ?? []) if (!of.has(v)) stack.push(v);
    }
    size.push(count);
  }
  let giant = -1;
  for (let i = 0; i < size.length; i += 1) {
    // Strictly greater keeps the earliest (smallest-min-id) component on ties.
    if (giant === -1 || size[i]! > size[giant]!) giant = i;
  }
  return { of, size, giant };
}

/**
 * Pick the highest-degree node id within `candidates`. Ties broken by smallest
 * id for determinism. Returns undefined when `candidates` is empty.
 */
function highestDegreeIn(
  candidates: Iterable<string>,
  adj: Map<string, Set<string>>,
): string | undefined {
  let bestId: string | undefined;
  let bestDeg = -1;
  for (const id of candidates) {
    const deg = adj.get(id)?.size ?? 0;
    if (deg > bestDeg || (deg === bestDeg && bestId !== undefined && id < bestId)) {
      bestDeg = deg;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * (D) Link each degree-0 entity node into the graph — but ONLY through an edge
 * the corpus actually supports.
 *
 * TWO grounds are admitted, and nothing else:
 *   - CONTAINMENT — a container node (chapter → scene → section → Work) whose
 *     provenance (`source_file`, else path slug) matches the orphan's. Emitted
 *     as `appears_in`.
 *   - CO-PROVENANCE — an already-connected node sharing the orphan's EXACT
 *     `source_file` (same document). Emitted as `related_to`.
 *
 * Among grounded anchors we prefer the one that lands the orphan in the giant
 * component, so de-orphaning GROWS the connected component:
 *   1. container in the giant   (`deorphan:giant-component`)
 *   2. co-provenance peer in the giant (`deorphan:co-provenance-peer`)
 *   3. container outside the giant (`deorphan:container-offgiant`) — real
 *      containment is still true even when the whole work sits apart
 *   4. co-provenance peer outside the giant (`deorphan:co-provenance-peer`)
 *   5. NOTHING — the orphan stays orphaned and is counted in `unattachable`
 *
 * Anti-star: co-provenance attachments for one source_file are SPREAD over the
 * top-ranked peers (√-rule, or `maxAnchorFanOut`), ranked by component size then
 * degree then id. Every peer of that document is an equally valid ground, so
 * funnelling them all onto the single densest node would manufacture a hub-spoke
 * star that says more about the algorithm than about the corpus. Containment is
 * NOT spread: a chapter really does contain all its entities.
 *
 * The path this replaces — "attach to the global highest-degree node of the
 * giant" — is available only behind `allowGlobalHubFallback: true`, because on a
 * real corpus it wires every otherwise-unattachable orphan to one node (measured
 * on PROCESS_STD: 19 542 invented edges onto a single anchor).
 *
 * Deterministic (orphans processed in sorted id order, added edges sorted),
 * O(n log n), no LLM, idempotent: re-running on its own output adds nothing.
 */
export function deOrphanByContainer(
  extraction: Extraction,
  config: DeOrphanConfig = {},
): DeOrphanResult {
  const containerTypes = config.containerTypesFinestFirst ?? [...DEFAULT_CONTAINER_TYPES_FINEST_FIRST];
  const workType = config.workType ?? DEFAULT_WORK_TYPE;
  const nodes = extraction.nodes ?? [];
  const edges = extraction.edges ?? [];

  const degree = new Map<string, number>(nodes.map((n) => [String(n.id), 0]));
  const existingPair = new Set<string>();
  for (const e of edges) {
    const s = edgeEndpoint(e.source);
    const t = edgeEndpoint(e.target);
    if (degree.has(s)) degree.set(s, degree.get(s)! + 1);
    if (degree.has(t)) degree.set(t, degree.get(t)! + 1);
    existingPair.add(`${s} ${t}`);
  }

  // Build container indices by source_file and by slug, per container rank.
  // rankOf: finest container types get the lowest rank number; Work is last.
  const rankOf = new Map<string, number>();
  containerTypes.forEach((t, i) => rankOf.set(t, i));
  rankOf.set(workType, containerTypes.length);

  // For each (rank) maintain source_file→id and slug→id (first-seen by id order).
  const byRankSource: Array<Map<string, string>> = [];
  const byRankSlug: Array<Map<string, string>> = [];
  for (let i = 0; i <= containerTypes.length; i += 1) {
    byRankSource.push(new Map());
    byRankSlug.push(new Map());
  }
  const orderedNodes = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const n of orderedNodes) {
    const rank = rankOf.get(String(n.type));
    if (rank === undefined) continue;
    const srcMap = byRankSource[rank]!;
    const slugMap = byRankSlug[rank]!;
    if (typeof n.source_file === "string" && n.source_file && !srcMap.has(n.source_file)) {
      srcMap.set(n.source_file, String(n.id));
    }
    // id-slug: container ids look like "chapter_<work-slug>_chN" or
    // "work_<slug>" — index by the source_file slug AND the id-derived slug.
    const sfSlug = slugOfSourceFile(typeof n.source_file === "string" ? n.source_file : undefined);
    if (sfSlug && !slugMap.has(sfSlug)) slugMap.set(sfSlug, String(n.id));
    const idSlug = String(n.id).replace(/^[a-z]+[_-]/, "");
    if (idSlug && !slugMap.has(idSlug)) slugMap.set(idSlug, String(n.id));
  }

  const containerTypeSet = new Set([...containerTypes, workType]);
  const workRank = containerTypes.length;
  // Orphans in sorted id order → the whole pass is input-order independent.
  const orphans = orderedNodes.filter((n) => (degree.get(String(n.id)) ?? 0) === 0);

  const preferGiant = config.preferGiantComponent ?? true;
  const adjacency = preferGiant ? buildAdjacency(nodes, edges) : new Map<string, Set<string>>();
  const comps: ComponentIndex = preferGiant
    ? componentIndex(adjacency)
    : { of: new Map(), size: [], giant: -1 };
  const usePeers = (config.joinGiantViaHub ?? true) && preferGiant;

  // CO-PROVENANCE index: already-connected nodes keyed by their EXACT
  // source_file. Slug (same folder) is NOT admitted here — "same directory" is
  // not evidence that two entities are related; only "same document" is. Peers
  // are ranked once: component size ↓, degree ↓, id ↑.
  const peersBySource = new Map<string, string[]>();
  if (usePeers) {
    for (const n of orderedNodes) {
      const id = String(n.id);
      if ((degree.get(id) ?? 0) === 0) continue; // orphans cannot anchor orphans
      for (const sf of nodeSourceFiles(n)) {
        let bucket = peersBySource.get(sf);
        if (!bucket) {
          bucket = [];
          peersBySource.set(sf, bucket);
        }
        bucket.push(id);
      }
    }
    const rank = (id: string): number => comps.size[comps.of.get(id) ?? -1] ?? 0;
    for (const bucket of peersBySource.values()) {
      bucket.sort((a, b) => {
        const cs = rank(b) - rank(a);
        if (cs !== 0) return cs;
        const dd = (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0);
        if (dd !== 0) return dd;
        return a.localeCompare(b);
      });
    }
  }

  const globalGiantHub =
    config.allowGlobalHubFallback === true && preferGiant && comps.giant >= 0
      ? highestDegreeIn(
          orderedNodes.map((n) => String(n.id)).filter((id) => comps.of.get(id) === comps.giant),
          adjacency,
        )
      : undefined;

  interface Decision {
    orphan: string;
    anchor: string;
    relation: string;
    method: string;
  }
  const decisions: Decision[] = [];
  /** Orphans deferred to the spread pass, grouped by their chosen source_file. */
  const peerGroups = new Map<string, string[]>();
  let containerOrphans = 0;
  let unattachable = 0;

  for (const orphan of orphans) {
    const orphanId = String(orphan.id);
    // A container node that is itself an orphan has no parent of its own kind
    // to link into (a Work has no Work parent). Leave it as-is.
    if (containerTypeSet.has(String(orphan.type))) {
      containerOrphans += 1;
      continue;
    }
    const sources = nodeSourceFiles(orphan);

    // --- containment candidates (finest → coarsest) ---
    let finestId: string | undefined; // strict finest container (legacy choice)
    let giantContainerId: string | undefined; // finest container inside the giant
    for (let rank = 0; rank <= containerTypes.length; rank += 1) {
      let hit: string | undefined;
      for (const sf of sources) {
        const candidate = byRankSource[rank]!.get(sf) ?? byRankSlug[rank]!.get(slugOfSourceFile(sf) ?? "");
        if (candidate && candidate !== orphanId) {
          hit = candidate;
          break;
        }
      }
      if (!hit) continue;
      if (finestId === undefined) finestId = hit;
      if (preferGiant && giantContainerId === undefined && comps.of.get(hit) === comps.giant) {
        giantContainerId = hit;
      }
    }

    if (!preferGiant) {
      if (finestId !== undefined) {
        decisions.push({ orphan: orphanId, anchor: finestId, relation: APPEARS_IN, method: "deorphan:finest-container" });
      } else {
        unattachable += 1;
      }
      continue;
    }

    // --- co-provenance candidate: best peer over the orphan's source_files ---
    let peerSource: string | undefined;
    let peerTop: string | undefined;
    if (usePeers) {
      for (const sf of [...sources].sort((a, b) => a.localeCompare(b))) {
        const bucket = peersBySource.get(sf);
        const top = bucket?.[0];
        if (!top || top === orphanId) continue;
        if (peerTop === undefined) {
          peerSource = sf;
          peerTop = top;
          continue;
        }
        const better =
          (comps.size[comps.of.get(top) ?? -1] ?? 0) > (comps.size[comps.of.get(peerTop) ?? -1] ?? 0);
        if (better) {
          peerSource = sf;
          peerTop = top;
        }
      }
    }
    const peerInGiant = peerTop !== undefined && comps.of.get(peerTop) === comps.giant;

    if (giantContainerId !== undefined) {
      decisions.push({ orphan: orphanId, anchor: giantContainerId, relation: APPEARS_IN, method: "deorphan:giant-component" });
    } else if (peerInGiant && peerSource !== undefined) {
      const group = peerGroups.get(peerSource) ?? [];
      group.push(orphanId);
      peerGroups.set(peerSource, group);
    } else if (finestId !== undefined) {
      decisions.push({ orphan: orphanId, anchor: finestId, relation: APPEARS_IN, method: "deorphan:container-offgiant" });
    } else if (peerSource !== undefined) {
      const group = peerGroups.get(peerSource) ?? [];
      group.push(orphanId);
      peerGroups.set(peerSource, group);
    } else if (globalGiantHub !== undefined && globalGiantHub !== orphanId) {
      decisions.push({ orphan: orphanId, anchor: globalGiantHub, relation: RELATED_TO, method: "deorphan:giant-hub-global" });
    } else {
      // No container, no co-provenance peer. Any edge here would be invented.
      unattachable += 1;
    }
  }

  // --- spread pass: co-provenance attachments fan out over the top peers ------
  for (const source of [...peerGroups.keys()].sort((a, b) => a.localeCompare(b))) {
    const group = peerGroups.get(source)!;
    const groupSet = new Set(group);
    const candidates = (peersBySource.get(source) ?? []).filter((id) => !groupSet.has(id));
    if (candidates.length === 0) {
      unattachable += group.length;
      continue;
    }
    // √-rule: spreading over ceil(√count) anchors bounds the worst fan-out at
    // ~√count instead of count. An explicit cap can only widen the spread.
    let width = Math.max(1, Math.ceil(Math.sqrt(group.length)));
    if (config.maxAnchorFanOut !== undefined && config.maxAnchorFanOut > 0) {
      width = Math.max(width, Math.ceil(group.length / config.maxAnchorFanOut));
    }
    width = Math.min(width, candidates.length);
    for (let i = 0; i < group.length; i += 1) {
      decisions.push({
        orphan: group[i]!,
        anchor: candidates[i % width]!,
        relation: RELATED_TO,
        method: "deorphan:co-provenance-peer",
      });
    }
  }

  // --- emit, in a stable (orphan, anchor) order ------------------------------
  decisions.sort((a, b) => a.orphan.localeCompare(b.orphan) || a.anchor.localeCompare(b.anchor));
  const added: GraphEdge[] = [];
  const byMethod: Record<string, number> = {};
  const fanOut = new Map<string, number>();
  const orphanById = new Map<string, GraphNode>(orphans.map((n) => [String(n.id), n]));
  for (const d of decisions) {
    const key = `${d.orphan} ${d.anchor}`;
    if (existingPair.has(key)) continue;
    existingPair.add(key);
    const orphan = orphanById.get(d.orphan);
    added.push({
      source: d.orphan,
      target: d.anchor,
      relation: d.relation,
      confidence: "INFERRED",
      source_file: typeof orphan?.source_file === "string" ? orphan.source_file : "",
      derived: true,
      derivation_method: d.method,
    } as GraphEdge);
    byMethod[d.method] = (byMethod[d.method] ?? 0) + 1;
    fanOut.set(d.anchor, (fanOut.get(d.anchor) ?? 0) + 1);
  }

  const nextExtraction: Extraction = { ...extraction, edges: [...edges, ...added] };

  // Recompute orphans after.
  const degreeAfter = new Map<string, number>(nodes.map((n) => [String(n.id), 0]));
  for (const e of nextExtraction.edges) {
    const s = edgeEndpoint(e.source);
    const t = edgeEndpoint(e.target);
    if (degreeAfter.has(s)) degreeAfter.set(s, degreeAfter.get(s)! + 1);
    if (degreeAfter.has(t)) degreeAfter.set(t, degreeAfter.get(t)! + 1);
  }
  const orphansAfter = nodes.filter((n) => (degreeAfter.get(String(n.id)) ?? 0) === 0).length;
  let maxAnchorFanOut = 0;
  for (const v of fanOut.values()) if (v > maxAnchorFanOut) maxAnchorFanOut = v;

  return {
    extraction: nextExtraction,
    orphansBefore: orphans.length,
    orphansAfter,
    appearsInAdded: added.length,
    unresolved: containerOrphans + unattachable,
    unattachable,
    containerOrphans,
    byMethod,
    maxAnchorFanOut,
  };
}

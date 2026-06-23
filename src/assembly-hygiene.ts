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
 *   (D) `deOrphanByContainer` — link every degree-0 entity node to its FINEST
 *       available container (ChapterOrStory/Scene/Section matching provenance,
 *       else the Work) via a derived `appears_in` edge. Idempotent: respects
 *       pre-existing `appears_in`, never double-adds. Finest-container (not
 *       straight-to-Work) keeps Work hubs from outranking real protagonists.
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
   * When true (default), an orphan is linked to the finest container that is
   * ITSELF in the giant connected component. If every finer container sharing
   * the orphan's provenance is isolated (would create a 2-node island or
   * amplify a poorly-connected satellite), fall back to a coarser container
   * that IS in the giant component (typically the Work). This guarantees a
   * de-orphaned node joins the giant component and never forms an island.
   *
   * Set false to restore the legacy "strict finest container" behavior.
   */
  preferGiantComponent?: boolean;
  /**
   * When true (default, only effective with `preferGiantComponent`), if NO
   * container sharing the orphan's provenance is in the giant component — i.e.
   * the orphan's Work is itself isolated — the orphan is anchored to a
   * HIGH-DEGREE node OF THE GIANT COMPONENT instead of to its isolated Work.
   * This is what keeps the giant-mode promise absolute: an orphan always lands
   * in the giant component, attached THROUGH a densely-connected, semantically-
   * relevant node, and we never emit a disconnected 2-node island nor an
   * isolated synthetic Work star (the old `work-fallback` failure mode).
   *
   * The anchor is chosen as: (1) the highest-degree giant-component node that
   * shares the orphan's provenance (a real, same-work hub), else (2) the
   * highest-degree giant-component node overall (the global hub). Ties broken
   * by smallest id for determinism. Set false to keep the legacy isolated-Work
   * `work-fallback` (which can leave disconnected stars/islands).
   */
  joinGiantViaHub?: boolean;
}

/** Default container ranking: chapter/scene/section first, Work last. */
export const DEFAULT_CONTAINER_TYPES_FINEST_FIRST = [
  "ChapterOrStory",
  "Scene",
  "Section",
] as const;
export const DEFAULT_WORK_TYPE = "Work";
const APPEARS_IN = "appears_in";

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
  unresolved: number;
}

/**
 * Build an undirected adjacency map over the given nodes/edges (self-loops and
 * dangling endpoints ignored). Used to identify the giant connected component
 * so de-orphan can link into it rather than into an isolated island.
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

/**
 * Return the set of node ids belonging to the giant (largest) connected
 * component of `adj`. Ties broken by the smallest member id for determinism.
 * An empty graph yields an empty set.
 */
function giantComponent(adj: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  let best: Set<string> = new Set();
  let bestKey = "";
  // Iterate ids in sorted order so component discovery is deterministic.
  const ids = Array.from(adj.keys()).sort((a, b) => a.localeCompare(b));
  for (const start of ids) {
    if (seen.has(start)) continue;
    const comp = new Set<string>();
    const stack = [start];
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (comp.has(u)) continue;
      comp.add(u);
      seen.add(u);
      for (const v of adj.get(u) ?? []) if (!comp.has(v)) stack.push(v);
    }
    // Deterministic tiebreak: prefer the larger component; on equal size prefer
    // the one whose smallest member id sorts first.
    const minId = comp.size > 0 ? Array.from(comp).sort((a, b) => a.localeCompare(b))[0]! : "";
    if (comp.size > best.size || (comp.size === best.size && minId < bestKey)) {
      best = comp;
      bestKey = minId;
    }
  }
  return best;
}

/**
 * Pick the highest-degree node id within `candidates` (a subset of `giant`),
 * using the giant-component degree from `adj`. Ties broken by smallest id for
 * determinism. Returns undefined when `candidates` is empty. This is the
 * "high-degree, semantically-relevant" anchor an orphan attaches to so it joins
 * the giant component THROUGH a real hub instead of forming an isolated star.
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
 * (D) Link each degree-0 entity node into the graph via a derived edge,
 * steering the orphan INTO the giant connected component so it NEVER forms a
 * 2-node island nor an isolated synthetic star. Anchor resolution, per orphan
 * (giant mode, default):
 *   1. the FINEST container (chapter→scene→section, then Work) sharing the
 *      orphan's source_file / slug that is ITSELF in the giant component
 *      (`appears_in`, method `deorphan:giant-component`);
 *   2. else — the orphan's whole Work is isolated — attach to a HIGH-DEGREE
 *      node OF THE GIANT COMPONENT instead of to that isolated Work: the densest
 *      giant member sharing the orphan's provenance (`related_to`, method
 *      `deorphan:giant-hub-provenance`), else the global giant hub (method
 *      `deorphan:giant-hub-global`). This is the absolute-join guarantee: an
 *      orphan always lands in the giant THROUGH a real, dense, semantically-
 *      relevant node — no disconnected stars, no islands.
 *   3. else (NO giant component at all — empty/edgeless graph) fall back to the
 *      Work, then the strict finest container, as a best-effort.
 * Exactly one anchor is chosen per orphan, so no redundant entity→Work edge is
 * added when a finer container already carries the orphan toward the Work.
 * Set `preferGiantComponent: false` for the legacy strict-finest behavior;
 * `joinGiantViaHub: false` to keep the old isolated-Work fallback (stars/islands).
 * Idempotent: skips nodes that already have any edge, never duplicates an anchor
 * pair it (or a prior run) already created.
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
  const containerOrdered = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const n of containerOrdered) {
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
  const orphans = nodes.filter((n) => (degree.get(String(n.id)) ?? 0) === 0);
  const added: GraphEdge[] = [];
  let unresolved = 0;

  // Giant connected component over the EXISTING edges. Used to steer orphans
  // into the giant component instead of into an isolated finest-container
  // (which would otherwise create a 2-node island or amplify a poor satellite).
  const preferGiant = config.preferGiantComponent ?? true;
  const adjacency = preferGiant ? buildAdjacency(nodes, edges) : new Map<string, Set<string>>();
  const giant = preferGiant ? giantComponent(adjacency) : new Set<string>();
  const joinViaHub = (config.joinGiantViaHub ?? true) && preferGiant && giant.size > 0;

  // Index giant-component members by provenance so an orphan whose Work is
  // ISOLATED can still attach to a high-degree node that is genuinely related
  // (same source_file / slug) AND inside the giant — rather than to its own
  // isolated Work (which would spawn a disconnected star). Built once, lazily.
  const giantBySource = new Map<string, Set<string>>();
  const giantBySlug = new Map<string, Set<string>>();
  if (joinViaHub) {
    const byId = new Map<string, GraphNode>(nodes.map((n) => [String(n.id), n]));
    for (const id of giant) {
      const n = byId.get(id);
      if (!n) continue;
      for (const sf of nodeSourceFiles(n)) {
        if (!giantBySource.has(sf)) giantBySource.set(sf, new Set());
        giantBySource.get(sf)!.add(id);
        const slug = slugOfSourceFile(sf);
        if (slug) {
          if (!giantBySlug.has(slug)) giantBySlug.set(slug, new Set());
          giantBySlug.get(slug)!.add(id);
        }
      }
    }
  }
  // The global highest-degree node of the giant component — the universal hub
  // an orphan attaches to when nothing in the giant shares its provenance. This
  // guarantees the orphan ALWAYS lands in the giant via a real, dense node.
  const globalGiantHub = joinViaHub ? highestDegreeIn(giant, adjacency) : undefined;

  for (const orphan of orphans) {
    // A container node that is itself an orphan has no parent of its own kind
    // to link into (a Work has no Work parent). Leave it as-is.
    if (containerTypeSet.has(String(orphan.type))) {
      unresolved += 1;
      continue;
    }
    const sources = nodeSourceFiles(orphan);
    let linked = false;
    // Resolve candidate containers per rank (finest→coarsest), recording the
    // finest hit AND the finest hit that is itself in the giant component.
    let finestId: string | undefined; // strict finest container (legacy choice)
    let giantId: string | undefined; // finest container that is in the giant component
    let workId: string | undefined; // the Work container (rank === workRank), if any
    for (let rank = 0; rank <= containerTypes.length; rank += 1) {
      let hit: string | undefined;
      for (const sf of sources) {
        const candidate = byRankSource[rank]!.get(sf) ?? byRankSlug[rank]!.get(slugOfSourceFile(sf) ?? "");
        if (candidate && candidate !== String(orphan.id)) {
          hit = candidate;
          break;
        }
      }
      if (!hit) continue;
      if (finestId === undefined) finestId = hit;
      if (rank === workRank) workId = hit;
      if (preferGiant && giantId === undefined && giant.has(hit)) giantId = hit;
    }
    // Selection — exactly ONE anchor per orphan (no redundant entity→Work edge:
    // when a finer container is chosen the orphan already reaches the Work
    // through it, so we never additionally wire the Work):
    //   - giant mode: prefer the finest container that is IN the giant
    //     component; if none of the orphan's provenance containers is in the
    //     giant (its whole Work is isolated), DO NOT anchor to that isolated
    //     Work — that would spawn a disconnected 2-node island / synthetic star
    //     that never joins the giant. Instead attach to a HIGH-DEGREE giant
    //     node: the densest giant member sharing the orphan's provenance, else
    //     the global giant hub. Only when there is no giant at all (empty graph)
    //     do we fall back to the Work / strict finest container.
    //   - legacy mode: take the strict finest container.
    let containerId: string | undefined;
    let method = "deorphan:finest-container";
    let relation = APPEARS_IN;
    if (!preferGiant) {
      containerId = finestId;
    } else if (giantId !== undefined) {
      containerId = giantId;
      method = "deorphan:giant-component";
    } else if (joinViaHub) {
      // No provenance container is in the giant → join the giant THROUGH a
      // high-degree node. Prefer a same-provenance giant hub (semantically
      // related, same work), then the global giant hub (always connects).
      const provenanceGiant = new Set<string>();
      for (const sf of sources) {
        for (const id of giantBySource.get(sf) ?? []) provenanceGiant.add(id);
        const slug = slugOfSourceFile(sf);
        if (slug) for (const id of giantBySlug.get(slug) ?? []) provenanceGiant.add(id);
      }
      provenanceGiant.delete(String(orphan.id));
      const provenanceHub = highestDegreeIn(provenanceGiant, adjacency);
      if (provenanceHub !== undefined) {
        containerId = provenanceHub;
        method = "deorphan:giant-hub-provenance";
        relation = "related_to";
      } else if (globalGiantHub !== undefined && globalGiantHub !== String(orphan.id)) {
        containerId = globalGiantHub;
        method = "deorphan:giant-hub-global";
        relation = "related_to";
      } else if (workId !== undefined) {
        containerId = workId;
        method = "deorphan:work-fallback";
      } else {
        containerId = finestId;
      }
    } else if (workId !== undefined) {
      containerId = workId;
      method = "deorphan:work-fallback";
    } else {
      containerId = finestId;
    }
    if (containerId) {
      const key = `${String(orphan.id)} ${containerId}`;
      if (!existingPair.has(key)) {
        existingPair.add(key);
        added.push({
          source: String(orphan.id),
          target: containerId,
          relation,
          confidence: "INFERRED",
          source_file: typeof orphan.source_file === "string" ? orphan.source_file : "",
          derived: true,
          derivation_method: method,
        } as GraphEdge);
      }
      linked = true;
    }
    if (!linked) unresolved += 1;
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

  return {
    extraction: nextExtraction,
    orphansBefore: orphans.length,
    orphansAfter,
    appearsInAdded: added.length,
    unresolved,
  };
}

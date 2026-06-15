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
 *   (D) `deOrphanByContainer` — link every entity that is NOT in the giant
 *       connected component (degree-0 orphans AND members of tiny disconnected
 *       islands) to a container that is ITSELF in the giant component, via a
 *       derived `appears_in` edge: prefer the finest in-giant container
 *       (ChapterOrStory/Scene/Section matching provenance), falling back to the
 *       in-giant Work. Guarantees orphans JOIN the giant — never a 2-node island
 *       (TRACKED #3). Idempotent: respects pre-existing `appears_in`, never
 *       double-adds, never adds a redundant entity→Work edge for an entity that
 *       already reaches the work via a chapter (so it does not inflate stars).
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
// (D) De-orphan — giant-component appears_in derivation
// ---------------------------------------------------------------------------

export interface DeOrphanConfig {
  /** Container node types, FINEST → coarsest. The first matching wins. */
  containerTypesFinestFirst?: string[];
  /** The coarsest fallback container type (the Work). */
  workType?: string;
  /**
   * Giant-component join (default ON). When true, the de-orphan target set is
   * every entity NOT in the giant connected component (degree-0 orphans AND
   * members of tiny disconnected islands), and a container is chosen ONLY if it
   * is itself in the giant component — preferring the finest in-giant container,
   * falling back to the in-giant Work. This guarantees the orphan JOINS the
   * giant component and never forms (or sustains) a 2-node island.
   *
   * When false, the legacy degree-0-only behavior is used (every orphan linked
   * to its finest provenance-sharing container, even if that container is itself
   * isolated). Retained for backward-compat / explicit opt-out.
   */
  joinGiantComponent?: boolean;
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
 * Compute undirected connected components over the node id set. Returns a map
 * id→componentId and the id of the giant (largest) component. Ties on size are
 * broken by the smallest member id, so the giant is a deterministic fixed point.
 */
function connectedComponents(
  nodeIds: string[],
  edges: readonly GraphEdge[],
): { componentOf: Map<string, number>; giantComponent: number; giantSize: number } {
  const adjacency = new Map<string, Set<string>>();
  const idSet = new Set(nodeIds);
  for (const id of nodeIds) adjacency.set(id, new Set());
  for (const e of edges) {
    const s = edgeEndpoint(e.source);
    const t = edgeEndpoint(e.target);
    if (!idSet.has(s) || !idSet.has(t) || s === t) continue;
    adjacency.get(s)!.add(t);
    adjacency.get(t)!.add(s);
  }
  const componentOf = new Map<string, number>();
  const componentSize = new Map<number, number>();
  const componentMinId = new Map<number, string>();
  let nextId = 0;
  // Iterate in sorted id order so component numbering is deterministic.
  for (const id of [...nodeIds].sort((a, b) => a.localeCompare(b))) {
    if (componentOf.has(id)) continue;
    const cid = nextId++;
    let size = 0;
    let minId = id;
    const stack = [id];
    componentOf.set(id, cid);
    while (stack.length) {
      const u = stack.pop()!;
      size += 1;
      if (u.localeCompare(minId) < 0) minId = u;
      for (const v of adjacency.get(u)!) {
        if (!componentOf.has(v)) {
          componentOf.set(v, cid);
          stack.push(v);
        }
      }
    }
    componentSize.set(cid, size);
    componentMinId.set(cid, minId);
  }
  let giantComponent = -1;
  let bestSize = -1;
  let bestMin = "";
  for (const [cid, size] of componentSize) {
    const minId = componentMinId.get(cid)!;
    if (size > bestSize || (size === bestSize && minId.localeCompare(bestMin) < 0)) {
      giantComponent = cid;
      bestSize = size;
      bestMin = minId;
    }
  }
  return { componentOf, giantComponent, giantSize: Math.max(bestSize, 0) };
}

/**
 * (D) Link each entity that is NOT in the giant connected component to a
 * container that is ITSELF in the giant component, via a derived `appears_in`
 * edge — so the orphan JOINS the giant rather than forming a 2-node island.
 *
 * Container resolution, per orphan (`joinGiantComponent`, default ON):
 *   1. the FINEST container (chapter/scene/section first) sharing the orphan's
 *      source_file / slug AND already in the giant component;
 *   2. else the in-giant Work sharing the source_file / slug.
 * A provenance-sharing container that is itself isolated is REJECTED (it would
 * merely extend the island), so no new 2-node island is ever created. Because
 * only nodes outside the giant are targeted, an entity that already reaches its
 * Work via a chapter is left untouched (no redundant entity→Work edge, no star
 * inflation).
 *
 * Idempotent: skips nodes already in the giant, never duplicates an
 * `appears_in` pair it (or a prior run) created. With `joinGiantComponent:
 * false`, the legacy degree-0-only behavior is used.
 */
export function deOrphanByContainer(
  extraction: Extraction,
  config: DeOrphanConfig = {},
): DeOrphanResult {
  const containerTypes = config.containerTypesFinestFirst ?? [...DEFAULT_CONTAINER_TYPES_FINEST_FIRST];
  const workType = config.workType ?? DEFAULT_WORK_TYPE;
  const joinGiant = config.joinGiantComponent ?? true;
  const nodes = extraction.nodes ?? [];
  const edges = extraction.edges ?? [];
  const nodeIds = nodes.map((n) => String(n.id));

  const degree = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  const existingPair = new Set<string>();
  for (const e of edges) {
    const s = edgeEndpoint(e.source);
    const t = edgeEndpoint(e.target);
    if (degree.has(s)) degree.set(s, degree.get(s)! + 1);
    if (degree.has(t)) degree.set(t, degree.get(t)! + 1);
    existingPair.add(`${s} ${t}`);
  }

  // Component membership (only computed for the giant-join path). `inGiant`
  // reports whether a node currently belongs to the giant connected component.
  // A "giant" must have at least one edge (size ≥ 2): if every component is a
  // singleton (a fresh, edge-less extraction), there is no giant to be inside,
  // so every entity is treated as an orphan and linked to its Work anchor.
  let giantComponent = -1;
  let giantSize = 0;
  let componentOf = new Map<string, number>();
  if (joinGiant) {
    ({ componentOf, giantComponent, giantSize } = connectedComponents(nodeIds, edges));
  }
  const hasGiant = joinGiant && giantSize >= 2;
  const inGiant = (id: string): boolean =>
    !joinGiant || (hasGiant && componentOf.get(id) === giantComponent);

  // Build container indices by source_file and by slug, per container rank.
  // rankOf: finest container types get the lowest rank number; Work is last.
  // In the giant-join path, finer-container indices hold ONLY in-giant
  // containers (an isolated chapter is never offered → no 2-node island); the
  // Work index is unconditional (the root anchor that builds the giant).
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
  const workRank = containerTypes.length;
  const containerOrdered = [...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  for (const n of containerOrdered) {
    const rank = rankOf.get(String(n.type));
    if (rank === undefined) continue;
    // In the giant-join path, only index FINER containers (chapter/scene/…) that
    // are in the giant — an isolated finer container must never be offered as a
    // link target (that is exactly what makes a 2-node island). The Work is the
    // root anchor ("necessarily linked to many") and is always a valid target:
    // linking entities to it is what BUILDS the giant around it, so it is indexed
    // unconditionally even when it currently has no edges of its own.
    if (joinGiant && rank !== workRank && !inGiant(String(n.id))) continue;
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
  // Targets: entities to de-orphan. Giant-join path → every node NOT in the
  // giant component (degree-0 orphans AND members of tiny islands). Legacy path
  // → degree-0 nodes only.
  const orphans = nodes.filter((n) =>
    joinGiant ? !inGiant(String(n.id)) : (degree.get(String(n.id)) ?? 0) === 0,
  );
  const added: GraphEdge[] = [];
  let unresolved = 0;

  for (const orphan of orphans) {
    // A container node that is itself out-of-giant has no parent of its own kind
    // to link into (a Work has no Work parent). Leave it as-is.
    if (containerTypeSet.has(String(orphan.type))) {
      unresolved += 1;
      continue;
    }
    const sources = nodeSourceFiles(orphan);
    let linked = false;
    // Resolve the FINEST container across all of the orphan's source files:
    // sweep ranks finest→coarsest, take the first hit. In the giant-join path
    // the indices already exclude isolated containers, so any hit is in-giant.
    let containerId: string | undefined;
    for (let rank = 0; rank <= containerTypes.length && !containerId; rank += 1) {
      for (const sf of sources) {
        const hit = byRankSource[rank]!.get(sf) ?? byRankSlug[rank]!.get(slugOfSourceFile(sf) ?? "");
        if (hit && hit !== String(orphan.id)) {
          containerId = hit;
          break;
        }
      }
    }
    if (containerId) {
      const key = `${String(orphan.id)} ${containerId}`;
      if (!existingPair.has(key)) {
        existingPair.add(key);
        added.push({
          source: String(orphan.id),
          target: containerId,
          relation: APPEARS_IN,
          confidence: "INFERRED",
          source_file: typeof orphan.source_file === "string" ? orphan.source_file : "",
          derived: true,
          derivation_method: "deorphan:giant-component",
        } as GraphEdge);
      }
      linked = true;
    }
    if (!linked) unresolved += 1;
  }

  const nextExtraction: Extraction = { ...extraction, edges: [...edges, ...added] };

  // Recompute orphans after.
  const degreeAfter = new Map<string, number>(nodeIds.map((id) => [id, 0]));
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

/**
 * Track G G6-2 (S1.4) — FACETS panel discovery.
 *
 * Profile-neutral. The default behaviour is to scan the dataset for
 * fields that look like enumerated filters (low-cardinality string
 * fields). The caller MAY override the list via `declaredFacets` —
 * typically populated from `outputs.workspace.facets` in a profile
 * YAML.
 *
 * Hard constraint: no corpus-specific key is hardcoded here. The
 * DENYLIST below blocks the few process-std-am-specific names that must never
 * leak into Graphify core, but it is the user's responsibility to keep
 * their own profile YAML clean.
 */

/** Free-form record. We only inspect string-valued top-level fields. */
export interface WorkspaceFacetRecord {
  id?: string;
  [extra: string]: unknown;
}

export interface WorkspaceFacetValue {
  /** Slice value (`"all"` is always first). */
  value: string;
  /** Number of records matching `<facet.key> = value`. */
  count: number;
}

export interface WorkspaceFacet {
  /** Facet key (the same name we expect in `WorkspaceViewerState.facetState`). */
  key: string;
  /** Sorted slice values (descending count, with `"all"` first). */
  values: WorkspaceFacetValue[];
}

export interface DiscoverFacetsOptions {
  /**
   * Explicit profile-declared facet keys. When provided we limit the
   * discovery to those keys (preserving the order). Missing fields are
   * silently dropped — no error.
   */
  declaredFacets?: readonly string[];
  /**
   * Upper bound on the cardinality of an auto-discovered facet. Defaults
   * to 12. Above this threshold a field is rejected (it is probably a
   * free-text column rather than a filterable enum).
   */
  maxCardinality?: number;
  /**
   * Lower bound on the number of records carrying a value for an
   * auto-discovered facet. Defaults to 1.
   */
  minCoverage?: number;
}

const DEFAULT_MAX_CARDINALITY = 12;
const DEFAULT_MIN_COVERAGE = 1;

/**
 * Fields we never propose. `id`, `label`, free-form prose, and a handful
 * of process-std-am-specific identifiers that must never leak from a profile
 * into Graphify core.
 */
const DENYLIST = new Set([
  "id",
  "label",
  "title",
  "name",
  "description",
  "summary",
  "summary_excerpt",
  "body",
  "rationale",
  "node_id",
  "node_type",
  "type",
  "kind",
  "file_type",
  "aliases",
  "source_file",
  "source_location",
  "source_url",
  "captured_at",
  "author",
  "contributor",
  "community",
  "community_name",
  "weight",
  // process-std-am-specific facets — explicitly blocked.
  "framework",
  "hasMedia",
  "has_media",
  "hasDocuments",
  "has_documents",
  "reviewStatus",
  "assertionBasis",
]);

function isFacetableValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64;
}

function collectFieldNames(dataset: readonly WorkspaceFacetRecord[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const record of dataset) {
    if (!record || typeof record !== "object") continue;
    for (const key of Object.keys(record)) {
      if (DENYLIST.has(key)) continue;
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
  }
  return ordered;
}

function buildFacetValues(
  dataset: readonly WorkspaceFacetRecord[],
  key: string,
): WorkspaceFacetValue[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const record of dataset) {
    if (!record || typeof record !== "object") continue;
    const raw = (record as Record<string, unknown>)[key];
    if (!isFacetableValue(raw)) continue;
    const value = raw.trim();
    counts.set(value, (counts.get(value) ?? 0) + 1);
    total += 1;
  }
  const values: WorkspaceFacetValue[] = [{ value: "all", count: total }];
  const sliceList = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  for (const slice of sliceList) values.push(slice);
  return values;
}

/**
 * Discover the facets for the given dataset. The result is sorted in a
 * stable, profile-neutral order (alphabetical by key) so that two runs
 * over the same dataset produce identical HTML.
 */
export function discoverWorkspaceFacets(
  dataset: readonly WorkspaceFacetRecord[],
  options: DiscoverFacetsOptions = {},
): WorkspaceFacet[] {
  const maxCardinality = options.maxCardinality ?? DEFAULT_MAX_CARDINALITY;
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;

  const declared = options.declaredFacets?.filter((key) => !DENYLIST.has(key));
  const fields = declared && declared.length > 0 ? [...declared] : collectFieldNames(dataset);

  const out: WorkspaceFacet[] = [];
  for (const key of fields) {
    const values = buildFacetValues(dataset, key);
    const total = values[0]?.count ?? 0;
    if (total < minCoverage) continue;
    const sliceCount = values.length - 1; // ignore the "all" entry
    if (sliceCount < 1) continue;
    if (!declared && sliceCount > maxCardinality) continue;
    out.push({ key, values });
  }

  // Stable order: declared list preserves caller order; auto-discovery
  // sorts alphabetically.
  if (!declared) out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/**
 * Tiny predicate helper exposed for tests. Returns true when the given
 * record satisfies every facet slice currently set in `facetState`
 * (i.e. ignores the "all" sentinel).
 */
export function recordMatchesFacets(
  record: WorkspaceFacetRecord,
  facetState: Record<string, string>,
): boolean {
  for (const [key, value] of Object.entries(facetState)) {
    if (!value || value === "all") continue;
    if ((record as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}

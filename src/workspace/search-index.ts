/**
 * Track G G6-2 (S1.1) — cross-entity search index.
 *
 * Profile-neutral token-gram inverted index. No external dependency, no
 * embedding model, no Lucene/MiniSearch — we index node label / id /
 * aliases / source_file / summary_excerpt and resolve queries by
 * lowercase token matching with prefix tolerance (>= 3 characters).
 *
 * Hard constraint: no corpus-specific identifier is hardcoded here. The
 * input records are duck-typed strings — any profile can pass whatever
 * fields it surfaces in the dataset.
 */

/**
 * Minimal record shape consumed by the search index. Any extra fields
 * present on the input are ignored (and preserved verbatim in the
 * returned hit, which is a structural alias of the input).
 */
export interface WorkspaceSearchRecord {
  /** Stable id used as the deduplication key in hits. */
  id: string;
  /** Display label shown in the rail. */
  label?: string;
  /** Type id (profile-driven). */
  node_type?: string;
  /** Free-form aliases. */
  aliases?: string[];
  /** Source path — tokenised on slashes / dots / dashes / underscores. */
  source_file?: string;
  /** Compact summary used for prose search. */
  summary_excerpt?: string;
  /** Any extra property passed by the caller is preserved verbatim. */
  [extra: string]: unknown;
}

/** Opaque index handle. Build once per dataset, reuse across queries. */
export interface WorkspaceSearchIndex {
  /** Token → set of record ids. */
  readonly inverted: Map<string, Set<string>>;
  /** id → record (for hit re-hydration). */
  readonly byId: Map<string, WorkspaceSearchRecord>;
  /** Sorted token list for prefix scan. */
  readonly tokens: readonly string[];
}

const MIN_TOKEN_LENGTH = 1;
const PREFIX_MIN_LENGTH = 3;
const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;

function tokenise(value: string | undefined | null): string[] {
  if (!value) return [];
  const lower = value.toLowerCase();
  const out: string[] = [];
  for (const raw of lower.split(TOKEN_SPLIT_RE)) {
    if (raw.length >= MIN_TOKEN_LENGTH) out.push(raw);
  }
  return out;
}

function collectRecordTokens(record: WorkspaceSearchRecord): string[] {
  const fields: string[] = [];
  if (typeof record.label === "string") fields.push(record.label);
  if (typeof record.id === "string") fields.push(record.id);
  if (typeof record.node_type === "string") fields.push(record.node_type);
  if (Array.isArray(record.aliases)) {
    for (const alias of record.aliases) {
      if (typeof alias === "string") fields.push(alias);
    }
  }
  if (typeof record.source_file === "string") fields.push(record.source_file);
  if (typeof record.summary_excerpt === "string") fields.push(record.summary_excerpt);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields) {
    for (const token of tokenise(field)) {
      if (!seen.has(token)) {
        seen.add(token);
        out.push(token);
      }
    }
  }
  return out;
}

/**
 * Build the inverted index. Cost: O(total tokens). Re-run only when the
 * dataset changes — the result is intentionally small and JSON-friendly
 * so callers can cache it across renders.
 */
export function buildWorkspaceSearchIndex(
  records: readonly WorkspaceSearchRecord[],
): WorkspaceSearchIndex {
  const inverted = new Map<string, Set<string>>();
  const byId = new Map<string, WorkspaceSearchRecord>();
  for (const record of records) {
    if (!record || typeof record.id !== "string" || !record.id) continue;
    byId.set(record.id, record);
    for (const token of collectRecordTokens(record)) {
      let bucket = inverted.get(token);
      if (!bucket) {
        bucket = new Set<string>();
        inverted.set(token, bucket);
      }
      bucket.add(record.id);
    }
  }
  const tokens = Object.freeze([...inverted.keys()].sort());
  return { inverted, byId, tokens };
}

interface RankedHit {
  id: string;
  record: WorkspaceSearchRecord;
  score: number;
}

function resolveTokenMatches(index: WorkspaceSearchIndex, queryToken: string): Set<string> {
  const out = new Set<string>();
  const direct = index.inverted.get(queryToken);
  if (direct) for (const id of direct) out.add(id);

  // Prefix expansion. Only when the query token is at least
  // PREFIX_MIN_LENGTH chars; cheaper than implementing a trie and good
  // enough for the rail.
  if (queryToken.length >= PREFIX_MIN_LENGTH) {
    for (const token of index.tokens) {
      if (token.length > queryToken.length && token.startsWith(queryToken)) {
        const bucket = index.inverted.get(token);
        if (bucket) for (const id of bucket) out.add(id);
      } else if (token.includes(queryToken) && token !== queryToken) {
        // Cheap substring fallback for things like "arsene-lupin" → query "lupin".
        const bucket = index.inverted.get(token);
        if (bucket) for (const id of bucket) out.add(id);
      }
    }
  }
  return out;
}

/**
 * Search the index for the given query. Each query token contributes one
 * point to a record's score; records matching more tokens rank higher.
 * Empty/whitespace queries return an empty array — the rail shows the
 * default result groups in that case.
 */
export function searchWorkspaceIndex(
  index: WorkspaceSearchIndex,
  query: string,
  options: { limit?: number } = {},
): WorkspaceSearchRecord[] {
  if (typeof query !== "string") return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  const queryTokens = tokenise(trimmed);
  if (queryTokens.length === 0) return [];

  const scores = new Map<string, number>();
  for (const token of queryTokens) {
    const matches = resolveTokenMatches(index, token);
    for (const id of matches) {
      scores.set(id, (scores.get(id) ?? 0) + 1);
    }
  }

  const ranked: RankedHit[] = [];
  for (const [id, score] of scores) {
    const record = index.byId.get(id);
    if (record) ranked.push({ id, record, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = (a.record.label ?? a.id).toLowerCase();
    const lb = (b.record.label ?? b.id).toLowerCase();
    return la.localeCompare(lb);
  });

  const limit = options.limit && options.limit > 0 ? options.limit : ranked.length;
  return ranked.slice(0, limit).map((hit) => hit.record);
}

/**
 * Convenience: build + search in one shot. Useful for tests and callers
 * that do not want to manage the index lifetime themselves.
 */
export function searchWorkspace(
  records: readonly WorkspaceSearchRecord[],
  query: string,
  options: { limit?: number } = {},
): WorkspaceSearchRecord[] {
  return searchWorkspaceIndex(buildWorkspaceSearchIndex(records), query, options);
}

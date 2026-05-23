/**
 * Track G G6-2 (S1.5) — RESULTS grouped by taxonomy.
 *
 * Generic grouping: takes a dataset of records carrying a node_type
 * field (or a fallback type/kind), applies the active type filter +
 * facet state + free-text search, and returns one collapsed group per
 * remaining node_type id.
 *
 * Profile override: callers can declare an ordered list via
 * `outputs.workspace.result_groups`. When present, we honour the order
 * and drop any type that is not declared.
 */

import { recordMatchesFacets, type WorkspaceFacetRecord } from "./facet-panel.js";

export interface WorkspaceResultRecord extends WorkspaceFacetRecord {
  /** Stable id. */
  id: string;
  /** Display label. */
  label?: string;
  /** Type id (`node_type` first, then `type`, then `kind`, then "node"). */
  node_type?: string;
  type?: string;
  kind?: string;
  /** Optional aliases (used by search). */
  aliases?: string[];
  /** Optional compact summary (used by search). */
  summary_excerpt?: string;
  /** Optional source path (used by search). */
  source_file?: string;
}

export interface WorkspaceResultEntry {
  id: string;
  label: string;
  typeId: string;
}

export interface WorkspaceResultGroup {
  /** node_type id (e.g. "Character"). */
  typeId: string;
  /** Number of entries in the group. */
  count: number;
  /** Collapsed by default — UI may flip this to true on click. */
  open: boolean;
  /** Entries (capped by `maxEntries`, defaults to 200). */
  entries: WorkspaceResultEntry[];
  /** Hidden count when `entries.length` was truncated. */
  hiddenCount: number;
}

export interface GroupRecordsOptions {
  activeType: string;
  facetState: Record<string, string>;
  searchQuery: string;
  /** Profile override (`outputs.workspace.result_groups`). Optional. */
  resultGroups?: readonly string[];
  /** Upper bound on the entries returned per group. Defaults to 200. */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 200;

function resolveTypeId(record: WorkspaceResultRecord): string {
  return (
    (typeof record.node_type === "string" && record.node_type.trim()) ||
    (typeof record.type === "string" && record.type.trim()) ||
    (typeof record.kind === "string" && record.kind.trim()) ||
    "node"
  );
}

function recordSearchHaystack(record: WorkspaceResultRecord): string {
  const parts: string[] = [];
  if (record.id) parts.push(record.id);
  if (typeof record.label === "string") parts.push(record.label);
  if (Array.isArray(record.aliases)) {
    for (const alias of record.aliases) {
      if (typeof alias === "string") parts.push(alias);
    }
  }
  if (typeof record.summary_excerpt === "string") parts.push(record.summary_excerpt);
  if (typeof record.source_file === "string") parts.push(record.source_file);
  return parts.join(" ").toLowerCase();
}

function matchesQuery(record: WorkspaceResultRecord, queryTokens: readonly string[]): boolean {
  if (queryTokens.length === 0) return true;
  const haystack = recordSearchHaystack(record);
  for (const token of queryTokens) {
    if (!haystack.includes(token)) return false;
  }
  return true;
}

function matchesActiveType(record: WorkspaceResultRecord, activeType: string): boolean {
  if (!activeType || activeType === "all") return true;
  return resolveTypeId(record) === activeType;
}

/**
 * Group the dataset under the current filters. The result is a list of
 * groups, collapsed by default. The empty-state (no matching records)
 * returns an empty list — the caller renders the "N entities" heading
 * and a hint.
 */
export function groupRecordsByType(
  records: readonly WorkspaceResultRecord[],
  options: GroupRecordsOptions,
): WorkspaceResultGroup[] {
  const queryTokens = options.searchQuery
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  const filtered: WorkspaceResultRecord[] = [];
  for (const record of records) {
    if (!record || typeof record.id !== "string") continue;
    if (!matchesActiveType(record, options.activeType)) continue;
    if (!recordMatchesFacets(record, options.facetState)) continue;
    if (!matchesQuery(record, queryTokens)) continue;
    filtered.push(record);
  }

  const buckets = new Map<string, WorkspaceResultGroup>();
  for (const record of filtered) {
    const typeId = resolveTypeId(record);
    let group = buckets.get(typeId);
    if (!group) {
      group = { typeId, count: 0, open: false, entries: [], hiddenCount: 0 };
      buckets.set(typeId, group);
    }
    group.count += 1;
    if (group.entries.length < maxEntries) {
      group.entries.push({
        id: record.id,
        label: typeof record.label === "string" && record.label.trim() ? record.label : record.id,
        typeId,
      });
    } else {
      group.hiddenCount += 1;
    }
  }

  let ordered: WorkspaceResultGroup[];
  if (options.resultGroups && options.resultGroups.length > 0) {
    const list: WorkspaceResultGroup[] = [];
    for (const typeId of options.resultGroups) {
      const group = buckets.get(typeId);
      if (group) list.push(group);
    }
    ordered = list;
  } else {
    ordered = [...buckets.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.typeId.localeCompare(b.typeId);
    });
  }

  return ordered;
}

/**
 * Total count of records matching the current filters. Useful for the
 * "N entities in selection" header above the groups.
 */
export function countMatchingRecords(
  records: readonly WorkspaceResultRecord[],
  options: GroupRecordsOptions,
): number {
  return groupRecordsByType(records, options).reduce((sum, group) => sum + group.count, 0);
}

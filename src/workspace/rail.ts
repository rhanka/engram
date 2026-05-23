/**
 * Track G G6-2 — left rail rendering (search / types / selected / facets /
 * results). Pure-string HTML helper used by `renderWorkspaceShell`. The
 * rendered DOM carries `data-action` / `data-rail-section` attributes so
 * a client-side controller can dispatch the matching reducer action
 * (SET_ACTIVE_TYPE, SET_FACET, PIN_ENTITY, …) without Graphify core
 * shipping a JS bundle.
 *
 * Hard constraint: this module is corpus-neutral. The only strings it
 * emits are the section headings (`SEARCH`, `TYPES`, `SELECTED`,
 * `FACETS`, `RESULTS`) and the localized "shown / total" / "active /
 * slices" / "tracked" / "entities in selection" labels. Everything else
 * comes from the dataset.
 */

import type { GraphLike, GraphNodeLike } from "./graph-selection.js";
import type { WorkspaceFacet } from "./facet-panel.js";
import { discoverWorkspaceFacets } from "./facet-panel.js";
import type { WorkspaceResultGroup, WorkspaceResultRecord } from "./result-groups.js";
import { groupRecordsByType } from "./result-groups.js";
import type { WorkspaceViewerState } from "./viewer-state.js";

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function nodeType(node: GraphNodeLike): string {
  return (
    (typeof node.node_type === "string" && node.node_type.trim()) ||
    (typeof node.type === "string" && node.type.trim()) ||
    (typeof node.kind === "string" && node.kind.trim()) ||
    (typeof node.file_type === "string" && node.file_type.trim()) ||
    "node"
  );
}

/**
 * Layout slot mirroring `outputs.workspace` in `ontology-profile.yaml`.
 * All fields are optional: when missing, the rail falls back to
 * auto-discovery from the dataset.
 */
export interface WorkspaceRailLayout {
  /** Explicit list of facet keys to show. */
  facets?: readonly string[];
  /** Explicit list of node_type ids to show in the RESULTS section. */
  result_groups?: readonly string[];
}

export interface RenderRailOptions {
  state: WorkspaceViewerState;
  graph: GraphLike | undefined;
  /** Profile-driven overrides (optional). */
  layout?: WorkspaceRailLayout;
}

interface TypeRow {
  typeId: string;
  count: number;
}

function recordsFromGraph(graph: GraphLike | undefined): WorkspaceResultRecord[] {
  const out: WorkspaceResultRecord[] = [];
  if (!graph?.nodes) return out;
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string") continue;
    const record: WorkspaceResultRecord = {
      id: node.id,
      label: typeof node.label === "string" ? node.label : undefined,
      node_type: nodeType(node),
    };
    if (Array.isArray(node.aliases)) {
      record.aliases = node.aliases.filter((alias): alias is string => typeof alias === "string");
    }
    if (typeof node.source_file === "string") record.source_file = node.source_file;
    if (typeof node.summary === "string") record.summary_excerpt = node.summary;
    else if (typeof node.description === "string") record.summary_excerpt = node.description;
    // Copy filterable enum-shaped fields verbatim so facetState lookups work.
    for (const key of ["status", "operation", "score_bucket", "source_kind", "confidence"]) {
      const raw = (node as Record<string, unknown>)[key];
      if (typeof raw === "string" && raw.trim()) record[key] = raw;
    }
    out.push(record);
  }
  return out;
}

function buildTypeRows(records: readonly WorkspaceResultRecord[]): TypeRow[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const typeId = typeof record.node_type === "string" && record.node_type ? record.node_type : "node";
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([typeId, count]) => ({ typeId, count }))
    .sort((a, b) => b.count - a.count || a.typeId.localeCompare(b.typeId));
}

// ---------------------------------------------------------------------------
// Section rendering
// ---------------------------------------------------------------------------

function renderSearch(state: WorkspaceViewerState): string {
  const query = state.facetState["q"] ?? "";
  return [
    '<section class="ws-rail-section" data-rail-section="search">',
    '<h3 class="ws-rail-heading">Search</h3>',
    '<label class="ws-rail-search" aria-label="Cross-entity search">',
    `<input type="search" data-action="set-search-query" placeholder="Search labels, ids, aliases, paths" value="${escapeHtml(query)}" />`,
    "</label>",
    "</section>",
  ].join("");
}

function renderTypes(
  state: WorkspaceViewerState,
  records: readonly WorkspaceResultRecord[],
  filteredRecords: readonly WorkspaceResultRecord[],
): string {
  const rows = buildTypeRows(records);
  const total = records.length;
  const shown = filteredRecords.length;
  const active = state.activeType || "all";

  const rowsHtml: string[] = [];
  rowsHtml.push(
    [
      '<li class="ws-rail-type" data-type-id="all"',
      ` aria-pressed="${active === "all" ? "true" : "false"}">`,
      '<button type="button" data-action="set-active-type" data-type-id="all">',
      '<span class="ws-rail-type-label">All types</span>',
      `<span class="ws-rail-type-count">${total}</span>`,
      "</button>",
      "</li>",
    ].join(""),
  );
  for (const row of rows) {
    rowsHtml.push(
      [
        `<li class="ws-rail-type" data-type-id="${escapeHtml(row.typeId)}"`,
        ` aria-pressed="${active === row.typeId ? "true" : "false"}">`,
        `<button type="button" data-action="set-active-type" data-type-id="${escapeHtml(row.typeId)}">`,
        `<span class="ws-rail-type-label">${escapeHtml(row.typeId)}</span>`,
        `<span class="ws-rail-type-count">${row.count}</span>`,
        "</button>",
        "</li>",
      ].join(""),
    );
  }

  return [
    '<section class="ws-rail-section" data-rail-section="types">',
    '<h3 class="ws-rail-heading">Types <span class="ws-rail-counter"><span data-rail-counter="types-shown">' +
      shown +
      '</span> shown / <span data-rail-counter="types-total">' +
      total +
      "</span> total</span></h3>",
    `<ul class="ws-rail-type-list">${rowsHtml.join("")}</ul>`,
    "</section>",
  ].join("");
}

function renderSelected(state: WorkspaceViewerState, graph: GraphLike | undefined): string {
  const entityIds = state.selectedEntities ?? [];
  const typeIds = state.selectedTypes ?? [];
  const tracked = entityIds.length + typeIds.length;
  const labelLookup = new Map<string, string>();
  if (graph?.nodes) {
    for (const node of graph.nodes) {
      if (typeof node?.id === "string") {
        labelLookup.set(node.id, typeof node.label === "string" && node.label.trim() ? node.label : node.id);
      }
    }
  }

  const chips: string[] = [];
  for (const id of entityIds) {
    const label = labelLookup.get(id) ?? id;
    chips.push(
      [
        '<li class="ws-rail-chip" data-chip-kind="entity" data-chip-id="' + escapeHtml(id) + '">',
        '<button type="button" class="ws-rail-chip-focus" data-action="focus-entity" data-entity-id="' +
          escapeHtml(id) +
          '">',
        escapeHtml(label),
        "</button>",
        '<button type="button" class="ws-rail-chip-remove" aria-label="Remove from selection" data-action="unpin-entity" data-entity-id="' +
          escapeHtml(id) +
          '">×</button>',
        "</li>",
      ].join(""),
    );
  }
  for (const id of typeIds) {
    chips.push(
      [
        '<li class="ws-rail-chip" data-chip-kind="type" data-chip-id="' + escapeHtml(id) + '">',
        '<button type="button" class="ws-rail-chip-focus" data-action="set-active-type" data-type-id="' +
          escapeHtml(id) +
          '">',
        escapeHtml(id),
        "</button>",
        '<button type="button" class="ws-rail-chip-remove" aria-label="Remove from selection" data-action="unpin-type" data-type-id="' +
          escapeHtml(id) +
          '">×</button>',
        "</li>",
      ].join(""),
    );
  }
  const body =
    chips.length === 0
      ? '<p class="ws-empty ws-rail-empty">No items pinned yet.</p>'
      : `<ul class="ws-rail-chip-list">${chips.join("")}</ul>`;

  return [
    '<section class="ws-rail-section" data-rail-section="selected">',
    '<h3 class="ws-rail-heading">Selected <span class="ws-rail-counter"><span data-rail-counter="tracked">' +
      tracked +
      "</span> tracked</span></h3>",
    body,
    "</section>",
  ].join("");
}

function renderFacets(
  state: WorkspaceViewerState,
  records: readonly WorkspaceResultRecord[],
  layout: WorkspaceRailLayout | undefined,
): string {
  const declared = layout?.facets;
  const facets: WorkspaceFacet[] = discoverWorkspaceFacets(records, {
    declaredFacets: declared,
  });

  let active = 0;
  for (const [, value] of Object.entries(state.facetState)) {
    if (value && value !== "all") active += 1;
  }

  if (facets.length === 0) {
    return [
      '<section class="ws-rail-section" data-rail-section="facets">',
      '<h3 class="ws-rail-heading">Facets <span class="ws-rail-counter"><span data-rail-counter="facets-active">' +
        active +
        '</span> active / <span data-rail-counter="facets-slices">0</span> slices</span></h3>',
      '<p class="ws-empty ws-rail-empty">No facetable fields in this dataset.</p>',
      "</section>",
    ].join("");
  }

  const slicesTotal = facets.reduce((sum, facet) => sum + Math.max(0, facet.values.length - 1), 0);
  const facetHtml: string[] = [];
  for (const facet of facets) {
    const current = state.facetState[facet.key] ?? "all";
    const options = facet.values
      .map(
        (slice) =>
          `<option value="${escapeHtml(slice.value)}"${slice.value === current ? " selected" : ""}>${escapeHtml(slice.value)} (${slice.count})</option>`,
      )
      .join("");
    facetHtml.push(
      [
        '<details class="ws-rail-facet" data-facet-key="' + escapeHtml(facet.key) + '"' + (current !== "all" ? " open" : "") + ">",
        '<summary class="ws-rail-facet-summary">',
        '<span class="ws-rail-facet-name">' + escapeHtml(facet.key) + "</span>",
        '<span class="ws-rail-facet-current">' + escapeHtml(current) + "</span>",
        "</summary>",
        '<label class="ws-rail-facet-control">',
        `<select data-action="set-facet" data-facet-key="${escapeHtml(facet.key)}">${options}</select>`,
        "</label>",
        "</details>",
      ].join(""),
    );
  }

  return [
    '<section class="ws-rail-section" data-rail-section="facets">',
    '<h3 class="ws-rail-heading">Facets <span class="ws-rail-counter"><span data-rail-counter="facets-active">' +
      active +
      '</span> active / <span data-rail-counter="facets-slices">' +
      slicesTotal +
      "</span> slices</span></h3>",
    `<div class="ws-rail-facet-list">${facetHtml.join("")}</div>`,
    "</section>",
  ].join("");
}

function renderResults(
  filtered: readonly WorkspaceResultRecord[],
  groups: readonly WorkspaceResultGroup[],
): string {
  const total = filtered.length;
  if (groups.length === 0) {
    return [
      '<section class="ws-rail-section" data-rail-section="results">',
      '<h3 class="ws-rail-heading">Results <span class="ws-rail-counter"><span data-rail-counter="results-total">' +
        total +
        "</span> entities in selection</span></h3>",
      '<p class="ws-empty ws-rail-empty">No matching entities.</p>',
      "</section>",
    ].join("");
  }

  const groupHtml: string[] = [];
  for (const group of groups) {
    const entries = group.entries
      .map(
        (entry) =>
          [
            '<li class="ws-rail-result-entry" data-entity-id="' + escapeHtml(entry.id) + '">',
            '<button type="button" data-action="set-display-ref" data-display-ref="entity:' +
              escapeHtml(entry.id) +
              '">',
            escapeHtml(entry.label),
            "</button>",
            "</li>",
          ].join(""),
      )
      .join("");
    const hidden = group.hiddenCount > 0
      ? `<li class="ws-rail-result-hidden">+ ${group.hiddenCount} more</li>`
      : "";
    groupHtml.push(
      [
        '<details class="ws-rail-result-group" data-type-id="' + escapeHtml(group.typeId) + '"' + (group.open ? " open" : "") + ">",
        '<summary class="ws-rail-result-group-summary">',
        '<span class="ws-rail-result-group-name">' + escapeHtml(group.typeId) + "</span>",
        `<span class="ws-rail-result-group-count">${group.count}</span>`,
        "</summary>",
        `<ul class="ws-rail-result-entries">${entries}${hidden}</ul>`,
        "</details>",
      ].join(""),
    );
  }

  return [
    '<section class="ws-rail-section" data-rail-section="results">',
    '<h3 class="ws-rail-heading">Results <span class="ws-rail-counter"><span data-rail-counter="results-total">' +
      total +
      "</span> entities in selection</span></h3>",
    `<div class="ws-rail-result-list">${groupHtml.join("")}</div>`,
    "</section>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Render the full left rail. Returns "" when no graph is available — the
 * caller (shell.ts) falls back to its legacy "queue stub" placeholder
 * so existing tests / callers without a dataset stay intact.
 */
export function renderWorkspaceRail(opts: RenderRailOptions): string {
  const records = recordsFromGraph(opts.graph);
  if (records.length === 0) return "";

  const searchQuery = opts.state.facetState["q"] ?? "";
  const activeType = opts.state.activeType ?? "all";
  // Discovery layer: types use raw records; facet/result layers stack
  // the search query + facet state + active type.
  const filteredRecords: WorkspaceResultRecord[] = [];
  for (const record of records) {
    if (activeType !== "all" && record.node_type !== activeType) continue;
    let facetOk = true;
    for (const [key, value] of Object.entries(opts.state.facetState)) {
      if (!value || value === "all" || key === "q") continue;
      if ((record as Record<string, unknown>)[key] !== value) {
        facetOk = false;
        break;
      }
    }
    if (!facetOk) continue;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const haystack = [
        record.id,
        typeof record.label === "string" ? record.label : "",
        ...(Array.isArray(record.aliases) ? record.aliases : []),
        typeof record.source_file === "string" ? record.source_file : "",
        typeof record.summary_excerpt === "string" ? record.summary_excerpt : "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) continue;
    }
    filteredRecords.push(record);
  }

  const groups = groupRecordsByType(filteredRecords, {
    activeType: "all", // already applied above
    facetState: {},
    searchQuery: "",
    resultGroups: opts.layout?.result_groups,
  });

  return [
    '<div class="ws-rail">',
    renderSearch(opts.state),
    renderTypes(opts.state, records, filteredRecords),
    renderSelected(opts.state, opts.graph),
    renderFacets(opts.state, records, opts.layout),
    renderResults(filteredRecords, groups),
    "</div>",
  ].join("");
}

/** Inline CSS for the rail sections. Kept compact, no external file. */
export function workspaceRailStyles(): string {
  return [
    ".ws-rail { display: flex; flex-direction: column; gap: var(--ws-space-3); }",
    ".ws-rail-section { display: flex; flex-direction: column; gap: var(--ws-space-2); }",
    ".ws-rail-heading { margin: 0; font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); font-weight: 700; display: flex; align-items: baseline; gap: var(--ws-space-2); justify-content: space-between; }",
    ".ws-rail-counter { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); text-transform: none; letter-spacing: 0; font-weight: 400; }",
    ".ws-rail-search input { width: 100%; padding: var(--ws-space-1) var(--ws-space-2); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); background: var(--ws-surface-2); color: var(--ws-text); font-family: inherit; font-size: var(--ws-font-size-sm); }",
    ".ws-rail-type-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }",
    ".ws-rail-type button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: var(--ws-space-2); background: transparent; border: 1px solid transparent; border-radius: var(--ws-radius-sm); color: var(--ws-text); padding: 2px var(--ws-space-2); font-family: inherit; font-size: var(--ws-font-size-sm); cursor: pointer; }",
    ".ws-rail-type[aria-pressed=\"true\"] button { background: var(--ws-surface-2); border-color: var(--ws-border); color: var(--ws-accent); font-weight: 600; }",
    ".ws-rail-type-count { color: var(--ws-text-muted); font-variant-numeric: tabular-nums; }",
    ".ws-rail-chip-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--ws-space-1); }",
    ".ws-rail-chip { display: inline-flex; align-items: center; gap: 2px; padding: 0 0 0 var(--ws-space-1); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-pill, 9999px); background: var(--ws-surface-2); font-size: var(--ws-font-size-sm); }",
    ".ws-rail-chip-focus, .ws-rail-chip-remove { background: transparent; border: 0; color: inherit; cursor: pointer; padding: 2px var(--ws-space-1); font: inherit; }",
    ".ws-rail-chip-remove { color: var(--ws-text-muted); font-weight: 700; }",
    ".ws-rail-facet-list { display: flex; flex-direction: column; gap: var(--ws-space-1); }",
    ".ws-rail-facet { border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); padding: var(--ws-space-1) var(--ws-space-2); background: var(--ws-surface-2); }",
    ".ws-rail-facet-summary { cursor: pointer; display: flex; justify-content: space-between; gap: var(--ws-space-2); font-size: var(--ws-font-size-sm); }",
    ".ws-rail-facet-name { color: var(--ws-text); }",
    ".ws-rail-facet-current { color: var(--ws-text-muted); font-variant-numeric: tabular-nums; }",
    ".ws-rail-facet-control select { width: 100%; margin-top: var(--ws-space-1); padding: 2px var(--ws-space-1); background: var(--ws-surface); border: 1px solid var(--ws-border); color: var(--ws-text); font-family: inherit; font-size: var(--ws-font-size-sm); }",
    ".ws-rail-result-list { display: flex; flex-direction: column; gap: var(--ws-space-1); }",
    ".ws-rail-result-group { border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); padding: var(--ws-space-1) var(--ws-space-2); background: var(--ws-surface-2); }",
    ".ws-rail-result-group-summary { cursor: pointer; display: flex; justify-content: space-between; gap: var(--ws-space-2); font-size: var(--ws-font-size-sm); }",
    ".ws-rail-result-group-name { color: var(--ws-text); font-weight: 600; }",
    ".ws-rail-result-group-count { color: var(--ws-text-muted); font-variant-numeric: tabular-nums; }",
    ".ws-rail-result-entries { list-style: none; margin: var(--ws-space-1) 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }",
    ".ws-rail-result-entry button { background: transparent; border: 0; color: var(--ws-accent); cursor: pointer; padding: 0; text-align: left; font: inherit; }",
    ".ws-rail-result-hidden { color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); font-style: italic; }",
    ".ws-rail-empty { margin: 0; }",
  ].join("\n");
}

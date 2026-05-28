/**
 * Track G G-studio-lot4 (#7) — right-column entity panel.
 *
 * Mirrors process-std-am's EntityPanel + EntityRelationsAccordion: when a node is
 * selected, the REAL right column shows the entity's wiki description, its
 * relations, an evidence snippet (a short quote, not the whole source), and
 * occurrence / citation counts (total mentions + per-document appearance
 * count).
 *
 * Strictly profile-neutral: the only literal strings are the section
 * headings; everything else comes from the dataset / sidecars.
 */

import type { GraphEdgeLike, GraphLike, GraphNodeLike } from "./graph-selection.js";
import type { WorkspaceDescriptionSidecar } from "./shell.js";

/**
 * Occurrence / citation data for the selected entity, keyed by node id.
 * Sourced from `.graphify/ontology/occurrences.json` (or any profile-declared
 * occurrence sidecar). All fields are optional so a sparse sidecar degrades
 * gracefully.
 */
export interface EntityOccurrence {
  /** Total mention count across the corpus. */
  total?: number;
  /** Per-document appearance count (document path -> count). */
  documents?: Record<string, number>;
  /** Short evidence snippets (quotes), capped by the renderer. */
  snippets?: string[];
}

export type EntityPanelOccurrences = Record<string, EntityOccurrence>;

export interface RenderEntityPanelOptions {
  /** The selected graph node. */
  node: GraphNodeLike;
  /** The full graph (used to resolve relation targets + labels). */
  graph: GraphLike;
  /** Optional Track A wiki description sidecar entry for this node. */
  descriptionSidecar?: WorkspaceDescriptionSidecar;
  /** Optional occurrence / citation data keyed by node id. */
  occurrences?: EntityPanelOccurrences;
  /** Max relations to render before truncating. Defaults to 50. */
  maxRelations?: number;
  /** Max evidence snippets to render. Defaults to 3. */
  maxSnippets?: number;
}

const DEFAULT_MAX_RELATIONS = 50;
const DEFAULT_MAX_SNIPPETS = 3;
const SNIPPET_MAX_CHARS = 240;

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

function displayValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nodeTitle(node: GraphNodeLike): string {
  return (
    displayValue(node.title) ??
    displayValue(node.label) ??
    displayValue(node.name) ??
    node.id
  );
}

function nodeType(node: GraphNodeLike): string | null {
  return (
    displayValue(node.node_type) ??
    displayValue(node.type) ??
    displayValue(node.kind) ??
    displayValue(node.file_type)
  );
}

function nodeCommunity(node: GraphNodeLike): string | null {
  return (
    displayValue(node.community_name) ??
    (typeof node.community === "number" ? `Community ${node.community}` : null)
  );
}

function nodeSourcePath(node: GraphNodeLike): string | null {
  const file = displayValue(node.source_file);
  const loc = displayValue(node.source_location);
  if (!file) return null;
  return loc ? `${file}:${loc}` : file;
}

function graphEdges(graph: GraphLike): GraphEdgeLike[] {
  return graph.edges ?? graph.links ?? [];
}

/**
 * Render a Track A markdown description as safe inline HTML. Supports
 * `**bold**` and `*italic*` runs only; everything else stays escaped text.
 */
function renderInlineMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown.trim());
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

interface RelationRow {
  direction: "out" | "in";
  relation: string;
  otherId: string;
  otherLabel: string;
}

function buildRelationRows(
  node: GraphNodeLike,
  graph: GraphLike,
  max: number,
): { rows: RelationRow[]; hidden: number; total: number } {
  const labelById = new Map<string, string>();
  for (const candidate of graph.nodes ?? []) {
    if (typeof candidate?.id === "string") labelById.set(candidate.id, nodeTitle(candidate));
  }
  const rows: RelationRow[] = [];
  for (const edge of graphEdges(graph)) {
    if (edge.source === node.id) {
      rows.push({
        direction: "out",
        relation: displayValue(edge.relation) ?? "related_to",
        otherId: edge.target,
        otherLabel: labelById.get(edge.target) ?? edge.target,
      });
    } else if (edge.target === node.id) {
      rows.push({
        direction: "in",
        relation: displayValue(edge.relation) ?? "related_to",
        otherId: edge.source,
        otherLabel: labelById.get(edge.source) ?? edge.source,
      });
    }
  }
  const total = rows.length;
  const capped = rows.slice(0, max);
  return { rows: capped, hidden: total - capped.length, total };
}

function renderRelations(node: GraphNodeLike, graph: GraphLike, max: number): string {
  const { rows, hidden, total } = buildRelationRows(node, graph, max);
  const heading =
    '<h3 class="ws-entity-section-heading">Relations <span class="ws-entity-counter">' +
    total +
    "</span></h3>";
  if (total === 0) {
    return [
      '<section class="ws-entity-relations" data-entity-section="relations">',
      heading,
      '<p class="ws-entity-empty">No relations.</p>',
      "</section>",
    ].join("");
  }
  const items = rows
    .map((row) => {
      const arrow = row.direction === "out" ? "→" : "←";
      return [
        '<li class="ws-entity-relation" data-relation-dir="' + row.direction + '" data-other-id="' + escapeHtml(row.otherId) + '">',
        '<span class="ws-entity-relation-kind">' + escapeHtml(row.relation) + "</span>",
        '<span class="ws-entity-relation-arrow" aria-hidden="true">' + arrow + "</span>",
        '<span class="ws-entity-relation-target">' + escapeHtml(row.otherLabel) + "</span>",
        "</li>",
      ].join("");
    })
    .join("");
  const more = hidden > 0 ? `<li class="ws-entity-relation-hidden">+ ${hidden} more</li>` : "";
  return [
    '<section class="ws-entity-relations" data-entity-section="relations">',
    heading,
    `<ul class="ws-entity-relation-list">${items}${more}</ul>`,
    "</section>",
  ].join("");
}

function clampSnippet(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= SNIPPET_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, SNIPPET_MAX_CHARS).trimEnd()}…`;
}

function renderSnippets(occurrence: EntityOccurrence | undefined, max: number): string {
  const snippets = (occurrence?.snippets ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, max);
  if (snippets.length === 0) return "";
  const items = snippets
    .map((s) => `<blockquote class="ws-entity-snippet-quote">${escapeHtml(clampSnippet(s))}</blockquote>`)
    .join("");
  return [
    '<section class="ws-entity-snippet" data-entity-section="snippet">',
    '<h3 class="ws-entity-section-heading">Evidence</h3>',
    items,
    "</section>",
  ].join("");
}

function renderOccurrences(occurrence: EntityOccurrence | undefined): string {
  if (!occurrence) return "";
  const documents = occurrence.documents ?? {};
  const docEntries = Object.entries(documents).filter(([, count]) => typeof count === "number");
  const total =
    typeof occurrence.total === "number"
      ? occurrence.total
      : docEntries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0 && docEntries.length === 0) return "";
  const docRows = docEntries
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(
      ([doc, count]) =>
        [
          '<li class="ws-entity-occurrence-row">',
          '<span class="ws-entity-occurrence-doc">' + escapeHtml(doc) + "</span>",
          '<span class="ws-entity-occurrence-count">' + count + "</span>",
          "</li>",
        ].join(""),
    )
    .join("");
  return [
    '<section class="ws-entity-occurrences" data-entity-section="occurrences">',
    '<h3 class="ws-entity-section-heading">Occurrences</h3>',
    `<p class="ws-entity-occurrence-total">${total} mention${total === 1 ? "" : "s"}` +
      (docEntries.length > 0 ? ` across ${docEntries.length} document${docEntries.length === 1 ? "" : "s"}` : "") +
      "</p>",
    docRows ? `<ul class="ws-entity-occurrence-list">${docRows}</ul>` : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderFacts(node: GraphNodeLike): string {
  const facts: Array<{ label: string; value: string }> = [];
  const type = nodeType(node);
  if (type) facts.push({ label: "Type", value: type });
  const community = nodeCommunity(node);
  if (community) facts.push({ label: "Community", value: community });
  const source = nodeSourcePath(node);
  if (source) facts.push({ label: "Source", value: source });
  if (facts.length === 0) return "";
  return [
    '<p class="ws-entity-facts">',
    facts
      .map(
        (f) =>
          `<span class="ws-entity-fact"><span class="ws-entity-fact-label">${escapeHtml(f.label)}:</span> ${escapeHtml(f.value)}</span>`,
      )
      .join(" · "),
    "</p>",
  ].join("");
}

function renderDescription(sidecar: WorkspaceDescriptionSidecar | undefined): string {
  // Track A rule: insufficient_evidence hides the block silently (no
  // placeholder); generated inlines the markdown; absent => nothing.
  if (!sidecar) return "";
  if (sidecar.status !== "generated") return "";
  const text = typeof sidecar.description === "string" ? sidecar.description.trim() : "";
  if (!text) return "";
  return `<div class="ws-entity-description">${renderInlineMarkdown(text)}</div>`;
}

/**
 * Render the right-column entity panel. Pure string HTML, no framework.
 */
export function renderEntityPanel(opts: RenderEntityPanelOptions): string {
  const node = opts.node;
  const maxRelations = opts.maxRelations ?? DEFAULT_MAX_RELATIONS;
  const maxSnippets = opts.maxSnippets ?? DEFAULT_MAX_SNIPPETS;
  const occurrence = opts.occurrences?.[node.id];
  return [
    `<article class="ws-entity-panel" data-entity-id="${escapeHtml(node.id)}">`,
    '<div class="ws-entity-kicker">Selected entity</div>',
    `<h2 class="ws-entity-title">${escapeHtml(nodeTitle(node))}</h2>`,
    renderFacts(node),
    renderDescription(opts.descriptionSidecar),
    renderRelations(node, opts.graph, maxRelations),
    renderSnippets(occurrence, maxSnippets),
    renderOccurrences(occurrence),
    "</article>",
  ]
    .filter(Boolean)
    .join("");
}

/** Inline CSS for the entity panel. Light-on-light right column. */
export function entityPanelStyles(): string {
  return [
    ".ws-entity-panel { display: grid; gap: var(--ws-space-3); }",
    ".ws-entity-kicker { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }",
    ".ws-entity-title { margin: 0; font-size: var(--ws-font-size-lg); line-height: var(--ws-line-height-tight); }",
    ".ws-entity-facts { margin: 0; color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); display: flex; flex-wrap: wrap; gap: var(--ws-space-2); }",
    ".ws-entity-fact-label { color: var(--ws-text); font-weight: 600; }",
    ".ws-entity-description { color: var(--ws-text); line-height: var(--ws-line-height-normal); }",
    ".ws-entity-section-heading { margin: 0 0 var(--ws-space-1); font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); font-weight: 700; display: flex; align-items: baseline; gap: var(--ws-space-2); }",
    ".ws-entity-counter { color: var(--ws-text-muted); font-weight: 400; }",
    ".ws-entity-empty { margin: 0; color: var(--ws-text-muted); font-style: italic; }",
    ".ws-entity-relation-list, .ws-entity-occurrence-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }",
    ".ws-entity-relation { display: flex; align-items: baseline; gap: var(--ws-space-1); font-size: var(--ws-font-size-sm); }",
    ".ws-entity-relation-kind { color: var(--ws-text-muted); }",
    ".ws-entity-relation-arrow { color: var(--ws-text-muted); }",
    ".ws-entity-relation-target { color: var(--ws-text); font-weight: 600; overflow-wrap: anywhere; }",
    ".ws-entity-relation-hidden { color: var(--ws-text-muted); font-style: italic; font-size: var(--ws-font-size-sm); }",
    ".ws-entity-snippet-quote { margin: 0 0 var(--ws-space-1); padding: var(--ws-space-1) var(--ws-space-2); border-left: 3px solid var(--ws-border); color: var(--ws-text); font-style: italic; }",
    ".ws-entity-occurrence-total { margin: 0 0 var(--ws-space-1); color: var(--ws-text); font-size: var(--ws-font-size-sm); }",
    ".ws-entity-occurrence-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ws-space-2); font-size: var(--ws-font-size-sm); }",
    ".ws-entity-occurrence-doc { color: var(--ws-text); overflow-wrap: anywhere; }",
    ".ws-entity-occurrence-count { color: var(--ws-text-muted); font-variant-numeric: tabular-nums; }",
  ].join("\n");
}

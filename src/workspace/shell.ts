/**
 * Track G G6-1 — workspace shell (three-column scaffolding).
 *
 * Layout — desktop (>= 769 px):
 *
 *   +----- Header ----------------------------------------------+
 *   | Title · status · profile-id                              |
 *   +----+-----------------------------------+-----------------+
 *   | LW | CompactDescription                | Reconciliation  |
 *   |    | Counters                          | slot            |
 *   |    | GraphControls                     | (empty when     |
 *   |    | GraphPanel                        |  active view is |
 *   |    |                                   |  "workspace")   |
 *   +----+-----------------------------------+-----------------+
 *
 * Layout — mobile (<= 768 px):
 *
 *   +----- Header ----------------------------------------------+
 *   | LeftWorkbench (top sheet)                                 |
 *   +-----------------------------------------------------------+
 *   | CompactDescription                                        |
 *   | Counters                                                  |
 *   | GraphControls                                             |
 *   | GraphPanel                                                |
 *   +-----------------------------------------------------------+
 *   | Reconciliation slot — collapsed to display:none when      |
 *   | activeView === "workspace"                                |
 *
 * Strictly profile-neutral: no corpus-specific strings. Slot markup is
 * always emitted so future sub-views (G6-3) can plug Track B evidence/
 * audit/rebuild into the existing structure.
 */

import type { WorkspaceTokens, WorkspaceTokenSource } from "./tokens.js";
import type { GraphEdgeLike, GraphLike, GraphNodeLike } from "./graph-selection.js";
import { computeFocusSubgraph } from "./graph-selection.js";
import type { WorkspaceViewerState } from "./viewer-state.js";
import { createDefaultViewerState } from "./viewer-state.js";
import { serialiseTokensToCss } from "./tokens-fallback.js";
import { renderWorkspaceRail, workspaceRailStyles, type WorkspaceRailLayout } from "./rail.js";
import { entityPanelStyles } from "./entity-panel.js";

/**
 * Optional sidecar payload propagated from `.graphify/wiki/descriptions.json`
 * (schema `graphify_wiki_description_v1`). Only the fields needed by the
 * compact description block are typed here so the shell stays decoupled
 * from the full wiki-descriptions API surface.
 */
export interface WorkspaceDescriptionSidecar {
  status: "generated" | "insufficient_evidence";
  target_id: string;
  target_kind: "node" | "community";
  description?: string | null;
}

/**
 * Optional profile-driven layout configuration. Mirrors the
 * `outputs.workspace.entity_layout` slot in `ontology-profile.yaml`.
 * Any unknown key is preserved verbatim — Graphify core never inspects
 * it; only profile adapters do.
 */
export interface WorkspaceEntityLayout {
  /** Display order of the inline fact lines under the title. */
  inline_facts?: string[];
  /** Sections to render below the inline facts (defaults to aliases / relations / evidence). */
  sections?: string[];
}

export interface RenderWorkspaceShellOptions {
  /** Resolved tokens for the active theme. */
  tokens: WorkspaceTokens;
  /** Whether tokens came from @sentropic/design-system or the local fallback. */
  tokenSource?: WorkspaceTokenSource;
  /** Workspace title displayed in the header. Sanitised. */
  title: string;
  /** Optional profile identifier displayed in the header. */
  profileId?: string;
  /** Optional last-rebuild timestamp displayed verbatim. */
  lastRebuiltAt?: string;
  /** Read-only vs write-enabled indicator. */
  writeEnabled?: boolean;
  /** When true the LeftWorkbench rail renders a "queue is empty" hint. */
  queueEmpty?: boolean;
  /** Trusted internal HTML fragment rendered inside the graph panel slot. */
  graphPanelHtml?: string;
  /** Trusted internal HTML fragment rendered inside the left workbench slot. */
  leftWorkbenchHtml?: string;
  /** Trusted internal HTML fragment rendered inside the central display slot. */
  centralDisplayHtml?: string;
  /**
   * Trusted internal HTML fragment rendered inside the reconciliation
   * slot. Honoured only when `state.activeView !== "workspace"` (or when
   * no state is passed — legacy callers without G6 state).
   */
  rightDrawerHtml?: string;
  /**
   * Track G G-studio-lot4 (#7): trusted entity-panel HTML for the REAL
   * right column. When provided in the default Workspace view (with an
   * entity selected), the right slot becomes visible and renders this
   * panel instead of staying hidden. Ignored in reconciliation / evidence
   * views (those use `rightDrawerHtml`).
   */
  entityPanelHtml?: string;
  /** Current workspace state. Used to resolve the central display item. */
  state?: WorkspaceViewerState;
  /** Graph payload (typically loaded from `.graphify/graph.json`). */
  graph?: GraphLike;
  /** Optional Track A description sidecar for the focused entity. */
  descriptionSidecar?: WorkspaceDescriptionSidecar;
  /** Optional profile-driven entity layout (falls back to a neutral default). */
  entityLayout?: WorkspaceEntityLayout;
  /**
   * Optional profile-driven rail layout (`outputs.workspace.facets` /
   * `outputs.workspace.result_groups`). Both fields are optional — the
   * rail auto-discovers what it can from the dataset.
   */
  railLayout?: WorkspaceRailLayout;
}

// ---------------------------------------------------------------------------
// HTML / Markdown helpers
// ---------------------------------------------------------------------------

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

function nodeType(node: GraphNodeLike): string {
  return (
    displayValue(node.node_type) ??
    displayValue(node.type) ??
    displayValue(node.kind) ??
    displayValue(node.file_type) ??
    "node"
  );
}

function nodeTitle(node: GraphNodeLike): string {
  return (
    displayValue(node.title) ??
    displayValue(node.label) ??
    displayValue(node.name) ??
    node.id
  );
}

function nodeDirectSummary(node: GraphNodeLike): string | null {
  return (
    displayValue(node.summary) ??
    displayValue(node.description) ??
    displayValue(node.body)
  );
}

function nodeSourcePath(node: GraphNodeLike): string | null {
  const sourceFile = displayValue(node.source_file);
  const sourceLocation = displayValue(node.source_location);
  if (!sourceFile) return null;
  return sourceLocation ? `${sourceFile}:${sourceLocation}` : sourceFile;
}

function nodeCommunity(node: GraphNodeLike): string | null {
  return (
    displayValue(node.community_name) ??
    (typeof node.community === "number" ? `Community ${node.community}` : null)
  );
}

function nodeAliases(node: GraphNodeLike): string[] {
  const raw = node.aliases;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function graphEdges(graph: GraphLike | undefined): GraphEdgeLike[] {
  return graph?.edges ?? graph?.links ?? [];
}

function countEdgeEvidence(edge: GraphEdgeLike): number {
  if (typeof edge.evidence_count === "number" && Number.isFinite(edge.evidence_count)) {
    return Math.max(0, Math.round(edge.evidence_count));
  }
  const arrays = [edge.evidence, edge.evidence_ids, edge.evidenceIds, edge.sources, edge.source_files];
  for (const value of arrays) {
    if (Array.isArray(value)) return value.length;
  }
  if (typeof edge.evidence === "string" || typeof edge.source_file === "string") {
    return 1;
  }
  return 0;
}

/**
 * Render a Track A markdown description as safe inline HTML. Supports
 * `**bold**` and `*italic*` runs only; anything else stays as escaped
 * text. The contract intentionally stays minimal to avoid pulling a full
 * Markdown engine into the shell.
 */
function renderInlineMarkdown(markdown: string): string {
  const escaped = escapeHtml(markdown.trim());
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

// ---------------------------------------------------------------------------
// Compact description rendering
// ---------------------------------------------------------------------------

const DEFAULT_INLINE_FACTS = ["type", "status", "source", "community"];
const DEFAULT_SECTIONS = ["aliases", "relations", "evidence"];

interface CompactDescriptionContext {
  displayRef: string;
  requestedKind: string;
  title: string;
  facts: Array<{ key: string; label: string; value: string }>;
  description: string | null;
  aliases: string[];
  relations: GraphEdgeLike[];
  evidenceCount: number;
}

function buildNodeFacts(
  node: GraphNodeLike,
  requestedKind: string,
): Array<{ key: string; label: string; value: string }> {
  const facts: Array<{ key: string; label: string; value: string }> = [];
  const type =
    displayValue(node.node_type) ??
    displayValue(node.type) ??
    displayValue(node.kind) ??
    displayValue(node.file_type);
  if (type) facts.push({ key: "type", label: "Type", value: type });
  else if (requestedKind !== "entity") facts.push({ key: "type", label: "Type", value: requestedKind });
  const status = displayValue(node.status);
  if (status) facts.push({ key: "status", label: "Status", value: status });
  const confidence = displayValue(node.confidence);
  if (confidence) facts.push({ key: "confidence", label: "Confidence", value: confidence });
  const source = nodeSourcePath(node);
  if (source) facts.push({ key: "source", label: "Source", value: source });
  const community = nodeCommunity(node);
  if (community) facts.push({ key: "community", label: "Community", value: community });
  return facts;
}

function orderFacts(
  facts: Array<{ key: string; label: string; value: string }>,
  order: string[] | undefined,
): Array<{ key: string; label: string; value: string }> {
  const requested = (order && order.length > 0 ? order : DEFAULT_INLINE_FACTS).map((k) => k.toLowerCase());
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const out: Array<{ key: string; label: string; value: string }> = [];
  const seen = new Set<string>();
  for (const key of requested) {
    const fact = byKey.get(key);
    if (fact) {
      out.push(fact);
      seen.add(key);
    }
  }
  // Preserve any extra facts that the profile didn't list explicitly.
  for (const fact of facts) {
    if (!seen.has(fact.key)) out.push(fact);
  }
  return out;
}

function renderCompactSections(
  ctx: CompactDescriptionContext,
  sections: string[] | undefined,
): string {
  const requested = (sections && sections.length > 0 ? sections : DEFAULT_SECTIONS).map((s) => s.toLowerCase());
  const parts: string[] = [];
  for (const section of requested) {
    if (section === "aliases") {
      if (ctx.aliases.length === 0) continue;
      parts.push(
        [
          '<section class="ws-compact-section ws-compact-aliases">',
          '<h4 class="ws-compact-section-heading">Aliases</h4>',
          `<p class="ws-compact-section-body">${ctx.aliases.map((a) => escapeHtml(a)).join(" / ")}</p>`,
          "</section>",
        ].join(""),
      );
    } else if (section === "relations") {
      const total = ctx.relations.length;
      const body =
        total === 0
          ? '<p class="ws-compact-section-body ws-compact-section-empty">none</p>'
          : `<p class="ws-compact-section-body">${total} relation${total === 1 ? "" : "s"}</p>`;
      parts.push(
        [
          '<section class="ws-compact-section ws-compact-relations">',
          '<h4 class="ws-compact-section-heading">Relations</h4>',
          body,
          "</section>",
        ].join(""),
      );
    } else if (section === "evidence") {
      const sources = new Set<string>();
      for (const edge of ctx.relations) {
        const sf = displayValue(edge.source_file);
        if (sf) sources.add(sf);
      }
      const body =
        ctx.evidenceCount === 0 && sources.size === 0
          ? '<p class="ws-compact-section-body ws-compact-section-empty">none</p>'
          : `<p class="ws-compact-section-body">${ctx.evidenceCount} ref${ctx.evidenceCount === 1 ? "" : "s"}${sources.size > 0 ? ` · ${[...sources].map((s) => escapeHtml(s)).join(", ")}` : ""}</p>`;
      parts.push(
        [
          '<section class="ws-compact-section ws-compact-evidence">',
          '<h4 class="ws-compact-section-heading">Evidence</h4>',
          body,
          "</section>",
        ].join(""),
      );
    }
  }
  return parts.join("");
}

function renderCompactDescription(
  ctx: CompactDescriptionContext,
  layout: WorkspaceEntityLayout | undefined,
  sidecar: WorkspaceDescriptionSidecar | undefined,
): string {
  const facts = orderFacts(ctx.facts, layout?.inline_facts);
  const factsLine =
    facts.length === 0
      ? ""
      : `<p class="ws-compact-facts">${facts
          .map(
            (f) =>
              `<span class="ws-compact-fact" data-fact="${escapeHtml(f.key)}"><span class="ws-compact-fact-label">${escapeHtml(f.label)}:</span> ${escapeHtml(f.value)}</span>`,
          )
          .join(" · ")}</p>`;

  // Track A description rules: when sidecar is "insufficient_evidence",
  // hide the description silently. When "generated", inline the markdown.
  // When no sidecar is provided, fall back to the node's own summary.
  let descriptionBlock = "";
  if (sidecar) {
    if (sidecar.status === "generated" && typeof sidecar.description === "string" && sidecar.description.trim()) {
      descriptionBlock = `<p class="ws-compact-description">${renderInlineMarkdown(sidecar.description)}</p>`;
    }
    // insufficient_evidence → silently omit.
  } else if (ctx.description) {
    descriptionBlock = `<p class="ws-compact-description">${escapeHtml(ctx.description)}</p>`;
  }

  return [
    `<article class="ws-compact" data-display-ref="${escapeHtml(ctx.displayRef)}">`,
    '<div class="ws-compact-kicker">Selected item</div>',
    `<h3 class="ws-compact-title">${escapeHtml(ctx.title)}</h3>`,
    factsLine,
    descriptionBlock,
    renderCompactSections(ctx, layout?.sections),
    "</article>",
  ]
    .filter(Boolean)
    .join("");
}

function renderEntityDisplay(
  displayRef: string,
  requestedKind: string,
  node: GraphNodeLike,
  edges: GraphEdgeLike[],
  layout: WorkspaceEntityLayout | undefined,
  sidecar: WorkspaceDescriptionSidecar | undefined,
): string {
  const relatedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const evidenceCount = relatedEdges.reduce((sum, edge) => sum + countEdgeEvidence(edge), 0);
  const ctx: CompactDescriptionContext = {
    displayRef,
    requestedKind,
    title: nodeTitle(node),
    facts: buildNodeFacts(node, requestedKind),
    description: nodeDirectSummary(node),
    aliases: nodeAliases(node),
    relations: relatedEdges,
    evidenceCount,
  };
  return renderCompactDescription(ctx, layout, sidecar);
}

function renderTypeDisplay(
  displayRef: string,
  typeId: string,
  graph: GraphLike,
  layout: WorkspaceEntityLayout | undefined,
): string {
  const nodes = graph.nodes ?? [];
  const members = nodes.filter((node) => nodeType(node) === typeId);
  const memberIds = new Set(members.map((node) => node.id));
  const relatedEdges = graphEdges(graph).filter(
    (edge) => memberIds.has(edge.source) || memberIds.has(edge.target),
  );
  const evidenceCount = relatedEdges.reduce((sum, edge) => sum + countEdgeEvidence(edge), 0);
  const ctx: CompactDescriptionContext = {
    displayRef,
    requestedKind: "type",
    title: typeId,
    facts: [
      { key: "type", label: "Type", value: "Type" },
      { key: "members", label: "Members", value: String(members.length) },
    ],
    description: null,
    aliases: [],
    relations: relatedEdges,
    evidenceCount,
  };
  return renderCompactDescription(ctx, layout, undefined);
}

function renderCentralDisplayBody(
  state: WorkspaceViewerState | undefined,
  graph: GraphLike | undefined,
  layout: WorkspaceEntityLayout | undefined,
  sidecar: WorkspaceDescriptionSidecar | undefined,
): string {
  const displayRef = state?.displayRef?.trim();
  if (!displayRef) return '<p class="ws-empty">No display item selected.</p>';

  const separator = displayRef.indexOf(":");
  const requestedKind = separator > 0 ? displayRef.slice(0, separator) : "entity";
  const id = separator > 0 ? displayRef.slice(separator + 1) : displayRef;
  if (!id || !graph) {
    return '<p class="ws-empty">Selected item is unavailable.</p>';
  }

  if (requestedKind === "type" || requestedKind === "taxonomy") {
    return renderTypeDisplay(displayRef, id, graph, layout);
  }

  const node = (graph.nodes ?? []).find((candidate) => candidate.id === id);
  if (!node) return '<p class="ws-empty">Selected item is unavailable.</p>';
  return renderEntityDisplay(displayRef, requestedKind, node, graphEdges(graph), layout, sidecar);
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

interface CountersValues {
  selectedEntities: number;
  selectedClasses: number;
  visibleNodes: number;
  visibleEdges: number;
}

function computeCounters(
  state: WorkspaceViewerState | undefined,
  graph: GraphLike | undefined,
): CountersValues {
  const selectedEntities = new Set<string>([
    ...(state?.selectedEntities ?? []),
    ...(state?.selectionState.entityIds ?? []),
  ]).size;
  const selectedClasses = new Set<string>(state?.selectedTypes ?? []).size;

  if (!graph || !state) {
    const nodes = graph?.nodes?.length ?? 0;
    const edges = (graph?.edges ?? graph?.links ?? []).length;
    return { selectedEntities, selectedClasses, visibleNodes: nodes, visibleEdges: edges };
  }
  const sub = computeFocusSubgraph(graph, state);
  return {
    selectedEntities,
    selectedClasses,
    visibleNodes: sub.metrics.nodes,
    visibleEdges: sub.metrics.edges,
  };
}

function renderCounters(values: CountersValues): string {
  const items: Array<[keyof CountersValues, string, string]> = [
    ["selectedEntities", "selected-entities", "Selected entities"],
    ["selectedClasses", "selected-classes", "Selected classes"],
    ["visibleNodes", "visible-nodes", "Visible nodes"],
    ["visibleEdges", "visible-edges", "Visible edges"],
  ];
  return [
    '<div class="ws-counters" role="group" aria-label="Workspace counters">',
    ...items.map(([key, slug, label]) =>
      [
        `<div class="ws-counter" data-counter="${slug}">`,
        `<span class="ws-counter-value">${values[key]}</span>`,
        `<span class="ws-counter-label">${label}</span>`,
        "</div>",
      ].join(""),
    ),
    "</div>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Graph controls (mode toggle + weak links + legend)
// ---------------------------------------------------------------------------

function renderGraphControls(state: WorkspaceViewerState | undefined): string {
  const mode = state?.viewState.graph.mode ?? "selection";
  const weak = state?.viewState.graph.showWeakLinks ?? false;
  return [
    '<div class="ws-graph-controls" role="group" aria-label="Graph controls">',
    '<div class="ws-graph-mode-toggle" data-control="graph-mode-toggle">',
    `<label><input type="radio" name="ws-graph-mode" value="selection"${mode === "selection" ? " checked" : ""} /> Selection</label>`,
    `<label><input type="radio" name="ws-graph-mode" value="focus"${mode === "focus" ? " checked" : ""} /> Focus</label>`,
    "</div>",
    `<label class="ws-graph-weak-links"><input type="checkbox" data-control="graph-weak-links"${weak ? " checked" : ""} /> Show weak links</label>`,
    '<ul class="ws-graph-legend" aria-label="Graph legend">',
    '<li><span class="ws-legend-swatch ws-legend-strong"></span> Strong links</li>',
    '<li><span class="ws-legend-swatch ws-legend-explicit"></span> Explicit / attested</li>',
    '<li><span class="ws-legend-swatch ws-legend-weak"></span> Weak links</li>',
    "</ul>",
    "</div>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function shellStyles(): string {
  return [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; height: 100%; }",
    "body { background: var(--ws-surface); color: var(--ws-text); font-family: var(--ws-font-family-sans); font-size: var(--ws-font-size-md); line-height: var(--ws-line-height-normal); }",
    ".ws-skip-link { position: absolute; top: -40px; left: var(--ws-space-2); background: var(--ws-accent); color: oklch(1 0 0); padding: var(--ws-space-1) var(--ws-space-3); border-radius: 0 0 var(--ws-radius-sm) var(--ws-radius-sm); z-index: 1000; text-decoration: none; }",
    ".ws-skip-link:focus-visible { top: var(--ws-space-1); outline: var(--ws-outline); outline-offset: var(--ws-outline-offset); outline-color: var(--ws-outline-color); }",
    "*:focus-visible { outline: var(--ws-outline); outline-offset: var(--ws-outline-offset); outline-color: var(--ws-outline-color); }",
    ".ws-root { display: grid; grid-template-columns: 280px 1fr 320px; grid-template-rows: auto 1fr; min-height: 100vh; column-gap: 0; row-gap: 0; }",
    ".ws-header { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: var(--ws-space-3); padding: var(--ws-space-3) var(--ws-space-4); border-bottom: 1px solid var(--ws-border); background: var(--ws-surface-2); }",
    ".ws-header h1 { font-family: var(--ws-font-family-display); font-size: var(--ws-font-size-lg); margin: 0; }",
    ".ws-header-meta { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); display: flex; gap: var(--ws-space-3); align-items: center; }",
    // Top tabs (G6-3 S2.1).
    ".ws-tabs { display: inline-flex; gap: var(--ws-space-1); margin: 0; padding: 0; list-style: none; }",
    ".ws-tab { display: inline-block; padding: var(--ws-space-1) var(--ws-space-3); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); color: var(--ws-text-muted); background: var(--ws-surface); text-decoration: none; font-size: var(--ws-font-size-sm); }",
    ".ws-tab[aria-selected='true'] { color: var(--ws-text); background: var(--ws-surface-2); border-color: var(--ws-accent); font-weight: 600; }",
    ".ws-evidence-placeholder { padding: var(--ws-space-4); color: var(--ws-text-muted); }",
    ".ws-evidence-placeholder h2 { margin: 0 0 var(--ws-space-2); font-size: var(--ws-font-size-lg); }",
    ".ws-write-banner { font-size: var(--ws-font-size-sm); padding: var(--ws-space-1) var(--ws-space-2); border-radius: var(--ws-radius-sm); border: 1px solid var(--ws-border); background: var(--ws-surface); }",
    ".ws-write-banner[data-write='true'] { color: var(--ws-warning); border-color: var(--ws-warning); }",
    ".ws-write-banner[data-write='false'] { color: var(--ws-text-muted); }",
    ".ws-left { grid-column: 1; grid-row: 2; border-right: 1px solid var(--ws-border); overflow-y: auto; padding: var(--ws-space-3); background: var(--ws-surface); }",
    ".ws-center { grid-column: 2; grid-row: 2; overflow-y: auto; padding: var(--ws-space-4); background: var(--ws-surface); }",
    // Compact description.
    ".ws-compact { display: grid; gap: var(--ws-space-2); max-width: 88ch; }",
    ".ws-compact-kicker { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }",
    ".ws-compact-title { margin: 0; font-size: var(--ws-font-size-lg); line-height: var(--ws-line-height-tight); }",
    ".ws-compact-facts { margin: 0; color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); display: flex; flex-wrap: wrap; gap: var(--ws-space-2); }",
    ".ws-compact-fact-label { color: var(--ws-text); font-weight: 600; }",
    ".ws-compact-description { margin: 0; }",
    ".ws-compact-section { display: grid; gap: 0; }",
    ".ws-compact-section-heading { margin: 0; font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); font-weight: 600; }",
    ".ws-compact-section-body { margin: 0; color: var(--ws-text); }",
    ".ws-compact-section-empty { color: var(--ws-text-muted); font-style: italic; }",
    // Counters.
    ".ws-counters { display: grid; grid-template-columns: repeat(4, minmax(80px, 1fr)); gap: var(--ws-space-2); margin: var(--ws-space-4) 0 var(--ws-space-3); }",
    ".ws-counter { display: grid; gap: 2px; padding: var(--ws-space-2); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-md); background: var(--ws-surface-2); text-align: center; }",
    ".ws-counter-value { font-size: var(--ws-font-size-lg); font-weight: 700; color: var(--ws-text); }",
    ".ws-counter-label { font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); }",
    // Graph panel + controls.
    ".ws-graph-panel { margin-top: var(--ws-space-3); padding-top: var(--ws-space-3); border-top: 1px solid var(--ws-border); }",
    ".ws-graph-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ws-space-3); margin-bottom: var(--ws-space-3); font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); }",
    ".ws-graph-mode-toggle { display: flex; gap: var(--ws-space-2); }",
    ".ws-graph-mode-toggle label, .ws-graph-weak-links { display: inline-flex; align-items: center; gap: var(--ws-space-1); cursor: pointer; }",
    ".ws-graph-legend { display: flex; flex-wrap: wrap; gap: var(--ws-space-3); margin: 0; padding: 0; list-style: none; }",
    ".ws-graph-legend li { display: inline-flex; align-items: center; gap: var(--ws-space-1); }",
    ".ws-legend-swatch { width: 12px; height: 4px; border-radius: 2px; display: inline-block; background: var(--ws-text-muted); }",
    ".ws-legend-strong { background: var(--ws-accent); }",
    ".ws-legend-explicit { background: var(--ws-text); }",
    ".ws-legend-weak { background: var(--ws-text-muted); opacity: 0.6; }",
    // Reconciliation slot.
    ".workspace-reconciliation-slot { grid-column: 3; grid-row: 2; border-left: 1px solid var(--ws-border); overflow-y: auto; padding: var(--ws-space-3); background: var(--ws-surface-2); }",
    ".workspace-reconciliation-slot[data-active-view=\"workspace\"] { display: none; }",
    ".workspace-reconciliation-slot[data-active-view=\"evidence\"] { display: none; }",
    ".workspace-reconciliation-slot[hidden] { display: none !important; }",
    ".ws-empty { color: var(--ws-text-muted); font-style: italic; }",
    "@media (max-width: 768px) {",
    "  .ws-root { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto; }",
    "  .ws-left { grid-column: 1; grid-row: 2; border-right: none; border-bottom: 1px solid var(--ws-border); max-height: 40vh; }",
    "  .ws-center { grid-column: 1; grid-row: 3; }",
    "  .workspace-reconciliation-slot { grid-column: 1; grid-row: 4; border-left: none; border-top: 1px solid var(--ws-border); max-height: 40vh; }",
    "  .workspace-reconciliation-slot[data-active-view=\"workspace\"] { display: none; max-height: 0; padding: 0; }",
    "  .workspace-reconciliation-slot[data-active-view=\"evidence\"] { display: none; max-height: 0; padding: 0; }",
    "  .workspace-reconciliation-slot[hidden] { display: none !important; max-height: 0; padding: 0; }",
    "  .ws-counters { grid-template-columns: repeat(2, minmax(80px, 1fr)); }",
    "  .ws-tabs { font-size: var(--ws-font-size-sm); }",
    "}",
    // G-studio-lot4 (#7): the entity slot is the real right column — never
    // hidden by the workspace/evidence hide rules (it has its own view tag).
    ".workspace-reconciliation-slot[data-active-view=\"entity\"] { display: block; }",
    workspaceRailStyles(),
    entityPanelStyles(),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Top tabs (G6-3 S2.1)
// ---------------------------------------------------------------------------

interface TabSpec {
  id: string;
  label: string;
  href: string;
}

const TOP_TABS: readonly TabSpec[] = [
  { id: "workspace", label: "Workspace", href: "/" },
  { id: "reconciliation", label: "Reconciliation", href: "/?view=reconciliation" },
  { id: "evidence", label: "Evidence", href: "/?view=evidence" },
];

/**
 * The set of `activeView` values that the shell knows how to render
 * specially. Any other value (e.g. legacy "studio") falls back to the
 * default workspace surface but with `state.activeView` still surfaced
 * to the reconciliation slot via `data-active-view` for backward compat.
 */
const RECONCILIATION_VIEWS = new Set(["reconciliation", "studio"]);

function isReconciliationView(activeView: string | null | undefined): boolean {
  return typeof activeView === "string" && RECONCILIATION_VIEWS.has(activeView);
}

function renderTopTabs(activeView: string | null | undefined): string {
  const effective = typeof activeView === "string" && activeView ? activeView : "workspace";
  // Map legacy "studio" onto the "reconciliation" tab so the navigation
  // surface stays coherent during the G6-3 transition.
  const selectedTab = effective === "studio" ? "reconciliation" : effective;
  return [
    '<nav class="ws-tabs" role="tablist" aria-label="Workspace views">',
    ...TOP_TABS.map((tab) => {
      const selected = tab.id === selectedTab;
      return [
        `<a class="ws-tab" role="tab" data-tab="${escapeHtml(tab.id)}" href="${escapeHtml(tab.href)}" aria-selected="${selected ? "true" : "false"}">`,
        escapeHtml(tab.label),
        "</a>",
      ].join("");
    }),
    "</nav>",
  ].join("");
}

function renderEvidencePlaceholderBody(): string {
  return [
    '<section class="ws-evidence-placeholder" data-view="evidence" role="region" aria-label="Evidence view placeholder">',
    "<h2>Evidence</h2>",
    "<p>Evidence view coming soon (G7).</p>",
    "<p>This tab is a routing placeholder. The Evidence surface lands in Track G G7 with cross-corpus evidence aggregation, search and filters.</p>",
    "</section>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Top-level renderer
// ---------------------------------------------------------------------------

/**
 * Renders the workspace shell as a self-contained HTML5 document.
 */
export function renderWorkspaceShell(opts: RenderWorkspaceShellOptions): string {
  const tokens = opts.tokens;
  const tokenSource = escapeHtml(opts.tokenSource ?? "fallback");
  const title = escapeHtml(opts.title);
  const profileId = opts.profileId ? escapeHtml(opts.profileId) : "n/a";
  const lastRebuiltAt = opts.lastRebuiltAt ? escapeHtml(opts.lastRebuiltAt) : "";
  const writeFlag = opts.writeEnabled === true;
  const queueEmpty = opts.queueEmpty === true;
  const tokensCss = serialiseTokensToCss(tokens);

  // Effective state used by the counters + central display + graph controls.
  const effectiveState = opts.state ?? createDefaultViewerState();
  // The reconciliation slot is visible only under the Reconciliation
  // sub-view (G6-3 S2.3). Legacy "studio" activeView is still recognised
  // as a reconciliation context so pre-G6-3 callers keep working. The
  // markup is always rendered so callers can swap states without forcing
  // a re-mount.
  const activeView = opts.state?.activeView ?? null;
  const isEvidenceView = activeView === "evidence";
  // G-studio-lot4 (#7): in the default Workspace view the right slot stays
  // hidden UNLESS an entity panel is supplied (a node is selected) — then it
  // becomes the real right column showing the entity. Reconciliation / studio
  // views keep their existing drawer behaviour.
  const isWorkspaceView = !isReconciliationView(activeView) && !isEvidenceView;
  const hasEntityPanel =
    isWorkspaceView && typeof opts.entityPanelHtml === "string" && opts.entityPanelHtml.length > 0;
  const slotVisible = isReconciliationView(activeView) || hasEntityPanel;
  const slotHidden = !slotVisible;
  const slotActiveView = hasEntityPanel ? "entity" : activeView ?? "workspace";

  // G6-2: render the rich left rail (search / types / selected / facets /
  // results) when a graph is available and the caller did not override
  // `leftWorkbenchHtml`. Otherwise fall back to the legacy stubs so the
  // pre-G6-2 tests (queueEmpty hint) still pass.
  let railBody = "";
  if (!opts.leftWorkbenchHtml && opts.graph) {
    railBody = renderWorkspaceRail({
      state: effectiveState,
      graph: opts.graph,
      layout: opts.railLayout,
    });
  }
  const queueBody =
    opts.leftWorkbenchHtml ??
    (railBody !== ""
      ? railBody
      : queueEmpty
        ? '<p class="ws-empty" id="ws-queue-empty">Reconciliation queue is empty.</p>'
        : '<p class="ws-empty" id="ws-queue-stub">Queue rendering arrives in G5.</p>');

  // Evidence sub-view ships as a minimal placeholder for G6-3; G7 will
  // populate it. We override the central body in that branch and drop
  // counters + graph controls + graph panel since there is nothing to
  // count against an empty view yet.
  const centralDisplayBody = isEvidenceView
    ? renderEvidencePlaceholderBody()
    : opts.centralDisplayHtml ??
      renderCentralDisplayBody(opts.state, opts.graph, opts.entityLayout, opts.descriptionSidecar);

  const counters = isEvidenceView
    ? ""
    : renderCounters(computeCounters(effectiveState, opts.graph));
  const graphControls = isEvidenceView ? "" : renderGraphControls(effectiveState);

  const graphPanelBody = isEvidenceView
    ? ""
    : opts.graphPanelHtml ?? '<p class="ws-empty">No graph context available.</p>';
  const graphPanelSection = isEvidenceView
    ? ""
    : [
        '<section class="ws-graph-panel" id="graph-panel" role="region" aria-label="Graph panel">',
        graphPanelBody,
        "</section>",
      ].join("");

  const slotBody = slotHidden
    ? ""
    : hasEntityPanel
      ? (opts.entityPanelHtml as string)
      : opts.rightDrawerHtml ??
        '<p class="ws-empty">Evidence / relations / audit trail accordion arrives with G5.</p>';

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    "<style>",
    `:root {\n${tokensCss}\n}`,
    shellStyles(),
    "</style>",
    "</head>",
    "<body>",
    '<a class="ws-skip-link" href="#central-display">Skip to central display</a>',
    `<div class="ws-root" role="application" aria-label="Graphify ontology workspace" data-token-source="${tokenSource}">`,
    '<header class="ws-header" role="banner">',
    `<h1>${title}</h1>`,
    '<div class="ws-header-meta">',
    renderTopTabs(activeView),
    `<span aria-label="profile id">profile: ${profileId}</span>`,
    lastRebuiltAt
      ? `<span aria-label="last rebuilt at">last rebuilt: ${lastRebuiltAt}</span>`
      : "",
    `<span class="ws-write-banner" data-write="${writeFlag ? "true" : "false"}" aria-label="write mode">${writeFlag ? "WRITE ENABLED" : "read-only"}</span>`,
    "</div>",
    "</header>",
    '<aside class="ws-left" id="left-workbench" role="complementary" aria-label="Left workbench">',
    '<h2 class="ws-region-heading">Workbench</h2>',
    queueBody,
    "</aside>",
    '<main class="ws-center" id="central-display" role="main" aria-label="Central display" tabindex="-1">',
    centralDisplayBody,
    counters,
    graphControls,
    graphPanelSection,
    "</main>",
    `<aside class="workspace-reconciliation-slot" id="workspace-reconciliation-slot" role="complementary" aria-label="Reconciliation slot" data-active-view="${escapeHtml(slotActiveView)}"${slotHidden ? ' hidden aria-hidden="true"' : ""}>`,
    slotBody,
    "</aside>",
    "</div>",
    "</body>",
    "</html>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

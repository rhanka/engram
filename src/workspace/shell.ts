/**
 * Track G Lot 1 / G2 — workspace shell static scaffold.
 *
 * Produces the server-rendered HTML scaffold consumed by
 * `graphify ontology studio` (read-only by default; mutation surface
 * is gated behind --write per existing patterns in src/serve.ts and
 * src/ontology-studio.ts and is wired in G5).
 *
 * Layout — desktop (>= 769 px):
 *
 *   +----- Header ---------------------------------+
 *   | Title · status · profile-id                 |
 *   +----+----------------------------+-----------+
 *   | LW | CentralDisplay             |  Drawer   |
 *   |    |                            |           |
 *   |    |  ----  GraphPanel ----     |           |
 *   |    |                            |           |
 *   +----+----------------------------+-----------+
 *
 * Layout — mobile (<= 768 px):
 *
 *   +----- Header ---------------------------------+
 *   | LeftWorkbench (collapsible top sheet)        |
 *   +-----------------------------------------------+
 *   | CentralDisplay                                |
 *   | -------------- GraphPanel ------------------- |
 *   +-----------------------------------------------+
 *   | Drawer (sub-page nav, not overlay)            |
 *
 * Track C inheritance is mandatory:
 *   - skip-link (first focusable element) jumps to #central-display
 *   - ARIA: each named region declares role + aria-label.
 *   - focus-visible respects the workspace focus-ring tokens.
 *
 * G2 ships the HTML skeleton + token-driven CSS. G3..G5 follow-ups
 * fill the actual content: viewer state model (G3), graph surface
 * inside #graph-panel (G4), reconciliation rebind (G5).
 */

import type { WorkspaceTokens, WorkspaceTokenSource } from "./tokens.js";
import type { GraphEdgeLike, GraphLike, GraphNodeLike } from "./graph-selection.js";
import type { WorkspaceViewerState } from "./viewer-state.js";
import { serialiseTokensToCss } from "./tokens-fallback.js";

export interface RenderWorkspaceShellOptions {
  /** Resolved tokens for the active theme. */
  tokens: WorkspaceTokens;
  /** Whether tokens came from @sentropic/design-system or the local fallback. */
  tokenSource?: WorkspaceTokenSource;
  /** Workspace title displayed in the header. Sanitised. */
  title: string;
  /**
   * Optional profile identifier displayed in the header (e.g.
   * "public-domain-mystery-uat"). Sanitised.
   */
  profileId?: string;
  /**
   * Optional last-rebuild timestamp (ISO 8601, displayed verbatim if
   * provided). Sanitised.
   */
  lastRebuiltAt?: string;
  /**
   * Read-only vs write-enabled indicator. The shell renders a clear
   * banner; actual write gating lives in src/serve.ts / src/ontology-studio.ts.
   */
  writeEnabled?: boolean;
  /**
   * When true the LeftWorkbench rail renders a "queue is empty" hint
   * instead of a stub list. Used by G5 to surface freshly-empty
   * reconciliation queues without crashing the shell render path.
   */
  queueEmpty?: boolean;
  /** Trusted internal HTML fragment rendered inside the graph panel slot. */
  graphPanelHtml?: string;
  /** Trusted internal HTML fragment rendered inside the left workbench slot. */
  leftWorkbenchHtml?: string;
  /** Trusted internal HTML fragment rendered inside the central display slot. */
  centralDisplayHtml?: string;
  /** Trusted internal HTML fragment rendered inside the detail drawer slot. */
  rightDrawerHtml?: string;
  /** Current workspace state. Used to resolve the central display item. */
  state?: WorkspaceViewerState;
  /** Graph payload (typically loaded from `.graphify/graph.json`). */
  graph?: GraphLike;
}

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

function nodeSummary(node: GraphNodeLike): string | null {
  const directSummary =
    displayValue(node.summary) ??
    displayValue(node.description) ??
    displayValue(node.body);
  if (directSummary) return directSummary;

  const sourceFile = displayValue(node.source_file);
  const sourceLocation = displayValue(node.source_location);
  const community =
    displayValue(node.community_name) ??
    (typeof node.community === "number" ? `Community ${node.community}` : null);
  const details: string[] = [];
  if (sourceFile) {
    details.push(`Source: ${sourceLocation ? `${sourceFile}:${sourceLocation}` : sourceFile}`);
  }
  if (community) details.push(`Community: ${community}`);
  return details.length > 0 ? details.join("\n") : null;
}

function truncateDisplayText(value: string): string {
  const max = 1200;
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
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
  if (
    typeof edge.evidence === "string" ||
    typeof edge.source_file === "string"
  ) {
    return 1;
  }
  return 0;
}

function renderDisplayMetrics(metrics: Array<[string, number]>): string {
  const items = metrics.map(
    ([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${value}</span>`,
  );
  return ['<div class="ws-display-metrics">', ...items, "</div>"].join("");
}

function renderNodeDisplay(
  displayRef: string,
  requestedKind: string,
  node: GraphNodeLike,
  edges: GraphEdgeLike[],
): string {
  const relatedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);
  const evidenceCount = relatedEdges.reduce((sum, edge) => sum + countEdgeEvidence(edge), 0);
  const summary = nodeSummary(node);
  const kind = requestedKind === "entity" ? nodeType(node) : nodeType(node) || requestedKind;
  return [
    `<article class="ws-display-item" data-display-ref="${escapeHtml(displayRef)}">`,
    '<div class="ws-display-kicker">Selected item</div>',
    `<h3>${escapeHtml(nodeTitle(node))}</h3>`,
    `<p class="ws-display-kind">${escapeHtml(kind)}</p>`,
    summary
      ? `<p class="ws-display-summary">${escapeHtml(truncateDisplayText(summary))}</p>`
      : '<p class="ws-empty">No summary available.</p>',
    renderDisplayMetrics([
      ["Relations", relatedEdges.length],
      ["Evidence", evidenceCount],
    ]),
    "</article>",
  ].join("");
}

function renderTypeDisplay(displayRef: string, typeId: string, graph: GraphLike): string {
  const nodes = graph.nodes ?? [];
  const members = nodes.filter((node) => nodeType(node) === typeId);
  const memberIds = new Set(members.map((node) => node.id));
  const relatedEdges = graphEdges(graph).filter(
    (edge) => memberIds.has(edge.source) || memberIds.has(edge.target),
  );
  const evidenceCount = relatedEdges.reduce((sum, edge) => sum + countEdgeEvidence(edge), 0);
  return [
    `<article class="ws-display-item" data-display-ref="${escapeHtml(displayRef)}">`,
    '<div class="ws-display-kicker">Selected item</div>',
    `<h3>${escapeHtml(typeId)}</h3>`,
    '<p class="ws-display-kind">Type</p>',
    renderDisplayMetrics([
      ["Members", members.length],
      ["Relations", relatedEdges.length],
      ["Evidence", evidenceCount],
    ]),
    "</article>",
  ].join("");
}

function renderCentralDisplayBody(
  state: WorkspaceViewerState | undefined,
  graph: GraphLike | undefined,
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
    return renderTypeDisplay(displayRef, id, graph);
  }

  const node = (graph.nodes ?? []).find((candidate) => candidate.id === id);
  if (!node) return '<p class="ws-empty">Selected item is unavailable.</p>';
  return renderNodeDisplay(displayRef, requestedKind, node, graphEdges(graph));
}

function shellStyles(): string {
  return [
    "*, *::before, *::after { box-sizing: border-box; }",
    "html, body { margin: 0; padding: 0; height: 100%; }",
    "body { background: var(--ws-surface); color: var(--ws-text); font-family: var(--ws-font-family-sans); font-size: var(--ws-font-size-md); line-height: var(--ws-line-height-normal); }",
    ".ws-skip-link { position: absolute; top: -40px; left: var(--ws-space-2); background: var(--ws-accent); color: #fff; padding: var(--ws-space-1) var(--ws-space-3); border-radius: 0 0 var(--ws-radius-sm) var(--ws-radius-sm); z-index: 1000; text-decoration: none; }",
    ".ws-skip-link:focus-visible { top: var(--ws-space-1); outline: var(--ws-outline); outline-offset: var(--ws-outline-offset); outline-color: var(--ws-outline-color); }",
    "*:focus-visible { outline: var(--ws-outline); outline-offset: var(--ws-outline-offset); outline-color: var(--ws-outline-color); }",
    ".ws-root { display: grid; grid-template-columns: 280px 1fr 320px; grid-template-rows: auto 1fr; min-height: 100vh; column-gap: 0; row-gap: 0; }",
    ".ws-header { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: var(--ws-space-3); padding: var(--ws-space-3) var(--ws-space-4); border-bottom: 1px solid var(--ws-border); background: var(--ws-surface-2); }",
    ".ws-header h1 { font-size: var(--ws-font-size-lg); margin: 0; }",
    ".ws-header-meta { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); display: flex; gap: var(--ws-space-3); }",
    ".ws-write-banner { font-size: var(--ws-font-size-sm); padding: var(--ws-space-1) var(--ws-space-2); border-radius: var(--ws-radius-sm); border: 1px solid var(--ws-border); background: var(--ws-surface); }",
    ".ws-write-banner[data-write='true'] { color: var(--ws-warning); border-color: var(--ws-warning); }",
    ".ws-write-banner[data-write='false'] { color: var(--ws-text-muted); }",
    ".ws-left { grid-column: 1; grid-row: 2; border-right: 1px solid var(--ws-border); overflow-y: auto; padding: var(--ws-space-3); background: var(--ws-surface); }",
    ".ws-center { grid-column: 2; grid-row: 2; overflow-y: auto; padding: var(--ws-space-4); background: var(--ws-surface); }",
    ".ws-graph-panel { margin-top: var(--ws-space-5); padding-top: var(--ws-space-3); border-top: 1px solid var(--ws-border); }",
    ".ws-right { grid-column: 3; grid-row: 2; border-left: 1px solid var(--ws-border); overflow-y: auto; padding: var(--ws-space-3); background: var(--ws-surface-2); }",
    ".ws-region-heading { font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); margin: 0 0 var(--ws-space-2); }",
    ".ws-empty { color: var(--ws-text-muted); font-style: italic; }",
    ".ws-display-item { display: grid; gap: var(--ws-space-2); max-width: 72ch; }",
    ".ws-display-kicker { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }",
    ".ws-display-item h3 { margin: 0; font-size: var(--ws-font-size-lg); line-height: var(--ws-line-height-tight); }",
    ".ws-display-kind { margin: 0; color: var(--ws-text-muted); }",
    ".ws-display-summary { margin: 0; white-space: pre-wrap; }",
    ".ws-display-metrics { display: flex; flex-wrap: wrap; gap: var(--ws-space-3); font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); }",
    ".ws-display-metrics b { color: var(--ws-text); font-weight: 600; }",
    "@media (max-width: 768px) {",
    "  .ws-root { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr auto; }",
    "  .ws-left { grid-column: 1; grid-row: 2; border-right: none; border-bottom: 1px solid var(--ws-border); max-height: 40vh; }",
    "  .ws-center { grid-column: 1; grid-row: 3; }",
    "  .ws-right { grid-column: 1; grid-row: 4; border-left: none; border-top: 1px solid var(--ws-border); max-height: 40vh; }",
    "}",
  ].join("\n");
}

/**
 * Renders the workspace shell as a self-contained HTML5 document.
 * G3..G5 will refine the inner regions; this baseline guarantees the
 * layout, the accessibility scaffolding, and the token-driven theming.
 */
export function renderWorkspaceShell(opts: RenderWorkspaceShellOptions): string {
  const tokens = opts.tokens;
  const tokenSource = escapeHtml(opts.tokenSource ?? "fallback");
  const title = escapeHtml(opts.title);
  const profileId = opts.profileId ? escapeHtml(opts.profileId) : "—";
  const lastRebuiltAt = opts.lastRebuiltAt ? escapeHtml(opts.lastRebuiltAt) : "";
  const writeFlag = opts.writeEnabled === true;
  const queueEmpty = opts.queueEmpty === true;
  const tokensCss = serialiseTokensToCss(tokens);
  const queueBody = opts.leftWorkbenchHtml ?? (queueEmpty
    ? '<p class="ws-empty" id="ws-queue-empty">Reconciliation queue is empty.</p>'
    : '<p class="ws-empty" id="ws-queue-stub">Queue rendering arrives in G5.</p>');
  const graphPanelBody =
    opts.graphPanelHtml ??
    '<p class="ws-empty">No graph context available.</p>';
  const centralDisplayBody = opts.centralDisplayHtml ?? renderCentralDisplayBody(opts.state, opts.graph);
  const rightDrawerBody =
    opts.rightDrawerHtml ??
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
    '<h2 class="ws-region-heading">Central display</h2>',
    centralDisplayBody,
    '<section class="ws-graph-panel" id="graph-panel" role="region" aria-label="Graph panel">',
    '<h2 class="ws-region-heading">Graph panel</h2>',
    graphPanelBody,
    "</section>",
    "</main>",
    '<aside class="ws-right" id="right-drawer" role="complementary" aria-label="Detail drawer">',
    '<h2 class="ws-region-heading">Detail</h2>',
    rightDrawerBody,
    "</aside>",
    "</div>",
    "</body>",
    "</html>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

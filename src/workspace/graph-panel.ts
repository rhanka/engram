/**
 * Track G Lot 1 / G4 — graph panel renderer.
 *
 * Server-rendered metrics header + optional graph viewer surface. Two
 * rendering paths:
 *
 *   - When `graphHtmlUrl` is set, the panel emits an iframe pointing
 *     at a Graphify-generated HTML export (e.g. ".graphify/graph.html").
 *     The full vis.js bootstrap is reused from the existing
 *     `graphify export html` output; this lot does not duplicate it.
 *
 *   - When `graphHtmlUrl` is absent, the panel emits a bounded empty
 *     state for skill-runtime / MCP environments where the HTML export
 *     has not been produced yet.
 *
 * The metrics header is always rendered and reflects the focus
 * subgraph computed by `computeFocusSubgraph`. It changes as the
 * viewer state changes (focus / hops / showWeakLinks / selection),
 * giving the user an immediate read on how a state change reshapes
 * the slice.
 *
 * No client-side framework, no JS bundling. Pure HTML strings.
 */

import type { WorkspaceViewerState } from "./viewer-state.js";
import type { FocusSubgraph, GraphLike } from "./graph-selection.js";
import type { WorkspaceTokens } from "./tokens.js";
import { computeFocusSubgraph } from "./graph-selection.js";

export interface RenderGraphPanelOptions {
  /** Current workspace state. */
  state: WorkspaceViewerState;
  /** Graph payload (typically loaded from `.graphify/graph.json`). */
  graph: GraphLike;
  /** Resolved tokens for the active theme. */
  tokens: WorkspaceTokens;
  /** Optional URL/path to a `graphify export html` artefact. */
  graphHtmlUrl?: string;
  /**
   * Optional height of the iframe / placeholder, in CSS pixels.
   * Defaults to 480.
   */
  height?: number;
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

function escapeUrl(value: string): string {
  // Keep this conservative: drop everything that could break out of
  // a quoted src attribute or that resembles a javascript: scheme.
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\s*javascript:/i.test(trimmed)) return "";
  return escapeHtml(trimmed);
}

function modeLabel(mode: FocusSubgraph["appliedMode"]): string {
  switch (mode) {
    case "overview":
      return "Overview";
    case "focus":
      return "Focus";
    case "selection":
      return "Selection";
  }
}

function renderMetricsCard(subgraph: FocusSubgraph, state: WorkspaceViewerState): string {
  const m = subgraph.metrics;
  const hops = state.viewState.graph.focusHops;
  const weak = state.viewState.graph.showWeakLinks ? "yes" : "no";
  const focus = state.focusEntityId ? escapeHtml(state.focusEntityId) : "—";
  const fields = [
    `<span><b>Mode:</b> ${modeLabel(subgraph.appliedMode)}</span>`,
    `<span><b>Nodes:</b> ${m.nodes}</span>`,
    `<span><b>Edges:</b> ${m.edges}</span>`,
    `<span><b>Communities:</b> ${m.communities}</span>`,
    `<span><b>Density:</b> ${m.density.toFixed(4)}</span>`,
    `<span><b>Avg degree:</b> ${m.averageDegree.toFixed(2)}</span>`,
    `<span><b>Focus:</b> ${focus}</span>`,
    `<span><b>Hops:</b> ${hops}</span>`,
    `<span><b>Weak links:</b> ${weak}</span>`,
  ];
  return [
    '<div class="ws-graph-metrics" role="status" aria-live="polite">',
    ...fields,
    "</div>",
  ].join("");
}

function renderViewerSurface(opts: RenderGraphPanelOptions): string {
  const height = Math.max(120, Math.round(opts.height ?? 480));
  const url = opts.graphHtmlUrl ? escapeUrl(opts.graphHtmlUrl) : "";
  if (!url) {
    return [
      '<div class="ws-graph-placeholder" id="ws-graph-network">',
      "<p>Graph surface unavailable.</p>",
      "</div>",
    ].join("");
  }
  return [
    '<iframe',
    `  src="${url}"`,
    `  title="Graphify graph surface"`,
    `  style="width:100%;height:${height}px;border:1px solid var(--ws-border);border-radius:var(--ws-radius-md);background:var(--ws-surface);"`,
    '  sandbox="allow-scripts"',
    "></iframe>",
  ].join("\n");
}

export function renderGraphPanel(opts: RenderGraphPanelOptions): string {
  const subgraph = computeFocusSubgraph(opts.graph, opts.state);
  const styles = [
    "<style>",
    ".ws-graph-metrics { display: flex; flex-wrap: wrap; gap: var(--ws-space-3); font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); margin-bottom: var(--ws-space-3); }",
    ".ws-graph-metrics b { color: var(--ws-text); font-weight: 600; }",
    ".ws-graph-placeholder { padding: var(--ws-space-4); border: 1px dashed var(--ws-border); border-radius: var(--ws-radius-md); color: var(--ws-text-muted); }",
    ".ws-graph-placeholder code { background: var(--ws-surface-2); padding: 0 var(--ws-space-1); border-radius: var(--ws-radius-sm); }",
    "</style>",
  ].join("\n");
  return [styles, renderMetricsCard(subgraph, opts.state), renderViewerSurface(opts)].join("\n");
}

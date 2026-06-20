/**
 * Track G Lot 1 / G4 — graph panel renderer.
 *
 * Server-rendered metrics header for the legacy ontology-studio workspace. The
 * interactive visual surface is now the static Ontology Studio export (see
 * `graphify studio export`); this panel only renders the focus-subgraph metrics
 * header, which reflects the viewer state (focus / hops / showWeakLinks /
 * selection) and gives an immediate read on how a state change reshapes the
 * slice.
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
  /**
   * Optional height of the placeholder, in CSS pixels. Defaults to 480.
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
  // DS UX-writing (no-em-dash): use a word, not an em dash, for the empty state.
  const focus = state.focusEntityId ? escapeHtml(state.focusEntityId) : "none";
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
  return [
    `<div class="ws-graph-placeholder" id="ws-graph-network" style="min-height:${height}px;">`,
    "<p>Interactive graph available via the static Ontology Studio export.</p>",
    "<p>Run <code>graphify studio export &lt;out&gt;</code> and open the bundle in any static server.</p>",
    "</div>",
  ].join("");
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
  return [
    styles,
    renderMetricsCard(subgraph, opts.state),
    renderViewerSurface(opts),
  ].filter(Boolean).join("\n");
}

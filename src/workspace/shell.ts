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

import type { WorkspaceTokens } from "./tokens.js";
import { serialiseTokensToCss } from "./tokens-fallback.js";

export interface RenderWorkspaceShellOptions {
  /** Resolved tokens for the active theme. */
  tokens: WorkspaceTokens;
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
  const title = escapeHtml(opts.title);
  const profileId = opts.profileId ? escapeHtml(opts.profileId) : "—";
  const lastRebuiltAt = opts.lastRebuiltAt ? escapeHtml(opts.lastRebuiltAt) : "";
  const writeFlag = opts.writeEnabled === true;
  const queueEmpty = opts.queueEmpty === true;
  const tokensCss = serialiseTokensToCss(tokens);
  const queueBody = queueEmpty
    ? '<p class="ws-empty" id="ws-queue-empty">Reconciliation queue is empty.</p>'
    : '<p class="ws-empty" id="ws-queue-stub">Queue rendering arrives in G5.</p>';
  const graphPanelBody =
    opts.graphPanelHtml ??
    '<p class="ws-empty">No graph context available.</p>';

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
    '<div class="ws-root" role="application" aria-label="Graphify ontology workspace">',
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
    '<p class="ws-empty">No display item selected.</p>',
    '<section class="ws-graph-panel" id="graph-panel" role="region" aria-label="Graph panel">',
    '<h2 class="ws-region-heading">Graph panel</h2>',
    graphPanelBody,
    "</section>",
    "</main>",
    '<aside class="ws-right" id="right-drawer" role="complementary" aria-label="Detail drawer">',
    '<h2 class="ws-region-heading">Detail</h2>',
    '<p class="ws-empty">Evidence / relations / audit trail accordion arrives with G5.</p>',
    "</aside>",
    "</div>",
    "</body>",
    "</html>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

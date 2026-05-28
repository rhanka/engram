import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { assertGraphJsonFileSize } from "./graph-size-guard.js";

import type {
  OntologyPatchContext,
  OntologyReconciliationDecisionLogResponse,
} from "./ontology-patch.js";
import {
  getOntologyRebuildStatus,
  getOntologyReconciliationCandidate,
  listOntologyReconciliationCandidates,
  previewOntologyDecisionLog,
  type OntologyRebuildStatusResponse,
} from "./ontology-reconciliation-api.js";
import type {
  OntologyReconciliationCandidate,
  OntologyReconciliationCandidatesResponse,
} from "./ontology-reconciliation.js";
import {
  createDefaultViewerState,
  getWorkspaceTokens,
  renderGraphPanel,
  renderWorkspaceShell,
  type GraphLike,
  type GraphNodeLike,
} from "./workspace/index.js";

interface ReconciliationWorkspaceModel {
  writeEnabled: boolean;
  candidates: OntologyReconciliationCandidatesResponse | null;
  candidatesError: string | null;
  selectedCandidate: OntologyReconciliationCandidate | null;
  selectedCandidateError: string | null;
  decisionLog: OntologyReconciliationDecisionLogResponse | null;
  decisionLogError: string | null;
  rebuildStatus: OntologyRebuildStatusResponse | null;
  graph: GraphLike | null;
  graphHtmlUrl: string | null;
  liveGraphHtmlUrl: string | null;
}

export interface RenderOntologyStudioWorkspaceOptions {
  writeEnabled: boolean;
  selectedCandidateId?: string;
  /**
   * Active view requested by the live HTTP route. One of
   * "workspace" | "reconciliation" | "evidence". Defaults to "workspace"
   * (G6-3 S2.1bis: Workspace is the default tab).
   */
  activeView?: "workspace" | "reconciliation" | "evidence";
}

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

function candidateHref(id: string): string {
  return `/?candidate=${encodeURIComponent(id)}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderStudioStyles(): string {
  return [
    "<style>",
    ".ws-recon-stack { display: grid; gap: var(--ws-space-3); }",
    ".ws-recon-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ws-space-2); color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); }",
    ".ws-recon-pill { border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); padding: 2px var(--ws-space-2); background: var(--ws-surface-2); color: var(--ws-text); }",
    ".ws-recon-list { display: grid; gap: var(--ws-space-2); }",
    ".ws-recon-row { display: grid; gap: 2px; padding: var(--ws-space-2); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-md); color: var(--ws-text); text-decoration: none; background: var(--ws-surface-2); }",
    ".ws-recon-row[data-selected='true'] { border-color: var(--ws-accent); box-shadow: inset 3px 0 0 var(--ws-accent); }",
    ".ws-recon-row small, .ws-recon-muted { color: var(--ws-text-muted); }",
    // G6-4 — compact candidate / canonical descriptive block.
    ".ws-recon-candidate { display: grid; gap: var(--ws-space-2); max-width: 88ch; }",
    ".ws-recon-candidate h3 { margin: 0; font-size: var(--ws-font-size-lg); line-height: var(--ws-line-height-tight); }",
    ".ws-display-kicker { font-size: var(--ws-font-size-sm); color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }",
    ".ws-recon-compare { display: grid; gap: var(--ws-space-1); }",
    ".ws-recon-mapping { margin: 0; font-weight: 600; line-height: var(--ws-line-height-tight); overflow-wrap: anywhere; }",
    ".ws-recon-mapping .ws-recon-arrow { color: var(--ws-text-muted); margin: 0 var(--ws-space-1); }",
    ".ws-recon-ids { margin: 0; color: var(--ws-text-muted); font-family: var(--ws-font-family-mono); font-size: var(--ws-font-size-sm); overflow-wrap: anywhere; }",
    ".ws-recon-meta-inline { margin: 0; color: var(--ws-text); font-size: var(--ws-font-size-sm); }",
    ".ws-recon-meta-inline .ws-recon-sep { color: var(--ws-text-muted); margin: 0 var(--ws-space-1); }",
    ".ws-recon-line { margin: 0; font-size: var(--ws-font-size-sm); color: var(--ws-text); overflow-wrap: anywhere; }",
    ".ws-recon-line-key { color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-right: var(--ws-space-1); }",
    ".ws-recon-summary { margin: var(--ws-space-1) 0 0; display: grid; gap: var(--ws-space-1); font-size: var(--ws-font-size-sm); }",
    ".ws-recon-summary > div { display: grid; grid-template-columns: minmax(8rem, 22%) 1fr; gap: var(--ws-space-2); align-items: baseline; }",
    ".ws-recon-summary dt { margin: 0; color: var(--ws-text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: var(--ws-font-size-sm); font-weight: 600; }",
    ".ws-recon-summary dd { margin: 0; color: var(--ws-text); overflow-wrap: anywhere; }",
    ".ws-recon-summary-empty { color: var(--ws-text-muted); font-style: italic; }",
    ".ws-recon-list-inline { margin: 0; padding-left: var(--ws-space-4); }",
    ".ws-recon-warning { border: 1px solid var(--ws-warning); color: var(--ws-warning); border-radius: var(--ws-radius-md); padding: var(--ws-space-2); background: var(--ws-surface-2); }",
    ".ws-recon-accordion { border: 1px solid var(--ws-border); border-radius: var(--ws-radius-md); padding: var(--ws-space-2); background: var(--ws-surface); }",
    ".ws-recon-accordion summary { cursor: pointer; font-weight: 600; }",
    "@media (max-width: 768px) { .ws-recon-summary > div { grid-template-columns: 1fr; gap: 2px; } }",
    "</style>",
  ].join("\n");
}

function renderList(values: readonly string[], empty: string): string {
  if (values.length === 0) return `<p class="ws-empty">${escapeHtml(empty)}</p>`;
  return [
    '<ul class="ws-recon-list-inline">',
    ...values.map((value) => `<li>${escapeHtml(value)}</li>`),
    "</ul>",
  ].join("");
}

function displayText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function graphNodeById(graph: GraphLike | null, id: string): GraphNodeLike | null {
  return (graph?.nodes ?? []).find((node) => node.id === id) ?? null;
}

function graphNodeTitle(node: GraphNodeLike | null, fallbackId: string): string {
  return (
    displayText(node?.label) ??
    displayText(node?.title) ??
    displayText(node?.name) ??
    fallbackId
  );
}

function graphNodeType(node: GraphNodeLike | null): string | null {
  return (
    displayText(node?.node_type) ??
    displayText(node?.type) ??
    displayText(node?.kind) ??
    displayText(node?.file_type)
  );
}

function graphNodeSummary(node: GraphNodeLike | null): string | null {
  return (
    displayText(node?.description) ??
    displayText(node?.summary) ??
    displayText(node?.body)
  );
}

function graphNodeCommunity(node: GraphNodeLike | null): string | null {
  return (
    displayText(node?.community_name) ??
    (typeof node?.community === "number" ? `Community ${node.community}` : null)
  );
}

function graphNodeStatus(node: GraphNodeLike | null): string | null {
  return displayText(node?.status);
}

function graphNodeConfidence(node: GraphNodeLike | null): string | null {
  return displayText(node?.confidence);
}

function graphNodeSourcePath(node: GraphNodeLike | null): string | null {
  const file = displayText(node?.source_file);
  const loc = displayText(node?.source_location);
  if (!file) return null;
  return loc ? `${file}:${loc}` : file;
}

function pickFirst<T>(values: ReadonlyArray<T | null | undefined>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return null;
}

interface CompactMetaInline {
  type: string | null;
  status: string | null;
  confidence: string | null;
}

function compactMetaInline(
  candidateNode: GraphNodeLike | null,
  canonicalNode: GraphNodeLike | null,
): CompactMetaInline {
  // Prefer the canonical's authoritative facts; fall back to the
  // candidate's when canonical is missing. This matches the PROCESS_STD
  // workspace's "one line of meta" pattern — a single authoritative
  // pair, not two diverging stacks.
  return {
    type: pickFirst([graphNodeType(canonicalNode), graphNodeType(candidateNode)]),
    status: pickFirst([graphNodeStatus(canonicalNode), graphNodeStatus(candidateNode)]),
    confidence: pickFirst([
      graphNodeConfidence(canonicalNode),
      graphNodeConfidence(candidateNode),
    ]),
  };
}

function renderInlineMetaRow(meta: CompactMetaInline): string {
  const parts: string[] = [];
  if (meta.type) parts.push(escapeHtml(meta.type));
  if (meta.status) parts.push(escapeHtml(meta.status));
  if (meta.confidence) parts.push(escapeHtml(meta.confidence));
  if (parts.length === 0) return "";
  return [
    '<p class="ws-recon-meta-inline">',
    parts.join('<span class="ws-recon-sep">·</span>'),
    "</p>",
  ].join("");
}

function renderKeyValueLine(slug: string, key: string, value: string | null): string {
  if (!value) return "";
  return [
    `<p class="ws-recon-line" data-line="${escapeHtml(slug)}">`,
    `<span class="ws-recon-line-key">${escapeHtml(key)}</span>`,
    escapeHtml(value),
    "</p>",
  ].join("");
}

function renderSummaryRow(
  slug: string,
  label: string,
  items: readonly string[],
  empty: string,
): string {
  const safeItems = items.filter((item) => typeof item === "string" && item.trim().length > 0);
  const body =
    safeItems.length === 0
      ? `<span class="ws-recon-summary-empty">${escapeHtml(empty)}</span>`
      : safeItems.map((item) => escapeHtml(item)).join("; ");
  return [
    "<div>",
    `<dt data-term="${escapeHtml(slug)}">${escapeHtml(label)}</dt>`,
    `<dd data-term="${escapeHtml(slug)}">${body}</dd>`,
    "</div>",
  ].join("");
}

function renderCompactMapping(
  candidateId: string,
  canonicalId: string,
  candidateNode: GraphNodeLike | null,
  canonicalNode: GraphNodeLike | null,
): string {
  const candidateLabel = graphNodeTitle(candidateNode, candidateId);
  const canonicalLabel = graphNodeTitle(canonicalNode, canonicalId);
  const meta = compactMetaInline(candidateNode, canonicalNode);
  const summary = graphNodeSummary(canonicalNode) ?? graphNodeSummary(candidateNode);
  return [
    '<section class="ws-recon-compare" data-recon-compare="candidate-canonical">',
    [
      '<p class="ws-recon-mapping">',
      escapeHtml(candidateLabel),
      '<span class="ws-recon-arrow" aria-hidden="true">→</span>',
      escapeHtml(canonicalLabel),
      "</p>",
    ].join(""),
    [
      '<p class="ws-recon-ids">',
      escapeHtml(candidateId),
      '<span class="ws-recon-arrow" aria-hidden="true">→</span>',
      escapeHtml(canonicalId),
      "</p>",
    ].join(""),
    renderInlineMetaRow(meta),
    summary ? `<p class="ws-recon-line" data-line="summary">${escapeHtml(summary)}</p>` : "",
    "</section>",
  ]
    .filter(Boolean)
    .join("");
}

function renderWorkbench(model: ReconciliationWorkspaceModel): string {
  if (model.candidatesError) {
    return `<p class="ws-empty" id="ws-queue-empty">${escapeHtml(model.candidatesError)}</p>`;
  }
  const candidates = model.candidates;
  if (!candidates || candidates.items.length === 0) {
    return '<p class="ws-empty" id="ws-queue-empty">Reconciliation queue is empty.</p>';
  }
  const selectedId = model.selectedCandidate?.id ?? "";
  return [
    '<div class="ws-recon-stack" id="candidate-list">',
    '<div class="ws-recon-toolbar" role="status">',
    `<span class="ws-recon-pill">${candidates.total} candidate(s)</span>`,
    `<span class="ws-recon-pill">stale: ${candidates.stale ? "yes" : "no"}</span>`,
    `<span class="ws-recon-pill">mode: ${model.writeEnabled ? "write" : "read-only"}</span>`,
    "</div>",
    '<nav class="ws-recon-list" aria-label="Reconciliation candidates">',
    ...candidates.items.map((candidate) => [
      `<a class="ws-recon-row" href="${candidateHref(candidate.id)}" data-selected="${candidate.id === selectedId ? "true" : "false"}">`,
      `<strong>${escapeHtml(candidate.id)}</strong>`,
      `<small>${escapeHtml(candidate.candidate_id)} -> ${escapeHtml(candidate.canonical_id)}</small>`,
      `<small>${escapeHtml(candidate.proposed_patch_operation)} - score ${percent(candidate.score)}</small>`,
      "</a>",
    ].join("")),
    "</nav>",
    "</div>",
  ].join("");
}

function renderCentralDisplay(model: ReconciliationWorkspaceModel): string {
  const candidate = model.selectedCandidate;
  if (model.selectedCandidateError) {
    return [
      renderStudioStyles(),
      `<p class="ws-empty">${escapeHtml(model.selectedCandidateError)}</p>`,
    ].join("");
  }
  if (!candidate) {
    return [
      renderStudioStyles(),
      '<p class="ws-empty">No reconciliation candidate selected.</p>',
    ].join("");
  }
  const candidateNode = graphNodeById(model.graph, candidate.candidate_id);
  const canonicalNode = graphNodeById(model.graph, candidate.canonical_id);
  // G6-4 (closes G6-1 S0.2 debt) — compact prose layout.
  //  - One <h3> for the reconcile id (kicker above it).
  //  - One toolbar row with the 4 pill chips.
  //  - One compact compare block: label mapping + id mapping + inline
  //    Type · Status · Confidence row.
  //  - Source / Community as single-line Key: value prose.
  //  - Shared terms / Reasons / Decision basis collapse to ONE compact
  //    <dl> with small-caps headings (no framed Card boxes).
  const sourcePath = graphNodeSourcePath(canonicalNode) ?? graphNodeSourcePath(candidateNode);
  const community = graphNodeCommunity(canonicalNode) ?? graphNodeCommunity(candidateNode);
  const decisionBasis: string[] = [
    `Operation: ${candidate.proposed_patch_operation}`,
    `Candidate: ${candidate.candidate_id}`,
    `Canonical: ${candidate.canonical_id}`,
    ...candidate.evidence_refs.map((ref) => `Evidence: ${ref}`),
  ];
  return [
    renderStudioStyles(),
    `<article class="ws-recon-candidate" data-candidate-id="${escapeHtml(candidate.id)}">`,
    '<div class="ws-display-kicker">Reconciliation candidate</div>',
    `<h3>${escapeHtml(candidate.id)}</h3>`,
    '<div class="ws-recon-toolbar">',
    `<span class="ws-recon-pill">${escapeHtml(candidate.kind)}</span>`,
    `<span class="ws-recon-pill">${escapeHtml(candidate.status)}</span>`,
    `<span class="ws-recon-pill">score ${percent(candidate.score)}</span>`,
    `<span class="ws-recon-pill">${escapeHtml(candidate.proposed_patch_operation)}</span>`,
    "</div>",
    model.candidates?.stale || model.rebuildStatus?.needs_update
      ? '<p class="ws-recon-warning">Queue may be stale. Rebuild before applying this patch.</p>'
      : "",
    renderCompactMapping(
      candidate.candidate_id,
      candidate.canonical_id,
      candidateNode,
      canonicalNode,
    ),
    renderKeyValueLine("source", "Source:", sourcePath),
    renderKeyValueLine("community", "Community:", community),
    '<dl class="ws-recon-summary" data-recon-summary="true">',
    renderSummaryRow(
      "shared-terms",
      "SHARED TERMS",
      candidate.shared_terms,
      "No shared terms.",
    ),
    renderSummaryRow("reasons", "REASONS", candidate.reasons, "No reasons."),
    renderSummaryRow(
      "decision-basis",
      "DECISION BASIS",
      decisionBasis,
      "No decision basis.",
    ),
    "</dl>",
    "</article>",
  ]
    .filter(Boolean)
    .join("");
}

function renderDrawer(model: ReconciliationWorkspaceModel): string {
  const candidate = model.selectedCandidate;
  const evidence = candidate?.evidence_refs ?? [];
  const seenPatchIds = new Set<string>();
  const decisions = (model.decisionLog?.items ?? []).filter((item) => {
    const id = typeof item.patch.id === "string" ? item.patch.id : "";
    if (!id || seenPatchIds.has(id)) return false;
    seenPatchIds.add(id);
    return true;
  });
  return [
    '<div class="ws-recon-stack">',
    '<details class="ws-recon-accordion" open>',
    "<summary>Evidence</summary>",
    renderList(evidence, "No evidence refs on the selected candidate."),
    "</details>",
    '<details class="ws-recon-accordion" open>',
    "<summary>Audit trail</summary>",
    model.decisionLogError
      ? `<p class="ws-empty">${escapeHtml(model.decisionLogError)}</p>`
      : renderList(
        decisions.map((item) => {
          const id = typeof item.patch.id === "string" ? item.patch.id : "unknown";
          const operation = typeof item.patch.operation === "string" ? item.patch.operation : "unknown";
          return `${id} - ${operation} - ${item.source}`;
        }),
        "No audit entries.",
      ),
    "</details>",
    '<details class="ws-recon-accordion">',
    "<summary>Rebuild status</summary>",
    model.rebuildStatus
      ? renderList([
        `needs_update: ${model.rebuildStatus.needs_update ? "yes" : "no"}`,
        `candidates_match: ${model.rebuildStatus.candidates_match ? "yes" : "no"}`,
        `decision_log_available: ${model.rebuildStatus.decision_log_available ? "yes" : "no"}`,
      ], "No rebuild status.")
      : '<p class="ws-empty">No rebuild status.</p>',
    "</details>",
    "</div>",
  ].join("");
}

function renderGraphContext(model: ReconciliationWorkspaceModel): string {
  const status = model.rebuildStatus;
  if (!model.graph) {
    return status
      ? [
        '<div class="ws-recon-toolbar" role="status">',
        `<span class="ws-recon-pill">graph: ${escapeHtml(status.graph_hash ?? "unknown")}</span>`,
        `<span class="ws-recon-pill">profile: ${escapeHtml(status.profile_hash ?? "unknown")}</span>`,
        `<span class="ws-recon-pill">candidates: ${escapeHtml(status.candidates.candidate_count ?? 0)}</span>`,
        "</div>",
      ].join("")
      : '<p class="ws-empty">No graph context available.</p>';
  }
  const state = createDefaultViewerState();
  state.viewState.graph.mode = "overview";
  return renderGraphPanel({
    graph: model.graph,
    state,
    tokens: getWorkspaceTokens(),
    ...(model.graphHtmlUrl ? { graphHtmlUrl: model.graphHtmlUrl } : {}),
    ...(model.liveGraphHtmlUrl ? { liveGraphHtmlUrl: model.liveGraphHtmlUrl } : {}),
    height: 560,
    // G-studio-lot2 (#3, #4): the embedded canvas runs in studio mode — full
    // center, shapes/edges legend only, no community list / node-info panel.
    studioMode: true,
  });
}

function loadGraph(stateDir: string): GraphLike | null {
  const graphPath = join(stateDir, "graph.json");
  if (!existsSync(graphPath)) return null;
  try {
    assertGraphJsonFileSize(graphPath, "read");
    return JSON.parse(readFileSync(graphPath, "utf-8")) as GraphLike;
  } catch {
    return null;
  }
}

function graphHtmlUrl(stateDir: string): string | null {
  const graphHtmlPath = join(stateDir, "graph.html");
  return existsSync(graphHtmlPath) ? pathToFileURL(graphHtmlPath).href : null;
}

function liveGraphHtmlUrl(stateDir: string): string | null {
  return existsSync(join(stateDir, "graph.html")) ? "/api/ontology/artifacts/graph.html" : null;
}

function buildModel(
  context: OntologyPatchContext,
  opts: RenderOntologyStudioWorkspaceOptions,
): ReconciliationWorkspaceModel {
  let candidates: OntologyReconciliationCandidatesResponse | null = null;
  let candidatesError: string | null = null;
  try {
    candidates = listOntologyReconciliationCandidates(context, {
      sort: "score",
      order: "desc",
      limit: 50,
    });
  } catch (error) {
    candidatesError = error instanceof Error ? error.message : String(error);
  }

  const selectedCandidateId = opts.selectedCandidateId ?? candidates?.items[0]?.id;
  let selectedCandidate: OntologyReconciliationCandidate | null = null;
  let selectedCandidateError: string | null = null;
  if (selectedCandidateId) {
    try {
      selectedCandidate = getOntologyReconciliationCandidate(context, selectedCandidateId);
    } catch (error) {
      selectedCandidateError = error instanceof Error ? error.message : String(error);
    }
  }

  let decisionLog: OntologyReconciliationDecisionLogResponse | null = null;
  let decisionLogError: string | null = null;
  try {
    decisionLog = previewOntologyDecisionLog(context, { source: "both", limit: 20 });
  } catch (error) {
    decisionLogError = error instanceof Error ? error.message : String(error);
  }

  let rebuildStatus: OntologyRebuildStatusResponse | null = null;
  try {
    rebuildStatus = getOntologyRebuildStatus(context);
  } catch {
    rebuildStatus = null;
  }

  return {
    writeEnabled: opts.writeEnabled,
    candidates,
    candidatesError,
    selectedCandidate,
    selectedCandidateError,
    decisionLog,
    decisionLogError,
    rebuildStatus,
    graph: loadGraph(context.stateDir),
    graphHtmlUrl: graphHtmlUrl(context.stateDir),
    liveGraphHtmlUrl: liveGraphHtmlUrl(context.stateDir),
  };
}

export function renderOntologyStudioWorkspace(
  context: OntologyPatchContext,
  opts: RenderOntologyStudioWorkspaceOptions,
): string {
  const activeView = opts.activeView ?? "workspace";
  const model = buildModel(context, opts);
  const state = createDefaultViewerState();
  state.activeView = activeView;
  const tokens = getWorkspaceTokens();

  if (activeView === "reconciliation") {
    // G6-3 S2.2: candidate workbench in the left rail, compact
    // candidate/canonical comparison in central, evidence/audit/rebuild
    // drawer in the right slot.
    state.selectionState = {
      kind: "candidate-queue",
      ref: "queue:reconciliation",
      entityIds: model.candidates?.items.map((candidate) => candidate.candidate_id) ?? [],
    };
    state.displayRef = model.selectedCandidate
      ? `candidate:${model.selectedCandidate.id}`
      : null;
    state.focusEntityId = model.selectedCandidate?.candidate_id ?? null;
    state.drawerOpen = Boolean(model.selectedCandidate);
    state.viewState.graph.mode = "overview";

    return renderWorkspaceShell({
      tokens,
      tokenSource: "fallback",
      title: "Graphify Ontology Studio",
      profileId: context.profile.id,
      writeEnabled: opts.writeEnabled,
      queueEmpty: (model.candidates?.items.length ?? 0) === 0,
      state,
      leftWorkbenchHtml: renderWorkbench(model),
      centralDisplayHtml: renderCentralDisplay(model),
      rightDrawerHtml: renderDrawer(model),
      graphPanelHtml: renderGraphContext(model),
    });
  }

  if (activeView === "evidence") {
    // The shell renders the placeholder body for `activeView ===
    // "evidence"`. We pass nothing else through so the central area is
    // the placeholder unambiguously.
    return renderWorkspaceShell({
      tokens,
      tokenSource: "fallback",
      title: "Graphify Ontology Studio",
      profileId: context.profile.id,
      writeEnabled: opts.writeEnabled,
      state,
    });
  }

  // Default: workspace tab. The G6-2 left rail (search/types/selected/
  // facets/results) renders naturally — no `leftWorkbenchHtml`
  // override. The right slot stays hidden via the shell's slot
  // visibility rules. The central column shows the compact prose for
  // the currently selected entity (or the empty hint).
  state.viewState.graph.mode = "selection";

  return renderWorkspaceShell({
    tokens,
    tokenSource: "fallback",
    title: "Graphify Ontology Studio",
    profileId: context.profile.id,
    writeEnabled: opts.writeEnabled,
    queueEmpty: (model.candidates?.items.length ?? 0) === 0,
    state,
    ...(model.graph ? { graph: model.graph } : {}),
    graphPanelHtml: renderGraphContext(model),
  });
}

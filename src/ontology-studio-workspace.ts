import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  renderEntityPanel,
  renderGraphPanel,
  renderWorkspaceShell,
  type EntityPanelOccurrences,
  type GraphLike,
  type GraphNodeLike,
  type WorkspaceDescriptionSidecar,
} from "./workspace/index.js";
import type { WikiDescriptionSidecarIndex } from "./wiki-descriptions.js";

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
}

export interface RenderOntologyStudioWorkspaceOptions {
  writeEnabled: boolean;
  selectedCandidateId?: string;
  /**
   * G-studio-lot4 (#7): the node id selected for the right-column entity
   * panel (from `?node=<id>`). Only honoured in the default Workspace view.
   */
  selectedNodeId?: string;
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
    ".ws-recon-actions { display: grid; gap: var(--ws-space-2); margin-bottom: var(--ws-space-2); }",
    ".ws-recon-actions h4 { margin: 0; font-size: var(--ws-font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; color: var(--ws-text-muted); }",
    ".ws-recon-actions-grid { display: grid; gap: var(--ws-space-2); grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); }",
    ".ws-recon-action-btn { border: 1px solid var(--ws-border); border-radius: var(--ws-radius-sm); padding: 0.35rem var(--ws-space-2); background: var(--ws-surface); color: var(--ws-text); font-size: var(--ws-font-size-sm); cursor: pointer; }",
    ".ws-recon-action-btn:hover { border-color: var(--ws-accent); }",
    ".ws-recon-action-btn:disabled { opacity: 0.6; cursor: not-allowed; }",
    ".ws-recon-actions[data-write='false'] { opacity: 0.7; }",
    ".ws-recon-actions[data-write='false'] .ws-recon-action-btn { pointer-events: none; }",
    ".ws-recon-actions-result { margin: 0; min-height: 74px; max-height: 220px; overflow: auto; white-space: pre-wrap; font-family: var(--ws-font-family-mono); font-size: var(--ws-font-size-sm); border: 1px solid var(--ws-border); border-radius: var(--ws-radius-md); padding: var(--ws-space-2); background: var(--ws-surface); color: var(--ws-text); }",
    ".ws-recon-actions-result[data-state='empty'] { color: var(--ws-text-muted); font-style: italic; }",
    ".ws-recon-actions-meta { margin: 0; color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); }",
    ".ws-recon-actions-note { margin: 0; color: var(--ws-text-muted); font-size: var(--ws-font-size-sm); }",
    ".ws-recon-actions-note[data-error='true'] { color: var(--ws-warning); }",
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
  // candidate's when canonical is missing. This matches the ACLP
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

interface ReconciliationActionPanelModel {
  candidateId: string;
  candidateNodeId: string;
  canonicalNodeId: string;
  graphHash: string | null;
  profileHash: string | null;
  evidenceRefs: string[];
  writeEnabled: boolean;
}

function renderScriptTextContent(raw: string): string {
  return raw.replace(/<\//g, "<\\/").replace(/\\u2028/g, "\\u2028");
}

function escapeScriptJson(value: unknown): string {
  return renderScriptTextContent(JSON.stringify(value));
}

function decisionBasisReason(candidate: OntologyReconciliationCandidate): string[] {
  return [
    `Operation: ${candidate.proposed_patch_operation}`,
    `Candidate: ${candidate.candidate_id}`,
    `Canonical: ${candidate.canonical_id}`,
    ...candidate.evidence_refs.map((ref) => `Evidence: ${ref}`),
  ];
}

function renderReconciliationActions(model: ReconciliationWorkspaceModel): string {
  const candidate = model.selectedCandidate;
  if (!candidate) {
    return "";
  }
  const graphHash = model.candidates?.graph_hash ?? model.rebuildStatus?.graph_hash ?? null;
  const profileHash = model.candidates?.profile_hash ?? model.rebuildStatus?.profile_hash ?? null;
  const actionModel: ReconciliationActionPanelModel = {
    candidateId: candidate.id,
    candidateNodeId: candidate.candidate_id,
    canonicalNodeId: candidate.canonical_id,
    graphHash,
    profileHash,
    evidenceRefs: candidate.evidence_refs,
    writeEnabled: model.writeEnabled,
  };
  const readOnlyNote = model.writeEnabled
    ? ""
    : `<p class="ws-recon-actions-note" data-error="true">Enable --write mode to validate and apply reconciliation actions.</p>`;
  const isStale = Boolean(model.candidates?.stale || model.rebuildStatus?.needs_update);
  const staleRow = isStale
    ? `<p class="ws-recon-actions-meta">This queue is marked stale. Validate and dry-run before apply.</p>`
    : "";
  const operationButtons = [
    ["accept_match", "validate", "Validate"],
    ["accept_match", "dry-run", "Dry-run"],
    ["accept_match", "apply", "Apply"],
  ];
  if (candidate.proposed_patch_operation === "accept_match") {
    operationButtons.push(["reject_match", "apply", "Reject"]);
  }

  return [
    '<section class="ws-recon-actions" id="reconciliation-actions" data-write="',
    model.writeEnabled ? "true" : "false",
    '">',
    "<h4>Reconciliation actions</h4>",
    '<p class="ws-recon-actions-meta">Candidate: ',
    `<span>${escapeHtml(candidate.id)}</span></p>`,
    staleRow,
    '<div class="ws-recon-actions-grid">',
    ...operationButtons.map(([operation, action, label]) => [
      `<button class="ws-recon-action-btn" type="button" data-action="${action}" data-operation="${operation}"`,
      model.writeEnabled ? "" : ' disabled',
      `>${label}</button>`,
    ].join("")),
    "</div>",
    readOnlyNote,
    '<pre class="ws-recon-actions-result" id="reconciliation-actions-result" data-state="empty" aria-live="polite">No action run yet.</pre>',
    `<script type="application/json" id="reconciliation-actions-model">${escapeScriptJson(actionModel)}</script>`,
    "</section>",
  ].join("");
}

function renderReconciliationActionScript(): string {
  return [
    "<script>",
    '"use strict";',
    "(function () {",
    "  const actionsRoot = document.getElementById('reconciliation-actions');",
    "  if (!actionsRoot) return;",
    "  const modelElement = document.getElementById('reconciliation-actions-model');",
    "  if (!modelElement || !modelElement.textContent) return;",
    "  let model;",
    "  try { model = JSON.parse(modelElement.textContent); } catch { return; }",
    "  const result = document.getElementById('reconciliation-actions-result');",
    "  if (!result) return;",
    "  const buttons = actionsRoot.querySelectorAll('[data-action][data-operation]');",
    "  const canWrite = actionsRoot.getAttribute('data-write') === 'true';",
    "  const cacheKey = 'graphify-studio-write-token';",
    "  function setBusy(state) {",
    "    buttons.forEach((button) => {",
    "      if (canWrite) button.disabled = state;",
    "      button.setAttribute('aria-busy', state ? 'true' : 'false');",
    "    });",
    "  }",
    "  function setResult(text) {",
    "    result.textContent = text;",
    "    result.setAttribute('data-state', text ? 'ready' : 'empty');",
    "  }",
    "  function readToken() {",
    "    if (!canWrite) return null;",
    "    if (typeof window === 'undefined') return null;",
    "    const directToken = (window.localStorage && window.localStorage.getItem(cacheKey)) || '';",
    "    if (directToken) return directToken;",
    "    const entered = window.prompt('Bearer token for ontology patch API:');",
    "    if (!entered) return null;",
    "    const token = entered.trim();",
    "    if (!token) return null;",
    "    window.localStorage.setItem(cacheKey, token);",
    "    return token;",
    "  }",
    "  function tokenHeaders(token) {",
    "    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };",
    "    return headers;",
    "  }",
    "  function patchId(action, operation) {",
    "    return `studio:${action}:${operation}:${Date.now()}`;",
    "  }",
    "  function buildPatch(operation, action) {",
    "    const target = operation === 'reject_match'",
    "      ? { candidate_id: model.candidateNodeId }",
    "      : { candidate_id: model.candidateNodeId, canonical_id: model.canonicalNodeId };",
    "    return {",
    "      schema: 'engram_ontology_patch_v1',",
    "      id: patchId(model.candidateId, action),",
    "      operation,",
    "      status: 'proposed',",
    "      profile_hash: model.profileHash || '',",
    "      graph_hash: model.graphHash || '',",
    "      target,",
    "      evidence_refs: model.evidenceRefs || [],",
    "      reason: `Reconciliation ${action} for ${model.candidateId}`,",
    "      author: 'studio-ui',",
    "      created_at: new Date().toISOString(),",
    "    };",
    "  }",
    "  async function runAction(event) {",
    "    const button = event.target.closest ? event.target.closest('button[data-action][data-operation]') : null;",
    "    if (!button || button.disabled) return;",
    "    const action = button.getAttribute('data-action');",
    "    const operation = button.getAttribute('data-operation');",
    "    if (!action || !operation) return;",
    "    let endpoint = '/api/ontology/patch/validate';",
    "    if (action === 'dry-run') endpoint = '/api/ontology/patch/dry-run';",
    "    if (action === 'apply') endpoint = '/api/ontology/patch/apply';",
    "    const token = readToken();",
    "    if (!token) {",
    "      setResult('Missing bearer token. Set one to run this action.');",
    "      return;",
    "    }",
    "    const payload = buildPatch(operation, `${action}:${operation}`);",
    "    setBusy(true);",
    "    setResult('Running...');",
    "    try {",
    "      const response = await fetch(endpoint, {",
    "        method: 'POST',",
    "        headers: tokenHeaders(token),",
    "        body: JSON.stringify(payload),",
    "      });",
    "      const data = await response.json();",
    "      if (!response.ok) {",
    "        setResult(`Error ${response.status}: ${JSON.stringify(data)}`);",
    "        return;",
    "      }",
    "      if (action === 'apply' && operation === 'accept_match' && data && data.valid) {",
    "        setResult(JSON.stringify(data, null, 2) + '\\n\\nTip: a rebuild is required after apply.');",
    "        return;",
    "      }",
    "      setResult(JSON.stringify(data, null, 2));",
    "    } catch (error) {",
    "      setResult(`Network or JSON error: ${String(error)}`);",
    "    } finally {",
    "      setBusy(false);",
    "    }",
    "  }",
    "  function init() {",
    "    buttons.forEach((button) => button.addEventListener('click', runAction));",
    "  }",
    "  init();",
    "})();",
    "</script>",
  ].join("\n");
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
  const decisionBasis = decisionBasisReason(candidate);
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
    renderReconciliationActions(model),
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
    height: 560,
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

/**
 * G-studio-lot4 (#7): best-effort load of the wiki description sidecar index.
 * Tries the assistant-merged sidecar first (the curated/merged output), then
 * the plain index. A missing / malformed file is silently ignored — the
 * entity panel just omits descriptions.
 */
function loadDescriptionIndex(stateDir: string): WikiDescriptionSidecarIndex | null {
  const candidates = [
    join(stateDir, "wiki", "descriptions.assistant-merged.json"),
    join(stateDir, "wiki", "descriptions.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8")) as WikiDescriptionSidecarIndex;
      if (parsed && typeof parsed === "object" && parsed.nodes) return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/**
 * G-studio-lot4 (#7, intent points 5 & 6): best-effort load of the occurrence
 * / citation sidecar. The schema is profile-driven; this reader tolerates a
 * few common shapes and returns a node-id -> occurrence map. A missing /
 * empty file yields an empty map (the panel omits the section).
 */
function loadOccurrences(stateDir: string): EntityPanelOccurrences {
  // `occurrences.json` is now the canonical mention-level LIST. The Studio
  // consumes the deliberately derived node-id map so it never conflates the
  // two schemas. Fall back to the legacy occurrence map when no sidecar exists.
  const summaryPath = join(stateDir, "ontology", "entity-occurrence-summary.json");
  const path = existsSync(summaryPath) ? summaryPath : join(stateDir, "ontology", "occurrences.json");
  if (!existsSync(path)) return {};
  try {
    return normaliseOccurrences(JSON.parse(readFileSync(path, "utf-8")) as unknown);
  } catch {
    return {};
  }
}

function normaliseOccurrences(raw: unknown): EntityPanelOccurrences {
  const out: EntityPanelOccurrences = {};
  if (!raw || typeof raw !== "object") return out;
  // Accept either a top-level map { nodes: {...} } or a bare map keyed by id.
  const nodes =
    (raw as { nodes?: unknown }).nodes && typeof (raw as { nodes?: unknown }).nodes === "object"
      ? (raw as { nodes: Record<string, unknown> }).nodes
      : (raw as Record<string, unknown>);
  for (const [id, value] of Object.entries(nodes)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const documents: Record<string, number> = {};
    const rawDocs = entry.documents ?? entry.per_document ?? entry.by_document;
    if (rawDocs && typeof rawDocs === "object") {
      for (const [doc, count] of Object.entries(rawDocs as Record<string, unknown>)) {
        if (typeof count === "number" && Number.isFinite(count)) documents[doc] = count;
      }
    }
    const snippets: string[] = [];
    const rawSnippets = entry.snippets ?? entry.quotes ?? entry.excerpts;
    if (Array.isArray(rawSnippets)) {
      for (const s of rawSnippets) if (typeof s === "string") snippets.push(s);
    }
    const total =
      typeof entry.total === "number"
        ? entry.total
        : typeof entry.count === "number"
          ? entry.count
          : undefined;
    out[id] = {
      ...(total !== undefined ? { total } : {}),
      ...(Object.keys(documents).length > 0 ? { documents } : {}),
      ...(snippets.length > 0 ? { snippets } : {}),
    };
  }
  return out;
}

function descriptionSidecarFor(
  index: WikiDescriptionSidecarIndex | null,
  nodeId: string,
): WorkspaceDescriptionSidecar | undefined {
  const entry = index?.nodes?.[nodeId];
  if (!entry) return undefined;
  if (entry.status === "generated") {
    return {
      status: "generated",
      target_id: nodeId,
      target_kind: "node",
      description: entry.description ?? null,
    };
  }
  return { status: "insufficient_evidence", target_id: nodeId, target_kind: "node" };
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

    const shellHtml = renderWorkspaceShell({
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
    return shellHtml.replace("</body>", `${renderReconciliationActionScript()}\n</body>`);
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
  // override. The central column shows the compact prose for the
  // currently selected entity (or the empty hint).
  state.viewState.graph.mode = "selection";

  // G-studio-lot4 (#7): when a node is selected (?node=<id>), render the
  // entity panel — wiki description + relations + evidence snippet +
  // occurrence counts — in the REAL right column.
  let entityPanelHtml: string | undefined;
  const selectedNodeId = opts.selectedNodeId;
  if (selectedNodeId && model.graph) {
    const node = graphNodeById(model.graph, selectedNodeId);
    if (node) {
      state.displayRef = `entity:${selectedNodeId}`;
      state.focusEntityId = selectedNodeId;
      const descriptionIndex = loadDescriptionIndex(context.stateDir);
      const occurrences = loadOccurrences(context.stateDir);
      const descriptionSidecar = descriptionSidecarFor(descriptionIndex, selectedNodeId);
      entityPanelHtml = renderEntityPanel({
        node,
        graph: model.graph,
        ...(descriptionSidecar ? { descriptionSidecar } : {}),
        occurrences,
      });
    }
  }

  // G-studio-lot4 (#7): no-Svelte progressive enhancement — clicking a
  // result entry (or relation target) navigates to ?node=<id> so the right
  // column shows that entity. Generic: it reads the rail's data-display-ref /
  // the entity panel's data-other-id hooks without any corpus coupling.
  const nodeNavScript = [
    "<script>",
    "(() => {",
    '  document.addEventListener("click", (event) => {',
    '    const trigger = event.target.closest("[data-display-ref],[data-other-id]");',
    "    if (!trigger) return;",
    '    const ref = trigger.getAttribute("data-display-ref") || "";',
    '    const other = trigger.getAttribute("data-other-id") || "";',
    "    let nodeId = other;",
    '    if (!nodeId && ref.indexOf("entity:") === 0) nodeId = ref.slice("entity:".length);',
    "    if (!nodeId) return;",
    "    event.preventDefault();",
    "    const target = new URL(window.location.href);",
    '    target.searchParams.set("node", nodeId);',
    '    target.searchParams.set("view", "workspace");',
    "    window.location.assign(target.toString());",
    "  });",
    "})();",
    "</script>",
  ].join("\n");

  const shellHtml = renderWorkspaceShell({
    tokens,
    tokenSource: "fallback",
    title: "Graphify Ontology Studio",
    profileId: context.profile.id,
    writeEnabled: opts.writeEnabled,
    queueEmpty: (model.candidates?.items.length ?? 0) === 0,
    state,
    ...(model.graph ? { graph: model.graph } : {}),
    graphPanelHtml: renderGraphContext(model),
    ...(entityPanelHtml ? { entityPanelHtml } : {}),
  });
  return shellHtml.replace("</body>", `${nodeNavScript}\n</body>`);
}

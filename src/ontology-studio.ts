import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";

import { applyOntologyPatch, validateOntologyPatch } from "./ontology-patch.js";
import { loadOntologyPatchContext } from "./ontology-patch-context.js";
import {
  getOntologyRebuildStatus,
  getOntologyReconciliationCandidate,
  listOntologyReconciliationCandidates,
  previewOntologyDecisionLog,
} from "./ontology-reconciliation-api.js";
import type { OntologyPatchNode, OntologyReconciliationDecisionLogOptions } from "./ontology-patch.js";
import type { OntologyReconciliationCandidate, OntologyReconciliationCandidateFilter } from "./ontology-reconciliation.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "ip6-loopback"]);
const POST_BODY_MAX_BYTES = 256 * 1024;

export interface OntologyStudioWriteOptions {
  token: string;
}

export interface OntologyStudioHandlerOptions {
  profileStatePath: string;
  write?: OntologyStudioWriteOptions;
}

export interface StartOntologyStudioServerOptions {
  profileStatePath: string;
  host?: string;
  port?: number;
  write?: boolean;
  token?: string;
}

export interface StartedOntologyStudioServer {
  server: Server;
  url: string;
  writeEnabled: boolean;
  token?: string;
}

export interface OntologyStudioRouteResult {
  status: number;
  contentType: "application/json; charset=utf-8" | "text/html; charset=utf-8";
  body: string;
}

function optionalString(value: string | null): string | undefined {
  return value !== null && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function optionalInteger(value: string | null): number | undefined {
  const number = optionalNumber(value);
  return number === undefined ? undefined : Math.floor(number);
}

function candidateFilters(searchParams: URLSearchParams): OntologyReconciliationCandidateFilter {
  const filters: OntologyReconciliationCandidateFilter = {};
  const status = optionalString(searchParams.get("status"));
  const kind = optionalString(searchParams.get("kind"));
  const operation = optionalString(searchParams.get("operation"));
  const canonicalId = optionalString(searchParams.get("canonical_id"));
  const candidateId = optionalString(searchParams.get("candidate_id"));
  const query = optionalString(searchParams.get("query"));
  const sort = optionalString(searchParams.get("sort"));
  const order = optionalString(searchParams.get("order"));
  const minScore = optionalNumber(searchParams.get("min_score"));
  const limit = optionalInteger(searchParams.get("limit"));
  const offset = optionalInteger(searchParams.get("offset"));

  if (status) filters.status = status as OntologyReconciliationCandidateFilter["status"];
  if (kind) filters.kind = kind as OntologyReconciliationCandidateFilter["kind"];
  if (operation) filters.operation = operation as OntologyReconciliationCandidateFilter["operation"];
  if (canonicalId) filters.canonical_id = canonicalId;
  if (candidateId) filters.candidate_id = candidateId;
  if (query) filters.query = query;
  if (sort === "score" || sort === "id") filters.sort = sort;
  if (order === "asc" || order === "desc") filters.order = order;
  if (minScore !== undefined) filters.min_score = minScore;
  if (limit !== undefined) filters.limit = limit;
  if (offset !== undefined) filters.offset = offset;

  return filters;
}

function decisionLogOptions(searchParams: URLSearchParams): Omit<
  OntologyReconciliationDecisionLogOptions,
  "authoritativePath" | "auditPath" | "rootDir"
> {
  const options: Omit<OntologyReconciliationDecisionLogOptions, "authoritativePath" | "auditPath" | "rootDir"> = {};
  const source = optionalString(searchParams.get("source"));
  const status = optionalString(searchParams.get("status"));
  const operation = optionalString(searchParams.get("operation"));
  const nodeId = optionalString(searchParams.get("node_id"));
  const from = optionalString(searchParams.get("from"));
  const to = optionalString(searchParams.get("to"));
  const limit = optionalInteger(searchParams.get("limit"));
  const offset = optionalInteger(searchParams.get("offset"));

  if (source === "authoritative" || source === "audit" || source === "both") options.source = source;
  if (status === "applied" || status === "rejected" || status === "all") options.status = status;
  if (operation) options.operation = operation;
  if (nodeId) options.node_id = nodeId;
  if (from) options.from = from;
  if (to) options.to = to;
  if (limit !== undefined) options.limit = limit;
  if (offset !== undefined) options.offset = offset;
  return options;
}

function jsonResult(status: number, value: unknown): OntologyStudioRouteResult {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: `${JSON.stringify(value, null, 2)}\n`,
  };
}

interface OntologyStudioNodeSummary {
  id: string;
  label?: string;
  type?: string;
  status?: string;
  aliases?: string[];
  normalized_terms?: string[];
  source_refs?: string[];
  registry_refs?: string[];
}

function studioNodeSummary(node: OntologyPatchNode | undefined): OntologyStudioNodeSummary | null {
  if (!node) return null;
  return {
    id: node.id,
    ...(node.label ? { label: node.label } : {}),
    ...(node.type ? { type: node.type } : {}),
    ...(node.status ? { status: node.status } : {}),
    ...(node.aliases?.length ? { aliases: node.aliases } : {}),
    ...(node.normalized_terms?.length ? { normalized_terms: node.normalized_terms } : {}),
    ...(node.source_refs?.length ? { source_refs: node.source_refs } : {}),
    ...(node.registry_refs?.length ? { registry_refs: node.registry_refs } : {}),
  };
}

function studioCandidateDetail(
  candidate: OntologyReconciliationCandidate,
  candidateNode: OntologyPatchNode | undefined,
  canonicalNode: OntologyPatchNode | undefined,
): Record<string, unknown> {
  return {
    ...candidate,
    candidate_node: studioNodeSummary(candidateNode),
    canonical_node: studioNodeSummary(canonicalNode),
  };
}

interface OntologyStudioBootstrap {
  writeEnabled: boolean;
  routes: {
    candidates: string;
    candidateBase: string;
    decisionLog: string;
    rebuildStatus: string;
    patchValidate: string;
    patchDryRun: string;
    patchApply: string;
  };
}

function scriptSafeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function studioBootstrap(writeEnabled: boolean): OntologyStudioBootstrap {
  return {
    writeEnabled,
    routes: {
      candidates: "/api/ontology/reconciliation/candidates",
      candidateBase: "/api/ontology/reconciliation/candidates/",
      decisionLog: "/api/ontology/reconciliation/decision-log",
      rebuildStatus: "/api/ontology/rebuild-status",
      patchValidate: "/api/ontology/patch/validate",
      patchDryRun: "/api/ontology/patch/dry-run",
      patchApply: "/api/ontology/patch/apply",
    },
  };
}

function studioStyles(): string {
  return `
    :root {
      color-scheme: light;
      --surface: #f5f6f7;
      --surface-muted: #eceff1;
      --surface-raised: #ffffff;
      --surface-accent: #effcf7;
      --surface-warning: #fff7ed;
      --text: #16191d;
      --text-muted: #5d6670;
      --border: #d6dde3;
      --border-strong: #b8c2cc;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --warning: #b45309;
      --danger: #b91c1c;
      --success: #166534;
      --info: #1d4ed8;
      --shadow: 0 14px 30px rgba(22, 25, 29, 0.08);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(180deg, #fbfcfc 0%, var(--surface) 100%);
      color: var(--text);
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      border: 1px solid var(--border-strong);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text);
      cursor: pointer;
      padding: 0.6rem 0.9rem;
    }

    button:disabled {
      cursor: not-allowed;
      color: var(--text-muted);
      background: var(--surface-muted);
      border-color: var(--border);
    }

    input,
    select {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-raised);
      color: var(--text);
      padding: 0.6rem 0.75rem;
    }

    code,
    pre {
      font-family: "SFMono-Regular", ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace;
    }

    .studio {
      max-width: 1600px;
      margin: 0 auto;
      padding: 1.5rem;
    }

    .studio__header {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr);
      align-items: start;
      margin-bottom: 1rem;
    }

    .studio__intro,
    .studio__mode,
    .panel {
      min-width: 0;
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    .studio__intro,
    .studio__mode {
      padding: 1.2rem 1.25rem;
    }

    .eyebrow {
      margin: 0 0 0.55rem;
      color: var(--accent);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: 1.95rem;
      line-height: 1.08;
    }

    .lead {
      margin: 0.65rem 0 0;
      max-width: 70ch;
      color: var(--text-muted);
    }

    .chip-row,
    .meta-row,
    .action-row,
    .route-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 2rem;
      padding: 0.35rem 0.65rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-muted);
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .chip--accent {
      border-color: color-mix(in srgb, var(--accent) 28%, white);
      background: var(--surface-accent);
      color: var(--accent-strong);
    }

    .chip--warning {
      border-color: color-mix(in srgb, var(--warning) 32%, white);
      background: var(--surface-warning);
      color: var(--warning);
    }

    .chip--success {
      border-color: color-mix(in srgb, var(--success) 28%, white);
      background: #f0fdf4;
      color: var(--success);
    }

    .chip--danger {
      border-color: color-mix(in srgb, var(--danger) 28%, white);
      background: #fef2f2;
      color: var(--danger);
    }

    .studio__workspace {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
      align-items: start;
    }

    .panel {
      overflow: hidden;
    }

    .panel__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1.1rem 0.85rem;
      border-bottom: 1px solid var(--border);
    }

    .panel__title {
      margin: 0;
      font-size: 1rem;
      line-height: 1.25;
    }

    .panel__subhead {
      margin: 0.3rem 0 0;
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    .panel__body {
      padding: 1rem 1.1rem 1.1rem;
    }

    .queue-toolbar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem;
      align-items: end;
      padding: 0.95rem 1.1rem 0.85rem;
      border-bottom: 1px solid var(--border);
    }

    .field--search {
      grid-column: span 2;
    }

    .field {
      display: grid;
      gap: 0.38rem;
    }

    .field > span {
      color: var(--text-muted);
      font-size: 0.77rem;
      font-weight: 600;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .status-line {
      padding: 0.8rem 1.1rem 0;
      color: var(--text-muted);
      font-size: 0.88rem;
    }

    .queue-list {
      display: grid;
      gap: 0.7rem;
      padding: 0.8rem 1.1rem 1.1rem;
      max-height: calc(100vh - 18rem);
      overflow: auto;
    }

    .queue-item {
      width: 100%;
      text-align: left;
      padding: 0.9rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface-raised);
      display: grid;
      gap: 0.45rem;
    }

    .queue-item[aria-selected="true"] {
      border-color: color-mix(in srgb, var(--accent) 40%, white);
      background: var(--surface-accent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, white);
    }

    .queue-item__top,
    .queue-item__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.6rem;
    }

    .queue-item__title {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .queue-item__score {
      flex: 0 0 auto;
      min-width: 3.7rem;
      text-align: center;
      padding: 0.28rem 0.5rem;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text);
      font-size: 0.78rem;
      font-weight: 700;
    }

    .queue-item__meta,
    .caption,
    .hint {
      color: var(--text-muted);
      font-size: 0.82rem;
    }

    .compare-grid,
    .metric-grid {
      display: grid;
      gap: 0.75rem;
    }

    .compare-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .metric-grid {
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    }

    .compare-card,
    .metric {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }

    .compare-card {
      padding: 0.9rem;
      display: grid;
      gap: 0.75rem;
    }

    .compare-card__title {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .compare-card__heading {
      margin: 0;
      font-size: 0.93rem;
      line-height: 1.3;
    }

    .metric {
      padding: 0.75rem 0.85rem;
    }

    .metric__label {
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .metric__value {
      margin-top: 0.25rem;
      font-size: 1rem;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .details-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(12, minmax(0, 1fr));
    }

    .details-grid > .panel--span-12 { grid-column: span 12; }
    .details-grid > .panel--span-8 { grid-column: span 8; }
    .details-grid > .panel--span-6 { grid-column: span 6; }
    .details-grid > .panel--span-4 { grid-column: span 4; }

    .key-value {
      display: grid;
      gap: 0.65rem;
    }

    .key-value__row {
      display: grid;
      grid-template-columns: minmax(110px, 150px) minmax(0, 1fr);
      gap: 0.8rem;
      align-items: start;
      padding-top: 0.6rem;
      border-top: 1px solid var(--border);
    }

    .key-value__row:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .key-value__label {
      color: var(--text-muted);
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .key-value__value {
      overflow-wrap: anywhere;
    }

    .stack {
      display: grid;
      gap: 0.5rem;
    }

    .list {
      display: grid;
      gap: 0.5rem;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .list__item {
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }

    .list--compact .list__item {
      padding: 0.55rem 0.7rem;
    }

    .mono-block {
      min-height: 18rem;
      margin: 0;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #f7f8f9;
      color: #111827;
      font-size: 0.84rem;
      line-height: 1.5;
      overflow: auto;
    }

    .route-list code {
      max-width: 100%;
      padding: 0.2rem 0.35rem;
      border-radius: 6px;
      background: #f4f6f8;
      overflow-wrap: anywhere;
      white-space: normal;
    }

    .empty {
      padding: 1rem;
      border: 1px dashed var(--border);
      border-radius: 8px;
      color: var(--text-muted);
      background: var(--surface);
    }

    @media (max-width: 1180px) {
      .studio__header,
      .studio__workspace {
        grid-template-columns: minmax(0, 1fr);
      }

      .queue-list {
        max-height: 32rem;
      }
    }

    @media (max-width: 900px) {
      .details-grid > .panel--span-12,
      .details-grid > .panel--span-8,
      .details-grid > .panel--span-6,
      .details-grid > .panel--span-4 {
        grid-column: span 12;
      }

      .compare-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .studio {
        padding: 1rem;
      }

      .queue-toolbar {
        grid-template-columns: 1fr;
      }

      .field--search {
        grid-column: span 1;
      }

      .queue-list {
        max-height: none;
      }

      .key-value__row {
        grid-template-columns: 1fr;
        gap: 0.35rem;
      }
    }
  `;
}

function studioClientScript(): string {
  return `
    (function () {
      const bootstrap = window.__ONTOLOGY_STUDIO_BOOTSTRAP__;
      const state = {
        queue: null,
        selectedId: null,
        selectedCandidate: null,
        rebuild: null,
        log: null,
        queueError: null,
      };

      const elements = {
        queue: document.getElementById("candidate-queue"),
        queueStatus: document.getElementById("queue-status"),
        queueCount: document.getElementById("queue-count"),
        queueQuery: document.getElementById("queue-query"),
        queueMinScore: document.getElementById("queue-min-score"),
        queueStatusFilter: document.getElementById("queue-status-filter"),
        queueKindFilter: document.getElementById("queue-kind-filter"),
        queueOperationFilter: document.getElementById("queue-operation-filter"),
        queueSort: document.getElementById("queue-sort"),
        queueOrder: document.getElementById("queue-order"),
        refresh: document.getElementById("refresh-button"),
        selectedTitle: document.getElementById("selected-title"),
        selectedMeta: document.getElementById("selected-meta"),
        selectedSummary: document.getElementById("selected-summary"),
        evidenceBody: document.getElementById("evidence-panel-body"),
        canonicalBody: document.getElementById("canonical-panel-body"),
        graphBody: document.getElementById("graph-panel-body"),
        rebuildBody: document.getElementById("rebuild-panel-body"),
        auditBody: document.getElementById("audit-panel-body"),
        patchPreview: document.getElementById("patch-preview"),
        patchHint: document.getElementById("patch-mode-copy"),
      };

      function fetchJson(path) {
        return fetch(path, { headers: { accept: "application/json" } }).then(async function (response) {
          if (response.ok) return response.json();
          let message = response.status + " " + response.statusText;
          try {
            const json = await response.json();
            if (json && typeof json.error === "string" && json.error.trim()) {
              message = json.error;
            }
          } catch (_error) {
            // ignore parse failures and fall back to HTTP status text
          }
          throw new Error(message);
        });
      }

      function create(tagName, className, text) {
        const node = document.createElement(tagName);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      }

      function replaceBody(target, body) {
        if (!target) return;
        target.replaceChildren(body);
      }

      function emptyState(message) {
        return create("div", "empty", message);
      }

      function valueText(value, fallback) {
        if (value === null || value === undefined || value === "") return fallback || "Unavailable";
        return String(value);
      }

      function formatScore(value) {
        return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "--";
      }

      function formatDate(value) {
        if (typeof value !== "string" || value.trim() === "") return "Unavailable";
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return value;
        return parsed.toLocaleString();
      }

      function uniqueValues(values) {
        return Array.from(new Set((Array.isArray(values) ? values : []).filter(function (value) {
          return typeof value === "string" && value.trim().length > 0;
        })));
      }

      function recordString(value) {
        return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
      }

      function statusTone(value) {
        switch (value) {
          case "validated":
          case "applied":
            return "success";
          case "candidate":
          case "needs_review":
          case "proposed":
            return "warning";
          case "rejected":
            return "danger";
          default:
            return "accent";
        }
      }

      function keyValue(rows) {
        const wrapper = create("div", "key-value");
        rows.forEach(function (row) {
          const item = create("div", "key-value__row");
          item.appendChild(create("div", "key-value__label", row.label));
          if (Array.isArray(row.values)) {
            const stack = create("div", "stack");
            if (row.values.length === 0) {
              stack.appendChild(create("div", "caption", row.empty || "None"));
            } else {
              row.values.forEach(function (value) {
                if (typeof value === "string") {
                  stack.appendChild(create("div", "key-value__value", value));
                } else {
                  stack.appendChild(value);
                }
              });
            }
            item.appendChild(stack);
          } else if (row.value instanceof Node) {
            item.appendChild(row.value);
          } else {
            item.appendChild(create("div", "key-value__value", row.value));
          }
          wrapper.appendChild(item);
        });
        return wrapper;
      }

      function chip(text, tone) {
        const toneSuffix = tone ? " chip--" + tone : "";
        return create("span", "chip" + toneSuffix, text);
      }

      function listNode(values, emptyMessage) {
        const items = uniqueValues(values);
        const list = create("ul", "list list--compact");
        if (items.length === 0) {
          list.appendChild(create("li", "list__item", emptyMessage || "None"));
          return list;
        }
        items.forEach(function (value) {
          const row = create("li", "list__item");
          row.appendChild(create("div", "key-value__value", value));
          list.appendChild(row);
        });
        return list;
      }

      function metric(label, value) {
        const block = create("div", "metric");
        block.appendChild(create("div", "metric__label", label));
        block.appendChild(create("div", "metric__value", value));
        return block;
      }

      function nodeSummary(candidate, key) {
        const value = candidate && typeof candidate === "object" ? candidate[key] : null;
        return value && typeof value === "object" ? value : null;
      }

      function nodeLabel(node, fallbackId) {
        return node && typeof node.label === "string" && node.label.trim().length > 0
          ? node.label.trim()
          : valueText(fallbackId);
      }

      function nodeStatus(node, fallbackStatus) {
        return node && typeof node.status === "string" && node.status.trim().length > 0
          ? node.status.trim()
          : valueText(fallbackStatus, "Unknown");
      }

      function nodeType(node, fallbackType) {
        return node && typeof node.type === "string" && node.type.trim().length > 0
          ? node.type.trim()
          : valueText(fallbackType, "Unavailable");
      }

      function combinedEvidenceRefs(candidate) {
        const candidateNode = nodeSummary(candidate, "candidate_node");
        const canonicalNode = nodeSummary(candidate, "canonical_node");
        return uniqueValues([
          ...(candidate && Array.isArray(candidate.evidence_refs) ? candidate.evidence_refs : []),
          ...(candidateNode && Array.isArray(candidateNode.source_refs) ? candidateNode.source_refs : []),
          ...(canonicalNode && Array.isArray(canonicalNode.source_refs) ? canonicalNode.source_refs : []),
        ]);
      }

      function patchRecord(item) {
        return item && item.patch && typeof item.patch === "object" ? item.patch : {};
      }

      function patchTarget(patch) {
        return patch && patch.target && typeof patch.target === "object" ? patch.target : {};
      }

      function groupedDecisionLogItems(items) {
        const groups = new Map();
        (Array.isArray(items) ? items : []).forEach(function (item) {
          const patch = patchRecord(item);
          const key = [valueText(patch.id, "unknown-patch"), valueText(patch.operation, "unknown-operation")].join("::");
          let group = groups.get(key);
          if (!group) {
            group = {
              id: valueText(patch.id, "unknown-patch"),
              operation: valueText(patch.operation, "unknown-operation"),
              status: valueText(patch.status, item && item.source === "audit" ? "applied" : "recorded"),
              recorded_at: item ? item.recorded_at : null,
              patch: patch,
              sources: [],
              paths: [],
              targets: [],
            };
            groups.set(key, group);
          }
          if (item && group.sources.indexOf(item.source) === -1) group.sources.push(item.source);
          if (item && item.path && group.paths.indexOf(item.path) === -1) group.paths.push(item.path);
          if (item && typeof item.recorded_at === "string" && item.recorded_at.trim().length > 0) {
            if (!group.recorded_at || item.recorded_at > group.recorded_at) group.recorded_at = item.recorded_at;
          }
          const target = patchTarget(patch);
          const candidateId = recordString(target.candidate_id);
          const canonicalId = recordString(target.canonical_id);
          const pair = candidateId && canonicalId ? candidateId + " -> " + canonicalId : null;
          if (pair && group.targets.indexOf(pair) === -1) group.targets.push(pair);
        });
        return Array.from(groups.values());
      }

      function relatedDecisionGroups(candidate) {
        if (!candidate || !state.log || !Array.isArray(state.log.items)) return [];
        return groupedDecisionLogItems(state.log.items).filter(function (group) {
          const target = patchTarget(group.patch);
          return [target.candidate_id, target.canonical_id].some(function (value) {
            return typeof value === "string"
              && (value === candidate.candidate_id || value === candidate.canonical_id);
          });
        });
      }

      function nodeCard(title, node, fallbackId, fallbackStatus, fallbackType) {
        const card = create("section", "compare-card");
        const heading = create("div", "compare-card__title");
        const headingText = create("div", "stack");
        headingText.appendChild(create("h3", "compare-card__heading", title));
        headingText.appendChild(create("div", "caption", nodeLabel(node, fallbackId)));
        heading.appendChild(headingText);
        heading.appendChild(chip(nodeStatus(node, fallbackStatus), statusTone(nodeStatus(node, fallbackStatus))));
        card.appendChild(heading);
        card.appendChild(
          keyValue([
            { label: "Label", value: nodeLabel(node, fallbackId) },
            { label: "ID", value: valueText(fallbackId) },
            { label: "Type", value: nodeType(node, fallbackType) },
            { label: "Aliases", value: listNode(node && node.aliases, "No aliases recorded") },
            { label: "Terms", value: listNode(node && node.normalized_terms, "No normalized terms recorded") },
            { label: "Evidence refs", value: listNode(node && node.source_refs, "No source refs recorded") },
          ])
        );
        return card;
      }

      function renderQueue() {
        if (!elements.queue || !elements.queueStatus || !elements.queueCount) return;
        const queue = state.queue;
        if (state.queueError) {
          elements.queueStatus.textContent = state.queueError;
          elements.queueCount.textContent = "0";
          elements.queue.replaceChildren(emptyState("Candidates are unavailable until the reconciliation queue exists."));
          return;
        }
        if (!queue) {
          elements.queueStatus.textContent = "Loading reconciliation candidates...";
          elements.queueCount.textContent = "0";
          elements.queue.replaceChildren(emptyState("Fetching candidate queue..."));
          return;
        }

        elements.queueCount.textContent = String(queue.total);
        elements.queueStatus.textContent = queue.stale
          ? "Queue is stale against the current graph/profile context."
          : "Queue is aligned with the active graph/profile context.";

        if (!Array.isArray(queue.items) || queue.items.length === 0) {
          elements.queue.replaceChildren(emptyState("No reconciliation candidates matched the current filters."));
          return;
        }

        const buttons = queue.items.map(function (candidate) {
          const button = create("button", "queue-item");
          button.type = "button";
          button.setAttribute("aria-selected", String(candidate.id === state.selectedId));

          const top = create("div", "queue-item__top");
          const title = create("h3", "queue-item__title", candidate.candidate_id + " -> " + candidate.canonical_id);
          const score = create("span", "queue-item__score", formatScore(candidate.score));
          top.appendChild(title);
          top.appendChild(score);

          const meta = create("div", "queue-item__meta");
          meta.appendChild(create("span", "", [candidate.kind, candidate.status].join(" · ")));
          meta.appendChild(create("span", "", [candidate.proposed_patch_operation, (candidate.evidence_refs || []).length + " refs"].join(" · ")));

          const caption = create(
            "div",
            "caption",
            (candidate.shared_terms || []).length > 0 ? (candidate.shared_terms || []).join(", ") : "No shared terms recorded",
          );

          button.appendChild(top);
          button.appendChild(meta);
          button.appendChild(caption);
          button.addEventListener("click", function () {
            selectCandidate(candidate.id);
          });
          return button;
        });

        elements.queue.replaceChildren.apply(elements.queue, buttons);
      }

      function renderSelectedCandidate() {
        const candidate = state.selectedCandidate;
        if (!elements.selectedTitle || !elements.selectedMeta || !elements.selectedSummary) return;
        if (!candidate) {
          elements.selectedTitle.textContent = "No candidate selected";
          elements.selectedMeta.replaceChildren();
          elements.selectedSummary.replaceChildren(emptyState("Choose a candidate from the queue to inspect evidence, canonical context, and preview data."));
          return;
        }

        const candidateNode = nodeSummary(candidate, "candidate_node");
        const canonicalNode = nodeSummary(candidate, "canonical_node");
        elements.selectedTitle.textContent = nodeLabel(candidateNode, candidate.candidate_id) + " -> " + nodeLabel(canonicalNode, candidate.canonical_id);
        elements.selectedMeta.replaceChildren(
          chip(candidate.kind, "accent"),
          chip(nodeStatus(candidateNode, candidate.status), statusTone(nodeStatus(candidateNode, candidate.status))),
          chip(candidate.proposed_patch_operation, "accent"),
          chip("Score " + formatScore(candidate.score), "success")
        );

        elements.selectedSummary.replaceChildren(
          keyValue([
            { label: "Candidate label", value: nodeLabel(candidateNode, candidate.candidate_id) },
            { label: "Canonical label", value: nodeLabel(canonicalNode, candidate.canonical_id) },
            { label: "Candidate ID", value: valueText(candidate.candidate_id) },
            { label: "Canonical ID", value: valueText(candidate.canonical_id) },
            { label: "Entity type", value: nodeType(candidateNode, candidate.kind) },
            { label: "Operation", value: valueText(candidate.proposed_patch_operation) },
            { label: "Shared terms", value: listNode(candidate.shared_terms || [], "No shared terms recorded") },
            { label: "Reasons", value: listNode(candidate.reasons || [], "No reasons supplied") },
          ])
        );
      }

      function renderEvidence() {
        const candidate = state.selectedCandidate;
        if (!elements.evidenceBody) return;
        if (!candidate) {
          replaceBody(elements.evidenceBody, emptyState("Evidence references and reconciliation reasons appear here after you select a queue item."));
          return;
        }

        const evidenceRefs = combinedEvidenceRefs(candidate);
        const wrapper = create("div", "stack");
        const metrics = create("div", "metric-grid");
        metrics.appendChild(metric("Score", formatScore(candidate.score)));
        metrics.appendChild(metric("Evidence refs", String(evidenceRefs.length)));
        metrics.appendChild(metric("Reasons", String(uniqueValues(candidate.reasons || []).length)));
        wrapper.appendChild(metrics);
        wrapper.appendChild(
          keyValue([
            { label: "Evidence refs", value: listNode(evidenceRefs, "No evidence refs supplied") },
            { label: "Reasons", value: listNode(candidate.reasons || [], "No reasons supplied") },
          ])
        );
        replaceBody(
          elements.evidenceBody,
          wrapper
        );
      }

      function renderCanonical() {
        const candidate = state.selectedCandidate;
        if (!elements.canonicalBody) return;
        if (!candidate) {
          replaceBody(elements.canonicalBody, emptyState("Canonical entity context will appear here for the active candidate."));
          return;
        }

        const candidateNode = nodeSummary(candidate, "candidate_node");
        const canonicalNode = nodeSummary(candidate, "canonical_node");
        const wrapper = create("div", "stack");
        const metrics = create("div", "metric-grid");
        metrics.appendChild(metric("Score", formatScore(candidate.score)));
        metrics.appendChild(metric("Operation", valueText(candidate.proposed_patch_operation)));
        metrics.appendChild(metric("Shared terms", String(uniqueValues(candidate.shared_terms || []).length)));
        wrapper.appendChild(metrics);
        const compare = create("div", "compare-grid");
        compare.appendChild(nodeCard("Candidate node", candidateNode, candidate.candidate_id, candidate.status, candidate.kind));
        compare.appendChild(nodeCard("Canonical node", canonicalNode, candidate.canonical_id, canonicalNode && canonicalNode.status, candidate.kind));
        wrapper.appendChild(compare);
        replaceBody(
          elements.canonicalBody,
          wrapper
        );
      }

      function renderGraphContext() {
        const candidate = state.selectedCandidate;
        if (!elements.graphBody) return;
        if (!candidate) {
          replaceBody(elements.graphBody, emptyState("Select a candidate to anchor graph context and patch preview metadata."));
          return;
        }

        const candidateNode = nodeSummary(candidate, "candidate_node");
        const canonicalNode = nodeSummary(candidate, "canonical_node");
        const evidenceRefs = combinedEvidenceRefs(candidate);
        const relatedDecisions = relatedDecisionGroups(candidate);
        const rebuildIssues = state.rebuild && state.rebuild.candidates && Array.isArray(state.rebuild.candidates.issues)
          ? state.rebuild.candidates.issues
          : [];
        const wrapper = create("div", "stack");
        const metrics = create("div", "metric-grid");
        metrics.appendChild(metric("Related decisions", String(relatedDecisions.length)));
        metrics.appendChild(metric("Evidence footprint", String(evidenceRefs.length)));
        metrics.appendChild(metric("Shared terms", String(uniqueValues(candidate.shared_terms || []).length)));
        metrics.appendChild(metric("Rebuild drift", state.rebuild && state.rebuild.needs_update ? "Pending" : "Clear"));
        wrapper.appendChild(metrics);
        wrapper.appendChild(
          keyValue([
            {
              label: "Anchor nodes",
              value: listNode([
                nodeLabel(candidateNode, candidate.candidate_id) + " (" + valueText(candidate.candidate_id) + ")",
                nodeLabel(canonicalNode, candidate.canonical_id) + " (" + valueText(candidate.canonical_id) + ")",
              ], "No anchor nodes available"),
            },
            { label: "Shared terms", value: listNode(candidate.shared_terms || [], "No shared terms recorded") },
            { label: "Evidence refs", value: listNode(evidenceRefs, "No evidence refs supplied") },
            {
              label: "Related decisions",
              value: listNode(relatedDecisions.map(function (group) {
                const segments = [
                  group.id,
                  "[" + group.sources.join(", ") + "]",
                  group.operation,
                ];
                if (group.targets.length > 0) segments.push(group.targets.join(" ; "));
                return segments.join(" ");
              }), "No related decisions in the loaded audit window"),
            },
            { label: "Rebuild issues", value: listNode(rebuildIssues, "No candidate consistency issues reported") },
          ])
        );
        replaceBody(elements.graphBody, wrapper);
      }

      function renderRebuild() {
        if (!elements.rebuildBody) return;
        if (!state.rebuild) {
          replaceBody(elements.rebuildBody, emptyState("Loading rebuild status..."));
          return;
        }
        const status = state.rebuild;
        const issueValues = Array.isArray(status.candidates && status.candidates.issues)
          ? status.candidates.issues.map(function (issue) { return issue; })
          : [];

        replaceBody(
          elements.rebuildBody,
          keyValue([
            { label: "Needs update", value: status.needs_update ? "Yes" : "No" },
            { label: "Candidates match", value: status.candidates_match ? "Yes" : "No" },
            { label: "Decision log", value: status.decision_log_available ? "Available" : "Unavailable" },
            { label: "Candidate file", value: status.candidates ? valueText(status.candidates.path) : "Unavailable" },
            { label: "Generated at", value: status.candidates ? valueText(status.candidates.generated_at, "Unavailable") : "Unavailable" },
            { label: "Issues", values: issueValues, empty: "No candidate consistency issues reported" },
          ])
        );
      }

      function patchPreviewValue() {
        const candidate = state.selectedCandidate;
        if (!candidate) return "{\\n  \\"select_candidate\\": true\\n}";
        return JSON.stringify({
          schema: "graphify_ontology_patch_v1",
          id: "preview:" + candidate.id,
          operation: candidate.proposed_patch_operation,
          status: "proposed",
          profile_hash: state.queue ? state.queue.profile_hash : null,
          graph_hash: state.queue ? state.queue.graph_hash : null,
          target: {
            candidate_id: candidate.candidate_id,
            canonical_id: candidate.canonical_id,
          },
          evidence_refs: candidate.evidence_refs || [],
          reason: (candidate.reasons || [])[0] || "Review in ontology studio before apply",
          author: "ontology-studio",
          created_at: "__preview_only__",
        }, null, 2);
      }

      function renderPatchPreview() {
        if (!elements.patchPreview || !elements.patchHint) return;
        elements.patchPreview.textContent = patchPreviewValue();
        elements.patchHint.textContent = bootstrap.writeEnabled
          ? "Write API available. Patch actions stay disabled in this shell until a tokenized submit flow is added."
          : "Read-only studio. Start the server with --write to expose token-protected patch routes.";
      }

      function renderAuditTrail() {
        if (!elements.auditBody) return;
        if (!state.log) {
          replaceBody(elements.auditBody, emptyState("Loading decision log..."));
          return;
        }
        const groups = groupedDecisionLogItems(state.log.items);
        if (groups.length === 0) {
          replaceBody(elements.auditBody, emptyState("No applied or rejected patches have been recorded yet."));
          return;
        }

        const list = create("ul", "list");
        groups.slice(0, 12).forEach(function (group) {
          const row = create("li", "list__item");
          row.appendChild(create("div", "", group.id));
          row.appendChild(create("div", "caption", group.sources.join(", ") + " · " + group.operation + " · " + group.status));
          const segments = [formatDate(group.recorded_at)];
          if (group.targets.length > 0) segments.push(group.targets.join(" ; "));
          if (group.paths.length > 0) segments.push(group.paths.join(", "));
          row.appendChild(create("div", "hint", segments.join(" · ")));
          list.appendChild(row);
        });
        replaceBody(elements.auditBody, list);
      }

      function renderEverything() {
        renderQueue();
        renderSelectedCandidate();
        renderEvidence();
        renderCanonical();
        renderGraphContext();
        renderRebuild();
        renderPatchPreview();
        renderAuditTrail();
      }

      async function selectCandidate(id) {
        state.selectedId = id;
        renderQueue();
        try {
          state.selectedCandidate = await fetchJson(bootstrap.routes.candidateBase + encodeURIComponent(id));
        } catch (error) {
          state.selectedCandidate = null;
          if (elements.selectedSummary) {
            elements.selectedSummary.replaceChildren(emptyState(error instanceof Error ? error.message : String(error)));
          }
        }
        renderEverything();
      }

      async function loadQueue() {
        const params = new URLSearchParams();
        params.set("limit", "50");
        const query = elements.queueQuery && elements.queueQuery.value ? elements.queueQuery.value.trim() : "";
        const minScore = elements.queueMinScore && elements.queueMinScore.value ? elements.queueMinScore.value : "";
        const status = elements.queueStatusFilter && elements.queueStatusFilter.value ? elements.queueStatusFilter.value : "";
        const kind = elements.queueKindFilter && elements.queueKindFilter.value ? elements.queueKindFilter.value : "";
        const operation = elements.queueOperationFilter && elements.queueOperationFilter.value ? elements.queueOperationFilter.value : "";
        const sort = elements.queueSort && elements.queueSort.value ? elements.queueSort.value : "";
        const order = elements.queueOrder && elements.queueOrder.value ? elements.queueOrder.value : "";
        if (query) params.set("query", query);
        if (minScore) params.set("min_score", minScore);
        if (status) params.set("status", status);
        if (kind) params.set("kind", kind);
        if (operation) params.set("operation", operation);
        if (sort) params.set("sort", sort);
        if (order) params.set("order", order);
        state.queueError = null;
        try {
          state.queue = await fetchJson(bootstrap.routes.candidates + "?" + params.toString());
          const items = Array.isArray(state.queue && state.queue.items) ? state.queue.items : [];
          if (!items.some(function (item) { return item.id === state.selectedId; })) {
            state.selectedId = items.length > 0 ? items[0].id : null;
          }
          if (state.selectedId) {
            await selectCandidate(state.selectedId);
            return;
          }
          state.selectedCandidate = null;
        } catch (error) {
          state.queue = null;
          state.selectedId = null;
          state.selectedCandidate = null;
          state.queueError = error instanceof Error ? error.message : String(error);
        }
        renderEverything();
      }

      async function loadRebuild() {
        try {
          state.rebuild = await fetchJson(bootstrap.routes.rebuildStatus);
        } catch (error) {
          state.rebuild = {
            needs_update: false,
            candidates_match: false,
            decision_log_available: false,
            candidates: {
              path: "unavailable",
              generated_at: null,
              issues: [error instanceof Error ? error.message : String(error)],
            },
          };
        }
        renderRebuild();
      }

      async function loadAuditTrail() {
        try {
          state.log = await fetchJson(bootstrap.routes.decisionLog + "?source=both&status=all&limit=24");
        } catch (error) {
          state.log = {
            items: [],
            issues: [{ message: error instanceof Error ? error.message : String(error) }],
          };
        }
        renderAuditTrail();
      }

      let queueTimer = null;
      function scheduleQueueRefresh() {
        if (queueTimer) window.clearTimeout(queueTimer);
        queueTimer = window.setTimeout(function () {
          void loadQueue();
        }, 150);
      }

      if (elements.queueQuery) elements.queueQuery.addEventListener("input", scheduleQueueRefresh);
      if (elements.queueMinScore) elements.queueMinScore.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueStatusFilter) elements.queueStatusFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueKindFilter) elements.queueKindFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueOperationFilter) elements.queueOperationFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueSort) elements.queueSort.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueOrder) elements.queueOrder.addEventListener("change", function () { void loadQueue(); });
      if (elements.refresh) elements.refresh.addEventListener("click", function () {
        void Promise.all([loadQueue(), loadRebuild(), loadAuditTrail()]);
      });

      renderEverything();
      void Promise.all([loadQueue(), loadRebuild(), loadAuditTrail()]);
    })();
  `;
}

function htmlResult(writeEnabled: boolean): OntologyStudioRouteResult {
  const bootstrap = studioBootstrap(writeEnabled);
  const writeBadge = writeEnabled
    ? `<span class="chip chip--success">Write API available</span>`
    : `<span class="chip chip--warning">Read-only studio</span>`;
  const writeCopy = writeEnabled
    ? `<p class="panel__subhead">The server exposes protected patch routes. This page advertises them without embedding the bearer token.</p>`
    : `<p class="panel__subhead">Start with <code>--write</code> to expose token-protected patch routes while keeping the default browser experience read-only.</p>`;
  const patchRoutes = writeEnabled
    ? `<div class="route-list">
        <code>${bootstrap.routes.patchValidate}</code>
        <code>${bootstrap.routes.patchDryRun}</code>
        <code>${bootstrap.routes.patchApply}</code>
      </div>`
    : `<div class="route-list">
        <code>${bootstrap.routes.candidates}</code>
        <code>${bootstrap.routes.decisionLog}</code>
        <code>${bootstrap.routes.rebuildStatus}</code>
      </div>`;
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Graphify Ontology Studio</title>
  <style>
${studioStyles()}
  </style>
</head>
<body>
  <div class="studio">
    <header class="studio__header">
      <section class="studio__intro" aria-labelledby="studio-title">
        <p class="eyebrow">Ontology Reconciliation Studio</p>
        <h1 id="studio-title">Graphify Ontology Studio</h1>
        <p class="lead">Review reconciliation candidates, inspect evidence and canonical targets, watch rebuild state, and stage patch previews over the existing local ontology endpoints.</p>
      </section>
      <aside class="studio__mode" aria-labelledby="studio-mode-title">
        <div class="chip-row">${writeBadge}<span class="chip chip--accent">Existing API-backed shell</span></div>
        <h2 id="studio-mode-title" class="panel__title" style="margin-top: 0.9rem;">Server mode</h2>
        ${writeCopy}
        ${patchRoutes}
      </aside>
    </header>

    <main class="studio__workspace">
      <section class="panel" aria-labelledby="candidate-queue-title">
        <div class="panel__header">
          <div>
            <h2 id="candidate-queue-title" class="panel__title">Candidate Queue</h2>
            <p class="panel__subhead">Filter unresolved candidates and keep selection pinned while the shell refreshes against the local queue.</p>
          </div>
          <span class="chip chip--accent"><span id="queue-count">0</span>&nbsp;items</span>
        </div>
        <div class="queue-toolbar">
          <label class="field field--search">
            <span>Search</span>
            <input id="queue-query" type="search" placeholder="Candidate, canonical, evidence, reason">
          </label>
          <label class="field">
            <span>Min score</span>
            <select id="queue-min-score">
              <option value="">Any</option>
              <option value="0.5">0.50+</option>
              <option value="0.75">0.75+</option>
              <option value="0.9">0.90+</option>
            </select>
          </label>
          <label class="field">
            <span>Status</span>
            <select id="queue-status-filter">
              <option value="">Any</option>
              <option value="candidate">Candidate</option>
            </select>
          </label>
          <label class="field">
            <span>Kind</span>
            <select id="queue-kind-filter">
              <option value="">Any</option>
              <option value="entity_match">Entity Match</option>
            </select>
          </label>
          <label class="field">
            <span>Operation</span>
            <select id="queue-operation-filter">
              <option value="">Any</option>
              <option value="accept_match">Accept Match</option>
            </select>
          </label>
          <label class="field">
            <span>Sort</span>
            <select id="queue-sort">
              <option value="score">Score</option>
              <option value="id">ID</option>
            </select>
          </label>
          <label class="field">
            <span>Order</span>
            <select id="queue-order">
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </label>
          <button id="refresh-button" type="button">Refresh</button>
        </div>
        <div id="queue-status" class="status-line" aria-live="polite">Loading reconciliation candidates...</div>
        <div id="candidate-queue" class="queue-list" role="listbox" aria-label="Reconciliation candidates"></div>
      </section>

      <div class="details-grid">
        <section class="panel panel--span-8" aria-labelledby="selected-title">
          <div class="panel__header">
            <div>
              <h2 id="selected-title" class="panel__title">No candidate selected</h2>
              <p class="panel__subhead">Selection drives the evidence, canonical entity, graph context, patch preview, and audit readbacks.</p>
            </div>
            <div id="selected-meta" class="meta-row" aria-live="polite"></div>
          </div>
          <div id="selected-summary" class="panel__body"></div>
        </section>

        <section class="panel panel--span-4" aria-labelledby="rebuild-status-title">
          <div class="panel__header">
            <div>
              <h2 id="rebuild-status-title" class="panel__title">Rebuild Status</h2>
              <p class="panel__subhead">Track graph/profile drift and whether the queued candidates still match the active context.</p>
            </div>
          </div>
          <div id="rebuild-panel-body" class="panel__body"></div>
        </section>

        <section class="panel panel--span-4" aria-labelledby="evidence-title">
          <div class="panel__header">
            <div>
              <h2 id="evidence-title" class="panel__title">Evidence</h2>
              <p class="panel__subhead">Source references and rationale for the selected reconciliation decision.</p>
            </div>
          </div>
          <div id="evidence-panel-body" class="panel__body"></div>
        </section>

        <section class="panel panel--span-4" aria-labelledby="canonical-title">
          <div class="panel__header">
            <div>
              <h2 id="canonical-title" class="panel__title">Canonical Entity</h2>
              <p class="panel__subhead">Side-by-side candidate and canonical details from the selected reconciliation pair.</p>
            </div>
          </div>
          <div id="canonical-panel-body" class="panel__body"></div>
        </section>

        <section class="panel panel--span-4" aria-labelledby="graph-context-title">
          <div class="panel__header">
            <div>
              <h2 id="graph-context-title" class="panel__title">Graph Context</h2>
              <p class="panel__subhead">Selection anchors, evidence footprint, rebuild drift, and recent related decisions.</p>
            </div>
          </div>
          <div id="graph-panel-body" class="panel__body"></div>
        </section>

        <section class="panel panel--span-6" aria-labelledby="patch-preview-title">
          <div class="panel__header">
            <div>
              <h2 id="patch-preview-title" class="panel__title">Patch Preview</h2>
              <p class="panel__subhead" id="patch-mode-copy">Read-only studio. Start the server with --write to expose token-protected patch routes.</p>
            </div>
          </div>
          <div class="panel__body stack">
            <pre id="patch-preview" class="mono-block" aria-live="polite"></pre>
            <div class="action-row">
              <button type="button" disabled>Validate</button>
              <button type="button" disabled>Dry Run</button>
              <button type="button" disabled>Apply</button>
            </div>
            <p class="hint">Mutation stays behind the existing HTTP API. This shell stages the candidate-derived patch shape without embedding secrets.</p>
          </div>
        </section>

        <section class="panel panel--span-6" aria-labelledby="audit-trail-title">
          <div class="panel__header">
            <div>
              <h2 id="audit-trail-title" class="panel__title">Audit Trail</h2>
              <p class="panel__subhead">Authoritative and audit records grouped by patch so duplicate source=both rows stay readable.</p>
            </div>
          </div>
          <div id="audit-panel-body" class="panel__body"></div>
        </section>
      </div>
    </main>
  </div>
  <script>
    window.__ONTOLOGY_STUDIO_BOOTSTRAP__ = ${scriptSafeJson(bootstrap)};
  </script>
  <script>
${studioClientScript()}
  </script>
</body>
</html>`,
  };
}

function sendResult(response: ServerResponse, result: OntologyStudioRouteResult): void {
  response.writeHead(result.status, {
    "content-type": result.contentType,
    "cache-control": "no-store",
  });
  response.end(result.body);
}

function statusForError(error: Error): number {
  if (error.message.includes("not found")) return 404;
  return 500;
}

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

export function generateOntologyStudioToken(): string {
  return randomBytes(24).toString("hex");
}

function bearerToken(authHeader: string | string[] | undefined): string | undefined {
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!value) return undefined;
  const match = /^bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : undefined;
}

function readPostBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let received = 0;
    let oversized = false;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > POST_BODY_MAX_BYTES) {
        oversized = true;
        return; // keep draining so the client can read the response cleanly
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (oversized) {
        reject(new Error("request body exceeds 256 KB limit"));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    request.on("error", reject);
  });
}

function parseJsonBody(body: string): unknown {
  if (body.trim().length === 0) return null;
  return JSON.parse(body);
}

function patchRouteForMethod(pathname: string): "validate" | "dry-run" | "apply" | null {
  if (pathname === "/api/ontology/patch/validate") return "validate";
  if (pathname === "/api/ontology/patch/dry-run") return "dry-run";
  if (pathname === "/api/ontology/patch/apply") return "apply";
  return null;
}

export function createOntologyStudioRequestHandler(options: OntologyStudioHandlerOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? "GET";
    const requestUrl = request.url ?? "/";

    if (method === "POST") {
      const url = new URL(requestUrl, "http://127.0.0.1");
      const route = patchRouteForMethod(url.pathname);
      if (!route) {
        sendResult(response, jsonResult(404, { error: "not found" }));
        return;
      }
      if (!options.write) {
        sendResult(response, jsonResult(405, { error: "patch routes require --write mode" }));
        return;
      }
      const token = bearerToken(request.headers.authorization);
      if (token !== options.write.token) {
        sendResult(response, jsonResult(401, { error: "missing or invalid bearer token" }));
        return;
      }
      try {
        const raw = await readPostBody(request);
        const payload = parseJsonBody(raw);
        const context = loadOntologyPatchContext(options.profileStatePath);
        if (route === "validate") {
          sendResult(response, jsonResult(200, validateOntologyPatch(payload, context)));
          return;
        }
        if (route === "dry-run") {
          sendResult(response, jsonResult(200, applyOntologyPatch(payload, context, { dryRun: true })));
          return;
        }
        const result = applyOntologyPatch(payload, context, { write: true });
        sendResult(response, jsonResult(result.valid ? 200 : 400, result));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes("body exceeds") ? 413 : message.includes("JSON") ? 400 : 500;
        sendResult(response, jsonResult(status, { error: message }));
      }
      return;
    }

    sendResult(response, handleOntologyStudioRequest(options, method, requestUrl));
  };
}

export function handleOntologyStudioRequest(
  options: OntologyStudioHandlerOptions,
  method: string,
  requestUrl: string,
): OntologyStudioRouteResult {
  try {
    if (method !== "GET") {
      return jsonResult(405, { error: "method not allowed" });
    }
    const url = new URL(requestUrl, "http://127.0.0.1");
    const context = loadOntologyPatchContext(options.profileStatePath);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return htmlResult(Boolean(options.write));
    }
    if (url.pathname === "/api/ontology/reconciliation/candidates") {
      return jsonResult(200, listOntologyReconciliationCandidates(context, candidateFilters(url.searchParams)));
    }
    const candidatePrefix = "/api/ontology/reconciliation/candidates/";
    if (url.pathname.startsWith(candidatePrefix)) {
      const id = decodeURIComponent(url.pathname.slice(candidatePrefix.length));
      const candidate = getOntologyReconciliationCandidate(context, id);
      return jsonResult(
        200,
        studioCandidateDetail(
          candidate,
          context.nodes.find((node) => node.id === candidate.candidate_id),
          context.nodes.find((node) => node.id === candidate.canonical_id),
        ),
      );
    }
    if (url.pathname === "/api/ontology/reconciliation/decision-log") {
      return jsonResult(200, previewOntologyDecisionLog(context, decisionLogOptions(url.searchParams)));
    }
    if (url.pathname === "/api/ontology/rebuild-status") {
      return jsonResult(200, getOntologyRebuildStatus(context));
    }
    return jsonResult(404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResult(statusForError(error instanceof Error ? error : new Error(message)), { error: message });
  }
}

export async function startOntologyStudioServer(
  options: StartOntologyStudioServerOptions,
): Promise<StartedOntologyStudioServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const writeEnabled = options.write === true;
  if (writeEnabled && !isLoopbackHost(host)) {
    throw new Error(
      `--write requires a loopback bind (127.0.0.1, ::1 or localhost); refused host ${host}`,
    );
  }
  const handlerOptions: OntologyStudioHandlerOptions = { profileStatePath: options.profileStatePath };
  if (writeEnabled) {
    handlerOptions.write = { token: options.token ?? generateOntologyStudioToken() };
  }
  const server = createServer(createOntologyStudioRequestHandler(handlerOptions));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://${address.address}:${address.port}`,
    writeEnabled,
    ...(writeEnabled && handlerOptions.write ? { token: handlerOptions.write.token } : {}),
  };
}

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
      --surface: #f4f7fb;
      --surface-muted: #e8edf4;
      --surface-raised: #ffffff;
      --surface-accent: #ecfdf5;
      --surface-warning: #fff7ed;
      --surface-info: #eff6ff;
      --text: #111827;
      --text-muted: #5b6574;
      --border: #d7e0ea;
      --border-strong: #b5c0cd;
      --accent: #0f766e;
      --accent-strong: #115e59;
      --warning: #b45309;
      --danger: #b91c1c;
      --success: #166534;
      --info: #1d4ed8;
      --shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--surface);
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
      max-width: 1760px;
      margin: 0 auto;
      padding: 1.25rem;
    }

    .studio__header {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 420px);
      align-items: stretch;
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
      padding: 1.2rem 1.25rem 1.25rem;
    }

    .studio__intro {
      display: grid;
      gap: 1rem;
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
      font-size: 2rem;
      line-height: 1.05;
    }

    .lead {
      margin: 0.65rem 0 0;
      max-width: 72ch;
      color: var(--text-muted);
      font-size: 0.97rem;
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
      min-height: 1.9rem;
      padding: 0.3rem 0.6rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface-muted);
      color: var(--text);
      font-size: 0.8rem;
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

    .hero-metrics,
    .insight-grid,
    .decision-grid {
      display: grid;
      gap: 0.75rem;
    }

    .hero-metrics,
    .insight-grid,
    .decision-grid {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }

    .hero-metric,
    .signal-card,
    .info-card {
      padding: 0.9rem 0.95rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      min-width: 0;
    }

    .hero-metric__label,
    .signal-card__label,
    .info-card__label {
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .hero-metric__value,
    .signal-card__value,
    .info-card__value {
      margin-top: 0.35rem;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .hero-metric__detail,
    .signal-card__detail,
    .info-card__detail {
      margin-top: 0.35rem;
      color: var(--text-muted);
      font-size: 0.82rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .studio__workspace {
      display: grid;
      gap: 1rem;
      grid-template-columns: minmax(300px, 360px) minmax(0, 1fr) minmax(310px, 390px);
      align-items: start;
    }

    .studio__rail,
    .studio__main,
    .studio__side {
      min-width: 0;
    }

    .studio__main,
    .studio__side {
      display: grid;
      gap: 1rem;
      align-content: start;
    }

    .panel--sticky {
      position: sticky;
      top: 1rem;
    }

    .studio__workspace {
      min-width: 0;
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
      grid-template-columns: repeat(2, minmax(0, 1fr));
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
      max-height: calc(100vh - 16rem);
      overflow: auto;
    }

    .queue-item {
      width: 100%;
      text-align: left;
      padding: 0.9rem 0.95rem;
      border: 1px solid var(--border);
      border-left: 4px solid transparent;
      border-radius: 8px;
      background: var(--surface-raised);
      display: grid;
      gap: 0.55rem;
      transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
    }

    .queue-item[aria-selected="true"] {
      border-color: color-mix(in srgb, var(--accent) 38%, white);
      border-left-color: var(--accent);
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
      font-size: 0.96rem;
      line-height: 1.28;
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

    .queue-item__route {
      color: var(--text-muted);
      font-size: 0.8rem;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .queue-item__signals {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
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

    .compare-card--soft {
      background: var(--surface);
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

    .decision-summary {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(0, 1.05fr) minmax(280px, 0.95fr);
    }

    .comparison-board {
      display: grid;
      gap: 0.7rem;
    }

    .comparison-row {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(110px, 132px) minmax(0, 1fr) minmax(84px, auto) minmax(0, 1fr);
      align-items: start;
      padding: 0.75rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      min-width: 0;
    }

    .comparison-row--match {
      border-color: color-mix(in srgb, var(--success) 22%, white);
      background: #f6fdf8;
    }

    .comparison-row--partial {
      border-color: color-mix(in srgb, var(--warning) 26%, white);
      background: #fffaf2;
    }

    .comparison-row__label {
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .comparison-row__cell {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .comparison-row__marker {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-width: 0;
    }

    .value-stack {
      display: grid;
      gap: 0.35rem;
      min-width: 0;
    }

    .value-pill {
      display: inline-flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      padding: 0.22rem 0.45rem;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text);
      font-size: 0.76rem;
      line-height: 1.3;
      overflow-wrap: anywhere;
      white-space: normal;
    }

    .map-stage {
      display: grid;
      gap: 0.9rem;
    }

    .graph-map {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: minmax(0, 1fr) minmax(48px, auto) minmax(160px, 220px) minmax(48px, auto) minmax(0, 1fr);
      align-items: center;
    }

    .graph-node {
      padding: 0.9rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      min-width: 0;
    }

    .graph-node--candidate {
      border-color: color-mix(in srgb, var(--accent) 24%, white);
      background: var(--surface-accent);
    }

    .graph-node--shared {
      border-color: color-mix(in srgb, var(--info) 18%, white);
      background: var(--surface-info);
    }

    .graph-node__eyebrow {
      color: var(--text-muted);
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .graph-node__title {
      margin-top: 0.25rem;
      font-size: 0.94rem;
      font-weight: 700;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .graph-node__detail {
      margin-top: 0.32rem;
      color: var(--text-muted);
      font-size: 0.8rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .graph-link {
      color: var(--text-muted);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      text-align: center;
    }

    .timeline {
      display: grid;
      gap: 0.7rem;
      padding: 0;
      margin: 0;
      list-style: none;
    }

    .timeline__item {
      display: grid;
      gap: 0.45rem;
      padding: 0.85rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }

    .timeline__top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.65rem;
    }

    .timeline__title {
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .timeline__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
    }

    .section-copy {
      margin: 0 0 0.8rem;
      color: var(--text-muted);
      font-size: 0.88rem;
      line-height: 1.45;
    }

    .action-form {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .field--wide {
      grid-column: span 2;
    }

    .action-status {
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      font-size: 0.84rem;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .action-status--success {
      border-color: color-mix(in srgb, var(--success) 24%, white);
      background: #f0fdf4;
    }

    .action-status--danger {
      border-color: color-mix(in srgb, var(--danger) 24%, white);
      background: #fef2f2;
    }

    .action-status--warning {
      border-color: color-mix(in srgb, var(--warning) 24%, white);
      background: #fffaf2;
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

    .mono-block {
      min-height: 14rem;
      margin: 0;
      padding: 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #f8fafc;
      color: #0f172a;
      font-size: 0.84rem;
      line-height: 1.5;
      overflow: auto;
    }

    .route-list code {
      display: block;
      max-width: 100%;
      width: 100%;
      padding: 0.2rem 0.35rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #f8fafc;
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

      .studio__workspace {
        grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
      }

      .studio__side {
        grid-column: span 2;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .panel--sticky {
        position: static;
      }
    }

    @media (max-width: 900px) {
      .studio__workspace {
        grid-template-columns: 1fr;
      }

      .studio__side {
        grid-column: auto;
      }

      .decision-summary,
      .queue-toolbar,
      .action-form,
      .studio__side,
      .graph-map,
      .comparison-row {
        grid-template-columns: 1fr;
      }

      .comparison-row__marker {
        justify-content: flex-start;
      }
    }

    @media (max-width: 640px) {
      .studio {
        padding: 1rem;
      }

      .field--search {
        grid-column: span 1;
      }

      .queue-list {
        max-height: none;
      }

      .hero-metrics,
      .insight-grid,
      .decision-grid {
        grid-template-columns: 1fr;
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
        patchPending: false,
        patchResult: null,
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
        patchToken: document.getElementById("patch-token"),
        patchOperation: document.getElementById("patch-operation"),
        patchNote: document.getElementById("patch-note"),
        patchValidate: document.getElementById("patch-validate"),
        patchDryRun: document.getElementById("patch-dry-run"),
        patchApply: document.getElementById("patch-apply"),
        patchResult: document.getElementById("patch-result"),
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

      function postJson(path, payload, token) {
        return fetch(path, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: "Bearer " + token,
          },
          body: JSON.stringify(payload),
        }).then(async function (response) {
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

      function stringValues(value) {
        if (Array.isArray(value)) return uniqueValues(value);
        const single = recordString(value);
        return single ? [single] : [];
      }

      function overlapValues(left, right) {
        const rightMap = new Map();
        stringValues(right).forEach(function (value) {
          rightMap.set(value.toLowerCase(), value);
        });
        return stringValues(left).filter(function (value) {
          return rightMap.has(value.toLowerCase());
        });
      }

      function exclusiveValues(left, right) {
        const rightSet = new Set(stringValues(right).map(function (value) {
          return value.toLowerCase();
        }));
        return stringValues(left).filter(function (value) {
          return !rightSet.has(value.toLowerCase());
        });
      }

      function titleFromId(value) {
        const text = recordString(value);
        if (!text) return "Unavailable";
        const segments = text.split("_").filter(Boolean);
        const label = segments.length > 1 ? segments.slice(1).join(" ") : text;
        return label
          .replace(/[:\-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
      }

      function signalCard(label, value, detail) {
        const card = create("section", "signal-card");
        card.appendChild(create("div", "signal-card__label", label));
        card.appendChild(create("div", "signal-card__value", value));
        if (detail) card.appendChild(create("div", "signal-card__detail", detail));
        return card;
      }

      function valueStackNode(values, emptyMessage) {
        const stack = create("div", "value-stack");
        const entries = stringValues(values);
        if (entries.length === 0) {
          stack.appendChild(create("div", "caption", emptyMessage || "None"));
          return stack;
        }
        entries.forEach(function (value) {
          stack.appendChild(create("div", "value-pill", value));
        });
        return stack;
      }

      function comparisonState(left, right) {
        const leftValues = stringValues(left);
        const rightValues = stringValues(right);
        if (leftValues.length === 0 && rightValues.length === 0) {
          return { label: "Empty", tone: "accent", rowClass: "" };
        }
        if (leftValues.length === rightValues.length && leftValues.every(function (value, index) {
          return value.toLowerCase() === rightValues[index].toLowerCase();
        })) {
          return { label: "Aligned", tone: "success", rowClass: "comparison-row--match" };
        }
        if (overlapValues(leftValues, rightValues).length > 0) {
          return { label: "Overlap", tone: "warning", rowClass: "comparison-row--partial" };
        }
        return { label: "Distinct", tone: "accent", rowClass: "" };
      }

      function comparisonRow(label, left, right, stateOverride) {
        const stateValue = stateOverride || comparisonState(left, right);
        const row = create("div", "comparison-row" + (stateValue.rowClass ? " " + stateValue.rowClass : ""));
        row.appendChild(create("div", "comparison-row__label", label));
        const leftCell = create("div", "comparison-row__cell");
        const rightCell = create("div", "comparison-row__cell");
        leftCell.appendChild(left instanceof Node ? left : valueStackNode(left));
        rightCell.appendChild(right instanceof Node ? right : valueStackNode(right));
        row.appendChild(leftCell);
        const marker = create("div", "comparison-row__marker");
        marker.appendChild(chip(stateValue.label, stateValue.tone));
        row.appendChild(marker);
        row.appendChild(rightCell);
        return row;
      }

      function graphNode(className, eyebrow, title, detail, badges) {
        const node = create("section", "graph-node " + className);
        node.appendChild(create("div", "graph-node__eyebrow", eyebrow));
        node.appendChild(create("div", "graph-node__title", title));
        if (detail) node.appendChild(create("div", "graph-node__detail", detail));
        if (Array.isArray(badges) && badges.length > 0) {
          const row = create("div", "chip-row");
          badges.forEach(function (badge) {
            if (badge) row.appendChild(badge);
          });
          node.appendChild(row);
        }
        return node;
      }

      function decisionGroupsList(groups, emptyMessage) {
        const list = create("ul", "timeline");
        if (!Array.isArray(groups) || groups.length === 0) {
          list.appendChild(create("li", "timeline__item", emptyMessage || "No decisions recorded"));
          return list;
        }
        groups.forEach(function (group) {
          const row = create("li", "timeline__item");
          const top = create("div", "timeline__top");
          const heading = create("div", "stack");
          heading.appendChild(create("h3", "timeline__title", group.id));
          heading.appendChild(create("div", "caption", group.targets.length > 0 ? group.targets.join(" ; ") : "No candidate pair recorded"));
          top.appendChild(heading);
          const meta = create("div", "timeline__meta");
          meta.appendChild(chip(group.operation, "accent"));
          meta.appendChild(chip(group.status, statusTone(group.status)));
          meta.appendChild(chip(group.sources.join(" + "), "accent"));
          top.appendChild(meta);
          row.appendChild(top);
          const segments = [formatDate(group.recorded_at)];
          if (group.paths.length > 0) segments.push(group.paths.join(", "));
          row.appendChild(create("div", "hint", segments.join(" · ")));
          list.appendChild(row);
        });
        return list;
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
          const title = create("h3", "queue-item__title", titleFromId(candidate.candidate_id) + " -> " + titleFromId(candidate.canonical_id));
          const score = create("span", "queue-item__score", formatScore(candidate.score));
          top.appendChild(title);
          top.appendChild(score);

          const route = create("div", "queue-item__route", candidate.candidate_id + " -> " + candidate.canonical_id);
          const meta = create("div", "queue-item__meta");
          meta.appendChild(create("span", "", [candidate.kind, candidate.status].join(" · ")));
          meta.appendChild(create("span", "", (candidate.evidence_refs || []).length + " refs"));

          const signals = create("div", "chip-row queue-item__signals");
          signals.appendChild(chip(candidate.status, statusTone(candidate.status)));
          signals.appendChild(chip(candidate.proposed_patch_operation, "accent"));
          if ((candidate.shared_terms || []).length > 0) {
            signals.appendChild(chip((candidate.shared_terms || []).length + " shared terms", "success"));
          }

          const caption = create(
            "div",
            "caption",
            (candidate.shared_terms || []).length > 0 ? (candidate.shared_terms || []).join(", ") : "No shared terms recorded",
          );

          button.appendChild(top);
          button.appendChild(route);
          button.appendChild(meta);
          button.appendChild(signals);
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
        const evidenceRefs = combinedEvidenceRefs(candidate);
        const relatedDecisions = relatedDecisionGroups(candidate);
        elements.selectedTitle.textContent = nodeLabel(candidateNode, candidate.candidate_id) + " -> " + nodeLabel(canonicalNode, candidate.canonical_id);
        elements.selectedMeta.replaceChildren(
          chip(candidate.kind, "accent"),
          chip(nodeStatus(candidateNode, candidate.status), statusTone(nodeStatus(candidateNode, candidate.status))),
          chip(candidate.proposed_patch_operation, "accent"),
          chip("Score " + formatScore(candidate.score), "success")
        );

        const wrapper = create("div", "stack");
        const metrics = create("div", "metric-grid");
        metrics.appendChild(metric("Confidence", formatScore(candidate.score)));
        metrics.appendChild(metric("Evidence refs", String(evidenceRefs.length)));
        metrics.appendChild(metric("Related decisions", String(relatedDecisions.length)));
        metrics.appendChild(metric("Shared terms", String(uniqueValues(candidate.shared_terms || []).length)));
        wrapper.appendChild(metrics);

        const summaryGrid = create("div", "decision-summary");
        const overview = create("section", "compare-card compare-card--soft");
        overview.appendChild(create("h3", "compare-card__heading", "Decision brief"));
        overview.appendChild(
          keyValue([
            { label: "Candidate", value: nodeLabel(candidateNode, candidate.candidate_id) },
            { label: "Canonical", value: nodeLabel(canonicalNode, candidate.canonical_id) },
            { label: "Candidate ID", value: valueText(candidate.candidate_id) },
            { label: "Canonical ID", value: valueText(candidate.canonical_id) },
            { label: "Entity type", value: nodeType(candidateNode, candidate.kind) },
            { label: "Suggested patch", value: valueText(candidate.proposed_patch_operation) },
          ])
        );

        const reasons = create("section", "compare-card compare-card--soft");
        reasons.appendChild(create("h3", "compare-card__heading", "Why it is queued"));
        reasons.appendChild(listNode(candidate.reasons || [], "No reasons supplied"));
        if ((candidate.shared_terms || []).length > 0) {
          reasons.appendChild(create("div", "section-copy", "Shared terms reinforce the proposed merge and should match canonical vocabulary."));
        }
        summaryGrid.appendChild(overview);
        summaryGrid.appendChild(reasons);
        wrapper.appendChild(summaryGrid);

        const signals = create("div", "decision-grid");
        signals.appendChild(signalCard("Candidate status", nodeStatus(candidateNode, candidate.status), "Current lifecycle state carried by the source node."));
        signals.appendChild(signalCard("Canonical status", nodeStatus(canonicalNode, canonicalNode && canonicalNode.status), "Canonical target state from the active ontology graph."));
        signals.appendChild(signalCard("Top shared term", uniqueValues(candidate.shared_terms || [])[0] || "None", uniqueValues(candidate.shared_terms || []).length > 1 ? uniqueValues(candidate.shared_terms || []).slice(1).join(", ") : "No additional shared terms"));
        signals.appendChild(signalCard("Primary reason", uniqueValues(candidate.reasons || [])[0] || "None", uniqueValues(candidate.reasons || []).slice(1).join(" · ") || "No secondary reasons"));
        wrapper.appendChild(signals);

        elements.selectedSummary.replaceChildren(wrapper);
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
        const insights = create("div", "insight-grid");
        insights.appendChild(signalCard("Evidence footprint", String(evidenceRefs.length), "Combined candidate and canonical source references."));
        insights.appendChild(signalCard("Reasons", String(uniqueValues(candidate.reasons || []).length), "Distinct reconciliation reasons surfaced for this pair."));
        insights.appendChild(signalCard("Shared terms", String(uniqueValues(candidate.shared_terms || []).length), "Normalized terms already seen on both sides."));
        wrapper.appendChild(insights);
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
        const metrics = create("div", "insight-grid");
        metrics.appendChild(signalCard("Score", formatScore(candidate.score), "Current reconciliation confidence."));
        metrics.appendChild(signalCard("Suggested patch", valueText(candidate.proposed_patch_operation), "Operation proposed by the candidate queue."));
        metrics.appendChild(signalCard("Term overlap", String(overlapValues(candidateNode && candidateNode.normalized_terms, canonicalNode && canonicalNode.normalized_terms).length), "Normalized terms shared by both entities."));
        metrics.appendChild(signalCard("Ref overlap", String(overlapValues(candidateNode && candidateNode.source_refs, canonicalNode && canonicalNode.source_refs).length), "Source references already present on both sides."));
        wrapper.appendChild(metrics);

        const board = create("div", "comparison-board");
        board.appendChild(comparisonRow(
          "Label",
          [nodeLabel(candidateNode, candidate.candidate_id)],
          [nodeLabel(canonicalNode, candidate.canonical_id)],
        ));
        board.appendChild(comparisonRow(
          "ID",
          [valueText(candidate.candidate_id)],
          [valueText(candidate.canonical_id)],
          { label: "Distinct", tone: "accent", rowClass: "" },
        ));
        board.appendChild(comparisonRow(
          "Status",
          [nodeStatus(candidateNode, candidate.status)],
          [nodeStatus(canonicalNode, canonicalNode && canonicalNode.status)],
        ));
        board.appendChild(comparisonRow(
          "Type",
          [nodeType(candidateNode, candidate.kind)],
          [nodeType(canonicalNode, candidate.kind)],
        ));
        board.appendChild(comparisonRow(
          "Aliases",
          candidateNode && candidateNode.aliases,
          canonicalNode && canonicalNode.aliases,
        ));
        board.appendChild(comparisonRow(
          "Terms",
          candidateNode && candidateNode.normalized_terms,
          canonicalNode && canonicalNode.normalized_terms,
        ));
        board.appendChild(comparisonRow(
          "Evidence refs",
          candidateNode && candidateNode.source_refs,
          canonicalNode && canonicalNode.source_refs,
        ));
        wrapper.appendChild(board);

        const deltas = create("div", "decision-grid");
        deltas.appendChild(signalCard(
          "Shared terms",
          uniqueValues(candidate.shared_terms || []).join(", ") || "None",
          "Terms already seen on both nodes.",
        ));
        deltas.appendChild(signalCard(
          "Candidate only",
          exclusiveValues(candidateNode && candidateNode.normalized_terms, canonicalNode && canonicalNode.normalized_terms).join(", ") || "None",
          "Terms that still need explicit judgment before merge.",
        ));
        deltas.appendChild(signalCard(
          "Canonical only",
          exclusiveValues(canonicalNode && canonicalNode.normalized_terms, candidateNode && candidateNode.normalized_terms).join(", ") || "None",
          "Canonical vocabulary not currently present on the candidate.",
        ));
        wrapper.appendChild(deltas);
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
        const mapStage = create("div", "map-stage");
        const map = create("div", "graph-map");
        map.appendChild(graphNode(
          "graph-node--candidate",
          "Candidate",
          nodeLabel(candidateNode, candidate.candidate_id),
          valueText(candidate.candidate_id),
          [chip(nodeStatus(candidateNode, candidate.status), statusTone(nodeStatus(candidateNode, candidate.status)))]
        ));
        map.appendChild(create("div", "graph-link", "signals"));
        map.appendChild(graphNode(
          "graph-node--shared",
          "Decision context",
          uniqueValues(candidate.shared_terms || []).length + " shared terms",
          evidenceRefs.length + " evidence refs · " + relatedDecisions.length + " related decisions",
          [chip(candidate.proposed_patch_operation, "accent"), chip("Score " + formatScore(candidate.score), "success")]
        ));
        map.appendChild(create("div", "graph-link", "targets"));
        map.appendChild(graphNode(
          "",
          "Canonical",
          nodeLabel(canonicalNode, candidate.canonical_id),
          valueText(candidate.canonical_id),
          [chip(nodeStatus(canonicalNode, canonicalNode && canonicalNode.status), statusTone(nodeStatus(canonicalNode, canonicalNode && canonicalNode.status)))]
        ));
        mapStage.appendChild(map);
        wrapper.appendChild(mapStage);

        const insights = create("div", "insight-grid");
        insights.appendChild(signalCard("Shared terms", uniqueValues(candidate.shared_terms || []).join(", ") || "None", "Direct lexical overlap already found."));
        insights.appendChild(signalCard("Candidate-only refs", exclusiveValues(candidateNode && candidateNode.source_refs, canonicalNode && canonicalNode.source_refs).join(", ") || "None", "Sources currently carried only by the candidate."));
        insights.appendChild(signalCard("Canonical-only refs", exclusiveValues(canonicalNode && canonicalNode.source_refs, candidateNode && candidateNode.source_refs).join(", ") || "None", "Sources already attached to the canonical node."));
        insights.appendChild(signalCard("Rebuild drift", state.rebuild && state.rebuild.needs_update ? "Pending" : "Clear", rebuildIssues[0] || "No rebuild consistency issue reported."));
        wrapper.appendChild(insights);

        if (relatedDecisions.length > 0) {
          wrapper.appendChild(create("p", "section-copy", "Recent related decisions touching this candidate or its canonical target."));
          wrapper.appendChild(decisionGroupsList(relatedDecisions.slice(0, 4), "No related decisions in the loaded audit window"));
        } else {
          wrapper.appendChild(emptyState("No related decisions in the loaded audit window."));
        }
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

      function patchOperationValue() {
        const candidate = state.selectedCandidate;
        const override = elements.patchOperation && elements.patchOperation.value ? elements.patchOperation.value : "";
        if (override) return override;
        return candidate ? valueText(candidate.proposed_patch_operation, "accept_match") : "accept_match";
      }

      function patchReasonValue() {
        const candidate = state.selectedCandidate;
        const note = elements.patchNote && elements.patchNote.value ? elements.patchNote.value.trim() : "";
        if (note) return note;
        return (candidate && Array.isArray(candidate.reasons) && candidate.reasons[0]) || "Review in ontology studio before apply";
      }

      function patchPreviewObject() {
        const candidate = state.selectedCandidate;
        if (!candidate) return null;
        return {
          schema: "graphify_ontology_patch_v1",
          id: "preview:" + candidate.id,
          operation: patchOperationValue(),
          status: "proposed",
          profile_hash: state.queue ? state.queue.profile_hash : null,
          graph_hash: state.queue ? state.queue.graph_hash : null,
          target: {
            candidate_id: candidate.candidate_id,
            canonical_id: candidate.canonical_id,
          },
          evidence_refs: candidate.evidence_refs || [],
          reason: patchReasonValue(),
          author: "ontology-studio",
          created_at: "__preview_only__",
        };
      }

      function patchPreviewValue() {
        const preview = patchPreviewObject();
        if (!preview) return "{\\n  \\"select_candidate\\": true\\n}";
        return JSON.stringify(preview, null, 2);
      }

      function patchResultNode() {
        if (state.patchPending) {
          return create("div", "action-status action-status--warning", "Submitting patch request...");
        }
        if (!state.patchResult) {
          const defaultMessage = bootstrap.writeEnabled
            ? "Paste the bearer token to validate, dry-run, or apply the active patch."
            : "Write actions appear only when the server is started with --write.";
          return create("div", "action-status", defaultMessage);
        }
        const result = state.patchResult;
        const tone = result.ok ? "success" : "danger";
        const box = create("div", "action-status action-status--" + tone);
        const lines = [];
        lines.push((result.action || "request") + (result.ok ? " succeeded" : " failed"));
        if (result.result && typeof result.result === "object") {
          const payload = result.result;
          if (typeof payload.patch_id === "string" && payload.patch_id.trim().length > 0) {
            lines.push("Patch: " + payload.patch_id);
          }
          if (payload.valid === false) {
            lines.push("Patch is invalid");
          }
          if (payload.dry_run === true) {
            lines.push("Dry run only; no files were changed");
          }
          if (Array.isArray(payload.changed_files) && payload.changed_files.length > 0) {
            lines.push("Files: " + payload.changed_files.map(function (file) {
              return file.path;
            }).join(", "));
          }
          if (Array.isArray(payload.issues) && payload.issues.length > 0) {
            lines.push(payload.issues.map(function (issue) {
              return issue.message || String(issue);
            }).join(" | "));
          }
        }
        if (result.message) lines.push(result.message);
        box.textContent = lines.join(" · ");
        return box;
      }

      async function submitPatch(action) {
        if (!bootstrap.writeEnabled) return;
        const preview = patchPreviewObject();
        const token = elements.patchToken && elements.patchToken.value ? elements.patchToken.value.trim() : "";
        if (!preview) {
          state.patchResult = { action, ok: false, message: "Select a candidate before submitting a patch." };
          renderPatchPreview();
          return;
        }
        if (!token) {
          state.patchResult = { action, ok: false, message: "Bearer token required." };
          renderPatchPreview();
          return;
        }
        state.patchPending = true;
        state.patchResult = null;
        renderPatchPreview();
        try {
          const route = action === "validate"
            ? bootstrap.routes.patchValidate
            : action === "dry-run"
              ? bootstrap.routes.patchDryRun
              : bootstrap.routes.patchApply;
          const result = await postJson(route, preview, token);
          state.patchResult = { action, ok: result && result.valid !== false, result };
          state.patchPending = false;
          renderPatchPreview();
          if (action === "apply" && result && result.valid) {
            await Promise.all([loadQueue(), loadRebuild(), loadAuditTrail()]);
            return;
          }
        } catch (error) {
          state.patchPending = false;
          state.patchResult = { action, ok: false, message: error instanceof Error ? error.message : String(error) };
          renderPatchPreview();
        }
      }

      function renderPatchPreview() {
        if (!elements.patchPreview || !elements.patchHint) return;
        elements.patchPreview.textContent = patchPreviewValue();
        elements.patchHint.textContent = bootstrap.writeEnabled
          ? "Protected write routes are available. Use a tokenized client to validate, dry-run, or apply this preview."
          : "Browser session is read-only. Start the server with --write to expose token-protected validation and apply routes.";
        if (elements.patchValidate && elements.patchDryRun && elements.patchApply) {
          const ready = Boolean(
            bootstrap.writeEnabled
            && state.selectedCandidate
            && elements.patchToken
            && elements.patchToken.value.trim().length > 0,
          );
          elements.patchValidate.disabled = !ready || state.patchPending;
          elements.patchDryRun.disabled = !ready || state.patchPending;
          elements.patchApply.disabled = !ready || state.patchPending;
        }
        if (elements.patchResult) {
          elements.patchResult.replaceChildren(patchResultNode());
        }
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

        const wrapper = create("div", "stack");
        const related = state.selectedCandidate ? relatedDecisionGroups(state.selectedCandidate) : [];
        const relatedIds = new Set(related.map(function (group) { return group.id; }));
        if (related.length > 0) {
          wrapper.appendChild(create("p", "section-copy", "Records tied to the active candidate appear first so the analyst can anchor the decision against prior work."));
          wrapper.appendChild(decisionGroupsList(related.slice(0, 4), "No related decision records"));
        }
        const remaining = groups.filter(function (group) { return !relatedIds.has(group.id); });
        if (remaining.length > 0) {
          wrapper.appendChild(create("p", "section-copy", related.length > 0 ? "Recent decisions outside the active selection." : "Recent decisions across the loaded audit window."));
          wrapper.appendChild(decisionGroupsList(remaining.slice(0, 8), "No additional decision records"));
        }
        replaceBody(elements.auditBody, wrapper);
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
          if (elements.patchOperation && state.selectedCandidate) {
            elements.patchOperation.value = valueText(state.selectedCandidate.proposed_patch_operation, "accept_match");
          }
          if (elements.patchNote) elements.patchNote.value = "";
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
          state.patchResult = null;
        } catch (error) {
          state.queue = null;
          state.selectedId = null;
          state.selectedCandidate = null;
          state.queueError = error instanceof Error ? error.message : String(error);
          state.patchResult = null;
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

      function resetPatchResultAndRender() {
        state.patchResult = null;
        renderPatchPreview();
      }

      if (elements.queueQuery) elements.queueQuery.addEventListener("input", scheduleQueueRefresh);
      if (elements.queueMinScore) elements.queueMinScore.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueStatusFilter) elements.queueStatusFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueKindFilter) elements.queueKindFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueOperationFilter) elements.queueOperationFilter.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueSort) elements.queueSort.addEventListener("change", function () { void loadQueue(); });
      if (elements.queueOrder) elements.queueOrder.addEventListener("change", function () { void loadQueue(); });
      if (elements.patchOperation) elements.patchOperation.addEventListener("change", resetPatchResultAndRender);
      if (elements.patchNote) elements.patchNote.addEventListener("input", resetPatchResultAndRender);
      if (elements.patchToken) elements.patchToken.addEventListener("input", resetPatchResultAndRender);
      if (elements.patchValidate) elements.patchValidate.addEventListener("click", function () { void submitPatch("validate"); });
      if (elements.patchDryRun) elements.patchDryRun.addEventListener("click", function () { void submitPatch("dry-run"); });
      if (elements.patchApply) elements.patchApply.addEventListener("click", function () { void submitPatch("apply"); });
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
  const reviewCopy = writeEnabled
    ? `<p class="panel__subhead">Protected write routes are exposed on this server. The browser shell stays inspection-first and never embeds the bearer token.</p>`
    : `<p class="panel__subhead">This browser session stays read-only. Start with <code>--write</code> when you need token-protected validation or apply routes.</p>`;
  const actionRoutes = writeEnabled
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
  const actionControls = writeEnabled
    ? `<div class="stack">
        <div class="action-form">
          <label class="field field--wide">
            <span>Bearer token</span>
            <input id="patch-token" type="password" placeholder="Paste the write token for this server">
          </label>
          <label class="field">
            <span>Decision</span>
            <select id="patch-operation">
              <option value="accept_match">Accept match</option>
              <option value="reject_match">Reject match</option>
            </select>
          </label>
          <label class="field">
            <span>Analyst note</span>
            <input id="patch-note" type="text" placeholder="Optional note carried into patch reason">
          </label>
        </div>
        <div class="action-row">
          <button id="patch-validate" type="button">Validate</button>
          <button id="patch-dry-run" type="button">Dry Run</button>
          <button id="patch-apply" type="button">Apply</button>
        </div>
        <div id="patch-result"></div>
      </div>`
    : "";
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
        <div>
          <p class="eyebrow">Ontology Reconciliation Workspace</p>
          <h1 id="studio-title">Reconcile candidates against canonical entities</h1>
          <p class="lead">Work the queue, compare both sides in one place, and anchor each decision with evidence, prior patches, and rebuild drift before anything is applied.</p>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric">
            <div class="hero-metric__label">Queue</div>
            <div class="hero-metric__value">Search, sort, review</div>
            <div class="hero-metric__detail">Keep backlog triage compact and selection-driven.</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric__label">Comparison</div>
            <div class="hero-metric__value">Candidate vs canonical</div>
            <div class="hero-metric__detail">Line up labels, ids, status, terms, aliases, and evidence.</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric__label">Context</div>
            <div class="hero-metric__value">Evidence and audit</div>
            <div class="hero-metric__detail">Recent related patches and graph drift stay visible during review.</div>
          </div>
        </div>
      </section>
      <aside class="studio__mode" aria-labelledby="studio-mode-title">
        <p class="eyebrow">Review posture</p>
        <h2 id="studio-mode-title" class="panel__title">Inspection-first browser session</h2>
        ${reviewCopy}
        <div class="chip-row">
          ${writeBadge}
          <span class="chip chip--accent">Selection-led workflow</span>
          <span class="chip chip--warning">Protected mutations</span>
        </div>
        <div class="hero-metrics">
          <div class="hero-metric">
            <div class="hero-metric__label">Active focus</div>
            <div class="hero-metric__value">One pair at a time</div>
            <div class="hero-metric__detail">Center the analyst on the current candidate and its canonical target.</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric__label">Write safety</div>
            <div class="hero-metric__value">No token in browser</div>
            <div class="hero-metric__detail">Validation and apply stay behind the protected HTTP routes.</div>
          </div>
        </div>
      </aside>
    </header>

    <main class="studio__workspace">
      <aside class="studio__rail">
      <section class="panel panel--sticky" aria-labelledby="candidate-queue-title">
        <div class="panel__header">
          <div>
            <h2 id="candidate-queue-title" class="panel__title">Candidate Queue</h2>
            <p class="panel__subhead">Triage the backlog without losing the current review target while the queue refreshes.</p>
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
      </aside>

      <section class="studio__main">
        <section class="panel" aria-labelledby="selected-title">
          <div class="panel__header">
            <div>
              <h2 id="selected-title" class="panel__title">No candidate selected</h2>
              <p class="panel__subhead">Decision brief for the active pair: confirm the rationale, judge the overlap, then move to action.</p>
            </div>
            <div id="selected-meta" class="meta-row" aria-live="polite"></div>
          </div>
          <div id="selected-summary" class="panel__body"></div>
        </section>

        <section class="panel" aria-labelledby="canonical-title">
          <div class="panel__header">
            <div>
              <h2 id="canonical-title" class="panel__title">Candidate vs Canonical</h2>
              <p class="panel__subhead">Aligned rows surface what matches, what overlaps, and where the merge still needs judgment.</p>
            </div>
          </div>
          <div id="canonical-panel-body" class="panel__body"></div>
        </section>

        <section class="panel" aria-labelledby="graph-context-title">
          <div class="panel__header">
            <div>
              <h2 id="graph-context-title" class="panel__title">Decision Context</h2>
              <p class="panel__subhead">Anchor nodes, shared signals, recent related decisions, and rebuild drift around the active pair.</p>
            </div>
          </div>
          <div id="graph-panel-body" class="panel__body"></div>
        </section>
      </section>

      <aside class="studio__side">
        <section class="panel" aria-labelledby="evidence-title">
          <div class="panel__header">
            <div>
              <h2 id="evidence-title" class="panel__title">Evidence</h2>
              <p class="panel__subhead">Source references and reasons that justify or weaken the proposed reconciliation.</p>
            </div>
          </div>
          <div id="evidence-panel-body" class="panel__body"></div>
        </section>

        <section class="panel" aria-labelledby="patch-preview-title">
          <div class="panel__header">
            <div>
              <h2 id="patch-preview-title" class="panel__title">Patch Preview</h2>
              <p class="panel__subhead" id="patch-mode-copy">Browser session is read-only. Start the server with --write to expose token-protected validation and apply routes.</p>
            </div>
          </div>
          <div class="panel__body stack">
            <p class="section-copy">Preview the candidate-derived patch here. Route exposure stays visible, but write operations remain tokenized outside the browser session.</p>
            ${actionRoutes}
            ${actionControls}
            <pre id="patch-preview" class="mono-block" aria-live="polite"></pre>
          </div>
        </section>

        <section class="panel" aria-labelledby="audit-trail-title">
          <div class="panel__header">
            <div>
              <h2 id="audit-trail-title" class="panel__title">Audit Trail</h2>
              <p class="panel__subhead">Grouped by patch id so authoritative and audit sources stay readable without duplicate rows.</p>
            </div>
          </div>
          <div id="audit-panel-body" class="panel__body"></div>
        </section>

        <section class="panel" aria-labelledby="rebuild-status-title">
          <div class="panel__header">
            <div>
              <h2 id="rebuild-status-title" class="panel__title">Rebuild Status</h2>
              <p class="panel__subhead">Track graph/profile drift and whether the queued candidates still match the active ontology context.</p>
            </div>
          </div>
          <div id="rebuild-panel-body" class="panel__body"></div>
        </section>
      </aside>
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

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";

import { loadOntologyPatchContext } from "./ontology-patch-context.js";
import {
  getOntologyRebuildStatus,
  getOntologyReconciliationCandidate,
  listOntologyReconciliationCandidates,
  previewOntologyDecisionLog,
} from "./ontology-reconciliation-api.js";
import type { OntologyReconciliationCandidateFilter } from "./ontology-reconciliation.js";
import type { OntologyReconciliationDecisionLogOptions } from "./ontology-patch.js";

export interface OntologyStudioHandlerOptions {
  profileStatePath: string;
}

export interface StartOntologyStudioServerOptions extends OntologyStudioHandlerOptions {
  host?: string;
  port?: number;
}

export interface StartedOntologyStudioServer {
  server: Server;
  url: string;
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

function htmlResult(): OntologyStudioRouteResult {
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
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.45; }
    code { background: #f2f4f7; padding: 0.1rem 0.25rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Graphify Ontology Studio</h1>
  <p>Read-only reconciliation APIs are available under <code>/api/ontology</code>.</p>
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

export function createOntologyStudioRequestHandler(options: OntologyStudioHandlerOptions) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const result = handleOntologyStudioRequest(options, request.method ?? "GET", request.url ?? "/");
    sendResult(response, result);
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
      return htmlResult();
    }
    if (url.pathname === "/api/ontology/reconciliation/candidates") {
      return jsonResult(200, listOntologyReconciliationCandidates(context, candidateFilters(url.searchParams)));
    }
    const candidatePrefix = "/api/ontology/reconciliation/candidates/";
    if (url.pathname.startsWith(candidatePrefix)) {
      const id = decodeURIComponent(url.pathname.slice(candidatePrefix.length));
      return jsonResult(200, getOntologyReconciliationCandidate(context, id));
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
  const server = createServer(createOntologyStudioRequestHandler(options));
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
  };
}

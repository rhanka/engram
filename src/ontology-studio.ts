import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { URL } from "node:url";

import { applyOntologyPatch, validateOntologyPatch } from "./ontology-patch.js";
import { loadOntologyPatchContext } from "./ontology-patch-context.js";
import { renderOntologyStudioWorkspace } from "./ontology-studio-workspace.js";
import { buildGraphHtml } from "./export.js";
import { loadGraphFromData } from "./graph.js";
import { communitiesFromGraph, communityLabelsFromGraph } from "./graph-communities.js";
import { ST_TOKENS_ROUTE, buildStTokensCss } from "./workspace/tokens-st.js";
import {
  buildEntitySidecar,
  serveStudioAsset,
  type StudioAssetResult,
} from "./studio-assets.js";
import { buildStudioScene } from "./studio-scene.js";
import { attachLayoutPositions } from "./graph-layout.js";
import {
  getOntologyRebuildStatus,
  getOntologyReconciliationCandidate,
  listOntologyReconciliationCandidates,
  previewOntologyDecisionLog,
} from "./ontology-reconciliation-api.js";
import type { OntologyReconciliationCandidateFilter } from "./ontology-reconciliation.js";
import type { OntologyReconciliationDecisionLogOptions } from "./ontology-patch.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "ip6-loopback"]);
const POST_BODY_MAX_BYTES = 256 * 1024;

export interface OntologyStudioWriteOptions {
  token: string;
}

export interface OntologyStudioHandlerOptions {
  profileStatePath: string;
  write?: OntologyStudioWriteOptions;
  /** Bind host; when loopback, same-origin writes are trusted without a token. */
  host?: string;
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
  contentType:
    | "application/json; charset=utf-8"
    | "text/html; charset=utf-8"
    | "text/css; charset=utf-8";
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

function activeViewFromQuery(
  searchParams: URLSearchParams,
): "workspace" | "reconciliation" | "evidence" {
  const raw = optionalString(searchParams.get("view"));
  if (raw === "reconciliation" || raw === "evidence" || raw === "workspace") return raw;
  return "workspace";
}

function htmlResult(
  context: ReturnType<typeof loadOntologyPatchContext>,
  writeEnabled: boolean,
  selectedCandidateId: string | undefined,
  activeView: "workspace" | "reconciliation" | "evidence",
  selectedNodeId: string | undefined,
): OntologyStudioRouteResult {
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: renderOntologyStudioWorkspace(context, {
      writeEnabled,
      ...(selectedCandidateId ? { selectedCandidateId } : {}),
      ...(selectedNodeId ? { selectedNodeId } : {}),
      activeView,
    }),
  };
}

/**
 * Track G G-studio-lot2 (#3, #4): flip the served graph.html into its studio
 * variant by adding the `studio-mode` body class. The studio CSS already
 * ships in every export, so the class alone makes the canvas claim the full
 * center and show only the shapes/edges legend. Idempotent: a body that is
 * already `studio-mode` is returned unchanged.
 */
export function injectStudioMode(html: string): string {
  if (/<body[^>]*class="[^"]*studio-mode/.test(html)) return html;
  const withClass = html.replace(
    /<body([^>]*?)\bclass="([^"]*)"/i,
    (_match, attrs: string, classes: string) => `<body${attrs}class="${classes} studio-mode"`,
  );
  if (withClass !== html) return withClass;
  return html.replace(/<body\b([^>]*)>/i, '<body$1 class="studio-mode">');
}

/**
 * Compiled design-system `--st-*` tokens (light + dark). Static for the
 * process lifetime, so compile once and reuse. Served from
 * `ST_TOKENS_ROUTE` and referenced by the workspace shell via <link>.
 */
let stTokensCssCache: string | undefined;

function stTokensCssResult(): OntologyStudioRouteResult {
  if (stTokensCssCache === undefined) {
    stTokensCssCache = buildStTokensCss();
  }
  return {
    status: 200,
    contentType: "text/css; charset=utf-8",
    body: stTokensCssCache,
  };
}

function graphHtmlArtifactResult(
  context: ReturnType<typeof loadOntologyPatchContext>,
  studioMode = false,
): OntologyStudioRouteResult {
  // Track G D1/D2/D5/D8: render the graph as a generated sub-view of the studio
  // model — built from graph.json with the project profile (ontology node-type
  // shapes/colours) and the native studio variant — instead of serving a
  // possibly-stale, profile-less on-disk graph.html. Falls back to the on-disk
  // artifact when graph.json is unavailable or rendering fails (e.g. too large).
  const graphJsonPath = join(context.stateDir, "graph.json");
  if (existsSync(graphJsonPath)) {
    try {
      const graph = loadGraphFromData(JSON.parse(readFileSync(graphJsonPath, "utf-8")));
      const communities = communitiesFromGraph(graph);
      const communityLabels = communityLabelsFromGraph(graph, communities);
      const html = buildGraphHtml(graph, communities, "graph.html", {
        communityLabels,
        ...(context.profile ? { profile: context.profile } : {}),
        studioMode,
      });
      return { status: 200, contentType: "text/html; charset=utf-8", body: html };
    } catch {
      // Fall through to the pre-built artifact below.
    }
  }
  const graphHtmlPath = join(context.stateDir, "graph.html");
  if (!existsSync(graphHtmlPath)) {
    return jsonResult(404, { error: "graph.html not found" });
  }
  const raw = readFileSync(graphHtmlPath, "utf-8");
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: studioMode ? injectStudioMode(raw) : raw,
  };
}

/**
 * Serve the raw graph.json the SPA renders. Returned verbatim (no re-parse) so
 * the payload stays byte-identical to the artifact on disk.
 */
function graphJsonResult(stateDir: string): OntologyStudioRouteResult {
  const graphPath = join(stateDir, "graph.json");
  if (!existsSync(graphPath)) {
    return jsonResult(404, { error: "graph.json not found" });
  }
  return {
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: readFileSync(graphPath, "utf-8"),
  };
}

/**
 * Serve the light ForceGraph `scene.json` (build-time preprocessor output).
 * Computed from graph.json via `buildStudioScene`, the TS replica of the SPA's
 * `buildScene`. ÉTAPE 1: additive only — the client still fetches graph.json;
 * this route is independently testable and unblocks the later client switch.
 */
function sceneJsonResult(stateDir: string): OntologyStudioRouteResult {
  const graphPath = join(stateDir, "graph.json");
  if (!existsSync(graphPath)) {
    return jsonResult(404, { error: "graph.json not found" });
  }
  const graph = JSON.parse(readFileSync(graphPath, "utf-8"));
  // Pre-compute and pin node positions (x,y + fx,fy) so the studio renders the
  // settled layout with iterations=1 instead of running the O(n²) sim at mount.
  // Deterministic, so the static-export build and this route agree byte-for-byte.
  return jsonResult(200, attachLayoutPositions(buildStudioScene(graph)));
}

function sendResult(response: ServerResponse, result: OntologyStudioRouteResult): void {
  response.writeHead(result.status, {
    "content-type": result.contentType,
    "cache-control": "no-store",
  });
  response.end(result.body);
}

function sendAsset(response: ServerResponse, result: StudioAssetResult): void {
  response.writeHead(result.status, {
    "content-type": result.contentType,
    "cache-control": "no-store",
  });
  response.end(result.body);
}

/**
 * The SPA is mounted under `/studio`. Strip that prefix to get the asset path
 * relative to the built app (so `/studio/assets/x.js` -> `/assets/x.js`).
 */
const STUDIO_SPA_PREFIX = "/studio";

function studioSpaPathname(pathname: string): string | null {
  if (pathname === STUDIO_SPA_PREFIX) return "/";
  if (pathname.startsWith(STUDIO_SPA_PREFIX + "/")) {
    return pathname.slice(STUDIO_SPA_PREFIX.length) || "/";
  }
  return null;
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
      // Auth for write routes. The bearer token is always accepted. As a
      // loopback-only convenience (SVELTE-7), when the server is bound to a
      // loopback host the same-origin SPA may POST WITHOUT a token: `--write`
      // already refuses non-loopback binds, so nothing reachable from the
      // network can hit this. (A future Sentropic-integrated auth replaces this.)
      const token = bearerToken(request.headers.authorization);
      const loopbackTrusted = options.host !== undefined && isLoopbackHost(options.host);
      if (token !== options.write.token && !loopbackTrusted) {
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

    // The client Svelte SPA + its data routes are served before the legacy
    // server-rendered HTML so the two studios coexist. SPA assets can be
    // binary, hence the dedicated `sendAsset` path.
    if (method === "GET") {
      const url = new URL(requestUrl, "http://127.0.0.1");
      // The SPA's asset URLs are relative ("./assets/x.js"); they only resolve
      // when the document path ends in a slash. Redirect /studio -> /studio/ so
      // the browser anchors relative requests under the mount.
      if (url.pathname === STUDIO_SPA_PREFIX) {
        response.writeHead(308, { location: `${STUDIO_SPA_PREFIX}/${url.search}` });
        response.end();
        return;
      }
      const spaPath = studioSpaPathname(url.pathname);
      if (spaPath !== null) {
        const asset = serveStudioAsset(spaPath);
        if (asset) {
          sendAsset(response, asset);
          return;
        }
      }
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
    // Static design-system token stylesheet. Served before the (heavier)
    // patch-context load since it needs no profile state.
    if (url.pathname === ST_TOKENS_ROUTE) {
      return stTokensCssResult();
    }
    const context = loadOntologyPatchContext(options.profileStatePath);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const activeView = activeViewFromQuery(url.searchParams);
      // Backwards-compat: when ?candidate=<id> is present without a
      // ?view= override, route into the Reconciliation sub-view so the
      // legacy deep links still surface the candidate workbench.
      const rawCandidate = optionalString(url.searchParams.get("candidate"));
      // G-studio-lot4 (#7): ?node=<id> selects an entity for the right column.
      const rawNode = optionalString(url.searchParams.get("node"));
      const resolvedView =
        activeView === "workspace" && rawCandidate ? "reconciliation" : activeView;
      return htmlResult(context, Boolean(options.write), rawCandidate, resolvedView, rawNode);
    }
    if (url.pathname === "/api/ontology/artifacts/graph.html") {
      return graphHtmlArtifactResult(context, url.searchParams.get("studio") === "1");
    }
    if (url.pathname === "/api/ontology/graph.json") {
      return graphJsonResult(context.stateDir);
    }
    if (url.pathname === "/api/ontology/scene.json") {
      return sceneJsonResult(context.stateDir);
    }
    const entityPrefix = "/api/ontology/entity/";
    if (url.pathname.startsWith(entityPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(entityPrefix.length));
      if (!id) return jsonResult(400, { error: "missing entity id" });
      return jsonResult(200, buildEntitySidecar(context.stateDir, id));
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
  const writeEnabled = options.write === true;
  if (writeEnabled && !isLoopbackHost(host)) {
    throw new Error(
      `--write requires a loopback bind (127.0.0.1, ::1 or localhost); refused host ${host}`,
    );
  }
  const handlerOptions: OntologyStudioHandlerOptions = {
    profileStatePath: options.profileStatePath,
    host,
  };
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

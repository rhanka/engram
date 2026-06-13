/**
 * Static-asset + data plumbing for the client Svelte studio SPA.
 *
 * The SPA (built under `studio/` with Vite) is served BY `graphify ontology
 * studio` from a static route. This module:
 *   - resolves the built SPA directory at runtime (published vs source tree),
 *   - serves its static files (index.html / JS / CSS) with correct mime types,
 *   - exposes the raw graph.json + a per-entity sidecar (wiki description +
 *     occurrences) the SPA fetches on selection.
 *
 * Everything degrades gracefully: a missing SPA build yields a 404 with a hint,
 * a missing sidecar yields nulls so the entity panel stays graph-only.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { OntologyCitation } from "./types.js";

export interface StudioAssetResult {
  status: number;
  contentType: string;
  /** UTF-8 string body for text assets; Buffer for binary (fonts/images). */
  body: string | Buffer;
}

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const TEXT_EXTS = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".map", ".txt"]);

function moduleDir(): string {
  if (typeof __dirname === "string") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * Locate the built SPA directory. Two layouts are supported:
 *   - published package: `dist/studio-app/` (a `prepublish` copy of the Vite
 *     build sits next to the compiled server JS in `dist/`).
 *   - source / dev tree: `studio/dist/` at the repo root (the raw Vite output).
 * Returns null when neither exists (the SPA has not been built yet).
 */
export function resolveStudioAppDir(): string | null {
  const baseDir = moduleDir();
  const candidates = [
    // Compiled server lives at <root>/dist/ontology-studio.js -> sibling copy.
    join(baseDir, "studio-app"),
    // Running from source/tests: <root>/src/.. -> studio/dist.
    join(baseDir, "..", "studio", "dist"),
    join(baseDir, "..", "..", "studio", "dist"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

function mimeForPath(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

function isText(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : "";
  return TEXT_EXTS.has(ext);
}

/**
 * Serve a static file from the built SPA. `pathname` is the request path
 * (already URL-decoded). "/" maps to index.html. Path traversal is rejected.
 * Returns null when the request is not a studio-app asset (so the caller can
 * fall through to the JSON API / legacy HTML routes).
 */
export function serveStudioAsset(pathname: string): StudioAssetResult | null {
  const appDir = resolveStudioAppDir();
  if (!appDir) {
    return {
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Studio SPA not built. Run `npm --prefix studio run build` then restart.",
    };
  }

  let rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  rel = normalize(rel);
  const target = resolve(appDir, rel);
  // Reject traversal outside the app dir.
  if (target !== appDir && !target.startsWith(appDir + sep)) {
    return { status: 403, contentType: "text/plain; charset=utf-8", body: "forbidden" };
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    // SPA fallback: unknown deep paths return index.html so client routing works.
    const index = join(appDir, "index.html");
    if (existsSync(index)) {
      return {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: readFileSync(index, "utf-8"),
      };
    }
    return { status: 404, contentType: "text/plain; charset=utf-8", body: "not found" };
  }

  const contentType = mimeForPath(target);
  const body = isText(target) ? readFileSync(target, "utf-8") : readFileSync(target);
  return { status: 200, contentType, body };
}

// ---------------------------------------------------------------------------
// Per-entity sidecar (node description + occurrences) for the SPA right panel.
// Mirrors the loaders in ontology-studio-workspace.ts, kept standalone so the
// SPA route does not depend on the server-rendered workspace model.
// ---------------------------------------------------------------------------

interface WikiNodeSidecar {
  status?: string;
  description?: string | null;
}

interface WikiSidecarIndex {
  nodes?: Record<string, WikiNodeSidecar>;
}

function loadJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function loadDescriptionIndex(stateDir: string): WikiSidecarIndex | null {
  const candidates = [
    join(stateDir, "wiki", "descriptions.assistant-merged.json"),
    join(stateDir, "wiki", "descriptions.json"),
  ];
  for (const path of candidates) {
    const parsed = loadJsonSafe<WikiSidecarIndex>(path);
    if (parsed && parsed.nodes) return parsed;
  }
  return null;
}

// ---------------------------------------------------------------------------
// graph.json node-description index (WP11). Each node carries a one-sentence
// `description`; the sidecar surfaces it as the primary description. graph.json
// can be multi-MB and the entity route is hit once per selection, so the
// id -> description map is cached and only rebuilt when the file's mtime moves.
// ---------------------------------------------------------------------------

interface GraphNodeDescriptionCacheEntry {
  mtimeMs: number;
  byId: Map<string, string>;
}

const graphDescriptionCache = new Map<string, GraphNodeDescriptionCacheEntry>();

interface GraphFileShape {
  nodes?: Array<{ id?: unknown; description?: unknown }>;
}

/**
 * Map of node id -> trimmed non-empty `description` from `<stateDir>/graph.json`.
 * Returns an empty map when graph.json is missing/unreadable. Cached per state
 * dir, invalidated on mtime change (so an in-process rebuild is picked up).
 */
function loadGraphNodeDescriptions(stateDir: string): Map<string, string> {
  const graphPath = join(stateDir, "graph.json");
  let mtimeMs: number;
  try {
    mtimeMs = statSync(graphPath).mtimeMs;
  } catch {
    graphDescriptionCache.delete(stateDir);
    return new Map();
  }
  const cached = graphDescriptionCache.get(stateDir);
  if (cached && cached.mtimeMs === mtimeMs) return cached.byId;

  const byId = new Map<string, string>();
  const graph = loadJsonSafe<GraphFileShape>(graphPath);
  if (graph && Array.isArray(graph.nodes)) {
    for (const node of graph.nodes) {
      const id = node?.id;
      if (typeof id !== "string" || !id) continue;
      const desc = node?.description;
      if (typeof desc !== "string") continue;
      const trimmed = desc.trim();
      if (trimmed) byId.set(id, trimmed);
    }
  }
  graphDescriptionCache.set(stateDir, { mtimeMs, byId });
  return byId;
}

/** Test seam: drop the cached graph.json node-description index. */
export function __resetGraphDescriptionCache(): void {
  graphDescriptionCache.clear();
}

// ---------------------------------------------------------------------------
// Level-2 citations store (`ontology/citations.json`, SPEC_CITATIONS.md). The
// full per-entity citation list lives here, served lazily on entity selection.
// Like the description index above, it can be large and is hit once per
// selection, so it is loaded through a single mtime-keyed in-memory index
// (the loadGraphNodeDescriptions pattern) — NOT re-parsed per request.
//
// Consistency gate: the store carries the citation-content `graph_signature`
// of the graph.json it was emitted against. On read, the signature is matched
// against the current graph.json's citation-content hash; on MISMATCH the
// store is treated as ABSENT (the client then falls back to the inline K-set).
// ---------------------------------------------------------------------------

/** One node's Level-2 citation record: true count + the full union list. */
export interface CitationSidecarEntry {
  count: number;
  citations: OntologyCitation[];
}

interface CitationsSidecarShape {
  schema?: unknown;
  graph_signature?: unknown;
  nodes?: Record<string, CitationSidecarEntry>;
}

interface CitationsSidecarCacheEntry {
  mtimeMs: number;
  store: CitationsSidecarShape | null;
}

const citationsSidecarCache = new Map<string, CitationsSidecarCacheEntry>();

/**
 * Load `<stateDir>/ontology/citations.json` through an mtime-keyed in-memory
 * index. Returns null when the store is missing/unreadable. Cached per state
 * dir, invalidated on mtime change (an in-process rebuild is picked up).
 */
function loadCitationsSidecar(stateDir: string): CitationsSidecarShape | null {
  const path = join(stateDir, "ontology", "citations.json");
  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    citationsSidecarCache.delete(stateDir);
    return null;
  }
  const cached = citationsSidecarCache.get(stateDir);
  if (cached && cached.mtimeMs === mtimeMs) return cached.store;

  const store = loadJsonSafe<CitationsSidecarShape>(path);
  citationsSidecarCache.set(stateDir, { mtimeMs, store });
  return store;
}

/** Test seam: drop the cached citations.json index. */
export function __resetCitationsSidecarCache(): void {
  citationsSidecarCache.clear();
}

interface GraphFileShapeWithCitations {
  nodes?: Array<{ id?: unknown; citations?: unknown }>;
}

/**
 * Citation-content hash of the on-disk graph.json — a faithful replica of the
 * pass-1 `computeCitationSignature` (src/citations.ts), which hashes the sorted
 * projection `{ node_id -> inline citations }` over the in-memory graph. Here
 * the projection is read from the serialized graph.json node array (toJson
 * spreads `...attrs`, so each node's inline `citations` is verbatim). Byte-
 * identical inline citations ⇒ identical signature; any change ⇒ a different
 * one. Kept in lock-step with citations.ts; the union test cross-checks them.
 */
function computeGraphCitationSignature(stateDir: string): string {
  const graphPath = join(stateDir, "graph.json");
  const graph = loadJsonSafe<GraphFileShapeWithCitations>(graphPath);
  const projection: Record<string, OntologyCitation[]> = {};
  if (graph && Array.isArray(graph.nodes)) {
    for (const node of graph.nodes) {
      const id = node?.id;
      if (typeof id !== "string" || !id) continue;
      const inline = node?.citations;
      if (Array.isArray(inline) && inline.length > 0) {
        projection[id] = inline as OntologyCitation[];
      }
    }
  }
  const sortedIds = Object.keys(projection).sort();
  const canonical = sortedIds.map((id) => [id, projection[id]] as const);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * The Level-2 citation record for a node id, or undefined when the store is
 * absent / signature-stale / has no entry for the id. The signature gate is
 * evaluated once per (cached) store read.
 */
function loadCitationsForNode(stateDir: string, id: string): CitationSidecarEntry | undefined {
  const store = loadCitationsSidecar(stateDir);
  if (!store || !store.nodes) return undefined;
  // Consistency gate: a content-stale store is treated as ABSENT so the client
  // falls back to the inline K-set rather than silently mixing tiers.
  const stamped = typeof store.graph_signature === "string" ? store.graph_signature : "";
  if (!stamped || stamped !== computeGraphCitationSignature(stateDir)) return undefined;
  const entry = store.nodes[id];
  if (!entry || typeof entry !== "object") return undefined;
  const count = typeof entry.count === "number" ? entry.count : 0;
  const citations = Array.isArray(entry.citations) ? entry.citations : [];
  return { count, citations };
}

export interface EntitySidecarResponse {
  id: string;
  description: { status: string; description: string | null } | null;
  occurrences: unknown;
  /**
   * Level-2 full per-entity citation list, lazily served (SPEC_CITATIONS.md).
   * Present only when `ontology/citations.json` exists, its `graph_signature`
   * matches the current graph.json, and it carries an entry for this id;
   * undefined otherwise (the client then renders the inline K-set).
   */
  citations?: CitationSidecarEntry;
}

/**
 * Build the `/api/ontology/entity/<id>` payload: the node description
 * (normalised to { status, description }) plus the occurrence record for this
 * node id, if any. Returns the shape the SPA's EntityPanel expects.
 *
 * Description precedence (WP11): the node's own `graph.json` description wins;
 * the opt-in wiki sidecar index is consulted only when the node has none. So a
 * graph whose nodes all carry descriptions reports them all here even without a
 * wiki sidecar present.
 */
export function buildEntitySidecar(stateDir: string, id: string): EntitySidecarResponse {
  let description: EntitySidecarResponse["description"] = null;

  // 1. graph.json node.description (the default WP11 source).
  const nodeDescription = loadGraphNodeDescriptions(stateDir).get(id);
  if (nodeDescription) {
    description = { status: "generated", description: nodeDescription };
  } else {
    // 2. Fall back to the opt-in wiki description sidecar.
    const index = loadDescriptionIndex(stateDir);
    const entry = index?.nodes?.[id];
    if (entry) {
      description =
        entry.status === "generated"
          ? { status: "generated", description: entry.description ?? null }
          : { status: "insufficient_evidence", description: null };
    }
  }

  const occRaw = loadJsonSafe<Record<string, unknown>>(join(stateDir, "ontology", "occurrences.json"));
  let occurrences: unknown = null;
  if (occRaw) {
    const nodes =
      occRaw.nodes && typeof occRaw.nodes === "object"
        ? (occRaw.nodes as Record<string, unknown>)
        : occRaw;
    occurrences = nodes[id] ?? null;
  }

  const citations = loadCitationsForNode(stateDir, id);

  const response: EntitySidecarResponse = { id, description, occurrences };
  if (citations) response.citations = citations;
  return response;
}

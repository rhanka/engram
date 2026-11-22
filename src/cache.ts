/**
 * Per-file extraction cache - skip unchanged files on re-run.
 */
import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  renameSync,
  existsSync,
  statSync,
  type BigIntStats,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import {
  absolutizeSourceFilesIn,
  CACHE_BUCKETS,
  LIVE_CACHE_SCHEMA_VERSION,
  LIVE_EXTRACTOR_VERSION,
  assertValidLiveStore,
  liveExtractionBind,
  liveExtractionKey,
  loadFromLiveStore,
  relativizeSourceFilesIn,
  saveToLiveStore,
  type InjectedCacheStore,
  type LiveExtractionKeyInput,
  type LiveScopeBinding,
} from "./live-cache-keys.js";
import { resolveGraphifyPaths } from "./paths.js";
import { enforceCachedMemoryFreshness } from "./graph-memory-projection.js";

// Closed-core leaf (plan/09 L5-P2a): the live key, bind and envelope protocol
// live in `./live-cache-keys.js`; this module re-exports their names so every
// importer keeps its path, and reuses the protocol for the injected branches.
export {
  LIVE_CACHE_SCHEMA_VERSION,
  LIVE_EXTRACTOR_VERSION,
  assertValidLiveStore,
  liveExtractionBind,
  liveExtractionKey,
  type InjectedCacheStore,
  type LiveExtractionKeyInput,
  type LiveScopeBinding,
};

// ---------------------------------------------------------------------------
// Stat-based fastpath (upstream d84f07c)
// Skips full SHA256 when (size, mtime_ns) is unchanged — same trade-off as
// make(1). Index is flushed atomically at process exit.
// ---------------------------------------------------------------------------

interface StatIndexEntry {
  size: number;
  mtime_ns: number;
  hash: string;
}

let statIndex: Record<string, StatIndexEntry> = {};
let statIndexRoot: string | null = null;
let statIndexDirty = false;
let statIndexExitHookRegistered = false;

function statIndexFile(root: string): string {
  return join(resolveGraphifyPaths({ root }).cacheDir, "stat-index.json");
}

function ensureStatIndex(root: string): void {
  if (statIndexRoot !== null) return;
  statIndexRoot = resolve(root);
  const p = statIndexFile(statIndexRoot);
  if (existsSync(p)) {
    try {
      statIndex = JSON.parse(readFileSync(p, "utf-8")) as Record<string, StatIndexEntry>;
    } catch {
      statIndex = {};
    }
  } else {
    statIndex = {};
  }
  if (!statIndexExitHookRegistered) {
    statIndexExitHookRegistered = true;
    process.on("exit", flushStatIndex);
  }
}

function flushStatIndex(): void {
  if (!statIndexDirty || statIndexRoot === null) return;
  const p = statIndexFile(statIndexRoot);
  try {
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(statIndex));
    renameSync(tmp, p);
  } catch {
    /* swallow — cache is best-effort */
  }
  statIndexDirty = false;
}

function statMtimeNs(stat: BigIntStats): number {
  // `mtimeNs` is only populated on BigIntStats (statSync with bigint: true);
  // a plain Stats never carries it. Number() keeps the existing stat-index
  // schema (mtime_ns: number) at ~hundreds-of-ns precision, far below kernel
  // timestamp granularity.
  return Number(stat.mtimeNs);
}

export interface CacheOptions {
  kind?: string;
  namespace?: string;
  profileHash?: string;
  /**
   * L5 injected host storage (plan/09 L5; SPEC_LIVE_GIT_INDEXING.md §8).
   * When present, load/save go through this port with a content-derived key
   * and never touch the default source-root cache directory. Absent keeps
   * the legacy filesystem behavior for existing callers — EXCEPT when
   * liveNoCache is set (live mode without a usable port): then both calls
   * are explicit no-cache no-ops that never touch the filesystem or stat
   * index (R4).
   */
  store?: InjectedCacheStore | null;
  /** L5 live explicit no-cache marker (R4): skips every filesystem path. */
  liveNoCache?: boolean;
  /**
   * MCP-L3 freshness proof (M10 l.1399): the live high-water cursor the
   * caller vouches for. A cached extraction carrying memory nodes is always
   * gated on save and on load — without this proof, or behind it, it is
   * refused (`PROJECTION_STALE`) instead of being served as a current view.
   */
  memoryHighWaterCursor?: string;
  /** L5 live canonical key precomputed by the caller (R1/R2/R5 binding). */
  liveKey?: string;
  /**
   * L5 expected per-component identity (M1: from liveExtractionBind). The
   * injected load reuses an entry only when the stored envelope's bind block
   * is component-wise equal; without it the load is a miss.
   */
  liveBind?: Record<string, unknown> | null;
}

/**
 * L5 injected host cache port. The host implements bounded, versioned
 * storage outside every observed worktree; engram derives opaque keys only.
 * Synchronous by design; definition moved to `./live-cache-keys.js`
 * (plan/09 L5-P2a) and re-exported above.
 */

function bodyContent(content: Buffer): Buffer {
  const text = content.toString("utf-8");
  if (!text.startsWith("---")) {
    return content;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    return content;
  }
  return Buffer.from(text.slice(end + 4), "utf-8");
}

/**
 * SHA256 of file contents + project-relative path. Prevents cache collisions on identical content
 * while keeping cache entries portable across machines and checkout directories.
 *
 * For Markdown files, YAML frontmatter is stripped before hashing so metadata-only
 * changes do not invalidate semantic extraction cache entries.
 */
export function fileHash(filePath: string, root: string = "."): string {
  let stat: BigIntStats;
  try {
    stat = statSync(filePath, { bigint: true });
  } catch (error) {
    throw error;
  }
  if (!stat.isFile()) {
    throw new Error(`fileHash requires a file, got: ${filePath}`);
  }

  // Upstream d84f07c: stat fastpath — skip full SHA256 read when size and
  // mtime are unchanged. `touch` triggers a harmless re-hash; same-size edits
  // within the same kernel timestamp tick are the only blind spot (matches
  // make(1)). bigint stats are required: plain statSync has no mtimeNs and
  // its mtimeMs*1e6 fallback degraded the window to ~milliseconds.
  ensureStatIndex(root);
  const absKey = resolve(filePath);
  const mtimeNs = statMtimeNs(stat);
  const size = Number(stat.size);
  const cached = statIndex[absKey];
  if (cached && cached.size === size && cached.mtime_ns === mtimeNs) {
    return cached.hash;
  }

  const digest = contentDigest(filePath, root, absKey);

  statIndex[absKey] = { size, mtime_ns: mtimeNs, hash: digest };
  statIndexDirty = true;

  return digest;
}

/**
 * Content digest of file bytes + project-relative path (the byte-stable half
 * of fileHash, without the stat fastpath). Shared by the legacy stat-indexed
 * fileHash and the L5 injected live key so both schemes hash identical bytes.
 */
function contentDigest(filePath: string, root: string, absKey: string): string {
  const raw = readFileSync(filePath);
  const content = extname(filePath).toLowerCase() === ".md" ? bodyContent(raw) : raw;
  const resolvedRoot = resolve(root);
  const h = createHash("sha256");
  h.update(content);
  h.update("\0");
  const relativePath = absKey.startsWith(resolvedRoot + "/") || absKey === resolvedRoot
    ? absKey.slice(resolvedRoot.length).replace(/^\/+/, "") || "."
    : absKey;
  h.update(relativePath);
  return h.digest("hex");
}

/**
 * L5 live cache key: content-derived only, never size/mtime/topology alone
 * (plan/09 L5 forbids topology-only or size/mtime-only freshness proofs).
 * The live path bypasses the stat index entirely — a same-size edit inside
 * one timestamp tick is a miss here, not a stale hit.
 */
export function liveContentKey(filePath: string, root: string = "."): string {
  return `live:${contentDigest(filePath, root, resolve(filePath))}`;
}

/** L5 key, bind and envelope protocol (plan/09 L5-P2a): moved verbatim to
 * `./live-cache-keys.js` and re-exported above. */

/** Explicit live no-cache mode descriptor (R4: omitted/null port). */
export function liveNoCacheReason(reason: string): { cacheMode: "no-cache"; reason: string } {
  return { cacheMode: "no-cache", reason };
}

/** Test-only: clear the in-memory stat index. Do not use from production code. */
export function _resetStatIndexForTesting(): void {
  statIndex = {};
  statIndexRoot = null;
  statIndexDirty = false;
}

function legacyFileHash(filePath: string): string {
  const raw = readFileSync(filePath);
  const content = extname(filePath).toLowerCase() === ".md" ? bodyContent(raw) : raw;
  const h = createHash("sha256");
  h.update(content);
  h.update("\0");
  h.update(resolve(filePath));
  return h.digest("hex");
}

function safeNamespace(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized) return normalized;
  return createHash("sha256").update(value).digest("hex");
}

function cacheNamespace(options: CacheOptions = {}): string | null {
  if (options.namespace) return safeNamespace(options.namespace);
  if (options.profileHash) return safeNamespace(`profile-${options.profileHash}`);
  return null;
}

function cacheKind(options: CacheOptions = {}): string {
  return safeNamespace(options.kind ?? "ast");
}

function legacyCacheDir(root: string = ".", options: CacheOptions = {}): string {
  const namespace = cacheNamespace(options);
  const base = resolveGraphifyPaths({ root }).cacheDir;
  const d = namespace ? join(base, namespace) : base;
  mkdirSync(d, { recursive: true });
  return d;
}

function collectJsonStems(dir: string, result: Set<string>): void {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        collectJsonStems(absolute, result);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        result.add(entry.name.replace(/\.json$/, ""));
      }
    }
  } catch {
    /* ignore */
  }
}

function removeJsonFiles(dir: string): void {
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        removeJsonFiles(absolute);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        unlinkSync(absolute);
      }
    }
  } catch {
    /* ignore */
  }
}

/** source_file relativization (plan/09 L5-P2a): moved verbatim to
 * `./live-cache-keys.js` with the envelope protocol (port of upstream
 * 25df580, F-0831-P2d); reused below for the filesystem branches. */

/** Returns graphify cache path - creates it if needed. */
export function cacheDir(root: string = ".", options: CacheOptions = {}): string {
  const namespace = cacheNamespace(options);
  const kindDir = join(resolveGraphifyPaths({ root }).cacheDir, cacheKind(options));
  const d = namespace ? join(kindDir, namespace) : kindDir;
  mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Return cached extraction for this file if hash matches, else null.
 */
export function loadCached(
  filePath: string,
  root: string = ".",
  options: CacheOptions = {},
): Record<string, unknown> | null {
  // L5 explicit no-cache (R4): live mode without a usable port never touches
  // the filesystem or the stat index.
  if (options.liveNoCache === true) return null;
  // L5 injected host storage: content-derived key through the port, never a
  // default-root directory read. Authoritative — no filesystem fallback.
  // The envelope protocol is the single definition in `./live-cache-keys.js`;
  // the root wrappers keep the projection freshness gate (its refusal still
  // propagates, never a silent miss).
  const injected = options.store ?? null;
  if (injected !== null) {
    return loadFromLiveStore(injected, filePath, root, options, (payload) =>
      enforceCachedMemoryFreshness(payload, options.memoryHighWaterCursor),
    );
  }
  let h: string;
  try {
    h = fileHash(filePath, root);
  } catch {
    return null;
  }
  // MCP-L3 mandatory freshness gate (M10 l.1399): refusal propagates
  // (never a silent miss). A memory-carrying payload without a high-water
  // proof — or behind it — must not be served as a current view.
  const checkFresh = (result: Record<string, unknown>): void => {
    enforceCachedMemoryFreshness(result, options.memoryHighWaterCursor);
  };
  const entry = join(cacheDir(root, options), `${h}.json`);
  if (existsSync(entry)) {
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(readFileSync(entry, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
    checkFresh(result);
    try {
      // Re-anchor relative source_file fields so callers see the same absolute-path
      // shape that a fresh in-process extraction produces (#777 / F-0831-P2d).
      absolutizeSourceFilesIn(result, root);
    } catch {
      return null;
    }
    return result;
  }

  if ((options.kind ?? "ast") === "ast") {
    const legacyEntry = join(legacyCacheDir(root, options), `${h}.json`);
    if (existsSync(legacyEntry)) {
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(readFileSync(legacyEntry, "utf-8")) as Record<string, unknown>;
      } catch {
        return null;
      }
      checkFresh(result);
      try {
        absolutizeSourceFilesIn(result, root);
      } catch {
        return null;
      }
      return result;
    }

    const legacyHashEntry = join(legacyCacheDir(root, options), `${legacyFileHash(filePath)}.json`);
    if (!existsSync(legacyHashEntry)) return null;
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(readFileSync(legacyHashEntry, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
    checkFresh(result);
    try {
      absolutizeSourceFilesIn(result, root);
    } catch {
      return null;
    }
    return result;
  }
  return null;
}

/** Save extraction result for this file. */
export function saveCached(
  filePath: string,
  result: Record<string, unknown>,
  root: string = ".",
  options: CacheOptions = {},
): void {
  // L5 explicit no-cache (R4): live mode without a usable port never touches
  // the filesystem or the stat index (no statSync either).
  if (options.liveNoCache === true) return;
  // L5 injected host storage: content-derived key through the port, never a
  // default-root directory write. Authoritative — no filesystem fallback.
  // A throwing port disables caching and permits recomputation (R4): the
  // fresh result stays usable, the failure is operational only.
  const injected = options.store ?? null;
  if (injected !== null) {
    saveToLiveStore(injected, filePath, result, root, options, (payload) =>
      enforceCachedMemoryFreshness(payload, options.memoryHighWaterCursor),
    );
    return;
  }
  try {
    if (!statSync(filePath).isFile()) {
      return;
    }
  } catch {
    return;
  }
  const h = fileHash(filePath, root);
  const entry = join(cacheDir(root, options), `${h}.json`);
  const tmp = entry + ".tmp";

  // Relativize source_file fields against root before writing to disk so the
  // cache file is portable across machines and checkout directories (#777 / F-0831-P2d).
  // We serialize a relativized *copy* rather than mutating the caller's dict —
  // downstream pipeline steps (e.g. AST prefix remap) depend on the original
  // absolute form and must not see a silent mutation.
  const hasBuckets = CACHE_BUCKETS.some((b) => Array.isArray(result[b]) && (result[b] as unknown[]).length > 0);
  const onDisk: Record<string, unknown> = hasBuckets
    ? JSON.parse(JSON.stringify(result)) as Record<string, unknown>
    : result;
  // MCP-L3 mandatory freshness gate (M10 l.1399): never cache an unproven
  // or stale projection.
  enforceCachedMemoryFreshness(onDisk, options.memoryHighWaterCursor);
  if (hasBuckets) relativizeSourceFilesIn(onDisk, root);

  try {
    writeFileSync(tmp, JSON.stringify(onDisk));
    renameSync(tmp, entry);
  } catch {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw new Error(`Failed to save cache for ${filePath}`);
  }
}

/** Return set of file hashes that have a valid cache entry. */
export function cachedFiles(root: string = ".", options: CacheOptions = {}): Set<string> {
  const result = new Set<string>();
  if (options.kind) {
    collectJsonStems(cacheDir(root, options), result);
    return result;
  }
  collectJsonStems(resolveGraphifyPaths({ root }).cacheDir, result);
  return result;
}

/** Delete all graphify cache entries. */
export function clearCache(root: string = ".", options: CacheOptions = {}): void {
  if (options.kind) {
    removeJsonFiles(cacheDir(root, options));
    return;
  }
  removeJsonFiles(resolveGraphifyPaths({ root }).cacheDir);
}

interface ExtractionPart {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  hyperedges: Array<Record<string, unknown>>;
}

/**
 * Check semantic extraction cache for a list of file paths.
 * Returns [cachedNodes, cachedEdges, cachedHyperedges, uncachedFiles].
 */
export function checkSemanticCache(
  files: string[],
  root: string = ".",
  options: CacheOptions = {},
): [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>, string[]] {
  const cachedNodes: Array<Record<string, unknown>> = [];
  const cachedEdges: Array<Record<string, unknown>> = [];
  const cachedHyperedges: Array<Record<string, unknown>> = [];
  const uncached: string[] = [];

  for (const fpath of files) {
    const semanticResult = loadCached(fpath, root, { ...options, kind: "semantic" });
    if (semanticResult !== null) {
      const r = semanticResult as unknown as ExtractionPart;
      cachedNodes.push(...(r.nodes ?? []));
      cachedEdges.push(...(r.edges ?? []));
      cachedHyperedges.push(...(r.hyperedges ?? []));
    } else {
      uncached.push(fpath);
    }
  }

  return [cachedNodes, cachedEdges, cachedHyperedges, uncached];
}

/**
 * Save semantic extraction results to cache, keyed by source_file.
 * Returns the number of files cached.
 */
export function saveSemanticCache(
  nodes: Array<Record<string, unknown>>,
  edges: Array<Record<string, unknown>>,
  hyperedges: Array<Record<string, unknown>> | null = null,
  root: string = ".",
  options: CacheOptions = {},
): number {
  const byFile = new Map<string, ExtractionPart>();

  for (const n of nodes) {
    const src = (n.source_file as string) ?? "";
    if (!src) continue;
    if (!byFile.has(src)) byFile.set(src, { nodes: [], edges: [], hyperedges: [] });
    byFile.get(src)!.nodes.push(n);
  }
  for (const e of edges) {
    const src = (e.source_file as string) ?? "";
    if (!src) continue;
    if (!byFile.has(src)) byFile.set(src, { nodes: [], edges: [], hyperedges: [] });
    byFile.get(src)!.edges.push(e);
  }
  for (const h of hyperedges ?? []) {
    const src = (h.source_file as string) ?? "";
    if (!src) continue;
    if (!byFile.has(src)) byFile.set(src, { nodes: [], edges: [], hyperedges: [] });
    byFile.get(src)!.hyperedges.push(h);
  }

  let saved = 0;
  for (const [fpath, result] of byFile) {
    const p = resolve(root, fpath);
    try {
      if (statSync(p).isFile()) {
        saveCached(p, result as unknown as Record<string, unknown>, root, { ...options, kind: "semantic" });
        saved++;
      }
    } catch {
      continue;
    }
  }
  return saved;
}

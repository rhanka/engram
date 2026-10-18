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
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { resolveGraphifyPaths } from "./paths.js";
import { enforceCachedMemoryFreshness } from "./graph-memory-projection.js";

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
 * Synchronous by design: the reused extraction loop stays synchronous on
 * the cache path, matching the legacy loadCached/saveCached contract.
 */
export interface InjectedCacheStore {
  load(key: string): string | null;
  store(key: string, value: string): void;
  authorize(scope: LiveScopeBinding): void;
}

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

/** L5 canonical live extraction key schema version (R1: one scheme). */
export const LIVE_CACHE_SCHEMA_VERSION = "l5-cache/v2";

/** L5 reused-extraction implementation version (R1 A-component). */
export const LIVE_EXTRACTOR_VERSION = "live-reused-extraction/1";

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value instanceof Uint8Array) return `{"$bytes":"${Buffer.from(value).toString("base64url")}"}`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** L5 live scope binding (R1 S-component: tenant + clone, no credentials). */
export interface LiveScopeBinding {
  readonly tenant: string;
  readonly clone: string;
}

/**
 * L5 full reused-extraction identity inputs (R1/R2/M1). The key binds the
 * scope (S), policy (Q), content (B), path (P), language/dialect + grammar
 * (G), configuration (C), dependencies (D) and implementation (A) — every
 * resolution input. An entry is reused only when each component is equal
 * (key match + per-component envelope check in loadCached).
 */
export interface LiveExtractionKeyInput {
  filePath: string;
  root: string;
  language: string;
  dialect: string;
  dialectVersion: string;
  grammarDigest: string;
  grammarAbi: string;
  extractorVersion?: string;
  /** REQUIRED (R1 S): absent scope never hits — callers select no-cache. */
  scope: LiveScopeBinding;
  /**
   * M2: the EXACT analyzed buffer (preferred) or its precomputed sha256.
   * One of the two is required — the live path hashes the pinned buffer it
   * analyzes, never a second read.
   */
  contentBytes?: Uint8Array | null;
  contentSha256?: string | null;
  /** REQUIRED (R1 C): tsconfig-chain manifest digest (tagged absence allowed). */
  configDigest: string;
  /** R1 D: dependency-manifest digest; not-applicable tag when independent. */
  dependencyDigest?: string | null;
  contentPolicyVersion?: string | null;
  privacyBoundary?: string | null;
}

function requireLiveScope(scope: unknown): asserts scope is LiveScopeBinding {
  if (scope === null || typeof scope !== "object") {
    throw new Error("live scope is required for cache reuse (R1): tenant + clone, otherwise explicit no-cache");
  }
  for (const field of ["tenant", "clone"] as const) {
    const value = (scope as Record<string, unknown>)[field];
    if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
      throw new Error(`live scope.${field} must be a non-empty string without NUL`);
    }
  }
}

/** Canonical per-component identity (the envelope `bind` block and key preimage). */
export function liveExtractionBind(input: LiveExtractionKeyInput): Record<string, unknown> {
  requireLiveScope(input.scope);
  if ((input.contentBytes === undefined || input.contentBytes === null)
    && (typeof input.contentSha256 !== "string" || input.contentSha256.length === 0)) {
    throw new Error("live key needs the analyzed bytes or their sha256 (M2: hash exactly the analyzed buffer)");
  }
  if (typeof input.configDigest !== "string" || input.configDigest.length === 0) {
    throw new Error("live key needs a configuration manifest digest (R1 C)");
  }
  for (const field of ["language", "dialect", "dialectVersion", "grammarDigest", "grammarAbi"] as const) {
    if (typeof input[field] !== "string" || (input[field] as string).length === 0) {
      throw new Error(`live key needs a non-empty ${field} (R1 G)`);
    }
  }
  const absKey = resolve(input.filePath);
  const resolvedRoot = resolve(input.root);
  const relativePath = absKey.startsWith(`${resolvedRoot}/`) || absKey === resolvedRoot
    ? absKey.slice(resolvedRoot.length).replace(/^\/+/, "") || "."
    : absKey;
  const contentSha256 = input.contentBytes !== undefined && input.contentBytes !== null
    ? createHash("sha256").update(input.contentBytes).digest("hex")
    : input.contentSha256!;
  return {
    config: { digest: input.configDigest },
    content: { sha256: contentSha256 },
    dependencies: { digest: input.dependencyDigest ?? { $na: true } },
    dialect: input.dialect,
    dialectVersion: input.dialectVersion,
    extractorVersion: input.extractorVersion ?? LIVE_EXTRACTOR_VERSION,
    grammar: { abi: input.grammarAbi, digest: input.grammarDigest },
    kind: "reused-extraction",
    language: input.language,
    path: relativePath,
    policy: {
      contentPolicyVersion: input.contentPolicyVersion ?? { $na: true },
      privacyBoundary: input.privacyBoundary ?? { $na: true },
    },
    schemaVersion: LIVE_CACHE_SCHEMA_VERSION,
    scope: { clone: input.scope.clone, tenant: input.scope.tenant },
    syntaxOptions: { $na: true },
  };
}

/**
 * L5 full-identity live extraction key (R1 B+G+S+C+D+Q+A, R2 resolution row).
 * Binds scope, exact bytes+path, language/dialect, verified grammar digest +
 * ABI, configuration + dependency manifests, policy and extractor version —
 * never size/mtime/topology. A null/empty grammar digest MUST NOT hit:
 * callers treat it as grammar-unavailable before lookup (R5a).
 */
export function liveExtractionKey(input: LiveExtractionKeyInput): string {
  const bind = liveExtractionBind(input);
  const digest = createHash("sha256").update(canonicalStringify(bind), "utf8").digest("hex");
  return `l5-cache/v2/reused-extraction/${digest}`;
}

/** Fail-closed validation for a configured live store port (R4: before work). */
export function assertValidLiveStore(store: unknown, field = "live.cacheStore"): asserts store is InjectedCacheStore {
  if (
    store === null || typeof store !== "object"
    || typeof (store as InjectedCacheStore).load !== "function"
    || typeof (store as InjectedCacheStore).store !== "function"
    || typeof (store as InjectedCacheStore).authorize !== "function"
  ) {
    throw new Error(`${field} is malformed: live caching requires an injected host port with authorize/load/store (explicit no-cache otherwise)`);
  }
}

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

// ---------------------------------------------------------------------------
// source_file relativization helpers (port of upstream 25df580, F-0831-P2d)
//
// Caches are content-addressed (SHA256 of file contents + relative path) so
// the cache *key* is already portable. These helpers make the source_file
// *payload* portable too: absolute paths are relativized to root before write,
// re-anchored after read. Already-relative paths and out-of-root paths are
// passed through unchanged (idempotent). The caller's object is never mutated
// — saveCached works on a deep copy.
// ---------------------------------------------------------------------------

const CACHE_BUCKETS = ["nodes", "edges", "hyperedges"] as const;

/**
 * Return a forward-slash project-relative form of `sourcePath` against
 * `rootResolved`, or null if the path is already relative, out-of-root, or
 * cannot be relativized.
 */
function tryRelativize(sourcePath: string, rootResolved: string): string | null {
  if (!isAbsolute(sourcePath)) return null; // already relative — leave as-is
  const rel = relative(rootResolved, sourcePath);
  // out-of-root: relative starts with ".." — leave absolute
  if (rel === ".." || rel.startsWith(".." + "/") || rel.startsWith(".." + "\\")) return null;
  return rel.replace(/\\/g, "/");
}

/**
 * Mutate `payload` in-place to relativize all `source_file` fields in
 * nodes/edges/hyperedges against `root`.  Already-relative and out-of-root
 * paths are left unchanged.  Mirror of Python `_relativize_source_files_in`.
 */
function relativizeSourceFilesIn(payload: Record<string, unknown>, root: string): void {
  const rootResolved = resolve(root);
  for (const bucket of CACHE_BUCKETS) {
    const items = payload[bucket];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const src = rec["source_file"];
      if (typeof src !== "string" || !src) continue;
      const rel = tryRelativize(src, rootResolved);
      if (rel !== null) rec["source_file"] = rel;
    }
  }
}

/**
 * Mutate `payload` in-place to re-anchor relative `source_file` fields
 * against `root` so callers see absolute-path shaped data (same as a fresh
 * in-process extraction).  Already-absolute paths pass through unchanged.
 * Mirror of Python `_absolutize_source_files_in`.
 */
function absolutizeSourceFilesIn(payload: Record<string, unknown>, root: string): void {
  const rootResolved = resolve(root);
  for (const bucket of CACHE_BUCKETS) {
    const items = payload[bucket];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const src = rec["source_file"];
      if (typeof src !== "string" || !src) continue;
      if (isAbsolute(src)) continue; // legacy absolute — leave as-is
      rec["source_file"] = resolve(rootResolved, src);
    }
  }
}

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
  const injected = options.store ?? null;
  if (injected !== null) {
    assertValidLiveStore(injected);
    // M1: reuse requires the full identity — key AND per-component envelope
    // equality. A missing key or bind is a miss, never a legacy fallback.
    if (typeof options.liveKey !== "string" || options.liveKey.length === 0) return null;
    if (options.liveBind === undefined || options.liveBind === null) return null;
    const expectedBind = canonicalStringify(options.liveBind);
    requireLiveScope(options.liveBind.scope);
    injected.authorize(options.liveBind.scope);
    let raw: string | null;
    try {
      raw = injected.load(options.liveKey);
    } catch {
      return null;
    }
    if (raw === null) return null;
    let envelope: {
      schemaVersion?: unknown; kind?: unknown; bind?: unknown;
      payload?: unknown; payloadDigest?: unknown;
    };
    try {
      envelope = JSON.parse(raw) as {
        schemaVersion?: unknown; kind?: unknown; bind?: unknown;
        payload?: unknown; payloadDigest?: unknown;
      };
    } catch {
      return null;
    }
    try {
      if (envelope === null || typeof envelope !== "object") return null;
      if (envelope.schemaVersion !== LIVE_CACHE_SCHEMA_VERSION) return null;
      if (envelope.kind !== "reused-extraction") return null;
      if (envelope.bind === undefined || canonicalStringify(envelope.bind) !== expectedBind) return null;
      if (typeof envelope.payloadDigest !== "string" || envelope.payload === undefined) return null;
      const recomputed = createHash("sha256").update(JSON.stringify(envelope.payload), "utf8").digest("hex");
      if (recomputed !== envelope.payloadDigest) return null;
      const result = envelope.payload as Record<string, unknown>;
      // Zero-node/error payloads are never served as hits (R5/R7).
      if (typeof result.error === "string" && result.error.length > 0) return null;
      const nodes = (result as { nodes?: unknown }).nodes;
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      // MCP-L3 mandatory freshness gate (M10 l.1399): refusal propagates
      // (never a silent miss). A memory-carrying payload without a
      // high-water proof — or behind it — must not be served as current.
      enforceCachedMemoryFreshness(result, options.memoryHighWaterCursor);
      absolutizeSourceFilesIn(result, root);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PROJECTION_STALE")) throw error;
      return null;
    }
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
    assertValidLiveStore(injected);
    // M1: persist the full-identity envelope (key + per-component bind +
    // payload digest). Without a key or bind the write is skipped: an
    // unbound entry must never become a future hit.
    if (typeof options.liveKey !== "string" || options.liveKey.length === 0) return;
    if (options.liveBind === undefined || options.liveBind === null) return;
    requireLiveScope(options.liveBind.scope);
    injected.authorize(options.liveBind.scope);
    const hasBuckets = CACHE_BUCKETS.some((b) => Array.isArray(result[b]) && (result[b] as unknown[]).length > 0);
    const payload: Record<string, unknown> = hasBuckets
      ? JSON.parse(JSON.stringify(result)) as Record<string, unknown>
      : result;
    // MCP-L3 mandatory freshness gate (M10 l.1399): never cache an
    // unproven or stale projection.
    enforceCachedMemoryFreshness(payload, options.memoryHighWaterCursor);
    if (hasBuckets) relativizeSourceFilesIn(payload, root);
    const envelope = {
      bind: options.liveBind,
      kind: "reused-extraction",
      payload,
      payloadDigest: createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
      schemaVersion: LIVE_CACHE_SCHEMA_VERSION,
    };
    const existing = injected.load(options.liveKey);
    if (existing !== null) {
      let previous: typeof envelope | null = null;
      try { previous = JSON.parse(existing); } catch {}
      if (previous?.schemaVersion === LIVE_CACHE_SCHEMA_VERSION && previous.kind === envelope.kind
        && canonicalStringify(previous.bind) === canonicalStringify(envelope.bind)
        && previous.payloadDigest === createHash("sha256").update(JSON.stringify(previous.payload), "utf8").digest("hex")) {
        if (previous.payloadDigest !== envelope.payloadDigest) throw new Error("derivation-failed: conflicting payloads under one live key");
        return;
      }
    }
    try {
      injected.store(options.liveKey, JSON.stringify(envelope));
    } catch {
      return;
    }
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

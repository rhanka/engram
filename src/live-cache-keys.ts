/**
 * L5 live cache keys and injected-store envelope protocol (plan/09 L5-P2a).
 *
 * Closed-set leaf of the reused extraction: the static value-import closure
 * of `src/extract-core.ts` holds only `node:` builtins (other than
 * `node:module`), `src/node-id.ts`, `src/relation-remap.ts` and this module.
 * `src/cache.ts` re-exports the key names under the same identifiers and
 * reuses the envelope protocol, so every importer keeps its path.
 *
 * This module never touches the filesystem, never registers a process hook
 * and never imports the memory-projection module: a memory-carrying payload
 * is refused here (neither served nor stored) unless the caller supplies an
 * explicit freshness decision, which the root wrappers do through
 * `enforceCachedMemoryFreshness`.
 */
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";

/** L5 canonical live cache key schema version (R1: one scheme). */
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
 * (key match + per-component envelope check in the load path).
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

/**
 * L5 injected host cache port. The host implements bounded, versioned
 * storage outside every observed worktree; engram derives opaque keys only.
 * Synchronous by design: the reused extraction loop stays synchronous on the
 * cache path, matching the legacy loadCached/saveCached contract.
 */
export interface InjectedCacheStore {
  load(key: string): string | null;
  store(key: string, value: string): void;
  authorize(scope: LiveScopeBinding): void;
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

// ---------------------------------------------------------------------------
// source_file relativization helpers (port of upstream 25df580, F-0831-P2d,
// moved verbatim with the envelope protocol).
//
// Caches are content-addressed (SHA256 of file contents + relative path) so
// the cache *key* is already portable. These helpers make the source_file
// *payload* portable too: absolute paths are relativized to root before write,
// re-anchored after read. Already-relative paths and out-of-root paths are
// passed through unchanged (idempotent). The caller's object is never mutated
// — the live save works on a deep copy.
// ---------------------------------------------------------------------------

export const CACHE_BUCKETS = ["nodes", "edges", "hyperedges"] as const;

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
 * paths are left unchanged.
 */
export function relativizeSourceFilesIn(payload: Record<string, unknown>, root: string): void {
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
 */
export function absolutizeSourceFilesIn(payload: Record<string, unknown>, root: string): void {
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

/** Minimal key/bind selection the envelope protocol requires. */
export interface LiveStoreCallOptions {
  liveKey?: string | null;
  liveBind?: Record<string, unknown> | null;
}

/**
 * Closed-core refusal of memory-carrying payloads: without a projection
 * port (which only the root wrappers hold) such a payload is neither served
 * nor stored. The root wrappers pass their freshness gate explicitly, so
 * their fail-closed `PROJECTION_STALE` behavior is unchanged.
 */
function carriesMemoryNodes(payload: Record<string, unknown>): boolean {
  const nodes = (payload as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return false;
  for (const node of nodes) {
    if (!!node && typeof node === "object" && (node as Record<string, unknown>).file_type === "memory") {
      return true;
    }
  }
  return false;
}

/**
 * Load a reused-extraction payload through the injected host store: the
 * single definition of the envelope protocol that `src/cache.ts` reuses.
 * A missing key or bind is a miss, never a legacy fallback. `freshness`, when
 * supplied, decides memory-carrying payloads (the root wrappers pass their
 * projection gate); without it such a payload is refused without importing
 * the projection module.
 */
export function loadFromLiveStore(
  store: InjectedCacheStore,
  filePath: string,
  root: string,
  options: LiveStoreCallOptions,
  freshness?: (payload: Record<string, unknown>) => void,
): Record<string, unknown> | null {
  assertValidLiveStore(store);
  // M1: reuse requires the full identity — key AND per-component envelope
  // equality. A missing key or bind is a miss, never a legacy fallback.
  if (typeof options.liveKey !== "string" || options.liveKey.length === 0) return null;
  if (options.liveBind === undefined || options.liveBind === null) return null;
  const expectedBind = canonicalStringify(options.liveBind);
  requireLiveScope(options.liveBind.scope);
  store.authorize(options.liveBind.scope);
  let raw: string | null;
  try {
    raw = store.load(options.liveKey);
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
    if (freshness !== undefined) {
      freshness(result);
    } else if (carriesMemoryNodes(result)) {
      throw new Error("PROJECTION_STALE: closed extraction core refuses a memory-carrying payload without a projection port; the root wrappers supply the freshness gate");
    }
    absolutizeSourceFilesIn(result, root);
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PROJECTION_STALE")) throw error;
    return null;
  }
}

/**
 * Store a reused-extraction payload through the injected host store: the
 * single definition of the envelope protocol that `src/cache.ts` reuses.
 * Without a key or bind the write is skipped: an unbound entry must never
 * become a future hit. `freshness`, when supplied, gates memory-carrying
 * payloads (the root wrappers pass their projection gate); without it such
 * a payload is refused without importing the projection module. A throwing
 * port disables caching and permits recomputation (R4).
 */
export function saveToLiveStore(
  store: InjectedCacheStore,
  filePath: string,
  result: Record<string, unknown>,
  root: string,
  options: LiveStoreCallOptions,
  freshness?: (payload: Record<string, unknown>) => void,
): void {
  void filePath;
  assertValidLiveStore(store);
  // M1: persist the full-identity envelope (key + per-component bind +
  // payload digest). Without a key or bind the write is skipped: an
  // unbound entry must never become a future hit.
  if (typeof options.liveKey !== "string" || options.liveKey.length === 0) return;
  if (options.liveBind === undefined || options.liveBind === null) return;
  requireLiveScope(options.liveBind.scope);
  store.authorize(options.liveBind.scope);
  // Zero-node/error payloads are never persisted in the live cache (fail-closed).
  if (typeof result.error === "string" && result.error.length > 0) return;
  const nodes = (result as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return;
  const hasBuckets = CACHE_BUCKETS.some((b) => Array.isArray(result[b]) && (result[b] as unknown[]).length > 0);
  const payload: Record<string, unknown> = hasBuckets
    ? JSON.parse(JSON.stringify(result)) as Record<string, unknown>
    : result;
  if (freshness !== undefined) {
    freshness(payload);
  } else if (carriesMemoryNodes(payload)) {
    throw new Error("PROJECTION_STALE: closed extraction core refuses a memory-carrying payload without a projection port; the root wrappers supply the freshness gate");
  }
  if (hasBuckets) relativizeSourceFilesIn(payload, root);
  const envelope = {
    bind: options.liveBind,
    kind: "reused-extraction",
    payload,
    payloadDigest: createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
    schemaVersion: LIVE_CACHE_SCHEMA_VERSION,
  };
  const existing = store.load(options.liveKey);
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
    store.store(options.liveKey, JSON.stringify(envelope));
  } catch {
    return;
  }
}

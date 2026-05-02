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
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { resolveGraphifyPaths } from "./paths.js";

export interface CacheOptions {
  kind?: string;
  namespace?: string;
  profileHash?: string;
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
  let stat;
  try {
    stat = statSync(filePath);
  } catch (error) {
    throw error;
  }
  if (!stat.isFile()) {
    throw new Error(`fileHash requires a file, got: ${filePath}`);
  }
  const raw = readFileSync(filePath);
  const content = extname(filePath).toLowerCase() === ".md" ? bodyContent(raw) : raw;
  const resolved = resolve(filePath);
  const resolvedRoot = resolve(root);
  const h = createHash("sha256");
  h.update(content);
  h.update("\0");
  const relativePath = resolved.startsWith(resolvedRoot + "/") || resolved === resolvedRoot
    ? resolved.slice(resolvedRoot.length).replace(/^\/+/, "") || "."
    : resolved;
  h.update(relativePath);
  return h.digest("hex");
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
  let h: string;
  try {
    h = fileHash(filePath, root);
  } catch {
    return null;
  }
  const entry = join(cacheDir(root, options), `${h}.json`);
  if (existsSync(entry)) {
    try {
      return JSON.parse(readFileSync(entry, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if ((options.kind ?? "ast") === "ast") {
    const legacyEntry = join(legacyCacheDir(root, options), `${h}.json`);
    if (existsSync(legacyEntry)) {
      try {
        return JSON.parse(readFileSync(legacyEntry, "utf-8")) as Record<string, unknown>;
      } catch {
        return null;
      }
    }

    const legacyHashEntry = join(legacyCacheDir(root, options), `${legacyFileHash(filePath)}.json`);
    if (!existsSync(legacyHashEntry)) return null;
    try {
      return JSON.parse(readFileSync(legacyHashEntry, "utf-8")) as Record<string, unknown>;
    } catch {
      return null;
    }
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
  try {
    writeFileSync(tmp, JSON.stringify(result));
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

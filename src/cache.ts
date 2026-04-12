/**
 * Per-file extraction cache - skip unchanged files on re-run.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, renameSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** SHA256 of file contents + resolved path. Prevents cache collisions on identical content. */
export function fileHash(filePath: string): string {
  const content = readFileSync(filePath);
  const resolved = resolve(filePath);
  const h = createHash("sha256");
  h.update(content);
  h.update("\0");
  h.update(resolved);
  return h.digest("hex");
}

/** Returns graphify-out/cache/ path - creates it if needed. */
export function cacheDir(root: string = "."): string {
  const d = join(root, "graphify-out", "cache");
  mkdirSync(d, { recursive: true });
  return d;
}

/**
 * Return cached extraction for this file if hash matches, else null.
 */
export function loadCached(filePath: string, root: string = "."): Record<string, unknown> | null {
  let h: string;
  try {
    h = fileHash(filePath);
  } catch {
    return null;
  }
  const entry = join(cacheDir(root), `${h}.json`);
  if (!existsSync(entry)) return null;
  try {
    return JSON.parse(readFileSync(entry, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Save extraction result for this file. */
export function saveCached(filePath: string, result: Record<string, unknown>, root: string = "."): void {
  const h = fileHash(filePath);
  const entry = join(cacheDir(root), `${h}.json`);
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
export function cachedFiles(root: string = "."): Set<string> {
  const d = cacheDir(root);
  const result = new Set<string>();
  try {
    for (const f of readdirSync(d)) {
      if (f.endsWith(".json")) {
        result.add(f.replace(".json", ""));
      }
    }
  } catch { /* ignore */ }
  return result;
}

/** Delete all graphify-out/cache/*.json files. */
export function clearCache(root: string = "."): void {
  const d = cacheDir(root);
  try {
    for (const f of readdirSync(d)) {
      if (f.endsWith(".json")) {
        unlinkSync(join(d, f));
      }
    }
  } catch { /* ignore */ }
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
): [Array<Record<string, unknown>>, Array<Record<string, unknown>>, Array<Record<string, unknown>>, string[]] {
  const cachedNodes: Array<Record<string, unknown>> = [];
  const cachedEdges: Array<Record<string, unknown>> = [];
  const cachedHyperedges: Array<Record<string, unknown>> = [];
  const uncached: string[] = [];

  for (const fpath of files) {
    const result = loadCached(fpath, root);
    if (result !== null) {
      const r = result as unknown as ExtractionPart;
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
    if (existsSync(p)) {
      saveCached(p, result as unknown as Record<string, unknown>, root);
      saved++;
    }
  }
  return saved;
}

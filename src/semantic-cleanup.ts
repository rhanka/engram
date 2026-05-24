/**
 * Stale-node pruning at the build/finalize step (F-0816-M5).
 *
 * Drop nodes whose `source_file` attribute no longer points at an existing
 * file on disk, and any edges adjacent to those nodes. This is the
 * graph-level pair of the wiki-level stale-node filter shipped in
 * F-0816-P4 (`src/wiki.ts > toWiki`). Where the wiki filter rescues the
 * render path from a drifted analysis JSON, this pre-render cleanup keeps
 * `.graphify/graph.json` itself from carrying dangling references when a
 * source file has been deleted between two builds.
 *
 * Ordering note vs. P4 wiki cleanup: this cleanup runs *before* the wiki
 * render, so when called from the rebuild path the wiki filter becomes a
 * no-op for these cases. When called only from `buildMerge` (without a
 * wiki render in the same call), the wiki filter still does its defensive
 * job downstream. The two layers are deliberately overlapping —
 * defence-in-depth.
 *
 * Upstream reference: safishamsi/graphify commit `b6127aa` introduces a
 * Python module named `semantic_cleanup.py`. Note: the upstream module is
 * actually an agent-JSON sanitiser (rationale-text filtering for skill
 * LLM responses) and does *not* implement file-deletion stale-node
 * pruning. The TS port adopts the *name* + *bilan row 11h* framing
 * ("delete-stale nodes after rebuild") and pairs naturally with P4 —
 * see SPEC_TRACK_F_0816_BILAN.md row 11h.
 */
import { existsSync } from "node:fs";
import { isAbsolute, resolve as pathResolve } from "node:path";
import type Graph from "graphology";

export interface CleanupStaleNodesOptions {
  /** Filesystem root used to resolve relative source_file paths. */
  root: string;
  /**
   * Optional caller-supplied liveness set. When provided, the cleanup uses
   * it as the source of truth and skips fs probing — useful when the
   * caller already has the new detection's code-file list (e.g.
   * `watch.ts > rebuildCode`). Paths in the set are compared after the
   * same normalisation applied to stored `source_file` values.
   */
  aliveSourceFiles?: Set<string>;
}

export interface CleanupStaleNodesResult {
  /** IDs of nodes removed from the graph. */
  droppedNodes: string[];
  /** Number of edges removed because at least one endpoint was dropped. */
  droppedEdges: number;
}

function normaliseStoredSourcePath(value: unknown): string {
  if (typeof value !== "string") return "";
  // Stored values may use Windows backslashes (legacy graph.json on
  // Windows runners). Normalise to forward slashes before any liveness
  // probe so we don't double-bookkeep both forms.
  return value.replace(/\\/g, "/").trim();
}

/**
 * Prune nodes whose `source_file` no longer exists.
 *
 * @returns The list of dropped node IDs and the edge-drop count.
 */
export function cleanupStaleNodes(
  graph: Graph,
  options: CleanupStaleNodesOptions,
): CleanupStaleNodesResult {
  const rootAbs = pathResolve(options.root);
  // Normalise the explicit-alive set the same way as stored source paths
  // so backslash/forward-slash variants don't accidentally diverge.
  const aliveSet = options.aliveSourceFiles
    ? new Set(Array.from(options.aliveSourceFiles, (p) => normaliseStoredSourcePath(p)))
    : undefined;

  // Cache fs.existsSync probes per source_file so a 1000-node graph
  // covering 200 source files doesn't run 1000 stat() calls.
  const liveByPath = new Map<string, boolean>();
  const isAlive = (sourceFile: string): boolean => {
    if (!sourceFile) return true; // untracked entity; never prune
    if (aliveSet) return aliveSet.has(sourceFile);
    const cached = liveByPath.get(sourceFile);
    if (cached !== undefined) return cached;
    const absolute = isAbsolute(sourceFile) ? sourceFile : pathResolve(rootAbs, sourceFile);
    const alive = existsSync(absolute);
    liveByPath.set(sourceFile, alive);
    return alive;
  };

  const toDrop: string[] = [];
  graph.forEachNode((nodeId, attrs) => {
    const stored = normaliseStoredSourcePath(attrs.source_file);
    if (!stored) return; // untracked entity (concept, descriptor-only, etc.)
    // Only prune `code` nodes by file-deletion. Document / paper / image /
    // concept nodes can legitimately reference synthetic or external
    // paths (semantic chunks, draft docs not yet committed, etc.) — the
    // existing graph.json merge contract treats them as user-curated
    // until an explicit `pruneSources` removes them.
    const fileType = typeof attrs.file_type === "string" ? attrs.file_type : "";
    if (fileType !== "" && fileType !== "code") return;
    if (!isAlive(stored)) {
      toDrop.push(nodeId);
    }
  });

  let droppedEdges = 0;
  if (toDrop.length > 0) {
    const dropSet = new Set(toDrop);
    // Count adjacent edges first — graphology drops them transparently
    // when the node is dropped, but the diagnostic surface needs the
    // count for the prune log line.
    const seen = new Set<string>();
    for (const nodeId of toDrop) {
      graph.forEachEdge(nodeId, (edgeKey, _attrs, source, target) => {
        // Don't double-count edges where both endpoints are stale.
        if (seen.has(edgeKey)) return;
        if (dropSet.has(source) || dropSet.has(target)) {
          seen.add(edgeKey);
          droppedEdges++;
        }
      });
    }
    for (const nodeId of toDrop) {
      if (graph.hasNode(nodeId)) {
        graph.dropNode(nodeId);
      }
    }
    console.warn(
      `[graphify] semantic_cleanup: dropped ${toDrop.length} stale node(s) ` +
        `(${droppedEdges} edge(s) removed) — source file(s) no longer present.`,
    );
  }

  return { droppedNodes: toDrop, droppedEdges };
}

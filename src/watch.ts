/**
 * File watcher - monitor a folder and auto-trigger graph rebuild when files change.
 *
 * Uses chokidar instead of Python watchdog.
 * Code-only changes rebuild graph automatically (no LLM needed).
 * Doc/paper/image changes write a flag and notify the user.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve as pathResolve, extname, basename, dirname, join } from "node:path";
import {
  DEFAULT_GRAPHIFY_STATE_DIR,
  LEGACY_GRAPHIFY_STATE_DIR,
  resolveGraphifyPaths,
} from "./paths.js";
import {
  CODE_EXTENSIONS,
  DOC_EXTENSIONS,
  PAPER_EXTENSIONS,
  IMAGE_EXTENSIONS,
  detect,
  saveManifest,
} from "./detect.js";
import { inspectInputScope } from "./input-scope.js";
import { markLifecycleAnalyzed, markLifecycleStale, readLifecycleMetadata } from "./lifecycle.js";
import { safeGitRevParse } from "./git.js";
import {
  makeDetectionPortable,
  makeExtractionPortable,
  makeGraphPortable,
  projectRootLabel,
  toProjectRelativePath,
} from "./portable-artifacts.js";
import { loadGraphFromData } from "./graph.js";
import { persistCommunityLabels, resolveCommunityLabels } from "./community-labels.js";
import type { GraphifyInputScopeMode, InputScopeSource } from "./types.js";

const WATCHED_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  ...DOC_EXTENSIONS,
  ...PAPER_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
]);

function mergeHyperedges(
  existing: Array<Record<string, unknown>> = [],
  incoming: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const merged: Array<Record<string, unknown>> = [];
  for (const hyperedge of [...existing, ...incoming]) {
    const id = String(hyperedge.id ?? "");
    const key = id || JSON.stringify(hyperedge);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hyperedge);
  }
  return merged;
}

function builtFromCommit(root: string, graphPath: string): string | null {
  if (!existsSync(graphPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      graph?: { built_from_commit?: unknown };
    };
    const built = raw.graph?.built_from_commit;
    return typeof built === "string" && built.trim().length > 0 ? built : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rebuild pipeline (code-only, no LLM)
// ---------------------------------------------------------------------------

// topology signature now lives in src/export.ts so watch + toJson agree on
// the exact same string. Imported lazily inside rebuildCode().

export async function rebuildCode(
  watchPath: string,
  followSymlinks: boolean = false,
  options: {
    clearStale?: boolean;
    force?: boolean;
    scope?: GraphifyInputScopeMode;
    scopeSource?: InputScopeSource;
    /**
     * Skip Louvain clustering and report regeneration. graph.json is still
     * written with the merged AST extraction but without community labels.
     * Mirrors upstream Python Graphify v0.7.18 `--no-cluster` (PR #824).
     */
    noCluster?: boolean;
  } = {},
): Promise<boolean> {
  try {
    const paths = resolveGraphifyPaths({ root: watchPath });
    const outDir = paths.stateDir;
    mkdirSync(outDir, { recursive: true });
    // Dynamic imports - these modules are in the same package
    const { extractWithDiagnostics } = await import("./extract.js");
    const { buildFromJson } = await import("./build.js");
    const { cluster, scoreAll } = await import("./cluster.js");
    const { godNodes, surprisingConnections, suggestQuestions } = await import("./analyze.js");
    const { generate } = await import("./report.js");
    const { toJson, computeTopologySignature } = await import("./export.js");

    const root = pathResolve(watchPath);
    const scopeInventory = inspectInputScope(root, {
      mode: options.scope ?? "auto",
      source: options.scopeSource ?? (options.scope ? "cli" : "default-auto"),
    });
    const rawDetection = detect(root, {
      followSymlinks,
      candidateFiles: scopeInventory.candidateFiles,
      candidateRoot: scopeInventory.scope.git_root ?? root,
      scope: scopeInventory.scope,
    });
    const portableDetection = makeDetectionPortable(rawDetection, root);
    writeFileSync(paths.scratch.detect, JSON.stringify(portableDetection, null, 2), "utf-8");
    if (portableDetection.scope) {
      writeFileSync(paths.scope, JSON.stringify(portableDetection.scope, null, 2), "utf-8");
    }
    saveManifest(rawDetection.files, paths.manifest);

    let codeFiles = (rawDetection.files.code ?? []).filter(
      (f: string) =>
        !f.includes(DEFAULT_GRAPHIFY_STATE_DIR) &&
        !f.includes(LEGACY_GRAPHIFY_STATE_DIR) &&
        !f.includes("__pycache__") &&
        !f.includes("node_modules"),
    );

    if (codeFiles.length === 0) {
      console.log("[graphify watch] No code files found - nothing to rebuild.");
      return false;
    }

    const { extraction: result, diagnostics } = await extractWithDiagnostics(codeFiles);
    if (diagnostics.length > 0) {
      console.log(
        `[graphify watch] AST extraction failed for ${diagnostics.length} file(s): ` +
        `${diagnostics.slice(0, 3).map((d) => `${d.filePath}: ${d.error}`).join(" | ")}`,
      );
    }
    if (result.nodes.length === 0) {
      console.log("[graphify watch] Rebuild failed: AST extraction produced no graph nodes.");
      return false;
    }

    const relativeResult = makeExtractionPortable(result, root);
    const relativeCodeFiles = codeFiles.map((file) => toProjectRelativePath(root, file));

    const detection = {
      ...portableDetection,
      files: {
        ...portableDetection.files,
        code: relativeCodeFiles,
      },
      total_files: Object.values(portableDetection.files).reduce((sum, files) => sum + files.length, 0),
    };

    const G = buildFromJson(relativeResult);
    if (existsSync(paths.graph)) {
      try {
        const existing = makeGraphPortable(
          loadGraphFromData(JSON.parse(readFileSync(paths.graph, "utf-8")) as Record<string, unknown>),
          root,
        );
        const newAstIds = new Set(G.nodes());
        existing.forEachNode((nodeId, attrs) => {
          if (newAstIds.has(nodeId)) return;
          G.mergeNode(nodeId, attrs);
        });
        existing.forEachEdge((_edge, attrs, source, target) => {
          if (!G.hasNode(source) || !G.hasNode(target)) return;
          try {
            G.mergeEdge(source, target, attrs);
          } catch {
            /* ignore duplicate merge failures */
          }
        });
        const mergedHyperedges = mergeHyperedges(
          (existing.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
          (G.getAttribute("hyperedges") as Array<Record<string, unknown>> | undefined) ?? [],
        );
        if (mergedHyperedges.length > 0) {
          G.setAttribute("hyperedges", mergedHyperedges);
        }
      } catch {
        /* ignore unreadable prior graph snapshots */
      }
    }
    // Topology short-circuit (upstream PR #824): if the new merged AST graph
    // has the exact same nodes + edges + relations as the previously
    // committed graph.json, reuse the existing community assignment instead
    // of re-running Louvain. This keeps community IDs deterministic across
    // no-op rebuilds and avoids unnecessary churn in graph.json diffs.
    let communities: Map<number, string[]> | undefined;
    if (!options.noCluster && existsSync(paths.graph)) {
      try {
        const existingData = JSON.parse(readFileSync(paths.graph, "utf-8")) as {
          topology_signature?: string;
          nodes?: Array<{ id?: string; community?: number | null }>;
        };
        const previousSig = typeof existingData.topology_signature === "string"
          ? existingData.topology_signature
          : null;
        const currentSig = computeTopologySignature(G);
        if (previousSig && previousSig === currentSig) {
          // The merged AST graph matches the prior topology exactly. Pull
          // community ids straight from the persisted graph.json: mergeNode
          // will not overwrite a node already present in G, so the in-memory
          // graphology instance still lacks community attrs at this point.
          const reused: Map<number, string[]> = new Map();
          for (const node of existingData.nodes ?? []) {
            const cid = typeof node.community === "number" && Number.isFinite(node.community)
              ? node.community
              : null;
            if (cid === null || !node.id || !G.hasNode(node.id)) continue;
            const list = reused.get(cid) ?? [];
            list.push(node.id);
            reused.set(cid, list);
            // Stamp the attribute on G so downstream consumers (toJson,
            // resolveCommunityLabels) see the reused community id.
            G.setNodeAttribute(node.id, "community", cid);
          }
          if (reused.size > 0) {
            communities = reused;
            console.log(
              `[graphify watch] Topology unchanged - reusing ${reused.size} existing community assignment(s).`,
            );
          }
        }
      } catch {
        /* ignore unreadable prior graph, fall through to full clustering */
      }
    }
    if (options.noCluster) {
      communities = new Map();
      console.log("[graphify watch] --no-cluster: skipping Louvain clustering.");
    }
    if (!communities) {
      communities = cluster(G);
    }
    const cohesion = options.noCluster ? new Map<number, number>() : scoreAll(G, communities);
    const gods = options.noCluster ? [] : godNodes(G);
    const surprises = options.noCluster ? [] : surprisingConnections(G, communities);
    const labels = options.noCluster
      ? new Map<number, string>()
      : resolveCommunityLabels(communities, {
        labelsPath: paths.scratch.labels,
        graph: G,
      });
    const questions = options.noCluster ? [] : suggestQuestions(G, communities, labels);

    const report = generate(
      G,
      communities,
      cohesion,
      labels,
      gods,
      surprises,
      detection,
      { input: 0, output: 0 },
      projectRootLabel(root),
      {
        suggestedQuestions: questions,
        freshness: { builtFromCommit: safeGitRevParse(root, ["HEAD"]) },
      },
    );
    const jsonWritten = toJson(G, communities, paths.graph, {
      communityLabels: labels,
      force: options.force,
    });
    if (!jsonWritten) {
      return false;
    }
    persistCommunityLabels(labels, paths.scratch.labels);
    writeFileSync(paths.report, report, "utf-8");

    if (options.clearStale !== false) {
      // Clear stale needs_update flag if present
      const flagPath = paths.needsUpdate;
      if (existsSync(flagPath)) {
        unlinkSync(flagPath);
      }
      markLifecycleAnalyzed(watchPath);
    }

    console.log(
      `[graphify watch] Rebuilt: ${G.order} nodes, ${G.size} edges, ${communities.size} communities`,
    );
    console.log(
      `[graphify watch] graph.json and GRAPH_REPORT.md updated in ${outDir}`,
    );
    return true;
  } catch (err) {
    console.log(
      `[graphify watch] Rebuild failed: ${err instanceof Error ? err.message : err}`,
    );
    return false;
  }
}

export interface CheckUpdateResult {
  current: boolean;
  reasons: string[];
  recommendedCommand: string;
}

export function checkUpdate(root: string): CheckUpdateResult {
  const paths = resolveGraphifyPaths({ root });
  const metadata = readLifecycleMetadata(root);
  const reasons: string[] = [];

  if (existsSync(paths.needsUpdate)) {
    reasons.push(".graphify/needs_update exists");
  }
  if (metadata?.branch.stale) {
    const reason = metadata.branch.staleReason?.trim();
    reasons.push(reason ? `branch metadata is stale: ${reason}` : "branch metadata is stale");
  }
  const currentHead = safeGitRevParse(root, ["HEAD"]);
  const graphHead = builtFromCommit(root, paths.graph);
  if (currentHead && graphHead && currentHead !== graphHead) {
    reasons.push(`graph.json built from ${graphHead.slice(0, 7)} but HEAD is ${currentHead.slice(0, 7)}`);
  }

  return {
    current: reasons.length === 0,
    reasons,
    recommendedCommand: "Run the graphify skill with --update to refresh semantic data.",
  };
}

// ---------------------------------------------------------------------------
// Notification fallback (non-code changes)
// ---------------------------------------------------------------------------

function notifyOnly(watchPath: string): void {
  const paths = resolveGraphifyPaths({ root: watchPath });
  const outDir = paths.stateDir;
  mkdirSync(outDir, { recursive: true });
  const flagPath = paths.needsUpdate;
  writeFileSync(flagPath, "1", "utf-8");
  markLifecycleStale(watchPath, "watch-non-code-change");
  console.log(`\n[graphify watch] New or changed files detected in ${watchPath}`);
  console.log(
    "[graphify watch] Non-code files changed - semantic re-extraction requires LLM.",
  );
  console.log(
    "[graphify watch] Run the graphify skill with `--update` to refresh semantic data (for Codex: `$graphify . --update`).",
  );
  console.log(`[graphify watch] Flag written to ${flagPath}`);
}

function hasNonCode(changedPaths: string[]): boolean {
  return changedPaths.some((p) => !CODE_EXTENSIONS.has(extname(p).toLowerCase()));
}

// ---------------------------------------------------------------------------
// Main watcher
// ---------------------------------------------------------------------------

function rebuildLockPath(watchPath: string): string {
  return join(resolveGraphifyPaths({ root: pathResolve(watchPath) }).stateDir, ".rebuild.lock");
}

/**
 * Acquire the watch rebuild lock by writing a single PID line. Returns true
 * when the caller holds the lock, false when another rebuild is already in
 * flight. The lock file is intentionally short (one line, current PID + LF)
 * so downstream tooling can `kill -0` the recorded PID for liveness checks.
 *
 * Ported from upstream Python Graphify v0.7.18/0.7.19 watch fix (#858 / PR
 * #859): rewrite a single PID line on acquire and unlink on release so a
 * stale lock from a crashed run does not deadlock subsequent rebuilds.
 */
export function acquireRebuildLock(watchPath: string): boolean {
  const lockPath = rebuildLockPath(watchPath);
  mkdirSync(dirname(lockPath), { recursive: true });
  if (existsSync(lockPath)) {
    const recorded = readFileSync(lockPath, "utf-8").trim().split(/\s+/)[0];
    const pid = recorded ? Number.parseInt(recorded, 10) : NaN;
    if (Number.isFinite(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        // Stale lock - the PID is no longer alive, fall through to overwrite.
      }
    }
  }
  writeFileSync(lockPath, `${process.pid}\n`, "utf-8");
  return true;
}

export function releaseRebuildLock(watchPath: string): void {
  const lockPath = rebuildLockPath(watchPath);
  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Best effort: a concurrent watcher may have already released it.
    }
  }
}

export async function watch(
  watchPath: string,
  debounce: number = 3.0,
  options: {
    scope?: GraphifyInputScopeMode;
    scopeSource?: InputScopeSource;
  } = {},
): Promise<void> {
  let chokidar: typeof import("chokidar");
  try {
    chokidar = await import("chokidar");
  } catch {
    throw new Error("chokidar not installed. Run: npm install chokidar");
  }

  const resolvedPath = pathResolve(watchPath);
  let lastTrigger = 0;
  let pending = false;
  let rebuilding = false;
  const changed = new Set<string>();

  const watcher = chokidar.watch(resolvedPath, {
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    ignored: [
      /node_modules/,
      /\.git/,
      /\.graphify/,
      /graphify-out/,
    ],
  });

  watcher.on("all", (_event: string, filePath: string) => {
    const ext = extname(filePath).toLowerCase();
    if (!WATCHED_EXTENSIONS.has(ext)) return;

    // Skip hidden directories
    const parts = filePath.split("/");
    if (parts.some((part) => part.startsWith(".") && part !== ".")) return;

    lastTrigger = Date.now();
    pending = true;
    changed.add(filePath);
  });

  console.log(
    `[graphify watch] Watching ${resolvedPath} - press Ctrl+C to stop`,
  );
  console.log(
    "[graphify watch] Code changes rebuild graph automatically. Doc/image changes require a graphify skill `--update` run.",
  );
  console.log(`[graphify watch] Debounce: ${debounce}s`);

  const debounceMs = debounce * 1000;

  const poll = setInterval(async () => {
    if (!pending) return;
    if (Date.now() - lastTrigger < debounceMs) return;
    if (rebuilding) return; // already running; wait for the next tick

    if (!acquireRebuildLock(watchPath)) {
      // Another graphify watch process holds the lock; check again next tick.
      return;
    }

    pending = false;
    rebuilding = true;
    const batch = [...changed];
    changed.clear();
    try {
      console.log(`\n[graphify watch] ${batch.length} file(s) changed`);
      if (hasNonCode(batch)) {
        notifyOnly(watchPath);
      } else {
        await rebuildCode(watchPath, false, options);
      }
    } finally {
      rebuilding = false;
      releaseRebuildLock(watchPath);
    }
  }, 500);

  // Graceful shutdown
  const cleanup = () => {
    console.log("\n[graphify watch] Stopped.");
    clearInterval(poll);
    watcher.close();
    releaseRebuildLock(watchPath);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isDirectExecution = typeof process !== "undefined" &&
  typeof process.argv[1] === "string" &&
  /^watch\.(?:js|mjs|cjs|ts)$/.test(basename(process.argv[1]));

if (isDirectExecution) {
  const watchPath = process.argv[2] ?? ".";
  const debounce = process.argv[3] ? parseFloat(process.argv[3]) : 3.0;
  watch(watchPath, debounce).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

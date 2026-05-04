/**
 * File watcher - monitor a folder and auto-trigger graph rebuild when files change.
 *
 * Uses chokidar instead of Python watchdog.
 * Code-only changes rebuild graph automatically (no LLM needed).
 * Doc/paper/image changes write a flag and notify the user.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve as pathResolve, extname, basename } from "node:path";
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
import {
  makeDetectionPortable,
  makeExtractionPortable,
  makeGraphPortable,
  projectRootLabel,
  toProjectRelativePath,
} from "./portable-artifacts.js";
import { loadGraphFromData } from "./graph.js";
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

// ---------------------------------------------------------------------------
// Rebuild pipeline (code-only, no LLM)
// ---------------------------------------------------------------------------

export async function rebuildCode(
  watchPath: string,
  followSymlinks: boolean = false,
  options: {
    clearStale?: boolean;
    force?: boolean;
    scope?: GraphifyInputScopeMode;
    scopeSource?: InputScopeSource;
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
    const { toJson } = await import("./export.js");

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
    const communities = cluster(G);
    const cohesion = scoreAll(G, communities);
    const gods = godNodes(G);
    const surprises = surprisingConnections(G, communities);
    const labels = new Map<number, string>();
    for (const cid of communities.keys()) {
      labels.set(cid, `Community ${cid}`);
    }
    const questions = suggestQuestions(G, communities, labels);

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
      questions,
    );
    const jsonWritten = toJson(G, communities, paths.graph, {
      communityLabels: labels,
      force: options.force,
    });
    if (!jsonWritten) {
      return false;
    }
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
    if (pending && Date.now() - lastTrigger >= debounceMs) {
      pending = false;
      const batch = [...changed];
      changed.clear();
      console.log(`\n[graphify watch] ${batch.length} file(s) changed`);
      if (hasNonCode(batch)) {
        notifyOnly(watchPath);
      } else {
        await rebuildCode(watchPath, false, options);
      }
    }
  }, 500);

  // Graceful shutdown
  const cleanup = () => {
    console.log("\n[graphify watch] Stopped.");
    clearInterval(poll);
    watcher.close();
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

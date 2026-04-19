/**
 * File watcher - monitor a folder and auto-trigger graph rebuild when files change.
 *
 * Uses chokidar instead of Python watchdog.
 * Code-only changes rebuild graph automatically (no LLM needed).
 * Doc/paper/image changes write a flag and notify the user.
 */
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
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
} from "./detect.js";
import { markLifecycleAnalyzed, markLifecycleStale } from "./lifecycle.js";

const WATCHED_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  ...DOC_EXTENSIONS,
  ...PAPER_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
]);

// ---------------------------------------------------------------------------
// Rebuild pipeline (code-only, no LLM)
// ---------------------------------------------------------------------------

export async function rebuildCode(
  watchPath: string,
  followSymlinks: boolean = false,
  options: { clearStale?: boolean } = {},
): Promise<boolean> {
  try {
    const paths = resolveGraphifyPaths({ root: watchPath });
    // Dynamic imports - these modules are in the same package
    const { collectFiles, extractWithDiagnostics } = await import("./extract.js");
    const { buildFromJson } = await import("./build.js");
    const { cluster, scoreAll } = await import("./cluster.js");
    const { godNodes, surprisingConnections, suggestQuestions } = await import("./analyze.js");
    const { generate } = await import("./report.js");
    const { toJson } = await import("./export.js");

    let codeFiles = await collectFiles(watchPath, { followSymlinks });
    codeFiles = codeFiles.filter(
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

    const detection = {
      files: {
        code: codeFiles,
        document: [] as string[],
        paper: [] as string[],
        image: [] as string[],
      },
      total_files: codeFiles.length,
      total_words: 0,
      needs_graph: true,
      warning: null,
      skipped_sensitive: [] as string[],
      graphifyignore_patterns: 0,
    };

    const G = buildFromJson(result);
    const communities = cluster(G);
    const cohesion = scoreAll(G, communities);
    const gods = godNodes(G);
    const surprises = surprisingConnections(G, communities);
    const labels = new Map<number, string>();
    for (const cid of communities.keys()) {
      labels.set(cid, `Community ${cid}`);
    }
    const questions = suggestQuestions(G, communities, labels);

    const outDir = paths.stateDir;
    mkdirSync(outDir, { recursive: true });

    const report = generate(
      G,
      communities,
      cohesion,
      labels,
      gods,
      surprises,
      detection,
      { input: 0, output: 0 },
      watchPath,
      questions,
    );
    writeFileSync(paths.report, report, "utf-8");
    toJson(G, communities, paths.graph, { communityLabels: labels });

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
        await rebuildCode(watchPath);
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

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
import { assertGraphJsonFileSize } from "./graph-size-guard.js";
import { persistCommunityLabels, resolveCommunityLabels } from "./community-labels.js";
import {
  cleanDescriptionInstructionDir,
  countUnansweredDescriptionBatches,
  countUndescribedInGraph,
  DESCRIPTION_INSTRUCTIONS_DIR,
} from "./node-descriptions.js";
import {
  cleanLabelInstructionDir,
  hasUnansweredLabelInstructions,
  LABEL_INSTRUCTIONS_DIR,
} from "./community-labeling.js";
import type { Extraction, GraphifyInputScopeMode, InputScopeSource } from "./types.js";

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
    assertGraphJsonFileSize(graphPath, "read");
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
    /**
     * WP11: generate node descriptions (entity + code) before graph.json is
     * written. ON by default; CLI `--no-description` sets this false. Degrades
     * gracefully to a no-op when no LLM backend is configured.
     */
    describe?: boolean;
    descriptionBackend?: string;
    descriptionModel?: string;
    descriptionMaxNodes?: number;
    /**
     * WP-reliability: only (re)describe nodes whose `description` attr is empty.
     * Powers `graphify update --fill-missing` — an idempotent gap-fill that does
     * not re-spend tokens on already-described nodes.
     */
    descriptionOnlyMissing?: boolean;
    /**
     * Explicit execution mode for descriptions: "assistant" (default when no
     * key) or "direct" (requires API key). When omitted, auto-selected.
     */
    descriptionMode?: "assistant" | "direct";
    /**
     * WP12: generate salient community labels (LLM) by DEFAULT after Louvain
     * clustering, replacing generic "Community N" names. ON by default; CLI
     * `--no-label` sets this false. `--no-cluster` implies no labels (there are
     * no communities). Degrades gracefully (keeps generic names + a stderr note)
     * when no LLM backend is configured.
     */
    label?: boolean;
    labelBackend?: string;
    labelModel?: string;
    /**
     * Explicit execution mode for community labels: "assistant" (default when no
     * key) or "direct" (requires API key). When omitted, auto-selected.
     */
    labelMode?: "assistant" | "direct";
    /**
     * Phase 4: ONLY the fast git-hook rebuild (`hook-rebuild`) sets this true.
     * It runs LLM-free (`describe: false`, `label: false`) to keep commits
     * snappy, then drops a `.graphify_describe_pending` marker so the next
     * describe-producing `graphify update` (default-on) fills the gap and
     * `check-update` nudges the user. An explicit user `update --no-description`
     * / `--no-label` must NOT leave this stale marker, so the marker is written
     * only when THIS flag is set — never merely because `describe === false`.
     */
    markDescribePending?: boolean;
    /**
     * Per-node citation cap injected into the description prompt. Forwarded to
     * `generateNodeDescriptions`. Resolved from corpus type by the CLI when a
     * `--citation-cap` flag is absent; undefined here → the node-descriptions
     * resolved default (10).
     */
    citationCap?: number | "all";
    /**
     * Inline Level-1 citations kept per node in graph.json (the K-bounded set).
     * Forwarded to `persistGraphWithCitations`. Resolved from corpus type by the
     * CLI when a `--citations-top-k` flag is absent; undefined → the citations
     * module default (8).
     */
    citationsTopK?: number;
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
    const { persistGraphWithCitations, computeTopologySignature } = await import("./export.js");

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
    saveManifest(rawDetection.files, paths.manifest, { root });

    let codeFiles = (rawDetection.files.code ?? []).filter(
      (f: string) =>
        !f.includes(DEFAULT_GRAPHIFY_STATE_DIR) &&
        !f.includes(LEGACY_GRAPHIFY_STATE_DIR) &&
        !f.includes("__pycache__") &&
        !f.includes("node_modules"),
    );

    let result: Extraction;
    if (codeFiles.length === 0) {
      console.log("[graphify watch] No code files found - writing empty graph index.");
      result = {
        nodes: [],
        edges: [],
        hyperedges: [],
        input_tokens: 0,
        output_tokens: 0,
      };
    } else {
      const extracted = await extractWithDiagnostics(codeFiles);
      result = extracted.extraction;
      if (extracted.diagnostics.length > 0) {
        console.log(
          `[graphify watch] AST extraction failed for ${extracted.diagnostics.length} file(s): ` +
          `${extracted.diagnostics.slice(0, 3).map((d) => `${d.filePath}: ${d.error}`).join(" | ")}`,
        );
      }
      if (result.nodes.length === 0) {
        console.log("[graphify watch] Rebuild failed: AST extraction produced no graph nodes.");
        return false;
      }
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
        assertGraphJsonFileSize(paths.graph, "read");
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

    // F-0816-M5: stale-node prune after the existing-graph merge step.
    // When a code file has been deleted since the last build, its nodes
    // survived the mergeNode-from-existing loop above because they did
    // not appear in the new AST extraction. Drop them now — paired with
    // the wiki-level stale-node filter from F-0816-P4 (defence-in-depth).
    // Use the relative-code-files list as the explicit alive set so we
    // don't run an `existsSync` probe per node.
    const { cleanupStaleNodes } = await import("./semantic-cleanup.js");
    cleanupStaleNodes(G, {
      root,
      aliveSourceFiles: new Set(relativeCodeFiles),
    });
    // Topology short-circuit (upstream PR #824): if the new merged AST graph
    // has the exact same nodes + edges + relations as the previously
    // committed graph.json, reuse the existing community assignment instead
    // of re-running Louvain. This keeps community IDs deterministic across
    // no-op rebuilds and avoids unnecessary churn in graph.json diffs.
    let communities: Map<number, string[]> | undefined;
    if (!options.noCluster && existsSync(paths.graph)) {
      try {
        assertGraphJsonFileSize(paths.graph, "read");
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

    // WP12: salient community labels on by DEFAULT. Run BEFORE the report so
    // GRAPH_REPORT.md and graph.json both carry the salient names. Skipped when
    // clustering is off (no communities) or `label === false` (--no-label).
    // Degrades to generic "Community N" + a stderr note when no LLM backend.
    if (!options.noCluster && options.label !== false && communities.size > 0) {
      const { applySalientCommunityLabels } = await import("./community-labeling.js");
      const { source } = await applySalientCommunityLabels(G, communities, labels, {
        provider: options.labelBackend ?? null,
        ...(options.labelModel ? { model: options.labelModel } : {}),
        ...(options.labelMode ? { mode: options.labelMode } : {}),
        gods,
        instructionDir: join(paths.stateDir, "label-instructions"),
      });
      if (source === "llm") {
        // Persist so subsequent cluster-only / update / hook runs reuse the
        // salient names instead of regenerating them.
        persistCommunityLabels(labels, paths.scratch.labels);
      }
    }

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
    // Upstream 6939494 (#834): snapshot before overwrite when graph cost
    // LLM tokens or has been human-curated.
    const { backupIfProtected } = await import("./export.js");
    backupIfProtected(paths.stateDir);

    // WP11: stamp node descriptions onto G before the JSON write so each
    // `description` is persisted to graph.json. Skips gracefully (no throw)
    // when no LLM backend is configured.
    let descriptionsComplete = false;
    if (options.describe !== false) {
      const { generateNodeDescriptions } = await import("./node-descriptions.js");
      const result = await generateNodeDescriptions(G, {
        ...(options.descriptionBackend ? { provider: options.descriptionBackend } : {}),
        ...(options.descriptionModel ? { model: options.descriptionModel } : {}),
        ...(options.descriptionMaxNodes !== undefined ? { maxNodes: options.descriptionMaxNodes } : {}),
        ...(options.descriptionOnlyMissing ? { onlyMissing: true } : {}),
        ...(options.descriptionMode ? { mode: options.descriptionMode } : {}),
        ...(options.citationCap !== undefined ? { citationCap: options.citationCap } : {}),
        instructionDir: join(paths.stateDir, "description-instructions"),
      });
      // "Complete" = every describable node now has a description. When a backend
      // is missing this stays false, so the pending marker is kept for a later
      // `update --fill-missing` once a key is configured.
      descriptionsComplete = result.coverage.described >= result.coverage.describable;
    }

    const jsonWritten = persistGraphWithCitations(G, communities, paths.graph, {
      communityLabels: labels,
      force: options.force,
      ...(options.citationsTopK !== undefined ? { citations: { topK: options.citationsTopK } } : {}),
    });
    if (!jsonWritten) {
      return false;
    }
    persistCommunityLabels(labels, paths.scratch.labels);
    writeFileSync(paths.report, report, "utf-8");

    // Phase 4: describe-pending marker.
    //
    // Two independent signals can create the pending marker:
    //
    //   A) Fast git-hook rebuild: ran LLM-free (`describe: false`, `label: false`).
    //      ONLY that path passes `markDescribePending: true` — we drop a marker
    //      so `check-update` nudges the user. An explicit `update --no-description`
    //      must NOT set this marker (0.12.0 fix — keeps "opted out" distinct from
    //      "instructions emitted but not answered").
    //
    //   B) Assistant mode: `update` ran describe/label in assistant mode (no API
    //      key) and emitted instruction files that have NOT yet been answered.
    //      This is NEW (C1 fix) — we detect un-answered instruction files directly
    //      and write the pending marker with an actionable message, independent of
    //      `markDescribePending`. Clears when a subsequent run ingests the answers.
    //
    // Instruction-file lifecycle (C1 stale-orphan fix): when this run completed
    // all descriptions, purge every batch-*.md/json and communities.md/json from
    // the instruction dirs so a leftover orphan from a prior run cannot produce a
    // permanent false-pending signal on the NEXT check-update. The ingest paths
    // in node-descriptions.ts / community-labeling.ts already delete consumed
    // files; this is the safety net for the direct-mode completing path.
    //
    // A run that completes descriptions (all describable nodes described) clears
    // any pre-existing marker regardless of which path created it.
    {
      const descInstructionDir = join(paths.stateDir, DESCRIPTION_INSTRUCTIONS_DIR);
      const labelInstructionDir = join(paths.stateDir, LABEL_INSTRUCTIONS_DIR);

      if (descriptionsComplete) {
        // Completing run: purge any stale orphan instruction files so subsequent
        // countUnansweredDescriptionBatches / hasUnansweredLabelInstructions calls
        // return 0/false even if a prior run left leftover .md files.
        cleanDescriptionInstructionDir(descInstructionDir);
        cleanLabelInstructionDir(labelInstructionDir);
      }

      const unansweredBatches = options.describe !== false
        ? countUnansweredDescriptionBatches(descInstructionDir)
        : 0;
      const unansweredLabels = options.label !== false && !options.noCluster
        ? hasUnansweredLabelInstructions(labelInstructionDir)
        : false;
      const hasUnansweredAssistantWork = unansweredBatches > 0 || unansweredLabels;

      if (descriptionsComplete && !hasUnansweredAssistantWork) {
        // Descriptions are complete and no pending assistant instructions remain.
        if (existsSync(paths.describePending)) unlinkSync(paths.describePending);
      } else if (hasUnansweredAssistantWork) {
        // C1: assistant emitted instruction files but they have not been answered yet.
        const parts: string[] = [];
        if (unansweredBatches > 0) parts.push(`${unansweredBatches} description batch(es)`);
        if (unansweredLabels) parts.push("community label instructions");
        const pendingMsg = parts.join(" + ");
        writeFileSync(
          paths.describePending,
          `assistant-mode: ${pendingMsg} awaiting answers.\n`,
          "utf-8",
        );
        console.log(
          `[graphify watch] ${pendingMsg} awaiting assistant answers — ` +
            `fill the batch-*.json / communities.json files in .graphify/ and re-run \`graphify update\`.`,
        );
      } else if (options.markDescribePending === true) {
        // A) Fast git-hook rebuild: no descriptions/labels were run.
        writeFileSync(
          paths.describePending,
          "Graph rebuilt by the fast git hook without descriptions/labels. " +
            "Run `graphify update --fill-missing` to fill them.\n",
          "utf-8",
        );
      }
    }

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
  const describePending = existsSync(paths.describePending);
  if (describePending) {
    reasons.push(
      "graph was rebuilt by the fast git hook without descriptions/labels (.graphify_describe_pending)",
    );
  }

  // C1: independently detect unanswered assistant-mode instruction files.
  // This catches the case where `update` ran in assistant mode (no API key),
  // emitted instruction files, but the host assistant has not yet filled them.
  // We read the marker file content to distinguish "git-hook (no instructions
  // emitted)" from "assistant work pending"; then also probe the dirs directly
  // so we catch stale markers and fresh instruction files that pre-date a
  // marker flush.
  //
  // Stale-orphan guard (C1 false-pending fix): an orphan .md without a .json
  // that was left by a prior run must NOT trigger pending when the graph is
  // already fully described. We reconcile by reading graph.json: if it has zero
  // undescribed describable nodes the instruction files are stale and we ignore
  // them. This handles the case where a completing direct-mode run did not clean
  // up (e.g. pre-fix binary) or where files arrive via external tooling.
  const descInstructionDir = join(paths.stateDir, DESCRIPTION_INSTRUCTIONS_DIR);
  const labelInstructionDir = join(paths.stateDir, LABEL_INSTRUCTIONS_DIR);
  const unansweredBatches = countUnansweredDescriptionBatches(descInstructionDir);
  const unansweredLabels = hasUnansweredLabelInstructions(labelInstructionDir);
  if (!describePending && (unansweredBatches > 0 || unansweredLabels)) {
    // Before reporting pending, check whether the graph itself still has
    // undescribed describable nodes. Returns -1 when graph.json is missing or
    // unreadable (treat as "unknown" — do NOT suppress pending in that case).
    // Only suppress when we can positively confirm zero undescribed nodes (=0).
    const undescribedCount = countUndescribedInGraph(paths.graph);
    if (undescribedCount !== 0) {
      // undescribedCount > 0: genuine pending (real undescribed nodes exist).
      // undescribedCount < 0 (−1): graph.json absent/unreadable — state unknown,
      //   keep the pending signal rather than silently hiding it.
      const parts: string[] = [];
      if (unansweredBatches > 0) parts.push(`${unansweredBatches} description batch(es)`);
      if (unansweredLabels) parts.push("community label instructions");
      reasons.push(
        `assistant-mode work pending: ${parts.join(" + ")} awaiting answers ` +
          `(fill batch-*.json / communities.json and re-run \`graphify update\`)`,
      );
    }
    // When undescribedCount === 0 the orphan files are stale — ignore them.
    // (They will be cleaned up on the next completing run.)
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

  const onlyPendingDescriptions =
    reasons.length === 1 && (describePending || unansweredBatches > 0 || unansweredLabels);

  return {
    current: reasons.length === 0,
    reasons,
    // When the only pending signal is missing descriptions/labels, the precise
    // fix is the idempotent gap-fill or fill+re-run; otherwise full refresh.
    recommendedCommand: onlyPendingDescriptions
      ? unansweredBatches > 0 || unansweredLabels
        ? "Fill the batch-*.json / communities.json files and re-run `graphify update` to ingest."
        : "Run `graphify update --fill-missing` to add descriptions + salient labels."
      : "Run the graphify skill with --update to refresh semantic data.",
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
    /** Inline Level-1 citations kept per node in graph.json. Default: corpus-resolved. */
    citationsTopK?: number;
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

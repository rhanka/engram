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
  ALL_KNOWN_STATE_DIRS,
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
import { engramEnv } from "./env.js";
import { safeGitRevParse } from "./git.js";
import {
  makeDetectionPortable,
  makeExtractionPortable,
  makeGraphPortable,
  projectRootLabel,
  toProjectRelativePath,
} from "./portable-artifacts.js";
import { loadGraphFromData } from "./graph.js";
import type { CitationAggregateMap } from "./citations.js";
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
  hasUnresolvedLabelInstructions,
  LABEL_ANSWER_FILE,
  LABEL_INSTRUCTIONS_DIR,
  type LabelSource,
} from "./community-labeling.js";
import { buildCodeFileNodeIdMap, extractGit, mergeExtractions } from "./extract-git.js";
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

function changedCodeFilesFromHook(root: string, codeFiles: string[]): string[] | null {
  const raw = engramEnv("ENGRAM_CHANGED", "GRAPHIFY_CHANGED");
  if (!raw || raw.trim().length === 0) return null;
  const changed = new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => [line.replace(/\\/g, "/"), pathResolve(root, line).replace(/\\/g, "/")]),
  );
  return codeFiles.filter((file) => {
    const abs = pathResolve(file).replace(/\\/g, "/");
    const rel = toProjectRelativePath(root, file);
    return changed.has(abs) || changed.has(rel);
  });
}

// ---------------------------------------------------------------------------
// Rebuild pipeline (code-only, deterministic — LIVE §11 / L1a)
//
// `rebuildCode` is the live code-only refresh. By default it performs ZERO
// model inference, ZERO embeddings, ZERO assistant instruction emission and
// writes no deferred-enrichment marker. Provider keys, configured enrichers,
// --force and previously stored vectors/descriptions cannot activate any
// semantic stage here. Explicit non-live enrichment remains a separate,
// explicitly requested dispatch: the CLI `engram update` command passes the
// `enrichment` option group below (never the live watch/hook paths), which
// restores the salient-label + node-description stages and the
// describe-pending marker finalization for that command only.
// ---------------------------------------------------------------------------

/**
 * Explicit NON-LIVE enrichment request (L1a / LIVE §11). Only the `engram
 * update` dispatch sets this; the live watch/hook paths never do. Presence of
 * this group is the ONLY way to reach the semantic stages from `rebuildCode`.
 */
export interface RebuildEnrichmentOptions {
  /** WP11: generate node descriptions before graph.json is written. */
  describe?: boolean;
  descriptionBackend?: string;
  descriptionModel?: string;
  descriptionMaxNodes?: number;
  /** `update --fill-missing`: only describe nodes with an empty description. */
  descriptionOnlyMissing?: boolean;
  descriptionMode?: "assistant" | "direct";
  descriptionLang?: string;
  corpusDefaultLang?: string | null;
  /** WP12: generate salient community labels after Louvain clustering. */
  label?: boolean;
  labelBackend?: string;
  labelModel?: string;
  labelMode?: "assistant" | "direct";
  labelLang?: string;
  /** Per-node citation cap injected into the description prompt. */
  citationCap?: number | "all";
}

// Node attributes stamped by the non-live enrichment workflows (description
// stage, doc extraction citations) that a live refresh must preserve
// deterministically when a symbol is re-extracted from the AST with the same
// id — the fresh extraction rebuilds such nodes from scratch and would
// otherwise drop prior annotation work (L1a review M3).
const PRESERVED_ANNOTATION_ATTRS = ["description", "citations"] as const;


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
     * Inline Level-1 citations kept per node in graph.json (the K-bounded set).
     * Forwarded to `persistGraphWithCitations`. Resolved from corpus type by the
     * CLI when a `--citations-top-k` flag is absent; undefined → the citations
     * module default (8).
     */
    citationsTopK?: number;
    /**
     * hook-rebuild signal: after writing graph.json, re-derive `citations.json`
     * LLM-free with the no-shrink guard — a re-projection from a K-trimmed
     * graph.json must never clobber a fuller existing sidecar, and when the
     * persisted extraction output is available the full tail is rebuilt from it.
     * Only the fast git-hook rebuild sets this.
     */
    citationsReproject?: boolean;
    /**
     * Phase 4 legacy hook contract: ONLY the installed git-hook rebuild
     * (`hook-rebuild`) sets this true. The live path never does — it writes no
     * deferred-enrichment marker (LIVE §11). The hook keeps its explicit,
     * pre-existing `.graphify_describe_pending` nudge for `check-update`.
     */
    markDescribePending?: boolean;
    /**
     * L1a / LIVE §11: explicit NON-LIVE enrichment request (the `engram
     * update` dispatch). Absent → the rebuild stays deterministic and
     * LLM-free (live watch/hook paths never set this). Present → run the
     * salient-label + node-description stages with these knobs and the
     * describe-pending marker finalization for this command only.
     */
    enrichment?: RebuildEnrichmentOptions;
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

    const allCodeFiles = (rawDetection.files.code ?? []).filter(
      (f: string) =>
        !ALL_KNOWN_STATE_DIRS.some((dir) => f.includes(dir)) &&
        !f.includes("__pycache__") &&
        !f.includes("node_modules"),
    );
    const hookChangedCodeFiles = changedCodeFilesFromHook(root, allCodeFiles);
    const codeFiles = hookChangedCodeFiles ?? allCodeFiles;

    let result: Extraction;
    if (codeFiles.length === 0) {
      console.log("[engram watch] No code files found - writing empty graph index.");
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
          `[engram watch] AST extraction failed for ${extracted.diagnostics.length} file(s): ` +
          `${extracted.diagnostics.slice(0, 3).map((d) => `${d.filePath}: ${d.error}`).join(" | ")}`,
        );
      }
      if (result.nodes.length === 0) {
        console.log("[engram watch] Rebuild failed: AST extraction produced no graph nodes.");
        return false;
      }
    }
    result = mergeExtractions(
      result,
      extractGit(root, {
        fileNodeIds: buildCodeFileNodeIdMap(root, allCodeFiles),
      }),
    );

    const relativeResult = makeExtractionPortable(result, root);
    const relativeCodeFiles = allCodeFiles.map((file) => toProjectRelativePath(root, file));

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
          if (newAstIds.has(nodeId)) {
            // L1a review M3: the fresh AST extraction rebuilt this node from
            // scratch, so prior enrichment annotations (description, inline
            // citations) would be silently dropped — the live path never
            // re-describes, so nothing would restore them. Preserve them
            // deterministically for unchanged symbols instead.
            for (const key of PRESERVED_ANNOTATION_ATTRS) {
              if (attrs[key] !== undefined && G.getNodeAttribute(nodeId, key) === undefined) {
                G.setNodeAttribute(nodeId, key, attrs[key]);
              }
            }
            return;
          }
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
              `[engram watch] Topology unchanged - reusing ${reused.size} existing community assignment(s).`,
            );
          }
        }
      } catch {
        /* ignore unreadable prior graph, fall through to full clustering */
      }
    }
    if (options.noCluster) {
      communities = new Map();
      console.log("[engram watch] --no-cluster: skipping Louvain clustering.");
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

    // L1a / LIVE §11: NO salient-label stage on the live code-only path (the
    // labels come from `resolveCommunityLabels` — deterministic: persisted
    // `.graphify_labels.json` or generic "Community N"). The stage runs ONLY
    // under the explicit non-live `enrichment` request (`engram update`),
    // before the report so GRAPH_REPORT.md and graph.json both carry the
    // salient names. Degrades to generic "Community N" + a stderr note when
    // no LLM backend is configured.
    // L1a review B2: the label-stage outcome drives the instruction-dir
    // lifecycle below — unanswered assistant instructions must survive a
    // descriptions-complete run until the answer is ingested and verified.
    let labelSource: LabelSource | null = null;
    if (
      options.enrichment &&
      !options.noCluster &&
      options.enrichment.label !== false &&
      communities.size > 0
    ) {
      const { applySalientCommunityLabels } = await import("./community-labeling.js");
      const { source } = await applySalientCommunityLabels(G, communities, labels, {
        provider: options.enrichment.labelBackend ?? null,
        ...(options.enrichment.labelModel ? { model: options.enrichment.labelModel } : {}),
        ...(options.enrichment.labelMode ? { mode: options.enrichment.labelMode } : {}),
        ...(options.enrichment.labelLang !== undefined
          ? { labelLang: options.enrichment.labelLang }
          : {}),
        ...(options.enrichment.corpusDefaultLang
          ? { corpusDefaultLang: options.enrichment.corpusDefaultLang }
          : {}),
        gods,
        instructionDir: join(paths.stateDir, "label-instructions"),
      });
      labelSource = source;
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

    // L1a / LIVE §11: NO description stage on the live code-only path — no
    // model inference, no assistant instruction emission, no deferred marker.
    // The stage runs ONLY under the explicit non-live `enrichment` request
    // (`engram update`), stamping `description` onto G before the JSON write.
    // Skips gracefully (no throw) when no LLM backend is configured.
    let descriptionsComplete = false;
    if (options.enrichment && options.enrichment.describe !== false) {
      const { generateNodeDescriptions } = await import("./node-descriptions.js");
      const result = await generateNodeDescriptions(G, {
        ...(options.enrichment.descriptionBackend
          ? { provider: options.enrichment.descriptionBackend }
          : {}),
        ...(options.enrichment.descriptionModel
          ? { model: options.enrichment.descriptionModel }
          : {}),
        ...(options.enrichment.descriptionMaxNodes !== undefined
          ? { maxNodes: options.enrichment.descriptionMaxNodes }
          : {}),
        ...(options.enrichment.descriptionOnlyMissing ? { onlyMissing: true } : {}),
        ...(options.enrichment.descriptionMode ? { mode: options.enrichment.descriptionMode } : {}),
        ...(options.enrichment.citationCap !== undefined
          ? { citationCap: options.enrichment.citationCap }
          : {}),
        ...(options.enrichment.descriptionLang !== undefined
          ? { descriptionLang: options.enrichment.descriptionLang }
          : {}),
        ...(options.enrichment.corpusDefaultLang
          ? { corpusDefaultLang: options.enrichment.corpusDefaultLang }
          : {}),
        instructionDir: join(paths.stateDir, "description-instructions"),
      });
      // "Complete" = every describable node now has a description. When a backend
      // is missing this stays false, so the pending marker is kept for a later
      // `update --fill-missing` once a key is configured.
      descriptionsComplete = result.coverage.described >= result.coverage.describable;
    }

    // hook-rebuild fidelity guard: `persistGraphWithCitations` below re-derives
    // `citations.json` from the (already K-trimmed) in-memory graph, which would
    // SHRINK a fuller existing sidecar. Snapshot the rich store BEFORE the write
    // so the re-projection can restore the exhaustive tail (it is no longer on
    // disk once persist overwrites it).
    let priorCitationsSidecar: CitationAggregateMap | null = null;
    if (options.citationsReproject) {
      const { readCitationsSidecar } = await import("./citations.js");
      priorCitationsSidecar = readCitationsSidecar(dirname(paths.graph));
    }

    const jsonWritten = persistGraphWithCitations(G, communities, paths.graph, {
      communityLabels: labels,
      force: options.force,
      ...(options.citationsTopK !== undefined ? { citations: { topK: options.citationsTopK } } : {}),
    });
    if (!jsonWritten) {
      return false;
    }

    // Re-run the LLM-free re-projection with the no-shrink guard so the
    // exhaustive tail survives — rebuilding from the persisted extraction output
    // when present, else preserving the pre-write snapshot. No-op when no node
    // carries citations. Only fires for the git hook (full builds skip this).
    if (options.citationsReproject) {
      const { reprojectCitationsLLMFree } = await import("./citations.js");
      reprojectCitationsLLMFree(G, dirname(paths.graph), {
        ...(options.citationsTopK !== undefined ? { topK: options.citationsTopK } : {}),
        ...(existsSync(paths.scratch.extract) ? { extractionPath: paths.scratch.extract } : {}),
        priorSidecar: priorCitationsSidecar,
      });
    }

    persistCommunityLabels(labels, paths.scratch.labels);
    writeFileSync(paths.report, report, "utf-8");

    // Phase 4: describe-pending marker.
    //
    // Two independent signals can create the pending marker:
    //
    //   A) Fast git-hook rebuild: ran LLM-free (no `enrichment` group). ONLY
    //      that path passes `markDescribePending: true` — we drop a marker so
    //      `check-update` nudges the user. An explicit `update --no-description`
    //      must NOT set this marker (0.12.0 fix — keeps "opted out" distinct
    //      from "instructions emitted but not answered").
    //
    //   B) Assistant mode: the explicit non-live enrichment (`engram update`)
    //      ran describe/label in assistant mode (no API key) and emitted
    //      instruction files that have NOT yet been answered. We detect
    //      un-answered instruction files directly and write the pending marker
    //      with an actionable message. Clears when a subsequent run ingests
    //      the answers.
    //
    // The live code-only path (no `enrichment`, no `markDescribePending`) writes
    // NO marker at all (LIVE §11 / L1a): pre-existing markers from the separate
    // non-live workflow are left exactly as they are.
    //
    // Instruction-file lifecycle (C1 stale-orphan fix + L1a review B2):
    // each instruction dir is purged ONLY when its own stage verified
    // completion. A descriptions-complete run purges stale orphan description
    // batches — but MUST NOT purge label instructions whose answer has not
    // been ingested yet: the label stage has just emitted them (assistant
    // mode) and the gap-fill re-run is what verifies the answer. Purging them
    // here would drop pending label work and clear the marker while labels
    // are still generic. The label dir is purged only when the label stage
    // succeeded directly (`llm` source, salient names persisted); an ingested
    // assistant answer self-cleans inside the label stage.
    {
      const descInstructionDir = join(paths.stateDir, DESCRIPTION_INSTRUCTIONS_DIR);
      const labelInstructionDir = join(paths.stateDir, LABEL_INSTRUCTIONS_DIR);

      if (descriptionsComplete) {
        // Completing run: purge any stale orphan description files so a
        // subsequent countUnansweredDescriptionBatches call returns 0 even if
        // a prior run left leftover .md files.
        cleanDescriptionInstructionDir(descInstructionDir);
      }
      if (labelSource === "llm") {
        // Direct-mode salient labels landed and were persisted — drop stale
        // label orphans so they cannot cause a false-pending signal.
        cleanLabelInstructionDir(labelInstructionDir);
      }

      const unansweredBatches = options.enrichment && options.enrichment.describe !== false
        ? countUnansweredDescriptionBatches(descInstructionDir)
        : 0;
      // L1a pending-until-verified: an empty (`{}`) or malformed answer
      // ingests to zero names, so it must NOT read as "answered" — the
      // marker clears only after a valid ingestion (which self-cleans the
      // instruction dir).
      const unansweredLabels = options.enrichment &&
          options.enrichment.label !== false &&
          !options.noCluster
        ? hasUnresolvedLabelInstructions(labelInstructionDir)
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
          `[engram watch] ${pendingMsg} awaiting assistant answers — ` +
            `fill the batch-*.json / communities.json files in .graphify/ and re-run \`engram update\`.`,
        );
      } else if (options.markDescribePending === true) {
        // A) Fast git-hook rebuild: no descriptions/labels were run.
        writeFileSync(
          paths.describePending,
          "Graph rebuilt by the fast git hook without descriptions/labels. " +
            "Run `engram update --fill-missing` to fill them.\n",
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
      `[engram watch] Rebuilt: ${G.order} nodes, ${G.size} edges, ${communities.size} communities`,
    );
    console.log(
      `[engram watch] graph.json and GRAPH_REPORT.md updated in ${outDir}`,
    );
    return true;
  } catch (err) {
    console.log(
      `[engram watch] Rebuild failed: ${err instanceof Error ? err.message : err}`,
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
  // L1a pending-until-verified: a present-but-unverifiable label answer
  // (`{}` / malformed JSON) is active work, never a stale orphan — it
  // bypasses the orphan suppression below so `current` stays false until a
  // valid ingestion lands.
  const unansweredLabels = hasUnresolvedLabelInstructions(labelInstructionDir);
  const labelAnswerPresent = existsSync(join(labelInstructionDir, LABEL_ANSWER_FILE));
  if (!describePending && (unansweredBatches > 0 || unansweredLabels)) {
    // Before reporting pending, check whether the graph itself still has
    // undescribed describable nodes. Returns -1 when graph.json is missing or
    // unreadable (treat as "unknown" — do NOT suppress pending in that case).
    // Only suppress when we can positively confirm zero undescribed nodes (=0).
    const undescribedCount = countUndescribedInGraph(paths.graph);
    const activeLabelWork = unansweredLabels && labelAnswerPresent;
    if (activeLabelWork || undescribedCount !== 0) {
      // undescribedCount > 0: genuine pending (real undescribed nodes exist).
      // undescribedCount < 0 (−1): graph.json absent/unreadable — state unknown,
      //   keep the pending signal rather than silently hiding it.
      const parts: string[] = [];
      if (unansweredBatches > 0) parts.push(`${unansweredBatches} description batch(es)`);
      if (unansweredLabels) parts.push("community label instructions");
      reasons.push(
        `assistant-mode work pending: ${parts.join(" + ")} awaiting answers ` +
          `(fill batch-*.json / communities.json and re-run \`engram update\`)`,
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
        ? "Fill the batch-*.json / communities.json files and re-run `engram update` to ingest."
        : "Run `engram update --fill-missing` to add descriptions + salient labels."
      : "Run the engram skill with --update to refresh semantic data.",
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
  console.log(`\n[engram watch] New or changed files detected in ${watchPath}`);
  console.log(
    "[engram watch] Non-code files changed - semantic re-extraction requires LLM.",
  );
  console.log(
    "[engram watch] Run the engram skill with `--update` to refresh semantic data (for Codex: `$engram . --update`).",
  );
  console.log(`[engram watch] Flag written to ${flagPath}`);
}

function hasNonCode(changedPaths: string[]): boolean {
  return changedPaths.some((p) => !CODE_EXTENSIONS.has(extname(p).toLowerCase()));
}

// ---------------------------------------------------------------------------
// Watch batch dispatch (LIVE §11 / L1a)
// ---------------------------------------------------------------------------

export interface WatchBatchOptions {
  scope?: GraphifyInputScopeMode;
  scopeSource?: InputScopeSource;
  /** Inline Level-1 citations kept per node in graph.json. Default: corpus-resolved. */
  citationsTopK?: number;
}

export interface WatchBatchOutcome {
  /** True when the batch contained code and the deterministic rebuild succeeded. */
  codeRebuilt: boolean;
  /** True when the batch contained documents (needs_update flag written). */
  nonCodeNotified: boolean;
}

/**
 * Dispatch one coalesced watch batch. A mixed code/document batch refreshes
 * the CODE graph deterministically AND flags the documents — it never
 * collapses into a notification-only pass (LIVE §11: documents in a mixed
 * batch cannot prevent code refresh or activate semantic extraction). Both
 * halves run with zero model calls and zero assistant artifacts.
 */
export async function rebuildWatchBatch(
  watchPath: string,
  changedPaths: string[],
  options: WatchBatchOptions = {},
): Promise<WatchBatchOutcome> {
  const codeChanged = changedPaths.some((p) =>
    CODE_EXTENSIONS.has(extname(p).toLowerCase()),
  );
  const nonCodeChanged = hasNonCode(changedPaths);
  let codeRebuilt = false;
  if (codeChanged) {
    codeRebuilt = await rebuildCode(watchPath, false, options);
  }
  if (nonCodeChanged) {
    // Signal only: the documents still need semantic re-extraction, which is
    // the separate explicit (non-live) workflow. Runs AFTER the code rebuild
    // so `clearStale` in rebuildCode cannot erase the flag.
    notifyOnly(watchPath);
  }
  return { codeRebuilt, nonCodeNotified: nonCodeChanged };
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
    `[engram watch] Watching ${resolvedPath} - press Ctrl+C to stop`,
  );
  console.log(
    "[engram watch] Code changes rebuild graph automatically. Doc/image changes require an engram skill `--update` run.",
  );
  console.log(`[engram watch] Debounce: ${debounce}s`);

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
      console.log(`\n[engram watch] ${batch.length} file(s) changed`);
      await rebuildWatchBatch(watchPath, batch, options);
    } finally {
      rebuilding = false;
      releaseRebuildLock(watchPath);
    }
  }, 500);

  // Graceful shutdown
  const cleanup = () => {
    console.log("\n[engram watch] Stopped.");
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

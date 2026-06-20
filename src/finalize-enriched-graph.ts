/**
 * Shared enrichment-stage finalization (SPEC_GRAPHIFY § "Enrichment Stages").
 *
 * Steps 9–11 of the pipeline — community labels, node descriptions, citation
 * projection — are enrichment stages that MUST run in EVERY graph-finalization
 * path (`graphify <path>` first run, `graphify extract`, `graphify update`,
 * profile post-semantic finalization), not only `graphify update`.
 *
 * This module is the single chokepoint those paths converge on. It runs, in
 * fixed order:
 *
 *   1. Community labels — fold salient names into the resolved labels
 *      (default-on, assistant-emit when no key; emits `<stateDir>/label-
 *      instructions/`). Persisted so later runs reuse them.
 *   2. Node descriptions — `generateNodeDescriptions` with an EXPLICIT
 *      `instructionDir = <stateDir>/description-instructions` (default-on,
 *      assistant-emit when no key; `--no-description` opts out).
 *   3. Citation projection — `persistGraphWithCitations` IS the graph writer
 *      (deterministic, no LLM). The required invariant is that finalization
 *      writers route through `persistGraphWithCitations`, never raw `toJson`.
 *
 * Modeled on `watch.rebuildCode` (src/watch.ts) and `buildProject`
 * (src/pipeline.ts), which previously each open-coded a partial subset of these
 * stages.
 */
import { join } from "node:path";
import type Graph from "graphology";

import { applySalientCommunityLabels, type LabelMode } from "./community-labeling.js";
import { persistCommunityLabels } from "./community-labels.js";
import {
  generateNodeDescriptions,
  type DescriptionMode,
  type CitationCap,
} from "./node-descriptions.js";
import { persistGraphWithCitations } from "./export.js";
import type { CitationAggregateMap } from "./citations.js";
import type { DirectLlmProvider } from "./llm-execution.js";
import type { GodNodeEntry } from "./types.js";

type CallLlmFn = (prompt: string, maxTokens?: number) => Promise<string>;

export interface FinalizeEnrichedGraphBuildOptions {
  /** In-memory graph to enrich + persist. */
  graph: Graph;
  /** Louvain communities (cid → node ids). */
  communities: Map<number, string[]>;
  /**
   * Resolved community labels (cid → name). Mutated in place by salient
   * labeling. The caller resolves existing labels first (resolveCommunityLabels)
   * and passes them here.
   */
  labels: Map<number, string>;
  /** Absolute path of the graph.json output. */
  graphPath: string;
  /** `.graphify/` state dir — anchors the label/description instruction dirs. */
  stateDir: string;
  /** Persisted-labels JSON path (`<stateDir>/.graphify_labels.json`). */
  labelsPath: string;

  /** God-node entries (improve salient labeling); empty when clustering is off. */
  gods?: GodNodeEntry[];

  // --- Stage gates (default-on; `false` opts out) -------------------------
  /** `false` → skip salient community labels (`--no-label` / `--no-cluster`). */
  label?: boolean;
  /** `false` → skip node descriptions (`--no-description`). */
  describe?: boolean;

  // --- Label stage knobs ---------------------------------------------------
  labelBackend?: DirectLlmProvider | string | null;
  labelModel?: string;
  labelMode?: LabelMode;
  /**
   * Injectable LLM caller for the LABEL stage only (tests / programmatic
   * direct opt-in). An injected `callLlm` is a programmatic direct opt-in
   * (community-labeling.ts:535), so this MUST stay separate from the
   * description caller — a description-only callback must never drive the
   * label stage into direct mode with label prompts.
   */
  labelCallLlm?: CallLlmFn;

  // --- Description stage knobs --------------------------------------------
  descriptionBackend?: DirectLlmProvider | string | null;
  descriptionModel?: string;
  descriptionMode?: DescriptionMode;
  descriptionMaxNodes?: number;
  descriptionOnlyMissing?: boolean;
  citationCap?: CitationCap;
  /** Injectable LLM caller for the DESCRIPTION stage only (tests). */
  descriptionCallLlm?: CallLlmFn;

  // --- Citation writer knobs ----------------------------------------------
  /** Inline top-K cap for `graph.json` citations (default policy when omitted). */
  citationsTopK?: number;
  /**
   * Prior FULL citation union (from `citations.json`) for update/merge paths,
   * so a re-extracted node's count + top-K derive from `prior ∪ fresh` rather
   * than the K-trimmed inline. Forwarded to `persistGraphWithCitations`.
   */
  citationsPriorSidecar?: CitationAggregateMap | null;
  /** Force overwrite of a protected/curated graph. */
  force?: boolean;
}

export interface FinalizeEnrichedGraphBuildResult {
  /** Whether `persistGraphWithCitations` wrote graph.json. */
  jsonWritten: boolean;
  /** Source of the salient labels: "llm" | "assistant" | "placeholder". */
  labelSource: string;
  /** Every describable node now carries a description (false in assistant emit). */
  descriptionsComplete: boolean;
}

/**
 * Run the three enrichment stages (labels → descriptions → citations) and write
 * graph.json through `persistGraphWithCitations`. The single finalization step
 * every graph-finalization path is required to route through.
 */
export async function finalizeEnrichedGraphBuild(
  options: FinalizeEnrichedGraphBuildOptions,
): Promise<FinalizeEnrichedGraphBuildResult> {
  const {
    graph: G,
    communities,
    labels,
    graphPath,
    stateDir,
    labelsPath,
  } = options;

  // --- Stage 9: salient community labels (default-on, assistant-emit no-key).
  // The caller has already resolved existing labels into `labels`; here we fold
  // in salient names. Skipped when clustering is off (no communities) or
  // `label === false` (--no-label). Degrades to generic names + a stderr note
  // when no LLM backend is configured.
  let labelSource = "placeholder";
  if (options.label !== false && communities.size > 0) {
    const { source } = await applySalientCommunityLabels(G, communities, labels, {
      provider: options.labelBackend ?? null,
      ...(options.labelModel ? { model: options.labelModel } : {}),
      ...(options.labelMode ? { mode: options.labelMode } : {}),
      ...(options.labelCallLlm ? { callLlm: options.labelCallLlm } : {}),
      gods: options.gods ?? [],
      instructionDir: join(stateDir, "label-instructions"),
    });
    labelSource = source;
    if (source === "llm") {
      // Persist so subsequent cluster-only / update / hook runs reuse the
      // salient names instead of regenerating them.
      persistCommunityLabels(labels, labelsPath);
    }
  }

  // --- Stage 10: node descriptions (default-on, assistant-emit no-key).
  // Stamp `description` onto G before the JSON write. EXPLICIT instructionDir so
  // a no-key build emits `<stateDir>/description-instructions/` (parity with the
  // label instructions above). Skips gracefully (no throw) with no backend.
  let descriptionsComplete = false;
  if (options.describe !== false) {
    const result = await generateNodeDescriptions(G, {
      ...(options.descriptionBackend ? { provider: options.descriptionBackend } : {}),
      ...(options.descriptionModel ? { model: options.descriptionModel } : {}),
      ...(options.descriptionMaxNodes !== undefined ? { maxNodes: options.descriptionMaxNodes } : {}),
      ...(options.descriptionOnlyMissing ? { onlyMissing: true } : {}),
      ...(options.descriptionMode ? { mode: options.descriptionMode } : {}),
      ...(options.citationCap !== undefined ? { citationCap: options.citationCap } : {}),
      ...(options.descriptionCallLlm ? { callLlm: options.descriptionCallLlm } : {}),
      instructionDir: join(stateDir, "description-instructions"),
    });
    descriptionsComplete = result.coverage.described >= result.coverage.describable;
  }

  // --- Stage 11: citation projection IS the graph writer. Deterministic union /
  // true-count / tiering; no LLM. The required invariant is that finalization
  // writers route through `persistGraphWithCitations` (never raw `toJson`).
  const citationOptions = {
    ...(options.citationsTopK !== undefined ? { topK: options.citationsTopK } : {}),
    ...(options.citationsPriorSidecar ? { priorSidecar: options.citationsPriorSidecar } : {}),
  };
  const jsonWritten = persistGraphWithCitations(G, communities, graphPath, {
    communityLabels: labels,
    ...(options.force ? { force: true } : {}),
    ...(Object.keys(citationOptions).length > 0 ? { citations: citationOptions } : {}),
  });

  // Persist the (possibly salient-updated) labels even on the assistant /
  // placeholder path so cluster-only / update reuse the active set.
  persistCommunityLabels(labels, labelsPath);

  return { jsonWritten, labelSource, descriptionsComplete };
}

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type {
  BatchTextJsonClient,
  BatchTextJsonExportInput,
  BatchTextJsonExportResult,
} from "./llm-execution.js";
import {
  WIKI_DESCRIPTION_PROMPT_VERSION,
  WIKI_DESCRIPTION_SCHEMA,
  buildWikiDescriptionCacheKey,
  validateWikiDescriptionSidecar,
  type WikiDescriptionExecutionMode,
  type WikiDescriptionGenerator,
  type WikiDescriptionSidecar,
  type WikiDescriptionSidecarIndex,
  type WikiDescriptionTargetKind,
} from "./wiki-descriptions.js";
import type {
  WikiDescriptionTargetCollection,
  WikiDescriptionTargetContext,
} from "./wiki-description-generation.js";
import { buildWikiDescriptionPrompt } from "./wiki-description-generation.js";

/**
 * Track A Lot A2 — batch mode scaffold for wiki description generation.
 *
 * The functions in this module turn an in-memory target collection (the same
 * shape returned by `collectWikiDescriptionTargets`) into a provider-agnostic
 * batch export payload and turn provider results back into a validated
 * sidecar index. Provider wiring (OpenAI Batch, Anthropic Batch) lives in a
 * follow-up commit; this module is intentionally provider-free so tests can
 * mock `BatchTextJsonClient` and exercise the round-trip in CI.
 */

export const WIKI_DESCRIPTION_BATCH_SCHEMA = "graphify_wiki_description_batch_v1" as const;

export interface BuildWikiDescriptionBatchOptions {
  graphHash: string;
  outputPath: string;
  promptVersion?: string;
  maxNeighbors?: number;
}

export function buildWikiDescriptionBatchExport(
  targets: WikiDescriptionTargetCollection,
  options: BuildWikiDescriptionBatchOptions,
): BatchTextJsonExportInput {
  const promptVersion = options.promptVersion ?? WIKI_DESCRIPTION_PROMPT_VERSION;
  const ordered: WikiDescriptionTargetContext[] = [...targets.nodes, ...targets.communities];
  const requests = ordered.map((target) => ({
    id: target.target_id,
    schema: WIKI_DESCRIPTION_SCHEMA,
    prompt: buildWikiDescriptionPrompt(target, {
      graphHash: options.graphHash,
      ...(options.maxNeighbors !== undefined ? { maxNeighbors: options.maxNeighbors } : {}),
      promptVersion,
    }),
  }));
  return {
    schema: WIKI_DESCRIPTION_BATCH_SCHEMA,
    outputPath: options.outputPath,
    requests,
  };
}

/**
 * Writes the batch export payload to disk as JSONL so any provider's "submit
 * batch" command can consume it. Each line is `{id, schema, prompt}`. The
 * `_meta` object is written as a single header line so consumers can tell
 * which graph hash / prompt version the file was generated against.
 */
export async function exportWikiDescriptionBatchToJsonl(
  client: BatchTextJsonClient,
  input: BatchTextJsonExportInput,
): Promise<BatchTextJsonExportResult> {
  mkdirSync(dirname(input.outputPath), { recursive: true });
  // The client owns the actual write so providers can emit their own JSONL
  // dialect when they need to (e.g. OpenAI's wrapping with `custom_id` /
  // `method` / `url` / `body`). The default written below is the graphify
  // canonical shape; providers can ignore it and overwrite.
  const lines = input.requests.map((request) => JSON.stringify({
    id: request.id,
    schema: request.schema,
    prompt: request.prompt,
  }));
  writeFileSync(input.outputPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf-8");
  return client.exportRequests(input);
}

export interface WikiDescriptionBatchResultRecord {
  id: string;
  status: "generated" | "insufficient_evidence";
  description: string | null;
  evidence_refs: string[];
  confidence: number | null;
}

export interface ParseWikiDescriptionBatchOptions {
  graphHash: string;
  generator: WikiDescriptionGenerator;
  targetKinds: Map<string, WikiDescriptionTargetKind>;
  createdAt?: string;
}

/**
 * Wraps each provider batch result into a validated sidecar (or drops it if
 * the payload does not satisfy the sidecar schema). The caller passes a
 * `targetKinds` map so the parser knows whether each id refers to a node or
 * a community (build it from the same target collection used for export).
 *
 * Records that fail validation are returned in `dropped` so callers can
 * surface them in a UAT report.
 */
export function parseWikiDescriptionBatchResults(
  records: ReadonlyArray<WikiDescriptionBatchResultRecord>,
  options: ParseWikiDescriptionBatchOptions,
): {
  index: WikiDescriptionSidecarIndex;
  dropped: Array<{ id: string; reason: string }>;
} {
  const promptVersion = options.generator.prompt_version;
  const mode: WikiDescriptionExecutionMode = options.generator.mode;
  const provider = options.generator.provider;
  const model = options.generator.model;
  const nodes: Record<string, WikiDescriptionSidecar<"node">> = {};
  const communities: Record<string, WikiDescriptionSidecar<"community">> = {};
  const dropped: Array<{ id: string; reason: string }> = [];

  for (const record of records) {
    const kind = options.targetKinds.get(record.id);
    if (!kind) {
      dropped.push({ id: record.id, reason: "unknown target id (not in targetKinds map)" });
      continue;
    }
    const cacheKey = buildWikiDescriptionCacheKey({
      target_id: record.id,
      target_kind: kind,
      graph_hash: options.graphHash,
      prompt_version: promptVersion,
      mode,
      provider,
      model,
    });
    let sidecar: WikiDescriptionSidecar;
    if (record.status === "generated") {
      if (!record.description || record.description.trim().length === 0) {
        dropped.push({ id: record.id, reason: "generated record missing description" });
        continue;
      }
      if (record.evidence_refs.length === 0) {
        dropped.push({ id: record.id, reason: "generated record missing evidence_refs" });
        continue;
      }
      if (typeof record.confidence !== "number" || !Number.isFinite(record.confidence)) {
        dropped.push({ id: record.id, reason: "generated record missing confidence" });
        continue;
      }
      sidecar = {
        schema: WIKI_DESCRIPTION_SCHEMA,
        target_id: record.id,
        target_kind: kind,
        graph_hash: options.graphHash,
        status: "generated",
        description: record.description,
        evidence_refs: record.evidence_refs as [string, ...string[]],
        confidence: record.confidence,
        cache_key: cacheKey,
        generator: { mode, provider, model, prompt_version: promptVersion },
        ...(options.createdAt ? { created_at: options.createdAt } : {}),
      };
    } else {
      sidecar = {
        schema: WIKI_DESCRIPTION_SCHEMA,
        target_id: record.id,
        target_kind: kind,
        graph_hash: options.graphHash,
        status: "insufficient_evidence",
        description: null,
        evidence_refs: [],
        confidence: null,
        cache_key: cacheKey,
        generator: { mode, provider, model, prompt_version: promptVersion },
        ...(options.createdAt ? { created_at: options.createdAt } : {}),
      };
    }
    const issues = validateWikiDescriptionSidecar(sidecar);
    if (issues.length > 0) {
      dropped.push({ id: record.id, reason: issues.join("; ") });
      continue;
    }
    if (kind === "node") {
      nodes[record.id] = sidecar as WikiDescriptionSidecar<"node">;
    } else {
      const communityKey = record.id.startsWith("community:")
        ? record.id.slice("community:".length)
        : record.id;
      communities[communityKey] = sidecar as WikiDescriptionSidecar<"community">;
    }
  }

  const index: WikiDescriptionSidecarIndex = {
    schema: "graphify_wiki_description_index_v1",
    graph_hash: options.graphHash,
    prompt_version: promptVersion,
    nodes,
    ...(Object.keys(communities).length > 0 ? { communities } : {}),
  };
  return { index, dropped };
}

export function buildTargetKindsMap(
  targets: WikiDescriptionTargetCollection,
): Map<string, WikiDescriptionTargetKind> {
  const map = new Map<string, WikiDescriptionTargetKind>();
  for (const target of targets.nodes) map.set(target.target_id, "node");
  for (const target of targets.communities) map.set(target.target_id, "community");
  return map;
}

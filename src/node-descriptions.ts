/**
 * LLM-backed node descriptions for the standalone CLI (WP11).
 *
 * WP11 flips graphify descriptions from opt-in to on-by-default and extends
 * them from "entity" nodes (the wiki-sidecar god-node path) to *every* graph
 * node — including CODE symbols (functions / classes / constants), which
 * previously had no `description` at all.
 *
 * Unlike `wiki describe` (which writes provenance-rich sidecars under
 * `.graphify/wiki/descriptions/` and never mutates `graph.json`), this module
 * writes a short natural-language `description` attribute *directly onto the
 * graph node* so it round-trips through `toJson` into `graph.json`. That is the
 * field reviewers, the Studio node-info panel, and `graphify query` read.
 *
 * Design choices (mirrors `community-labeling.ts` deliberately):
 * - Reuses `DIRECT_LLM_PROVIDERS` / `directProviderCredentialEnv` /
 *   `isDirectLlmProvider` from `llm-execution.ts` — no new LLM wiring.
 * - Batched: descriptions are requested in ONE LLM call per batch
 *   (id -> one-sentence description), keeping the on-by-default cost bounded
 *   instead of one call per node across thousands of symbols.
 * - Injectable `callLlm` so tests mock the network with zero real HTTP calls.
 * - Auto-detect walks `DIRECT_LLM_PROVIDERS` and returns the first whose
 *   credential env var is present; mirrors `detectLabelingBackend()`.
 * - Graceful degradation: no backend / API error / malformed reply skips
 *   description generation with a clear stderr warning and never throws from
 *   the public entry point `generateNodeDescriptions`. This is what makes
 *   "on by default" safe in CI / no-API-key environments.
 */

import Graph from "graphology";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import {
  DIRECT_LLM_PROVIDERS,
  directProviderCredentialEnv,
  isDirectLlmProvider,
  type DirectLlmProvider,
} from "./llm-execution.js";

/** Cap on the number of nodes described per build. 0 = describe ALL nodes (no
 * cap) — the default, so every entity and code function gets a description.
 * Highest-degree nodes are still processed first (matters only if a positive
 * cap is set via options.maxNodes). */
const DEFAULT_MAX_NODES = 0;

/** Nodes per LLM call; bounds prompt size and keeps each reply parseable. */
const DEFAULT_BATCH_SIZE = 40;

/** Truncate individual labels / signatures to keep prompts compact. */
const LABEL_MAXLEN = 80;

/** Strip markdown fences that some models wrap JSON in. */
const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gi;

export const NODE_DESCRIPTION_PROMPT_VERSION = "node-description-v1" as const;
export const NODE_DESCRIPTION_SCHEMA = "graphify_node_descriptions_v1" as const;
const NODE_DESCRIPTION_JSON_FIELDS = ["description", "description_status", "description_meta"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(value: string, max = LABEL_MAXLEN): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A code node is anything the AST extractor emitted (file_type === "code"). */
function isCodeNode(attrs: Record<string, unknown>): boolean {
  return safeString(attrs.file_type) === "code";
}

interface NodeContext {
  id: string;
  label: string;
  isCode: boolean;
  sourceFile: string | null;
  sourceLocation: string | null;
  nodeType: string | null;
  degree: number;
  neighbors: string[];
}

function collectNeighbors(G: Graph, nodeId: string, limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  G.forEachNeighbor(nodeId, (neighborId) => {
    if (seen.has(neighborId) || out.length >= limit) return;
    seen.add(neighborId);
    const attrs = G.getNodeAttributes(neighborId) as Record<string, unknown>;
    out.push(truncate(safeString(attrs.label) ?? neighborId, 40));
  });
  return out;
}

function collectNodeContext(G: Graph, nodeId: string): NodeContext {
  const attrs = G.getNodeAttributes(nodeId) as Record<string, unknown>;
  return {
    id: nodeId,
    label: truncate(safeString(attrs.label) ?? nodeId),
    isCode: isCodeNode(attrs),
    sourceFile: safeString(attrs.source_file),
    sourceLocation: safeString(attrs.source_location),
    nodeType: safeString(attrs.node_type),
    degree: G.degree(nodeId),
    neighbors: collectNeighbors(G, nodeId, 6),
  };
}

/**
 * Rank nodes for description: highest-degree first (the nodes most worth
 * describing), id as a stable tiebreak. Deterministic so reruns are stable.
 */
function rankNodes(G: Graph): string[] {
  const ids: string[] = [];
  G.forEachNode((nodeId) => ids.push(nodeId));
  return ids.sort((a, b) => {
    const degreeDelta = G.degree(b) - G.degree(a);
    return degreeDelta !== 0 ? degreeDelta : a.localeCompare(b);
  });
}

/** Build the JSON-line context for one node inside a batch prompt. */
function nodePromptLine(ctx: NodeContext): string {
  const parts: string[] = [`"${ctx.id}": ${JSON.stringify(ctx.label)}`];
  if (ctx.isCode) {
    parts.push("kind=code-symbol");
  } else if (ctx.nodeType) {
    parts.push(`kind=${ctx.nodeType}`);
  }
  if (ctx.sourceFile) {
    parts.push(`source=${ctx.sourceFile}${ctx.sourceLocation ? `:${ctx.sourceLocation}` : ""}`);
  }
  if (ctx.neighbors.length > 0) {
    parts.push(`neighbors=[${ctx.neighbors.join(", ")}]`);
  }
  return `- ${parts.join(" | ")}`;
}

export function buildNodeDescriptionPrompt(contexts: NodeContext[]): string {
  return [
    "You are documenting nodes in a code knowledge graph. For each entry below,",
    "write ONE concise plain-language sentence describing what it is or does.",
    "For a code symbol (a function, class, or constant), describe what the",
    "function/symbol does based on its name, source location and neighbors —",
    "e.g. \"Resolves the configured ontology profile from graphify.yaml.\".",
    "Do not speculate beyond the provided context, no marketing language.",
    "Respond ONLY with a JSON object mapping each node id (as a string) to its",
    "one-sentence description — no prose, no markdown fences.",
    "",
    ...contexts.map(nodePromptLine),
  ].join("\n");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseDescriptionResponse(text: string, validIds: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const cleaned = text.replace(FENCE_RE, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return out;
  }
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!validIds.has(id)) continue;
    const description = safeString(value);
    if (description) out.set(id, description);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auto-detect (mirrors detectLabelingBackend)
// ---------------------------------------------------------------------------

/**
 * First configured provider whose credential env var is present, or null.
 * ollama is excluded (no required env var → false positive).
 */
export function detectDescriptionBackend(): DirectLlmProvider | null {
  for (const provider of DIRECT_LLM_PROVIDERS) {
    const envNames = directProviderCredentialEnv(provider);
    if (envNames.length === 0) continue; // skip ollama
    for (const envName of envNames) {
      if (process.env[envName]?.trim()) return provider;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core call — injectable callLlm for testability
// ---------------------------------------------------------------------------

export type CallLlmFn = (prompt: string, maxTokens: number) => Promise<string>;

async function makeDefaultCallLlm(
  provider: DirectLlmProvider,
  model?: string,
): Promise<CallLlmFn> {
  // Reuse the exact AI SDK path used by community labeling / direct extraction.
  // Lazy-import keeps the heavy SDKs out of the no-backend path.
  const { generateText } = await import("ai");
  const { defaultDirectLlmModel } = await import("./llm-execution.js");
  const resolvedModelId = model?.trim() || defaultDirectLlmModel(provider);
  const resolvedModel = await resolveModel(provider, resolvedModelId);
  return async (prompt: string, maxTokens: number) => {
    const result = await generateText({
      model: resolvedModel as never,
      temperature: 0,
      maxOutputTokens: maxTokens,
      system: [
        "You are Graphify's node description backend.",
        "Return only a valid JSON object mapping node id to a one-sentence description.",
      ].join("\n"),
      prompt,
    });
    return result.text;
  };
}

async function resolveModel(provider: DirectLlmProvider, model: string): Promise<unknown> {
  switch (provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(model);
    }
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai(model);
    }
    case "gemini": {
      const { google } = await import("@ai-sdk/google");
      return google(model);
    }
    case "mistral": {
      const { mistral } = await import("@ai-sdk/mistral");
      return mistral(model);
    }
    case "cohere": {
      const { cohere } = await import("@ai-sdk/cohere");
      return cohere(model);
    }
    case "ollama": {
      const { createOllama } = await import("ollama-ai-provider");
      const baseURL = process.env.OLLAMA_BASE_URL?.trim();
      const factory = baseURL ? createOllama({ baseURL }) : createOllama();
      return factory(model);
    }
  }
}

export interface DescribeNodesOptions {
  provider: DirectLlmProvider;
  model?: string;
  maxNodes?: number;
  batchSize?: number;
  targetIds?: string[];
  callLlm?: CallLlmFn;
}

/**
 * Ask `provider` to describe the highest-degree nodes in batches and return a
 * `Map<nodeId, description>`. Raises on API / parse failure for a batch —
 * callers that want graceful degradation should use `generateNodeDescriptions`.
 */
export async function describeNodes(
  G: Graph,
  options: DescribeNodesOptions,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const rankedIds = options.targetIds ?? rankNodes(G);
  const targetIds = rankedIds.slice(0, maxNodes > 0 ? maxNodes : rankedIds.length);
  if (targetIds.length === 0) return out;

  const callLlm = options.callLlm ?? (await makeDefaultCallLlm(options.provider, options.model));

  for (const batch of chunk(targetIds, batchSize)) {
    const contexts = batch.map((id) => collectNodeContext(G, id));
    const prompt = buildNodeDescriptionPrompt(contexts);
    const validIds = new Set(batch);
    const maxTokens = Math.min(120 + 48 * batch.length, 8192);
    const text = await callLlm(prompt, maxTokens);
    const parsed = parseDescriptionResponse(text, validIds);
    for (const [id, description] of parsed) out.set(id, description);
  }
  return out;
}

// ---------------------------------------------------------------------------
// generateNodeDescriptions — public entry point with graceful degradation
// ---------------------------------------------------------------------------

export type DescriptionSource = "llm" | "assistant" | "skipped";

export interface GenerateNodeDescriptionsOptions {
  /** Explicit provider. If omitted, auto-detect from env vars. */
  provider?: DirectLlmProvider | string | null;
  /** Assistant mode writes instructions through an injected caller; never auto-detects a direct backend. */
  assistant?: boolean;
  model?: string;
  maxNodes?: number;
  batchSize?: number;
  /** Describe only nodes without a non-empty inline description. */
  onlyMissing?: boolean;
  /** Injectable LLM caller. Pass a mock in tests to avoid network calls. */
  callLlm?: CallLlmFn;
  /** Suppress stderr messages about missing backend / errors. */
  quiet?: boolean;
}

export interface GenerateNodeDescriptionsResult {
  /** Number of nodes that received a description attribute. */
  describedCount: number;
  source: DescriptionSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface PersistNodeDescriptionsResult {
  updatedNodeCount: number;
}

export function persistNodeDescriptionsToGraphJson(
  graphPath: string,
  G: Graph,
): PersistNodeDescriptionsResult {
  const graphJson = JSON.parse(readFileSync(graphPath, "utf-8")) as unknown;
  if (!isRecord(graphJson) || !Array.isArray(graphJson.nodes)) {
    throw new Error("graph.json must contain a nodes array");
  }

  let updatedNodeCount = 0;
  for (const node of graphJson.nodes) {
    if (!isRecord(node) || typeof node.id !== "string" || !G.hasNode(node.id)) continue;
    let changed = false;
    for (const field of NODE_DESCRIPTION_JSON_FIELDS) {
      if (!G.hasNodeAttribute(node.id, field)) continue;
      const next = G.getNodeAttribute(node.id, field) as unknown;
      if (JSON.stringify(node[field]) === JSON.stringify(next)) continue;
      node[field] = next;
      changed = true;
    }
    if (changed) updatedNodeCount += 1;
  }

  if (updatedNodeCount > 0) {
    writeFileSync(graphPath, JSON.stringify(graphJson, null, 2) + "\n", "utf-8");
  }
  return { updatedNodeCount };
}

function nodeHasDescription(G: Graph, nodeId: string): boolean {
  const attrs = G.getNodeAttributes(nodeId) as Record<string, unknown>;
  return safeString(attrs.description) !== null;
}

export function buildNodeDescriptionContextHash(G: Graph, nodeId: string): string {
  const attrs = G.getNodeAttributes(nodeId) as Record<string, unknown>;
  const neighbors = collectNeighbors(G, nodeId, 12);
  return createHash("sha256").update(JSON.stringify({
    id: nodeId,
    label: safeString(attrs.label) ?? nodeId,
    file_type: safeString(attrs.file_type),
    node_type: safeString(attrs.node_type),
    source_file: safeString(attrs.source_file),
    source_location: safeString(attrs.source_location),
    neighbors,
  })).digest("hex");
}

/**
 * Generate descriptions for the graph's nodes and stamp each onto the node's
 * `description` attribute (so `toJson` persists it to graph.json). Resolves a
 * backend, degrades gracefully to a no-op with a warning when none is
 * configured or a call fails, and never throws.
 */
export async function generateNodeDescriptions(
  G: Graph,
  options: GenerateNodeDescriptionsOptions = {},
): Promise<GenerateNodeDescriptionsResult> {
  let provider: DirectLlmProvider | null = null;

  if (options.assistant === true) {
    provider = null;
  } else if (options.provider != null && options.provider !== "") {
    if (isDirectLlmProvider(options.provider)) {
      provider = options.provider;
    } else {
      if (!options.quiet) {
        process.stderr.write(
          `[graphify describe] unknown provider '${options.provider}'; ` +
            `must be one of ${DIRECT_LLM_PROVIDERS.join(", ")}. Skipping descriptions.\n`,
        );
      }
      return { describedCount: 0, source: "skipped" };
    }
  } else {
    provider = detectDescriptionBackend();
  }

  if (!provider && !options.callLlm) {
    if (!options.quiet) {
      process.stderr.write(
        "[graphify describe] no LLM backend configured; skipping node descriptions. " +
          "Set an API key (e.g. ANTHROPIC_API_KEY) or pass --no-description to silence this.\n",
      );
    }
    return { describedCount: 0, source: "skipped" };
  }

  try {
    const targetIds = rankNodes(G).filter((id) => !options.onlyMissing || !nodeHasDescription(G, id));
    const descriptions = await describeNodes(G, {
      // When only a mock callLlm is supplied (tests / assistant runtime), the
      // provider is unused by the injected caller; default to anthropic so the
      // type is satisfied without forcing a real key.
      provider: provider ?? "anthropic",
      ...(options.model ? { model: options.model } : {}),
      ...(options.maxNodes !== undefined ? { maxNodes: options.maxNodes } : {}),
      ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
      targetIds,
      ...(options.callLlm ? { callLlm: options.callLlm } : {}),
    });

    let describedCount = 0;
    const source: DescriptionSource = provider ? "llm" : "assistant";
    for (const [id, description] of descriptions) {
      if (!G.hasNode(id)) continue;
      G.setNodeAttribute(id, "description", description);
      G.setNodeAttribute(id, "description_status", "generated");
      G.setNodeAttribute(id, "description_meta", {
        source,
        prompt_version: NODE_DESCRIPTION_PROMPT_VERSION,
        description_context_hash: buildNodeDescriptionContextHash(G, id),
        provider: provider ?? null,
        model: options.model ?? null,
        updated_at: new Date().toISOString(),
      });
      describedCount += 1;
    }
    return { describedCount, source };
  } catch (err) {
    if (!options.quiet) {
      process.stderr.write(
        `[graphify describe] description generation failed (${
          err instanceof Error ? err.message : String(err)
        }); continuing without descriptions.\n`,
      );
    }
    return { describedCount: 0, source: "skipped" };
  }
}

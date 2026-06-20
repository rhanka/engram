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
 * - NO-KEY DEFAULT — assistant/skill mode: when no API backend is configured
 *   and the user has not forced `--description-mode direct`, graphify emits
 *   per-batch instruction files (`.graphify/description-instructions/`) for the
 *   host assistant (Claude Code, Codex, Gemini CLI…) to fill in. A subsequent
 *   `graphify update` call ingests the completed JSON answers and stamps them
 *   onto graph.json. This is the same two-step pattern as `wiki describe
 *   --mode assistant` (`createAssistantTextJsonClient`); no parallel mechanism.
 * - Graceful degradation: no backend / API error / malformed reply skips
 *   description generation with a clear stderr warning and never throws from
 *   the public entry point `generateNodeDescriptions`. This is what makes
 *   "on by default" safe in CI / no-API-key environments.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import Graph from "graphology";

import {
  DIRECT_LLM_PROVIDERS,
  directProviderCredentialEnv,
  isDirectLlmProvider,
  type DirectLlmProvider,
} from "./llm-execution.js";

// ---------------------------------------------------------------------------
// Assistant-mode instruction files (no API key required)
// ---------------------------------------------------------------------------

/**
 * Sub-directory under `.graphify/` where description instruction files are
 * emitted (one per batch) and where the assistant writes back its JSON answers.
 */
export const DESCRIPTION_INSTRUCTIONS_DIR = "description-instructions";

/** Filename for the per-batch instruction file. */
function descriptionInstructionFile(batchIndex: number): string {
  return `batch-${String(batchIndex).padStart(3, "0")}.md`;
}

/** Filename for the per-batch JSON answer file that the assistant writes. */
function descriptionAnswerFile(batchIndex: number): string {
  return `batch-${String(batchIndex).padStart(3, "0")}.json`;
}

/**
 * Emit one instruction file per batch of node contexts into `instructionDir`.
 * Each file contains the full prompt the host assistant should answer and the
 * path where it must write its JSON answer (relative to the project root so
 * the file is human-readable and relocatable). Returns the list of batch
 * answer paths that have been requested (not yet written by the assistant).
 */
export function emitDescriptionInstructions(
  batches: NodeContext[][],
  instructionDir: string,
): { instructionPaths: string[]; answerPaths: string[] } {
  mkdirSync(instructionDir, { recursive: true });
  const instructionPaths: string[] = [];
  const answerPaths: string[] = [];

  for (const [i, contexts] of batches.entries()) {
    const prompt = buildNodeDescriptionPrompt(contexts);
    const answerPath = join(instructionDir, descriptionAnswerFile(i));
    const instructionPath = join(instructionDir, descriptionInstructionFile(i));

    writeFileSync(
      instructionPath,
      [
        `# Node Description Batch ${i + 1} of ${batches.length}`,
        "",
        "Graphify is running in assistant/skill mode (no API key). You are the host",
        "assistant (Claude Code / Codex / Gemini CLI). Read the prompt below and write",
        "your JSON answer to the answer file.",
        "",
        "## Prompt",
        "",
        prompt,
        "",
        "## Instructions",
        "",
        `Write a single JSON object mapping each node id to a one-sentence description`,
        `to: ${answerPath}`,
        "",
        "Keep each description factual and concise (one sentence). No markdown, no prose",
        "outside the JSON object. It is acceptable to omit a node if context is",
        "insufficient — but include every node you can ground confidently.",
        "",
        "Example answer format:",
        "```json",
        `{`,
        `  "node_id_1": "Resolves the configured ontology profile from graphify.yaml.",`,
        `  "node_id_2": "Colonel James Barclay, an antagonist in The Crooked Man."`,
        `}`,
        "```",
      ].join("\n") + "\n",
      "utf-8",
    );

    instructionPaths.push(instructionPath);
    answerPaths.push(answerPath);
  }

  return { instructionPaths, answerPaths };
}

/**
 * Count description instruction batches that have been emitted (`.md` files)
 * but whose corresponding answer file (`.json`) has not yet been written by
 * the host assistant. Returns 0 when the directory does not exist or all
 * instructions are answered.
 *
 * Used by `checkUpdate` and the rebuild marker logic to determine whether
 * assistant mode left un-answered work pending.
 */
export function countUnansweredDescriptionBatches(instructionDir: string): number {
  if (!existsSync(instructionDir)) return 0;
  let unanswered = 0;
  let files: string[];
  try {
    files = readdirSync(instructionDir);
  } catch {
    return 0;
  }
  const mdFiles = files.filter((f) => f.startsWith("batch-") && f.endsWith(".md")).sort();
  for (const md of mdFiles) {
    const jsonFile = md.replace(/\.md$/, ".json");
    if (!existsSync(join(instructionDir, jsonFile))) {
      unanswered += 1;
    }
  }
  return unanswered;
}

/**
 * Delete all batch instruction files (`batch-*.md` and `batch-*.json`) from
 * `instructionDir`. Called after a completing run (all describable nodes
 * described) or after fully ingesting assistant answers, so stale orphan files
 * cannot cause false-pending signals on subsequent runs.
 *
 * Safe to call when the directory does not exist.
 */
export function cleanDescriptionInstructionDir(instructionDir: string): void {
  if (!existsSync(instructionDir)) return;
  let files: string[];
  try {
    files = readdirSync(instructionDir);
  } catch {
    return;
  }
  for (const f of files) {
    if ((f.startsWith("batch-") && f.endsWith(".md")) ||
        (f.startsWith("batch-") && f.endsWith(".json"))) {
      try { unlinkSync(join(instructionDir, f)); } catch { /* ignore */ }
    }
  }
}

/**
 * Read graph.json at `graphPath` and count how many describable nodes still
 * lack a description. Returns -1 when the file is missing or unreadable
 * (unknown state — callers must NOT treat this as "fully described").
 *
 * A node is describable when it is a code node (has `type === "code"`, or has
 * a `signature`) OR an entity node that has at least one context alias/mention
 * (i.e. has grounding). This mirrors the `isDescribableNode` logic used inside
 * `generateNodeDescriptions`, kept as a lightweight JSON scan to avoid loading
 * the full Graphology graph in `checkUpdate`.
 */
export function countUndescribedInGraph(graphPath: string): number {
  if (!existsSync(graphPath)) return -1;
  try {
    const raw = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes?: Array<{ attributes?: Record<string, unknown> }>;
    };
    const nodes = raw.nodes ?? [];
    let count = 0;
    for (const node of nodes) {
      const a = node.attributes ?? {};
      // Code node: has `type === "code"` or non-empty `signature`
      const isCode =
        a["type"] === "code" ||
        (typeof a["signature"] === "string" && (a["signature"] as string).length > 0);
      // Entity node: has grounding (at least one alias or mention)
      const hasGround =
        (Array.isArray(a["aliases"]) && (a["aliases"] as unknown[]).length > 0) ||
        (Array.isArray(a["mentions"]) && (a["mentions"] as unknown[]).length > 0) ||
        (typeof a["grounding"] === "string" && (a["grounding"] as string).length > 0);
      const isDescribable = isCode || hasGround;
      if (!isDescribable) continue;
      // Has description?
      const desc = a["description"];
      const hasDesc = typeof desc === "string" && (desc as string).trim().length > 0;
      if (!hasDesc) count += 1;
    }
    return count;
  } catch {
    return -1;
  }
}

/**
 * Scan `instructionDir` for completed answer files (JSON written by the
 * assistant) and return a map of node id → description. Silently skips
 * malformed / unreadable files so a partial fill still makes progress.
 */
export function ingestDescriptionAnswers(
  instructionDir: string,
  validIds: Set<string>,
): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(instructionDir)) return out;

  const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gi;
  const answerFiles = readdirSync(instructionDir)
    .filter((f) => f.startsWith("batch-") && f.endsWith(".json"))
    .sort();

  for (const fileName of answerFiles) {
    const filePath = join(instructionDir, fileName);
    try {
      const raw = readFileSync(filePath, "utf-8").replace(FENCE_RE, "").trim();
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!validIds.has(id)) continue;
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed) out.set(id, trimmed);
      }
    } catch {
      /* skip malformed files */
    }
  }

  return out;
}

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

/** Max attempts (1 try + 2 retries) for a transient per-batch LLM failure. */
const MAX_LLM_ATTEMPTS = 3;

/** Base backoff (ms) between retries; grows linearly per attempt. */
const RETRY_BACKOFF_MS = 250;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * True when `err` looks like a transient backend failure worth retrying:
 * HTTP 5xx, rate limiting / 429, common network resets, "fetch failed",
 * "overloaded", or "service unavailable". Matches on the error message so it
 * works across the AI SDK provider error shapes without coupling to any one.
 */
const TRANSIENT_ERROR_RE =
  /\b5\d\d\b|rate.?limit|\b429\b|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|overloaded|service unavailable/i;

export function isTransientBackendError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? `${err.message}${err.cause ? ` ${String((err.cause as { message?: string })?.message ?? err.cause)}` : ""}`
      : String(err);
  return TRANSIENT_ERROR_RE.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Call `callLlm`, retrying on transient backend errors with a small bounded
 * linear backoff (≤ MAX_LLM_ATTEMPTS attempts). Non-transient errors and the
 * final transient error are rethrown for the caller to handle.
 */
async function callLlmWithRetry(
  callLlm: CallLlmFn,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_LLM_ATTEMPTS; attempt += 1) {
    try {
      return await callLlm(prompt, maxTokens);
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_LLM_ATTEMPTS || !isTransientBackendError(err)) throw err;
      await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }
  throw lastErr;
}

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

/** True when the node already carries a non-empty `description` attribute. */
function hasDescription(attrs: Record<string, unknown>): boolean {
  return safeString(attrs.description) !== null;
}

/**
 * Quick structural check for whether a node has citation / evidence grounding,
 * without building the full (truncating/deduping) citation context. Used by the
 * coverage report to count "describable" entity nodes cheaply.
 */
function hasGrounding(attrs: Record<string, unknown>): boolean {
  const citations = attrs.citations;
  if (Array.isArray(citations) && citations.length > 0) return true;
  const evidenceRefs = attrs.evidence_refs;
  return Array.isArray(evidenceRefs) && evidenceRefs.length > 0;
}

/**
 * A node is "describable" when the backend has enough to ground a description:
 * it is a code symbol, or it is an entity node carrying citations / evidence.
 * This is the denominator for the coverage report.
 */
function isDescribableNode(attrs: Record<string, unknown>): boolean {
  return isCodeNode(attrs) || hasGrounding(attrs);
}

/** Snippet length cap for an individual citation/evidence string. */
const CITATION_MAXLEN = 120;

/**
 * Code-default fallback for the per-node prompt citation cap. Used only when no
 * cap is threaded through (kept at 3, the historic value). SPEC_CITATIONS pass
 * 1: the resolved default when a caller does not specify is 10
 * (RESOLVED_DEFAULT_CITATION_CAP), set at the resolution boundary below.
 */
const MAX_CITATIONS = 3;

/**
 * Tunable per-node prompt citation cap. A number bounds the snippets injected
 * per node; "all" injects every citation. Threaded from
 * GenerateNodeDescriptionsOptions / DescribeNodesOptions.
 */
export type CitationCap = number | "all";

/** Resolved default cap for this pass when a caller does not specify one. */
export const RESOLVED_DEFAULT_CITATION_CAP = 10;

/**
 * Resolve a (possibly undefined) cap option to a concrete numeric limit.
 * "all" → Infinity; undefined → RESOLVED_DEFAULT_CITATION_CAP; a finite number
 * → itself (clamped to >= 0).
 */
function resolveCitationCap(cap: CitationCap | undefined): number {
  if (cap === "all") return Number.POSITIVE_INFINITY;
  if (typeof cap === "number" && Number.isFinite(cap)) return Math.max(0, cap);
  return RESOLVED_DEFAULT_CITATION_CAP;
}

export interface NodeContext {
  id: string;
  label: string;
  isCode: boolean;
  sourceFile: string | null;
  sourceLocation: string | null;
  nodeType: string | null;
  degree: number;
  neighbors: string[];
  /**
   * Short grounding snippets pulled from the node's `citations` /
   * `evidence_refs` attributes (entity nodes from the mystery / ontology
   * graph). Empty for code symbols or unsupported nodes. A node WITH grounding
   * here must be describable (Phase 1 reliability guarantee).
   */
  citations: string[];
}

/**
 * Collect short citation / evidence snippets from an entity node's attributes.
 * Reads `citations` (array of OntologyCitation-shaped objects: source_file,
 * quote, page, section, …) and `evidence_refs` (string[]). Returns a small,
 * deduped, truncated list suitable for direct injection into a prompt line.
 */
function collectCitationContext(
  attrs: Record<string, unknown>,
  cap: number = MAX_CITATIONS,
  citationsOverride?: unknown[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    const snippet = truncate(value, CITATION_MAXLEN);
    const key = snippet.toLowerCase();
    if (snippet && !seen.has(key) && out.length < cap) {
      seen.add(key);
      out.push(snippet);
    }
  };

  // F4: on the describe-on-existing-graph path the node's in-memory `citations`
  // is already K-trimmed; a caller that loaded the fuller per-node set from
  // citations.json passes it here so `--citation-cap all/50` can ground on more
  // than K distinct sources. Falls back to the inline attr otherwise.
  const citations = citationsOverride ?? attrs.citations;
  if (Array.isArray(citations)) {
    for (const entry of citations) {
      if (out.length >= cap) break;
      if (typeof entry === "string") {
        push(entry);
        continue;
      }
      if (entry && typeof entry === "object") {
        const rec = entry as Record<string, unknown>;
        // Prefer a human-readable quote/text; fall back to a source locator.
        const quote = safeString(rec.quote) ?? safeString(rec.text) ?? safeString(rec.snippet);
        const locatorParts = [
          safeString(rec.source_file) ?? safeString(rec.source_url),
          rec.page != null ? `p.${String(rec.page)}` : null,
          safeString(rec.section),
        ].filter((p): p is string => Boolean(p));
        if (quote) {
          push(locatorParts.length > 0 ? `${quote} (${locatorParts.join(", ")})` : quote);
        } else if (locatorParts.length > 0) {
          push(locatorParts.join(", "));
        }
      }
    }
  }

  const evidenceRefs = attrs.evidence_refs;
  if (Array.isArray(evidenceRefs)) {
    for (const ref of evidenceRefs) {
      if (out.length >= cap) break;
      const value = safeString(ref);
      if (value) push(value);
    }
  }

  return out;
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

export interface CollectNodeContextOptions {
  /**
   * Per-node prompt citation cap. A number bounds the snippets; "all" injects
   * every citation. Unspecified resolves to RESOLVED_DEFAULT_CITATION_CAP (10).
   */
  citationCap?: CitationCap;
  /**
   * F4: fuller per-node citation sets (keyed by node id), loaded from
   * citations.json on the describe-on-existing-graph path. When an entry is
   * present AND longer than the node's K-trimmed inline `citations`, it is used
   * for prompt grounding so `--citation-cap all/50` can reach beyond K distinct
   * sources. A missing/empty/smaller entry falls back to the inline set (never
   * shrinks).
   */
  citationsByNode?: Record<string, unknown[]>;
}

export function collectNodeContext(
  G: Graph,
  nodeId: string,
  options: CollectNodeContextOptions = {},
): NodeContext {
  const attrs = G.getNodeAttributes(nodeId) as Record<string, unknown>;
  const isCode = isCodeNode(attrs);
  const cap = resolveCitationCap(options.citationCap);
  // F4: prefer the fuller sidecar set only when it is genuinely richer than the
  // K-trimmed inline — otherwise keep the inline so we never shrink grounding.
  const inlineLen = Array.isArray(attrs.citations) ? attrs.citations.length : 0;
  const override = options.citationsByNode?.[nodeId];
  const citationsOverride =
    Array.isArray(override) && override.length > inlineLen ? override : undefined;
  return {
    id: nodeId,
    label: truncate(safeString(attrs.label) ?? nodeId),
    isCode,
    sourceFile: safeString(attrs.source_file),
    sourceLocation: safeString(attrs.source_location),
    nodeType: safeString(attrs.node_type),
    degree: G.degree(nodeId),
    neighbors: collectNeighbors(G, nodeId, 6),
    // Citation grounding only matters for entity nodes; skip the work for code.
    citations: isCode ? [] : collectCitationContext(attrs, cap, citationsOverride),
  };
}

/**
 * Rank nodes for description: highest-degree first (the nodes most worth
 * describing), id as a stable tiebreak. Deterministic so reruns are stable.
 * When `onlyMissing` is set, nodes that already carry a non-empty `description`
 * attribute are skipped — this powers `update --fill-missing` (idempotent
 * re-run that only fills the gaps).
 */
function rankNodes(G: Graph, onlyMissing = false): string[] {
  const ids: string[] = [];
  G.forEachNode((nodeId, attrs) => {
    if (onlyMissing && hasDescription(attrs as Record<string, unknown>)) return;
    ids.push(nodeId);
  });
  return ids.sort((a, b) => {
    const degreeDelta = G.degree(b) - G.degree(a);
    return degreeDelta !== 0 ? degreeDelta : a.localeCompare(b);
  });
}

/** True when the batch contains at least one non-code (entity) node. */
function hasEntityNode(contexts: NodeContext[]): boolean {
  return contexts.some((ctx) => !ctx.isCode);
}

/** True when the batch contains at least one code-symbol node. */
function hasCodeNode(contexts: NodeContext[]): boolean {
  return contexts.some((ctx) => ctx.isCode);
}

/** Build the JSON-line context for one node inside a batch prompt. */
function nodePromptLine(ctx: NodeContext): string {
  const parts: string[] = [`"${ctx.id}": ${JSON.stringify(ctx.label)}`];
  if (ctx.isCode) {
    parts.push("kind=code-symbol");
  } else {
    // Entity nodes: lead with their declared type so the model anchors the
    // description on what the entity IS, not just its label.
    parts.push(`kind=${ctx.nodeType ?? "entity"}`);
  }
  if (ctx.sourceFile) {
    parts.push(`source=${ctx.sourceFile}${ctx.sourceLocation ? `:${ctx.sourceLocation}` : ""}`);
  }
  if (ctx.neighbors.length > 0) {
    parts.push(`neighbors=[${ctx.neighbors.join(", ")}]`);
  }
  // Citation / evidence grounding for entity nodes (empty for code symbols).
  if (ctx.citations.length > 0) {
    parts.push(`citations=[${ctx.citations.map((c) => JSON.stringify(c)).join(", ")}]`);
  }
  return `- ${parts.join(" | ")}`;
}

export function buildNodeDescriptionPrompt(contexts: NodeContext[]): string {
  // A batch may be all code, all entity, or mixed. We emit guidance for both
  // kinds and let each prompt line's `kind=` marker steer the model per node.
  // Keeping a single batched call preserves the on-by-default cost bound.
  const header = ["You are documenting nodes in a knowledge graph."];
  header.push(
    "For each entry below, write ONE concise factual plain-language sentence",
    "describing what it is or does. Use only the provided context.",
  );
  if (hasCodeNode(contexts)) {
    header.push(
      "For a code symbol (kind=code-symbol — a function, class, or constant),",
      "describe what the function/symbol does based on its name, source location",
      "and neighbors — e.g. \"Resolves the configured ontology profile from graphify.yaml.\".",
    );
  }
  if (hasEntityNode(contexts)) {
    header.push(
      "For an entity node (any other kind — e.g. a person, place, event, object),",
      "describe what the entity is and its role, grounded in its type, its",
      "relations (neighbors) and the provided citations/evidence — e.g.",
      "\"Lady Carfax, a wealthy heiress who disappears en route to Lausanne.\".",
      "Ground entity descriptions in the citations/evidence when present; do not",
      "speculate beyond the context, so a node with no supporting context may be",
      "left out of the reply.",
    );
  }
  header.push(
    "No marketing language.",
    "Respond ONLY with a JSON object mapping each node id (as a string) to its",
    "one-sentence description — no prose, no markdown fences.",
    "",
  );
  return [...header, ...contexts.map(nodePromptLine)].join("\n");
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
  callLlm?: CallLlmFn;
  /** Only rank/describe nodes whose `description` attr is empty/absent. */
  onlyMissing?: boolean;
  /**
   * Per-node prompt citation cap (SPEC_CITATIONS). A number bounds the citation
   * snippets injected per node; "all" injects every citation. Unspecified
   * resolves to RESOLVED_DEFAULT_CITATION_CAP (10).
   */
  citationCap?: CitationCap;
  /**
   * F4: fuller per-node citation sets (from citations.json) keyed by node id.
   * On the describe-on-existing-graph path the inline `citations` is K-trimmed,
   * so the caller passes the fuller set here to ground beyond K.
   */
  citationsByNode?: Record<string, unknown[]>;
}

/**
 * Ask `provider` to describe the highest-degree nodes in batches and return a
 * `Map<nodeId, description>`. Transient backend errors are retried per batch
 * with a bounded backoff. Raises on a non-transient API / parse failure for a
 * batch — callers that want graceful degradation should use
 * `generateNodeDescriptions`.
 */
export async function describeNodes(
  G: Graph,
  options: DescribeNodesOptions,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const ranked = rankNodes(G, options.onlyMissing === true);
  const targetIds = ranked.slice(0, maxNodes > 0 ? maxNodes : ranked.length);
  if (targetIds.length === 0) return out;

  const callLlm = options.callLlm ?? (await makeDefaultCallLlm(options.provider, options.model));

  for (const batch of chunk(targetIds, batchSize)) {
    const contexts = batch.map((id) =>
      collectNodeContext(G, id, {
        citationCap: options.citationCap,
        ...(options.citationsByNode ? { citationsByNode: options.citationsByNode } : {}),
      }),
    );
    const prompt = buildNodeDescriptionPrompt(contexts);
    const validIds = new Set(batch);
    const maxTokens = Math.min(120 + 48 * batch.length, 8192);
    const text = await callLlmWithRetry(callLlm, prompt, maxTokens);
    const parsed = parseDescriptionResponse(text, validIds);
    for (const [id, description] of parsed) out.set(id, description);
  }
  return out;
}

// ---------------------------------------------------------------------------
// generateNodeDescriptions — public entry point with graceful degradation
// ---------------------------------------------------------------------------

export type DescriptionSource = "llm" | "assistant" | "skipped";

/**
 * Execution mode for descriptions:
 * - "assistant": emit instruction files for the host assistant; ingest on next run.
 *   This is the DEFAULT when no API backend is configured.
 * - "direct": call the LLM API directly (requires an API key).
 * When `mode` is not explicitly set: "direct" if a backend is detected,
 * "assistant" otherwise.
 */
export type DescriptionMode = "assistant" | "direct";

export interface GenerateNodeDescriptionsOptions {
  /** Explicit provider. If omitted, auto-detect from env vars. */
  provider?: DirectLlmProvider | string | null;
  model?: string;
  maxNodes?: number;
  batchSize?: number;
  /** Injectable LLM caller. Pass a mock in tests to avoid network calls. */
  callLlm?: CallLlmFn;
  /** Suppress stderr messages about missing backend / errors. */
  quiet?: boolean;
  /**
   * Only (re)describe nodes whose `description` attr is empty/absent. Powers
   * `graphify update --fill-missing` — an idempotent re-run that fills gaps
   * without re-spending tokens on already-described nodes.
   */
  onlyMissing?: boolean;
  /**
   * Execution mode: "assistant" (default when no key) or "direct" (API key).
   * When omitted, the mode is auto-selected: "direct" if a backend is detected
   * or `callLlm` is injected, "assistant" otherwise.
   */
  mode?: DescriptionMode;
  /**
   * Directory where assistant-mode instruction files are emitted and ingested.
   * Defaults to `.graphify/description-instructions/` relative to the graph
   * directory (callers that know the project root pass it here).
   */
  instructionDir?: string;
  /**
   * Per-node prompt citation cap (SPEC_CITATIONS). A number bounds the citation
   * snippets injected per node into the description prompt; "all" injects every
   * citation. Unspecified resolves to RESOLVED_DEFAULT_CITATION_CAP (10).
   * Flows on BOTH the direct (API) path and the no-key assistant path.
   */
  citationCap?: CitationCap;
  /**
   * F4: fuller per-node citation sets (from citations.json) keyed by node id.
   * Supplied by the describe-on-existing-graph CLI path so `--citation-cap
   * all/50` can ground on more than the K-trimmed inline `citations`. Flows on
   * BOTH the direct (API) path and the no-key assistant path.
   */
  citationsByNode?: Record<string, unknown[]>;
}

/**
 * Why descriptions were skipped, for a one-line coverage summary. Mutually
 * informative counters (a single run lands in exactly one terminal reason).
 */
export interface DescriptionCoverageReasons {
  /** No LLM backend configured (and no injected callLlm). */
  noBackend: number;
  /** Backend replied but produced no usable description for a describable node. */
  emptyReply: number;
  /** Backend call/parse failed (after retries). */
  error: number;
  /** Caller opted out (e.g. unknown provider). */
  optedOut: number;
}

/**
 * Coverage report for a description run. `describable` is the count of nodes
 * worth describing (code symbols OR entity nodes with citations/evidence);
 * `described` is how many of the whole graph ended up with a `description`;
 * `skipped` is `describable - described` (never negative);
 * `ungrounded` is entity nodes excluded because they carry no citations/evidence/code
 * grounding — they are NOT hallucinated and NOT in the describable denominator.
 */
export interface DescriptionCoverage {
  describable: number;
  described: number;
  skipped: number;
  /** Entity nodes with no citation/evidence/code grounding (omitted from
   * description generation per the anti-hallucination policy). Informational
   * only — no description is ever generated for these nodes. */
  ungrounded: number;
  reasons: DescriptionCoverageReasons;
}

export interface GenerateNodeDescriptionsResult {
  /** Number of nodes that received a description attribute in THIS run. */
  describedCount: number;
  source: DescriptionSource;
  /** Coverage report (see `DescriptionCoverage`). */
  coverage: DescriptionCoverage;
}

function zeroReasons(): DescriptionCoverageReasons {
  return { noBackend: 0, emptyReply: 0, error: 0, optedOut: 0 };
}

/**
 * Count nodes that are describable and, of those, how many now have a description.
 * Also counts entity nodes excluded from generation because they lack grounding
 * (anti-hallucination policy — these are NOT silently ignored, just ungrounded).
 */
function countCoverage(
  G: Graph,
): { describable: number; describedDescribable: number; ungrounded: number } {
  let describable = 0;
  let describedDescribable = 0;
  let ungrounded = 0;
  G.forEachNode((_id, attrs) => {
    const a = attrs as Record<string, unknown>;
    if (isDescribableNode(a)) {
      describable += 1;
      if (hasDescription(a)) describedDescribable += 1;
    } else if (!isCodeNode(a)) {
      // Non-code node (entity) that is NOT describable = has no grounding.
      ungrounded += 1;
    }
  });
  return { describable, describedDescribable, ungrounded };
}

/**
 * Emit a one-line coverage summary to stderr, plus a LOUD warning when a
 * backend IS configured yet coverage is low (< 50% of describable nodes).
 * Never silently ships 0/N.
 */
function reportCoverage(
  coverage: DescriptionCoverage,
  backendConfigured: boolean,
  quiet: boolean | undefined,
): void {
  if (quiet) return;
  const { describable, described, ungrounded, reasons } = coverage;
  process.stderr.write(
    `[graphify describe] coverage: ${described}/${describable} describable node(s) described ` +
      `(skipped ${coverage.skipped}; reasons noBackend=${reasons.noBackend} ` +
      `emptyReply=${reasons.emptyReply} error=${reasons.error} optedOut=${reasons.optedOut}).\n`,
  );
  if (ungrounded > 0) {
    process.stderr.write(
      `[graphify describe] ${ungrounded} entity node(s) have no grounding (no citations/evidence) — ` +
        "no description generated (anti-hallucination policy).\n",
    );
  }
  if (backendConfigured && describable > 0 && described < 0.5 * describable) {
    process.stderr.write(
      `[graphify describe] WARNING low coverage: only ${described}/${describable} describable node(s) ` +
        "got a description with a backend configured. Re-run with `graphify update --fill-missing` " +
        "or check your LLM backend / rate limits.\n",
    );
  }
}

/**
 * Generate descriptions for the graph's nodes and stamp each onto the node's
 * `description` attribute (so `toJson` persists it to graph.json). Resolves a
 * backend, degrades gracefully to a no-op with a warning when none is
 * configured or a call fails, never throws, and always returns a coverage
 * report (printed to stderr unless `quiet`).
 *
 * DEFAULT BEHAVIOUR (no API key):
 *   - Emits per-batch instruction files to `instructionDir` for the host
 *     assistant (Claude Code, Codex, Gemini CLI…) to fill in.
 *   - On a subsequent run, ingests completed JSON answer files and stamps
 *     descriptions directly onto graph.json.
 *   - Source is reported as "assistant" (not "skipped") in both cases.
 *
 * WITH AN API KEY (or injected callLlm):
 *   - Calls the backend directly (legacy "direct" path, unchanged).
 *   - Source is "llm".
 */
export async function generateNodeDescriptions(
  G: Graph,
  options: GenerateNodeDescriptionsOptions = {},
): Promise<GenerateNodeDescriptionsResult> {
  let provider: DirectLlmProvider | null = null;
  const backendConfigured = (): boolean => provider !== null || Boolean(options.callLlm);

  const skip = (
    source: DescriptionSource,
    reasonKey: keyof DescriptionCoverageReasons,
  ): GenerateNodeDescriptionsResult => {
    const { describable, describedDescribable, ungrounded } = countCoverage(G);
    const reasons = zeroReasons();
    // Count every describable node that still lacks a description under the
    // terminal reason for this run.
    reasons[reasonKey] = Math.max(0, describable - describedDescribable);
    const coverage: DescriptionCoverage = {
      describable,
      described: describedDescribable,
      skipped: Math.max(0, describable - describedDescribable),
      ungrounded,
      reasons,
    };
    reportCoverage(coverage, backendConfigured(), options.quiet);
    return { describedCount: 0, source, coverage };
  };

  if (options.provider != null && options.provider !== "") {
    if (isDirectLlmProvider(options.provider)) {
      provider = options.provider;
    } else {
      if (!options.quiet) {
        process.stderr.write(
          `[graphify describe] unknown provider '${options.provider}'; ` +
            `must be one of ${DIRECT_LLM_PROVIDERS.join(", ")}. Skipping descriptions.\n`,
        );
      }
      return skip("skipped", "optedOut");
    }
  } else {
    provider = detectDescriptionBackend();
  }

  // ---------------------------------------------------------------------------
  // Resolve execution mode: direct (API key) or assistant (skill/CLI, no key).
  // ---------------------------------------------------------------------------
  const resolvedMode: DescriptionMode =
    options.mode === "direct"
      ? "direct"
      : options.mode === "assistant"
        ? "assistant"
        : // Auto (SPEC_GRAPHIFY § Enrichment Stages): resolve to ASSISTANT/emit
          // unless `--description-mode direct` is EXPLICITLY requested. The mere
          // presence of a detected backend / API key (incl. a discovered `.env`)
          // must NOT silently switch to direct. An INJECTED `callLlm` is a
          // programmatic direct opt-in (tests / embedders) and still resolves
          // to direct — a detected `provider` alone does not.
          options.callLlm
          ? "direct"
          : "assistant";

  // ---------------------------------------------------------------------------
  // ASSISTANT MODE — no API key, emit instruction files + ingest answers.
  // ---------------------------------------------------------------------------
  if (resolvedMode === "assistant" && !options.callLlm) {
    const instructionDir = options.instructionDir ?? join(".graphify", DESCRIPTION_INSTRUCTIONS_DIR);

    // Step 1: try to ingest already-completed answer files first.
    const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
    const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
    const ranked = rankNodes(G, options.onlyMissing === true);
    const targetIds = ranked.slice(0, maxNodes > 0 ? maxNodes : ranked.length);
    const validIds = new Set(targetIds);

    const ingested = ingestDescriptionAnswers(instructionDir, validIds);

    if (ingested.size > 0) {
      // Ingest path: apply descriptions from completed answer files.
      let describedCount = 0;
      for (const [id, description] of ingested) {
        if (!G.hasNode(id)) continue;
        G.setNodeAttribute(id, "description", description);
        describedCount += 1;
      }

      const { describable, describedDescribable, ungrounded } = countCoverage(G);
      const reasons = zeroReasons();
      reasons.emptyReply = Math.max(0, describable - describedDescribable);
      const coverage: DescriptionCoverage = {
        describable,
        described: describedDescribable,
        skipped: Math.max(0, describable - describedDescribable),
        ungrounded,
        reasons,
      };
      if (!options.quiet) {
        process.stderr.write(
          `[graphify describe] assistant mode: ingested ${describedCount} description(s) ` +
            `from ${instructionDir}\n`,
        );
      }
      reportCoverage(coverage, false, options.quiet);
      // Lifecycle: delete the consumed instruction+answer files so they cannot
      // cause a false-pending signal on the next run.
      cleanDescriptionInstructionDir(instructionDir);
      return { describedCount, source: "assistant", coverage };
    }

    // Step 2: No answer files yet — emit instruction files for the assistant.
    if (targetIds.length === 0) {
      return skip("assistant", "noBackend");
    }
    const batches = chunk(
      targetIds.map((id) =>
        collectNodeContext(G, id, {
          citationCap: options.citationCap,
          ...(options.citationsByNode ? { citationsByNode: options.citationsByNode } : {}),
        }),
      ),
      batchSize,
    );
    const { instructionPaths, answerPaths } = emitDescriptionInstructions(
      batches,
      instructionDir,
    );

    if (!options.quiet) {
      process.stderr.write(
        `[graphify describe] assistant/skill mode: emitted ${instructionPaths.length} instruction file(s) to ${instructionDir}\n` +
          `  Fill each batch-NNN.json answer file, then re-run \`graphify update\` to ingest.\n` +
          `  Answer paths:\n` +
          answerPaths.map((p) => `    ${p}`).join("\n") + "\n",
      );
    }

    const { describable, describedDescribable, ungrounded } = countCoverage(G);
    const reasons = zeroReasons();
    // All describable nodes are pending assistant answers.
    reasons.noBackend = Math.max(0, describable - describedDescribable);
    const coverage: DescriptionCoverage = {
      describable,
      described: describedDescribable,
      skipped: Math.max(0, describable - describedDescribable),
      ungrounded,
      reasons,
    };
    return { describedCount: 0, source: "assistant", coverage };
  }

  // ---------------------------------------------------------------------------
  // DIRECT MODE — API key or injected callLlm.
  // ---------------------------------------------------------------------------
  if (!provider && !options.callLlm) {
    // Should not reach here in normal flow (assistant mode handles the no-key
    // case), but guard defensively for forced `--description-mode direct`
    // without a configured backend.
    if (!options.quiet) {
      process.stderr.write(
        "[graphify describe] --description-mode direct requires an API key " +
          `(e.g. ANTHROPIC_API_KEY). Skipping descriptions.\n`,
      );
    }
    return skip("skipped", "noBackend");
  }

  try {
    const descriptions = await describeNodes(G, {
      // When only a mock callLlm is supplied (tests / assistant runtime), the
      // provider is unused by the injected caller; default to anthropic so the
      // type is satisfied without forcing a real key.
      provider: provider ?? "anthropic",
      ...(options.model ? { model: options.model } : {}),
      ...(options.maxNodes !== undefined ? { maxNodes: options.maxNodes } : {}),
      ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
      ...(options.callLlm ? { callLlm: options.callLlm } : {}),
      ...(options.onlyMissing !== undefined ? { onlyMissing: options.onlyMissing } : {}),
      ...(options.citationCap !== undefined ? { citationCap: options.citationCap } : {}),
      ...(options.citationsByNode ? { citationsByNode: options.citationsByNode } : {}),
    });

    let describedCount = 0;
    for (const [id, description] of descriptions) {
      if (!G.hasNode(id)) continue;
      G.setNodeAttribute(id, "description", description);
      describedCount += 1;
    }

    const { describable, describedDescribable, ungrounded } = countCoverage(G);
    const reasons = zeroReasons();
    // Any describable node still missing a description after a backend ran got
    // an empty/unusable reply (parse miss, model left it out, etc.).
    reasons.emptyReply = Math.max(0, describable - describedDescribable);
    const coverage: DescriptionCoverage = {
      describable,
      described: describedDescribable,
      skipped: Math.max(0, describable - describedDescribable),
      ungrounded,
      reasons,
    };
    reportCoverage(coverage, backendConfigured(), options.quiet);
    return { describedCount, source: provider ? "llm" : "assistant", coverage };
  } catch (err) {
    if (!options.quiet) {
      process.stderr.write(
        `[graphify describe] description generation failed (${
          err instanceof Error ? err.message : String(err)
        }); continuing without descriptions.\n`,
      );
    }
    return skip("skipped", "error");
  }
}

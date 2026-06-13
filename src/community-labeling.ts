/**
 * LLM-backed community naming for the standalone CLI (upstream c8b329d / #1097).
 *
 * When graphify runs inside an orchestrating agent (Claude Code / Gemini CLI), the
 * agent names communities itself per skill.md Step 5 — it reads the analysis file
 * and writes 2-5 word names with its own reasoning, no API call. When graphify is
 * run as a bare CLI (`graphify cluster-only .`), there is no agent to do that step,
 * so community labels stay "Community 0/1/2..." unless this module is invoked.
 *
 * This module fills that gap: given the graph and its communities, it asks the
 * configured backend to name them in ONE batched LLM call, then returns a complete
 * `Map<number, string>` (placeholders for anything the backend didn't name).
 *
 * Key design choices vs. upstream Python:
 * - Reuses `DIRECT_LLM_PROVIDERS` / `directProviderCredentialEnv` /
 *   `isDirectLlmProvider` from `llm-execution.ts` — no new LLM wiring.
 * - The public `labelCommunities` function accepts an injectable `callLlm`
 *   function so tests can mock the network with zero real HTTP calls.
 * - Auto-detect walks `DIRECT_LLM_PROVIDERS` and returns the first whose
 *   credential env var is present; mirrors upstream `detect_backend()`.
 * - NO-KEY DEFAULT — assistant/skill mode: when no API backend is configured,
 *   `generateCommunityLabels` emits one instruction file to `instructionDir`
 *   for the host assistant to fill, and ingests the answer on the next run.
 *   This is the same two-step pattern as `wiki describe --mode assistant`
 *   (`createAssistantTextJsonClient`); no parallel mechanism.
 * - Graceful degradation: any error (no backend, API error, malformed reply)
 *   falls back to "Community N" placeholders. Never throws from the public
 *   entry point `generateCommunityLabels`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import Graph from "graphology";

import {
  DIRECT_LLM_PROVIDERS,
  directProviderCredentialEnv,
  isDirectLlmProvider,
  type DirectLlmProvider,
} from "./llm-execution.js";
import type { GodNodeEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Assistant-mode instruction files (no API key required)
// ---------------------------------------------------------------------------

/**
 * Sub-directory under `.graphify/` where the community-label instruction file
 * is emitted and where the assistant writes back its JSON answer.
 */
export const LABEL_INSTRUCTIONS_DIR = "label-instructions";

/** Filename for the community-labeling instruction file. */
export const LABEL_INSTRUCTION_FILE = "communities.md";

/** Filename for the JSON answer file that the assistant writes. */
export const LABEL_ANSWER_FILE = "communities.json";

/**
 * Emit one instruction file listing all communities for the host assistant to
 * name. The assistant writes its `{"<cid>": "<2-5 word name>"}` answer to
 * `answerPath`. Returns the instruction and answer paths.
 */
export function emitLabelInstructions(
  promptLines: string[],
  labeledCids: number[],
  instructionDir: string,
): { instructionPath: string; answerPath: string } {
  mkdirSync(instructionDir, { recursive: true });
  const instructionPath = join(instructionDir, LABEL_INSTRUCTION_FILE);
  const answerPath = join(instructionDir, LABEL_ANSWER_FILE);

  writeFileSync(
    instructionPath,
    [
      "# Community Labeling",
      "",
      "Graphify is running in assistant/skill mode (no API key). You are the host",
      "assistant (Claude Code / Codex / Gemini CLI). Read the community listing below",
      "and write 2-5 word plain-language names for each.",
      "",
      "## Communities",
      "",
      ...promptLines,
      "",
      "## Instructions",
      "",
      "Write a single JSON object mapping each community id (as a string) to its",
      `2-5 word name to: ${answerPath}`,
      "",
      "Example:",
      "```json",
      `{${labeledCids.slice(0, 3).map((cid) => `\n  "${cid}": "Authentication Flow"`).join(",")}\n}`,
      "```",
      "",
      "Then re-run `graphify update` (or `graphify label`) to ingest the names.",
    ].join("\n") + "\n",
    "utf-8",
  );

  return { instructionPath, answerPath };
}

/**
 * Returns true when a community-label instruction file has been emitted
 * (`communities.md`) but the assistant has not yet written its answer
 * (`communities.json`). Used by `checkUpdate` and the rebuild marker logic
 * to detect pending assistant work.
 */
export function hasUnansweredLabelInstructions(instructionDir: string): boolean {
  const instructionPath = join(instructionDir, LABEL_INSTRUCTION_FILE);
  const answerPath = join(instructionDir, LABEL_ANSWER_FILE);
  return existsSync(instructionPath) && !existsSync(answerPath);
}

/**
 * Try to read the completed answer file written by the assistant. Returns a
 * partial map (cids with valid names); silently returns empty map if the file
 * is missing or malformed.
 */
export function ingestLabelAnswer(
  instructionDir: string,
  labeledCids: number[],
): Map<number, string> {
  const answerPath = join(instructionDir, LABEL_ANSWER_FILE);
  if (!existsSync(answerPath)) return new Map();
  const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gi;
  try {
    const raw = readFileSync(answerPath, "utf-8").replace(FENCE_RE, "").trim();
    return parseLabelResponse(raw, labeledCids);
  } catch {
    return new Map();
  }
}

/** Maximum communities sent to the LLM in one batch (tail stays placeholder). */
const MAX_COMMUNITIES = 200;

/** Node labels sampled per community for the prompt (god nodes first). */
const TOP_K = 12;

/** Truncate individual node labels to keep the prompt compact. */
const LABEL_MAXLEN = 60;

/** Strip markdown fences that some models wrap JSON in. */
const FENCE_RE = /^\s*```(?:json)?\s*|\s*```\s*$/gi;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function placeholderLabels(communities: Map<number, string[]>): Map<number, string> {
  const out = new Map<number, string>();
  for (const cid of communities.keys()) out.set(cid, `Community ${cid}`);
  return out;
}

/**
 * Build one prompt line per community (largest first), sampling up to `topK`
 * representative node labels (god nodes first). Returns the prompt lines and
 * the list of cids that appear in them (skips empty communities).
 */
export function buildLabelingPromptLines(
  G: Graph,
  communities: Map<number, string[]>,
  gods: GodNodeEntry[],
  maxCommunities: number = MAX_COMMUNITIES,
  topK: number = TOP_K,
): { lines: string[]; labeledCids: number[] } {
  const godSet = new Set(gods.map((g) => g.id));
  const sorted = [...communities.entries()].sort((a, b) => b[1].length - a[1].length);

  const lines: string[] = [];
  const labeledCids: number[] = [];

  for (const [cid, members] of sorted.slice(0, maxCommunities)) {
    // God nodes first for best signal in the prompt.
    const ranked = [
      ...members.filter((m) => godSet.has(m)),
      ...members.filter((m) => !godSet.has(m)),
    ];

    const names: string[] = [];
    const seen = new Set<string>();
    for (const nodeId of ranked) {
      const raw = G.hasNode(nodeId)
        ? String(G.getNodeAttribute(nodeId, "label") ?? nodeId)
        : String(nodeId);
      const label = raw.trim().replace(/^\(|\)$/g, "").slice(0, LABEL_MAXLEN);
      const lower = label.toLowerCase();
      if (label && !seen.has(lower)) {
        seen.add(lower);
        names.push(label);
      }
      if (names.length >= topK) break;
    }

    if (names.length > 0) {
      lines.push(`Community ${cid}: ${names.join(", ")}`);
      labeledCids.push(cid);
    }
  }

  return { lines, labeledCids };
}

/**
 * Parse the LLM's `{"<cid>": "<name>"}` reply.
 * Returns a partial map; cids not in `labeledCids` or with empty names are ignored.
 */
export function parseLabelResponse(text: string, labeledCids: number[]): Map<number, string> {
  let cleaned = text.trim().replace(FENCE_RE, "");
  // If the model wrapped the object in prose, grab the outermost {…}.
  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
  }
  const data: unknown = JSON.parse(cleaned);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("label response is not a JSON object");
  }
  const record = data as Record<string, unknown>;
  const out = new Map<number, string>();
  for (const cid of labeledCids) {
    const name = record[String(cid)];
    if (typeof name === "string" && name.trim()) {
      out.set(cid, name.trim());
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auto-detect
// ---------------------------------------------------------------------------

/**
 * Return the first configured provider whose credential env var is present.
 * Mirrors upstream `detect_backend()`. Returns null when nothing is configured.
 * ollama is excluded from auto-detect (no required env var → false positive).
 */
export function detectLabelingBackend(): DirectLlmProvider | null {
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
// Core labeling call — injectable callLlm for testability
// ---------------------------------------------------------------------------

/**
 * A function that sends `prompt` to an LLM and returns the raw text response.
 * The default implementation uses the AI SDK (same as `createDirectTextJsonClient`).
 */
export type CallLlmFn = (prompt: string, maxTokens: number) => Promise<string>;

/**
 * Build the default `callLlm` for a given provider/model using the same AI SDK
 * path as `createDirectTextJsonClient`. Lazy-imports avoid loading heavy SDKs
 * when the caller never calls LLM (no-backend path).
 */
async function makeDefaultCallLlm(
  provider: DirectLlmProvider,
  model?: string,
): Promise<CallLlmFn> {
  const { generateText } = await import("ai");

  async function resolveModel(): Promise<unknown> {
    const { defaultDirectLlmModel } = await import("./llm-execution.js");
    const resolvedModel = model?.trim() || defaultDirectLlmModel(provider);
    switch (provider) {
      case "anthropic": {
        const { anthropic } = await import("@ai-sdk/anthropic");
        return anthropic(resolvedModel);
      }
      case "openai": {
        const { openai } = await import("@ai-sdk/openai");
        return openai(resolvedModel);
      }
      case "gemini": {
        const { google } = await import("@ai-sdk/google");
        return google(resolvedModel);
      }
      case "mistral": {
        const { mistral } = await import("@ai-sdk/mistral");
        return mistral(resolvedModel);
      }
      case "cohere": {
        const { cohere } = await import("@ai-sdk/cohere");
        return cohere(resolvedModel);
      }
      case "ollama": {
        const { createOllama } = await import("ollama-ai-provider");
        const baseURL = process.env.OLLAMA_BASE_URL?.trim();
        const factory = baseURL ? createOllama({ baseURL }) : createOllama();
        return factory(resolvedModel);
      }
    }
  }

  const resolvedModel = await resolveModel();
  return async (prompt: string, maxTokens: number) => {
    const result = await generateText({
      model: resolvedModel as never,
      temperature: 0,
      maxOutputTokens: maxTokens,
      prompt,
    });
    return result.text;
  };
}

// ---------------------------------------------------------------------------
// labelCommunities — core function
// ---------------------------------------------------------------------------

export interface LabelCommunitiesOptions {
  provider: DirectLlmProvider;
  model?: string;
  gods?: GodNodeEntry[];
  maxCommunities?: number;
  topK?: number;
  /**
   * Injectable LLM caller. Defaults to the AI SDK backend for `provider`.
   * Pass a mock here in tests to avoid network calls.
   */
  callLlm?: CallLlmFn;
}

/**
 * Ask `provider` to name `communities` in one batched call and return a
 * complete `Map<cid, name>`. Placeholders fill any gap. Raises on API / parse
 * failure — callers that want graceful degradation should use
 * `generateCommunityLabels`.
 */
export async function labelCommunities(
  G: Graph,
  communities: Map<number, string[]>,
  options: LabelCommunitiesOptions,
): Promise<Map<number, string>> {
  const labels = placeholderLabels(communities);
  const { lines, labeledCids } = buildLabelingPromptLines(
    G,
    communities,
    options.gods ?? [],
    options.maxCommunities ?? MAX_COMMUNITIES,
    options.topK ?? TOP_K,
  );
  if (lines.length === 0) return labels;

  const prompt =
    "You are naming clusters in a knowledge graph. For each community below, " +
    "return a concise 2-5 word plain-language name describing what it is about " +
    '(e.g. "Order Management", "Payment Flow", "Auth Middleware"). ' +
    "Respond ONLY with a JSON object mapping the community id (as a string) to " +
    "its name — no prose, no markdown fences.\n\n" +
    lines.join("\n");

  const maxTokens = Math.min(40 + 16 * labeledCids.length, 4096);

  const callLlm = options.callLlm ?? (await makeDefaultCallLlm(options.provider, options.model));
  const text = await callLlm(prompt, maxTokens);
  const parsed = parseLabelResponse(text, labeledCids);
  for (const [cid, name] of parsed) labels.set(cid, name);
  return labels;
}

// ---------------------------------------------------------------------------
// generateCommunityLabels — public entry point with graceful degradation
// ---------------------------------------------------------------------------

export type LabelSource = "llm" | "assistant" | "placeholder";

/**
 * Execution mode for community labeling:
 * - "assistant": emit instruction file for the host assistant; ingest on next run.
 *   This is the DEFAULT when no API backend is configured.
 * - "direct": call the LLM API directly (requires an API key).
 * When `mode` is not explicitly set: "direct" if a backend is detected,
 * "assistant" otherwise.
 */
export type LabelMode = "assistant" | "direct";

/** A label is "generic" when it is still the `Community <id>` placeholder. */
function isGenericLabel(cid: number, label: string | undefined): boolean {
  return !label || label.trim() === `Community ${cid}`;
}

/**
 * Shared helper for the `update` pipeline and the `label` command: generate
 * salient community names and fold them into an existing `labels` map,
 * replacing ONLY generic "Community N" placeholders (so any user-curated /
 * persisted label survives). Returns the (mutated) map and the label source.
 *
 * Degrades gracefully: with no backend / on error, `labels` is returned
 * unchanged and `source` is "placeholder". Never throws.
 */
export async function applySalientCommunityLabels(
  G: Graph,
  communities: Map<number, string[]>,
  labels: Map<number, string>,
  options: GenerateCommunityLabelsOptions = {},
): Promise<{ labels: Map<number, string>; source: LabelSource }> {
  // Nit (a): short-circuit — the LLM result is folded in ONLY for communities
  // whose current label is still the generic `Community N` placeholder. If
  // every community already has a salient (non-generic) name, the call would
  // produce names we'd immediately discard. Skip the LLM round-trip entirely to
  // avoid spending tokens for nothing, and report "placeholder" (no LLM ran).
  const hasGenericLabel = [...communities.keys()].some((cid) =>
    isGenericLabel(cid, labels.get(cid)),
  );
  if (!hasGenericLabel) {
    return { labels, source: "placeholder" };
  }

  const { labels: generated, source } = await generateCommunityLabels(G, communities, options);
  if (source === "llm" || source === "assistant") {
    for (const [cid, name] of generated) {
      if (isGenericLabel(cid, labels.get(cid)) && !isGenericLabel(cid, name)) {
        labels.set(cid, name);
      }
    }
  }
  return { labels, source };
}

export interface GenerateCommunityLabelsOptions {
  /** Explicit provider. If omitted, auto-detect from env vars. */
  provider?: DirectLlmProvider | string | null;
  model?: string;
  gods?: GodNodeEntry[];
  /**
   * Injectable LLM caller. Defaults to the AI SDK backend for `provider`.
   * Pass a mock here in tests to avoid network calls.
   */
  callLlm?: CallLlmFn;
  /** Suppress stderr messages about missing backend / errors. */
  quiet?: boolean;
  /**
   * Execution mode: "assistant" (default when no key) or "direct" (API key).
   * When omitted, auto-selected: "direct" if a backend is detected or `callLlm`
   * is injected, "assistant" otherwise.
   */
  mode?: LabelMode;
  /**
   * Directory where assistant-mode instruction + answer files are stored.
   * Defaults to `.graphify/label-instructions/` (callers that know the project
   * root pass it here explicitly).
   */
  instructionDir?: string;
}

export interface GenerateCommunityLabelsResult {
  labels: Map<number, string>;
  source: LabelSource;
}

/**
 * CLI entry point: resolve a backend, name communities, and degrade to
 * `Community N` placeholders on any failure (no backend, API error, malformed
 * reply). Never throws.
 *
 * DEFAULT BEHAVIOUR (no API key):
 *   - Emits one instruction file to `instructionDir` for the host assistant
 *     (Claude Code, Codex, Gemini CLI…) to fill in with 2-5 word names.
 *   - On a subsequent run, ingests the completed answer file and applies the
 *     names to the returned `labels` map.
 *   - Source is "assistant" in both cases (not "placeholder").
 *
 * WITH AN API KEY (or injected callLlm):
 *   - Calls the backend directly (legacy "direct" path, unchanged).
 *   - Source is "llm".
 */
export async function generateCommunityLabels(
  G: Graph,
  communities: Map<number, string[]>,
  options: GenerateCommunityLabelsOptions = {},
): Promise<GenerateCommunityLabelsResult> {
  let provider: DirectLlmProvider | null = null;

  if (options.provider != null && options.provider !== "") {
    if (isDirectLlmProvider(options.provider)) {
      provider = options.provider;
    } else {
      if (!options.quiet) {
        process.stderr.write(
          `[graphify label] unknown provider '${options.provider}'; ` +
            `must be one of ${DIRECT_LLM_PROVIDERS.join(", ")}. Using placeholders.\n`,
        );
      }
      return { labels: placeholderLabels(communities), source: "placeholder" };
    }
  } else {
    provider = detectLabelingBackend();
  }

  // ---------------------------------------------------------------------------
  // Resolve execution mode: direct (API key) or assistant (skill/CLI, no key).
  // ---------------------------------------------------------------------------
  const resolvedMode: LabelMode =
    options.mode === "direct"
      ? "direct"
      : options.mode === "assistant"
        ? "assistant"
        : provider !== null || Boolean(options.callLlm)
          ? "direct"
          : "assistant";

  // ---------------------------------------------------------------------------
  // ASSISTANT MODE — no API key, emit instruction file + ingest answer.
  // ---------------------------------------------------------------------------
  if (resolvedMode === "assistant" && !options.callLlm) {
    const instructionDir = options.instructionDir ?? join(".graphify", LABEL_INSTRUCTIONS_DIR);

    // Build prompt lines (needed for both ingest and emit paths).
    const { lines, labeledCids } = buildLabelingPromptLines(
      G,
      communities,
      options.gods ?? [],
    );

    // Step 1: try to ingest an already-completed answer file.
    const ingested = ingestLabelAnswer(instructionDir, labeledCids);
    if (ingested.size > 0) {
      const labels = placeholderLabels(communities);
      for (const [cid, name] of ingested) {
        if (!isGenericLabel(cid, name)) labels.set(cid, name);
      }
      if (!options.quiet) {
        process.stderr.write(
          `[graphify label] assistant mode: ingested ${ingested.size} community name(s) ` +
            `from ${instructionDir}\n`,
        );
      }
      return { labels, source: "assistant" };
    }

    // Step 2: No answer yet — emit instruction file for the host assistant.
    if (lines.length === 0) {
      return { labels: placeholderLabels(communities), source: "placeholder" };
    }
    const { instructionPath, answerPath } = emitLabelInstructions(
      lines,
      labeledCids,
      instructionDir,
    );

    if (!options.quiet) {
      process.stderr.write(
        `[graphify label] assistant/skill mode: emitted instruction file to ${instructionPath}\n` +
          `  Fill ${answerPath} with 2-5 word community names,\n` +
          `  then re-run \`graphify update\` (or \`graphify label\`) to ingest.\n`,
      );
    }
    return { labels: placeholderLabels(communities), source: "assistant" };
  }

  // ---------------------------------------------------------------------------
  // DIRECT MODE — API key or injected callLlm.
  // ---------------------------------------------------------------------------
  if (!provider && !options.callLlm) {
    // Should not reach here in normal flow, but guard defensively for forced
    // `--label-mode direct` without a configured backend.
    if (!options.quiet) {
      process.stderr.write(
        "[graphify label] --label-mode direct requires an API key " +
          "(e.g. ANTHROPIC_API_KEY). Using placeholders.\n",
      );
    }
    return { labels: placeholderLabels(communities), source: "placeholder" };
  }

  try {
    const labels = await labelCommunities(G, communities, {
      provider: provider ?? "anthropic",
      model: options.model,
      gods: options.gods,
      callLlm: options.callLlm,
    });
    return { labels, source: "llm" };
  } catch (err) {
    if (!options.quiet) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[graphify label] warning: community labeling failed (${msg}); ` +
          "using Community N placeholders.\n",
      );
    }
    return { labels: placeholderLabels(communities), source: "placeholder" };
  }
}

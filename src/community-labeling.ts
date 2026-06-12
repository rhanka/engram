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
 * - Graceful degradation: any error (no backend, API error, malformed reply)
 *   falls back to "Community N" placeholders. Never throws from the public
 *   entry point `generateCommunityLabels`.
 * - Opt-in: a `provider` is required for LLM calls; without one, the function
 *   returns placeholders and prints a hint. No network call by default.
 */

import Graph from "graphology";

import {
  DIRECT_LLM_PROVIDERS,
  directProviderCredentialEnv,
  isDirectLlmProvider,
  type DirectLlmProvider,
} from "./llm-execution.js";
import type { GodNodeEntry } from "./types.js";

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

export type LabelSource = "llm" | "placeholder";

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
  if (source === "llm") {
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
}

export interface GenerateCommunityLabelsResult {
  labels: Map<number, string>;
  source: LabelSource;
}

/**
 * CLI entry point: resolve a backend, name communities, and degrade to
 * `Community N` placeholders on any failure (no backend, API error, malformed
 * reply). Never throws.
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

  if (!provider) {
    if (!options.quiet) {
      process.stderr.write(
        "[graphify label] no LLM backend configured; keeping Community N " +
          "placeholders. Set an API key (e.g. ANTHROPIC_API_KEY) or pass --backend.\n",
      );
    }
    return { labels: placeholderLabels(communities), source: "placeholder" };
  }

  try {
    const labels = await labelCommunities(G, communities, {
      provider,
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

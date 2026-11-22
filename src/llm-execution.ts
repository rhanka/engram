import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { engramEnv } from "./env.js";
import { parseJsonFromLlmText } from "./llm-json-port.js";
import type {
  LlmExecutionMode, LlmExecutionResult,
  TextJsonGenerationClient, TextJsonGenerationInput, TextJsonGenerationResult,
} from "./llm-json-port.js";
import type { NormalizedLlmExecutionPolicy } from "./types.js";

export { parseJsonFromLlmText, textClientToCallLlm } from "./llm-json-port.js";
export type {
  LlmExecutionMode, LlmExecutionResult,
  TextJsonGenerationClient, TextJsonGenerationInput, TextJsonGenerationResult,
} from "./llm-json-port.js";

export type LlmExecutionCapability = "text_json" | "vision_json" | "batch_vision_json";
export type DirectLlmProvider = "anthropic" | "openai" | "gemini" | "mistral" | "cohere";

export const DIRECT_LLM_PROVIDERS = ["anthropic", "openai", "gemini", "mistral", "cohere"] as const;

export interface VisionJsonAnalysisInput {
  schema: string;
  prompt: string;
  imagePaths: string[];
  outputPath?: string;
}

export interface BatchVisionExportInput {
  schema: string;
  requests: Array<VisionJsonAnalysisInput & { id: string }>;
  outputPath: string;
}

export interface BatchVisionImportInput {
  inputPath: string;
  outputDir: string;
}

/**
 * Text-JSON equivalent of BatchVisionExportInput. Used by the wiki
 * description generator and any other text-JSON consumer that wants to
 * submit many prompts as a single batch (OpenAI Batch, Anthropic Batch,
 * etc.) instead of paying per-call latency. Mirrors the upstream
 * `batch` mode in WikiDescriptionGenerator.
 */
export interface BatchTextJsonExportInput {
  schema: string;
  requests: Array<TextJsonGenerationInput & { id: string }>;
  outputPath: string;
}

export interface BatchTextJsonImportInput {
  inputPath: string;
  outputDir: string;
}

export type VisionJsonAnalysisResult = LlmExecutionResult;

export interface BatchVisionExportResult {
  provider: string;
  outputPath: string;
  requestCount: number;
  audit: Record<string, unknown>;
}

export interface BatchVisionImportResult {
  provider: string;
  importedCount: number;
  failedCount: number;
  audit: Record<string, unknown>;
}

export interface BatchTextJsonExportResult {
  provider: string;
  outputPath: string;
  requestCount: number;
  audit: Record<string, unknown>;
}

export interface BatchTextJsonImportResult {
  provider: string;
  importedCount: number;
  failedCount: number;
  audit: Record<string, unknown>;
}

export interface VisionJsonAnalysisClient {
  readonly mode: LlmExecutionMode;
  readonly provider: string;
  readonly primaryModel?: string;
  readonly deepModel?: string;
  analyzeImage(input: VisionJsonAnalysisInput): Promise<VisionJsonAnalysisResult>;
}

export interface BatchVisionJsonClient {
  readonly provider: string;
  exportRequests(input: BatchVisionExportInput): Promise<BatchVisionExportResult>;
  importResults(input: BatchVisionImportInput): Promise<BatchVisionImportResult>;
}

export interface BatchTextJsonClient {
  readonly provider: string;
  exportRequests(input: BatchTextJsonExportInput): Promise<BatchTextJsonExportResult>;
  importResults(input: BatchTextJsonImportInput): Promise<BatchTextJsonImportResult>;
}

export interface LlmMeshAdapter {
  generateTextJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;
  analyzeVisionJson(input: VisionJsonAnalysisInput): Promise<VisionJsonAnalysisResult>;
  exportBatchVisionJson?(input: BatchVisionExportInput): Promise<BatchVisionExportResult>;
  importBatchVisionJson?(input: BatchVisionImportInput): Promise<BatchVisionImportResult>;
}

export interface AssistantLlmClientOptions {
  instructionDir: string;
}

export interface DirectTextJsonClientOptions {
  provider: DirectLlmProvider;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "schema";
}

function instructionFileName(prefix: string, schema: string, outputPath?: string): string {
  const outputSlug = outputPath
    ? safeName(basename(outputPath).replace(/\.[^.]+$/u, ""))
    : null;
  return outputSlug
    ? `${prefix}-${safeName(schema)}-${outputSlug}.md`
    : `${prefix}-${safeName(schema)}.md`;
}

function writeInstruction(path: string, lines: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

export function isDirectLlmProvider(value: unknown): value is DirectLlmProvider {
  return typeof value === "string" && (DIRECT_LLM_PROVIDERS as readonly string[]).includes(value);
}

export function defaultDirectLlmModel(provider: DirectLlmProvider): string {
  switch (provider) {
    case "anthropic":
      return "claude-sonnet-4-6";
    case "openai":
      return "gpt-5.5";
    case "gemini":
      return "gemini-3.1-pro-preview-customtools";
    case "mistral":
      return "mistral-small-2603";
    case "cohere":
      return "command-a-03-2025";
  }
}

export function directProviderCredentialEnv(provider: DirectLlmProvider): string[] {
  switch (provider) {
    case "anthropic":
      return ["ANTHROPIC_API_KEY"];
    case "openai":
      return ["OPENAI_API_KEY"];
    case "gemini":
      return ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"];
    case "mistral":
      return ["MISTRAL_API_KEY"];
    case "cohere":
      return ["COHERE_API_KEY"];
  }
}

function resolveProviderCredential(provider: DirectLlmProvider): string | null {
  for (const envName of directProviderCredentialEnv(provider)) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return null;
}

function ensureProviderCredential(provider: DirectLlmProvider): void {
  const envNames = directProviderCredentialEnv(provider);
  if (envNames.length === 0) return;
  const credential = resolveProviderCredential(provider);
  if (!credential) {
    throw new Error(
      `Missing provider credential for ${provider}; set one of ${envNames.join(", ")}`,
    );
  }
  if (provider === "gemini" && !process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = credential;
  }
}

export function directProviderBaseUrlEnv(provider: DirectLlmProvider): string[] {
  switch (provider) {
    case "anthropic":
      return ["ANTHROPIC_BASE_URL"];
    case "openai":
      return ["OPENAI_BASE_URL"];
    case "gemini":
      return ["GEMINI_BASE_URL", "GOOGLE_GENERATIVE_AI_BASE_URL"];
    case "mistral":
      return ["MISTRAL_BASE_URL"];
    case "cohere":
      return ["COHERE_BASE_URL"];
  }
}

function resolveProviderBaseUrl(provider: DirectLlmProvider): string | undefined {
  for (const envName of directProviderBaseUrlEnv(provider)) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }
  return undefined;
}

async function resolveDirectModel(provider: DirectLlmProvider, model: string): Promise<unknown> {
  ensureProviderCredential(provider);
  switch (provider) {
    case "anthropic": {
      const { anthropic, createAnthropic } = await import("@ai-sdk/anthropic");
      const baseURL = resolveProviderBaseUrl(provider);
      return baseURL ? createAnthropic({ baseURL })(model) : anthropic(model);
    }
    case "openai": {
      const { openai, createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = resolveProviderBaseUrl(provider);
      return baseURL ? createOpenAI({ baseURL })(model) : openai(model);
    }
    case "gemini": {
      const { google, createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const baseURL = resolveProviderBaseUrl(provider);
      return baseURL ? createGoogleGenerativeAI({ baseURL })(model) : google(model);
    }
    case "mistral": {
      const { mistral, createMistral } = await import("@ai-sdk/mistral");
      const baseURL = resolveProviderBaseUrl(provider);
      return baseURL ? createMistral({ baseURL })(model) : mistral(model);
    }
    case "cohere": {
      const { cohere, createCohere } = await import("@ai-sdk/cohere");
      const baseURL = resolveProviderBaseUrl(provider);
      return baseURL ? createCohere({ baseURL })(model) : cohere(model);
    }
  }
}

export function preflightLlmExecution(
  policy: NormalizedLlmExecutionPolicy,
  capability: LlmExecutionCapability,
): void {
  if (policy.mode === "off") {
    if (capability === "batch_vision_json") {
      throw new Error("llm_execution.mode=off cannot export batch vision requests");
    }
    return;
  }
  if (policy.mode === "assistant") return;
  if (policy.mode === "direct") {
    if (!policy.provider) {
      throw new Error("llm_execution.provider is required for direct mode");
    }
    if (!isDirectLlmProvider(policy.provider)) {
      throw new Error(
        `llm_execution.provider must be one of ${DIRECT_LLM_PROVIDERS.join(", ")} for direct mode`,
      );
    }
    ensureProviderCredential(policy.provider);
    return;
  }
  if (policy.mode === "batch") {
    if (!policy.batch.provider) {
      throw new Error("llm_execution.batch.provider is required for batch mode");
    }
    return;
  }
  if (policy.mode === "mesh") {
    // Nothing in config can validate mesh mode: the old adapter string was
    // resolved against no registry. Mesh execution is reachable only through
    // explicit programmatic construction and client injection.
    return;
  }
}

export function createAssistantTextJsonClient(options: AssistantLlmClientOptions): TextJsonGenerationClient {
  return {
    mode: "assistant",
    provider: "assistant",
    async generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult> {
      const instructionPath = join(options.instructionDir, instructionFileName("text-json", input.schema, input.outputPath));
      writeInstruction(instructionPath, [
        `# Text JSON Generation: ${input.schema}`,
        "",
        "Engram is running in assistant mode. Do not call an external provider from Engram runtime.",
        "",
        "## Prompt",
        "",
        input.prompt,
        "",
        "## Expected Output",
        "",
        input.outputPath ?? "Write the JSON sidecar path requested by the calling workflow.",
      ]);
      return {
        status: "instructions_written",
        provider: "assistant",
        mode: "assistant",
        outputPath: input.outputPath,
        instructionPath,
        audit: { provider: "assistant", schema: input.schema },
      };
    },
  };
}

export function createAssistantVisionJsonClient(options: AssistantLlmClientOptions): VisionJsonAnalysisClient {
  return {
    mode: "assistant",
    provider: "assistant",
    async analyzeImage(input: VisionJsonAnalysisInput): Promise<VisionJsonAnalysisResult> {
      const instructionPath = join(options.instructionDir, `vision-json-${safeName(input.schema)}.md`);
      writeInstruction(instructionPath, [
        `# Vision JSON Analysis: ${input.schema}`,
        "",
        "Engram is running in assistant mode. Inspect the listed image artifacts with the active assistant.",
        "",
        "## Image Artifacts",
        "",
        ...input.imagePaths.map((item) => `- ${item}`),
        "",
        "## Prompt",
        "",
        input.prompt,
        "",
        "## Expected Output",
        "",
        input.outputPath ?? "Write the JSON sidecar path requested by the calling workflow.",
      ]);
      return {
        status: "instructions_written",
        provider: "assistant",
        mode: "assistant",
        outputPath: input.outputPath,
        instructionPath,
        audit: { provider: "assistant", schema: input.schema, image_count: input.imagePaths.length },
      };
    },
  };
}

/**
 * Track F F-0816-P2 row 14 (port safishamsi 06a9b72 / #973): honor the
 * `GRAPHIFY_MAX_OUTPUT_TOKENS` environment override when the caller did
 * not pass an explicit value. Upstream Python `_resolve_max_tokens` does
 * the same for all OpenAI-compatible backends (gemini, openai, kimi,
 * deepseek, ollama) plus Claude / Bedrock; in this TS fork the equivalent
 * routing point is `createDirectTextJsonClient`.
 *
 * Precedence — explicit > env > undefined — matches the upstream cfg
 * precedence (caller cfg dict wins over env, env wins over default).
 * Invalid / non-positive env values are silently ignored so a typo in
 * the shell does not surprise a long-running CI job.
 */
export function resolveMaxOutputTokens(explicit?: number): number | undefined {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const raw = engramEnv("ENGRAM_MAX_OUTPUT_TOKENS", "GRAPHIFY_MAX_OUTPUT_TOKENS");
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export function createDirectTextJsonClient(options: DirectTextJsonClientOptions): TextJsonGenerationClient {
  const provider = options.provider;
  const model = options.model?.trim() || defaultDirectLlmModel(provider);
  const temperature = options.temperature ?? 0;
  const maxOutputTokens = resolveMaxOutputTokens(options.maxOutputTokens);
  return {
    mode: "direct",
    provider,
    model,
    async generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult> {
      const [{ generateText }, resolvedModel] = await Promise.all([
        import("ai"),
        resolveDirectModel(provider, model),
      ]);
      // The per-call contract wins over the construction default. Validate it
      // here without changing resolveMaxOutputTokens(), whose invalid-env
      // behavior is intentionally separate.
      const requestedCap = input.maxOutputTokens;
      if (
        requestedCap !== undefined &&
        (!Number.isFinite(requestedCap) || !Number.isInteger(requestedCap) || requestedCap <= 0)
      ) {
        throw new Error(
          `maxOutputTokens must be a positive integer, received ${JSON.stringify(requestedCap)}. ` +
            "Refusing to generate without the requested cap.",
        );
      }
      const effectiveCap = requestedCap ?? maxOutputTokens;
      const result = await generateText({
        model: resolvedModel as never,
        temperature,
        ...(effectiveCap !== undefined ? { maxOutputTokens: effectiveCap } : {}),
        system: [
          "You are Engram's JSON extraction backend.",
          "Return only valid JSON matching the requested schema.",
          "Do not include Markdown prose outside the JSON object.",
        ].join("\n"),
        prompt: [
          `Schema: ${input.schema}`,
          "",
          input.prompt,
        ].join("\n"),
      });
      if (input.validateResponse) await input.validateResponse(result.text);
      const uEntries = result.usage && typeof result.usage === "object" ? Object.entries(result.usage as Record<string, unknown>).filter(([, v]) => typeof v === "number" && Number.isFinite(v)) : [];
      const usage = uEntries.length > 0 ? Object.fromEntries(uEntries) : undefined;
      let parsed: unknown;
      try { parsed = parseJsonFromLlmText(result.text); } catch (err) { throw err instanceof Error && usage ? Object.assign(err, { usage }) : err; }
      if (input.outputPath) {
        mkdirSync(dirname(input.outputPath), { recursive: true });
        writeFileSync(input.outputPath, JSON.stringify(parsed, null, 2), "utf-8");
      }
      return {
        status: "completed",
        provider,
        mode: "direct",
        model,
        outputPath: input.outputPath,
        audit: { ...redactSecrets({ provider, mode: "direct", model, schema: input.schema, finishReason: result.finishReason }), ...(usage ? { usage } : {}) },
      };
    },
  };
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }
  if (typeof value !== "object" || value === null) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/(api[_-]?key|token|secret|password|authorization)/iu.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactSecrets(item);
    }
  }
  return redacted as T;
}

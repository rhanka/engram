import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import type { NormalizedLlmExecutionPolicy } from "./types.js";

export type LlmExecutionCapability = "text_json" | "vision_json" | "batch_vision_json";
export type LlmExecutionMode = "assistant" | "direct" | "batch" | "mesh";
export type DirectLlmProvider = "anthropic" | "openai" | "gemini" | "mistral" | "cohere" | "ollama";

export const DIRECT_LLM_PROVIDERS = ["anthropic", "openai", "gemini", "mistral", "cohere", "ollama"] as const;

export interface TextJsonGenerationInput {
  schema: string;
  prompt: string;
  outputPath?: string;
}

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

export interface LlmExecutionResult {
  status: "instructions_written" | "completed";
  provider: string;
  mode: LlmExecutionMode;
  model?: string;
  outputPath?: string;
  instructionPath?: string;
  audit: Record<string, unknown>;
}

export type TextJsonGenerationResult = LlmExecutionResult;
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

export interface TextJsonGenerationClient {
  readonly mode: LlmExecutionMode;
  readonly provider: string;
  readonly model?: string;
  generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;
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
    case "ollama":
      return "llama3.1";
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
    case "ollama":
      return [];
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

const MAX_DIRECT_LLM_JSON_BYTES = 10 * 1024 * 1024;

function parseJsonFromLlmText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const byteLength = Buffer.byteLength(candidate, "utf-8");
  if (byteLength > MAX_DIRECT_LLM_JSON_BYTES) {
    throw new Error(
      `Direct LLM response exceeds ${MAX_DIRECT_LLM_JSON_BYTES} bytes (${byteLength} bytes); refusing to parse JSON`,
    );
  }
  try {
    return JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `Direct LLM response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function resolveDirectModel(provider: DirectLlmProvider, model: string): Promise<unknown> {
  ensureProviderCredential(provider);
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
    if (!policy.mesh.adapter) {
      throw new Error("llm_execution.mesh.adapter is required for mesh mode");
    }
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
        "Graphify is running in assistant mode. Do not call an external provider from Graphify runtime.",
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
        "Graphify is running in assistant mode. Inspect the listed image artifacts with the active assistant.",
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

export function createDirectTextJsonClient(options: DirectTextJsonClientOptions): TextJsonGenerationClient {
  const provider = options.provider;
  const model = options.model?.trim() || defaultDirectLlmModel(provider);
  const temperature = options.temperature ?? 0;
  const maxOutputTokens = options.maxOutputTokens;
  return {
    mode: "direct",
    provider,
    model,
    async generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult> {
      const [{ generateText }, resolvedModel] = await Promise.all([
        import("ai"),
        resolveDirectModel(provider, model),
      ]);
      const result = await generateText({
        model: resolvedModel as never,
        temperature,
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        system: [
          "You are Graphify's JSON extraction backend.",
          "Return only valid JSON matching the requested schema.",
          "Do not include Markdown prose outside the JSON object.",
        ].join("\n"),
        prompt: [
          `Schema: ${input.schema}`,
          "",
          input.prompt,
        ].join("\n"),
      });
      const parsed = parseJsonFromLlmText(result.text);
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
        audit: redactSecrets({
          provider,
          mode: "direct",
          model,
          schema: input.schema,
          finishReason: result.finishReason,
          usage: result.usage,
        }),
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

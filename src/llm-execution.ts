import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { NormalizedLlmExecutionPolicy } from "./types.js";

export type LlmExecutionCapability = "text_json" | "vision_json" | "batch_vision_json";
export type LlmExecutionMode = "assistant" | "batch" | "mesh";

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
  instructionPath: string;
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

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "schema";
}

function writeInstruction(path: string, lines: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
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
      const instructionPath = join(options.instructionDir, `text-json-${safeName(input.schema)}.md`);
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

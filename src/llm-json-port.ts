import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type LlmExecutionMode = "assistant" | "direct" | "batch" | "mesh";

export interface TextJsonGenerationInput {
  schema: string;
  prompt: string;
  outputPath?: string;
  /**
   * Consumer-owned acceptance check for the raw model text. A generating
   * client MUST run this before it reports successful completion. Rejecting or
   * throwing marks that response as failed; a routed client may then try its
   * next already-planned candidate, while a non-routed client propagates the
   * validation error. The client transports the callback but does not interpret
   * the schema itself. Non-generating assistant clients ignore it.
   */
  validateResponse?: (text: string) => void | Promise<void>;
  /**
   * Optional per-call cap on the number of output (completion) tokens the model
   * may generate, sized by the caller from the expected response (e.g. a batch
   * size or a community count). Same family as `schema`: `schema` constrains the
   * SHAPE of the output, `maxOutputTokens` its SIZE — both are per-call
   * constraints, which is why this lives on the input, not on the client.
   *
   * Regime — CEILING TO HONOR, not a best-effort hint: a client that performs
   * model generation MUST forward this cap to the provider; if it cannot express
   * an output cap it MUST fail explicitly rather than generate uncapped, so a
   * caller that sized its budget here is never silently over-run. A
   * NON-generating client (e.g. the assistant-emit sidecar, which asks a human
   * to fill the JSON and calls no model) has no generation to cap and ignores
   * this field. When omitted, a client falls back to its own default output
   * budget.
   */
  maxOutputTokens?: number;
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

export interface TextJsonGenerationClient {
  readonly mode: LlmExecutionMode;
  readonly provider: string;
  readonly model?: string;
  generateJson(input: TextJsonGenerationInput): Promise<TextJsonGenerationResult>;
}

/**
 * Adapt a `TextJsonGenerationClient` down to a raw text-returning call, for
 * consumers whose inner loop parses the model's JSON themselves (node
 * descriptions, community labels) rather than consuming a sidecar file. The
 * port delivers its text via `outputPath`, so this writes to a short-lived temp
 * file, reads it back, and cleans up. `maxTokens` is forwarded as the port's
 * `maxOutputTokens` (ceiling-to-honor): a client that cannot cap its output
 * fails loud instead of silently over-generating. This lets a consumer accept a
 * single injected `TextJsonGenerationClient` (e.g. the mesh client) while its
 * existing loop — retry policy and per-call token budget included — stays
 * byte-for-byte unchanged.
 */
export function textClientToCallLlm(
  client: TextJsonGenerationClient,
  schema: string,
  validateResponse?: TextJsonGenerationInput["validateResponse"],
): (prompt: string, maxTokens: number) => Promise<string> {
  return async (prompt: string, maxTokens: number): Promise<string> => {
    const outputPath = join(
      tmpdir(),
      `graphify-textjson-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`,
    );
    try {
      await client.generateJson({
        schema,
        prompt,
        outputPath,
        maxOutputTokens: maxTokens,
        ...(validateResponse ? { validateResponse } : {}),
      });
      return readFileSync(outputPath, "utf-8");
    } finally {
      try {
        unlinkSync(outputPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
  };
}

const MAX_DIRECT_LLM_JSON_BYTES = 10 * 1024 * 1024;

export function parseJsonFromLlmText(text: string | null | undefined): unknown {
  // Upstream f5fea13 (#924): guard against empty / filtered LLM responses.
  // OpenAI-compatible providers can return HTTP 200 with empty choices or
  // message=null on content-filter / Ollama overload — surface a clear error
  // instead of a cryptic JSON parse failure on the empty string.
  if (text === null || text === undefined || text === "") {
    throw new Error("LLM returned empty or filtered response");
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("LLM returned empty or filtered response");
  }
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

/**
 * Track F F-0816-P2 (row 14) — port of safishamsi 06a9b72 (#973).
 *
 * Upstream OpenAI-compatible LLM backends silently ignored the documented
 * `GRAPHIFY_MAX_OUTPUT_TOKENS` env override when the backend cfg dict
 * already carried a hardcoded value. Symptom for gemini-2.5-pro: 16k cap
 * truncated multi-document chunks mid-JSON, producing cascading
 * `Unterminated string at column ...` parse errors and bisect-retry
 * storms that billed input tokens without producing graph nodes.
 *
 * In the TS fork the equivalent surface is `createDirectTextJsonClient`
 * in src/llm-execution.ts. The default `maxOutputTokens` resolution now
 * reads `process.env.GRAPHIFY_MAX_OUTPUT_TOKENS` when the caller does
 * NOT pass an explicit override; an explicit caller value still wins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveMaxOutputTokens,
  createDirectTextJsonClient,
} from "../src/llm-execution.js";

describe("Track F F-0816-P2 (row 14) — GRAPHIFY_MAX_OUTPUT_TOKENS env", () => {
  const savedEnv = process.env.GRAPHIFY_MAX_OUTPUT_TOKENS;

  beforeEach(() => {
    delete process.env.GRAPHIFY_MAX_OUTPUT_TOKENS;
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.GRAPHIFY_MAX_OUTPUT_TOKENS;
    else process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = savedEnv;
    vi.restoreAllMocks();
  });

  it("returns undefined when env var is unset and no explicit value", () => {
    expect(resolveMaxOutputTokens(undefined)).toBeUndefined();
  });

  it("honours the env var when no explicit value is supplied", () => {
    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "32000";
    expect(resolveMaxOutputTokens(undefined)).toBe(32000);
  });

  it("explicit caller value still wins over env override (matches upstream cfg precedence)", () => {
    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "32000";
    expect(resolveMaxOutputTokens(8192)).toBe(8192);
  });

  it("rejects non-integer / non-positive env values silently", () => {
    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "not-a-number";
    expect(resolveMaxOutputTokens(undefined)).toBeUndefined();
    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "0";
    expect(resolveMaxOutputTokens(undefined)).toBeUndefined();
    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "-512";
    expect(resolveMaxOutputTokens(undefined)).toBeUndefined();
  });

  it("plumbs the env value into createDirectTextJsonClient.generateJson", async () => {
    // Mock the ai SDK so the test does not actually call any backend.
    let observed: { temperature?: number; maxOutputTokens?: number } | undefined;
    vi.doMock("ai", () => ({
      async generateText(args: { temperature?: number; maxOutputTokens?: number }): Promise<{
        text: string;
        finishReason: string;
        usage: Record<string, number>;
      }> {
        observed = { temperature: args.temperature, maxOutputTokens: args.maxOutputTokens };
        return { text: '{"ok":true}', finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1 } };
      },
    }));
    // resolveDirectModel routes through ai-sdk providers; we mock the
    // provider too so the test does not require provider credentials.
    vi.doMock("@ai-sdk/openai", () => ({
      openai: () => ({ provider: "openai" }),
    }));

    process.env.GRAPHIFY_MAX_OUTPUT_TOKENS = "12345";
    process.env.OPENAI_API_KEY = "sk-test-key-for-graphify";

    // Re-import the module under test after mocking deps.
    vi.resetModules();
    const llmModule = await import("../src/llm-execution.js");
    const client = llmModule.createDirectTextJsonClient({ provider: "openai", model: "gpt-5.5" });
    void client; // suppress unused warning if test bails early

    // The plumbing happens inside generateJson — exercise it.
    await llmModule.createDirectTextJsonClient({ provider: "openai", model: "gpt-5.5" }).generateJson({
      schema: "graphify_extraction_v1",
      prompt: "test",
    });

    expect(observed).toBeDefined();
    expect(observed!.maxOutputTokens).toBe(12345);
  });
});

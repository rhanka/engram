import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizeProjectConfig } from "../src/project-config.js";
import {
  createDirectTextJsonClient,
  createAssistantTextJsonClient,
  createAssistantVisionJsonClient,
  defaultDirectLlmModel,
  directProviderCredentialEnv,
  preflightLlmExecution,
  redactSecrets,
} from "../src/llm-execution.js";

const generateTextMock = vi.fn();
const openaiMock = vi.fn((model: string) => ({ provider: "openai", model }));
const anthropicMock = vi.fn((model: string) => ({ provider: "anthropic", model }));
const googleMock = vi.fn((model: string) => ({ provider: "google", model }));
const mistralMock = vi.fn((model: string) => ({ provider: "mistral", model }));
const cohereMock = vi.fn((model: string) => ({ provider: "cohere", model }));

vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@ai-sdk/openai", () => ({ openai: openaiMock }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: anthropicMock }));
vi.mock("@ai-sdk/google", () => ({ google: googleMock }));
vi.mock("@ai-sdk/mistral", () => ({ mistral: mistralMock }));
vi.mock("@ai-sdk/cohere", () => ({ cohere: cohereMock }));

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-llm-execution-"));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.COHERE_API_KEY;
});

describe("LLM execution ports", () => {
  it("accepts default assistant mode without provider credentials", () => {
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
      },
      join(root, "graphify.yaml"),
    );

    expect(() => preflightLlmExecution(config.llm_execution, "text_json")).not.toThrow();
    expect(() => preflightLlmExecution(config.llm_execution, "vision_json")).not.toThrow();
  });

  it("fails fast for batch mode without provider config", () => {
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        llm_execution: { mode: "batch" },
      },
      join(root, "graphify.yaml"),
    );

    expect(() => preflightLlmExecution(config.llm_execution, "batch_vision_json")).toThrow(
      "llm_execution.batch.provider is required for batch mode",
    );
  });

  it("fails fast for mesh mode without adapter config", () => {
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        llm_execution: { mode: "mesh" },
      },
      join(root, "graphify.yaml"),
    );

    expect(() => preflightLlmExecution(config.llm_execution, "vision_json")).toThrow(
      "llm_execution.mesh.adapter is required for mesh mode",
    );
  });

  it("fails fast for direct mode without provider or credentials", () => {
    const root = makeTempDir();
    const withoutProvider = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        llm_execution: { mode: "direct" },
      },
      join(root, "graphify.yaml"),
    );
    const withoutKey = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        llm_execution: { mode: "direct", provider: "openai" },
      },
      join(root, "graphify.yaml"),
    );

    expect(() => preflightLlmExecution(withoutProvider.llm_execution, "text_json")).toThrow(
      "llm_execution.provider is required for direct mode",
    );
    expect(() => preflightLlmExecution(withoutKey.llm_execution, "text_json")).toThrow(
      "OPENAI_API_KEY",
    );
  });

  it("accepts direct mode with a supported provider credential", () => {
    process.env.OPENAI_API_KEY = "test-key";
    const root = makeTempDir();
    const config = normalizeProjectConfig(
      {
        version: 1,
        profile: { path: "graphify/profile.yaml" },
        inputs: { corpus: ["raw"] },
        llm_execution: { mode: "direct", provider: "openai" },
      },
      join(root, "graphify.yaml"),
    );

    expect(() => preflightLlmExecution(config.llm_execution, "text_json")).not.toThrow();
    expect(defaultDirectLlmModel("openai")).toBe("gpt-5.5");
    expect(directProviderCredentialEnv("gemini")).toEqual(["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]);
  });

  it("writes assistant text JSON instructions without calling a provider", async () => {
    const root = makeTempDir();
    const client = createAssistantTextJsonClient({ instructionDir: root });

    const result = await client.generateJson({
      schema: "synthetic_schema_v1",
      prompt: "Return JSON only.",
      outputPath: ".graphify/example.json",
    });

    expect(result.status).toBe("instructions_written");
    expect(result.provider).toBe("assistant");
    expect(result.outputPath).toBe(".graphify/example.json");
    expect(result.instructionPath).toBe(join(root, "text-json-synthetic_schema_v1.md"));
    expect(readFileSync(result.instructionPath, "utf-8")).toContain("Return JSON only.");
  });

  it("writes assistant vision JSON instructions without calling a provider", async () => {
    const root = makeTempDir();
    const client = createAssistantVisionJsonClient({ instructionDir: root });

    const result = await client.analyzeImage({
      schema: "generic_image_caption_v1",
      prompt: "Inspect the crop.",
      imagePaths: [".graphify/image.png"],
      outputPath: ".graphify/image.caption.json",
    });

    expect(result.status).toBe("instructions_written");
    expect(result.provider).toBe("assistant");
    expect(result.instructionPath).toBe(join(root, "vision-json-generic_image_caption_v1.md"));
    expect(readFileSync(result.instructionPath, "utf-8")).toContain(".graphify/image.png");
    expect(existsSync(result.instructionPath)).toBe(true);
  });

  it("uses Vercel AI SDK for direct text JSON generation without writing secrets", async () => {
    generateTextMock.mockResolvedValue({
      text: "```json\n{\"nodes\":[],\"edges\":[],\"hyperedges\":[],\"input_tokens\":1,\"output_tokens\":2}\n```",
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    process.env.OPENAI_API_KEY = "test-key";
    const root = makeTempDir();
    const outputPath = join(root, "semantic.json");
    const client = createDirectTextJsonClient({
      provider: "openai",
      model: "gpt-5.5",
    });

    const result = await client.generateJson({
      schema: "graphify_extraction_v1",
      prompt: "Return an empty graph fragment.",
      outputPath,
    });

    expect(result.status).toBe("completed");
    expect(result.provider).toBe("openai");
    expect(result.mode).toBe("direct");
    expect(result.model).toBe("gpt-5.5");
    expect(openaiMock).toHaveBeenCalledWith("gpt-5.5");
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      model: { provider: "openai", model: "gpt-5.5" },
      temperature: 0,
    }));
    expect(JSON.parse(readFileSync(outputPath, "utf-8"))).toMatchObject({
      nodes: [],
      edges: [],
      hyperedges: [],
    });
    expect(JSON.stringify(result.audit)).not.toContain("test-key");
  });

  it("rejects invalid direct JSON responses", async () => {
    generateTextMock.mockResolvedValue({ text: "not-json", finishReason: "stop", usage: {} });
    process.env.MISTRAL_API_KEY = "test-key";
    const client = createDirectTextJsonClient({ provider: "mistral" });

    await expect(client.generateJson({
      schema: "graphify_extraction_v1",
      prompt: "Return JSON only.",
    })).rejects.toThrow("Direct LLM response was not valid JSON");
  });

  it("redacts likely secrets from audit metadata", () => {
    expect(
      redactSecrets({
        provider: "synthetic",
        apiKey: "sk-secret",
        nested: { token: "secret-token", safe: "visible" },
      }),
    ).toEqual({
      provider: "synthetic",
      apiKey: "[REDACTED]",
      nested: { token: "[REDACTED]", safe: "visible" },
    });
  });
});

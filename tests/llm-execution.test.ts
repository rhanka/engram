import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizeProjectConfig } from "../src/project-config.js";
import {
  createAssistantTextJsonClient,
  createAssistantVisionJsonClient,
  preflightLlmExecution,
  redactSecrets,
} from "../src/llm-execution.js";

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

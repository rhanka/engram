import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDirectTextJsonClient,
  defaultDirectLlmModel,
  directProviderCredentialEnv,
  isDirectLlmProvider,
  type DirectLlmProvider,
} from "../src/llm-execution.js";
import { validateExtraction } from "../src/validate.js";

const shouldRun = process.env.GRAPHIFY_RUN_DIRECT_LLM_UAT === "1";
const describeIf = shouldRun ? describe : describe.skip;

const PROVIDERS: DirectLlmProvider[] = ["anthropic", "openai", "gemini", "mistral", "cohere"];
const providerSelection = (process.env.GRAPHIFY_DIRECT_LLM_PROVIDER ?? "all").trim().toLowerCase();
const providersToRun = providerSelection === "all"
  ? PROVIDERS
  : isDirectLlmProvider(providerSelection)
    ? [providerSelection]
    : [];
const directLlmUatTimeout = providersToRun.includes("gemini") ? 90_000 : 45_000;

const tempDirs: string[] = [];

function hasCredential(provider: DirectLlmProvider): boolean {
  return directProviderCredentialEnv(provider).some((name) => Boolean(process.env[name]?.trim()));
}

describeIf("Direct LLM real provider integration", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("uses a valid provider selection", () => {
    expect(providersToRun).not.toEqual([]);
  });

  it.each(providersToRun)("generates valid Graphify JSON through %s", async (provider) => {
    if (!hasCredential(provider)) {
      throw new Error(
        `Missing credential for ${provider}; set one of ${directProviderCredentialEnv(provider).join(", ")}`,
      );
    }

    const tempDir = mkdtempSync(join(tmpdir(), `graphify-direct-llm-${provider}-`));
    tempDirs.push(tempDir);
    const outputPath = join(tempDir, "graphify-extraction.json");
    const client = createDirectTextJsonClient({
      provider,
      model: defaultDirectLlmModel(provider),
      maxOutputTokens: 1024,
    });

    const result = await client.generateJson({
      schema: "graphify_extraction_v1",
      prompt: [
        "Return the following JSON object verbatim and no prose.",
        "Do not rename fields. Do not change file_type. Do not add, remove, or infer anything.",
        "The exact response is:",
        '{"nodes":[{"id":"synthetic_direct_backend","label":"Synthetic Direct Backend","file_type":"document","source_file":"synthetic/direct-provider.md"}],"edges":[],"hyperedges":[],"input_tokens":0,"output_tokens":0}',
      ].join("\n"),
      outputPath,
    });

    expect(result.status).toBe("completed");
    expect(result.provider).toBe(provider);
    expect(result.mode).toBe("direct");
    expect(existsSync(outputPath)).toBe(true);
    const output = JSON.parse(readFileSync(outputPath, "utf-8"));
    expect(validateExtraction(output)).toEqual([]);
    expect(output.nodes.length).toBeGreaterThanOrEqual(1);
    const audit = JSON.stringify(result.audit);
    for (const envName of directProviderCredentialEnv(provider)) {
      const credential = process.env[envName]?.trim();
      if (credential) expect(audit.includes(credential)).toBe(false);
    }
  }, directLlmUatTimeout);
});

import { afterEach, expect, it, vi } from "vitest";
import { createDirectSemanticExtractionClient } from "../src/direct-llm-extract.js";

vi.mock("ai", () => ({ generateText: vi.fn(async () => ({
  text: '```json\n{"nodes":[],"edges":[]}\n```',
})) }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => ({}), createOpenAI: () => () => ({}) }));

afterEach(() => vi.unstubAllEnvs());

it("preserves accepted fenced JSON in direct semantic extraction", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-never-sent");
  const client = createDirectSemanticExtractionClient({ provider: "openai", model: "test" });
  await expect(client.extractChunk({
    chunkIndex: 0, chunkCount: 1,
    files: [{ path: "/tmp/fixture.md", relativePath: "fixture.md", text: "text" }],
  })).resolves.toEqual({ nodes: [], edges: [] });
});

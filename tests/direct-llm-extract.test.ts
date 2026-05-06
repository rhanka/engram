import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractSemanticFilesDirectParallel,
  packSemanticFilesByTokenBudget,
  type DirectSemanticExtractionClient,
} from "../src/direct-llm-extract.js";

describe("direct LLM semantic extraction", () => {
  it("packs files by token budget while keeping every file accounted for", () => {
    const root = mkdtempSync(join(tmpdir(), "graphify-direct-pack-"));
    try {
      const files = Array.from({ length: 5 }, (_, index) => {
        const path = join(root, `file-${index}.md`);
        writeFileSync(path, "x".repeat(10_000), "utf-8");
        return path;
      });

      const chunks = packSemanticFilesByTokenBudget(files, { tokenBudget: 6_000 });

      expect(chunks.map((chunk) => chunk.files.length)).toEqual([2, 2, 1]);
      expect(chunks.flatMap((chunk) => chunk.files)).toEqual(files);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs semantic chunks with bounded parallelism and merges graph fragments", async () => {
    const root = mkdtempSync(join(tmpdir(), "graphify-direct-extract-"));
    try {
      mkdirSync(join(root, "docs"), { recursive: true });
      const files = ["a.md", "b.md", "c.md"].map((name) => {
        const path = join(root, "docs", name);
        writeFileSync(path, `# ${name}\nSynthetic content.`, "utf-8");
        return path;
      });
      let inFlight = 0;
      let maxInFlight = 0;
      const client: DirectSemanticExtractionClient = {
        provider: "synthetic",
        model: "test-model",
        async extractChunk(input) {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 20));
          inFlight--;
          return {
            nodes: input.files.map((file, index) => ({
              id: `node_${input.chunkIndex}_${index}`,
              label: file.relativePath,
              file_type: "document",
              source_file: file.relativePath,
            })),
            edges: [],
            hyperedges: [],
            input_tokens: 10,
            output_tokens: 5,
          };
        },
      };

      const extraction = await extractSemanticFilesDirectParallel(files, {
        root,
        client,
        tokenBudget: 10,
        maxConcurrency: 2,
      });

      expect(maxInFlight).toBeLessThanOrEqual(2);
      expect(extraction.nodes).toHaveLength(3);
      expect(extraction.input_tokens).toBe(30);
      expect(extraction.output_tokens).toBe(15);
      expect(extraction.nodes.map((node) => node.source_file)).toEqual([
        "docs/a.md",
        "docs/b.md",
        "docs/c.md",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

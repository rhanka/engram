/**
 * Track F F-0816-P2 (row 3) — port of safishamsi 3238b32 (#889).
 *
 * Upstream: when `graphify extract --backend <name>` runs without the
 * backend SDK installed, every semantic chunk errors inside
 * `extract_corpus_parallel`. The per-chunk failures print to stderr but
 * the function returned the empty merged accumulator anyway, so extract
 * proceeded to write an AST-only graph.json and exit 0. CI that checks
 * exit status saw success even though the requested semantic pass
 * produced no nodes.
 *
 * Port: per-chunk errors are swallowed (printed to stderr, do not abort
 * the run), and after all chunks have been attempted the CLI fails
 * loudly with a non-zero exit if zero chunks succeeded out of the
 * requested set.
 */
import { describe, expect, it } from "vitest";

import {
  extractSemanticFilesDirectParallel,
  AllChunksFailedError,
} from "../src/direct-llm-extract.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tempCorpus(): { root: string; cleanup: () => void; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), "graphify-extract-fail-"));
  const files = [
    join(root, "doc-a.md"),
    join(root, "doc-b.md"),
  ];
  writeFileSync(files[0], "# Doc A\nFirst document.", "utf-8");
  writeFileSync(files[1], "# Doc B\nSecond document.", "utf-8");
  return { root, files, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe("Track F F-0816-P2 (row 3) — all chunks fail surfaces a typed error", () => {
  it("throws AllChunksFailedError when every chunk's extractChunk rejects", async () => {
    const { root, files, cleanup } = tempCorpus();
    try {
      await expect(
        extractSemanticFilesDirectParallel(files, {
          root,
          client: {
            provider: "anthropic",
            async extractChunk() {
              throw new Error("backend SDK missing: anthropic");
            },
          },
          tokenBudget: 10,
          maxConcurrency: 1,
        }),
      ).rejects.toBeInstanceOf(AllChunksFailedError);
    } finally {
      cleanup();
    }
  });

  it("AllChunksFailedError carries backend + chunk counts for the CLI message", async () => {
    const { root, files, cleanup } = tempCorpus();
    try {
      let caught: AllChunksFailedError | undefined;
      try {
        await extractSemanticFilesDirectParallel(files, {
          root,
          client: {
            provider: "gemini",
            async extractChunk() {
              throw new Error("HTTP 401 invalid api key");
            },
          },
          tokenBudget: 10,
          maxConcurrency: 1,
        });
      } catch (err) {
        if (err instanceof AllChunksFailedError) caught = err;
      }
      expect(caught).toBeDefined();
      expect(caught!.backend).toBe("gemini");
      expect(caught!.totalChunks).toBeGreaterThanOrEqual(1);
      expect(caught!.totalFiles).toBe(2);
      expect(caught!.message).toMatch(/all semantic chunks failed/);
      expect(caught!.message).toMatch(/gemini/);
    } finally {
      cleanup();
    }
  });

  it("returns merged extraction when at least one chunk succeeds (other chunks errored)", async () => {
    const { root, files, cleanup } = tempCorpus();
    try {
      let call = 0;
      const result = await extractSemanticFilesDirectParallel(files, {
        root,
        client: {
          provider: "anthropic",
          async extractChunk() {
            call += 1;
            if (call === 1) throw new Error("transient 429");
            return {
              nodes: [{ id: "doc-a", label: "Doc A", source_file: "doc-a.md", file_type: "document" }],
              edges: [],
              input_tokens: 10,
              output_tokens: 5,
            };
          },
        },
        tokenBudget: 10,
        maxConcurrency: 1,
      });
      expect(result.nodes).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it("rethrows AllChunksFailedError unchanged from a parallel run", async () => {
    const { root, files, cleanup } = tempCorpus();
    try {
      await expect(
        extractSemanticFilesDirectParallel(files, {
          root,
          client: {
            provider: "openai",
            async extractChunk() {
              throw new Error("HTTP 500");
            },
          },
          tokenBudget: 1, // force at least 2 chunks
          maxConcurrency: 2,
        }),
      ).rejects.toBeInstanceOf(AllChunksFailedError);
    } finally {
      cleanup();
    }
  });
});

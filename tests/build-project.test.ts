import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cleanupDirs: string[] = [];

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-build-project-"));
  cleanupDirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "sample.ts"), "export function demo() { return 1; }\n", "utf-8");
  return dir;
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/extract.js");
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buildProject", () => {
  it("writes standalone graph outputs for a code project", async () => {
    vi.doMock("../src/extract.js", async () => {
      const actual = await vi.importActual<typeof import("../src/extract.js")>("../src/extract.js");
      return {
        ...actual,
        extractWithDiagnostics: vi.fn(async () => ({
          extraction: {
            nodes: [
              {
                id: "alpha_service",
                label: "AlphaService",
                file_type: "code",
                source_file: "src/sample.ts",
              },
              {
                id: "beta_repo",
                label: "BetaRepo",
                file_type: "code",
                source_file: "src/sample.ts",
              },
            ],
            edges: [
              {
                source: "alpha_service",
                target: "beta_repo",
                relation: "uses",
                confidence: "EXTRACTED",
                source_file: "src/sample.ts",
              },
            ],
            input_tokens: 0,
            output_tokens: 0,
          },
          diagnostics: [],
        })),
      };
    });

    const { buildProject } = await import("../src/pipeline.js");
    const dir = makeProjectDir();
    const result = await buildProject(dir, { wiki: true });

    expect(result.graph.order).toBe(2);
    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "GRAPH_REPORT.md"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "graph.html"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "wiki", "index.md"))).toBe(true);
    expect(readFileSync(join(dir, ".graphify", "GRAPH_REPORT.md"), "utf-8")).toContain("## Summary");
    expect(readFileSync(join(dir, ".graphify", ".graphify_detect.json"), "utf-8")).toContain("\"total_files\"");
  });

  it("fails loudly when AST extraction produces no nodes", async () => {
    vi.doMock("../src/extract.js", async () => {
      const actual = await vi.importActual<typeof import("../src/extract.js")>("../src/extract.js");
      return {
        ...actual,
        extractWithDiagnostics: vi.fn(async () => ({
          extraction: {
            nodes: [],
            edges: [],
            input_tokens: 0,
            output_tokens: 0,
          },
          diagnostics: [
            {
              filePath: "/tmp/project/src/sample.ts",
              error: "Grammar not found for typescript",
            },
          ],
        })),
      };
    });

    const { buildProject } = await import("../src/pipeline.js");
    const dir = makeProjectDir();

    await expect(buildProject(dir, { html: false })).rejects.toThrow(
      "Install the required tree-sitter grammar packages",
    );
  });
});

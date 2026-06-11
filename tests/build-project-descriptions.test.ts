import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cleanupDirs: string[] = [];

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-build-desc-"));
  cleanupDirs.push(dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "sample.ts"), "export function demo() { return 1; }\n", "utf-8");
  return dir;
}

function mockExtract(dir: string): void {
  vi.doMock("../src/extract.js", async () => {
    const actual = await vi.importActual<typeof import("../src/extract.js")>("../src/extract.js");
    return {
      ...actual,
      extractWithDiagnostics: vi.fn(async () => ({
        extraction: {
          nodes: [
            { id: "alpha_fn", label: "alpha()", file_type: "code", source_file: join(dir, "src", "sample.ts") },
            { id: "beta_fn", label: "beta()", file_type: "code", source_file: join(dir, "src", "sample.ts") },
          ],
          edges: [
            {
              source: "alpha_fn",
              target: "beta_fn",
              relation: "calls",
              confidence: "EXTRACTED",
              source_file: join(dir, "src", "sample.ts"),
            },
          ],
          input_tokens: 0,
          output_tokens: 0,
        },
        diagnostics: [],
      })),
    };
  });
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/extract.js");
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("buildProject WP11 node descriptions", () => {
  it("writes a `description` onto CODE nodes in graph.json by default", async () => {
    const dir = makeProjectDir();
    mockExtract(dir);

    const { buildProject } = await import("../src/pipeline.js");
    await buildProject(dir, {
      html: false,
      // Inject a mock LLM caller so the default-on path runs with no API key.
      describeCallLlm: async (prompt: string) => {
        const ids = [...prompt.matchAll(/^- "([^"]+)":/gmu)].map((m) => m[1]!);
        return JSON.stringify(Object.fromEntries(ids.map((id) => [id, `What ${id} does.`])));
      },
    });

    const graph = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; description?: string; file_type?: string }>;
    };
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get("alpha_fn")?.file_type).toBe("code");
    expect(byId.get("alpha_fn")?.description).toBe("What alpha_fn does.");
    expect(byId.get("beta_fn")?.description).toBe("What beta_fn does.");
  });

  it("--no-description (describe:false) leaves nodes without a description", async () => {
    const dir = makeProjectDir();
    mockExtract(dir);

    const { buildProject } = await import("../src/pipeline.js");
    await buildProject(dir, {
      html: false,
      describe: false,
      describeCallLlm: async () => {
        throw new Error("LLM must not be called when describe:false");
      },
    });

    const graph = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      nodes: Array<{ id: string; description?: string }>;
    };
    expect(graph.nodes.every((n) => n.description === undefined)).toBe(true);
  });
});

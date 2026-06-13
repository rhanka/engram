import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { OntologyCitation } from "../src/types.js";

const cleanupDirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-merge-subcommands-"));
  cleanupDirs.push(dir);
  return dir;
}
afterEach(() => {
  while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
});

async function runRuntime(args: string[]): Promise<void> {
  const { main } = await import("../src/skill-runtime.js");
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    await main(["node", "skill-runtime", ...args]);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

function node(id: string, citations: OntologyCitation[]) {
  return { id, label: id, source_file: "doc.txt", file_type: "document" as const, citations };
}

function writeExtraction(path: string, nodes: ReturnType<typeof node>[]): void {
  writeFileSync(
    path,
    JSON.stringify({ nodes, edges: [], hyperedges: [], input_tokens: 0, output_tokens: 0 }),
    "utf-8",
  );
}

describe("F2: standalone merge-semantic / merge-extraction fold dup citations", () => {
  it("merge-semantic unions a duplicate node's citations instead of dropping them", async () => {
    const dir = tempDir();
    const cachedPath = join(dir, "cached.json");
    const newPath = join(dir, "new.json");
    const outPath = join(dir, "out.json");

    writeExtraction(cachedPath, [node("hub", [{ source_file: "a.txt", page: 1 }])]);
    writeExtraction(newPath, [
      node("hub", [
        { source_file: "b.txt", page: 2 },
        { source_file: "a.txt", page: 1 }, // overlap, deduped
      ]),
    ]);

    await runRuntime(["merge-semantic", "--cached", cachedPath, "--new", newPath, "--out", outPath]);

    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string; citations?: OntologyCitation[] }>;
    };
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    // deduped union a:1, b:2 — NOT just the cached chunk's single citation.
    expect(hub.citations).toHaveLength(2);
    const keys = hub.citations!.map((c) => `${c.source_file}:${c.page}`).sort();
    expect(keys).toEqual(["a.txt:1", "b.txt:2"]);
  });

  it("merge-extraction folds the semantic duplicate's citations into the AST node", async () => {
    const dir = tempDir();
    const astPath = join(dir, "ast.json");
    const semanticPath = join(dir, "semantic.json");
    const outPath = join(dir, "out.json");

    writeExtraction(astPath, [node("hub", [{ source_file: "a.txt", page: 1 }])]);
    writeExtraction(semanticPath, [node("hub", [{ source_file: "c.txt", page: 3 }])]);

    await runRuntime([
      "merge-extraction",
      "--ast", astPath,
      "--semantic", semanticPath,
      "--out", outPath,
    ]);

    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string; citations?: OntologyCitation[] }>;
    };
    const hub = merged.nodes.find((n) => n.id === "hub")!;
    expect(hub.citations).toHaveLength(2);
    const keys = hub.citations!.map((c) => `${c.source_file}:${c.page}`).sort();
    expect(keys).toEqual(["a.txt:1", "c.txt:3"]);
  });
});

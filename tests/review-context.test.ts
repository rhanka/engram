import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import Graph from "graphology";

import { createReviewGraphStore } from "../src/review-store.js";
import { buildReviewContext } from "../src/review-context.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-review-context-"));
  tempDirs.push(dir);
  return dir;
}

function qn(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function addFunction(
  G: Graph,
  name: string,
  filePath: string,
  options: { start?: number; end?: number; kind?: "Function" | "Test" } = {},
): string {
  const id = qn(filePath, name);
  G.addNode(id, {
    label: name,
    kind: options.kind ?? "Function",
    qualified_name: id,
    source_file: filePath,
    line_start: options.start ?? 1,
    line_end: options.end ?? 5,
    language: filePath.endsWith(".ts") ? "ts" : "python",
  });
  return id;
}

function addEdge(G: Graph, source: string, target: string, relation: string): void {
  G.addDirectedEdge(source, target, {
    relation,
    confidence: "EXTRACTED",
  });
}

function makeReviewGraph(): { G: Graph; changed: string; repo: string } {
  const G = new Graph({ type: "directed" });
  const changed = addFunction(G, "processPayment", "src/service.ts", { start: 3, end: 5 });
  const repo = addFunction(G, "savePayment", "src/repo.ts");
  addEdge(G, changed, repo, "calls");
  return { G, changed, repo };
}

describe("review context", () => {
  it("returns CRG-style minimal context with risk, key entities, test gaps, and next tools", () => {
    const { G } = makeReviewGraph();
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, ["src/service.ts"], {
      detailLevel: "minimal",
    });

    expect(context).toMatchObject({
      status: "ok",
      risk: "low",
      changedFileCount: 1,
      impactedFileCount: 2,
      keyEntities: ["processPayment"],
      testGaps: 1,
      nextToolSuggestions: ["detect-changes", "affected-flows", "review-context"],
    });
    expect(context.summary).toContain("Review context for 1 changed file(s)");
  });

  it("returns standard graph context and source snippets with relevant numbered lines", () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "service.ts"),
      [
        "const one = 1;",
        "const two = 2;",
        "export function processPayment() {",
        "  return two;",
        "}",
        "const six = 6;",
      ].join("\n"),
      "utf-8",
    );
    const { G, changed, repo } = makeReviewGraph();
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, ["src/service.ts"], {
      repoRoot: dir,
      includeSource: true,
      maxLinesPerFile: 20,
    });

    expect(context.context?.changedFiles).toEqual(["src/service.ts"]);
    expect(context.context?.impactedFiles).toEqual(["src/repo.ts", "src/service.ts"]);
    expect(context.context?.graph.changedNodes.map((node) => node.qualifiedName)).toEqual([changed]);
    expect(context.context?.graph.impactedNodes.map((node) => node.qualifiedName)).toContain(repo);
    expect(context.context?.sourceSnippets?.["src/service.ts"]).toContain("3: export function processPayment()");
    expect(context.context?.reviewGuidance).toContain("lack test coverage");
  });

  it("does not read sensitive files into source snippets", () => {
    const dir = tempProject();
    writeFileSync(join(dir, ".env"), "TOKEN=secret\n", "utf-8");
    const G = new Graph({ type: "directed" });
    addFunction(G, "loadSecret", ".env");
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, [".env"], {
      repoRoot: dir,
      includeSource: true,
    });

    expect(context.context?.sourceSnippets?.[".env"]).toBe("(skipped sensitive file)");
  });
});

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

  it("flags wide blast radius when impacted nodes exceed the high threshold", () => {
    const G = new Graph({ type: "directed" });
    const changed = addFunction(G, "core", "src/core.ts");
    // Connect 25 downstream nodes -> wide blast.
    for (let i = 0; i < 25; i += 1) {
      const downstream = addFunction(G, `dep${i}`, `src/dep${i}.ts`);
      addEdge(G, changed, downstream, "calls");
    }
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, ["src/core.ts"], { detailLevel: "minimal" });
    expect(context.risk).toBe("high");

    const standard = buildReviewContext(store, ["src/core.ts"], { detailLevel: "standard" });
    expect(standard.context?.reviewGuidance).toContain("Wide blast radius");
  });

  it("flags cross-file impact when more than three files downstream", () => {
    const G = new Graph({ type: "directed" });
    const changed = addFunction(G, "src", "src/source.ts");
    // 4 distinct downstream files (cross-file impact threshold > 3).
    for (let i = 0; i < 4; i += 1) {
      const downstream = addFunction(G, `dep${i}`, `src/file${i}.ts`);
      addEdge(G, changed, downstream, "calls");
    }
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, ["src/source.ts"], { detailLevel: "standard" });
    expect(context.context?.reviewGuidance).toContain("impact");
    expect(context.context?.reviewGuidance).toMatch(/other files|impact .* other/);
  });

  it("flags inheritance/implementation edges in guidance", () => {
    const G = new Graph({ type: "directed" });
    const child = addFunction(G, "ChildClass", "src/child.ts");
    const parent = addFunction(G, "ParentClass", "src/parent.ts");
    addEdge(G, child, parent, "extends");
    // Force the relation to canonicalize as INHERITS via the relation name path
    // used in F3 (extends -> INHERITS).
    const store = createReviewGraphStore(G);
    const allEdges = store.getAllEdges();
    expect(allEdges.some((e) => e.kind === "INHERITS")).toBe(true);

    const context = buildReviewContext(store, ["src/child.ts"], { detailLevel: "standard" });
    expect(context.context?.reviewGuidance).toContain("inheritance");
  });

  it("falls back to first 50 lines for long files without matching node ranges", () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    const longLines = Array.from({ length: 120 }, (_, i) => `// line ${i + 1}`);
    writeFileSync(join(dir, "src", "big.ts"), longLines.join("\n"), "utf-8");
    const G = new Graph({ type: "directed" });
    // Node has source_file but no line_start/line_end -> no relevant range.
    G.addNode("src/big.ts::ghost", {
      label: "ghost",
      kind: "Function",
      qualified_name: "src/big.ts::ghost",
      source_file: "src/big.ts",
      language: "ts",
    });
    const store = createReviewGraphStore(G);

    const context = buildReviewContext(store, ["src/big.ts"], {
      repoRoot: dir,
      includeSource: true,
      maxLinesPerFile: 50,
    });
    const snippet = context.context?.sourceSnippets?.["src/big.ts"] ?? "";
    // Either the relevant-range branch returns at most maxLinesPerFile lines,
    // or the fallback returns the first 50 numbered lines. Both must include
    // line 1 and stop at or before line 50.
    expect(snippet).toContain("1: // line 1");
    expect(snippet).not.toContain("// line 60");
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

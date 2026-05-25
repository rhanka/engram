// Integration tests for semantic fragment validation in the skill merge pipeline.
//
// Ports the upstream PR #825 contract (`safishamsi/graphify` commit b6127aa)
// into the TypeScript fork. The TS skill markdown templates invoke
// `skill-runtime.ts` subcommands (`save-semantic-cache`, `merge-semantic`,
// `merge-extraction`, `finalize-build`) which now validate + sanitize untrusted
// semantic-fragment JSON before merging it into the graph.

import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true });
  }
});

function makeDir(): string {
  const d = mkdtempSync(join(tmpdir(), "graphify-frag-"));
  tmpDirs.push(d);
  return d;
}

async function runSkillRuntime(args: string[], cwd: string): Promise<{
  logs: string[];
  errors: string[];
  warnings: string[];
  exitCode: number;
}> {
  const { main } = await import("../src/skill-runtime.js");
  return runMain(
    () => main(["node", "skill-runtime", ...args]),
    ["node", "skill-runtime", ...args],
    cwd,
  );
}

async function runMain(
  call: () => Promise<void>,
  argv: string[],
  cwd: string,
): Promise<{ logs: string[]; errors: string[]; warnings: string[]; exitCode: number }> {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { errors.push(args.join(" ")); };
  console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };

  process.argv = argv;
  process.chdir(cwd);
  try {
    await call();
    return { logs, errors, warnings, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { logs, errors: [...errors, message], warnings, exitCode: 1 };
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

describe("skill-runtime merge-semantic - fragment validation", () => {
  it("merges a valid cached + new fragment without warnings", async () => {
    const dir = makeDir();
    const cached = join(dir, "cached.json");
    const fresh = join(dir, "new.json");
    const outPath = join(dir, "merged.json");
    writeFileSync(
      cached,
      JSON.stringify({
        nodes: [{ id: "a", file_type: "code", source_file: "a.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );
    writeFileSync(
      fresh,
      JSON.stringify({
        nodes: [{ id: "b", file_type: "code", source_file: "b.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );

    const result = await runSkillRuntime(
      [
        "merge-semantic",
        "--cached", cached,
        "--new", fresh,
        "--out", outPath,
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Extraction complete");
    expect(result.warnings).toEqual([]);
    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string }>;
    };
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("drops invalid 'rationale' file_type nodes when sanitizing the new fragment", async () => {
    const dir = makeDir();
    const cached = join(dir, "cached.json");
    const fresh = join(dir, "new.json");
    const outPath = join(dir, "merged.json");
    writeFileSync(
      cached,
      JSON.stringify({ nodes: [], edges: [], hyperedges: [] }),
      "utf-8",
    );
    const longSentence = "A long rationale sentence explaining why the target was built the way it was.";
    writeFileSync(
      fresh,
      JSON.stringify({
        nodes: [
          { id: "target", file_type: "code", source_file: "t.ts", label: "Target" },
          { id: "rat", file_type: "rationale", source_file: "t.ts", label: longSentence },
        ],
        edges: [{ source: "rat", target: "target", relation: "rationale_for" }],
        hyperedges: [],
      }),
      "utf-8",
    );

    const result = await runSkillRuntime(
      [
        "merge-semantic",
        "--cached", cached,
        "--new", fresh,
        "--out", outPath,
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string; rationale?: string }>;
      edges: unknown[];
    };
    expect(merged.nodes.map((n) => n.id)).toEqual(["target"]);
    expect(merged.nodes.find((n) => n.id === "target")?.rationale).toBe(longSentence);
    expect(merged.edges).toEqual([]);
  });

  it("skips a malformed cached fragment instead of crashing the pipeline", async () => {
    const dir = makeDir();
    const cached = join(dir, "cached.json");
    const fresh = join(dir, "new.json");
    const outPath = join(dir, "merged.json");
    // Cached fragment has an id with path separators -> validation rejects it
    writeFileSync(
      cached,
      JSON.stringify({
        nodes: [{ id: "../escape", source_file: "x.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );
    writeFileSync(
      fresh,
      JSON.stringify({
        nodes: [{ id: "ok", file_type: "code", source_file: "o.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );

    const result = await runSkillRuntime(
      [
        "merge-semantic",
        "--cached", cached,
        "--new", fresh,
        "--out", outPath,
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.warnings.join("\n")).toMatch(/Skipping invalid cached/i);
    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string }>;
    };
    expect(merged.nodes.map((n) => n.id)).toEqual(["ok"]);
  });

  it("skips a malformed fresh fragment instead of crashing the pipeline", async () => {
    const dir = makeDir();
    const cached = join(dir, "cached.json");
    const fresh = join(dir, "new.json");
    const outPath = join(dir, "merged.json");
    writeFileSync(
      cached,
      JSON.stringify({
        nodes: [{ id: "ok", file_type: "code", source_file: "o.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );
    // Fresh fragment has nodes that's not a list -> structural error
    writeFileSync(fresh, JSON.stringify({ nodes: "not a list" }), "utf-8");

    const result = await runSkillRuntime(
      [
        "merge-semantic",
        "--cached", cached,
        "--new", fresh,
        "--out", outPath,
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    expect(result.warnings.join("\n")).toMatch(/Skipping invalid new/i);
    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string }>;
    };
    expect(merged.nodes.map((n) => n.id)).toEqual(["ok"]);
  });
});

describe("skill-runtime merge-extraction - fragment validation", () => {
  it("sanitizes invalid file_types before AST+semantic merge", async () => {
    const dir = makeDir();
    const ast = join(dir, "ast.json");
    const semantic = join(dir, "semantic.json");
    const outPath = join(dir, "extract.json");
    writeFileSync(
      ast,
      JSON.stringify({
        nodes: [{ id: "a_func", file_type: "code", source_file: "a.ts", label: "a" }],
        edges: [],
      }),
      "utf-8",
    );
    const longSentence = "Concept-like rationale prose that must not become a standalone node in the merged graph.";
    writeFileSync(
      semantic,
      JSON.stringify({
        nodes: [
          { id: "good", file_type: "code", source_file: "b.ts", label: "Good" },
          { id: "bad", file_type: "concept", source_file: "b.ts", label: longSentence },
        ],
        edges: [{ source: "bad", target: "good", relation: "rationale_for" }],
        hyperedges: [],
      }),
      "utf-8",
    );

    const result = await runSkillRuntime(
      [
        "merge-extraction",
        "--ast", ast,
        "--semantic", semantic,
        "--out", outPath,
      ],
      dir,
    );
    expect(result.exitCode).toBe(0);
    const merged = JSON.parse(readFileSync(outPath, "utf-8")) as {
      nodes: Array<{ id: string; rationale?: string }>;
    };
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(["a_func", "good"]);
    expect(merged.nodes.find((n) => n.id === "good")?.rationale).toBe(longSentence);
  });
});

describe("skill-runtime save-semantic-cache - fragment validation", () => {
  it("rejects a structurally invalid extraction file with a clear error", async () => {
    const dir = makeDir();
    const input = join(dir, "input.json");
    writeFileSync(
      input,
      JSON.stringify({
        nodes: [{ id: "../boom", source_file: "x.ts" }],
        edges: [],
        hyperedges: [],
      }),
      "utf-8",
    );

    const result = await runSkillRuntime(
      [
        "save-semantic-cache",
        "--input", input,
        "--root", dir,
      ],
      dir,
    );
    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toMatch(/(invalid semantic fragment|path separators)/i);
  });
});

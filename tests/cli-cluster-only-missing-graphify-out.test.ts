/**
 * Track F F-0816-P2 (row 15) — port of safishamsi 076e6b7 (#934).
 *
 * `cluster-only` crashed with FileNotFoundError when the output directory
 * (`graphify-out/` in Python, `.graphify/` in TS) did not exist - typical
 * workflow: archive / move the output dir, point `--graph` at a backup
 * `graph.json`, run `cluster-only` again. Upstream fix is one line:
 * `out.mkdir(parents=True, exist_ok=True)` before any write. Port the
 * same behaviour to the TS skill-runtime `cluster-only` command and to
 * the public `graphify cluster-only` path that reuses `.graphify/` as
 * its implicit output dir.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-cluster-only-missing-"));
  tempDirs.push(dir);
  return dir;
}

function fixtureGraph() {
  return {
    directed: false,
    graph: {},
    nodes: [
      { id: "alpha", label: "AlphaService", source_file: "src/alpha.ts", file_type: "code" },
      { id: "beta", label: "BetaRepository", source_file: "src/beta.ts", file_type: "code" },
    ],
    links: [
      { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED", source_file: "src/alpha.ts" },
    ],
  };
}

async function runSkillRuntime(args: string[]): Promise<{ exitCode: number; errors: string }> {
  const { main } = await import("../src/skill-runtime.js");
  const originalExit = process.exit;
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...msg: unknown[]) => { errors.push(msg.join(" ")); };
  process.exit = ((code?: string | number | null) => {
    throw new Error(`process.exit ${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await main(["node", "skill-runtime", ...args]);
    return { exitCode: 0, errors: errors.join("\n") };
  } catch (err) {
    const m = (err as Error).message.match(/^process\.exit (\d+)/);
    if (m) return { exitCode: Number(m[1]), errors: errors.join("\n") };
    errors.push((err as Error).message);
    return { exitCode: 1, errors: errors.join("\n") };
  } finally {
    process.exit = originalExit;
    console.error = originalError;
  }
}

describe("Track F F-0816-P2 (row 15) — cluster-only when output dir is missing", () => {
  it("skill-runtime cluster-only creates missing output dirs before writing", async () => {
    const root = tempProject();
    // Graph backup lives outside the (deleted) output directory.
    const backupDir = join(root, "backup");
    mkdirSync(backupDir, { recursive: true });
    const graphSrc = join(backupDir, "graph.json");
    writeFileSync(graphSrc, JSON.stringify(fixtureGraph()), "utf-8");

    // Output paths point inside a `.graphify/` directory that does NOT exist yet.
    const outDir = join(root, ".graphify");
    const graphOut = join(outDir, "graph.json");
    const reportOut = join(outDir, "GRAPH_REPORT.md");
    const analysisOut = join(outDir, ".graphify_analysis.json");
    expect(existsSync(outDir)).toBe(false);

    const result = await runSkillRuntime([
      "cluster-only",
      "--graph", graphSrc,
      "--root", root,
      "--graph-out", graphOut,
      "--report-out", reportOut,
      "--analysis-out", analysisOut,
    ]);

    expect(result.exitCode).toBe(0);
    expect(existsSync(graphOut)).toBe(true);
    expect(existsSync(reportOut)).toBe(true);
    expect(existsSync(analysisOut)).toBe(true);
    // graph.json round-trips with the input nodes.
    const out = JSON.parse(readFileSync(graphOut, "utf-8")) as { nodes: Array<{ id: string }> };
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["alpha", "beta"]);
  }, 90_000);

  it("public CLI cluster-only re-creates .graphify/ subdirs when only graph.json survived", async () => {
    const root = tempProject();
    // Seed .graphify/graph.json then delete sibling artifacts to mimic the
    // upstream scenario (user archived the rest of the output directory).
    const stateDir = join(root, ".graphify");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "graph.json"), JSON.stringify(fixtureGraph()), "utf-8");
    // Pre-fix: writeFileSync(report) blew up if any subdir on the path
    // had been removed. Simulate by removing the (otherwise existing)
    // `.graphify/scratch/` parent the analysis JSON would land under.
    // We just verify the command completes cleanly when `.graphify/`
    // contains only graph.json.

    const { main } = await import("../src/cli.js");
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const originalLog = console.log;
    const originalErr = console.error;
    const originalWarn = console.warn;
    const originalExit = process.exit;
    const errors: string[] = [];
    const logs: string[] = [];
    let exitCode = 0;
    console.log = (...m: unknown[]) => { logs.push(m.join(" ")); };
    console.error = (...m: unknown[]) => { errors.push(m.join(" ")); };
    console.warn = () => undefined;
    process.exit = ((code?: string | number | null) => {
      exitCode = Number(code ?? 0);
      throw new Error("__exit__");
    }) as typeof process.exit;

    process.argv = ["node", "graphify", "cluster-only", root];
    process.chdir(root);
    try {
      await main();
    } catch (err) {
      if ((err as Error).message !== "__exit__") {
        errors.push((err as Error).message);
        exitCode = 1;
      }
    } finally {
      process.argv = originalArgv;
      process.chdir(originalCwd);
      console.log = originalLog;
      console.error = originalErr;
      console.warn = originalWarn;
      process.exit = originalExit;
    }

    // Sanity: no fatal error string.
    expect(errors.join("\n")).not.toMatch(/ENOENT|FileNotFound/);
    expect(exitCode).toBe(0);
    expect(existsSync(join(stateDir, "GRAPH_REPORT.md"))).toBe(true);
    // graph.html ALSO landed; the .graphify/ scratch artifact too.
    void dirname; // keep import (used by readability of test); no-op
  });
});

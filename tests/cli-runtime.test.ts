import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-cli-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function writeGraph(dir: string): string {
  const graphDir = join(dir, ".graphify");
  mkdirSync(graphDir, { recursive: true });
  const graphPath = join(graphDir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      directed: false,
      graph: {},
      nodes: [
        { id: "alpha", label: "AlphaService", source_file: "src/alpha.ts", file_type: "code" },
        { id: "beta", label: "BetaRepository", source_file: "src/beta.ts", file_type: "code" },
        { id: "gamma", label: "GammaDocs", source_file: "docs/gamma.md", file_type: "document" },
      ],
      links: [
        { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
        { source: "beta", target: "gamma", relation: "documents", confidence: "INFERRED" },
      ],
    }, null, 2),
    "utf-8",
  );
  return graphPath;
}

async function runCli(args: string[], cwd: string, options: { interceptExit?: boolean } = {}) {
  const { main } = await import("../src/cli.js");
  return runMain(() => main(), ["node", "graphify", ...args], cwd, options);
}

async function runSkillRuntime(args: string[], cwd: string, options: { interceptExit?: boolean } = {}) {
  const { main } = await import("../src/skill-runtime.js");
  return runMain(() => main(["node", "skill-runtime", ...args]), ["node", "skill-runtime", ...args], cwd, options);
}

async function runMain(
  call: () => Promise<void>,
  argv: string[],
  cwd: string,
  options: { interceptExit?: boolean },
) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { errors.push(args.join(" ")); };
  console.warn = (...args: unknown[]) => { warnings.push(args.join(" ")); };
  if (options.interceptExit) {
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit ${code ?? 0}`);
    }) as typeof process.exit;
  }

  process.argv = argv;
  process.chdir(cwd);
  try {
    await call();
    return { logs, errors, warnings, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    if (match) return { logs, errors, warnings, exitCode: Number(match[1]) };
    if (options.interceptExit) return { logs, errors: [...errors, message], warnings, exitCode: 1 };
    throw error;
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }
}

describe("public CLI runtime command parity", () => {
  it("supports upstream path and explain commands", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);

    const path = await runCli(["path", "AlphaService", "GammaDocs", "--graph", graphPath], dir);
    expect(path.exitCode).toBe(0);
    expect(path.logs.join("\n")).toContain("Shortest path");
    expect(path.logs.join("\n")).toContain("AlphaService");
    expect(path.logs.join("\n")).toContain("GammaDocs");

    const explain = await runCli(["explain", "BetaRepository", "--graph", graphPath], dir);
    expect(explain.exitCode).toBe(0);
    expect(explain.logs.join("\n")).toContain("Node: BetaRepository");
    expect(explain.logs.join("\n")).toContain("Connections");
  });

  it("recognizes add as the public URL ingest command", async () => {
    const result = await runCli(["add", "not-a-url"], tempProject(), { interceptExit: true });

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("Invalid URL");
    expect(result.errors.join("\n")).not.toContain("unknown command");
  });

  it("supports one-shot update rebuilds for code-only projects", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const result = await runCli(["update", dir], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Code graph updated");
    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "GRAPH_REPORT.md"))).toBe(true);
  });

  it("keeps one-shot update artifacts project-relative", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const result = await runCli(["update", "."], dir);
    const graphText = readFileSync(join(dir, ".graphify", "graph.json"), "utf-8");
    const reportText = readFileSync(join(dir, ".graphify", "GRAPH_REPORT.md"), "utf-8");
    const graph = JSON.parse(graphText) as { nodes: Array<{ source_file?: string }> };

    expect(result.exitCode).toBe(0);
    expect(graph.nodes.some((node) => node.source_file === "src/alpha.ts")).toBe(true);
    expect(graphText).not.toContain(dir);
    expect(reportText).not.toContain(dir);
    expect(reportText).toContain("# Graph Report - .");
  });

  it("supports cluster-only and refreshes graph.html", async () => {
    const dir = tempProject();
    writeGraph(dir);

    const result = await runCli(["cluster-only", dir], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("graph.html updated");
    expect(existsSync(join(dir, ".graphify", "GRAPH_REPORT.md"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "graph.html"))).toBe(true);
  });
});

describe("skill runtime artifact parity", () => {
  it("cluster-only accepts --html-out and writes graph.html", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const reportPath = join(dir, ".graphify", "GRAPH_REPORT.md");
    const analysisPath = join(dir, ".graphify", ".graphify_analysis.json");
    const htmlPath = join(dir, ".graphify", "graph.html");

    const result = await runSkillRuntime([
      "cluster-only",
      "--graph", graphPath,
      "--root", dir,
      "--graph-out", graphPath,
      "--report-out", reportPath,
      "--analysis-out", analysisPath,
      "--html-out", htmlPath,
    ], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Re-clustered");
    expect(existsSync(htmlPath)).toBe(true);
    expect(readFileSync(htmlPath, "utf-8")).toContain("<title>graphify");
  });

  it("recognizes add as an alias for ingest", async () => {
    const result = await runSkillRuntime(["add", "not-a-url"], tempProject(), { interceptExit: true });

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("Invalid URL");
    expect(result.errors.join("\n")).not.toContain("unknown command");
  });
});

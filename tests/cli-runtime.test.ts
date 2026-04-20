import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
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

function tempProfileProject(): string {
  const dir = tempProject();
  cpSync(resolve(process.cwd(), "tests", "fixtures", "profile-demo"), dir, { recursive: true });
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

  it("isolates semantic cache commands by cache namespace", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "docs"), { recursive: true });
    const docPath = join(dir, "docs", "manual.md");
    writeFileSync(docPath, "# Synthetic manual\n", "utf-8");
    const detectionPath = join(dir, ".graphify", "detect.json");
    const semanticPath = join(dir, ".graphify", "semantic.json");
    const profileCachedPath = join(dir, ".graphify", "cached-profile.json");
    const profileUncachedPath = join(dir, ".graphify", "uncached-profile.txt");
    const genericCachedPath = join(dir, ".graphify", "cached-generic.json");
    const genericUncachedPath = join(dir, ".graphify", "uncached-generic.txt");
    mkdirSync(join(dir, ".graphify"), { recursive: true });
    writeFileSync(
      detectionPath,
      JSON.stringify({
        files: { code: [], document: [docPath], paper: [], image: [], video: [] },
        total_files: 1,
        total_words: 2,
        needs_graph: false,
        warning: null,
        skipped_sensitive: [],
        graphifyignore_patterns: 0,
      }),
      "utf-8",
    );
    writeFileSync(
      semanticPath,
      JSON.stringify({
        nodes: [{ id: "profile-node", label: "Profile Node", source_file: "docs/manual.md" }],
        edges: [],
        hyperedges: [],
        input_tokens: 0,
        output_tokens: 0,
      }),
      "utf-8",
    );

    const save = await runSkillRuntime([
      "save-semantic-cache",
      "--input", semanticPath,
      "--root", dir,
      "--cache-namespace", "profile-demo",
    ], dir);
    const profileHit = await runSkillRuntime([
      "check-semantic-cache",
      "--detect", detectionPath,
      "--root", dir,
      "--cached-out", profileCachedPath,
      "--uncached-out", profileUncachedPath,
      "--cache-namespace", "profile-demo",
    ], dir);
    const genericMiss = await runSkillRuntime([
      "check-semantic-cache",
      "--detect", detectionPath,
      "--root", dir,
      "--cached-out", genericCachedPath,
      "--uncached-out", genericUncachedPath,
    ], dir);

    expect(save.exitCode).toBe(0);
    expect(profileHit.logs.join("\n")).toContain("Cache: 1 files hit, 0 files need extraction");
    expect(JSON.parse(readFileSync(profileCachedPath, "utf-8")).nodes).toHaveLength(1);
    expect(genericMiss.logs.join("\n")).toContain("Cache: 0 files hit, 1 files need extraction");
    expect(readFileSync(genericUncachedPath, "utf-8")).toBe(docPath);
  });

  it("writes normalized project config and profile artifacts", async () => {
    const dir = tempProfileProject();
    const configOut = join(dir, ".graphify", "profile", "project-config.normalized.json");
    const profileOut = join(dir, ".graphify", "profile", "ontology-profile.normalized.json");

    const result = await runSkillRuntime([
      "project-config",
      "--root", dir,
      "--out", configOut,
      "--profile-out", profileOut,
    ], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Loaded profile equipment-maintenance-demo");
    expect(JSON.parse(readFileSync(configOut, "utf-8")).inputs.corpus[0]).toBe(join(dir, "raw", "manuals"));
    expect(JSON.parse(readFileSync(profileOut, "utf-8")).id).toBe("equipment-maintenance-demo");
  });

  it("runs configured profile dataprep and downstream profile runtime commands", async () => {
    const dir = tempProfileProject();
    const statePath = join(dir, ".graphify", "profile", "profile-state.json");
    const promptPath = join(dir, ".graphify", "profile", "prompt.md");
    const validationInput = join(dir, ".graphify", "profile", "registry-extraction.json");
    const reportPath = join(dir, ".graphify", "profile", "profile-report.md");
    const graphPath = writeGraph(dir);

    const dataprep = await runSkillRuntime([
      "configured-dataprep",
      "--root", dir,
      "--config", join(dir, "graphify.yaml"),
      "--out-dir", ".graphify",
    ], dir);
    const prompt = await runSkillRuntime([
      "profile-prompt",
      "--profile-state", statePath,
      "--out", promptPath,
    ], dir);
    const validation = await runSkillRuntime([
      "profile-validate-extraction",
      "--profile-state", statePath,
      "--input", validationInput,
      "--json",
    ], dir);
    const report = await runSkillRuntime([
      "profile-report",
      "--profile-state", statePath,
      "--graph", graphPath,
      "--out", reportPath,
    ], dir);

    expect(dataprep.exitCode).toBe(0);
    expect(dataprep.logs.join("\n")).toContain("Configured dataprep");
    expect(existsSync(statePath)).toBe(true);
    expect(prompt.exitCode).toBe(0);
    expect(readFileSync(promptPath, "utf-8")).toContain("Allowed node types");
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.logs.join("\n")).valid).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(readFileSync(reportPath, "utf-8")).toContain("# Graphify Profile Report");
    expect(readFileSync(reportPath, "utf-8")).toContain("equipment-maintenance-demo");
  });
});

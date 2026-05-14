import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { execGit } from "../src/git.js";
import { WIKI_DESCRIPTION_PROMPT_VERSION, buildWikiDescriptionCacheKey } from "../src/wiki-descriptions.js";

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
      graph: {
        community_labels: {
          "0": "Community 0",
          "1": "Community 1",
        },
      },
      nodes: [
        {
          id: "alpha",
          label: "AlphaService",
          source_file: "src/alpha.ts",
          file_type: "code",
          community: 0,
          community_name: "Community 0",
        },
        {
          id: "beta",
          label: "BetaRepository",
          source_file: "src/beta.ts",
          file_type: "code",
          community: 0,
          community_name: "Community 0",
        },
        {
          id: "gamma",
          label: "GammaDocs",
          source_file: "docs/gamma.md",
          file_type: "document",
          community: 1,
          community_name: "Community 1",
        },
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

function writeFlowGraph(dir: string): string {
  const graphDir = join(dir, ".graphify");
  mkdirSync(graphDir, { recursive: true });
  const graphPath = join(graphDir, "graph.json");
  writeFileSync(
    graphPath,
    JSON.stringify({
      directed: true,
      graph: {},
      nodes: [
        { id: "src/app.ts::main", label: "main", kind: "Function", qualified_name: "src/app.ts::main", source_file: "src/app.ts", line_start: 1, line_end: 5 },
        { id: "src/service.ts::run", label: "run", kind: "Function", qualified_name: "src/service.ts::run", source_file: "src/service.ts", line_start: 7, line_end: 12 },
      ],
      links: [
        { source: "src/app.ts::main", target: "src/service.ts::run", relation: "calls", confidence: "EXTRACTED", source_file: "src/app.ts" },
      ],
    }, null, 2),
    "utf-8",
  );
  return graphPath;
}

function writeLargeGraph(dir: string, nodeCount: number = 5001): string {
  const graphDir = join(dir, ".graphify");
  mkdirSync(graphDir, { recursive: true });
  const graphPath = join(graphDir, "graph.json");
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    label: `Node${index}`,
    source_file: `src/node-${index}.ts`,
    file_type: "code",
  }));
  writeFileSync(
    graphPath,
    JSON.stringify({
      directed: false,
      graph: {},
      nodes,
      links: [],
    }),
    "utf-8",
  );
  return graphPath;
}

function initGitRepo(dir: string): void {
  execGit(dir, ["init", "-q"]);
  execGit(dir, ["config", "user.email", "graphify@example.test"]);
  execGit(dir, ["config", "user.name", "Graphify Test"]);
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

  it("prefers exact path and explain matches over higher-degree substring matches", async () => {
    const dir = tempProject();
    const graphDir = join(dir, ".graphify");
    mkdirSync(graphDir, { recursive: true });
    const graphPath = join(graphDir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "helper", label: "MyFunctionHelpers", source_file: "src/helpers.ts", file_type: "code" },
          { id: "exact", label: "MyFunction", source_file: "src/exact.ts", file_type: "code" },
          { id: "target", label: "TargetService", source_file: "src/target.ts", file_type: "code" },
          { id: "noise-a", label: "NoiseA", source_file: "src/noise-a.ts", file_type: "code" },
          { id: "noise-b", label: "NoiseB", source_file: "src/noise-b.ts", file_type: "code" },
        ],
        links: [
          { source: "exact", target: "target", relation: "calls", confidence: "EXTRACTED" },
          { source: "helper", target: "noise-a", relation: "uses", confidence: "EXTRACTED" },
          { source: "helper", target: "noise-b", relation: "uses", confidence: "EXTRACTED" },
        ],
      }),
      "utf-8",
    );

    const path = await runCli(["path", "MyFunction", "TargetService", "--graph", graphPath], dir);
    expect(path.exitCode).toBe(0);
    expect(path.logs.join("\n")).toContain("MyFunction --calls [EXTRACTED]--> TargetService");

    const explain = await runCli(["explain", "MyFunction", "--graph", graphPath], dir);
    expect(explain.exitCode).toBe(0);
    expect(explain.logs.join("\n")).toContain("ID:        exact");

    const runtimePath = await runSkillRuntime(["path", "--graph", graphPath, "MyFunction", "TargetService"], dir);
    expect(runtimePath.exitCode).toBe(0);
    expect(runtimePath.logs.join("\n")).toContain("MyFunction --calls--> [EXTRACTED]");

    const runtimeExplain = await runSkillRuntime(["explain", "--graph", graphPath, "MyFunction"], dir);
    expect(runtimeExplain.exitCode).toBe(0);
    expect(runtimeExplain.logs.join("\n")).toContain("NODE: MyFunction");
    expect(runtimeExplain.logs.join("\n")).not.toContain("NODE: MyFunctionHelpers");
  });

  it("rejects shortest path queries when both labels resolve to the same node", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);

    const result = await runCli(["path", "AlphaService", "AlphaService", "--graph", graphPath], dir, {
      interceptExit: true,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("both resolved to the same node");

    const runtime = await runSkillRuntime(["path", "--graph", graphPath, "AlphaService", "AlphaService"], dir);
    expect(runtime.exitCode).toBe(0);
    expect(runtime.logs.join("\n")).toContain("both resolved to the same node");
    expect(runtime.logs.join("\n")).not.toContain("Shortest path (0 hops)");
  });

  it("supports tree for compact graph traversal output", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);

    const result = await runCli(["tree", "AlphaService", "--graph", graphPath, "--depth", "2"], dir);

    expect(result.exitCode).toBe(0);
    const output = result.logs.join("\n");
    expect(output).toContain("AlphaService");
    expect(output).toContain("uses -> BetaRepository");
    expect(output).toContain("documents -> GammaDocs");
  });

  it("recognizes add as the public URL ingest command", async () => {
    const result = await runCli(["add", "not-a-url"], tempProject(), { interceptExit: true });

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("Invalid URL");
    expect(result.errors.join("\n")).not.toContain("unknown command");
  });

  it("supports a silent hook-check command for Codex PreToolUse hooks", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, ".graphify"), { recursive: true });
    writeFileSync(join(dir, ".graphify", "graph.json"), "{}", "utf-8");

    const result = await runCli(["hook-check"], dir, { interceptExit: true });

    expect(result.exitCode).toBe(0);
    expect(result.logs).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("supports clone with an explicit output directory", async () => {
    const source = tempProject();
    initGitRepo(source);
    writeFileSync(join(source, "README.md"), "# source\n", "utf-8");
    execGit(source, ["add", "README.md"]);
    execGit(source, ["commit", "-q", "-m", "init"]);

    const destRoot = tempProject();
    const dest = join(destRoot, "cloned");
    const result = await runCli(["clone", source, "--out", dest], tempProject());

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain(dest);
    expect(existsSync(join(dest, ".git"))).toBe(true);
    expect(readFileSync(join(dest, "README.md"), "utf-8")).toContain("source");
  });

  it("supports export html and --no-viz cleanup", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const htmlPath = join(dir, ".graphify", "graph.html");

    const html = await runCli(["export", "html", "--graph", graphPath], dir);
    expect(html.exitCode).toBe(0);
    expect(html.logs.join("\n")).toContain("graph.html");
    expect(existsSync(htmlPath)).toBe(true);

    const noViz = await runCli(["export", "html", "--graph", graphPath, "--no-viz"], dir);
    expect(noViz.exitCode).toBe(0);
    expect(noViz.logs.join("\n")).toContain("HTML export skipped");
    expect(existsSync(htmlPath)).toBe(false);
  });

  it("supports export wiki and obsidian vault generation", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const obsidianDir = join(dir, "vault");

    const wiki = await runCli(["export", "wiki", "--graph", graphPath], dir);
    const obsidian = await runCli(["export", "obsidian", "--graph", graphPath, "--dir", obsidianDir], dir);

    expect(wiki.exitCode).toBe(0);
    expect(wiki.logs.join("\n")).toContain("wiki");
    expect(existsSync(join(dir, ".graphify", "wiki", "index.md"))).toBe(true);

    expect(obsidian.exitCode).toBe(0);
    expect(obsidian.logs.join("\n")).toContain("graph.canvas");
    expect(existsSync(join(obsidianDir, "index.md"))).toBe(true);
    expect(existsSync(join(obsidianDir, "graph.canvas"))).toBe(true);
  });

  it("supports export wiki with validated description sidecars", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const descriptionsPath = join(dir, ".graphify", "wiki-descriptions.json");
    const graphHash = createHash("sha256").update(readFileSync(graphPath)).digest("hex");
    const cacheKey = buildWikiDescriptionCacheKey({
      target_id: "community:0",
      target_kind: "community",
      graph_hash: graphHash,
      prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
      mode: "assistant",
      provider: "assistant",
      model: null,
    });
    writeFileSync(
      descriptionsPath,
      JSON.stringify({
        schema: "graphify_wiki_description_index_v1",
        graph_hash: graphHash,
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        nodes: {},
        communities: {
          "0": {
            schema: "graphify_wiki_description_v1",
            target_id: "community:0",
            target_kind: "community",
            graph_hash: graphHash,
            status: "generated",
            description: "Community 0 contains the source-backed service and repository concepts.",
            evidence_refs: ["src/alpha.ts#AlphaService"],
            confidence: 0.8,
            cache_key: cacheKey,
            generator: {
              mode: "assistant",
              provider: "assistant",
              model: null,
              prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
            },
          },
        },
      }),
      "utf-8",
    );

    const wiki = await runCli([
      "export",
      "wiki",
      "--graph",
      graphPath,
      "--descriptions",
      descriptionsPath,
    ], dir);

    expect(wiki.exitCode).toBe(0);
    const article = readFileSync(join(dir, ".graphify", "wiki", "Community_0.md"), "utf-8");
    expect(article).toContain("Community 0 contains the source-backed service and repository concepts.");
  });

  it("skips stale wiki description sidecars when graph_hash diverges", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const descriptionsPath = join(dir, ".graphify", "wiki-descriptions.json");
    writeFileSync(
      descriptionsPath,
      JSON.stringify({
        schema: "graphify_wiki_description_index_v1",
        graph_hash: "stale-graph",
        prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
        nodes: {},
        communities: {
          "0": {
            schema: "graphify_wiki_description_v1",
            target_id: "community:0",
            target_kind: "community",
            graph_hash: "stale-graph",
            status: "generated",
            description: "STALE description should be skipped.",
            evidence_refs: ["src/alpha.ts#AlphaService"],
            confidence: 0.8,
            cache_key: "stale-cache-key",
            generator: {
              mode: "assistant",
              provider: "assistant",
              model: null,
              prompt_version: WIKI_DESCRIPTION_PROMPT_VERSION,
            },
          },
        },
      }),
      "utf-8",
    );

    const wiki = await runCli([
      "export",
      "wiki",
      "--graph",
      graphPath,
      "--descriptions",
      descriptionsPath,
    ], dir);

    expect(wiki.exitCode).toBe(0);
    expect(wiki.warnings.join("\n")).toContain("Skipping 0 node and 1 community description");
    const article = readFileSync(join(dir, ".graphify", "wiki", "Community_0.md"), "utf-8");
    expect(article).not.toContain("STALE description should be skipped.");
  });

  it("generates wiki description sidecars through assistant mode", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);
    const descriptionsDir = join(dir, ".graphify", "wiki", "descriptions");
    const instructionsDir = join(dir, ".graphify", "wiki", "description-instructions");

    const result = await runCli([
      "wiki",
      "describe",
      "--graph",
      graphPath,
      "--mode",
      "assistant",
      "--targets",
      "all",
      "--max-nodes",
      "1",
      "--max-communities",
      "1",
      "--out",
      descriptionsDir,
      "--instructions-dir",
      instructionsDir,
    ], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("wiki descriptions");

    const indexPath = `${descriptionsDir}.json`;
    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(descriptionsDir, "beta.json"))).toBe(true);
    expect(existsSync(join(descriptionsDir, "community-0.json"))).toBe(true);

    const index = JSON.parse(readFileSync(indexPath, "utf-8")) as {
      schema: string;
      nodes: Record<string, unknown>;
      communities: Record<string, unknown>;
    };
    expect(index.schema).toBe("graphify_wiki_description_index_v1");
    expect(Object.keys(index.nodes)).toEqual(["beta"]);
    expect(Object.keys(index.communities)).toEqual(["0"]);
    const instructionFiles = readdirSync(instructionsDir)
      .filter((name) => name.includes("graphify_wiki_description"))
      .sort();
    expect(instructionFiles).toHaveLength(2);
    const instructions = instructionFiles
      .map((name) => readFileSync(join(instructionsDir, name), "utf-8"))
      .join("\n\n");
    expect(instructions).toContain("target_id: beta");
    expect(instructions).toContain("target_id: community:0");
  });

  it("supports export svg, graphml, and neo4j cypher", async () => {
    const dir = tempProject();
    const graphPath = writeGraph(dir);

    const svg = await runCli(["export", "svg", "--graph", graphPath], dir);
    const graphml = await runCli(["export", "graphml", "--graph", graphPath], dir);
    const neo4j = await runCli(["export", "neo4j", "--graph", graphPath], dir);

    expect(svg.exitCode).toBe(0);
    expect(readFileSync(join(dir, ".graphify", "graph.svg"), "utf-8")).toContain("<svg");

    expect(graphml.exitCode).toBe(0);
    expect(readFileSync(join(dir, ".graphify", "graph.graphml"), "utf-8")).toContain("<graphml");

    expect(neo4j.exitCode).toBe(0);
    expect(readFileSync(join(dir, ".graphify", "cypher.txt"), "utf-8")).toContain("MERGE");
  });

  it("supports merge-graphs and annotates nodes with their repo of origin", async () => {
    const root = tempProject();
    const repoA = join(root, "repo-a");
    const repoB = join(root, "repo-b");
    mkdirSync(join(repoA, ".graphify"), { recursive: true });
    mkdirSync(join(repoB, ".graphify"), { recursive: true });

    const graphA = join(repoA, ".graphify", "graph.json");
    writeFileSync(
      graphA,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [{ id: "alpha", label: "Alpha", source_file: "src/a.ts", file_type: "code" }],
        links: [],
      }, null, 2),
      "utf-8",
    );
    const graphB = join(repoB, ".graphify", "graph.json");
    writeFileSync(
      graphB,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [{ id: "beta", label: "Beta", source_file: "src/b.ts", file_type: "code" }],
        links: [{ source: "beta", target: "beta", relation: "self", confidence: "EXTRACTED" }],
      }, null, 2),
      "utf-8",
    );

    const mergedPath = join(root, ".graphify", "merged-graph.json");
    const result = await runCli(["merge-graphs", graphA, graphB, "--out", mergedPath], root);
    const merged = JSON.parse(readFileSync(mergedPath, "utf-8")) as {
      nodes: Array<{ id: string; repo?: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Merged 2 graphs");
    expect(merged.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "alpha", repo: "repo-a" }),
        expect.objectContaining({ id: "beta", repo: "repo-b" }),
      ]),
    );
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

  it("writes graph freshness metadata and detects stale HEAD drift", async () => {
    const dir = tempProject();
    initGitRepo(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");
    execGit(dir, ["add", "src/alpha.ts"]);
    execGit(dir, ["commit", "-q", "-m", "init"]);

    const result = await runCli(["update", "."], dir);
    const head = execGit(dir, ["rev-parse", "HEAD"]);
    const graphJson = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      graph?: { built_from_commit?: string };
    };
    const report = readFileSync(join(dir, ".graphify", "GRAPH_REPORT.md"), "utf-8");

    expect(result.exitCode).toBe(0);
    expect(graphJson.graph?.built_from_commit).toBe(head);
    expect(report).toContain(head.slice(0, 7));

    writeFileSync(join(dir, "README.md"), "# drift\n", "utf-8");
    execGit(dir, ["add", "README.md"]);
    execGit(dir, ["commit", "-q", "-m", "drift"]);

    const stale = await runCli(["check-update", "."], dir);
    expect(stale.exitCode).toBe(0);
    expect(stale.logs.join("\n")).toContain("Pending semantic updates");
    expect(stale.logs.join("\n")).toContain(head.slice(0, 7));
  });

  it("supports code-only headless extract via the public CLI", async () => {
    const dir = tempProject();
    const outDir = join(dir, "artifacts");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const result = await runCli(["extract", ".", "--out", outDir], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("[graphify extract] wrote");
    expect(existsSync(join(outDir, ".graphify", "graph.json"))).toBe(true);
    expect(existsSync(join(outDir, ".graphify", "GRAPH_REPORT.md"))).toBe(true);
    expect(existsSync(join(outDir, ".graphify", ".graphify_analysis.json"))).toBe(true);
    expect(existsSync(join(outDir, ".graphify", ".graphify_labels.json"))).toBe(true);
  });

  it("supports extract --no-cluster for raw merged extraction output", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const result = await runCli(["extract", ".", "--no-cluster"], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("no clustering");
    expect(existsSync(join(dir, ".graphify", ".graphify_extract.json"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(false);
  });

  it("requires provided semantic extraction for non-code headless corpora", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "guide.md"), "# Guide\n", "utf-8");

    const result = await runCli(["extract", "."], dir, { interceptExit: true });

    expect(result.exitCode).toBe(1);
    expect(result.errors.join("\n")).toContain("provide --semantic");
  });

  it("supports docs-only headless extract when semantic JSON is provided", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "docs", "guide.md"), "# Guide\n", "utf-8");
    const semanticPath = join(dir, "semantic.json");
    writeFileSync(
      semanticPath,
      JSON.stringify({
        nodes: [
          {
            id: "guide_doc",
            label: "Guide",
            file_type: "document",
            source_file: "docs/guide.md",
            source_location: null,
          },
        ],
        edges: [],
        hyperedges: [],
        input_tokens: 10,
        output_tokens: 5,
      }, null, 2),
      "utf-8",
    );

    const result = await runCli(["extract", ".", "--semantic", semanticPath], dir);
    const graph = JSON.parse(readFileSync(join(dir, ".graphify", "graph.json"), "utf-8")) as {
      nodes: Array<{ label?: string }>;
    };

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("[graphify extract] wrote");
    expect(graph.nodes.some((node) => node.label === "Guide")).toBe(true);
  });

  it("keeps Google Workspace shortcut stubs in the manifest after extract conversion", async () => {
    const dir = tempProject();
    const previousWorkspace = process.env.GRAPHIFY_GOOGLE_WORKSPACE;
    const previousAccessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
    try {
      process.env.GRAPHIFY_GOOGLE_WORKSPACE = "1";
      process.env.GOOGLE_OAUTH_ACCESS_TOKEN = "fake-token";
      writeFileSync(
        join(dir, "notes.gdoc"),
        JSON.stringify({
          doc_id: "doc-1",
          url: "https://docs.google.com/document/d/doc-1/edit",
        }),
        "utf-8",
      );
      const semanticPath = join(dir, "semantic.json");
      writeFileSync(
        semanticPath,
        JSON.stringify({
          nodes: [
            {
              id: "notes_doc",
              label: "Notes",
              file_type: "document",
              source_file: ".graphify/converted/notes_sidecar.md",
              source_location: null,
            },
          ],
          edges: [],
          hyperedges: [],
          input_tokens: 10,
          output_tokens: 5,
        }, null, 2),
        "utf-8",
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input, init) => {
        expect(String(input)).toBe("https://www.googleapis.com/drive/v3/files/doc-1/export?mimeType=text%2Fmarkdown");
        expect(init?.method).toBe("GET");
        return new Response("# Exported notes\n", { status: 200 });
      }) as typeof fetch;
      try {
        const result = await runCli(["extract", ".", "--semantic", semanticPath, "--no-cluster"], dir);

        expect(result.exitCode).toBe(0);
        const manifest = JSON.parse(readFileSync(join(dir, ".graphify", "manifest.json"), "utf-8")) as Record<string, unknown>;
        expect(manifest[join(dir, "notes.gdoc")]).toBeTruthy();
        expect(Object.keys(manifest).some((file) => file.includes(join(".graphify", "converted")))).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (previousWorkspace === undefined) delete process.env.GRAPHIFY_GOOGLE_WORKSPACE;
      else process.env.GRAPHIFY_GOOGLE_WORKSPACE = previousWorkspace;
      if (previousAccessToken === undefined) delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
      else process.env.GOOGLE_OAUTH_ACCESS_TOKEN = previousAccessToken;
    }
  });

  it("preserves existing semantic nodes during code-only update rebuilds", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const initial = await runCli(["update", "."], dir);
    expect(initial.exitCode).toBe(0);

    const graphPath = join(dir, ".graphify", "graph.json");
    const graph = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string; label?: string; source_file?: string; file_type?: string }>;
      links: Array<Record<string, unknown>>;
    };
    const existingCodeNode = graph.nodes.find((node) => node.file_type === "code");
    expect(existingCodeNode).toBeTruthy();

    graph.nodes.push({
      id: "semantic_doc",
      label: "SemanticDoc",
      source_file: "docs/semantic.md",
      file_type: "document",
    });
    graph.links.push({
      source: existingCodeNode!.id,
      target: "semantic_doc",
      relation: "documents",
      confidence: "INFERRED",
      source_file: "docs/semantic.md",
    });
    writeFileSync(graphPath, JSON.stringify(graph, null, 2), "utf-8");

    const updated = await runCli(["update", "."], dir, { interceptExit: true });
    const persisted = JSON.parse(readFileSync(graphPath, "utf-8")) as {
      nodes: Array<{ id: string }>;
      links: Array<{ source: string; target: string; relation?: string }>;
    };

    expect(updated.exitCode).toBe(0);
    expect(persisted.nodes.some((node) => node.id === "semantic_doc")).toBe(true);
    expect(
      persisted.links.some((edge) =>
        edge.target === "semantic_doc" && edge.relation === "documents"),
    ).toBe(true);
  });

  it("accepts update --force as a valid CLI override", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");

    const result = await runCli(["update", ".", "--force"], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Code graph updated");
    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(true);
  });

  it("rebuilds code but keeps stale semantic state for mixed code and docs hook batches", async () => {
    const dir = tempProject();
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");
    writeFileSync(join(dir, "docs", "guide.md"), "# Guide\n", "utf-8");

    const initial = await runCli(["update", "."], dir);
    expect(initial.exitCode).toBe(0);

    writeFileSync(join(dir, ".graphify", "needs_update"), "1\n", "utf-8");
    const previousChanged = process.env.GRAPHIFY_CHANGED;
    process.env.GRAPHIFY_CHANGED = ["src/alpha.ts", "docs/guide.md"].join("\n");
    try {
      const result = await runCli(["hook-rebuild"], dir, { interceptExit: true });
      expect(result.exitCode).toBe(0);
    } finally {
      if (previousChanged === undefined) {
        delete process.env.GRAPHIFY_CHANGED;
      } else {
        process.env.GRAPHIFY_CHANGED = previousChanged;
      }
    }

    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "needs_update"))).toBe(true);
  });

  it("supports scope inspect via CLI and skill runtime", async () => {
    const dir = tempProject();
    initGitRepo(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export const main = true;\n", "utf-8");
    execGit(dir, ["add", "src/main.ts"]);
    execGit(dir, ["commit", "-q", "-m", "init"]);
    writeFileSync(join(dir, "src", "staged.ts"), "export const staged = true;\n", "utf-8");
    execGit(dir, ["add", "src/staged.ts"]);
    writeFileSync(join(dir, "notes.md"), "# untracked\n", "utf-8");

    const cli = await runCli(["scope", "inspect", dir, "--scope", "tracked", "--json"], dir);
    const runtime = await runSkillRuntime(["scope-inspect", "--root", dir, "--scope", "tracked", "--json"], dir);

    expect(cli.exitCode).toBe(0);
    expect(runtime.exitCode).toBe(0);
    expect(JSON.parse(cli.logs.join("\n"))).toMatchObject({
      scope: {
        requested_mode: "tracked",
        resolved_mode: "tracked",
      },
    });
    expect(JSON.parse(runtime.logs.join("\n"))).toMatchObject({
      scope: {
        requested_mode: "tracked",
        resolved_mode: "tracked",
      },
    });
  });

  it("writes scope diagnostics for scope-aware update rebuilds", async () => {
    const dir = tempProject();
    initGitRepo(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export function main() { return 1; }\n", "utf-8");
    execGit(dir, ["add", "src/main.ts"]);
    execGit(dir, ["commit", "-q", "-m", "init"]);
    writeFileSync(join(dir, "scratch.ts"), "export const scratch = true;\n", "utf-8");

    const result = await runCli(["update", ".", "--scope", "committed"], dir);
    const scopeJson = JSON.parse(readFileSync(join(dir, ".graphify", "scope.json"), "utf-8")) as Record<string, unknown>;
    const reportText = readFileSync(join(dir, ".graphify", "GRAPH_REPORT.md"), "utf-8");

    expect(result.exitCode).toBe(0);
    expect(scopeJson).toMatchObject({
      requested_mode: "committed",
      resolved_mode: "committed",
      source: "cli",
    });
    expect(reportText).toContain("## Input Scope");
    expect(reportText).toContain("committed");
  });

  it("accepts --all as an alias for --scope all", async () => {
    const dir = tempProject();
    initGitRepo(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export function main() { return 1; }\n", "utf-8");
    execGit(dir, ["add", "src/main.ts"]);
    execGit(dir, ["commit", "-q", "-m", "init"]);
    writeFileSync(join(dir, "scratch.ts"), "export const scratch = true;\n", "utf-8");

    const result = await runCli(["detect", dir, "--all"], dir);
    const detection = JSON.parse(result.logs.join("\n")) as { files: { code: string[] }, scope: Record<string, unknown> };

    expect(result.exitCode).toBe(0);
    expect(detection.files.code).toContain(join(dir, "src", "main.ts"));
    expect(detection.files.code).toContain(join(dir, "scratch.ts"));
    expect(detection.scope).toMatchObject({
      requested_mode: "all",
      resolved_mode: "all",
    });
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

  it("checks portable .graphify artifacts while ignoring local lifecycle metadata", async () => {
    const dir = tempProject();
    const graphifyDir = join(dir, ".graphify");
    mkdirSync(graphifyDir, { recursive: true });
    writeFileSync(join(graphifyDir, "graph.json"), JSON.stringify({ nodes: [], links: [] }), "utf-8");
    writeFileSync(
      join(graphifyDir, "branch.json"),
      JSON.stringify({ branch: "feature", worktreePath: dir }, null, 2),
      "utf-8",
    );
    writeFileSync(
      join(graphifyDir, "worktree.json"),
      JSON.stringify({ gitDir: join(dir, ".git", "worktrees", "feature") }, null, 2),
      "utf-8",
    );

    const ok = await runCli(["portable-check", ".graphify"], dir, { interceptExit: true });

    expect(ok.exitCode).toBe(0);
    expect(ok.logs.join("\n")).toContain("Portable artifacts OK");

    writeFileSync(
      join(graphifyDir, "GRAPH_REPORT.md"),
      `Leaked absolute source: ${join(dir, "src", "alpha.ts")}\n`,
      "utf-8",
    );

    const failed = await runCli(["portable-check", ".graphify"], dir, { interceptExit: true });

    expect(failed.exitCode).toBe(1);
    expect(failed.errors.join("\n")).toContain("absolute_path");
    expect(failed.errors.join("\n")).toContain("GRAPH_REPORT.md");
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

  it("supports cluster-only on oversized graphs by skipping HTML export", async () => {
    const dir = tempProject();
    writeLargeGraph(dir);

    const result = await runCli(["cluster-only", dir], dir);

    expect(result.exitCode).toBe(0);
    expect(result.warnings.join("\n")).toContain("HTML export skipped");
    expect(existsSync(join(dir, ".graphify", "GRAPH_REPORT.md"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "graph.json"))).toBe(true);
    expect(existsSync(join(dir, ".graphify", "graph.html"))).toBe(false);
  });

  it("preserves renamed community labels across hook-rebuild update", async () => {
    const dir = tempProject();
    // Seed a minimal git-tracked code fixture so rebuildCode has something to extract.
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "alpha.ts"), "export function alpha() { return 1; }\n", "utf-8");
    writeFileSync(join(dir, "src", "beta.ts"), "export function beta() { return 2; }\n", "utf-8");
    await execGit(dir, ["init", "-q"]);
    await execGit(dir, ["add", "."]);
    await execGit(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "seed"]);

    // First update to materialize the graph + manifest.
    const first = await runCli(["update", dir], dir);
    expect(first.exitCode).toBe(0);

    // Rename a community label and assert it survives the next rebuild.
    const labelsPath = join(dir, ".graphify", ".graphify_labels.json");
    expect(existsSync(labelsPath)).toBe(true);
    const initial = JSON.parse(readFileSync(labelsPath, "utf-8")) as Record<string, string>;
    const firstCid = Object.keys(initial)[0]!;
    initial[firstCid] = "CoreServices";
    writeFileSync(labelsPath, JSON.stringify(initial, null, 2), "utf-8");

    const second = await runCli(["update", dir], dir);
    expect(second.exitCode).toBe(0);

    const persisted = JSON.parse(readFileSync(labelsPath, "utf-8")) as Record<string, string>;
    expect(Object.values(persisted)).toContain("CoreServices");
    const rebuiltGraph = JSON.parse(
      readFileSync(join(dir, ".graphify", "graph.json"), "utf-8"),
    ) as { graph?: { community_labels?: Record<string, string> } };
    expect(Object.values(rebuiltGraph.graph?.community_labels ?? {})).toContain("CoreServices");
  });

  it("preserves renamed community labels across cluster-only rebuilds", async () => {
    const dir = tempProject();
    const graphDir = join(dir, ".graphify");
    mkdirSync(graphDir, { recursive: true });
    const graphPath = join(graphDir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: { community_labels: { "0": "Community 0", "1": "Community 1" } },
        nodes: [
          { id: "alpha", label: "AlphaService", source_file: "src/alpha.ts", file_type: "code", community: 0, community_name: "Community 0" },
          { id: "beta", label: "BetaRepository", source_file: "src/beta.ts", file_type: "code", community: 0, community_name: "Community 0" },
          { id: "gamma", label: "GammaDocs", source_file: "docs/gamma.md", file_type: "document", community: 1, community_name: "Community 1" },
          { id: "delta", label: "DeltaWiki", source_file: "docs/delta.md", file_type: "document", community: 1, community_name: "Community 1" },
        ],
        links: [
          { source: "alpha", target: "beta", relation: "uses", confidence: "EXTRACTED" },
          { source: "gamma", target: "delta", relation: "links", confidence: "EXTRACTED" },
        ],
      }, null, 2),
      "utf-8",
    );
    const labelsPath = join(graphDir, ".graphify_labels.json");
    writeFileSync(labelsPath, JSON.stringify({ "0": "AuthCore", "1": "DocsLayer" }, null, 2), "utf-8");

    const result = await runCli(["cluster-only", dir], dir);
    expect(result.exitCode).toBe(0);

    const persistedLabels = JSON.parse(readFileSync(labelsPath, "utf-8")) as Record<string, string>;
    const rebuiltGraph = JSON.parse(
      readFileSync(graphPath, "utf-8"),
    ) as { graph?: { community_labels?: Record<string, string> } };
    const persistedValues = Object.values(persistedLabels);
    expect(persistedValues).toContain("AuthCore");
    expect(persistedValues).toContain("DocsLayer");
    const graphValues = Object.values(rebuiltGraph.graph?.community_labels ?? {});
    expect(graphValues).toContain("AuthCore");
    expect(graphValues).toContain("DocsLayer");

    const analysis = JSON.parse(
      readFileSync(join(graphDir, ".graphify_analysis.json"), "utf-8"),
    ) as { labels?: Record<string, string> };
    const analysisValues = Object.values(analysis.labels ?? {});
    expect(analysisValues).toContain("AuthCore");
    expect(analysisValues).toContain("DocsLayer");
  });

  it("supports execution flow build, list, and get commands", async () => {
    const dir = tempProject();
    const graphPath = writeFlowGraph(dir);
    const flowsPath = join(dir, ".graphify", "flows.json");

    const build = await runCli(["flows", "build", "--graph", graphPath, "--out", flowsPath], dir);
    const artifact = JSON.parse(readFileSync(flowsPath, "utf-8")) as { flows: Array<{ id: string }> };
    const list = await runCli(["flows", "list", "--flows", flowsPath], dir);
    const get = await runCli(["flows", "get", artifact.flows[0]!.id, "--flows", flowsPath, "--graph", graphPath], dir);
    const runtimeList = await runSkillRuntime(["flows-list", "--flows", flowsPath], dir);
    const affected = await runCli(["affected-flows", "--flows", flowsPath, "--graph", graphPath, "--files", "src/service.ts"], dir);
    const runtimeAffected = await runSkillRuntime(["affected-flows", "--flows", flowsPath, "--graph", graphPath, "--files", "src/service.ts"], dir);

    expect(build.exitCode).toBe(0);
    expect(build.logs.join("\n")).toContain("Execution flows: 1");
    expect(list.logs.join("\n")).toContain("src/app.ts::main");
    expect(get.logs.join("\n")).toContain("src/service.ts::run");
    expect(runtimeList.logs.join("\n")).toContain("src/app.ts::main");
    expect(affected.logs.join("\n")).toContain("Affected flows: 1");
    expect(runtimeAffected.logs.join("\n")).toContain("src/service.ts::run");
  });

  it("supports focused review context commands", async () => {
    const dir = tempProject();
    const graphPath = writeFlowGraph(dir);

    const cli = await runCli([
      "review-context",
      "--graph", graphPath,
      "--files", "src/service.ts",
      "--detail-level", "minimal",
    ], dir);
    const runtime = await runSkillRuntime([
      "review-context",
      "--graph", graphPath,
      "--files", "src/service.ts",
      "--detail-level", "minimal",
    ], dir);

    expect(cli.exitCode).toBe(0);
    expect(cli.logs.join("\n")).toContain("Review context for 1 changed file(s)");
    expect(runtime.logs.join("\n")).toContain("Next tools: detect-changes, affected-flows, review-context");
  });

  it("supports risk-scored detect changes commands", async () => {
    const dir = tempProject();
    const graphPath = writeFlowGraph(dir);
    const flowsPath = join(dir, ".graphify", "flows.json");
    await runCli(["flows", "build", "--graph", graphPath, "--out", flowsPath], dir);

    const cli = await runCli([
      "detect-changes",
      "--graph", graphPath,
      "--flows", flowsPath,
      "--files", "src/service.ts",
      "--detail-level", "minimal",
    ], dir);
    const runtime = await runSkillRuntime([
      "detect-changes",
      "--graph", graphPath,
      "--flows", flowsPath,
      "--files", "src/service.ts",
      "--detail-level", "minimal",
    ], dir);

    expect(cli.exitCode).toBe(0);
    expect(cli.logs.join("\n")).toContain("Risk score:");
    expect(runtime.logs.join("\n")).toContain("Review priorities:");
  });

  it("supports compact minimal context commands", async () => {
    const dir = tempProject();
    const graphPath = writeFlowGraph(dir);
    const flowsPath = join(dir, ".graphify", "flows.json");
    await runCli(["flows", "build", "--graph", graphPath, "--out", flowsPath], dir);

    const cli = await runCli([
      "minimal-context",
      "--graph", graphPath,
      "--flows", flowsPath,
      "--files", "src/service.ts",
      "--task", "review PR",
    ], dir);
    const runtime = await runSkillRuntime([
      "minimal-context",
      "--graph", graphPath,
      "--flows", flowsPath,
      "--files", "src/service.ts",
      "--task", "review PR",
    ], dir);

    expect(cli.exitCode).toBe(0);
    expect(cli.logs.join("\n")).toContain("Next tools: detect-changes, affected-flows, review-context");
    expect(runtime.logs.join("\n")).toContain("Flows available: yes");
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

  it("supports image calibration samples and deep batch export runtime commands", async () => {
    const dir = tempProject();
    const imageDir = join(dir, ".graphify", "image-dataprep");
    const captionsDir = join(imageDir, "captions");
    mkdirSync(captionsDir, { recursive: true });
    const manifestPath = join(imageDir, "manifest.json");
    const rulesPath = join(dir, "image-routing-rules.yaml");
    const samplesRoot = join(dir, ".graphify", "calibration");
    const deepJsonl = join(imageDir, "batch", "deep.jsonl");
    writeFileSync(manifestPath, JSON.stringify({
      schema: "graphify_image_dataprep_manifest_v1",
      source_state_hash: "state",
      mode: "batch",
      artifact_count: 1,
      generated_at: "2026-04-20T00:00:00.000Z",
      artifacts: [{
        id: "artifact-a",
        path: join(dir, "a.png"),
        source_file: join(dir, "manual.pdf"),
        source_page: 1,
        source_sidecar: join(dir, "manual.md"),
        source_kind: "ocr_crop",
        mime_type: "image/png",
        sha256: "a",
      }],
    }), "utf-8");
    writeFileSync(join(captionsDir, "artifact-a.caption.json"), JSON.stringify({
      schema: "generic_image_caption_v1",
      artifact_id: "artifact-a",
      summary: "A dense flow.",
      visible_text: [],
      visual_content_type: "flow_diagram",
      semantic_density: "high",
      entity_candidates: [{ label: "A" }, { label: "B" }],
      relationship_candidates: [{ source_label: "A", target_label: "B" }],
      uncertainties: [],
      provenance: { source_file: "manual.pdf", image_path: "a.png" },
    }), "utf-8");
    writeFileSync(rulesPath, [
      "schema: graphify_image_routing_rules_v1",
      "decision: accept_matrix",
      "routes:",
      "  deep:",
      "    visual_content_types: [flow_diagram]",
      "",
    ].join("\n"), "utf-8");

    const samples = await runSkillRuntime([
      "image-calibration-samples",
      "--manifest", manifestPath,
      "--captions-dir", captionsDir,
      "--out-dir", samplesRoot,
      "--run-id", "run-1",
      "--max-samples", "1",
    ], dir);
    const deep = await runSkillRuntime([
      "image-batch-export",
      "--manifest", manifestPath,
      "--out", deepJsonl,
      "--schema", "generic_image_caption_v1",
      "--prompt", "Deep pass.",
      "--pass", "deep",
      "--captions-dir", captionsDir,
      "--rules", rulesPath,
    ], dir);

    expect(samples.exitCode).toBe(0);
    expect(existsSync(join(samplesRoot, "run-1", "samples.json"))).toBe(true);
    expect(deep.exitCode).toBe(0);
    expect(readFileSync(deepJsonl, "utf-8")).toContain("artifact-a");
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
    const discoverySamplePath = join(dir, ".graphify", "ontology", "discovery", "sample.json");
    const discoveryPromptPath = join(dir, ".graphify", "ontology", "discovery", "prompt.md");
    const discoveryProposalsPath = join(dir, ".graphify", "ontology", "discovery", "proposals.json");
    const discoveryDiffPath = join(dir, ".graphify", "ontology", "discovery", "profile-diff.json");
    const discoveryReportPath = join(dir, ".graphify", "ontology", "discovery", "report.md");
    const validationInput = join(dir, ".graphify", "profile", "registry-extraction.json");
    const reportPath = join(dir, ".graphify", "profile", "profile-report.md");
    const ontologyDir = join(dir, ".graphify", "ontology");
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
    const discovery = await runSkillRuntime([
      "profile-discovery-sample",
      "--profile-state", statePath,
      "--out", discoverySamplePath,
      "--prompt-out", discoveryPromptPath,
      "--max-files", "1",
    ], dir);
    const discoverySample = JSON.parse(readFileSync(discoverySamplePath, "utf-8"));
    writeFileSync(discoveryProposalsPath, JSON.stringify({
      schema: "graphify_ontology_discovery_proposals_v1",
      profile_hash: discoverySample.profile_hash,
      sample_hash: discoverySample.sample_hash,
      proposals: [{
        id: "proposal-node-type-001",
        kind: "node_type",
        action: "add",
        path: "/node_types/SyntheticDiscoveryEntity",
        value: { source_backed: true },
        evidence_refs: ["sample-file-001"],
        confidence: 0.7,
        rationale: "Synthetic fixture evidence.",
      }],
    }, null, 2), "utf-8");
    const discoveryDiff = await runSkillRuntime([
      "profile-discovery-diff",
      "--profile-state", statePath,
      "--proposals", discoveryProposalsPath,
      "--sample", discoverySamplePath,
      "--out", discoveryDiffPath,
      "--report", discoveryReportPath,
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
    const ontology = await runSkillRuntime([
      "ontology-output",
      "--profile-state", statePath,
      "--input", validationInput,
      "--out-dir", ontologyDir,
    ], dir);

    expect(dataprep.exitCode).toBe(0);
    expect(dataprep.logs.join("\n")).toContain("Configured dataprep");
    expect(existsSync(statePath)).toBe(true);
    expect(prompt.exitCode).toBe(0);
    expect(readFileSync(promptPath, "utf-8")).toContain("Allowed node types");
    expect(discovery.exitCode).toBe(0);
    expect(readFileSync(discoveryPromptPath, "utf-8")).toContain("Graphify Ontology Discovery Prompt");
    expect(discoveryDiff.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(discoveryDiffPath, "utf-8")).mutates_profile).toBe(false);
    expect(readFileSync(discoveryReportPath, "utf-8")).toContain("Requires user approval: true");
    expect(validation.exitCode).toBe(0);
    expect(JSON.parse(validation.logs.join("\n")).valid).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(readFileSync(reportPath, "utf-8")).toContain("# Graphify Profile Report");
    expect(readFileSync(reportPath, "utf-8")).toContain("equipment-maintenance-demo");
    expect(ontology.exitCode).toBe(0);
    expect(ontology.logs.join("\n")).toContain("Ontology outputs");
    expect(existsSync(join(ontologyDir, "nodes.json"))).toBe(true);
    expect(existsSync(join(ontologyDir, "wiki", "index.md"))).toBe(true);
  });
});

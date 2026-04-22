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

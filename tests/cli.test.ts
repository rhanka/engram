import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { getPlatformsToCheck, main } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempProfileProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-cli-profile-"));
  tempDirs.push(dir);
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
      nodes: [{ id: "a", label: "A", source_file: "manual.md", file_type: "document" }],
      links: [],
    }),
    "utf-8",
  );
  return graphPath;
}

async function runCli(args: string[], cwd: string, options: { interceptExit?: boolean } = {}) {
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;
  const logs: string[] = [];
  const errors: string[] = [];

  console.log = (...items: unknown[]) => { logs.push(items.join(" ")); };
  console.error = (...items: unknown[]) => { errors.push(items.join(" ")); };
  if (options.interceptExit) {
    process.exit = ((code?: string | number | null) => {
      throw new Error(`process.exit ${code ?? 0}`);
    }) as typeof process.exit;
  }

  process.argv = ["node", "graphify", ...args];
  process.chdir(cwd);
  try {
    await main();
    return { logs, errors, exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/^process\.exit (\d+)/);
    if (match) return { logs, errors, exitCode: Number(match[1]) };
    if (options.interceptExit) return { logs, errors: [...errors, message], exitCode: 1 };
    throw error;
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
  }
}

describe("CLI platform-scoped version checks", () => {
  it("checks only the explicitly targeted Claude platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "claude"])).toEqual(["claude"]);
    expect(getPlatformsToCheck(["claude", "install"])).toEqual(["claude"]);
  });

  it("checks only the explicitly targeted Codex platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "codex"])).toEqual(["codex"]);
    expect(getPlatformsToCheck(["codex", "install"])).toEqual(["codex"]);
  });

  it("checks only the explicitly targeted Aider and Copilot platforms", () => {
    expect(getPlatformsToCheck(["install", "--platform", "aider"])).toEqual(["aider"]);
    expect(getPlatformsToCheck(["aider", "install"])).toEqual(["aider"]);
    expect(getPlatformsToCheck(["install", "--platform", "copilot"])).toEqual(["copilot"]);
    expect(getPlatformsToCheck(["copilot", "install"])).toEqual(["copilot"]);
  });

  it("checks only the explicitly targeted Gemini platform", () => {
    expect(getPlatformsToCheck(["install", "--platform", "gemini"])).toEqual(["gemini"]);
    expect(getPlatformsToCheck(["gemini", "install"])).toEqual(["gemini"]);
  });

  it("checks only the explicitly targeted upstream v4 assistant platforms", () => {
    expect(getPlatformsToCheck(["install", "--platform", "antigravity"])).toEqual(["antigravity"]);
    expect(getPlatformsToCheck(["antigravity", "install"])).toEqual(["antigravity"]);
    expect(getPlatformsToCheck(["install", "--platform", "hermes"])).toEqual(["hermes"]);
    expect(getPlatformsToCheck(["hermes", "install"])).toEqual(["hermes"]);
    expect(getPlatformsToCheck(["install", "--platform", "kiro"])).toEqual(["kiro"]);
    expect(getPlatformsToCheck(["kiro", "install"])).toEqual(["kiro"]);
    expect(getPlatformsToCheck(["install", "--platform", "vscode-copilot-chat"])).toEqual(["vscode-copilot-chat"]);
    expect(getPlatformsToCheck(["vscode", "install"])).toEqual(["vscode-copilot-chat"]);
  });

  it("does not warn for unrelated global skills on generic commands", () => {
    expect(getPlatformsToCheck(["hook", "status"])).toEqual([]);
    expect(getPlatformsToCheck(["query", "--graph", "graphify-out/graph.json", "install flow"])).toEqual([]);
  });
});

describe("profile CLI commands", () => {
  it("validates project config and writes normalized profile artifacts", async () => {
    const dir = tempProfileProject();
    const configOut = join(dir, ".graphify", "profile", "project-config.normalized.json");
    const profileOut = join(dir, ".graphify", "profile", "ontology-profile.normalized.json");

    const result = await runCli([
      "profile", "validate",
      "--config", join(dir, "graphify.yaml"),
      "--out", configOut,
      "--profile-out", profileOut,
    ], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Profile config valid: equipment-maintenance-demo");
    expect(JSON.parse(readFileSync(profileOut, "utf-8")).id).toBe("equipment-maintenance-demo");
  });

  it("runs profile dataprep, validates extraction, and writes a profile report", async () => {
    const dir = tempProfileProject();
    const statePath = join(dir, ".graphify", "profile", "profile-state.json");
    const extractionPath = join(dir, ".graphify", "profile", "registry-extraction.json");
    const reportPath = join(dir, ".graphify", "profile", "profile-report.md");
    const ontologyDir = join(dir, ".graphify", "ontology");
    const graphPath = writeGraph(dir);

    const dataprep = await runCli([
      "profile", "dataprep", dir,
      "--config", join(dir, "graphify.yaml"),
      "--out-dir", ".graphify",
    ], dir);
    const validation = await runCli([
      "profile", "validate-extraction",
      "--profile-state", statePath,
      "--input", extractionPath,
    ], dir);
    const report = await runCli([
      "profile", "report",
      "--profile-state", statePath,
      "--graph", graphPath,
      "--out", reportPath,
    ], dir);
    const ontology = await runCli([
      "profile", "ontology-output",
      "--profile-state", statePath,
      "--input", extractionPath,
      "--out-dir", ontologyDir,
    ], dir);

    expect(dataprep.exitCode).toBe(0);
    expect(dataprep.logs.join("\n")).toContain("Profile dataprep");
    expect(existsSync(statePath)).toBe(true);
    expect(validation.exitCode).toBe(0);
    expect(validation.logs.join("\n")).toContain("Valid: yes");
    expect(report.exitCode).toBe(0);
    expect(readFileSync(reportPath, "utf-8")).toContain("# Graphify Profile Report");
    expect(ontology.exitCode).toBe(0);
    expect(ontology.logs.join("\n")).toContain("Ontology outputs");
    expect(existsSync(join(ontologyDir, "manifest.json"))).toBe(true);
  });

  it("does not fake local LLM extraction through an implicit graphify path command", async () => {
    const dir = tempProfileProject();

    const result = await runCli([".", "--config", join(dir, "graphify.yaml")], dir, { interceptExit: true });

    expect(result.exitCode).toBe(1);
    expect(result.logs.join("\n")).not.toContain("extraction complete");
    expect(existsSync(join(dir, ".graphify", "profile", "profile-state.json"))).toBe(false);
  });
});

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

  it("checks positional install platforms and Kimi Code", () => {
    expect(getPlatformsToCheck(["install", "opencode"])).toEqual(["opencode"]);
    expect(getPlatformsToCheck(["install", "--platform", "kimi"])).toEqual(["kimi"]);
    expect(getPlatformsToCheck(["install", "kimi"])).toEqual(["kimi"]);
  });

  it("does not warn for unrelated global skills on generic commands", () => {
    expect(getPlatformsToCheck(["hook", "status"])).toEqual([]);
    expect(getPlatformsToCheck(["query", "--graph", "graphify-out/graph.json", "install flow"])).toEqual([]);
    expect(getPlatformsToCheck(["query", "kimi"])).toEqual([]);
  });

  it("warns and repairs when a version marker exists but SKILL.md is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-missing-skill-"));
    tempDirs.push(dir);
    const previousHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const skillDir = join(dir, ".agents", "skills", "graphify");
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, ".graphify_version"), "0.0.1", "utf-8");

      const result = await runCli(["install", "--platform", "codex"], dir);

      expect(result.logs.join("\n")).toContain("SKILL.md is missing");
      expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("supports upstream positional install platform syntax", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-install-positional-"));
    tempDirs.push(dir);
    const previousHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const result = await runCli(["install", "opencode"], dir);

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, ".config", "opencode", "skills", "graphify", "SKILL.md"))).toBe(true);
      expect(existsSync(join(dir, ".claude", "skills", "graphify", "SKILL.md"))).toBe(false);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("rejects conflicting install platform selectors", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-install-conflict-"));
    tempDirs.push(dir);
    const previousHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const result = await runCli(["install", "opencode", "--platform", "codex"], dir, {
        interceptExit: true,
      });

      expect(result.exitCode).toBe(1);
      expect(result.errors.join("\n")).toContain("specify install platform only once");
      expect(existsSync(join(dir, ".config", "opencode", "skills", "graphify", "SKILL.md"))).toBe(false);
      expect(existsSync(join(dir, ".agents", "skills", "graphify", "SKILL.md"))).toBe(false);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("supports Kimi Code as an install platform", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-install-kimi-"));
    tempDirs.push(dir);
    const previousHome = process.env.HOME;
    process.env.HOME = dir;
    try {
      const result = await runCli(["install", "--platform", "kimi"], dir);

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, ".kimi", "skills", "graphify", "SKILL.md"))).toBe(true);
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("removes project integrations and graph state with top-level uninstall --purge", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-uninstall-all-"));
    tempDirs.push(dir);
    const previousHome = process.env.HOME;
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.HOME = join(dir, "home");
    process.env.CLAUDE_CONFIG_DIR = join(dir, "claude-config");
    try {
      await runCli(["codex", "install"], dir);
      await runCli(["gemini", "install"], dir);
      mkdirSync(join(dir, ".graphify"), { recursive: true });
      writeFileSync(join(dir, ".graphify", "graph.json"), "{\"nodes\":[],\"links\":[]}", "utf-8");
      mkdirSync(join(dir, "graphify-out"), { recursive: true });
      writeFileSync(join(dir, "graphify-out", "graph.json"), "{\"nodes\":[],\"links\":[]}", "utf-8");

      const result = await runCli(["uninstall", "--purge"], dir);

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(dir, ".graphify"))).toBe(false);
      expect(existsSync(join(dir, "graphify-out"))).toBe(false);
      expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(dir, "GEMINI.md"))).toBe(false);
      if (existsSync(join(dir, ".codex", "hooks.json"))) {
        expect(readFileSync(join(dir, ".codex", "hooks.json"), "utf-8")).not.toContain("graphify");
      }
      if (existsSync(join(dir, ".gemini", "settings.json"))) {
        expect(readFileSync(join(dir, ".gemini", "settings.json"), "utf-8")).not.toContain("graphify");
      }
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir;
      }
    }
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
    const discoveryDir = join(dir, ".graphify", "ontology", "discovery");
    const discoverySamplePath = join(discoveryDir, "sample.json");
    const discoveryPromptPath = join(discoveryDir, "prompt.md");
    const discoveryProposalsPath = join(discoveryDir, "proposals.json");
    const discoveryDiffPath = join(discoveryDir, "profile-diff.json");
    const discoveryReportPath = join(discoveryDir, "report.md");
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
    const discovery = await runCli([
      "profile", "discover",
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
        id: "proposal-relation-001",
        kind: "relation_type",
        action: "add",
        path: "/relation_types/synthetic_related_to",
        value: { source: "MaintenanceProcess", target: "Component", requires_evidence: true },
        evidence_refs: ["sample-file-001"],
      }],
    }, null, 2), "utf-8");
    const discoveryDiff = await runCli([
      "profile", "discovery-diff",
      "--profile-state", statePath,
      "--proposals", discoveryProposalsPath,
      "--sample", discoverySamplePath,
      "--out", discoveryDiffPath,
      "--report", discoveryReportPath,
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
    expect(discovery.exitCode).toBe(0);
    expect(readFileSync(discoveryPromptPath, "utf-8")).toContain("Graphify Ontology Discovery Prompt");
    expect(discoveryDiff.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(discoveryDiffPath, "utf-8")).requires_user_approval).toBe(true);
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

describe("check-update CLI", () => {
  it("reports pending semantic updates from .graphify/needs_update", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-check-update-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, ".graphify"), { recursive: true });
    writeFileSync(join(dir, ".graphify", "needs_update"), "1\n", "utf-8");

    const result = await runCli(["check-update", "."], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Pending semantic updates");
    expect(result.logs.join("\n")).toContain("graphify skill with --update");
  });

  it("reports when graph state is current", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-check-update-clean-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, ".graphify"), { recursive: true });

    const result = await runCli(["check-update", "."], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs.join("\n")).toContain("Graph state looks current");
  });
});

describe("query CLI", () => {
  it("prefers exact node label matches over longer substring matches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-cli-query-"));
    tempDirs.push(dir);
    const graphDir = join(dir, ".graphify");
    mkdirSync(graphDir, { recursive: true });
    const graphPath = join(graphDir, "graph.json");
    writeFileSync(
      graphPath,
      JSON.stringify({
        directed: false,
        graph: {},
        nodes: [
          { id: "helper", label: "MyFunctionHelpers", source_file: "helpers.ts", file_type: "code" },
          { id: "exact", label: "MyFunction", source_file: "exact.ts", file_type: "code" },
        ],
        links: [],
      }),
      "utf-8",
    );

    const result = await runCli(["query", "MyFunction", "--graph", graphPath], dir);

    expect(result.exitCode).toBe(0);
    expect(result.logs[0]).toContain("NODE MyFunction [");
  });
});

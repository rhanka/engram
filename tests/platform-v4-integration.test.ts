import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function runCliInTemp(command: string[]): Promise<{ home: string; project: string }> {
  const home = mkdtempSync(join(tmpdir(), "graphify-v4-home-"));
  const project = mkdtempSync(join(tmpdir(), "graphify-v4-project-"));
  tempDirs.push(home, project);

  await runCliWithEnvironment(command, home, project);

  return { home, project };
}

async function runCliWithEnvironment(command: string[], home: string, project: string): Promise<void> {
  const previousHome = process.env.HOME;
  const previousArgv = process.argv;
  const previousCwd = process.cwd();
  process.env.HOME = home;
  process.chdir(project);

  try {
    const { main } = await import("../src/cli.js");
    process.argv = ["node", "graphify", ...command];
    await main();
  } finally {
    process.chdir(previousCwd);
    process.argv = previousArgv;
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
}

describe("upstream v4 assistant platform installs", () => {
  it("installs Google Antigravity rules, workflow, and global skill", async () => {
    const { home, project } = await runCliInTemp(["antigravity", "install"]);

    expect(existsSync(join(project, ".agent", "rules", "graphify.md"))).toBe(true);
    expect(existsSync(join(project, ".agent", "workflows", "graphify.md"))).toBe(true);
    expect(existsSync(join(home, ".agent", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".agent", "skills", "graphify", ".graphify_version"))).toBe(true);
    expect(readFileSync(join(project, ".agent", "rules", "graphify.md"), "utf-8")).toContain("---");
    expect(readFileSync(join(project, ".agent", "rules", "graphify.md"), "utf-8")).toContain("description: graphify knowledge graph context");
    expect(readFileSync(join(project, ".agent", "workflows", "graphify.md"), "utf-8")).toContain("---");
    expect(readFileSync(join(project, ".agent", "workflows", "graphify.md"), "utf-8")).toContain("command: /graphify");
  });

  it("reinstalls Google Antigravity without duplicating frontmatter", async () => {
    const { home, project } = await runCliInTemp(["antigravity", "install"]);

    await runCliWithEnvironment(["antigravity", "install"], home, project);

    const rule = readFileSync(join(project, ".agent", "rules", "graphify.md"), "utf-8");
    const workflow = readFileSync(join(project, ".agent", "workflows", "graphify.md"), "utf-8");

    expect(rule.match(/^---$/gm)).toHaveLength(2);
    expect(workflow.match(/^---$/gm)).toHaveLength(2);
    expect(rule.match(/description: graphify knowledge graph context/g)).toHaveLength(1);
    expect(workflow.match(/command: \/graphify/g)).toHaveLength(1);
  });

  it("installs Kiro skill and always-on steering file in the project", async () => {
    const { project } = await runCliInTemp(["kiro", "install"]);

    const skillPath = join(project, ".kiro", "skills", "graphify", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    expect(existsSync(join(project, ".kiro", "skills", "graphify", ".graphify_version"))).toBe(true);
    expect(readFileSync(skillPath, "utf-8")).toContain('description: "');
    expect(readFileSync(join(project, ".kiro", "steering", "graphify.md"), "utf-8")).toContain("inclusion: always");
  });

  it("installs VS Code Copilot Chat instructions and global Copilot skill", async () => {
    const { home, project } = await runCliInTemp(["vscode", "install"]);

    expect(readFileSync(join(project, ".github", "copilot-instructions.md"), "utf-8")).toContain("## graphify");
    expect(existsSync(join(home, ".copilot", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(home, ".copilot", "skills", "graphify", ".graphify_version"))).toBe(true);
  });
});

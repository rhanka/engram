import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { agentsInstall, getAgentsMdSection, getInvocationExample } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Aider integration contract", () => {
  it("uses /graphify as the explicit Aider invocation hint", () => {
    expect(getInvocationExample("aider")).toBe("/graphify .");
  });

  it("writes AGENTS.md rules without hook-specific Codex/OpenCode details", () => {
    const section = getAgentsMdSection("aider");

    expect(section).toContain("use the installed `graphify` skill");
    expect(section).toContain(".graphify/cache/");
    expect(section).toContain(
      "git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update",
    );
    expect(section).not.toContain("$graphify");
    expect(section).not.toContain(".codex/hooks.json");
    expect(section).not.toContain(".opencode/plugins");
  });

  it("installs project-scoped Aider instructions via AGENTS.md only", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-aider-"));
    tempDirs.push(dir);

    agentsInstall(dir, "aider");

    const agents = readFileSync(join(dir, "AGENTS.md"), "utf-8");
    expect(agents).toContain("## graphify");
    expect(agents).toContain("use the installed `graphify` skill");
    expect(existsSync(join(dir, ".codex", "hooks.json"))).toBe(false);
    expect(existsSync(join(dir, "opencode.json"))).toBe(false);
  });

  it("renders an Aider-specific global skill with sequential semantic extraction", async () => {
    const home = mkdtempSync(join(tmpdir(), "graphify-aider-home-"));
    tempDirs.push(home);

    const previousHome = process.env.HOME;
    const previousArgv = process.argv;
    process.env.HOME = home;

    try {
      const { main } = await import("../src/cli.js");
      process.argv = ["node", "graphify", "install", "--platform", "aider"];
      await main();

      const skillPath = join(home, ".aider", "graphify", "SKILL.md");
      const skill = readFileSync(skillPath, "utf-8");
      expect(skill).toContain("sequential extraction on Aider");
      expect(skill).toContain("Semantic extraction: N files (sequential - Aider)");
      expect(skill).not.toContain("MANDATORY: You MUST use the Agent tool here.");
    } finally {
      process.argv = previousArgv;
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});

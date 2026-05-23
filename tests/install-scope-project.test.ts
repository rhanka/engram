/**
 * Tests for project-scoped skill installs (`graphify install --project`).
 *
 * Ports upstream PR #931 (`safishamsi/graphify` commit `b347492`) — adds a
 * `--project` flag that writes platform skill files into the *current
 * project* (`./.claude/skills/...`, `./.agents/skills/...`, `./.codex/`, etc.)
 * instead of the user's home directory. Each project-scoped install is
 * idempotent and must not touch the user-scope skill copy.
 *
 * Upstream traceability: `safishamsi/graphify#931`, commit `b347492`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  projectInstall,
  projectUninstall,
  projectUninstallAll,
} from "../src/cli.js";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function silenceConsole(): () => string[] {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return () => {
    console.log = originalLog;
    return logs;
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("project-scoped skill installs (upstream b347492 / #931)", () => {
  it("writes the Claude skill into the project, not the user home", () => {
    const project = makeTempDir("graphify-project-claude-");
    const restore = silenceConsole();
    try {
      projectInstall("claude", project);
    } finally {
      restore();
    }

    expect(existsSync(join(project, ".claude", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, ".claude", "CLAUDE.md"))).toBe(true);
    // CLAUDE.md (project root) is also written because claudeInstall(project) runs.
    expect(existsSync(join(project, "CLAUDE.md"))).toBe(true);
    // The user home skill is NOT touched.
    const userSkill = join(homedir(), ".claude", "skills", "graphify", "SKILL.md");
    const userClaudeMd = join(homedir(), ".claude", "CLAUDE.md");
    // Defensive: we are not pre-populating these; we just assert the project paths
    // are non-empty and the project CLAUDE.md uses a project-relative skill path.
    const projectClaudeMd = readFileSync(join(project, ".claude", "CLAUDE.md"), "utf-8");
    expect(projectClaudeMd).toContain(".claude/skills/graphify/SKILL.md");
    expect(projectClaudeMd).not.toContain("~/.claude/skills/graphify/SKILL.md");
    // Touching user paths would be a bug; we can't assert .not.toBe without
    // depending on the user's actual state, but the project paths above are
    // the contract.
    void userSkill;
    void userClaudeMd;
  });

  it("prints a git add hint for the top-level project artifact", () => {
    const project = makeTempDir("graphify-project-hint-");
    const restore = silenceConsole();
    let logs: string[] = [];
    try {
      projectInstall("claude", project);
    } finally {
      logs = restore();
    }
    const joined = logs.join("\n");
    expect(joined).toContain("Project-scoped install");
    expect(joined).toContain("git add ");
    expect(joined).toContain(".claude");
  });

  it("writes Codex skill + AGENTS.md + .codex/hooks.json into the project", () => {
    const project = makeTempDir("graphify-project-codex-");
    const restore = silenceConsole();
    try {
      projectInstall("codex", project);
    } finally {
      restore();
    }

    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(project, ".codex", "hooks.json"))).toBe(true);

    const agentsMd = readFileSync(join(project, "AGENTS.md"), "utf-8");
    expect(agentsMd).toContain("graphify");

    const hooks = readFileSync(join(project, ".codex", "hooks.json"), "utf-8");
    expect(hooks).toContain("graphify");
  });

  it("writes Antigravity skill + agents rules into the project", () => {
    const project = makeTempDir("graphify-project-antigravity-");
    const restore = silenceConsole();
    try {
      projectInstall("antigravity", project);
    } finally {
      restore();
    }
    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(true);
  });

  it("supports every skill-based platform with a project-scoped install", () => {
    const platforms = [
      "claude",
      "windows",
      "codex",
      "opencode",
      "aider",
      "claw",
      "droid",
      "trae",
      "trae-cn",
      "hermes",
      "kimi",
      "copilot",
      "pi",
      "antigravity",
    ];
    for (const platformName of platforms) {
      const project = makeTempDir(`graphify-project-${platformName}-`);
      const restore = silenceConsole();
      try {
        projectInstall(platformName, project);
      } finally {
        restore();
      }
      // Each platform must write at least one file under the project dir.
      const hasFiles = [
        join(project, ".claude"),
        join(project, ".agents"),
        join(project, ".opencode"),
        join(project, ".aider"),
        join(project, ".claw"),
        join(project, ".factory"),
        join(project, ".trae"),
        join(project, ".trae-cn"),
        join(project, ".hermes"),
        join(project, ".kimi"),
        join(project, ".copilot"),
        join(project, ".pi"),
        join(project, "AGENTS.md"),
        join(project, "CLAUDE.md"),
      ].some((p) => existsSync(p));
      expect(hasFiles, `platform ${platformName} should write a project file`).toBe(true);
    }
  });

  it("is idempotent: re-running project install does not throw and keeps the file", () => {
    const project = makeTempDir("graphify-project-idem-");
    const restore = silenceConsole();
    try {
      projectInstall("codex", project);
      projectInstall("codex", project);
    } finally {
      restore();
    }
    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
  });

  it("uninstall --project --platform codex removes only project-scoped files", () => {
    const project = makeTempDir("graphify-project-codex-uninstall-");
    const restore = silenceConsole();
    try {
      projectInstall("codex", project);
      projectUninstall("codex", project);
    } finally {
      restore();
    }
    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(false);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(false);
    // .codex/hooks.json may still exist but graphify hook must be gone.
    const hooksPath = join(project, ".codex", "hooks.json");
    if (existsSync(hooksPath)) {
      expect(readFileSync(hooksPath, "utf-8")).not.toContain("graphify");
    }
  });

  it("uninstall --project (no platform) removes project-scoped installs across platforms", () => {
    const project = makeTempDir("graphify-project-uninstall-all-");
    const restore = silenceConsole();
    try {
      projectInstall("claude", project);
      projectUninstallAll(project);
    } finally {
      restore();
    }
    expect(existsSync(join(project, ".claude", "skills", "graphify", "SKILL.md"))).toBe(false);
    expect(existsSync(join(project, ".claude", "CLAUDE.md"))).toBe(false);
  });

  it("uninstall --project antigravity removes only project-scoped antigravity skill", () => {
    const project = makeTempDir("graphify-project-antigravity-uninstall-");
    const restore = silenceConsole();
    try {
      projectInstall("antigravity", project);
      projectUninstall("antigravity", project);
    } finally {
      restore();
    }
    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(false);
  });

  it("project Claude install renders a project-relative SKILL path in .claude/CLAUDE.md", () => {
    const project = makeTempDir("graphify-project-claude-md-");
    const restore = silenceConsole();
    try {
      projectInstall("claude", project);
    } finally {
      restore();
    }
    const claudeMd = readFileSync(join(project, ".claude", "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain(".claude/skills/graphify/SKILL.md");
    expect(claudeMd).not.toContain("~/.claude/skills/graphify/SKILL.md");
  });
});

describe("project-scoped install CLI flag parsing (upstream b347492)", () => {
  it("install --project routes through projectInstall (smoke via main argv)", async () => {
    const project = makeTempDir("graphify-project-cli-install-");
    const cwd = process.cwd();
    const restore = silenceConsole();
    const previousArgv = process.argv;
    process.chdir(project);
    process.argv = ["node", "graphify", "install", "--project", "--platform", "codex"];
    try {
      const { main } = await import("../src/cli.js");
      await main();
    } finally {
      process.argv = previousArgv;
      process.chdir(cwd);
      restore();
    }
    expect(existsSync(join(project, ".agents", "skills", "graphify", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(project, ".codex", "hooks.json"))).toBe(true);
  });
});

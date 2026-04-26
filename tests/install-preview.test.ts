import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  agentsInstall,
  globalSkillInstallPreview,
  platformInstallPreview,
} from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("install mutation previews", () => {
  it("lists Codex project files and hooks before install", () => {
    const preview = platformInstallPreview("/repo", "codex");

    expect(preview.writes).toEqual([
      resolve("/repo/AGENTS.md"),
      resolve("/repo/.codex/hooks.json"),
    ]);
    expect(preview.hooks).toEqual([".codex/hooks.json: PreToolUse Bash graphify reminder"]);
    expect(JSON.stringify(preview)).not.toContain("graphify-out");
  });

  it("lists Gemini project files and MCP config", () => {
    const preview = platformInstallPreview("/repo", "gemini");

    expect(preview.writes).toEqual([
      resolve("/repo/GEMINI.md"),
      resolve("/repo/.gemini/settings.json"),
    ]);
    expect(preview.hooks).toEqual([".gemini/settings.json: mcpServers.graphify stdio server"]);
  });

  it("lists global skill files and version marker", () => {
    const preview = globalSkillInstallPreview("codex");

    expect(preview.writes.some((path) => path.endsWith(".agents/skills/graphify/SKILL.md"))).toBe(true);
    expect(preview.writes.some((path) => path.endsWith(".agents/skills/graphify/.graphify_version"))).toBe(true);
  });

  it("uses CLAUDE_CONFIG_DIR for the Claude global skill destination when set", () => {
    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = "/tmp/claude-config";
    try {
      const preview = globalSkillInstallPreview("claude");
      expect(preview.writes).toEqual(
        expect.arrayContaining([
          resolve("/tmp/claude-config/skills/graphify/SKILL.md"),
          resolve("/tmp/claude-config/skills/graphify/.graphify_version"),
        ]),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
      } else {
        process.env.CLAUDE_CONFIG_DIR = previous;
      }
    }
  });

  it("lists upstream v4 platform project files", () => {
    expect(platformInstallPreview("/repo", "antigravity").writes).toEqual([
      resolve("/repo/.agent/rules/graphify.md"),
      resolve("/repo/.agent/workflows/graphify.md"),
    ]);

    expect(platformInstallPreview("/repo", "kiro").writes).toEqual([
      resolve("/repo/.kiro/skills/graphify/SKILL.md"),
      resolve("/repo/.kiro/skills/graphify/.graphify_version"),
      resolve("/repo/.kiro/steering/graphify.md"),
    ]);

    expect(platformInstallPreview("/repo", "vscode-copilot-chat").writes).toEqual([
      resolve("/repo/.github/copilot-instructions.md"),
    ]);
  });

  it("lists global skill files for upstream v4 assistant platforms", () => {
    for (const platformName of ["hermes", "antigravity", "vscode-copilot-chat"]) {
      const preview = globalSkillInstallPreview(platformName);
      expect(preview.writes.some((path) => path.endsWith("skills/graphify/SKILL.md"))).toBe(true);
      expect(preview.writes.some((path) => path.endsWith("skills/graphify/.graphify_version"))).toBe(true);
    }
  });

  it("prints the preview before mutating project install files", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-install-preview-"));
    tempDirs.push(dir);
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
    try {
      agentsInstall(dir, "codex");
    } finally {
      console.log = originalLog;
    }

    expect(logs[0]).toContain("Preview: graphify codex install will touch:");
    expect(logs.join("\n")).toContain(resolve(dir, "AGENTS.md"));
    expect(logs.join("\n")).toContain(".codex/hooks.json: PreToolUse Bash graphify reminder");
  });
});

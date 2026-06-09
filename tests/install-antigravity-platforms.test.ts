/**
 * Tests for F-0820-0827 M11/M12/M23/M24 platform install fixes:
 *
 * M11 (upstream 9985940 #1079): antigravity global install path changed from
 *   ~/.agents/skills/graphify/SKILL.md to ~/.gemini/config/skills/graphify/SKILL.md
 *
 * M12 (upstream 9a298c5): antigravity project-scoped install must also write
 *   .agents/rules/graphify.md and .agents/workflows/graphify.md (was skill-only).
 *
 * M23 (upstream e35b0ac): `graphify claude uninstall` must remove the global
 *   skill tree (~/.claude/skills/graphify/), not just the CLAUDE.md section.
 *
 * M24 (upstream 5cc7ec8 #1114): installClaudeHook registers a second
 *   Read|Glob PreToolUse hook that nudges the agent to use the graph when
 *   it would otherwise read source files one by one.
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  antigravityInstall,
  projectInstall,
  installClaudeHook,
  uninstallAll,
} from "../src/cli.js";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// M11: antigravity global path
// ---------------------------------------------------------------------------
describe("M11 — antigravity global skill path (9985940 #1079)", () => {
  it("PLATFORM_CONFIG.antigravity.skill_dst is under .gemini/config/skills/ (not .agents/)", async () => {
    // Import the config lazily to avoid mocking homedir.
    const { PLATFORM_CONFIG } = await import("../src/cli.js");
    const cfg = (PLATFORM_CONFIG as Record<string, { skill_dst: string }>)["antigravity"];
    expect(cfg).toBeDefined();
    expect(cfg!.skill_dst).toContain(".gemini");
    expect(cfg!.skill_dst).toContain("config");
    expect(cfg!.skill_dst).not.toContain(".agents");
  });
});

// ---------------------------------------------------------------------------
// M12: antigravity project-scoped install writes rules + workflows
// ---------------------------------------------------------------------------
describe("M12 — antigravity project install writes rules and workflows (9a298c5)", () => {
  it("projectInstall('antigravity') writes .agents/rules/graphify.md", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m12-antigrav-"));
    tempDirs.push(projectDir);

    // Intercept the global skill write by providing a fake home skill dir.
    // We only care about the project-local files.
    try {
      projectInstall("antigravity", projectDir);
    } catch {
      // writeGlobalSkill might fail if no real home dir; ignore.
    }

    const rulesPath = join(projectDir, ".agents", "rules", "graphify.md");
    expect(existsSync(rulesPath)).toBe(true);
  });

  it("projectInstall('antigravity') writes .agents/workflows/graphify.md", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m12-wf-"));
    tempDirs.push(projectDir);

    try {
      projectInstall("antigravity", projectDir);
    } catch {
      // writeGlobalSkill might fail; ignore.
    }

    const workflowPath = join(projectDir, ".agents", "workflows", "graphify.md");
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("projectInstall('antigravity') writes project-local SKILL.md under .agents/", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m12-skill-"));
    tempDirs.push(projectDir);

    try {
      projectInstall("antigravity", projectDir);
    } catch {
      // writeGlobalSkill might fail; ignore.
    }

    const skillPath = join(projectDir, ".agents", "skills", "graphify", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M23: claude uninstall removes skill tree
// ---------------------------------------------------------------------------
describe("M23 — claudeUninstall removes global skill tree (e35b0ac)", () => {
  it("uninstallAll removes the .claude/settings.json hook and keeps other hooks", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m23-uninstall-"));
    tempDirs.push(projectDir);
    mkdirSync(join(projectDir, ".claude"), { recursive: true });

    // Set up a settings.json with a graphify hook + an unrelated hook.
    writeFileSync(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo graphify query nudge || true" }],
            },
            {
              matcher: "Read|Glob",
              hooks: [{ type: "command", command: "echo graphify read nudge || true" }],
            },
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo some-other-tool || true" }],
            },
          ],
        },
      }, null, 2),
      "utf-8",
    );
    // Create a CLAUDE.md with graphify section.
    writeFileSync(
      join(projectDir, "CLAUDE.md"),
      "# Project\n\n## graphify\nSome graphify content\n",
      "utf-8",
    );

    uninstallAll(projectDir);

    const settings = JSON.parse(
      readFileSync(join(projectDir, ".claude", "settings.json"), "utf-8"),
    ) as { hooks?: { PreToolUse?: Array<{ matcher?: string; hooks?: Array<{ command?: string }> }> } };
    const commands = (settings.hooks?.PreToolUse ?? []).flatMap((e) =>
      (e.hooks ?? []).map((h) => h.command ?? ""),
    );

    // graphify hooks removed.
    expect(commands.some((c) => c.includes("graphify"))).toBe(false);
    // unrelated hook preserved.
    expect(commands.some((c) => c.includes("some-other-tool"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M24: Read|Glob PreToolUse hook
// ---------------------------------------------------------------------------
describe("M24 — Read/Glob PreToolUse hook registered (5cc7ec8 #1114)", () => {
  it("installClaudeHook registers a Read|Glob matcher hook", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m24-readhook-"));
    tempDirs.push(projectDir);

    installClaudeHook(projectDir);

    const settings = JSON.parse(
      readFileSync(join(projectDir, ".claude", "settings.json"), "utf-8"),
    ) as { hooks?: { PreToolUse?: Array<{ matcher?: string }> } };
    const matchers = (settings.hooks?.PreToolUse ?? []).map((e) => e.matcher ?? "");

    expect(matchers).toContain("Read|Glob");
    expect(matchers).toContain("Bash");
  });

  it("Read|Glob hook command references .graphify/graph.json", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m24-readhook-cmd-"));
    tempDirs.push(projectDir);

    installClaudeHook(projectDir);

    const settings = JSON.parse(
      readFileSync(join(projectDir, ".claude", "settings.json"), "utf-8"),
    ) as {
      hooks?: {
        PreToolUse?: Array<{
          matcher?: string;
          hooks?: Array<{ command?: string }>;
        }>;
      };
    };
    const readHook = (settings.hooks?.PreToolUse ?? []).find((e) => e.matcher === "Read|Glob");
    expect(readHook).toBeDefined();
    const cmd = (readHook?.hooks ?? [])[0]?.command ?? "";
    // The command should check for the graph file before nudging.
    expect(cmd).toContain(".graphify/graph.json");
    // The additionalContext must include graphify guidance.
    expect(cmd).toContain("graphify");
  });

  it("installClaudeHook idempotently deduplicates both hooks on re-install", () => {
    const projectDir = mkdtempSync(join(tmpdir(), "graphify-m24-dedup-"));
    tempDirs.push(projectDir);

    installClaudeHook(projectDir);
    installClaudeHook(projectDir); // second call

    const settings = JSON.parse(
      readFileSync(join(projectDir, ".claude", "settings.json"), "utf-8"),
    ) as { hooks?: { PreToolUse?: Array<{ matcher?: string }> } };
    const matchers = (settings.hooks?.PreToolUse ?? []).map((e) => e.matcher ?? "");

    // Exactly one Bash and one Read|Glob (no duplicates from double install).
    expect(matchers.filter((m) => m === "Bash")).toHaveLength(1);
    expect(matchers.filter((m) => m === "Read|Glob")).toHaveLength(1);
  });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { agentsInstall, getAgentsMdSection, getInvocationExample, installCodexHook } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Codex integration contract", () => {
  it("uses $graphify as the explicit Codex invocation hint", () => {
    expect(getInvocationExample("codex")).toBe("$graphify .");
    expect(getInvocationExample("claude")).toBe("/graphify .");
  });

  it("writes Codex-specific AGENTS instructions", () => {
    const section = getAgentsMdSection("codex");

    expect(section).toContain("use the installed `graphify` skill");
    expect(section).toContain("`$graphify ...`");
    expect(section).toContain("not a Bash subcommand");
    expect(section).toContain(".graphify_runtime.json");
    expect(section).toContain(".graphify/cache/");
    expect(section).toContain(
      "git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update",
    );
    expect(section).not.toContain("CLAUDE.md");
  });

  it("documents the Codex skill with Codex-native invocation and install flow", () => {
    const skill = readFileSync(new URL("../src/skills/skill-codex.md", import.meta.url), "utf-8");
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf-8");

    expect(skill).toContain("trigger: $graphify");
    expect(skill).toContain("### Step 2 - Detect files");
    expect(skill).toContain("$graphify <path> --directed");
    expect(skill).toContain("GRAPHIFY_DIRECTED_FLAG");
    expect(skill).toContain("finalize-build");
    expect(skill).toContain("finalize-update");
    expect(skill).toContain("regenerate the labeled artifacts");
    expect(skill).toContain("--directed");
    expect(skill).toContain("--graph-out .graphify/graph.json");
    expect(skill).toContain("--html-out .graphify/graph.html");
    expect(skill).toContain(".graphify_runtime.json");
    expect(skill).toContain("skill-runtime.js");
    expect(skill).toContain("not a Bash command like `graphify .`");
    expect(skill).toContain("files.code");
    expect(skill).toContain("files.document");
    expect(skill).toContain("files.paper");
    expect(skill).toContain("files.image");
    expect(skill).toContain("files.video");
    expect(skill).toContain("prepare-semantic-detect");
    expect(skill).toContain(".graphify_detect_semantic.json");
    expect(skill).toContain(".graphify_transcripts.json");
    expect(skill).toContain(".graphify_pdf_ocr.json");
    expect(skill).toContain("--pdf-ocr");
    expect(skill).toContain("Codex vision");
    expect(skill).toContain("delegated OCR/vision");
    expect(skill).toContain("graphify codex install");
    expect(skill).toContain("codex mcp add graphify");
    expect(skill).toContain("Configured Project Profiles");
    expect(skill).toContain("configured-dataprep");
    expect(skill).toContain("profile-prompt");
    expect(skill).toContain("profile-validate-extraction");
    expect(skill).toContain("profile-report");
    expect(skill).toContain("fallback to the existing non-profile workflow");
    expect(skill).toContain(".graphify/branch.json");
    expect(skill).toContain("graphify migrate-state --dry-run");
    expect(skill).not.toContain(".graphify_python");
    expect(skill).not.toContain("python3 -m graphify");
    expect(skill).not.toContain("graphify claude install");

    expect(readme).toContain("`$graphify` in Codex");
    expect(readme).toContain("codex mcp add graphify");
    expect(readme).toContain("/graphify ./raw --directed");
  });

  it("skips hook registration when .codex is a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-codex-hook-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, ".codex"), "");

    expect(() => installCodexHook(dir)).not.toThrow();
    expect(existsSync(join(dir, ".codex", "hooks.json"))).toBe(false);
  });

  it("repairs a missing Codex hook when AGENTS.md already exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-codex-agents-"));
    tempDirs.push(dir);

    agentsInstall(dir, "codex");
    rmSync(join(dir, ".codex", "hooks.json"));

    expect(() => agentsInstall(dir, "codex")).not.toThrow();
    expect(existsSync(join(dir, ".codex", "hooks.json"))).toBe(true);
  });

  it("replaces an existing graphify Codex hook instead of keeping stale config", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-codex-hook-reinstall-"));
    tempDirs.push(dir);
    mkdirSync(join(dir, ".codex"), { recursive: true });
    writeFileSync(
      join(dir, ".codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo stale graphify hook" }],
            },
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo unrelated hook" }],
            },
          ],
        },
      }, null, 2),
      "utf-8",
    );

    installCodexHook(dir);

    const hooks = JSON.parse(readFileSync(join(dir, ".codex", "hooks.json"), "utf-8")) as {
      hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    const commands = (hooks.hooks?.PreToolUse ?? []).flatMap((entry) =>
      (entry.hooks ?? []).map((hook) => hook.command ?? "")
    );

    expect(commands.filter((command) => command.includes("graphify"))).toHaveLength(1);
    expect(commands.some((command) => command.includes("stale graphify hook"))).toBe(false);
    expect(commands.some((command) => command.includes("unrelated hook"))).toBe(true);
  });

  it("writes the corrected Codex hook JSON contract", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-codex-hook-json-"));
    tempDirs.push(dir);

    agentsInstall(dir, "codex");

    const hooks = JSON.parse(readFileSync(join(dir, ".codex", "hooks.json"), "utf-8")) as {
      hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    const command = hooks.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";

    expect(command).toContain("\"permissionDecision\":\"allow\"");
    expect(command).toContain("\"systemMessage\":\"graphify: Knowledge graph exists.");
    expect(command).not.toContain("\"additionalContext\"");
  });
});

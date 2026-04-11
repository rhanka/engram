import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    expect(section).not.toContain("CLAUDE.md");
  });

  it("documents the Codex skill with Codex-native invocation and install flow", () => {
    const skill = readFileSync(new URL("../src/skills/skill-codex.md", import.meta.url), "utf-8");
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf-8");

    expect(skill).toContain("trigger: $graphify");
    expect(skill).toContain("### Step 2 - Detect files");
    expect(skill).toContain("finalize-build");
    expect(skill).toContain("finalize-update");
    expect(skill).toContain(".graphify_runtime.json");
    expect(skill).toContain("skill-runtime.js");
    expect(skill).toContain("not a Bash command like `graphify .`");
    expect(skill).toContain("files.code");
    expect(skill).toContain("files.document");
    expect(skill).toContain("files.paper");
    expect(skill).toContain("files.image");
    expect(skill).toContain("graphify codex install");
    expect(skill).toContain("codex mcp add graphify");
    expect(skill).not.toContain(".graphify_python");
    expect(skill).not.toContain("python3 -m graphify");
    expect(skill).not.toContain("graphify claude install");

    expect(readme).toContain("`$graphify` in Codex");
    expect(readme).toContain("codex mcp add graphify");
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
});

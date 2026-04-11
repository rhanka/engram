import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getAgentsMdSection, getInvocationExample } from "../src/cli.js";

describe("Codex integration contract", () => {
  it("uses $graphify as the explicit Codex invocation hint", () => {
    expect(getInvocationExample("codex")).toBe("$graphify .");
    expect(getInvocationExample("claude")).toBe("/graphify .");
  });

  it("writes Codex-specific AGENTS instructions", () => {
    const section = getAgentsMdSection("codex");

    expect(section).toContain("use the installed `graphify` skill");
    expect(section).toContain("`$graphify ...`");
    expect(section).not.toContain("CLAUDE.md");
  });

  it("documents the Codex skill with Codex-native invocation and install flow", () => {
    const skill = readFileSync(new URL("../src/skills/skill-codex.md", import.meta.url), "utf-8");
    const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf-8");

    expect(skill).toContain("trigger: $graphify");
    expect(skill).toContain("graphify codex install");
    expect(skill).toContain("codex mcp add graphify");
    expect(skill).not.toContain("graphify claude install");

    expect(readme).toContain("`$graphify` in Codex");
    expect(readme).toContain("codex mcp add graphify");
  });
});

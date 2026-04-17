import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { geminiInstall, getInvocationExample } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Gemini integration contract", () => {
  it("uses /graphify as the explicit Gemini invocation hint", () => {
    expect(getInvocationExample("gemini")).toBe("/graphify .");
  });

  it("installs GEMINI.md instructions and project MCP config", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-gemini-"));
    tempDirs.push(dir);

    geminiInstall(dir);

    const geminiMd = readFileSync(join(dir, "GEMINI.md"), "utf-8");
    const settings = JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf-8")) as {
      mcpServers?: Record<string, unknown>;
    };

    expect(geminiMd).toContain("In Gemini CLI, the reliable explicit custom command is `/graphify ...`");
    expect(geminiMd).toContain("configured `graphify` MCP server");
    expect(settings.mcpServers).toMatchObject({
      graphify: {
        command: "graphify",
        args: ["serve", ".graphify/graph.json"],
        trust: false,
      },
    });
  });

  it("skips Gemini MCP registration when .gemini is a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-gemini-file-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, ".gemini"), "");

    expect(() => geminiInstall(dir)).not.toThrow();
    expect(existsSync(join(dir, ".gemini", "settings.json"))).toBe(false);
    expect(existsSync(join(dir, "GEMINI.md"))).toBe(true);
  });

  it("bundles a Gemini custom command with TypeScript runtime instructions", () => {
    const skill = readFileSync(new URL("../src/skills/skill-gemini.toml", import.meta.url), "utf-8");
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf-8");

    expect(skill).toContain("description = ");
    expect(skill).toContain("The user's raw `/graphify ...` command arguments");
    expect(skill).toContain("runtime-info");
    expect(skill).toContain("finalize-build");
    expect(skill).toContain("graphify query");
    expect(skill).toContain("skill-runtime");
    expect(skill).toContain("prepare-semantic-detect");
    expect(skill).toContain("files.video");
    expect(skill).toContain(".graphify/branch.json");
    expect(skill).not.toContain("graphify-out");
    expect(skill).not.toContain("python3 -m graphify");

    expect(readme).toContain("Gemini CLI");
    expect(readme).toContain("graphify install --platform gemini");
    expect(readme).toContain("graphify gemini install");
  });
});

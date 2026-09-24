import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  it("uses /engram as the explicit Gemini invocation hint", () => {
    expect(getInvocationExample("gemini")).toBe("/engram .");
  });

  it("installs GEMINI.md instructions and project MCP config", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-gemini-"));
    tempDirs.push(dir);

    geminiInstall(dir);

    const geminiMd = readFileSync(join(dir, "GEMINI.md"), "utf-8");
    const settings = JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf-8")) as {
      mcpServers?: Record<string, unknown>;
    };

    expect(geminiMd).toContain("In Gemini CLI, the reliable explicit custom command is `/engram ...`");
    expect(geminiMd).toContain("configured `engram` MCP server");
    expect(settings.mcpServers).toMatchObject({
      engram: {
        command: "engram",
        args: ["serve", ".engram/graph.json"],
        trust: false,
      },
    });
    expect(settings.mcpServers).not.toHaveProperty("graphify");
  });

  it("replaces a legacy graphify MCP entry and GEMINI.md section in place", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-gemini-legacy-"));
    tempDirs.push(dir);

    writeFileSync(
      join(dir, "GEMINI.md"),
      "# Project\n\n## graphify\n\nlegacy section\n",
      "utf-8",
    );
    mkdirSync(join(dir, ".gemini"), { recursive: true });
    writeFileSync(
      join(dir, ".gemini", "settings.json"),
      JSON.stringify({
        mcpServers: {
          graphify: {
            command: "graphify",
            args: ["serve", ".graphify/graph.json"],
            trust: false,
          },
        },
      }),
      "utf-8",
    );

    geminiInstall(dir);

    const geminiMd = readFileSync(join(dir, "GEMINI.md"), "utf-8");
    expect(geminiMd).toContain("## engram");
    expect(geminiMd.match(/## engram/g)).toHaveLength(1);
    expect(geminiMd).not.toContain("## graphify");
    const settings = JSON.parse(readFileSync(join(dir, ".gemini", "settings.json"), "utf-8")) as {
      mcpServers?: Record<string, unknown>;
    };
    expect(settings.mcpServers).toHaveProperty("engram");
    expect(settings.mcpServers).not.toHaveProperty("graphify");
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
    expect(skill).toContain("The user's raw `/engram ...` command arguments");
    expect(skill).toContain("alias `/graphify`");
    expect(skill).toContain("runtime-info");
    expect(skill).toContain("finalize-build");
    expect(skill).toContain("engram query");
    expect(skill).toContain("skill-runtime");
    expect(skill).toContain("prepare-semantic-detect");
    expect(skill).toContain(".graphify_pdf_ocr.json");
    expect(skill).toContain("Gemini vision");
    expect(skill).toContain("delegated OCR/vision");
    expect(skill).toContain("files.video");
    expect(skill).toContain(".graphify/branch.json");
    expect(skill).toContain("engram migrate-state --dry-run");
    expect(skill).not.toContain("python3 -m graphify");

    expect(readme).toContain("Gemini CLI");
    expect(readme).toContain("engram install --platform gemini");
    expect(readme).toContain("engram gemini install");
  });
});

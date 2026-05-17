import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  agentsInstall,
  cursorInstall,
  geminiInstall,
  getAgentsMdSection,
  installClaudeHook,
  kiroInstall,
} from "../src/cli.js";
import { replaceOrAppendSection } from "../src/skill-install.js";

const tempDirs: string[] = [];

const bannedReportFirstPatterns = [
  /read[^.\n]{0,80}GRAPH_REPORT\.md[^.\n]{0,80}before/i,
  /first\s+tool\s+call[^.\n]{0,80}GRAPH_REPORT/i,
  /always\s+read[^.\n]{0,80}GRAPH_REPORT/i,
];

function expectQueryFirst(name: string, text: string): void {
  expect(text, `${name} should mention graphify query`).toMatch(/graphify query/);
  for (const pattern of bannedReportFirstPatterns) {
    expect(text, `${name} should not use report-first phrasing: ${pattern}`).not.toMatch(pattern);
  }
  expect(text, `${name} should keep GRAPH_REPORT.md as fallback context`).toMatch(/GRAPH_REPORT\.md/);
}

function skillFiles(): string[] {
  const dir = new URL("../src/skills", import.meta.url);
  return readdirSync(dir)
    .filter((name) => name.startsWith("skill") && (name.endsWith(".md") || name.endsWith(".toml")))
    .map((name) => new URL(`../src/skills/${name}`, import.meta.url).pathname);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("query-first install guidance", () => {
  it("locks project docs and bundled skills to query-first guidance", () => {
    const paths = [
      new URL("../README.md", import.meta.url).pathname,
      ...skillFiles(),
    ];

    for (const path of paths) {
      expectQueryFirst(path, readFileSync(path, "utf-8"));
    }
  });

  it("writes query-first project install surfaces", () => {
    expectQueryFirst("getAgentsMdSection(codex)", getAgentsMdSection("codex"));
    expectQueryFirst("getAgentsMdSection(opencode)", getAgentsMdSection("opencode"));

    const dir = mkdtempSync(join(tmpdir(), "graphify-query-first-"));
    tempDirs.push(dir);

    agentsInstall(dir, "opencode");
    expectQueryFirst("AGENTS.md", readFileSync(join(dir, "AGENTS.md"), "utf-8"));
    expectQueryFirst("OpenCode plugin", readFileSync(join(dir, ".opencode", "plugins", "graphify.js"), "utf-8"));

    geminiInstall(dir);
    expectQueryFirst("GEMINI.md", readFileSync(join(dir, "GEMINI.md"), "utf-8"));

    cursorInstall(dir);
    expectQueryFirst("Cursor rule", readFileSync(join(dir, ".cursor", "rules", "graphify.mdc"), "utf-8"));

    kiroInstall(dir);
    expectQueryFirst("Kiro steering", readFileSync(join(dir, ".kiro", "steering", "graphify.md"), "utf-8"));
    expectQueryFirst("Kiro skill", readFileSync(join(dir, ".kiro", "skills", "graphify", "SKILL.md"), "utf-8"));

    installClaudeHook(dir);
    const claudeSettings = readFileSync(join(dir, ".claude", "settings.json"), "utf-8");
    expectQueryFirst("Claude hook", claudeSettings);
  });

  it("replaces an existing graphify Markdown section in place", () => {
    const old = [
      "# Project",
      "",
      "## graphify",
      "",
      "- Before answering architecture questions, read .graphify/GRAPH_REPORT.md before searching raw files.",
      "- Keep this stale line out.",
      "",
      "## Other",
      "",
      "Keep me.",
      "",
    ].join("\n");
    const next = "## graphify\n\n- Use graphify query first; read GRAPH_REPORT.md only as fallback.\n";

    const updated = replaceOrAppendSection(old, "## graphify", next);

    expect(updated.match(/## graphify/g)).toHaveLength(1);
    expect(updated).toContain("Use graphify query first");
    expect(updated).toContain("## Other\n\nKeep me.");
    expect(updated).not.toContain("Keep this stale line out.");
  });

  it("refreshes stale project installs instead of leaving report-first text", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-query-first-refresh-"));
    tempDirs.push(dir);

    writeFileSync(
      join(dir, "AGENTS.md"),
      "## graphify\n\n- Before answering architecture questions, read .graphify/GRAPH_REPORT.md before searching raw files.\n",
      "utf-8",
    );
    agentsInstall(dir, "codex");
    expectQueryFirst("refreshed AGENTS.md", readFileSync(join(dir, "AGENTS.md"), "utf-8"));

    writeFileSync(
      join(dir, "GEMINI.md"),
      "## graphify\n\n- Before answering architecture questions, read .graphify/GRAPH_REPORT.md before searching raw files.\n",
      "utf-8",
    );
    geminiInstall(dir);
    expectQueryFirst("refreshed GEMINI.md", readFileSync(join(dir, "GEMINI.md"), "utf-8"));

    mkdirSync(join(dir, ".kiro", "steering"), { recursive: true });
    writeFileSync(
      join(dir, ".kiro", "steering", "graphify.md"),
      "graphify: A knowledge graph of this project lives in `.graphify/`. If `.graphify/GRAPH_REPORT.md` exists, read it before answering architecture questions.\n",
      "utf-8",
    );
    kiroInstall(dir);
    expectQueryFirst("refreshed Kiro steering", readFileSync(join(dir, ".kiro", "steering", "graphify.md"), "utf-8"));

    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(
      join(dir, ".claude", "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo graphify: read GRAPH_REPORT.md before grepping" }],
            },
          ],
        },
      }, null, 2),
      "utf-8",
    );
    installClaudeHook(dir);
    expectQueryFirst("refreshed Claude hook", readFileSync(join(dir, ".claude", "settings.json"), "utf-8"));
    expect(existsSync(join(dir, ".claude", "settings.json"))).toBe(true);
  });
});

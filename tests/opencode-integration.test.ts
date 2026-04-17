import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { agentsInstall } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("OpenCode integration contract", () => {
  it("writes the OpenCode plugin and registers it in opencode.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-opencode-"));
    tempDirs.push(dir);

    agentsInstall(dir, "opencode");

    const plugin = readFileSync(join(dir, ".opencode", "plugins", "graphify.js"), "utf-8");
    const config = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8")) as {
      plugin?: string[];
    };

    expect(plugin).toContain("tool.execute.before");
    expect(plugin).toContain(".graphify/GRAPH_REPORT.md");
    expect(config.plugin).toEqual([".opencode/plugins/graphify.js"]);
  });

  it("merges with existing OpenCode config and stays idempotent", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-opencode-config-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, "opencode.json"), JSON.stringify({ model: "claude-opus-4-5", plugin: [] }, null, 2));

    agentsInstall(dir, "opencode");
    agentsInstall(dir, "opencode");

    const config = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8")) as {
      model?: string;
      plugin?: string[];
    };

    expect(config.model).toBe("claude-opus-4-5");
    expect(config.plugin).toEqual([".opencode/plugins/graphify.js"]);
  });

  it("repairs a missing OpenCode plugin when AGENTS.md already exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-opencode-repair-"));
    tempDirs.push(dir);

    agentsInstall(dir, "opencode");
    unlinkSync(join(dir, ".opencode", "plugins", "graphify.js"));

    expect(() => agentsInstall(dir, "opencode")).not.toThrow();
    expect(existsSync(join(dir, ".opencode", "plugins", "graphify.js"))).toBe(true);
  });

  it("removes the plugin even when AGENTS.md is already gone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-opencode-uninstall-"));
    tempDirs.push(dir);

    agentsInstall(dir, "opencode");
    unlinkSync(join(dir, "AGENTS.md"));

    const { main } = await import("../src/cli.js");
    const previousArgv = process.argv;
    const previousCwd = process.cwd();
    process.chdir(dir);
    process.argv = ["node", "graphify", "opencode", "uninstall"];
    try {
      await main();
    } finally {
      process.chdir(previousCwd);
      process.argv = previousArgv;
    }

    expect(existsSync(join(dir, ".opencode", "plugins", "graphify.js"))).toBe(false);
    const config = JSON.parse(readFileSync(join(dir, "opencode.json"), "utf-8")) as {
      plugin?: string[];
    };
    expect(config.plugin).toBeUndefined();
  });

  it("skips OpenCode plugin registration when .opencode is a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-opencode-file-"));
    tempDirs.push(dir);
    writeFileSync(join(dir, ".opencode"), "");

    expect(() => agentsInstall(dir, "opencode")).not.toThrow();
    expect(existsSync(join(dir, ".opencode", "plugins", "graphify.js"))).toBe(false);
    expect(existsSync(join(dir, "opencode.json"))).toBe(false);
  });
});

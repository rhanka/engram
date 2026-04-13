import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

describe("Copilot integration contract", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("installs and uninstalls the Copilot skill in ~/.copilot/skills", async () => {
    const home = mkdtempSync(join(tmpdir(), "graphify-copilot-home-"));
    tempDirs.push(home);

    const previousHome = process.env.HOME;
    const previousArgv = process.argv;
    const previousCwd = process.cwd();
    process.env.HOME = home;

    try {
      const { main } = await import("../src/cli.js");

      process.argv = ["node", "graphify", "copilot", "install"];
      await main();

      const skillPath = join(home, ".copilot", "skills", "graphify", "SKILL.md");
      const versionPath = join(home, ".copilot", "skills", "graphify", ".graphify_version");
      expect(existsSync(skillPath)).toBe(true);
      expect(existsSync(versionPath)).toBe(true);
      expect(readFileSync(skillPath, "utf-8")).toContain("# /graphify");

      process.chdir(home);
      process.argv = ["node", "graphify", "copilot", "uninstall"];
      await main();

      expect(existsSync(skillPath)).toBe(false);
      expect(existsSync(versionPath)).toBe(false);
    } finally {
      process.chdir(previousCwd);
      process.argv = previousArgv;
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("documents Copilot install commands in the README", async () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf-8");

    expect(readme).toContain("GitHub Copilot CLI");
    expect(readme).toContain("graphify install --platform copilot");
    expect(readme).toContain("graphify copilot install");
  });
});

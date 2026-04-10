import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { install, uninstall, status } from "../src/hooks.js";

describe("hooks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `graphify-test-hooks-${Date.now()}`);
    mkdirSync(join(tmpDir, ".git", "hooks"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs post-commit and post-checkout hooks", () => {
    const result = install(tmpDir);
    expect(result).toContain("post-commit: installed");
    expect(result).toContain("post-checkout: installed");
    expect(existsSync(join(tmpDir, ".git", "hooks", "post-commit"))).toBe(true);
    expect(existsSync(join(tmpDir, ".git", "hooks", "post-checkout"))).toBe(true);
  });

  it("detects already installed hooks", () => {
    install(tmpDir);
    const result = install(tmpDir);
    expect(result).toContain("already installed");
  });

  it("uninstalls hooks", () => {
    install(tmpDir);
    const result = uninstall(tmpDir);
    expect(result).toContain("removed");
  });

  it("reports status correctly", () => {
    const before = status(tmpDir);
    expect(before).toContain("not installed");
    install(tmpDir);
    const after = status(tmpDir);
    expect(after).toContain("installed");
  });

  it("appends to existing hook without overwriting", () => {
    const hookPath = join(tmpDir, ".git", "hooks", "post-commit");
    writeFileSync(hookPath, "#!/bin/bash\necho 'existing hook'\n");
    install(tmpDir);
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("existing hook");
    expect(content).toContain("graphify-hook-start");
  });

  it("preserves other hook content on uninstall", () => {
    const hookPath = join(tmpDir, ".git", "hooks", "post-commit");
    writeFileSync(hookPath, "#!/bin/bash\necho 'keep me'\n");
    install(tmpDir);
    uninstall(tmpDir);
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("keep me");
    expect(content).not.toContain("graphify-hook-start");
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { install, uninstall, status } from "../src/hooks.js";

describe("hooks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-test-hooks-"));
    git(tmpDir, ["init", "-q"]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function git(cwd: string, args: string[]): string {
    try {
      return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();
    } catch (err) {
      const maybe = err as { status?: number; stdout?: string | Buffer };
      if (maybe.status === 0 && maybe.stdout !== undefined) return String(maybe.stdout).trim();
      throw err;
    }
  }

  function hookPath(cwd: string, name: string): string {
    const hooksDir = git(cwd, ["rev-parse", "--git-path", "hooks"]);
    return join(isAbsolute(hooksDir) ? hooksDir : resolve(cwd, hooksDir), name);
  }

  it("installs all lifecycle hooks", () => {
    const result = install(tmpDir);

    expect(result).toContain("post-commit: installed");
    expect(result).toContain("post-checkout: installed");
    expect(result).toContain("post-merge: installed");
    expect(result).toContain("post-rewrite: installed");
    for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
      const content = readFileSync(hookPath(tmpDir, name), "utf-8");
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      expect(content).toContain("graphify_mark_stale");
    }
  });

  it("detects already installed hooks", () => {
    install(tmpDir);
    const result = install(tmpDir);
    expect(result).toContain("post-commit: already installed");
    expect(result).toContain("post-rewrite: already installed");
  });

  it("updates stale graphify hook blocks", () => {
    writeFileSync(
      hookPath(tmpDir, "post-commit"),
      "#!/bin/sh\n# graphify-hook-start\necho stale\n# graphify-hook-end\n",
      "utf-8",
    );

    const result = install(tmpDir);
    const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");

    expect(result).toContain("post-commit: updated");
    expect(content).not.toContain("echo stale");
    expect(content).toContain("graphify_mark_stale");
  });

  it("uninstalls hooks", () => {
    install(tmpDir);
    const result = uninstall(tmpDir);
    expect(result).toContain("post-commit: removed");
    expect(result).toContain("post-rewrite: removed");
  });

  it("reports status correctly", () => {
    const before = status(tmpDir);
    expect(before).toContain("post-commit: not installed");
    expect(before).toContain("post-rewrite: not installed");

    install(tmpDir);
    const after = status(tmpDir);
    expect(after).toContain("post-commit: installed");
    expect(after).toContain("post-rewrite: installed");
  });

  it("appends to existing hook without overwriting", () => {
    const path = hookPath(tmpDir, "post-commit");
    writeFileSync(path, "#!/bin/bash\necho 'existing hook'\n", "utf-8");

    install(tmpDir);
    const content = readFileSync(path, "utf-8");

    expect(content).toContain("existing hook");
    expect(content).toContain("graphify-hook-start");
  });

  it("preserves other hook content on uninstall", () => {
    const path = hookPath(tmpDir, "post-commit");
    writeFileSync(path, "#!/bin/bash\necho 'keep me'\n", "utf-8");

    install(tmpDir);
    uninstall(tmpDir);
    const content = readFileSync(path, "utf-8");

    expect(content).toContain("keep me");
    expect(content).not.toContain("graphify-hook-start");
  });

  it("installs into the common hooks directory from a linked worktree", () => {
    const worktreeDir = join(tmpDir, "linked-worktree");
    git(tmpDir, ["worktree", "add", "-q", worktreeDir, "-b", "graphify-test-worktree"]);

    const result = install(worktreeDir);

    expect(result).toContain("post-commit: installed");
    expect(readFileSync(join(worktreeDir, ".git"), "utf-8")).toContain("gitdir:");
    expect(existsSync(hookPath(worktreeDir, "post-commit"))).toBe(true);
    expect(hookPath(worktreeDir, "post-commit")).toBe(hookPath(tmpDir, "post-commit"));
    expect(status(worktreeDir)).toContain("post-rewrite: installed");
  });
});

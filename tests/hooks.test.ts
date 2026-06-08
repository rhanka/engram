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

  it("targets the user-editable .husky dir on Husky 9 repos (core.hooksPath=.husky/_)", () => {
    git(tmpDir, ["config", "core.hooksPath", ".husky/_"]);

    install(tmpDir);

    // Husky 9 auto-generates wrappers under .husky/_; user hooks live in .husky/.
    expect(existsSync(join(tmpDir, ".husky", "post-commit"))).toBe(true);
    expect(existsSync(join(tmpDir, ".husky", "_", "post-commit"))).toBe(false);
  });

  it("installs all lifecycle hooks", () => {
    const result = install(tmpDir);

    expect(result).toContain("post-commit: installed");
    expect(result).toContain("post-checkout: installed");
    expect(result).toContain("post-merge: installed");
    expect(result).toContain("post-rewrite: installed");
    expect(result).toContain(".gitattributes:");
    expect(result).toContain("merge.graphify-json.driver:");
    for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
      const content = readFileSync(hookPath(tmpDir, name), "utf-8");
      expect(content.startsWith("#!/bin/sh\n")).toBe(true);
      expect(content).toContain("graphify_mark_stale");
      expect(content).toContain("rebase-merge");
      expect(content).toContain("rebase-apply");
      expect(content).toContain("MERGE_HEAD");
      expect(content).toContain("CHERRY_PICK_HEAD");
    }
    const postCommit = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
    expect(postCommit).toContain("LOCALAPPDATA");
    expect(postCommit).toContain("XDG_CACHE_HOME");
    expect(postCommit).toContain("GRAPHIFY_LOG=\"$GRAPHIFY_CACHE_DIR/rebuild.log\"");
    expect(postCommit).toContain("nohup");
    expect(postCommit).toContain("command -v nohup");
    expect(postCommit).toContain("disown");
    expect(readFileSync(join(tmpDir, ".gitattributes"), "utf-8")).toContain(".graphify/graph.json merge=graphify-json");
    expect(readFileSync(join(tmpDir, ".gitattributes"), "utf-8")).toContain("graphify-out/graph.json merge=graphify-json");
    expect(git(tmpDir, ["config", "--local", "--get", "merge.graphify-json.driver"])).toContain("graphify merge-driver %O %A %B");
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
    expect(result).toContain(".gitattributes:");
    expect(result).toContain("merge.graphify-json.driver:");
  });

  it("reports status correctly", () => {
    const before = status(tmpDir);
    expect(before).toContain("post-commit: not installed");
    expect(before).toContain("post-rewrite: not installed");
    expect(before).toContain(".gitattributes: not installed");
    expect(before).toContain("merge.graphify-json.driver: not installed");

    install(tmpDir);
    const after = status(tmpDir);
    expect(after).toContain("post-commit: installed");
    expect(after).toContain("post-rewrite: installed");
    expect(after).toContain(".gitattributes: installed");
    expect(after).toContain("merge.graphify-json.driver: installed");
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

  it("refuses to install hooks outside the repository git directories", () => {
    const outsideHooksDir = mkdtempSync(join(tmpdir(), "graphify-external-hooks-"));
    try {
      git(tmpDir, ["config", "--local", "core.hooksPath", outsideHooksDir]);

      expect(() => install(tmpDir)).toThrow("Refusing to install graphify hooks outside");
    } finally {
      rmSync(outsideHooksDir, { recursive: true, force: true });
    }
  });

  // Non-regression for upstream 0fdfded (hook interpreter injection hardening).
  //
  // The Python port of graphify embeds sys.executable at install time as a
  // "_PINNED_PYTHON_" placeholder, which required allowlist sanitisation to
  // prevent shell metacharacters in the interpreter path from being injected
  // into the generated hook scripts (upstream fix 0fdfded).
  //
  // The TypeScript implementation uses a fundamentally different architecture:
  // no interpreter path is ever embedded at install time.  The hook scripts
  // discover the command at *runtime* via `command -v graphify` or `npx
  // graphify`, both of which are hard-coded literal strings in the template.
  // There is therefore no filesystem-sourced path injection vector.
  //
  // These tests pin that invariant so future refactors cannot accidentally
  // introduce the pinned-interpreter pattern.
  describe("hook injection safety (0fdfded non-regression)", () => {
    it("does not embed any interpreter path placeholder in generated hook scripts", () => {
      install(tmpDir);
      for (const name of ["post-commit", "post-checkout", "post-merge", "post-rewrite"]) {
        const content = readFileSync(hookPath(tmpDir, name), "utf-8");
        // No Python-style pinned-interpreter placeholder must appear.
        expect(content).not.toContain("__PINNED_PYTHON__");
        expect(content).not.toContain("__PINNED_NODE__");
        expect(content).not.toContain("__PINNED_GRAPHIFY__");
        // No absolute filesystem path derived from process.execPath is embedded.
        // The only interpreter references are the two hard-coded literals used
        // by graphify_detect_cmd(), not a path taken from the environment.
        expect(content).not.toMatch(/GRAPHIFY_CMD="\/[^"]+"/);
      }
    });

    it("hook scripts set GRAPHIFY_CMD only to known safe literal values", () => {
      install(tmpDir);
      const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
      // The detect function must assign only the two safe, static values.
      expect(content).toContain('GRAPHIFY_CMD="graphify"');
      expect(content).toContain('GRAPHIFY_CMD="npx graphify"');
      // Shell metacharacters must not appear in any GRAPHIFY_CMD assignment.
      const assignmentLines = content
        .split("\n")
        .filter((l) => l.trimStart().startsWith("GRAPHIFY_CMD="));
      for (const line of assignmentLines) {
        expect(line).not.toMatch(/[;`$(){}|<>\\]/);
      }
    });

    it("nohup exec line properly quotes the log path redirect", () => {
      install(tmpDir);
      const content = readFileSync(hookPath(tmpDir, "post-commit"), "utf-8");
      // The redirect target must be double-quoted so paths with spaces work.
      expect(content).toContain('> "$GRAPHIFY_LOG"');
      // nohup must be present for background execution.
      expect(content).toContain("nohup sh -c");
    });
  });
});

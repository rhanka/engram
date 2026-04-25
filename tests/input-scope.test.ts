import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execGit } from "../src/git.js";
import { inspectInputScope } from "../src/input-scope.js";

describe("input scope inventory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-input-scope-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function initRepo(): void {
    execGit(tmpDir, ["init", "-q"]);
    execGit(tmpDir, ["config", "user.email", "graphify@example.test"]);
    execGit(tmpDir, ["config", "user.name", "Graphify Test"]);
  }

  function write(relativePath: string, content: string): void {
    const fullPath = join(tmpDir, relativePath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
  }

  function commit(relativePath: string): void {
    execGit(tmpDir, ["add", relativePath]);
    execGit(tmpDir, ["commit", "-q", "-m", `add ${relativePath}`]);
  }

  it("resolves auto to committed inventory in a Git repo with HEAD", () => {
    initRepo();
    write("src/a.ts", "export const a = 1;\n");
    commit("src/a.ts");
    write("scratch.ts", "export const scratch = true;\n");
    write(".graphify/memory/question.md", "# Memory\n");

    const inventory = inspectInputScope(tmpDir, {
      mode: "auto",
      source: "default-auto",
    });

    expect(inventory.candidateFiles).toEqual([
      "src/a.ts",
      ".graphify/memory/question.md",
    ]);
    expect(inventory.scope).toMatchObject({
      requested_mode: "auto",
      resolved_mode: "committed",
      source: "default-auto",
      root: tmpDir,
      git_root: tmpDir,
      candidate_count: 2,
      included_count: 2,
      excluded_untracked_count: 1,
      excluded_ignored_count: 0,
      excluded_sensitive_count: 0,
      missing_committed_count: 0,
    });
    expect(inventory.scope.head).toMatch(/^[0-9a-f]{40}$/);
    expect(inventory.scope.recommendation).toContain("--scope all");
  });

  it("uses the Git index for tracked inventory", () => {
    initRepo();
    write("src/a.ts", "export const a = 1;\n");
    commit("src/a.ts");
    write("src/staged.ts", "export const staged = true;\n");
    execGit(tmpDir, ["add", "src/staged.ts"]);
    write("scratch.ts", "export const scratch = true;\n");

    const inventory = inspectInputScope(tmpDir, {
      mode: "tracked",
      source: "cli",
    });

    expect(inventory.candidateFiles).toEqual([
      "src/a.ts",
      "src/staged.ts",
    ]);
    expect(inventory.scope).toMatchObject({
      requested_mode: "tracked",
      resolved_mode: "tracked",
      source: "cli",
      candidate_count: 2,
      included_count: 2,
      excluded_untracked_count: 1,
      missing_committed_count: 0,
    });
  });

  it("delegates all scope to the existing recursive detector", () => {
    initRepo();
    write("src/a.ts", "export const a = 1;\n");
    commit("src/a.ts");
    write("scratch.ts", "export const scratch = true;\n");

    const inventory = inspectInputScope(tmpDir, {
      mode: "all",
      source: "cli",
    });

    expect(inventory.candidateFiles).toBeNull();
    expect(inventory.scope).toMatchObject({
      requested_mode: "all",
      resolved_mode: "all",
      source: "cli",
      candidate_count: null,
      included_count: null,
      excluded_untracked_count: 0,
      missing_committed_count: 0,
      warnings: [],
      recommendation: null,
    });
  });

  it("falls back to all scope when a Git repo has no HEAD", () => {
    initRepo();
    write("src/a.ts", "export const a = 1;\n");

    const inventory = inspectInputScope(tmpDir, {
      mode: "auto",
      source: "default-auto",
    });

    expect(inventory.candidateFiles).toBeNull();
    expect(inventory.scope).toMatchObject({
      requested_mode: "auto",
      resolved_mode: "all",
      source: "default-auto",
      root: tmpDir,
      git_root: tmpDir,
      head: undefined,
      candidate_count: null,
      included_count: null,
    });
    expect(inventory.scope.warnings).toContain("Git repository has no HEAD; falling back to all scope.");
  });

  it("falls back to all scope outside Git repositories", () => {
    write("docs/note.md", "# Note\n");

    const inventory = inspectInputScope(tmpDir, {
      mode: "auto",
      source: "default-auto",
    });

    expect(inventory.candidateFiles).toBeNull();
    expect(inventory.scope).toMatchObject({
      requested_mode: "auto",
      resolved_mode: "all",
      source: "default-auto",
      root: tmpDir,
      git_root: undefined,
      head: undefined,
      candidate_count: null,
      included_count: null,
      excluded_untracked_count: 0,
      warnings: [],
    });
  });

  it("counts large ignored inventories without overflowing the git stdout buffer", () => {
    initRepo();
    write(".gitignore", ".graphify/\n");
    commit(".gitignore");
    write("src/a.ts", "export const a = 1;\n");
    commit("src/a.ts");

    const ignoredDir = join(tmpDir, ".graphify", "cache", "a".repeat(100), "b".repeat(100));
    mkdirSync(ignoredDir, { recursive: true });
    for (let index = 0; index < 5000; index += 1) {
      writeFileSync(join(ignoredDir, `file-${String(index).padStart(4, "0")}.json`), "{}\n", "utf-8");
    }

    const inventory = inspectInputScope(tmpDir, {
      mode: "auto",
      source: "default-auto",
    });

    expect(inventory.candidateFiles).toEqual([
      ".gitignore",
      "src/a.ts",
    ]);
    expect(inventory.scope).toMatchObject({
      requested_mode: "auto",
      resolved_mode: "committed",
      candidate_count: 2,
      included_count: 2,
      excluded_untracked_count: 0,
      excluded_ignored_count: 5000,
    });
  });
});

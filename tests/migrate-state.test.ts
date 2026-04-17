import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { migrateGraphifyOut, migrationResultToText, planGraphifyOutMigration } from "../src/migrate-state.js";

const cleanupDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-migrate-state-"));
  cleanupDirs.push(dir);
  return dir;
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return null;
    throw err;
  }
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

describe("graphify-out to .graphify migration", () => {
  it("reports a no-op when the legacy directory is absent", () => {
    const root = makeTempDir();

    const result = migrateGraphifyOut({ root, dryRun: true });

    expect(result.sourceExists).toBe(false);
    expect(result.entries).toEqual([]);
    expect(migrationResultToText(result)).toContain("no legacy graphify-out directory found");
  });

  it("dry-runs without creating .graphify", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "graphify-out", "cache"), { recursive: true });
    writeFileSync(join(root, "graphify-out", "graph.json"), "{}", "utf-8");
    writeFileSync(join(root, "graphify-out", "cache", "semantic.json"), "{}", "utf-8");

    const result = migrateGraphifyOut({ root, dryRun: true });

    expect(result.sourceExists).toBe(true);
    expect(result.copied).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(root, ".graphify"))).toBe(false);
    expect(migrationResultToText(result)).toContain("planned writes");
  });

  it("copies missing legacy state without overwriting existing .graphify files", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "graphify-out", "cache"), { recursive: true });
    mkdirSync(join(root, ".graphify"), { recursive: true });
    writeFileSync(join(root, "graphify-out", "graph.json"), "legacy", "utf-8");
    writeFileSync(join(root, "graphify-out", "cache", "semantic.json"), "cache", "utf-8");
    writeFileSync(join(root, ".graphify", "graph.json"), "current", "utf-8");

    const result = migrateGraphifyOut({ root });

    expect(readFileSync(join(root, ".graphify", "graph.json"), "utf-8")).toBe("current");
    expect(readFileSync(join(root, ".graphify", "cache", "semantic.json"), "utf-8")).toBe("cache");
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.copied).toBeGreaterThan(0);
  });

  it("overwrites existing .graphify files only with force", () => {
    const root = makeTempDir();
    mkdirSync(join(root, "graphify-out"), { recursive: true });
    mkdirSync(join(root, ".graphify"), { recursive: true });
    writeFileSync(join(root, "graphify-out", "graph.json"), "legacy", "utf-8");
    writeFileSync(join(root, ".graphify", "graph.json"), "current", "utf-8");

    const result = migrateGraphifyOut({ root, force: true });

    expect(result.overwritten).toBe(1);
    expect(readFileSync(join(root, ".graphify", "graph.json"), "utf-8")).toBe("legacy");
  });

  it("advises git mv when legacy artifacts are tracked in a committed repo", () => {
    const root = makeTempDir();
    if (git(root, ["init", "-q"]) === null) return;
    git(root, ["config", "user.email", "graphify@example.test"]);
    git(root, ["config", "user.name", "Graphify Test"]);
    mkdirSync(join(root, "graphify-out"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".graphify/\n", "utf-8");
    writeFileSync(join(root, "graphify-out", "graph.json"), "{}", "utf-8");
    git(root, ["add", ".gitignore", "graphify-out/graph.json"]);
    git(root, ["commit", "-q", "-m", "initial graph state"]);

    const result = planGraphifyOutMigration({ root });
    const text = migrationResultToText({
      ...result,
      dryRun: true,
      copied: result.entries.filter((entry) => entry.action === "copy").length,
      overwritten: result.entries.filter((entry) => entry.action === "overwrite").length,
      skipped: result.entries.filter((entry) => entry.action === "skip").length,
    });

    expect(result.git.hasCommits).toBe(true);
    expect(result.git.legacyTrackedCount).toBe(1);
    expect(result.git.recommendedCommands[0]).toBe("git mv -f graphify-out .graphify");
    expect(text).toContain('git commit -m "chore: migrate graphify state directory"');
  });
});

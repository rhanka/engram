import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defaultCloneDestination, cloneRepo } from "../src/repo-clone.js";
import { execGit } from "../src/git.js";

const cleanupDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  }
});

function initRepo(dir: string): void {
  execGit(dir, ["init", "-q"]);
  execGit(dir, ["config", "user.email", "graphify@example.test"]);
  execGit(dir, ["config", "user.name", "Graphify Test"]);
}

describe("repo clone helpers", () => {
  it("computes the default GitHub clone destination under ~/.graphify/repos", () => {
    const cacheRoot = tempDir("graphify-clone-cache-");
    const destination = defaultCloneDestination("https://github.com/acme/alpha", cacheRoot);
    expect(destination).toBe(join(cacheRoot, "acme", "alpha"));
  });

  it("clones a local repository into an explicit destination", () => {
    const source = tempDir("graphify-clone-source-");
    initRepo(source);
    writeFileSync(join(source, "README.md"), "# hello\n", "utf-8");
    execGit(source, ["add", "README.md"]);
    execGit(source, ["commit", "-q", "-m", "init"]);

    const destination = join(tempDir("graphify-clone-dest-"), "cloned");
    const result = cloneRepo({ url: source, outDir: destination });

    expect(result.path).toBe(destination);
    expect(result.repo).toBe(basename(source));
    expect(existsSync(join(destination, ".git"))).toBe(true);
    expect(readFileSync(join(destination, "README.md"), "utf-8")).toContain("hello");
  });

  it("reuses an existing clone and pulls the latest commit", () => {
    const source = tempDir("graphify-clone-reuse-source-");
    initRepo(source);
    writeFileSync(join(source, "README.md"), "# hello\n", "utf-8");
    execGit(source, ["add", "README.md"]);
    execGit(source, ["commit", "-q", "-m", "init"]);

    const destination = join(tempDir("graphify-clone-reuse-dest-"), "cloned");
    cloneRepo({ url: source, outDir: destination });

    writeFileSync(join(source, "CHANGELOG.md"), "v2\n", "utf-8");
    execGit(source, ["add", "CHANGELOG.md"]);
    execGit(source, ["commit", "-q", "-m", "update"]);

    const result = cloneRepo({ url: source, outDir: destination });

    expect(result.reused).toBe(true);
    expect(readFileSync(join(destination, "CHANGELOG.md"), "utf-8")).toContain("v2");
  });
});

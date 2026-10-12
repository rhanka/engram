import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { extractGit, CODE_GIT_ONTOLOGY_PROFILE, detectGitWindow } from "../src/extract-git.js";
import { branchId, commitId, repoKey } from "../src/repo-key.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import { validateExtraction } from "../src/validate.js";
import type { Extraction, GraphNode } from "../src/types.js";

const tempDirs: string[] = [];

function tempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "graphify-extract-git-"));
  tempDirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.name", "Graphify Test"]);
  git(dir, ["config", "user.email", "graphify@example.test"]);
  return dir;
}

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();
  } catch (err) {
    const maybe = err as { status?: number; stdout?: string | Buffer };
    if (maybe.status === 0 && maybe.stdout !== undefined) return String(maybe.stdout).trim();
    throw err;
  }
}

function commit(repo: string, message: string): string {
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}

/** Long linear history in one fast-import pass; every commit changes a file. */
function fastImportHistory(repo: string, count: number): void {
  const commands: string[] = ["feature done\n"];
  for (let index = 1; index <= count; index += 1) {
    const message = `history commit ${index}\n`;
    const content = `history ${index}\n`;
    commands.push(
      `commit refs/heads/main\nmark :${index}\n` +
        `committer Graphify Test <graphify@example.test> ${1700000000 + index} +0000\n` +
        `data ${Buffer.byteLength(message)}\n${message}` +
        (index === 1 ? "" : `from :${index - 1}\n`) +
        `M 100644 inline history.txt\ndata ${Buffer.byteLength(content)}\n${content}\n`,
    );
  }
  commands.push("done\n");
  execFileSync("git", ["-C", repo, "fast-import", "--quiet"], {
    input: commands.join(""),
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function write(repo: string, path: string, content: string): void {
  const full = join(repo, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

function codeNode(id: string, path: string): GraphNode {
  return {
    id,
    label: path.split("/").pop() ?? path,
    file_type: "code",
    source_file: path,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("extractGit", () => {
  it("extracts windowed commits, branches, git edges, SLOC deltas, and provenance", () => {
    const repo = tempRepo();
    write(repo, "src/a.ts", "export const a = 1;\n");
    const first = commit(repo, "initial file\n\nbody that must not be stored");
    write(repo, "src/a.ts", "export const a = 1;\nexport const b = 2;\n");
    const second = commit(repo, "add b");
    git(repo, ["checkout", "-q", "-b", "feature", first]);
    write(repo, "src/b.ts", "export const feature = true;\n");
    const feature = commit(repo, "feature file");
    git(repo, ["checkout", "-q", "main"]);

    const key = repoKey(repo);
    const extraction = extractGit(repo, {
      branches: ["main", "feature"],
      maxCommits: 2,
      observedAt: "2026-06-13T12:00:00.000Z",
      fileNodeIds: new Map([
        ["src/a.ts", "src_a"],
        ["src/b.ts", "src_b"],
      ]),
    });

    const combined: Extraction = {
      ...extraction,
      nodes: [codeNode("src_a", "src/a.ts"), codeNode("src_b", "src/b.ts"), ...extraction.nodes],
    };
    expect(validateExtraction(combined)).toEqual([]);

    expect(extraction.provenance).toEqual({
      source_owner: "git",
      source_id: key,
      observed_at: "2026-06-13T12:00:00.000Z",
      source_hash: second,
      adapter_version: expect.any(String),
      // maxCommits: 2 is an explicit bound: the extraction is labelled partial.
      partial: true,
    });

    expect(extraction.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: commitId(key, first),
          node_type: "Commit",
          sha: first,
          message_summary: "initial file",
          message_length: expect.any(Number),
        }),
        expect.objectContaining({ id: commitId(key, second), node_type: "Commit", parents: [first] }),
        expect.objectContaining({ id: commitId(key, feature), node_type: "Commit", parents: [first] }),
        expect.objectContaining({ id: branchId(key, "main"), node_type: "Branch", branch_name: "main" }),
        expect.objectContaining({ id: branchId(key, "feature"), node_type: "Branch", branch_name: "feature" }),
      ]),
    );
    expect(extraction.nodes.find((node) => node.id === commitId(key, first))).not.toHaveProperty(
      "message_body",
    );

    expect(extraction.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: commitId(key, first),
          target: commitId(key, second),
          relation: "PARENT_OF",
        }),
        expect.objectContaining({
          source: commitId(key, second),
          target: branchId(key, "main"),
          relation: "ON_BRANCH",
        }),
        expect.objectContaining({
          source: commitId(key, feature),
          target: branchId(key, "feature"),
          relation: "ON_BRANCH",
        }),
        expect.objectContaining({
          source: commitId(key, second),
          target: "src_a",
          relation: "MODIFIES",
          added: 1,
          deleted: 0,
        }),
      ]),
    );
  });

  it("default legacy extraction and detection metadata no longer truncate a branch at 200 commits", () => {
    const repo = tempRepo();
    fastImportHistory(repo, 205);
    expect(Number(git(repo, ["rev-list", "--count", "refs/heads/main"]))).toBe(205);

    // Default extraction keeps the whole branch: no implicit 200-commit cap.
    const extraction = extractGit(repo, { branches: ["main"] });
    const shas = extraction.nodes
      .filter((node) => node.node_type === "Commit")
      .map((node) => node.sha)
      .filter((sha): sha is string => typeof sha === "string");
    expect(shas).toHaveLength(205);
    expect(extraction.provenance?.partial).toBeUndefined();

    // Detection metadata no longer claims a commit window by default.
    const window = detectGitWindow(repo, {});
    expect(window?.source_owner).toBe("git");
    expect(window?.branches).toContain("main");
    expect(window?.max_commits).toBeUndefined();
    expect(window?.partial).toBeUndefined();
    expect(window?.active_within_days).toBeGreaterThan(0);

    // An explicitly bounded non-live request still truncates, and stays
    // labelled partial instead of pretending to be the full branch.
    const bounded = extractGit(repo, { branches: ["main"], maxCommits: 50 });
    expect(bounded.nodes.filter((node) => node.node_type === "Commit")).toHaveLength(50);
    expect(bounded.provenance?.partial).toBe(true);
    const boundedWindow = detectGitWindow(repo, { maxCommits: 50 });
    expect(boundedWindow?.max_commits).toBe(50);
    expect(boundedWindow?.partial).toBe(true);

    // An explicit age bound also truncates (the fixture history is dated
    // 2023), so it is labelled partial exactly like a count bound: an
    // age-bounded extraction never claims the whole reachable history.
    const aged = extractGit(repo, { branches: ["main"], sinceDays: 1 });
    expect(aged.nodes.filter((node) => node.node_type === "Commit")).toHaveLength(0);
    expect(aged.provenance?.partial).toBe(true);
    const agedWindow = detectGitWindow(repo, { sinceDays: 1 });
    expect(agedWindow?.since_days).toBe(1);
    expect(agedWindow?.partial).toBe(true);
    expect(agedWindow?.max_commits).toBeUndefined();
  }, 120_000);

  it("an explicitly bounded non-live request truncates a branch and stays labelled partial", () => {
    const repo = tempRepo();
    write(repo, "src/a.ts", "export const a = 1;\n");
    const first = commit(repo, "first");
    write(repo, "src/a.ts", "export const a = 2;\n");
    const second = commit(repo, "second");
    write(repo, "src/a.ts", "export const a = 3;\n");
    const third = commit(repo, "third");

    const key = repoKey(repo);
    const extraction = extractGit(repo, {
      branches: ["main"],
      maxCommits: 2,
      fileNodeIds: new Map([["src/a.ts", "src_a"]]),
    });

    const commitIds = new Set(
      extraction.nodes.filter((node) => node.node_type === "Commit").map((node) => node.id),
    );
    expect(commitIds).toEqual(new Set([commitId(key, third), commitId(key, second)]));
    expect(commitIds.has(commitId(key, first))).toBe(false);
    expect(extraction.provenance?.partial).toBe(true);
    expect(detectGitWindow(repo, { maxCommits: 2 })?.max_commits).toBe(2);
    expect(detectGitWindow(repo, { maxCommits: 2 })?.partial).toBe(true);
  });

  it("declares the conservative code-git ontology profile", () => {
    const profile = normalizeOntologyProfile(CODE_GIT_ONTOLOGY_PROFILE);

    expect(Object.keys(profile.node_types).sort()).toEqual(["Branch", "Commit", "File"]);
    expect(Object.keys(profile.relation_types).sort()).toEqual(["MODIFIES", "ON_BRANCH", "PARENT_OF"]);
    expect(profile.relation_types.MODIFIES.source_types).toEqual(["Commit"]);
    expect(profile.relation_types.MODIFIES.target_types).toEqual(["File"]);
  });
});

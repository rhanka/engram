import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execGit } from "../src/git.js";
import {
  markLifecycleAnalyzed,
  markLifecycleStale,
  planLifecyclePrune,
  readLifecycleMetadata,
  refreshLifecycleMetadata,
} from "../src/lifecycle.js";

describe("lifecycle metadata", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "graphify-test-lifecycle-"));
    execGit(tmpDir, ["init", "-q"]);
    execGit(tmpDir, ["config", "user.email", "graphify@example.test"]);
    execGit(tmpDir, ["config", "user.name", "Graphify Test"]);
    writeFileSync(join(tmpDir, "README.md"), "# test\n", "utf-8");
    execGit(tmpDir, ["add", "README.md"]);
    execGit(tmpDir, ["commit", "-q", "-m", "initial"]);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes worktree and branch metadata on analyzed runs", () => {
    const head = execGit(tmpDir, ["rev-parse", "HEAD"]);

    const metadata = markLifecycleAnalyzed(tmpDir);

    expect(metadata.worktree.worktreePath).toBe(tmpDir);
    expect(metadata.worktree.gitDir).toBe(join(tmpDir, ".git"));
    expect(metadata.worktree.firstSeenHead).toBe(head);
    expect(metadata.worktree.lastAnalyzedHead).toBe(head);
    expect(metadata.branch.lastAnalyzedHead).toBe(head);
    expect(metadata.branch.stale).toBe(false);
    expect(existsSync(join(tmpDir, ".graphify", "worktree.json"))).toBe(true);
    expect(existsSync(join(tmpDir, ".graphify", "branch.json"))).toBe(true);
  });

  it("marks stale state and clears it after a successful analyzed run", () => {
    markLifecycleAnalyzed(tmpDir);

    const stale = markLifecycleStale(tmpDir, "post-merge");

    expect(stale.branch.stale).toBe(true);
    expect(stale.branch.staleReason).toBe("post-merge");
    expect(existsSync(join(tmpDir, ".graphify", "needs_update"))).toBe(true);

    const analyzed = markLifecycleAnalyzed(tmpDir);

    expect(analyzed.branch.stale).toBe(false);
    expect(analyzed.branch.staleReason).toBeNull();
    expect(existsSync(join(tmpDir, ".graphify", "needs_update"))).toBe(false);
  });

  it("resolves linked worktree git directories without assuming .git is a directory", () => {
    const worktreeDir = join(tmpDir, "linked-worktree");
    execGit(tmpDir, ["worktree", "add", "-q", worktreeDir, "-b", "graphify-lifecycle-worktree"]);

    const metadata = refreshLifecycleMetadata(worktreeDir);

    expect(readFileSync(join(worktreeDir, ".git"), "utf-8")).toContain("gitdir:");
    expect(metadata.worktree.worktreePath).toBe(worktreeDir);
    expect(metadata.worktree.gitDir).toContain(join(".git", "worktrees"));
    expect(metadata.worktree.commonGitDir).toBe(join(tmpDir, ".git"));
    expect(readLifecycleMetadata(worktreeDir)?.branch.branchName).toBe("graphify-lifecycle-worktree");
  });

  it("plans stale cleanup without deleting files", () => {
    markLifecycleStale(tmpDir, "post-rewrite");

    const plan = planLifecyclePrune(tmpDir);

    expect(plan.destructive).toBe(false);
    expect(plan.candidates).toEqual([
      {
        path: join(tmpDir, ".graphify", "needs_update"),
        reason: "stale marker exists but no graph artifact is present",
      },
    ]);
    expect(existsSync(join(tmpDir, ".graphify", "needs_update"))).toBe(true);
  });
});

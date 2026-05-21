import { describe, expect, it } from "vitest";

import {
  type CommandRunner,
  formatPrWorktrees,
  formatPullRequestConflicts,
  formatPullRequestDetails,
  formatPullRequestList,
  getPullRequest,
  listConflictingPullRequests,
  listPrWorktrees,
  listPullRequests,
  parseGitWorktreePorcelain,
} from "../src/pr.js";

function fakeRunner(responses: Record<string, unknown>): CommandRunner {
  return {
    run(command: string, args: string[]): string {
      const key = [command, ...args].join(" ");
      if (!(key in responses)) {
        throw new Error(`unexpected command: ${key}`);
      }
      const value = responses[key];
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

describe("pull request inspection", () => {
  it("lists pull requests from gh JSON", () => {
    const runner = fakeRunner({
      "gh pr list --state open --limit 2 --json number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt": [
        {
          number: 12,
          title: "Track PR inspection",
          state: "OPEN",
          isDraft: false,
          headRefName: "feat/prs",
          baseRefName: "main",
          author: { login: "dev" },
          mergeable: "MERGEABLE",
          reviewDecision: "APPROVED",
        },
      ],
    });

    const prs = listPullRequests({ runner, limit: 2 });

    expect(prs).toHaveLength(1);
    expect(formatPullRequestList(prs)).toContain("#12 Track PR inspection");
    expect(formatPullRequestList(prs)).toContain("feat/prs -> main");
  });

  it("formats detailed pull request files, commits, and checks", () => {
    const runner = fakeRunner({
      "gh pr view 12 --json number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt,body,files,commits,statusCheckRollup": {
        number: 12,
        title: "Track PR inspection",
        state: "OPEN",
        isDraft: true,
        headRefName: "feat/prs",
        baseRefName: "main",
        author: { login: "dev" },
        url: "https://github.example/pr/12",
        files: [{ path: "src/pr.ts" }, { path: "tests/pr.test.ts" }],
        commits: [{ oid: "abc1234567890", messageHeadline: "Add PR commands" }],
        statusCheckRollup: [{ name: "test", conclusion: "SUCCESS" }],
      },
    });

    const details = getPullRequest(12, { runner });
    const output = formatPullRequestDetails(details);

    expect(output).toContain("State: OPEN draft");
    expect(output).toContain("Files (2):");
    expect(output).toContain("abc123456789 Add PR commands");
    expect(output).toContain("test: SUCCESS");
  });

  it("filters conflicting pull requests by mergeability signals", () => {
    const runner = fakeRunner({
      "gh pr list --state open --limit 30 --json number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt": [
        {
          number: 1,
          title: "Clean",
          state: "OPEN",
          headRefName: "clean",
          baseRefName: "main",
          mergeable: "MERGEABLE",
        },
        {
          number: 2,
          title: "Conflict",
          state: "OPEN",
          headRefName: "conflict",
          baseRefName: "main",
          mergeable: "CONFLICTING",
        },
        {
          number: 3,
          title: "Dirty",
          state: "OPEN",
          headRefName: "dirty",
          baseRefName: "main",
          mergeStateStatus: "DIRTY",
        },
      ],
    });

    const conflicts = listConflictingPullRequests({ runner });

    expect(conflicts.map((pr) => pr.number)).toEqual([2, 3]);
    expect(formatPullRequestConflicts(conflicts)).toContain("Conflicting pull requests");
  });

  it("parses git worktree porcelain output", () => {
    const worktrees = parseGitWorktreePorcelain([
      "worktree /repo",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /repo/.worktrees/prs",
      "HEAD bbb",
      "branch refs/heads/feat/prs",
      "",
    ].join("\n"));

    expect(worktrees).toEqual([
      { path: "/repo", head: "aaa", branch: "main" },
      { path: "/repo/.worktrees/prs", head: "bbb", branch: "feat/prs" },
    ]);
  });

  it("matches worktree branches to PR head refs", () => {
    const runner = fakeRunner({
      "git worktree list --porcelain": [
        "worktree /repo",
        "HEAD aaa",
        "branch refs/heads/main",
        "",
        "worktree /repo/.worktrees/prs",
        "HEAD bbb",
        "branch refs/heads/feat/prs",
        "",
      ].join("\n"),
      "gh pr list --state open --limit 30 --json number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt": [
        {
          number: 12,
          title: "Track PR inspection",
          state: "OPEN",
          headRefName: "feat/prs",
          baseRefName: "main",
        },
      ],
    });

    const worktrees = listPrWorktrees({ runner });

    expect(worktrees[1]?.pr?.number).toBe(12);
    expect(formatPrWorktrees(worktrees)).toContain("PR #12 Track PR inspection");
  });
});

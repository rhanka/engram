import { describe, expect, it } from "vitest";

import { extractPullRequests, GH_ONTOLOGY_PROFILE } from "../src/extract-gh.js";
import { normalizeOntologyProfile } from "../src/ontology-profile.js";
import { branchId, commitId, prId } from "../src/repo-key.js";
import { validateExtraction } from "../src/validate.js";
import type { CommandRunner } from "../src/pr.js";

const GH_LIST_FIELDS =
  "number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt";
const GH_VIEW_FIELDS =
  "number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt,body,files,commits,statusCheckRollup";
const GH_MERGE_FIELDS = "number,mergeCommit,commits,headRefName";
const REMOTE = "https://github.com/rhanka/graphify.git";
const KEY = "repo:github.com/rhanka/graphify";

function fakeRunner(responses: Record<string, unknown>): CommandRunner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    run(command: string, args: string[]): string {
      const key = [command, ...args].join(" ");
      calls.push(key);
      if (!(key in responses)) {
        throw new Error(`unexpected command: ${key}`);
      }
      const value = responses[key];
      return typeof value === "string" ? value : JSON.stringify(value);
    },
  };
}

function listCommand(limit = 10): string {
  return `gh pr list --repo rhanka/graphify --state all --limit ${limit} --json ${GH_LIST_FIELDS}`;
}

function viewCommand(number: number): string {
  return `gh pr view ${number} --repo rhanka/graphify --json ${GH_VIEW_FIELDS}`;
}

function mergeCommand(number: number): string {
  return `gh pr view ${number} --repo rhanka/graphify --json ${GH_MERGE_FIELDS}`;
}

describe("extractPullRequests", () => {
  it("is disabled unless the caller opts in explicitly", () => {
    const runner = fakeRunner({});

    const extraction = extractPullRequests(".", { runner, enabled: false });

    expect(extraction).toEqual({ nodes: [], edges: [], input_tokens: 0, output_tokens: 0 });
    expect(runner.calls).toEqual([]);
  });

  it("extracts an open PR as a sanitized PullRequest node with branch and commit references", () => {
    const headSha = "abc1234567890abc1234567890abc1234567890abc";
    const runner = fakeRunner({
      "git remote get-url origin": REMOTE,
      [listCommand()]: [
        {
          number: 42,
          title: "Add GH extraction",
          state: "OPEN",
          isDraft: false,
          headRefName: "feature/wp9",
          baseRefName: "main",
          author: { login: "dev" },
          url: "https://github.com/rhanka/graphify/pull/42",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          updatedAt: "2026-06-15T10:00:00Z",
        },
      ],
      [viewCommand(42)]: {
        number: 42,
        title: "Add GH extraction",
        state: "OPEN",
        isDraft: false,
        headRefName: "feature/wp9",
        baseRefName: "main",
        author: { login: "dev" },
        url: "https://github.com/rhanka/graphify/pull/42",
        mergeStateStatus: "CLEAN",
        reviewDecision: "APPROVED",
        updatedAt: "2026-06-15T10:00:00Z",
        body: "Implementation notes with ghp_body_secret_token and raw prose.",
        commits: [{ oid: headSha, messageHeadline: "do not need headline in extraction" }],
        statusCheckRollup: [
          {
            name: "unit",
            conclusion: "SUCCESS",
            detailsUrl: "https://github.com/rhanka/graphify/actions/runs/1",
          },
        ],
      },
      [mergeCommand(42)]: {
        number: 42,
        headRefName: "feature/wp9",
        commits: [{ oid: headSha }],
      },
    });

    const extraction = extractPullRequests(".", {
      runner,
      enabled: true,
      limit: 10,
      observedAt: "2026-06-15T12:00:00.000Z",
    });

    expect(validateExtraction(extraction)).toEqual([]);
    expect(extraction.provenance).toMatchObject({
      source_owner: "gh",
      source_id: KEY,
      observed_at: "2026-06-15T12:00:00.000Z",
      adapter_version: "graphify-gh/1",
      ttl: "PT4H",
    });
    expect(extraction.provenance?.source_hash).toMatch(/^[a-f0-9]{64}$/);

    expect(extraction.nodes).toEqual([
      expect.objectContaining({
        id: prId(KEY, 42),
        label: "#42 Add GH extraction",
        node_type: "PullRequest",
        number: 42,
        title: "Add GH extraction",
        state: "OPEN",
        is_draft: false,
        head_branch: "feature/wp9",
        base_branch: "main",
        author: "dev",
        url: "https://github.com/rhanka/graphify/pull/42",
        review_decision: "APPROVED",
        merge_state: "CLEAN",
        updated_at: "2026-06-15T10:00:00Z",
        body_length: 62,
        body_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        checks_total: 1,
        checks_passed: 1,
        checks_failed: 0,
        checks_conclusion: "SUCCESS",
        check_runs: [
          {
            name: "unit",
            conclusion: "SUCCESS",
            url: "https://github.com/rhanka/graphify/actions/runs/1",
          },
        ],
      }),
    ]);
    expect(extraction.nodes[0]).not.toHaveProperty("body");

    expect(extraction.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: prId(KEY, 42),
          target: branchId(KEY, "feature/wp9"),
          relation: "FROM_BRANCH",
        }),
        expect.objectContaining({
          source: prId(KEY, 42),
          target: branchId(KEY, "main"),
          relation: "INTO_BRANCH",
        }),
        expect.objectContaining({
          source: prId(KEY, 42),
          target: commitId(KEY, headSha),
          relation: "CONTAINS_COMMIT",
        }),
      ]),
    );

    const serialized = JSON.stringify(extraction);
    expect(serialized).not.toContain("ghp_body_secret_token");
    expect(serialized).not.toContain("raw prose");
    expect(serialized).not.toContain("do not need headline");
  });

  it("adds MERGED_AS for a squash-merged PR and preserves original branch commits", () => {
    const firstSha = "111111111111aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const secondSha = "222222222222bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const mergeSha = "999999999999cccccccccccccccccccccccccccc";
    const runner = fakeRunner({
      "git remote get-url origin": REMOTE,
      [listCommand()]: [
        {
          number: 77,
          title: "Squash me",
          state: "MERGED",
          isDraft: false,
          headRefName: "feature/squash",
          baseRefName: "main",
          author: { login: "dev" },
          url: "https://github.com/rhanka/graphify/pull/77",
          mergeStateStatus: "CLEAN",
          updatedAt: "2026-06-15T11:00:00Z",
        },
      ],
      [viewCommand(77)]: {
        number: 77,
        title: "Squash me",
        state: "MERGED",
        isDraft: false,
        headRefName: "feature/squash",
        baseRefName: "main",
        author: { login: "dev" },
        url: "https://github.com/rhanka/graphify/pull/77",
        mergeStateStatus: "CLEAN",
        updatedAt: "2026-06-15T11:00:00Z",
        commits: [{ oid: firstSha }, { oid: secondSha }],
      },
      [mergeCommand(77)]: {
        number: 77,
        headRefName: "feature/squash",
        mergeCommit: { oid: mergeSha },
        commits: [{ oid: firstSha }, { oid: secondSha }],
      },
    });

    const extraction = extractPullRequests(".", { runner, enabled: true, limit: 10 });

    expect(extraction.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: prId(KEY, 77),
          target: commitId(KEY, firstSha),
          relation: "CONTAINS_COMMIT",
        }),
        expect.objectContaining({
          source: prId(KEY, 77),
          target: commitId(KEY, secondSha),
          relation: "CONTAINS_COMMIT",
        }),
        expect.objectContaining({
          source: prId(KEY, 77),
          target: commitId(KEY, mergeSha),
          relation: "MERGED_AS",
        }),
      ]),
    );

    // Interop with the git extractor (WP2): commit: ids MUST be the FULL sha,
    // not truncated, or CONTAINS_COMMIT/MERGED_AS never join the Commit nodes
    // emitted by extract-git (which uses `git show -s --format=%H`, full shas).
    const commitTargets = extraction.edges
      .filter((e) => e.relation === "CONTAINS_COMMIT" || e.relation === "MERGED_AS")
      .map((e) => e.target);
    expect(commitTargets).toContain(commitId(KEY, firstSha));
    expect(commitTargets).toContain(commitId(KEY, mergeSha));
    for (const target of commitTargets) {
      const sha = target.split("@").at(-1)!;
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("aggregates mixed check conclusions without storing logs", () => {
    const runner = fakeRunner({
      "git remote get-url origin": REMOTE,
      [listCommand()]: [
        {
          number: 5,
          title: "Mixed checks",
          state: "OPEN",
          isDraft: false,
          headRefName: "feature/checks",
          baseRefName: "main",
        },
      ],
      [viewCommand(5)]: {
        number: 5,
        title: "Mixed checks",
        state: "OPEN",
        isDraft: false,
        headRefName: "feature/checks",
        baseRefName: "main",
        statusCheckRollup: [
          { name: "unit", conclusion: "SUCCESS", detailsUrl: "https://example.test/unit" },
          {
            name: "lint",
            conclusion: "FAILURE",
            detailsUrl: "https://example.test/lint",
            output: { text: "raw ci log with token ghp_ci_secret" },
          },
          { context: "deploy", state: "PENDING", targetUrl: "https://example.test/deploy" },
        ],
      },
      [mergeCommand(5)]: {
        number: 5,
        headRefName: "feature/checks",
        commits: [],
      },
    });

    const extraction = extractPullRequests(".", { runner, enabled: true, limit: 10 });
    const node = extraction.nodes[0]!;

    expect(node).toMatchObject({
      checks_total: 3,
      checks_passed: 1,
      checks_failed: 1,
      checks_pending: 1,
      checks_conclusion: "FAILURE",
      check_runs: [
        { name: "unit", conclusion: "SUCCESS", url: "https://example.test/unit" },
        { name: "lint", conclusion: "FAILURE", url: "https://example.test/lint" },
        { name: "deploy", conclusion: "PENDING", url: "https://example.test/deploy" },
      ],
    });
    expect(JSON.stringify(extraction)).not.toContain("raw ci log");
    expect(JSON.stringify(extraction)).not.toContain("ghp_ci_secret");
  });

  it("handles a PR without commits", () => {
    const runner = fakeRunner({
      "git remote get-url origin": REMOTE,
      [listCommand()]: [
        {
          number: 9,
          title: "Empty branch",
          state: "OPEN",
          isDraft: true,
          headRefName: "empty",
          baseRefName: "main",
        },
      ],
      [viewCommand(9)]: {
        number: 9,
        title: "Empty branch",
        state: "OPEN",
        isDraft: true,
        headRefName: "empty",
        baseRefName: "main",
        commits: [],
      },
      [mergeCommand(9)]: {
        number: 9,
        headRefName: "empty",
        commits: [],
      },
    });

    const extraction = extractPullRequests(".", { runner, enabled: true, limit: 10 });

    expect(extraction.nodes).toHaveLength(1);
    expect(extraction.edges.filter((edge) => edge.relation === "CONTAINS_COMMIT")).toEqual([]);
  });

  it("surfaces malformed gh JSON as a clean parse error", () => {
    const runner = fakeRunner({
      "git remote get-url origin": REMOTE,
      [listCommand()]: "{not json",
    });

    expect(() => extractPullRequests(".", { runner, enabled: true, limit: 10 })).toThrow(
      /failed to parse pull request list JSON/,
    );
  });

  it("declares a focused gh ontology profile", () => {
    const profile = normalizeOntologyProfile(GH_ONTOLOGY_PROFILE);

    expect(Object.keys(profile.node_types).sort()).toEqual(["Branch", "Commit", "PullRequest"]);
    expect(Object.keys(profile.relation_types).sort()).toEqual([
      "CONTAINS_COMMIT",
      "FROM_BRANCH",
      "INTO_BRANCH",
      "MERGED_AS",
    ]);
    expect(profile.relation_types.FROM_BRANCH.source_types).toEqual(["PullRequest"]);
    expect(profile.relation_types.FROM_BRANCH.target_types).toEqual(["Branch"]);
    expect(profile.relation_types.MERGED_AS.target_types).toEqual(["Commit"]);
  });
});

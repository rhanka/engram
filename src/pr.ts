import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export interface CommandRunner {
  run(command: string, args: string[], cwd: string): string;
}

export interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  baseRefName: string;
  author?: string;
  url?: string;
  mergeable?: string;
  mergeStateStatus?: string;
  reviewDecision?: string;
  updatedAt?: string;
}

export interface PullRequestCheck {
  name: string;
  conclusion: string;
  url?: string;
}

export interface PullRequestDetails extends PullRequestSummary {
  body?: string;
  files: string[];
  commits: string[];
  checks: string[];
  checkRuns: PullRequestCheck[];
}

export interface WorktreePrInfo {
  path: string;
  branch?: string;
  head?: string;
  pr?: PullRequestSummary;
}

export interface PrCommandOptions {
  cwd?: string;
  runner?: CommandRunner;
  limit?: number;
  state?: string;
}

const DEFAULT_LIMIT = 30;

const defaultRunner: CommandRunner = {
  run(command: string, args: string[], cwd: string): string {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  },
};

function optionsWithDefaults(options: PrCommandOptions = {}): Required<Pick<PrCommandOptions, "cwd" | "runner">> & PrCommandOptions {
  return {
    cwd: options.cwd ?? ".",
    runner: options.runner ?? defaultRunner,
    limit: options.limit,
    state: options.state,
  };
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

export function githubRepoFromRemote(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");
  const https = trimmed.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (https) return `${https[1]}/${https[2]}`;
  const ssh = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+)$/i);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  const sshUrl = trimmed.match(/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+)$/i);
  if (sshUrl) return `${sshUrl[1]}/${sshUrl[2]}`;
  return undefined;
}

function ghRepoArgs(runner: CommandRunner, cwd: string): string[] {
  try {
    const repo = githubRepoFromRemote(runner.run("git", ["remote", "get-url", "origin"], cwd));
    return repo ? ["--repo", repo] : [];
  } catch {
    return [];
  }
}

function authorLogin(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const login = (value as { login?: unknown }).login;
  return normalizeString(login);
}

function checkUrl(value: Record<string, unknown>): string | undefined {
  return normalizeString(value.detailsUrl) ?? normalizeString(value.targetUrl) ?? normalizeString(value.url);
}

function normalizeCheckRun(value: unknown): PullRequestCheck | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const name = normalizeString(item.name) ?? normalizeString(item.context);
  const conclusion = normalizeString(item.conclusion) ?? normalizeString(item.state) ?? normalizeString(item.status);
  if (!name || !conclusion) return undefined;
  return {
    name,
    conclusion,
    ...(checkUrl(item) ? { url: checkUrl(item) } : {}),
  };
}

function parseJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to parse ${label} JSON: ${message}`);
  }
}

function runGhJson<T>(runner: CommandRunner, cwd: string, args: string[], label: string): T {
  try {
    return parseJson<T>(runner.run("gh", args, cwd), label);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${message}`);
  }
}

function normalizePrSummary(value: unknown): PullRequestSummary | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const number = normalizeNumber(item.number);
  const title = normalizeString(item.title);
  if (number === undefined || title === undefined) return null;
  return {
    number,
    title,
    state: normalizeString(item.state) ?? "UNKNOWN",
    isDraft: normalizeBoolean(item.isDraft),
    headRefName: normalizeString(item.headRefName) ?? "",
    baseRefName: normalizeString(item.baseRefName) ?? "",
    author: authorLogin(item.author),
    url: normalizeString(item.url),
    mergeable: normalizeString(item.mergeable),
    mergeStateStatus: normalizeString(item.mergeStateStatus),
    reviewDecision: normalizeString(item.reviewDecision),
    updatedAt: normalizeString(item.updatedAt),
  };
}

function normalizePrDetails(value: unknown): PullRequestDetails {
  const summary = normalizePrSummary(value);
  if (!summary || !value || typeof value !== "object") {
    throw new Error("gh pr view returned no pull request");
  }
  const item = value as Record<string, unknown>;
  const files = Array.isArray(item.files)
    ? item.files
      .map((file) => file && typeof file === "object" ? normalizeString((file as { path?: unknown }).path) : undefined)
      .filter((file): file is string => Boolean(file))
    : [];
  const commits = Array.isArray(item.commits)
    ? item.commits
      .map((commit) => {
        if (!commit || typeof commit !== "object") return undefined;
        const c = commit as Record<string, unknown>;
        const oid = normalizeString(c.oid);
        const messageHeadline = normalizeString(c.messageHeadline);
        return [oid ? oid.slice(0, 12) : undefined, messageHeadline].filter(Boolean).join(" ");
      })
      .filter((commit): commit is string => Boolean(commit))
    : [];
  const checkRuns = Array.isArray(item.statusCheckRollup)
    ? item.statusCheckRollup
      .map(normalizeCheckRun)
      .filter((check): check is PullRequestCheck => Boolean(check))
    : [];
  const checks = checkRuns.map((check) => [check.name, check.conclusion].filter(Boolean).join(": "));
  return {
    ...summary,
    body: normalizeString(item.body),
    files,
    commits,
    checks,
    checkRuns,
  };
}

export function listPullRequests(options: PrCommandOptions = {}): PullRequestSummary[] {
  const opts = optionsWithDefaults(options);
  const state = opts.state ?? "open";
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const repoArgs = ghRepoArgs(opts.runner, opts.cwd);
  const data = runGhJson<unknown[]>(opts.runner, opts.cwd, [
    "pr",
    "list",
    ...repoArgs,
    "--state",
    state,
    "--limit",
    String(limit),
    "--json",
    "number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt",
  ], "pull request list");
  return data.map(normalizePrSummary).filter((item): item is PullRequestSummary => item !== null);
}

export function getPullRequest(number: number, options: PrCommandOptions = {}): PullRequestDetails {
  const opts = optionsWithDefaults(options);
  const repoArgs = ghRepoArgs(opts.runner, opts.cwd);
  const data = runGhJson<unknown>(opts.runner, opts.cwd, [
    "pr",
    "view",
    String(number),
    ...repoArgs,
    "--json",
    "number,title,state,isDraft,headRefName,baseRefName,author,url,mergeable,mergeStateStatus,reviewDecision,updatedAt,body,files,commits,statusCheckRollup",
  ], "pull request details");
  return normalizePrDetails(data);
}

/**
 * Minimal merge attribution for a PR (WP9 agent-stats Phase 1). Squash/rebase
 * merges break per-commit-sha attribution: the commits a session printed never
 * land on main verbatim, only the single squashed merge commit does. This
 * returns the merge commit sha plus the branch + the original commit shas, so a
 * caller can attribute the merged main commit to the session that produced the
 * branch.
 */
export interface PrMergeInfo {
  number: number;
  headRefName?: string;
  /** Full sha of the commit that landed on the base branch, if merged. */
  mergeCommit?: string;
  /** Full shas of the PR's branch commits (joins the git extractor's commit: ids). */
  commits: string[];
}

function normalizePrMerge(value: unknown): PrMergeInfo {
  if (!value || typeof value !== "object") throw new Error("gh pr view returned no pull request");
  const item = value as Record<string, unknown>;
  const number = normalizeNumber(item.number);
  if (number === undefined) throw new Error("gh pr view returned no PR number");
  const mergeCommitOid = item.mergeCommit && typeof item.mergeCommit === "object"
    ? normalizeString((item.mergeCommit as { oid?: unknown }).oid)
    : undefined;
  const commits = Array.isArray(item.commits)
    ? item.commits
      .map((commit) => commit && typeof commit === "object"
        ? normalizeString((commit as { oid?: unknown }).oid)
        : undefined)
      .filter((oid): oid is string => Boolean(oid))
    : [];
  return {
    number,
    headRefName: normalizeString(item.headRefName),
    mergeCommit: mergeCommitOid,
    commits,
  };
}

/** Fetch merge attribution fields for a PR via `gh pr view <n> --json ...`. */
export function getPullRequestMerge(number: number, options: PrCommandOptions = {}): PrMergeInfo {
  const opts = optionsWithDefaults(options);
  const repoArgs = ghRepoArgs(opts.runner, opts.cwd);
  const data = runGhJson<unknown>(opts.runner, opts.cwd, [
    "pr",
    "view",
    String(number),
    ...repoArgs,
    "--json",
    "number,mergeCommit,commits,headRefName",
  ], "pull request merge");
  return normalizePrMerge(data);
}

function isConflictPr(pr: PullRequestSummary): boolean {
  return pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY";
}

export function listConflictingPullRequests(options: PrCommandOptions = {}): PullRequestSummary[] {
  return listPullRequests({ ...options, state: options.state ?? "open" }).filter(isConflictPr);
}

export function parseGitWorktreePorcelain(raw: string): WorktreePrInfo[] {
  const worktrees: WorktreePrInfo[] = [];
  let current: WorktreePrInfo | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      if (current) worktrees.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ").trim();
    if (key === "worktree") {
      if (current) worktrees.push(current);
      current = { path: value };
    } else if (current && key === "HEAD") {
      current.head = value;
    } else if (current && key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    }
  }
  if (current) worktrees.push(current);
  return worktrees;
}

export function listPrWorktrees(options: PrCommandOptions = {}): WorktreePrInfo[] {
  const opts = optionsWithDefaults(options);
  const raw = opts.runner.run("git", ["worktree", "list", "--porcelain"], opts.cwd);
  const worktrees = parseGitWorktreePorcelain(raw);
  let prs: PullRequestSummary[] = [];
  try {
    prs = listPullRequests({ ...options, cwd: opts.cwd, runner: opts.runner, state: options.state ?? "open" });
  } catch {
    prs = [];
  }
  const byBranch = new Map(prs.map((pr) => [pr.headRefName, pr]));
  return worktrees.map((worktree) => {
    const branch = worktree.branch;
    const pr = branch ? byBranch.get(branch) ?? byBranch.get(basename(branch)) : undefined;
    return { ...worktree, pr };
  });
}

function prStateLabel(pr: PullRequestSummary): string {
  const draft = pr.isDraft ? " draft" : "";
  const review = pr.reviewDecision ? ` review=${pr.reviewDecision}` : "";
  const merge = pr.mergeable ?? pr.mergeStateStatus;
  const mergeText = merge ? ` merge=${merge}` : "";
  return `${pr.state}${draft}${review}${mergeText}`;
}

export function formatPullRequestList(prs: PullRequestSummary[]): string {
  if (prs.length === 0) return "No pull requests found.";
  return prs.map((pr) => {
    const branch = pr.headRefName && pr.baseRefName ? `${pr.headRefName} -> ${pr.baseRefName}` : "branch unknown";
    const author = pr.author ? ` @${pr.author}` : "";
    return `#${pr.number} ${pr.title}\n  ${prStateLabel(pr)} · ${branch}${author}`;
  }).join("\n");
}

export function formatPullRequestDetails(pr: PullRequestDetails): string {
  const lines = [
    `#${pr.number} ${pr.title}`,
    `State: ${prStateLabel(pr)}`,
    `Branch: ${pr.headRefName || "unknown"} -> ${pr.baseRefName || "unknown"}`,
  ];
  if (pr.author) lines.push(`Author: @${pr.author}`);
  if (pr.url) lines.push(`URL: ${pr.url}`);
  if (pr.files.length > 0) lines.push("", `Files (${pr.files.length}):`, ...pr.files.map((file) => `  - ${file}`));
  if (pr.commits.length > 0) lines.push("", `Commits (${pr.commits.length}):`, ...pr.commits.map((commit) => `  - ${commit}`));
  if (pr.checks.length > 0) lines.push("", `Checks (${pr.checks.length}):`, ...pr.checks.map((check) => `  - ${check}`));
  return lines.join("\n");
}

export function formatPullRequestConflicts(prs: PullRequestSummary[]): string {
  if (prs.length === 0) return "No conflicting pull requests found.";
  return `Conflicting pull requests:\n${formatPullRequestList(prs)}`;
}

export function formatPrWorktrees(worktrees: WorktreePrInfo[]): string {
  if (worktrees.length === 0) return "No git worktrees found.";
  return worktrees.map((worktree) => {
    const branch = worktree.branch ?? "(detached)";
    const pr = worktree.pr ? ` PR #${worktree.pr.number} ${worktree.pr.title}` : " no PR match";
    return `${worktree.path}\n  ${branch} ·${pr}`;
  }).join("\n");
}

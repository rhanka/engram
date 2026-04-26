import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CloneRepoOptions {
  url: string;
  branch?: string;
  outDir?: string;
  cacheRoot?: string;
}

export interface CloneRepoResult {
  path: string;
  remote: string;
  reused: boolean;
  owner?: string;
  repo: string;
}

interface GithubRepoRef {
  owner: string;
  repo: string;
  cloneUrl: string;
}

function execGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function maybeGithubRepo(url: string): GithubRepoRef | null {
  const normalized = url.trim().replace(/\/+$/, "");
  const match = normalized.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) return null;
  const owner = match[1]!;
  const repo = match[2]!;
  return {
    owner,
    repo,
    cloneUrl: normalized.endsWith(".git") ? normalized : `${normalized}.git`,
  };
}

function repoNameFromUrl(url: string): string {
  const github = maybeGithubRepo(url);
  if (github) return github.repo;

  try {
    if (url.startsWith("file://")) {
      return basename(fileURLToPath(url)).replace(/\.git$/i, "") || "repo";
    }
    if (/^[a-z]+:\/\//i.test(url)) {
      const parsed = new URL(url);
      return basename(parsed.pathname).replace(/\.git$/i, "") || "repo";
    }
  } catch {
    // Fall through to path-like handling below.
  }

  return basename(url).replace(/\.git$/i, "") || "repo";
}

export function defaultCloneDestination(url: string, cacheRoot: string = join(homedir(), ".graphify", "repos")): string {
  const github = maybeGithubRepo(url);
  if (github) {
    return resolve(cacheRoot, github.owner, github.repo);
  }
  return resolve(cacheRoot, "external", repoNameFromUrl(url));
}

export function cloneRepo(options: CloneRepoOptions): CloneRepoResult {
  const github = maybeGithubRepo(options.url);
  const remote = github?.cloneUrl ?? options.url.trim();
  const repo = github?.repo ?? repoNameFromUrl(options.url);
  const destination = resolve(options.outDir ?? defaultCloneDestination(options.url, options.cacheRoot));

  if (existsSync(destination)) {
    if (!statSync(destination).isDirectory()) {
      throw new Error(`clone destination exists and is not a directory: ${destination}`);
    }
    if (!existsSync(join(destination, ".git"))) {
      throw new Error(`clone destination exists but is not a git repository: ${destination}`);
    }

    console.error(`Repo already cloned at ${destination} - pulling latest...`);
    execGit(["-C", destination, "remote", "set-url", "origin", remote]);
    if (options.branch) {
      execGit(["-C", destination, "fetch", "--depth", "1", "origin", options.branch]);
      try {
        execGit(["-C", destination, "checkout", options.branch]);
      } catch {
        execGit(["-C", destination, "checkout", "-B", options.branch, "FETCH_HEAD"]);
      }
      execGit(["-C", destination, "pull", "--ff-only", "origin", options.branch]);
    } else {
      execGit(["-C", destination, "pull", "--ff-only"]);
    }
    return {
      path: destination,
      remote,
      reused: true,
      ...(github ? { owner: github.owner } : {}),
      repo,
    };
  }

  mkdirSync(join(destination, ".."), { recursive: true });
  console.error(`Cloning ${options.url} -> ${destination} ...`);
  const args = ["clone", "--depth", "1"];
  if (options.branch) {
    args.push("--branch", options.branch);
  }
  args.push(remote, destination);
  execGit(args);

  return {
    path: destination,
    remote,
    reused: false,
    ...(github ? { owner: github.owner } : {}),
    repo,
  };
}

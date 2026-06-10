import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { githubRepoFromRemote } from "./pr.js";

export interface RepoKeyRunner {
  run(command: string, args: string[], cwd: string): string;
}

const defaultRepoKeyRunner: RepoKeyRunner = {
  run(command: string, args: string[], cwd: string): string {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  },
};

/**
 * Parse a non-GitHub remote URL and extract a stable host/path key.
 *
 * Handles:
 *   - https://gitlab.example.com/owner/name.git    → "gitlab.example.com/owner/name"
 *   - git@gitlab.example.com:owner/name.git        → "gitlab.example.com/owner/name"
 *   - ssh://git@self-hosted.io/owner/name.git      → "self-hosted.io/owner/name"
 *
 * Returns undefined if the URL cannot be parsed.
 */
function remoteKeyFromUrl(remoteUrl: string): string | undefined {
  const trimmed = remoteUrl.trim().replace(/\.git$/i, "");

  // SSH URL: ssh://[user@]host/path  (must be before SCP pattern)
  const sshUrl = trimmed.match(/^ssh:\/\/(?:[^@]+@)?([^/\s]+)(\/.+)$/i);
  if (sshUrl) {
    const host = sshUrl[1] ?? "";
    const path = (sshUrl[2] ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (host && path) return `${host}/${path}`;
  }

  // HTTPS: https://host/path
  const https = trimmed.match(/^https?:\/\/([^/\s]+)(\/.+)$/i);
  if (https) {
    const host = https[1] ?? "";
    const path = (https[2] ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (host && path) return `${host}/${path}`;
  }

  // SSH scp-style: git@host:path  (colon delimiter, no :// prefix)
  const scp = trimmed.match(/^(?:[^@]+@)?([^:/\s]+):(?!\/\/)(.+)$/);
  if (scp) {
    const host = scp[1] ?? "";
    const path = (scp[2] ?? "").replace(/^\/+/, "").replace(/\/+$/, "").replace(/:/g, "/");
    if (host && path) return `${host}/${path}`;
  }

  return undefined;
}

/**
 * Derive a stable, unique key for a repository.
 *
 * Resolution order:
 *  1. GitHub remote   → `repo:github.com/<owner>/<name>`
 *  2. Non-GitHub remote → `repo:<host>/<path-normalised>`
 *  3. No remote       → `repo:local/<basename>@<8-hex-sha256-of-resolved-path>`
 *
 * The `runner` parameter is injectable for testing (avoids real git calls).
 */
export function repoKey(
  repoRoot: string,
  runner: RepoKeyRunner = defaultRepoKeyRunner,
): string {
  const absRoot = resolve(repoRoot);

  let remoteUrl: string | undefined;
  try {
    remoteUrl = runner.run("git", ["remote", "get-url", "origin"], absRoot);
  } catch {
    // no remote — fall through to local fallback
  }

  if (remoteUrl) {
    // Try GitHub first
    const github = githubRepoFromRemote(remoteUrl);
    if (github) {
      return `repo:github.com/${github}`;
    }

    // Non-GitHub remote
    const fallback = remoteKeyFromUrl(remoteUrl);
    if (fallback) {
      return `repo:${fallback}`;
    }
  }

  // No remote or unparseable URL — deterministic local fallback
  const name = basename(absRoot);
  const hash = createHash("sha256").update(absRoot).digest("hex").slice(0, 8);
  return `repo:local/${name}@${hash}`;
}

/** Stable identifier for a commit in the context of a repo key. */
export function commitId(repoKeyStr: string, sha: string): string {
  return `commit:${repoKeyStr}@${sha}`;
}

/** Stable identifier for a branch in the context of a repo key. */
export function branchId(repoKeyStr: string, name: string): string {
  return `branch:${repoKeyStr}#${name}`;
}

/** Stable identifier for a pull request in the context of a repo key. */
export function prId(repoKeyStr: string, n: number): string {
  return `pr:${repoKeyStr}#${n}`;
}

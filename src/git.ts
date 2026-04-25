/** Git repository resolution helpers shared by hooks and lifecycle metadata. */
import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export interface GitContext {
  worktreeRoot: string;
  gitDir: string;
  commonGitDir: string;
  hooksDir: string;
}

export function execGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    // Some sandboxes report EPERM even when the child process exited with 0.
    // Treat that as success if Node still captured stdout from git.
    const maybe = err as { status?: number; stdout?: string | Buffer };
    if (maybe.status === 0 && maybe.stdout !== undefined) {
      return String(maybe.stdout).trim();
    }
    throw err;
  }
}

export function safeExecGit(cwd: string, args: string[]): string | null {
  try {
    const output = execGit(cwd, args);
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}

export function resolveFromGitCwd(cwd: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

export function gitRevParse(cwd: string, args: string[]): string {
  return execGit(cwd, ["rev-parse", ...args]);
}

export function safeGitRevParse(cwd: string, args: string[]): string | null {
  return safeExecGit(cwd, ["rev-parse", ...args]);
}

export function resolveGitContext(path: string = "."): GitContext | null {
  const cwd = resolve(path);
  try {
    const worktreeRoot = resolve(gitRevParse(cwd, ["--show-toplevel"]));
    const gitDir = resolve(gitRevParse(cwd, ["--absolute-git-dir"]));
    const commonGitDir = resolveFromGitCwd(cwd, gitRevParse(cwd, ["--git-common-dir"]));
    const hooksDir = resolveFromGitCwd(cwd, gitRevParse(cwd, ["--git-path", "hooks"]));
    return { worktreeRoot, gitDir, commonGitDir, hooksDir };
  } catch {
    return null;
  }
}

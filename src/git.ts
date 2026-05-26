/** Git repository resolution helpers shared by hooks and lifecycle metadata. */
import { execFileSync } from "node:child_process";
import { basename, dirname, isAbsolute, resolve } from "node:path";

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

function isSafeGitPath(value: string): boolean {
  // Upstream 2d783e5 (#907): a valid hooks/repo path can never contain newlines
  // or NUL — their presence indicates git echoed an unrecognised flag back
  // (old git behaviour for unknown options like --path-format=absolute on
  // git < 2.31). Mirror that defence-in-depth check here even though our
  // current call sites use only flags supported in older git.
  return value.length > 0 && !/[\n\r\0]/.test(value);
}

/**
 * Return the user-editable hooks directory. Husky 9 sets `core.hooksPath` to
 * `.husky/_` (auto-generated wrapper scripts), while user-editable hooks live
 * in the parent `.husky/`. Targeting `.husky/_` would put our hooks in the
 * directory Husky regenerates, so step up to the parent in that case
 * (port of upstream `_user_hooks_dir`, #987).
 */
export function userEditableHooksDir(hooksDir: string): string {
  return basename(hooksDir) === "_" ? dirname(hooksDir) : hooksDir;
}

export function resolveGitContext(path: string = "."): GitContext | null {
  const cwd = resolve(path);
  try {
    const topLevel = gitRevParse(cwd, ["--show-toplevel"]);
    const absoluteGitDir = gitRevParse(cwd, ["--absolute-git-dir"]);
    const commonGitDirRaw = gitRevParse(cwd, ["--git-common-dir"]);
    const hooksDirRaw = gitRevParse(cwd, ["--git-path", "hooks"]);
    if (!isSafeGitPath(topLevel) || !isSafeGitPath(absoluteGitDir)
      || !isSafeGitPath(commonGitDirRaw) || !isSafeGitPath(hooksDirRaw)) {
      return null;
    }
    const worktreeRoot = resolve(topLevel);
    const gitDir = resolve(absoluteGitDir);
    const commonGitDir = resolveFromGitCwd(cwd, commonGitDirRaw);
    const hooksDir = userEditableHooksDir(resolveFromGitCwd(cwd, hooksDirRaw));
    return { worktreeRoot, gitDir, commonGitDir, hooksDir };
  } catch {
    return null;
  }
}
